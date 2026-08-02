import assert from "assert";
import * as sinon from "sinon";
import { DeferredPromise } from "../../../../../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../../../../../base/common/cancellation.js";
import { CancellationError } from "../../../../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../../../../base/common/event.js";
import { match } from "../../../../../../../base/common/glob.js";
import { ResourceSet } from "../../../../../../../base/common/map.js";
import { Schemas } from "../../../../../../../base/common/network.js";
import { observableValue } from "../../../../../../../base/common/observable.js";
import { basename, relativePath } from "../../../../../../../base/common/resources.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { Range } from "../../../../../../../editor/common/core/range.js";
import { ILanguageService } from "../../../../../../../editor/common/languages/language.js";
import { IModelService } from "../../../../../../../editor/common/services/model.js";
import { ModelService } from "../../../../../../../editor/common/services/modelService.js";
import { IConfigurationService } from "../../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ExtensionIdentifier } from "../../../../../../../platform/extensions/common/extensions.js";
import { IFileService } from "../../../../../../../platform/files/common/files.js";
import { FileService } from "../../../../../../../platform/files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../../../../../platform/files/common/inMemoryFilesystemProvider.js";
import { TestInstantiationService } from "../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILabelService } from "../../../../../../../platform/label/common/label.js";
import { ILogService, NullLogService } from "../../../../../../../platform/log/common/log.js";
import { ITelemetryService } from "../../../../../../../platform/telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../../../../../../platform/telemetry/common/telemetryUtils.js";
import { IWorkspaceContextService } from "../../../../../../../platform/workspace/common/workspace.js";
import { testWorkspace } from "../../../../../../../platform/workspace/test/common/testWorkspace.js";
import { IWorkbenchEnvironmentService } from "../../../../../../services/environment/common/environmentService.js";
import { IFilesConfigurationService } from "../../../../../../services/filesConfiguration/common/filesConfigurationService.js";
import { IUserDataProfileService } from "../../../../../../services/userDataProfile/common/userDataProfile.js";
import { toUserDataProfile } from "../../../../../../../platform/userDataProfile/common/userDataProfile.js";
import { TestContextService, TestUserDataProfileService, TestWorkspaceTrustManagementService } from "../../../../../../test/common/workbenchTestServices.js";
import { ChatRequestVariableSet, isPromptFileVariableEntry, toFileVariableEntry } from "../../../../common/attachments/chatVariableEntries.js";
import { ComputeAutomaticInstructions, newInstructionsCollectionEvent, newInstructionsCollectionDebugInfo } from "../../../../common/promptSyntax/computeAutomaticInstructions.js";
import { PromptsConfig } from "../../../../common/promptSyntax/config/config.js";
import { AGENTS_SOURCE_FOLDER, CLAUDE_CONFIG_FOLDER, HOOKS_SOURCE_FOLDER, INSTRUCTION_FILE_EXTENSION, INSTRUCTIONS_DEFAULT_SOURCE_FOLDER, LEGACY_MODE_DEFAULT_SOURCE_FOLDER, PROMPT_DEFAULT_SOURCE_FOLDER, PROMPT_FILE_EXTENSION } from "../../../../common/promptSyntax/config/promptFileLocations.js";
import { INSTRUCTIONS_LANGUAGE_ID, PROMPT_LANGUAGE_ID, PromptFileSource, PromptsType, Target } from "../../../../common/promptSyntax/promptTypes.js";
import { IAgentSource, IPromptsService, PromptsStorage } from "../../../../common/promptSyntax/service/promptsService.js";
import { PromptsService } from "../../../../common/promptSyntax/service/promptsServiceImpl.js";
import { mockFiles } from "../testUtils/mockFilesystem.js";
import { InMemoryStorageService, IStorageService } from "../../../../../../../platform/storage/common/storage.js";
import { IPathService } from "../../../../../../services/path/common/pathService.js";
import { ISearchService } from "../../../../../../services/search/common/search.js";
import { IExtensionService } from "../../../../../../services/extensions/common/extensions.js";
import { IRemoteAgentService } from "../../../../../../services/remote/common/remoteAgentService.js";
import { ChatConfiguration, ChatModeKind } from "../../../../common/constants.js";
import { HookType } from "../../../../common/promptSyntax/hookTypes.js";
import { IContextKeyService } from "../../../../../../../platform/contextkey/common/contextkey.js";
import { MockContextKeyService } from "../../../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { IAgentPluginService } from "../../../../common/plugins/agentPluginService.js";
import { PluginFormat } from "../../../../../../../platform/agentPlugins/common/pluginParsers.js";
import { IWorkspaceTrustManagementService } from "../../../../../../../platform/workspace/common/workspaceTrust.js";
import { COPILOT_ALLOW_MANAGED_HOOKS_ONLY_CONFIG, COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG } from "../../../../../../../platform/policy/common/copilotManagedSettings.js";
class TestPromptContextKeyService extends MockContextKeyService {
  constructor() {
    super(...arguments);
    this._onDidChangeContextEmitter = new Emitter();
    this._rulesMatch = false;
  }
  get onDidChangeContext() {
    return this._onDidChangeContextEmitter.event;
  }
  contextMatchesRules() {
    return this._rulesMatch;
  }
  setRulesMatch(value) {
    this._rulesMatch = value;
  }
  fireDidChangeContext(keys) {
    const changedKeys = new Set(keys);
    this._onDidChangeContextEmitter.fire({
      affectsSome: (trackedKeys) => keys.some((key) => trackedKeys.has(key)),
      allKeysContainedIn: (trackedKeys) => Array.from(changedKeys).every((key) => trackedKeys.has(key))
    });
  }
  dispose() {
    this._onDidChangeContextEmitter.dispose();
    super.dispose();
  }
}
suite("PromptsService", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let service;
  let instaService;
  let workspaceContextService;
  let testConfigService;
  let fileService;
  let testPluginsObservable;
  let workspaceTrustService;
  setup(async () => {
    instaService = disposables.add(new TestInstantiationService());
    instaService.stub(ILogService, new NullLogService());
    workspaceContextService = new TestContextService();
    instaService.stub(IWorkspaceContextService, workspaceContextService);
    testConfigService = new TestConfigurationService();
    testConfigService.setUserConfiguration(PromptsConfig.USE_COPILOT_INSTRUCTION_FILES, true);
    testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_MD, true);
    testConfigService.setUserConfiguration(PromptsConfig.USE_NESTED_AGENT_MD, false);
    testConfigService.setUserConfiguration(PromptsConfig.INCLUDE_REFERENCED_INSTRUCTIONS, true);
    testConfigService.setUserConfiguration(PromptsConfig.INCLUDE_APPLYING_INSTRUCTIONS, true);
    testConfigService.setUserConfiguration(PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS, false);
    testConfigService.setUserConfiguration(PromptsConfig.INSTRUCTIONS_LOCATION_KEY, { [INSTRUCTIONS_DEFAULT_SOURCE_FOLDER]: true });
    testConfigService.setUserConfiguration(PromptsConfig.PROMPT_LOCATIONS_KEY, { [PROMPT_DEFAULT_SOURCE_FOLDER]: true });
    testConfigService.setUserConfiguration(PromptsConfig.MODE_LOCATION_KEY, { [LEGACY_MODE_DEFAULT_SOURCE_FOLDER]: true });
    testConfigService.setUserConfiguration(PromptsConfig.AGENTS_LOCATION_KEY, { [AGENTS_SOURCE_FOLDER]: true });
    instaService.stub(IConfigurationService, testConfigService);
    instaService.stub(IWorkbenchEnvironmentService, {});
    instaService.stub(IUserDataProfileService, new TestUserDataProfileService());
    instaService.stub(ITelemetryService, NullTelemetryService);
    instaService.stub(IStorageService, InMemoryStorageService);
    instaService.stub(IExtensionService, {
      whenInstalledExtensionsRegistered: () => Promise.resolve(true),
      activateByEvent: () => Promise.resolve()
    });
    fileService = disposables.add(instaService.createInstance(FileService));
    instaService.stub(IFileService, fileService);
    const modelService = disposables.add(instaService.createInstance(ModelService));
    instaService.stub(IModelService, modelService);
    instaService.stub(ILanguageService, {
      guessLanguageIdByFilepathOrFirstLine(uri) {
        if (uri.path.endsWith(PROMPT_FILE_EXTENSION)) {
          return PROMPT_LANGUAGE_ID;
        }
        if (uri.path.endsWith(INSTRUCTION_FILE_EXTENSION)) {
          return INSTRUCTIONS_LANGUAGE_ID;
        }
        return "plaintext";
      }
    });
    instaService.stub(ILabelService, { getUriLabel: (uri) => uri.path });
    const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
    instaService.stub(IFilesConfigurationService, { updateReadonly: () => Promise.resolve() });
    const pathService = {
      userHome: () => {
        return Promise.resolve(URI.file("/home/user"));
      }
    };
    instaService.stub(IPathService, pathService);
    instaService.stub(ISearchService, {
      schemeHasFileSearchProvider: () => true,
      async fileSearch(query) {
        const findFilesInLocation = async (location, results2 = []) => {
          try {
            const resolve = await fileService.resolve(location);
            if (resolve.isFile) {
              results2.push(resolve.resource);
            } else if (resolve.isDirectory && resolve.children) {
              for (const child of resolve.children) {
                await findFilesInLocation(child.resource, results2);
              }
            }
          } catch (error) {
          }
          return results2;
        };
        const results = [];
        for (const folderQuery of query.folderQueries) {
          const allFiles = await findFilesInLocation(folderQuery.folder);
          for (const resource of allFiles) {
            const pathInFolder = relativePath(folderQuery.folder, resource) ?? "";
            if (query.filePattern === void 0 || match(query.filePattern, pathInFolder)) {
              results.push({ resource });
            }
          }
        }
        return { results, messages: [] };
      }
    });
    instaService.stub(IRemoteAgentService, {
      getEnvironment: () => Promise.resolve(null),
      getConnection: () => null
    });
    instaService.stub(IContextKeyService, new MockContextKeyService());
    workspaceTrustService = disposables.add(new TestWorkspaceTrustManagementService());
    workspaceTrustService.getUriTrustInfo = (uri) => Promise.resolve({ trusted: true, uri });
    instaService.stub(IWorkspaceTrustManagementService, workspaceTrustService);
    testPluginsObservable = observableValue("testPlugins", []);
    instaService.stub(IAgentPluginService, {
      plugins: testPluginsObservable,
      enablementModel: { readEnabled: () => 2, setEnabled: () => {
      }, remove: () => {
      } }
    });
    service = disposables.add(instaService.createInstance(PromptsService));
    instaService.stub(IPromptsService, service);
  });
  suite("IAgentSource.isEquals", () => {
    test("returns true for equivalent local sources", () => {
      const left = { storage: PromptsStorage.local };
      const right = { storage: PromptsStorage.local };
      assert.strictEqual(IAgentSource.isEquals(left, right), true);
    });
    test("returns true for equivalent extension sources", () => {
      const left = { storage: PromptsStorage.extension, extensionId: new ExtensionIdentifier("ms.vscode") };
      const right = { storage: PromptsStorage.extension, extensionId: new ExtensionIdentifier("ms.vscode") };
      assert.strictEqual(IAgentSource.isEquals(left, right), true);
    });
    test("returns false for different plugin source URIs", () => {
      const left = { storage: PromptsStorage.plugin, pluginUri: URI.file("/workspace/plugin-a") };
      const right = { storage: PromptsStorage.plugin, pluginUri: URI.file("/workspace/plugin-b") };
      assert.strictEqual(IAgentSource.isEquals(left, right), false);
    });
  });
  suite("voice instructions", () => {
    test("combines user and trusted workspace voice.md files", async () => {
      const rootFolderUri = URI.file("/workspace");
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        { path: "/home/user/.copilot/voice.md", contents: ["Use short paragraphs."] },
        { path: "/workspace/.github/voice.md", contents: ["Spell the product name as Contoso DB."] }
      ]);
      const instructions = await service.getVoiceInstructions(CancellationToken.None);
      assert.strictEqual(instructions, "Use short paragraphs.\n\nSpell the product name as Contoso DB.");
    });
    test("excludes workspace voice.md when the workspace is untrusted", async () => {
      const rootFolderUri = URI.file("/workspace");
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await workspaceTrustService.setWorkspaceTrust(false);
      await mockFiles(fileService, [
        { path: "/home/user/.copilot/voice.md", contents: ["Use short paragraphs."] },
        { path: "/workspace/.github/voice.md", contents: ["Untrusted workspace guidance."] }
      ]);
      const instructions = await service.getVoiceInstructions(CancellationToken.None);
      assert.strictEqual(instructions, "Use short paragraphs.");
    });
    test("cancels in-flight voice instruction reads", async () => {
      const cts = new CancellationTokenSource();
      const readStarted = new DeferredPromise();
      const readFileStub = sinon.stub(fileService, "readFile").callsFake(async (_resource, _options, token) => {
        readStarted.complete();
        await new Promise((resolve) => {
          const listener = token.onCancellationRequested(() => {
            listener.dispose();
            resolve();
          });
        });
        throw new CancellationError();
      });
      try {
        const instructions = service.getVoiceInstructions(cts.token);
        await readStarted.p;
        cts.cancel();
        assert.strictEqual(await instructions, void 0);
      } finally {
        readFileStub.restore();
        cts.dispose();
      }
    });
  });
  suite("dictation instructions", () => {
    test("combines user and trusted workspace dictation.md files separately from voice.md", async () => {
      const rootFolderUri = URI.file("/workspace");
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        { path: "/home/user/.copilot/dictation.md", contents: ["Use short paragraphs."] },
        { path: "/workspace/.github/dictation.md", contents: ["Spell the product name as Contoso DB."] },
        { path: "/home/user/.copilot/voice.md", contents: ["Keep spoken responses concise."] }
      ]);
      const instructions = await service.getDictationInstructions(CancellationToken.None);
      assert.strictEqual(instructions, "Use short paragraphs.\n\nSpell the product name as Contoso DB.");
    });
    test("excludes workspace dictation.md when the workspace is untrusted", async () => {
      const rootFolderUri = URI.file("/workspace");
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await workspaceTrustService.setWorkspaceTrust(false);
      await mockFiles(fileService, [
        { path: "/home/user/.copilot/dictation.md", contents: ["Use short paragraphs."] },
        { path: "/workspace/.github/dictation.md", contents: ["Untrusted workspace guidance."] }
      ]);
      const instructions = await service.getDictationInstructions(CancellationToken.None);
      assert.strictEqual(instructions, "Use short paragraphs.");
    });
  });
  suite("parse", () => {
    test("explicit", async function() {
      const rootFolderName = "resolves-nested-file-references";
      const rootFolder = `/${rootFolderName}`;
      const rootFileName = "file2.prompt.md";
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      const rootFileUri = URI.joinPath(rootFolderUri, rootFileName);
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/file1.prompt.md`,
          contents: [
            "## Some Header",
            "some contents",
            " "
          ]
        },
        {
          path: `${rootFolder}/${rootFileName}`,
          contents: [
            "---",
            "description: 'Root prompt description.'",
            "tools: ['my-tool1', , tool]",
            'agent: "agent" ',
            "---",
            "## Files",
            "	- this file #file:folder1/file3.prompt.md ",
            "	- also this [file4.prompt.md](./folder1/some-other-folder/file4.prompt.md) please!",
            "## Vars",
            "	- #tool:my-tool",
            "	- #tool:my-other-tool",
            " "
          ]
        },
        {
          path: `${rootFolder}/folder1/file3.prompt.md`,
          contents: [
            "---",
            "tools: [ false, 'my-tool1' , ]",
            "agent: 'edit'",
            "---",
            "",
            "[](./some-other-folder/non-existing-folder)",
            `	- some seemingly random #file:${rootFolder}/folder1/some-other-folder/yetAnotherFolder\u{1F92D}/another-file.instructions.md contents`,
            " some more	 content"
          ]
        },
        {
          path: `${rootFolder}/folder1/some-other-folder/file4.prompt.md`,
          contents: [
            "---",
            `tools: ['my-tool1', "my-tool2", true, , ]`,
            "something: true",
            "agent: 'ask'	",
            'description: "File 4 splendid description."',
            "---",
            "this file has a non-existing #file:./some-non-existing/file.prompt.md		reference",
            "",
            "",
            "and some",
            " non-prompt #file:./some-non-prompt-file.md		 	[](../../folder1/)	"
          ]
        },
        {
          path: `${rootFolder}/folder1/some-other-folder/file.txt`,
          contents: [
            "---",
            'description: "Non-prompt file description".',
            'tools: ["my-tool-24"]',
            "---"
          ]
        },
        {
          path: `${rootFolder}/folder1/some-other-folder/yetAnotherFolder\u{1F92D}/another-file.instructions.md`,
          contents: [
            "---",
            'description: "Another file description."',
            `tools: ['my-tool3', "my-tool2" ]`,
            'applyTo: "**/*.tsx"',
            "---",
            `[](${rootFolder}/folder1/some-other-folder)`,
            "another-file.instructions.md contents	 [#file:file.txt](../file.txt)"
          ]
        },
        {
          path: `${rootFolder}/folder1/some-other-folder/yetAnotherFolder\u{1F92D}/one_more_file_just_in_case.prompt.md`,
          contents: ["one_more_file_just_in_case.prompt.md contents"]
        }
      ]);
      const file3 = URI.joinPath(rootFolderUri, "folder1/file3.prompt.md");
      const file4 = URI.joinPath(rootFolderUri, "folder1/some-other-folder/file4.prompt.md");
      const someOtherFolder = URI.joinPath(rootFolderUri, "/folder1/some-other-folder");
      const someOtherFolderFile = URI.joinPath(rootFolderUri, "/folder1/some-other-folder/file.txt");
      const nonExistingFolder = URI.joinPath(rootFolderUri, "folder1/some-other-folder/non-existing-folder");
      const yetAnotherFile = URI.joinPath(rootFolderUri, "folder1/some-other-folder/yetAnotherFolder\u{1F92D}/another-file.instructions.md");
      const result1 = await service.parseNew(rootFileUri, CancellationToken.None);
      assert.deepEqual(result1.uri, rootFileUri);
      assert.deepEqual(result1.header?.description, "Root prompt description.");
      assert.deepEqual(result1.header?.tools, ["my-tool1", "tool"]);
      assert.deepEqual(result1.header?.agent, "agent");
      assert.ok(result1.body);
      assert.deepEqual(
        result1.body.fileReferences.map((r) => result1.body?.resolveFilePath(r.content)),
        [file3, file4]
      );
      assert.deepEqual(
        result1.body.variableReferences,
        [
          { name: "my-tool", range: new Range(10, 10, 10, 17), offset: 240, fullLength: 13 },
          { name: "my-other-tool", range: new Range(11, 10, 11, 23), offset: 257, fullLength: 19 }
        ]
      );
      const result2 = await service.parseNew(file3, CancellationToken.None);
      assert.deepEqual(result2.uri, file3);
      assert.deepEqual(result2.header?.agent, "edit");
      assert.ok(result2.body);
      assert.deepEqual(
        result2.body.fileReferences.map((r) => result2.body?.resolveFilePath(r.content)),
        [nonExistingFolder, yetAnotherFile]
      );
      const result3 = await service.parseNew(yetAnotherFile, CancellationToken.None);
      assert.deepEqual(result3.uri, yetAnotherFile);
      assert.deepEqual(result3.header?.description, "Another file description.");
      assert.deepEqual(result3.header?.applyTo, "**/*.tsx");
      assert.ok(result3.body);
      assert.deepEqual(
        result3.body.fileReferences.map((r) => result3.body?.resolveFilePath(r.content)),
        [someOtherFolder, someOtherFolderFile]
      );
      assert.deepEqual(result3.body.variableReferences, []);
      const result4 = await service.parseNew(file4, CancellationToken.None);
      assert.deepEqual(result4.uri, file4);
      assert.deepEqual(result4.header?.description, "File 4 splendid description.");
      assert.ok(result4.body);
      assert.deepEqual(
        result4.body.fileReferences.map((r) => result4.body?.resolveFilePath(r.content)),
        [
          URI.joinPath(rootFolderUri, "/folder1/some-other-folder/some-non-existing/file.prompt.md"),
          URI.joinPath(rootFolderUri, "/folder1/some-other-folder/some-non-prompt-file.md"),
          URI.joinPath(rootFolderUri, "/folder1/")
        ]
      );
      assert.deepEqual(result4.body.variableReferences, []);
    });
  });
  suite("findInstructionFilesFor", () => {
    teardown(() => {
      sinon.restore();
    });
    test("finds correct instruction files", async () => {
      const rootFolderName = "finds-instruction-files";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      const userPromptsFolderName = "/tmp/user-data/prompts";
      const userPromptsFolderUri = URI.file(userPromptsFolderName);
      sinon.stub(service, "listPromptFiles").returns(Promise.resolve([
        // local instructions
        {
          uri: URI.joinPath(rootFolderUri, ".github/prompts/file1.instructions.md"),
          storage: PromptsStorage.local,
          type: PromptsType.instructions
        },
        {
          uri: URI.joinPath(rootFolderUri, ".github/prompts/file2.instructions.md"),
          storage: PromptsStorage.local,
          type: PromptsType.instructions
        },
        {
          uri: URI.joinPath(rootFolderUri, ".github/prompts/file3.instructions.md"),
          storage: PromptsStorage.local,
          type: PromptsType.instructions
        },
        {
          uri: URI.joinPath(rootFolderUri, ".github/prompts/file4.instructions.md"),
          storage: PromptsStorage.local,
          type: PromptsType.instructions
        },
        // user instructions
        {
          uri: URI.joinPath(userPromptsFolderUri, "file10.instructions.md"),
          storage: PromptsStorage.user,
          type: PromptsType.instructions
        },
        {
          uri: URI.joinPath(userPromptsFolderUri, "file11.instructions.md"),
          storage: PromptsStorage.user,
          type: PromptsType.instructions
        }
      ]));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/file1.prompt.md`,
          contents: [
            "## Some Header",
            "some contents",
            " "
          ]
        },
        {
          path: `${rootFolder}/.github/prompts/file1.instructions.md`,
          contents: [
            "---",
            "description: 'Instructions file 1.'",
            'applyTo: "**/*.tsx"',
            "---",
            "Some instructions 1 contents."
          ]
        },
        {
          path: `${rootFolder}/.github/prompts/file2.instructions.md`,
          contents: [
            "---",
            "description: 'Instructions file 2.'",
            'applyTo: "**/folder1/*.tsx"',
            "---",
            "Some instructions 2 contents."
          ]
        },
        {
          path: `${rootFolder}/.github/prompts/file3.instructions.md`,
          contents: [
            "---",
            "description: 'Instructions file 3.'",
            'applyTo: "**/folder2/*.tsx"',
            "---",
            "Some instructions 3 contents."
          ]
        },
        {
          path: `${rootFolder}/.github/prompts/file4.instructions.md`,
          contents: [
            "---",
            "description: 'Instructions file 4.'",
            'applyTo: "src/build/*.tsx"',
            "---",
            "Some instructions 4 contents."
          ]
        },
        {
          path: `${rootFolder}/.github/prompts/file5.prompt.md`,
          contents: [
            "---",
            "description: 'Prompt file 5.'",
            "---",
            "Some prompt 5 contents."
          ]
        },
        {
          path: `${rootFolder}/folder1/main.tsx`,
          contents: [
            'console.log("Haalou!")'
          ]
        }
      ]);
      await mockFiles(fileService, [
        {
          path: `${userPromptsFolderName}/file10.instructions.md`,
          contents: [
            "---",
            "description: 'Instructions file 10.'",
            'applyTo: "**/folder1/*.tsx"',
            "---",
            "Some instructions 10 contents."
          ]
        },
        {
          path: `${userPromptsFolderName}/file11.instructions.md`,
          contents: [
            "---",
            "description: 'Instructions file 11.'",
            'applyTo: "**/folder1/*.py"',
            "---",
            "Some instructions 11 contents."
          ]
        },
        {
          path: `${userPromptsFolderName}/file12.prompt.md`,
          contents: [
            "---",
            "description: 'Prompt file 12.'",
            "---",
            "Some prompt 12 contents."
          ]
        }
      ]);
      const instructionFiles = await service.getInstructionFiles(CancellationToken.None);
      const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, void 0, void 0, "local");
      const context = {
        files: new ResourceSet([
          URI.joinPath(rootFolderUri, "folder1/main.tsx")
        ]),
        instructions: new ResourceSet()
      };
      const result = new ChatRequestVariableSet();
      await contextComputer.addApplyingInstructions(instructionFiles, context, result, newInstructionsCollectionEvent(), newInstructionsCollectionDebugInfo(), CancellationToken.None);
      assert.deepStrictEqual(
        result.asArray().map((i) => isPromptFileVariableEntry(i) ? i.value.path : void 0),
        [
          // local instructions
          URI.joinPath(rootFolderUri, ".github/prompts/file1.instructions.md").path,
          URI.joinPath(rootFolderUri, ".github/prompts/file2.instructions.md").path,
          // user instructions
          URI.joinPath(userPromptsFolderUri, "file10.instructions.md").path
        ],
        "Must find correct instruction files."
      );
    });
    test("does not have duplicates", async () => {
      const rootFolderName = "finds-instruction-files-without-duplicates";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      const userPromptsFolderName = "/tmp/user-data/prompts";
      const userPromptsFolderUri = URI.file(userPromptsFolderName);
      sinon.stub(service, "listPromptFiles").returns(Promise.resolve([
        // local instructions
        {
          uri: URI.joinPath(rootFolderUri, ".github/prompts/file1.instructions.md"),
          storage: PromptsStorage.local,
          type: PromptsType.instructions
        },
        {
          uri: URI.joinPath(rootFolderUri, ".github/prompts/file2.instructions.md"),
          storage: PromptsStorage.local,
          type: PromptsType.instructions
        },
        {
          uri: URI.joinPath(rootFolderUri, ".github/prompts/file3.instructions.md"),
          storage: PromptsStorage.local,
          type: PromptsType.instructions
        },
        {
          uri: URI.joinPath(rootFolderUri, ".github/prompts/file4.instructions.md"),
          storage: PromptsStorage.local,
          type: PromptsType.instructions
        },
        // user instructions
        {
          uri: URI.joinPath(userPromptsFolderUri, "file10.instructions.md"),
          storage: PromptsStorage.user,
          type: PromptsType.instructions
        },
        {
          uri: URI.joinPath(userPromptsFolderUri, "file11.instructions.md"),
          storage: PromptsStorage.user,
          type: PromptsType.instructions
        }
      ]));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/file1.prompt.md`,
          contents: [
            "## Some Header",
            "some contents",
            " "
          ]
        },
        {
          path: `${rootFolder}/.github/prompts/file1.instructions.md`,
          contents: [
            "---",
            "description: 'Instructions file 1.'",
            'applyTo: "**/*.tsx"',
            "---",
            "Some instructions 1 contents."
          ]
        },
        {
          path: `${rootFolder}/.github/prompts/file2.instructions.md`,
          contents: [
            "---",
            "description: 'Instructions file 2.'",
            'applyTo: "**/folder1/*.tsx"',
            "---",
            "Some instructions 2 contents. [](./file1.instructions.md)"
          ]
        },
        {
          path: `${rootFolder}/.github/prompts/file3.instructions.md`,
          contents: [
            "---",
            "description: 'Instructions file 3.'",
            'applyTo: "**/folder2/*.tsx"',
            "---",
            "Some instructions 3 contents."
          ]
        },
        {
          path: `${rootFolder}/.github/prompts/file4.instructions.md`,
          contents: [
            "---",
            "description: 'Instructions file 4.'",
            'applyTo: "src/build/*.tsx"',
            "---",
            "[](./file3.instructions.md) Some instructions 4 contents."
          ]
        },
        {
          path: `${rootFolder}/.github/prompts/file5.prompt.md`,
          contents: [
            "---",
            "description: 'Prompt file 5.'",
            "---",
            "Some prompt 5 contents."
          ]
        },
        {
          path: `${rootFolder}/folder1/main.tsx`,
          contents: [
            'console.log("Haalou!")'
          ]
        }
      ]);
      await mockFiles(fileService, [
        {
          path: `${userPromptsFolderName}/file10.instructions.md`,
          contents: [
            "---",
            "description: 'Instructions file 10.'",
            'applyTo: "**/folder1/*.tsx"',
            "---",
            "Some instructions 10 contents."
          ]
        },
        {
          path: `${userPromptsFolderName}/file11.instructions.md`,
          contents: [
            "---",
            "description: 'Instructions file 11.'",
            'applyTo: "**/folder1/*.py"',
            "---",
            "Some instructions 11 contents."
          ]
        },
        {
          path: `${userPromptsFolderName}/file12.prompt.md`,
          contents: [
            "---",
            "description: 'Prompt file 12.'",
            "---",
            "Some prompt 12 contents."
          ]
        }
      ]);
      const instructionFiles = await service.getInstructionFiles(CancellationToken.None);
      const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, void 0, void 0, "local");
      const context = {
        files: new ResourceSet([
          URI.joinPath(rootFolderUri, "folder1/main.tsx"),
          URI.joinPath(rootFolderUri, "folder1/index.tsx"),
          URI.joinPath(rootFolderUri, "folder1/constants.tsx")
        ]),
        instructions: new ResourceSet()
      };
      const result = new ChatRequestVariableSet();
      await contextComputer.addApplyingInstructions(instructionFiles, context, result, newInstructionsCollectionEvent(), newInstructionsCollectionDebugInfo(), CancellationToken.None);
      assert.deepStrictEqual(
        result.asArray().map((i) => isPromptFileVariableEntry(i) ? i.value.path : void 0),
        [
          // local instructions
          URI.joinPath(rootFolderUri, ".github/prompts/file1.instructions.md").path,
          URI.joinPath(rootFolderUri, ".github/prompts/file2.instructions.md").path,
          // user instructions
          URI.joinPath(userPromptsFolderUri, "file10.instructions.md").path
        ],
        "Must find correct instruction files."
      );
    });
    test("copilot-instructions and AGENTS.md", async () => {
      const rootFolderName = "copilot-instructions-and-agents";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/codestyle.md`,
          contents: [
            "Can you see this?"
          ]
        },
        {
          path: `${rootFolder}/AGENTS.md`,
          contents: [
            "What about this?"
          ]
        },
        {
          path: `${rootFolder}/README.md`,
          contents: [
            "Thats my project?"
          ]
        },
        {
          path: `${rootFolder}/.github/copilot-instructions.md`,
          contents: [
            "Be nice and friendly. Also look at instructions at #file:../codestyle.md and [more-codestyle.md](./more-codestyle.md)."
          ]
        },
        {
          path: `${rootFolder}/.github/more-codestyle.md`,
          contents: [
            "I like it clean."
          ]
        },
        {
          path: `${rootFolder}/folder1/AGENTS.md`,
          contents: [
            "An AGENTS.md file in another repo"
          ]
        }
      ]);
      const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, void 0, void 0, "local");
      const context = new ChatRequestVariableSet();
      context.add(toFileVariableEntry(URI.joinPath(rootFolderUri, "README.md")));
      await contextComputer.collect(context, CancellationToken.None);
      assert.deepStrictEqual(
        context.asArray().map((i) => isPromptFileVariableEntry(i) ? i.value.path : void 0).filter((e) => !!e).sort(),
        [
          URI.joinPath(rootFolderUri, ".github/copilot-instructions.md").path,
          URI.joinPath(rootFolderUri, ".github/more-codestyle.md").path,
          URI.joinPath(rootFolderUri, "AGENTS.md").path,
          URI.joinPath(rootFolderUri, "codestyle.md").path
        ].sort(),
        "Must find correct instruction files."
      );
    });
    test("exposes onDidChangeAgentInstructions", async () => {
      const disposable = service.onDidChangeAgentInstructions(() => {
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      disposable.dispose();
    });
  });
  suite("getCustomAgents", () => {
    teardown(() => {
      sinon.restore();
    });
    test("header with handOffs", async () => {
      const rootFolderName = "custom-agents-with-handoffs";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/agents/agent1.agent.md`,
          contents: [
            "---",
            "description: 'Agent file 1.'",
            'handoffs: [ { agent: "Edit", label: "Do it", prompt: "Do it now" } ]',
            "---"
          ]
        }
      ]);
      const result = (await service.getCustomAgents(CancellationToken.None)).map((agent) => ({ ...agent, uri: URI.from(agent.uri) }));
      const expected = [
        {
          id: URI.joinPath(rootFolderUri, ".github/agents/agent1.agent.md").toString(),
          name: "agent1",
          description: "Agent file 1.",
          handOffs: [{ agent: "Edit", label: "Do it", prompt: "Do it now" }],
          agentInstructions: {
            content: "",
            toolReferences: [],
            metadata: void 0
          },
          model: void 0,
          argumentHint: void 0,
          tools: void 0,
          target: Target.Undefined,
          visibility: { userInvocable: true, agentInvocable: true },
          agents: void 0,
          hooks: void 0,
          sessionTypes: void 0,
          uri: URI.joinPath(rootFolderUri, ".github/agents/agent1.agent.md"),
          source: { storage: PromptsStorage.local },
          enabled: true
        }
      ];
      assert.deepEqual(
        result,
        expected,
        "Must get custom agents."
      );
    });
    test("body with tool references", async () => {
      const rootFolderName = "custom-agents";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/agents/agent1.agent.md`,
          contents: [
            "---",
            "description: 'Agent file 1.'",
            "tools: [ tool1, tool2 ]",
            "---",
            "Do it with #tool:tool1"
          ]
        },
        {
          path: `${rootFolder}/.github/agents/agent2.agent.md`,
          contents: [
            "First use #tool:tool2\nThen use #tool:tool1"
          ]
        }
      ]);
      const result = (await service.getCustomAgents(CancellationToken.None)).map((agent) => ({ ...agent, uri: URI.from(agent.uri) }));
      const expected = [
        {
          id: URI.joinPath(rootFolderUri, ".github/agents/agent1.agent.md").toString(),
          name: "agent1",
          description: "Agent file 1.",
          tools: ["tool1", "tool2"],
          agentInstructions: {
            content: "Do it with #tool:tool1",
            toolReferences: [{ name: "tool1", range: { start: 11, endExclusive: 22 } }],
            metadata: void 0
          },
          handOffs: void 0,
          model: void 0,
          argumentHint: void 0,
          target: Target.Undefined,
          visibility: { userInvocable: true, agentInvocable: true },
          agents: void 0,
          hooks: void 0,
          sessionTypes: void 0,
          uri: URI.joinPath(rootFolderUri, ".github/agents/agent1.agent.md"),
          source: { storage: PromptsStorage.local },
          enabled: true
        },
        {
          id: URI.joinPath(rootFolderUri, ".github/agents/agent2.agent.md").toString(),
          name: "agent2",
          agentInstructions: {
            content: "First use #tool:tool2\nThen use #tool:tool1",
            toolReferences: [
              { name: "tool1", range: { start: 31, endExclusive: 42 } },
              { name: "tool2", range: { start: 10, endExclusive: 21 } }
            ],
            metadata: void 0
          },
          hooks: void 0,
          sessionTypes: void 0,
          uri: URI.joinPath(rootFolderUri, ".github/agents/agent2.agent.md"),
          source: { storage: PromptsStorage.local },
          target: Target.Undefined,
          visibility: { userInvocable: true, agentInvocable: true },
          enabled: true
        }
      ];
      assert.deepEqual(
        result,
        expected,
        "Must get custom agents."
      );
    });
    test("header with argumentHint", async () => {
      const rootFolderName = "custom-agents-with-argument-hint";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/agents/agent1.agent.md`,
          contents: [
            "---",
            "description: 'Code review agent.'",
            "argument-hint: 'Provide file path or code snippet to review'",
            "tools: [ code-analyzer, linter ]",
            "---",
            "I will help review your code for best practices."
          ]
        },
        {
          path: `${rootFolder}/.github/agents/agent2.agent.md`,
          contents: [
            "---",
            "description: 'Documentation generator.'",
            "argument-hint: 'Specify function or class name to document'",
            "---",
            "I generate comprehensive documentation."
          ]
        }
      ]);
      const result = (await service.getCustomAgents(CancellationToken.None)).map((agent) => ({ ...agent, uri: URI.from(agent.uri) }));
      const expected = [
        {
          id: URI.joinPath(rootFolderUri, ".github/agents/agent1.agent.md").toString(),
          name: "agent1",
          description: "Code review agent.",
          argumentHint: "Provide file path or code snippet to review",
          tools: ["code-analyzer", "linter"],
          agentInstructions: {
            content: "I will help review your code for best practices.",
            toolReferences: [],
            metadata: void 0
          },
          handOffs: void 0,
          model: void 0,
          target: Target.Undefined,
          visibility: { userInvocable: true, agentInvocable: true },
          agents: void 0,
          hooks: void 0,
          sessionTypes: void 0,
          uri: URI.joinPath(rootFolderUri, ".github/agents/agent1.agent.md"),
          source: { storage: PromptsStorage.local },
          enabled: true
        },
        {
          id: URI.joinPath(rootFolderUri, ".github/agents/agent2.agent.md").toString(),
          name: "agent2",
          description: "Documentation generator.",
          argumentHint: "Specify function or class name to document",
          agentInstructions: {
            content: "I generate comprehensive documentation.",
            toolReferences: [],
            metadata: void 0
          },
          handOffs: void 0,
          model: void 0,
          tools: void 0,
          target: Target.Undefined,
          visibility: { userInvocable: true, agentInvocable: true },
          agents: void 0,
          hooks: void 0,
          sessionTypes: void 0,
          uri: URI.joinPath(rootFolderUri, ".github/agents/agent2.agent.md"),
          source: { storage: PromptsStorage.local },
          enabled: true
        }
      ];
      assert.deepEqual(
        result,
        expected,
        "Must get custom agents with argumentHint."
      );
    });
    test("header with target", async () => {
      const rootFolderName = "custom-agents-with-target";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/agents/github-agent.agent.md`,
          contents: [
            "---",
            "description: 'GitHub Copilot specialized agent.'",
            "target: 'github-copilot'",
            "tools: [ github-api, code-search ]",
            "---",
            "I am optimized for GitHub Copilot workflows."
          ]
        },
        {
          path: `${rootFolder}/.github/agents/vscode-agent.agent.md`,
          contents: [
            "---",
            "description: 'VS Code specialized agent.'",
            "target: 'vscode'",
            "model: 'gpt-4'",
            "---",
            "I am specialized for VS Code editor tasks."
          ]
        },
        {
          path: `${rootFolder}/.github/agents/generic-agent.agent.md`,
          contents: [
            "---",
            "description: 'Generic agent without target.'",
            "---",
            "I work everywhere."
          ]
        }
      ]);
      const result = (await service.getCustomAgents(CancellationToken.None)).map((agent) => ({ ...agent, uri: URI.from(agent.uri) }));
      const expected = [
        {
          id: URI.joinPath(rootFolderUri, ".github/agents/github-agent.agent.md").toString(),
          name: "github-agent",
          description: "GitHub Copilot specialized agent.",
          target: Target.GitHubCopilot,
          tools: ["github-api", "code-search"],
          agentInstructions: {
            content: "I am optimized for GitHub Copilot workflows.",
            toolReferences: [],
            metadata: void 0
          },
          handOffs: void 0,
          model: void 0,
          argumentHint: void 0,
          visibility: { userInvocable: true, agentInvocable: true },
          agents: void 0,
          hooks: void 0,
          uri: URI.joinPath(rootFolderUri, ".github/agents/github-agent.agent.md"),
          sessionTypes: void 0,
          source: { storage: PromptsStorage.local },
          enabled: true
        },
        {
          id: URI.joinPath(rootFolderUri, ".github/agents/vscode-agent.agent.md").toString(),
          name: "vscode-agent",
          description: "VS Code specialized agent.",
          target: Target.VSCode,
          model: ["gpt-4"],
          agentInstructions: {
            content: "I am specialized for VS Code editor tasks.",
            toolReferences: [],
            metadata: void 0
          },
          handOffs: void 0,
          argumentHint: void 0,
          tools: void 0,
          visibility: { userInvocable: true, agentInvocable: true },
          agents: void 0,
          hooks: void 0,
          uri: URI.joinPath(rootFolderUri, ".github/agents/vscode-agent.agent.md"),
          sessionTypes: void 0,
          source: { storage: PromptsStorage.local },
          enabled: true
        },
        {
          id: URI.joinPath(rootFolderUri, ".github/agents/generic-agent.agent.md").toString(),
          name: "generic-agent",
          description: "Generic agent without target.",
          agentInstructions: {
            content: "I work everywhere.",
            toolReferences: [],
            metadata: void 0
          },
          handOffs: void 0,
          model: void 0,
          argumentHint: void 0,
          tools: void 0,
          target: Target.Undefined,
          visibility: { userInvocable: true, agentInvocable: true },
          agents: void 0,
          hooks: void 0,
          uri: URI.joinPath(rootFolderUri, ".github/agents/generic-agent.agent.md"),
          sessionTypes: void 0,
          source: { storage: PromptsStorage.local },
          enabled: true
        }
      ];
      assert.deepEqual(
        result,
        expected,
        "Must get custom agents with target attribute."
      );
    });
    test("claude agent maps tools and model to vscode equivalents", async () => {
      const rootFolderName = "claude-agent-mapping";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          // Claude agent with tools and model that should be mapped
          path: `${rootFolder}/.claude/agents/claude-agent.md`,
          contents: [
            "---",
            "description: 'Claude agent with tools and model.'",
            "tools: [ Read, Edit, Bash ]",
            "model: opus",
            "---",
            "I am a Claude agent."
          ]
        },
        {
          // Claude agent with more tools, some with empty equivalents
          path: `${rootFolder}/.claude/agents/claude-agent2.md`,
          contents: [
            "---",
            "description: 'Claude agent with various tools.'",
            "tools: [ Glob, Grep, Write, Task, Skill ]",
            "model: sonnet",
            "---",
            "I am another Claude agent."
          ]
        },
        {
          // Non-Claude agent should NOT have tools/model mapped
          path: `${rootFolder}/.github/agents/copilot-agent.agent.md`,
          contents: [
            "---",
            "description: 'Copilot agent with same tool names.'",
            "target: 'github-copilot'",
            "tools: [ Read, Edit ]",
            "model: gpt-4",
            "---",
            "I am a Copilot agent."
          ]
        }
      ]);
      const result = (await service.getCustomAgents(CancellationToken.None)).map((agent) => ({ ...agent, uri: URI.from(agent.uri) }));
      const expected = [
        {
          id: URI.joinPath(rootFolderUri, ".github/agents/copilot-agent.agent.md").toString(),
          name: "copilot-agent",
          description: "Copilot agent with same tool names.",
          target: Target.GitHubCopilot,
          // Non-Claude agent: tools and model stay as-is
          tools: ["Read", "Edit"],
          model: ["gpt-4"],
          agentInstructions: {
            content: "I am a Copilot agent.",
            toolReferences: [],
            metadata: void 0
          },
          handOffs: void 0,
          argumentHint: void 0,
          visibility: { userInvocable: true, agentInvocable: true },
          agents: void 0,
          hooks: void 0,
          uri: URI.joinPath(rootFolderUri, ".github/agents/copilot-agent.agent.md"),
          sessionTypes: void 0,
          source: { storage: PromptsStorage.local },
          enabled: true
        },
        {
          id: URI.joinPath(rootFolderUri, ".claude/agents/claude-agent.md").toString(),
          name: "claude-agent",
          description: "Claude agent with tools and model.",
          target: Target.Claude,
          // Claude tools mapped to vscode equivalents
          tools: ["read/readFile", "read/getNotebookSummary", "edit/editNotebook", "edit/editFiles", "execute"],
          // Claude model mapped to vscode equivalent
          model: ["Claude Opus 4.6 (copilot)"],
          agentInstructions: {
            content: "I am a Claude agent.",
            toolReferences: [],
            metadata: void 0
          },
          handOffs: void 0,
          argumentHint: void 0,
          visibility: { userInvocable: true, agentInvocable: true },
          agents: void 0,
          hooks: void 0,
          uri: URI.joinPath(rootFolderUri, ".claude/agents/claude-agent.md"),
          sessionTypes: void 0,
          source: { storage: PromptsStorage.local },
          enabled: true
        },
        {
          id: URI.joinPath(rootFolderUri, ".claude/agents/claude-agent2.md").toString(),
          name: "claude-agent2",
          description: "Claude agent with various tools.",
          target: Target.Claude,
          // Tools mapped: Glob->search/fileSearch, Grep->search/textSearch, Write->edit/create*, Task->agent, Skill->[] (empty)
          tools: ["search/fileSearch", "search/textSearch", "edit/createDirectory", "edit/createFile", "edit/createJupyterNotebook", "agent"],
          model: ["Claude Sonnet 4.5 (copilot)"],
          agentInstructions: {
            content: "I am another Claude agent.",
            toolReferences: [],
            metadata: void 0
          },
          handOffs: void 0,
          argumentHint: void 0,
          visibility: { userInvocable: true, agentInvocable: true },
          agents: void 0,
          hooks: void 0,
          uri: URI.joinPath(rootFolderUri, ".claude/agents/claude-agent2.md"),
          sessionTypes: void 0,
          source: { storage: PromptsStorage.local },
          enabled: true
        }
      ];
      assert.deepEqual(
        result,
        expected,
        "Claude tools and models must be mapped to VS Code equivalents; non-Claude agents must remain unchanged."
      );
    });
    test("agents with .md extension should be recognized, except README.md", async () => {
      const rootFolderName = "custom-agents-md-extension";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/agents/demonstrate.md`,
          contents: [
            "---",
            "description: 'Demonstrate agent.'",
            "tools: [ demo-tool ]",
            "---",
            "This is a demonstration agent using .md extension."
          ]
        },
        {
          path: `${rootFolder}/.github/agents/README.md`,
          contents: [
            "This is a README file."
          ]
        }
      ]);
      const result = (await service.getCustomAgents(CancellationToken.None)).map((agent) => ({ ...agent, uri: URI.from(agent.uri) }));
      const expected = [
        {
          id: URI.joinPath(rootFolderUri, ".github/agents/demonstrate.md").toString(),
          name: "demonstrate",
          description: "Demonstrate agent.",
          tools: ["demo-tool"],
          agentInstructions: {
            content: "This is a demonstration agent using .md extension.",
            toolReferences: [],
            metadata: void 0
          },
          handOffs: void 0,
          model: void 0,
          argumentHint: void 0,
          target: Target.Undefined,
          visibility: { userInvocable: true, agentInvocable: true },
          agents: void 0,
          hooks: void 0,
          sessionTypes: void 0,
          uri: URI.joinPath(rootFolderUri, ".github/agents/demonstrate.md"),
          source: { storage: PromptsStorage.local },
          enabled: true
        }
      ];
      assert.deepEqual(
        result,
        expected,
        "Must recognize .md files as agents, except README.md"
      );
    });
    test("header with agents", async () => {
      const rootFolderName = "custom-agents-with-restrictions";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/agents/restricted-agent.agent.md`,
          contents: [
            "---",
            "description: 'Agent with restricted access.'",
            "agents: [ subagent1, subagent2 ]",
            "tools: [ tool1 ]",
            "---",
            "This agent has restricted access."
          ]
        },
        {
          path: `${rootFolder}/.github/agents/no-access-agent.agent.md`,
          contents: [
            "---",
            "description: 'Agent with no access to subagents, skills, or instructions.'",
            "agents: []",
            "---",
            "This agent has no access."
          ]
        },
        {
          path: `${rootFolder}/.github/agents/full-access-agent.agent.md`,
          contents: [
            "---",
            "description: 'Agent with full access.'",
            'agents: [ "*" ]',
            "---",
            "This agent has full access."
          ]
        }
      ]);
      const result = (await service.getCustomAgents(CancellationToken.None)).map((agent) => ({ ...agent, uri: URI.from(agent.uri) }));
      const expected = [
        {
          id: URI.joinPath(rootFolderUri, ".github/agents/restricted-agent.agent.md").toString(),
          name: "restricted-agent",
          description: "Agent with restricted access.",
          agents: ["subagent1", "subagent2"],
          tools: ["tool1"],
          agentInstructions: {
            content: "This agent has restricted access.",
            toolReferences: [],
            metadata: void 0
          },
          handOffs: void 0,
          model: void 0,
          argumentHint: void 0,
          target: Target.Undefined,
          visibility: { userInvocable: true, agentInvocable: true },
          hooks: void 0,
          sessionTypes: void 0,
          uri: URI.joinPath(rootFolderUri, ".github/agents/restricted-agent.agent.md"),
          source: { storage: PromptsStorage.local },
          enabled: true
        },
        {
          id: URI.joinPath(rootFolderUri, ".github/agents/no-access-agent.agent.md").toString(),
          name: "no-access-agent",
          description: "Agent with no access to subagents, skills, or instructions.",
          agents: [],
          agentInstructions: {
            content: "This agent has no access.",
            toolReferences: [],
            metadata: void 0
          },
          handOffs: void 0,
          model: void 0,
          argumentHint: void 0,
          tools: void 0,
          target: Target.Undefined,
          visibility: { userInvocable: true, agentInvocable: true },
          hooks: void 0,
          sessionTypes: void 0,
          uri: URI.joinPath(rootFolderUri, ".github/agents/no-access-agent.agent.md"),
          source: { storage: PromptsStorage.local },
          enabled: true
        },
        {
          id: URI.joinPath(rootFolderUri, ".github/agents/full-access-agent.agent.md").toString(),
          name: "full-access-agent",
          description: "Agent with full access.",
          agents: ["*"],
          agentInstructions: {
            content: "This agent has full access.",
            toolReferences: [],
            metadata: void 0
          },
          handOffs: void 0,
          model: void 0,
          argumentHint: void 0,
          tools: void 0,
          target: Target.Undefined,
          visibility: { userInvocable: true, agentInvocable: true },
          hooks: void 0,
          sessionTypes: void 0,
          uri: URI.joinPath(rootFolderUri, ".github/agents/full-access-agent.agent.md"),
          source: { storage: PromptsStorage.local },
          enabled: true
        }
      ];
      assert.deepEqual(
        result,
        expected,
        "Must get custom agents with agents, skills, and instructions attributes."
      );
    });
    test("header with infer: false sets agentInvocable to false", async () => {
      const rootFolderName = "custom-agents-infer-false";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/agents/agent-infer-false.agent.md`,
          contents: [
            "---",
            "description: 'Agent with infer: false.'",
            "infer: false",
            "---",
            "I should not be invocable by the model."
          ]
        },
        {
          path: `${rootFolder}/.github/agents/agent-infer-true.agent.md`,
          contents: [
            "---",
            "description: 'Agent with infer: true.'",
            "infer: true",
            "---",
            "I should be invocable by the model."
          ]
        },
        {
          path: `${rootFolder}/.github/agents/agent-no-infer.agent.md`,
          contents: [
            "---",
            "description: 'Agent without infer.'",
            "---",
            "I should default to being invocable by the model."
          ]
        }
      ]);
      const result = (await service.getCustomAgents(CancellationToken.None)).map((agent) => ({ ...agent, uri: URI.from(agent.uri) }));
      const inferFalseAgent = result.find((a) => a.name === "agent-infer-false");
      assert.ok(inferFalseAgent, "Should find agent with infer: false");
      assert.strictEqual(inferFalseAgent.visibility.agentInvocable, false, "infer: false should set agentInvocable to false");
      const inferTrueAgent = result.find((a) => a.name === "agent-infer-true");
      assert.ok(inferTrueAgent, "Should find agent with infer: true");
      assert.strictEqual(inferTrueAgent.visibility.agentInvocable, true, "infer: true should set agentInvocable to true");
      const noInferAgent = result.find((a) => a.name === "agent-no-infer");
      assert.ok(noInferAgent, "Should find agent without infer");
      assert.strictEqual(noInferAgent.visibility.agentInvocable, true, "missing infer should default agentInvocable to true");
    });
    test("agents from user data folder", async () => {
      const rootFolderName = "custom-agents-user-data";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      const userPromptsFolder = "/user-data/prompts";
      const userPromptsFolderUri = URI.file(userPromptsFolder);
      const customUserDataProfileService = {
        _serviceBrand: void 0,
        onDidChangeCurrentProfile: Event.None,
        currentProfile: {
          ...toUserDataProfile("test", "test", URI.file(userPromptsFolder).with({ path: "/user-data" }), URI.file("/cache")),
          promptsHome: userPromptsFolderUri
        },
        updateCurrentProfile: async () => {
        }
      };
      instaService.stub(IUserDataProfileService, customUserDataProfileService);
      service.dispose();
      const testService = disposables.add(instaService.createInstance(PromptsService));
      await mockFiles(fileService, [
        // Workspace agent
        {
          path: `${rootFolder}/.github/agents/workspace-agent.agent.md`,
          contents: [
            "---",
            "description: 'Workspace agent.'",
            "---",
            "I am a workspace agent."
          ]
        },
        // User data agent
        {
          path: `${userPromptsFolder}/user-agent.agent.md`,
          contents: [
            "---",
            "description: 'User data agent.'",
            "tools: [ user-tool ]",
            "---",
            "I am a user data agent."
          ]
        },
        // Another user data agent without header
        {
          path: `${userPromptsFolder}/simple-user-agent.agent.md`,
          contents: [
            "A simple user agent without header."
          ]
        }
      ]);
      const result = (await testService.getCustomAgents(CancellationToken.None)).map((agent) => ({ ...agent, uri: URI.from(agent.uri) }));
      assert.strictEqual(result.length, 3, "Should find 3 agents (1 workspace + 2 user data)");
      const workspaceAgent = result.find((a) => a.source.storage === PromptsStorage.local);
      assert.ok(workspaceAgent, "Should find workspace agent");
      assert.strictEqual(workspaceAgent.name, "workspace-agent");
      assert.strictEqual(workspaceAgent.description, "Workspace agent.");
      const userAgents = result.filter((a) => a.source.storage === PromptsStorage.user);
      assert.strictEqual(userAgents.length, 2, "Should find 2 user data agents");
      const userAgentWithHeader = userAgents.find((a) => a.name === "user-agent");
      assert.ok(userAgentWithHeader, "Should find user agent with header");
      assert.strictEqual(userAgentWithHeader.description, "User data agent.");
      assert.deepStrictEqual(userAgentWithHeader.tools, ["user-tool"]);
      const simpleUserAgent = userAgents.find((a) => a.name === "simple-user-agent");
      assert.ok(simpleUserAgent, "Should find simple user agent");
      assert.strictEqual(simpleUserAgent.agentInstructions.content, "A simple user agent without header.");
    });
    test("disabled agents are reported with enabled: false", async () => {
      const rootFolderName = "custom-agents-disabled";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      instaService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
      service.dispose();
      const testService = disposables.add(instaService.createInstance(PromptsService));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/agents/enabled-agent.agent.md`,
          contents: [
            "---",
            "description: 'Enabled agent.'",
            "---",
            "I am enabled."
          ]
        },
        {
          path: `${rootFolder}/.github/agents/disabled-agent.agent.md`,
          contents: [
            "---",
            "description: 'Disabled agent.'",
            "---",
            "I am disabled."
          ]
        },
        {
          path: `${rootFolder}/.github/agents/another-disabled-agent.agent.md`,
          contents: [
            "---",
            "description: 'Another disabled agent.'",
            "---",
            "I am also disabled."
          ]
        }
      ]);
      const initial = await testService.getCustomAgents(CancellationToken.None);
      const toDisable = initial.filter((a) => a.name === "disabled-agent" || a.name === "another-disabled-agent");
      const disabledUris = new ResourceSet();
      for (const a of toDisable) {
        disabledUris.add(URI.from(a.uri));
      }
      testService.setDisabledPromptFiles(PromptsType.agent, disabledUris);
      const persisted = testService.getDisabledPromptFiles(PromptsType.agent);
      assert.strictEqual(persisted.size, 2, `Expected 2 disabled agents, got ${persisted.size}`);
      const result = await testService.getCustomAgents(CancellationToken.None);
      assert.strictEqual(result.length, 3, "Should still discover all 3 agents");
      const enabledAgent = result.find((a) => a.name === "enabled-agent");
      assert.ok(enabledAgent, "Should find enabled-agent");
      assert.strictEqual(enabledAgent.enabled, true, "enabled-agent should be enabled");
      const disabledAgent = result.find((a) => a.name === "disabled-agent");
      assert.ok(disabledAgent, "Should find disabled-agent");
      assert.strictEqual(disabledAgent.enabled, false, "disabled-agent should be disabled");
      const anotherDisabledAgent = result.find((a) => a.name === "another-disabled-agent");
      assert.ok(anotherDisabledAgent, "Should find another-disabled-agent");
      assert.strictEqual(anotherDisabledAgent.enabled, false, "another-disabled-agent should be disabled");
    });
    test("getDiscoveryInfo reports enabled and disabled agents", async () => {
      const rootFolderName = "discovery-info-agents";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      instaService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
      service.dispose();
      const testService = disposables.add(instaService.createInstance(PromptsService));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/agents/enabled-agent.agent.md`,
          contents: [
            "---",
            "description: 'Enabled agent.'",
            "---",
            "I am enabled."
          ]
        },
        {
          path: `${rootFolder}/.github/agents/disabled-agent.agent.md`,
          contents: [
            "---",
            "description: 'Disabled agent.'",
            "---",
            "I am disabled."
          ]
        }
      ]);
      const initial = await testService.getCustomAgents(CancellationToken.None);
      const disabled = initial.find((a) => a.name === "disabled-agent");
      assert.ok(disabled, "Should find disabled-agent in initial discovery");
      const disabledUris = new ResourceSet();
      disabledUris.add(URI.from(disabled.uri));
      testService.setDisabledPromptFiles(PromptsType.agent, disabledUris);
      const discoveryInfo = await testService.getDiscoveryInfo(PromptsType.agent, CancellationToken.None);
      assert.strictEqual(discoveryInfo.type, PromptsType.agent);
      assert.strictEqual(discoveryInfo.files.length, 2, "Discovery should include both agents");
      const enabledFile = discoveryInfo.files.find((f) => f.promptPath.uri.path.endsWith("enabled-agent.agent.md"));
      assert.ok(enabledFile, "Should report enabled-agent in discovery info");
      assert.strictEqual(enabledFile.status, "loaded", "Enabled agent should be loaded");
      assert.strictEqual(enabledFile.skipReason, void 0, "Enabled agent should not have a skip reason");
      assert.ok(enabledFile.agent, "Enabled agent file should carry resolved agent");
      assert.strictEqual(enabledFile.agent.enabled, true);
      const disabledFile = discoveryInfo.files.find((f) => f.promptPath.uri.path.endsWith("disabled-agent.agent.md"));
      assert.ok(disabledFile, "Should report disabled-agent in discovery info");
      assert.strictEqual(disabledFile.status, "skipped", "Disabled agent should be skipped");
      assert.strictEqual(disabledFile.skipReason, "disabled", 'Disabled agent should have skipReason "disabled"');
      assert.ok(disabledFile.agent, "Disabled agent file should still carry resolved agent");
      assert.strictEqual(disabledFile.agent.enabled, false);
    });
  });
  suite("listPromptFiles - prompts", () => {
    test("prompts from user data folder", async () => {
      const rootFolderName = "prompts-user-data";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      const userPromptsFolder = "/user-data/prompts";
      const userPromptsFolderUri = URI.file(userPromptsFolder);
      const customUserDataProfileService = {
        _serviceBrand: void 0,
        onDidChangeCurrentProfile: Event.None,
        currentProfile: {
          ...toUserDataProfile("test", "test", URI.file(userPromptsFolder).with({ path: "/user-data" }), URI.file("/cache")),
          promptsHome: userPromptsFolderUri
        },
        updateCurrentProfile: async () => {
        }
      };
      instaService.stub(IUserDataProfileService, customUserDataProfileService);
      service.dispose();
      const testService = disposables.add(instaService.createInstance(PromptsService));
      await mockFiles(fileService, [
        // Workspace prompt
        {
          path: `${rootFolder}/.github/prompts/workspace-prompt.prompt.md`,
          contents: [
            "---",
            "description: 'Workspace prompt.'",
            "---",
            "I am a workspace prompt."
          ]
        },
        // User data prompt
        {
          path: `${userPromptsFolder}/user-prompt.prompt.md`,
          contents: [
            "---",
            "description: 'User data prompt.'",
            "---",
            "I am a user data prompt."
          ]
        }
      ]);
      const result = await testService.listPromptFiles(PromptsType.prompt, CancellationToken.None);
      assert.strictEqual(result.length, 2, "Should find 2 prompts (1 workspace + 1 user data)");
      const workspacePrompt = result.find((p) => p.storage === PromptsStorage.local);
      assert.ok(workspacePrompt, "Should find workspace prompt");
      assert.ok(workspacePrompt.uri.path.includes("workspace-prompt.prompt.md"));
      const userPrompt = result.find((p) => p.storage === PromptsStorage.user);
      assert.ok(userPrompt, "Should find user data prompt");
      assert.ok(userPrompt.uri.path.includes("user-prompt.prompt.md"));
    });
  });
  suite("listPromptFiles - instructions", () => {
    test("instructions from user data folder", async () => {
      const rootFolderName = "instructions-user-data";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      const userPromptsFolder = "/user-data/prompts";
      const userPromptsFolderUri = URI.file(userPromptsFolder);
      const customUserDataProfileService = {
        _serviceBrand: void 0,
        onDidChangeCurrentProfile: Event.None,
        currentProfile: {
          ...toUserDataProfile("test", "test", URI.file(userPromptsFolder).with({ path: "/user-data" }), URI.file("/cache")),
          promptsHome: userPromptsFolderUri
        },
        updateCurrentProfile: async () => {
        }
      };
      instaService.stub(IUserDataProfileService, customUserDataProfileService);
      service.dispose();
      const testService = disposables.add(instaService.createInstance(PromptsService));
      await mockFiles(fileService, [
        // Workspace instructions
        {
          path: `${rootFolder}/.github/instructions/workspace-instructions.instructions.md`,
          contents: [
            "---",
            "description: 'Workspace instructions.'",
            'applyTo: "**/*.ts"',
            "---",
            "I am workspace instructions."
          ]
        },
        // User data instructions
        {
          path: `${userPromptsFolder}/user-instructions.instructions.md`,
          contents: [
            "---",
            "description: 'User data instructions.'",
            'applyTo: "**/*.tsx"',
            "---",
            "I am user data instructions."
          ]
        }
      ]);
      const result = await testService.listPromptFiles(PromptsType.instructions, CancellationToken.None);
      assert.strictEqual(result.length, 2, "Should find 2 instructions (1 workspace + 1 user data)");
      const workspaceInstructions = result.find((p) => p.storage === PromptsStorage.local);
      assert.ok(workspaceInstructions, "Should find workspace instructions");
      assert.ok(workspaceInstructions.uri.path.includes("workspace-instructions.instructions.md"));
      const userInstructions = result.find((p) => p.storage === PromptsStorage.user);
      assert.ok(userInstructions, "Should find user data instructions");
      assert.ok(userInstructions.uri.path.includes("user-instructions.instructions.md"));
    });
  });
  suite("listPromptFiles - skills ", () => {
    teardown(() => {
      sinon.restore();
    });
    test("should list skill files from workspace", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "list-skills-workspace";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/skills/skill1/SKILL.md`,
          contents: [
            "---",
            'name: "Skill 1"',
            'description: "First skill"',
            "---",
            "Skill 1 content"
          ]
        },
        {
          path: `${rootFolder}/.claude/skills/skill2/SKILL.md`,
          contents: [
            "---",
            'name: "Skill 2"',
            'description: "Second skill"',
            "---",
            "Skill 2 content"
          ]
        }
      ]);
      const result = await service.listPromptFiles(PromptsType.skill, CancellationToken.None);
      assert.strictEqual(result.length, 2, "Should find 2 skills");
      const skill1 = result.find((s) => s.uri.path.includes("skill1"));
      assert.ok(skill1, "Should find skill1");
      assert.strictEqual(skill1.type, PromptsType.skill);
      assert.strictEqual(skill1.storage, PromptsStorage.local);
      const skill2 = result.find((s) => s.uri.path.includes("skill2"));
      assert.ok(skill2, "Should find skill2");
      assert.strictEqual(skill2.type, PromptsType.skill);
      assert.strictEqual(skill2.storage, PromptsStorage.local);
    });
    test("should list skill files from user home", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "list-skills-user-home";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: "/home/user/.copilot/skills/personal-skill/SKILL.md",
          contents: [
            "---",
            'name: "Personal Skill"',
            'description: "A personal skill"',
            "---",
            "Personal skill content"
          ]
        },
        {
          path: "/home/user/.claude/skills/claude-personal/SKILL.md",
          contents: [
            "---",
            'name: "Claude Personal Skill"',
            'description: "A Claude personal skill"',
            "---",
            "Claude personal skill content"
          ]
        }
      ]);
      const result = await service.listPromptFiles(PromptsType.skill, CancellationToken.None);
      const personalSkills = result.filter((s) => s.storage === PromptsStorage.user);
      assert.strictEqual(personalSkills.length, 2, "Should find 2 personal skills");
      const copilotSkill = personalSkills.find((s) => s.uri.path.includes(".copilot"));
      assert.ok(copilotSkill, "Should find copilot personal skill");
      const claudeSkill = personalSkills.find((s) => s.uri.path.includes(CLAUDE_CONFIG_FOLDER));
      assert.ok(claudeSkill, "Should find claude personal skill");
    });
    test("should not list skills when not in skill folder structure", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      const rootFolderName = "no-skills";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/prompts/SKILL.md`,
          contents: [
            "---",
            'name: "Not a skill"',
            "---",
            "This is in prompts folder, not skills"
          ]
        },
        {
          path: `${rootFolder}/SKILL.md`,
          contents: [
            "---",
            'name: "Root skill"',
            "---",
            "This is in root, not skills folder"
          ]
        }
      ]);
      const result = await service.listPromptFiles(PromptsType.skill, CancellationToken.None);
      assert.strictEqual(result.length, 0, "Should not find any skills in non-skill locations");
    });
    test("should handle mixed workspace and user home skills", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "mixed-skills";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        // Workspace skills
        {
          path: `${rootFolder}/.github/skills/workspace-skill/SKILL.md`,
          contents: [
            "---",
            'name: "Workspace Skill"',
            'description: "A workspace skill"',
            "---",
            "Workspace skill content"
          ]
        },
        // User home skills
        {
          path: "/home/user/.copilot/skills/personal-skill/SKILL.md",
          contents: [
            "---",
            'name: "Personal Skill"',
            'description: "A personal skill"',
            "---",
            "Personal skill content"
          ]
        }
      ]);
      const result = await service.listPromptFiles(PromptsType.skill, CancellationToken.None);
      const workspaceSkills = result.filter((s) => s.storage === PromptsStorage.local);
      const userSkills = result.filter((s) => s.storage === PromptsStorage.user);
      assert.strictEqual(workspaceSkills.length, 1, "Should find 1 workspace skill");
      assert.strictEqual(userSkills.length, 1, "Should find 1 user skill");
    });
    test("should respect disabled default paths via config", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {
        ".github/skills": false,
        ".claude/skills": true
      });
      const rootFolderName = "disabled-default-test";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/skills/github-skill/SKILL.md`,
          contents: [
            "---",
            'name: "GitHub Skill"',
            'description: "Should NOT be found"',
            "---",
            "This skill is in a disabled folder"
          ]
        },
        {
          path: `${rootFolder}/.claude/skills/claude-skill/SKILL.md`,
          contents: [
            "---",
            'name: "Claude Skill"',
            'description: "Should be found"',
            "---",
            "This skill is in an enabled folder"
          ]
        }
      ]);
      const result = await service.listPromptFiles(PromptsType.skill, CancellationToken.None);
      assert.strictEqual(result.length, 1, "Should find only 1 skill (from enabled folder)");
      assert.ok(result[0].uri.path.includes(".claude/skills"), "Should only find skill from .claude/skills");
      assert.ok(!result[0].uri.path.includes(".github/skills"), "Should not find skill from disabled .github/skills");
    });
    test("should expand tilde paths in custom locations", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {
        ".github/skills": false,
        ".claude/skills": false,
        "~/my-custom-skills": true
      });
      const rootFolderName = "tilde-test";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: "/home/user/my-custom-skills/custom-skill/SKILL.md",
          contents: [
            "---",
            'name: "Custom Skill"',
            'description: "A skill from tilde path"',
            "---",
            "Skill content from ~/my-custom-skills"
          ]
        }
      ]);
      const result = await service.listPromptFiles(PromptsType.skill, CancellationToken.None);
      assert.strictEqual(result.length, 1, "Should find 1 skill from tilde-expanded path");
      assert.ok(result[0].uri.path.includes("/home/user/my-custom-skills"), "Path should be expanded from tilde");
    });
  });
  suite("getSourceFolders - skills", () => {
    test("includes user-level skill source folders", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderUri = URI.file("/skills-source-folders");
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      const folders = await service.getSourceFolders(PromptsType.skill);
      const userFolders = folders.filter((f) => f.storage === PromptsStorage.user);
      const localFolders = folders.filter((f) => f.storage === PromptsStorage.local);
      assert.ok(userFolders.length > 0, "Should include user-level skill source folders");
      assert.ok(localFolders.length > 0, "Should include workspace-level skill source folders");
      assert.ok(
        userFolders.some((f) => f.uri.path === "/home/user/.copilot/skills"),
        "Should include ~/.copilot/skills as a user source folder"
      );
    });
    test("excludes defaults explicitly disabled via configuration", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {
        ".github/skills": false,
        "~/.copilot/skills": false
      });
      const rootFolderUri = URI.file("/skills-disabled-defaults");
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      const folders = await service.getSourceFolders(PromptsType.skill);
      const paths = folders.map((f) => f.uri.path);
      assert.ok(!paths.some((p) => p.endsWith("/.github/skills")), "Disabled .github/skills must not appear");
      assert.ok(!paths.includes("/home/user/.copilot/skills"), "Disabled ~/.copilot/skills must not appear");
      assert.ok(paths.includes("/home/user/.agents/skills"), "Non-disabled ~/.agents/skills must still appear");
    });
  });
  suite("listPromptFiles - extensions", () => {
    test("Contributed prompt file", async () => {
      const uri = URI.parse("file://extensions/my-extension/textMate.instructions.md");
      const extension = {};
      const registered = service.registerContributedFile(
        PromptsType.instructions,
        uri,
        extension,
        "TextMate Instructions",
        "Instructions to follow when authoring TextMate grammars"
      );
      const actual = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
      assert.strictEqual(actual.length, 1);
      assert.strictEqual(actual[0].uri.toString(), uri.toString());
      assert.strictEqual(actual[0].name, "TextMate Instructions");
      assert.strictEqual(actual[0].storage, PromptsStorage.extension);
      assert.strictEqual(actual[0].type, PromptsType.instructions);
      registered.dispose();
    });
    test("getInstructionFiles returns resolved metadata", async () => {
      const uri = URI.parse("file://extensions/my-extension/textMate.instructions.md");
      const extension = {
        identifier: { value: "test.my-extension" }
      };
      await mockFiles(fileService, [{
        path: uri.path,
        contents: [
          "---",
          "name: TextMate Instructions",
          "description: Instructions to follow when authoring TextMate grammars",
          'applyTo: "**/*.tmLanguage.json"',
          "---",
          "Use scopes carefully."
        ]
      }]);
      const registered = service.registerContributedFile(
        PromptsType.instructions,
        uri,
        extension,
        void 0,
        void 0
      );
      const actual = await service.getInstructionFiles(CancellationToken.None);
      assert.deepStrictEqual(actual.map(({ uri: uri2, name, description, pattern, storage, source, pluginUri, extension: extension2 }) => ({ uri: uri2, name, description, applyTo: pattern, storage, source, pluginUri, extension: extension2 })), [{
        uri,
        name: "TextMate Instructions",
        description: "Instructions to follow when authoring TextMate grammars",
        applyTo: "**/*.tmLanguage.json",
        storage: PromptsStorage.extension,
        source: PromptFileSource.ExtensionContribution,
        pluginUri: void 0,
        extension
      }]);
      registered.dispose();
    });
    test("Custom agent provider", async () => {
      const agentUri = URI.parse("file://extensions/my-extension/myAgent.agent.md");
      const extension = {
        identifier: { value: "test.my-extension" },
        enabledApiProposals: ["chatParticipantPrivate"]
      };
      await mockFiles(fileService, [
        {
          path: agentUri.path,
          contents: [
            "---",
            "description: 'My custom agent from provider'",
            "tools: [ tool1, tool2 ]",
            "---",
            "I am a custom agent from a provider."
          ]
        }
      ]);
      const provider = {
        providePromptFiles: async (_context, _token) => {
          return [
            {
              uri: agentUri
            }
          ];
        }
      };
      const registered = service.registerPromptFileProvider(extension, PromptsType.agent, provider);
      const actual = await service.getCustomAgents(CancellationToken.None);
      assert.strictEqual(actual.length, 1);
      assert.strictEqual(actual[0].name, "myAgent");
      assert.strictEqual(actual[0].description, "My custom agent from provider");
      assert.strictEqual(actual[0].uri.toString(), agentUri.toString());
      assert.strictEqual(actual[0].source.storage, PromptsStorage.extension);
      registered.dispose();
      const actualAfterDispose = await service.getCustomAgents(CancellationToken.None);
      assert.strictEqual(actualAfterDispose.length, 0);
    });
    test("Contributed agent file that does not exist should not crash", async () => {
      const nonExistentUri = URI.parse("file://extensions/my-extension/nonexistent.agent.md");
      const existingUri = URI.parse("file://extensions/my-extension/existing.agent.md");
      const extension = {
        identifier: { value: "test.my-extension" }
      };
      await mockFiles(fileService, [
        {
          path: existingUri.path,
          contents: [
            "---",
            "name: 'Existing Agent'",
            "description: 'An agent that exists'",
            "---",
            "I am an existing agent."
          ]
        }
      ]);
      const registered1 = service.registerContributedFile(
        PromptsType.agent,
        nonExistentUri,
        extension,
        "NonExistent Agent",
        "An agent that does not exist"
      );
      const registered2 = service.registerContributedFile(
        PromptsType.agent,
        existingUri,
        extension,
        "Existing Agent",
        "An agent that exists"
      );
      const agents = await service.getCustomAgents(CancellationToken.None);
      assert.strictEqual(agents.length, 1, "Should only return the agent that exists");
      assert.strictEqual(agents[0].name, "Existing Agent");
      assert.strictEqual(agents[0].description, "An agent that exists");
      assert.strictEqual(agents[0].uri.toString(), existingUri.toString());
      registered1.dispose();
      registered2.dispose();
    });
    test("Contributed file with when clause is filtered inside PromptsService", async () => {
      const uri = URI.parse("file://extensions/my-extension/conditional.instructions.md");
      const extension = {};
      const contextKeyService = instaService.get(IContextKeyService);
      const contextMatchesRulesStub = sinon.stub(contextKeyService, "contextMatchesRules").returns(false);
      const registered = service.registerContributedFile(
        PromptsType.instructions,
        uri,
        extension,
        "Conditional Instructions",
        "Only when enabled",
        "myFeature.enabled"
      );
      const files = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
      assert.strictEqual(files.length, 0, "Should be filtered out when the when clause does not match");
      registered.dispose();
      contextMatchesRulesStub.restore();
      const enabledContextMatchesRulesStub = sinon.stub(contextKeyService, "contextMatchesRules").returns(true);
      const enabledRegistration = service.registerContributedFile(
        PromptsType.instructions,
        uri,
        extension,
        "Conditional Instructions",
        "Only when enabled",
        "myFeature.enabled"
      );
      const enabledFiles = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
      assert.strictEqual(enabledFiles.length, 1, "Should be included when the when clause matches");
      assert.strictEqual(enabledFiles[0].uri.toString(), uri.toString());
      enabledRegistration.dispose();
      enabledContextMatchesRulesStub.restore();
    });
    test("Provider file with when clause is filtered inside PromptsService", async () => {
      const uri = URI.parse("file://extensions/test/myInstruction.instructions.md");
      const extension = {
        identifier: { value: "test.my-extension" },
        enabledApiProposals: ["chatParticipantPrivate"]
      };
      const contextKeyService = instaService.get(IContextKeyService);
      const registered = service.registerPromptFileProvider(extension, PromptsType.instructions, {
        providePromptFiles: async () => [{ uri, when: "chatSessionType == local" }]
      });
      const contextMatchesRulesStub = sinon.stub(contextKeyService, "contextMatchesRules").returns(false);
      const files = await service.listPromptFilesForStorage(PromptsType.instructions, PromptsStorage.extension, CancellationToken.None);
      assert.strictEqual(files.length, 0, "Should be filtered out when the when clause does not match");
      contextMatchesRulesStub.restore();
      const enabledContextMatchesRulesStub = sinon.stub(contextKeyService, "contextMatchesRules").returns(true);
      const enabledFiles = await service.listPromptFilesForStorage(PromptsType.instructions, PromptsStorage.extension, CancellationToken.None);
      assert.strictEqual(enabledFiles.length, 1, "Should be included when the when clause matches");
      assert.strictEqual(enabledFiles[0].uri.toString(), uri.toString());
      enabledContextMatchesRulesStub.restore();
      registered.dispose();
    });
    test("Provider when keys invalidate cached results when context changes", async () => {
      const contextKeyService = disposables.add(new TestPromptContextKeyService());
      instaService.stub(IContextKeyService, contextKeyService);
      const promptsService = disposables.add(instaService.createInstance(PromptsService));
      instaService.stub(IPromptsService, promptsService);
      const uri = URI.parse("file://extensions/test/conditional.instructions.md");
      await mockFiles(fileService, [{
        path: uri.path,
        contents: [
          "---",
          'description: "Conditional Instructions"',
          "---",
          "Instruction body"
        ]
      }]);
      const extension = {
        identifier: { value: "test.my-extension" },
        enabledApiProposals: ["chatParticipantPrivate"]
      };
      const registered = promptsService.registerPromptFileProvider(extension, PromptsType.instructions, {
        providePromptFiles: async () => [{ uri, when: "myFeature.enabled" }]
      });
      contextKeyService.setRulesMatch(true);
      const enabledFiles = await promptsService.getInstructionFiles(CancellationToken.None);
      assert.strictEqual(enabledFiles.length, 1, "Should include the provider instruction when the context matches");
      contextKeyService.setRulesMatch(false);
      contextKeyService.fireDidChangeContext(["myFeature.enabled"]);
      const disabledFiles = await promptsService.getInstructionFiles(CancellationToken.None);
      assert.strictEqual(disabledFiles.length, 0, "Should invalidate the cached provider instruction when the tracked key changes");
      registered.dispose();
    });
    test("Contributed file sessionTypes metadata is preserved in core prompt models", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const agentUri = URI.parse("file://extensions/my-extension/contributed.agent.md");
      const instructionUri = URI.parse("file://extensions/my-extension/contributed.instructions.md");
      const promptUri = URI.parse("file://extensions/my-extension/contributed.prompt.md");
      const skillUri = URI.parse("file://extensions/my-extension/contributed-skill/SKILL.md");
      const extension = {
        identifier: { value: "test.my-extension" }
      };
      const sessionTypes = ["copilotcli"];
      await mockFiles(fileService, [
        {
          path: agentUri.path,
          contents: [
            "---",
            'name: "contributed-agent"',
            'description: "Contributed agent"',
            "---",
            "Agent body"
          ]
        },
        {
          path: instructionUri.path,
          contents: [
            "---",
            'name: "contributed-instruction"',
            'description: "Contributed instruction"',
            "---",
            "Instruction body"
          ]
        },
        {
          path: promptUri.path,
          contents: [
            "---",
            'name: "contributed-prompt"',
            'description: "Contributed prompt"',
            "---",
            "Prompt body"
          ]
        },
        {
          path: skillUri.path,
          contents: [
            "---",
            'name: "contributed-skill"',
            'description: "Contributed skill"',
            "---",
            "Skill body"
          ]
        }
      ]);
      const registrations = [
        service.registerContributedFile(PromptsType.agent, agentUri, extension, void 0, void 0, void 0, sessionTypes),
        service.registerContributedFile(PromptsType.instructions, instructionUri, extension, void 0, void 0, void 0, sessionTypes),
        service.registerContributedFile(PromptsType.prompt, promptUri, extension, void 0, void 0, void 0, sessionTypes),
        service.registerContributedFile(PromptsType.skill, skillUri, extension, void 0, void 0, void 0, sessionTypes)
      ];
      try {
        const agent = (await service.getCustomAgents(CancellationToken.None)).find((item) => item.uri.toString() === agentUri.toString());
        const instruction = (await service.getInstructionFiles(CancellationToken.None)).find((item) => item.uri.toString() === instructionUri.toString());
        const prompt = (await service.getPromptSlashCommands(CancellationToken.None)).find((item) => item.uri.toString() === promptUri.toString());
        const skill = (await service.findAgentSkills(CancellationToken.None))?.find((item) => item.uri.toString() === skillUri.toString());
        assert.deepStrictEqual(agent?.sessionTypes, sessionTypes);
        assert.deepStrictEqual(instruction?.sessionTypes, sessionTypes);
        assert.deepStrictEqual(prompt?.sessionTypes, sessionTypes);
        assert.deepStrictEqual(skill?.sessionTypes, sessionTypes);
      } finally {
        for (const registration of registrations) {
          registration.dispose();
        }
      }
    });
  });
  suite("listPromptFiles - parent repo folder", () => {
    test("should find prompts, instructions, and agents in a parent repo folder", async () => {
      const parentFolder = "/repos/collect-prompt-parent-test";
      const rootFolder = `${parentFolder}/repo`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        // .git in parent marks it as a repo root
        {
          path: `${parentFolder}/.git/HEAD`,
          contents: ["ref: refs/heads/main"]
        },
        // Applying instruction in parent
        {
          path: `${parentFolder}/.github/instructions/typescript.instructions.md`,
          contents: [
            "---",
            "description: 'Parent TypeScript instructions'",
            'applyTo: "**/*.ts"',
            "---",
            "Parent TypeScript coding standards"
          ]
        },
        // Prompt file in parent
        {
          path: `${parentFolder}/.github/prompts/help.prompt.md`,
          contents: [
            "---",
            "description: 'Parent help prompt'",
            "---",
            "Help the user with their question"
          ]
        },
        // Agent file in parent
        {
          path: `${parentFolder}/.github/agents/reviewer.agent.md`,
          contents: [
            "---",
            "description: 'Parent code reviewer agent'",
            "---",
            "You are a code reviewer"
          ]
        },
        {
          path: `${rootFolder}/src/file.ts`,
          contents: ['console.log("test");']
        }
      ]);
      await testConfigService.setUserConfiguration(PromptsConfig.INCLUDE_APPLYING_INSTRUCTIONS, true);
      await testConfigService.setUserConfiguration(PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS, false);
      let promptFiles = await service.listPromptFiles(PromptsType.prompt, CancellationToken.None);
      let agentFiles = await service.listPromptFiles(PromptsType.agent, CancellationToken.None);
      let instructionFiles = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
      assert.ok(!promptFiles.some((f) => f.uri.path.includes(parentFolder)), "Should not find parent prompt files when parent search is disabled");
      assert.ok(!agentFiles.some((f) => f.uri.path.includes(parentFolder)), "Should not find parent agent files when parent search is disabled");
      assert.ok(!instructionFiles.some((f) => f.uri.path.includes(parentFolder)), "Should not find parent instruction files when parent search is disabled");
      testConfigService.setUserConfiguration(PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS, true);
      fireConfigChange(testConfigService, PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS);
      promptFiles = await service.listPromptFiles(PromptsType.prompt, CancellationToken.None);
      agentFiles = await service.listPromptFiles(PromptsType.agent, CancellationToken.None);
      instructionFiles = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
      const promptPaths = promptFiles.map((f) => f.uri.path);
      const agentPaths = agentFiles.map((f) => f.uri.path);
      const instructionPaths = instructionFiles.map((f) => f.uri.path);
      assert.ok(promptPaths.includes(`${parentFolder}/.github/prompts/help.prompt.md`), "Should find parent prompt file when parent search is enabled");
      assert.ok(agentPaths.includes(`${parentFolder}/.github/agents/reviewer.agent.md`), "Should find parent agent file when parent search is enabled");
      assert.ok(instructionPaths.includes(`${parentFolder}/.github/instructions/typescript.instructions.md`), "Should find parent instruction file when parent search is enabled");
    });
    test("should not find files in an untrusted parent repo folder", async () => {
      const parentFolder = "/repos/untrusted-parent-test";
      const rootFolder = `${parentFolder}/repo`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        // .git in parent marks it as a repo root
        {
          path: `${parentFolder}/.git/HEAD`,
          contents: ["ref: refs/heads/main"]
        },
        // Applying instruction in parent
        {
          path: `${parentFolder}/.github/instructions/typescript.instructions.md`,
          contents: [
            "---",
            "description: 'Parent TypeScript instructions'",
            'applyTo: "**/*.ts"',
            "---",
            "Parent TypeScript coding standards"
          ]
        },
        // Prompt file in parent
        {
          path: `${parentFolder}/.github/prompts/help.prompt.md`,
          contents: [
            "---",
            "description: 'Parent help prompt'",
            "---",
            "Help the user with their question"
          ]
        },
        // Agent file in parent
        {
          path: `${parentFolder}/.github/agents/reviewer.agent.md`,
          contents: [
            "---",
            "description: 'Parent code reviewer agent'",
            "---",
            "You are a code reviewer"
          ]
        },
        {
          path: `${rootFolder}/src/file.ts`,
          contents: ['console.log("test");']
        }
      ]);
      testConfigService.setUserConfiguration(PromptsConfig.INCLUDE_APPLYING_INSTRUCTIONS, true);
      testConfigService.setUserConfiguration(PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS, true);
      fireConfigChange(testConfigService, PromptsConfig.INCLUDE_APPLYING_INSTRUCTIONS, PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS);
      workspaceTrustService.getUriTrustInfo = (uri) => {
        if (uri.path === parentFolder) {
          return Promise.resolve({ trusted: false, uri });
        }
        return Promise.resolve({ trusted: true, uri });
      };
      const promptFiles = await service.listPromptFiles(PromptsType.prompt, CancellationToken.None);
      const agentFiles = await service.listPromptFiles(PromptsType.agent, CancellationToken.None);
      const instructionFiles = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
      assert.ok(!promptFiles.some((f) => f.uri.path.includes(parentFolder)), "Should not find parent prompt files when parent repo is untrusted");
      assert.ok(!agentFiles.some((f) => f.uri.path.includes(parentFolder)), "Should not find parent agent files when parent repo is untrusted");
      assert.ok(!instructionFiles.some((f) => f.uri.path.includes(parentFolder)), "Should not find parent instruction files when parent repo is untrusted");
    });
  });
  test("Instructions provider", async () => {
    const instructionUri = URI.parse("file://extensions/my-extension/myInstruction.instructions.md");
    const extension = {
      identifier: { value: "test.my-extension" },
      enabledApiProposals: ["chatParticipantPrivate"]
    };
    await mockFiles(fileService, [
      {
        path: instructionUri.path,
        contents: [
          "# Test instruction content"
        ]
      }
    ]);
    const provider = {
      providePromptFiles: async (_context, _token) => {
        return [
          {
            uri: instructionUri
          }
        ];
      }
    };
    const registered = service.registerPromptFileProvider(extension, PromptsType.instructions, provider);
    const actual = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
    const providerInstruction = actual.find((i) => i.uri.toString() === instructionUri.toString());
    assert.ok(providerInstruction, "Provider instruction should be found");
    assert.strictEqual(providerInstruction.uri.toString(), instructionUri.toString());
    assert.strictEqual(providerInstruction.storage, PromptsStorage.extension);
    assert.strictEqual(providerInstruction.source, PromptFileSource.ExtensionAPI);
    registered.dispose();
    const actualAfterDispose = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
    const foundAfterDispose = actualAfterDispose.find((i) => i.uri.toString() === instructionUri.toString());
    assert.strictEqual(foundAfterDispose, void 0);
  });
  test("Provider sessionTypes metadata is preserved in core prompt models", async () => {
    testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
    testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
    const agentUri = URI.parse("file://extensions/my-extension/enabled.agent.md");
    const instructionUri = URI.parse("file://extensions/my-extension/enabled.instructions.md");
    const promptUri = URI.parse("file://extensions/my-extension/enabled.prompt.md");
    const skillUri = URI.parse("file://extensions/my-extension/enabled-skill/SKILL.md");
    const extension = {
      identifier: { value: "test.my-extension" },
      enabledApiProposals: ["chatParticipantPrivate"]
    };
    const sessionTypes = ["copilotcli"];
    await mockFiles(fileService, [
      {
        path: agentUri.path,
        contents: [
          "---",
          'name: "enabled-agent"',
          'description: "An enabled agent"',
          "---",
          "Agent body"
        ]
      },
      {
        path: instructionUri.path,
        contents: [
          "---",
          'name: "enabled-instruction"',
          'description: "An enabled instruction"',
          "---",
          "Instruction body"
        ]
      },
      {
        path: promptUri.path,
        contents: [
          "---",
          'name: "enabled-prompt"',
          'description: "An enabled prompt"',
          "---",
          "Prompt body"
        ]
      },
      {
        path: skillUri.path,
        contents: [
          "---",
          'name: "enabled-skill"',
          'description: "An enabled skill"',
          "---",
          "Skill body"
        ]
      }
    ]);
    const registrations = [
      service.registerPromptFileProvider(extension, PromptsType.agent, {
        providePromptFiles: async () => [{ uri: agentUri, sessionTypes }]
      }),
      service.registerPromptFileProvider(extension, PromptsType.instructions, {
        providePromptFiles: async () => [{ uri: instructionUri, sessionTypes }]
      }),
      service.registerPromptFileProvider(extension, PromptsType.prompt, {
        providePromptFiles: async () => [{ uri: promptUri, sessionTypes }]
      }),
      service.registerPromptFileProvider(extension, PromptsType.skill, {
        providePromptFiles: async () => [{ uri: skillUri, sessionTypes }]
      })
    ];
    try {
      const agent = (await service.getCustomAgents(CancellationToken.None)).find((item) => item.uri.toString() === agentUri.toString());
      const instruction = (await service.getInstructionFiles(CancellationToken.None)).find((item) => item.uri.toString() === instructionUri.toString());
      const prompt = (await service.getPromptSlashCommands(CancellationToken.None)).find((item) => item.uri.toString() === promptUri.toString());
      const skill = (await service.findAgentSkills(CancellationToken.None))?.find((item) => item.uri.toString() === skillUri.toString());
      assert.deepStrictEqual(agent?.sessionTypes, sessionTypes);
      assert.deepStrictEqual(instruction?.sessionTypes, sessionTypes);
      assert.deepStrictEqual(prompt?.sessionTypes, sessionTypes);
      assert.deepStrictEqual(skill?.sessionTypes, sessionTypes);
    } finally {
      for (const registration of registrations) {
        registration.dispose();
      }
    }
  });
  test("Prompt file provider", async () => {
    const promptUri = URI.parse("file://extensions/my-extension/myPrompt.prompt.md");
    const extension = {
      identifier: { value: "test.my-extension" },
      enabledApiProposals: ["chatParticipantPrivate"]
    };
    await mockFiles(fileService, [
      {
        path: promptUri.path,
        contents: [
          "# Test prompt content"
        ]
      }
    ]);
    const provider = {
      providePromptFiles: async (_context, _token) => {
        return [
          {
            uri: promptUri
          }
        ];
      }
    };
    const registered = service.registerPromptFileProvider(extension, PromptsType.prompt, provider);
    const actual = await service.listPromptFiles(PromptsType.prompt, CancellationToken.None);
    const providerPrompt = actual.find((i) => i.uri.toString() === promptUri.toString());
    assert.ok(providerPrompt, "Provider prompt should be found");
    assert.strictEqual(providerPrompt.uri.toString(), promptUri.toString());
    assert.strictEqual(providerPrompt.storage, PromptsStorage.extension);
    assert.strictEqual(providerPrompt.source, PromptFileSource.ExtensionAPI);
    registered.dispose();
    const actualAfterDispose = await service.listPromptFiles(PromptsType.prompt, CancellationToken.None);
    const foundAfterDispose = actualAfterDispose.find((i) => i.uri.toString() === promptUri.toString());
    assert.strictEqual(foundAfterDispose, void 0);
  });
  test("Skill file provider", async () => {
    const skillUri = URI.parse("file://extensions/my-extension/mySkill/SKILL.md");
    const extension = {
      identifier: { value: "test.my-extension" },
      enabledApiProposals: ["chatParticipantPrivate"]
    };
    await mockFiles(fileService, [
      {
        path: skillUri.path,
        contents: [
          "---",
          'name: "My Custom Skill"',
          'description: "A custom skill from provider"',
          "---",
          "Custom skill content."
        ]
      }
    ]);
    const provider = {
      providePromptFiles: async (_context, _token) => {
        return [
          {
            uri: skillUri
          }
        ];
      }
    };
    const registered = service.registerPromptFileProvider(extension, PromptsType.skill, provider);
    const actual = await service.listPromptFiles(PromptsType.skill, CancellationToken.None);
    const providerSkill = actual.find((i) => i.uri.toString() === skillUri.toString());
    assert.ok(providerSkill, "Provider skill should be found");
    assert.strictEqual(providerSkill.uri.toString(), skillUri.toString());
    assert.strictEqual(providerSkill.storage, PromptsStorage.extension);
    assert.strictEqual(providerSkill.source, PromptFileSource.ExtensionAPI);
    registered.dispose();
    const actualAfterDispose = await service.listPromptFiles(PromptsType.skill, CancellationToken.None);
    const foundAfterDispose = actualAfterDispose.find((i) => i.uri.toString() === skillUri.toString());
    assert.strictEqual(foundAfterDispose, void 0);
  });
  suite("findAgentSkills", () => {
    teardown(() => {
      sinon.restore();
    });
    test("should return undefined when USE_AGENT_SKILLS is disabled", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, false);
      const result = await service.findAgentSkills(CancellationToken.None);
      assert.strictEqual(result, void 0);
    });
    test("should find skills in workspace and user home", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "agent-skills-test";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/skills/GitHub Skill 1/SKILL.md`,
          contents: [
            "---",
            'name: "GitHub Skill 1"',
            'description: "A GitHub skill for testing"',
            "---",
            "This is GitHub skill 1 content"
          ]
        },
        {
          path: `${rootFolder}/.claude/skills/Claude Skill 1/SKILL.md`,
          contents: [
            "---",
            'name: "Claude Skill 1"',
            'description: "A Claude skill for testing"',
            "---",
            "This is Claude skill 1 content"
          ]
        },
        {
          path: `${rootFolder}/.claude/skills/invalid-skill/SKILL.md`,
          contents: [
            "---",
            'description: "Invalid skill, no name"',
            "---",
            "This is invalid skill content"
          ]
        },
        {
          path: `${rootFolder}/.github/skills/not-a-skill-dir/README.md`,
          contents: ["This is not a skill"]
        },
        {
          path: "/home/user/.claude/skills/Personal Skill 1/SKILL.md",
          contents: [
            "---",
            'name: "Personal Skill 1"',
            'description: "A personal skill for testing"',
            "---",
            "This is personal skill 1 content"
          ]
        },
        {
          path: "/home/user/.claude/skills/not-a-skill/other-file.md",
          contents: ["Not a skill file"]
        },
        {
          path: "/home/user/.copilot/skills/Copilot Skill 1/SKILL.md",
          contents: [
            "---",
            'name: "Copilot Skill 1"',
            'description: "A Copilot skill for testing"',
            "---",
            "This is Copilot skill 1 content"
          ]
        }
      ]);
      const allResult = await service.findAgentSkills(CancellationToken.None);
      assert.ok(allResult, "Should return results when agent skills are enabled");
      const result = allResult;
      assert.strictEqual(result.length, 5, "Should find 5 skills total");
      const projectSkills = result.filter((skill) => skill.storage === PromptsStorage.local);
      assert.strictEqual(projectSkills.length, 3, "Should find 3 project skills");
      const githubSkill1 = projectSkills.find((skill) => skill.name === "GitHub Skill 1");
      assert.ok(githubSkill1, "Should find GitHub skill 1");
      assert.strictEqual(githubSkill1.description, "A GitHub skill for testing");
      assert.strictEqual(githubSkill1.uri.path, `${rootFolder}/.github/skills/GitHub Skill 1/SKILL.md`);
      const claudeSkill1 = projectSkills.find((skill) => skill.name === "Claude Skill 1");
      assert.ok(claudeSkill1, "Should find Claude skill 1");
      assert.strictEqual(claudeSkill1.description, "A Claude skill for testing");
      assert.strictEqual(claudeSkill1.uri.path, `${rootFolder}/.claude/skills/Claude Skill 1/SKILL.md`);
      const invalidSkill = projectSkills.find((skill) => skill.name === "invalid-skill");
      assert.ok(invalidSkill, "Should find invalid-skill using folder name as fallback");
      assert.strictEqual(invalidSkill.description, "Invalid skill, no name");
      assert.strictEqual(invalidSkill.uri.path, `${rootFolder}/.claude/skills/invalid-skill/SKILL.md`);
      const personalSkills = result.filter((skill) => skill.storage === PromptsStorage.user);
      assert.strictEqual(personalSkills.length, 2, "Should find 2 personal skills");
      const personalSkill1 = personalSkills.find((skill) => skill.name === "Personal Skill 1");
      assert.ok(personalSkill1, "Should find Personal Skill 1");
      assert.strictEqual(personalSkill1.description, "A personal skill for testing");
      assert.strictEqual(personalSkill1.uri.path, "/home/user/.claude/skills/Personal Skill 1/SKILL.md");
      const copilotSkill1 = personalSkills.find((skill) => skill.name === "Copilot Skill 1");
      assert.ok(copilotSkill1, "Should find Copilot Skill 1");
      assert.strictEqual(copilotSkill1.description, "A Copilot skill for testing");
      assert.strictEqual(copilotSkill1.uri.path, "/home/user/.copilot/skills/Copilot Skill 1/SKILL.md");
    });
    test("should handle parsing errors gracefully", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "skills-error-test";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/skills/Valid Skill/SKILL.md`,
          contents: [
            "---",
            'name: "Valid Skill"',
            'description: "A valid skill"',
            "---",
            "Valid skill content"
          ]
        },
        {
          path: `${rootFolder}/.claude/skills/invalid-skill/SKILL.md`,
          contents: [
            "---",
            "invalid yaml: [unclosed",
            "---",
            "Invalid skill content"
          ]
        }
      ]);
      const allResult = await service.findAgentSkills(CancellationToken.None);
      assert.ok(allResult, "Should return results even with parsing errors");
      const result = allResult;
      assert.strictEqual(result.length, 2, "Should find 2 skills");
      const validSkill = result.find((s) => s.name === "Valid Skill");
      assert.ok(validSkill, "Should find the valid skill");
      assert.strictEqual(validSkill.storage, PromptsStorage.local);
      const invalidSkill = result.find((s) => s.name === "invalid-skill");
      assert.ok(invalidSkill, "Should find skill with folder name as fallback despite malformed YAML");
      assert.strictEqual(invalidSkill.storage, PromptsStorage.local);
    });
    test("should return empty array when no skills found", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      const rootFolderName = "empty-workspace";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, []);
      const allResult = await service.findAgentSkills(CancellationToken.None);
      assert.ok(allResult, "Should return results array");
      const result = allResult;
      assert.strictEqual(result.length, 0, "Should find no skills");
    });
    test("should truncate long names and descriptions", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "truncation-test";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      const longName = "A".repeat(100);
      const truncatedName = "A".repeat(64);
      const longDescription = "B".repeat(1500);
      await mockFiles(fileService, [
        {
          // Folder name must match the truncated skill name
          path: `${rootFolder}/.github/skills/${truncatedName}/SKILL.md`,
          contents: [
            "---",
            `name: "${longName}"`,
            `description: "${longDescription}"`,
            "---",
            "Skill content"
          ]
        }
      ]);
      const allResult = await service.findAgentSkills(CancellationToken.None);
      assert.ok(allResult, "Should return results");
      const result = allResult;
      assert.strictEqual(result.length, 1, "Should find 1 skill");
      assert.strictEqual(result[0].name.length, 64, "Name should be truncated to 64 characters");
      assert.strictEqual(result[0].description?.length, 1024, "Description should be truncated to 1024 characters");
    });
    test("should remove XML tags from name and description", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "xml-test";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/skills/Skill with XML tags/SKILL.md`,
          contents: [
            "---",
            'name: "Skill <b>with</b> <em>XML</em> tags"',
            'description: "Description with <strong>HTML</strong> and <span>other</span> tags"',
            "---",
            "Skill content"
          ]
        }
      ]);
      const allResult = await service.findAgentSkills(CancellationToken.None);
      assert.ok(allResult, "Should return results");
      const result = allResult;
      assert.strictEqual(result.length, 1, "Should find 1 skill");
      assert.strictEqual(result[0].name, "Skill with XML tags", "XML tags should be removed from name");
      assert.strictEqual(result[0].description, "Description with HTML and other tags", "XML tags should be removed from description");
    });
    test("should handle both truncation and XML removal", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "combined-test";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      const longNameWithXml = "<p>" + "A".repeat(100) + "</p>";
      const truncatedName = "A".repeat(64);
      const longDescWithXml = "<div>" + "B".repeat(1500) + "</div>";
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/skills/${truncatedName}/SKILL.md`,
          contents: [
            "---",
            `name: "${longNameWithXml}"`,
            `description: "${longDescWithXml}"`,
            "---",
            "Skill content"
          ]
        }
      ]);
      const allResult = await service.findAgentSkills(CancellationToken.None);
      assert.ok(allResult, "Should return results");
      const result = allResult;
      assert.strictEqual(result.length, 1, "Should find 1 skill");
      assert.ok(!result[0].name.includes("<"), "Name should not contain XML tags");
      assert.ok(!result[0].name.includes(">"), "Name should not contain XML tags");
      assert.strictEqual(result[0].name.length, 64, "Name should be truncated to 64 characters");
      assert.ok(!result[0].description?.includes("<"), "Description should not contain XML tags");
      assert.ok(!result[0].description?.includes(">"), "Description should not contain XML tags");
      assert.strictEqual(result[0].description?.length, 1024, "Description should be truncated to 1024 characters");
    });
    test("should skip duplicate skill names and keep first by priority", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "duplicate-skills-test";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/skills/Duplicate Skill/SKILL.md`,
          contents: [
            "---",
            'name: "Duplicate Skill"',
            'description: "Workspace version"',
            "---",
            "Workspace skill content"
          ]
        },
        {
          path: "/home/user/.copilot/skills/Duplicate Skill/SKILL.md",
          contents: [
            "---",
            'name: "Duplicate Skill"',
            'description: "User version - should be skipped"',
            "---",
            "User skill content"
          ]
        },
        {
          path: `${rootFolder}/.claude/skills/Unique Skill/SKILL.md`,
          contents: [
            "---",
            'name: "Unique Skill"',
            'description: "A unique skill"',
            "---",
            "Unique skill content"
          ]
        }
      ]);
      const allResult = await service.findAgentSkills(CancellationToken.None);
      assert.ok(allResult, "Should return results");
      const result = allResult;
      assert.strictEqual(result.length, 2, "Should find 2 skills (duplicate skipped)");
      const duplicateSkill = result.find((s) => s.name === "Duplicate Skill");
      assert.ok(duplicateSkill, "Should find the duplicate skill");
      assert.strictEqual(duplicateSkill.description, "Workspace version", "Should keep workspace version (higher priority)");
      assert.strictEqual(duplicateSkill.storage, PromptsStorage.local, "Should be from workspace");
      const uniqueSkill = result.find((s) => s.name === "Unique Skill");
      assert.ok(uniqueSkill, "Should find the unique skill");
    });
    test("should prioritize skills by source: workspace > user > extension", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "priority-test";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: "/home/user/.copilot/skills/Priority Skill/SKILL.md",
          contents: [
            "---",
            'name: "Priority Skill"',
            'description: "User version"',
            "---",
            "User skill content"
          ]
        },
        {
          path: `${rootFolder}/.github/skills/Priority Skill/SKILL.md`,
          contents: [
            "---",
            'name: "Priority Skill"',
            'description: "Workspace version - highest priority"',
            "---",
            "Workspace skill content"
          ]
        }
      ]);
      const allResult = await service.findAgentSkills(CancellationToken.None);
      assert.ok(allResult, "Should return results");
      const result = allResult;
      assert.strictEqual(result.length, 1, "Should find 1 skill (duplicates resolved by priority)");
      assert.strictEqual(result[0].description, "Workspace version - highest priority", "Workspace should win over user");
      assert.strictEqual(result[0].storage, PromptsStorage.local);
    });
    test("should include skills where name does not match folder name using folder name as fallback", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "name-mismatch-test";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          // Folder name "wrong-folder-name" doesn't match skill name "Correct Skill Name"
          path: `${rootFolder}/.github/skills/wrong-folder-name/SKILL.md`,
          contents: [
            "---",
            'name: "Correct Skill Name"',
            'description: "This skill should use folder name as fallback"',
            "---",
            "Skill content"
          ]
        },
        {
          // Folder name matches skill name
          path: `${rootFolder}/.github/skills/Valid Skill/SKILL.md`,
          contents: [
            "---",
            'name: "Valid Skill"',
            'description: "This skill should be found"',
            "---",
            "Valid skill content"
          ]
        }
      ]);
      const allResult = await service.findAgentSkills(CancellationToken.None);
      assert.ok(allResult, "Should return results");
      const result = allResult;
      assert.strictEqual(result.length, 2, "Should find both skills");
      const mismatchedSkill = result.find((s) => s.name === "wrong-folder-name");
      assert.ok(mismatchedSkill, "Should find skill with folder name as fallback");
      assert.strictEqual(mismatchedSkill.description, "This skill should use folder name as fallback");
      const validSkill = result.find((s) => s.name === "Valid Skill");
      assert.ok(validSkill, "Should find the valid skill");
    });
    test("should include skills with missing name attribute using folder name as fallback", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "missing-name-test";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/skills/no-name-skill/SKILL.md`,
          contents: [
            "---",
            'description: "This skill has no name attribute"',
            "---",
            "Skill content without name"
          ]
        },
        {
          path: `${rootFolder}/.github/skills/Valid Named Skill/SKILL.md`,
          contents: [
            "---",
            'name: "Valid Named Skill"',
            'description: "This skill has a name"',
            "---",
            "Valid skill content"
          ]
        }
      ]);
      const allResult = await service.findAgentSkills(CancellationToken.None);
      assert.ok(allResult, "Should return results");
      const result = allResult;
      assert.strictEqual(result.length, 2, "Should find both skills");
      const noNameSkill = result.find((s) => s.name === "no-name-skill");
      assert.ok(noNameSkill, "Should find skill with folder name as fallback");
      assert.strictEqual(noNameSkill.description, "This skill has no name attribute");
      const validSkill = result.find((s) => s.name === "Valid Named Skill");
      assert.ok(validSkill, "Should find skill with name attribute");
    });
    test("should include extension-provided skills in findAgentSkills", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "extension-skills-test";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      const extensionSkillUri = URI.parse("file://extensions/my-extension/Extension Skill/SKILL.md");
      const extension = {
        identifier: { value: "test.my-extension" },
        enabledApiProposals: ["chatParticipantPrivate"]
      };
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/skills/Workspace Skill/SKILL.md`,
          contents: [
            "---",
            'name: "Workspace Skill"',
            'description: "A workspace skill"',
            "---",
            "Workspace skill content"
          ]
        },
        {
          path: extensionSkillUri.path,
          contents: [
            "---",
            'name: "Extension Skill"',
            'description: "A skill from extension provider"',
            "---",
            "Extension skill content"
          ]
        }
      ]);
      const provider = {
        providePromptFiles: async (_context, _token) => {
          return [{ uri: extensionSkillUri }];
        }
      };
      const registered = service.registerPromptFileProvider(extension, PromptsType.skill, provider);
      const allResult = await service.findAgentSkills(CancellationToken.None);
      assert.ok(allResult, "Should return results");
      const result = allResult;
      assert.strictEqual(result.length, 2, "Should find 2 skills (workspace + extension)");
      const workspaceSkill = result.find((s) => s.name === "Workspace Skill");
      assert.ok(workspaceSkill, "Should find workspace skill");
      assert.strictEqual(workspaceSkill.storage, PromptsStorage.local);
      const extensionSkill = result.find((s) => s.name === "Extension Skill");
      assert.ok(extensionSkill, "Should find extension skill");
      assert.strictEqual(extensionSkill.storage, PromptsStorage.extension);
      registered.dispose();
    });
    test("should include contributed skill files in findAgentSkills", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "contributed-skills-test";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      const contributedSkillUri = URI.parse("file://extensions/my-extension/Contributed Skill/SKILL.md");
      const extension = {
        identifier: { value: "test.my-extension" }
      };
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/skills/Local Skill/SKILL.md`,
          contents: [
            "---",
            'name: "Local Skill"',
            'description: "A local skill"',
            "---",
            "Local skill content"
          ]
        },
        {
          path: contributedSkillUri.path,
          contents: [
            "---",
            'name: "Contributed Skill"',
            'description: "A contributed skill from extension"',
            "---",
            "Contributed skill content"
          ]
        }
      ]);
      const registered = service.registerContributedFile(
        PromptsType.skill,
        contributedSkillUri,
        extension,
        "Contributed Skill",
        "A contributed skill from extension"
      );
      const allResult = await service.findAgentSkills(CancellationToken.None);
      assert.ok(allResult, "Should return results");
      const result = allResult;
      assert.strictEqual(result.length, 2, "Should find 2 skills (local + contributed)");
      const localSkill = result.find((s) => s.name === "Local Skill");
      assert.ok(localSkill, "Should find local skill");
      assert.strictEqual(localSkill.storage, PromptsStorage.local);
      const contributedSkill = result.find((s) => s.name === "Contributed Skill");
      assert.ok(contributedSkill, "Should find contributed skill");
      assert.strictEqual(contributedSkill.storage, PromptsStorage.extension);
      registered.dispose();
      const resultAfterDispose = await service.findAgentSkills(CancellationToken.None);
      assert.strictEqual(resultAfterDispose?.length, 1, "Should find 1 skill after disposal");
      assert.strictEqual(resultAfterDispose?.[0].name, "Local Skill");
    });
    test("should use folder name for contributed skill with missing name", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "contributed-no-name-test";
      const rootFolder = `/${rootFolderName}`;
      workspaceContextService.setWorkspace(testWorkspace(URI.file(rootFolder)));
      const contributedSkillUri = URI.parse("file://extensions/my-extension/my-skill/SKILL.md");
      const extension = { identifier: { value: "test.my-extension" } };
      await mockFiles(fileService, [
        {
          path: contributedSkillUri.path,
          contents: [
            "---",
            'description: "A skill without a name"',
            "---",
            "Skill content"
          ]
        }
      ]);
      const registered = service.registerContributedFile(PromptsType.skill, contributedSkillUri, extension, void 0, void 0);
      const result = await service.findAgentSkills(CancellationToken.None);
      assert.ok(result, "Should return results");
      const skill = result.find((s) => s.name === "my-skill");
      assert.ok(skill, "Should find skill using folder name as fallback");
      assert.strictEqual(skill.description, "A skill without a name");
      registered.dispose();
    });
    test("should accept contributed skill with missing description", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "contributed-no-desc-test";
      const rootFolder = `/${rootFolderName}`;
      workspaceContextService.setWorkspace(testWorkspace(URI.file(rootFolder)));
      const contributedSkillUri = URI.parse("file://extensions/my-extension/no-desc-skill/SKILL.md");
      const extension = { identifier: { value: "test.my-extension" } };
      await mockFiles(fileService, [
        {
          path: contributedSkillUri.path,
          contents: [
            "---",
            'name: "no-desc-skill"',
            "---",
            "Skill content without description"
          ]
        }
      ]);
      const registered = service.registerContributedFile(PromptsType.skill, contributedSkillUri, extension, void 0, void 0);
      const result = await service.findAgentSkills(CancellationToken.None);
      assert.ok(result, "Should return results");
      const skill = result.find((s) => s.name === "no-desc-skill");
      assert.ok(skill, "Should find skill even without description");
      assert.strictEqual(skill.description, void 0);
      registered.dispose();
    });
    test("should override contributed skill name with folder name on mismatch", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "contributed-mismatch-test";
      const rootFolder = `/${rootFolderName}`;
      workspaceContextService.setWorkspace(testWorkspace(URI.file(rootFolder)));
      const contributedSkillUri = URI.parse("file://extensions/my-extension/actual-folder/SKILL.md");
      const extension = { identifier: { value: "test.my-extension" } };
      await mockFiles(fileService, [
        {
          path: contributedSkillUri.path,
          contents: [
            "---",
            'name: "wrong-name"',
            'description: "A skill with mismatched name"',
            "---",
            "Skill content"
          ]
        }
      ]);
      const registered = service.registerContributedFile(PromptsType.skill, contributedSkillUri, extension, void 0, void 0);
      const result = await service.findAgentSkills(CancellationToken.None);
      assert.ok(result, "Should return results");
      const skill = result.find((s) => s.name === "actual-folder");
      assert.ok(skill, "Should find skill using folder name instead of mismatched name");
      assert.strictEqual(skill.description, "A skill with mismatched name");
      registered.dispose();
    });
  });
  suite("getPromptSlashCommands - skills", () => {
    teardown(() => {
      sinon.restore();
    });
    test("should include skills from workspace as slash commands", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "slash-commands-workspace-skills";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/skills/workspace-skill/SKILL.md`,
          contents: [
            "---",
            'name: "workspace-skill"',
            'description: "A workspace skill that should appear as slash command"',
            "---",
            "Workspace skill content"
          ]
        },
        {
          path: `${rootFolder}/.claude/skills/another-skill/SKILL.md`,
          contents: [
            "---",
            'name: "another-skill"',
            'description: "Another skill from workspace"',
            "---",
            "Another skill content"
          ]
        }
      ]);
      const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
      const workspaceSkillCommand = slashCommands.find((cmd) => cmd.name === "workspace-skill");
      assert.ok(workspaceSkillCommand, "Should find workspace skill as slash command");
      assert.strictEqual(workspaceSkillCommand.description, "A workspace skill that should appear as slash command");
      assert.strictEqual(workspaceSkillCommand.storage, PromptsStorage.local);
      assert.strictEqual(workspaceSkillCommand.type, PromptsType.skill);
      const anotherSkillCommand = slashCommands.find((cmd) => cmd.name === "another-skill");
      assert.ok(anotherSkillCommand, "Should find another skill as slash command");
      assert.strictEqual(anotherSkillCommand.description, "Another skill from workspace");
      assert.strictEqual(anotherSkillCommand.storage, PromptsStorage.local);
    });
    test("should deduplicate skills with the same name from symlinked locations", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "slash-commands-symlinked-skills";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: "/home/user/.agents/skills/deploy/SKILL.md",
          contents: [
            "---",
            'name: "deploy"',
            'description: "Deploy skill"',
            "---",
            "Deploy skill content"
          ]
        },
        {
          path: "/home/user/.claude/skills/deploy/SKILL.md",
          contents: [
            "---",
            'name: "deploy"',
            'description: "Deploy skill"',
            "---",
            "Deploy skill content"
          ]
        }
      ]);
      const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
      const deployCommands = slashCommands.filter((cmd) => cmd.name === "deploy");
      assert.strictEqual(deployCommands.length, 1, "Duplicated skill should appear only once as a slash command");
    });
    test("should include skills from user storage as slash commands", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "slash-commands-user-skills";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: "/home/user/.copilot/skills/personal-skill/SKILL.md",
          contents: [
            "---",
            'name: "personal-skill"',
            'description: "A personal skill from user storage"',
            "---",
            "Personal skill content"
          ]
        },
        {
          path: "/home/user/.claude/skills/claude-personal/SKILL.md",
          contents: [
            "---",
            'name: "claude-personal"',
            'description: "A Claude personal skill"',
            "---",
            "Claude personal skill content"
          ]
        }
      ]);
      const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
      const personalSkillCommand = slashCommands.find((cmd) => cmd.name === "personal-skill");
      assert.ok(personalSkillCommand, "Should find personal skill as slash command");
      assert.strictEqual(personalSkillCommand.description, "A personal skill from user storage");
      assert.strictEqual(personalSkillCommand.storage, PromptsStorage.user);
      assert.strictEqual(personalSkillCommand.type, PromptsType.skill);
      const claudePersonalCommand = slashCommands.find((cmd) => cmd.name === "claude-personal");
      assert.ok(claudePersonalCommand, "Should find Claude personal skill as slash command");
      assert.strictEqual(claudePersonalCommand.description, "A Claude personal skill");
      assert.strictEqual(claudePersonalCommand.storage, PromptsStorage.user);
    });
    test("should include skills from extension providers as slash commands", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "slash-commands-provider-skills";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      const providerSkillUri = URI.parse("file://extensions/my-extension/provider-skill/SKILL.md");
      const extension = {
        identifier: { value: "test.my-extension" },
        enabledApiProposals: ["chatParticipantPrivate"]
      };
      await mockFiles(fileService, [
        {
          path: providerSkillUri.path,
          contents: [
            "---",
            'name: "provider-skill"',
            'description: "A skill from extension provider"',
            "---",
            "Provider skill content"
          ]
        }
      ]);
      const provider = {
        providePromptFiles: async (_context, _token) => {
          return [{ uri: providerSkillUri }];
        }
      };
      const registered = service.registerPromptFileProvider(extension, PromptsType.skill, provider);
      const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
      const providerSkillCommand = slashCommands.find((cmd) => cmd.name === "provider-skill");
      assert.ok(providerSkillCommand, "Should find provider skill as slash command");
      assert.strictEqual(providerSkillCommand.description, "A skill from extension provider");
      assert.strictEqual(providerSkillCommand.storage, PromptsStorage.extension);
      assert.strictEqual(providerSkillCommand.type, PromptsType.skill);
      assert.strictEqual(providerSkillCommand.source, PromptFileSource.ExtensionAPI);
      registered.dispose();
      const slashCommandsAfterDispose = await service.getPromptSlashCommands(CancellationToken.None);
      const foundAfterDispose = slashCommandsAfterDispose.find((cmd) => cmd.name === "provider-skill");
      assert.strictEqual(foundAfterDispose, void 0, "Should not find provider skill after disposal");
    });
    test("should include skills from extension contributions as slash commands", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "slash-commands-contributed-skills";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      const contributedSkillUri = URI.parse("file://extensions/my-extension/contributed-skill/SKILL.md");
      const extension = {
        identifier: { value: "test.my-extension" }
      };
      await mockFiles(fileService, [
        {
          path: contributedSkillUri.path,
          contents: [
            "---",
            'name: "contributed-skill"',
            'description: "A skill from extension contribution"',
            "---",
            "Contributed skill content"
          ]
        }
      ]);
      const registered = service.registerContributedFile(
        PromptsType.skill,
        contributedSkillUri,
        extension,
        "contributed-skill",
        "A skill from extension contribution"
      );
      const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
      const contributedSkillCommand = slashCommands.find((cmd) => cmd.name === "contributed-skill");
      assert.ok(contributedSkillCommand, "Should find contributed skill as slash command");
      assert.strictEqual(contributedSkillCommand.description, "A skill from extension contribution");
      assert.strictEqual(contributedSkillCommand.storage, PromptsStorage.extension);
      assert.strictEqual(contributedSkillCommand.type, PromptsType.skill);
      assert.strictEqual(contributedSkillCommand.source, PromptFileSource.ExtensionContribution);
      registered.dispose();
      const slashCommandsAfterDispose = await service.getPromptSlashCommands(CancellationToken.None);
      const foundAfterDispose = slashCommandsAfterDispose.find((cmd) => cmd.name === "contributed-skill");
      assert.strictEqual(foundAfterDispose, void 0, "Should not find contributed skill after disposal");
    });
    test("should combine prompt files and skills as slash commands", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "slash-commands-combined";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/prompts/my-prompt.prompt.md`,
          contents: [
            "---",
            'name: "my-prompt"',
            'description: "A regular prompt file"',
            "---",
            "Prompt content"
          ]
        },
        {
          path: `${rootFolder}/.github/skills/my-skill/SKILL.md`,
          contents: [
            "---",
            'name: "my-skill"',
            'description: "A skill file"',
            "---",
            "Skill content"
          ]
        }
      ]);
      const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
      const promptCommand = slashCommands.find((cmd) => cmd.name === "my-prompt");
      assert.ok(promptCommand, "Should find prompt file as slash command");
      assert.strictEqual(promptCommand.type, PromptsType.prompt);
      const skillCommand = slashCommands.find((cmd) => cmd.name === "my-skill");
      assert.ok(skillCommand, "Should find skill file as slash command");
      assert.strictEqual(skillCommand.type, PromptsType.skill);
    });
    test("should fire change event when provider registers/unregisters", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "slash-commands-cache-invalidation";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      const providerSkillUri = URI.parse("file://extensions/my-extension/test-skill/SKILL.md");
      const extension = {
        identifier: { value: "test.my-extension" },
        enabledApiProposals: ["chatParticipantPrivate"]
      };
      await mockFiles(fileService, [
        {
          path: providerSkillUri.path,
          contents: [
            "---",
            'name: "test-skill"',
            'description: "Test skill"',
            "---",
            "Test skill content"
          ]
        }
      ]);
      let changeEventCount = 0;
      const disposable = service.onDidChangeSlashCommands(() => {
        changeEventCount++;
      });
      const provider = {
        providePromptFiles: async (_context, _token) => {
          return [{ uri: providerSkillUri }];
        }
      };
      const registered = service.registerPromptFileProvider(extension, PromptsType.skill, provider);
      await new Promise((resolve) => setTimeout(resolve, 100));
      const commandsWithProvider = await service.getPromptSlashCommands(CancellationToken.None);
      const skillCommand = commandsWithProvider.find((cmd) => cmd.name === "test-skill");
      assert.ok(skillCommand, "Should find skill from provider");
      registered.dispose();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const commandsAfterDispose = await service.getPromptSlashCommands(CancellationToken.None);
      const skillAfterDispose = commandsAfterDispose.find((cmd) => cmd.name === "test-skill");
      assert.strictEqual(skillAfterDispose, void 0, "Should not find skill after provider disposal");
      assert.ok(changeEventCount >= 2, "Change event should fire when provider registers and unregisters");
      disposable.dispose();
    });
    test("should use filename as fallback for skills with missing name", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "slash-commands-fallback-name";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/skills/no-name/SKILL.md`,
          contents: [
            "---",
            'description: "Skill without name"',
            "---",
            "Skill content"
          ]
        },
        {
          path: `${rootFolder}/.github/skills/valid-skill/SKILL.md`,
          contents: [
            "---",
            'name: "valid-skill"',
            'description: "A valid skill"',
            "---",
            "Valid skill content"
          ]
        }
      ]);
      const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
      const fallbackNameCommand = slashCommands.find((cmd) => cmd.name === "no-name");
      assert.ok(fallbackNameCommand, "Should find skill with fallback name from folder name");
      assert.strictEqual(fallbackNameCommand.description, "Skill without name");
      const validSkillCommand = slashCommands.find((cmd) => cmd.name === "valid-skill");
      assert.ok(validSkillCommand, "Should find valid skill");
    });
    test("should use folder name as slash command name when frontmatter name differs", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "slash-commands-folder-name-override";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/skills/test/SKILL.md`,
          contents: [
            "---",
            'name: "foo"',
            'description: "A skill with mismatched frontmatter name"',
            "---",
            "say hiya!"
          ]
        }
      ]);
      const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
      const folderNameCommand = slashCommands.find((cmd) => cmd.name === "test");
      assert.ok(folderNameCommand, "Should find skill using folder name as slash command name");
      assert.strictEqual(folderNameCommand.description, "A skill with mismatched frontmatter name");
      const frontmatterNameCommand = slashCommands.find((cmd) => cmd.name === "foo");
      assert.strictEqual(frontmatterNameCommand, void 0, "Should not find skill using frontmatter name");
    });
    test("should not duplicate slash commands with same name from different types", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "slash-commands-no-duplicates";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/prompts/duplicate-name.prompt.md`,
          contents: [
            "---",
            'name: "duplicate-name"',
            'description: "A prompt file"',
            "---",
            "Prompt content"
          ]
        },
        {
          path: `${rootFolder}/.github/skills/duplicate-name/SKILL.md`,
          contents: [
            "---",
            'name: "duplicate-name"',
            'description: "A skill file"',
            "---",
            "Skill content"
          ]
        }
      ]);
      const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
      const duplicateCommands = slashCommands.filter((cmd) => cmd.name === "duplicate-name");
      assert.strictEqual(duplicateCommands.length, 2, "Should return both prompt and skill with same name");
      const promptCommand = duplicateCommands.find((cmd) => cmd.type === PromptsType.prompt);
      assert.ok(promptCommand, "Should find prompt command");
      const skillCommand = duplicateCommands.find((cmd) => cmd.type === PromptsType.skill);
      assert.ok(skillCommand, "Should find skill command");
    });
    test("should respect skill disable configuration (USE_AGENT_SKILLS)", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, false);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "slash-commands-skills-disabled";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/prompts/my-prompt.prompt.md`,
          contents: [
            "---",
            'name: "my-prompt"',
            'description: "A prompt"',
            "---",
            "Prompt content"
          ]
        },
        {
          path: `${rootFolder}/.github/skills/my-skill/SKILL.md`,
          contents: [
            "---",
            'name: "my-skill"',
            'description: "A skill"',
            "---",
            "Skill content"
          ]
        }
      ]);
      const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
      const promptCommand = slashCommands.find((cmd) => cmd.name === "my-prompt");
      assert.ok(promptCommand, "Should find prompt command even when skills are disabled");
      const skillCommand = slashCommands.find((cmd) => cmd.name === "my-skill");
      assert.strictEqual(skillCommand, void 0, "Should not find skill command when skills are disabled");
    });
  });
  suite("getPromptSlashCommands - userInvocable filtering", () => {
    teardown(() => {
      sinon.restore();
    });
    test("should return correct userInvocable value for skills with user-invocable: false", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "user-invocable-false";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/skills/hidden-skill/SKILL.md`,
          contents: [
            "---",
            'name: "hidden-skill"',
            'description: "A skill hidden from the / menu"',
            "user-invocable: false",
            "---",
            "Hidden skill content"
          ]
        }
      ]);
      const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
      const hiddenSkillCommand = slashCommands.find((cmd) => cmd.name === "hidden-skill");
      assert.ok(hiddenSkillCommand, "Should find hidden skill in slash commands");
      assert.strictEqual(
        hiddenSkillCommand.userInvocable,
        false,
        "Should have userInvocable=false in parsed header"
      );
      const filteredCommands = slashCommands.filter((c) => c.userInvocable);
      const hiddenSkillInFiltered = filteredCommands.find((cmd) => cmd.name === "hidden-skill");
      assert.strictEqual(
        hiddenSkillInFiltered,
        void 0,
        "Hidden skill should be filtered out when applying userInvocable filter"
      );
    });
    test("should return correct userInvocable value for skills with user-invocable: true", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "user-invocable-true";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/skills/visible-skill/SKILL.md`,
          contents: [
            "---",
            'name: "visible-skill"',
            'description: "A skill visible in the / menu"',
            "user-invocable: true",
            "---",
            "Visible skill content"
          ]
        }
      ]);
      const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
      const visibleSkillCommand = slashCommands.find((cmd) => cmd.name === "visible-skill");
      assert.ok(visibleSkillCommand, "Should find visible skill in slash commands");
      assert.strictEqual(
        visibleSkillCommand.userInvocable,
        true,
        "Should have userInvocable=true in parsed header"
      );
      const filteredCommands = slashCommands.filter((c) => c.userInvocable);
      const visibleSkillInFiltered = filteredCommands.find((cmd) => cmd.name === "visible-skill");
      assert.ok(
        visibleSkillInFiltered,
        "Visible skill should be included when applying userInvocable filter"
      );
    });
    test("should default to true for skills without user-invocable attribute", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "user-invocable-undefined";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/skills/default-skill/SKILL.md`,
          contents: [
            "---",
            'name: "default-skill"',
            'description: "A skill without explicit user-invocable"',
            "---",
            "Default skill content"
          ]
        }
      ]);
      const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
      const defaultSkillCommand = slashCommands.find((cmd) => cmd.name === "default-skill");
      assert.ok(defaultSkillCommand, "Should find default skill in slash commands");
      assert.strictEqual(defaultSkillCommand.userInvocable, true, "Should have userInvocable=true when attribute is not specified");
      const filteredCommands = slashCommands.filter((c) => c.userInvocable);
      const defaultSkillInFiltered = filteredCommands.find((cmd) => cmd.name === "default-skill");
      assert.ok(
        defaultSkillInFiltered,
        "Skill without user-invocable attribute should be included when applying userInvocable filter"
      );
    });
    test("should handle prompts with user-invocable: false", async () => {
      const rootFolderName = "prompt-user-invocable-false";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/prompts/hidden-prompt.prompt.md`,
          contents: [
            "---",
            'name: "hidden-prompt"',
            'description: "A prompt hidden from the / menu"',
            "user-invocable: false",
            "---",
            "Hidden prompt content"
          ]
        }
      ]);
      const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
      const hiddenPromptCommand = slashCommands.find((cmd) => cmd.name === "hidden-prompt");
      assert.ok(hiddenPromptCommand, "Should find hidden prompt in slash commands");
      assert.strictEqual(
        hiddenPromptCommand.userInvocable,
        false,
        "Should have userInvocable=false in parsed header"
      );
      const filteredCommands = slashCommands.filter((c) => c.userInvocable);
      const hiddenPromptInFiltered = filteredCommands.find((cmd) => cmd.name === "hidden-prompt");
      assert.strictEqual(
        hiddenPromptInFiltered,
        void 0,
        "Hidden prompt should be filtered out when applying userInvocable filter"
      );
    });
    test("should correctly filter mixed user-invocable values", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "mixed-user-invocable";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/prompts/visible-prompt.prompt.md`,
          contents: [
            "---",
            'name: "visible-prompt"',
            'description: "A visible prompt"',
            "---",
            "Visible prompt content"
          ]
        },
        {
          path: `${rootFolder}/.github/prompts/hidden-prompt.prompt.md`,
          contents: [
            "---",
            'name: "hidden-prompt"',
            'description: "A hidden prompt"',
            "user-invocable: false",
            "---",
            "Hidden prompt content"
          ]
        },
        {
          path: `${rootFolder}/.github/skills/visible-skill/SKILL.md`,
          contents: [
            "---",
            'name: "visible-skill"',
            'description: "A visible skill"',
            "user-invocable: true",
            "---",
            "Visible skill content"
          ]
        },
        {
          path: `${rootFolder}/.github/skills/hidden-skill/SKILL.md`,
          contents: [
            "---",
            'name: "hidden-skill"',
            'description: "A hidden skill"',
            "user-invocable: false",
            "---",
            "Hidden skill content"
          ]
        }
      ]);
      const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
      assert.strictEqual(slashCommands.length, 4, "Should find all 4 commands");
      const filteredCommands = slashCommands.filter((c) => c.userInvocable);
      assert.strictEqual(filteredCommands.length, 2, "Should have 2 commands after filtering");
      assert.ok(filteredCommands.find((c) => c.name === "visible-prompt"), "visible-prompt should be included");
      assert.ok(filteredCommands.find((c) => c.name === "visible-skill"), "visible-skill should be included");
      assert.strictEqual(filteredCommands.find((c) => c.name === "hidden-prompt"), void 0, "hidden-prompt should be excluded");
      assert.strictEqual(filteredCommands.find((c) => c.name === "hidden-skill"), void 0, "hidden-skill should be excluded");
    });
    test("should handle skills with missing header gracefully", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const rootFolderName = "missing-header";
      const rootFolder = `/${rootFolderName}`;
      const rootFolderUri = URI.file(rootFolder);
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [
        {
          path: `${rootFolder}/.github/skills/no-header-skill/SKILL.md`,
          contents: [
            "This skill has no YAML header at all.",
            "Just plain markdown content."
          ]
        }
      ]);
      const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
      const noHeaderSkill = slashCommands.find((cmd) => cmd.uri.path.includes("no-header-skill"));
      assert.ok(noHeaderSkill, "Should find skill without header in slash commands");
      const filteredCommands = slashCommands.filter((c) => c.userInvocable);
      const noHeaderSkillInFiltered = filteredCommands.find((cmd) => cmd.uri.path.includes("no-header-skill"));
      assert.ok(
        noHeaderSkillInFiltered,
        "Skill without header should be included when applying userInvocable filter (defaults to true)"
      );
    });
    test("plugin skills include plugin name prefix in slash command name", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const skillUri = URI.file("/plugins/my-plugin/skills/deploy/SKILL.md");
      await mockFiles(fileService, [
        {
          path: skillUri.path,
          contents: [
            "---",
            'description: "Deploy skill from plugin"',
            "---",
            "Deploy skill content"
          ]
        }
      ]);
      const enablement = observableValue(
        "testPluginEnablement",
        2
        /* ContributionEnablementState.EnabledProfile */
      );
      const plugin = {
        uri: URI.file("/plugins/my-plugin"),
        format: PluginFormat.Copilot,
        label: "my-plugin",
        enablement,
        remove: () => {
        },
        hooks: observableValue("testPluginHooks", []),
        commands: observableValue("testPluginCommands", []),
        skills: observableValue("testPluginSkills", [{ uri: skillUri, name: "deploy" }]),
        agents: observableValue("testPluginAgents", []),
        instructions: observableValue("testPluginInstructions", []),
        mcpServerDefinitions: observableValue("testPluginMcpServerDefinitions", [])
      };
      testPluginsObservable.set([plugin], void 0);
      const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
      const skillCommand = slashCommands.find((cmd) => cmd.name === "my-plugin:deploy");
      assert.ok(skillCommand, "Plugin skill should have plugin prefix in slash command name");
      assert.strictEqual(skillCommand.storage, PromptsStorage.plugin);
      assert.strictEqual(skillCommand.type, PromptsType.skill);
      testPluginsObservable.set([], void 0);
    });
    test("plugin skill frontmatter name is qualified with plugin prefix", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const skillUri = URI.file("/plugins/devtools/skills/ci/SKILL.md");
      await mockFiles(fileService, [
        {
          path: skillUri.path,
          contents: [
            "---",
            'name: "run-ci"',
            'description: "Run CI pipeline"',
            "---",
            "CI skill content"
          ]
        }
      ]);
      const enablement = observableValue(
        "testPluginEnablement",
        2
        /* ContributionEnablementState.EnabledProfile */
      );
      const plugin = {
        uri: URI.file("/plugins/devtools"),
        format: PluginFormat.Copilot,
        label: "devtools",
        enablement,
        remove: () => {
        },
        hooks: observableValue("testPluginHooks", []),
        commands: observableValue("testPluginCommands", []),
        skills: observableValue("testPluginSkills", [{ uri: skillUri, name: "ci" }]),
        agents: observableValue("testPluginAgents", []),
        instructions: observableValue("testPluginInstructions", []),
        mcpServerDefinitions: observableValue("testPluginMcpServerDefinitions", [])
      };
      testPluginsObservable.set([plugin], void 0);
      const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
      const skillCommand = slashCommands.find((cmd) => cmd.name === "devtools:ci");
      assert.ok(skillCommand, "Plugin skill folder name should be qualified with plugin prefix");
      assert.strictEqual(skillCommand.description, "Run CI pipeline");
      assert.strictEqual(
        slashCommands.find((cmd) => cmd.name === "devtools:run-ci"),
        void 0,
        "Frontmatter skill name should not appear as slash command"
      );
      assert.strictEqual(
        slashCommands.find((cmd) => cmd.name === "run-ci"),
        void 0,
        "Unprefixed skill name should not appear as slash command"
      );
      testPluginsObservable.set([], void 0);
    });
    test("plugin skill slash command prefix uses plugin label when install path is a pinned SHA", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
      const pluginUri = URI.file("/cache/agentPlugins/github/datadog/sha_b003fcad48c3a935ffe04b6218f5cf58fe2b6760");
      const skillUri = URI.joinPath(pluginUri, "skills", "ddsetup", "SKILL.md");
      await mockFiles(fileService, [
        {
          path: skillUri.path,
          contents: [
            "---",
            'name: "ddsetup"',
            'description: "Set up Datadog"',
            "---",
            "Datadog setup skill content"
          ]
        }
      ]);
      const enablement = observableValue(
        "testPluginEnablement",
        2
        /* ContributionEnablementState.EnabledProfile */
      );
      const plugin = {
        uri: pluginUri,
        format: PluginFormat.Copilot,
        label: "datadog",
        enablement,
        remove: () => {
        },
        hooks: observableValue("testPluginHooks", []),
        commands: observableValue("testPluginCommands", []),
        skills: observableValue("testPluginSkills", [{ uri: skillUri, name: "ddsetup" }]),
        agents: observableValue("testPluginAgents", []),
        instructions: observableValue("testPluginInstructions", []),
        mcpServerDefinitions: observableValue("testPluginMcpServerDefinitions", [])
      };
      testPluginsObservable.set([plugin], void 0);
      const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
      assert.deepStrictEqual(slashCommands.filter((command) => command.uri.toString() === skillUri.toString()).map((command) => ({ name: command.name, description: command.description, type: command.type, storage: command.storage })), [{
        name: "datadog:ddsetup",
        description: "Set up Datadog",
        type: PromptsType.skill,
        storage: PromptsStorage.plugin
      }]);
      testPluginsObservable.set([], void 0);
    });
  });
  suite("customization lockdown", () => {
    test("policy changes invalidate cached standalone agent locations", async () => {
      const rootFolderUri = URI.file("/dynamic-agent-lockdown");
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [{
        path: "/dynamic-agent-lockdown/.github/agents/reviewer.agent.md",
        contents: ["---", 'description: "Review code"', "---"]
      }]);
      assert.strictEqual((await service.getCustomAgents(CancellationToken.None)).length, 1);
      testConfigService.setUserConfiguration(COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG, true);
      fireConfigChange(testConfigService, COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG);
      assert.deepStrictEqual(await service.getCustomAgents(CancellationToken.None), []);
    });
    test("plugin-only lockdown filters workspace agents without affecting prompts", async () => {
      const rootFolderUri = URI.file("/lockdown-agents");
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      testConfigService.setUserConfiguration(COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG, true);
      await mockFiles(fileService, [
        {
          path: "/lockdown-agents/.github/agents/reviewer.agent.md",
          contents: ["---", 'description: "Review code"', "---"]
        },
        {
          path: "/lockdown-agents/.github/prompts/review.prompt.md",
          contents: ["---", 'description: "Review prompt"', "---"]
        }
      ]);
      assert.deepStrictEqual(await service.getCustomAgents(CancellationToken.None), []);
      assert.strictEqual((await service.listPromptFiles(PromptsType.prompt, CancellationToken.None)).length, 1);
    });
    test("skill lockdown filters standalone skills before discovery and preserves plugin skills", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
      testConfigService.setUserConfiguration(COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG, true);
      const rootFolderUri = URI.file("/lockdown-skills");
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [{
        path: "/lockdown-skills/.github/skills/workspace-skill/SKILL.md",
        contents: ["---", 'name: "workspace-skill"', 'description: "Workspace"', "---"]
      }, {
        path: "/plugins/managed/skills/plugin-skill/SKILL.md",
        contents: ["---", 'name: "plugin-skill"', 'description: "Plugin"', "---"]
      }]);
      const plugin = {
        uri: URI.file("/plugins/managed"),
        format: PluginFormat.Copilot,
        label: "managed",
        enablement: observableValue(
          "lockdownPluginEnablement",
          2
          /* ContributionEnablementState.EnabledProfile */
        ),
        hooks: observableValue("lockdownPluginHooks", []),
        commands: observableValue("lockdownPluginCommands", []),
        skills: observableValue("lockdownPluginSkills", [{ uri: URI.file("/plugins/managed/skills/plugin-skill/SKILL.md"), name: "plugin-skill" }]),
        agents: observableValue("lockdownPluginAgents", []),
        instructions: observableValue("lockdownPluginInstructions", []),
        mcpServerDefinitions: observableValue("lockdownPluginMcpServers", [])
      };
      testPluginsObservable.set([plugin], void 0);
      const skills = await service.findAgentSkills(CancellationToken.None);
      assert.deepStrictEqual(skills?.map((skill) => ({ name: skill.name, storage: skill.storage })), [
        { name: "plugin-skill", storage: PromptsStorage.plugin }
      ]);
    });
    test("plugin-only lockdown filters standalone instructions and preserves plugin instructions", async () => {
      testConfigService.setUserConfiguration(COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG, true);
      const rootFolderUri = URI.file("/lockdown-instructions");
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      const workspaceInstructionUri = URI.joinPath(rootFolderUri, ".github", "instructions", "workspace.instructions.md");
      const pluginUri = URI.file("/plugins/managed");
      const pluginInstructionUri = URI.joinPath(pluginUri, "rules", "plugin.instructions.md");
      await mockFiles(fileService, [{
        path: workspaceInstructionUri.path,
        contents: ["---", 'description: "Workspace"', "---"]
      }, {
        path: pluginInstructionUri.path,
        contents: ["---", 'description: "Plugin"', "---"]
      }]);
      const plugin = {
        uri: pluginUri,
        format: PluginFormat.Copilot,
        label: "managed",
        enablement: observableValue(
          "lockdownInstructionPluginEnablement",
          2
          /* ContributionEnablementState.EnabledProfile */
        ),
        hooks: observableValue("lockdownInstructionPluginHooks", []),
        commands: observableValue("lockdownInstructionPluginCommands", []),
        skills: observableValue("lockdownInstructionPluginSkills", []),
        agents: observableValue("lockdownInstructionPluginAgents", []),
        instructions: observableValue("lockdownPluginInstructions", [{ uri: pluginInstructionUri, name: "plugin" }]),
        mcpServerDefinitions: observableValue("lockdownInstructionPluginMcpServers", [])
      };
      testPluginsObservable.set([plugin], void 0);
      const instructions = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
      assert.deepStrictEqual(instructions.map((instruction) => ({
        uri: instruction.uri.toString(),
        storage: instruction.storage
      })), [{
        uri: pluginInstructionUri.toString(),
        storage: PromptsStorage.plugin
      }]);
    });
    test("plugin-only lockdown filters workspace agent instruction files", async () => {
      testConfigService.setUserConfiguration(COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG, true);
      const rootFolderUri = URI.file("/lockdown-agent-instructions");
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [{
        path: URI.joinPath(rootFolderUri, "AGENTS.md").path,
        contents: ["Workspace agent instructions"]
      }, {
        path: URI.joinPath(rootFolderUri, "CLAUDE.md").path,
        contents: ["Workspace Claude instructions"]
      }]);
      assert.deepStrictEqual(await service.listAgentInstructions(CancellationToken.None, void 0), []);
      assert.deepStrictEqual(await service.listNestedAgentMDs(CancellationToken.None), []);
    });
    test("plugin-only lockdown removes standalone agents with embedded hooks", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_CHAT_HOOKS, true);
      testConfigService.setUserConfiguration(COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG, true);
      const rootFolderUri = URI.file("/lockdown-agent-hooks");
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      await mockFiles(fileService, [{
        path: "/lockdown-agent-hooks/.github/agents/reviewer.agent.md",
        contents: [
          "---",
          'description: "Review code"',
          "hooks:",
          "  PreToolUse:",
          "    - type: command",
          '      command: "echo blocked"',
          "---"
        ]
      }]);
      const agents = await service.getCustomAgents(CancellationToken.None);
      assert.deepStrictEqual(agents, []);
    });
    test("managed-only hooks preserve frontmatter hooks from force-enabled plugin agents", async () => {
      testConfigService.setUserConfiguration(PromptsConfig.USE_CHAT_HOOKS, true);
      testConfigService.setUserConfiguration(COPILOT_ALLOW_MANAGED_HOOKS_ONLY_CONFIG, true);
      const pluginUri = URI.file("/home/user/.copilot/installed-plugins/managed-marketplace/managed-plugin");
      const agentUri = URI.joinPath(pluginUri, "agents", "reviewer.agent.md");
      await mockFiles(fileService, [{
        path: agentUri.path,
        contents: [
          "---",
          'description: "Review code"',
          "hooks:",
          "  PreToolUse:",
          "    - type: command",
          '      command: "echo managed"',
          "---"
        ]
      }]);
      const originalInspect = testConfigService.inspect.bind(testConfigService);
      testConfigService.inspect = (key, overrides) => {
        const inspected = originalInspect(key, overrides);
        return key === ChatConfiguration.EnabledPlugins ? { ...inspected, policyValue: { "managed-plugin@managed-marketplace": true } } : inspected;
      };
      const plugin = {
        uri: pluginUri,
        format: PluginFormat.Copilot,
        label: "managed-plugin",
        enablement: observableValue(
          "managedPluginEnablement",
          2
          /* ContributionEnablementState.EnabledProfile */
        ),
        hooks: observableValue("managedPluginHooks", []),
        commands: observableValue("managedPluginCommands", []),
        skills: observableValue("managedPluginSkills", []),
        agents: observableValue("managedPluginAgents", [{ uri: agentUri, name: "reviewer" }]),
        instructions: observableValue("managedPluginInstructions", []),
        mcpServerDefinitions: observableValue("managedPluginMcpServers", [])
      };
      testPluginsObservable.set([plugin], void 0);
      fireConfigChange(testConfigService, COPILOT_ALLOW_MANAGED_HOOKS_ONLY_CONFIG, ChatConfiguration.EnabledPlugins);
      const agents = await service.getCustomAgents(CancellationToken.None);
      assert.strictEqual(agents.length, 1);
      assert.strictEqual(agents[0].hooks?.[HookType.PreToolUse]?.[0].command, "echo managed");
    });
  });
  suite("hooks", () => {
    const createTestPlugin = (path, initialHooks) => {
      const enablement = observableValue(
        "testPluginEnablement",
        2
        /* ContributionEnablementState.EnabledProfile */
      );
      const hooks = observableValue("testPluginHooks", initialHooks);
      const commands = observableValue("testPluginCommands", []);
      const skills = observableValue("testPluginSkills", []);
      const agents = observableValue("testPluginAgents", []);
      const instructions = observableValue("testPluginInstructions", []);
      const mcpServerDefinitions = observableValue("testPluginMcpServerDefinitions", []);
      return {
        plugin: {
          uri: URI.file(path),
          format: PluginFormat.Copilot,
          label: basename(URI.file(path)),
          enablement,
          remove: () => {
          },
          hooks,
          commands,
          skills,
          agents,
          instructions,
          mcpServerDefinitions
        },
        hooks
      };
    };
    test("multi-root workspace resolves cwd to per-hook-file workspace folder", async function() {
      const folder1Uri = URI.file("/workspace-a");
      const folder2Uri = URI.file("/workspace-b");
      workspaceContextService.setWorkspace(testWorkspace(folder1Uri, folder2Uri));
      testConfigService.setUserConfiguration(PromptsConfig.USE_CHAT_HOOKS, true);
      testConfigService.setUserConfiguration(PromptsConfig.HOOKS_LOCATION_KEY, { [HOOKS_SOURCE_FOLDER]: true });
      await mockFiles(fileService, [
        {
          path: "/workspace-a/.github/hooks/my-hook.json",
          contents: [
            JSON.stringify({
              hooks: {
                [HookType.PreToolUse]: [
                  { type: "command", command: "echo folder-a" }
                ]
              }
            })
          ]
        },
        {
          path: "/workspace-b/.github/hooks/my-hook.json",
          contents: [
            JSON.stringify({
              hooks: {
                [HookType.PreToolUse]: [
                  { type: "command", command: "echo folder-b" }
                ]
              }
            })
          ]
        }
      ]);
      const result = await service.getHooks(CancellationToken.None);
      assert.ok(result, "Expected hooks result");
      const preToolUseHooks = result.hooks[HookType.PreToolUse];
      assert.ok(preToolUseHooks, "Expected PreToolUse hooks");
      assert.strictEqual(preToolUseHooks.length, 2, "Expected two PreToolUse hooks");
      const hookA = preToolUseHooks.find((h) => h.command === "echo folder-a");
      const hookB = preToolUseHooks.find((h) => h.command === "echo folder-b");
      assert.ok(hookA, "Expected hook from folder-a");
      assert.ok(hookB, "Expected hook from folder-b");
      assert.strictEqual(hookA.cwd?.path, folder1Uri.path, "Hook from folder-a should have cwd pointing to workspace-a");
      assert.strictEqual(hookB.cwd?.path, folder2Uri.path, "Hook from folder-b should have cwd pointing to workspace-b");
    });
    test("includes hooks from agent plugins", async function() {
      testConfigService.setUserConfiguration(PromptsConfig.USE_CHAT_HOOKS, true);
      testConfigService.setUserConfiguration(PromptsConfig.HOOKS_LOCATION_KEY, {});
      const { plugin } = createTestPlugin("/plugins/test-plugin", [{
        type: HookType.PreToolUse,
        originalId: "plugin-pre-tool-use",
        hooks: [{ command: "echo from-plugin" }],
        uri: URI.file("/plugins/test-plugin/hooks.json")
      }]);
      testPluginsObservable.set([plugin], void 0);
      const result = await service.getHooks(CancellationToken.None);
      assert.ok(result, "Expected hooks result");
      assert.deepStrictEqual(result.hooks[HookType.PreToolUse], [{
        command: "echo from-plugin",
        sourceUri: URI.file("/plugins/test-plugin/hooks.json")
      }], "Expected plugin hooks to be included in computed hooks");
    });
    test("managed-only hooks block standalone and unmanaged plugin hooks", async function() {
      const rootFolderUri = URI.file("/managed-hooks-only");
      workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
      testConfigService.setUserConfiguration(PromptsConfig.USE_CHAT_HOOKS, true);
      testConfigService.setUserConfiguration(PromptsConfig.HOOKS_LOCATION_KEY, { [HOOKS_SOURCE_FOLDER]: true });
      testConfigService.setUserConfiguration(COPILOT_ALLOW_MANAGED_HOOKS_ONLY_CONFIG, true);
      fireConfigChange(testConfigService, COPILOT_ALLOW_MANAGED_HOOKS_ONLY_CONFIG);
      await mockFiles(fileService, [{
        path: "/managed-hooks-only/.github/hooks/hooks.json",
        contents: [JSON.stringify({ hooks: { [HookType.PreToolUse]: [{ type: "command", command: "echo workspace" }] } })]
      }]);
      const { plugin } = createTestPlugin("/plugins/unmanaged", [{
        type: HookType.PreToolUse,
        originalId: "plugin-hook",
        hooks: [{ command: "echo plugin" }],
        uri: URI.file("/plugins/unmanaged/hooks.json")
      }]);
      testPluginsObservable.set([plugin], void 0);
      assert.strictEqual(await service.getHooks(CancellationToken.None), void 0);
      assert.deepStrictEqual(await service.listPromptFiles(PromptsType.hook, CancellationToken.None), []);
    });
    test("recomputes hooks when agent plugin hooks change", async function() {
      testConfigService.setUserConfiguration(PromptsConfig.USE_CHAT_HOOKS, true);
      testConfigService.setUserConfiguration(PromptsConfig.HOOKS_LOCATION_KEY, {});
      const { plugin, hooks } = createTestPlugin("/plugins/test-plugin", [{
        type: HookType.PreToolUse,
        originalId: "plugin-pre-tool-use",
        hooks: [{ command: "echo before" }],
        uri: URI.file("/plugins/test-plugin/hooks.json")
      }]);
      testPluginsObservable.set([plugin], void 0);
      const before = await service.getHooks(CancellationToken.None);
      assert.ok(before, "Expected hooks result before plugin update");
      assert.deepStrictEqual(before.hooks[HookType.PreToolUse], [{ command: "echo before", sourceUri: URI.file("/plugins/test-plugin/hooks.json") }]);
      hooks.set([{
        type: HookType.PreToolUse,
        originalId: "plugin-pre-tool-use",
        hooks: [{ command: "echo after" }],
        uri: URI.file("/plugins/test-plugin/hooks.json")
      }], void 0);
      const after = await service.getHooks(CancellationToken.None);
      assert.ok(after, "Expected hooks result after plugin update");
      assert.deepStrictEqual(after.hooks[HookType.PreToolUse], [{ command: "echo after", sourceUri: URI.file("/plugins/test-plugin/hooks.json") }]);
    });
    test("returns undefined when workspace is untrusted", async function() {
      workspaceContextService.setWorkspace(testWorkspace(URI.file("/test-workspace")));
      testConfigService.setUserConfiguration(PromptsConfig.USE_CHAT_HOOKS, true);
      testConfigService.setUserConfiguration(PromptsConfig.HOOKS_LOCATION_KEY, { [HOOKS_SOURCE_FOLDER]: true });
      await mockFiles(fileService, [
        {
          path: "/test-workspace/.github/hooks/my-hook.json",
          contents: [
            JSON.stringify({
              hooks: {
                [HookType.PreToolUse]: [
                  { type: "command", command: "echo test" }
                ]
              }
            })
          ]
        }
      ]);
      const trustedResult = await service.getHooks(CancellationToken.None);
      assert.ok(trustedResult, "Expected hooks when workspace is trusted");
      assert.strictEqual(trustedResult.hooks[HookType.PreToolUse]?.length, 1);
      await workspaceTrustService.setWorkspaceTrust(false);
      const untrustedResult = await service.getHooks(CancellationToken.None);
      assert.strictEqual(untrustedResult, void 0, "Expected undefined hooks when workspace is untrusted");
      await workspaceTrustService.setWorkspaceTrust(true);
      const reTrustedResult = await service.getHooks(CancellationToken.None);
      assert.ok(reTrustedResult, "Expected hooks after workspace becomes trusted again");
      assert.strictEqual(reTrustedResult.hooks[HookType.PreToolUse]?.length, 1);
    });
    test("suppresses plugin hooks when workspace is untrusted", async function() {
      testConfigService.setUserConfiguration(PromptsConfig.USE_CHAT_HOOKS, true);
      testConfigService.setUserConfiguration(PromptsConfig.HOOKS_LOCATION_KEY, {});
      const { plugin } = createTestPlugin("/plugins/test-plugin", [{
        type: HookType.PreToolUse,
        originalId: "plugin-pre-tool-use",
        hooks: [{ command: "echo from-plugin" }],
        uri: URI.file("/plugins/test-plugin/hooks.json")
      }]);
      testPluginsObservable.set([plugin], void 0);
      await workspaceTrustService.setWorkspaceTrust(false);
      const result = await service.getHooks(CancellationToken.None);
      assert.strictEqual(result, void 0, "Expected undefined hooks when workspace is untrusted, even with plugin hooks");
    });
    test("Claude hooks with disableAllHooks should not report hasDisabledClaudeHooks when Claude hooks setting is off", async function() {
      const workspaceUri = URI.file("/test-workspace");
      workspaceContextService.setWorkspace(testWorkspace(workspaceUri));
      testConfigService.setUserConfiguration(PromptsConfig.USE_CHAT_HOOKS, true);
      testConfigService.setUserConfiguration(PromptsConfig.USE_CLAUDE_HOOKS, false);
      testConfigService.setUserConfiguration(PromptsConfig.HOOKS_LOCATION_KEY, { [HOOKS_SOURCE_FOLDER]: true });
      await mockFiles(fileService, [
        {
          path: "/test-workspace/.claude/settings.json",
          contents: [
            JSON.stringify({
              disableAllHooks: true,
              hooks: {
                PreToolUse: [{ type: "command", command: "echo disabled-claude-hook" }]
              }
            })
          ]
        }
      ]);
      const result = await service.getHooks(CancellationToken.None);
      assert.strictEqual(result, void 0, "Expected no hooks result");
    });
    test("plugin hooks appear in hook discovery info files", async function() {
      const workspaceUri = URI.file("/test-workspace");
      workspaceContextService.setWorkspace(testWorkspace(workspaceUri));
      testConfigService.setUserConfiguration(PromptsConfig.USE_CHAT_HOOKS, true);
      testConfigService.setUserConfiguration(PromptsConfig.HOOKS_LOCATION_KEY, { [HOOKS_SOURCE_FOLDER]: true });
      const pluginHookUri = URI.file("/plugins/test-plugin/hooks.json");
      const { plugin } = createTestPlugin("/plugins/test-plugin", [{
        type: HookType.PreToolUse,
        originalId: "plugin-pre-tool-use",
        hooks: [{ command: "echo from-plugin" }],
        uri: pluginHookUri
      }]);
      testPluginsObservable.set([plugin], void 0);
      const result = await service.getHooks(CancellationToken.None);
      const capturedDiscoveryInfo = await service.getDiscoveryInfo(PromptsType.hook, CancellationToken.None);
      assert.ok(result, "Expected hooks result with plugin hooks");
      assert.ok(capturedDiscoveryInfo, "Expected discovery info to be logged");
      const pluginFile = capturedDiscoveryInfo.files.find(
        (f) => f.promptPath.storage === PromptsStorage.plugin
      );
      assert.ok(pluginFile, "Plugin hook file should be present in discovery info files");
    });
  });
  suite("plugin instructions", () => {
    function createPluginWithInstructions(path, initialInstructions) {
      const enablement = observableValue(
        "testPluginEnablement",
        2
        /* ContributionEnablementState.EnabledProfile */
      );
      const hooks = observableValue("testPluginHooks", []);
      const commands = observableValue("testPluginCommands", []);
      const skills = observableValue("testPluginSkills", []);
      const agents = observableValue("testPluginAgents", []);
      const instructions = observableValue("testPluginInstructions", initialInstructions);
      const mcpServerDefinitions = observableValue("testPluginMcpServerDefinitions", []);
      return {
        plugin: {
          uri: URI.file(path),
          format: PluginFormat.Copilot,
          label: basename(URI.file(path)),
          enablement,
          remove: () => {
          },
          hooks,
          commands,
          skills,
          agents,
          instructions,
          mcpServerDefinitions
        },
        instructions
      };
    }
    test("lists plugin instructions via listPromptFiles", async function() {
      const ruleUri = URI.file("/plugins/test-plugin/rules/prefer-const.mdc");
      const { plugin } = createPluginWithInstructions("/plugins/test-plugin", [
        { uri: ruleUri, name: "prefer-const" }
      ]);
      testPluginsObservable.set([plugin], void 0);
      const result = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
      const pluginInstruction = result.find((p) => p.uri.toString() === ruleUri.toString());
      assert.ok(pluginInstruction, "Plugin instruction should appear in listPromptFiles");
      assert.strictEqual(pluginInstruction.storage, PromptsStorage.plugin);
    });
    test("updates listed instructions when plugin instructions change", async function() {
      const ruleUri1 = URI.file("/plugins/test-plugin/rules/rule-a.mdc");
      const ruleUri2 = URI.file("/plugins/test-plugin/rules/rule-b.mdc");
      const { plugin, instructions } = createPluginWithInstructions("/plugins/test-plugin", [
        { uri: ruleUri1, name: "rule-a" }
      ]);
      testPluginsObservable.set([plugin], void 0);
      const before = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
      const beforePlugin = before.filter((p) => p.storage === PromptsStorage.plugin);
      assert.strictEqual(beforePlugin.length, 1);
      const eventFired = new Promise((resolve) => {
        const disposable = service.onDidChangeInstructions(() => {
          disposable.dispose();
          resolve();
        });
      });
      instructions.set([
        { uri: ruleUri1, name: "rule-a" },
        { uri: ruleUri2, name: "rule-b" }
      ], void 0);
      await eventFired;
      const after = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
      const afterPlugin = after.filter((p) => p.storage === PromptsStorage.plugin);
      assert.strictEqual(afterPlugin.length, 2);
    });
    test("removes instructions when plugin is removed", async function() {
      const ruleUri = URI.file("/plugins/test-plugin/rules/rule-a.mdc");
      const { plugin } = createPluginWithInstructions("/plugins/test-plugin", [
        { uri: ruleUri, name: "rule-a" }
      ]);
      testPluginsObservable.set([plugin], void 0);
      const withPlugin = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
      assert.ok(withPlugin.some((p) => p.storage === PromptsStorage.plugin));
      testPluginsObservable.set([], void 0);
      const withoutPlugin = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
      assert.ok(!withoutPlugin.some((p) => p.storage === PromptsStorage.plugin));
    });
    test("namespaces plugin instruction names with plugin folder", async function() {
      const ruleUri = URI.file("/plugins/deploy-tools/rules/lint-check.mdc");
      const { plugin } = createPluginWithInstructions("/plugins/deploy-tools", [
        { uri: ruleUri, name: "lint-check" }
      ]);
      testPluginsObservable.set([plugin], void 0);
      const result = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
      const pluginInstruction = result.find((p) => p.uri.toString() === ruleUri.toString());
      assert.ok(pluginInstruction, "Plugin instruction should be listed");
      assert.strictEqual(pluginInstruction.name, "deploy-tools:lint-check");
    });
  });
});
function fireConfigChange(configService, ...key) {
  configService.onDidChangeConfigurationEmitter.fire({
    affectsConfiguration: (k) => key.includes(k)
  });
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vcHJvbXB0U3ludGF4L3NlcnZpY2UvcHJvbXB0c1NlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCAqIGFzIHNpbm9uIGZyb20gJ3Npbm9uJztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IG1hdGNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZ2xvYi5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZVNldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBJU2V0dGFibGVPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCByZWxhdGl2ZVBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQsIElDb25maWd1cmF0aW9uT3ZlcnJpZGVzLCBJQ29uZmlndXJhdGlvblNlcnZpY2UsIElDb25maWd1cmF0aW9uVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIsIElFeHRlbnNpb25EZXNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2luTWVtb3J5RmlsZXN5c3RlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBOdWxsVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgdGVzdFdvcmtzcGFjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS90ZXN0L2NvbW1vbi90ZXN0V29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvZmlsZXNDb25maWd1cmF0aW9uL2NvbW1vbi9maWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgdG9Vc2VyRGF0YVByb2ZpbGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBUZXN0Q29udGV4dFNlcnZpY2UsIFRlc3RVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlLCBUZXN0V29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBDaGF0UmVxdWVzdFZhcmlhYmxlU2V0LCBpc1Byb21wdEZpbGVWYXJpYWJsZUVudHJ5LCB0b0ZpbGVWYXJpYWJsZUVudHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMuanMnO1xuaW1wb3J0IHsgQ29tcHV0ZUF1dG9tYXRpY0luc3RydWN0aW9ucywgbmV3SW5zdHJ1Y3Rpb25zQ29sbGVjdGlvbkV2ZW50LCBuZXdJbnN0cnVjdGlvbnNDb2xsZWN0aW9uRGVidWdJbmZvIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9jb21wdXRlQXV0b21hdGljSW5zdHJ1Y3Rpb25zLmpzJztcbmltcG9ydCB7IFByb21wdHNDb25maWcgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L2NvbmZpZy9jb25maWcuanMnO1xuaW1wb3J0IHsgQUdFTlRTX1NPVVJDRV9GT0xERVIsIENMQVVERV9DT05GSUdfRk9MREVSLCBIT09LU19TT1VSQ0VfRk9MREVSLCBJTlNUUlVDVElPTl9GSUxFX0VYVEVOU0lPTiwgSU5TVFJVQ1RJT05TX0RFRkFVTFRfU09VUkNFX0ZPTERFUiwgTEVHQUNZX01PREVfREVGQVVMVF9TT1VSQ0VfRk9MREVSLCBQUk9NUFRfREVGQVVMVF9TT1VSQ0VfRk9MREVSLCBQUk9NUFRfRklMRV9FWFRFTlNJT04gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L2NvbmZpZy9wcm9tcHRGaWxlTG9jYXRpb25zLmpzJztcbmltcG9ydCB7IElOU1RSVUNUSU9OU19MQU5HVUFHRV9JRCwgUFJPTVBUX0xBTkdVQUdFX0lELCBQcm9tcHRGaWxlU291cmNlLCBQcm9tcHRzVHlwZSwgVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBJQWdlbnREaXNjb3ZlcnlSZXN1bHQsIElBZ2VudFNvdXJjZSwgSUN1c3RvbUFnZW50LCBJUHJvbXB0RmlsZUNvbnRleHQsIElQcm9tcHRzU2VydmljZSwgUHJvbXB0c1N0b3JhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3NlcnZpY2UvcHJvbXB0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgUHJvbXB0c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3NlcnZpY2UvcHJvbXB0c1NlcnZpY2VJbXBsLmpzJztcbmltcG9ydCB7IG1vY2tGaWxlcyB9IGZyb20gJy4uL3Rlc3RVdGlscy9tb2NrRmlsZXN5c3RlbS5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlLCBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElQYXRoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3BhdGgvY29tbW9uL3BhdGhTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElGaWxlTWF0Y2gsIElGaWxlUXVlcnksIElTZWFyY2hTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvc2VhcmNoL2NvbW1vbi9zZWFyY2guanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlndXJhdGlvbiwgQ2hhdE1vZGVLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBIb29rVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvaG9va1R5cGVzLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5Q2hhbmdlRXZlbnQsIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgTW9ja0NvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy90ZXN0L2NvbW1vbi9tb2NrS2V5YmluZGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50UGx1Z2luLCBJQWdlbnRQbHVnaW5BZ2VudCwgSUFnZW50UGx1Z2luQ29tbWFuZCwgSUFnZW50UGx1Z2luSG9vaywgSUFnZW50UGx1Z2luSW5zdHJ1Y3Rpb24sIElBZ2VudFBsdWdpbk1jcFNlcnZlckRlZmluaXRpb24sIElBZ2VudFBsdWdpblNlcnZpY2UsIElBZ2VudFBsdWdpblNraWxsIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3BsdWdpbnMvYWdlbnRQbHVnaW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFBsdWdpbkZvcm1hdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50UGx1Z2lucy9jb21tb24vcGx1Z2luUGFyc2Vycy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlVHJ1c3QuanMnO1xuaW1wb3J0IHsgQ09QSUxPVF9BTExPV19NQU5BR0VEX0hPT0tTX09OTFlfQ09ORklHLCBDT1BJTE9UX1NUUklDVF9QTFVHSU5fT05MWV9DVVNUT01JWkFUSU9OX0NPTkZJRyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3BvbGljeS9jb21tb24vY29waWxvdE1hbmFnZWRTZXR0aW5ncy5qcyc7XG5cbmNsYXNzIFRlc3RQcm9tcHRDb250ZXh0S2V5U2VydmljZSBleHRlbmRzIE1vY2tDb250ZXh0S2V5U2VydmljZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29udGV4dEVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxJQ29udGV4dEtleUNoYW5nZUV2ZW50PigpO1xuXHRwcml2YXRlIF9ydWxlc01hdGNoID0gZmFsc2U7XG5cblx0b3ZlcnJpZGUgZ2V0IG9uRGlkQ2hhbmdlQ29udGV4dCgpOiBFdmVudDxJQ29udGV4dEtleUNoYW5nZUV2ZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlQ29udGV4dEVtaXR0ZXIuZXZlbnQ7XG5cdH1cblxuXHRvdmVycmlkZSBjb250ZXh0TWF0Y2hlc1J1bGVzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9ydWxlc01hdGNoO1xuXHR9XG5cblx0c2V0UnVsZXNNYXRjaCh2YWx1ZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX3J1bGVzTWF0Y2ggPSB2YWx1ZTtcblx0fVxuXG5cdGZpcmVEaWRDaGFuZ2VDb250ZXh0KGtleXM6IHN0cmluZ1tdKTogdm9pZCB7XG5cdFx0Y29uc3QgY2hhbmdlZEtleXMgPSBuZXcgU2V0KGtleXMpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29udGV4dEVtaXR0ZXIuZmlyZSh7XG5cdFx0XHRhZmZlY3RzU29tZTogdHJhY2tlZEtleXMgPT4ga2V5cy5zb21lKGtleSA9PiB0cmFja2VkS2V5cy5oYXMoa2V5KSksXG5cdFx0XHRhbGxLZXlzQ29udGFpbmVkSW46IHRyYWNrZWRLZXlzID0+IEFycmF5LmZyb20oY2hhbmdlZEtleXMpLmV2ZXJ5KGtleSA9PiB0cmFja2VkS2V5cy5oYXMoa2V5KSksXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29udGV4dEVtaXR0ZXIuZGlzcG9zZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5zdWl0ZSgnUHJvbXB0c1NlcnZpY2UnLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IHNlcnZpY2U6IElQcm9tcHRzU2VydmljZTtcblx0bGV0IGluc3RhU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRsZXQgd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IFRlc3RDb250ZXh0U2VydmljZTtcblx0bGV0IHRlc3RDb25maWdTZXJ2aWNlOiBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2U7XG5cdGxldCBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlO1xuXHRsZXQgdGVzdFBsdWdpbnNPYnNlcnZhYmxlOiBJU2V0dGFibGVPYnNlcnZhYmxlPHJlYWRvbmx5IElBZ2VudFBsdWdpbltdPjtcblx0bGV0IHdvcmtzcGFjZVRydXN0U2VydmljZTogVGVzdFdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2U7XG5cblx0c2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdGluc3RhU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cblx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZSA9IG5ldyBUZXN0Q29udGV4dFNlcnZpY2UoKTtcblx0XHRpbnN0YVNlcnZpY2Uuc3R1YihJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlKTtcblxuXHRcdHRlc3RDb25maWdTZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0NPUElMT1RfSU5TVFJVQ1RJT05fRklMRVMsIHRydWUpO1xuXHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0FHRU5UX01ELCB0cnVlKTtcblx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9ORVNURURfQUdFTlRfTUQsIGZhbHNlKTtcblx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLklOQ0xVREVfUkVGRVJFTkNFRF9JTlNUUlVDVElPTlMsIHRydWUpO1xuXHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuSU5DTFVERV9BUFBMWUlOR19JTlNUUlVDVElPTlMsIHRydWUpO1xuXHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0NVU1RPTUlaQVRJT05TX0lOX1BBUkVOVF9SRVBPUywgZmFsc2UpO1xuXHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuSU5TVFJVQ1RJT05TX0xPQ0FUSU9OX0tFWSwgeyBbSU5TVFJVQ1RJT05TX0RFRkFVTFRfU09VUkNFX0ZPTERFUl06IHRydWUgfSk7XG5cdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5QUk9NUFRfTE9DQVRJT05TX0tFWSwgeyBbUFJPTVBUX0RFRkFVTFRfU09VUkNFX0ZPTERFUl06IHRydWUgfSk7XG5cdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5NT0RFX0xPQ0FUSU9OX0tFWSwgeyBbTEVHQUNZX01PREVfREVGQVVMVF9TT1VSQ0VfRk9MREVSXTogdHJ1ZSB9KTtcblx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLkFHRU5UU19MT0NBVElPTl9LRVksIHsgW0FHRU5UU19TT1VSQ0VfRk9MREVSXTogdHJ1ZSB9KTtcblxuXHRcdGluc3RhU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgdGVzdENvbmZpZ1NlcnZpY2UpO1xuXHRcdGluc3RhU2VydmljZS5zdHViKElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsIHt9KTtcblx0XHRpbnN0YVNlcnZpY2Uuc3R1YihJVXNlckRhdGFQcm9maWxlU2VydmljZSwgbmV3IFRlc3RVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlKCkpO1xuXHRcdGluc3RhU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCBOdWxsVGVsZW1ldHJ5U2VydmljZSk7XG5cdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRpbnN0YVNlcnZpY2Uuc3R1YihJRXh0ZW5zaW9uU2VydmljZSwge1xuXHRcdFx0d2hlbkluc3RhbGxlZEV4dGVuc2lvbnNSZWdpc3RlcmVkOiAoKSA9PiBQcm9taXNlLnJlc29sdmUodHJ1ZSksXG5cdFx0XHRhY3RpdmF0ZUJ5RXZlbnQ6ICgpID0+IFByb21pc2UucmVzb2x2ZSgpXG5cdFx0fSk7XG5cblx0XHRmaWxlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRmlsZVNlcnZpY2UpKTtcblx0XHRpbnN0YVNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IG1vZGVsU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTW9kZWxTZXJ2aWNlKSk7XG5cdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSU1vZGVsU2VydmljZSwgbW9kZWxTZXJ2aWNlKTtcblx0XHRpbnN0YVNlcnZpY2Uuc3R1YihJTGFuZ3VhZ2VTZXJ2aWNlLCB7XG5cdFx0XHRndWVzc0xhbmd1YWdlSWRCeUZpbGVwYXRoT3JGaXJzdExpbmUodXJpOiBVUkkpIHtcblx0XHRcdFx0aWYgKHVyaS5wYXRoLmVuZHNXaXRoKFBST01QVF9GSUxFX0VYVEVOU0lPTikpIHtcblx0XHRcdFx0XHRyZXR1cm4gUFJPTVBUX0xBTkdVQUdFX0lEO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHVyaS5wYXRoLmVuZHNXaXRoKElOU1RSVUNUSU9OX0ZJTEVfRVhURU5TSU9OKSkge1xuXHRcdFx0XHRcdHJldHVybiBJTlNUUlVDVElPTlNfTEFOR1VBR0VfSUQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gJ3BsYWludGV4dCc7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSUxhYmVsU2VydmljZSwgeyBnZXRVcmlMYWJlbDogKHVyaTogVVJJKSA9PiB1cmkucGF0aCB9KTtcblxuXHRcdGNvbnN0IGZpbGVTeXN0ZW1Qcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoU2NoZW1hcy5maWxlLCBmaWxlU3lzdGVtUHJvdmlkZXIpKTtcblxuXHRcdGluc3RhU2VydmljZS5zdHViKElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLCB7IHVwZGF0ZVJlYWRvbmx5OiAoKSA9PiBQcm9taXNlLnJlc29sdmUoKSB9KTtcblxuXHRcdGNvbnN0IHBhdGhTZXJ2aWNlID0ge1xuXHRcdFx0dXNlckhvbWU6ICgpOiBVUkkgfCBQcm9taXNlPFVSST4gPT4ge1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFVSSS5maWxlKCcvaG9tZS91c2VyJykpO1xuXHRcdFx0fSxcblx0XHR9IGFzIElQYXRoU2VydmljZTtcblx0XHRpbnN0YVNlcnZpY2Uuc3R1YihJUGF0aFNlcnZpY2UsIHBhdGhTZXJ2aWNlKTtcblxuXHRcdGluc3RhU2VydmljZS5zdHViKElTZWFyY2hTZXJ2aWNlLCB7XG5cdFx0XHRzY2hlbWVIYXNGaWxlU2VhcmNoUHJvdmlkZXI6ICgpID0+IHRydWUsXG5cdFx0XHRhc3luYyBmaWxlU2VhcmNoKHF1ZXJ5OiBJRmlsZVF1ZXJ5KSB7XG5cdFx0XHRcdC8vIG1vY2sgdGhlIHNlYXJjaCBzZXJ2aWNlIC0gcmVjdXJzaXZlbHkgZmluZCBmaWxlcyBtYXRjaGluZyBwYXR0ZXJuXG5cdFx0XHRcdGNvbnN0IGZpbmRGaWxlc0luTG9jYXRpb24gPSBhc3luYyAobG9jYXRpb246IFVSSSwgcmVzdWx0czogVVJJW10gPSBbXSk6IFByb21pc2U8VVJJW10+ID0+IHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0Y29uc3QgcmVzb2x2ZSA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlc29sdmUobG9jYXRpb24pO1xuXHRcdFx0XHRcdFx0aWYgKHJlc29sdmUuaXNGaWxlKSB7XG5cdFx0XHRcdFx0XHRcdHJlc3VsdHMucHVzaChyZXNvbHZlLnJlc291cmNlKTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAocmVzb2x2ZS5pc0RpcmVjdG9yeSAmJiByZXNvbHZlLmNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0XHRcdGZvciAoY29uc3QgY2hpbGQgb2YgcmVzb2x2ZS5jaGlsZHJlbikge1xuXHRcdFx0XHRcdFx0XHRcdGF3YWl0IGZpbmRGaWxlc0luTG9jYXRpb24oY2hpbGQucmVzb3VyY2UsIHJlc3VsdHMpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdC8vIGZvbGRlciBkb2Vzbid0IGV4aXN0XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiByZXN1bHRzO1xuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGNvbnN0IHJlc3VsdHM6IElGaWxlTWF0Y2hbXSA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGZvbGRlclF1ZXJ5IG9mIHF1ZXJ5LmZvbGRlclF1ZXJpZXMpIHtcblx0XHRcdFx0XHRjb25zdCBhbGxGaWxlcyA9IGF3YWl0IGZpbmRGaWxlc0luTG9jYXRpb24oZm9sZGVyUXVlcnkuZm9sZGVyKTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHJlc291cmNlIG9mIGFsbEZpbGVzKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBwYXRoSW5Gb2xkZXIgPSByZWxhdGl2ZVBhdGgoZm9sZGVyUXVlcnkuZm9sZGVyLCByZXNvdXJjZSkgPz8gJyc7XG5cdFx0XHRcdFx0XHRpZiAocXVlcnkuZmlsZVBhdHRlcm4gPT09IHVuZGVmaW5lZCB8fCBtYXRjaChxdWVyeS5maWxlUGF0dGVybiwgcGF0aEluRm9sZGVyKSkge1xuXHRcdFx0XHRcdFx0XHRyZXN1bHRzLnB1c2goeyByZXNvdXJjZSB9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHsgcmVzdWx0cywgbWVzc2FnZXM6IFtdIH07XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRpbnN0YVNlcnZpY2Uuc3R1YihJUmVtb3RlQWdlbnRTZXJ2aWNlLCB7XG5cdFx0XHRnZXRFbnZpcm9ubWVudDogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKG51bGwpLFxuXHRcdFx0Z2V0Q29ubmVjdGlvbjogKCkgPT4gbnVsbCxcblx0XHR9KTtcblxuXHRcdGluc3RhU2VydmljZS5zdHViKElDb250ZXh0S2V5U2VydmljZSwgbmV3IE1vY2tDb250ZXh0S2V5U2VydmljZSgpKTtcblxuXHRcdHdvcmtzcGFjZVRydXN0U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UoKSk7XG5cdFx0d29ya3NwYWNlVHJ1c3RTZXJ2aWNlLmdldFVyaVRydXN0SW5mbyA9ICh1cmk6IFVSSSkgPT4gUHJvbWlzZS5yZXNvbHZlKHsgdHJ1c3RlZDogdHJ1ZSwgdXJpIH0pO1xuXHRcdGluc3RhU2VydmljZS5zdHViKElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLCB3b3Jrc3BhY2VUcnVzdFNlcnZpY2UpO1xuXG5cdFx0dGVzdFBsdWdpbnNPYnNlcnZhYmxlID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElBZ2VudFBsdWdpbltdPigndGVzdFBsdWdpbnMnLCBbXSk7XG5cblx0XHRpbnN0YVNlcnZpY2Uuc3R1YihJQWdlbnRQbHVnaW5TZXJ2aWNlLCB7XG5cdFx0XHRwbHVnaW5zOiB0ZXN0UGx1Z2luc09ic2VydmFibGUsXG5cdFx0XHRlbmFibGVtZW50TW9kZWw6IHsgcmVhZEVuYWJsZWQ6ICgpID0+IDIgLyogRW5hYmxlZFByb2ZpbGUgKi8sIHNldEVuYWJsZWQ6ICgpID0+IHsgfSwgcmVtb3ZlOiAoKSA9PiB7IH0gfSxcblx0XHR9KTtcblxuXHRcdHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdHNTZXJ2aWNlKSk7XG5cdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSVByb21wdHNTZXJ2aWNlLCBzZXJ2aWNlKTtcblx0fSk7XG5cblx0c3VpdGUoJ0lBZ2VudFNvdXJjZS5pc0VxdWFscycsICgpID0+IHtcblx0XHR0ZXN0KCdyZXR1cm5zIHRydWUgZm9yIGVxdWl2YWxlbnQgbG9jYWwgc291cmNlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGxlZnQ6IElBZ2VudFNvdXJjZSA9IHsgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwgfTtcblx0XHRcdGNvbnN0IHJpZ2h0OiBJQWdlbnRTb3VyY2UgPSB7IHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsIH07XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChJQWdlbnRTb3VyY2UuaXNFcXVhbHMobGVmdCwgcmlnaHQpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdHJ1ZSBmb3IgZXF1aXZhbGVudCBleHRlbnNpb24gc291cmNlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGxlZnQ6IElBZ2VudFNvdXJjZSA9IHsgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UuZXh0ZW5zaW9uLCBleHRlbnNpb25JZDogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ21zLnZzY29kZScpIH07XG5cdFx0XHRjb25zdCByaWdodDogSUFnZW50U291cmNlID0geyBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5leHRlbnNpb24sIGV4dGVuc2lvbklkOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcignbXMudnNjb2RlJykgfTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKElBZ2VudFNvdXJjZS5pc0VxdWFscyhsZWZ0LCByaWdodCksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBmYWxzZSBmb3IgZGlmZmVyZW50IHBsdWdpbiBzb3VyY2UgVVJJcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGxlZnQ6IElBZ2VudFNvdXJjZSA9IHsgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UucGx1Z2luLCBwbHVnaW5Vcmk6IFVSSS5maWxlKCcvd29ya3NwYWNlL3BsdWdpbi1hJykgfTtcblx0XHRcdGNvbnN0IHJpZ2h0OiBJQWdlbnRTb3VyY2UgPSB7IHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLnBsdWdpbiwgcGx1Z2luVXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS9wbHVnaW4tYicpIH07XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChJQWdlbnRTb3VyY2UuaXNFcXVhbHMobGVmdCwgcmlnaHQpLCBmYWxzZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCd2b2ljZSBpbnN0cnVjdGlvbnMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnY29tYmluZXMgdXNlciBhbmQgdHJ1c3RlZCB3b3Jrc3BhY2Ugdm9pY2UubWQgZmlsZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UnKTtcblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7IHBhdGg6ICcvaG9tZS91c2VyLy5jb3BpbG90L3ZvaWNlLm1kJywgY29udGVudHM6IFsnVXNlIHNob3J0IHBhcmFncmFwaHMuJ10gfSxcblx0XHRcdFx0eyBwYXRoOiAnL3dvcmtzcGFjZS8uZ2l0aHViL3ZvaWNlLm1kJywgY29udGVudHM6IFsnU3BlbGwgdGhlIHByb2R1Y3QgbmFtZSBhcyBDb250b3NvIERCLiddIH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgaW5zdHJ1Y3Rpb25zID0gYXdhaXQgc2VydmljZS5nZXRWb2ljZUluc3RydWN0aW9ucyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluc3RydWN0aW9ucywgJ1VzZSBzaG9ydCBwYXJhZ3JhcGhzLlxcblxcblNwZWxsIHRoZSBwcm9kdWN0IG5hbWUgYXMgQ29udG9zbyBEQi4nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4Y2x1ZGVzIHdvcmtzcGFjZSB2b2ljZS5tZCB3aGVuIHRoZSB3b3Jrc3BhY2UgaXMgdW50cnVzdGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlclVyaSA9IFVSSS5maWxlKCcvd29ya3NwYWNlJyk7XG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2UodGVzdFdvcmtzcGFjZShyb290Rm9sZGVyVXJpKSk7XG5cdFx0XHRhd2FpdCB3b3Jrc3BhY2VUcnVzdFNlcnZpY2Uuc2V0V29ya3NwYWNlVHJ1c3QoZmFsc2UpO1xuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHsgcGF0aDogJy9ob21lL3VzZXIvLmNvcGlsb3Qvdm9pY2UubWQnLCBjb250ZW50czogWydVc2Ugc2hvcnQgcGFyYWdyYXBocy4nXSB9LFxuXHRcdFx0XHR7IHBhdGg6ICcvd29ya3NwYWNlLy5naXRodWIvdm9pY2UubWQnLCBjb250ZW50czogWydVbnRydXN0ZWQgd29ya3NwYWNlIGd1aWRhbmNlLiddIH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgaW5zdHJ1Y3Rpb25zID0gYXdhaXQgc2VydmljZS5nZXRWb2ljZUluc3RydWN0aW9ucyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluc3RydWN0aW9ucywgJ1VzZSBzaG9ydCBwYXJhZ3JhcGhzLicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2FuY2VscyBpbi1mbGlnaHQgdm9pY2UgaW5zdHJ1Y3Rpb24gcmVhZHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRcdGNvbnN0IHJlYWRTdGFydGVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdFx0Y29uc3QgcmVhZEZpbGVTdHViID0gc2lub24uc3R1YihmaWxlU2VydmljZSwgJ3JlYWRGaWxlJykuY2FsbHNGYWtlKGFzeW5jIChfcmVzb3VyY2UsIF9vcHRpb25zLCB0b2tlbikgPT4ge1xuXHRcdFx0XHRyZWFkU3RhcnRlZC5jb21wbGV0ZSgpO1xuXHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRcdFx0XHRjb25zdCBsaXN0ZW5lciA9IHRva2VuIS5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiB7XG5cdFx0XHRcdFx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBpbnN0cnVjdGlvbnMgPSBzZXJ2aWNlLmdldFZvaWNlSW5zdHJ1Y3Rpb25zKGN0cy50b2tlbik7XG5cdFx0XHRcdGF3YWl0IHJlYWRTdGFydGVkLnA7XG5cdFx0XHRcdGN0cy5jYW5jZWwoKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGluc3RydWN0aW9ucywgdW5kZWZpbmVkKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHJlYWRGaWxlU3R1Yi5yZXN0b3JlKCk7XG5cdFx0XHRcdGN0cy5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdkaWN0YXRpb24gaW5zdHJ1Y3Rpb25zJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2NvbWJpbmVzIHVzZXIgYW5kIHRydXN0ZWQgd29ya3NwYWNlIGRpY3RhdGlvbi5tZCBmaWxlcyBzZXBhcmF0ZWx5IGZyb20gdm9pY2UubWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UnKTtcblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7IHBhdGg6ICcvaG9tZS91c2VyLy5jb3BpbG90L2RpY3RhdGlvbi5tZCcsIGNvbnRlbnRzOiBbJ1VzZSBzaG9ydCBwYXJhZ3JhcGhzLiddIH0sXG5cdFx0XHRcdHsgcGF0aDogJy93b3Jrc3BhY2UvLmdpdGh1Yi9kaWN0YXRpb24ubWQnLCBjb250ZW50czogWydTcGVsbCB0aGUgcHJvZHVjdCBuYW1lIGFzIENvbnRvc28gREIuJ10gfSxcblx0XHRcdFx0eyBwYXRoOiAnL2hvbWUvdXNlci8uY29waWxvdC92b2ljZS5tZCcsIGNvbnRlbnRzOiBbJ0tlZXAgc3Bva2VuIHJlc3BvbnNlcyBjb25jaXNlLiddIH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgaW5zdHJ1Y3Rpb25zID0gYXdhaXQgc2VydmljZS5nZXREaWN0YXRpb25JbnN0cnVjdGlvbnMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnN0cnVjdGlvbnMsICdVc2Ugc2hvcnQgcGFyYWdyYXBocy5cXG5cXG5TcGVsbCB0aGUgcHJvZHVjdCBuYW1lIGFzIENvbnRvc28gREIuJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleGNsdWRlcyB3b3Jrc3BhY2UgZGljdGF0aW9uLm1kIHdoZW4gdGhlIHdvcmtzcGFjZSBpcyB1bnRydXN0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UnKTtcblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblx0XHRcdGF3YWl0IHdvcmtzcGFjZVRydXN0U2VydmljZS5zZXRXb3Jrc3BhY2VUcnVzdChmYWxzZSk7XG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0eyBwYXRoOiAnL2hvbWUvdXNlci8uY29waWxvdC9kaWN0YXRpb24ubWQnLCBjb250ZW50czogWydVc2Ugc2hvcnQgcGFyYWdyYXBocy4nXSB9LFxuXHRcdFx0XHR7IHBhdGg6ICcvd29ya3NwYWNlLy5naXRodWIvZGljdGF0aW9uLm1kJywgY29udGVudHM6IFsnVW50cnVzdGVkIHdvcmtzcGFjZSBndWlkYW5jZS4nXSB9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IGluc3RydWN0aW9ucyA9IGF3YWl0IHNlcnZpY2UuZ2V0RGljdGF0aW9uSW5zdHJ1Y3Rpb25zKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5zdHJ1Y3Rpb25zLCAnVXNlIHNob3J0IHBhcmFncmFwaHMuJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdwYXJzZScsICgpID0+IHtcblx0XHR0ZXN0KCdleHBsaWNpdCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJOYW1lID0gJ3Jlc29sdmVzLW5lc3RlZC1maWxlLXJlZmVyZW5jZXMnO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlciA9IGAvJHtyb290Rm9sZGVyTmFtZX1gO1xuXG5cdFx0XHRjb25zdCByb290RmlsZU5hbWUgPSAnZmlsZTIucHJvbXB0Lm1kJztcblxuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlclVyaSA9IFVSSS5maWxlKHJvb3RGb2xkZXIpO1xuXG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2UodGVzdFdvcmtzcGFjZShyb290Rm9sZGVyVXJpKSk7XG5cblx0XHRcdGNvbnN0IHJvb3RGaWxlVXJpID0gVVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksIHJvb3RGaWxlTmFtZSk7XG5cblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vZmlsZTEucHJvbXB0Lm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0JyMjIFNvbWUgSGVhZGVyJyxcblx0XHRcdFx0XHRcdCdzb21lIGNvbnRlbnRzJyxcblx0XHRcdFx0XHRcdCcgJyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vJHtyb290RmlsZU5hbWV9YCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFxcJ1Jvb3QgcHJvbXB0IGRlc2NyaXB0aW9uLlxcJycsXG5cdFx0XHRcdFx0XHQndG9vbHM6IFtcXCdteS10b29sMVxcJywgLCB0b29sXScsXG5cdFx0XHRcdFx0XHQnYWdlbnQ6IFwiYWdlbnRcIiAnLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnIyMgRmlsZXMnLFxuXHRcdFx0XHRcdFx0J1xcdC0gdGhpcyBmaWxlICNmaWxlOmZvbGRlcjEvZmlsZTMucHJvbXB0Lm1kICcsXG5cdFx0XHRcdFx0XHQnXFx0LSBhbHNvIHRoaXMgW2ZpbGU0LnByb21wdC5tZF0oLi9mb2xkZXIxL3NvbWUtb3RoZXItZm9sZGVyL2ZpbGU0LnByb21wdC5tZCkgcGxlYXNlIScsXG5cdFx0XHRcdFx0XHQnIyMgVmFycycsXG5cdFx0XHRcdFx0XHQnXFx0LSAjdG9vbDpteS10b29sJyxcblx0XHRcdFx0XHRcdCdcXHQtICN0b29sOm15LW90aGVyLXRvb2wnLFxuXHRcdFx0XHRcdFx0JyAnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS9mb2xkZXIxL2ZpbGUzLnByb21wdC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J3Rvb2xzOiBbIGZhbHNlLCBcXCdteS10b29sMVxcJyAsIF0nLFxuXHRcdFx0XHRcdFx0J2FnZW50OiBcXCdlZGl0XFwnJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0JycsXG5cdFx0XHRcdFx0XHQnW10oLi9zb21lLW90aGVyLWZvbGRlci9ub24tZXhpc3RpbmctZm9sZGVyKScsXG5cdFx0XHRcdFx0XHRgXFx0LSBzb21lIHNlZW1pbmdseSByYW5kb20gI2ZpbGU6JHtyb290Rm9sZGVyfS9mb2xkZXIxL3NvbWUtb3RoZXItZm9sZGVyL3lldEFub3RoZXJGb2xkZXJcdUQ4M0VcdUREMkQvYW5vdGhlci1maWxlLmluc3RydWN0aW9ucy5tZCBjb250ZW50c2AsXG5cdFx0XHRcdFx0XHQnIHNvbWUgbW9yZVxcdCBjb250ZW50Jyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vZm9sZGVyMS9zb21lLW90aGVyLWZvbGRlci9maWxlNC5wcm9tcHQubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCd0b29sczogW1xcJ215LXRvb2wxXFwnLCBcIm15LXRvb2wyXCIsIHRydWUsICwgXScsXG5cdFx0XHRcdFx0XHQnc29tZXRoaW5nOiB0cnVlJyxcblx0XHRcdFx0XHRcdCdhZ2VudDogXFwnYXNrXFwnXFx0Jyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJGaWxlIDQgc3BsZW5kaWQgZGVzY3JpcHRpb24uXCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQndGhpcyBmaWxlIGhhcyBhIG5vbi1leGlzdGluZyAjZmlsZTouL3NvbWUtbm9uLWV4aXN0aW5nL2ZpbGUucHJvbXB0Lm1kXFx0XFx0cmVmZXJlbmNlJyxcblx0XHRcdFx0XHRcdCcnLFxuXHRcdFx0XHRcdFx0JycsXG5cdFx0XHRcdFx0XHQnYW5kIHNvbWUnLFxuXHRcdFx0XHRcdFx0JyBub24tcHJvbXB0ICNmaWxlOi4vc29tZS1ub24tcHJvbXB0LWZpbGUubWRcXHRcXHQgXFx0W10oLi4vLi4vZm9sZGVyMS8pXFx0Jyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vZm9sZGVyMS9zb21lLW90aGVyLWZvbGRlci9maWxlLnR4dGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIk5vbi1wcm9tcHQgZmlsZSBkZXNjcmlwdGlvblwiLicsXG5cdFx0XHRcdFx0XHQndG9vbHM6IFtcIm15LXRvb2wtMjRcIl0nLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9L2ZvbGRlcjEvc29tZS1vdGhlci1mb2xkZXIveWV0QW5vdGhlckZvbGRlclx1RDgzRVx1REQyRC9hbm90aGVyLWZpbGUuaW5zdHJ1Y3Rpb25zLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiQW5vdGhlciBmaWxlIGRlc2NyaXB0aW9uLlwiJyxcblx0XHRcdFx0XHRcdCd0b29sczogW1xcJ215LXRvb2wzXFwnLCBcIm15LXRvb2wyXCIgXScsXG5cdFx0XHRcdFx0XHQnYXBwbHlUbzogXCIqKi8qLnRzeFwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0YFtdKCR7cm9vdEZvbGRlcn0vZm9sZGVyMS9zb21lLW90aGVyLWZvbGRlcilgLFxuXHRcdFx0XHRcdFx0J2Fub3RoZXItZmlsZS5pbnN0cnVjdGlvbnMubWQgY29udGVudHNcXHQgWyNmaWxlOmZpbGUudHh0XSguLi9maWxlLnR4dCknLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS9mb2xkZXIxL3NvbWUtb3RoZXItZm9sZGVyL3lldEFub3RoZXJGb2xkZXJcdUQ4M0VcdUREMkQvb25lX21vcmVfZmlsZV9qdXN0X2luX2Nhc2UucHJvbXB0Lm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogWydvbmVfbW9yZV9maWxlX2p1c3RfaW5fY2FzZS5wcm9tcHQubWQgY29udGVudHMnXSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBmaWxlMyA9IFVSSS5qb2luUGF0aChyb290Rm9sZGVyVXJpLCAnZm9sZGVyMS9maWxlMy5wcm9tcHQubWQnKTtcblx0XHRcdGNvbnN0IGZpbGU0ID0gVVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICdmb2xkZXIxL3NvbWUtb3RoZXItZm9sZGVyL2ZpbGU0LnByb21wdC5tZCcpO1xuXHRcdFx0Y29uc3Qgc29tZU90aGVyRm9sZGVyID0gVVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICcvZm9sZGVyMS9zb21lLW90aGVyLWZvbGRlcicpO1xuXHRcdFx0Y29uc3Qgc29tZU90aGVyRm9sZGVyRmlsZSA9IFVSSS5qb2luUGF0aChyb290Rm9sZGVyVXJpLCAnL2ZvbGRlcjEvc29tZS1vdGhlci1mb2xkZXIvZmlsZS50eHQnKTtcblx0XHRcdGNvbnN0IG5vbkV4aXN0aW5nRm9sZGVyID0gVVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICdmb2xkZXIxL3NvbWUtb3RoZXItZm9sZGVyL25vbi1leGlzdGluZy1mb2xkZXInKTtcblx0XHRcdGNvbnN0IHlldEFub3RoZXJGaWxlID0gVVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICdmb2xkZXIxL3NvbWUtb3RoZXItZm9sZGVyL3lldEFub3RoZXJGb2xkZXJcdUQ4M0VcdUREMkQvYW5vdGhlci1maWxlLmluc3RydWN0aW9ucy5tZCcpO1xuXG5cblx0XHRcdGNvbnN0IHJlc3VsdDEgPSBhd2FpdCBzZXJ2aWNlLnBhcnNlTmV3KHJvb3RGaWxlVXJpLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0MS51cmksIHJvb3RGaWxlVXJpKTtcblx0XHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0MS5oZWFkZXI/LmRlc2NyaXB0aW9uLCAnUm9vdCBwcm9tcHQgZGVzY3JpcHRpb24uJyk7XG5cdFx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdDEuaGVhZGVyPy50b29scywgWydteS10b29sMScsICd0b29sJ10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQxLmhlYWRlcj8uYWdlbnQsICdhZ2VudCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdDEuYm9keSk7XG5cdFx0XHRhc3NlcnQuZGVlcEVxdWFsKFxuXHRcdFx0XHRyZXN1bHQxLmJvZHkuZmlsZVJlZmVyZW5jZXMubWFwKHIgPT4gcmVzdWx0MS5ib2R5Py5yZXNvbHZlRmlsZVBhdGgoci5jb250ZW50KSksXG5cdFx0XHRcdFtmaWxlMywgZmlsZTRdLFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5kZWVwRXF1YWwoXG5cdFx0XHRcdHJlc3VsdDEuYm9keS52YXJpYWJsZVJlZmVyZW5jZXMsXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR7IG5hbWU6ICdteS10b29sJywgcmFuZ2U6IG5ldyBSYW5nZSgxMCwgMTAsIDEwLCAxNyksIG9mZnNldDogMjQwLCBmdWxsTGVuZ3RoOiAxMyB9LFxuXHRcdFx0XHRcdHsgbmFtZTogJ215LW90aGVyLXRvb2wnLCByYW5nZTogbmV3IFJhbmdlKDExLCAxMCwgMTEsIDIzKSwgb2Zmc2V0OiAyNTcsIGZ1bGxMZW5ndGg6IDE5IH0sXG5cdFx0XHRcdF1cblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdDIgPSBhd2FpdCBzZXJ2aWNlLnBhcnNlTmV3KGZpbGUzLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0Mi51cmksIGZpbGUzKTtcblx0XHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0Mi5oZWFkZXI/LmFnZW50LCAnZWRpdCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdDIuYm9keSk7XG5cdFx0XHRhc3NlcnQuZGVlcEVxdWFsKFxuXHRcdFx0XHRyZXN1bHQyLmJvZHkuZmlsZVJlZmVyZW5jZXMubWFwKHIgPT4gcmVzdWx0Mi5ib2R5Py5yZXNvbHZlRmlsZVBhdGgoci5jb250ZW50KSksXG5cdFx0XHRcdFtub25FeGlzdGluZ0ZvbGRlciwgeWV0QW5vdGhlckZpbGVdLFxuXHRcdFx0KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0MyA9IGF3YWl0IHNlcnZpY2UucGFyc2VOZXcoeWV0QW5vdGhlckZpbGUsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQzLnVyaSwgeWV0QW5vdGhlckZpbGUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQzLmhlYWRlcj8uZGVzY3JpcHRpb24sICdBbm90aGVyIGZpbGUgZGVzY3JpcHRpb24uJyk7XG5cdFx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdDMuaGVhZGVyPy5hcHBseVRvLCAnKiovKi50c3gnKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQzLmJvZHkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBFcXVhbChcblx0XHRcdFx0cmVzdWx0My5ib2R5LmZpbGVSZWZlcmVuY2VzLm1hcChyID0+IHJlc3VsdDMuYm9keT8ucmVzb2x2ZUZpbGVQYXRoKHIuY29udGVudCkpLFxuXHRcdFx0XHRbc29tZU90aGVyRm9sZGVyLCBzb21lT3RoZXJGb2xkZXJGaWxlXSxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdDMuYm9keS52YXJpYWJsZVJlZmVyZW5jZXMsIFtdKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0NCA9IGF3YWl0IHNlcnZpY2UucGFyc2VOZXcoZmlsZTQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQ0LnVyaSwgZmlsZTQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQ0LmhlYWRlcj8uZGVzY3JpcHRpb24sICdGaWxlIDQgc3BsZW5kaWQgZGVzY3JpcHRpb24uJyk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0NC5ib2R5KTtcblx0XHRcdGFzc2VydC5kZWVwRXF1YWwoXG5cdFx0XHRcdHJlc3VsdDQuYm9keS5maWxlUmVmZXJlbmNlcy5tYXAociA9PiByZXN1bHQ0LmJvZHk/LnJlc29sdmVGaWxlUGF0aChyLmNvbnRlbnQpKSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdFVSSS5qb2luUGF0aChyb290Rm9sZGVyVXJpLCAnL2ZvbGRlcjEvc29tZS1vdGhlci1mb2xkZXIvc29tZS1ub24tZXhpc3RpbmcvZmlsZS5wcm9tcHQubWQnKSxcblx0XHRcdFx0XHRVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJy9mb2xkZXIxL3NvbWUtb3RoZXItZm9sZGVyL3NvbWUtbm9uLXByb21wdC1maWxlLm1kJyksXG5cdFx0XHRcdFx0VVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICcvZm9sZGVyMS8nKSxcblx0XHRcdFx0XSxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdDQuYm9keS52YXJpYWJsZVJlZmVyZW5jZXMsIFtdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2ZpbmRJbnN0cnVjdGlvbkZpbGVzRm9yJywgKCkgPT4ge1xuXHRcdHRlYXJkb3duKCgpID0+IHtcblx0XHRcdHNpbm9uLnJlc3RvcmUoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZpbmRzIGNvcnJlY3QgaW5zdHJ1Y3Rpb24gZmlsZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICdmaW5kcy1pbnN0cnVjdGlvbi1maWxlcyc7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyID0gYC8ke3Jvb3RGb2xkZXJOYW1lfWA7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUocm9vdEZvbGRlcik7XG5cblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblxuXHRcdFx0Y29uc3QgdXNlclByb21wdHNGb2xkZXJOYW1lID0gJy90bXAvdXNlci1kYXRhL3Byb21wdHMnO1xuXHRcdFx0Y29uc3QgdXNlclByb21wdHNGb2xkZXJVcmkgPSBVUkkuZmlsZSh1c2VyUHJvbXB0c0ZvbGRlck5hbWUpO1xuXG5cdFx0XHRzaW5vbi5zdHViKHNlcnZpY2UsICdsaXN0UHJvbXB0RmlsZXMnKVxuXHRcdFx0XHQucmV0dXJucyhQcm9taXNlLnJlc29sdmUoW1xuXHRcdFx0XHRcdC8vIGxvY2FsIGluc3RydWN0aW9uc1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHVyaTogVVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICcuZ2l0aHViL3Byb21wdHMvZmlsZTEuaW5zdHJ1Y3Rpb25zLm1kJyksXG5cdFx0XHRcdFx0XHRzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCxcblx0XHRcdFx0XHRcdHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHVyaTogVVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICcuZ2l0aHViL3Byb21wdHMvZmlsZTIuaW5zdHJ1Y3Rpb25zLm1kJyksXG5cdFx0XHRcdFx0XHRzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCxcblx0XHRcdFx0XHRcdHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHVyaTogVVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICcuZ2l0aHViL3Byb21wdHMvZmlsZTMuaW5zdHJ1Y3Rpb25zLm1kJyksXG5cdFx0XHRcdFx0XHRzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCxcblx0XHRcdFx0XHRcdHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHVyaTogVVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICcuZ2l0aHViL3Byb21wdHMvZmlsZTQuaW5zdHJ1Y3Rpb25zLm1kJyksXG5cdFx0XHRcdFx0XHRzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCxcblx0XHRcdFx0XHRcdHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdC8vIHVzZXIgaW5zdHJ1Y3Rpb25zXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dXJpOiBVUkkuam9pblBhdGgodXNlclByb21wdHNGb2xkZXJVcmksICdmaWxlMTAuaW5zdHJ1Y3Rpb25zLm1kJyksXG5cdFx0XHRcdFx0XHRzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS51c2VyLFxuXHRcdFx0XHRcdFx0dHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dXJpOiBVUkkuam9pblBhdGgodXNlclByb21wdHNGb2xkZXJVcmksICdmaWxlMTEuaW5zdHJ1Y3Rpb25zLm1kJyksXG5cdFx0XHRcdFx0XHRzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS51c2VyLFxuXHRcdFx0XHRcdFx0dHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdF0pKTtcblxuXHRcdFx0Ly8gbW9jayBjdXJyZW50IHdvcmtzcGFjZSBmaWxlIHN0cnVjdHVyZVxuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS9maWxlMS5wcm9tcHQubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnIyMgU29tZSBIZWFkZXInLFxuXHRcdFx0XHRcdFx0J3NvbWUgY29udGVudHMnLFxuXHRcdFx0XHRcdFx0JyAnLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvcHJvbXB0cy9maWxlMS5pbnN0cnVjdGlvbnMubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnSW5zdHJ1Y3Rpb25zIGZpbGUgMS5cXCcnLFxuXHRcdFx0XHRcdFx0J2FwcGx5VG86IFwiKiovKi50c3hcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdTb21lIGluc3RydWN0aW9ucyAxIGNvbnRlbnRzLicsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9wcm9tcHRzL2ZpbGUyLmluc3RydWN0aW9ucy5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcXCdJbnN0cnVjdGlvbnMgZmlsZSAyLlxcJycsXG5cdFx0XHRcdFx0XHQnYXBwbHlUbzogXCIqKi9mb2xkZXIxLyoudHN4XCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnU29tZSBpbnN0cnVjdGlvbnMgMiBjb250ZW50cy4nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvcHJvbXB0cy9maWxlMy5pbnN0cnVjdGlvbnMubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnSW5zdHJ1Y3Rpb25zIGZpbGUgMy5cXCcnLFxuXHRcdFx0XHRcdFx0J2FwcGx5VG86IFwiKiovZm9sZGVyMi8qLnRzeFwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1NvbWUgaW5zdHJ1Y3Rpb25zIDMgY29udGVudHMuJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL3Byb21wdHMvZmlsZTQuaW5zdHJ1Y3Rpb25zLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFxcJ0luc3RydWN0aW9ucyBmaWxlIDQuXFwnJyxcblx0XHRcdFx0XHRcdCdhcHBseVRvOiBcInNyYy9idWlsZC8qLnRzeFwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1NvbWUgaW5zdHJ1Y3Rpb25zIDQgY29udGVudHMuJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL3Byb21wdHMvZmlsZTUucHJvbXB0Lm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFxcJ1Byb21wdCBmaWxlIDUuXFwnJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1NvbWUgcHJvbXB0IDUgY29udGVudHMuJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS9mb2xkZXIxL21haW4udHN4YCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0J2NvbnNvbGUubG9nKFwiSGFhbG91IVwiKSdcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXG5cdFx0XHQvLyBtb2NrIHVzZXIgZGF0YSBpbnN0cnVjdGlvbnNcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7dXNlclByb21wdHNGb2xkZXJOYW1lfS9maWxlMTAuaW5zdHJ1Y3Rpb25zLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFxcJ0luc3RydWN0aW9ucyBmaWxlIDEwLlxcJycsXG5cdFx0XHRcdFx0XHQnYXBwbHlUbzogXCIqKi9mb2xkZXIxLyoudHN4XCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnU29tZSBpbnN0cnVjdGlvbnMgMTAgY29udGVudHMuJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHt1c2VyUHJvbXB0c0ZvbGRlck5hbWV9L2ZpbGUxMS5pbnN0cnVjdGlvbnMubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnSW5zdHJ1Y3Rpb25zIGZpbGUgMTEuXFwnJyxcblx0XHRcdFx0XHRcdCdhcHBseVRvOiBcIioqL2ZvbGRlcjEvKi5weVwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1NvbWUgaW5zdHJ1Y3Rpb25zIDExIGNvbnRlbnRzLicsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7dXNlclByb21wdHNGb2xkZXJOYW1lfS9maWxlMTIucHJvbXB0Lm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFxcJ1Byb21wdCBmaWxlIDEyLlxcJycsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdTb21lIHByb21wdCAxMiBjb250ZW50cy4nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fVxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IGluc3RydWN0aW9uRmlsZXMgPSBhd2FpdCBzZXJ2aWNlLmdldEluc3RydWN0aW9uRmlsZXMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRjb25zdCBjb250ZXh0Q29tcHV0ZXIgPSBpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29tcHV0ZUF1dG9tYXRpY0luc3RydWN0aW9ucywgQ2hhdE1vZGVLaW5kLkFnZW50LCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgJ2xvY2FsJyk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0ge1xuXHRcdFx0XHRmaWxlczogbmV3IFJlc291cmNlU2V0KFtcblx0XHRcdFx0XHRVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJ2ZvbGRlcjEvbWFpbi50c3gnKSxcblx0XHRcdFx0XSksXG5cdFx0XHRcdGluc3RydWN0aW9uczogbmV3IFJlc291cmNlU2V0KCksXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gbmV3IENoYXRSZXF1ZXN0VmFyaWFibGVTZXQoKTtcblxuXHRcdFx0YXdhaXQgY29udGV4dENvbXB1dGVyLmFkZEFwcGx5aW5nSW5zdHJ1Y3Rpb25zKGluc3RydWN0aW9uRmlsZXMsIGNvbnRleHQsIHJlc3VsdCwgbmV3SW5zdHJ1Y3Rpb25zQ29sbGVjdGlvbkV2ZW50KCksIG5ld0luc3RydWN0aW9uc0NvbGxlY3Rpb25EZWJ1Z0luZm8oKSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHJlc3VsdC5hc0FycmF5KCkubWFwKGkgPT4gaXNQcm9tcHRGaWxlVmFyaWFibGVFbnRyeShpKSA/IGkudmFsdWUucGF0aCA6IHVuZGVmaW5lZCksXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQvLyBsb2NhbCBpbnN0cnVjdGlvbnNcblx0XHRcdFx0XHRVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJy5naXRodWIvcHJvbXB0cy9maWxlMS5pbnN0cnVjdGlvbnMubWQnKS5wYXRoLFxuXHRcdFx0XHRcdFVSSS5qb2luUGF0aChyb290Rm9sZGVyVXJpLCAnLmdpdGh1Yi9wcm9tcHRzL2ZpbGUyLmluc3RydWN0aW9ucy5tZCcpLnBhdGgsXG5cdFx0XHRcdFx0Ly8gdXNlciBpbnN0cnVjdGlvbnNcblx0XHRcdFx0XHRVUkkuam9pblBhdGgodXNlclByb21wdHNGb2xkZXJVcmksICdmaWxlMTAuaW5zdHJ1Y3Rpb25zLm1kJykucGF0aCxcblx0XHRcdFx0XSxcblx0XHRcdFx0J011c3QgZmluZCBjb3JyZWN0IGluc3RydWN0aW9uIGZpbGVzLicsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgaGF2ZSBkdXBsaWNhdGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlck5hbWUgPSAnZmluZHMtaW5zdHJ1Y3Rpb24tZmlsZXMtd2l0aG91dC1kdXBsaWNhdGVzJztcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZShyb290Rm9sZGVyKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHRjb25zdCB1c2VyUHJvbXB0c0ZvbGRlck5hbWUgPSAnL3RtcC91c2VyLWRhdGEvcHJvbXB0cyc7XG5cdFx0XHRjb25zdCB1c2VyUHJvbXB0c0ZvbGRlclVyaSA9IFVSSS5maWxlKHVzZXJQcm9tcHRzRm9sZGVyTmFtZSk7XG5cblx0XHRcdHNpbm9uLnN0dWIoc2VydmljZSwgJ2xpc3RQcm9tcHRGaWxlcycpXG5cdFx0XHRcdC5yZXR1cm5zKFByb21pc2UucmVzb2x2ZShbXG5cdFx0XHRcdFx0Ly8gbG9jYWwgaW5zdHJ1Y3Rpb25zXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dXJpOiBVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJy5naXRodWIvcHJvbXB0cy9maWxlMS5pbnN0cnVjdGlvbnMubWQnKSxcblx0XHRcdFx0XHRcdHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLFxuXHRcdFx0XHRcdFx0dHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dXJpOiBVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJy5naXRodWIvcHJvbXB0cy9maWxlMi5pbnN0cnVjdGlvbnMubWQnKSxcblx0XHRcdFx0XHRcdHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLFxuXHRcdFx0XHRcdFx0dHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dXJpOiBVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJy5naXRodWIvcHJvbXB0cy9maWxlMy5pbnN0cnVjdGlvbnMubWQnKSxcblx0XHRcdFx0XHRcdHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLFxuXHRcdFx0XHRcdFx0dHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dXJpOiBVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJy5naXRodWIvcHJvbXB0cy9maWxlNC5pbnN0cnVjdGlvbnMubWQnKSxcblx0XHRcdFx0XHRcdHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLFxuXHRcdFx0XHRcdFx0dHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Ly8gdXNlciBpbnN0cnVjdGlvbnNcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR1cmk6IFVSSS5qb2luUGF0aCh1c2VyUHJvbXB0c0ZvbGRlclVyaSwgJ2ZpbGUxMC5pbnN0cnVjdGlvbnMubWQnKSxcblx0XHRcdFx0XHRcdHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLnVzZXIsXG5cdFx0XHRcdFx0XHR0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR1cmk6IFVSSS5qb2luUGF0aCh1c2VyUHJvbXB0c0ZvbGRlclVyaSwgJ2ZpbGUxMS5pbnN0cnVjdGlvbnMubWQnKSxcblx0XHRcdFx0XHRcdHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLnVzZXIsXG5cdFx0XHRcdFx0XHR0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XSkpO1xuXG5cdFx0XHQvLyBtb2NrIGN1cnJlbnQgd29ya3NwYWNlIGZpbGUgc3RydWN0dXJlXG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9L2ZpbGUxLnByb21wdC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCcjIyBTb21lIEhlYWRlcicsXG5cdFx0XHRcdFx0XHQnc29tZSBjb250ZW50cycsXG5cdFx0XHRcdFx0XHQnICcsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9wcm9tcHRzL2ZpbGUxLmluc3RydWN0aW9ucy5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcXCdJbnN0cnVjdGlvbnMgZmlsZSAxLlxcJycsXG5cdFx0XHRcdFx0XHQnYXBwbHlUbzogXCIqKi8qLnRzeFwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1NvbWUgaW5zdHJ1Y3Rpb25zIDEgY29udGVudHMuJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL3Byb21wdHMvZmlsZTIuaW5zdHJ1Y3Rpb25zLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFxcJ0luc3RydWN0aW9ucyBmaWxlIDIuXFwnJyxcblx0XHRcdFx0XHRcdCdhcHBseVRvOiBcIioqL2ZvbGRlcjEvKi50c3hcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdTb21lIGluc3RydWN0aW9ucyAyIGNvbnRlbnRzLiBbXSguL2ZpbGUxLmluc3RydWN0aW9ucy5tZCknLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvcHJvbXB0cy9maWxlMy5pbnN0cnVjdGlvbnMubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnSW5zdHJ1Y3Rpb25zIGZpbGUgMy5cXCcnLFxuXHRcdFx0XHRcdFx0J2FwcGx5VG86IFwiKiovZm9sZGVyMi8qLnRzeFwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1NvbWUgaW5zdHJ1Y3Rpb25zIDMgY29udGVudHMuJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL3Byb21wdHMvZmlsZTQuaW5zdHJ1Y3Rpb25zLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFxcJ0luc3RydWN0aW9ucyBmaWxlIDQuXFwnJyxcblx0XHRcdFx0XHRcdCdhcHBseVRvOiBcInNyYy9idWlsZC8qLnRzeFwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1tdKC4vZmlsZTMuaW5zdHJ1Y3Rpb25zLm1kKSBTb21lIGluc3RydWN0aW9ucyA0IGNvbnRlbnRzLicsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9wcm9tcHRzL2ZpbGU1LnByb21wdC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcXCdQcm9tcHQgZmlsZSA1LlxcJycsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdTb21lIHByb21wdCA1IGNvbnRlbnRzLicsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vZm9sZGVyMS9tYWluLnRzeGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCdjb25zb2xlLmxvZyhcIkhhYWxvdSFcIiknXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9XG5cdFx0XHRdKTtcblxuXHRcdFx0Ly8gbW9jayB1c2VyIGRhdGEgaW5zdHJ1Y3Rpb25zXG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3VzZXJQcm9tcHRzRm9sZGVyTmFtZX0vZmlsZTEwLmluc3RydWN0aW9ucy5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcXCdJbnN0cnVjdGlvbnMgZmlsZSAxMC5cXCcnLFxuXHRcdFx0XHRcdFx0J2FwcGx5VG86IFwiKiovZm9sZGVyMS8qLnRzeFwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1NvbWUgaW5zdHJ1Y3Rpb25zIDEwIGNvbnRlbnRzLicsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7dXNlclByb21wdHNGb2xkZXJOYW1lfS9maWxlMTEuaW5zdHJ1Y3Rpb25zLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFxcJ0luc3RydWN0aW9ucyBmaWxlIDExLlxcJycsXG5cdFx0XHRcdFx0XHQnYXBwbHlUbzogXCIqKi9mb2xkZXIxLyoucHlcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdTb21lIGluc3RydWN0aW9ucyAxMSBjb250ZW50cy4nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3VzZXJQcm9tcHRzRm9sZGVyTmFtZX0vZmlsZTEyLnByb21wdC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcXCdQcm9tcHQgZmlsZSAxMi5cXCcnLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnU29tZSBwcm9tcHQgMTIgY29udGVudHMuJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBpbnN0cnVjdGlvbkZpbGVzID0gYXdhaXQgc2VydmljZS5nZXRJbnN0cnVjdGlvbkZpbGVzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0Y29uc3QgY29udGV4dENvbXB1dGVyID0gaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbXB1dGVBdXRvbWF0aWNJbnN0cnVjdGlvbnMsIENoYXRNb2RlS2luZC5BZ2VudCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsICdsb2NhbCcpO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IHtcblx0XHRcdFx0ZmlsZXM6IG5ldyBSZXNvdXJjZVNldChbXG5cdFx0XHRcdFx0VVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICdmb2xkZXIxL21haW4udHN4JyksXG5cdFx0XHRcdFx0VVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICdmb2xkZXIxL2luZGV4LnRzeCcpLFxuXHRcdFx0XHRcdFVSSS5qb2luUGF0aChyb290Rm9sZGVyVXJpLCAnZm9sZGVyMS9jb25zdGFudHMudHN4JyksXG5cdFx0XHRcdF0pLFxuXHRcdFx0XHRpbnN0cnVjdGlvbnM6IG5ldyBSZXNvdXJjZVNldCgpLFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gbmV3IENoYXRSZXF1ZXN0VmFyaWFibGVTZXQoKTtcblx0XHRcdGF3YWl0IGNvbnRleHRDb21wdXRlci5hZGRBcHBseWluZ0luc3RydWN0aW9ucyhpbnN0cnVjdGlvbkZpbGVzLCBjb250ZXh0LCByZXN1bHQsIG5ld0luc3RydWN0aW9uc0NvbGxlY3Rpb25FdmVudCgpLCBuZXdJbnN0cnVjdGlvbnNDb2xsZWN0aW9uRGVidWdJbmZvKCksIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRyZXN1bHQuYXNBcnJheSgpLm1hcChpID0+IGlzUHJvbXB0RmlsZVZhcmlhYmxlRW50cnkoaSkgPyBpLnZhbHVlLnBhdGggOiB1bmRlZmluZWQpLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0Ly8gbG9jYWwgaW5zdHJ1Y3Rpb25zXG5cdFx0XHRcdFx0VVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICcuZ2l0aHViL3Byb21wdHMvZmlsZTEuaW5zdHJ1Y3Rpb25zLm1kJykucGF0aCxcblx0XHRcdFx0XHRVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJy5naXRodWIvcHJvbXB0cy9maWxlMi5pbnN0cnVjdGlvbnMubWQnKS5wYXRoLFxuXHRcdFx0XHRcdC8vIHVzZXIgaW5zdHJ1Y3Rpb25zXG5cdFx0XHRcdFx0VVJJLmpvaW5QYXRoKHVzZXJQcm9tcHRzRm9sZGVyVXJpLCAnZmlsZTEwLmluc3RydWN0aW9ucy5tZCcpLnBhdGgsXG5cdFx0XHRcdF0sXG5cdFx0XHRcdCdNdXN0IGZpbmQgY29ycmVjdCBpbnN0cnVjdGlvbiBmaWxlcy4nLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvcGlsb3QtaW5zdHJ1Y3Rpb25zIGFuZCBBR0VOVFMubWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICdjb3BpbG90LWluc3RydWN0aW9ucy1hbmQtYWdlbnRzJztcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZShyb290Rm9sZGVyKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHQvLyBtb2NrIGN1cnJlbnQgd29ya3NwYWNlIGZpbGUgc3RydWN0dXJlXG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9L2NvZGVzdHlsZS5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCdDYW4geW91IHNlZSB0aGlzPycsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vQUdFTlRTLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0J1doYXQgYWJvdXQgdGhpcz8nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9L1JFQURNRS5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCdUaGF0cyBteSBwcm9qZWN0PycsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9jb3BpbG90LWluc3RydWN0aW9ucy5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCdCZSBuaWNlIGFuZCBmcmllbmRseS4gQWxzbyBsb29rIGF0IGluc3RydWN0aW9ucyBhdCAjZmlsZTouLi9jb2Rlc3R5bGUubWQgYW5kIFttb3JlLWNvZGVzdHlsZS5tZF0oLi9tb3JlLWNvZGVzdHlsZS5tZCkuJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL21vcmUtY29kZXN0eWxlLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0J0kgbGlrZSBpdCBjbGVhbi4nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9L2ZvbGRlcjEvQUdFTlRTLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0J0FuIEFHRU5UUy5tZCBmaWxlIGluIGFub3RoZXIgcmVwbydcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXG5cblx0XHRcdGNvbnN0IGNvbnRleHRDb21wdXRlciA9IGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb21wdXRlQXV0b21hdGljSW5zdHJ1Y3Rpb25zLCBDaGF0TW9kZUtpbmQuQWdlbnQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCAnbG9jYWwnKTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBuZXcgQ2hhdFJlcXVlc3RWYXJpYWJsZVNldCgpO1xuXHRcdFx0Y29udGV4dC5hZGQodG9GaWxlVmFyaWFibGVFbnRyeShVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJ1JFQURNRS5tZCcpKSk7XG5cblx0XHRcdGF3YWl0IGNvbnRleHRDb21wdXRlci5jb2xsZWN0KGNvbnRleHQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRjb250ZXh0LmFzQXJyYXkoKS5tYXAoaSA9PiBpc1Byb21wdEZpbGVWYXJpYWJsZUVudHJ5KGkpID8gaS52YWx1ZS5wYXRoIDogdW5kZWZpbmVkKS5maWx0ZXIoZSA9PiAhIWUpLnNvcnQoKSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdFVSSS5qb2luUGF0aChyb290Rm9sZGVyVXJpLCAnLmdpdGh1Yi9jb3BpbG90LWluc3RydWN0aW9ucy5tZCcpLnBhdGgsXG5cdFx0XHRcdFx0VVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICcuZ2l0aHViL21vcmUtY29kZXN0eWxlLm1kJykucGF0aCxcblx0XHRcdFx0XHRVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJ0FHRU5UUy5tZCcpLnBhdGgsXG5cdFx0XHRcdFx0VVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICdjb2Rlc3R5bGUubWQnKS5wYXRoLFxuXHRcdFx0XHRdLnNvcnQoKSxcblx0XHRcdFx0J011c3QgZmluZCBjb3JyZWN0IGluc3RydWN0aW9uIGZpbGVzLicsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXhwb3NlcyBvbkRpZENoYW5nZUFnZW50SW5zdHJ1Y3Rpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IHNlcnZpY2Uub25EaWRDaGFuZ2VBZ2VudEluc3RydWN0aW9ucygoKSA9PiB7IH0pO1xuXHRcdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDApKTtcblx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZ2V0Q3VzdG9tQWdlbnRzJywgKCkgPT4ge1xuXHRcdHRlYXJkb3duKCgpID0+IHtcblx0XHRcdHNpbm9uLnJlc3RvcmUoKTtcblx0XHR9KTtcblxuXG5cdFx0dGVzdCgnaGVhZGVyIHdpdGggaGFuZE9mZnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICdjdXN0b20tYWdlbnRzLXdpdGgtaGFuZG9mZnMnO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlciA9IGAvJHtyb290Rm9sZGVyTmFtZX1gO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlclVyaSA9IFVSSS5maWxlKHJvb3RGb2xkZXIpO1xuXG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2UodGVzdFdvcmtzcGFjZShyb290Rm9sZGVyVXJpKSk7XG5cblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9hZ2VudHMvYWdlbnQxLmFnZW50Lm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFxcJ0FnZW50IGZpbGUgMS5cXCcnLFxuXHRcdFx0XHRcdFx0J2hhbmRvZmZzOiBbIHsgYWdlbnQ6IFwiRWRpdFwiLCBsYWJlbDogXCJEbyBpdFwiLCBwcm9tcHQ6IFwiRG8gaXQgbm93XCIgfSBdJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fVxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IChhd2FpdCBzZXJ2aWNlLmdldEN1c3RvbUFnZW50cyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSkubWFwKGFnZW50ID0+ICh7IC4uLmFnZW50LCB1cmk6IFVSSS5mcm9tKGFnZW50LnVyaSkgfSkpO1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWQ6IElDdXN0b21BZ2VudFtdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IFVSSS5qb2luUGF0aChyb290Rm9sZGVyVXJpLCAnLmdpdGh1Yi9hZ2VudHMvYWdlbnQxLmFnZW50Lm1kJykudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRuYW1lOiAnYWdlbnQxJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0FnZW50IGZpbGUgMS4nLFxuXHRcdFx0XHRcdGhhbmRPZmZzOiBbeyBhZ2VudDogJ0VkaXQnLCBsYWJlbDogJ0RvIGl0JywgcHJvbXB0OiAnRG8gaXQgbm93JyB9XSxcblx0XHRcdFx0XHRhZ2VudEluc3RydWN0aW9uczoge1xuXHRcdFx0XHRcdFx0Y29udGVudDogJycsXG5cdFx0XHRcdFx0XHR0b29sUmVmZXJlbmNlczogW10sXG5cdFx0XHRcdFx0XHRtZXRhZGF0YTogdW5kZWZpbmVkXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRtb2RlbDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGFyZ3VtZW50SGludDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHRvb2xzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dGFyZ2V0OiBUYXJnZXQuVW5kZWZpbmVkLFxuXHRcdFx0XHRcdHZpc2liaWxpdHk6IHsgdXNlckludm9jYWJsZTogdHJ1ZSwgYWdlbnRJbnZvY2FibGU6IHRydWUgfSxcblx0XHRcdFx0XHRhZ2VudHM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRob29rczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHNlc3Npb25UeXBlczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHVyaTogVVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICcuZ2l0aHViL2FnZW50cy9hZ2VudDEuYWdlbnQubWQnKSxcblx0XHRcdFx0XHRzb3VyY2U6IHsgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwgfSxcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBFcXVhbChcblx0XHRcdFx0cmVzdWx0LFxuXHRcdFx0XHRleHBlY3RlZCxcblx0XHRcdFx0J011c3QgZ2V0IGN1c3RvbSBhZ2VudHMuJyxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdib2R5IHdpdGggdG9vbCByZWZlcmVuY2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlck5hbWUgPSAnY3VzdG9tLWFnZW50cyc7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyID0gYC8ke3Jvb3RGb2xkZXJOYW1lfWA7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUocm9vdEZvbGRlcik7XG5cblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblxuXHRcdFx0Ly8gbW9jayBjdXJyZW50IHdvcmtzcGFjZSBmaWxlIHN0cnVjdHVyZVxuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL2FnZW50cy9hZ2VudDEuYWdlbnQubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnQWdlbnQgZmlsZSAxLlxcJycsXG5cdFx0XHRcdFx0XHQndG9vbHM6IFsgdG9vbDEsIHRvb2wyIF0nLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnRG8gaXQgd2l0aCAjdG9vbDp0b29sMScsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9hZ2VudHMvYWdlbnQyLmFnZW50Lm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0J0ZpcnN0IHVzZSAjdG9vbDp0b29sMlxcblRoZW4gdXNlICN0b29sOnRvb2wxJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSAoYXdhaXQgc2VydmljZS5nZXRDdXN0b21BZ2VudHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpLm1hcChhZ2VudCA9PiAoeyAuLi5hZ2VudCwgdXJpOiBVUkkuZnJvbShhZ2VudC51cmkpIH0pKTtcblx0XHRcdGNvbnN0IGV4cGVjdGVkOiBJQ3VzdG9tQWdlbnRbXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJy5naXRodWIvYWdlbnRzL2FnZW50MS5hZ2VudC5tZCcpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0bmFtZTogJ2FnZW50MScsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdBZ2VudCBmaWxlIDEuJyxcblx0XHRcdFx0XHR0b29sczogWyd0b29sMScsICd0b29sMiddLFxuXHRcdFx0XHRcdGFnZW50SW5zdHJ1Y3Rpb25zOiB7XG5cdFx0XHRcdFx0XHRjb250ZW50OiAnRG8gaXQgd2l0aCAjdG9vbDp0b29sMScsXG5cdFx0XHRcdFx0XHR0b29sUmVmZXJlbmNlczogW3sgbmFtZTogJ3Rvb2wxJywgcmFuZ2U6IHsgc3RhcnQ6IDExLCBlbmRFeGNsdXNpdmU6IDIyIH0gfV0sXG5cdFx0XHRcdFx0XHRtZXRhZGF0YTogdW5kZWZpbmVkXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRoYW5kT2ZmczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGVsOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0YXJndW1lbnRIaW50OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dGFyZ2V0OiBUYXJnZXQuVW5kZWZpbmVkLFxuXHRcdFx0XHRcdHZpc2liaWxpdHk6IHsgdXNlckludm9jYWJsZTogdHJ1ZSwgYWdlbnRJbnZvY2FibGU6IHRydWUgfSxcblx0XHRcdFx0XHRhZ2VudHM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRob29rczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHNlc3Npb25UeXBlczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHVyaTogVVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICcuZ2l0aHViL2FnZW50cy9hZ2VudDEuYWdlbnQubWQnKSxcblx0XHRcdFx0XHRzb3VyY2U6IHsgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwgfSxcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IFVSSS5qb2luUGF0aChyb290Rm9sZGVyVXJpLCAnLmdpdGh1Yi9hZ2VudHMvYWdlbnQyLmFnZW50Lm1kJykudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRuYW1lOiAnYWdlbnQyJyxcblx0XHRcdFx0XHRhZ2VudEluc3RydWN0aW9uczoge1xuXHRcdFx0XHRcdFx0Y29udGVudDogJ0ZpcnN0IHVzZSAjdG9vbDp0b29sMlxcblRoZW4gdXNlICN0b29sOnRvb2wxJyxcblx0XHRcdFx0XHRcdHRvb2xSZWZlcmVuY2VzOiBbXG5cdFx0XHRcdFx0XHRcdHsgbmFtZTogJ3Rvb2wxJywgcmFuZ2U6IHsgc3RhcnQ6IDMxLCBlbmRFeGNsdXNpdmU6IDQyIH0gfSxcblx0XHRcdFx0XHRcdFx0eyBuYW1lOiAndG9vbDInLCByYW5nZTogeyBzdGFydDogMTAsIGVuZEV4Y2x1c2l2ZTogMjEgfSB9XG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0bWV0YWRhdGE6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0aG9va3M6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRzZXNzaW9uVHlwZXM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR1cmk6IFVSSS5qb2luUGF0aChyb290Rm9sZGVyVXJpLCAnLmdpdGh1Yi9hZ2VudHMvYWdlbnQyLmFnZW50Lm1kJyksXG5cdFx0XHRcdFx0c291cmNlOiB7IHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsIH0sXG5cdFx0XHRcdFx0dGFyZ2V0OiBUYXJnZXQuVW5kZWZpbmVkLFxuXHRcdFx0XHRcdHZpc2liaWxpdHk6IHsgdXNlckludm9jYWJsZTogdHJ1ZSwgYWdlbnRJbnZvY2FibGU6IHRydWUgfSxcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHR9XG5cdFx0XHRdO1xuXG5cdFx0XHRhc3NlcnQuZGVlcEVxdWFsKFxuXHRcdFx0XHRyZXN1bHQsXG5cdFx0XHRcdGV4cGVjdGVkLFxuXHRcdFx0XHQnTXVzdCBnZXQgY3VzdG9tIGFnZW50cy4nLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hlYWRlciB3aXRoIGFyZ3VtZW50SGludCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJOYW1lID0gJ2N1c3RvbS1hZ2VudHMtd2l0aC1hcmd1bWVudC1oaW50Jztcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZShyb290Rm9sZGVyKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvYWdlbnRzL2FnZW50MS5hZ2VudC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcXCdDb2RlIHJldmlldyBhZ2VudC5cXCcnLFxuXHRcdFx0XHRcdFx0J2FyZ3VtZW50LWhpbnQ6IFxcJ1Byb3ZpZGUgZmlsZSBwYXRoIG9yIGNvZGUgc25pcHBldCB0byByZXZpZXdcXCcnLFxuXHRcdFx0XHRcdFx0J3Rvb2xzOiBbIGNvZGUtYW5hbHl6ZXIsIGxpbnRlciBdJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J0kgd2lsbCBoZWxwIHJldmlldyB5b3VyIGNvZGUgZm9yIGJlc3QgcHJhY3RpY2VzLicsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9hZ2VudHMvYWdlbnQyLmFnZW50Lm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFxcJ0RvY3VtZW50YXRpb24gZ2VuZXJhdG9yLlxcJycsXG5cdFx0XHRcdFx0XHQnYXJndW1lbnQtaGludDogXFwnU3BlY2lmeSBmdW5jdGlvbiBvciBjbGFzcyBuYW1lIHRvIGRvY3VtZW50XFwnJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J0kgZ2VuZXJhdGUgY29tcHJlaGVuc2l2ZSBkb2N1bWVudGF0aW9uLicsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9XG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gKGF3YWl0IHNlcnZpY2UuZ2V0Q3VzdG9tQWdlbnRzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpKS5tYXAoYWdlbnQgPT4gKHsgLi4uYWdlbnQsIHVyaTogVVJJLmZyb20oYWdlbnQudXJpKSB9KSk7XG5cdFx0XHRjb25zdCBleHBlY3RlZDogSUN1c3RvbUFnZW50W10gPSBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogVVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICcuZ2l0aHViL2FnZW50cy9hZ2VudDEuYWdlbnQubWQnKS50b1N0cmluZygpLFxuXHRcdFx0XHRcdG5hbWU6ICdhZ2VudDEnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnQ29kZSByZXZpZXcgYWdlbnQuJyxcblx0XHRcdFx0XHRhcmd1bWVudEhpbnQ6ICdQcm92aWRlIGZpbGUgcGF0aCBvciBjb2RlIHNuaXBwZXQgdG8gcmV2aWV3Jyxcblx0XHRcdFx0XHR0b29sczogWydjb2RlLWFuYWx5emVyJywgJ2xpbnRlciddLFxuXHRcdFx0XHRcdGFnZW50SW5zdHJ1Y3Rpb25zOiB7XG5cdFx0XHRcdFx0XHRjb250ZW50OiAnSSB3aWxsIGhlbHAgcmV2aWV3IHlvdXIgY29kZSBmb3IgYmVzdCBwcmFjdGljZXMuJyxcblx0XHRcdFx0XHRcdHRvb2xSZWZlcmVuY2VzOiBbXSxcblx0XHRcdFx0XHRcdG1ldGFkYXRhOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGhhbmRPZmZzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kZWw6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR0YXJnZXQ6IFRhcmdldC5VbmRlZmluZWQsXG5cdFx0XHRcdFx0dmlzaWJpbGl0eTogeyB1c2VySW52b2NhYmxlOiB0cnVlLCBhZ2VudEludm9jYWJsZTogdHJ1ZSB9LFxuXHRcdFx0XHRcdGFnZW50czogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGhvb2tzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0c2Vzc2lvblR5cGVzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dXJpOiBVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJy5naXRodWIvYWdlbnRzL2FnZW50MS5hZ2VudC5tZCcpLFxuXHRcdFx0XHRcdHNvdXJjZTogeyBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCB9LFxuXHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogVVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICcuZ2l0aHViL2FnZW50cy9hZ2VudDIuYWdlbnQubWQnKS50b1N0cmluZygpLFxuXHRcdFx0XHRcdG5hbWU6ICdhZ2VudDInLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnRG9jdW1lbnRhdGlvbiBnZW5lcmF0b3IuJyxcblx0XHRcdFx0XHRhcmd1bWVudEhpbnQ6ICdTcGVjaWZ5IGZ1bmN0aW9uIG9yIGNsYXNzIG5hbWUgdG8gZG9jdW1lbnQnLFxuXHRcdFx0XHRcdGFnZW50SW5zdHJ1Y3Rpb25zOiB7XG5cdFx0XHRcdFx0XHRjb250ZW50OiAnSSBnZW5lcmF0ZSBjb21wcmVoZW5zaXZlIGRvY3VtZW50YXRpb24uJyxcblx0XHRcdFx0XHRcdHRvb2xSZWZlcmVuY2VzOiBbXSxcblx0XHRcdFx0XHRcdG1ldGFkYXRhOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGhhbmRPZmZzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kZWw6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR0b29sczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHRhcmdldDogVGFyZ2V0LlVuZGVmaW5lZCxcblx0XHRcdFx0XHR2aXNpYmlsaXR5OiB7IHVzZXJJbnZvY2FibGU6IHRydWUsIGFnZW50SW52b2NhYmxlOiB0cnVlIH0sXG5cdFx0XHRcdFx0YWdlbnRzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0aG9va3M6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRzZXNzaW9uVHlwZXM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR1cmk6IFVSSS5qb2luUGF0aChyb290Rm9sZGVyVXJpLCAnLmdpdGh1Yi9hZ2VudHMvYWdlbnQyLmFnZW50Lm1kJyksXG5cdFx0XHRcdFx0c291cmNlOiB7IHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsIH0sXG5cdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdF07XG5cblx0XHRcdGFzc2VydC5kZWVwRXF1YWwoXG5cdFx0XHRcdHJlc3VsdCxcblx0XHRcdFx0ZXhwZWN0ZWQsXG5cdFx0XHRcdCdNdXN0IGdldCBjdXN0b20gYWdlbnRzIHdpdGggYXJndW1lbnRIaW50LicsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGVhZGVyIHdpdGggdGFyZ2V0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlck5hbWUgPSAnY3VzdG9tLWFnZW50cy13aXRoLXRhcmdldCc7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyID0gYC8ke3Jvb3RGb2xkZXJOYW1lfWA7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUocm9vdEZvbGRlcik7XG5cblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblxuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL2FnZW50cy9naXRodWItYWdlbnQuYWdlbnQubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnR2l0SHViIENvcGlsb3Qgc3BlY2lhbGl6ZWQgYWdlbnQuXFwnJyxcblx0XHRcdFx0XHRcdCd0YXJnZXQ6IFxcJ2dpdGh1Yi1jb3BpbG90XFwnJyxcblx0XHRcdFx0XHRcdCd0b29sczogWyBnaXRodWItYXBpLCBjb2RlLXNlYXJjaCBdJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J0kgYW0gb3B0aW1pemVkIGZvciBHaXRIdWIgQ29waWxvdCB3b3JrZmxvd3MuJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL2FnZW50cy92c2NvZGUtYWdlbnQuYWdlbnQubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnVlMgQ29kZSBzcGVjaWFsaXplZCBhZ2VudC5cXCcnLFxuXHRcdFx0XHRcdFx0J3RhcmdldDogXFwndnNjb2RlXFwnJyxcblx0XHRcdFx0XHRcdCdtb2RlbDogXFwnZ3B0LTRcXCcnLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnSSBhbSBzcGVjaWFsaXplZCBmb3IgVlMgQ29kZSBlZGl0b3IgdGFza3MuJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL2FnZW50cy9nZW5lcmljLWFnZW50LmFnZW50Lm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFxcJ0dlbmVyaWMgYWdlbnQgd2l0aG91dCB0YXJnZXQuXFwnJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J0kgd29yayBldmVyeXdoZXJlLicsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9XG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gKGF3YWl0IHNlcnZpY2UuZ2V0Q3VzdG9tQWdlbnRzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpKS5tYXAoYWdlbnQgPT4gKHsgLi4uYWdlbnQsIHVyaTogVVJJLmZyb20oYWdlbnQudXJpKSB9KSk7XG5cdFx0XHRjb25zdCBleHBlY3RlZDogSUN1c3RvbUFnZW50W10gPSBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogVVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICcuZ2l0aHViL2FnZW50cy9naXRodWItYWdlbnQuYWdlbnQubWQnKS50b1N0cmluZygpLFxuXHRcdFx0XHRcdG5hbWU6ICdnaXRodWItYWdlbnQnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnR2l0SHViIENvcGlsb3Qgc3BlY2lhbGl6ZWQgYWdlbnQuJyxcblx0XHRcdFx0XHR0YXJnZXQ6IFRhcmdldC5HaXRIdWJDb3BpbG90LFxuXHRcdFx0XHRcdHRvb2xzOiBbJ2dpdGh1Yi1hcGknLCAnY29kZS1zZWFyY2gnXSxcblx0XHRcdFx0XHRhZ2VudEluc3RydWN0aW9uczoge1xuXHRcdFx0XHRcdFx0Y29udGVudDogJ0kgYW0gb3B0aW1pemVkIGZvciBHaXRIdWIgQ29waWxvdCB3b3JrZmxvd3MuJyxcblx0XHRcdFx0XHRcdHRvb2xSZWZlcmVuY2VzOiBbXSxcblx0XHRcdFx0XHRcdG1ldGFkYXRhOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGhhbmRPZmZzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kZWw6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRhcmd1bWVudEhpbnQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR2aXNpYmlsaXR5OiB7IHVzZXJJbnZvY2FibGU6IHRydWUsIGFnZW50SW52b2NhYmxlOiB0cnVlIH0sXG5cdFx0XHRcdFx0YWdlbnRzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0aG9va3M6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR1cmk6IFVSSS5qb2luUGF0aChyb290Rm9sZGVyVXJpLCAnLmdpdGh1Yi9hZ2VudHMvZ2l0aHViLWFnZW50LmFnZW50Lm1kJyksXG5cdFx0XHRcdFx0c2Vzc2lvblR5cGVzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0c291cmNlOiB7IHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsIH0sXG5cdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJy5naXRodWIvYWdlbnRzL3ZzY29kZS1hZ2VudC5hZ2VudC5tZCcpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0bmFtZTogJ3ZzY29kZS1hZ2VudCcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdWUyBDb2RlIHNwZWNpYWxpemVkIGFnZW50LicsXG5cdFx0XHRcdFx0dGFyZ2V0OiBUYXJnZXQuVlNDb2RlLFxuXHRcdFx0XHRcdG1vZGVsOiBbJ2dwdC00J10sXG5cdFx0XHRcdFx0YWdlbnRJbnN0cnVjdGlvbnM6IHtcblx0XHRcdFx0XHRcdGNvbnRlbnQ6ICdJIGFtIHNwZWNpYWxpemVkIGZvciBWUyBDb2RlIGVkaXRvciB0YXNrcy4nLFxuXHRcdFx0XHRcdFx0dG9vbFJlZmVyZW5jZXM6IFtdLFxuXHRcdFx0XHRcdFx0bWV0YWRhdGE6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0aGFuZE9mZnM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRhcmd1bWVudEhpbnQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR0b29sczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHZpc2liaWxpdHk6IHsgdXNlckludm9jYWJsZTogdHJ1ZSwgYWdlbnRJbnZvY2FibGU6IHRydWUgfSxcblx0XHRcdFx0XHRhZ2VudHM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRob29rczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHVyaTogVVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICcuZ2l0aHViL2FnZW50cy92c2NvZGUtYWdlbnQuYWdlbnQubWQnKSxcblx0XHRcdFx0XHRzZXNzaW9uVHlwZXM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRzb3VyY2U6IHsgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwgfSxcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IFVSSS5qb2luUGF0aChyb290Rm9sZGVyVXJpLCAnLmdpdGh1Yi9hZ2VudHMvZ2VuZXJpYy1hZ2VudC5hZ2VudC5tZCcpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0bmFtZTogJ2dlbmVyaWMtYWdlbnQnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnR2VuZXJpYyBhZ2VudCB3aXRob3V0IHRhcmdldC4nLFxuXHRcdFx0XHRcdGFnZW50SW5zdHJ1Y3Rpb25zOiB7XG5cdFx0XHRcdFx0XHRjb250ZW50OiAnSSB3b3JrIGV2ZXJ5d2hlcmUuJyxcblx0XHRcdFx0XHRcdHRvb2xSZWZlcmVuY2VzOiBbXSxcblx0XHRcdFx0XHRcdG1ldGFkYXRhOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGhhbmRPZmZzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kZWw6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRhcmd1bWVudEhpbnQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR0b29sczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHRhcmdldDogVGFyZ2V0LlVuZGVmaW5lZCxcblx0XHRcdFx0XHR2aXNpYmlsaXR5OiB7IHVzZXJJbnZvY2FibGU6IHRydWUsIGFnZW50SW52b2NhYmxlOiB0cnVlIH0sXG5cdFx0XHRcdFx0YWdlbnRzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0aG9va3M6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR1cmk6IFVSSS5qb2luUGF0aChyb290Rm9sZGVyVXJpLCAnLmdpdGh1Yi9hZ2VudHMvZ2VuZXJpYy1hZ2VudC5hZ2VudC5tZCcpLFxuXHRcdFx0XHRcdHNlc3Npb25UeXBlczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHNvdXJjZTogeyBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCB9LFxuXHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHRdO1xuXG5cdFx0XHRhc3NlcnQuZGVlcEVxdWFsKFxuXHRcdFx0XHRyZXN1bHQsXG5cdFx0XHRcdGV4cGVjdGVkLFxuXHRcdFx0XHQnTXVzdCBnZXQgY3VzdG9tIGFnZW50cyB3aXRoIHRhcmdldCBhdHRyaWJ1dGUuJyxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjbGF1ZGUgYWdlbnQgbWFwcyB0b29scyBhbmQgbW9kZWwgdG8gdnNjb2RlIGVxdWl2YWxlbnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlck5hbWUgPSAnY2xhdWRlLWFnZW50LW1hcHBpbmcnO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlciA9IGAvJHtyb290Rm9sZGVyTmFtZX1gO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlclVyaSA9IFVSSS5maWxlKHJvb3RGb2xkZXIpO1xuXG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2UodGVzdFdvcmtzcGFjZShyb290Rm9sZGVyVXJpKSk7XG5cblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Ly8gQ2xhdWRlIGFnZW50IHdpdGggdG9vbHMgYW5kIG1vZGVsIHRoYXQgc2hvdWxkIGJlIG1hcHBlZFxuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5jbGF1ZGUvYWdlbnRzL2NsYXVkZS1hZ2VudC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcXCdDbGF1ZGUgYWdlbnQgd2l0aCB0b29scyBhbmQgbW9kZWwuXFwnJyxcblx0XHRcdFx0XHRcdCd0b29sczogWyBSZWFkLCBFZGl0LCBCYXNoIF0nLFxuXHRcdFx0XHRcdFx0J21vZGVsOiBvcHVzJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J0kgYW0gYSBDbGF1ZGUgYWdlbnQuJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHQvLyBDbGF1ZGUgYWdlbnQgd2l0aCBtb3JlIHRvb2xzLCBzb21lIHdpdGggZW1wdHkgZXF1aXZhbGVudHNcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uY2xhdWRlL2FnZW50cy9jbGF1ZGUtYWdlbnQyLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFxcJ0NsYXVkZSBhZ2VudCB3aXRoIHZhcmlvdXMgdG9vbHMuXFwnJyxcblx0XHRcdFx0XHRcdCd0b29sczogWyBHbG9iLCBHcmVwLCBXcml0ZSwgVGFzaywgU2tpbGwgXScsXG5cdFx0XHRcdFx0XHQnbW9kZWw6IHNvbm5ldCcsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdJIGFtIGFub3RoZXIgQ2xhdWRlIGFnZW50LicsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Ly8gTm9uLUNsYXVkZSBhZ2VudCBzaG91bGQgTk9UIGhhdmUgdG9vbHMvbW9kZWwgbWFwcGVkXG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9hZ2VudHMvY29waWxvdC1hZ2VudC5hZ2VudC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcXCdDb3BpbG90IGFnZW50IHdpdGggc2FtZSB0b29sIG5hbWVzLlxcJycsXG5cdFx0XHRcdFx0XHQndGFyZ2V0OiBcXCdnaXRodWItY29waWxvdFxcJycsXG5cdFx0XHRcdFx0XHQndG9vbHM6IFsgUmVhZCwgRWRpdCBdJyxcblx0XHRcdFx0XHRcdCdtb2RlbDogZ3B0LTQnLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnSSBhbSBhIENvcGlsb3QgYWdlbnQuJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gKGF3YWl0IHNlcnZpY2UuZ2V0Q3VzdG9tQWdlbnRzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpKS5tYXAoYWdlbnQgPT4gKHsgLi4uYWdlbnQsIHVyaTogVVJJLmZyb20oYWdlbnQudXJpKSB9KSk7XG5cdFx0XHRjb25zdCBleHBlY3RlZDogSUN1c3RvbUFnZW50W10gPSBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogVVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICcuZ2l0aHViL2FnZW50cy9jb3BpbG90LWFnZW50LmFnZW50Lm1kJykudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRuYW1lOiAnY29waWxvdC1hZ2VudCcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdDb3BpbG90IGFnZW50IHdpdGggc2FtZSB0b29sIG5hbWVzLicsXG5cdFx0XHRcdFx0dGFyZ2V0OiBUYXJnZXQuR2l0SHViQ29waWxvdCxcblx0XHRcdFx0XHQvLyBOb24tQ2xhdWRlIGFnZW50OiB0b29scyBhbmQgbW9kZWwgc3RheSBhcy1pc1xuXHRcdFx0XHRcdHRvb2xzOiBbJ1JlYWQnLCAnRWRpdCddLFxuXHRcdFx0XHRcdG1vZGVsOiBbJ2dwdC00J10sXG5cdFx0XHRcdFx0YWdlbnRJbnN0cnVjdGlvbnM6IHtcblx0XHRcdFx0XHRcdGNvbnRlbnQ6ICdJIGFtIGEgQ29waWxvdCBhZ2VudC4nLFxuXHRcdFx0XHRcdFx0dG9vbFJlZmVyZW5jZXM6IFtdLFxuXHRcdFx0XHRcdFx0bWV0YWRhdGE6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0aGFuZE9mZnM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRhcmd1bWVudEhpbnQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR2aXNpYmlsaXR5OiB7IHVzZXJJbnZvY2FibGU6IHRydWUsIGFnZW50SW52b2NhYmxlOiB0cnVlIH0sXG5cdFx0XHRcdFx0YWdlbnRzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0aG9va3M6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR1cmk6IFVSSS5qb2luUGF0aChyb290Rm9sZGVyVXJpLCAnLmdpdGh1Yi9hZ2VudHMvY29waWxvdC1hZ2VudC5hZ2VudC5tZCcpLFxuXHRcdFx0XHRcdHNlc3Npb25UeXBlczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHNvdXJjZTogeyBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCB9LFxuXHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogVVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICcuY2xhdWRlL2FnZW50cy9jbGF1ZGUtYWdlbnQubWQnKS50b1N0cmluZygpLFxuXHRcdFx0XHRcdG5hbWU6ICdjbGF1ZGUtYWdlbnQnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnQ2xhdWRlIGFnZW50IHdpdGggdG9vbHMgYW5kIG1vZGVsLicsXG5cdFx0XHRcdFx0dGFyZ2V0OiBUYXJnZXQuQ2xhdWRlLFxuXHRcdFx0XHRcdC8vIENsYXVkZSB0b29scyBtYXBwZWQgdG8gdnNjb2RlIGVxdWl2YWxlbnRzXG5cdFx0XHRcdFx0dG9vbHM6IFsncmVhZC9yZWFkRmlsZScsICdyZWFkL2dldE5vdGVib29rU3VtbWFyeScsICdlZGl0L2VkaXROb3RlYm9vaycsICdlZGl0L2VkaXRGaWxlcycsICdleGVjdXRlJ10sXG5cdFx0XHRcdFx0Ly8gQ2xhdWRlIG1vZGVsIG1hcHBlZCB0byB2c2NvZGUgZXF1aXZhbGVudFxuXHRcdFx0XHRcdG1vZGVsOiBbJ0NsYXVkZSBPcHVzIDQuNiAoY29waWxvdCknXSxcblx0XHRcdFx0XHRhZ2VudEluc3RydWN0aW9uczoge1xuXHRcdFx0XHRcdFx0Y29udGVudDogJ0kgYW0gYSBDbGF1ZGUgYWdlbnQuJyxcblx0XHRcdFx0XHRcdHRvb2xSZWZlcmVuY2VzOiBbXSxcblx0XHRcdFx0XHRcdG1ldGFkYXRhOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGhhbmRPZmZzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0YXJndW1lbnRIaW50OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dmlzaWJpbGl0eTogeyB1c2VySW52b2NhYmxlOiB0cnVlLCBhZ2VudEludm9jYWJsZTogdHJ1ZSB9LFxuXHRcdFx0XHRcdGFnZW50czogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGhvb2tzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dXJpOiBVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJy5jbGF1ZGUvYWdlbnRzL2NsYXVkZS1hZ2VudC5tZCcpLFxuXHRcdFx0XHRcdHNlc3Npb25UeXBlczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHNvdXJjZTogeyBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCB9LFxuXHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogVVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICcuY2xhdWRlL2FnZW50cy9jbGF1ZGUtYWdlbnQyLm1kJykudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRuYW1lOiAnY2xhdWRlLWFnZW50MicsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdDbGF1ZGUgYWdlbnQgd2l0aCB2YXJpb3VzIHRvb2xzLicsXG5cdFx0XHRcdFx0dGFyZ2V0OiBUYXJnZXQuQ2xhdWRlLFxuXHRcdFx0XHRcdC8vIFRvb2xzIG1hcHBlZDogR2xvYi0+c2VhcmNoL2ZpbGVTZWFyY2gsIEdyZXAtPnNlYXJjaC90ZXh0U2VhcmNoLCBXcml0ZS0+ZWRpdC9jcmVhdGUqLCBUYXNrLT5hZ2VudCwgU2tpbGwtPltdIChlbXB0eSlcblx0XHRcdFx0XHR0b29sczogWydzZWFyY2gvZmlsZVNlYXJjaCcsICdzZWFyY2gvdGV4dFNlYXJjaCcsICdlZGl0L2NyZWF0ZURpcmVjdG9yeScsICdlZGl0L2NyZWF0ZUZpbGUnLCAnZWRpdC9jcmVhdGVKdXB5dGVyTm90ZWJvb2snLCAnYWdlbnQnXSxcblx0XHRcdFx0XHRtb2RlbDogWydDbGF1ZGUgU29ubmV0IDQuNSAoY29waWxvdCknXSxcblx0XHRcdFx0XHRhZ2VudEluc3RydWN0aW9uczoge1xuXHRcdFx0XHRcdFx0Y29udGVudDogJ0kgYW0gYW5vdGhlciBDbGF1ZGUgYWdlbnQuJyxcblx0XHRcdFx0XHRcdHRvb2xSZWZlcmVuY2VzOiBbXSxcblx0XHRcdFx0XHRcdG1ldGFkYXRhOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGhhbmRPZmZzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0YXJndW1lbnRIaW50OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dmlzaWJpbGl0eTogeyB1c2VySW52b2NhYmxlOiB0cnVlLCBhZ2VudEludm9jYWJsZTogdHJ1ZSB9LFxuXHRcdFx0XHRcdGFnZW50czogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGhvb2tzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dXJpOiBVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJy5jbGF1ZGUvYWdlbnRzL2NsYXVkZS1hZ2VudDIubWQnKSxcblx0XHRcdFx0XHRzZXNzaW9uVHlwZXM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRzb3VyY2U6IHsgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwgfSxcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBFcXVhbChcblx0XHRcdFx0cmVzdWx0LFxuXHRcdFx0XHRleHBlY3RlZCxcblx0XHRcdFx0J0NsYXVkZSB0b29scyBhbmQgbW9kZWxzIG11c3QgYmUgbWFwcGVkIHRvIFZTIENvZGUgZXF1aXZhbGVudHM7IG5vbi1DbGF1ZGUgYWdlbnRzIG11c3QgcmVtYWluIHVuY2hhbmdlZC4nLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXG5cdFx0dGVzdCgnYWdlbnRzIHdpdGggLm1kIGV4dGVuc2lvbiBzaG91bGQgYmUgcmVjb2duaXplZCwgZXhjZXB0IFJFQURNRS5tZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJOYW1lID0gJ2N1c3RvbS1hZ2VudHMtbWQtZXh0ZW5zaW9uJztcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZShyb290Rm9sZGVyKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvYWdlbnRzL2RlbW9uc3RyYXRlLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFxcJ0RlbW9uc3RyYXRlIGFnZW50LlxcJycsXG5cdFx0XHRcdFx0XHQndG9vbHM6IFsgZGVtby10b29sIF0nLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnVGhpcyBpcyBhIGRlbW9uc3RyYXRpb24gYWdlbnQgdXNpbmcgLm1kIGV4dGVuc2lvbi4nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvYWdlbnRzL1JFQURNRS5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCdUaGlzIGlzIGEgUkVBRE1FIGZpbGUuJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSAoYXdhaXQgc2VydmljZS5nZXRDdXN0b21BZ2VudHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpLm1hcChhZ2VudCA9PiAoeyAuLi5hZ2VudCwgdXJpOiBVUkkuZnJvbShhZ2VudC51cmkpIH0pKTtcblx0XHRcdGNvbnN0IGV4cGVjdGVkOiBJQ3VzdG9tQWdlbnRbXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJy5naXRodWIvYWdlbnRzL2RlbW9uc3RyYXRlLm1kJykudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRuYW1lOiAnZGVtb25zdHJhdGUnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnRGVtb25zdHJhdGUgYWdlbnQuJyxcblx0XHRcdFx0XHR0b29sczogWydkZW1vLXRvb2wnXSxcblx0XHRcdFx0XHRhZ2VudEluc3RydWN0aW9uczoge1xuXHRcdFx0XHRcdFx0Y29udGVudDogJ1RoaXMgaXMgYSBkZW1vbnN0cmF0aW9uIGFnZW50IHVzaW5nIC5tZCBleHRlbnNpb24uJyxcblx0XHRcdFx0XHRcdHRvb2xSZWZlcmVuY2VzOiBbXSxcblx0XHRcdFx0XHRcdG1ldGFkYXRhOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGhhbmRPZmZzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kZWw6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRhcmd1bWVudEhpbnQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR0YXJnZXQ6IFRhcmdldC5VbmRlZmluZWQsXG5cdFx0XHRcdFx0dmlzaWJpbGl0eTogeyB1c2VySW52b2NhYmxlOiB0cnVlLCBhZ2VudEludm9jYWJsZTogdHJ1ZSB9LFxuXHRcdFx0XHRcdGFnZW50czogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGhvb2tzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0c2Vzc2lvblR5cGVzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dXJpOiBVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJy5naXRodWIvYWdlbnRzL2RlbW9uc3RyYXRlLm1kJyksXG5cdFx0XHRcdFx0c291cmNlOiB7IHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsIH0sXG5cdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0fVxuXHRcdFx0XTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBFcXVhbChcblx0XHRcdFx0cmVzdWx0LFxuXHRcdFx0XHRleHBlY3RlZCxcblx0XHRcdFx0J011c3QgcmVjb2duaXplIC5tZCBmaWxlcyBhcyBhZ2VudHMsIGV4Y2VwdCBSRUFETUUubWQnLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hlYWRlciB3aXRoIGFnZW50cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJOYW1lID0gJ2N1c3RvbS1hZ2VudHMtd2l0aC1yZXN0cmljdGlvbnMnO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlciA9IGAvJHtyb290Rm9sZGVyTmFtZX1gO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlclVyaSA9IFVSSS5maWxlKHJvb3RGb2xkZXIpO1xuXG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2UodGVzdFdvcmtzcGFjZShyb290Rm9sZGVyVXJpKSk7XG5cblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9hZ2VudHMvcmVzdHJpY3RlZC1hZ2VudC5hZ2VudC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcXCdBZ2VudCB3aXRoIHJlc3RyaWN0ZWQgYWNjZXNzLlxcJycsXG5cdFx0XHRcdFx0XHQnYWdlbnRzOiBbIHN1YmFnZW50MSwgc3ViYWdlbnQyIF0nLFxuXHRcdFx0XHRcdFx0J3Rvb2xzOiBbIHRvb2wxIF0nLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnVGhpcyBhZ2VudCBoYXMgcmVzdHJpY3RlZCBhY2Nlc3MuJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL2FnZW50cy9uby1hY2Nlc3MtYWdlbnQuYWdlbnQubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnQWdlbnQgd2l0aCBubyBhY2Nlc3MgdG8gc3ViYWdlbnRzLCBza2lsbHMsIG9yIGluc3RydWN0aW9ucy5cXCcnLFxuXHRcdFx0XHRcdFx0J2FnZW50czogW10nLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnVGhpcyBhZ2VudCBoYXMgbm8gYWNjZXNzLicsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9hZ2VudHMvZnVsbC1hY2Nlc3MtYWdlbnQuYWdlbnQubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnQWdlbnQgd2l0aCBmdWxsIGFjY2Vzcy5cXCcnLFxuXHRcdFx0XHRcdFx0J2FnZW50czogWyBcIipcIiBdJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1RoaXMgYWdlbnQgaGFzIGZ1bGwgYWNjZXNzLicsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9XG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gKGF3YWl0IHNlcnZpY2UuZ2V0Q3VzdG9tQWdlbnRzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpKS5tYXAoYWdlbnQgPT4gKHsgLi4uYWdlbnQsIHVyaTogVVJJLmZyb20oYWdlbnQudXJpKSB9KSk7XG5cdFx0XHRjb25zdCBleHBlY3RlZDogSUN1c3RvbUFnZW50W10gPSBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogVVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICcuZ2l0aHViL2FnZW50cy9yZXN0cmljdGVkLWFnZW50LmFnZW50Lm1kJykudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRuYW1lOiAncmVzdHJpY3RlZC1hZ2VudCcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdBZ2VudCB3aXRoIHJlc3RyaWN0ZWQgYWNjZXNzLicsXG5cdFx0XHRcdFx0YWdlbnRzOiBbJ3N1YmFnZW50MScsICdzdWJhZ2VudDInXSxcblx0XHRcdFx0XHR0b29sczogWyd0b29sMSddLFxuXHRcdFx0XHRcdGFnZW50SW5zdHJ1Y3Rpb25zOiB7XG5cdFx0XHRcdFx0XHRjb250ZW50OiAnVGhpcyBhZ2VudCBoYXMgcmVzdHJpY3RlZCBhY2Nlc3MuJyxcblx0XHRcdFx0XHRcdHRvb2xSZWZlcmVuY2VzOiBbXSxcblx0XHRcdFx0XHRcdG1ldGFkYXRhOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGhhbmRPZmZzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kZWw6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRhcmd1bWVudEhpbnQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR0YXJnZXQ6IFRhcmdldC5VbmRlZmluZWQsXG5cdFx0XHRcdFx0dmlzaWJpbGl0eTogeyB1c2VySW52b2NhYmxlOiB0cnVlLCBhZ2VudEludm9jYWJsZTogdHJ1ZSB9LFxuXHRcdFx0XHRcdGhvb2tzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0c2Vzc2lvblR5cGVzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dXJpOiBVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJy5naXRodWIvYWdlbnRzL3Jlc3RyaWN0ZWQtYWdlbnQuYWdlbnQubWQnKSxcblx0XHRcdFx0XHRzb3VyY2U6IHsgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwgfSxcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IFVSSS5qb2luUGF0aChyb290Rm9sZGVyVXJpLCAnLmdpdGh1Yi9hZ2VudHMvbm8tYWNjZXNzLWFnZW50LmFnZW50Lm1kJykudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRuYW1lOiAnbm8tYWNjZXNzLWFnZW50Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0FnZW50IHdpdGggbm8gYWNjZXNzIHRvIHN1YmFnZW50cywgc2tpbGxzLCBvciBpbnN0cnVjdGlvbnMuJyxcblx0XHRcdFx0XHRhZ2VudHM6IFtdLFxuXHRcdFx0XHRcdGFnZW50SW5zdHJ1Y3Rpb25zOiB7XG5cdFx0XHRcdFx0XHRjb250ZW50OiAnVGhpcyBhZ2VudCBoYXMgbm8gYWNjZXNzLicsXG5cdFx0XHRcdFx0XHR0b29sUmVmZXJlbmNlczogW10sXG5cdFx0XHRcdFx0XHRtZXRhZGF0YTogdW5kZWZpbmVkXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRoYW5kT2ZmczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGVsOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0YXJndW1lbnRIaW50OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dG9vbHM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR0YXJnZXQ6IFRhcmdldC5VbmRlZmluZWQsXG5cdFx0XHRcdFx0dmlzaWJpbGl0eTogeyB1c2VySW52b2NhYmxlOiB0cnVlLCBhZ2VudEludm9jYWJsZTogdHJ1ZSB9LFxuXHRcdFx0XHRcdGhvb2tzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0c2Vzc2lvblR5cGVzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dXJpOiBVUkkuam9pblBhdGgocm9vdEZvbGRlclVyaSwgJy5naXRodWIvYWdlbnRzL25vLWFjY2Vzcy1hZ2VudC5hZ2VudC5tZCcpLFxuXHRcdFx0XHRcdHNvdXJjZTogeyBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCB9LFxuXHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogVVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICcuZ2l0aHViL2FnZW50cy9mdWxsLWFjY2Vzcy1hZ2VudC5hZ2VudC5tZCcpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0bmFtZTogJ2Z1bGwtYWNjZXNzLWFnZW50Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0FnZW50IHdpdGggZnVsbCBhY2Nlc3MuJyxcblx0XHRcdFx0XHRhZ2VudHM6IFsnKiddLFxuXHRcdFx0XHRcdGFnZW50SW5zdHJ1Y3Rpb25zOiB7XG5cdFx0XHRcdFx0XHRjb250ZW50OiAnVGhpcyBhZ2VudCBoYXMgZnVsbCBhY2Nlc3MuJyxcblx0XHRcdFx0XHRcdHRvb2xSZWZlcmVuY2VzOiBbXSxcblx0XHRcdFx0XHRcdG1ldGFkYXRhOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGhhbmRPZmZzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kZWw6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRhcmd1bWVudEhpbnQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR0b29sczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHRhcmdldDogVGFyZ2V0LlVuZGVmaW5lZCxcblx0XHRcdFx0XHR2aXNpYmlsaXR5OiB7IHVzZXJJbnZvY2FibGU6IHRydWUsIGFnZW50SW52b2NhYmxlOiB0cnVlIH0sXG5cdFx0XHRcdFx0aG9va3M6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRzZXNzaW9uVHlwZXM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR1cmk6IFVSSS5qb2luUGF0aChyb290Rm9sZGVyVXJpLCAnLmdpdGh1Yi9hZ2VudHMvZnVsbC1hY2Nlc3MtYWdlbnQuYWdlbnQubWQnKSxcblx0XHRcdFx0XHRzb3VyY2U6IHsgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwgfSxcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBFcXVhbChcblx0XHRcdFx0cmVzdWx0LFxuXHRcdFx0XHRleHBlY3RlZCxcblx0XHRcdFx0J011c3QgZ2V0IGN1c3RvbSBhZ2VudHMgd2l0aCBhZ2VudHMsIHNraWxscywgYW5kIGluc3RydWN0aW9ucyBhdHRyaWJ1dGVzLicsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGVhZGVyIHdpdGggaW5mZXI6IGZhbHNlIHNldHMgYWdlbnRJbnZvY2FibGUgdG8gZmFsc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICdjdXN0b20tYWdlbnRzLWluZmVyLWZhbHNlJztcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZShyb290Rm9sZGVyKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvYWdlbnRzL2FnZW50LWluZmVyLWZhbHNlLmFnZW50Lm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFxcJ0FnZW50IHdpdGggaW5mZXI6IGZhbHNlLlxcJycsXG5cdFx0XHRcdFx0XHQnaW5mZXI6IGZhbHNlJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J0kgc2hvdWxkIG5vdCBiZSBpbnZvY2FibGUgYnkgdGhlIG1vZGVsLicsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9hZ2VudHMvYWdlbnQtaW5mZXItdHJ1ZS5hZ2VudC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcXCdBZ2VudCB3aXRoIGluZmVyOiB0cnVlLlxcJycsXG5cdFx0XHRcdFx0XHQnaW5mZXI6IHRydWUnLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnSSBzaG91bGQgYmUgaW52b2NhYmxlIGJ5IHRoZSBtb2RlbC4nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvYWdlbnRzL2FnZW50LW5vLWluZmVyLmFnZW50Lm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFxcJ0FnZW50IHdpdGhvdXQgaW5mZXIuXFwnJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J0kgc2hvdWxkIGRlZmF1bHQgdG8gYmVpbmcgaW52b2NhYmxlIGJ5IHRoZSBtb2RlbC4nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fVxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IChhd2FpdCBzZXJ2aWNlLmdldEN1c3RvbUFnZW50cyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSkubWFwKGFnZW50ID0+ICh7IC4uLmFnZW50LCB1cmk6IFVSSS5mcm9tKGFnZW50LnVyaSkgfSkpO1xuXG5cdFx0XHRjb25zdCBpbmZlckZhbHNlQWdlbnQgPSByZXN1bHQuZmluZChhID0+IGEubmFtZSA9PT0gJ2FnZW50LWluZmVyLWZhbHNlJyk7XG5cdFx0XHRhc3NlcnQub2soaW5mZXJGYWxzZUFnZW50LCAnU2hvdWxkIGZpbmQgYWdlbnQgd2l0aCBpbmZlcjogZmFsc2UnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbmZlckZhbHNlQWdlbnQudmlzaWJpbGl0eS5hZ2VudEludm9jYWJsZSwgZmFsc2UsICdpbmZlcjogZmFsc2Ugc2hvdWxkIHNldCBhZ2VudEludm9jYWJsZSB0byBmYWxzZScpO1xuXG5cdFx0XHRjb25zdCBpbmZlclRydWVBZ2VudCA9IHJlc3VsdC5maW5kKGEgPT4gYS5uYW1lID09PSAnYWdlbnQtaW5mZXItdHJ1ZScpO1xuXHRcdFx0YXNzZXJ0Lm9rKGluZmVyVHJ1ZUFnZW50LCAnU2hvdWxkIGZpbmQgYWdlbnQgd2l0aCBpbmZlcjogdHJ1ZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluZmVyVHJ1ZUFnZW50LnZpc2liaWxpdHkuYWdlbnRJbnZvY2FibGUsIHRydWUsICdpbmZlcjogdHJ1ZSBzaG91bGQgc2V0IGFnZW50SW52b2NhYmxlIHRvIHRydWUnKTtcblxuXHRcdFx0Y29uc3Qgbm9JbmZlckFnZW50ID0gcmVzdWx0LmZpbmQoYSA9PiBhLm5hbWUgPT09ICdhZ2VudC1uby1pbmZlcicpO1xuXHRcdFx0YXNzZXJ0Lm9rKG5vSW5mZXJBZ2VudCwgJ1Nob3VsZCBmaW5kIGFnZW50IHdpdGhvdXQgaW5mZXInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub0luZmVyQWdlbnQudmlzaWJpbGl0eS5hZ2VudEludm9jYWJsZSwgdHJ1ZSwgJ21pc3NpbmcgaW5mZXIgc2hvdWxkIGRlZmF1bHQgYWdlbnRJbnZvY2FibGUgdG8gdHJ1ZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWdlbnRzIGZyb20gdXNlciBkYXRhIGZvbGRlcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJOYW1lID0gJ2N1c3RvbS1hZ2VudHMtdXNlci1kYXRhJztcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZShyb290Rm9sZGVyKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHRjb25zdCB1c2VyUHJvbXB0c0ZvbGRlciA9ICcvdXNlci1kYXRhL3Byb21wdHMnO1xuXHRcdFx0Y29uc3QgdXNlclByb21wdHNGb2xkZXJVcmkgPSBVUkkuZmlsZSh1c2VyUHJvbXB0c0ZvbGRlcik7XG5cblx0XHRcdC8vIE92ZXJyaWRlIHRoZSB1c2VyIGRhdGEgcHJvZmlsZSBzZXJ2aWNlIHRvIHVzZSBhIGZpbGU6Ly8gVVJJIHRoYXQgdGhlIEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyIHN1cHBvcnRzXG5cdFx0XHRjb25zdCBjdXN0b21Vc2VyRGF0YVByb2ZpbGVTZXJ2aWNlID0ge1xuXHRcdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdG9uRGlkQ2hhbmdlQ3VycmVudFByb2ZpbGU6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdGN1cnJlbnRQcm9maWxlOiB7XG5cdFx0XHRcdFx0Li4udG9Vc2VyRGF0YVByb2ZpbGUoJ3Rlc3QnLCAndGVzdCcsIFVSSS5maWxlKHVzZXJQcm9tcHRzRm9sZGVyKS53aXRoKHsgcGF0aDogJy91c2VyLWRhdGEnIH0pLCBVUkkuZmlsZSgnL2NhY2hlJykpLFxuXHRcdFx0XHRcdHByb21wdHNIb21lOiB1c2VyUHJvbXB0c0ZvbGRlclVyaSxcblx0XHRcdFx0fSxcblx0XHRcdFx0dXBkYXRlQ3VycmVudFByb2ZpbGU6IGFzeW5jICgpID0+IHsgfVxuXHRcdFx0fTtcblx0XHRcdGluc3RhU2VydmljZS5zdHViKElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlLCBjdXN0b21Vc2VyRGF0YVByb2ZpbGVTZXJ2aWNlKTtcblxuXHRcdFx0Ly8gUmVjcmVhdGUgdGhlIHNlcnZpY2Ugd2l0aCB0aGUgbmV3IHN0dWIgKGRpc3Bvc2UgZXhpc3RpbmcgdG8gYXZvaWQgZHVwbGljYXRlIGZpbGVzeXN0ZW0gcmVnaXN0cmF0aW9uKVxuXHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0XHRjb25zdCB0ZXN0U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0c1NlcnZpY2UpKTtcblxuXHRcdFx0Ly8gQ3JlYXRlIGFnZW50IGZpbGVzIGluIGJvdGggd29ya3NwYWNlIGFuZCB1c2VyIGRhdGEgZm9sZGVyXG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0Ly8gV29ya3NwYWNlIGFnZW50XG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL2FnZW50cy93b3Jrc3BhY2UtYWdlbnQuYWdlbnQubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnV29ya3NwYWNlIGFnZW50LlxcJycsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdJIGFtIGEgd29ya3NwYWNlIGFnZW50LicsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQvLyBVc2VyIGRhdGEgYWdlbnRcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3VzZXJQcm9tcHRzRm9sZGVyfS91c2VyLWFnZW50LmFnZW50Lm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFxcJ1VzZXIgZGF0YSBhZ2VudC5cXCcnLFxuXHRcdFx0XHRcdFx0J3Rvb2xzOiBbIHVzZXItdG9vbCBdJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J0kgYW0gYSB1c2VyIGRhdGEgYWdlbnQuJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdC8vIEFub3RoZXIgdXNlciBkYXRhIGFnZW50IHdpdGhvdXQgaGVhZGVyXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHt1c2VyUHJvbXB0c0ZvbGRlcn0vc2ltcGxlLXVzZXItYWdlbnQuYWdlbnQubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnQSBzaW1wbGUgdXNlciBhZ2VudCB3aXRob3V0IGhlYWRlci4nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fVxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IChhd2FpdCB0ZXN0U2VydmljZS5nZXRDdXN0b21BZ2VudHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpLm1hcChhZ2VudCA9PiAoeyAuLi5hZ2VudCwgdXJpOiBVUkkuZnJvbShhZ2VudC51cmkpIH0pKTtcblxuXHRcdFx0Ly8gU2hvdWxkIGZpbmQgYWdlbnRzIGZyb20gYm90aCB3b3Jrc3BhY2UgYW5kIHVzZXIgZGF0YVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDMsICdTaG91bGQgZmluZCAzIGFnZW50cyAoMSB3b3Jrc3BhY2UgKyAyIHVzZXIgZGF0YSknKTtcblxuXHRcdFx0Y29uc3Qgd29ya3NwYWNlQWdlbnQgPSByZXN1bHQuZmluZChhID0+IGEuc291cmNlLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLmxvY2FsKTtcblx0XHRcdGFzc2VydC5vayh3b3Jrc3BhY2VBZ2VudCwgJ1Nob3VsZCBmaW5kIHdvcmtzcGFjZSBhZ2VudCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtzcGFjZUFnZW50Lm5hbWUsICd3b3Jrc3BhY2UtYWdlbnQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3Jrc3BhY2VBZ2VudC5kZXNjcmlwdGlvbiwgJ1dvcmtzcGFjZSBhZ2VudC4nKTtcblxuXHRcdFx0Y29uc3QgdXNlckFnZW50cyA9IHJlc3VsdC5maWx0ZXIoYSA9PiBhLnNvdXJjZS5zdG9yYWdlID09PSBQcm9tcHRzU3RvcmFnZS51c2VyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1c2VyQWdlbnRzLmxlbmd0aCwgMiwgJ1Nob3VsZCBmaW5kIDIgdXNlciBkYXRhIGFnZW50cycpO1xuXG5cdFx0XHRjb25zdCB1c2VyQWdlbnRXaXRoSGVhZGVyID0gdXNlckFnZW50cy5maW5kKGEgPT4gYS5uYW1lID09PSAndXNlci1hZ2VudCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKHVzZXJBZ2VudFdpdGhIZWFkZXIsICdTaG91bGQgZmluZCB1c2VyIGFnZW50IHdpdGggaGVhZGVyJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXNlckFnZW50V2l0aEhlYWRlci5kZXNjcmlwdGlvbiwgJ1VzZXIgZGF0YSBhZ2VudC4nKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodXNlckFnZW50V2l0aEhlYWRlci50b29scywgWyd1c2VyLXRvb2wnXSk7XG5cblx0XHRcdGNvbnN0IHNpbXBsZVVzZXJBZ2VudCA9IHVzZXJBZ2VudHMuZmluZChhID0+IGEubmFtZSA9PT0gJ3NpbXBsZS11c2VyLWFnZW50Jyk7XG5cdFx0XHRhc3NlcnQub2soc2ltcGxlVXNlckFnZW50LCAnU2hvdWxkIGZpbmQgc2ltcGxlIHVzZXIgYWdlbnQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaW1wbGVVc2VyQWdlbnQuYWdlbnRJbnN0cnVjdGlvbnMuY29udGVudCwgJ0Egc2ltcGxlIHVzZXIgYWdlbnQgd2l0aG91dCBoZWFkZXIuJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkaXNhYmxlZCBhZ2VudHMgYXJlIHJlcG9ydGVkIHdpdGggZW5hYmxlZDogZmFsc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICdjdXN0b20tYWdlbnRzLWRpc2FibGVkJztcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZShyb290Rm9sZGVyKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHQvLyBVc2UgYSByZWFsIEluTWVtb3J5U3RvcmFnZVNlcnZpY2UgaW5zdGFuY2Ugc28gZGlzYWJsZWQgc3RhdGUgYWN0dWFsbHkgcGVyc2lzdHNcblx0XHRcdGluc3RhU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpKTtcblx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0Y29uc3QgdGVzdFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdHNTZXJ2aWNlKSk7XG5cblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9hZ2VudHMvZW5hYmxlZC1hZ2VudC5hZ2VudC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcXCdFbmFibGVkIGFnZW50LlxcJycsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdJIGFtIGVuYWJsZWQuJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL2FnZW50cy9kaXNhYmxlZC1hZ2VudC5hZ2VudC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcXCdEaXNhYmxlZCBhZ2VudC5cXCcnLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnSSBhbSBkaXNhYmxlZC4nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvYWdlbnRzL2Fub3RoZXItZGlzYWJsZWQtYWdlbnQuYWdlbnQubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnQW5vdGhlciBkaXNhYmxlZCBhZ2VudC5cXCcnLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnSSBhbSBhbHNvIGRpc2FibGVkLicsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9XG5cdFx0XHRdKTtcblxuXHRcdFx0Ly8gRmlyc3QgbG9hZCB0byBkaXNjb3ZlciBVUklzIGFzIHRoZSBzZXJ2aWNlIHNlZXMgdGhlbVxuXHRcdFx0Y29uc3QgaW5pdGlhbCA9IGF3YWl0IHRlc3RTZXJ2aWNlLmdldEN1c3RvbUFnZW50cyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGNvbnN0IHRvRGlzYWJsZSA9IGluaXRpYWwuZmlsdGVyKGEgPT4gYS5uYW1lID09PSAnZGlzYWJsZWQtYWdlbnQnIHx8IGEubmFtZSA9PT0gJ2Fub3RoZXItZGlzYWJsZWQtYWdlbnQnKTtcblxuXHRcdFx0Ly8gRGlzYWJsZSB0d28gb2YgdGhlIHRocmVlIGFnZW50c1xuXHRcdFx0Y29uc3QgZGlzYWJsZWRVcmlzID0gbmV3IFJlc291cmNlU2V0KCk7XG5cdFx0XHRmb3IgKGNvbnN0IGEgb2YgdG9EaXNhYmxlKSB7XG5cdFx0XHRcdGRpc2FibGVkVXJpcy5hZGQoVVJJLmZyb20oYS51cmkpKTtcblx0XHRcdH1cblx0XHRcdHRlc3RTZXJ2aWNlLnNldERpc2FibGVkUHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUuYWdlbnQsIGRpc2FibGVkVXJpcyk7XG5cblx0XHRcdC8vIFNhbml0eSBjaGVjazogdGhlIHNlcnZpY2UgcmVwb3J0cyB0aGUgVVJJcyBhcyBkaXNhYmxlZFxuXHRcdFx0Y29uc3QgcGVyc2lzdGVkID0gdGVzdFNlcnZpY2UuZ2V0RGlzYWJsZWRQcm9tcHRGaWxlcyhQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGVyc2lzdGVkLnNpemUsIDIsIGBFeHBlY3RlZCAyIGRpc2FibGVkIGFnZW50cywgZ290ICR7cGVyc2lzdGVkLnNpemV9YCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRlc3RTZXJ2aWNlLmdldEN1c3RvbUFnZW50cyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDMsICdTaG91bGQgc3RpbGwgZGlzY292ZXIgYWxsIDMgYWdlbnRzJyk7XG5cblx0XHRcdGNvbnN0IGVuYWJsZWRBZ2VudCA9IHJlc3VsdC5maW5kKGEgPT4gYS5uYW1lID09PSAnZW5hYmxlZC1hZ2VudCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKGVuYWJsZWRBZ2VudCwgJ1Nob3VsZCBmaW5kIGVuYWJsZWQtYWdlbnQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbmFibGVkQWdlbnQuZW5hYmxlZCwgdHJ1ZSwgJ2VuYWJsZWQtYWdlbnQgc2hvdWxkIGJlIGVuYWJsZWQnKTtcblxuXHRcdFx0Y29uc3QgZGlzYWJsZWRBZ2VudCA9IHJlc3VsdC5maW5kKGEgPT4gYS5uYW1lID09PSAnZGlzYWJsZWQtYWdlbnQnKTtcblx0XHRcdGFzc2VydC5vayhkaXNhYmxlZEFnZW50LCAnU2hvdWxkIGZpbmQgZGlzYWJsZWQtYWdlbnQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNhYmxlZEFnZW50LmVuYWJsZWQsIGZhbHNlLCAnZGlzYWJsZWQtYWdlbnQgc2hvdWxkIGJlIGRpc2FibGVkJyk7XG5cblx0XHRcdGNvbnN0IGFub3RoZXJEaXNhYmxlZEFnZW50ID0gcmVzdWx0LmZpbmQoYSA9PiBhLm5hbWUgPT09ICdhbm90aGVyLWRpc2FibGVkLWFnZW50Jyk7XG5cdFx0XHRhc3NlcnQub2soYW5vdGhlckRpc2FibGVkQWdlbnQsICdTaG91bGQgZmluZCBhbm90aGVyLWRpc2FibGVkLWFnZW50Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYW5vdGhlckRpc2FibGVkQWdlbnQuZW5hYmxlZCwgZmFsc2UsICdhbm90aGVyLWRpc2FibGVkLWFnZW50IHNob3VsZCBiZSBkaXNhYmxlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2V0RGlzY292ZXJ5SW5mbyByZXBvcnRzIGVuYWJsZWQgYW5kIGRpc2FibGVkIGFnZW50cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJOYW1lID0gJ2Rpc2NvdmVyeS1pbmZvLWFnZW50cyc7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyID0gYC8ke3Jvb3RGb2xkZXJOYW1lfWA7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUocm9vdEZvbGRlcik7XG5cblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblxuXHRcdFx0Ly8gVXNlIGEgcmVhbCBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlIGluc3RhbmNlIHNvIGRpc2FibGVkIHN0YXRlIGFjdHVhbGx5IHBlcnNpc3RzXG5cdFx0XHRpbnN0YVNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKSk7XG5cdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRcdGNvbnN0IHRlc3RTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRzU2VydmljZSkpO1xuXG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvYWdlbnRzL2VuYWJsZWQtYWdlbnQuYWdlbnQubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnRW5hYmxlZCBhZ2VudC5cXCcnLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnSSBhbSBlbmFibGVkLicsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9hZ2VudHMvZGlzYWJsZWQtYWdlbnQuYWdlbnQubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnRGlzYWJsZWQgYWdlbnQuXFwnJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J0kgYW0gZGlzYWJsZWQuJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXG5cdFx0XHQvLyBEaXNjb3ZlciB0aGUgVVJJcyBhcyB0aGUgc2VydmljZSBzZWVzIHRoZW0sIHRoZW4gZGlzYWJsZSBvbmVcblx0XHRcdGNvbnN0IGluaXRpYWwgPSBhd2FpdCB0ZXN0U2VydmljZS5nZXRDdXN0b21BZ2VudHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRjb25zdCBkaXNhYmxlZCA9IGluaXRpYWwuZmluZChhID0+IGEubmFtZSA9PT0gJ2Rpc2FibGVkLWFnZW50Jyk7XG5cdFx0XHRhc3NlcnQub2soZGlzYWJsZWQsICdTaG91bGQgZmluZCBkaXNhYmxlZC1hZ2VudCBpbiBpbml0aWFsIGRpc2NvdmVyeScpO1xuXG5cdFx0XHRjb25zdCBkaXNhYmxlZFVyaXMgPSBuZXcgUmVzb3VyY2VTZXQoKTtcblx0XHRcdGRpc2FibGVkVXJpcy5hZGQoVVJJLmZyb20oZGlzYWJsZWQudXJpKSk7XG5cdFx0XHR0ZXN0U2VydmljZS5zZXREaXNhYmxlZFByb21wdEZpbGVzKFByb21wdHNUeXBlLmFnZW50LCBkaXNhYmxlZFVyaXMpO1xuXG5cdFx0XHRjb25zdCBkaXNjb3ZlcnlJbmZvID0gYXdhaXQgdGVzdFNlcnZpY2UuZ2V0RGlzY292ZXJ5SW5mbyhQcm9tcHRzVHlwZS5hZ2VudCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzY292ZXJ5SW5mby50eXBlLCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzY292ZXJ5SW5mby5maWxlcy5sZW5ndGgsIDIsICdEaXNjb3Zlcnkgc2hvdWxkIGluY2x1ZGUgYm90aCBhZ2VudHMnKTtcblxuXHRcdFx0Y29uc3QgZW5hYmxlZEZpbGUgPSBkaXNjb3ZlcnlJbmZvLmZpbGVzLmZpbmQoZiA9PiBmLnByb21wdFBhdGgudXJpLnBhdGguZW5kc1dpdGgoJ2VuYWJsZWQtYWdlbnQuYWdlbnQubWQnKSkgYXMgSUFnZW50RGlzY292ZXJ5UmVzdWx0IHwgdW5kZWZpbmVkO1xuXHRcdFx0YXNzZXJ0Lm9rKGVuYWJsZWRGaWxlLCAnU2hvdWxkIHJlcG9ydCBlbmFibGVkLWFnZW50IGluIGRpc2NvdmVyeSBpbmZvJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW5hYmxlZEZpbGUuc3RhdHVzLCAnbG9hZGVkJywgJ0VuYWJsZWQgYWdlbnQgc2hvdWxkIGJlIGxvYWRlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVuYWJsZWRGaWxlLnNraXBSZWFzb24sIHVuZGVmaW5lZCwgJ0VuYWJsZWQgYWdlbnQgc2hvdWxkIG5vdCBoYXZlIGEgc2tpcCByZWFzb24nKTtcblx0XHRcdGFzc2VydC5vayhlbmFibGVkRmlsZS5hZ2VudCwgJ0VuYWJsZWQgYWdlbnQgZmlsZSBzaG91bGQgY2FycnkgcmVzb2x2ZWQgYWdlbnQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbmFibGVkRmlsZS5hZ2VudC5lbmFibGVkLCB0cnVlKTtcblxuXHRcdFx0Y29uc3QgZGlzYWJsZWRGaWxlID0gZGlzY292ZXJ5SW5mby5maWxlcy5maW5kKGYgPT4gZi5wcm9tcHRQYXRoLnVyaS5wYXRoLmVuZHNXaXRoKCdkaXNhYmxlZC1hZ2VudC5hZ2VudC5tZCcpKSBhcyBJQWdlbnREaXNjb3ZlcnlSZXN1bHQgfCB1bmRlZmluZWQ7XG5cdFx0XHRhc3NlcnQub2soZGlzYWJsZWRGaWxlLCAnU2hvdWxkIHJlcG9ydCBkaXNhYmxlZC1hZ2VudCBpbiBkaXNjb3ZlcnkgaW5mbycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc2FibGVkRmlsZS5zdGF0dXMsICdza2lwcGVkJywgJ0Rpc2FibGVkIGFnZW50IHNob3VsZCBiZSBza2lwcGVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzYWJsZWRGaWxlLnNraXBSZWFzb24sICdkaXNhYmxlZCcsICdEaXNhYmxlZCBhZ2VudCBzaG91bGQgaGF2ZSBza2lwUmVhc29uIFwiZGlzYWJsZWRcIicpO1xuXHRcdFx0YXNzZXJ0Lm9rKGRpc2FibGVkRmlsZS5hZ2VudCwgJ0Rpc2FibGVkIGFnZW50IGZpbGUgc2hvdWxkIHN0aWxsIGNhcnJ5IHJlc29sdmVkIGFnZW50Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzYWJsZWRGaWxlLmFnZW50LmVuYWJsZWQsIGZhbHNlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2xpc3RQcm9tcHRGaWxlcyAtIHByb21wdHMnLCAoKSA9PiB7XG5cdFx0dGVzdCgncHJvbXB0cyBmcm9tIHVzZXIgZGF0YSBmb2xkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICdwcm9tcHRzLXVzZXItZGF0YSc7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyID0gYC8ke3Jvb3RGb2xkZXJOYW1lfWA7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUocm9vdEZvbGRlcik7XG5cblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblxuXHRcdFx0Y29uc3QgdXNlclByb21wdHNGb2xkZXIgPSAnL3VzZXItZGF0YS9wcm9tcHRzJztcblx0XHRcdGNvbnN0IHVzZXJQcm9tcHRzRm9sZGVyVXJpID0gVVJJLmZpbGUodXNlclByb21wdHNGb2xkZXIpO1xuXG5cdFx0XHQvLyBPdmVycmlkZSB0aGUgdXNlciBkYXRhIHByb2ZpbGUgc2VydmljZVxuXHRcdFx0Y29uc3QgY3VzdG9tVXNlckRhdGFQcm9maWxlU2VydmljZSA9IHtcblx0XHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRvbkRpZENoYW5nZUN1cnJlbnRQcm9maWxlOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRjdXJyZW50UHJvZmlsZToge1xuXHRcdFx0XHRcdC4uLnRvVXNlckRhdGFQcm9maWxlKCd0ZXN0JywgJ3Rlc3QnLCBVUkkuZmlsZSh1c2VyUHJvbXB0c0ZvbGRlcikud2l0aCh7IHBhdGg6ICcvdXNlci1kYXRhJyB9KSwgVVJJLmZpbGUoJy9jYWNoZScpKSxcblx0XHRcdFx0XHRwcm9tcHRzSG9tZTogdXNlclByb21wdHNGb2xkZXJVcmksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHVwZGF0ZUN1cnJlbnRQcm9maWxlOiBhc3luYyAoKSA9PiB7IH1cblx0XHRcdH07XG5cdFx0XHRpbnN0YVNlcnZpY2Uuc3R1YihJVXNlckRhdGFQcm9maWxlU2VydmljZSwgY3VzdG9tVXNlckRhdGFQcm9maWxlU2VydmljZSk7XG5cblx0XHRcdC8vIFJlY3JlYXRlIHRoZSBzZXJ2aWNlIHdpdGggdGhlIG5ldyBzdHViIChkaXNwb3NlIGV4aXN0aW5nIHRvIGF2b2lkIGR1cGxpY2F0ZSBmaWxlc3lzdGVtIHJlZ2lzdHJhdGlvbilcblx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0Y29uc3QgdGVzdFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdHNTZXJ2aWNlKSk7XG5cblx0XHRcdC8vIENyZWF0ZSBwcm9tcHQgZmlsZXMgaW4gYm90aCB3b3Jrc3BhY2UgYW5kIHVzZXIgZGF0YSBmb2xkZXJcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHQvLyBXb3Jrc3BhY2UgcHJvbXB0XG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL3Byb21wdHMvd29ya3NwYWNlLXByb21wdC5wcm9tcHQubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnV29ya3NwYWNlIHByb21wdC5cXCcnLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnSSBhbSBhIHdvcmtzcGFjZSBwcm9tcHQuJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdC8vIFVzZXIgZGF0YSBwcm9tcHRcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3VzZXJQcm9tcHRzRm9sZGVyfS91c2VyLXByb21wdC5wcm9tcHQubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnVXNlciBkYXRhIHByb21wdC5cXCcnLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnSSBhbSBhIHVzZXIgZGF0YSBwcm9tcHQuJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0ZXN0U2VydmljZS5saXN0UHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUucHJvbXB0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0Ly8gU2hvdWxkIGZpbmQgcHJvbXB0cyBmcm9tIGJvdGggd29ya3NwYWNlIGFuZCB1c2VyIGRhdGFcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAyLCAnU2hvdWxkIGZpbmQgMiBwcm9tcHRzICgxIHdvcmtzcGFjZSArIDEgdXNlciBkYXRhKScpO1xuXG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VQcm9tcHQgPSByZXN1bHQuZmluZChwID0+IHAuc3RvcmFnZSA9PT0gUHJvbXB0c1N0b3JhZ2UubG9jYWwpO1xuXHRcdFx0YXNzZXJ0Lm9rKHdvcmtzcGFjZVByb21wdCwgJ1Nob3VsZCBmaW5kIHdvcmtzcGFjZSBwcm9tcHQnKTtcblx0XHRcdGFzc2VydC5vayh3b3Jrc3BhY2VQcm9tcHQudXJpLnBhdGguaW5jbHVkZXMoJ3dvcmtzcGFjZS1wcm9tcHQucHJvbXB0Lm1kJykpO1xuXG5cdFx0XHRjb25zdCB1c2VyUHJvbXB0ID0gcmVzdWx0LmZpbmQocCA9PiBwLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLnVzZXIpO1xuXHRcdFx0YXNzZXJ0Lm9rKHVzZXJQcm9tcHQsICdTaG91bGQgZmluZCB1c2VyIGRhdGEgcHJvbXB0Jyk7XG5cdFx0XHRhc3NlcnQub2sodXNlclByb21wdC51cmkucGF0aC5pbmNsdWRlcygndXNlci1wcm9tcHQucHJvbXB0Lm1kJykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnbGlzdFByb21wdEZpbGVzIC0gaW5zdHJ1Y3Rpb25zJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2luc3RydWN0aW9ucyBmcm9tIHVzZXIgZGF0YSBmb2xkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICdpbnN0cnVjdGlvbnMtdXNlci1kYXRhJztcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZShyb290Rm9sZGVyKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHRjb25zdCB1c2VyUHJvbXB0c0ZvbGRlciA9ICcvdXNlci1kYXRhL3Byb21wdHMnO1xuXHRcdFx0Y29uc3QgdXNlclByb21wdHNGb2xkZXJVcmkgPSBVUkkuZmlsZSh1c2VyUHJvbXB0c0ZvbGRlcik7XG5cblx0XHRcdC8vIE92ZXJyaWRlIHRoZSB1c2VyIGRhdGEgcHJvZmlsZSBzZXJ2aWNlXG5cdFx0XHRjb25zdCBjdXN0b21Vc2VyRGF0YVByb2ZpbGVTZXJ2aWNlID0ge1xuXHRcdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdG9uRGlkQ2hhbmdlQ3VycmVudFByb2ZpbGU6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdGN1cnJlbnRQcm9maWxlOiB7XG5cdFx0XHRcdFx0Li4udG9Vc2VyRGF0YVByb2ZpbGUoJ3Rlc3QnLCAndGVzdCcsIFVSSS5maWxlKHVzZXJQcm9tcHRzRm9sZGVyKS53aXRoKHsgcGF0aDogJy91c2VyLWRhdGEnIH0pLCBVUkkuZmlsZSgnL2NhY2hlJykpLFxuXHRcdFx0XHRcdHByb21wdHNIb21lOiB1c2VyUHJvbXB0c0ZvbGRlclVyaSxcblx0XHRcdFx0fSxcblx0XHRcdFx0dXBkYXRlQ3VycmVudFByb2ZpbGU6IGFzeW5jICgpID0+IHsgfVxuXHRcdFx0fTtcblx0XHRcdGluc3RhU2VydmljZS5zdHViKElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlLCBjdXN0b21Vc2VyRGF0YVByb2ZpbGVTZXJ2aWNlKTtcblxuXHRcdFx0Ly8gUmVjcmVhdGUgdGhlIHNlcnZpY2Ugd2l0aCB0aGUgbmV3IHN0dWIgKGRpc3Bvc2UgZXhpc3RpbmcgdG8gYXZvaWQgZHVwbGljYXRlIGZpbGVzeXN0ZW0gcmVnaXN0cmF0aW9uKVxuXHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0XHRjb25zdCB0ZXN0U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0c1NlcnZpY2UpKTtcblxuXHRcdFx0Ly8gQ3JlYXRlIGluc3RydWN0aW9ucyBmaWxlcyBpbiBib3RoIHdvcmtzcGFjZSBhbmQgdXNlciBkYXRhIGZvbGRlclxuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdC8vIFdvcmtzcGFjZSBpbnN0cnVjdGlvbnNcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvaW5zdHJ1Y3Rpb25zL3dvcmtzcGFjZS1pbnN0cnVjdGlvbnMuaW5zdHJ1Y3Rpb25zLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFxcJ1dvcmtzcGFjZSBpbnN0cnVjdGlvbnMuXFwnJyxcblx0XHRcdFx0XHRcdCdhcHBseVRvOiBcIioqLyoudHNcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdJIGFtIHdvcmtzcGFjZSBpbnN0cnVjdGlvbnMuJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdC8vIFVzZXIgZGF0YSBpbnN0cnVjdGlvbnNcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3VzZXJQcm9tcHRzRm9sZGVyfS91c2VyLWluc3RydWN0aW9ucy5pbnN0cnVjdGlvbnMubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnVXNlciBkYXRhIGluc3RydWN0aW9ucy5cXCcnLFxuXHRcdFx0XHRcdFx0J2FwcGx5VG86IFwiKiovKi50c3hcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdJIGFtIHVzZXIgZGF0YSBpbnN0cnVjdGlvbnMuJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0ZXN0U2VydmljZS5saXN0UHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0Ly8gU2hvdWxkIGZpbmQgaW5zdHJ1Y3Rpb25zIGZyb20gYm90aCB3b3Jrc3BhY2UgYW5kIHVzZXIgZGF0YVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDIsICdTaG91bGQgZmluZCAyIGluc3RydWN0aW9ucyAoMSB3b3Jrc3BhY2UgKyAxIHVzZXIgZGF0YSknKTtcblxuXHRcdFx0Y29uc3Qgd29ya3NwYWNlSW5zdHJ1Y3Rpb25zID0gcmVzdWx0LmZpbmQocCA9PiBwLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLmxvY2FsKTtcblx0XHRcdGFzc2VydC5vayh3b3Jrc3BhY2VJbnN0cnVjdGlvbnMsICdTaG91bGQgZmluZCB3b3Jrc3BhY2UgaW5zdHJ1Y3Rpb25zJyk7XG5cdFx0XHRhc3NlcnQub2sod29ya3NwYWNlSW5zdHJ1Y3Rpb25zLnVyaS5wYXRoLmluY2x1ZGVzKCd3b3Jrc3BhY2UtaW5zdHJ1Y3Rpb25zLmluc3RydWN0aW9ucy5tZCcpKTtcblxuXHRcdFx0Y29uc3QgdXNlckluc3RydWN0aW9ucyA9IHJlc3VsdC5maW5kKHAgPT4gcC5zdG9yYWdlID09PSBQcm9tcHRzU3RvcmFnZS51c2VyKTtcblx0XHRcdGFzc2VydC5vayh1c2VySW5zdHJ1Y3Rpb25zLCAnU2hvdWxkIGZpbmQgdXNlciBkYXRhIGluc3RydWN0aW9ucycpO1xuXHRcdFx0YXNzZXJ0Lm9rKHVzZXJJbnN0cnVjdGlvbnMudXJpLnBhdGguaW5jbHVkZXMoJ3VzZXItaW5zdHJ1Y3Rpb25zLmluc3RydWN0aW9ucy5tZCcpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2xpc3RQcm9tcHRGaWxlcyAtIHNraWxscyAnLCAoKSA9PiB7XG5cdFx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdFx0c2lub24ucmVzdG9yZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGxpc3Qgc2tpbGwgZmlsZXMgZnJvbSB3b3Jrc3BhY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9BR0VOVF9TS0lMTFMsIHRydWUpO1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5TS0lMTFNfTE9DQVRJT05fS0VZLCB7fSk7XG5cblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJOYW1lID0gJ2xpc3Qtc2tpbGxzLXdvcmtzcGFjZSc7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyID0gYC8ke3Jvb3RGb2xkZXJOYW1lfWA7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUocm9vdEZvbGRlcik7XG5cblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblxuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL3NraWxscy9za2lsbDEvU0tJTEwubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBcIlNraWxsIDFcIicsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiRmlyc3Qgc2tpbGxcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdTa2lsbCAxIGNvbnRlbnQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uY2xhdWRlL3NraWxscy9za2lsbDIvU0tJTEwubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBcIlNraWxsIDJcIicsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiU2Vjb25kIHNraWxsXCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnU2tpbGwgMiBjb250ZW50Jyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UubGlzdFByb21wdEZpbGVzKFByb21wdHNUeXBlLnNraWxsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDIsICdTaG91bGQgZmluZCAyIHNraWxscycpO1xuXG5cdFx0XHRjb25zdCBza2lsbDEgPSByZXN1bHQuZmluZChzID0+IHMudXJpLnBhdGguaW5jbHVkZXMoJ3NraWxsMScpKTtcblx0XHRcdGFzc2VydC5vayhza2lsbDEsICdTaG91bGQgZmluZCBza2lsbDEnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChza2lsbDEudHlwZSwgUHJvbXB0c1R5cGUuc2tpbGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNraWxsMS5zdG9yYWdlLCBQcm9tcHRzU3RvcmFnZS5sb2NhbCk7XG5cblx0XHRcdGNvbnN0IHNraWxsMiA9IHJlc3VsdC5maW5kKHMgPT4gcy51cmkucGF0aC5pbmNsdWRlcygnc2tpbGwyJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHNraWxsMiwgJ1Nob3VsZCBmaW5kIHNraWxsMicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNraWxsMi50eXBlLCBQcm9tcHRzVHlwZS5za2lsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2tpbGwyLnN0b3JhZ2UsIFByb21wdHNTdG9yYWdlLmxvY2FsKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBsaXN0IHNraWxsIGZpbGVzIGZyb20gdXNlciBob21lJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQUdFTlRfU0tJTExTLCB0cnVlKTtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuU0tJTExTX0xPQ0FUSU9OX0tFWSwge30pO1xuXG5cdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICdsaXN0LXNraWxscy11c2VyLWhvbWUnO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlciA9IGAvJHtyb290Rm9sZGVyTmFtZX1gO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlclVyaSA9IFVSSS5maWxlKHJvb3RGb2xkZXIpO1xuXG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2UodGVzdFdvcmtzcGFjZShyb290Rm9sZGVyVXJpKSk7XG5cblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogJy9ob21lL3VzZXIvLmNvcGlsb3Qvc2tpbGxzL3BlcnNvbmFsLXNraWxsL1NLSUxMLm1kJyxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogXCJQZXJzb25hbCBTa2lsbFwiJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJBIHBlcnNvbmFsIHNraWxsXCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnUGVyc29uYWwgc2tpbGwgY29udGVudCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6ICcvaG9tZS91c2VyLy5jbGF1ZGUvc2tpbGxzL2NsYXVkZS1wZXJzb25hbC9TS0lMTC5tZCcsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFwiQ2xhdWRlIFBlcnNvbmFsIFNraWxsXCInLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkEgQ2xhdWRlIHBlcnNvbmFsIHNraWxsXCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnQ2xhdWRlIHBlcnNvbmFsIHNraWxsIGNvbnRlbnQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5saXN0UHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUuc2tpbGwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRjb25zdCBwZXJzb25hbFNraWxscyA9IHJlc3VsdC5maWx0ZXIocyA9PiBzLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLnVzZXIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBlcnNvbmFsU2tpbGxzLmxlbmd0aCwgMiwgJ1Nob3VsZCBmaW5kIDIgcGVyc29uYWwgc2tpbGxzJyk7XG5cblx0XHRcdGNvbnN0IGNvcGlsb3RTa2lsbCA9IHBlcnNvbmFsU2tpbGxzLmZpbmQocyA9PiBzLnVyaS5wYXRoLmluY2x1ZGVzKCcuY29waWxvdCcpKTtcblx0XHRcdGFzc2VydC5vayhjb3BpbG90U2tpbGwsICdTaG91bGQgZmluZCBjb3BpbG90IHBlcnNvbmFsIHNraWxsJyk7XG5cblx0XHRcdGNvbnN0IGNsYXVkZVNraWxsID0gcGVyc29uYWxTa2lsbHMuZmluZChzID0+IHMudXJpLnBhdGguaW5jbHVkZXMoQ0xBVURFX0NPTkZJR19GT0xERVIpKTtcblx0XHRcdGFzc2VydC5vayhjbGF1ZGVTa2lsbCwgJ1Nob3VsZCBmaW5kIGNsYXVkZSBwZXJzb25hbCBza2lsbCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBsaXN0IHNraWxscyB3aGVuIG5vdCBpbiBza2lsbCBmb2xkZXIgc3RydWN0dXJlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQUdFTlRfU0tJTExTLCB0cnVlKTtcblxuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlck5hbWUgPSAnbm8tc2tpbGxzJztcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZShyb290Rm9sZGVyKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHQvLyBDcmVhdGUgZmlsZXMgaW4gbm9uLXNraWxsIGxvY2F0aW9uc1xuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL3Byb21wdHMvU0tJTEwubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBcIk5vdCBhIHNraWxsXCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnVGhpcyBpcyBpbiBwcm9tcHRzIGZvbGRlciwgbm90IHNraWxscycsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9L1NLSUxMLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogXCJSb290IHNraWxsXCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnVGhpcyBpcyBpbiByb290LCBub3Qgc2tpbGxzIGZvbGRlcicsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmxpc3RQcm9tcHRGaWxlcyhQcm9tcHRzVHlwZS5za2lsbCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAwLCAnU2hvdWxkIG5vdCBmaW5kIGFueSBza2lsbHMgaW4gbm9uLXNraWxsIGxvY2F0aW9ucycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBtaXhlZCB3b3Jrc3BhY2UgYW5kIHVzZXIgaG9tZSBza2lsbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9BR0VOVF9TS0lMTFMsIHRydWUpO1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5TS0lMTFNfTE9DQVRJT05fS0VZLCB7fSk7XG5cblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJOYW1lID0gJ21peGVkLXNraWxscyc7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyID0gYC8ke3Jvb3RGb2xkZXJOYW1lfWA7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUocm9vdEZvbGRlcik7XG5cblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblxuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdC8vIFdvcmtzcGFjZSBza2lsbHNcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvc2tpbGxzL3dvcmtzcGFjZS1za2lsbC9TS0lMTC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFwiV29ya3NwYWNlIFNraWxsXCInLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkEgd29ya3NwYWNlIHNraWxsXCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnV29ya3NwYWNlIHNraWxsIGNvbnRlbnQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdC8vIFVzZXIgaG9tZSBza2lsbHNcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6ICcvaG9tZS91c2VyLy5jb3BpbG90L3NraWxscy9wZXJzb25hbC1za2lsbC9TS0lMTC5tZCcsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFwiUGVyc29uYWwgU2tpbGxcIicsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiQSBwZXJzb25hbCBza2lsbFwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1BlcnNvbmFsIHNraWxsIGNvbnRlbnQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5saXN0UHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUuc2tpbGwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VTa2lsbHMgPSByZXN1bHQuZmlsdGVyKHMgPT4gcy5zdG9yYWdlID09PSBQcm9tcHRzU3RvcmFnZS5sb2NhbCk7XG5cdFx0XHRjb25zdCB1c2VyU2tpbGxzID0gcmVzdWx0LmZpbHRlcihzID0+IHMuc3RvcmFnZSA9PT0gUHJvbXB0c1N0b3JhZ2UudXNlcik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3Jrc3BhY2VTa2lsbHMubGVuZ3RoLCAxLCAnU2hvdWxkIGZpbmQgMSB3b3Jrc3BhY2Ugc2tpbGwnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1c2VyU2tpbGxzLmxlbmd0aCwgMSwgJ1Nob3VsZCBmaW5kIDEgdXNlciBza2lsbCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJlc3BlY3QgZGlzYWJsZWQgZGVmYXVsdCBwYXRocyB2aWEgY29uZmlnJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQUdFTlRfU0tJTExTLCB0cnVlKTtcblx0XHRcdC8vIERpc2FibGUgLmdpdGh1Yi9za2lsbHMsIG9ubHkgLmNsYXVkZS9za2lsbHMgc2hvdWxkIGJlIHNlYXJjaGVkXG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlNLSUxMU19MT0NBVElPTl9LRVksIHtcblx0XHRcdFx0Jy5naXRodWIvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdCcuY2xhdWRlL3NraWxscyc6IHRydWUsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlck5hbWUgPSAnZGlzYWJsZWQtZGVmYXVsdC10ZXN0Jztcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZShyb290Rm9sZGVyKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvc2tpbGxzL2dpdGh1Yi1za2lsbC9TS0lMTC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFwiR2l0SHViIFNraWxsXCInLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlNob3VsZCBOT1QgYmUgZm91bmRcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdUaGlzIHNraWxsIGlzIGluIGEgZGlzYWJsZWQgZm9sZGVyJyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmNsYXVkZS9za2lsbHMvY2xhdWRlLXNraWxsL1NLSUxMLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogXCJDbGF1ZGUgU2tpbGxcIicsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiU2hvdWxkIGJlIGZvdW5kXCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnVGhpcyBza2lsbCBpcyBpbiBhbiBlbmFibGVkIGZvbGRlcicsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmxpc3RQcm9tcHRGaWxlcyhQcm9tcHRzVHlwZS5za2lsbCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxLCAnU2hvdWxkIGZpbmQgb25seSAxIHNraWxsIChmcm9tIGVuYWJsZWQgZm9sZGVyKScpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdFswXS51cmkucGF0aC5pbmNsdWRlcygnLmNsYXVkZS9za2lsbHMnKSwgJ1Nob3VsZCBvbmx5IGZpbmQgc2tpbGwgZnJvbSAuY2xhdWRlL3NraWxscycpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFyZXN1bHRbMF0udXJpLnBhdGguaW5jbHVkZXMoJy5naXRodWIvc2tpbGxzJyksICdTaG91bGQgbm90IGZpbmQgc2tpbGwgZnJvbSBkaXNhYmxlZCAuZ2l0aHViL3NraWxscycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGV4cGFuZCB0aWxkZSBwYXRocyBpbiBjdXN0b20gbG9jYXRpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQUdFTlRfU0tJTExTLCB0cnVlKTtcblx0XHRcdC8vIEFkZCBhIHRpbGRlIHBhdGggYXMgY3VzdG9tIGxvY2F0aW9uXG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlNLSUxMU19MT0NBVElPTl9LRVksIHtcblx0XHRcdFx0Jy5naXRodWIvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdCcuY2xhdWRlL3NraWxscyc6IGZhbHNlLFxuXHRcdFx0XHQnfi9teS1jdXN0b20tc2tpbGxzJzogdHJ1ZSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICd0aWxkZS10ZXN0Jztcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZShyb290Rm9sZGVyKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHQvLyBUaGUgbW9jayB1c2VyIGhvbWUgaXMgL2hvbWUvdXNlciwgc28gfi9teS1jdXN0b20tc2tpbGxzIHNob3VsZCByZXNvbHZlIHRvIC9ob21lL3VzZXIvbXktY3VzdG9tLXNraWxsc1xuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnL2hvbWUvdXNlci9teS1jdXN0b20tc2tpbGxzL2N1c3RvbS1za2lsbC9TS0lMTC5tZCcsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFwiQ3VzdG9tIFNraWxsXCInLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkEgc2tpbGwgZnJvbSB0aWxkZSBwYXRoXCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnU2tpbGwgY29udGVudCBmcm9tIH4vbXktY3VzdG9tLXNraWxscycsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmxpc3RQcm9tcHRGaWxlcyhQcm9tcHRzVHlwZS5za2lsbCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxLCAnU2hvdWxkIGZpbmQgMSBza2lsbCBmcm9tIHRpbGRlLWV4cGFuZGVkIHBhdGgnKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHRbMF0udXJpLnBhdGguaW5jbHVkZXMoJy9ob21lL3VzZXIvbXktY3VzdG9tLXNraWxscycpLCAnUGF0aCBzaG91bGQgYmUgZXhwYW5kZWQgZnJvbSB0aWxkZScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZ2V0U291cmNlRm9sZGVycyAtIHNraWxscycsICgpID0+IHtcblx0XHR0ZXN0KCdpbmNsdWRlcyB1c2VyLWxldmVsIHNraWxsIHNvdXJjZSBmb2xkZXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQUdFTlRfU0tJTExTLCB0cnVlKTtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuU0tJTExTX0xPQ0FUSU9OX0tFWSwge30pO1xuXG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUoJy9za2lsbHMtc291cmNlLWZvbGRlcnMnKTtcblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblxuXHRcdFx0Y29uc3QgZm9sZGVycyA9IGF3YWl0IHNlcnZpY2UuZ2V0U291cmNlRm9sZGVycyhQcm9tcHRzVHlwZS5za2lsbCk7XG5cblx0XHRcdGNvbnN0IHVzZXJGb2xkZXJzID0gZm9sZGVycy5maWx0ZXIoZiA9PiBmLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLnVzZXIpO1xuXHRcdFx0Y29uc3QgbG9jYWxGb2xkZXJzID0gZm9sZGVycy5maWx0ZXIoZiA9PiBmLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLmxvY2FsKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHVzZXJGb2xkZXJzLmxlbmd0aCA+IDAsICdTaG91bGQgaW5jbHVkZSB1c2VyLWxldmVsIHNraWxsIHNvdXJjZSBmb2xkZXJzJyk7XG5cdFx0XHRhc3NlcnQub2sobG9jYWxGb2xkZXJzLmxlbmd0aCA+IDAsICdTaG91bGQgaW5jbHVkZSB3b3Jrc3BhY2UtbGV2ZWwgc2tpbGwgc291cmNlIGZvbGRlcnMnKTtcblx0XHRcdGFzc2VydC5vayhcblx0XHRcdFx0dXNlckZvbGRlcnMuc29tZShmID0+IGYudXJpLnBhdGggPT09ICcvaG9tZS91c2VyLy5jb3BpbG90L3NraWxscycpLFxuXHRcdFx0XHQnU2hvdWxkIGluY2x1ZGUgfi8uY29waWxvdC9za2lsbHMgYXMgYSB1c2VyIHNvdXJjZSBmb2xkZXInXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXhjbHVkZXMgZGVmYXVsdHMgZXhwbGljaXRseSBkaXNhYmxlZCB2aWEgY29uZmlndXJhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0FHRU5UX1NLSUxMUywgdHJ1ZSk7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlNLSUxMU19MT0NBVElPTl9LRVksIHtcblx0XHRcdFx0Jy5naXRodWIvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdCd+Ly5jb3BpbG90L3NraWxscyc6IGZhbHNlLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZSgnL3NraWxscy1kaXNhYmxlZC1kZWZhdWx0cycpO1xuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHRjb25zdCBmb2xkZXJzID0gYXdhaXQgc2VydmljZS5nZXRTb3VyY2VGb2xkZXJzKFByb21wdHNUeXBlLnNraWxsKTtcblx0XHRcdGNvbnN0IHBhdGhzID0gZm9sZGVycy5tYXAoZiA9PiBmLnVyaS5wYXRoKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKCFwYXRocy5zb21lKHAgPT4gcC5lbmRzV2l0aCgnLy5naXRodWIvc2tpbGxzJykpLCAnRGlzYWJsZWQgLmdpdGh1Yi9za2lsbHMgbXVzdCBub3QgYXBwZWFyJyk7XG5cdFx0XHRhc3NlcnQub2soIXBhdGhzLmluY2x1ZGVzKCcvaG9tZS91c2VyLy5jb3BpbG90L3NraWxscycpLCAnRGlzYWJsZWQgfi8uY29waWxvdC9za2lsbHMgbXVzdCBub3QgYXBwZWFyJyk7XG5cdFx0XHRhc3NlcnQub2socGF0aHMuaW5jbHVkZXMoJy9ob21lL3VzZXIvLmFnZW50cy9za2lsbHMnKSwgJ05vbi1kaXNhYmxlZCB+Ly5hZ2VudHMvc2tpbGxzIG11c3Qgc3RpbGwgYXBwZWFyJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdsaXN0UHJvbXB0RmlsZXMgLSBleHRlbnNpb25zJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnQ29udHJpYnV0ZWQgcHJvbXB0IGZpbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly9leHRlbnNpb25zL215LWV4dGVuc2lvbi90ZXh0TWF0ZS5pbnN0cnVjdGlvbnMubWQnKTtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IHt9IGFzIElFeHRlbnNpb25EZXNjcmlwdGlvbjtcblx0XHRcdGNvbnN0IHJlZ2lzdGVyZWQgPSBzZXJ2aWNlLnJlZ2lzdGVyQ29udHJpYnV0ZWRGaWxlKFByb21wdHNUeXBlLmluc3RydWN0aW9ucyxcblx0XHRcdFx0dXJpLFxuXHRcdFx0XHRleHRlbnNpb24sXG5cdFx0XHRcdCdUZXh0TWF0ZSBJbnN0cnVjdGlvbnMnLFxuXHRcdFx0XHQnSW5zdHJ1Y3Rpb25zIHRvIGZvbGxvdyB3aGVuIGF1dGhvcmluZyBUZXh0TWF0ZSBncmFtbWFycycsXG5cdFx0XHQpO1xuXG5cdFx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBzZXJ2aWNlLmxpc3RQcm9tcHRGaWxlcyhQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbFswXS51cmkudG9TdHJpbmcoKSwgdXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbFswXS5uYW1lLCAnVGV4dE1hdGUgSW5zdHJ1Y3Rpb25zJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsWzBdLnN0b3JhZ2UsIFByb21wdHNTdG9yYWdlLmV4dGVuc2lvbik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsWzBdLnR5cGUsIFByb21wdHNUeXBlLmluc3RydWN0aW9ucyk7XG5cdFx0XHRyZWdpc3RlcmVkLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dldEluc3RydWN0aW9uRmlsZXMgcmV0dXJucyByZXNvbHZlZCBtZXRhZGF0YScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovL2V4dGVuc2lvbnMvbXktZXh0ZW5zaW9uL3RleHRNYXRlLmluc3RydWN0aW9ucy5tZCcpO1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0ge1xuXHRcdFx0XHRpZGVudGlmaWVyOiB7IHZhbHVlOiAndGVzdC5teS1leHRlbnNpb24nIH1cblx0XHRcdH0gYXMgSUV4dGVuc2lvbkRlc2NyaXB0aW9uO1xuXG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFt7XG5cdFx0XHRcdHBhdGg6IHVyaS5wYXRoLFxuXHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCduYW1lOiBUZXh0TWF0ZSBJbnN0cnVjdGlvbnMnLFxuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogSW5zdHJ1Y3Rpb25zIHRvIGZvbGxvdyB3aGVuIGF1dGhvcmluZyBUZXh0TWF0ZSBncmFtbWFycycsXG5cdFx0XHRcdFx0J2FwcGx5VG86IFwiKiovKi50bUxhbmd1YWdlLmpzb25cIicsXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J1VzZSBzY29wZXMgY2FyZWZ1bGx5LicsXG5cdFx0XHRcdF1cblx0XHRcdH1dKTtcblxuXHRcdFx0Y29uc3QgcmVnaXN0ZXJlZCA9IHNlcnZpY2UucmVnaXN0ZXJDb250cmlidXRlZEZpbGUoXG5cdFx0XHRcdFByb21wdHNUeXBlLmluc3RydWN0aW9ucyxcblx0XHRcdFx0dXJpLFxuXHRcdFx0XHRleHRlbnNpb24sXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0KTtcblxuXHRcdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgc2VydmljZS5nZXRJbnN0cnVjdGlvbkZpbGVzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubWFwKCh7IHVyaSwgbmFtZSwgZGVzY3JpcHRpb24sIHBhdHRlcm4sIHN0b3JhZ2UsIHNvdXJjZSwgcGx1Z2luVXJpLCBleHRlbnNpb24gfSkgPT4gKHsgdXJpLCBuYW1lLCBkZXNjcmlwdGlvbiwgYXBwbHlUbzogcGF0dGVybiwgc3RvcmFnZSwgc291cmNlLCBwbHVnaW5VcmksIGV4dGVuc2lvbiB9KSksIFt7XG5cdFx0XHRcdHVyaSxcblx0XHRcdFx0bmFtZTogJ1RleHRNYXRlIEluc3RydWN0aW9ucycsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnSW5zdHJ1Y3Rpb25zIHRvIGZvbGxvdyB3aGVuIGF1dGhvcmluZyBUZXh0TWF0ZSBncmFtbWFycycsXG5cdFx0XHRcdGFwcGx5VG86ICcqKi8qLnRtTGFuZ3VhZ2UuanNvbicsXG5cdFx0XHRcdHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmV4dGVuc2lvbixcblx0XHRcdFx0c291cmNlOiBQcm9tcHRGaWxlU291cmNlLkV4dGVuc2lvbkNvbnRyaWJ1dGlvbixcblx0XHRcdFx0cGx1Z2luVXJpOiB1bmRlZmluZWQsXG5cdFx0XHRcdGV4dGVuc2lvbixcblx0XHRcdH1dKTtcblxuXHRcdFx0cmVnaXN0ZXJlZC5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdDdXN0b20gYWdlbnQgcHJvdmlkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhZ2VudFVyaSA9IFVSSS5wYXJzZSgnZmlsZTovL2V4dGVuc2lvbnMvbXktZXh0ZW5zaW9uL215QWdlbnQuYWdlbnQubWQnKTtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IHtcblx0XHRcdFx0aWRlbnRpZmllcjogeyB2YWx1ZTogJ3Rlc3QubXktZXh0ZW5zaW9uJyB9LFxuXHRcdFx0XHRlbmFibGVkQXBpUHJvcG9zYWxzOiBbJ2NoYXRQYXJ0aWNpcGFudFByaXZhdGUnXVxuXHRcdFx0fSBhcyB1bmtub3duIGFzIElFeHRlbnNpb25EZXNjcmlwdGlvbjtcblxuXHRcdFx0Ly8gTW9jayB0aGUgYWdlbnQgZmlsZSBjb250ZW50XG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGFnZW50VXJpLnBhdGgsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcXCdNeSBjdXN0b20gYWdlbnQgZnJvbSBwcm92aWRlclxcJycsXG5cdFx0XHRcdFx0XHQndG9vbHM6IFsgdG9vbDEsIHRvb2wyIF0nLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnSSBhbSBhIGN1c3RvbSBhZ2VudCBmcm9tIGEgcHJvdmlkZXIuJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBwcm92aWRlciA9IHtcblx0XHRcdFx0cHJvdmlkZVByb21wdEZpbGVzOiBhc3luYyAoX2NvbnRleHQ6IElQcm9tcHRGaWxlQ29udGV4dCwgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4ge1xuXHRcdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdHVyaTogYWdlbnRVcmlcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRdO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZWdpc3RlcmVkID0gc2VydmljZS5yZWdpc3RlclByb21wdEZpbGVQcm92aWRlcihleHRlbnNpb24sIFByb21wdHNUeXBlLmFnZW50LCBwcm92aWRlcik7XG5cblx0XHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IHNlcnZpY2UuZ2V0Q3VzdG9tQWdlbnRzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbFswXS5uYW1lLCAnbXlBZ2VudCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbFswXS5kZXNjcmlwdGlvbiwgJ015IGN1c3RvbSBhZ2VudCBmcm9tIHByb3ZpZGVyJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsWzBdLnVyaS50b1N0cmluZygpLCBhZ2VudFVyaS50b1N0cmluZygpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWxbMF0uc291cmNlLnN0b3JhZ2UsIFByb21wdHNTdG9yYWdlLmV4dGVuc2lvbik7XG5cblx0XHRcdHJlZ2lzdGVyZWQuZGlzcG9zZSgpO1xuXG5cdFx0XHQvLyBBZnRlciBkaXNwb3NhbCwgdGhlIGFnZW50IHNob3VsZCBubyBsb25nZXIgYmUgbGlzdGVkXG5cdFx0XHRjb25zdCBhY3R1YWxBZnRlckRpc3Bvc2UgPSBhd2FpdCBzZXJ2aWNlLmdldEN1c3RvbUFnZW50cyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWxBZnRlckRpc3Bvc2UubGVuZ3RoLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ0NvbnRyaWJ1dGVkIGFnZW50IGZpbGUgdGhhdCBkb2VzIG5vdCBleGlzdCBzaG91bGQgbm90IGNyYXNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm9uRXhpc3RlbnRVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly9leHRlbnNpb25zL215LWV4dGVuc2lvbi9ub25leGlzdGVudC5hZ2VudC5tZCcpO1xuXHRcdFx0Y29uc3QgZXhpc3RpbmdVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly9leHRlbnNpb25zL215LWV4dGVuc2lvbi9leGlzdGluZy5hZ2VudC5tZCcpO1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0ge1xuXHRcdFx0XHRpZGVudGlmaWVyOiB7IHZhbHVlOiAndGVzdC5teS1leHRlbnNpb24nIH1cblx0XHRcdH0gYXMgdW5rbm93biBhcyBJRXh0ZW5zaW9uRGVzY3JpcHRpb247XG5cblx0XHRcdC8vIE9ubHkgY3JlYXRlIHRoZSBleGlzdGluZyBmaWxlXG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGV4aXN0aW5nVXJpLnBhdGgsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFxcJ0V4aXN0aW5nIEFnZW50XFwnJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnQW4gYWdlbnQgdGhhdCBleGlzdHNcXCcnLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnSSBhbSBhbiBleGlzdGluZyBhZ2VudC4nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fVxuXHRcdFx0XSk7XG5cblx0XHRcdC8vIFJlZ2lzdGVyIGJvdGggYWdlbnRzIChvbmUgZXhpc3RzLCBvbmUgZG9lc24ndClcblx0XHRcdGNvbnN0IHJlZ2lzdGVyZWQxID0gc2VydmljZS5yZWdpc3RlckNvbnRyaWJ1dGVkRmlsZShcblx0XHRcdFx0UHJvbXB0c1R5cGUuYWdlbnQsXG5cdFx0XHRcdG5vbkV4aXN0ZW50VXJpLFxuXHRcdFx0XHRleHRlbnNpb24sXG5cdFx0XHRcdCdOb25FeGlzdGVudCBBZ2VudCcsXG5cdFx0XHRcdCdBbiBhZ2VudCB0aGF0IGRvZXMgbm90IGV4aXN0Jyxcblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IHJlZ2lzdGVyZWQyID0gc2VydmljZS5yZWdpc3RlckNvbnRyaWJ1dGVkRmlsZShcblx0XHRcdFx0UHJvbXB0c1R5cGUuYWdlbnQsXG5cdFx0XHRcdGV4aXN0aW5nVXJpLFxuXHRcdFx0XHRleHRlbnNpb24sXG5cdFx0XHRcdCdFeGlzdGluZyBBZ2VudCcsXG5cdFx0XHRcdCdBbiBhZ2VudCB0aGF0IGV4aXN0cycsXG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBWZXJpZnkgdGhhdCBnZXRDdXN0b21BZ2VudHMgZG9lc24ndCBjcmFzaCBhbmQgcmV0dXJucyBvbmx5IHRoZSB2YWxpZCBhZ2VudFxuXHRcdFx0Y29uc3QgYWdlbnRzID0gYXdhaXQgc2VydmljZS5nZXRDdXN0b21BZ2VudHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdC8vIFNob3VsZCBvbmx5IGdldCB0aGUgZXhpc3RpbmcgYWdlbnQsIG5vdCB0aGUgbm9uLWV4aXN0ZW50IG9uZVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50cy5sZW5ndGgsIDEsICdTaG91bGQgb25seSByZXR1cm4gdGhlIGFnZW50IHRoYXQgZXhpc3RzJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRzWzBdLm5hbWUsICdFeGlzdGluZyBBZ2VudCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50c1swXS5kZXNjcmlwdGlvbiwgJ0FuIGFnZW50IHRoYXQgZXhpc3RzJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRzWzBdLnVyaS50b1N0cmluZygpLCBleGlzdGluZ1VyaS50b1N0cmluZygpKTtcblxuXHRcdFx0cmVnaXN0ZXJlZDEuZGlzcG9zZSgpO1xuXHRcdFx0cmVnaXN0ZXJlZDIuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnQ29udHJpYnV0ZWQgZmlsZSB3aXRoIHdoZW4gY2xhdXNlIGlzIGZpbHRlcmVkIGluc2lkZSBQcm9tcHRzU2VydmljZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovL2V4dGVuc2lvbnMvbXktZXh0ZW5zaW9uL2NvbmRpdGlvbmFsLmluc3RydWN0aW9ucy5tZCcpO1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0ge30gYXMgSUV4dGVuc2lvbkRlc2NyaXB0aW9uO1xuXHRcdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSBpbnN0YVNlcnZpY2UuZ2V0KElDb250ZXh0S2V5U2VydmljZSkgYXMgTW9ja0NvbnRleHRLZXlTZXJ2aWNlO1xuXHRcdFx0Y29uc3QgY29udGV4dE1hdGNoZXNSdWxlc1N0dWIgPSBzaW5vbi5zdHViKGNvbnRleHRLZXlTZXJ2aWNlLCAnY29udGV4dE1hdGNoZXNSdWxlcycpLnJldHVybnMoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCByZWdpc3RlcmVkID0gc2VydmljZS5yZWdpc3RlckNvbnRyaWJ1dGVkRmlsZShcblx0XHRcdFx0UHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCB1cmksIGV4dGVuc2lvbixcblx0XHRcdFx0J0NvbmRpdGlvbmFsIEluc3RydWN0aW9ucycsICdPbmx5IHdoZW4gZW5hYmxlZCcsICdteUZlYXR1cmUuZW5hYmxlZCcsXG5cdFx0XHQpO1xuXG5cdFx0XHRjb25zdCBmaWxlcyA9IGF3YWl0IHNlcnZpY2UubGlzdFByb21wdEZpbGVzKFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZXMubGVuZ3RoLCAwLCAnU2hvdWxkIGJlIGZpbHRlcmVkIG91dCB3aGVuIHRoZSB3aGVuIGNsYXVzZSBkb2VzIG5vdCBtYXRjaCcpO1xuXG5cdFx0XHRyZWdpc3RlcmVkLmRpc3Bvc2UoKTtcblx0XHRcdGNvbnRleHRNYXRjaGVzUnVsZXNTdHViLnJlc3RvcmUoKTtcblxuXHRcdFx0Y29uc3QgZW5hYmxlZENvbnRleHRNYXRjaGVzUnVsZXNTdHViID0gc2lub24uc3R1Yihjb250ZXh0S2V5U2VydmljZSwgJ2NvbnRleHRNYXRjaGVzUnVsZXMnKS5yZXR1cm5zKHRydWUpO1xuXHRcdFx0Y29uc3QgZW5hYmxlZFJlZ2lzdHJhdGlvbiA9IHNlcnZpY2UucmVnaXN0ZXJDb250cmlidXRlZEZpbGUoXG5cdFx0XHRcdFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgdXJpLCBleHRlbnNpb24sXG5cdFx0XHRcdCdDb25kaXRpb25hbCBJbnN0cnVjdGlvbnMnLCAnT25seSB3aGVuIGVuYWJsZWQnLCAnbXlGZWF0dXJlLmVuYWJsZWQnLFxuXHRcdFx0KTtcblxuXHRcdFx0Y29uc3QgZW5hYmxlZEZpbGVzID0gYXdhaXQgc2VydmljZS5saXN0UHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbmFibGVkRmlsZXMubGVuZ3RoLCAxLCAnU2hvdWxkIGJlIGluY2x1ZGVkIHdoZW4gdGhlIHdoZW4gY2xhdXNlIG1hdGNoZXMnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbmFibGVkRmlsZXNbMF0udXJpLnRvU3RyaW5nKCksIHVyaS50b1N0cmluZygpKTtcblxuXHRcdFx0ZW5hYmxlZFJlZ2lzdHJhdGlvbi5kaXNwb3NlKCk7XG5cdFx0XHRlbmFibGVkQ29udGV4dE1hdGNoZXNSdWxlc1N0dWIucmVzdG9yZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnUHJvdmlkZXIgZmlsZSB3aXRoIHdoZW4gY2xhdXNlIGlzIGZpbHRlcmVkIGluc2lkZSBQcm9tcHRzU2VydmljZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovL2V4dGVuc2lvbnMvdGVzdC9teUluc3RydWN0aW9uLmluc3RydWN0aW9ucy5tZCcpO1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0ge1xuXHRcdFx0XHRpZGVudGlmaWVyOiB7IHZhbHVlOiAndGVzdC5teS1leHRlbnNpb24nIH0sXG5cdFx0XHRcdGVuYWJsZWRBcGlQcm9wb3NhbHM6IFsnY2hhdFBhcnRpY2lwYW50UHJpdmF0ZSddXG5cdFx0XHR9IGFzIHVua25vd24gYXMgSUV4dGVuc2lvbkRlc2NyaXB0aW9uO1xuXHRcdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSBpbnN0YVNlcnZpY2UuZ2V0KElDb250ZXh0S2V5U2VydmljZSkgYXMgTW9ja0NvbnRleHRLZXlTZXJ2aWNlO1xuXG5cdFx0XHRjb25zdCByZWdpc3RlcmVkID0gc2VydmljZS5yZWdpc3RlclByb21wdEZpbGVQcm92aWRlcihleHRlbnNpb24sIFByb21wdHNUeXBlLmluc3RydWN0aW9ucywge1xuXHRcdFx0XHRwcm92aWRlUHJvbXB0RmlsZXM6IGFzeW5jICgpID0+IFt7IHVyaSwgd2hlbjogJ2NoYXRTZXNzaW9uVHlwZSA9PSBsb2NhbCcgfV1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBjb250ZXh0TWF0Y2hlc1J1bGVzU3R1YiA9IHNpbm9uLnN0dWIoY29udGV4dEtleVNlcnZpY2UsICdjb250ZXh0TWF0Y2hlc1J1bGVzJykucmV0dXJucyhmYWxzZSk7XG5cdFx0XHRjb25zdCBmaWxlcyA9IGF3YWl0IHNlcnZpY2UubGlzdFByb21wdEZpbGVzRm9yU3RvcmFnZShQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIFByb21wdHNTdG9yYWdlLmV4dGVuc2lvbiwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZXMubGVuZ3RoLCAwLCAnU2hvdWxkIGJlIGZpbHRlcmVkIG91dCB3aGVuIHRoZSB3aGVuIGNsYXVzZSBkb2VzIG5vdCBtYXRjaCcpO1xuXHRcdFx0Y29udGV4dE1hdGNoZXNSdWxlc1N0dWIucmVzdG9yZSgpO1xuXG5cdFx0XHRjb25zdCBlbmFibGVkQ29udGV4dE1hdGNoZXNSdWxlc1N0dWIgPSBzaW5vbi5zdHViKGNvbnRleHRLZXlTZXJ2aWNlLCAnY29udGV4dE1hdGNoZXNSdWxlcycpLnJldHVybnModHJ1ZSk7XG5cdFx0XHRjb25zdCBlbmFibGVkRmlsZXMgPSBhd2FpdCBzZXJ2aWNlLmxpc3RQcm9tcHRGaWxlc0ZvclN0b3JhZ2UoUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBQcm9tcHRzU3RvcmFnZS5leHRlbnNpb24sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVuYWJsZWRGaWxlcy5sZW5ndGgsIDEsICdTaG91bGQgYmUgaW5jbHVkZWQgd2hlbiB0aGUgd2hlbiBjbGF1c2UgbWF0Y2hlcycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVuYWJsZWRGaWxlc1swXS51cmkudG9TdHJpbmcoKSwgdXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0ZW5hYmxlZENvbnRleHRNYXRjaGVzUnVsZXNTdHViLnJlc3RvcmUoKTtcblxuXHRcdFx0cmVnaXN0ZXJlZC5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdQcm92aWRlciB3aGVuIGtleXMgaW52YWxpZGF0ZSBjYWNoZWQgcmVzdWx0cyB3aGVuIGNvbnRleHQgY2hhbmdlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0UHJvbXB0Q29udGV4dEtleVNlcnZpY2UoKSk7XG5cdFx0XHRpbnN0YVNlcnZpY2Uuc3R1YihJQ29udGV4dEtleVNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IHByb21wdHNTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRzU2VydmljZSkpO1xuXHRcdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSVByb21wdHNTZXJ2aWNlLCBwcm9tcHRzU2VydmljZSk7XG5cblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovL2V4dGVuc2lvbnMvdGVzdC9jb25kaXRpb25hbC5pbnN0cnVjdGlvbnMubWQnKTtcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW3tcblx0XHRcdFx0cGF0aDogdXJpLnBhdGgsXG5cdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkNvbmRpdGlvbmFsIEluc3RydWN0aW9uc1wiJyxcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnSW5zdHJ1Y3Rpb24gYm9keScsXG5cdFx0XHRcdF0sXG5cdFx0XHR9XSk7XG5cblx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IHtcblx0XHRcdFx0aWRlbnRpZmllcjogeyB2YWx1ZTogJ3Rlc3QubXktZXh0ZW5zaW9uJyB9LFxuXHRcdFx0XHRlbmFibGVkQXBpUHJvcG9zYWxzOiBbJ2NoYXRQYXJ0aWNpcGFudFByaXZhdGUnXVxuXHRcdFx0fSBhcyB1bmtub3duIGFzIElFeHRlbnNpb25EZXNjcmlwdGlvbjtcblxuXHRcdFx0Y29uc3QgcmVnaXN0ZXJlZCA9IHByb21wdHNTZXJ2aWNlLnJlZ2lzdGVyUHJvbXB0RmlsZVByb3ZpZGVyKGV4dGVuc2lvbiwgUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCB7XG5cdFx0XHRcdHByb3ZpZGVQcm9tcHRGaWxlczogYXN5bmMgKCkgPT4gW3sgdXJpLCB3aGVuOiAnbXlGZWF0dXJlLmVuYWJsZWQnIH1dXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29udGV4dEtleVNlcnZpY2Uuc2V0UnVsZXNNYXRjaCh0cnVlKTtcblx0XHRcdGNvbnN0IGVuYWJsZWRGaWxlcyA9IGF3YWl0IHByb21wdHNTZXJ2aWNlLmdldEluc3RydWN0aW9uRmlsZXMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW5hYmxlZEZpbGVzLmxlbmd0aCwgMSwgJ1Nob3VsZCBpbmNsdWRlIHRoZSBwcm92aWRlciBpbnN0cnVjdGlvbiB3aGVuIHRoZSBjb250ZXh0IG1hdGNoZXMnKTtcblxuXHRcdFx0Y29udGV4dEtleVNlcnZpY2Uuc2V0UnVsZXNNYXRjaChmYWxzZSk7XG5cdFx0XHRjb250ZXh0S2V5U2VydmljZS5maXJlRGlkQ2hhbmdlQ29udGV4dChbJ215RmVhdHVyZS5lbmFibGVkJ10pO1xuXHRcdFx0Y29uc3QgZGlzYWJsZWRGaWxlcyA9IGF3YWl0IHByb21wdHNTZXJ2aWNlLmdldEluc3RydWN0aW9uRmlsZXMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzYWJsZWRGaWxlcy5sZW5ndGgsIDAsICdTaG91bGQgaW52YWxpZGF0ZSB0aGUgY2FjaGVkIHByb3ZpZGVyIGluc3RydWN0aW9uIHdoZW4gdGhlIHRyYWNrZWQga2V5IGNoYW5nZXMnKTtcblxuXHRcdFx0cmVnaXN0ZXJlZC5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdDb250cmlidXRlZCBmaWxlIHNlc3Npb25UeXBlcyBtZXRhZGF0YSBpcyBwcmVzZXJ2ZWQgaW4gY29yZSBwcm9tcHQgbW9kZWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQUdFTlRfU0tJTExTLCB0cnVlKTtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuU0tJTExTX0xPQ0FUSU9OX0tFWSwge30pO1xuXG5cdFx0XHRjb25zdCBhZ2VudFVyaSA9IFVSSS5wYXJzZSgnZmlsZTovL2V4dGVuc2lvbnMvbXktZXh0ZW5zaW9uL2NvbnRyaWJ1dGVkLmFnZW50Lm1kJyk7XG5cdFx0XHRjb25zdCBpbnN0cnVjdGlvblVyaSA9IFVSSS5wYXJzZSgnZmlsZTovL2V4dGVuc2lvbnMvbXktZXh0ZW5zaW9uL2NvbnRyaWJ1dGVkLmluc3RydWN0aW9ucy5tZCcpO1xuXHRcdFx0Y29uc3QgcHJvbXB0VXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vZXh0ZW5zaW9ucy9teS1leHRlbnNpb24vY29udHJpYnV0ZWQucHJvbXB0Lm1kJyk7XG5cdFx0XHRjb25zdCBza2lsbFVyaSA9IFVSSS5wYXJzZSgnZmlsZTovL2V4dGVuc2lvbnMvbXktZXh0ZW5zaW9uL2NvbnRyaWJ1dGVkLXNraWxsL1NLSUxMLm1kJyk7XG5cdFx0XHRjb25zdCBleHRlbnNpb24gPSB7XG5cdFx0XHRcdGlkZW50aWZpZXI6IHsgdmFsdWU6ICd0ZXN0Lm15LWV4dGVuc2lvbicgfSxcblx0XHRcdH0gYXMgSUV4dGVuc2lvbkRlc2NyaXB0aW9uO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblR5cGVzID0gWydjb3BpbG90Y2xpJ107XG5cblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYWdlbnRVcmkucGF0aCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogXCJjb250cmlidXRlZC1hZ2VudFwiJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJDb250cmlidXRlZCBhZ2VudFwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J0FnZW50IGJvZHknLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBpbnN0cnVjdGlvblVyaS5wYXRoLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBcImNvbnRyaWJ1dGVkLWluc3RydWN0aW9uXCInLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkNvbnRyaWJ1dGVkIGluc3RydWN0aW9uXCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnSW5zdHJ1Y3Rpb24gYm9keScsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IHByb21wdFVyaS5wYXRoLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBcImNvbnRyaWJ1dGVkLXByb21wdFwiJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJDb250cmlidXRlZCBwcm9tcHRcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdQcm9tcHQgYm9keScsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IHNraWxsVXJpLnBhdGgsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFwiY29udHJpYnV0ZWQtc2tpbGxcIicsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiQ29udHJpYnV0ZWQgc2tpbGxcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdTa2lsbCBib2R5Jyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IHJlZ2lzdHJhdGlvbnMgPSBbXG5cdFx0XHRcdHNlcnZpY2UucmVnaXN0ZXJDb250cmlidXRlZEZpbGUoUHJvbXB0c1R5cGUuYWdlbnQsIGFnZW50VXJpLCBleHRlbnNpb24sIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHNlc3Npb25UeXBlcyksXG5cdFx0XHRcdHNlcnZpY2UucmVnaXN0ZXJDb250cmlidXRlZEZpbGUoUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBpbnN0cnVjdGlvblVyaSwgZXh0ZW5zaW9uLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBzZXNzaW9uVHlwZXMpLFxuXHRcdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyQ29udHJpYnV0ZWRGaWxlKFByb21wdHNUeXBlLnByb21wdCwgcHJvbXB0VXJpLCBleHRlbnNpb24sIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHNlc3Npb25UeXBlcyksXG5cdFx0XHRcdHNlcnZpY2UucmVnaXN0ZXJDb250cmlidXRlZEZpbGUoUHJvbXB0c1R5cGUuc2tpbGwsIHNraWxsVXJpLCBleHRlbnNpb24sIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHNlc3Npb25UeXBlcyksXG5cdFx0XHRdO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBhZ2VudCA9IChhd2FpdCBzZXJ2aWNlLmdldEN1c3RvbUFnZW50cyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSkuZmluZChpdGVtID0+IGl0ZW0udXJpLnRvU3RyaW5nKCkgPT09IGFnZW50VXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRjb25zdCBpbnN0cnVjdGlvbiA9IChhd2FpdCBzZXJ2aWNlLmdldEluc3RydWN0aW9uRmlsZXMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpLmZpbmQoaXRlbSA9PiBpdGVtLnVyaS50b1N0cmluZygpID09PSBpbnN0cnVjdGlvblVyaS50b1N0cmluZygpKTtcblx0XHRcdFx0Y29uc3QgcHJvbXB0ID0gKGF3YWl0IHNlcnZpY2UuZ2V0UHJvbXB0U2xhc2hDb21tYW5kcyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSkuZmluZChpdGVtID0+IGl0ZW0udXJpLnRvU3RyaW5nKCkgPT09IHByb21wdFVyaS50b1N0cmluZygpKTtcblx0XHRcdFx0Y29uc3Qgc2tpbGwgPSAoYXdhaXQgc2VydmljZS5maW5kQWdlbnRTa2lsbHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpPy5maW5kKGl0ZW0gPT4gaXRlbS51cmkudG9TdHJpbmcoKSA9PT0gc2tpbGxVcmkudG9TdHJpbmcoKSk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudD8uc2Vzc2lvblR5cGVzLCBzZXNzaW9uVHlwZXMpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGluc3RydWN0aW9uPy5zZXNzaW9uVHlwZXMsIHNlc3Npb25UeXBlcyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvbXB0Py5zZXNzaW9uVHlwZXMsIHNlc3Npb25UeXBlcyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2tpbGw/LnNlc3Npb25UeXBlcywgc2Vzc2lvblR5cGVzKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGZvciAoY29uc3QgcmVnaXN0cmF0aW9uIG9mIHJlZ2lzdHJhdGlvbnMpIHtcblx0XHRcdFx0XHRyZWdpc3RyYXRpb24uZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdsaXN0UHJvbXB0RmlsZXMgLSBwYXJlbnQgcmVwbyBmb2xkZXInLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIGZpbmQgcHJvbXB0cywgaW5zdHJ1Y3Rpb25zLCBhbmQgYWdlbnRzIGluIGEgcGFyZW50IHJlcG8gZm9sZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGFyZW50Rm9sZGVyID0gJy9yZXBvcy9jb2xsZWN0LXByb21wdC1wYXJlbnQtdGVzdCc7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyID0gYCR7cGFyZW50Rm9sZGVyfS9yZXBvYDtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZShyb290Rm9sZGVyKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0Ly8gLmdpdCBpbiBwYXJlbnQgbWFya3MgaXQgYXMgYSByZXBvIHJvb3Rcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3BhcmVudEZvbGRlcn0vLmdpdC9IRUFEYCxcblx0XHRcdFx0XHRjb250ZW50czogWydyZWY6IHJlZnMvaGVhZHMvbWFpbiddLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHQvLyBBcHBseWluZyBpbnN0cnVjdGlvbiBpbiBwYXJlbnRcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3BhcmVudEZvbGRlcn0vLmdpdGh1Yi9pbnN0cnVjdGlvbnMvdHlwZXNjcmlwdC5pbnN0cnVjdGlvbnMubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnUGFyZW50IFR5cGVTY3JpcHQgaW5zdHJ1Y3Rpb25zXFwnJyxcblx0XHRcdFx0XHRcdCdhcHBseVRvOiBcIioqLyoudHNcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdQYXJlbnQgVHlwZVNjcmlwdCBjb2Rpbmcgc3RhbmRhcmRzJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdC8vIFByb21wdCBmaWxlIGluIHBhcmVudFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cGFyZW50Rm9sZGVyfS8uZ2l0aHViL3Byb21wdHMvaGVscC5wcm9tcHQubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnUGFyZW50IGhlbHAgcHJvbXB0XFwnJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J0hlbHAgdGhlIHVzZXIgd2l0aCB0aGVpciBxdWVzdGlvbicsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQvLyBBZ2VudCBmaWxlIGluIHBhcmVudFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cGFyZW50Rm9sZGVyfS8uZ2l0aHViL2FnZW50cy9yZXZpZXdlci5hZ2VudC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcXCdQYXJlbnQgY29kZSByZXZpZXdlciBhZ2VudFxcJycsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdZb3UgYXJlIGEgY29kZSByZXZpZXdlcicsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vc3JjL2ZpbGUudHNgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbJ2NvbnNvbGUubG9nKFwidGVzdFwiKTsnXSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cblxuXHRcdFx0YXdhaXQgdGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5JTkNMVURFX0FQUExZSU5HX0lOU1RSVUNUSU9OUywgdHJ1ZSk7XG5cdFx0XHRhd2FpdCB0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9DVVNUT01JWkFUSU9OU19JTl9QQVJFTlRfUkVQT1MsIGZhbHNlKTtcblxuXHRcdFx0Ly8gV2l0aCBwYXJlbnQgc2VhcmNoIGRpc2FibGVkLCBzaG91bGQgbm90IGZpbmQgcGFyZW50IGZpbGVzXG5cdFx0XHRsZXQgcHJvbXB0RmlsZXMgPSBhd2FpdCBzZXJ2aWNlLmxpc3RQcm9tcHRGaWxlcyhQcm9tcHRzVHlwZS5wcm9tcHQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0bGV0IGFnZW50RmlsZXMgPSBhd2FpdCBzZXJ2aWNlLmxpc3RQcm9tcHRGaWxlcyhQcm9tcHRzVHlwZS5hZ2VudCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRsZXQgaW5zdHJ1Y3Rpb25GaWxlcyA9IGF3YWl0IHNlcnZpY2UubGlzdFByb21wdEZpbGVzKFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGFzc2VydC5vayghcHJvbXB0RmlsZXMuc29tZShmID0+IGYudXJpLnBhdGguaW5jbHVkZXMocGFyZW50Rm9sZGVyKSksICdTaG91bGQgbm90IGZpbmQgcGFyZW50IHByb21wdCBmaWxlcyB3aGVuIHBhcmVudCBzZWFyY2ggaXMgZGlzYWJsZWQnKTtcblx0XHRcdGFzc2VydC5vayghYWdlbnRGaWxlcy5zb21lKGYgPT4gZi51cmkucGF0aC5pbmNsdWRlcyhwYXJlbnRGb2xkZXIpKSwgJ1Nob3VsZCBub3QgZmluZCBwYXJlbnQgYWdlbnQgZmlsZXMgd2hlbiBwYXJlbnQgc2VhcmNoIGlzIGRpc2FibGVkJyk7XG5cdFx0XHRhc3NlcnQub2soIWluc3RydWN0aW9uRmlsZXMuc29tZShmID0+IGYudXJpLnBhdGguaW5jbHVkZXMocGFyZW50Rm9sZGVyKSksICdTaG91bGQgbm90IGZpbmQgcGFyZW50IGluc3RydWN0aW9uIGZpbGVzIHdoZW4gcGFyZW50IHNlYXJjaCBpcyBkaXNhYmxlZCcpO1xuXG5cdFx0XHQvLyBXaXRoIHBhcmVudCBzZWFyY2ggZW5hYmxlZCwgc2hvdWxkIGZpbmQgcGFyZW50IGZpbGVzXG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9DVVNUT01JWkFUSU9OU19JTl9QQVJFTlRfUkVQT1MsIHRydWUpO1xuXHRcdFx0ZmlyZUNvbmZpZ0NoYW5nZSh0ZXN0Q29uZmlnU2VydmljZSwgUHJvbXB0c0NvbmZpZy5VU0VfQ1VTVE9NSVpBVElPTlNfSU5fUEFSRU5UX1JFUE9TKTtcblxuXHRcdFx0cHJvbXB0RmlsZXMgPSBhd2FpdCBzZXJ2aWNlLmxpc3RQcm9tcHRGaWxlcyhQcm9tcHRzVHlwZS5wcm9tcHQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YWdlbnRGaWxlcyA9IGF3YWl0IHNlcnZpY2UubGlzdFByb21wdEZpbGVzKFByb21wdHNUeXBlLmFnZW50LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGluc3RydWN0aW9uRmlsZXMgPSBhd2FpdCBzZXJ2aWNlLmxpc3RQcm9tcHRGaWxlcyhQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRjb25zdCBwcm9tcHRQYXRocyA9IHByb21wdEZpbGVzLm1hcChmID0+IGYudXJpLnBhdGgpO1xuXHRcdFx0Y29uc3QgYWdlbnRQYXRocyA9IGFnZW50RmlsZXMubWFwKGYgPT4gZi51cmkucGF0aCk7XG5cdFx0XHRjb25zdCBpbnN0cnVjdGlvblBhdGhzID0gaW5zdHJ1Y3Rpb25GaWxlcy5tYXAoZiA9PiBmLnVyaS5wYXRoKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHByb21wdFBhdGhzLmluY2x1ZGVzKGAke3BhcmVudEZvbGRlcn0vLmdpdGh1Yi9wcm9tcHRzL2hlbHAucHJvbXB0Lm1kYCksICdTaG91bGQgZmluZCBwYXJlbnQgcHJvbXB0IGZpbGUgd2hlbiBwYXJlbnQgc2VhcmNoIGlzIGVuYWJsZWQnKTtcblx0XHRcdGFzc2VydC5vayhhZ2VudFBhdGhzLmluY2x1ZGVzKGAke3BhcmVudEZvbGRlcn0vLmdpdGh1Yi9hZ2VudHMvcmV2aWV3ZXIuYWdlbnQubWRgKSwgJ1Nob3VsZCBmaW5kIHBhcmVudCBhZ2VudCBmaWxlIHdoZW4gcGFyZW50IHNlYXJjaCBpcyBlbmFibGVkJyk7XG5cdFx0XHRhc3NlcnQub2soaW5zdHJ1Y3Rpb25QYXRocy5pbmNsdWRlcyhgJHtwYXJlbnRGb2xkZXJ9Ly5naXRodWIvaW5zdHJ1Y3Rpb25zL3R5cGVzY3JpcHQuaW5zdHJ1Y3Rpb25zLm1kYCksICdTaG91bGQgZmluZCBwYXJlbnQgaW5zdHJ1Y3Rpb24gZmlsZSB3aGVuIHBhcmVudCBzZWFyY2ggaXMgZW5hYmxlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBmaW5kIGZpbGVzIGluIGFuIHVudHJ1c3RlZCBwYXJlbnQgcmVwbyBmb2xkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwYXJlbnRGb2xkZXIgPSAnL3JlcG9zL3VudHJ1c3RlZC1wYXJlbnQtdGVzdCc7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyID0gYCR7cGFyZW50Rm9sZGVyfS9yZXBvYDtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZShyb290Rm9sZGVyKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0Ly8gLmdpdCBpbiBwYXJlbnQgbWFya3MgaXQgYXMgYSByZXBvIHJvb3Rcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3BhcmVudEZvbGRlcn0vLmdpdC9IRUFEYCxcblx0XHRcdFx0XHRjb250ZW50czogWydyZWY6IHJlZnMvaGVhZHMvbWFpbiddLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHQvLyBBcHBseWluZyBpbnN0cnVjdGlvbiBpbiBwYXJlbnRcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3BhcmVudEZvbGRlcn0vLmdpdGh1Yi9pbnN0cnVjdGlvbnMvdHlwZXNjcmlwdC5pbnN0cnVjdGlvbnMubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnUGFyZW50IFR5cGVTY3JpcHQgaW5zdHJ1Y3Rpb25zXFwnJyxcblx0XHRcdFx0XHRcdCdhcHBseVRvOiBcIioqLyoudHNcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdQYXJlbnQgVHlwZVNjcmlwdCBjb2Rpbmcgc3RhbmRhcmRzJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdC8vIFByb21wdCBmaWxlIGluIHBhcmVudFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cGFyZW50Rm9sZGVyfS8uZ2l0aHViL3Byb21wdHMvaGVscC5wcm9tcHQubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnUGFyZW50IGhlbHAgcHJvbXB0XFwnJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J0hlbHAgdGhlIHVzZXIgd2l0aCB0aGVpciBxdWVzdGlvbicsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQvLyBBZ2VudCBmaWxlIGluIHBhcmVudFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cGFyZW50Rm9sZGVyfS8uZ2l0aHViL2FnZW50cy9yZXZpZXdlci5hZ2VudC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcXCdQYXJlbnQgY29kZSByZXZpZXdlciBhZ2VudFxcJycsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdZb3UgYXJlIGEgY29kZSByZXZpZXdlcicsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vc3JjL2ZpbGUudHNgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbJ2NvbnNvbGUubG9nKFwidGVzdFwiKTsnXSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLklOQ0xVREVfQVBQTFlJTkdfSU5TVFJVQ1RJT05TLCB0cnVlKTtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0NVU1RPTUlaQVRJT05TX0lOX1BBUkVOVF9SRVBPUywgdHJ1ZSk7XG5cdFx0XHRmaXJlQ29uZmlnQ2hhbmdlKHRlc3RDb25maWdTZXJ2aWNlLCBQcm9tcHRzQ29uZmlnLklOQ0xVREVfQVBQTFlJTkdfSU5TVFJVQ1RJT05TLCBQcm9tcHRzQ29uZmlnLlVTRV9DVVNUT01JWkFUSU9OU19JTl9QQVJFTlRfUkVQT1MpO1xuXG5cblx0XHRcdC8vIE1hcmsgdGhlIHBhcmVudCByZXBvIHJvb3QgYXMgdW50cnVzdGVkXG5cdFx0XHR3b3Jrc3BhY2VUcnVzdFNlcnZpY2UuZ2V0VXJpVHJ1c3RJbmZvID0gKHVyaTogVVJJKSA9PiB7XG5cdFx0XHRcdGlmICh1cmkucGF0aCA9PT0gcGFyZW50Rm9sZGVyKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IHRydXN0ZWQ6IGZhbHNlLCB1cmkgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IHRydXN0ZWQ6IHRydWUsIHVyaSB9KTtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHByb21wdEZpbGVzID0gYXdhaXQgc2VydmljZS5saXN0UHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUucHJvbXB0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGNvbnN0IGFnZW50RmlsZXMgPSBhd2FpdCBzZXJ2aWNlLmxpc3RQcm9tcHRGaWxlcyhQcm9tcHRzVHlwZS5hZ2VudCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRjb25zdCBpbnN0cnVjdGlvbkZpbGVzID0gYXdhaXQgc2VydmljZS5saXN0UHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKCFwcm9tcHRGaWxlcy5zb21lKGYgPT4gZi51cmkucGF0aC5pbmNsdWRlcyhwYXJlbnRGb2xkZXIpKSwgJ1Nob3VsZCBub3QgZmluZCBwYXJlbnQgcHJvbXB0IGZpbGVzIHdoZW4gcGFyZW50IHJlcG8gaXMgdW50cnVzdGVkJyk7XG5cdFx0XHRhc3NlcnQub2soIWFnZW50RmlsZXMuc29tZShmID0+IGYudXJpLnBhdGguaW5jbHVkZXMocGFyZW50Rm9sZGVyKSksICdTaG91bGQgbm90IGZpbmQgcGFyZW50IGFnZW50IGZpbGVzIHdoZW4gcGFyZW50IHJlcG8gaXMgdW50cnVzdGVkJyk7XG5cdFx0XHRhc3NlcnQub2soIWluc3RydWN0aW9uRmlsZXMuc29tZShmID0+IGYudXJpLnBhdGguaW5jbHVkZXMocGFyZW50Rm9sZGVyKSksICdTaG91bGQgbm90IGZpbmQgcGFyZW50IGluc3RydWN0aW9uIGZpbGVzIHdoZW4gcGFyZW50IHJlcG8gaXMgdW50cnVzdGVkJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0luc3RydWN0aW9ucyBwcm92aWRlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpbnN0cnVjdGlvblVyaSA9IFVSSS5wYXJzZSgnZmlsZTovL2V4dGVuc2lvbnMvbXktZXh0ZW5zaW9uL215SW5zdHJ1Y3Rpb24uaW5zdHJ1Y3Rpb25zLm1kJyk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uID0ge1xuXHRcdFx0aWRlbnRpZmllcjogeyB2YWx1ZTogJ3Rlc3QubXktZXh0ZW5zaW9uJyB9LFxuXHRcdFx0ZW5hYmxlZEFwaVByb3Bvc2FsczogWydjaGF0UGFydGljaXBhbnRQcml2YXRlJ11cblx0XHR9IGFzIHVua25vd24gYXMgSUV4dGVuc2lvbkRlc2NyaXB0aW9uO1xuXG5cdFx0Ly8gTW9jayB0aGUgaW5zdHJ1Y3Rpb24gZmlsZSBjb250ZW50XG5cdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHR7XG5cdFx0XHRcdHBhdGg6IGluc3RydWN0aW9uVXJpLnBhdGgsXG5cdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0JyMgVGVzdCBpbnN0cnVjdGlvbiBjb250ZW50J1xuXHRcdFx0XHRdXG5cdFx0XHR9XG5cdFx0XSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IHtcblx0XHRcdHByb3ZpZGVQcm9tcHRGaWxlczogYXN5bmMgKF9jb250ZXh0OiBJUHJvbXB0RmlsZUNvbnRleHQsIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IHtcblx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR1cmk6IGluc3RydWN0aW9uVXJpXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCByZWdpc3RlcmVkID0gc2VydmljZS5yZWdpc3RlclByb21wdEZpbGVQcm92aWRlcihleHRlbnNpb24sIFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgcHJvdmlkZXIpO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgc2VydmljZS5saXN0UHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRjb25zdCBwcm92aWRlckluc3RydWN0aW9uID0gYWN0dWFsLmZpbmQoaSA9PiBpLnVyaS50b1N0cmluZygpID09PSBpbnN0cnVjdGlvblVyaS50b1N0cmluZygpKTtcblxuXHRcdGFzc2VydC5vayhwcm92aWRlckluc3RydWN0aW9uLCAnUHJvdmlkZXIgaW5zdHJ1Y3Rpb24gc2hvdWxkIGJlIGZvdW5kJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVySW5zdHJ1Y3Rpb24hLnVyaS50b1N0cmluZygpLCBpbnN0cnVjdGlvblVyaS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXJJbnN0cnVjdGlvbiEuc3RvcmFnZSwgUHJvbXB0c1N0b3JhZ2UuZXh0ZW5zaW9uKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXJJbnN0cnVjdGlvbiEuc291cmNlLCBQcm9tcHRGaWxlU291cmNlLkV4dGVuc2lvbkFQSSk7XG5cblx0XHRyZWdpc3RlcmVkLmRpc3Bvc2UoKTtcblxuXHRcdC8vIEFmdGVyIGRpc3Bvc2FsLCB0aGUgaW5zdHJ1Y3Rpb24gc2hvdWxkIG5vIGxvbmdlciBiZSBsaXN0ZWRcblx0XHRjb25zdCBhY3R1YWxBZnRlckRpc3Bvc2UgPSBhd2FpdCBzZXJ2aWNlLmxpc3RQcm9tcHRGaWxlcyhQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGNvbnN0IGZvdW5kQWZ0ZXJEaXNwb3NlID0gYWN0dWFsQWZ0ZXJEaXNwb3NlLmZpbmQoaSA9PiBpLnVyaS50b1N0cmluZygpID09PSBpbnN0cnVjdGlvblVyaS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm91bmRBZnRlckRpc3Bvc2UsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Byb3ZpZGVyIHNlc3Npb25UeXBlcyBtZXRhZGF0YSBpcyBwcmVzZXJ2ZWQgaW4gY29yZSBwcm9tcHQgbW9kZWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0FHRU5UX1NLSUxMUywgdHJ1ZSk7XG5cdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5TS0lMTFNfTE9DQVRJT05fS0VZLCB7fSk7XG5cblx0XHRjb25zdCBhZ2VudFVyaSA9IFVSSS5wYXJzZSgnZmlsZTovL2V4dGVuc2lvbnMvbXktZXh0ZW5zaW9uL2VuYWJsZWQuYWdlbnQubWQnKTtcblx0XHRjb25zdCBpbnN0cnVjdGlvblVyaSA9IFVSSS5wYXJzZSgnZmlsZTovL2V4dGVuc2lvbnMvbXktZXh0ZW5zaW9uL2VuYWJsZWQuaW5zdHJ1Y3Rpb25zLm1kJyk7XG5cdFx0Y29uc3QgcHJvbXB0VXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vZXh0ZW5zaW9ucy9teS1leHRlbnNpb24vZW5hYmxlZC5wcm9tcHQubWQnKTtcblx0XHRjb25zdCBza2lsbFVyaSA9IFVSSS5wYXJzZSgnZmlsZTovL2V4dGVuc2lvbnMvbXktZXh0ZW5zaW9uL2VuYWJsZWQtc2tpbGwvU0tJTEwubWQnKTtcblx0XHRjb25zdCBleHRlbnNpb24gPSB7XG5cdFx0XHRpZGVudGlmaWVyOiB7IHZhbHVlOiAndGVzdC5teS1leHRlbnNpb24nIH0sXG5cdFx0XHRlbmFibGVkQXBpUHJvcG9zYWxzOiBbJ2NoYXRQYXJ0aWNpcGFudFByaXZhdGUnXVxuXHRcdH0gYXMgdW5rbm93biBhcyBJRXh0ZW5zaW9uRGVzY3JpcHRpb247XG5cblx0XHRjb25zdCBzZXNzaW9uVHlwZXMgPSBbJ2NvcGlsb3RjbGknXTtcblxuXHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0e1xuXHRcdFx0XHRwYXRoOiBhZ2VudFVyaS5wYXRoLFxuXHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCduYW1lOiBcImVuYWJsZWQtYWdlbnRcIicsXG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkFuIGVuYWJsZWQgYWdlbnRcIicsXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J0FnZW50IGJvZHknLFxuXHRcdFx0XHRdXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRwYXRoOiBpbnN0cnVjdGlvblVyaS5wYXRoLFxuXHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCduYW1lOiBcImVuYWJsZWQtaW5zdHJ1Y3Rpb25cIicsXG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkFuIGVuYWJsZWQgaW5zdHJ1Y3Rpb25cIicsXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J0luc3RydWN0aW9uIGJvZHknLFxuXHRcdFx0XHRdXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRwYXRoOiBwcm9tcHRVcmkucGF0aCxcblx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnbmFtZTogXCJlbmFibGVkLXByb21wdFwiJyxcblx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiQW4gZW5hYmxlZCBwcm9tcHRcIicsXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J1Byb21wdCBib2R5Jyxcblx0XHRcdFx0XVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0cGF0aDogc2tpbGxVcmkucGF0aCxcblx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnbmFtZTogXCJlbmFibGVkLXNraWxsXCInLFxuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJBbiBlbmFibGVkIHNraWxsXCInLFxuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCdTa2lsbCBib2R5Jyxcblx0XHRcdFx0XVxuXHRcdFx0fSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IHJlZ2lzdHJhdGlvbnMgPSBbXG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyUHJvbXB0RmlsZVByb3ZpZGVyKGV4dGVuc2lvbiwgUHJvbXB0c1R5cGUuYWdlbnQsIHtcblx0XHRcdFx0cHJvdmlkZVByb21wdEZpbGVzOiBhc3luYyAoKSA9PiBbeyB1cmk6IGFnZW50VXJpLCBzZXNzaW9uVHlwZXMgfV1cblx0XHRcdH0pLFxuXHRcdFx0c2VydmljZS5yZWdpc3RlclByb21wdEZpbGVQcm92aWRlcihleHRlbnNpb24sIFByb21wdHNUeXBlLmluc3RydWN0aW9ucywge1xuXHRcdFx0XHRwcm92aWRlUHJvbXB0RmlsZXM6IGFzeW5jICgpID0+IFt7IHVyaTogaW5zdHJ1Y3Rpb25VcmksIHNlc3Npb25UeXBlcyB9XVxuXHRcdFx0fSksXG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyUHJvbXB0RmlsZVByb3ZpZGVyKGV4dGVuc2lvbiwgUHJvbXB0c1R5cGUucHJvbXB0LCB7XG5cdFx0XHRcdHByb3ZpZGVQcm9tcHRGaWxlczogYXN5bmMgKCkgPT4gW3sgdXJpOiBwcm9tcHRVcmksIHNlc3Npb25UeXBlcyB9XVxuXHRcdFx0fSksXG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyUHJvbXB0RmlsZVByb3ZpZGVyKGV4dGVuc2lvbiwgUHJvbXB0c1R5cGUuc2tpbGwsIHtcblx0XHRcdFx0cHJvdmlkZVByb21wdEZpbGVzOiBhc3luYyAoKSA9PiBbeyB1cmk6IHNraWxsVXJpLCBzZXNzaW9uVHlwZXMgfV1cblx0XHRcdH0pLFxuXHRcdF07XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgYWdlbnQgPSAoYXdhaXQgc2VydmljZS5nZXRDdXN0b21BZ2VudHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpLmZpbmQoaXRlbSA9PiBpdGVtLnVyaS50b1N0cmluZygpID09PSBhZ2VudFVyaS50b1N0cmluZygpKTtcblx0XHRcdGNvbnN0IGluc3RydWN0aW9uID0gKGF3YWl0IHNlcnZpY2UuZ2V0SW5zdHJ1Y3Rpb25GaWxlcyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSkuZmluZChpdGVtID0+IGl0ZW0udXJpLnRvU3RyaW5nKCkgPT09IGluc3RydWN0aW9uVXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0Y29uc3QgcHJvbXB0ID0gKGF3YWl0IHNlcnZpY2UuZ2V0UHJvbXB0U2xhc2hDb21tYW5kcyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSkuZmluZChpdGVtID0+IGl0ZW0udXJpLnRvU3RyaW5nKCkgPT09IHByb21wdFVyaS50b1N0cmluZygpKTtcblx0XHRcdGNvbnN0IHNraWxsID0gKGF3YWl0IHNlcnZpY2UuZmluZEFnZW50U2tpbGxzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpKT8uZmluZChpdGVtID0+IGl0ZW0udXJpLnRvU3RyaW5nKCkgPT09IHNraWxsVXJpLnRvU3RyaW5nKCkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50Py5zZXNzaW9uVHlwZXMsIHNlc3Npb25UeXBlcyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGluc3RydWN0aW9uPy5zZXNzaW9uVHlwZXMsIHNlc3Npb25UeXBlcyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb21wdD8uc2Vzc2lvblR5cGVzLCBzZXNzaW9uVHlwZXMpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChza2lsbD8uc2Vzc2lvblR5cGVzLCBzZXNzaW9uVHlwZXMpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRmb3IgKGNvbnN0IHJlZ2lzdHJhdGlvbiBvZiByZWdpc3RyYXRpb25zKSB7XG5cdFx0XHRcdHJlZ2lzdHJhdGlvbi5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdQcm9tcHQgZmlsZSBwcm92aWRlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm9tcHRVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly9leHRlbnNpb25zL215LWV4dGVuc2lvbi9teVByb21wdC5wcm9tcHQubWQnKTtcblx0XHRjb25zdCBleHRlbnNpb24gPSB7XG5cdFx0XHRpZGVudGlmaWVyOiB7IHZhbHVlOiAndGVzdC5teS1leHRlbnNpb24nIH0sXG5cdFx0XHRlbmFibGVkQXBpUHJvcG9zYWxzOiBbJ2NoYXRQYXJ0aWNpcGFudFByaXZhdGUnXVxuXHRcdH0gYXMgdW5rbm93biBhcyBJRXh0ZW5zaW9uRGVzY3JpcHRpb247XG5cblx0XHQvLyBNb2NrIHRoZSBwcm9tcHQgZmlsZSBjb250ZW50XG5cdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHR7XG5cdFx0XHRcdHBhdGg6IHByb21wdFVyaS5wYXRoLFxuXHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdCcjIFRlc3QgcHJvbXB0IGNvbnRlbnQnXG5cdFx0XHRcdF1cblx0XHRcdH1cblx0XHRdKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0ge1xuXHRcdFx0cHJvdmlkZVByb21wdEZpbGVzOiBhc3luYyAoX2NvbnRleHQ6IElQcm9tcHRGaWxlQ29udGV4dCwgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4ge1xuXHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHVyaTogcHJvbXB0VXJpXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCByZWdpc3RlcmVkID0gc2VydmljZS5yZWdpc3RlclByb21wdEZpbGVQcm92aWRlcihleHRlbnNpb24sIFByb21wdHNUeXBlLnByb21wdCwgcHJvdmlkZXIpO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgc2VydmljZS5saXN0UHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUucHJvbXB0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRjb25zdCBwcm92aWRlclByb21wdCA9IGFjdHVhbC5maW5kKGkgPT4gaS51cmkudG9TdHJpbmcoKSA9PT0gcHJvbXB0VXJpLnRvU3RyaW5nKCkpO1xuXG5cdFx0YXNzZXJ0Lm9rKHByb3ZpZGVyUHJvbXB0LCAnUHJvdmlkZXIgcHJvbXB0IHNob3VsZCBiZSBmb3VuZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlclByb21wdCEudXJpLnRvU3RyaW5nKCksIHByb21wdFVyaS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXJQcm9tcHQhLnN0b3JhZ2UsIFByb21wdHNTdG9yYWdlLmV4dGVuc2lvbik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyUHJvbXB0IS5zb3VyY2UsIFByb21wdEZpbGVTb3VyY2UuRXh0ZW5zaW9uQVBJKTtcblxuXHRcdHJlZ2lzdGVyZWQuZGlzcG9zZSgpO1xuXG5cdFx0Ly8gQWZ0ZXIgZGlzcG9zYWwsIHRoZSBwcm9tcHQgc2hvdWxkIG5vIGxvbmdlciBiZSBsaXN0ZWRcblx0XHRjb25zdCBhY3R1YWxBZnRlckRpc3Bvc2UgPSBhd2FpdCBzZXJ2aWNlLmxpc3RQcm9tcHRGaWxlcyhQcm9tcHRzVHlwZS5wcm9tcHQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGNvbnN0IGZvdW5kQWZ0ZXJEaXNwb3NlID0gYWN0dWFsQWZ0ZXJEaXNwb3NlLmZpbmQoaSA9PiBpLnVyaS50b1N0cmluZygpID09PSBwcm9tcHRVcmkudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvdW5kQWZ0ZXJEaXNwb3NlLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdTa2lsbCBmaWxlIHByb3ZpZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNraWxsVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vZXh0ZW5zaW9ucy9teS1leHRlbnNpb24vbXlTa2lsbC9TS0lMTC5tZCcpO1xuXHRcdGNvbnN0IGV4dGVuc2lvbiA9IHtcblx0XHRcdGlkZW50aWZpZXI6IHsgdmFsdWU6ICd0ZXN0Lm15LWV4dGVuc2lvbicgfSxcblx0XHRcdGVuYWJsZWRBcGlQcm9wb3NhbHM6IFsnY2hhdFBhcnRpY2lwYW50UHJpdmF0ZSddXG5cdFx0fSBhcyB1bmtub3duIGFzIElFeHRlbnNpb25EZXNjcmlwdGlvbjtcblxuXHRcdC8vIE1vY2sgdGhlIHNraWxsIGZpbGUgY29udGVudFxuXHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0e1xuXHRcdFx0XHRwYXRoOiBza2lsbFVyaS5wYXRoLFxuXHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCduYW1lOiBcIk15IEN1c3RvbSBTa2lsbFwiJyxcblx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiQSBjdXN0b20gc2tpbGwgZnJvbSBwcm92aWRlclwiJyxcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnQ3VzdG9tIHNraWxsIGNvbnRlbnQuJyxcblx0XHRcdFx0XVxuXHRcdFx0fVxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB7XG5cdFx0XHRwcm92aWRlUHJvbXB0RmlsZXM6IGFzeW5jIChfY29udGV4dDogSVByb21wdEZpbGVDb250ZXh0LCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiB7XG5cdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dXJpOiBza2lsbFVyaVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVnaXN0ZXJlZCA9IHNlcnZpY2UucmVnaXN0ZXJQcm9tcHRGaWxlUHJvdmlkZXIoZXh0ZW5zaW9uLCBQcm9tcHRzVHlwZS5za2lsbCwgcHJvdmlkZXIpO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgc2VydmljZS5saXN0UHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUuc2tpbGwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGNvbnN0IHByb3ZpZGVyU2tpbGwgPSBhY3R1YWwuZmluZChpID0+IGkudXJpLnRvU3RyaW5nKCkgPT09IHNraWxsVXJpLnRvU3RyaW5nKCkpO1xuXG5cdFx0YXNzZXJ0Lm9rKHByb3ZpZGVyU2tpbGwsICdQcm92aWRlciBza2lsbCBzaG91bGQgYmUgZm91bmQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXJTa2lsbCEudXJpLnRvU3RyaW5nKCksIHNraWxsVXJpLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlclNraWxsIS5zdG9yYWdlLCBQcm9tcHRzU3RvcmFnZS5leHRlbnNpb24pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlclNraWxsIS5zb3VyY2UsIFByb21wdEZpbGVTb3VyY2UuRXh0ZW5zaW9uQVBJKTtcblxuXHRcdHJlZ2lzdGVyZWQuZGlzcG9zZSgpO1xuXG5cdFx0Ly8gQWZ0ZXIgZGlzcG9zYWwsIHRoZSBza2lsbCBzaG91bGQgbm8gbG9uZ2VyIGJlIGxpc3RlZFxuXHRcdGNvbnN0IGFjdHVhbEFmdGVyRGlzcG9zZSA9IGF3YWl0IHNlcnZpY2UubGlzdFByb21wdEZpbGVzKFByb21wdHNUeXBlLnNraWxsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRjb25zdCBmb3VuZEFmdGVyRGlzcG9zZSA9IGFjdHVhbEFmdGVyRGlzcG9zZS5maW5kKGkgPT4gaS51cmkudG9TdHJpbmcoKSA9PT0gc2tpbGxVcmkudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvdW5kQWZ0ZXJEaXNwb3NlLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHRzdWl0ZSgnZmluZEFnZW50U2tpbGxzJywgKCkgPT4ge1xuXHRcdHRlYXJkb3duKCgpID0+IHtcblx0XHRcdHNpbm9uLnJlc3RvcmUoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gdW5kZWZpbmVkIHdoZW4gVVNFX0FHRU5UX1NLSUxMUyBpcyBkaXNhYmxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0FHRU5UX1NLSUxMUywgZmFsc2UpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmZpbmRBZ2VudFNraWxscyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZmluZCBza2lsbHMgaW4gd29ya3NwYWNlIGFuZCB1c2VyIGhvbWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9BR0VOVF9TS0lMTFMsIHRydWUpO1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5TS0lMTFNfTE9DQVRJT05fS0VZLCB7fSk7XG5cblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJOYW1lID0gJ2FnZW50LXNraWxscy10ZXN0Jztcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZShyb290Rm9sZGVyKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHQvLyBDcmVhdGUgbW9jayBmaWxlc3lzdGVtIHdpdGggc2tpbGxzIGluIGJvdGggLmdpdGh1Yi9za2lsbHMgYW5kIC5jbGF1ZGUvc2tpbGxzXG5cdFx0XHQvLyBGb2xkZXIgbmFtZXMgbXVzdCBtYXRjaCB0aGUgc2tpbGwgbmFtZXMgZXhhY3RseSAocGVyIGFnZW50c2tpbGxzLmlvIHNwZWNpZmljYXRpb24pXG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvc2tpbGxzL0dpdEh1YiBTa2lsbCAxL1NLSUxMLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogXCJHaXRIdWIgU2tpbGwgMVwiJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJBIEdpdEh1YiBza2lsbCBmb3IgdGVzdGluZ1wiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1RoaXMgaXMgR2l0SHViIHNraWxsIDEgY29udGVudCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5jbGF1ZGUvc2tpbGxzL0NsYXVkZSBTa2lsbCAxL1NLSUxMLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogXCJDbGF1ZGUgU2tpbGwgMVwiJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJBIENsYXVkZSBza2lsbCBmb3IgdGVzdGluZ1wiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1RoaXMgaXMgQ2xhdWRlIHNraWxsIDEgY29udGVudCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5jbGF1ZGUvc2tpbGxzL2ludmFsaWQtc2tpbGwvU0tJTEwubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJJbnZhbGlkIHNraWxsLCBubyBuYW1lXCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnVGhpcyBpcyBpbnZhbGlkIHNraWxsIGNvbnRlbnQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL3NraWxscy9ub3QtYS1za2lsbC1kaXIvUkVBRE1FLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogWydUaGlzIGlzIG5vdCBhIHNraWxsJ10sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnL2hvbWUvdXNlci8uY2xhdWRlL3NraWxscy9QZXJzb25hbCBTa2lsbCAxL1NLSUxMLm1kJyxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogXCJQZXJzb25hbCBTa2lsbCAxXCInLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkEgcGVyc29uYWwgc2tpbGwgZm9yIHRlc3RpbmdcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdUaGlzIGlzIHBlcnNvbmFsIHNraWxsIDEgY29udGVudCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6ICcvaG9tZS91c2VyLy5jbGF1ZGUvc2tpbGxzL25vdC1hLXNraWxsL290aGVyLWZpbGUubWQnLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbJ05vdCBhIHNraWxsIGZpbGUnXSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6ICcvaG9tZS91c2VyLy5jb3BpbG90L3NraWxscy9Db3BpbG90IFNraWxsIDEvU0tJTEwubWQnLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBcIkNvcGlsb3QgU2tpbGwgMVwiJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJBIENvcGlsb3Qgc2tpbGwgZm9yIHRlc3RpbmdcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdUaGlzIGlzIENvcGlsb3Qgc2tpbGwgMSBjb250ZW50Jyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IGFsbFJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuZmluZEFnZW50U2tpbGxzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnQub2soYWxsUmVzdWx0LCAnU2hvdWxkIHJldHVybiByZXN1bHRzIHdoZW4gYWdlbnQgc2tpbGxzIGFyZSBlbmFibGVkJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhbGxSZXN1bHQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgNSwgJ1Nob3VsZCBmaW5kIDUgc2tpbGxzIHRvdGFsJyk7XG5cblx0XHRcdC8vIENoZWNrIHByb2plY3Qgc2tpbGxzIChib3RoIGZyb20gLmdpdGh1Yi9za2lsbHMgYW5kIC5jbGF1ZGUvc2tpbGxzKVxuXHRcdFx0Y29uc3QgcHJvamVjdFNraWxscyA9IHJlc3VsdC5maWx0ZXIoc2tpbGwgPT4gc2tpbGwuc3RvcmFnZSA9PT0gUHJvbXB0c1N0b3JhZ2UubG9jYWwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb2plY3RTa2lsbHMubGVuZ3RoLCAzLCAnU2hvdWxkIGZpbmQgMyBwcm9qZWN0IHNraWxscycpO1xuXG5cdFx0XHRjb25zdCBnaXRodWJTa2lsbDEgPSBwcm9qZWN0U2tpbGxzLmZpbmQoc2tpbGwgPT4gc2tpbGwubmFtZSA9PT0gJ0dpdEh1YiBTa2lsbCAxJyk7XG5cdFx0XHRhc3NlcnQub2soZ2l0aHViU2tpbGwxLCAnU2hvdWxkIGZpbmQgR2l0SHViIHNraWxsIDEnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnaXRodWJTa2lsbDEuZGVzY3JpcHRpb24sICdBIEdpdEh1YiBza2lsbCBmb3IgdGVzdGluZycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdpdGh1YlNraWxsMS51cmkucGF0aCwgYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9za2lsbHMvR2l0SHViIFNraWxsIDEvU0tJTEwubWRgKTtcblxuXHRcdFx0Y29uc3QgY2xhdWRlU2tpbGwxID0gcHJvamVjdFNraWxscy5maW5kKHNraWxsID0+IHNraWxsLm5hbWUgPT09ICdDbGF1ZGUgU2tpbGwgMScpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNsYXVkZVNraWxsMSwgJ1Nob3VsZCBmaW5kIENsYXVkZSBza2lsbCAxJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xhdWRlU2tpbGwxLmRlc2NyaXB0aW9uLCAnQSBDbGF1ZGUgc2tpbGwgZm9yIHRlc3RpbmcnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbGF1ZGVTa2lsbDEudXJpLnBhdGgsIGAke3Jvb3RGb2xkZXJ9Ly5jbGF1ZGUvc2tpbGxzL0NsYXVkZSBTa2lsbCAxL1NLSUxMLm1kYCk7XG5cblx0XHRcdC8vIFRoZSBpbnZhbGlkLXNraWxsIChubyBuYW1lIGF0dHJpYnV0ZSkgc2hvdWxkIG5vdyB1c2UgZm9sZGVyIG5hbWUgYXMgZmFsbGJhY2tcblx0XHRcdGNvbnN0IGludmFsaWRTa2lsbCA9IHByb2plY3RTa2lsbHMuZmluZChza2lsbCA9PiBza2lsbC5uYW1lID09PSAnaW52YWxpZC1za2lsbCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKGludmFsaWRTa2lsbCwgJ1Nob3VsZCBmaW5kIGludmFsaWQtc2tpbGwgdXNpbmcgZm9sZGVyIG5hbWUgYXMgZmFsbGJhY2snKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZhbGlkU2tpbGwuZGVzY3JpcHRpb24sICdJbnZhbGlkIHNraWxsLCBubyBuYW1lJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52YWxpZFNraWxsLnVyaS5wYXRoLCBgJHtyb290Rm9sZGVyfS8uY2xhdWRlL3NraWxscy9pbnZhbGlkLXNraWxsL1NLSUxMLm1kYCk7XG5cblx0XHRcdC8vIENoZWNrIHBlcnNvbmFsIHNraWxsc1xuXHRcdFx0Y29uc3QgcGVyc29uYWxTa2lsbHMgPSByZXN1bHQuZmlsdGVyKHNraWxsID0+IHNraWxsLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLnVzZXIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBlcnNvbmFsU2tpbGxzLmxlbmd0aCwgMiwgJ1Nob3VsZCBmaW5kIDIgcGVyc29uYWwgc2tpbGxzJyk7XG5cblx0XHRcdGNvbnN0IHBlcnNvbmFsU2tpbGwxID0gcGVyc29uYWxTa2lsbHMuZmluZChza2lsbCA9PiBza2lsbC5uYW1lID09PSAnUGVyc29uYWwgU2tpbGwgMScpO1xuXHRcdFx0YXNzZXJ0Lm9rKHBlcnNvbmFsU2tpbGwxLCAnU2hvdWxkIGZpbmQgUGVyc29uYWwgU2tpbGwgMScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBlcnNvbmFsU2tpbGwxLmRlc2NyaXB0aW9uLCAnQSBwZXJzb25hbCBza2lsbCBmb3IgdGVzdGluZycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBlcnNvbmFsU2tpbGwxLnVyaS5wYXRoLCAnL2hvbWUvdXNlci8uY2xhdWRlL3NraWxscy9QZXJzb25hbCBTa2lsbCAxL1NLSUxMLm1kJyk7XG5cblx0XHRcdGNvbnN0IGNvcGlsb3RTa2lsbDEgPSBwZXJzb25hbFNraWxscy5maW5kKHNraWxsID0+IHNraWxsLm5hbWUgPT09ICdDb3BpbG90IFNraWxsIDEnKTtcblx0XHRcdGFzc2VydC5vayhjb3BpbG90U2tpbGwxLCAnU2hvdWxkIGZpbmQgQ29waWxvdCBTa2lsbCAxJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29waWxvdFNraWxsMS5kZXNjcmlwdGlvbiwgJ0EgQ29waWxvdCBza2lsbCBmb3IgdGVzdGluZycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvcGlsb3RTa2lsbDEudXJpLnBhdGgsICcvaG9tZS91c2VyLy5jb3BpbG90L3NraWxscy9Db3BpbG90IFNraWxsIDEvU0tJTEwubWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgcGFyc2luZyBlcnJvcnMgZ3JhY2VmdWxseScsIGFzeW5jICgpID0+IHtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0FHRU5UX1NLSUxMUywgdHJ1ZSk7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlNLSUxMU19MT0NBVElPTl9LRVksIHt9KTtcblxuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlck5hbWUgPSAnc2tpbGxzLWVycm9yLXRlc3QnO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlciA9IGAvJHtyb290Rm9sZGVyTmFtZX1gO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlclVyaSA9IFVSSS5maWxlKHJvb3RGb2xkZXIpO1xuXG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2UodGVzdFdvcmtzcGFjZShyb290Rm9sZGVyVXJpKSk7XG5cblx0XHRcdC8vIENyZWF0ZSBtb2NrIGZpbGVzeXN0ZW0gd2l0aCBtYWxmb3JtZWQgc2tpbGwgZmlsZSBpbiAuZ2l0aHViL3NraWxsc1xuXHRcdFx0Ly8gRm9sZGVyIG5hbWVzIG11c3QgbWF0Y2ggdGhlIHNraWxsIG5hbWVzIGV4YWN0bHlcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9za2lsbHMvVmFsaWQgU2tpbGwvU0tJTEwubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBcIlZhbGlkIFNraWxsXCInLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkEgdmFsaWQgc2tpbGxcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdWYWxpZCBza2lsbCBjb250ZW50Jyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmNsYXVkZS9za2lsbHMvaW52YWxpZC1za2lsbC9TS0lMTC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J2ludmFsaWQgeWFtbDogW3VuY2xvc2VkJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J0ludmFsaWQgc2tpbGwgY29udGVudCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBhbGxSZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmZpbmRBZ2VudFNraWxscyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0Ly8gU2hvdWxkIHJldHVybiBib3RoIHNraWxscyAtIHRoZSBtYWxmb3JtZWQgb25lIHVzZXMgZm9sZGVyIG5hbWUgYXMgZmFsbGJhY2tcblx0XHRcdGFzc2VydC5vayhhbGxSZXN1bHQsICdTaG91bGQgcmV0dXJuIHJlc3VsdHMgZXZlbiB3aXRoIHBhcnNpbmcgZXJyb3JzJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhbGxSZXN1bHQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMiwgJ1Nob3VsZCBmaW5kIDIgc2tpbGxzJyk7XG5cblx0XHRcdGNvbnN0IHZhbGlkU2tpbGwgPSByZXN1bHQuZmluZChzID0+IHMubmFtZSA9PT0gJ1ZhbGlkIFNraWxsJyk7XG5cdFx0XHRhc3NlcnQub2sodmFsaWRTa2lsbCwgJ1Nob3VsZCBmaW5kIHRoZSB2YWxpZCBza2lsbCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbGlkU2tpbGwuc3RvcmFnZSwgUHJvbXB0c1N0b3JhZ2UubG9jYWwpO1xuXG5cdFx0XHRjb25zdCBpbnZhbGlkU2tpbGwgPSByZXN1bHQuZmluZChzID0+IHMubmFtZSA9PT0gJ2ludmFsaWQtc2tpbGwnKTtcblx0XHRcdGFzc2VydC5vayhpbnZhbGlkU2tpbGwsICdTaG91bGQgZmluZCBza2lsbCB3aXRoIGZvbGRlciBuYW1lIGFzIGZhbGxiYWNrIGRlc3BpdGUgbWFsZm9ybWVkIFlBTUwnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZhbGlkU2tpbGwuc3RvcmFnZSwgUHJvbXB0c1N0b3JhZ2UubG9jYWwpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiBlbXB0eSBhcnJheSB3aGVuIG5vIHNraWxscyBmb3VuZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0FHRU5UX1NLSUxMUywgdHJ1ZSk7XG5cblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJOYW1lID0gJ2VtcHR5LXdvcmtzcGFjZSc7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyID0gYC8ke3Jvb3RGb2xkZXJOYW1lfWA7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUocm9vdEZvbGRlcik7XG5cblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblxuXHRcdFx0Ly8gQ3JlYXRlIGVtcHR5IG1vY2sgZmlsZXN5c3RlbVxuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXSk7XG5cblx0XHRcdGNvbnN0IGFsbFJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuZmluZEFnZW50U2tpbGxzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnQub2soYWxsUmVzdWx0LCAnU2hvdWxkIHJldHVybiByZXN1bHRzIGFycmF5Jyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhbGxSZXN1bHQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMCwgJ1Nob3VsZCBmaW5kIG5vIHNraWxscycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHRydW5jYXRlIGxvbmcgbmFtZXMgYW5kIGRlc2NyaXB0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0FHRU5UX1NLSUxMUywgdHJ1ZSk7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlNLSUxMU19MT0NBVElPTl9LRVksIHt9KTtcblxuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlck5hbWUgPSAndHJ1bmNhdGlvbi10ZXN0Jztcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZShyb290Rm9sZGVyKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHRjb25zdCBsb25nTmFtZSA9ICdBJy5yZXBlYXQoMTAwKTsgLy8gRXhjZWVkcyA2NCBjaGFyYWN0ZXJzXG5cdFx0XHRjb25zdCB0cnVuY2F0ZWROYW1lID0gJ0EnLnJlcGVhdCg2NCk7IC8vIEV4cGVjdGVkIGFmdGVyIHRydW5jYXRpb25cblx0XHRcdGNvbnN0IGxvbmdEZXNjcmlwdGlvbiA9ICdCJy5yZXBlYXQoMTUwMCk7IC8vIEV4Y2VlZHMgMTAyNCBjaGFyYWN0ZXJzXG5cblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Ly8gRm9sZGVyIG5hbWUgbXVzdCBtYXRjaCB0aGUgdHJ1bmNhdGVkIHNraWxsIG5hbWVcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL3NraWxscy8ke3RydW5jYXRlZE5hbWV9L1NLSUxMLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHRgbmFtZTogXCIke2xvbmdOYW1lfVwiYCxcblx0XHRcdFx0XHRcdGBkZXNjcmlwdGlvbjogXCIke2xvbmdEZXNjcmlwdGlvbn1cImAsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdTa2lsbCBjb250ZW50Jyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IGFsbFJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuZmluZEFnZW50U2tpbGxzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnQub2soYWxsUmVzdWx0LCAnU2hvdWxkIHJldHVybiByZXN1bHRzJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhbGxSZXN1bHQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSwgJ1Nob3VsZCBmaW5kIDEgc2tpbGwnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0ubmFtZS5sZW5ndGgsIDY0LCAnTmFtZSBzaG91bGQgYmUgdHJ1bmNhdGVkIHRvIDY0IGNoYXJhY3RlcnMnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0uZGVzY3JpcHRpb24/Lmxlbmd0aCwgMTAyNCwgJ0Rlc2NyaXB0aW9uIHNob3VsZCBiZSB0cnVuY2F0ZWQgdG8gMTAyNCBjaGFyYWN0ZXJzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmVtb3ZlIFhNTCB0YWdzIGZyb20gbmFtZSBhbmQgZGVzY3JpcHRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9BR0VOVF9TS0lMTFMsIHRydWUpO1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5TS0lMTFNfTE9DQVRJT05fS0VZLCB7fSk7XG5cblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJOYW1lID0gJ3htbC10ZXN0Jztcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZShyb290Rm9sZGVyKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHQvLyBGb2xkZXIgbmFtZSBtdXN0IG1hdGNoIHRoZSBzYW5pdGl6ZWQgc2tpbGwgbmFtZSAod2l0aCBYTUwgdGFncyByZW1vdmVkKVxuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL3NraWxscy9Ta2lsbCB3aXRoIFhNTCB0YWdzL1NLSUxMLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogXCJTa2lsbCA8Yj53aXRoPC9iPiA8ZW0+WE1MPC9lbT4gdGFnc1wiJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJEZXNjcmlwdGlvbiB3aXRoIDxzdHJvbmc+SFRNTDwvc3Ryb25nPiBhbmQgPHNwYW4+b3RoZXI8L3NwYW4+IHRhZ3NcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdTa2lsbCBjb250ZW50Jyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IGFsbFJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuZmluZEFnZW50U2tpbGxzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnQub2soYWxsUmVzdWx0LCAnU2hvdWxkIHJldHVybiByZXN1bHRzJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhbGxSZXN1bHQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSwgJ1Nob3VsZCBmaW5kIDEgc2tpbGwnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0ubmFtZSwgJ1NraWxsIHdpdGggWE1MIHRhZ3MnLCAnWE1MIHRhZ3Mgc2hvdWxkIGJlIHJlbW92ZWQgZnJvbSBuYW1lJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLmRlc2NyaXB0aW9uLCAnRGVzY3JpcHRpb24gd2l0aCBIVE1MIGFuZCBvdGhlciB0YWdzJywgJ1hNTCB0YWdzIHNob3VsZCBiZSByZW1vdmVkIGZyb20gZGVzY3JpcHRpb24nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgYm90aCB0cnVuY2F0aW9uIGFuZCBYTUwgcmVtb3ZhbCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0FHRU5UX1NLSUxMUywgdHJ1ZSk7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlNLSUxMU19MT0NBVElPTl9LRVksIHt9KTtcblxuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlck5hbWUgPSAnY29tYmluZWQtdGVzdCc7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyID0gYC8ke3Jvb3RGb2xkZXJOYW1lfWA7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUocm9vdEZvbGRlcik7XG5cblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblxuXHRcdFx0Y29uc3QgbG9uZ05hbWVXaXRoWG1sID0gJzxwPicgKyAnQScucmVwZWF0KDEwMCkgKyAnPC9wPic7IC8vIEV4Y2VlZHMgNjQgY2hhcnMgYW5kIGhhcyBYTUxcblx0XHRcdGNvbnN0IHRydW5jYXRlZE5hbWUgPSAnQScucmVwZWF0KDY0KTsgLy8gRXhwZWN0ZWQgYWZ0ZXIgWE1MIHJlbW92YWwgYW5kIHRydW5jYXRpb25cblx0XHRcdGNvbnN0IGxvbmdEZXNjV2l0aFhtbCA9ICc8ZGl2PicgKyAnQicucmVwZWF0KDE1MDApICsgJzwvZGl2Pic7IC8vIEV4Y2VlZHMgMTAyNCBjaGFycyBhbmQgaGFzIFhNTFxuXG5cdFx0XHQvLyBGb2xkZXIgbmFtZSBtdXN0IG1hdGNoIHRoZSBmdWxseSBzYW5pdGl6ZWQgc2tpbGwgbmFtZVxuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL3NraWxscy8ke3RydW5jYXRlZE5hbWV9L1NLSUxMLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHRgbmFtZTogXCIke2xvbmdOYW1lV2l0aFhtbH1cImAsXG5cdFx0XHRcdFx0XHRgZGVzY3JpcHRpb246IFwiJHtsb25nRGVzY1dpdGhYbWx9XCJgLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnU2tpbGwgY29udGVudCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBhbGxSZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmZpbmRBZ2VudFNraWxscyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGFsbFJlc3VsdCwgJ1Nob3VsZCByZXR1cm4gcmVzdWx0cycpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWxsUmVzdWx0O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEsICdTaG91bGQgZmluZCAxIHNraWxsJyk7XG5cdFx0XHQvLyBYTUwgdGFncyBhcmUgcmVtb3ZlZCBmaXJzdCwgdGhlbiB0cnVuY2F0aW9uIGhhcHBlbnNcblx0XHRcdGFzc2VydC5vayghcmVzdWx0WzBdLm5hbWUuaW5jbHVkZXMoJzwnKSwgJ05hbWUgc2hvdWxkIG5vdCBjb250YWluIFhNTCB0YWdzJyk7XG5cdFx0XHRhc3NlcnQub2soIXJlc3VsdFswXS5uYW1lLmluY2x1ZGVzKCc+JyksICdOYW1lIHNob3VsZCBub3QgY29udGFpbiBYTUwgdGFncycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5uYW1lLmxlbmd0aCwgNjQsICdOYW1lIHNob3VsZCBiZSB0cnVuY2F0ZWQgdG8gNjQgY2hhcmFjdGVycycpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFyZXN1bHRbMF0uZGVzY3JpcHRpb24/LmluY2x1ZGVzKCc8JyksICdEZXNjcmlwdGlvbiBzaG91bGQgbm90IGNvbnRhaW4gWE1MIHRhZ3MnKTtcblx0XHRcdGFzc2VydC5vayghcmVzdWx0WzBdLmRlc2NyaXB0aW9uPy5pbmNsdWRlcygnPicpLCAnRGVzY3JpcHRpb24gc2hvdWxkIG5vdCBjb250YWluIFhNTCB0YWdzJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLmRlc2NyaXB0aW9uPy5sZW5ndGgsIDEwMjQsICdEZXNjcmlwdGlvbiBzaG91bGQgYmUgdHJ1bmNhdGVkIHRvIDEwMjQgY2hhcmFjdGVycycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHNraXAgZHVwbGljYXRlIHNraWxsIG5hbWVzIGFuZCBrZWVwIGZpcnN0IGJ5IHByaW9yaXR5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQUdFTlRfU0tJTExTLCB0cnVlKTtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuU0tJTExTX0xPQ0FUSU9OX0tFWSwge30pO1xuXG5cdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICdkdXBsaWNhdGUtc2tpbGxzLXRlc3QnO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlciA9IGAvJHtyb290Rm9sZGVyTmFtZX1gO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlclVyaSA9IFVSSS5maWxlKHJvb3RGb2xkZXIpO1xuXG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2UodGVzdFdvcmtzcGFjZShyb290Rm9sZGVyVXJpKSk7XG5cblx0XHRcdC8vIENyZWF0ZSBza2lsbHMgd2l0aCBkdXBsaWNhdGUgbmFtZXMgaW4gZGlmZmVyZW50IGxvY2F0aW9uc1xuXHRcdFx0Ly8gV29ya3NwYWNlIHNraWxsIHNob3VsZCBiZSBrZXB0IChoaWdoZXIgcHJpb3JpdHkpLCB1c2VyIHNraWxsIHNob3VsZCBiZSBza2lwcGVkXG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvc2tpbGxzL0R1cGxpY2F0ZSBTa2lsbC9TS0lMTC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFwiRHVwbGljYXRlIFNraWxsXCInLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIldvcmtzcGFjZSB2ZXJzaW9uXCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnV29ya3NwYWNlIHNraWxsIGNvbnRlbnQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnL2hvbWUvdXNlci8uY29waWxvdC9za2lsbHMvRHVwbGljYXRlIFNraWxsL1NLSUxMLm1kJyxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogXCJEdXBsaWNhdGUgU2tpbGxcIicsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVXNlciB2ZXJzaW9uIC0gc2hvdWxkIGJlIHNraXBwZWRcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdVc2VyIHNraWxsIGNvbnRlbnQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uY2xhdWRlL3NraWxscy9VbmlxdWUgU2tpbGwvU0tJTEwubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBcIlVuaXF1ZSBTa2lsbFwiJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJBIHVuaXF1ZSBza2lsbFwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1VuaXF1ZSBza2lsbCBjb250ZW50Jyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IGFsbFJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuZmluZEFnZW50U2tpbGxzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnQub2soYWxsUmVzdWx0LCAnU2hvdWxkIHJldHVybiByZXN1bHRzJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhbGxSZXN1bHQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMiwgJ1Nob3VsZCBmaW5kIDIgc2tpbGxzIChkdXBsaWNhdGUgc2tpcHBlZCknKTtcblxuXHRcdFx0Y29uc3QgZHVwbGljYXRlU2tpbGwgPSByZXN1bHQuZmluZChzID0+IHMubmFtZSA9PT0gJ0R1cGxpY2F0ZSBTa2lsbCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKGR1cGxpY2F0ZVNraWxsLCAnU2hvdWxkIGZpbmQgdGhlIGR1cGxpY2F0ZSBza2lsbCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGR1cGxpY2F0ZVNraWxsLmRlc2NyaXB0aW9uLCAnV29ya3NwYWNlIHZlcnNpb24nLCAnU2hvdWxkIGtlZXAgd29ya3NwYWNlIHZlcnNpb24gKGhpZ2hlciBwcmlvcml0eSknKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkdXBsaWNhdGVTa2lsbC5zdG9yYWdlLCBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgJ1Nob3VsZCBiZSBmcm9tIHdvcmtzcGFjZScpO1xuXG5cdFx0XHRjb25zdCB1bmlxdWVTa2lsbCA9IHJlc3VsdC5maW5kKHMgPT4gcy5uYW1lID09PSAnVW5pcXVlIFNraWxsJyk7XG5cdFx0XHRhc3NlcnQub2sodW5pcXVlU2tpbGwsICdTaG91bGQgZmluZCB0aGUgdW5pcXVlIHNraWxsJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcHJpb3JpdGl6ZSBza2lsbHMgYnkgc291cmNlOiB3b3Jrc3BhY2UgPiB1c2VyID4gZXh0ZW5zaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQUdFTlRfU0tJTExTLCB0cnVlKTtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuU0tJTExTX0xPQ0FUSU9OX0tFWSwge30pO1xuXG5cdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICdwcmlvcml0eS10ZXN0Jztcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZShyb290Rm9sZGVyKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHQvLyBDcmVhdGUgc2tpbGxzIGZyb20gZGlmZmVyZW50IHNvdXJjZXMgd2l0aCBzYW1lIG5hbWVcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogJy9ob21lL3VzZXIvLmNvcGlsb3Qvc2tpbGxzL1ByaW9yaXR5IFNraWxsL1NLSUxMLm1kJyxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogXCJQcmlvcml0eSBTa2lsbFwiJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJVc2VyIHZlcnNpb25cIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdVc2VyIHNraWxsIGNvbnRlbnQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL3NraWxscy9Qcmlvcml0eSBTa2lsbC9TS0lMTC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFwiUHJpb3JpdHkgU2tpbGxcIicsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiV29ya3NwYWNlIHZlcnNpb24gLSBoaWdoZXN0IHByaW9yaXR5XCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnV29ya3NwYWNlIHNraWxsIGNvbnRlbnQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgYWxsUmVzdWx0ID0gYXdhaXQgc2VydmljZS5maW5kQWdlbnRTa2lsbHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGFzc2VydC5vayhhbGxSZXN1bHQsICdTaG91bGQgcmV0dXJuIHJlc3VsdHMnKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFsbFJlc3VsdDtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxLCAnU2hvdWxkIGZpbmQgMSBza2lsbCAoZHVwbGljYXRlcyByZXNvbHZlZCBieSBwcmlvcml0eSknKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0uZGVzY3JpcHRpb24sICdXb3Jrc3BhY2UgdmVyc2lvbiAtIGhpZ2hlc3QgcHJpb3JpdHknLCAnV29ya3NwYWNlIHNob3VsZCB3aW4gb3ZlciB1c2VyJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLnN0b3JhZ2UsIFByb21wdHNTdG9yYWdlLmxvY2FsKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBpbmNsdWRlIHNraWxscyB3aGVyZSBuYW1lIGRvZXMgbm90IG1hdGNoIGZvbGRlciBuYW1lIHVzaW5nIGZvbGRlciBuYW1lIGFzIGZhbGxiYWNrJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQUdFTlRfU0tJTExTLCB0cnVlKTtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuU0tJTExTX0xPQ0FUSU9OX0tFWSwge30pO1xuXG5cdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICduYW1lLW1pc21hdGNoLXRlc3QnO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlciA9IGAvJHtyb290Rm9sZGVyTmFtZX1gO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlclVyaSA9IFVSSS5maWxlKHJvb3RGb2xkZXIpO1xuXG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2UodGVzdFdvcmtzcGFjZShyb290Rm9sZGVyVXJpKSk7XG5cblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Ly8gRm9sZGVyIG5hbWUgXCJ3cm9uZy1mb2xkZXItbmFtZVwiIGRvZXNuJ3QgbWF0Y2ggc2tpbGwgbmFtZSBcIkNvcnJlY3QgU2tpbGwgTmFtZVwiXG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9za2lsbHMvd3JvbmctZm9sZGVyLW5hbWUvU0tJTEwubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBcIkNvcnJlY3QgU2tpbGwgTmFtZVwiJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUaGlzIHNraWxsIHNob3VsZCB1c2UgZm9sZGVyIG5hbWUgYXMgZmFsbGJhY2tcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdTa2lsbCBjb250ZW50Jyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Ly8gRm9sZGVyIG5hbWUgbWF0Y2hlcyBza2lsbCBuYW1lXG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9za2lsbHMvVmFsaWQgU2tpbGwvU0tJTEwubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBcIlZhbGlkIFNraWxsXCInLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRoaXMgc2tpbGwgc2hvdWxkIGJlIGZvdW5kXCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnVmFsaWQgc2tpbGwgY29udGVudCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBhbGxSZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmZpbmRBZ2VudFNraWxscyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGFsbFJlc3VsdCwgJ1Nob3VsZCByZXR1cm4gcmVzdWx0cycpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWxsUmVzdWx0O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDIsICdTaG91bGQgZmluZCBib3RoIHNraWxscycpO1xuXG5cdFx0XHRjb25zdCBtaXNtYXRjaGVkU2tpbGwgPSByZXN1bHQuZmluZChzID0+IHMubmFtZSA9PT0gJ3dyb25nLWZvbGRlci1uYW1lJyk7XG5cdFx0XHRhc3NlcnQub2sobWlzbWF0Y2hlZFNraWxsLCAnU2hvdWxkIGZpbmQgc2tpbGwgd2l0aCBmb2xkZXIgbmFtZSBhcyBmYWxsYmFjaycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1pc21hdGNoZWRTa2lsbC5kZXNjcmlwdGlvbiwgJ1RoaXMgc2tpbGwgc2hvdWxkIHVzZSBmb2xkZXIgbmFtZSBhcyBmYWxsYmFjaycpO1xuXG5cdFx0XHRjb25zdCB2YWxpZFNraWxsID0gcmVzdWx0LmZpbmQocyA9PiBzLm5hbWUgPT09ICdWYWxpZCBTa2lsbCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKHZhbGlkU2tpbGwsICdTaG91bGQgZmluZCB0aGUgdmFsaWQgc2tpbGwnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBpbmNsdWRlIHNraWxscyB3aXRoIG1pc3NpbmcgbmFtZSBhdHRyaWJ1dGUgdXNpbmcgZm9sZGVyIG5hbWUgYXMgZmFsbGJhY2snLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9BR0VOVF9TS0lMTFMsIHRydWUpO1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5TS0lMTFNfTE9DQVRJT05fS0VZLCB7fSk7XG5cblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJOYW1lID0gJ21pc3NpbmctbmFtZS10ZXN0Jztcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZShyb290Rm9sZGVyKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvc2tpbGxzL25vLW5hbWUtc2tpbGwvU0tJTEwubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUaGlzIHNraWxsIGhhcyBubyBuYW1lIGF0dHJpYnV0ZVwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1NraWxsIGNvbnRlbnQgd2l0aG91dCBuYW1lJyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9za2lsbHMvVmFsaWQgTmFtZWQgU2tpbGwvU0tJTEwubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBcIlZhbGlkIE5hbWVkIFNraWxsXCInLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRoaXMgc2tpbGwgaGFzIGEgbmFtZVwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1ZhbGlkIHNraWxsIGNvbnRlbnQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgYWxsUmVzdWx0ID0gYXdhaXQgc2VydmljZS5maW5kQWdlbnRTa2lsbHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGFzc2VydC5vayhhbGxSZXN1bHQsICdTaG91bGQgcmV0dXJuIHJlc3VsdHMnKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFsbFJlc3VsdDtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAyLCAnU2hvdWxkIGZpbmQgYm90aCBza2lsbHMnKTtcblxuXHRcdFx0Y29uc3Qgbm9OYW1lU2tpbGwgPSByZXN1bHQuZmluZChzID0+IHMubmFtZSA9PT0gJ25vLW5hbWUtc2tpbGwnKTtcblx0XHRcdGFzc2VydC5vayhub05hbWVTa2lsbCwgJ1Nob3VsZCBmaW5kIHNraWxsIHdpdGggZm9sZGVyIG5hbWUgYXMgZmFsbGJhY2snKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub05hbWVTa2lsbC5kZXNjcmlwdGlvbiwgJ1RoaXMgc2tpbGwgaGFzIG5vIG5hbWUgYXR0cmlidXRlJyk7XG5cblx0XHRcdGNvbnN0IHZhbGlkU2tpbGwgPSByZXN1bHQuZmluZChzID0+IHMubmFtZSA9PT0gJ1ZhbGlkIE5hbWVkIFNraWxsJyk7XG5cdFx0XHRhc3NlcnQub2sodmFsaWRTa2lsbCwgJ1Nob3VsZCBmaW5kIHNraWxsIHdpdGggbmFtZSBhdHRyaWJ1dGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBpbmNsdWRlIGV4dGVuc2lvbi1wcm92aWRlZCBza2lsbHMgaW4gZmluZEFnZW50U2tpbGxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQUdFTlRfU0tJTExTLCB0cnVlKTtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuU0tJTExTX0xPQ0FUSU9OX0tFWSwge30pO1xuXG5cdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICdleHRlbnNpb24tc2tpbGxzLXRlc3QnO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlciA9IGAvJHtyb290Rm9sZGVyTmFtZX1gO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlclVyaSA9IFVSSS5maWxlKHJvb3RGb2xkZXIpO1xuXG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2UodGVzdFdvcmtzcGFjZShyb290Rm9sZGVyVXJpKSk7XG5cblx0XHRcdGNvbnN0IGV4dGVuc2lvblNraWxsVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vZXh0ZW5zaW9ucy9teS1leHRlbnNpb24vRXh0ZW5zaW9uIFNraWxsL1NLSUxMLm1kJyk7XG5cdFx0XHRjb25zdCBleHRlbnNpb24gPSB7XG5cdFx0XHRcdGlkZW50aWZpZXI6IHsgdmFsdWU6ICd0ZXN0Lm15LWV4dGVuc2lvbicgfSxcblx0XHRcdFx0ZW5hYmxlZEFwaVByb3Bvc2FsczogWydjaGF0UGFydGljaXBhbnRQcml2YXRlJ11cblx0XHRcdH0gYXMgdW5rbm93biBhcyBJRXh0ZW5zaW9uRGVzY3JpcHRpb247XG5cblx0XHRcdC8vIENyZWF0ZSB3b3Jrc3BhY2Ugc2tpbGwgYW5kIGV4dGVuc2lvbiBza2lsbFxuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL3NraWxscy9Xb3Jrc3BhY2UgU2tpbGwvU0tJTEwubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBcIldvcmtzcGFjZSBTa2lsbFwiJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJBIHdvcmtzcGFjZSBza2lsbFwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1dvcmtzcGFjZSBza2lsbCBjb250ZW50Jyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogZXh0ZW5zaW9uU2tpbGxVcmkucGF0aCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogXCJFeHRlbnNpb24gU2tpbGxcIicsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiQSBza2lsbCBmcm9tIGV4dGVuc2lvbiBwcm92aWRlclwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J0V4dGVuc2lvbiBza2lsbCBjb250ZW50Jyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IHByb3ZpZGVyID0ge1xuXHRcdFx0XHRwcm92aWRlUHJvbXB0RmlsZXM6IGFzeW5jIChfY29udGV4dDogSVByb21wdEZpbGVDb250ZXh0LCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIFt7IHVyaTogZXh0ZW5zaW9uU2tpbGxVcmkgfV07XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlZ2lzdGVyZWQgPSBzZXJ2aWNlLnJlZ2lzdGVyUHJvbXB0RmlsZVByb3ZpZGVyKGV4dGVuc2lvbiwgUHJvbXB0c1R5cGUuc2tpbGwsIHByb3ZpZGVyKTtcblxuXHRcdFx0Y29uc3QgYWxsUmVzdWx0ID0gYXdhaXQgc2VydmljZS5maW5kQWdlbnRTa2lsbHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGFzc2VydC5vayhhbGxSZXN1bHQsICdTaG91bGQgcmV0dXJuIHJlc3VsdHMnKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFsbFJlc3VsdDtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAyLCAnU2hvdWxkIGZpbmQgMiBza2lsbHMgKHdvcmtzcGFjZSArIGV4dGVuc2lvbiknKTtcblxuXHRcdFx0Y29uc3Qgd29ya3NwYWNlU2tpbGwgPSByZXN1bHQuZmluZChzID0+IHMubmFtZSA9PT0gJ1dvcmtzcGFjZSBTa2lsbCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKHdvcmtzcGFjZVNraWxsLCAnU2hvdWxkIGZpbmQgd29ya3NwYWNlIHNraWxsJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya3NwYWNlU2tpbGwuc3RvcmFnZSwgUHJvbXB0c1N0b3JhZ2UubG9jYWwpO1xuXG5cdFx0XHRjb25zdCBleHRlbnNpb25Ta2lsbCA9IHJlc3VsdC5maW5kKHMgPT4gcy5uYW1lID09PSAnRXh0ZW5zaW9uIFNraWxsJyk7XG5cdFx0XHRhc3NlcnQub2soZXh0ZW5zaW9uU2tpbGwsICdTaG91bGQgZmluZCBleHRlbnNpb24gc2tpbGwnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRlbnNpb25Ta2lsbC5zdG9yYWdlLCBQcm9tcHRzU3RvcmFnZS5leHRlbnNpb24pO1xuXG5cdFx0XHRyZWdpc3RlcmVkLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBpbmNsdWRlIGNvbnRyaWJ1dGVkIHNraWxsIGZpbGVzIGluIGZpbmRBZ2VudFNraWxscycsIGFzeW5jICgpID0+IHtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0FHRU5UX1NLSUxMUywgdHJ1ZSk7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlNLSUxMU19MT0NBVElPTl9LRVksIHt9KTtcblxuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlck5hbWUgPSAnY29udHJpYnV0ZWQtc2tpbGxzLXRlc3QnO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlciA9IGAvJHtyb290Rm9sZGVyTmFtZX1gO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlclVyaSA9IFVSSS5maWxlKHJvb3RGb2xkZXIpO1xuXG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2UodGVzdFdvcmtzcGFjZShyb290Rm9sZGVyVXJpKSk7XG5cblx0XHRcdGNvbnN0IGNvbnRyaWJ1dGVkU2tpbGxVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly9leHRlbnNpb25zL215LWV4dGVuc2lvbi9Db250cmlidXRlZCBTa2lsbC9TS0lMTC5tZCcpO1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0ge1xuXHRcdFx0XHRpZGVudGlmaWVyOiB7IHZhbHVlOiAndGVzdC5teS1leHRlbnNpb24nIH1cblx0XHRcdH0gYXMgdW5rbm93biBhcyBJRXh0ZW5zaW9uRGVzY3JpcHRpb247XG5cblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9za2lsbHMvTG9jYWwgU2tpbGwvU0tJTEwubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBcIkxvY2FsIFNraWxsXCInLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkEgbG9jYWwgc2tpbGxcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdMb2NhbCBza2lsbCBjb250ZW50Jyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogY29udHJpYnV0ZWRTa2lsbFVyaS5wYXRoLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBcIkNvbnRyaWJ1dGVkIFNraWxsXCInLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkEgY29udHJpYnV0ZWQgc2tpbGwgZnJvbSBleHRlbnNpb25cIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdDb250cmlidXRlZCBza2lsbCBjb250ZW50Jyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IHJlZ2lzdGVyZWQgPSBzZXJ2aWNlLnJlZ2lzdGVyQ29udHJpYnV0ZWRGaWxlKFxuXHRcdFx0XHRQcm9tcHRzVHlwZS5za2lsbCxcblx0XHRcdFx0Y29udHJpYnV0ZWRTa2lsbFVyaSxcblx0XHRcdFx0ZXh0ZW5zaW9uLFxuXHRcdFx0XHQnQ29udHJpYnV0ZWQgU2tpbGwnLFxuXHRcdFx0XHQnQSBjb250cmlidXRlZCBza2lsbCBmcm9tIGV4dGVuc2lvbidcblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IGFsbFJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuZmluZEFnZW50U2tpbGxzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnQub2soYWxsUmVzdWx0LCAnU2hvdWxkIHJldHVybiByZXN1bHRzJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhbGxSZXN1bHQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMiwgJ1Nob3VsZCBmaW5kIDIgc2tpbGxzIChsb2NhbCArIGNvbnRyaWJ1dGVkKScpO1xuXG5cdFx0XHRjb25zdCBsb2NhbFNraWxsID0gcmVzdWx0LmZpbmQocyA9PiBzLm5hbWUgPT09ICdMb2NhbCBTa2lsbCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKGxvY2FsU2tpbGwsICdTaG91bGQgZmluZCBsb2NhbCBza2lsbCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxvY2FsU2tpbGwuc3RvcmFnZSwgUHJvbXB0c1N0b3JhZ2UubG9jYWwpO1xuXG5cdFx0XHRjb25zdCBjb250cmlidXRlZFNraWxsID0gcmVzdWx0LmZpbmQocyA9PiBzLm5hbWUgPT09ICdDb250cmlidXRlZCBTa2lsbCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNvbnRyaWJ1dGVkU2tpbGwsICdTaG91bGQgZmluZCBjb250cmlidXRlZCBza2lsbCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyaWJ1dGVkU2tpbGwuc3RvcmFnZSwgUHJvbXB0c1N0b3JhZ2UuZXh0ZW5zaW9uKTtcblxuXHRcdFx0cmVnaXN0ZXJlZC5kaXNwb3NlKCk7XG5cblx0XHRcdC8vIEFmdGVyIGRpc3Bvc2FsLCBvbmx5IGxvY2FsIHNraWxsIHNob3VsZCByZW1haW5cblx0XHRcdGNvbnN0IHJlc3VsdEFmdGVyRGlzcG9zZSA9IGF3YWl0IHNlcnZpY2UuZmluZEFnZW50U2tpbGxzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdEFmdGVyRGlzcG9zZT8ubGVuZ3RoLCAxLCAnU2hvdWxkIGZpbmQgMSBza2lsbCBhZnRlciBkaXNwb3NhbCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdEFmdGVyRGlzcG9zZT8uWzBdLm5hbWUsICdMb2NhbCBTa2lsbCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHVzZSBmb2xkZXIgbmFtZSBmb3IgY29udHJpYnV0ZWQgc2tpbGwgd2l0aCBtaXNzaW5nIG5hbWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9BR0VOVF9TS0lMTFMsIHRydWUpO1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5TS0lMTFNfTE9DQVRJT05fS0VZLCB7fSk7XG5cblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJOYW1lID0gJ2NvbnRyaWJ1dGVkLW5vLW5hbWUtdGVzdCc7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyID0gYC8ke3Jvb3RGb2xkZXJOYW1lfWA7XG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2UodGVzdFdvcmtzcGFjZShVUkkuZmlsZShyb290Rm9sZGVyKSkpO1xuXG5cdFx0XHRjb25zdCBjb250cmlidXRlZFNraWxsVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vZXh0ZW5zaW9ucy9teS1leHRlbnNpb24vbXktc2tpbGwvU0tJTEwubWQnKTtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IHsgaWRlbnRpZmllcjogeyB2YWx1ZTogJ3Rlc3QubXktZXh0ZW5zaW9uJyB9IH0gYXMgdW5rbm93biBhcyBJRXh0ZW5zaW9uRGVzY3JpcHRpb247XG5cblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogY29udHJpYnV0ZWRTa2lsbFVyaS5wYXRoLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJBIHNraWxsIHdpdGhvdXQgYSBuYW1lXCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnU2tpbGwgY29udGVudCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCByZWdpc3RlcmVkID0gc2VydmljZS5yZWdpc3RlckNvbnRyaWJ1dGVkRmlsZShQcm9tcHRzVHlwZS5za2lsbCwgY29udHJpYnV0ZWRTa2lsbFVyaSwgZXh0ZW5zaW9uLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuZmluZEFnZW50U2tpbGxzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCwgJ1Nob3VsZCByZXR1cm4gcmVzdWx0cycpO1xuXG5cdFx0XHRjb25zdCBza2lsbCA9IHJlc3VsdC5maW5kKHMgPT4gcy5uYW1lID09PSAnbXktc2tpbGwnKTtcblx0XHRcdGFzc2VydC5vayhza2lsbCwgJ1Nob3VsZCBmaW5kIHNraWxsIHVzaW5nIGZvbGRlciBuYW1lIGFzIGZhbGxiYWNrJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2tpbGwuZGVzY3JpcHRpb24sICdBIHNraWxsIHdpdGhvdXQgYSBuYW1lJyk7XG5cblx0XHRcdHJlZ2lzdGVyZWQuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGFjY2VwdCBjb250cmlidXRlZCBza2lsbCB3aXRoIG1pc3NpbmcgZGVzY3JpcHRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9BR0VOVF9TS0lMTFMsIHRydWUpO1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5TS0lMTFNfTE9DQVRJT05fS0VZLCB7fSk7XG5cblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJOYW1lID0gJ2NvbnRyaWJ1dGVkLW5vLWRlc2MtdGVzdCc7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyID0gYC8ke3Jvb3RGb2xkZXJOYW1lfWA7XG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2UodGVzdFdvcmtzcGFjZShVUkkuZmlsZShyb290Rm9sZGVyKSkpO1xuXG5cdFx0XHRjb25zdCBjb250cmlidXRlZFNraWxsVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vZXh0ZW5zaW9ucy9teS1leHRlbnNpb24vbm8tZGVzYy1za2lsbC9TS0lMTC5tZCcpO1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0geyBpZGVudGlmaWVyOiB7IHZhbHVlOiAndGVzdC5teS1leHRlbnNpb24nIH0gfSBhcyB1bmtub3duIGFzIElFeHRlbnNpb25EZXNjcmlwdGlvbjtcblxuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBjb250cmlidXRlZFNraWxsVXJpLnBhdGgsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFwibm8tZGVzYy1za2lsbFwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1NraWxsIGNvbnRlbnQgd2l0aG91dCBkZXNjcmlwdGlvbicsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCByZWdpc3RlcmVkID0gc2VydmljZS5yZWdpc3RlckNvbnRyaWJ1dGVkRmlsZShQcm9tcHRzVHlwZS5za2lsbCwgY29udHJpYnV0ZWRTa2lsbFVyaSwgZXh0ZW5zaW9uLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuZmluZEFnZW50U2tpbGxzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCwgJ1Nob3VsZCByZXR1cm4gcmVzdWx0cycpO1xuXG5cdFx0XHRjb25zdCBza2lsbCA9IHJlc3VsdC5maW5kKHMgPT4gcy5uYW1lID09PSAnbm8tZGVzYy1za2lsbCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKHNraWxsLCAnU2hvdWxkIGZpbmQgc2tpbGwgZXZlbiB3aXRob3V0IGRlc2NyaXB0aW9uJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2tpbGwuZGVzY3JpcHRpb24sIHVuZGVmaW5lZCk7XG5cblx0XHRcdHJlZ2lzdGVyZWQuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG92ZXJyaWRlIGNvbnRyaWJ1dGVkIHNraWxsIG5hbWUgd2l0aCBmb2xkZXIgbmFtZSBvbiBtaXNtYXRjaCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0FHRU5UX1NLSUxMUywgdHJ1ZSk7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlNLSUxMU19MT0NBVElPTl9LRVksIHt9KTtcblxuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlck5hbWUgPSAnY29udHJpYnV0ZWQtbWlzbWF0Y2gtdGVzdCc7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyID0gYC8ke3Jvb3RGb2xkZXJOYW1lfWA7XG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2UodGVzdFdvcmtzcGFjZShVUkkuZmlsZShyb290Rm9sZGVyKSkpO1xuXG5cdFx0XHRjb25zdCBjb250cmlidXRlZFNraWxsVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vZXh0ZW5zaW9ucy9teS1leHRlbnNpb24vYWN0dWFsLWZvbGRlci9TS0lMTC5tZCcpO1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0geyBpZGVudGlmaWVyOiB7IHZhbHVlOiAndGVzdC5teS1leHRlbnNpb24nIH0gfSBhcyB1bmtub3duIGFzIElFeHRlbnNpb25EZXNjcmlwdGlvbjtcblxuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBjb250cmlidXRlZFNraWxsVXJpLnBhdGgsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFwid3JvbmctbmFtZVwiJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJBIHNraWxsIHdpdGggbWlzbWF0Y2hlZCBuYW1lXCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnU2tpbGwgY29udGVudCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCByZWdpc3RlcmVkID0gc2VydmljZS5yZWdpc3RlckNvbnRyaWJ1dGVkRmlsZShQcm9tcHRzVHlwZS5za2lsbCwgY29udHJpYnV0ZWRTa2lsbFVyaSwgZXh0ZW5zaW9uLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuZmluZEFnZW50U2tpbGxzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCwgJ1Nob3VsZCByZXR1cm4gcmVzdWx0cycpO1xuXG5cdFx0XHRjb25zdCBza2lsbCA9IHJlc3VsdC5maW5kKHMgPT4gcy5uYW1lID09PSAnYWN0dWFsLWZvbGRlcicpO1xuXHRcdFx0YXNzZXJ0Lm9rKHNraWxsLCAnU2hvdWxkIGZpbmQgc2tpbGwgdXNpbmcgZm9sZGVyIG5hbWUgaW5zdGVhZCBvZiBtaXNtYXRjaGVkIG5hbWUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChza2lsbC5kZXNjcmlwdGlvbiwgJ0Egc2tpbGwgd2l0aCBtaXNtYXRjaGVkIG5hbWUnKTtcblxuXHRcdFx0cmVnaXN0ZXJlZC5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdnZXRQcm9tcHRTbGFzaENvbW1hbmRzIC0gc2tpbGxzJywgKCkgPT4ge1xuXHRcdHRlYXJkb3duKCgpID0+IHtcblx0XHRcdHNpbm9uLnJlc3RvcmUoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBpbmNsdWRlIHNraWxscyBmcm9tIHdvcmtzcGFjZSBhcyBzbGFzaCBjb21tYW5kcycsIGFzeW5jICgpID0+IHtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0FHRU5UX1NLSUxMUywgdHJ1ZSk7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlNLSUxMU19MT0NBVElPTl9LRVksIHt9KTtcblxuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlck5hbWUgPSAnc2xhc2gtY29tbWFuZHMtd29ya3NwYWNlLXNraWxscyc7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyID0gYC8ke3Jvb3RGb2xkZXJOYW1lfWA7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUocm9vdEZvbGRlcik7XG5cblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblxuXHRcdFx0Ly8gQ3JlYXRlIHNraWxsIGZpbGVzIGluIHdvcmtzcGFjZVxuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL3NraWxscy93b3Jrc3BhY2Utc2tpbGwvU0tJTEwubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBcIndvcmtzcGFjZS1za2lsbFwiJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJBIHdvcmtzcGFjZSBza2lsbCB0aGF0IHNob3VsZCBhcHBlYXIgYXMgc2xhc2ggY29tbWFuZFwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1dvcmtzcGFjZSBza2lsbCBjb250ZW50Jyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmNsYXVkZS9za2lsbHMvYW5vdGhlci1za2lsbC9TS0lMTC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFwiYW5vdGhlci1za2lsbFwiJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJBbm90aGVyIHNraWxsIGZyb20gd29ya3NwYWNlXCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnQW5vdGhlciBza2lsbCBjb250ZW50Jyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IHNsYXNoQ29tbWFuZHMgPSBhd2FpdCBzZXJ2aWNlLmdldFByb21wdFNsYXNoQ29tbWFuZHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGNvbnN0IHdvcmtzcGFjZVNraWxsQ29tbWFuZCA9IHNsYXNoQ29tbWFuZHMuZmluZChjbWQgPT4gY21kLm5hbWUgPT09ICd3b3Jrc3BhY2Utc2tpbGwnKTtcblx0XHRcdGFzc2VydC5vayh3b3Jrc3BhY2VTa2lsbENvbW1hbmQsICdTaG91bGQgZmluZCB3b3Jrc3BhY2Ugc2tpbGwgYXMgc2xhc2ggY29tbWFuZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtzcGFjZVNraWxsQ29tbWFuZC5kZXNjcmlwdGlvbiwgJ0Egd29ya3NwYWNlIHNraWxsIHRoYXQgc2hvdWxkIGFwcGVhciBhcyBzbGFzaCBjb21tYW5kJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya3NwYWNlU2tpbGxDb21tYW5kLnN0b3JhZ2UsIFByb21wdHNTdG9yYWdlLmxvY2FsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3Jrc3BhY2VTa2lsbENvbW1hbmQudHlwZSwgUHJvbXB0c1R5cGUuc2tpbGwpO1xuXG5cdFx0XHRjb25zdCBhbm90aGVyU2tpbGxDb21tYW5kID0gc2xhc2hDb21tYW5kcy5maW5kKGNtZCA9PiBjbWQubmFtZSA9PT0gJ2Fub3RoZXItc2tpbGwnKTtcblx0XHRcdGFzc2VydC5vayhhbm90aGVyU2tpbGxDb21tYW5kLCAnU2hvdWxkIGZpbmQgYW5vdGhlciBza2lsbCBhcyBzbGFzaCBjb21tYW5kJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYW5vdGhlclNraWxsQ29tbWFuZC5kZXNjcmlwdGlvbiwgJ0Fub3RoZXIgc2tpbGwgZnJvbSB3b3Jrc3BhY2UnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhbm90aGVyU2tpbGxDb21tYW5kLnN0b3JhZ2UsIFByb21wdHNTdG9yYWdlLmxvY2FsKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBkZWR1cGxpY2F0ZSBza2lsbHMgd2l0aCB0aGUgc2FtZSBuYW1lIGZyb20gc3ltbGlua2VkIGxvY2F0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0FHRU5UX1NLSUxMUywgdHJ1ZSk7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlNLSUxMU19MT0NBVElPTl9LRVksIHt9KTtcblxuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlck5hbWUgPSAnc2xhc2gtY29tbWFuZHMtc3ltbGlua2VkLXNraWxscyc7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyID0gYC8ke3Jvb3RGb2xkZXJOYW1lfWA7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUocm9vdEZvbGRlcik7XG5cblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblxuXHRcdFx0Ly8gYG5weCBza2lsbHNgIGluc3RhbGxzIHRvIGB+Ly5hZ2VudHMvc2tpbGxzYCBhbmQgc3ltbGlua3Ncblx0XHRcdC8vIGB+Ly5jbGF1ZGUvc2tpbGxzYCB0byBpdCwgc28gdGhlIHNhbWUgc2tpbGwgaXMgZGlzY292ZXJlZCB1bmRlciB0d29cblx0XHRcdC8vIGRlZmF1bHQgdXNlciBsb2NhdGlvbnMuIFRoZXkgbXVzdCBjb2xsYXBzZSB0byBhIHNpbmdsZSBzbGFzaCBjb21tYW5kLlxuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnL2hvbWUvdXNlci8uYWdlbnRzL3NraWxscy9kZXBsb3kvU0tJTEwubWQnLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBcImRlcGxveVwiJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJEZXBsb3kgc2tpbGxcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdEZXBsb3kgc2tpbGwgY29udGVudCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6ICcvaG9tZS91c2VyLy5jbGF1ZGUvc2tpbGxzL2RlcGxveS9TS0lMTC5tZCcsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFwiZGVwbG95XCInLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkRlcGxveSBza2lsbFwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J0RlcGxveSBza2lsbCBjb250ZW50Jyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IHNsYXNoQ29tbWFuZHMgPSBhd2FpdCBzZXJ2aWNlLmdldFByb21wdFNsYXNoQ29tbWFuZHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGNvbnN0IGRlcGxveUNvbW1hbmRzID0gc2xhc2hDb21tYW5kcy5maWx0ZXIoY21kID0+IGNtZC5uYW1lID09PSAnZGVwbG95Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVwbG95Q29tbWFuZHMubGVuZ3RoLCAxLCAnRHVwbGljYXRlZCBza2lsbCBzaG91bGQgYXBwZWFyIG9ubHkgb25jZSBhcyBhIHNsYXNoIGNvbW1hbmQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBpbmNsdWRlIHNraWxscyBmcm9tIHVzZXIgc3RvcmFnZSBhcyBzbGFzaCBjb21tYW5kcycsIGFzeW5jICgpID0+IHtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0FHRU5UX1NLSUxMUywgdHJ1ZSk7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlNLSUxMU19MT0NBVElPTl9LRVksIHt9KTtcblxuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlck5hbWUgPSAnc2xhc2gtY29tbWFuZHMtdXNlci1za2lsbHMnO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlciA9IGAvJHtyb290Rm9sZGVyTmFtZX1gO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlclVyaSA9IFVSSS5maWxlKHJvb3RGb2xkZXIpO1xuXG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2UodGVzdFdvcmtzcGFjZShyb290Rm9sZGVyVXJpKSk7XG5cblx0XHRcdC8vIENyZWF0ZSBza2lsbCBmaWxlcyBpbiB1c2VyIHN0b3JhZ2UgKHBlcnNvbmFsIHNraWxscylcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogJy9ob21lL3VzZXIvLmNvcGlsb3Qvc2tpbGxzL3BlcnNvbmFsLXNraWxsL1NLSUxMLm1kJyxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogXCJwZXJzb25hbC1za2lsbFwiJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJBIHBlcnNvbmFsIHNraWxsIGZyb20gdXNlciBzdG9yYWdlXCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnUGVyc29uYWwgc2tpbGwgY29udGVudCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6ICcvaG9tZS91c2VyLy5jbGF1ZGUvc2tpbGxzL2NsYXVkZS1wZXJzb25hbC9TS0lMTC5tZCcsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFwiY2xhdWRlLXBlcnNvbmFsXCInLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkEgQ2xhdWRlIHBlcnNvbmFsIHNraWxsXCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnQ2xhdWRlIHBlcnNvbmFsIHNraWxsIGNvbnRlbnQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3Qgc2xhc2hDb21tYW5kcyA9IGF3YWl0IHNlcnZpY2UuZ2V0UHJvbXB0U2xhc2hDb21tYW5kcyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0Y29uc3QgcGVyc29uYWxTa2lsbENvbW1hbmQgPSBzbGFzaENvbW1hbmRzLmZpbmQoY21kID0+IGNtZC5uYW1lID09PSAncGVyc29uYWwtc2tpbGwnKTtcblx0XHRcdGFzc2VydC5vayhwZXJzb25hbFNraWxsQ29tbWFuZCwgJ1Nob3VsZCBmaW5kIHBlcnNvbmFsIHNraWxsIGFzIHNsYXNoIGNvbW1hbmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwZXJzb25hbFNraWxsQ29tbWFuZC5kZXNjcmlwdGlvbiwgJ0EgcGVyc29uYWwgc2tpbGwgZnJvbSB1c2VyIHN0b3JhZ2UnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwZXJzb25hbFNraWxsQ29tbWFuZC5zdG9yYWdlLCBQcm9tcHRzU3RvcmFnZS51c2VyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwZXJzb25hbFNraWxsQ29tbWFuZC50eXBlLCBQcm9tcHRzVHlwZS5za2lsbCk7XG5cblx0XHRcdGNvbnN0IGNsYXVkZVBlcnNvbmFsQ29tbWFuZCA9IHNsYXNoQ29tbWFuZHMuZmluZChjbWQgPT4gY21kLm5hbWUgPT09ICdjbGF1ZGUtcGVyc29uYWwnKTtcblx0XHRcdGFzc2VydC5vayhjbGF1ZGVQZXJzb25hbENvbW1hbmQsICdTaG91bGQgZmluZCBDbGF1ZGUgcGVyc29uYWwgc2tpbGwgYXMgc2xhc2ggY29tbWFuZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsYXVkZVBlcnNvbmFsQ29tbWFuZC5kZXNjcmlwdGlvbiwgJ0EgQ2xhdWRlIHBlcnNvbmFsIHNraWxsJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xhdWRlUGVyc29uYWxDb21tYW5kLnN0b3JhZ2UsIFByb21wdHNTdG9yYWdlLnVzZXIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGluY2x1ZGUgc2tpbGxzIGZyb20gZXh0ZW5zaW9uIHByb3ZpZGVycyBhcyBzbGFzaCBjb21tYW5kcycsIGFzeW5jICgpID0+IHtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0FHRU5UX1NLSUxMUywgdHJ1ZSk7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlNLSUxMU19MT0NBVElPTl9LRVksIHt9KTtcblxuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlck5hbWUgPSAnc2xhc2gtY29tbWFuZHMtcHJvdmlkZXItc2tpbGxzJztcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZShyb290Rm9sZGVyKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHRjb25zdCBwcm92aWRlclNraWxsVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vZXh0ZW5zaW9ucy9teS1leHRlbnNpb24vcHJvdmlkZXItc2tpbGwvU0tJTEwubWQnKTtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IHtcblx0XHRcdFx0aWRlbnRpZmllcjogeyB2YWx1ZTogJ3Rlc3QubXktZXh0ZW5zaW9uJyB9LFxuXHRcdFx0XHRlbmFibGVkQXBpUHJvcG9zYWxzOiBbJ2NoYXRQYXJ0aWNpcGFudFByaXZhdGUnXVxuXHRcdFx0fSBhcyB1bmtub3duIGFzIElFeHRlbnNpb25EZXNjcmlwdGlvbjtcblxuXHRcdFx0Ly8gTW9jayB0aGUgc2tpbGwgZmlsZSBjb250ZW50XG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IHByb3ZpZGVyU2tpbGxVcmkucGF0aCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogXCJwcm92aWRlci1za2lsbFwiJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJBIHNraWxsIGZyb20gZXh0ZW5zaW9uIHByb3ZpZGVyXCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnUHJvdmlkZXIgc2tpbGwgY29udGVudCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBwcm92aWRlciA9IHtcblx0XHRcdFx0cHJvdmlkZVByb21wdEZpbGVzOiBhc3luYyAoX2NvbnRleHQ6IElQcm9tcHRGaWxlQ29udGV4dCwgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4ge1xuXHRcdFx0XHRcdHJldHVybiBbeyB1cmk6IHByb3ZpZGVyU2tpbGxVcmkgfV07XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlZ2lzdGVyZWQgPSBzZXJ2aWNlLnJlZ2lzdGVyUHJvbXB0RmlsZVByb3ZpZGVyKGV4dGVuc2lvbiwgUHJvbXB0c1R5cGUuc2tpbGwsIHByb3ZpZGVyKTtcblxuXHRcdFx0Y29uc3Qgc2xhc2hDb21tYW5kcyA9IGF3YWl0IHNlcnZpY2UuZ2V0UHJvbXB0U2xhc2hDb21tYW5kcyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0Y29uc3QgcHJvdmlkZXJTa2lsbENvbW1hbmQgPSBzbGFzaENvbW1hbmRzLmZpbmQoY21kID0+IGNtZC5uYW1lID09PSAncHJvdmlkZXItc2tpbGwnKTtcblx0XHRcdGFzc2VydC5vayhwcm92aWRlclNraWxsQ29tbWFuZCwgJ1Nob3VsZCBmaW5kIHByb3ZpZGVyIHNraWxsIGFzIHNsYXNoIGNvbW1hbmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlclNraWxsQ29tbWFuZC5kZXNjcmlwdGlvbiwgJ0Egc2tpbGwgZnJvbSBleHRlbnNpb24gcHJvdmlkZXInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlclNraWxsQ29tbWFuZC5zdG9yYWdlLCBQcm9tcHRzU3RvcmFnZS5leHRlbnNpb24pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyU2tpbGxDb21tYW5kLnR5cGUsIFByb21wdHNUeXBlLnNraWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlclNraWxsQ29tbWFuZC5zb3VyY2UsIFByb21wdEZpbGVTb3VyY2UuRXh0ZW5zaW9uQVBJKTtcblxuXHRcdFx0cmVnaXN0ZXJlZC5kaXNwb3NlKCk7XG5cblx0XHRcdC8vIEFmdGVyIGRpc3Bvc2FsLCB0aGUgcHJvdmlkZXIgc2tpbGwgc2hvdWxkIG5vIGxvbmdlciBhcHBlYXJcblx0XHRcdGNvbnN0IHNsYXNoQ29tbWFuZHNBZnRlckRpc3Bvc2UgPSBhd2FpdCBzZXJ2aWNlLmdldFByb21wdFNsYXNoQ29tbWFuZHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRjb25zdCBmb3VuZEFmdGVyRGlzcG9zZSA9IHNsYXNoQ29tbWFuZHNBZnRlckRpc3Bvc2UuZmluZChjbWQgPT4gY21kLm5hbWUgPT09ICdwcm92aWRlci1za2lsbCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvdW5kQWZ0ZXJEaXNwb3NlLCB1bmRlZmluZWQsICdTaG91bGQgbm90IGZpbmQgcHJvdmlkZXIgc2tpbGwgYWZ0ZXIgZGlzcG9zYWwnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBpbmNsdWRlIHNraWxscyBmcm9tIGV4dGVuc2lvbiBjb250cmlidXRpb25zIGFzIHNsYXNoIGNvbW1hbmRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQUdFTlRfU0tJTExTLCB0cnVlKTtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuU0tJTExTX0xPQ0FUSU9OX0tFWSwge30pO1xuXG5cdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICdzbGFzaC1jb21tYW5kcy1jb250cmlidXRlZC1za2lsbHMnO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlciA9IGAvJHtyb290Rm9sZGVyTmFtZX1gO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlclVyaSA9IFVSSS5maWxlKHJvb3RGb2xkZXIpO1xuXG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2UodGVzdFdvcmtzcGFjZShyb290Rm9sZGVyVXJpKSk7XG5cblx0XHRcdGNvbnN0IGNvbnRyaWJ1dGVkU2tpbGxVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly9leHRlbnNpb25zL215LWV4dGVuc2lvbi9jb250cmlidXRlZC1za2lsbC9TS0lMTC5tZCcpO1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0ge1xuXHRcdFx0XHRpZGVudGlmaWVyOiB7IHZhbHVlOiAndGVzdC5teS1leHRlbnNpb24nIH1cblx0XHRcdH0gYXMgdW5rbm93biBhcyBJRXh0ZW5zaW9uRGVzY3JpcHRpb247XG5cblx0XHRcdC8vIE1vY2sgdGhlIHNraWxsIGZpbGUgY29udGVudFxuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBjb250cmlidXRlZFNraWxsVXJpLnBhdGgsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFwiY29udHJpYnV0ZWQtc2tpbGxcIicsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiQSBza2lsbCBmcm9tIGV4dGVuc2lvbiBjb250cmlidXRpb25cIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdDb250cmlidXRlZCBza2lsbCBjb250ZW50Jyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IHJlZ2lzdGVyZWQgPSBzZXJ2aWNlLnJlZ2lzdGVyQ29udHJpYnV0ZWRGaWxlKFxuXHRcdFx0XHRQcm9tcHRzVHlwZS5za2lsbCxcblx0XHRcdFx0Y29udHJpYnV0ZWRTa2lsbFVyaSxcblx0XHRcdFx0ZXh0ZW5zaW9uLFxuXHRcdFx0XHQnY29udHJpYnV0ZWQtc2tpbGwnLFxuXHRcdFx0XHQnQSBza2lsbCBmcm9tIGV4dGVuc2lvbiBjb250cmlidXRpb24nXG5cdFx0XHQpO1xuXG5cdFx0XHRjb25zdCBzbGFzaENvbW1hbmRzID0gYXdhaXQgc2VydmljZS5nZXRQcm9tcHRTbGFzaENvbW1hbmRzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRjb25zdCBjb250cmlidXRlZFNraWxsQ29tbWFuZCA9IHNsYXNoQ29tbWFuZHMuZmluZChjbWQgPT4gY21kLm5hbWUgPT09ICdjb250cmlidXRlZC1za2lsbCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNvbnRyaWJ1dGVkU2tpbGxDb21tYW5kLCAnU2hvdWxkIGZpbmQgY29udHJpYnV0ZWQgc2tpbGwgYXMgc2xhc2ggY29tbWFuZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyaWJ1dGVkU2tpbGxDb21tYW5kLmRlc2NyaXB0aW9uLCAnQSBza2lsbCBmcm9tIGV4dGVuc2lvbiBjb250cmlidXRpb24nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250cmlidXRlZFNraWxsQ29tbWFuZC5zdG9yYWdlLCBQcm9tcHRzU3RvcmFnZS5leHRlbnNpb24pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyaWJ1dGVkU2tpbGxDb21tYW5kLnR5cGUsIFByb21wdHNUeXBlLnNraWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250cmlidXRlZFNraWxsQ29tbWFuZC5zb3VyY2UsIFByb21wdEZpbGVTb3VyY2UuRXh0ZW5zaW9uQ29udHJpYnV0aW9uKTtcblxuXHRcdFx0cmVnaXN0ZXJlZC5kaXNwb3NlKCk7XG5cblx0XHRcdC8vIEFmdGVyIGRpc3Bvc2FsLCB0aGUgY29udHJpYnV0ZWQgc2tpbGwgc2hvdWxkIG5vIGxvbmdlciBhcHBlYXJcblx0XHRcdGNvbnN0IHNsYXNoQ29tbWFuZHNBZnRlckRpc3Bvc2UgPSBhd2FpdCBzZXJ2aWNlLmdldFByb21wdFNsYXNoQ29tbWFuZHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRjb25zdCBmb3VuZEFmdGVyRGlzcG9zZSA9IHNsYXNoQ29tbWFuZHNBZnRlckRpc3Bvc2UuZmluZChjbWQgPT4gY21kLm5hbWUgPT09ICdjb250cmlidXRlZC1za2lsbCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvdW5kQWZ0ZXJEaXNwb3NlLCB1bmRlZmluZWQsICdTaG91bGQgbm90IGZpbmQgY29udHJpYnV0ZWQgc2tpbGwgYWZ0ZXIgZGlzcG9zYWwnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBjb21iaW5lIHByb21wdCBmaWxlcyBhbmQgc2tpbGxzIGFzIHNsYXNoIGNvbW1hbmRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQUdFTlRfU0tJTExTLCB0cnVlKTtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuU0tJTExTX0xPQ0FUSU9OX0tFWSwge30pO1xuXG5cdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICdzbGFzaC1jb21tYW5kcy1jb21iaW5lZCc7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyID0gYC8ke3Jvb3RGb2xkZXJOYW1lfWA7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUocm9vdEZvbGRlcik7XG5cblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblxuXHRcdFx0Ly8gQ3JlYXRlIGJvdGggcHJvbXB0IGZpbGVzIGFuZCBza2lsbCBmaWxlc1xuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL3Byb21wdHMvbXktcHJvbXB0LnByb21wdC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFwibXktcHJvbXB0XCInLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkEgcmVndWxhciBwcm9tcHQgZmlsZVwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1Byb21wdCBjb250ZW50Jyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9za2lsbHMvbXktc2tpbGwvU0tJTEwubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBcIm15LXNraWxsXCInLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkEgc2tpbGwgZmlsZVwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1NraWxsIGNvbnRlbnQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3Qgc2xhc2hDb21tYW5kcyA9IGF3YWl0IHNlcnZpY2UuZ2V0UHJvbXB0U2xhc2hDb21tYW5kcyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0Y29uc3QgcHJvbXB0Q29tbWFuZCA9IHNsYXNoQ29tbWFuZHMuZmluZChjbWQgPT4gY21kLm5hbWUgPT09ICdteS1wcm9tcHQnKTtcblx0XHRcdGFzc2VydC5vayhwcm9tcHRDb21tYW5kLCAnU2hvdWxkIGZpbmQgcHJvbXB0IGZpbGUgYXMgc2xhc2ggY29tbWFuZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb21wdENvbW1hbmQudHlwZSwgUHJvbXB0c1R5cGUucHJvbXB0KTtcblxuXHRcdFx0Y29uc3Qgc2tpbGxDb21tYW5kID0gc2xhc2hDb21tYW5kcy5maW5kKGNtZCA9PiBjbWQubmFtZSA9PT0gJ215LXNraWxsJyk7XG5cdFx0XHRhc3NlcnQub2soc2tpbGxDb21tYW5kLCAnU2hvdWxkIGZpbmQgc2tpbGwgZmlsZSBhcyBzbGFzaCBjb21tYW5kJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2tpbGxDb21tYW5kLnR5cGUsIFByb21wdHNUeXBlLnNraWxsKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBmaXJlIGNoYW5nZSBldmVudCB3aGVuIHByb3ZpZGVyIHJlZ2lzdGVycy91bnJlZ2lzdGVycycsIGFzeW5jICgpID0+IHtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0FHRU5UX1NLSUxMUywgdHJ1ZSk7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlNLSUxMU19MT0NBVElPTl9LRVksIHt9KTtcblxuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlck5hbWUgPSAnc2xhc2gtY29tbWFuZHMtY2FjaGUtaW52YWxpZGF0aW9uJztcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZShyb290Rm9sZGVyKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHRjb25zdCBwcm92aWRlclNraWxsVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vZXh0ZW5zaW9ucy9teS1leHRlbnNpb24vdGVzdC1za2lsbC9TS0lMTC5tZCcpO1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0ge1xuXHRcdFx0XHRpZGVudGlmaWVyOiB7IHZhbHVlOiAndGVzdC5teS1leHRlbnNpb24nIH0sXG5cdFx0XHRcdGVuYWJsZWRBcGlQcm9wb3NhbHM6IFsnY2hhdFBhcnRpY2lwYW50UHJpdmF0ZSddXG5cdFx0XHR9IGFzIHVua25vd24gYXMgSUV4dGVuc2lvbkRlc2NyaXB0aW9uO1xuXG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IHByb3ZpZGVyU2tpbGxVcmkucGF0aCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogXCJ0ZXN0LXNraWxsXCInLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3Qgc2tpbGxcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdUZXN0IHNraWxsIGNvbnRlbnQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0bGV0IGNoYW5nZUV2ZW50Q291bnQgPSAwO1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IHNlcnZpY2Uub25EaWRDaGFuZ2VTbGFzaENvbW1hbmRzKCgpID0+IHtcblx0XHRcdFx0Y2hhbmdlRXZlbnRDb3VudCsrO1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHByb3ZpZGVyID0ge1xuXHRcdFx0XHRwcm92aWRlUHJvbXB0RmlsZXM6IGFzeW5jIChfY29udGV4dDogSVByb21wdEZpbGVDb250ZXh0LCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIFt7IHVyaTogcHJvdmlkZXJTa2lsbFVyaSB9XTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0Ly8gUmVnaXN0ZXIgcHJvdmlkZXIgc2hvdWxkIHRyaWdnZXIgY2hhbmdlXG5cdFx0XHRjb25zdCByZWdpc3RlcmVkID0gc2VydmljZS5yZWdpc3RlclByb21wdEZpbGVQcm92aWRlcihleHRlbnNpb24sIFByb21wdHNUeXBlLnNraWxsLCBwcm92aWRlcik7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTAwKSk7XG5cblx0XHRcdGNvbnN0IGNvbW1hbmRzV2l0aFByb3ZpZGVyID0gYXdhaXQgc2VydmljZS5nZXRQcm9tcHRTbGFzaENvbW1hbmRzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0Y29uc3Qgc2tpbGxDb21tYW5kID0gY29tbWFuZHNXaXRoUHJvdmlkZXIuZmluZChjbWQgPT4gY21kLm5hbWUgPT09ICd0ZXN0LXNraWxsJyk7XG5cdFx0XHRhc3NlcnQub2soc2tpbGxDb21tYW5kLCAnU2hvdWxkIGZpbmQgc2tpbGwgZnJvbSBwcm92aWRlcicpO1xuXG5cdFx0XHQvLyBEaXNwb3NlIHByb3ZpZGVyIHNob3VsZCB0cmlnZ2VyIGNoYW5nZVxuXHRcdFx0cmVnaXN0ZXJlZC5kaXNwb3NlKCk7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTAwKSk7XG5cblx0XHRcdGNvbnN0IGNvbW1hbmRzQWZ0ZXJEaXNwb3NlID0gYXdhaXQgc2VydmljZS5nZXRQcm9tcHRTbGFzaENvbW1hbmRzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0Y29uc3Qgc2tpbGxBZnRlckRpc3Bvc2UgPSBjb21tYW5kc0FmdGVyRGlzcG9zZS5maW5kKGNtZCA9PiBjbWQubmFtZSA9PT0gJ3Rlc3Qtc2tpbGwnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChza2lsbEFmdGVyRGlzcG9zZSwgdW5kZWZpbmVkLCAnU2hvdWxkIG5vdCBmaW5kIHNraWxsIGFmdGVyIHByb3ZpZGVyIGRpc3Bvc2FsJyk7XG5cblx0XHRcdGFzc2VydC5vayhjaGFuZ2VFdmVudENvdW50ID49IDIsICdDaGFuZ2UgZXZlbnQgc2hvdWxkIGZpcmUgd2hlbiBwcm92aWRlciByZWdpc3RlcnMgYW5kIHVucmVnaXN0ZXJzJyk7XG5cblx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cblx0XHR0ZXN0KCdzaG91bGQgdXNlIGZpbGVuYW1lIGFzIGZhbGxiYWNrIGZvciBza2lsbHMgd2l0aCBtaXNzaW5nIG5hbWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9BR0VOVF9TS0lMTFMsIHRydWUpO1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5TS0lMTFNfTE9DQVRJT05fS0VZLCB7fSk7XG5cblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJOYW1lID0gJ3NsYXNoLWNvbW1hbmRzLWZhbGxiYWNrLW5hbWUnO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlciA9IGAvJHtyb290Rm9sZGVyTmFtZX1gO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlclVyaSA9IFVSSS5maWxlKHJvb3RGb2xkZXIpO1xuXG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2UodGVzdFdvcmtzcGFjZShyb290Rm9sZGVyVXJpKSk7XG5cblx0XHRcdC8vIENyZWF0ZSBza2lsbCB3aXRob3V0IG5hbWUgYXR0cmlidXRlIGJ1dCB3aXRoIGRlc2NyaXB0aW9uXG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvc2tpbGxzL25vLW5hbWUvU0tJTEwubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJTa2lsbCB3aXRob3V0IG5hbWVcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdTa2lsbCBjb250ZW50Jyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9za2lsbHMvdmFsaWQtc2tpbGwvU0tJTEwubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBcInZhbGlkLXNraWxsXCInLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkEgdmFsaWQgc2tpbGxcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdWYWxpZCBza2lsbCBjb250ZW50Jyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IHNsYXNoQ29tbWFuZHMgPSBhd2FpdCBzZXJ2aWNlLmdldFByb21wdFNsYXNoQ29tbWFuZHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdC8vIFNob3VsZCBpbmNsdWRlIHNraWxsIHdpdGggZmFsbGJhY2sgbmFtZSBmcm9tIGZvbGRlciBuYW1lXG5cdFx0XHRjb25zdCBmYWxsYmFja05hbWVDb21tYW5kID0gc2xhc2hDb21tYW5kcy5maW5kKGNtZCA9PiBjbWQubmFtZSA9PT0gJ25vLW5hbWUnKTtcblx0XHRcdGFzc2VydC5vayhmYWxsYmFja05hbWVDb21tYW5kLCAnU2hvdWxkIGZpbmQgc2tpbGwgd2l0aCBmYWxsYmFjayBuYW1lIGZyb20gZm9sZGVyIG5hbWUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmYWxsYmFja05hbWVDb21tYW5kLmRlc2NyaXB0aW9uLCAnU2tpbGwgd2l0aG91dCBuYW1lJyk7XG5cblx0XHRcdC8vIFNob3VsZCBpbmNsdWRlIHZhbGlkIHNraWxsXG5cdFx0XHRjb25zdCB2YWxpZFNraWxsQ29tbWFuZCA9IHNsYXNoQ29tbWFuZHMuZmluZChjbWQgPT4gY21kLm5hbWUgPT09ICd2YWxpZC1za2lsbCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKHZhbGlkU2tpbGxDb21tYW5kLCAnU2hvdWxkIGZpbmQgdmFsaWQgc2tpbGwnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB1c2UgZm9sZGVyIG5hbWUgYXMgc2xhc2ggY29tbWFuZCBuYW1lIHdoZW4gZnJvbnRtYXR0ZXIgbmFtZSBkaWZmZXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQUdFTlRfU0tJTExTLCB0cnVlKTtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuU0tJTExTX0xPQ0FUSU9OX0tFWSwge30pO1xuXG5cdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICdzbGFzaC1jb21tYW5kcy1mb2xkZXItbmFtZS1vdmVycmlkZSc7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyID0gYC8ke3Jvb3RGb2xkZXJOYW1lfWA7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUocm9vdEZvbGRlcik7XG5cblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblxuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL3NraWxscy90ZXN0L1NLSUxMLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogXCJmb29cIicsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiQSBza2lsbCB3aXRoIG1pc21hdGNoZWQgZnJvbnRtYXR0ZXIgbmFtZVwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J3NheSBoaXlhIScsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBzbGFzaENvbW1hbmRzID0gYXdhaXQgc2VydmljZS5nZXRQcm9tcHRTbGFzaENvbW1hbmRzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRjb25zdCBmb2xkZXJOYW1lQ29tbWFuZCA9IHNsYXNoQ29tbWFuZHMuZmluZChjbWQgPT4gY21kLm5hbWUgPT09ICd0ZXN0Jyk7XG5cdFx0XHRhc3NlcnQub2soZm9sZGVyTmFtZUNvbW1hbmQsICdTaG91bGQgZmluZCBza2lsbCB1c2luZyBmb2xkZXIgbmFtZSBhcyBzbGFzaCBjb21tYW5kIG5hbWUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb2xkZXJOYW1lQ29tbWFuZC5kZXNjcmlwdGlvbiwgJ0Egc2tpbGwgd2l0aCBtaXNtYXRjaGVkIGZyb250bWF0dGVyIG5hbWUnKTtcblxuXHRcdFx0Y29uc3QgZnJvbnRtYXR0ZXJOYW1lQ29tbWFuZCA9IHNsYXNoQ29tbWFuZHMuZmluZChjbWQgPT4gY21kLm5hbWUgPT09ICdmb28nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmcm9udG1hdHRlck5hbWVDb21tYW5kLCB1bmRlZmluZWQsICdTaG91bGQgbm90IGZpbmQgc2tpbGwgdXNpbmcgZnJvbnRtYXR0ZXIgbmFtZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBkdXBsaWNhdGUgc2xhc2ggY29tbWFuZHMgd2l0aCBzYW1lIG5hbWUgZnJvbSBkaWZmZXJlbnQgdHlwZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9BR0VOVF9TS0lMTFMsIHRydWUpO1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5TS0lMTFNfTE9DQVRJT05fS0VZLCB7fSk7XG5cblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJOYW1lID0gJ3NsYXNoLWNvbW1hbmRzLW5vLWR1cGxpY2F0ZXMnO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlciA9IGAvJHtyb290Rm9sZGVyTmFtZX1gO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlclVyaSA9IFVSSS5maWxlKHJvb3RGb2xkZXIpO1xuXG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2UodGVzdFdvcmtzcGFjZShyb290Rm9sZGVyVXJpKSk7XG5cblx0XHRcdC8vIENyZWF0ZSBwcm9tcHQgYW5kIHNraWxsIHdpdGggc2FtZSBuYW1lXG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvcHJvbXB0cy9kdXBsaWNhdGUtbmFtZS5wcm9tcHQubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBcImR1cGxpY2F0ZS1uYW1lXCInLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkEgcHJvbXB0IGZpbGVcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdQcm9tcHQgY29udGVudCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvc2tpbGxzL2R1cGxpY2F0ZS1uYW1lL1NLSUxMLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogXCJkdXBsaWNhdGUtbmFtZVwiJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJBIHNraWxsIGZpbGVcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdTa2lsbCBjb250ZW50Jyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IHNsYXNoQ29tbWFuZHMgPSBhd2FpdCBzZXJ2aWNlLmdldFByb21wdFNsYXNoQ29tbWFuZHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGNvbnN0IGR1cGxpY2F0ZUNvbW1hbmRzID0gc2xhc2hDb21tYW5kcy5maWx0ZXIoY21kID0+IGNtZC5uYW1lID09PSAnZHVwbGljYXRlLW5hbWUnKTtcblx0XHRcdC8vIEJvdGggc2hvdWxkIGJlIHByZXNlbnQgLSB0aGUgZnVuY3Rpb24gcmV0dXJucyBhbGwgc2xhc2ggY29tbWFuZHMgd2l0aG91dCBkZWR1cGxpY2F0aW9uXG5cdFx0XHQvLyBUaGlzIGFsbG93cyB0aGUgY2FsbGVyIHRvIGhhbmRsZSBuYW1lIGNvbmZsaWN0cyAoZS5nLiwgcHJvbXB0IHRha2VzIHByZWNlZGVuY2Ugb3ZlciBza2lsbClcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkdXBsaWNhdGVDb21tYW5kcy5sZW5ndGgsIDIsICdTaG91bGQgcmV0dXJuIGJvdGggcHJvbXB0IGFuZCBza2lsbCB3aXRoIHNhbWUgbmFtZScpO1xuXG5cdFx0XHRjb25zdCBwcm9tcHRDb21tYW5kID0gZHVwbGljYXRlQ29tbWFuZHMuZmluZChjbWQgPT4gY21kLnR5cGUgPT09IFByb21wdHNUeXBlLnByb21wdCk7XG5cdFx0XHRhc3NlcnQub2socHJvbXB0Q29tbWFuZCwgJ1Nob3VsZCBmaW5kIHByb21wdCBjb21tYW5kJyk7XG5cblx0XHRcdGNvbnN0IHNraWxsQ29tbWFuZCA9IGR1cGxpY2F0ZUNvbW1hbmRzLmZpbmQoY21kID0+IGNtZC50eXBlID09PSBQcm9tcHRzVHlwZS5za2lsbCk7XG5cdFx0XHRhc3NlcnQub2soc2tpbGxDb21tYW5kLCAnU2hvdWxkIGZpbmQgc2tpbGwgY29tbWFuZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJlc3BlY3Qgc2tpbGwgZGlzYWJsZSBjb25maWd1cmF0aW9uIChVU0VfQUdFTlRfU0tJTExTKScsIGFzeW5jICgpID0+IHtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0FHRU5UX1NLSUxMUywgZmFsc2UpO1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5TS0lMTFNfTE9DQVRJT05fS0VZLCB7fSk7XG5cblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJOYW1lID0gJ3NsYXNoLWNvbW1hbmRzLXNraWxscy1kaXNhYmxlZCc7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyID0gYC8ke3Jvb3RGb2xkZXJOYW1lfWA7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUocm9vdEZvbGRlcik7XG5cblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblxuXHRcdFx0Ly8gQ3JlYXRlIGJvdGggcHJvbXB0IGFuZCBza2lsbFxuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL3Byb21wdHMvbXktcHJvbXB0LnByb21wdC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFwibXktcHJvbXB0XCInLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkEgcHJvbXB0XCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnUHJvbXB0IGNvbnRlbnQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL3NraWxscy9teS1za2lsbC9TS0lMTC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFwibXktc2tpbGxcIicsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiQSBza2lsbFwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1NraWxsIGNvbnRlbnQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3Qgc2xhc2hDb21tYW5kcyA9IGF3YWl0IHNlcnZpY2UuZ2V0UHJvbXB0U2xhc2hDb21tYW5kcyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0Y29uc3QgcHJvbXB0Q29tbWFuZCA9IHNsYXNoQ29tbWFuZHMuZmluZChjbWQgPT4gY21kLm5hbWUgPT09ICdteS1wcm9tcHQnKTtcblx0XHRcdGFzc2VydC5vayhwcm9tcHRDb21tYW5kLCAnU2hvdWxkIGZpbmQgcHJvbXB0IGNvbW1hbmQgZXZlbiB3aGVuIHNraWxscyBhcmUgZGlzYWJsZWQnKTtcblxuXHRcdFx0Y29uc3Qgc2tpbGxDb21tYW5kID0gc2xhc2hDb21tYW5kcy5maW5kKGNtZCA9PiBjbWQubmFtZSA9PT0gJ215LXNraWxsJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2tpbGxDb21tYW5kLCB1bmRlZmluZWQsICdTaG91bGQgbm90IGZpbmQgc2tpbGwgY29tbWFuZCB3aGVuIHNraWxscyBhcmUgZGlzYWJsZWQnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2dldFByb21wdFNsYXNoQ29tbWFuZHMgLSB1c2VySW52b2NhYmxlIGZpbHRlcmluZycsICgpID0+IHtcblx0XHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0XHRzaW5vbi5yZXN0b3JlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIGNvcnJlY3QgdXNlckludm9jYWJsZSB2YWx1ZSBmb3Igc2tpbGxzIHdpdGggdXNlci1pbnZvY2FibGU6IGZhbHNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQUdFTlRfU0tJTExTLCB0cnVlKTtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuU0tJTExTX0xPQ0FUSU9OX0tFWSwge30pO1xuXG5cdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICd1c2VyLWludm9jYWJsZS1mYWxzZSc7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyID0gYC8ke3Jvb3RGb2xkZXJOYW1lfWA7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUocm9vdEZvbGRlcik7XG5cblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblxuXHRcdFx0Ly8gQ3JlYXRlIGEgc2tpbGwgd2l0aCB1c2VyLWludm9jYWJsZTogZmFsc2UgKHNob3VsZCBiZSBoaWRkZW4gZnJvbSAvIG1lbnUpXG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvc2tpbGxzL2hpZGRlbi1za2lsbC9TS0lMTC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFwiaGlkZGVuLXNraWxsXCInLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkEgc2tpbGwgaGlkZGVuIGZyb20gdGhlIC8gbWVudVwiJyxcblx0XHRcdFx0XHRcdCd1c2VyLWludm9jYWJsZTogZmFsc2UnLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnSGlkZGVuIHNraWxsIGNvbnRlbnQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3Qgc2xhc2hDb21tYW5kcyA9IGF3YWl0IHNlcnZpY2UuZ2V0UHJvbXB0U2xhc2hDb21tYW5kcyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0Y29uc3QgaGlkZGVuU2tpbGxDb21tYW5kID0gc2xhc2hDb21tYW5kcy5maW5kKGNtZCA9PiBjbWQubmFtZSA9PT0gJ2hpZGRlbi1za2lsbCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKGhpZGRlblNraWxsQ29tbWFuZCwgJ1Nob3VsZCBmaW5kIGhpZGRlbiBza2lsbCBpbiBzbGFzaCBjb21tYW5kcycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhpZGRlblNraWxsQ29tbWFuZC51c2VySW52b2NhYmxlLCBmYWxzZSxcblx0XHRcdFx0J1Nob3VsZCBoYXZlIHVzZXJJbnZvY2FibGU9ZmFsc2UgaW4gcGFyc2VkIGhlYWRlcicpO1xuXG5cdFx0XHQvLyBWZXJpZnkgdGhlIGZpbHRlcmluZyBsb2dpYyB3b3VsZCBjb3JyZWN0bHkgZXhjbHVkZSB0aGlzIHNraWxsXG5cdFx0XHRjb25zdCBmaWx0ZXJlZENvbW1hbmRzID0gc2xhc2hDb21tYW5kcy5maWx0ZXIoYyA9PiBjLnVzZXJJbnZvY2FibGUpO1xuXHRcdFx0Y29uc3QgaGlkZGVuU2tpbGxJbkZpbHRlcmVkID0gZmlsdGVyZWRDb21tYW5kcy5maW5kKGNtZCA9PiBjbWQubmFtZSA9PT0gJ2hpZGRlbi1za2lsbCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhpZGRlblNraWxsSW5GaWx0ZXJlZCwgdW5kZWZpbmVkLFxuXHRcdFx0XHQnSGlkZGVuIHNraWxsIHNob3VsZCBiZSBmaWx0ZXJlZCBvdXQgd2hlbiBhcHBseWluZyB1c2VySW52b2NhYmxlIGZpbHRlcicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiBjb3JyZWN0IHVzZXJJbnZvY2FibGUgdmFsdWUgZm9yIHNraWxscyB3aXRoIHVzZXItaW52b2NhYmxlOiB0cnVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQUdFTlRfU0tJTExTLCB0cnVlKTtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuU0tJTExTX0xPQ0FUSU9OX0tFWSwge30pO1xuXG5cdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICd1c2VyLWludm9jYWJsZS10cnVlJztcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZShyb290Rm9sZGVyKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHQvLyBDcmVhdGUgYSBza2lsbCB3aXRoIGV4cGxpY2l0IHVzZXItaW52b2NhYmxlOiB0cnVlXG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvc2tpbGxzL3Zpc2libGUtc2tpbGwvU0tJTEwubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBcInZpc2libGUtc2tpbGxcIicsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiQSBza2lsbCB2aXNpYmxlIGluIHRoZSAvIG1lbnVcIicsXG5cdFx0XHRcdFx0XHQndXNlci1pbnZvY2FibGU6IHRydWUnLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnVmlzaWJsZSBza2lsbCBjb250ZW50Jyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IHNsYXNoQ29tbWFuZHMgPSBhd2FpdCBzZXJ2aWNlLmdldFByb21wdFNsYXNoQ29tbWFuZHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGNvbnN0IHZpc2libGVTa2lsbENvbW1hbmQgPSBzbGFzaENvbW1hbmRzLmZpbmQoY21kID0+IGNtZC5uYW1lID09PSAndmlzaWJsZS1za2lsbCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKHZpc2libGVTa2lsbENvbW1hbmQsICdTaG91bGQgZmluZCB2aXNpYmxlIHNraWxsIGluIHNsYXNoIGNvbW1hbmRzJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlzaWJsZVNraWxsQ29tbWFuZC51c2VySW52b2NhYmxlLCB0cnVlLFxuXHRcdFx0XHQnU2hvdWxkIGhhdmUgdXNlckludm9jYWJsZT10cnVlIGluIHBhcnNlZCBoZWFkZXInKTtcblxuXHRcdFx0Ly8gVmVyaWZ5IHRoZSBmaWx0ZXJpbmcgbG9naWMgd291bGQgY29ycmVjdGx5IGluY2x1ZGUgdGhpcyBza2lsbFxuXHRcdFx0Y29uc3QgZmlsdGVyZWRDb21tYW5kcyA9IHNsYXNoQ29tbWFuZHMuZmlsdGVyKGMgPT4gYy51c2VySW52b2NhYmxlKTtcblx0XHRcdGNvbnN0IHZpc2libGVTa2lsbEluRmlsdGVyZWQgPSBmaWx0ZXJlZENvbW1hbmRzLmZpbmQoY21kID0+IGNtZC5uYW1lID09PSAndmlzaWJsZS1za2lsbCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKHZpc2libGVTa2lsbEluRmlsdGVyZWQsXG5cdFx0XHRcdCdWaXNpYmxlIHNraWxsIHNob3VsZCBiZSBpbmNsdWRlZCB3aGVuIGFwcGx5aW5nIHVzZXJJbnZvY2FibGUgZmlsdGVyJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZGVmYXVsdCB0byB0cnVlIGZvciBza2lsbHMgd2l0aG91dCB1c2VyLWludm9jYWJsZSBhdHRyaWJ1dGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9BR0VOVF9TS0lMTFMsIHRydWUpO1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5TS0lMTFNfTE9DQVRJT05fS0VZLCB7fSk7XG5cblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJOYW1lID0gJ3VzZXItaW52b2NhYmxlLXVuZGVmaW5lZCc7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyID0gYC8ke3Jvb3RGb2xkZXJOYW1lfWA7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUocm9vdEZvbGRlcik7XG5cblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblxuXHRcdFx0Ly8gQ3JlYXRlIGEgc2tpbGwgd2l0aG91dCB1c2VyLWludm9jYWJsZSBhdHRyaWJ1dGUgKHNob3VsZCBkZWZhdWx0IHRvIHRydWUpXG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IGAke3Jvb3RGb2xkZXJ9Ly5naXRodWIvc2tpbGxzL2RlZmF1bHQtc2tpbGwvU0tJTEwubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBcImRlZmF1bHQtc2tpbGxcIicsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiQSBza2lsbCB3aXRob3V0IGV4cGxpY2l0IHVzZXItaW52b2NhYmxlXCInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnRGVmYXVsdCBza2lsbCBjb250ZW50Jyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IHNsYXNoQ29tbWFuZHMgPSBhd2FpdCBzZXJ2aWNlLmdldFByb21wdFNsYXNoQ29tbWFuZHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGNvbnN0IGRlZmF1bHRTa2lsbENvbW1hbmQgPSBzbGFzaENvbW1hbmRzLmZpbmQoY21kID0+IGNtZC5uYW1lID09PSAnZGVmYXVsdC1za2lsbCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKGRlZmF1bHRTa2lsbENvbW1hbmQsICdTaG91bGQgZmluZCBkZWZhdWx0IHNraWxsIGluIHNsYXNoIGNvbW1hbmRzJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVmYXVsdFNraWxsQ29tbWFuZC51c2VySW52b2NhYmxlLCB0cnVlLCAnU2hvdWxkIGhhdmUgdXNlckludm9jYWJsZT10cnVlIHdoZW4gYXR0cmlidXRlIGlzIG5vdCBzcGVjaWZpZWQnKTtcblxuXHRcdFx0Ly8gVmVyaWZ5IHRoZSBmaWx0ZXJpbmcgbG9naWMgd291bGQgY29ycmVjdGx5IGluY2x1ZGUgdGhpcyBza2lsbCAodW5kZWZpbmVkICE9PSBmYWxzZSBpcyB0cnVlKVxuXHRcdFx0Y29uc3QgZmlsdGVyZWRDb21tYW5kcyA9IHNsYXNoQ29tbWFuZHMuZmlsdGVyKGMgPT4gYy51c2VySW52b2NhYmxlKTtcblx0XHRcdGNvbnN0IGRlZmF1bHRTa2lsbEluRmlsdGVyZWQgPSBmaWx0ZXJlZENvbW1hbmRzLmZpbmQoY21kID0+IGNtZC5uYW1lID09PSAnZGVmYXVsdC1za2lsbCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKGRlZmF1bHRTa2lsbEluRmlsdGVyZWQsXG5cdFx0XHRcdCdTa2lsbCB3aXRob3V0IHVzZXItaW52b2NhYmxlIGF0dHJpYnV0ZSBzaG91bGQgYmUgaW5jbHVkZWQgd2hlbiBhcHBseWluZyB1c2VySW52b2NhYmxlIGZpbHRlcicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBwcm9tcHRzIHdpdGggdXNlci1pbnZvY2FibGU6IGZhbHNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlck5hbWUgPSAncHJvbXB0LXVzZXItaW52b2NhYmxlLWZhbHNlJztcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZShyb290Rm9sZGVyKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXG5cdFx0XHQvLyBDcmVhdGUgYSBwcm9tcHQgd2l0aCB1c2VyLWludm9jYWJsZTogZmFsc2Vcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9wcm9tcHRzL2hpZGRlbi1wcm9tcHQucHJvbXB0Lm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogXCJoaWRkZW4tcHJvbXB0XCInLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkEgcHJvbXB0IGhpZGRlbiBmcm9tIHRoZSAvIG1lbnVcIicsXG5cdFx0XHRcdFx0XHQndXNlci1pbnZvY2FibGU6IGZhbHNlJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J0hpZGRlbiBwcm9tcHQgY29udGVudCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBzbGFzaENvbW1hbmRzID0gYXdhaXQgc2VydmljZS5nZXRQcm9tcHRTbGFzaENvbW1hbmRzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRjb25zdCBoaWRkZW5Qcm9tcHRDb21tYW5kID0gc2xhc2hDb21tYW5kcy5maW5kKGNtZCA9PiBjbWQubmFtZSA9PT0gJ2hpZGRlbi1wcm9tcHQnKTtcblx0XHRcdGFzc2VydC5vayhoaWRkZW5Qcm9tcHRDb21tYW5kLCAnU2hvdWxkIGZpbmQgaGlkZGVuIHByb21wdCBpbiBzbGFzaCBjb21tYW5kcycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhpZGRlblByb21wdENvbW1hbmQudXNlckludm9jYWJsZSwgZmFsc2UsXG5cdFx0XHRcdCdTaG91bGQgaGF2ZSB1c2VySW52b2NhYmxlPWZhbHNlIGluIHBhcnNlZCBoZWFkZXInKTtcblxuXHRcdFx0Ly8gVmVyaWZ5IHRoZSBmaWx0ZXJpbmcgbG9naWMgd291bGQgY29ycmVjdGx5IGV4Y2x1ZGUgdGhpcyBwcm9tcHRcblx0XHRcdGNvbnN0IGZpbHRlcmVkQ29tbWFuZHMgPSBzbGFzaENvbW1hbmRzLmZpbHRlcihjID0+IGMudXNlckludm9jYWJsZSk7XG5cdFx0XHRjb25zdCBoaWRkZW5Qcm9tcHRJbkZpbHRlcmVkID0gZmlsdGVyZWRDb21tYW5kcy5maW5kKGNtZCA9PiBjbWQubmFtZSA9PT0gJ2hpZGRlbi1wcm9tcHQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoaWRkZW5Qcm9tcHRJbkZpbHRlcmVkLCB1bmRlZmluZWQsXG5cdFx0XHRcdCdIaWRkZW4gcHJvbXB0IHNob3VsZCBiZSBmaWx0ZXJlZCBvdXQgd2hlbiBhcHBseWluZyB1c2VySW52b2NhYmxlIGZpbHRlcicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGNvcnJlY3RseSBmaWx0ZXIgbWl4ZWQgdXNlci1pbnZvY2FibGUgdmFsdWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQUdFTlRfU0tJTExTLCB0cnVlKTtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuU0tJTExTX0xPQ0FUSU9OX0tFWSwge30pO1xuXG5cdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICdtaXhlZC11c2VyLWludm9jYWJsZSc7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyID0gYC8ke3Jvb3RGb2xkZXJOYW1lfWA7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUocm9vdEZvbGRlcik7XG5cblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblxuXHRcdFx0Ly8gQ3JlYXRlIGEgbWl4IG9mIHNraWxscyBhbmQgcHJvbXB0cyB3aXRoIGRpZmZlcmVudCB1c2VyLWludm9jYWJsZSB2YWx1ZXNcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9wcm9tcHRzL3Zpc2libGUtcHJvbXB0LnByb21wdC5tZGAsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFwidmlzaWJsZS1wcm9tcHRcIicsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiQSB2aXNpYmxlIHByb21wdFwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J1Zpc2libGUgcHJvbXB0IGNvbnRlbnQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL3Byb21wdHMvaGlkZGVuLXByb21wdC5wcm9tcHQubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBcImhpZGRlbi1wcm9tcHRcIicsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiQSBoaWRkZW4gcHJvbXB0XCInLFxuXHRcdFx0XHRcdFx0J3VzZXItaW52b2NhYmxlOiBmYWxzZScsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdIaWRkZW4gcHJvbXB0IGNvbnRlbnQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL3NraWxscy92aXNpYmxlLXNraWxsL1NLSUxMLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogXCJ2aXNpYmxlLXNraWxsXCInLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkEgdmlzaWJsZSBza2lsbFwiJyxcblx0XHRcdFx0XHRcdCd1c2VyLWludm9jYWJsZTogdHJ1ZScsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdWaXNpYmxlIHNraWxsIGNvbnRlbnQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBgJHtyb290Rm9sZGVyfS8uZ2l0aHViL3NraWxscy9oaWRkZW4tc2tpbGwvU0tJTEwubWRgLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBcImhpZGRlbi1za2lsbFwiJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJBIGhpZGRlbiBza2lsbFwiJyxcblx0XHRcdFx0XHRcdCd1c2VyLWludm9jYWJsZTogZmFsc2UnLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnSGlkZGVuIHNraWxsIGNvbnRlbnQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3Qgc2xhc2hDb21tYW5kcyA9IGF3YWl0IHNlcnZpY2UuZ2V0UHJvbXB0U2xhc2hDb21tYW5kcyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0Ly8gQWxsIGNvbW1hbmRzIHNob3VsZCBiZSBwcmVzZW50IGluIHRoZSByYXcgbGlzdFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNsYXNoQ29tbWFuZHMubGVuZ3RoLCA0LCAnU2hvdWxkIGZpbmQgYWxsIDQgY29tbWFuZHMnKTtcblxuXHRcdFx0Ly8gQXBwbHkgdGhlIHNhbWUgZmlsdGVyaW5nIGxvZ2ljIGFzIGNoYXRJbnB1dENvbXBsZXRpb25zLnRzXG5cdFx0XHRjb25zdCBmaWx0ZXJlZENvbW1hbmRzID0gc2xhc2hDb21tYW5kcy5maWx0ZXIoYyA9PiBjLnVzZXJJbnZvY2FibGUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyZWRDb21tYW5kcy5sZW5ndGgsIDIsICdTaG91bGQgaGF2ZSAyIGNvbW1hbmRzIGFmdGVyIGZpbHRlcmluZycpO1xuXHRcdFx0YXNzZXJ0Lm9rKGZpbHRlcmVkQ29tbWFuZHMuZmluZChjID0+IGMubmFtZSA9PT0gJ3Zpc2libGUtcHJvbXB0JyksICd2aXNpYmxlLXByb21wdCBzaG91bGQgYmUgaW5jbHVkZWQnKTtcblx0XHRcdGFzc2VydC5vayhmaWx0ZXJlZENvbW1hbmRzLmZpbmQoYyA9PiBjLm5hbWUgPT09ICd2aXNpYmxlLXNraWxsJyksICd2aXNpYmxlLXNraWxsIHNob3VsZCBiZSBpbmNsdWRlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbHRlcmVkQ29tbWFuZHMuZmluZChjID0+IGMubmFtZSA9PT0gJ2hpZGRlbi1wcm9tcHQnKSwgdW5kZWZpbmVkLCAnaGlkZGVuLXByb21wdCBzaG91bGQgYmUgZXhjbHVkZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWx0ZXJlZENvbW1hbmRzLmZpbmQoYyA9PiBjLm5hbWUgPT09ICdoaWRkZW4tc2tpbGwnKSwgdW5kZWZpbmVkLCAnaGlkZGVuLXNraWxsIHNob3VsZCBiZSBleGNsdWRlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBza2lsbHMgd2l0aCBtaXNzaW5nIGhlYWRlciBncmFjZWZ1bGx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQUdFTlRfU0tJTExTLCB0cnVlKTtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuU0tJTExTX0xPQ0FUSU9OX0tFWSwge30pO1xuXG5cdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICdtaXNzaW5nLWhlYWRlcic7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyID0gYC8ke3Jvb3RGb2xkZXJOYW1lfWA7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUocm9vdEZvbGRlcik7XG5cblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblxuXHRcdFx0Ly8gQ3JlYXRlIGEgc2tpbGwgd2l0aG91dCBhbnkgWUFNTCBoZWFkZXJcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogYCR7cm9vdEZvbGRlcn0vLmdpdGh1Yi9za2lsbHMvbm8taGVhZGVyLXNraWxsL1NLSUxMLm1kYCxcblx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0J1RoaXMgc2tpbGwgaGFzIG5vIFlBTUwgaGVhZGVyIGF0IGFsbC4nLFxuXHRcdFx0XHRcdFx0J0p1c3QgcGxhaW4gbWFya2Rvd24gY29udGVudC4nLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3Qgc2xhc2hDb21tYW5kcyA9IGF3YWl0IHNlcnZpY2UuZ2V0UHJvbXB0U2xhc2hDb21tYW5kcyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0Ly8gRmluZCB0aGUgc2tpbGwgYnkgY2hlY2tpbmcgYWxsIGNvbW1hbmRzIChuYW1lIHdpbGwgYmUgZGVyaXZlZCBmcm9tIGZpbGVuYW1lKVxuXHRcdFx0Y29uc3Qgbm9IZWFkZXJTa2lsbCA9IHNsYXNoQ29tbWFuZHMuZmluZChjbWQgPT5cblx0XHRcdFx0Y21kLnVyaS5wYXRoLmluY2x1ZGVzKCduby1oZWFkZXItc2tpbGwnKSk7XG5cdFx0XHRhc3NlcnQub2sobm9IZWFkZXJTa2lsbCwgJ1Nob3VsZCBmaW5kIHNraWxsIHdpdGhvdXQgaGVhZGVyIGluIHNsYXNoIGNvbW1hbmRzJyk7XG5cblx0XHRcdC8vIFZlcmlmeSB0aGUgZmlsdGVyaW5nIGxvZ2ljIGhhbmRsZXMgbWlzc2luZyBoZWFkZXIgY29ycmVjdGx5XG5cdFx0XHQvLyBwYXJzZWRQcm9tcHRGaWxlPy5oZWFkZXI/LnVzZXJJbnZvY2FibGVcblx0XHRcdC8vIFdoZW4gaGVhZGVyIGlzIHVuZGVmaW5lZDogdW5kZWZpbmVkICE9PSBmYWxzZSBpcyB0cnVlLCBzbyBza2lsbCBpcyBpbmNsdWRlZFxuXHRcdFx0Y29uc3QgZmlsdGVyZWRDb21tYW5kcyA9IHNsYXNoQ29tbWFuZHMuZmlsdGVyKGMgPT4gYy51c2VySW52b2NhYmxlKTtcblx0XHRcdGNvbnN0IG5vSGVhZGVyU2tpbGxJbkZpbHRlcmVkID0gZmlsdGVyZWRDb21tYW5kcy5maW5kKGNtZCA9PlxuXHRcdFx0XHRjbWQudXJpLnBhdGguaW5jbHVkZXMoJ25vLWhlYWRlci1za2lsbCcpKTtcblx0XHRcdGFzc2VydC5vayhub0hlYWRlclNraWxsSW5GaWx0ZXJlZCxcblx0XHRcdFx0J1NraWxsIHdpdGhvdXQgaGVhZGVyIHNob3VsZCBiZSBpbmNsdWRlZCB3aGVuIGFwcGx5aW5nIHVzZXJJbnZvY2FibGUgZmlsdGVyIChkZWZhdWx0cyB0byB0cnVlKScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGx1Z2luIHNraWxscyBpbmNsdWRlIHBsdWdpbiBuYW1lIHByZWZpeCBpbiBzbGFzaCBjb21tYW5kIG5hbWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9BR0VOVF9TS0lMTFMsIHRydWUpO1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5TS0lMTFNfTE9DQVRJT05fS0VZLCB7fSk7XG5cblx0XHRcdGNvbnN0IHNraWxsVXJpID0gVVJJLmZpbGUoJy9wbHVnaW5zL215LXBsdWdpbi9za2lsbHMvZGVwbG95L1NLSUxMLm1kJyk7XG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IHNraWxsVXJpLnBhdGgsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkRlcGxveSBza2lsbCBmcm9tIHBsdWdpblwiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J0RlcGxveSBza2lsbCBjb250ZW50Jyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IGVuYWJsZW1lbnQgPSBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3RQbHVnaW5FbmFibGVtZW50JywgMiAvKiBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRW5hYmxlZFByb2ZpbGUgKi8pO1xuXHRcdFx0Y29uc3QgcGx1Z2luOiBJQWdlbnRQbHVnaW4gPSB7XG5cdFx0XHRcdHVyaTogVVJJLmZpbGUoJy9wbHVnaW5zL215LXBsdWdpbicpLFxuXHRcdFx0XHRmb3JtYXQ6IFBsdWdpbkZvcm1hdC5Db3BpbG90LFxuXHRcdFx0XHRsYWJlbDogJ215LXBsdWdpbicsXG5cdFx0XHRcdGVuYWJsZW1lbnQsXG5cdFx0XHRcdHJlbW92ZTogKCkgPT4geyB9LFxuXHRcdFx0XHRob29rczogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0UGx1Z2luSG9va3MnLCBbXSksXG5cdFx0XHRcdGNvbW1hbmRzOiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3RQbHVnaW5Db21tYW5kcycsIFtdKSxcblx0XHRcdFx0c2tpbGxzOiBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUFnZW50UGx1Z2luU2tpbGxbXT4oJ3Rlc3RQbHVnaW5Ta2lsbHMnLCBbeyB1cmk6IHNraWxsVXJpLCBuYW1lOiAnZGVwbG95JyB9XSksXG5cdFx0XHRcdGFnZW50czogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0UGx1Z2luQWdlbnRzJywgW10pLFxuXHRcdFx0XHRpbnN0cnVjdGlvbnM6IG9ic2VydmFibGVWYWx1ZSgndGVzdFBsdWdpbkluc3RydWN0aW9ucycsIFtdKSxcblx0XHRcdFx0bWNwU2VydmVyRGVmaW5pdGlvbnM6IG9ic2VydmFibGVWYWx1ZSgndGVzdFBsdWdpbk1jcFNlcnZlckRlZmluaXRpb25zJywgW10pLFxuXHRcdFx0fTtcblxuXHRcdFx0dGVzdFBsdWdpbnNPYnNlcnZhYmxlLnNldChbcGx1Z2luXSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0Y29uc3Qgc2xhc2hDb21tYW5kcyA9IGF3YWl0IHNlcnZpY2UuZ2V0UHJvbXB0U2xhc2hDb21tYW5kcyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0Ly8gU2hvdWxkIGJlIHByZWZpeGVkIHdpdGggcGx1Z2luIG5hbWVcblx0XHRcdGNvbnN0IHNraWxsQ29tbWFuZCA9IHNsYXNoQ29tbWFuZHMuZmluZChjbWQgPT4gY21kLm5hbWUgPT09ICdteS1wbHVnaW46ZGVwbG95Jyk7XG5cdFx0XHRhc3NlcnQub2soc2tpbGxDb21tYW5kLCAnUGx1Z2luIHNraWxsIHNob3VsZCBoYXZlIHBsdWdpbiBwcmVmaXggaW4gc2xhc2ggY29tbWFuZCBuYW1lJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2tpbGxDb21tYW5kLnN0b3JhZ2UsIFByb21wdHNTdG9yYWdlLnBsdWdpbik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2tpbGxDb21tYW5kLnR5cGUsIFByb21wdHNUeXBlLnNraWxsKTtcblxuXHRcdFx0dGVzdFBsdWdpbnNPYnNlcnZhYmxlLnNldChbXSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BsdWdpbiBza2lsbCBmcm9udG1hdHRlciBuYW1lIGlzIHF1YWxpZmllZCB3aXRoIHBsdWdpbiBwcmVmaXgnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9BR0VOVF9TS0lMTFMsIHRydWUpO1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5TS0lMTFNfTE9DQVRJT05fS0VZLCB7fSk7XG5cblx0XHRcdGNvbnN0IHNraWxsVXJpID0gVVJJLmZpbGUoJy9wbHVnaW5zL2RldnRvb2xzL3NraWxscy9jaS9TS0lMTC5tZCcpO1xuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiBza2lsbFVyaS5wYXRoLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBcInJ1bi1jaVwiJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJSdW4gQ0kgcGlwZWxpbmVcIicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCdDSSBza2lsbCBjb250ZW50Jyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IGVuYWJsZW1lbnQgPSBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3RQbHVnaW5FbmFibGVtZW50JywgMiAvKiBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRW5hYmxlZFByb2ZpbGUgKi8pO1xuXHRcdFx0Y29uc3QgcGx1Z2luOiBJQWdlbnRQbHVnaW4gPSB7XG5cdFx0XHRcdHVyaTogVVJJLmZpbGUoJy9wbHVnaW5zL2RldnRvb2xzJyksXG5cdFx0XHRcdGZvcm1hdDogUGx1Z2luRm9ybWF0LkNvcGlsb3QsXG5cdFx0XHRcdGxhYmVsOiAnZGV2dG9vbHMnLFxuXHRcdFx0XHRlbmFibGVtZW50LFxuXHRcdFx0XHRyZW1vdmU6ICgpID0+IHsgfSxcblx0XHRcdFx0aG9va3M6IG9ic2VydmFibGVWYWx1ZSgndGVzdFBsdWdpbkhvb2tzJywgW10pLFxuXHRcdFx0XHRjb21tYW5kczogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0UGx1Z2luQ29tbWFuZHMnLCBbXSksXG5cdFx0XHRcdHNraWxsczogb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElBZ2VudFBsdWdpblNraWxsW10+KCd0ZXN0UGx1Z2luU2tpbGxzJywgW3sgdXJpOiBza2lsbFVyaSwgbmFtZTogJ2NpJyB9XSksXG5cdFx0XHRcdGFnZW50czogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0UGx1Z2luQWdlbnRzJywgW10pLFxuXHRcdFx0XHRpbnN0cnVjdGlvbnM6IG9ic2VydmFibGVWYWx1ZSgndGVzdFBsdWdpbkluc3RydWN0aW9ucycsIFtdKSxcblx0XHRcdFx0bWNwU2VydmVyRGVmaW5pdGlvbnM6IG9ic2VydmFibGVWYWx1ZSgndGVzdFBsdWdpbk1jcFNlcnZlckRlZmluaXRpb25zJywgW10pLFxuXHRcdFx0fTtcblxuXHRcdFx0dGVzdFBsdWdpbnNPYnNlcnZhYmxlLnNldChbcGx1Z2luXSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0Y29uc3Qgc2xhc2hDb21tYW5kcyA9IGF3YWl0IHNlcnZpY2UuZ2V0UHJvbXB0U2xhc2hDb21tYW5kcyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0Ly8gU2tpbGwgbmFtZSBpcyBkZXJpdmVkIGZyb20gZm9sZGVyIG5hbWUgKGNpKSwgbm90IGZyb250bWF0dGVyIG5hbWUgKHJ1bi1jaSksXG5cdFx0XHQvLyBhbmQgcHJlZml4ZWQgd2l0aCB0aGUgcGx1Z2luIG5hbWVcblx0XHRcdGNvbnN0IHNraWxsQ29tbWFuZCA9IHNsYXNoQ29tbWFuZHMuZmluZChjbWQgPT4gY21kLm5hbWUgPT09ICdkZXZ0b29sczpjaScpO1xuXHRcdFx0YXNzZXJ0Lm9rKHNraWxsQ29tbWFuZCwgJ1BsdWdpbiBza2lsbCBmb2xkZXIgbmFtZSBzaG91bGQgYmUgcXVhbGlmaWVkIHdpdGggcGx1Z2luIHByZWZpeCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNraWxsQ29tbWFuZC5kZXNjcmlwdGlvbiwgJ1J1biBDSSBwaXBlbGluZScpO1xuXG5cdFx0XHQvLyBUaGUgZnJvbnRtYXR0ZXIgbmFtZSBzaG91bGQgbm90IGFwcGVhclxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNsYXNoQ29tbWFuZHMuZmluZChjbWQgPT4gY21kLm5hbWUgPT09ICdkZXZ0b29sczpydW4tY2knKSwgdW5kZWZpbmVkLFxuXHRcdFx0XHQnRnJvbnRtYXR0ZXIgc2tpbGwgbmFtZSBzaG91bGQgbm90IGFwcGVhciBhcyBzbGFzaCBjb21tYW5kJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2xhc2hDb21tYW5kcy5maW5kKGNtZCA9PiBjbWQubmFtZSA9PT0gJ3J1bi1jaScpLCB1bmRlZmluZWQsXG5cdFx0XHRcdCdVbnByZWZpeGVkIHNraWxsIG5hbWUgc2hvdWxkIG5vdCBhcHBlYXIgYXMgc2xhc2ggY29tbWFuZCcpO1xuXG5cdFx0XHR0ZXN0UGx1Z2luc09ic2VydmFibGUuc2V0KFtdLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGx1Z2luIHNraWxsIHNsYXNoIGNvbW1hbmQgcHJlZml4IHVzZXMgcGx1Z2luIGxhYmVsIHdoZW4gaW5zdGFsbCBwYXRoIGlzIGEgcGlubmVkIFNIQScsIGFzeW5jICgpID0+IHtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0FHRU5UX1NLSUxMUywgdHJ1ZSk7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlNLSUxMU19MT0NBVElPTl9LRVksIHt9KTtcblxuXHRcdFx0Y29uc3QgcGx1Z2luVXJpID0gVVJJLmZpbGUoJy9jYWNoZS9hZ2VudFBsdWdpbnMvZ2l0aHViL2RhdGFkb2cvc2hhX2IwMDNmY2FkNDhjM2E5MzVmZmUwNGI2MjE4ZjVjZjU4ZmUyYjY3NjAnKTtcblx0XHRcdGNvbnN0IHNraWxsVXJpID0gVVJJLmpvaW5QYXRoKHBsdWdpblVyaSwgJ3NraWxscycsICdkZHNldHVwJywgJ1NLSUxMLm1kJyk7XG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6IHNraWxsVXJpLnBhdGgsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFwiZGRzZXR1cFwiJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJTZXQgdXAgRGF0YWRvZ1wiJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J0RhdGFkb2cgc2V0dXAgc2tpbGwgY29udGVudCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBlbmFibGVtZW50ID0gb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0UGx1Z2luRW5hYmxlbWVudCcsIDIgLyogQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRQcm9maWxlICovKTtcblx0XHRcdGNvbnN0IHBsdWdpbjogSUFnZW50UGx1Z2luID0ge1xuXHRcdFx0XHR1cmk6IHBsdWdpblVyaSxcblx0XHRcdFx0Zm9ybWF0OiBQbHVnaW5Gb3JtYXQuQ29waWxvdCxcblx0XHRcdFx0bGFiZWw6ICdkYXRhZG9nJyxcblx0XHRcdFx0ZW5hYmxlbWVudCxcblx0XHRcdFx0cmVtb3ZlOiAoKSA9PiB7IH0sXG5cdFx0XHRcdGhvb2tzOiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3RQbHVnaW5Ib29rcycsIFtdKSxcblx0XHRcdFx0Y29tbWFuZHM6IG9ic2VydmFibGVWYWx1ZSgndGVzdFBsdWdpbkNvbW1hbmRzJywgW10pLFxuXHRcdFx0XHRza2lsbHM6IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJQWdlbnRQbHVnaW5Ta2lsbFtdPigndGVzdFBsdWdpblNraWxscycsIFt7IHVyaTogc2tpbGxVcmksIG5hbWU6ICdkZHNldHVwJyB9XSksXG5cdFx0XHRcdGFnZW50czogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0UGx1Z2luQWdlbnRzJywgW10pLFxuXHRcdFx0XHRpbnN0cnVjdGlvbnM6IG9ic2VydmFibGVWYWx1ZSgndGVzdFBsdWdpbkluc3RydWN0aW9ucycsIFtdKSxcblx0XHRcdFx0bWNwU2VydmVyRGVmaW5pdGlvbnM6IG9ic2VydmFibGVWYWx1ZSgndGVzdFBsdWdpbk1jcFNlcnZlckRlZmluaXRpb25zJywgW10pLFxuXHRcdFx0fTtcblxuXHRcdFx0dGVzdFBsdWdpbnNPYnNlcnZhYmxlLnNldChbcGx1Z2luXSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0Y29uc3Qgc2xhc2hDb21tYW5kcyA9IGF3YWl0IHNlcnZpY2UuZ2V0UHJvbXB0U2xhc2hDb21tYW5kcyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzbGFzaENvbW1hbmRzXG5cdFx0XHRcdC5maWx0ZXIoY29tbWFuZCA9PiBjb21tYW5kLnVyaS50b1N0cmluZygpID09PSBza2lsbFVyaS50b1N0cmluZygpKVxuXHRcdFx0XHQubWFwKGNvbW1hbmQgPT4gKHsgbmFtZTogY29tbWFuZC5uYW1lLCBkZXNjcmlwdGlvbjogY29tbWFuZC5kZXNjcmlwdGlvbiwgdHlwZTogY29tbWFuZC50eXBlLCBzdG9yYWdlOiBjb21tYW5kLnN0b3JhZ2UgfSkpLCBbe1xuXHRcdFx0XHRcdG5hbWU6ICdkYXRhZG9nOmRkc2V0dXAnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnU2V0IHVwIERhdGFkb2cnLFxuXHRcdFx0XHRcdHR5cGU6IFByb21wdHNUeXBlLnNraWxsLFxuXHRcdFx0XHRcdHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLnBsdWdpbixcblx0XHRcdFx0fV0pO1xuXG5cdFx0XHR0ZXN0UGx1Z2luc09ic2VydmFibGUuc2V0KFtdLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnY3VzdG9taXphdGlvbiBsb2NrZG93bicsICgpID0+IHtcblx0XHR0ZXN0KCdwb2xpY3kgY2hhbmdlcyBpbnZhbGlkYXRlIGNhY2hlZCBzdGFuZGFsb25lIGFnZW50IGxvY2F0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZSgnL2R5bmFtaWMtYWdlbnQtbG9ja2Rvd24nKTtcblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW3tcblx0XHRcdFx0cGF0aDogJy9keW5hbWljLWFnZW50LWxvY2tkb3duLy5naXRodWIvYWdlbnRzL3Jldmlld2VyLmFnZW50Lm1kJyxcblx0XHRcdFx0Y29udGVudHM6IFsnLS0tJywgJ2Rlc2NyaXB0aW9uOiBcIlJldmlldyBjb2RlXCInLCAnLS0tJ10sXG5cdFx0XHR9XSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgc2VydmljZS5nZXRDdXN0b21BZ2VudHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpLmxlbmd0aCwgMSk7XG5cblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENPUElMT1RfU1RSSUNUX1BMVUdJTl9PTkxZX0NVU1RPTUlaQVRJT05fQ09ORklHLCB0cnVlKTtcblx0XHRcdGZpcmVDb25maWdDaGFuZ2UodGVzdENvbmZpZ1NlcnZpY2UsIENPUElMT1RfU1RSSUNUX1BMVUdJTl9PTkxZX0NVU1RPTUlaQVRJT05fQ09ORklHKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmdldEN1c3RvbUFnZW50cyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGx1Z2luLW9ubHkgbG9ja2Rvd24gZmlsdGVycyB3b3Jrc3BhY2UgYWdlbnRzIHdpdGhvdXQgYWZmZWN0aW5nIHByb21wdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUoJy9sb2NrZG93bi1hZ2VudHMnKTtcblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENPUElMT1RfU1RSSUNUX1BMVUdJTl9PTkxZX0NVU1RPTUlaQVRJT05fQ09ORklHLCB0cnVlKTtcblxuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnL2xvY2tkb3duLWFnZW50cy8uZ2l0aHViL2FnZW50cy9yZXZpZXdlci5hZ2VudC5tZCcsXG5cdFx0XHRcdFx0Y29udGVudHM6IFsnLS0tJywgJ2Rlc2NyaXB0aW9uOiBcIlJldmlldyBjb2RlXCInLCAnLS0tJ10sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnL2xvY2tkb3duLWFnZW50cy8uZ2l0aHViL3Byb21wdHMvcmV2aWV3LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0Y29udGVudHM6IFsnLS0tJywgJ2Rlc2NyaXB0aW9uOiBcIlJldmlldyBwcm9tcHRcIicsICctLS0nXSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuZ2V0Q3VzdG9tQWdlbnRzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpLCBbXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IHNlcnZpY2UubGlzdFByb21wdEZpbGVzKFByb21wdHNUeXBlLnByb21wdCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpLmxlbmd0aCwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdza2lsbCBsb2NrZG93biBmaWx0ZXJzIHN0YW5kYWxvbmUgc2tpbGxzIGJlZm9yZSBkaXNjb3ZlcnkgYW5kIHByZXNlcnZlcyBwbHVnaW4gc2tpbGxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQUdFTlRfU0tJTExTLCB0cnVlKTtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENPUElMT1RfU1RSSUNUX1BMVUdJTl9PTkxZX0NVU1RPTUlaQVRJT05fQ09ORklHLCB0cnVlKTtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZSgnL2xvY2tkb3duLXNraWxscycpO1xuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uocm9vdEZvbGRlclVyaSkpO1xuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbe1xuXHRcdFx0XHRwYXRoOiAnL2xvY2tkb3duLXNraWxscy8uZ2l0aHViL3NraWxscy93b3Jrc3BhY2Utc2tpbGwvU0tJTEwubWQnLFxuXHRcdFx0XHRjb250ZW50czogWyctLS0nLCAnbmFtZTogXCJ3b3Jrc3BhY2Utc2tpbGxcIicsICdkZXNjcmlwdGlvbjogXCJXb3Jrc3BhY2VcIicsICctLS0nXSxcblx0XHRcdH0sIHtcblx0XHRcdFx0cGF0aDogJy9wbHVnaW5zL21hbmFnZWQvc2tpbGxzL3BsdWdpbi1za2lsbC9TS0lMTC5tZCcsXG5cdFx0XHRcdGNvbnRlbnRzOiBbJy0tLScsICduYW1lOiBcInBsdWdpbi1za2lsbFwiJywgJ2Rlc2NyaXB0aW9uOiBcIlBsdWdpblwiJywgJy0tLSddLFxuXHRcdFx0fV0pO1xuXG5cdFx0XHRjb25zdCBwbHVnaW46IElBZ2VudFBsdWdpbiA9IHtcblx0XHRcdFx0dXJpOiBVUkkuZmlsZSgnL3BsdWdpbnMvbWFuYWdlZCcpLFxuXHRcdFx0XHRmb3JtYXQ6IFBsdWdpbkZvcm1hdC5Db3BpbG90LFxuXHRcdFx0XHRsYWJlbDogJ21hbmFnZWQnLFxuXHRcdFx0XHRlbmFibGVtZW50OiBvYnNlcnZhYmxlVmFsdWUoJ2xvY2tkb3duUGx1Z2luRW5hYmxlbWVudCcsIDIgLyogQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRQcm9maWxlICovKSxcblx0XHRcdFx0aG9va3M6IG9ic2VydmFibGVWYWx1ZSgnbG9ja2Rvd25QbHVnaW5Ib29rcycsIFtdKSxcblx0XHRcdFx0Y29tbWFuZHM6IG9ic2VydmFibGVWYWx1ZSgnbG9ja2Rvd25QbHVnaW5Db21tYW5kcycsIFtdKSxcblx0XHRcdFx0c2tpbGxzOiBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUFnZW50UGx1Z2luU2tpbGxbXT4oJ2xvY2tkb3duUGx1Z2luU2tpbGxzJywgW3sgdXJpOiBVUkkuZmlsZSgnL3BsdWdpbnMvbWFuYWdlZC9za2lsbHMvcGx1Z2luLXNraWxsL1NLSUxMLm1kJyksIG5hbWU6ICdwbHVnaW4tc2tpbGwnIH1dKSxcblx0XHRcdFx0YWdlbnRzOiBvYnNlcnZhYmxlVmFsdWUoJ2xvY2tkb3duUGx1Z2luQWdlbnRzJywgW10pLFxuXHRcdFx0XHRpbnN0cnVjdGlvbnM6IG9ic2VydmFibGVWYWx1ZSgnbG9ja2Rvd25QbHVnaW5JbnN0cnVjdGlvbnMnLCBbXSksXG5cdFx0XHRcdG1jcFNlcnZlckRlZmluaXRpb25zOiBvYnNlcnZhYmxlVmFsdWUoJ2xvY2tkb3duUGx1Z2luTWNwU2VydmVycycsIFtdKSxcblx0XHRcdH07XG5cdFx0XHR0ZXN0UGx1Z2luc09ic2VydmFibGUuc2V0KFtwbHVnaW5dLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRjb25zdCBza2lsbHMgPSBhd2FpdCBzZXJ2aWNlLmZpbmRBZ2VudFNraWxscyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2tpbGxzPy5tYXAoc2tpbGwgPT4gKHsgbmFtZTogc2tpbGwubmFtZSwgc3RvcmFnZTogc2tpbGwuc3RvcmFnZSB9KSksIFtcblx0XHRcdFx0eyBuYW1lOiAncGx1Z2luLXNraWxsJywgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UucGx1Z2luIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BsdWdpbi1vbmx5IGxvY2tkb3duIGZpbHRlcnMgc3RhbmRhbG9uZSBpbnN0cnVjdGlvbnMgYW5kIHByZXNlcnZlcyBwbHVnaW4gaW5zdHJ1Y3Rpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ09QSUxPVF9TVFJJQ1RfUExVR0lOX09OTFlfQ1VTVE9NSVpBVElPTl9DT05GSUcsIHRydWUpO1xuXHRcdFx0Y29uc3Qgcm9vdEZvbGRlclVyaSA9IFVSSS5maWxlKCcvbG9ja2Rvd24taW5zdHJ1Y3Rpb25zJyk7XG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2UodGVzdFdvcmtzcGFjZShyb290Rm9sZGVyVXJpKSk7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VJbnN0cnVjdGlvblVyaSA9IFVSSS5qb2luUGF0aChyb290Rm9sZGVyVXJpLCAnLmdpdGh1YicsICdpbnN0cnVjdGlvbnMnLCAnd29ya3NwYWNlLmluc3RydWN0aW9ucy5tZCcpO1xuXHRcdFx0Y29uc3QgcGx1Z2luVXJpID0gVVJJLmZpbGUoJy9wbHVnaW5zL21hbmFnZWQnKTtcblx0XHRcdGNvbnN0IHBsdWdpbkluc3RydWN0aW9uVXJpID0gVVJJLmpvaW5QYXRoKHBsdWdpblVyaSwgJ3J1bGVzJywgJ3BsdWdpbi5pbnN0cnVjdGlvbnMubWQnKTtcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW3tcblx0XHRcdFx0cGF0aDogd29ya3NwYWNlSW5zdHJ1Y3Rpb25VcmkucGF0aCxcblx0XHRcdFx0Y29udGVudHM6IFsnLS0tJywgJ2Rlc2NyaXB0aW9uOiBcIldvcmtzcGFjZVwiJywgJy0tLSddLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRwYXRoOiBwbHVnaW5JbnN0cnVjdGlvblVyaS5wYXRoLFxuXHRcdFx0XHRjb250ZW50czogWyctLS0nLCAnZGVzY3JpcHRpb246IFwiUGx1Z2luXCInLCAnLS0tJ10sXG5cdFx0XHR9XSk7XG5cblx0XHRcdGNvbnN0IHBsdWdpbjogSUFnZW50UGx1Z2luID0ge1xuXHRcdFx0XHR1cmk6IHBsdWdpblVyaSxcblx0XHRcdFx0Zm9ybWF0OiBQbHVnaW5Gb3JtYXQuQ29waWxvdCxcblx0XHRcdFx0bGFiZWw6ICdtYW5hZ2VkJyxcblx0XHRcdFx0ZW5hYmxlbWVudDogb2JzZXJ2YWJsZVZhbHVlKCdsb2NrZG93bkluc3RydWN0aW9uUGx1Z2luRW5hYmxlbWVudCcsIDIgLyogQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRQcm9maWxlICovKSxcblx0XHRcdFx0aG9va3M6IG9ic2VydmFibGVWYWx1ZSgnbG9ja2Rvd25JbnN0cnVjdGlvblBsdWdpbkhvb2tzJywgW10pLFxuXHRcdFx0XHRjb21tYW5kczogb2JzZXJ2YWJsZVZhbHVlKCdsb2NrZG93bkluc3RydWN0aW9uUGx1Z2luQ29tbWFuZHMnLCBbXSksXG5cdFx0XHRcdHNraWxsczogb2JzZXJ2YWJsZVZhbHVlKCdsb2NrZG93bkluc3RydWN0aW9uUGx1Z2luU2tpbGxzJywgW10pLFxuXHRcdFx0XHRhZ2VudHM6IG9ic2VydmFibGVWYWx1ZSgnbG9ja2Rvd25JbnN0cnVjdGlvblBsdWdpbkFnZW50cycsIFtdKSxcblx0XHRcdFx0aW5zdHJ1Y3Rpb25zOiBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUFnZW50UGx1Z2luSW5zdHJ1Y3Rpb25bXT4oJ2xvY2tkb3duUGx1Z2luSW5zdHJ1Y3Rpb25zJywgW3sgdXJpOiBwbHVnaW5JbnN0cnVjdGlvblVyaSwgbmFtZTogJ3BsdWdpbicgfV0pLFxuXHRcdFx0XHRtY3BTZXJ2ZXJEZWZpbml0aW9uczogb2JzZXJ2YWJsZVZhbHVlKCdsb2NrZG93bkluc3RydWN0aW9uUGx1Z2luTWNwU2VydmVycycsIFtdKSxcblx0XHRcdH07XG5cdFx0XHR0ZXN0UGx1Z2luc09ic2VydmFibGUuc2V0KFtwbHVnaW5dLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRjb25zdCBpbnN0cnVjdGlvbnMgPSBhd2FpdCBzZXJ2aWNlLmxpc3RQcm9tcHRGaWxlcyhQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpbnN0cnVjdGlvbnMubWFwKGluc3RydWN0aW9uID0+ICh7XG5cdFx0XHRcdHVyaTogaW5zdHJ1Y3Rpb24udXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdHN0b3JhZ2U6IGluc3RydWN0aW9uLnN0b3JhZ2UsXG5cdFx0XHR9KSksIFt7XG5cdFx0XHRcdHVyaTogcGx1Z2luSW5zdHJ1Y3Rpb25VcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0c3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UucGx1Z2luLFxuXHRcdFx0fV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGx1Z2luLW9ubHkgbG9ja2Rvd24gZmlsdGVycyB3b3Jrc3BhY2UgYWdlbnQgaW5zdHJ1Y3Rpb24gZmlsZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihDT1BJTE9UX1NUUklDVF9QTFVHSU5fT05MWV9DVVNUT01JWkFUSU9OX0NPTkZJRywgdHJ1ZSk7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUoJy9sb2NrZG93bi1hZ2VudC1pbnN0cnVjdGlvbnMnKTtcblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW3tcblx0XHRcdFx0cGF0aDogVVJJLmpvaW5QYXRoKHJvb3RGb2xkZXJVcmksICdBR0VOVFMubWQnKS5wYXRoLFxuXHRcdFx0XHRjb250ZW50czogWydXb3Jrc3BhY2UgYWdlbnQgaW5zdHJ1Y3Rpb25zJ10sXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHBhdGg6IFVSSS5qb2luUGF0aChyb290Rm9sZGVyVXJpLCAnQ0xBVURFLm1kJykucGF0aCxcblx0XHRcdFx0Y29udGVudHM6IFsnV29ya3NwYWNlIENsYXVkZSBpbnN0cnVjdGlvbnMnXSxcblx0XHRcdH1dKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmxpc3RBZ2VudEluc3RydWN0aW9ucyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLCB1bmRlZmluZWQpLCBbXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UubGlzdE5lc3RlZEFnZW50TURzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwbHVnaW4tb25seSBsb2NrZG93biByZW1vdmVzIHN0YW5kYWxvbmUgYWdlbnRzIHdpdGggZW1iZWRkZWQgaG9va3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9DSEFUX0hPT0tTLCB0cnVlKTtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENPUElMT1RfU1RSSUNUX1BMVUdJTl9PTkxZX0NVU1RPTUlaQVRJT05fQ09ORklHLCB0cnVlKTtcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXJVcmkgPSBVUkkuZmlsZSgnL2xvY2tkb3duLWFnZW50LWhvb2tzJyk7XG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2UodGVzdFdvcmtzcGFjZShyb290Rm9sZGVyVXJpKSk7XG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFt7XG5cdFx0XHRcdHBhdGg6ICcvbG9ja2Rvd24tYWdlbnQtaG9va3MvLmdpdGh1Yi9hZ2VudHMvcmV2aWV3ZXIuYWdlbnQubWQnLFxuXHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJSZXZpZXcgY29kZVwiJyxcblx0XHRcdFx0XHQnaG9va3M6Jyxcblx0XHRcdFx0XHQnICBQcmVUb29sVXNlOicsXG5cdFx0XHRcdFx0JyAgICAtIHR5cGU6IGNvbW1hbmQnLFxuXHRcdFx0XHRcdCcgICAgICBjb21tYW5kOiBcImVjaG8gYmxvY2tlZFwiJyxcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XSxcblx0XHRcdH1dKTtcblxuXHRcdFx0Y29uc3QgYWdlbnRzID0gYXdhaXQgc2VydmljZS5nZXRDdXN0b21BZ2VudHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50cywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWFuYWdlZC1vbmx5IGhvb2tzIHByZXNlcnZlIGZyb250bWF0dGVyIGhvb2tzIGZyb20gZm9yY2UtZW5hYmxlZCBwbHVnaW4gYWdlbnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQ0hBVF9IT09LUywgdHJ1ZSk7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihDT1BJTE9UX0FMTE9XX01BTkFHRURfSE9PS1NfT05MWV9DT05GSUcsIHRydWUpO1xuXHRcdFx0Y29uc3QgcGx1Z2luVXJpID0gVVJJLmZpbGUoJy9ob21lL3VzZXIvLmNvcGlsb3QvaW5zdGFsbGVkLXBsdWdpbnMvbWFuYWdlZC1tYXJrZXRwbGFjZS9tYW5hZ2VkLXBsdWdpbicpO1xuXHRcdFx0Y29uc3QgYWdlbnRVcmkgPSBVUkkuam9pblBhdGgocGx1Z2luVXJpLCAnYWdlbnRzJywgJ3Jldmlld2VyLmFnZW50Lm1kJyk7XG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFt7XG5cdFx0XHRcdHBhdGg6IGFnZW50VXJpLnBhdGgsXG5cdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlJldmlldyBjb2RlXCInLFxuXHRcdFx0XHRcdCdob29rczonLFxuXHRcdFx0XHRcdCcgIFByZVRvb2xVc2U6Jyxcblx0XHRcdFx0XHQnICAgIC0gdHlwZTogY29tbWFuZCcsXG5cdFx0XHRcdFx0JyAgICAgIGNvbW1hbmQ6IFwiZWNobyBtYW5hZ2VkXCInLFxuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRdLFxuXHRcdFx0fV0pO1xuXG5cdFx0XHRjb25zdCBvcmlnaW5hbEluc3BlY3QgPSB0ZXN0Q29uZmlnU2VydmljZS5pbnNwZWN0LmJpbmQodGVzdENvbmZpZ1NlcnZpY2UpO1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2UuaW5zcGVjdCA9IDxUPihrZXk6IHN0cmluZywgb3ZlcnJpZGVzPzogSUNvbmZpZ3VyYXRpb25PdmVycmlkZXMpOiBJQ29uZmlndXJhdGlvblZhbHVlPFQ+ID0+IHtcblx0XHRcdFx0Y29uc3QgaW5zcGVjdGVkID0gb3JpZ2luYWxJbnNwZWN0PFQ+KGtleSwgb3ZlcnJpZGVzKTtcblx0XHRcdFx0cmV0dXJuIGtleSA9PT0gQ2hhdENvbmZpZ3VyYXRpb24uRW5hYmxlZFBsdWdpbnNcblx0XHRcdFx0XHQ/IHsgLi4uaW5zcGVjdGVkLCBwb2xpY3lWYWx1ZTogeyAnbWFuYWdlZC1wbHVnaW5AbWFuYWdlZC1tYXJrZXRwbGFjZSc6IHRydWUgfSBhcyBUIH1cblx0XHRcdFx0XHQ6IGluc3BlY3RlZDtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHBsdWdpbjogSUFnZW50UGx1Z2luID0ge1xuXHRcdFx0XHR1cmk6IHBsdWdpblVyaSxcblx0XHRcdFx0Zm9ybWF0OiBQbHVnaW5Gb3JtYXQuQ29waWxvdCxcblx0XHRcdFx0bGFiZWw6ICdtYW5hZ2VkLXBsdWdpbicsXG5cdFx0XHRcdGVuYWJsZW1lbnQ6IG9ic2VydmFibGVWYWx1ZSgnbWFuYWdlZFBsdWdpbkVuYWJsZW1lbnQnLCAyIC8qIENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkUHJvZmlsZSAqLyksXG5cdFx0XHRcdGhvb2tzOiBvYnNlcnZhYmxlVmFsdWUoJ21hbmFnZWRQbHVnaW5Ib29rcycsIFtdKSxcblx0XHRcdFx0Y29tbWFuZHM6IG9ic2VydmFibGVWYWx1ZSgnbWFuYWdlZFBsdWdpbkNvbW1hbmRzJywgW10pLFxuXHRcdFx0XHRza2lsbHM6IG9ic2VydmFibGVWYWx1ZSgnbWFuYWdlZFBsdWdpblNraWxscycsIFtdKSxcblx0XHRcdFx0YWdlbnRzOiBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUFnZW50UGx1Z2luQWdlbnRbXT4oJ21hbmFnZWRQbHVnaW5BZ2VudHMnLCBbeyB1cmk6IGFnZW50VXJpLCBuYW1lOiAncmV2aWV3ZXInIH1dKSxcblx0XHRcdFx0aW5zdHJ1Y3Rpb25zOiBvYnNlcnZhYmxlVmFsdWUoJ21hbmFnZWRQbHVnaW5JbnN0cnVjdGlvbnMnLCBbXSksXG5cdFx0XHRcdG1jcFNlcnZlckRlZmluaXRpb25zOiBvYnNlcnZhYmxlVmFsdWUoJ21hbmFnZWRQbHVnaW5NY3BTZXJ2ZXJzJywgW10pLFxuXHRcdFx0fTtcblx0XHRcdHRlc3RQbHVnaW5zT2JzZXJ2YWJsZS5zZXQoW3BsdWdpbl0sIHVuZGVmaW5lZCk7XG5cdFx0XHRmaXJlQ29uZmlnQ2hhbmdlKHRlc3RDb25maWdTZXJ2aWNlLCBDT1BJTE9UX0FMTE9XX01BTkFHRURfSE9PS1NfT05MWV9DT05GSUcsIENoYXRDb25maWd1cmF0aW9uLkVuYWJsZWRQbHVnaW5zKTtcblxuXHRcdFx0Y29uc3QgYWdlbnRzID0gYXdhaXQgc2VydmljZS5nZXRDdXN0b21BZ2VudHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRzWzBdLmhvb2tzPy5bSG9va1R5cGUuUHJlVG9vbFVzZV0/LlswXS5jb21tYW5kLCAnZWNobyBtYW5hZ2VkJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdob29rcycsICgpID0+IHtcblx0XHRjb25zdCBjcmVhdGVUZXN0UGx1Z2luID0gKHBhdGg6IHN0cmluZywgaW5pdGlhbEhvb2tzOiByZWFkb25seSBJQWdlbnRQbHVnaW5Ib29rW10pOiB7IHBsdWdpbjogSUFnZW50UGx1Z2luOyBob29rczogSVNldHRhYmxlT2JzZXJ2YWJsZTxyZWFkb25seSBJQWdlbnRQbHVnaW5Ib29rW10+IH0gPT4ge1xuXHRcdFx0Y29uc3QgZW5hYmxlbWVudCA9IG9ic2VydmFibGVWYWx1ZSgndGVzdFBsdWdpbkVuYWJsZW1lbnQnLCAyIC8qIENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkUHJvZmlsZSAqLyk7XG5cdFx0XHRjb25zdCBob29rcyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJQWdlbnRQbHVnaW5Ib29rW10+KCd0ZXN0UGx1Z2luSG9va3MnLCBpbml0aWFsSG9va3MpO1xuXHRcdFx0Y29uc3QgY29tbWFuZHMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUFnZW50UGx1Z2luQ29tbWFuZFtdPigndGVzdFBsdWdpbkNvbW1hbmRzJywgW10pO1xuXHRcdFx0Y29uc3Qgc2tpbGxzID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElBZ2VudFBsdWdpblNraWxsW10+KCd0ZXN0UGx1Z2luU2tpbGxzJywgW10pO1xuXHRcdFx0Y29uc3QgYWdlbnRzID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElBZ2VudFBsdWdpbkFnZW50W10+KCd0ZXN0UGx1Z2luQWdlbnRzJywgW10pO1xuXHRcdFx0Y29uc3QgaW5zdHJ1Y3Rpb25zID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElBZ2VudFBsdWdpbkluc3RydWN0aW9uW10+KCd0ZXN0UGx1Z2luSW5zdHJ1Y3Rpb25zJywgW10pO1xuXHRcdFx0Y29uc3QgbWNwU2VydmVyRGVmaW5pdGlvbnMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUFnZW50UGx1Z2luTWNwU2VydmVyRGVmaW5pdGlvbltdPigndGVzdFBsdWdpbk1jcFNlcnZlckRlZmluaXRpb25zJywgW10pO1xuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRwbHVnaW46IHtcblx0XHRcdFx0XHR1cmk6IFVSSS5maWxlKHBhdGgpLFxuXHRcdFx0XHRcdGZvcm1hdDogUGx1Z2luRm9ybWF0LkNvcGlsb3QsXG5cdFx0XHRcdFx0bGFiZWw6IGJhc2VuYW1lKFVSSS5maWxlKHBhdGgpKSxcblx0XHRcdFx0XHRlbmFibGVtZW50LFxuXHRcdFx0XHRcdHJlbW92ZTogKCkgPT4geyB9LFxuXHRcdFx0XHRcdGhvb2tzLFxuXHRcdFx0XHRcdGNvbW1hbmRzLFxuXHRcdFx0XHRcdHNraWxscyxcblx0XHRcdFx0XHRhZ2VudHMsXG5cdFx0XHRcdFx0aW5zdHJ1Y3Rpb25zLFxuXHRcdFx0XHRcdG1jcFNlcnZlckRlZmluaXRpb25zLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRob29rcyxcblx0XHRcdH07XG5cdFx0fTtcblxuXHRcdHRlc3QoJ211bHRpLXJvb3Qgd29ya3NwYWNlIHJlc29sdmVzIGN3ZCB0byBwZXItaG9vay1maWxlIHdvcmtzcGFjZSBmb2xkZXInLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBmb2xkZXIxVXJpID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UtYScpO1xuXHRcdFx0Y29uc3QgZm9sZGVyMlVyaSA9IFVSSS5maWxlKCcvd29ya3NwYWNlLWInKTtcblxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2UoZm9sZGVyMVVyaSwgZm9sZGVyMlVyaSkpO1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQ0hBVF9IT09LUywgdHJ1ZSk7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLkhPT0tTX0xPQ0FUSU9OX0tFWSwgeyBbSE9PS1NfU09VUkNFX0ZPTERFUl06IHRydWUgfSk7XG5cblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogJy93b3Jrc3BhY2UtYS8uZ2l0aHViL2hvb2tzL215LWhvb2suanNvbicsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0XHRcdFx0aG9va3M6IHtcblx0XHRcdFx0XHRcdFx0XHRbSG9va1R5cGUuUHJlVG9vbFVzZV06IFtcblx0XHRcdFx0XHRcdFx0XHRcdHsgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAnZWNobyBmb2xkZXItYScgfSxcblx0XHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0fSksXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6ICcvd29ya3NwYWNlLWIvLmdpdGh1Yi9ob29rcy9teS1ob29rLmpzb24nLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHRKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdFx0XHRcdGhvb2tzOiB7XG5cdFx0XHRcdFx0XHRcdFx0W0hvb2tUeXBlLlByZVRvb2xVc2VdOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ2VjaG8gZm9sZGVyLWInIH0sXG5cdFx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5nZXRIb29rcyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQsICdFeHBlY3RlZCBob29rcyByZXN1bHQnKTtcblxuXHRcdFx0Y29uc3QgcHJlVG9vbFVzZUhvb2tzID0gcmVzdWx0Lmhvb2tzW0hvb2tUeXBlLlByZVRvb2xVc2VdO1xuXHRcdFx0YXNzZXJ0Lm9rKHByZVRvb2xVc2VIb29rcywgJ0V4cGVjdGVkIFByZVRvb2xVc2UgaG9va3MnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmVUb29sVXNlSG9va3MubGVuZ3RoLCAyLCAnRXhwZWN0ZWQgdHdvIFByZVRvb2xVc2UgaG9va3MnKTtcblxuXHRcdFx0Y29uc3QgaG9va0EgPSBwcmVUb29sVXNlSG9va3MuZmluZChoID0+IGguY29tbWFuZCA9PT0gJ2VjaG8gZm9sZGVyLWEnKTtcblx0XHRcdGNvbnN0IGhvb2tCID0gcHJlVG9vbFVzZUhvb2tzLmZpbmQoaCA9PiBoLmNvbW1hbmQgPT09ICdlY2hvIGZvbGRlci1iJyk7XG5cdFx0XHRhc3NlcnQub2soaG9va0EsICdFeHBlY3RlZCBob29rIGZyb20gZm9sZGVyLWEnKTtcblx0XHRcdGFzc2VydC5vayhob29rQiwgJ0V4cGVjdGVkIGhvb2sgZnJvbSBmb2xkZXItYicpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG9va0EuY3dkPy5wYXRoLCBmb2xkZXIxVXJpLnBhdGgsICdIb29rIGZyb20gZm9sZGVyLWEgc2hvdWxkIGhhdmUgY3dkIHBvaW50aW5nIHRvIHdvcmtzcGFjZS1hJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG9va0IuY3dkPy5wYXRoLCBmb2xkZXIyVXJpLnBhdGgsICdIb29rIGZyb20gZm9sZGVyLWIgc2hvdWxkIGhhdmUgY3dkIHBvaW50aW5nIHRvIHdvcmtzcGFjZS1iJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbmNsdWRlcyBob29rcyBmcm9tIGFnZW50IHBsdWdpbnMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9DSEFUX0hPT0tTLCB0cnVlKTtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuSE9PS1NfTE9DQVRJT05fS0VZLCB7fSk7XG5cblx0XHRcdGNvbnN0IHsgcGx1Z2luIH0gPSBjcmVhdGVUZXN0UGx1Z2luKCcvcGx1Z2lucy90ZXN0LXBsdWdpbicsIFt7XG5cdFx0XHRcdHR5cGU6IEhvb2tUeXBlLlByZVRvb2xVc2UsXG5cdFx0XHRcdG9yaWdpbmFsSWQ6ICdwbHVnaW4tcHJlLXRvb2wtdXNlJyxcblx0XHRcdFx0aG9va3M6IFt7IGNvbW1hbmQ6ICdlY2hvIGZyb20tcGx1Z2luJyB9XSxcblx0XHRcdFx0dXJpOiBVUkkuZmlsZSgnL3BsdWdpbnMvdGVzdC1wbHVnaW4vaG9va3MuanNvbicpLFxuXHRcdFx0fV0pO1xuXG5cdFx0XHR0ZXN0UGx1Z2luc09ic2VydmFibGUuc2V0KFtwbHVnaW5dLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmdldEhvb2tzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCwgJ0V4cGVjdGVkIGhvb2tzIHJlc3VsdCcpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5ob29rc1tIb29rVHlwZS5QcmVUb29sVXNlXSwgW3tcblx0XHRcdFx0Y29tbWFuZDogJ2VjaG8gZnJvbS1wbHVnaW4nLFxuXHRcdFx0XHRzb3VyY2VVcmk6IFVSSS5maWxlKCcvcGx1Z2lucy90ZXN0LXBsdWdpbi9ob29rcy5qc29uJyksXG5cdFx0XHR9XSwgJ0V4cGVjdGVkIHBsdWdpbiBob29rcyB0byBiZSBpbmNsdWRlZCBpbiBjb21wdXRlZCBob29rcycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWFuYWdlZC1vbmx5IGhvb2tzIGJsb2NrIHN0YW5kYWxvbmUgYW5kIHVubWFuYWdlZCBwbHVnaW4gaG9va3MnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyVXJpID0gVVJJLmZpbGUoJy9tYW5hZ2VkLWhvb2tzLW9ubHknKTtcblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKHJvb3RGb2xkZXJVcmkpKTtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0NIQVRfSE9PS1MsIHRydWUpO1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5IT09LU19MT0NBVElPTl9LRVksIHsgW0hPT0tTX1NPVVJDRV9GT0xERVJdOiB0cnVlIH0pO1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ09QSUxPVF9BTExPV19NQU5BR0VEX0hPT0tTX09OTFlfQ09ORklHLCB0cnVlKTtcblx0XHRcdGZpcmVDb25maWdDaGFuZ2UodGVzdENvbmZpZ1NlcnZpY2UsIENPUElMT1RfQUxMT1dfTUFOQUdFRF9IT09LU19PTkxZX0NPTkZJRyk7XG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFt7XG5cdFx0XHRcdHBhdGg6ICcvbWFuYWdlZC1ob29rcy1vbmx5Ly5naXRodWIvaG9va3MvaG9va3MuanNvbicsXG5cdFx0XHRcdGNvbnRlbnRzOiBbSlNPTi5zdHJpbmdpZnkoeyBob29rczogeyBbSG9va1R5cGUuUHJlVG9vbFVzZV06IFt7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ2VjaG8gd29ya3NwYWNlJyB9XSB9IH0pXSxcblx0XHRcdH1dKTtcblxuXHRcdFx0Y29uc3QgeyBwbHVnaW4gfSA9IGNyZWF0ZVRlc3RQbHVnaW4oJy9wbHVnaW5zL3VubWFuYWdlZCcsIFt7XG5cdFx0XHRcdHR5cGU6IEhvb2tUeXBlLlByZVRvb2xVc2UsXG5cdFx0XHRcdG9yaWdpbmFsSWQ6ICdwbHVnaW4taG9vaycsXG5cdFx0XHRcdGhvb2tzOiBbeyBjb21tYW5kOiAnZWNobyBwbHVnaW4nIH1dLFxuXHRcdFx0XHR1cmk6IFVSSS5maWxlKCcvcGx1Z2lucy91bm1hbmFnZWQvaG9va3MuanNvbicpLFxuXHRcdFx0fV0pO1xuXHRcdFx0dGVzdFBsdWdpbnNPYnNlcnZhYmxlLnNldChbcGx1Z2luXSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuZ2V0SG9va3MoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UubGlzdFByb21wdEZpbGVzKFByb21wdHNUeXBlLmhvb2ssIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWNvbXB1dGVzIGhvb2tzIHdoZW4gYWdlbnQgcGx1Z2luIGhvb2tzIGNoYW5nZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0NIQVRfSE9PS1MsIHRydWUpO1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5IT09LU19MT0NBVElPTl9LRVksIHt9KTtcblxuXHRcdFx0Y29uc3QgeyBwbHVnaW4sIGhvb2tzIH0gPSBjcmVhdGVUZXN0UGx1Z2luKCcvcGx1Z2lucy90ZXN0LXBsdWdpbicsIFt7XG5cdFx0XHRcdHR5cGU6IEhvb2tUeXBlLlByZVRvb2xVc2UsXG5cdFx0XHRcdG9yaWdpbmFsSWQ6ICdwbHVnaW4tcHJlLXRvb2wtdXNlJyxcblx0XHRcdFx0aG9va3M6IFt7IGNvbW1hbmQ6ICdlY2hvIGJlZm9yZScgfV0sXG5cdFx0XHRcdHVyaTogVVJJLmZpbGUoJy9wbHVnaW5zL3Rlc3QtcGx1Z2luL2hvb2tzLmpzb24nKSxcblx0XHRcdH1dKTtcblxuXHRcdFx0dGVzdFBsdWdpbnNPYnNlcnZhYmxlLnNldChbcGx1Z2luXSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0Y29uc3QgYmVmb3JlID0gYXdhaXQgc2VydmljZS5nZXRIb29rcyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydC5vayhiZWZvcmUsICdFeHBlY3RlZCBob29rcyByZXN1bHQgYmVmb3JlIHBsdWdpbiB1cGRhdGUnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYmVmb3JlLmhvb2tzW0hvb2tUeXBlLlByZVRvb2xVc2VdLCBbeyBjb21tYW5kOiAnZWNobyBiZWZvcmUnLCBzb3VyY2VVcmk6IFVSSS5maWxlKCcvcGx1Z2lucy90ZXN0LXBsdWdpbi9ob29rcy5qc29uJykgfV0pO1xuXG5cdFx0XHRob29rcy5zZXQoW3tcblx0XHRcdFx0dHlwZTogSG9va1R5cGUuUHJlVG9vbFVzZSxcblx0XHRcdFx0b3JpZ2luYWxJZDogJ3BsdWdpbi1wcmUtdG9vbC11c2UnLFxuXHRcdFx0XHRob29rczogW3sgY29tbWFuZDogJ2VjaG8gYWZ0ZXInIH1dLFxuXHRcdFx0XHR1cmk6IFVSSS5maWxlKCcvcGx1Z2lucy90ZXN0LXBsdWdpbi9ob29rcy5qc29uJyksXG5cdFx0XHR9XSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0Y29uc3QgYWZ0ZXIgPSBhd2FpdCBzZXJ2aWNlLmdldEhvb2tzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0Lm9rKGFmdGVyLCAnRXhwZWN0ZWQgaG9va3MgcmVzdWx0IGFmdGVyIHBsdWdpbiB1cGRhdGUnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWZ0ZXIuaG9va3NbSG9va1R5cGUuUHJlVG9vbFVzZV0sIFt7IGNvbW1hbmQ6ICdlY2hvIGFmdGVyJywgc291cmNlVXJpOiBVUkkuZmlsZSgnL3BsdWdpbnMvdGVzdC1wbHVnaW4vaG9va3MuanNvbicpIH1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gd29ya3NwYWNlIGlzIHVudHJ1c3RlZCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh0ZXN0V29ya3NwYWNlKFVSSS5maWxlKCcvdGVzdC13b3Jrc3BhY2UnKSkpO1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQ0hBVF9IT09LUywgdHJ1ZSk7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLkhPT0tTX0xPQ0FUSU9OX0tFWSwgeyBbSE9PS1NfU09VUkNFX0ZPTERFUl06IHRydWUgfSk7XG5cblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogJy90ZXN0LXdvcmtzcGFjZS8uZ2l0aHViL2hvb2tzL215LWhvb2suanNvbicsXG5cdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0XHRcdFx0aG9va3M6IHtcblx0XHRcdFx0XHRcdFx0XHRbSG9va1R5cGUuUHJlVG9vbFVzZV06IFtcblx0XHRcdFx0XHRcdFx0XHRcdHsgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAnZWNobyB0ZXN0JyB9LFxuXHRcdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cblx0XHRcdC8vIFRydXN0ZWQgd29ya3NwYWNlIHNob3VsZCByZXR1cm4gaG9va3Ncblx0XHRcdGNvbnN0IHRydXN0ZWRSZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmdldEhvb2tzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0Lm9rKHRydXN0ZWRSZXN1bHQsICdFeHBlY3RlZCBob29rcyB3aGVuIHdvcmtzcGFjZSBpcyB0cnVzdGVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJ1c3RlZFJlc3VsdC5ob29rc1tIb29rVHlwZS5QcmVUb29sVXNlXT8ubGVuZ3RoLCAxKTtcblxuXHRcdFx0Ly8gVW50cnVzdGVkIHdvcmtzcGFjZSBzaG91bGQgcmV0dXJuIHVuZGVmaW5lZFxuXHRcdFx0YXdhaXQgd29ya3NwYWNlVHJ1c3RTZXJ2aWNlLnNldFdvcmtzcGFjZVRydXN0KGZhbHNlKTtcblx0XHRcdGNvbnN0IHVudHJ1c3RlZFJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuZ2V0SG9va3MoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW50cnVzdGVkUmVzdWx0LCB1bmRlZmluZWQsICdFeHBlY3RlZCB1bmRlZmluZWQgaG9va3Mgd2hlbiB3b3Jrc3BhY2UgaXMgdW50cnVzdGVkJyk7XG5cblx0XHRcdC8vIFJlLXRydXN0aW5nIHNob3VsZCByZXR1cm4gaG9va3MgYWdhaW5cblx0XHRcdGF3YWl0IHdvcmtzcGFjZVRydXN0U2VydmljZS5zZXRXb3Jrc3BhY2VUcnVzdCh0cnVlKTtcblx0XHRcdGNvbnN0IHJlVHJ1c3RlZFJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuZ2V0SG9va3MoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQub2socmVUcnVzdGVkUmVzdWx0LCAnRXhwZWN0ZWQgaG9va3MgYWZ0ZXIgd29ya3NwYWNlIGJlY29tZXMgdHJ1c3RlZCBhZ2FpbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlVHJ1c3RlZFJlc3VsdC5ob29rc1tIb29rVHlwZS5QcmVUb29sVXNlXT8ubGVuZ3RoLCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N1cHByZXNzZXMgcGx1Z2luIGhvb2tzIHdoZW4gd29ya3NwYWNlIGlzIHVudHJ1c3RlZCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0NIQVRfSE9PS1MsIHRydWUpO1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5IT09LU19MT0NBVElPTl9LRVksIHt9KTtcblxuXHRcdFx0Y29uc3QgeyBwbHVnaW4gfSA9IGNyZWF0ZVRlc3RQbHVnaW4oJy9wbHVnaW5zL3Rlc3QtcGx1Z2luJywgW3tcblx0XHRcdFx0dHlwZTogSG9va1R5cGUuUHJlVG9vbFVzZSxcblx0XHRcdFx0b3JpZ2luYWxJZDogJ3BsdWdpbi1wcmUtdG9vbC11c2UnLFxuXHRcdFx0XHRob29rczogW3sgY29tbWFuZDogJ2VjaG8gZnJvbS1wbHVnaW4nIH1dLFxuXHRcdFx0XHR1cmk6IFVSSS5maWxlKCcvcGx1Z2lucy90ZXN0LXBsdWdpbi9ob29rcy5qc29uJyksXG5cdFx0XHR9XSk7XG5cblx0XHRcdHRlc3RQbHVnaW5zT2JzZXJ2YWJsZS5zZXQoW3BsdWdpbl0sIHVuZGVmaW5lZCk7XG5cblx0XHRcdGF3YWl0IHdvcmtzcGFjZVRydXN0U2VydmljZS5zZXRXb3Jrc3BhY2VUcnVzdChmYWxzZSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmdldEhvb2tzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkLCAnRXhwZWN0ZWQgdW5kZWZpbmVkIGhvb2tzIHdoZW4gd29ya3NwYWNlIGlzIHVudHJ1c3RlZCwgZXZlbiB3aXRoIHBsdWdpbiBob29rcycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnQ2xhdWRlIGhvb2tzIHdpdGggZGlzYWJsZUFsbEhvb2tzIHNob3VsZCBub3QgcmVwb3J0IGhhc0Rpc2FibGVkQ2xhdWRlSG9va3Mgd2hlbiBDbGF1ZGUgaG9va3Mgc2V0dGluZyBpcyBvZmYnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHQvLyBBIENsYXVkZSBzZXR0aW5ncyBmaWxlIHRoYXQgaGFzIGRpc2FibGVBbGxIb29rczogdHJ1ZSBidXQgZGVmaW5lcyBob29rcy5cblx0XHRcdC8vIFdoZW4gVVNFX0NMQVVERV9IT09LUyBpcyBmYWxzZSwgdGhlIG9sZCBjb2RlIHNraXBwZWQgdGhpcyBmaWxlIGR1ZSB0b1xuXHRcdFx0Ly8gZGlzYWJsZWRBbGxIb29rcyBiZWZvcmUgcmVhY2hpbmcgdGhlIENsYXVkZSBjaGVjaywgc28gaGFzRGlzYWJsZWRDbGF1ZGVIb29rcyB3YXMgZmFsc2UuXG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VVcmkgPSBVUkkuZmlsZSgnL3Rlc3Qtd29ya3NwYWNlJyk7XG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2UodGVzdFdvcmtzcGFjZSh3b3Jrc3BhY2VVcmkpKTtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0NIQVRfSE9PS1MsIHRydWUpO1xuXHRcdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQ0xBVURFX0hPT0tTLCBmYWxzZSk7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLkhPT0tTX0xPQ0FUSU9OX0tFWSwgeyBbSE9PS1NfU09VUkNFX0ZPTERFUl06IHRydWUgfSk7XG5cblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogJy90ZXN0LXdvcmtzcGFjZS8uY2xhdWRlL3NldHRpbmdzLmpzb24nLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHRKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdFx0XHRcdGRpc2FibGVBbGxIb29rczogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0aG9va3M6IHtcblx0XHRcdFx0XHRcdFx0XHRQcmVUb29sVXNlOiBbeyB0eXBlOiAnY29tbWFuZCcsIGNvbW1hbmQ6ICdlY2hvIGRpc2FibGVkLWNsYXVkZS1ob29rJyB9XSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5nZXRIb29rcyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdC8vIE5vIGhvb2tzIHNob3VsZCBiZSBjb2xsZWN0ZWQgKHRoZSBvbmx5IGZpbGUgaGFzIGRpc2FibGVBbGxIb29rcylcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCwgJ0V4cGVjdGVkIG5vIGhvb2tzIHJlc3VsdCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGx1Z2luIGhvb2tzIGFwcGVhciBpbiBob29rIGRpc2NvdmVyeSBpbmZvIGZpbGVzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Ly8gUGx1Z2luIGhvb2tzIHNob3VsZCBiZSByZXBvcnRlZCBpbiB0aGUgZGlzY292ZXJ5IGluZm8gZmlsZXMgYXJyYXlcblx0XHRcdC8vIHNvIHRoYXQgZGlhZ25vc3RpYyB2aWV3cyBjYW4gZGlzcGxheSB0aGVtLlxuXHRcdFx0Y29uc3Qgd29ya3NwYWNlVXJpID0gVVJJLmZpbGUoJy90ZXN0LXdvcmtzcGFjZScpO1xuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHRlc3RXb3Jrc3BhY2Uod29ya3NwYWNlVXJpKSk7XG5cdFx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9DSEFUX0hPT0tTLCB0cnVlKTtcblx0XHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuSE9PS1NfTE9DQVRJT05fS0VZLCB7IFtIT09LU19TT1VSQ0VfRk9MREVSXTogdHJ1ZSB9KTtcblxuXHRcdFx0Y29uc3QgcGx1Z2luSG9va1VyaSA9IFVSSS5maWxlKCcvcGx1Z2lucy90ZXN0LXBsdWdpbi9ob29rcy5qc29uJyk7XG5cdFx0XHRjb25zdCB7IHBsdWdpbiB9ID0gY3JlYXRlVGVzdFBsdWdpbignL3BsdWdpbnMvdGVzdC1wbHVnaW4nLCBbe1xuXHRcdFx0XHR0eXBlOiBIb29rVHlwZS5QcmVUb29sVXNlLFxuXHRcdFx0XHRvcmlnaW5hbElkOiAncGx1Z2luLXByZS10b29sLXVzZScsXG5cdFx0XHRcdGhvb2tzOiBbeyBjb21tYW5kOiAnZWNobyBmcm9tLXBsdWdpbicgfV0sXG5cdFx0XHRcdHVyaTogcGx1Z2luSG9va1VyaSxcblx0XHRcdH1dKTtcblxuXHRcdFx0dGVzdFBsdWdpbnNPYnNlcnZhYmxlLnNldChbcGx1Z2luXSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5nZXRIb29rcyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGNvbnN0IGNhcHR1cmVkRGlzY292ZXJ5SW5mbyA9IGF3YWl0IHNlcnZpY2UuZ2V0RGlzY292ZXJ5SW5mbyhQcm9tcHRzVHlwZS5ob29rLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCwgJ0V4cGVjdGVkIGhvb2tzIHJlc3VsdCB3aXRoIHBsdWdpbiBob29rcycpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNhcHR1cmVkRGlzY292ZXJ5SW5mbywgJ0V4cGVjdGVkIGRpc2NvdmVyeSBpbmZvIHRvIGJlIGxvZ2dlZCcpO1xuXG5cdFx0XHQvLyBQbHVnaW4gaG9vayBmaWxlIHNob3VsZCBhcHBlYXIgaW4gZGlzY292ZXJ5IGZpbGVzXG5cdFx0XHRjb25zdCBwbHVnaW5GaWxlID0gY2FwdHVyZWREaXNjb3ZlcnlJbmZvIS5maWxlcy5maW5kKFxuXHRcdFx0XHRmID0+IGYucHJvbXB0UGF0aC5zdG9yYWdlID09PSBQcm9tcHRzU3RvcmFnZS5wbHVnaW5cblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQub2socGx1Z2luRmlsZSwgJ1BsdWdpbiBob29rIGZpbGUgc2hvdWxkIGJlIHByZXNlbnQgaW4gZGlzY292ZXJ5IGluZm8gZmlsZXMnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3BsdWdpbiBpbnN0cnVjdGlvbnMnLCAoKSA9PiB7XG5cdFx0ZnVuY3Rpb24gY3JlYXRlUGx1Z2luV2l0aEluc3RydWN0aW9ucyhcblx0XHRcdHBhdGg6IHN0cmluZyxcblx0XHRcdGluaXRpYWxJbnN0cnVjdGlvbnM6IHJlYWRvbmx5IElBZ2VudFBsdWdpbkluc3RydWN0aW9uW10sXG5cdFx0KTogeyBwbHVnaW46IElBZ2VudFBsdWdpbjsgaW5zdHJ1Y3Rpb25zOiBJU2V0dGFibGVPYnNlcnZhYmxlPHJlYWRvbmx5IElBZ2VudFBsdWdpbkluc3RydWN0aW9uW10+IH0ge1xuXHRcdFx0Y29uc3QgZW5hYmxlbWVudCA9IG9ic2VydmFibGVWYWx1ZSgndGVzdFBsdWdpbkVuYWJsZW1lbnQnLCAyIC8qIENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkUHJvZmlsZSAqLyk7XG5cdFx0XHRjb25zdCBob29rcyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJQWdlbnRQbHVnaW5Ib29rW10+KCd0ZXN0UGx1Z2luSG9va3MnLCBbXSk7XG5cdFx0XHRjb25zdCBjb21tYW5kcyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJQWdlbnRQbHVnaW5Db21tYW5kW10+KCd0ZXN0UGx1Z2luQ29tbWFuZHMnLCBbXSk7XG5cdFx0XHRjb25zdCBza2lsbHMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUFnZW50UGx1Z2luU2tpbGxbXT4oJ3Rlc3RQbHVnaW5Ta2lsbHMnLCBbXSk7XG5cdFx0XHRjb25zdCBhZ2VudHMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUFnZW50UGx1Z2luQWdlbnRbXT4oJ3Rlc3RQbHVnaW5BZ2VudHMnLCBbXSk7XG5cdFx0XHRjb25zdCBpbnN0cnVjdGlvbnMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUFnZW50UGx1Z2luSW5zdHJ1Y3Rpb25bXT4oJ3Rlc3RQbHVnaW5JbnN0cnVjdGlvbnMnLCBpbml0aWFsSW5zdHJ1Y3Rpb25zKTtcblx0XHRcdGNvbnN0IG1jcFNlcnZlckRlZmluaXRpb25zID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElBZ2VudFBsdWdpbk1jcFNlcnZlckRlZmluaXRpb25bXT4oJ3Rlc3RQbHVnaW5NY3BTZXJ2ZXJEZWZpbml0aW9ucycsIFtdKTtcblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cGx1Z2luOiB7XG5cdFx0XHRcdFx0dXJpOiBVUkkuZmlsZShwYXRoKSxcblx0XHRcdFx0XHRmb3JtYXQ6IFBsdWdpbkZvcm1hdC5Db3BpbG90LFxuXHRcdFx0XHRcdGxhYmVsOiBiYXNlbmFtZShVUkkuZmlsZShwYXRoKSksXG5cdFx0XHRcdFx0ZW5hYmxlbWVudCxcblx0XHRcdFx0XHRyZW1vdmU6ICgpID0+IHsgfSxcblx0XHRcdFx0XHRob29rcyxcblx0XHRcdFx0XHRjb21tYW5kcyxcblx0XHRcdFx0XHRza2lsbHMsXG5cdFx0XHRcdFx0YWdlbnRzLFxuXHRcdFx0XHRcdGluc3RydWN0aW9ucyxcblx0XHRcdFx0XHRtY3BTZXJ2ZXJEZWZpbml0aW9ucyxcblx0XHRcdFx0fSxcblx0XHRcdFx0aW5zdHJ1Y3Rpb25zLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHR0ZXN0KCdsaXN0cyBwbHVnaW4gaW5zdHJ1Y3Rpb25zIHZpYSBsaXN0UHJvbXB0RmlsZXMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBydWxlVXJpID0gVVJJLmZpbGUoJy9wbHVnaW5zL3Rlc3QtcGx1Z2luL3J1bGVzL3ByZWZlci1jb25zdC5tZGMnKTtcblx0XHRcdGNvbnN0IHsgcGx1Z2luIH0gPSBjcmVhdGVQbHVnaW5XaXRoSW5zdHJ1Y3Rpb25zKCcvcGx1Z2lucy90ZXN0LXBsdWdpbicsIFtcblx0XHRcdFx0eyB1cmk6IHJ1bGVVcmksIG5hbWU6ICdwcmVmZXItY29uc3QnIH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0dGVzdFBsdWdpbnNPYnNlcnZhYmxlLnNldChbcGx1Z2luXSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5saXN0UHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGNvbnN0IHBsdWdpbkluc3RydWN0aW9uID0gcmVzdWx0LmZpbmQocCA9PiBwLnVyaS50b1N0cmluZygpID09PSBydWxlVXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHBsdWdpbkluc3RydWN0aW9uLCAnUGx1Z2luIGluc3RydWN0aW9uIHNob3VsZCBhcHBlYXIgaW4gbGlzdFByb21wdEZpbGVzJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGx1Z2luSW5zdHJ1Y3Rpb24hLnN0b3JhZ2UsIFByb21wdHNTdG9yYWdlLnBsdWdpbik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1cGRhdGVzIGxpc3RlZCBpbnN0cnVjdGlvbnMgd2hlbiBwbHVnaW4gaW5zdHJ1Y3Rpb25zIGNoYW5nZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IHJ1bGVVcmkxID0gVVJJLmZpbGUoJy9wbHVnaW5zL3Rlc3QtcGx1Z2luL3J1bGVzL3J1bGUtYS5tZGMnKTtcblx0XHRcdGNvbnN0IHJ1bGVVcmkyID0gVVJJLmZpbGUoJy9wbHVnaW5zL3Rlc3QtcGx1Z2luL3J1bGVzL3J1bGUtYi5tZGMnKTtcblx0XHRcdGNvbnN0IHsgcGx1Z2luLCBpbnN0cnVjdGlvbnMgfSA9IGNyZWF0ZVBsdWdpbldpdGhJbnN0cnVjdGlvbnMoJy9wbHVnaW5zL3Rlc3QtcGx1Z2luJywgW1xuXHRcdFx0XHR7IHVyaTogcnVsZVVyaTEsIG5hbWU6ICdydWxlLWEnIH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0dGVzdFBsdWdpbnNPYnNlcnZhYmxlLnNldChbcGx1Z2luXSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0Y29uc3QgYmVmb3JlID0gYXdhaXQgc2VydmljZS5saXN0UHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGNvbnN0IGJlZm9yZVBsdWdpbiA9IGJlZm9yZS5maWx0ZXIocCA9PiBwLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLnBsdWdpbik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYmVmb3JlUGx1Z2luLmxlbmd0aCwgMSk7XG5cblx0XHRcdGNvbnN0IGV2ZW50RmlyZWQgPSBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IHNlcnZpY2Uub25EaWRDaGFuZ2VJbnN0cnVjdGlvbnMoKCkgPT4ge1xuXHRcdFx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0aW5zdHJ1Y3Rpb25zLnNldChbXG5cdFx0XHRcdHsgdXJpOiBydWxlVXJpMSwgbmFtZTogJ3J1bGUtYScgfSxcblx0XHRcdFx0eyB1cmk6IHJ1bGVVcmkyLCBuYW1lOiAncnVsZS1iJyB9LFxuXHRcdFx0XSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0YXdhaXQgZXZlbnRGaXJlZDtcblxuXHRcdFx0Y29uc3QgYWZ0ZXIgPSBhd2FpdCBzZXJ2aWNlLmxpc3RQcm9tcHRGaWxlcyhQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0Y29uc3QgYWZ0ZXJQbHVnaW4gPSBhZnRlci5maWx0ZXIocCA9PiBwLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLnBsdWdpbik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWZ0ZXJQbHVnaW4ubGVuZ3RoLCAyKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbW92ZXMgaW5zdHJ1Y3Rpb25zIHdoZW4gcGx1Z2luIGlzIHJlbW92ZWQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBydWxlVXJpID0gVVJJLmZpbGUoJy9wbHVnaW5zL3Rlc3QtcGx1Z2luL3J1bGVzL3J1bGUtYS5tZGMnKTtcblx0XHRcdGNvbnN0IHsgcGx1Z2luIH0gPSBjcmVhdGVQbHVnaW5XaXRoSW5zdHJ1Y3Rpb25zKCcvcGx1Z2lucy90ZXN0LXBsdWdpbicsIFtcblx0XHRcdFx0eyB1cmk6IHJ1bGVVcmksIG5hbWU6ICdydWxlLWEnIH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0dGVzdFBsdWdpbnNPYnNlcnZhYmxlLnNldChbcGx1Z2luXSwgdW5kZWZpbmVkKTtcblx0XHRcdGNvbnN0IHdpdGhQbHVnaW4gPSBhd2FpdCBzZXJ2aWNlLmxpc3RQcm9tcHRGaWxlcyhQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0Lm9rKHdpdGhQbHVnaW4uc29tZShwID0+IHAuc3RvcmFnZSA9PT0gUHJvbXB0c1N0b3JhZ2UucGx1Z2luKSk7XG5cblx0XHRcdHRlc3RQbHVnaW5zT2JzZXJ2YWJsZS5zZXQoW10sIHVuZGVmaW5lZCk7XG5cdFx0XHRjb25zdCB3aXRob3V0UGx1Z2luID0gYXdhaXQgc2VydmljZS5saXN0UHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydC5vayghd2l0aG91dFBsdWdpbi5zb21lKHAgPT4gcC5zdG9yYWdlID09PSBQcm9tcHRzU3RvcmFnZS5wbHVnaW4pKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25hbWVzcGFjZXMgcGx1Z2luIGluc3RydWN0aW9uIG5hbWVzIHdpdGggcGx1Z2luIGZvbGRlcicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IHJ1bGVVcmkgPSBVUkkuZmlsZSgnL3BsdWdpbnMvZGVwbG95LXRvb2xzL3J1bGVzL2xpbnQtY2hlY2subWRjJyk7XG5cdFx0XHRjb25zdCB7IHBsdWdpbiB9ID0gY3JlYXRlUGx1Z2luV2l0aEluc3RydWN0aW9ucygnL3BsdWdpbnMvZGVwbG95LXRvb2xzJywgW1xuXHRcdFx0XHR7IHVyaTogcnVsZVVyaSwgbmFtZTogJ2xpbnQtY2hlY2snIH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0dGVzdFBsdWdpbnNPYnNlcnZhYmxlLnNldChbcGx1Z2luXSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5saXN0UHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGNvbnN0IHBsdWdpbkluc3RydWN0aW9uID0gcmVzdWx0LmZpbmQocCA9PiBwLnVyaS50b1N0cmluZygpID09PSBydWxlVXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHBsdWdpbkluc3RydWN0aW9uLCAnUGx1Z2luIGluc3RydWN0aW9uIHNob3VsZCBiZSBsaXN0ZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5JbnN0cnVjdGlvbiEubmFtZSwgJ2RlcGxveS10b29sczpsaW50LWNoZWNrJyk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbmZ1bmN0aW9uIGZpcmVDb25maWdDaGFuZ2UoY29uZmlnU2VydmljZTogVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLCAuLi5rZXk6IHN0cmluZ1tdKTogdm9pZCB7XG5cdGNvbmZpZ1NlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uRW1pdHRlci5maXJlKHtcblx0XHRhZmZlY3RzQ29uZmlndXJhdGlvbjogKGs6IHN0cmluZykgPT4ga2V5LmluY2x1ZGVzKGspLFxuXHR9IHNhdGlzZmllcyBQYXJ0aWFsPElDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQ+IGFzIHVua25vd24gYXMgSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsWUFBWSxXQUFXO0FBQ3ZCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsbUJBQW1CLCtCQUErQjtBQUMzRCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLGFBQWE7QUFDdEIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxlQUFlO0FBQ3hCLFNBQThCLHVCQUF1QjtBQUNyRCxTQUFTLFVBQVUsb0JBQW9CO0FBQ3ZDLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGFBQWE7QUFDdEIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBNkQsNkJBQWtEO0FBQy9HLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsMkJBQWtEO0FBQzNELFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsYUFBYSxzQkFBc0I7QUFDNUMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxvQkFBb0IsNEJBQTRCLDJDQUEyQztBQUNwRyxTQUFTLHdCQUF3QiwyQkFBMkIsMkJBQTJCO0FBQ3ZGLFNBQVMsOEJBQThCLGdDQUFnQywwQ0FBMEM7QUFDakgsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxzQkFBc0Is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VDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxVQUNDLE1BQU0sR0FBRyxVQUFVO0FBQUEsVUFDbkIsVUFBVTtBQUFBLFlBQ1Q7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxNQUFNLEdBQUcsVUFBVTtBQUFBLFVBQ25CLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsTUFBTSxHQUFHLFVBQVU7QUFBQSxVQUNuQixVQUFVO0FBQUEsWUFDVDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsTUFBTSxHQUFHLFVBQVU7QUFBQSxVQUNuQixVQUFVO0FBQUEsWUFDVDtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBR0QsWUFBTSxVQUFVLGFBQWE7QUFBQSxRQUM1QjtBQUFBLFVBQ0MsTUFBTSxHQUFHLHFCQUFxQjtBQUFBLFVBQzlCLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsTUFBTSxHQUFHLHFCQUFxQjtBQUFBLFVBQzlCLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsTUFBTSxHQUFHLHFCQUFxQjtBQUFBLFVBQzlCLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNE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O0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxVQUNDLE1BQU0sR0FBRyxVQUFVO0FBQUEsVUFDbkIsVUFBVTtBQUFBLFlBQ1Q7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxNQUFNLEdBQUcsVUFBVTtBQUFBLFVBQ25CLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsTUFBTSxHQUFHLFVBQVU7QUFBQSxVQUNuQixVQUFVO0FBQUEsWUFDVDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsTUFBTSxHQUFHLFVBQVU7QUFBQSxVQUNuQixVQUFVO0FBQUEsWUFDVDtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBR0QsWUFBTSxVQUFVLGFBQWE7QUFBQSxRQUM1QjtBQUFBLFVBQ0MsTUFBTSxHQUFHLHFCQUFxQjtBQUFBLFVBQzlCLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsTUFBTSxHQUFHLHFCQUFxQjtBQUFBLFVBQzlCLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsTUFBTSxHQUFHLHFCQUFxQjtBQUFBLFVBQzlCLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxZQUFNLG1CQUFtQixNQUFNLFFBQVEsb0JBQW9CLGtCQUFrQixJQUFJO0FBQ2pGLFlBQU0sa0JBQWtCLGFBQWEsZUFBZSw4QkFBOEIsYUFBYSxPQUFPLFFBQVcsUUFBVyxPQUFPO0FBQ25JLFlBQU0sVUFBVTtBQUFBLFFBQ2YsT0FBTyxJQUFJLFlBQVk7QUFBQSxVQUN0QixJQUFJLFNBQVMsZUFBZSxrQkFBa0I7QUFBQSxVQUM5QyxJQUFJLFNBQVMsZUFBZSxtQkFBbUI7QUFBQSxVQUMvQyxJQUFJLFNBQVMsZUFBZSx1QkFBdUI7QUFBQSxRQUNwRCxDQUFDO0FBQUEsUUFDRCxjQUFjLElBQUksWUFBWTtBQUFBLE1BQy9CO0FBRUEsWUFBTSxTQUFTLElBQUksdUJBQXVCO0FBQzFDLFlBQU0sZ0JBQWdCLHdCQUF3QixrQkFBa0IsU0FBUyxRQUFRLCtCQUErQixHQUFHLG1DQUFtQyxHQUFHLGtCQUFrQixJQUFJO0FBRS9LLGFBQU87QUFBQSxRQUNOLE9BQU8sUUFBUSxFQUFFLElBQUksT0FBSywwQkFBMEIsQ0FBQyxJQUFJLEVBQUUsTUFBTSxPQUFPLE1BQVM7QUFBQSxRQUNqRjtBQUFBO0FBQUEsVUFFQyxJQUFJLFNBQVMsZUFBZSx1Q0FBdUMsRUFBRTtBQUFBLFVBQ3JFLElBQUksU0FBUyxlQUFlLHVDQUF1QyxFQUFFO0FBQUE7QUFBQSxVQUVyRSxJQUFJLFNBQVMsc0JBQXNCLHdCQUF3QixFQUFFO0FBQUEsUUFDOUQ7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssc0NBQXNDLFlBQVk7QUFDdEQsWUFBTSxpQkFBaUI7QUFDdkIsWUFBTSxhQUFhLElBQUksY0FBYztBQUNyQyxZQUFNLGdCQUFnQixJQUFJLEtBQUssVUFBVTtBQUV6Qyw4QkFBd0IsYUFBYSxjQUFjLGFBQWEsQ0FBQztBQUdqRSxZQUFNLFVBQVUsYUFBYTtBQUFBLFFBQzVCO0FBQUEsVUFDQyxNQUFNLEdBQUcsVUFBVTtBQUFBLFVBQ25CLFVBQVU7QUFBQSxZQUNUO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxNQUFNLEdBQUcsVUFBVTtBQUFBLFVBQ25CLFVBQVU7QUFBQSxZQUNUO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxNQUFNLEdBQUcsVUFBVTtBQUFBLFVBQ25CLFVBQVU7QUFBQSxZQUNUO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxNQUFNLEdBQUcsVUFBVTtBQUFBLFVBQ25CLFVBQVU7QUFBQSxZQUNUO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxNQUFNLEdBQUcsVUFBVTtBQUFBLFVBQ25CLFVBQVU7QUFBQSxZQUNUO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxNQUFNLEdBQUcsVUFBVTtBQUFBLFVBQ25CLFVBQVU7QUFBQSxZQUNUO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFHRCxZQUFNLGtCQUFrQixhQUFhLGVBQWUsOEJBQThCLGFBQWEsT0FBTyxRQUFXLFFBQVcsT0FBTztBQUNuSSxZQUFNLFVBQVUsSUFBSSx1QkFBdUI7QUFDM0MsY0FBUSxJQUFJLG9CQUFvQixJQUFJLFNBQVMsZUFBZSxXQUFXLENBQUMsQ0FBQztBQUV6RSxZQUFNLGdCQUFnQixRQUFRLFNBQVMsa0JBQWtCLElBQUk7QUFFN0QsYUFBTztBQUFBLFFBQ04sUUFBUSxRQUFRLEVBQUUsSUFBSSxPQUFLLDBCQUEwQixDQUFDLElBQUksRUFBRSxNQUFNLE9BQU8sTUFBUyxFQUFFLE9BQU8sT0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUs7QUFBQSxRQUMxRztBQUFBLFVBQ0MsSUFBSSxTQUFTLGVBQWUsaUNBQWlDLEVBQUU7QUFBQSxVQUMvRCxJQUFJLFNBQVMsZUFBZSwyQkFBMkIsRUFBRTtBQUFBLFVBQ3pELElBQUksU0FBUyxlQUFlLFdBQVcsRUFBRTtBQUFBLFVBQ3pDLElBQUksU0FBUyxlQUFlLGNBQWMsRUFBRTtBQUFBLFFBQzdDLEVBQUUsS0FBSztBQUFBLFFBQ1A7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyx3Q0FBd0MsWUFBWTtBQUN4RCxZQUFNLGFBQWEsUUFBUSw2QkFBNkIsTUFBTTtBQUFBLE1BQUUsQ0FBQztBQUNqRSxZQUFNLElBQUksUUFBUSxhQUFXLFdBQVcsU0FBUyxDQUFDLENBQUM7QUFDbkQsaUJBQVcsUUFBUTtBQUFBLElBQ3BCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLG1CQUFtQixNQUFNO0FBQzlCLGFBQVMsTUFBTTtBQUNkLFlBQU0sUUFBUTtBQUFBLElBQ2YsQ0FBQztBQUdELFNBQUssd0JBQXdCLFlBQVk7QUFDeEMsWUFBTSxpQkFBaUI7QUFDdkIsWUFBTSxhQUFhLElBQUksY0FBYztBQUNyQyxZQUFNLGdCQUFnQixJQUFJLEtBQUssVUFBVTtBQUV6Qyw4QkFBd0IsYUFBYSxjQUFjLGFBQWEsQ0FBQztBQUVqRSxZQUFNLFVBQVUsYUFBYTtBQUFBLFFBQzVCO0FBQUEsVUFDQyxNQUFNLEdBQUcsVUFBVTtBQUFBLFVBQ25CLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxZQUFNLFVBQVUsTUFBTSxRQUFRLGdCQUFnQixrQkFBa0IsSUFBSSxHQUFHLElBQUksWUFBVSxFQUFFLEdBQUcsT0FBTyxLQUFLLElBQUksS0FBSyxNQUFNLEdBQUcsRUFBRSxFQUFFO0FBQzVILFlBQU0sV0FBMkI7QUFBQSxRQUNoQztBQUFBLFVBQ0MsSUFBSSxJQUFJLFNBQVMsZUFBZSxnQ0FBZ0MsRUFBRSxTQUFTO0FBQUEsVUFDM0UsTUFBTTtBQUFBLFVBQ04sYUFBYTtBQUFBLFVBQ2IsVUFBVSxDQUFDLEVBQUUsT0FBTyxRQUFRLE9BQU8sU0FBUyxRQUFRLFlBQVksQ0FBQztBQUFBLFVBQ2pFLG1CQUFtQjtBQUFBLFlBQ2xCLFNBQVM7QUFBQSxZQUNULGdCQUFnQixDQUFDO0FBQUEsWUFDakIsVUFBVTtBQUFBLFVBQ1g7QUFBQSxVQUNBLE9BQU87QUFBQSxVQUNQLGNBQWM7QUFBQSxVQUNkLE9BQU87QUFBQSxVQUNQLFFBQVEsT0FBTztBQUFBLFVBQ2YsWUFBWSxFQUFFLGVBQWUsTUFBTSxnQkFBZ0IsS0FBSztBQUFBLFVBQ3hELFFBQVE7QUFBQSxVQUNSLE9BQU87QUFBQSxVQUNQLGNBQWM7QUFBQSxVQUNkLEtBQUssSUFBSSxTQUFTLGVBQWUsZ0NBQWdDO0FBQUEsVUFDakUsUUFBUSxFQUFFLFNBQVMsZUFBZSxNQUFNO0FBQUEsVUFDeEMsU0FBUztBQUFBLFFBQ1Y7QUFBQSxNQUNEO0FBRUEsYUFBTztBQUFBLFFBQ047QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLDZCQUE2QixZQUFZO0FBQzdDLFlBQU0saUJBQWlCO0FBQ3ZCLFlBQU0sYUFBYSxJQUFJLGNBQWM7QUFDckMsWUFBTSxnQkFBZ0IsSUFBSSxLQUFLLFVBQVU7QUFFekMsOEJBQXdCLGFBQWEsY0FBYyxhQUFhLENBQUM7QUFHakUsWUFBTSxVQUFVLGFBQWE7QUFBQSxRQUM1QjtBQUFBLFVBQ0MsTUFBTSxHQUFHLFVBQVU7QUFBQSxVQUNuQixVQUFVO0FBQUEsWUFDVDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxVQUNDLE1BQU0sR0FBRyxVQUFVO0FBQUEsVUFDbkIsVUFBVTtBQUFBLFlBQ1Q7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUVELFlBQU0sVUFBVSxNQUFNLFFBQVEsZ0JBQWdCLGtCQUFrQixJQUFJLEdBQUcsSUFBSSxZQUFVLEVBQUUsR0FBRyxPQUFPLEtBQUssSUFBSSxLQUFLLE1BQU0sR0FBRyxFQUFFLEVBQUU7QUFDNUgsWUFBTSxXQUEyQjtBQUFBLFFBQ2hDO0FBQUEsVUFDQyxJQUFJLElBQUksU0FBUyxlQUFlLGdDQUFnQyxFQUFFLFNBQVM7QUFBQSxVQUMzRSxNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUEsVUFDYixPQUFPLENBQUMsU0FBUyxPQUFPO0FBQUEsVUFDeEIsbUJBQW1CO0FBQUEsWUFDbEIsU0FBUztBQUFBLFlBQ1QsZ0JBQWdCLENBQUMsRUFBRSxNQUFNLFNBQVMsT0FBTyxFQUFFLE9BQU8sSUFBSSxjQUFjLEdBQUcsRUFBRSxDQUFDO0FBQUEsWUFDMUUsVUFBVTtBQUFBLFVBQ1g7QUFBQSxVQUNBLFVBQVU7QUFBQSxVQUNWLE9BQU87QUFBQSxVQUNQLGNBQWM7QUFBQSxVQUNkLFFBQVEsT0FBTztBQUFBLFVBQ2YsWUFBWSxFQUFFLGVBQWUsTUFBTSxnQkFBZ0IsS0FBSztBQUFBLFVBQ3hELFFBQVE7QUFBQSxVQUNSLE9BQU87QUFBQSxVQUNQLGNBQWM7QUFBQSxVQUNkLEtBQUssSUFBSSxTQUFTLGVBQWUsZ0NBQWdDO0FBQUEsVUFDakUsUUFBUSxFQUFFLFNBQVMsZUFBZSxNQUFNO0FBQUEsVUFDeEMsU0FBUztBQUFBLFFBQ1Y7QUFBQSxRQUNBO0FBQUEsVUFDQyxJQUFJLElBQUksU0FBUyxlQUFlLGdDQUFnQyxFQUFFLFNBQVM7QUFBQSxVQUMzRSxNQUFNO0FBQUEsVUFDTixtQkFBbUI7QUFBQSxZQUNsQixTQUFTO0FBQUEsWUFDVCxnQkFBZ0I7QUFBQSxjQUNmLEVBQUUsTUFBTSxTQUFTLE9BQU8sRUFBRSxPQUFPLElBQUksY0FBYyxHQUFHLEVBQUU7QUFBQSxjQUN4RCxFQUFFLE1BQU0sU0FBUyxPQUFPLEVBQUUsT0FBTyxJQUFJLGNBQWMsR0FBRyxFQUFFO0FBQUEsWUFDekQ7QUFBQSxZQUNBLFVBQVU7QUFBQSxVQUNYO0FBQUEsVUFDQSxPQUFPO0FBQUEsVUFDUCxjQUFjO0FBQUEsVUFDZCxLQUFLLElBQUksU0FBUyxlQUFlLGdDQUFnQztBQUFBLFVBQ2pFLFFBQVEsRUFBRSxTQUFTLGVBQWUsTUFBTTtBQUFBLFVBQ3hDLFFBQVEsT0FBTztBQUFBLFVBQ2YsWUFBWSxFQUFFLGVBQWUsTUFBTSxnQkFBZ0IsS0FBSztBQUFBLFVBQ3hELFNBQVM7QUFBQSxRQUNWO0FBQUEsTUFDRDtBQUVBLGFBQU87QUFBQSxRQUNOO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyw0QkFBNEIsWUFBWTtBQUM1QyxZQUFNLGlCQUFpQjtBQUN2QixZQUFNLGFBQWEsSUFBSSxjQUFjO0FBQ3JDLFlBQU0sZ0JBQWdCLElBQUksS0FBSyxVQUFVO0FBRXpDLDhCQUF3QixhQUFhLGNBQWMsYUFBYSxDQUFDO0FBRWpFLFlBQU0sVUFBVSxhQUFhO0FBQUEsUUFDNUI7QUFBQSxVQUNDLE1BQU0sR0FBRyxVQUFVO0FBQUEsVUFDbkIsVUFBVTtBQUFBLFlBQ1Q7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsTUFBTSxHQUFHLFVBQVU7QUFBQSxVQUNuQixVQUFVO0FBQUEsWUFDVDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUVELFlBQU0sVUFBVSxNQUFNLFFBQVEsZ0JBQWdCLGtCQUFrQixJQUFJLEdBQUcsSUFBSSxZQUFVLEVBQUUsR0FBRyxPQUFPLEtBQUssSUFBSSxLQUFLLE1BQU0sR0FBRyxFQUFFLEVBQUU7QUFDNUgsWUFBTSxXQUEyQjtBQUFBLFFBQ2hDO0FBQUEsVUFDQyxJQUFJLElBQUksU0FBUyxlQUFlLGdDQUFnQyxFQUFFLFNBQVM7QUFBQSxVQUMzRSxNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUEsVUFDYixjQUFjO0FBQUEsVUFDZCxPQUFPLENBQUMsaUJBQWlCLFFBQVE7QUFBQSxVQUNqQyxtQkFBbUI7QUFBQSxZQUNsQixTQUFTO0FBQUEsWUFDVCxnQkFBZ0IsQ0FBQztBQUFBLFlBQ2pCLFVBQVU7QUFBQSxVQUNYO0FBQUEsVUFDQSxVQUFVO0FBQUEsVUFDVixPQUFPO0FBQUEsVUFDUCxRQUFRLE9BQU87QUFBQSxVQUNmLFlBQVksRUFBRSxlQUFlLE1BQU0sZ0JBQWdCLEtBQUs7QUFBQSxVQUN4RCxRQUFRO0FBQUEsVUFDUixPQUFPO0FBQUEsVUFDUCxjQUFjO0FBQUEsVUFDZCxLQUFLLElBQUksU0FBUyxlQUFlLGdDQUFnQztBQUFBLFVBQ2pFLFFBQVEsRUFBRSxTQUFTLGVBQWUsTUFBTTtBQUFBLFVBQ3hDLFNBQVM7QUFBQSxRQUNWO0FBQUEsUUFDQTtBQUFBLFVBQ0MsSUFBSSxJQUFJLFNBQVMsZUFBZSxnQ0FBZ0MsRUFBRSxTQUFTO0FBQUEsVUFDM0UsTUFBTTtBQUFBLFVBQ04sYUFBYTtBQUFBLFVBQ2IsY0FBYztBQUFBLFVBQ2QsbUJBQW1CO0FBQUEsWUFDbEIsU0FBUztBQUFBLFlBQ1QsZ0JBQWdCLENBQUM7QUFBQSxZQUNqQixVQUFVO0FBQUEsVUFDWDtBQUFBLFVBQ0EsVUFBVTtBQUFBLFVBQ1YsT0FBTztBQUFBLFVBQ1AsT0FBTztBQUFBLFVBQ1AsUUFBUSxPQUFPO0FBQUEsVUFDZixZQUFZLEVBQUUsZUFBZSxNQUFNLGdCQUFnQixLQUFLO0FBQUEsVUFDeEQsUUFBUTtBQUFBLFVBQ1IsT0FBTztBQUFBLFVBQ1AsY0FBYztBQUFBLFVBQ2QsS0FBSyxJQUFJLFNBQVMsZUFBZSxnQ0FBZ0M7QUFBQSxVQUNqRSxRQUFRLEVBQUUsU0FBUyxlQUFlLE1BQU07QUFBQSxVQUN4QyxTQUFTO0FBQUEsUUFDVjtBQUFBLE1BQ0Q7QUFFQSxhQUFPO0FBQUEsUUFDTjtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssc0JBQXNCLFlBQVk7QUFDdEMsWUFBTSxpQkFBaUI7QUFDdkIsWUFBTSxhQUFhLElBQUksY0FBYztBQUNyQyxZQUFNLGdCQUFnQixJQUFJLEtBQUssVUFBVTtBQUV6Qyw4QkFBd0IsYUFBYSxjQUFjLGFBQWEsQ0FBQztBQUVqRSxZQUFNLFVBQVUsYUFBYTtBQUFBLFFBQzVCO0FBQUEsVUFDQyxNQUFNLEdBQUcsVUFBVTtBQUFBLFVBQ25CLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxVQUNDLE1BQU0sR0FBRyxVQUFVO0FBQUEsVUFDbkIsVUFBVTtBQUFBLFlBQ1Q7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsTUFBTSxHQUFHLFVBQVU7QUFBQSxVQUNuQixVQUFVO0FBQUEsWUFDVDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsWUFBTSxVQUFVLE1BQU0sUUFBUSxnQkFBZ0Isa0JBQWtCLElBQUksR0FBRyxJQUFJLFlBQVUsRUFBRSxHQUFHLE9BQU8sS0FBSyxJQUFJLEtBQUssTUFBTSxHQUFHLEVBQUUsRUFBRTtBQUM1SCxZQUFNLFdBQTJCO0FBQUEsUUFDaEM7QUFBQSxVQUNDLElBQUksSUFBSSxTQUFTLGVBQWUsc0NBQXNDLEVBQUUsU0FBUztBQUFBLFVBQ2pGLE1BQU07QUFBQSxVQUNOLGFBQWE7QUFBQSxVQUNiLFFBQVEsT0FBTztBQUFBLFVBQ2YsT0FBTyxDQUFDLGNBQWMsYUFBYTtBQUFBLFVBQ25DLG1CQUFtQjtBQUFBLFlBQ2xCLFNBQVM7QUFBQSxZQUNULGdCQUFnQixDQUFDO0FBQUEsWUFDakIsVUFBVTtBQUFBLFVBQ1g7QUFBQSxVQUNBLFVBQVU7QUFBQSxVQUNWLE9BQU87QUFBQSxVQUNQLGNBQWM7QUFBQSxVQUNkLFlBQVksRUFBRSxlQUFlLE1BQU0sZ0JBQWdCLEtBQUs7QUFBQSxVQUN4RCxRQUFRO0FBQUEsVUFDUixPQUFPO0FBQUEsVUFDUCxLQUFLLElBQUksU0FBUyxlQUFlLHNDQUFzQztBQUFBLFVBQ3ZFLGNBQWM7QUFBQSxVQUNkLFFBQVEsRUFBRSxTQUFTLGVBQWUsTUFBTTtBQUFBLFVBQ3hDLFNBQVM7QUFBQSxRQUNWO0FBQUEsUUFDQTtBQUFBLFVBQ0MsSUFBSSxJQUFJLFNBQVMsZUFBZSxzQ0FBc0MsRUFBRSxTQUFTO0FBQUEsVUFDakYsTUFBTTtBQUFBLFVBQ04sYUFBYTtBQUFBLFVBQ2IsUUFBUSxPQUFPO0FBQUEsVUFDZixPQUFPLENBQUMsT0FBTztBQUFBLFVBQ2YsbUJBQW1CO0FBQUEsWUFDbEIsU0FBUztBQUFBLFlBQ1QsZ0JBQWdCLENBQUM7QUFBQSxZQUNqQixVQUFVO0FBQUEsVUFDWDtBQUFBLFVBQ0EsVUFBVTtBQUFBLFVBQ1YsY0FBYztBQUFBLFVBQ2QsT0FBTztBQUFBLFVBQ1AsWUFBWSxFQUFFLGVBQWUsTUFBTSxnQkFBZ0IsS0FBSztBQUFBLFVBQ3hELFFBQVE7QUFBQSxVQUNSLE9BQU87QUFBQSxVQUNQLEtBQUssSUFBSSxTQUFTLGVBQWUsc0NBQXNDO0FBQUEsVUFDdkUsY0FBYztBQUFBLFVBQ2QsUUFBUSxFQUFFLFNBQVMsZUFBZSxNQUFNO0FBQUEsVUFDeEMsU0FBUztBQUFBLFFBQ1Y7QUFBQSxRQUNBO0FBQUEsVUFDQyxJQUFJLElBQUksU0FBUyxlQUFlLHVDQUF1QyxFQUFFLFNBQVM7QUFBQSxVQUNsRixNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUEsVUFDYixtQkFBbUI7QUFBQSxZQUNsQixTQUFTO0FBQUEsWUFDVCxnQkFBZ0IsQ0FBQztBQUFBLFlBQ2pCLFVBQVU7QUFBQSxVQUNYO0FBQUEsVUFDQSxVQUFVO0FBQUEsVUFDVixPQUFPO0FBQUEsVUFDUCxjQUFjO0FBQUEsVUFDZCxPQUFPO0FBQUEsVUFDUCxRQUFRLE9BQU87QUFBQSxVQUNmLFlBQVksRUFBRSxlQUFlLE1BQU0sZ0JBQWdCLEtBQUs7QUFBQSxVQUN4RCxRQUFRO0FBQUEsVUFDUixPQUFPO0FBQUEsVUFDUCxLQUFLLElBQUksU0FBUyxlQUFlLHVDQUF1QztBQUFBLFVBQ3hFLGNBQWM7QUFBQSxVQUNkLFFBQVEsRUFBRSxTQUFTLGVBQWUsTUFBTTtBQUFBLFVBQ3hDLFNBQVM7QUFBQSxRQUNWO0FBQUEsTUFDRDtBQUVBLGFBQU87QUFBQSxRQUNOO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSywyREFBMkQsWUFBWTtBQUMzRSxZQUFNLGlCQUFpQjtBQUN2QixZQUFNLGFBQWEsSUFBSSxjQUFjO0FBQ3JDLFlBQU0sZ0JBQWdCLElBQUksS0FBSyxVQUFVO0FBRXpDLDhCQUF3QixhQUFhLGNBQWMsYUFBYSxDQUFDO0FBRWpFLFlBQU0sVUFBVSxhQUFhO0FBQUEsUUFDNUI7QUFBQTtBQUFBLFVBRUMsTUFBTSxHQUFHLFVBQVU7QUFBQSxVQUNuQixVQUFVO0FBQUEsWUFDVDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUE7QUFBQSxVQUVDLE1BQU0sR0FBRyxVQUFVO0FBQUEsVUFDbkIsVUFBVTtBQUFBLFlBQ1Q7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBO0FBQUEsVUFFQyxNQUFNLEdBQUcsVUFBVTtBQUFBLFVBQ25CLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxZQUFNLFVBQVUsTUFBTSxRQUFRLGdCQUFnQixrQkFBa0IsSUFBSSxHQUFHLElBQUksWUFBVSxFQUFFLEdBQUcsT0FBTyxLQUFLLElBQUksS0FBSyxNQUFNLEdBQUcsRUFBRSxFQUFFO0FBQzVILFlBQU0sV0FBMkI7QUFBQSxRQUNoQztBQUFBLFVBQ0MsSUFBSSxJQUFJLFNBQVMsZUFBZSx1Q0FBdUMsRUFBRSxTQUFTO0FBQUEsVUFDbEYsTUFBTTtBQUFBLFVBQ04sYUFBYTtBQUFBLFVBQ2IsUUFBUSxPQUFPO0FBQUE7QUFBQSxVQUVmLE9BQU8sQ0FBQyxRQUFRLE1BQU07QUFBQSxVQUN0QixPQUFPLENBQUMsT0FBTztBQUFBLFVBQ2YsbUJBQW1CO0FBQUEsWUFDbEIsU0FBUztBQUFBLFlBQ1QsZ0JBQWdCLENBQUM7QUFBQSxZQUNqQixVQUFVO0FBQUEsVUFDWDtBQUFBLFVBQ0EsVUFBVTtBQUFBLFVBQ1YsY0FBYztBQUFBLFVBQ2QsWUFBWSxFQUFFLGVBQWUsTUFBTSxnQkFBZ0IsS0FBSztBQUFBLFVBQ3hELFFBQVE7QUFBQSxVQUNSLE9BQU87QUFBQSxVQUNQLEtBQUssSUFBSSxTQUFTLGVBQWUsdUNBQXVDO0FBQUEsVUFDeEUsY0FBYztBQUFBLFVBQ2QsUUFBUSxFQUFFLFNBQVMsZUFBZSxNQUFNO0FBQUEsVUFDeEMsU0FBUztBQUFBLFFBQ1Y7QUFBQSxRQUNBO0FBQUEsVUFDQyxJQUFJLElBQUksU0FBUyxlQUFlLGdDQUFnQyxFQUFFLFNBQVM7QUFBQSxVQUMzRSxNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUEsVUFDYixRQUFRLE9BQU87QUFBQTtBQUFBLFVBRWYsT0FBTyxDQUFDLGlCQUFpQiwyQkFBMkIscUJBQXFCLGtCQUFrQixTQUFTO0FBQUE7QUFBQSxVQUVwRyxPQUFPLENBQUMsMkJBQTJCO0FBQUEsVUFDbkMsbUJBQW1CO0FBQUEsWUFDbEIsU0FBUztBQUFBLFlBQ1QsZ0JBQWdCLENBQUM7QUFBQSxZQUNqQixVQUFVO0FBQUEsVUFDWDtBQUFBLFVBQ0EsVUFBVTtBQUFBLFVBQ1YsY0FBYztBQUFBLFVBQ2QsWUFBWSxFQUFFLGVBQWUsTUFBTSxnQkFBZ0IsS0FBSztBQUFBLFVBQ3hELFFBQVE7QUFBQSxVQUNSLE9BQU87QUFBQSxVQUNQLEtBQUssSUFBSSxTQUFTLGVBQWUsZ0NBQWdDO0FBQUEsVUFDakUsY0FBYztBQUFBLFVBQ2QsUUFBUSxFQUFFLFNBQVMsZUFBZSxNQUFNO0FBQUEsVUFDeEMsU0FBUztBQUFBLFFBQ1Y7QUFBQSxRQUNBO0FBQUEsVUFDQyxJQUFJLElBQUksU0FBUyxlQUFlLGlDQUFpQyxFQUFFLFNBQVM7QUFBQSxVQUM1RSxNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUEsVUFDYixRQUFRLE9BQU87QUFBQTtBQUFBLFVBRWYsT0FBTyxDQUFDLHFCQUFxQixxQkFBcUIsd0JBQXdCLG1CQUFtQiw4QkFBOEIsT0FBTztBQUFBLFVBQ2xJLE9BQU8sQ0FBQyw2QkFBNkI7QUFBQSxVQUNyQyxtQkFBbUI7QUFBQSxZQUNsQixTQUFTO0FBQUEsWUFDVCxnQkFBZ0IsQ0FBQztBQUFBLFlBQ2pCLFVBQVU7QUFBQSxVQUNYO0FBQUEsVUFDQSxVQUFVO0FBQUEsVUFDVixjQUFjO0FBQUEsVUFDZCxZQUFZLEVBQUUsZUFBZSxNQUFNLGdCQUFnQixLQUFLO0FBQUEsVUFDeEQsUUFBUTtBQUFBLFVBQ1IsT0FBTztBQUFBLFVBQ1AsS0FBSyxJQUFJLFNBQVMsZUFBZSxpQ0FBaUM7QUFBQSxVQUNsRSxjQUFjO0FBQUEsVUFDZCxRQUFRLEVBQUUsU0FBUyxlQUFlLE1BQU07QUFBQSxVQUN4QyxTQUFTO0FBQUEsUUFDVjtBQUFBLE1BQ0Q7QUFFQSxhQUFPO0FBQUEsUUFDTjtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUdELFNBQUssb0VBQW9FLFlBQVk7QUFDcEYsWUFBTSxpQkFBaUI7QUFDdkIsWUFBTSxhQUFhLElBQUksY0FBYztBQUNyQyxZQUFNLGdCQUFnQixJQUFJLEtBQUssVUFBVTtBQUV6Qyw4QkFBd0IsYUFBYSxjQUFjLGFBQWEsQ0FBQztBQUVqRSxZQUFNLFVBQVUsYUFBYTtBQUFBLFFBQzVCO0FBQUEsVUFDQyxNQUFNLEdBQUcsVUFBVTtBQUFBLFVBQ25CLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsTUFBTSxHQUFHLFVBQVU7QUFBQSxVQUNuQixVQUFVO0FBQUEsWUFDVDtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsWUFBTSxVQUFVLE1BQU0sUUFBUSxnQkFBZ0Isa0JBQWtCLElBQUksR0FBRyxJQUFJLFlBQVUsRUFBRSxHQUFHLE9BQU8sS0FBSyxJQUFJLEtBQUssTUFBTSxHQUFHLEVBQUUsRUFBRTtBQUM1SCxZQUFNLFdBQTJCO0FBQUEsUUFDaEM7QUFBQSxVQUNDLElBQUksSUFBSSxTQUFTLGVBQWUsK0JBQStCLEVBQUUsU0FBUztBQUFBLFVBQzFFLE1BQU07QUFBQSxVQUNOLGFBQWE7QUFBQSxVQUNiLE9BQU8sQ0FBQyxXQUFXO0FBQUEsVUFDbkIsbUJBQW1CO0FBQUEsWUFDbEIsU0FBUztBQUFBLFlBQ1QsZ0JBQWdCLENBQUM7QUFBQSxZQUNqQixVQUFVO0FBQUEsVUFDWDtBQUFBLFVBQ0EsVUFBVTtBQUFBLFVBQ1YsT0FBTztBQUFBLFVBQ1AsY0FBYztBQUFBLFVBQ2QsUUFBUSxPQUFPO0FBQUEsVUFDZixZQUFZLEVBQUUsZUFBZSxNQUFNLGdCQUFnQixLQUFLO0FBQUEsVUFDeEQsUUFBUTtBQUFBLFVBQ1IsT0FBTztBQUFBLFVBQ1AsY0FBYztBQUFBLFVBQ2QsS0FBSyxJQUFJLFNBQVMsZUFBZSwrQkFBK0I7QUFBQSxVQUNoRSxRQUFRLEVBQUUsU0FBUyxlQUFlLE1BQU07QUFBQSxVQUN4QyxTQUFTO0FBQUEsUUFDVjtBQUFBLE1BQ0Q7QUFFQSxhQUFPO0FBQUEsUUFDTjtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssc0JBQXNCLFlBQVk7QUFDdEMsWUFBTSxpQkFBaUI7QUFDdkIsWUFBTSxhQUFhLElBQUksY0FBYztBQUNyQyxZQUFNLGdCQUFnQixJQUFJLEtBQUssVUFBVTtBQUV6Qyw4QkFBd0IsYUFBYSxjQUFjLGFBQWEsQ0FBQztBQUVqRSxZQUFNLFVBQVUsYUFBYTtBQUFBLFFBQzVCO0FBQUEsVUFDQyxNQUFNLEdBQUcsVUFBVTtBQUFBLFVBQ25CLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxVQUNDLE1BQU0sR0FBRyxVQUFVO0FBQUEsVUFDbkIsVUFBVTtBQUFBLFlBQ1Q7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxNQUFNLEdBQUcsVUFBVTtBQUFBLFVBQ25CLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsWUFBTSxVQUFVLE1BQU0sUUFBUSxnQkFBZ0Isa0JBQWtCLElBQUksR0FBRyxJQUFJLFlBQVUsRUFBRSxHQUFHLE9BQU8sS0FBSyxJQUFJLEtBQUssTUFBTSxHQUFHLEVBQUUsRUFBRTtBQUM1SCxZQUFNLFdBQTJCO0FBQUEsUUFDaEM7QUFBQSxVQUNDLElBQUksSUFBSSxTQUFTLGVBQWUsMENBQTBDLEVBQUUsU0FBUztBQUFBLFVBQ3JGLE1BQU07QUFBQSxVQUNOLGFBQWE7QUFBQSxVQUNiLFFBQVEsQ0FBQyxhQUFhLFdBQVc7QUFBQSxVQUNqQyxPQUFPLENBQUMsT0FBTztBQUFBLFVBQ2YsbUJBQW1CO0FBQUEsWUFDbEIsU0FBUztBQUFBLFlBQ1QsZ0JBQWdCLENBQUM7QUFBQSxZQUNqQixVQUFVO0FBQUEsVUFDWDtBQUFBLFVBQ0EsVUFBVTtBQUFBLFVBQ1YsT0FBTztBQUFBLFVBQ1AsY0FBYztBQUFBLFVBQ2QsUUFBUSxPQUFPO0FBQUEsVUFDZixZQUFZLEVBQUUsZUFBZSxNQUFNLGdCQUFnQixLQUFLO0FBQUEsVUFDeEQsT0FBTztBQUFBLFVBQ1AsY0FBYztBQUFBLFVBQ2QsS0FBSyxJQUFJLFNBQVMsZUFBZSwwQ0FBMEM7QUFBQSxVQUMzRSxRQUFRLEVBQUUsU0FBUyxlQUFlLE1BQU07QUFBQSxVQUN4QyxTQUFTO0FBQUEsUUFDVjtBQUFBLFFBQ0E7QUFBQSxVQUNDLElBQUksSUFBSSxTQUFTLGVBQWUseUNBQXlDLEVBQUUsU0FBUztBQUFBLFVBQ3BGLE1BQU07QUFBQSxVQUNOLGFBQWE7QUFBQSxVQUNiLFFBQVEsQ0FBQztBQUFBLFVBQ1QsbUJBQW1CO0FBQUEsWUFDbEIsU0FBUztBQUFBLFlBQ1QsZ0JBQWdCLENBQUM7QUFBQSxZQUNqQixVQUFVO0FBQUEsVUFDWDtBQUFBLFVBQ0EsVUFBVTtBQUFBLFVBQ1YsT0FBTztBQUFBLFVBQ1AsY0FBYztBQUFBLFVBQ2QsT0FBTztBQUFBLFVBQ1AsUUFBUSxPQUFPO0FBQUEsVUFDZixZQUFZLEVBQUUsZUFBZSxNQUFNLGdCQUFnQixLQUFLO0FBQUEsVUFDeEQsT0FBTztBQUFBLFVBQ1AsY0FBYztBQUFBLFVBQ2QsS0FBSyxJQUFJLFNBQVMsZUFBZSx5Q0FBeUM7QUFBQSxVQUMxRSxRQUFRLEVBQUUsU0FBUyxlQUFlLE1BQU07QUFBQSxVQUN4QyxTQUFTO0FBQUEsUUFDVjtBQUFBLFFBQ0E7QUFBQSxVQUNDLElBQUksSUFBSSxTQUFTLGVBQWUsMkNBQTJDLEVBQUUsU0FBUztBQUFBLFVBQ3RGLE1BQU07QUFBQSxVQUNOLGFBQWE7QUFBQSxVQUNiLFFBQVEsQ0FBQyxHQUFHO0FBQUEsVUFDWixtQkFBbUI7QUFBQSxZQUNsQixTQUFTO0FBQUEsWUFDVCxnQkFBZ0IsQ0FBQztBQUFBLFlBQ2pCLFVBQVU7QUFBQSxVQUNYO0FBQUEsVUFDQSxVQUFVO0FBQUEsVUFDVixPQUFPO0FBQUEsVUFDUCxjQUFjO0FBQUEsVUFDZCxPQUFPO0FBQUEsVUFDUCxRQUFRLE9BQU87QUFBQSxVQUNmLFlBQVksRUFBRSxlQUFlLE1BQU0sZ0JBQWdCLEtBQUs7QUFBQSxVQUN4RCxPQUFPO0FBQUEsVUFDUCxjQUFjO0FBQUEsVUFDZCxLQUFLLElBQUksU0FBUyxlQUFlLDJDQUEyQztBQUFBLFVBQzVFLFFBQVEsRUFBRSxTQUFTLGVBQWUsTUFBTTtBQUFBLFVBQ3hDLFNBQVM7QUFBQSxRQUNWO0FBQUEsTUFDRDtBQUVBLGFBQU87QUFBQSxRQUNOO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyx5REFBeUQsWUFBWTtBQUN6RSxZQUFNLGlCQUFpQjtBQUN2QixZQUFNLGFBQWEsSUFBSSxjQUFjO0FBQ3JDLFlBQU0sZ0JBQWdCLElBQUksS0FBSyxVQUFVO0FBRXpDLDhCQUF3QixhQUFhLGNBQWMsYUFBYSxDQUFDO0FBRWpFLFlBQU0sVUFBVSxhQUFhO0FBQUEsUUFDNUI7QUFBQSxVQUNDLE1BQU0sR0FBRyxVQUFVO0FBQUEsVUFDbkIsVUFBVTtBQUFBLFlBQ1Q7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxNQUFNLEdBQUcsVUFBVTtBQUFBLFVBQ25CLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsTUFBTSxHQUFHLFVBQVU7QUFBQSxVQUNuQixVQUFVO0FBQUEsWUFDVDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsWUFBTSxVQUFVLE1BQU0sUUFBUSxnQkFBZ0Isa0JBQWtCLElBQUksR0FBRyxJQUFJLFlBQVUsRUFBRSxHQUFHLE9BQU8sS0FBSyxJQUFJLEtBQUssTUFBTSxHQUFHLEVBQUUsRUFBRTtBQUU1SCxZQUFNLGtCQUFrQixPQUFPLEtBQUssT0FBSyxFQUFFLFNBQVMsbUJBQW1CO0FBQ3ZFLGFBQU8sR0FBRyxpQkFBaUIscUNBQXFDO0FBQ2hFLGFBQU8sWUFBWSxnQkFBZ0IsV0FBVyxnQkFBZ0IsT0FBTyxpREFBaUQ7QUFFdEgsWUFBTSxpQkFBaUIsT0FBTyxLQUFLLE9BQUssRUFBRSxTQUFTLGtCQUFrQjtBQUNyRSxhQUFPLEdBQUcsZ0JBQWdCLG9DQUFvQztBQUM5RCxhQUFPLFlBQVksZUFBZSxXQUFXLGdCQUFnQixNQUFNLCtDQUErQztBQUVsSCxZQUFNLGVBQWUsT0FBTyxLQUFLLE9BQUssRUFBRSxTQUFTLGdCQUFnQjtBQUNqRSxhQUFPLEdBQUcsY0FBYyxpQ0FBaUM7QUFDekQsYUFBTyxZQUFZLGFBQWEsV0FBVyxnQkFBZ0IsTUFBTSxxREFBcUQ7QUFBQSxJQUN2SCxDQUFDO0FBRUQsU0FBSyxnQ0FBZ0MsWUFBWTtBQUNoRCxZQUFNLGlCQUFpQjtBQUN2QixZQUFNLGFBQWEsSUFBSSxjQUFjO0FBQ3JDLFlBQU0sZ0JBQWdCLElBQUksS0FBSyxVQUFVO0FBRXpDLDhCQUF3QixhQUFhLGNBQWMsYUFBYSxDQUFDO0FBRWpFLFlBQU0sb0JBQW9CO0FBQzFCLFlBQU0sdUJBQXVCLElBQUksS0FBSyxpQkFBaUI7QUFHdkQsWUFBTSwrQkFBK0I7QUFBQSxRQUNwQyxlQUFlO0FBQUEsUUFDZiwyQkFBMkIsTUFBTTtBQUFBLFFBQ2pDLGdCQUFnQjtBQUFBLFVBQ2YsR0FBRyxrQkFBa0IsUUFBUSxRQUFRLElBQUksS0FBSyxpQkFBaUIsRUFBRSxLQUFLLEVBQUUsTUFBTSxhQUFhLENBQUMsR0FBRyxJQUFJLEtBQUssUUFBUSxDQUFDO0FBQUEsVUFDakgsYUFBYTtBQUFBLFFBQ2Q7QUFBQSxRQUNBLHNCQUFzQixZQUFZO0FBQUEsUUFBRTtBQUFBLE1BQ3JDO0FBQ0EsbUJBQWEsS0FBSyx5QkFBeUIsNEJBQTRCO0FBR3ZFLGNBQVEsUUFBUTtBQUNoQixZQUFNLGNBQWMsWUFBWSxJQUFJLGFBQWEsZUFBZSxjQUFjLENBQUM7QUFHL0UsWUFBTSxVQUFVLGFBQWE7QUFBQTtBQUFBLFFBRTVCO0FBQUEsVUFDQyxNQUFNLEdBQUcsVUFBVTtBQUFBLFVBQ25CLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQTtBQUFBLFFBRUE7QUFBQSxVQUNDLE1BQU0sR0FBRyxpQkFBaUI7QUFBQSxVQUMxQixVQUFVO0FBQUEsWUFDVDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBO0FBQUEsUUFFQTtBQUFBLFVBQ0MsTUFBTSxHQUFHLGlCQUFpQjtBQUFBLFVBQzFCLFVBQVU7QUFBQSxZQUNUO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxZQUFNLFVBQVUsTUFBTSxZQUFZLGdCQUFnQixrQkFBa0IsSUFBSSxHQUFHLElBQUksWUFBVSxFQUFFLEdBQUcsT0FBTyxLQUFLLElBQUksS0FBSyxNQUFNLEdBQUcsRUFBRSxFQUFFO0FBR2hJLGFBQU8sWUFBWSxPQUFPLFFBQVEsR0FBRyxrREFBa0Q7QUFFdkYsWUFBTSxpQkFBaUIsT0FBTyxLQUFLLE9BQUssRUFBRSxPQUFPLFlBQVksZUFBZSxLQUFLO0FBQ2pGLGFBQU8sR0FBRyxnQkFBZ0IsNkJBQTZCO0FBQ3ZELGFBQU8sWUFBWSxlQUFlLE1BQU0saUJBQWlCO0FBQ3pELGFBQU8sWUFBWSxlQUFlLGFBQWEsa0JBQWtCO0FBRWpFLFlBQU0sYUFBYSxPQUFPLE9BQU8sT0FBSyxFQUFFLE9BQU8sWUFBWSxlQUFlLElBQUk7QUFDOUUsYUFBTyxZQUFZLFdBQVcsUUFBUSxHQUFHLGdDQUFnQztBQUV6RSxZQUFNLHNCQUFzQixXQUFXLEtBQUssT0FBSyxFQUFFLFNBQVMsWUFBWTtBQUN4RSxhQUFPLEdBQUcscUJBQXFCLG9DQUFvQztBQUNuRSxhQUFPLFlBQVksb0JBQW9CLGFBQWEsa0JBQWtCO0FBQ3RFLGFBQU8sZ0JBQWdCLG9CQUFvQixPQUFPLENBQUMsV0FBVyxDQUFDO0FBRS9ELFlBQU0sa0JBQWtCLFdBQVcsS0FBSyxPQUFLLEVBQUUsU0FBUyxtQkFBbUI7QUFDM0UsYUFBTyxHQUFHLGlCQUFpQiwrQkFBK0I7QUFDMUQsYUFBTyxZQUFZLGdCQUFnQixrQkFBa0IsU0FBUyxxQ0FBcUM7QUFBQSxJQUNwRyxDQUFDO0FBRUQsU0FBSyxvREFBb0QsWUFBWTtBQUNwRSxZQUFNLGlCQUFpQjtBQUN2QixZQUFNLGFBQWEsSUFBSSxjQUFjO0FBQ3JDLFlBQU0sZ0JBQWdCLElBQUksS0FBSyxVQUFVO0FBRXpDLDhCQUF3QixhQUFhLGNBQWMsYUFBYSxDQUFDO0FBR2pFLG1CQUFhLEtBQUssaUJBQWlCLFlBQVksSUFBSSxJQUFJLHVCQUF1QixDQUFDLENBQUM7QUFDaEYsY0FBUSxRQUFRO0FBQ2hCLFlBQU0sY0FBYyxZQUFZLElBQUksYUFBYSxlQUFlLGNBQWMsQ0FBQztBQUUvRSxZQUFNLFVBQVUsYUFBYTtBQUFBLFFBQzVCO0FBQUEsVUFDQyxNQUFNLEdBQUcsVUFBVTtBQUFBLFVBQ25CLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxNQUFNLEdBQUcsVUFBVTtBQUFBLFVBQ25CLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxNQUFNLEdBQUcsVUFBVTtBQUFBLFVBQ25CLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFHRCxZQUFNLFVBQVUsTUFBTSxZQUFZLGdCQUFnQixrQkFBa0IsSUFBSTtBQUN4RSxZQUFNLFlBQVksUUFBUSxPQUFPLE9BQUssRUFBRSxTQUFTLG9CQUFvQixFQUFFLFNBQVMsd0JBQXdCO0FBR3hHLFlBQU0sZUFBZSxJQUFJLFlBQVk7QUFDckMsaUJBQVcsS0FBSyxXQUFXO0FBQzFCLHFCQUFhLElBQUksSUFBSSxLQUFLLEVBQUUsR0FBRyxDQUFDO0FBQUEsTUFDakM7QUFDQSxrQkFBWSx1QkFBdUIsWUFBWSxPQUFPLFlBQVk7QUFHbEUsWUFBTSxZQUFZLFlBQVksdUJBQXVCLFlBQVksS0FBSztBQUN0RSxhQUFPLFlBQVksVUFBVSxNQUFNLEdBQUcsbUNBQW1DLFVBQVUsSUFBSSxFQUFFO0FBRXpGLFlBQU0sU0FBUyxNQUFNLFlBQVksZ0JBQWdCLGtCQUFrQixJQUFJO0FBRXZFLGFBQU8sWUFBWSxPQUFPLFFBQVEsR0FBRyxvQ0FBb0M7QUFFekUsWUFBTSxlQUFlLE9BQU8sS0FBSyxPQUFLLEVBQUUsU0FBUyxlQUFlO0FBQ2hFLGFBQU8sR0FBRyxjQUFjLDJCQUEyQjtBQUNuRCxhQUFPLFlBQVksYUFBYSxTQUFTLE1BQU0saUNBQWlDO0FBRWhGLFlBQU0sZ0JBQWdCLE9BQU8sS0FBSyxPQUFLLEVBQUUsU0FBUyxnQkFBZ0I7QUFDbEUsYUFBTyxHQUFHLGVBQWUsNEJBQTRCO0FBQ3JELGFBQU8sWUFBWSxjQUFjLFNBQVMsT0FBTyxtQ0FBbUM7QUFFcEYsWUFBTSx1QkFBdUIsT0FBTyxLQUFLLE9BQUssRUFBRSxTQUFTLHdCQUF3QjtBQUNqRixhQUFPLEdBQUcsc0JBQXNCLG9DQUFvQztBQUNwRSxhQUFPLFlBQVkscUJBQXFCLFNBQVMsT0FBTywyQ0FBMkM7QUFBQSxJQUNwRyxDQUFDO0FBRUQsU0FBSyx3REFBd0QsWUFBWTtBQUN4RSxZQUFNLGlCQUFpQjtBQUN2QixZQUFNLGFBQWEsSUFBSSxjQUFjO0FBQ3JDLFlBQU0sZ0JBQWdCLElBQUksS0FBSyxVQUFVO0FBRXpDLDhCQUF3QixhQUFhLGNBQWMsYUFBYSxDQUFDO0FBR2pFLG1CQUFhLEtBQUssaUJBQWlCLFlBQVksSUFBSSxJQUFJLHVCQUF1QixDQUFDLENBQUM7QUFDaEYsY0FBUSxRQUFRO0FBQ2hCLFlBQU0sY0FBYyxZQUFZLElBQUksYUFBYSxlQUFlLGNBQWMsQ0FBQztBQUUvRSxZQUFNLFVBQVUsYUFBYTtBQUFBLFFBQzVCO0FBQUEsVUFDQyxNQUFNLEdBQUcsVUFBVTtBQUFBLFVBQ25CLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxNQUFNLEdBQUcsVUFBVTtBQUFBLFVBQ25CLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFHRCxZQUFNLFVBQVUsTUFBTSxZQUFZLGdCQUFnQixrQkFBa0IsSUFBSTtBQUN4RSxZQUFNLFdBQVcsUUFBUSxLQUFLLE9BQUssRUFBRSxTQUFTLGdCQUFnQjtBQUM5RCxhQUFPLEdBQUcsVUFBVSxpREFBaUQ7QUFFckUsWUFBTSxlQUFlLElBQUksWUFBWTtBQUNyQyxtQkFBYSxJQUFJLElBQUksS0FBSyxTQUFTLEdBQUcsQ0FBQztBQUN2QyxrQkFBWSx1QkFBdUIsWUFBWSxPQUFPLFlBQVk7QUFFbEUsWUFBTSxnQkFBZ0IsTUFBTSxZQUFZLGlCQUFpQixZQUFZLE9BQU8sa0JBQWtCLElBQUk7QUFDbEcsYUFBTyxZQUFZLGNBQWMsTUFBTSxZQUFZLEtBQUs7QUFDeEQsYUFBTyxZQUFZLGNBQWMsTUFBTSxRQUFRLEdBQUcsc0NBQXNDO0FBRXhGLFlBQU0sY0FBYyxjQUFjLE1BQU0sS0FBSyxPQUFLLEVBQUUsV0FBVyxJQUFJLEtBQUssU0FBUyx3QkFBd0IsQ0FBQztBQUMxRyxhQUFPLEdBQUcsYUFBYSwrQ0FBK0M7QUFDdEUsYUFBTyxZQUFZLFlBQVksUUFBUSxVQUFVLGdDQUFnQztBQUNqRixhQUFPLFlBQVksWUFBWSxZQUFZLFFBQVcsNkNBQTZDO0FBQ25HLGFBQU8sR0FBRyxZQUFZLE9BQU8sZ0RBQWdEO0FBQzdFLGFBQU8sWUFBWSxZQUFZLE1BQU0sU0FBUyxJQUFJO0FBRWxELFlBQU0sZUFBZSxjQUFjLE1BQU0sS0FBSyxPQUFLLEVBQUUsV0FBVyxJQUFJLEtBQUssU0FBUyx5QkFBeUIsQ0FBQztBQUM1RyxhQUFPLEdBQUcsY0FBYyxnREFBZ0Q7QUFDeEUsYUFBTyxZQUFZLGFBQWEsUUFBUSxXQUFXLGtDQUFrQztBQUNyRixhQUFPLFlBQVksYUFBYSxZQUFZLFlBQVksa0RBQWtEO0FBQzFHLGFBQU8sR0FBRyxhQUFhLE9BQU8sdURBQXVEO0FBQ3JGLGFBQU8sWUFBWSxhQUFhLE1BQU0sU0FBUyxLQUFLO0FBQUEsSUFDckQsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sNkJBQTZCLE1BQU07QUFDeEMsU0FBSyxpQ0FBaUMsWUFBWTtBQUNqRCxZQUFNLGlCQUFpQjtBQUN2QixZQUFNLGFBQWEsSUFBSSxjQUFjO0FBQ3JDLFlBQU0sZ0JBQWdCLElBQUksS0FBSyxVQUFVO0FBRXpDLDhCQUF3QixhQUFhLGNBQWMsYUFBYSxDQUFDO0FBRWpFLFlBQU0sb0JBQW9CO0FBQzFCLFlBQU0sdUJBQXVCLElBQUksS0FBSyxpQkFBaUI7QUFHdkQsWUFBTSwrQkFBK0I7QUFBQSxRQUNwQyxlQUFlO0FBQUEsUUFDZiwyQkFBMkIsTUFBTTtBQUFBLFFBQ2pDLGdCQUFnQjtBQUFBLFVBQ2YsR0FBRyxrQkFBa0IsUUFBUSxRQUFRLElBQUksS0FBSyxpQkFBaUIsRUFBRSxLQUFLLEVBQUUsTUFBTSxhQUFhLENBQUMsR0FBRyxJQUFJLEtBQUssUUFBUSxDQUFDO0FBQUEsVUFDakgsYUFBYTtBQUFBLFFBQ2Q7QUFBQSxRQUNBLHNCQUFzQixZQUFZO0FBQUEsUUFBRTtBQUFBLE1BQ3JDO0FBQ0EsbUJBQWEsS0FBSyx5QkFBeUIsNEJBQTRCO0FBR3ZFLGNBQVEsUUFBUTtBQUNoQixZQUFNLGNBQWMsWUFBWSxJQUFJLGFBQWEsZUFBZSxjQUFjLENBQUM7QUFHL0UsWUFBTSxVQUFVLGFBQWE7QUFBQTtBQUFBLFFBRTVCO0FBQUEsVUFDQyxNQUFNLEdBQUcsVUFBVTtBQUFBLFVBQ25CLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQTtBQUFBLFFBRUE7QUFBQSxVQUNDLE1BQU0sR0FBRyxpQkFBaUI7QUFBQSxVQUMxQixVQUFVO0FBQUEsWUFDVDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsWUFBTSxTQUFTLE1BQU0sWUFBWSxnQkFBZ0IsWUFBWSxRQUFRLGtCQUFrQixJQUFJO0FBRzNGLGFBQU8sWUFBWSxPQUFPLFFBQVEsR0FBRyxtREFBbUQ7QUFFeEYsWUFBTSxrQkFBa0IsT0FBTyxLQUFLLE9BQUssRUFBRSxZQUFZLGVBQWUsS0FBSztBQUMzRSxhQUFPLEdBQUcsaUJBQWlCLDhCQUE4QjtBQUN6RCxhQUFPLEdBQUcsZ0JBQWdCLElBQUksS0FBSyxTQUFTLDRCQUE0QixDQUFDO0FBRXpFLFlBQU0sYUFBYSxPQUFPLEtBQUssT0FBSyxFQUFFLFlBQVksZUFBZSxJQUFJO0FBQ3JFLGFBQU8sR0FBRyxZQUFZLDhCQUE4QjtBQUNwRCxhQUFPLEdBQUcsV0FBVyxJQUFJLEtBQUssU0FBUyx1QkFBdUIsQ0FBQztBQUFBLElBQ2hFLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLGtDQUFrQyxNQUFNO0FBQzdDLFNBQUssc0NBQXNDLFlBQVk7QUFDdEQsWUFBTSxpQkFBaUI7QUFDdkIsWUFBTSxhQUFhLElBQUksY0FBYztBQUNyQyxZQUFNLGdCQUFnQixJQUFJLEtBQUssVUFBVTtBQUV6Qyw4QkFBd0IsYUFBYSxjQUFjLGFBQWEsQ0FBQztBQUVqRSxZQUFNLG9CQUFvQjtBQUMxQixZQUFNLHVCQUF1QixJQUFJLEtBQUssaUJBQWlCO0FBR3ZELFlBQU0sK0JBQStCO0FBQUEsUUFDcEMsZUFBZTtBQUFBLFFBQ2YsMkJBQTJCLE1BQU07QUFBQSxRQUNqQyxnQkFBZ0I7QUFBQSxVQUNmLEdBQUcsa0JBQWtCLFFBQVEsUUFBUSxJQUFJLEtBQUssaUJBQWlCLEVBQUUsS0FBSyxFQUFFLE1BQU0sYUFBYSxDQUFDLEdBQUcsSUFBSSxLQUFLLFFBQVEsQ0FBQztBQUFBLFVBQ2pILGFBQWE7QUFBQSxRQUNkO0FBQUEsUUFDQSxzQkFBc0IsWUFBWTtBQUFBLFFBQUU7QUFBQSxNQUNyQztBQUNBLG1CQUFhLEtBQUsseUJBQXlCLDRCQUE0QjtBQUd2RSxjQUFRLFFBQVE7QUFDaEIsWUFBTSxjQUFjLFlBQVksSUFBSSxhQUFhLGVBQWUsY0FBYyxDQUFDO0FBRy9FLFlBQU0sVUFBVSxhQUFhO0FBQUE7QUFBQSxRQUU1QjtBQUFBLFVBQ0MsTUFBTSxHQUFHLFVBQVU7QUFBQSxVQUNuQixVQUFVO0FBQUEsWUFDVDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBO0FBQUEsUUFFQTtBQUFBLFVBQ0MsTUFBTSxHQUFHLGlCQUFpQjtBQUFBLFVBQzFCLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsWUFBTSxTQUFTLE1BQU0sWUFBWSxnQkFBZ0IsWUFBWSxjQUFjLGtCQUFrQixJQUFJO0FBR2pHLGFBQU8sWUFBWSxPQUFPLFFBQVEsR0FBRyx3REFBd0Q7QUFFN0YsWUFBTSx3QkFBd0IsT0FBTyxLQUFLLE9BQUssRUFBRSxZQUFZLGVBQWUsS0FBSztBQUNqRixhQUFPLEdBQUcsdUJBQXVCLG9DQUFvQztBQUNyRSxhQUFPLEdBQUcsc0JBQXNCLElBQUksS0FBSyxTQUFTLHdDQUF3QyxDQUFDO0FBRTNGLFlBQU0sbUJBQW1CLE9BQU8sS0FBSyxPQUFLLEVBQUUsWUFBWSxlQUFlLElBQUk7QUFDM0UsYUFBTyxHQUFHLGtCQUFrQixvQ0FBb0M7QUFDaEUsYUFBTyxHQUFHLGlCQUFpQixJQUFJLEtBQUssU0FBUyxtQ0FBbUMsQ0FBQztBQUFBLElBQ2xGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLDZCQUE2QixNQUFNO0FBQ3hDLGFBQVMsTUFBTTtBQUNkLFlBQU0sUUFBUTtBQUFBLElBQ2YsQ0FBQztBQUVELFNBQUssMENBQTBDLFlBQVk7QUFDMUQsd0JBQWtCLHFCQUFxQixjQUFjLGtCQUFrQixJQUFJO0FBQzNFLHdCQUFrQixxQkFBcUIsY0FBYyxxQkFBcUIsQ0FBQyxDQUFDO0FBRTVFLFlBQU0saUJBQWlCO0FBQ3ZCLFlBQU0sYUFBYSxJQUFJLGNBQWM7QUFDckMsWUFBTSxnQkFBZ0IsSUFBSSxLQUFLLFVBQVU7QUFFekMsOEJBQXdCLGFBQWEsY0FBYyxhQUFhLENBQUM7QUFFakUsWUFBTSxVQUFVLGFBQWE7QUFBQSxRQUM1QjtBQUFBLFVBQ0MsTUFBTSxHQUFHLFVBQVU7QUFBQSxVQUNuQixVQUFVO0FBQUEsWUFDVDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxVQUNDLE1BQU0sR0FBRyxVQUFVO0FBQUEsVUFDbkIsVUFBVTtBQUFBLFlBQ1Q7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxZQUFNLFNBQVMsTUFBTSxRQUFRLGdCQUFnQixZQUFZLE9BQU8sa0JBQWtCLElBQUk7QUFFdEYsYUFBTyxZQUFZLE9BQU8sUUFBUSxHQUFHLHNCQUFzQjtBQUUzRCxZQUFNLFNBQVMsT0FBTyxLQUFLLE9BQUssRUFBRSxJQUFJLEtBQUssU0FBUyxRQUFRLENBQUM7QUFDN0QsYUFBTyxHQUFHLFFBQVEsb0JBQW9CO0FBQ3RDLGFBQU8sWUFBWSxPQUFPLE1BQU0sWUFBWSxLQUFLO0FBQ2pELGFBQU8sWUFBWSxPQUFPLFNBQVMsZUFBZSxLQUFLO0FBRXZELFlBQU0sU0FBUyxPQUFPLEtBQUssT0FBSyxFQUFFLElBQUksS0FBSyxTQUFTLFFBQVEsQ0FBQztBQUM3RCxhQUFPLEdBQUcsUUFBUSxvQkFBb0I7QUFDdEMsYUFBTyxZQUFZLE9BQU8sTUFBTSxZQUFZLEtBQUs7QUFDakQsYUFBTyxZQUFZLE9BQU8sU0FBUyxlQUFlLEtBQUs7QUFBQSxJQUN4RCxDQUFDO0FBRUQsU0FBSywwQ0FBMEMsWUFBWTtBQUMxRCx3QkFBa0IscUJBQXFCLGNBQWMsa0JBQWtCLElBQUk7QUFDM0Usd0JBQWtCLHFCQUFxQixjQUFjLHFCQUFxQixDQUFDLENBQUM7QUFFNUUsWUFBTSxpQkFBaUI7QUFDdkIsWUFBTSxhQUFhLElBQUksY0FBYztBQUNyQyxZQUFNLGdCQUFnQixJQUFJLEtBQUssVUFBVTtBQUV6Qyw4QkFBd0IsYUFBYSxjQUFjLGFBQWEsQ0FBQztBQUVqRSxZQUFNLFVBQVUsYUFBYTtBQUFBLFFBQzVCO0FBQUEsVUFDQyxNQUFNO0FBQUEsVUFDTixVQUFVO0FBQUEsWUFDVDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxVQUNDLE1BQU07QUFBQSxVQUNOLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsWUFBTSxTQUFTLE1BQU0sUUFBUSxnQkFBZ0IsWUFBWSxPQUFPLGtCQUFrQixJQUFJO0FBRXRGLFlBQU0saUJBQWlCLE9BQU8sT0FBTyxPQUFLLEVBQUUsWUFBWSxlQUFlLElBQUk7QUFDM0UsYUFBTyxZQUFZLGVBQWUsUUFBUSxHQUFHLCtCQUErQjtBQUU1RSxZQUFNLGVBQWUsZUFBZSxLQUFLLE9BQUssRUFBRSxJQUFJLEtBQUssU0FBUyxVQUFVLENBQUM7QUFDN0UsYUFBTyxHQUFHLGNBQWMsb0NBQW9DO0FBRTVELFlBQU0sY0FBYyxlQUFlLEtBQUssT0FBSyxFQUFFLElBQUksS0FBSyxTQUFTLG9CQUFvQixDQUFDO0FBQ3RGLGFBQU8sR0FBRyxhQUFhLG1DQUFtQztBQUFBLElBQzNELENBQUM7QUFFRCxTQUFLLDZEQUE2RCxZQUFZO0FBQzdFLHdCQUFrQixxQkFBcUIsY0FBYyxrQkFBa0IsSUFBSTtBQUUzRSxZQUFNLGlCQUFpQjtBQUN2QixZQUFNLGFBQWEsSUFBSSxjQUFjO0FBQ3JDLFlBQU0sZ0JBQWdCLElBQUksS0FBSyxVQUFVO0FBRXpDLDhCQUF3QixhQUFhLGNBQWMsYUFBYSxDQUFDO0FBR2pFLFlBQU0sVUFBVSxhQUFhO0FBQUEsUUFDNUI7QUFBQSxVQUNDLE1BQU0sR0FBRyxVQUFVO0FBQUEsVUFDbkIsVUFBVTtBQUFBLFlBQ1Q7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxVQUNDLE1BQU0sR0FBRyxVQUFVO0FBQUEsVUFDbkIsVUFBVTtBQUFBLFlBQ1Q7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUVELFlBQU0sU0FBUyxNQUFNLFFBQVEsZ0JBQWdCLFlBQVksT0FBTyxrQkFBa0IsSUFBSTtBQUV0RixhQUFPLFlBQVksT0FBTyxRQUFRLEdBQUcsbURBQW1EO0FBQUEsSUFDekYsQ0FBQztBQUVELFNBQUssc0RBQXNELFlBQVk7QUFDdEUsd0JBQWtCLHFCQUFxQixjQUFjLGtCQUFrQixJQUFJO0FBQzNFLHdCQUFrQixxQkFBcUIsY0FBYyxxQkFBcUIsQ0FBQyxDQUFDO0FBRTVFLFlBQU0saUJBQWlCO0FBQ3ZCLFlBQU0sYUFBYSxJQUFJLGNBQWM7QUFDckMsWUFBTSxnQkFBZ0IsSUFBSSxLQUFLLFVBQVU7QUFFekMsOEJBQXdCLGFBQWEsY0FBYyxhQUFhLENBQUM7QUFFakUsWUFBTSxVQUFVLGFBQWE7QUFBQTtBQUFBLFFBRTVCO0FBQUEsVUFDQyxNQUFNLEdBQUcsVUFBVTtBQUFBLFVBQ25CLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUE7QUFBQSxRQUVBO0FBQUEsVUFDQyxNQUFNO0FBQUEsVUFDTixVQUFVO0FBQUEsWUFDVDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUVELFlBQU0sU0FBUyxNQUFNLFFBQVEsZ0JBQWdCLFlBQVksT0FBTyxrQkFBa0IsSUFBSTtBQUV0RixZQUFNLGtCQUFrQixPQUFPLE9BQU8sT0FBSyxFQUFFLFlBQVksZUFBZSxLQUFLO0FBQzdFLFlBQU0sYUFBYSxPQUFPLE9BQU8sT0FBSyxFQUFFLFlBQVksZUFBZSxJQUFJO0FBRXZFLGFBQU8sWUFBWSxnQkFBZ0IsUUFBUSxHQUFHLCtCQUErQjtBQUM3RSxhQUFPLFlBQVksV0FBVyxRQUFRLEdBQUcsMEJBQTBCO0FBQUEsSUFDcEUsQ0FBQztBQUVELFNBQUssb0RBQW9ELFlBQVk7QUFDcEUsd0JBQWtCLHFCQUFxQixjQUFjLGtCQUFrQixJQUFJO0FBRTNFLHdCQUFrQixxQkFBcUIsY0FBYyxxQkFBcUI7QUFBQSxRQUN6RSxrQkFBa0I7QUFBQSxRQUNsQixrQkFBa0I7QUFBQSxNQUNuQixDQUFDO0FBRUQsWUFBTSxpQkFBaUI7QUFDdkIsWUFBTSxhQUFhLElBQUksY0FBYztBQUNyQyxZQUFNLGdCQUFnQixJQUFJLEtBQUssVUFBVTtBQUV6Qyw4QkFBd0IsYUFBYSxjQUFjLGFBQWEsQ0FBQztBQUVqRSxZQUFNLFVBQVUsYUFBYTtBQUFBLFFBQzVCO0FBQUEsVUFDQyxNQUFNLEdBQUcsVUFBVTtBQUFBLFVBQ25CLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsTUFBTSxHQUFHLFVBQVU7QUFBQSxVQUNuQixVQUFVO0FBQUEsWUFDVDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUVELFlBQU0sU0FBUyxNQUFNLFFBQVEsZ0JBQWdCLFlBQVksT0FBTyxrQkFBa0IsSUFBSTtBQUV0RixhQUFPLFlBQVksT0FBTyxRQUFRLEdBQUcsZ0RBQWdEO0FBQ3JGLGFBQU8sR0FBRyxPQUFPLENBQUMsRUFBRSxJQUFJLEtBQUssU0FBUyxnQkFBZ0IsR0FBRyw0Q0FBNEM7QUFDckcsYUFBTyxHQUFHLENBQUMsT0FBTyxDQUFDLEVBQUUsSUFBSSxLQUFLLFNBQVMsZ0JBQWdCLEdBQUcsb0RBQW9EO0FBQUEsSUFDL0csQ0FBQztBQUVELFNBQUssaURBQWlELFlBQVk7QUFDakUsd0JBQWtCLHFCQUFxQixjQUFjLGtCQUFrQixJQUFJO0FBRTNFLHdCQUFrQixxQkFBcUIsY0FBYyxxQkFBcUI7QUFBQSxRQUN6RSxrQkFBa0I7QUFBQSxRQUNsQixrQkFBa0I7QUFBQSxRQUNsQixzQkFBc0I7QUFBQSxNQUN2QixDQUFDO0FBRUQsWUFBTSxpQkFBaUI7QUFDdkIsWUFBTSxhQUFhLElBQUksY0FBYztBQUNyQyxZQUFNLGdCQUFnQixJQUFJLEtBQUssVUFBVTtBQUV6Qyw4QkFBd0IsYUFBYSxjQUFjLGFBQWEsQ0FBQztBQUdqRSxZQUFNLFVBQVUsYUFBYTtBQUFBLFFBQzVCO0FBQUEsVUFDQyxNQUFNO0FBQUEsVUFDTixVQUFVO0FBQUEsWUFDVDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUVELFlBQU0sU0FBUyxNQUFNLFFBQVEsZ0JBQWdCLFlBQVksT0FBTyxrQkFBa0IsSUFBSTtBQUV0RixhQUFPLFlBQVksT0FBTyxRQUFRLEdBQUcsOENBQThDO0FBQ25GLGFBQU8sR0FBRyxPQUFPLENBQUMsRUFBRSxJQUFJLEtBQUssU0FBUyw2QkFBNkIsR0FBRyxvQ0FBb0M7QUFBQSxJQUMzRyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSw2QkFBNkIsTUFBTTtBQUN4QyxTQUFLLDRDQUE0QyxZQUFZO0FBQzVELHdCQUFrQixxQkFBcUIsY0FBYyxrQkFBa0IsSUFBSTtBQUMzRSx3QkFBa0IscUJBQXFCLGNBQWMscUJBQXFCLENBQUMsQ0FBQztBQUU1RSxZQUFNLGdCQUFnQixJQUFJLEtBQUssd0JBQXdCO0FBQ3ZELDhCQUF3QixhQUFhLGNBQWMsYUFBYSxDQUFDO0FBRWpFLFlBQU0sVUFBVSxNQUFNLFFBQVEsaUJBQWlCLFlBQVksS0FBSztBQUVoRSxZQUFNLGNBQWMsUUFBUSxPQUFPLE9BQUssRUFBRSxZQUFZLGVBQWUsSUFBSTtBQUN6RSxZQUFNLGVBQWUsUUFBUSxPQUFPLE9BQUssRUFBRSxZQUFZLGVBQWUsS0FBSztBQUUzRSxhQUFPLEdBQUcsWUFBWSxTQUFTLEdBQUcsZ0RBQWdEO0FBQ2xGLGFBQU8sR0FBRyxhQUFhLFNBQVMsR0FBRyxxREFBcUQ7QUFDeEYsYUFBTztBQUFBLFFBQ04sWUFBWSxLQUFLLE9BQUssRUFBRSxJQUFJLFNBQVMsNEJBQTRCO0FBQUEsUUFDakU7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSywyREFBMkQsWUFBWTtBQUMzRSx3QkFBa0IscUJBQXFCLGNBQWMsa0JBQWtCLElBQUk7QUFDM0Usd0JBQWtCLHFCQUFxQixjQUFjLHFCQUFxQjtBQUFBLFFBQ3pFLGtCQUFrQjtBQUFBLFFBQ2xCLHFCQUFxQjtBQUFBLE1BQ3RCLENBQUM7QUFFRCxZQUFNLGdCQUFnQixJQUFJLEtBQUssMkJBQTJCO0FBQzFELDhCQUF3QixhQUFhLGNBQWMsYUFBYSxDQUFDO0FBRWpFLFlBQU0sVUFBVSxNQUFNLFFBQVEsaUJBQWlCLFlBQVksS0FBSztBQUNoRSxZQUFNLFFBQVEsUUFBUSxJQUFJLE9BQUssRUFBRSxJQUFJLElBQUk7QUFFekMsYUFBTyxHQUFHLENBQUMsTUFBTSxLQUFLLE9BQUssRUFBRSxTQUFTLGlCQUFpQixDQUFDLEdBQUcseUNBQXlDO0FBQ3BHLGFBQU8sR0FBRyxDQUFDLE1BQU0sU0FBUyw0QkFBNEIsR0FBRyw0Q0FBNEM7QUFDckcsYUFBTyxHQUFHLE1BQU0sU0FBUywyQkFBMkIsR0FBRyxpREFBaUQ7QUFBQSxJQUN6RyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSxnQ0FBZ0MsTUFBTTtBQUUzQyxTQUFLLDJCQUEyQixZQUFZO0FBQzNDLFlBQU0sTUFBTSxJQUFJLE1BQU0seURBQXlEO0FBQy9FLFlBQU0sWUFBWSxDQUFDO0FBQ25CLFlBQU0sYUFBYSxRQUFRO0FBQUEsUUFBd0IsWUFBWTtBQUFBLFFBQzlEO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUVBLFlBQU0sU0FBUyxNQUFNLFFBQVEsZ0JBQWdCLFlBQVksY0FBYyxrQkFBa0IsSUFBSTtBQUM3RixhQUFPLFlBQVksT0FBTyxRQUFRLENBQUM7QUFDbkMsYUFBTyxZQUFZLE9BQU8sQ0FBQyxFQUFFLElBQUksU0FBUyxHQUFHLElBQUksU0FBUyxDQUFDO0FBQzNELGFBQU8sWUFBWSxPQUFPLENBQUMsRUFBRSxNQUFNLHVCQUF1QjtBQUMxRCxhQUFPLFlBQVksT0FBTyxDQUFDLEVBQUUsU0FBUyxlQUFlLFNBQVM7QUFDOUQsYUFBTyxZQUFZLE9BQU8sQ0FBQyxFQUFFLE1BQU0sWUFBWSxZQUFZO0FBQzNELGlCQUFXLFFBQVE7QUFBQSxJQUNwQixDQUFDO0FBRUQsU0FBSyxpREFBaUQsWUFBWTtBQUNqRSxZQUFNLE1BQU0sSUFBSSxNQUFNLHlEQUF5RDtBQUMvRSxZQUFNLFlBQVk7QUFBQSxRQUNqQixZQUFZLEVBQUUsT0FBTyxvQkFBb0I7QUFBQSxNQUMxQztBQUVBLFlBQU0sVUFBVSxhQUFhLENBQUM7QUFBQSxRQUM3QixNQUFNLElBQUk7QUFBQSxRQUNWLFVBQVU7QUFBQSxVQUNUO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDLENBQUM7QUFFRixZQUFNLGFBQWEsUUFBUTtBQUFBLFFBQzFCLFlBQVk7QUFBQSxRQUNaO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUVBLFlBQU0sU0FBUyxNQUFNLFFBQVEsb0JBQW9CLGtCQUFrQixJQUFJO0FBQ3ZFLGFBQU8sZ0JBQWdCLE9BQU8sSUFBSSxDQUFDLEVBQUUsS0FBQUMsTUFBSyxNQUFNLGFBQWEsU0FBUyxTQUFTLFFBQVEsV0FBVyxXQUFBQyxXQUFVLE9BQU8sRUFBRSxLQUFBRCxNQUFLLE1BQU0sYUFBYSxTQUFTLFNBQVMsU0FBUyxRQUFRLFdBQVcsV0FBQUMsV0FBVSxFQUFFLEdBQUcsQ0FBQztBQUFBLFFBQzFNO0FBQUEsUUFDQSxNQUFNO0FBQUEsUUFDTixhQUFhO0FBQUEsUUFDYixTQUFTO0FBQUEsUUFDVCxTQUFTLGVBQWU7QUFBQSxRQUN4QixRQUFRLGlCQUFpQjtBQUFBLFFBQ3pCLFdBQVc7QUFBQSxRQUNYO0FBQUEsTUFDRCxDQUFDLENBQUM7QUFFRixpQkFBVyxRQUFRO0FBQUEsSUFDcEIsQ0FBQztBQUVELFNBQUsseUJBQXlCLFlBQVk7QUFDekMsWUFBTSxXQUFXLElBQUksTUFBTSxpREFBaUQ7QUFDNUUsWUFBTSxZQUFZO0FBQUEsUUFDakIsWUFBWSxFQUFFLE9BQU8sb0JBQW9CO0FBQUEsUUFDekMscUJBQXFCLENBQUMsd0JBQXdCO0FBQUEsTUFDL0M7QUFHQSxZQUFNLFVBQVUsYUFBYTtBQUFBLFFBQzVCO0FBQUEsVUFDQyxNQUFNLFNBQVM7QUFBQSxVQUNmLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsWUFBTSxXQUFXO0FBQUEsUUFDaEIsb0JBQW9CLE9BQU8sVUFBOEIsV0FBOEI7QUFDdEYsaUJBQU87QUFBQSxZQUNOO0FBQUEsY0FDQyxLQUFLO0FBQUEsWUFDTjtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUVBLFlBQU0sYUFBYSxRQUFRLDJCQUEyQixXQUFXLFlBQVksT0FBTyxRQUFRO0FBRTVGLFlBQU0sU0FBUyxNQUFNLFFBQVEsZ0JBQWdCLGtCQUFrQixJQUFJO0FBQ25FLGFBQU8sWUFBWSxPQUFPLFFBQVEsQ0FBQztBQUNuQyxhQUFPLFlBQVksT0FBTyxDQUFDLEVBQUUsTUFBTSxTQUFTO0FBQzVDLGFBQU8sWUFBWSxPQUFPLENBQUMsRUFBRSxhQUFhLCtCQUErQjtBQUN6RSxhQUFPLFlBQVksT0FBTyxDQUFDLEVBQUUsSUFBSSxTQUFTLEdBQUcsU0FBUyxTQUFTLENBQUM7QUFDaEUsYUFBTyxZQUFZLE9BQU8sQ0FBQyxFQUFFLE9BQU8sU0FBUyxlQUFlLFNBQVM7QUFFckUsaUJBQVcsUUFBUTtBQUduQixZQUFNLHFCQUFxQixNQUFNLFFBQVEsZ0JBQWdCLGtCQUFrQixJQUFJO0FBQy9FLGFBQU8sWUFBWSxtQkFBbUIsUUFBUSxDQUFDO0FBQUEsSUFDaEQsQ0FBQztBQUVELFNBQUssK0RBQStELFlBQVk7QUFDL0UsWUFBTSxpQkFBaUIsSUFBSSxNQUFNLHFEQUFxRDtBQUN0RixZQUFNLGNBQWMsSUFBSSxNQUFNLGtEQUFrRDtBQUNoRixZQUFNLFlBQVk7QUFBQSxRQUNqQixZQUFZLEVBQUUsT0FBTyxvQkFBb0I7QUFBQSxNQUMxQztBQUdBLFlBQU0sVUFBVSxhQUFhO0FBQUEsUUFDNUI7QUFBQSxVQUNDLE1BQU0sWUFBWTtBQUFBLFVBQ2xCLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBR0QsWUFBTSxjQUFjLFFBQVE7QUFBQSxRQUMzQixZQUFZO0FBQUEsUUFDWjtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFFQSxZQUFNLGNBQWMsUUFBUTtBQUFBLFFBQzNCLFlBQVk7QUFBQSxRQUNaO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUdBLFlBQU0sU0FBUyxNQUFNLFFBQVEsZ0JBQWdCLGtCQUFrQixJQUFJO0FBR25FLGFBQU8sWUFBWSxPQUFPLFFBQVEsR0FBRywwQ0FBMEM7QUFDL0UsYUFBTyxZQUFZLE9BQU8sQ0FBQyxFQUFFLE1BQU0sZ0JBQWdCO0FBQ25ELGFBQU8sWUFBWSxPQUFPLENBQUMsRUFBRSxhQUFhLHNCQUFzQjtBQUNoRSxhQUFPLFlBQVksT0FBTyxDQUFDLEVBQUUsSUFBSSxTQUFTLEdBQUcsWUFBWSxTQUFTLENBQUM7QUFFbkUsa0JBQVksUUFBUTtBQUNwQixrQkFBWSxRQUFRO0FBQUEsSUFDckIsQ0FBQztBQUVELFNBQUssdUVBQXVFLFlBQVk7QUFDdkYsWUFBTSxNQUFNLElBQUksTUFBTSw0REFBNEQ7QUFDbEYsWUFBTSxZQUFZLENBQUM7QUFDbkIsWUFBTSxvQkFBb0IsYUFBYSxJQUFJLGtCQUFrQjtBQUM3RCxZQUFNLDBCQUEwQixNQUFNLEtBQUssbUJBQW1CLHFCQUFxQixFQUFFLFFBQVEsS0FBSztBQUVsRyxZQUFNLGFBQWEsUUFBUTtBQUFBLFFBQzFCLFlBQVk7QUFBQSxRQUFjO0FBQUEsUUFBSztBQUFBLFFBQy9CO0FBQUEsUUFBNEI7QUFBQSxRQUFxQjtBQUFBLE1BQ2xEO0FBRUEsWUFBTSxRQUFRLE1BQU0sUUFBUSxnQkFBZ0IsWUFBWSxjQUFjLGtCQUFrQixJQUFJO0FBQzVGLGFBQU8sWUFBWSxNQUFNLFFBQVEsR0FBRyw0REFBNEQ7QUFFaEcsaUJBQVcsUUFBUTtBQUNuQiw4QkFBd0IsUUFBUTtBQUVoQyxZQUFNLGlDQUFpQyxNQUFNLEtBQUssbUJBQW1CLHFCQUFxQixFQUFFLFFBQVEsSUFBSTtBQUN4RyxZQUFNLHNCQUFzQixRQUFRO0FBQUEsUUFDbkMsWUFBWTtBQUFBLFFBQWM7QUFBQSxRQUFLO0FBQUEsUUFDL0I7QUFBQSxRQUE0QjtBQUFBLFFBQXFCO0FBQUEsTUFDbEQ7QUFFQSxZQUFNLGVBQWUsTUFBTSxRQUFRLGdCQUFnQixZQUFZLGNBQWMsa0JBQWtCLElBQUk7QUFDbkcsYUFBTyxZQUFZLGFBQWEsUUFBUSxHQUFHLGlEQUFpRDtBQUM1RixhQUFPLFlBQVksYUFBYSxDQUFDLEVBQUUsSUFBSSxTQUFTLEdBQUcsSUFBSSxTQUFTLENBQUM7QUFFakUsMEJBQW9CLFFBQVE7QUFDNUIscUNBQStCLFFBQVE7QUFBQSxJQUN4QyxDQUFDO0FBRUQsU0FBSyxvRUFBb0UsWUFBWTtBQUNwRixZQUFNLE1BQU0sSUFBSSxNQUFNLHNEQUFzRDtBQUM1RSxZQUFNLFlBQVk7QUFBQSxRQUNqQixZQUFZLEVBQUUsT0FBTyxvQkFBb0I7QUFBQSxRQUN6QyxxQkFBcUIsQ0FBQyx3QkFBd0I7QUFBQSxNQUMvQztBQUNBLFlBQU0sb0JBQW9CLGFBQWEsSUFBSSxrQkFBa0I7QUFFN0QsWUFBTSxhQUFhLFFBQVEsMkJBQTJCLFdBQVcsWUFBWSxjQUFjO0FBQUEsUUFDMUYsb0JBQW9CLFlBQVksQ0FBQyxFQUFFLEtBQUssTUFBTSwyQkFBMkIsQ0FBQztBQUFBLE1BQzNFLENBQUM7QUFFRCxZQUFNLDBCQUEwQixNQUFNLEtBQUssbUJBQW1CLHFCQUFxQixFQUFFLFFBQVEsS0FBSztBQUNsRyxZQUFNLFFBQVEsTUFBTSxRQUFRLDBCQUEwQixZQUFZLGNBQWMsZUFBZSxXQUFXLGtCQUFrQixJQUFJO0FBQ2hJLGFBQU8sWUFBWSxNQUFNLFFBQVEsR0FBRyw0REFBNEQ7QUFDaEcsOEJBQXdCLFFBQVE7QUFFaEMsWUFBTSxpQ0FBaUMsTUFBTSxLQUFLLG1CQUFtQixxQkFBcUIsRUFBRSxRQUFRLElBQUk7QUFDeEcsWUFBTSxlQUFlLE1BQU0sUUFBUSwwQkFBMEIsWUFBWSxjQUFjLGVBQWUsV0FBVyxrQkFBa0IsSUFBSTtBQUN2SSxhQUFPLFlBQVksYUFBYSxRQUFRLEdBQUcsaURBQWlEO0FBQzVGLGFBQU8sWUFBWSxhQUFhLENBQUMsRUFBRSxJQUFJLFNBQVMsR0FBRyxJQUFJLFNBQVMsQ0FBQztBQUNqRSxxQ0FBK0IsUUFBUTtBQUV2QyxpQkFBVyxRQUFRO0FBQUEsSUFDcEIsQ0FBQztBQUVELFNBQUsscUVBQXFFLFlBQVk7QUFDckYsWUFBTSxvQkFBb0IsWUFBWSxJQUFJLElBQUksNEJBQTRCLENBQUM7QUFDM0UsbUJBQWEsS0FBSyxvQkFBb0IsaUJBQWlCO0FBQ3ZELFlBQU0saUJBQWlCLFlBQVksSUFBSSxhQUFhLGVBQWUsY0FBYyxDQUFDO0FBQ2xGLG1CQUFhLEtBQUssaUJBQWlCLGNBQWM7QUFFakQsWUFBTSxNQUFNLElBQUksTUFBTSxvREFBb0Q7QUFDMUUsWUFBTSxVQUFVLGFBQWEsQ0FBQztBQUFBLFFBQzdCLE1BQU0sSUFBSTtBQUFBLFFBQ1YsVUFBVTtBQUFBLFVBQ1Q7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDLENBQUM7QUFFRixZQUFNLFlBQVk7QUFBQSxRQUNqQixZQUFZLEVBQUUsT0FBTyxvQkFBb0I7QUFBQSxRQUN6QyxxQkFBcUIsQ0FBQyx3QkFBd0I7QUFBQSxNQUMvQztBQUVBLFlBQU0sYUFBYSxlQUFlLDJCQUEyQixXQUFXLFlBQVksY0FBYztBQUFBLFFBQ2pHLG9CQUFvQixZQUFZLENBQUMsRUFBRSxLQUFLLE1BQU0sb0JBQW9CLENBQUM7QUFBQSxNQUNwRSxDQUFDO0FBRUQsd0JBQWtCLGNBQWMsSUFBSTtBQUNwQyxZQUFNLGVBQWUsTUFBTSxlQUFlLG9CQUFvQixrQkFBa0IsSUFBSTtBQUNwRixhQUFPLFlBQVksYUFBYSxRQUFRLEdBQUcsa0VBQWtFO0FBRTdHLHdCQUFrQixjQUFjLEtBQUs7QUFDckMsd0JBQWtCLHFCQUFxQixDQUFDLG1CQUFtQixDQUFDO0FBQzVELFlBQU0sZ0JBQWdCLE1BQU0sZUFBZSxvQkFBb0Isa0JBQWtCLElBQUk7QUFDckYsYUFBTyxZQUFZLGNBQWMsUUFBUSxHQUFHLGdGQUFnRjtBQUU1SCxpQkFBVyxRQUFRO0FBQUEsSUFDcEIsQ0FBQztBQUVELFNBQUssNkVBQTZFLFlBQVk7QUFDN0Ysd0JBQWtCLHFCQUFxQixjQUFjLGtCQUFrQixJQUFJO0FBQzNFLHdCQUFrQixxQkFBcUIsY0FBYyxxQkFBcUIsQ0FBQyxDQUFDO0FBRTVFLFlBQU0sV0FBVyxJQUFJLE1BQU0scURBQXFEO0FBQ2hGLFlBQU0saUJBQWlCLElBQUksTUFBTSw0REFBNEQ7QUFDN0YsWUFBTSxZQUFZLElBQUksTUFBTSxzREFBc0Q7QUFDbEYsWUFBTSxXQUFXLElBQUksTUFBTSwyREFBMkQ7QUFDdEYsWUFBTSxZQUFZO0FBQUEsUUFDakIsWUFBWSxFQUFFLE9BQU8sb0JBQW9CO0FBQUEsTUFDMUM7QUFDQSxZQUFNLGVBQWUsQ0FBQyxZQUFZO0FBRWxDLFlBQU0sVUFBVSxhQUFhO0FBQUEsUUFDNUI7QUFBQSxVQUNDLE1BQU0sU0FBUztBQUFBLFVBQ2YsVUFBVTtBQUFBLFlBQ1Q7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxNQUFNLGVBQWU7QUFBQSxVQUNyQixVQUFVO0FBQUEsWUFDVDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxVQUNDLE1BQU0sVUFBVTtBQUFBLFVBQ2hCLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsTUFBTSxTQUFTO0FBQUEsVUFDZixVQUFVO0FBQUEsWUFDVDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUVELFlBQU0sZ0JBQWdCO0FBQUEsUUFDckIsUUFBUSx3QkFBd0IsWUFBWSxPQUFPLFVBQVUsV0FBVyxRQUFXLFFBQVcsUUFBVyxZQUFZO0FBQUEsUUFDckgsUUFBUSx3QkFBd0IsWUFBWSxjQUFjLGdCQUFnQixXQUFXLFFBQVcsUUFBVyxRQUFXLFlBQVk7QUFBQSxRQUNsSSxRQUFRLHdCQUF3QixZQUFZLFFBQVEsV0FBVyxXQUFXLFFBQVcsUUFBVyxRQUFXLFlBQVk7QUFBQSxRQUN2SCxRQUFRLHdCQUF3QixZQUFZLE9BQU8sVUFBVSxXQUFXLFFBQVcsUUFBVyxRQUFXLFlBQVk7QUFBQSxNQUN0SDtBQUVBLFVBQUk7QUFDSCxjQUFNLFNBQVMsTUFBTSxRQUFRLGdCQUFnQixrQkFBa0IsSUFBSSxHQUFHLEtBQUssVUFBUSxLQUFLLElBQUksU0FBUyxNQUFNLFNBQVMsU0FBUyxDQUFDO0FBQzlILGNBQU0sZUFBZSxNQUFNLFFBQVEsb0JBQW9CLGtCQUFrQixJQUFJLEdBQUcsS0FBSyxVQUFRLEtBQUssSUFBSSxTQUFTLE1BQU0sZUFBZSxTQUFTLENBQUM7QUFDOUksY0FBTSxVQUFVLE1BQU0sUUFBUSx1QkFBdUIsa0JBQWtCLElBQUksR0FBRyxLQUFLLFVBQVEsS0FBSyxJQUFJLFNBQVMsTUFBTSxVQUFVLFNBQVMsQ0FBQztBQUN2SSxjQUFNLFNBQVMsTUFBTSxRQUFRLGdCQUFnQixrQkFBa0IsSUFBSSxJQUFJLEtBQUssVUFBUSxLQUFLLElBQUksU0FBUyxNQUFNLFNBQVMsU0FBUyxDQUFDO0FBRS9ILGVBQU8sZ0JBQWdCLE9BQU8sY0FBYyxZQUFZO0FBQ3hELGVBQU8sZ0JBQWdCLGFBQWEsY0FBYyxZQUFZO0FBQzlELGVBQU8sZ0JBQWdCLFFBQVEsY0FBYyxZQUFZO0FBQ3pELGVBQU8sZ0JBQWdCLE9BQU8sY0FBYyxZQUFZO0FBQUEsTUFDekQsVUFBRTtBQUNELG1CQUFXLGdCQUFnQixlQUFlO0FBQ3pDLHVCQUFhLFFBQVE7QUFBQSxRQUN0QjtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLHdDQUF3QyxNQUFNO0FBQ25ELFNBQUsseUVBQXlFLFlBQVk7QUFDekYsWUFBTSxlQUFlO0FBQ3JCLFlBQU0sYUFBYSxHQUFHLFlBQVk7QUFDbEMsWUFBTSxnQkFBZ0IsSUFBSSxLQUFLLFVBQVU7QUFFekMsOEJBQXdCLGFBQWEsY0FBYyxhQUFhLENBQUM7QUFFakUsWUFBTSxVQUFVLGFBQWE7QUFBQTtBQUFBLFFBRTVCO0FBQUEsVUFDQyxNQUFNLEdBQUcsWUFBWTtBQUFBLFVBQ3JCLFVBQVUsQ0FBQyxzQkFBc0I7QUFBQSxRQUNsQztBQUFBO0FBQUEsUUFFQTtBQUFBLFVBQ0MsTUFBTSxHQUFHLFlBQVk7QUFBQSxVQUNyQixVQUFVO0FBQUEsWUFDVDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBO0FBQUEsUUFFQTtBQUFBLFVBQ0MsTUFBTSxHQUFHLFlBQVk7QUFBQSxVQUNyQixVQUFVO0FBQUEsWUFDVDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUE7QUFBQSxRQUVBO0FBQUEsVUFDQyxNQUFNLEdBQUcsWUFBWTtBQUFBLFVBQ3JCLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxNQUFNLEdBQUcsVUFBVTtBQUFBLFVBQ25CLFVBQVUsQ0FBQyxzQkFBc0I7QUFBQSxRQUNsQztBQUFBLE1BQ0QsQ0FBQztBQUlELFlBQU0sa0JBQWtCLHFCQUFxQixjQUFjLCtCQUErQixJQUFJO0FBQzlGLFlBQU0sa0JBQWtCLHFCQUFxQixjQUFjLG9DQUFvQyxLQUFLO0FBR3BHLFVBQUksY0FBYyxNQUFNLFFBQVEsZ0JBQWdCLFlBQVksUUFBUSxrQkFBa0IsSUFBSTtBQUMxRixVQUFJLGFBQWEsTUFBTSxRQUFRLGdCQUFnQixZQUFZLE9BQU8sa0JBQWtCLElBQUk7QUFDeEYsVUFBSSxtQkFBbUIsTUFBTSxRQUFRLGdCQUFnQixZQUFZLGNBQWMsa0JBQWtCLElBQUk7QUFFckcsYUFBTyxHQUFHLENBQUMsWUFBWSxLQUFLLE9BQUssRUFBRSxJQUFJLEtBQUssU0FBUyxZQUFZLENBQUMsR0FBRyxvRUFBb0U7QUFDekksYUFBTyxHQUFHLENBQUMsV0FBVyxLQUFLLE9BQUssRUFBRSxJQUFJLEtBQUssU0FBUyxZQUFZLENBQUMsR0FBRyxtRUFBbUU7QUFDdkksYUFBTyxHQUFHLENBQUMsaUJBQWlCLEtBQUssT0FBSyxFQUFFLElBQUksS0FBSyxTQUFTLFlBQVksQ0FBQyxHQUFHLHlFQUF5RTtBQUduSix3QkFBa0IscUJBQXFCLGNBQWMsb0NBQW9DLElBQUk7QUFDN0YsdUJBQWlCLG1CQUFtQixjQUFjLGtDQUFrQztBQUVwRixvQkFBYyxNQUFNLFFBQVEsZ0JBQWdCLFlBQVksUUFBUSxrQkFBa0IsSUFBSTtBQUN0RixtQkFBYSxNQUFNLFFBQVEsZ0JBQWdCLFlBQVksT0FBTyxrQkFBa0IsSUFBSTtBQUNwRix5QkFBbUIsTUFBTSxRQUFRLGdCQUFnQixZQUFZLGNBQWMsa0JBQWtCLElBQUk7QUFFakcsWUFBTSxjQUFjLFlBQVksSUFBSSxPQUFLLEVBQUUsSUFBSSxJQUFJO0FBQ25ELFlBQU0sYUFBYSxXQUFXLElBQUksT0FBSyxFQUFFLElBQUksSUFBSTtBQUNqRCxZQUFNLG1CQUFtQixpQkFBaUIsSUFBSSxPQUFLLEVBQUUsSUFBSSxJQUFJO0FBRTdELGFBQU8sR0FBRyxZQUFZLFNBQVMsR0FBRyxZQUFZLGlDQUFpQyxHQUFHLDhEQUE4RDtBQUNoSixhQUFPLEdBQUcsV0FBVyxTQUFTLEdBQUcsWUFBWSxtQ0FBbUMsR0FBRyw2REFBNkQ7QUFDaEosYUFBTyxHQUFHLGlCQUFpQixTQUFTLEdBQUcsWUFBWSxrREFBa0QsR0FBRyxtRUFBbUU7QUFBQSxJQUM1SyxDQUFDO0FBRUQsU0FBSyw0REFBNEQsWUFBWTtBQUM1RSxZQUFNLGVBQWU7QUFDckIsWUFBTSxhQUFhLEdBQUcsWUFBWTtBQUNsQyxZQUFNLGdCQUFnQixJQUFJLEtBQUssVUFBVTtBQUV6Qyw4QkFBd0IsYUFBYSxjQUFjLGFBQWEsQ0FBQztBQUVqRSxZQUFNLFVBQVUsYUFBYTtBQUFBO0FBQUEsUUFFNUI7QUFBQSxVQUNDLE1BQU0sR0FBRyxZQUFZO0FBQUEsVUFDckIsVUFBVSxDQUFDLHNCQUFzQjtBQUFBLFFBQ2xDO0FBQUE7QUFBQSxRQUVBO0FBQUEsVUFDQyxNQUFNLEdBQUcsWUFBWTtBQUFBLFVBQ3JCLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUE7QUFBQSxRQUVBO0FBQUEsVUFDQyxNQUFNLEdBQUcsWUFBWTtBQUFBLFVBQ3JCLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQTtBQUFBLFFBRUE7QUFBQSxVQUNDLE1BQU0sR0FBRyxZQUFZO0FBQUEsVUFDckIsVUFBVTtBQUFBLFlBQ1Q7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxVQUNDLE1BQU0sR0FBRyxVQUFVO0FBQUEsVUFDbkIsVUFBVSxDQUFDLHNCQUFzQjtBQUFBLFFBQ2xDO0FBQUEsTUFDRCxDQUFDO0FBRUQsd0JBQWtCLHFCQUFxQixjQUFjLCtCQUErQixJQUFJO0FBQ3hGLHdCQUFrQixxQkFBcUIsY0FBYyxvQ0FBb0MsSUFBSTtBQUM3Rix1QkFBaUIsbUJBQW1CLGNBQWMsK0JBQStCLGNBQWMsa0NBQWtDO0FBSWpJLDRCQUFzQixrQkFBa0IsQ0FBQyxRQUFhO0FBQ3JELFlBQUksSUFBSSxTQUFTLGNBQWM7QUFDOUIsaUJBQU8sUUFBUSxRQUFRLEVBQUUsU0FBUyxPQUFPLElBQUksQ0FBQztBQUFBLFFBQy9DO0FBQ0EsZUFBTyxRQUFRLFFBQVEsRUFBRSxTQUFTLE1BQU0sSUFBSSxDQUFDO0FBQUEsTUFDOUM7QUFFQSxZQUFNLGNBQWMsTUFBTSxRQUFRLGdCQUFnQixZQUFZLFFBQVEsa0JBQWtCLElBQUk7QUFDNUYsWUFBTSxhQUFhLE1BQU0sUUFBUSxnQkFBZ0IsWUFBWSxPQUFPLGtCQUFrQixJQUFJO0FBQzFGLFlBQU0sbUJBQW1CLE1BQU0sUUFBUSxnQkFBZ0IsWUFBWSxjQUFjLGtCQUFrQixJQUFJO0FBRXZHLGFBQU8sR0FBRyxDQUFDLFlBQVksS0FBSyxPQUFLLEVBQUUsSUFBSSxLQUFLLFNBQVMsWUFBWSxDQUFDLEdBQUcsbUVBQW1FO0FBQ3hJLGFBQU8sR0FBRyxDQUFDLFdBQVcsS0FBSyxPQUFLLEVBQUUsSUFBSSxLQUFLLFNBQVMsWUFBWSxDQUFDLEdBQUcsa0VBQWtFO0FBQ3RJLGFBQU8sR0FBRyxDQUFDLGlCQUFpQixLQUFLLE9BQUssRUFBRSxJQUFJLEtBQUssU0FBUyxZQUFZLENBQUMsR0FBRyx3RUFBd0U7QUFBQSxJQUNuSixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyx5QkFBeUIsWUFBWTtBQUN6QyxVQUFNLGlCQUFpQixJQUFJLE1BQU0sOERBQThEO0FBQy9GLFVBQU0sWUFBWTtBQUFBLE1BQ2pCLFlBQVksRUFBRSxPQUFPLG9CQUFvQjtBQUFBLE1BQ3pDLHFCQUFxQixDQUFDLHdCQUF3QjtBQUFBLElBQy9DO0FBR0EsVUFBTSxVQUFVLGFBQWE7QUFBQSxNQUM1QjtBQUFBLFFBQ0MsTUFBTSxlQUFlO0FBQUEsUUFDckIsVUFBVTtBQUFBLFVBQ1Q7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUVELFVBQU0sV0FBVztBQUFBLE1BQ2hCLG9CQUFvQixPQUFPLFVBQThCLFdBQThCO0FBQ3RGLGVBQU87QUFBQSxVQUNOO0FBQUEsWUFDQyxLQUFLO0FBQUEsVUFDTjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFVBQU0sYUFBYSxRQUFRLDJCQUEyQixXQUFXLFlBQVksY0FBYyxRQUFRO0FBRW5HLFVBQU0sU0FBUyxNQUFNLFFBQVEsZ0JBQWdCLFlBQVksY0FBYyxrQkFBa0IsSUFBSTtBQUM3RixVQUFNLHNCQUFzQixPQUFPLEtBQUssT0FBSyxFQUFFLElBQUksU0FBUyxNQUFNLGVBQWUsU0FBUyxDQUFDO0FBRTNGLFdBQU8sR0FBRyxxQkFBcUIsc0NBQXNDO0FBQ3JFLFdBQU8sWUFBWSxvQkFBcUIsSUFBSSxTQUFTLEdBQUcsZUFBZSxTQUFTLENBQUM7QUFDakYsV0FBTyxZQUFZLG9CQUFxQixTQUFTLGVBQWUsU0FBUztBQUN6RSxXQUFPLFlBQVksb0JBQXFCLFFBQVEsaUJBQWlCLFlBQVk7QUFFN0UsZUFBVyxRQUFRO0FBR25CLFVBQU0scUJBQXFCLE1BQU0sUUFBUSxnQkFBZ0IsWUFBWSxjQUFjLGtCQUFrQixJQUFJO0FBQ3pHLFVBQU0sb0JBQW9CLG1CQUFtQixLQUFLLE9BQUssRUFBRSxJQUFJLFNBQVMsTUFBTSxlQUFlLFNBQVMsQ0FBQztBQUNyRyxXQUFPLFlBQVksbUJBQW1CLE1BQVM7QUFBQSxFQUNoRCxDQUFDO0FBRUQsT0FBSyxxRUFBcUUsWUFBWTtBQUNyRixzQkFBa0IscUJBQXFCLGNBQWMsa0JBQWtCLElBQUk7QUFDM0Usc0JBQWtCLHFCQUFxQixjQUFjLHFCQUFxQixDQUFDLENBQUM7QUFFNUUsVUFBTSxXQUFXLElBQUksTUFBTSxpREFBaUQ7QUFDNUUsVUFBTSxpQkFBaUIsSUFBSSxNQUFNLHdEQUF3RDtBQUN6RixVQUFNLFlBQVksSUFBSSxNQUFNLGtEQUFrRDtBQUM5RSxVQUFNLFdBQVcsSUFBSSxNQUFNLHVEQUF1RDtBQUNsRixVQUFNLFlBQVk7QUFBQSxNQUNqQixZQUFZLEVBQUUsT0FBTyxvQkFBb0I7QUFBQSxNQUN6QyxxQkFBcUIsQ0FBQyx3QkFBd0I7QUFBQSxJQUMvQztBQUVBLFVBQU0sZUFBZSxDQUFDLFlBQVk7QUFFbEMsVUFBTSxVQUFVLGFBQWE7QUFBQSxNQUM1QjtBQUFBLFFBQ0MsTUFBTSxTQUFTO0FBQUEsUUFDZixVQUFVO0FBQUEsVUFDVDtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLE1BQ0E7QUFBQSxRQUNDLE1BQU0sZUFBZTtBQUFBLFFBQ3JCLFVBQVU7QUFBQSxVQUNUO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsTUFDQTtBQUFBLFFBQ0MsTUFBTSxVQUFVO0FBQUEsUUFDaEIsVUFBVTtBQUFBLFVBQ1Q7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxNQUNBO0FBQUEsUUFDQyxNQUFNLFNBQVM7QUFBQSxRQUNmLFVBQVU7QUFBQSxVQUNUO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsVUFBTSxnQkFBZ0I7QUFBQSxNQUNyQixRQUFRLDJCQUEyQixXQUFXLFlBQVksT0FBTztBQUFBLFFBQ2hFLG9CQUFvQixZQUFZLENBQUMsRUFBRSxLQUFLLFVBQVUsYUFBYSxDQUFDO0FBQUEsTUFDakUsQ0FBQztBQUFBLE1BQ0QsUUFBUSwyQkFBMkIsV0FBVyxZQUFZLGNBQWM7QUFBQSxRQUN2RSxvQkFBb0IsWUFBWSxDQUFDLEVBQUUsS0FBSyxnQkFBZ0IsYUFBYSxDQUFDO0FBQUEsTUFDdkUsQ0FBQztBQUFBLE1BQ0QsUUFBUSwyQkFBMkIsV0FBVyxZQUFZLFFBQVE7QUFBQSxRQUNqRSxvQkFBb0IsWUFBWSxDQUFDLEVBQUUsS0FBSyxXQUFXLGFBQWEsQ0FBQztBQUFBLE1BQ2xFLENBQUM7QUFBQSxNQUNELFFBQVEsMkJBQTJCLFdBQVcsWUFBWSxPQUFPO0FBQUEsUUFDaEUsb0JBQW9CLFlBQVksQ0FBQyxFQUFFLEtBQUssVUFBVSxhQUFhLENBQUM7QUFBQSxNQUNqRSxDQUFDO0FBQUEsSUFDRjtBQUVBLFFBQUk7QUFDSCxZQUFNLFNBQVMsTUFBTSxRQUFRLGdCQUFnQixrQkFBa0IsSUFBSSxHQUFHLEtBQUssVUFBUSxLQUFLLElBQUksU0FBUyxNQUFNLFNBQVMsU0FBUyxDQUFDO0FBQzlILFlBQU0sZUFBZSxNQUFNLFFBQVEsb0JBQW9CLGtCQUFrQixJQUFJLEdBQUcsS0FBSyxVQUFRLEtBQUssSUFBSSxTQUFTLE1BQU0sZUFBZSxTQUFTLENBQUM7QUFDOUksWUFBTSxVQUFVLE1BQU0sUUFBUSx1QkFBdUIsa0JBQWtCLElBQUksR0FBRyxLQUFLLFVBQVEsS0FBSyxJQUFJLFNBQVMsTUFBTSxVQUFVLFNBQVMsQ0FBQztBQUN2SSxZQUFNLFNBQVMsTUFBTSxRQUFRLGdCQUFnQixrQkFBa0IsSUFBSSxJQUFJLEtBQUssVUFBUSxLQUFLLElBQUksU0FBUyxNQUFNLFNBQVMsU0FBUyxDQUFDO0FBRS9ILGFBQU8sZ0JBQWdCLE9BQU8sY0FBYyxZQUFZO0FBQ3hELGFBQU8sZ0JBQWdCLGFBQWEsY0FBYyxZQUFZO0FBQzlELGFBQU8sZ0JBQWdCLFFBQVEsY0FBYyxZQUFZO0FBQ3pELGFBQU8sZ0JBQWdCLE9BQU8sY0FBYyxZQUFZO0FBQUEsSUFDekQsVUFBRTtBQUNELGlCQUFXLGdCQUFnQixlQUFlO0FBQ3pDLHFCQUFhLFFBQVE7QUFBQSxNQUN0QjtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLHdCQUF3QixZQUFZO0FBQ3hDLFVBQU0sWUFBWSxJQUFJLE1BQU0sbURBQW1EO0FBQy9FLFVBQU0sWUFBWTtBQUFBLE1BQ2pCLFlBQVksRUFBRSxPQUFPLG9CQUFvQjtBQUFBLE1BQ3pDLHFCQUFxQixDQUFDLHdCQUF3QjtBQUFBLElBQy9DO0FBR0EsVUFBTSxVQUFVLGFBQWE7QUFBQSxNQUM1QjtBQUFBLFFBQ0MsTUFBTSxVQUFVO0FBQUEsUUFDaEIsVUFBVTtBQUFBLFVBQ1Q7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUVELFVBQU0sV0FBVztBQUFBLE1BQ2hCLG9CQUFvQixPQUFPLFVBQThCLFdBQThCO0FBQ3RGLGVBQU87QUFBQSxVQUNOO0FBQUEsWUFDQyxLQUFLO0FBQUEsVUFDTjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFVBQU0sYUFBYSxRQUFRLDJCQUEyQixXQUFXLFlBQVksUUFBUSxRQUFRO0FBRTdGLFVBQU0sU0FBUyxNQUFNLFFBQVEsZ0JBQWdCLFlBQVksUUFBUSxrQkFBa0IsSUFBSTtBQUN2RixVQUFNLGlCQUFpQixPQUFPLEtBQUssT0FBSyxFQUFFLElBQUksU0FBUyxNQUFNLFVBQVUsU0FBUyxDQUFDO0FBRWpGLFdBQU8sR0FBRyxnQkFBZ0IsaUNBQWlDO0FBQzNELFdBQU8sWUFBWSxlQUFnQixJQUFJLFNBQVMsR0FBRyxVQUFVLFNBQVMsQ0FBQztBQUN2RSxXQUFPLFlBQVksZUFBZ0IsU0FBUyxlQUFlLFNBQVM7QUFDcEUsV0FBTyxZQUFZLGVBQWdCLFFBQVEsaUJBQWlCLFlBQVk7QUFFeEUsZUFBVyxRQUFRO0FBR25CLFVBQU0scUJBQXFCLE1BQU0sUUFBUSxnQkFBZ0IsWUFBWSxRQUFRLGtCQUFrQixJQUFJO0FBQ25HLFVBQU0sb0JBQW9CLG1CQUFtQixLQUFLLE9BQUssRUFBRSxJQUFJLFNBQVMsTUFBTSxVQUFVLFNBQVMsQ0FBQztBQUNoRyxXQUFPLFlBQVksbUJBQW1CLE1BQVM7QUFBQSxFQUNoRCxDQUFDO0FBRUQsT0FBSyx1QkFBdUIsWUFBWTtBQUN2QyxVQUFNLFdBQVcsSUFBSSxNQUFNLGlEQUFpRDtBQUM1RSxVQUFNLFlBQVk7QUFBQSxNQUNqQixZQUFZLEVBQUUsT0FBTyxvQkFBb0I7QUFBQSxNQUN6QyxxQkFBcUIsQ0FBQyx3QkFBd0I7QUFBQSxJQUMvQztBQUdBLFVBQU0sVUFBVSxhQUFhO0FBQUEsTUFDNUI7QUFBQSxRQUNDLE1BQU0sU0FBUztBQUFBLFFBQ2YsVUFBVTtBQUFBLFVBQ1Q7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFFRCxVQUFNLFdBQVc7QUFBQSxNQUNoQixvQkFBb0IsT0FBTyxVQUE4QixXQUE4QjtBQUN0RixlQUFPO0FBQUEsVUFDTjtBQUFBLFlBQ0MsS0FBSztBQUFBLFVBQ047QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxVQUFNLGFBQWEsUUFBUSwyQkFBMkIsV0FBVyxZQUFZLE9BQU8sUUFBUTtBQUU1RixVQUFNLFNBQVMsTUFBTSxRQUFRLGdCQUFnQixZQUFZLE9BQU8sa0JBQWtCLElBQUk7QUFDdEYsVUFBTSxnQkFBZ0IsT0FBTyxLQUFLLE9BQUssRUFBRSxJQUFJLFNBQVMsTUFBTSxTQUFTLFNBQVMsQ0FBQztBQUUvRSxXQUFPLEdBQUcsZUFBZSxnQ0FBZ0M7QUFDekQsV0FBTyxZQUFZLGNBQWUsSUFBSSxTQUFTLEdBQUcsU0FBUyxTQUFTLENBQUM7QUFDckUsV0FBTyxZQUFZLGNBQWUsU0FBUyxlQUFlLFNBQVM7QUFDbkUsV0FBTyxZQUFZLGNBQWUsUUFBUSxpQkFBaUIsWUFBWTtBQUV2RSxlQUFXLFFBQVE7QUFHbkIsVUFBTSxxQkFBcUIsTUFBTSxRQUFRLGdCQUFnQixZQUFZLE9BQU8sa0JBQWtCLElBQUk7QUFDbEcsVUFBTSxvQkFBb0IsbUJBQW1CLEtBQUssT0FBSyxFQUFFLElBQUksU0FBUyxNQUFNLFNBQVMsU0FBUyxDQUFDO0FBQy9GLFdBQU8sWUFBWSxtQkFBbUIsTUFBUztBQUFBLEVBQ2hELENBQUM7QUFFRCxRQUFNLG1CQUFtQixNQUFNO0FBQzlCLGFBQVMsTUFBTTtBQUNkLFlBQU0sUUFBUTtBQUFBLElBQ2YsQ0FBQztBQUVELFNBQUssNkRBQTZELFlBQVk7QUFDN0Usd0JBQWtCLHFCQUFxQixjQUFjLGtCQUFrQixLQUFLO0FBRTVFLFlBQU0sU0FBUyxNQUFNLFFBQVEsZ0JBQWdCLGtCQUFrQixJQUFJO0FBQ25FLGFBQU8sWUFBWSxRQUFRLE1BQVM7QUFBQSxJQUNyQyxDQUFDO0FBRUQsU0FBSyxpREFBaUQsWUFBWTtBQUNqRSx3QkFBa0IscUJBQXFCLGNBQWMsa0JBQWtCLElBQUk7QUFDM0Usd0JBQWtCLHFCQUFxQixjQUFjLHFCQUFxQixDQUFDLENBQUM7QUFFNUUsWUFBTSxpQkFBaUI7QUFDdkIsWUFBTSxhQUFhLElBQUksY0FBYztBQUNyQyxZQUFNLGdCQUFnQixJQUFJLEtBQUssVUFBVTtBQUV6Qyw4QkFBd0IsYUFBYSxjQUFjLGFBQWEsQ0FBQztBQUlqRSxZQUFNLFVBQVUsYUFBYTtBQUFBLFFBQzVCO0FBQUEsVUFDQyxNQUFNLEdBQUcsVUFBVTtBQUFBLFVBQ25CLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsTUFBTSxHQUFHLFVBQVU7QUFBQSxVQUNuQixVQUFVO0FBQUEsWUFDVDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxVQUNDLE1BQU0sR0FBRyxVQUFVO0FBQUEsVUFDbkIsVUFBVTtBQUFBLFlBQ1Q7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxVQUNDLE1BQU0sR0FBRyxVQUFVO0FBQUEsVUFDbkIsVUFBVSxDQUFDLHFCQUFxQjtBQUFBLFFBQ2pDO0FBQUEsUUFDQTtBQUFBLFVBQ0MsTUFBTTtBQUFBLFVBQ04sVUFBVTtBQUFBLFlBQ1Q7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxNQUFNO0FBQUEsVUFDTixVQUFVLENBQUMsa0JBQWtCO0FBQUEsUUFDOUI7QUFBQSxRQUNBO0FBQUEsVUFDQyxNQUFNO0FBQUEsVUFDTixVQUFVO0FBQUEsWUFDVDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUVELFlBQU0sWUFBWSxNQUFNLFFBQVEsZ0JBQWdCLGtCQUFrQixJQUFJO0FBRXRFLGFBQU8sR0FBRyxXQUFXLHFEQUFxRDtBQUMxRSxZQUFNLFNBQVM7QUFDZixhQUFPLFlBQVksT0FBTyxRQUFRLEdBQUcsNEJBQTRCO0FBR2pFLFlBQU0sZ0JBQWdCLE9BQU8sT0FBTyxXQUFTLE1BQU0sWUFBWSxlQUFlLEtBQUs7QUFDbkYsYUFBTyxZQUFZLGNBQWMsUUFBUSxHQUFHLDhCQUE4QjtBQUUxRSxZQUFNLGVBQWUsY0FBYyxLQUFLLFdBQVMsTUFBTSxTQUFTLGdCQUFnQjtBQUNoRixhQUFPLEdBQUcsY0FBYyw0QkFBNEI7QUFDcEQsYUFBTyxZQUFZLGFBQWEsYUFBYSw0QkFBNEI7QUFDekUsYUFBTyxZQUFZLGFBQWEsSUFBSSxNQUFNLEdBQUcsVUFBVSx5Q0FBeUM7QUFFaEcsWUFBTSxlQUFlLGNBQWMsS0FBSyxXQUFTLE1BQU0sU0FBUyxnQkFBZ0I7QUFDaEYsYUFBTyxHQUFHLGNBQWMsNEJBQTRCO0FBQ3BELGFBQU8sWUFBWSxhQUFhLGFBQWEsNEJBQTRCO0FBQ3pFLGFBQU8sWUFBWSxhQUFhLElBQUksTUFBTSxHQUFHLFVBQVUseUNBQXlDO0FBR2hHLFlBQU0sZUFBZSxjQUFjLEtBQUssV0FBUyxNQUFNLFNBQVMsZUFBZTtBQUMvRSxhQUFPLEdBQUcsY0FBYyx5REFBeUQ7QUFDakYsYUFBTyxZQUFZLGFBQWEsYUFBYSx3QkFBd0I7QUFDckUsYUFBTyxZQUFZLGFBQWEsSUFBSSxNQUFNLEdBQUcsVUFBVSx3Q0FBd0M7QUFHL0YsWUFBTSxpQkFBaUIsT0FBTyxPQUFPLFdBQVMsTUFBTSxZQUFZLGVBQWUsSUFBSTtBQUNuRixhQUFPLFlBQVksZUFBZSxRQUFRLEdBQUcsK0JBQStCO0FBRTVFLFlBQU0saUJBQWlCLGVBQWUsS0FBSyxXQUFTLE1BQU0sU0FBUyxrQkFBa0I7QUFDckYsYUFBTyxHQUFHLGdCQUFnQiw4QkFBOEI7QUFDeEQsYUFBTyxZQUFZLGVBQWUsYUFBYSw4QkFBOEI7QUFDN0UsYUFBTyxZQUFZLGVBQWUsSUFBSSxNQUFNLHFEQUFxRDtBQUVqRyxZQUFNLGdCQUFnQixlQUFlLEtBQUssV0FBUyxNQUFNLFNBQVMsaUJBQWlCO0FBQ25GLGFBQU8sR0FBRyxlQUFlLDZCQUE2QjtBQUN0RCxhQUFPLFlBQVksY0FBYyxhQUFhLDZCQUE2QjtBQUMzRSxhQUFPLFlBQVksY0FBYyxJQUFJLE1BQU0scURBQXFEO0FBQUEsSUFDakcsQ0FBQztBQUVELFNBQUssMkNBQTJDLFlBQVk7QUFDM0Qsd0JBQWtCLHFCQUFxQixjQUFjLGtCQUFrQixJQUFJO0FBQzNFLHdCQUFrQixxQkFBcUIsY0FBYyxxQkFBcUIsQ0FBQyxDQUFDO0FBRTVFLFlBQU0saUJBQWlCO0FBQ3ZCLFlBQU0sYUFBYSxJQUFJLGNBQWM7QUFDckMsWUFBTSxnQkFBZ0IsSUFBSSxLQUFLLFVBQVU7QUFFekMsOEJBQXdCLGFBQWEsY0FBYyxhQUFhLENBQUM7QUFJakUsWUFBTSxVQUFVLGFBQWE7QUFBQSxRQUM1QjtBQUFBLFVBQ0MsTUFBTSxHQUFHLFVBQVU7QUFBQSxVQUNuQixVQUFVO0FBQUEsWUFDVDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxVQUNDLE1BQU0sR0FBRyxVQUFVO0FBQUEsVUFDbkIsVUFBVTtBQUFBLFlBQ1Q7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUVELFlBQU0sWUFBWSxNQUFNLFFBQVEsZ0JBQWdCLGtCQUFrQixJQUFJO0FBR3RFLGFBQU8sR0FBRyxXQUFXLGdEQUFnRDtBQUNyRSxZQUFNLFNBQVM7QUFDZixhQUFPLFlBQVksT0FBTyxRQUFRLEdBQUcsc0JBQXNCO0FBRTNELFlBQU0sYUFBYSxPQUFPLEtBQUssT0FBSyxFQUFFLFNBQVMsYUFBYTtBQUM1RCxhQUFPLEdBQUcsWUFBWSw2QkFBNkI7QUFDbkQsYUFBTyxZQUFZLFdBQVcsU0FBUyxlQUFlLEtBQUs7QUFFM0QsWUFBTSxlQUFlLE9BQU8sS0FBSyxPQUFLLEVBQUUsU0FBUyxlQUFlO0FBQ2hFLGFBQU8sR0FBRyxjQUFjLHVFQUF1RTtBQUMvRixhQUFPLFlBQVksYUFBYSxTQUFTLGVBQWUsS0FBSztBQUFBLElBQzlELENBQUM7QUFFRCxTQUFLLGtEQUFrRCxZQUFZO0FBQ2xFLHdCQUFrQixxQkFBcUIsY0FBYyxrQkFBa0IsSUFBSTtBQUUzRSxZQUFNLGlCQUFpQjtBQUN2QixZQUFNLGFBQWEsSUFBSSxjQUFjO0FBQ3JDLFlBQU0sZ0JBQWdCLElBQUksS0FBSyxVQUFVO0FBRXpDLDhCQUF3QixhQUFhLGNBQWMsYUFBYSxDQUFDO0FBR2pFLFlBQU0sVUFBVSxhQUFhLENBQUMsQ0FBQztBQUUvQixZQUFNLFlBQVksTUFBTSxRQUFRLGdCQUFnQixrQkFBa0IsSUFBSTtBQUV0RSxhQUFPLEdBQUcsV0FBVyw2QkFBNkI7QUFDbEQsWUFBTSxTQUFTO0FBQ2YsYUFBTyxZQUFZLE9BQU8sUUFBUSxHQUFHLHVCQUF1QjtBQUFBLElBQzdELENBQUM7QUFFRCxTQUFLLCtDQUErQyxZQUFZO0FBQy9ELHdCQUFrQixxQkFBcUIsY0FBYyxrQkFBa0IsSUFBSTtBQUMzRSx3QkFBa0IscUJBQXFCLGNBQWMscUJBQXFCLENBQUMsQ0FBQztBQUU1RSxZQUFNLGlCQUFpQjtBQUN2QixZQUFNLGFBQWEsSUFBSSxjQUFjO0FBQ3JDLFlBQU0sZ0JBQWdCLElBQUksS0FBSyxVQUFVO0FBRXpDLDhCQUF3QixhQUFhLGNBQWMsYUFBYSxDQUFDO0FBRWpFLFlBQU0sV0FBVyxJQUFJLE9BQU8sR0FBRztBQUMvQixZQUFNLGdCQUFnQixJQUFJLE9BQU8sRUFBRTtBQUNuQyxZQUFNLGtCQUFrQixJQUFJLE9BQU8sSUFBSTtBQUV2QyxZQUFNLFVBQVUsYUFBYTtBQUFBLFFBQzVCO0FBQUE7QUFBQSxVQUVDLE1BQU0sR0FBRyxVQUFVLG1CQUFtQixhQUFhO0FBQUEsVUFDbkQsVUFBVTtBQUFBLFlBQ1Q7QUFBQSxZQUNBLFVBQVUsUUFBUTtBQUFBLFlBQ2xCLGlCQUFpQixlQUFlO0FBQUEsWUFDaEM7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxZQUFNLFlBQVksTUFBTSxRQUFRLGdCQUFnQixrQkFBa0IsSUFBSTtBQUV0RSxhQUFPLEdBQUcsV0FBVyx1QkFBdUI7QUFDNUMsWUFBTSxTQUFTO0FBQ2YsYUFBTyxZQUFZLE9BQU8sUUFBUSxHQUFHLHFCQUFxQjtBQUMxRCxhQUFPLFlBQVksT0FBTyxDQUFDLEVBQUUsS0FBSyxRQUFRLElBQUksMkNBQTJDO0FBQ3pGLGFBQU8sWUFBWSxPQUFPLENBQUMsRUFBRSxhQUFhLFFBQVEsTUFBTSxvREFBb0Q7QUFBQSxJQUM3RyxDQUFDO0FBRUQsU0FBSyxvREFBb0QsWUFBWTtBQUNwRSx3QkFBa0IscUJBQXFCLGNBQWMsa0JBQWtCLElBQUk7QUFDM0Usd0JBQWtCLHFCQUFxQixjQUFjLHFCQUFxQixDQUFDLENBQUM7QUFFNUUsWUFBTSxpQkFBaUI7QUFDdkIsWUFBTSxhQUFhLElBQUksY0FBYztBQUNyQyxZQUFNLGdCQUFnQixJQUFJLEtBQUssVUFBVTtBQUV6Qyw4QkFBd0IsYUFBYSxjQUFjLGFBQWEsQ0FBQztBQUdqRSxZQUFNLFVBQVUsYUFBYTtBQUFBLFFBQzVCO0FBQUEsVUFDQyxNQUFNLEdBQUcsVUFBVTtBQUFBLFVBQ25CLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsWUFBTSxZQUFZLE1BQU0sUUFBUSxnQkFBZ0Isa0JBQWtCLElBQUk7QUFFdEUsYUFBTyxHQUFHLFdBQVcsdUJBQXVCO0FBQzVDLFlBQU0sU0FBUztBQUNmLGFBQU8sWUFBWSxPQUFPLFFBQVEsR0FBRyxxQkFBcUI7QUFDMUQsYUFBTyxZQUFZLE9BQU8sQ0FBQyxFQUFFLE1BQU0sdUJBQXVCLHNDQUFzQztBQUNoRyxhQUFPLFlBQVksT0FBTyxDQUFDLEVBQUUsYUFBYSx3Q0FBd0MsNkNBQTZDO0FBQUEsSUFDaEksQ0FBQztBQUVELFNBQUssaURBQWlELFlBQVk7QUFDakUsd0JBQWtCLHFCQUFxQixjQUFjLGtCQUFrQixJQUFJO0FBQzNFLHdCQUFrQixxQkFBcUIsY0FBYyxxQkFBcUIsQ0FBQyxDQUFDO0FBRTVFLFlBQU0saUJBQWlCO0FBQ3ZCLFlBQU0sYUFBYSxJQUFJLGNBQWM7QUFDckMsWUFBTSxnQkFBZ0IsSUFBSSxLQUFLLFVBQVU7QUFFekMsOEJBQXdCLGFBQWEsY0FBYyxhQUFhLENBQUM7QUFFakUsWUFBTSxrQkFBa0IsUUFBUSxJQUFJLE9BQU8sR0FBRyxJQUFJO0FBQ2xELFlBQU0sZ0JBQWdCLElBQUksT0FBTyxFQUFFO0FBQ25DLFlBQU0sa0JBQWtCLFVBQVUsSUFBSSxPQUFPLElBQUksSUFBSTtBQUdyRCxZQUFNLFVBQVUsYUFBYTtBQUFBLFFBQzVCO0FBQUEsVUFDQyxNQUFNLEdBQUcsVUFBVSxtQkFBbUIsYUFBYTtBQUFBLFVBQ25ELFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQSxVQUFVLGVBQWU7QUFBQSxZQUN6QixpQkFBaUIsZUFBZTtBQUFBLFlBQ2hDO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsWUFBTSxZQUFZLE1BQU0sUUFBUSxnQkFBZ0Isa0JBQWtCLElBQUk7QUFFdEUsYUFBTyxHQUFHLFdBQVcsdUJBQXVCO0FBQzVDLFlBQU0sU0FBUztBQUNmLGFBQU8sWUFBWSxPQUFPLFFBQVEsR0FBRyxxQkFBcUI7QUFFMUQsYUFBTyxHQUFHLENBQUMsT0FBTyxDQUFDLEVBQUUsS0FBSyxTQUFTLEdBQUcsR0FBRyxrQ0FBa0M7QUFDM0UsYUFBTyxHQUFHLENBQUMsT0FBTyxDQUFDLEVBQUUsS0FBSyxTQUFTLEdBQUcsR0FBRyxrQ0FBa0M7QUFDM0UsYUFBTyxZQUFZLE9BQU8sQ0FBQyxFQUFFLEtBQUssUUFBUSxJQUFJLDJDQUEyQztBQUN6RixhQUFPLEdBQUcsQ0FBQyxPQUFPLENBQUMsRUFBRSxhQUFhLFNBQVMsR0FBRyxHQUFHLHlDQUF5QztBQUMxRixhQUFPLEdBQUcsQ0FBQyxPQUFPLENBQUMsRUFBRSxhQUFhLFNBQVMsR0FBRyxHQUFHLHlDQUF5QztBQUMxRixhQUFPLFlBQVksT0FBTyxDQUFDLEVBQUUsYUFBYSxRQUFRLE1BQU0sb0RBQW9EO0FBQUEsSUFDN0csQ0FBQztBQUVELFNBQUssZ0VBQWdFLFlBQVk7QUFDaEYsd0JBQWtCLHFCQUFxQixjQUFjLGtCQUFrQixJQUFJO0FBQzNFLHdCQUFrQixxQkFBcUIsY0FBYyxxQkFBcUIsQ0FBQyxDQUFDO0FBRTVFLFlBQU0saUJBQWlCO0FBQ3ZCLFlBQU0sYUFBYSxJQUFJLGNBQWM7QUFDckMsWUFBTSxnQkFBZ0IsSUFBSSxLQUFLLFVBQVU7QUFFekMsOEJBQXdCLGFBQWEsY0FBYyxhQUFhLENBQUM7QUFJakUsWUFBTSxVQUFVLGFBQWE7QUFBQSxRQUM1QjtBQUFBLFVBQ0MsTUFBTSxHQUFHLFVBQVU7QUFBQSxVQUNuQixVQUFVO0FBQUEsWUFDVDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxVQUNDLE1BQU07QUFBQSxVQUNOLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsTUFBTSxHQUFHLFVBQVU7QUFBQSxVQUNuQixVQUFVO0FBQUEsWUFDVDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUVELFlBQU0sWUFBWSxNQUFNLFFBQVEsZ0JBQWdCLGtCQUFrQixJQUFJO0FBRXRFLGFBQU8sR0FBRyxXQUFXLHVCQUF1QjtBQUM1QyxZQUFNLFNBQVM7QUFDZixhQUFPLFlBQVksT0FBTyxRQUFRLEdBQUcsMENBQTBDO0FBRS9FLFlBQU0saUJBQWlCLE9BQU8sS0FBSyxPQUFLLEVBQUUsU0FBUyxpQkFBaUI7QUFDcEUsYUFBTyxHQUFHLGdCQUFnQixpQ0FBaUM7QUFDM0QsYUFBTyxZQUFZLGVBQWUsYUFBYSxxQkFBcUIsaURBQWlEO0FBQ3JILGFBQU8sWUFBWSxlQUFlLFNBQVMsZUFBZSxPQUFPLDBCQUEwQjtBQUUzRixZQUFNLGNBQWMsT0FBTyxLQUFLLE9BQUssRUFBRSxTQUFTLGNBQWM7QUFDOUQsYUFBTyxHQUFHLGFBQWEsOEJBQThCO0FBQUEsSUFDdEQsQ0FBQztBQUVELFNBQUssb0VBQW9FLFlBQVk7QUFDcEYsd0JBQWtCLHFCQUFxQixjQUFjLGtCQUFrQixJQUFJO0FBQzNFLHdCQUFrQixxQkFBcUIsY0FBYyxxQkFBcUIsQ0FBQyxDQUFDO0FBRTVFLFlBQU0saUJBQWlCO0FBQ3ZCLFlBQU0sYUFBYSxJQUFJLGNBQWM7QUFDckMsWUFBTSxnQkFBZ0IsSUFBSSxLQUFLLFVBQVU7QUFFekMsOEJBQXdCLGFBQWEsY0FBYyxhQUFhLENBQUM7QUFHakUsWUFBTSxVQUFVLGFBQWE7QUFBQSxRQUM1QjtBQUFBLFVBQ0MsTUFBTTtBQUFBLFVBQ04sVUFBVTtBQUFBLFlBQ1Q7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxNQUFNLEdBQUcsVUFBVTtBQUFBLFVBQ25CLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsWUFBTSxZQUFZLE1BQU0sUUFBUSxnQkFBZ0Isa0JBQWtCLElBQUk7QUFFdEUsYUFBTyxHQUFHLFdBQVcsdUJBQXVCO0FBQzVDLFlBQU0sU0FBUztBQUNmLGFBQU8sWUFBWSxPQUFPLFFBQVEsR0FBRyx1REFBdUQ7QUFDNUYsYUFBTyxZQUFZLE9BQU8sQ0FBQyxFQUFFLGFBQWEsd0NBQXdDLGdDQUFnQztBQUNsSCxhQUFPLFlBQVksT0FBTyxDQUFDLEVBQUUsU0FBUyxlQUFlLEtBQUs7QUFBQSxJQUMzRCxDQUFDO0FBRUQsU0FBSyw2RkFBNkYsWUFBWTtBQUM3Ryx3QkFBa0IscUJBQXFCLGNBQWMsa0JBQWtCLElBQUk7QUFDM0Usd0JBQWtCLHFCQUFxQixjQUFjLHFCQUFxQixDQUFDLENBQUM7QUFFNUUsWUFBTSxpQkFBaUI7QUFDdkIsWUFBTSxhQUFhLElBQUksY0FBYztBQUNyQyxZQUFNLGdCQUFnQixJQUFJLEtBQUssVUFBVTtBQUV6Qyw4QkFBd0IsYUFBYSxjQUFjLGFBQWEsQ0FBQztBQUVqRSxZQUFNLFVBQVUsYUFBYTtBQUFBLFFBQzVCO0FBQUE7QUFBQSxVQUVDLE1BQU0sR0FBRyxVQUFVO0FBQUEsVUFDbkIsVUFBVTtBQUFBLFlBQ1Q7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUE7QUFBQSxVQUVDLE1BQU0sR0FBRyxVQUFVO0FBQUEsVUFDbkIsVUFBVTtBQUFBLFlBQ1Q7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxZQUFNLFlBQVksTUFBTSxRQUFRLGdCQUFnQixrQkFBa0IsSUFBSTtBQUV0RSxhQUFPLEdBQUcsV0FBVyx1QkFBdUI7QUFDNUMsWUFBTSxTQUFTO0FBQ2YsYUFBTyxZQUFZLE9BQU8sUUFBUSxHQUFHLHlCQUF5QjtBQUU5RCxZQUFNLGtCQUFrQixPQUFPLEtBQUssT0FBSyxFQUFFLFNBQVMsbUJBQW1CO0FBQ3ZFLGFBQU8sR0FBRyxpQkFBaUIsZ0RBQWdEO0FBQzNFLGFBQU8sWUFBWSxnQkFBZ0IsYUFBYSwrQ0FBK0M7QUFFL0YsWUFBTSxhQUFhLE9BQU8sS0FBSyxPQUFLLEVBQUUsU0FBUyxhQUFhO0FBQzVELGFBQU8sR0FBRyxZQUFZLDZCQUE2QjtBQUFBLElBQ3BELENBQUM7QUFFRCxTQUFLLG1GQUFtRixZQUFZO0FBQ25HLHdCQUFrQixxQkFBcUIsY0FBYyxrQkFBa0IsSUFBSTtBQUMzRSx3QkFBa0IscUJBQXFCLGNBQWMscUJBQXFCLENBQUMsQ0FBQztBQUU1RSxZQUFNLGlCQUFpQjtBQUN2QixZQUFNLGFBQWEsSUFBSSxjQUFjO0FBQ3JDLFlBQU0sZ0JBQWdCLElBQUksS0FBSyxVQUFVO0FBRXpDLDhCQUF3QixhQUFhLGNBQWMsYUFBYSxDQUFDO0FBRWpFLFlBQU0sVUFBVSxhQUFhO0FBQUEsUUFDNUI7QUFBQSxVQUNDLE1BQU0sR0FBRyxVQUFVO0FBQUEsVUFDbkIsVUFBVTtBQUFBLFlBQ1Q7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxVQUNDLE1BQU0sR0FBRyxVQUFVO0FBQUEsVUFDbkIsVUFBVTtBQUFBLFlBQ1Q7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxZQUFNLFlBQVksTUFBTSxRQUFRLGdCQUFnQixrQkFBa0IsSUFBSTtBQUV0RSxhQUFPLEdBQUcsV0FBVyx1QkFBdUI7QUFDNUMsWUFBTSxTQUFTO0FBQ2YsYUFBTyxZQUFZLE9BQU8sUUFBUSxHQUFHLHlCQUF5QjtBQUU5RCxZQUFNLGNBQWMsT0FBTyxLQUFLLE9BQUssRUFBRSxTQUFTLGVBQWU7QUFDL0QsYUFBTyxHQUFHLGFBQWEsZ0RBQWdEO0FBQ3ZFLGFBQU8sWUFBWSxZQUFZLGFBQWEsa0NBQWtDO0FBRTlFLFlBQU0sYUFBYSxPQUFPLEtBQUssT0FBSyxFQUFFLFNBQVMsbUJBQW1CO0FBQ2xFLGFBQU8sR0FBRyxZQUFZLHVDQUF1QztBQUFBLElBQzlELENBQUM7QUFFRCxTQUFLLCtEQUErRCxZQUFZO0FBQy9FLHdCQUFrQixxQkFBcUIsY0FBYyxrQkFBa0IsSUFBSTtBQUMzRSx3QkFBa0IscUJBQXFCLGNBQWMscUJBQXFCLENBQUMsQ0FBQztBQUU1RSxZQUFNLGlCQUFpQjtBQUN2QixZQUFNLGFBQWEsSUFBSSxjQUFjO0FBQ3JDLFlBQU0sZ0JBQWdCLElBQUksS0FBSyxVQUFVO0FBRXpDLDhCQUF3QixhQUFhLGNBQWMsYUFBYSxDQUFDO0FBRWpFLFlBQU0sb0JBQW9CLElBQUksTUFBTSx5REFBeUQ7QUFDN0YsWUFBTSxZQUFZO0FBQUEsUUFDakIsWUFBWSxFQUFFLE9BQU8sb0JBQW9CO0FBQUEsUUFDekMscUJBQXFCLENBQUMsd0JBQXdCO0FBQUEsTUFDL0M7QUFHQSxZQUFNLFVBQVUsYUFBYTtBQUFBLFFBQzVCO0FBQUEsVUFDQyxNQUFNLEdBQUcsVUFBVTtBQUFBLFVBQ25CLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsTUFBTSxrQkFBa0I7QUFBQSxVQUN4QixVQUFVO0FBQUEsWUFDVDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUVELFlBQU0sV0FBVztBQUFBLFFBQ2hCLG9CQUFvQixPQUFPLFVBQThCLFdBQThCO0FBQ3RGLGlCQUFPLENBQUMsRUFBRSxLQUFLLGtCQUFrQixDQUFDO0FBQUEsUUFDbkM7QUFBQSxNQUNEO0FBRUEsWUFBTSxhQUFhLFFBQVEsMkJBQTJCLFdBQVcsWUFBWSxPQUFPLFFBQVE7QUFFNUYsWUFBTSxZQUFZLE1BQU0sUUFBUSxnQkFBZ0Isa0JBQWtCLElBQUk7QUFFdEUsYUFBTyxHQUFHLFdBQVcsdUJBQXVCO0FBQzVDLFlBQU0sU0FBUztBQUNmLGFBQU8sWUFBWSxPQUFPLFFBQVEsR0FBRyw4Q0FBOEM7QUFFbkYsWUFBTSxpQkFBaUIsT0FBTyxLQUFLLE9BQUssRUFBRSxTQUFTLGlCQUFpQjtBQUNwRSxhQUFPLEdBQUcsZ0JBQWdCLDZCQUE2QjtBQUN2RCxhQUFPLFlBQVksZUFBZSxTQUFTLGVBQWUsS0FBSztBQUUvRCxZQUFNLGlCQUFpQixPQUFPLEtBQUssT0FBSyxFQUFFLFNBQVMsaUJBQWlCO0FBQ3BFLGFBQU8sR0FBRyxnQkFBZ0IsNkJBQTZCO0FBQ3ZELGFBQU8sWUFBWSxlQUFlLFNBQVMsZUFBZSxTQUFTO0FBRW5FLGlCQUFXLFFBQVE7QUFBQSxJQUNwQixDQUFDO0FBRUQsU0FBSyw2REFBNkQsWUFBWTtBQUM3RSx3QkFBa0IscUJBQXFCLGNBQWMsa0JBQWtCLElBQUk7QUFDM0Usd0JBQWtCLHFCQUFxQixjQUFjLHFCQUFxQixDQUFDLENBQUM7QUFFNUUsWUFBTSxpQkFBaUI7QUFDdkIsWUFBTSxhQUFhLElBQUksY0FBYztBQUNyQyxZQUFNLGdCQUFnQixJQUFJLEtBQUssVUFBVTtBQUV6Qyw4QkFBd0IsYUFBYSxjQUFjLGFBQWEsQ0FBQztBQUVqRSxZQUFNLHNCQUFzQixJQUFJLE1BQU0sMkRBQTJEO0FBQ2pHLFlBQU0sWUFBWTtBQUFBLFFBQ2pCLFlBQVksRUFBRSxPQUFPLG9CQUFvQjtBQUFBLE1BQzFDO0FBRUEsWUFBTSxVQUFVLGFBQWE7QUFBQSxRQUM1QjtBQUFBLFVBQ0MsTUFBTSxHQUFHLFVBQVU7QUFBQSxVQUNuQixVQUFVO0FBQUEsWUFDVDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxVQUNDLE1BQU0sb0JBQW9CO0FBQUEsVUFDMUIsVUFBVTtBQUFBLFlBQ1Q7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxZQUFNLGFBQWEsUUFBUTtBQUFBLFFBQzFCLFlBQVk7QUFBQSxRQUNaO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUVBLFlBQU0sWUFBWSxNQUFNLFFBQVEsZ0JBQWdCLGtCQUFrQixJQUFJO0FBRXRFLGFBQU8sR0FBRyxXQUFXLHVCQUF1QjtBQUM1QyxZQUFNLFNBQVM7QUFDZixhQUFPLFlBQVksT0FBTyxRQUFRLEdBQUcsNENBQTRDO0FBRWpGLFlBQU0sYUFBYSxPQUFPLEtBQUssT0FBSyxFQUFFLFNBQVMsYUFBYTtBQUM1RCxhQUFPLEdBQUcsWUFBWSx5QkFBeUI7QUFDL0MsYUFBTyxZQUFZLFdBQVcsU0FBUyxlQUFlLEtBQUs7QUFFM0QsWUFBTSxtQkFBbUIsT0FBTyxLQUFLLE9BQUssRUFBRSxTQUFTLG1CQUFtQjtBQUN4RSxhQUFPLEdBQUcsa0JBQWtCLCtCQUErQjtBQUMzRCxhQUFPLFlBQVksaUJBQWlCLFNBQVMsZUFBZSxTQUFTO0FBRXJFLGlCQUFXLFFBQVE7QUFHbkIsWUFBTSxxQkFBcUIsTUFBTSxRQUFRLGdCQUFnQixrQkFBa0IsSUFBSTtBQUMvRSxhQUFPLFlBQVksb0JBQW9CLFFBQVEsR0FBRyxvQ0FBb0M7QUFDdEYsYUFBTyxZQUFZLHFCQUFxQixDQUFDLEVBQUUsTUFBTSxhQUFhO0FBQUEsSUFDL0QsQ0FBQztBQUVELFNBQUssa0VBQWtFLFlBQVk7QUFDbEYsd0JBQWtCLHFCQUFxQixjQUFjLGtCQUFrQixJQUFJO0FBQzNFLHdCQUFrQixxQkFBcUIsY0FBYyxxQkFBcUIsQ0FBQyxDQUFDO0FBRTVFLFlBQU0saUJBQWlCO0FBQ3ZCLFlBQU0sYUFBYSxJQUFJLGNBQWM7QUFDckMsOEJBQXdCLGFBQWEsY0FBYyxJQUFJLEtBQUssVUFBVSxDQUFDLENBQUM7QUFFeEUsWUFBTSxzQkFBc0IsSUFBSSxNQUFNLGtEQUFrRDtBQUN4RixZQUFNLFlBQVksRUFBRSxZQUFZLEVBQUUsT0FBTyxvQkFBb0IsRUFBRTtBQUUvRCxZQUFNLFVBQVUsYUFBYTtBQUFBLFFBQzVCO0FBQUEsVUFDQyxNQUFNLG9CQUFvQjtBQUFBLFVBQzFCLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxZQUFNLGFBQWEsUUFBUSx3QkFBd0IsWUFBWSxPQUFPLHFCQUFxQixXQUFXLFFBQVcsTUFBUztBQUUxSCxZQUFNLFNBQVMsTUFBTSxRQUFRLGdCQUFnQixrQkFBa0IsSUFBSTtBQUNuRSxhQUFPLEdBQUcsUUFBUSx1QkFBdUI7QUFFekMsWUFBTSxRQUFRLE9BQU8sS0FBSyxPQUFLLEVBQUUsU0FBUyxVQUFVO0FBQ3BELGFBQU8sR0FBRyxPQUFPLGlEQUFpRDtBQUNsRSxhQUFPLFlBQVksTUFBTSxhQUFhLHdCQUF3QjtBQUU5RCxpQkFBVyxRQUFRO0FBQUEsSUFDcEIsQ0FBQztBQUVELFNBQUssNERBQTRELFlBQVk7QUFDNUUsd0JBQWtCLHFCQUFxQixjQUFjLGtCQUFrQixJQUFJO0FBQzNFLHdCQUFrQixxQkFBcUIsY0FBYyxxQkFBcUIsQ0FBQyxDQUFDO0FBRTVFLFlBQU0saUJBQWlCO0FBQ3ZCLFlBQU0sYUFBYSxJQUFJLGNBQWM7QUFDckMsOEJBQXdCLGFBQWEsY0FBYyxJQUFJLEtBQUssVUFBVSxDQUFDLENBQUM7QUFFeEUsWUFBTSxzQkFBc0IsSUFBSSxNQUFNLHVEQUF1RDtBQUM3RixZQUFNLFlBQVksRUFBRSxZQUFZLEVBQUUsT0FBTyxvQkFBb0IsRUFBRTtBQUUvRCxZQUFNLFVBQVUsYUFBYTtBQUFBLFFBQzVCO0FBQUEsVUFDQyxNQUFNLG9CQUFvQjtBQUFBLFVBQzFCLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxZQUFNLGFBQWEsUUFBUSx3QkFBd0IsWUFBWSxPQUFPLHFCQUFxQixXQUFXLFFBQVcsTUFBUztBQUUxSCxZQUFNLFNBQVMsTUFBTSxRQUFRLGdCQUFnQixrQkFBa0IsSUFBSTtBQUNuRSxhQUFPLEdBQUcsUUFBUSx1QkFBdUI7QUFFekMsWUFBTSxRQUFRLE9BQU8sS0FBSyxPQUFLLEVBQUUsU0FBUyxlQUFlO0FBQ3pELGFBQU8sR0FBRyxPQUFPLDRDQUE0QztBQUM3RCxhQUFPLFlBQVksTUFBTSxhQUFhLE1BQVM7QUFFL0MsaUJBQVcsUUFBUTtBQUFBLElBQ3BCLENBQUM7QUFFRCxTQUFLLHVFQUF1RSxZQUFZO0FBQ3ZGLHdCQUFrQixxQkFBcUIsY0FBYyxrQkFBa0IsSUFBSTtBQUMzRSx3QkFBa0IscUJBQXFCLGNBQWMscUJBQXFCLENBQUMsQ0FBQztBQUU1RSxZQUFNLGlCQUFpQjtBQUN2QixZQUFNLGFBQWEsSUFBSSxjQUFjO0FBQ3JDLDhCQUF3QixhQUFhLGNBQWMsSUFBSSxLQUFLLFVBQVUsQ0FBQyxDQUFDO0FBRXhFLFlBQU0sc0JBQXNCLElBQUksTUFBTSx1REFBdUQ7QUFDN0YsWUFBTSxZQUFZLEVBQUUsWUFBWSxFQUFFLE9BQU8sb0JBQW9CLEVBQUU7QUFFL0QsWUFBTSxVQUFVLGFBQWE7QUFBQSxRQUM1QjtBQUFBLFVBQ0MsTUFBTSxvQkFBb0I7QUFBQSxVQUMxQixVQUFVO0FBQUEsWUFDVDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUVELFlBQU0sYUFBYSxRQUFRLHdCQUF3QixZQUFZLE9BQU8scUJBQXFCLFdBQVcsUUFBVyxNQUFTO0FBRTFILFlBQU0sU0FBUyxNQUFNLFFBQVEsZ0JBQWdCLGtCQUFrQixJQUFJO0FBQ25FLGFBQU8sR0FBRyxRQUFRLHVCQUF1QjtBQUV6QyxZQUFNLFFBQVEsT0FBTyxLQUFLLE9BQUssRUFBRSxTQUFTLGVBQWU7QUFDekQsYUFBTyxHQUFHLE9BQU8sZ0VBQWdFO0FBQ2pGLGFBQU8sWUFBWSxNQUFNLGFBQWEsOEJBQThCO0FBRXBFLGlCQUFXLFFBQVE7QUFBQSxJQUNwQixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSxtQ0FBbUMsTUFBTTtBQUM5QyxhQUFTLE1BQU07QUFDZCxZQUFNLFFBQVE7QUFBQSxJQUNmLENBQUM7QUFFRCxTQUFLLDBEQUEwRCxZQUFZO0FBQzFFLHdCQUFrQixxQkFBcUIsY0FBYyxrQkFBa0IsSUFBSTtBQUMzRSx3QkFBa0IscUJBQXFCLGNBQWMscUJBQXFCLENBQUMsQ0FBQztBQUU1RSxZQUFNLGlCQUFpQjtBQUN2QixZQUFNLGFBQWEsSUFBSSxjQUFjO0FBQ3JDLFlBQU0sZ0JBQWdCLElBQUksS0FBSyxVQUFVO0FBRXpDLDhCQUF3QixhQUFhLGNBQWMsYUFBYSxDQUFDO0FBR2pFLFlBQU0sVUFBVSxhQUFhO0FBQUEsUUFDNUI7QUFBQSxVQUNDLE1BQU0sR0FBRyxVQUFVO0FBQUEsVUFDbkIsVUFBVTtBQUFBLFlBQ1Q7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxNQUFNLEdBQUcsVUFBVTtBQUFBLFVBQ25CLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsWUFBTSxnQkFBZ0IsTUFBTSxRQUFRLHVCQUF1QixrQkFBa0IsSUFBSTtBQUVqRixZQUFNLHdCQUF3QixjQUFjLEtBQUssU0FBTyxJQUFJLFNBQVMsaUJBQWlCO0FBQ3RGLGFBQU8sR0FBRyx1QkFBdUIsOENBQThDO0FBQy9FLGFBQU8sWUFBWSxzQkFBc0IsYUFBYSx1REFBdUQ7QUFDN0csYUFBTyxZQUFZLHNCQUFzQixTQUFTLGVBQWUsS0FBSztBQUN0RSxhQUFPLFlBQVksc0JBQXNCLE1BQU0sWUFBWSxLQUFLO0FBRWhFLFlBQU0sc0JBQXNCLGNBQWMsS0FBSyxTQUFPLElBQUksU0FBUyxlQUFlO0FBQ2xGLGFBQU8sR0FBRyxxQkFBcUIsNENBQTRDO0FBQzNFLGFBQU8sWUFBWSxvQkFBb0IsYUFBYSw4QkFBOEI7QUFDbEYsYUFBTyxZQUFZLG9CQUFvQixTQUFTLGVBQWUsS0FBSztBQUFBLElBQ3JFLENBQUM7QUFFRCxTQUFLLHlFQUF5RSxZQUFZO0FBQ3pGLHdCQUFrQixxQkFBcUIsY0FBYyxrQkFBa0IsSUFBSTtBQUMzRSx3QkFBa0IscUJBQXFCLGNBQWMscUJBQXFCLENBQUMsQ0FBQztBQUU1RSxZQUFNLGlCQUFpQjtBQUN2QixZQUFNLGFBQWEsSUFBSSxjQUFjO0FBQ3JDLFlBQU0sZ0JBQWdCLElBQUksS0FBSyxVQUFVO0FBRXpDLDhCQUF3QixhQUFhLGNBQWMsYUFBYSxDQUFDO0FBS2pFLFlBQU0sVUFBVSxhQUFhO0FBQUEsUUFDNUI7QUFBQSxVQUNDLE1BQU07QUFBQSxVQUNOLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsTUFBTTtBQUFBLFVBQ04sVUFBVTtBQUFBLFlBQ1Q7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxZQUFNLGdCQUFnQixNQUFNLFFBQVEsdUJBQXVCLGtCQUFrQixJQUFJO0FBRWpGLFlBQU0saUJBQWlCLGNBQWMsT0FBTyxTQUFPLElBQUksU0FBUyxRQUFRO0FBQ3hFLGFBQU8sWUFBWSxlQUFlLFFBQVEsR0FBRyw2REFBNkQ7QUFBQSxJQUMzRyxDQUFDO0FBRUQsU0FBSyw2REFBNkQsWUFBWTtBQUM3RSx3QkFBa0IscUJBQXFCLGNBQWMsa0JBQWtCLElBQUk7QUFDM0Usd0JBQWtCLHFCQUFxQixjQUFjLHFCQUFxQixDQUFDLENBQUM7QUFFNUUsWUFBTSxpQkFBaUI7QUFDdkIsWUFBTSxhQUFhLElBQUksY0FBYztBQUNyQyxZQUFNLGdCQUFnQixJQUFJLEtBQUssVUFBVTtBQUV6Qyw4QkFBd0IsYUFBYSxjQUFjLGFBQWEsQ0FBQztBQUdqRSxZQUFNLFVBQVUsYUFBYTtBQUFBLFFBQzVCO0FBQUEsVUFDQyxNQUFNO0FBQUEsVUFDTixVQUFVO0FBQUEsWUFDVDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxVQUNDLE1BQU07QUFBQSxVQUNOLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsWUFBTSxnQkFBZ0IsTUFBTSxRQUFRLHVCQUF1QixrQkFBa0IsSUFBSTtBQUVqRixZQUFNLHVCQUF1QixjQUFjLEtBQUssU0FBTyxJQUFJLFNBQVMsZ0JBQWdCO0FBQ3BGLGFBQU8sR0FBRyxzQkFBc0IsNkNBQTZDO0FBQzdFLGFBQU8sWUFBWSxxQkFBcUIsYUFBYSxvQ0FBb0M7QUFDekYsYUFBTyxZQUFZLHFCQUFxQixTQUFTLGVBQWUsSUFBSTtBQUNwRSxhQUFPLFlBQVkscUJBQXFCLE1BQU0sWUFBWSxLQUFLO0FBRS9ELFlBQU0sd0JBQXdCLGNBQWMsS0FBSyxTQUFPLElBQUksU0FBUyxpQkFBaUI7QUFDdEYsYUFBTyxHQUFHLHVCQUF1QixvREFBb0Q7QUFDckYsYUFBTyxZQUFZLHNCQUFzQixhQUFhLHlCQUF5QjtBQUMvRSxhQUFPLFlBQVksc0JBQXNCLFNBQVMsZUFBZSxJQUFJO0FBQUEsSUFDdEUsQ0FBQztBQUVELFNBQUssb0VBQW9FLFlBQVk7QUFDcEYsd0JBQWtCLHFCQUFxQixjQUFjLGtCQUFrQixJQUFJO0FBQzNFLHdCQUFrQixxQkFBcUIsY0FBYyxxQkFBcUIsQ0FBQyxDQUFDO0FBRTVFLFlBQU0saUJBQWlCO0FBQ3ZCLFlBQU0sYUFBYSxJQUFJLGNBQWM7QUFDckMsWUFBTSxnQkFBZ0IsSUFBSSxLQUFLLFVBQVU7QUFFekMsOEJBQXdCLGFBQWEsY0FBYyxhQUFhLENBQUM7QUFFakUsWUFBTSxtQkFBbUIsSUFBSSxNQUFNLHdEQUF3RDtBQUMzRixZQUFNLFlBQVk7QUFBQSxRQUNqQixZQUFZLEVBQUUsT0FBTyxvQkFBb0I7QUFBQSxRQUN6QyxxQkFBcUIsQ0FBQyx3QkFBd0I7QUFBQSxNQUMvQztBQUdBLFlBQU0sVUFBVSxhQUFhO0FBQUEsUUFDNUI7QUFBQSxVQUNDLE1BQU0saUJBQWlCO0FBQUEsVUFDdkIsVUFBVTtBQUFBLFlBQ1Q7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxZQUFNLFdBQVc7QUFBQSxRQUNoQixvQkFBb0IsT0FBTyxVQUE4QixXQUE4QjtBQUN0RixpQkFBTyxDQUFDLEVBQUUsS0FBSyxpQkFBaUIsQ0FBQztBQUFBLFFBQ2xDO0FBQUEsTUFDRDtBQUVBLFlBQU0sYUFBYSxRQUFRLDJCQUEyQixXQUFXLFlBQVksT0FBTyxRQUFRO0FBRTVGLFlBQU0sZ0JBQWdCLE1BQU0sUUFBUSx1QkFBdUIsa0JBQWtCLElBQUk7QUFFakYsWUFBTSx1QkFBdUIsY0FBYyxLQUFLLFNBQU8sSUFBSSxTQUFTLGdCQUFnQjtBQUNwRixhQUFPLEdBQUcsc0JBQXNCLDZDQUE2QztBQUM3RSxhQUFPLFlBQVkscUJBQXFCLGFBQWEsaUNBQWlDO0FBQ3RGLGFBQU8sWUFBWSxxQkFBcUIsU0FBUyxlQUFlLFNBQVM7QUFDekUsYUFBTyxZQUFZLHFCQUFxQixNQUFNLFlBQVksS0FBSztBQUMvRCxhQUFPLFlBQVkscUJBQXFCLFFBQVEsaUJBQWlCLFlBQVk7QUFFN0UsaUJBQVcsUUFBUTtBQUduQixZQUFNLDRCQUE0QixNQUFNLFFBQVEsdUJBQXVCLGtCQUFrQixJQUFJO0FBQzdGLFlBQU0sb0JBQW9CLDBCQUEwQixLQUFLLFNBQU8sSUFBSSxTQUFTLGdCQUFnQjtBQUM3RixhQUFPLFlBQVksbUJBQW1CLFFBQVcsK0NBQStDO0FBQUEsSUFDakcsQ0FBQztBQUVELFNBQUssd0VBQXdFLFlBQVk7QUFDeEYsd0JBQWtCLHFCQUFxQixjQUFjLGtCQUFrQixJQUFJO0FBQzNFLHdCQUFrQixxQkFBcUIsY0FBYyxxQkFBcUIsQ0FBQyxDQUFDO0FBRTVFLFlBQU0saUJBQWlCO0FBQ3ZCLFlBQU0sYUFBYSxJQUFJLGNBQWM7QUFDckMsWUFBTSxnQkFBZ0IsSUFBSSxLQUFLLFVBQVU7QUFFekMsOEJBQXdCLGFBQWEsY0FBYyxhQUFhLENBQUM7QUFFakUsWUFBTSxzQkFBc0IsSUFBSSxNQUFNLDJEQUEyRDtBQUNqRyxZQUFNLFlBQVk7QUFBQSxRQUNqQixZQUFZLEVBQUUsT0FBTyxvQkFBb0I7QUFBQSxNQUMxQztBQUdBLFlBQU0sVUFBVSxhQUFhO0FBQUEsUUFDNUI7QUFBQSxVQUNDLE1BQU0sb0JBQW9CO0FBQUEsVUFDMUIsVUFBVTtBQUFBLFlBQ1Q7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxZQUFNLGFBQWEsUUFBUTtBQUFBLFFBQzFCLFlBQVk7QUFBQSxRQUNaO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUVBLFlBQU0sZ0JBQWdCLE1BQU0sUUFBUSx1QkFBdUIsa0JBQWtCLElBQUk7QUFFakYsWUFBTSwwQkFBMEIsY0FBYyxLQUFLLFNBQU8sSUFBSSxTQUFTLG1CQUFtQjtBQUMxRixhQUFPLEdBQUcseUJBQXlCLGdEQUFnRDtBQUNuRixhQUFPLFlBQVksd0JBQXdCLGFBQWEscUNBQXFDO0FBQzdGLGFBQU8sWUFBWSx3QkFBd0IsU0FBUyxlQUFlLFNBQVM7QUFDNUUsYUFBTyxZQUFZLHdCQUF3QixNQUFNLFlBQVksS0FBSztBQUNsRSxhQUFPLFlBQVksd0JBQXdCLFFBQVEsaUJBQWlCLHFCQUFxQjtBQUV6RixpQkFBVyxRQUFRO0FBR25CLFlBQU0sNEJBQTRCLE1BQU0sUUFBUSx1QkFBdUIsa0JBQWtCLElBQUk7QUFDN0YsWUFBTSxvQkFBb0IsMEJBQTBCLEtBQUssU0FBTyxJQUFJLFNBQVMsbUJBQW1CO0FBQ2hHLGFBQU8sWUFBWSxtQkFBbUIsUUFBVyxrREFBa0Q7QUFBQSxJQUNwRyxDQUFDO0FBRUQsU0FBSyw0REFBNEQsWUFBWTtBQUM1RSx3QkFBa0IscUJBQXFCLGNBQWMsa0JBQWtCLElBQUk7QUFDM0Usd0JBQWtCLHFCQUFxQixjQUFjLHFCQUFxQixDQUFDLENBQUM7QUFFNUUsWUFBTSxpQkFBaUI7QUFDdkIsWUFBTSxhQUFhLElBQUksY0FBYztBQUNyQyxZQUFNLGdCQUFnQixJQUFJLEtBQUssVUFBVTtBQUV6Qyw4QkFBd0IsYUFBYSxjQUFjLGFBQWEsQ0FBQztBQUdqRSxZQUFNLFVBQVUsYUFBYTtBQUFBLFFBQzVCO0FBQUEsVUFDQyxNQUFNLEdBQUcsVUFBVTtBQUFBLFVBQ25CLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsTUFBTSxHQUFHLFVBQVU7QUFBQSxVQUNuQixVQUFVO0FBQUEsWUFDVDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUVELFlBQU0sZ0JBQWdCLE1BQU0sUUFBUSx1QkFBdUIsa0JBQWtCLElBQUk7QUFFakYsWUFBTSxnQkFBZ0IsY0FBYyxLQUFLLFNBQU8sSUFBSSxTQUFTLFdBQVc7QUFDeEUsYUFBTyxHQUFHLGVBQWUsMENBQTBDO0FBQ25FLGFBQU8sWUFBWSxjQUFjLE1BQU0sWUFBWSxNQUFNO0FBRXpELFlBQU0sZUFBZSxjQUFjLEtBQUssU0FBTyxJQUFJLFNBQVMsVUFBVTtBQUN0RSxhQUFPLEdBQUcsY0FBYyx5Q0FBeUM7QUFDakUsYUFBTyxZQUFZLGFBQWEsTUFBTSxZQUFZLEtBQUs7QUFBQSxJQUN4RCxDQUFDO0FBRUQsU0FBSyxnRUFBZ0UsWUFBWTtBQUNoRix3QkFBa0IscUJBQXFCLGNBQWMsa0JBQWtCLElBQUk7QUFDM0Usd0JBQWtCLHFCQUFxQixjQUFjLHFCQUFxQixDQUFDLENBQUM7QUFFNUUsWUFBTSxpQkFBaUI7QUFDdkIsWUFBTSxhQUFhLElBQUksY0FBYztBQUNyQyxZQUFNLGdCQUFnQixJQUFJLEtBQUssVUFBVTtBQUV6Qyw4QkFBd0IsYUFBYSxjQUFjLGFBQWEsQ0FBQztBQUVqRSxZQUFNLG1CQUFtQixJQUFJLE1BQU0sb0RBQW9EO0FBQ3ZGLFlBQU0sWUFBWTtBQUFBLFFBQ2pCLFlBQVksRUFBRSxPQUFPLG9CQUFvQjtBQUFBLFFBQ3pDLHFCQUFxQixDQUFDLHdCQUF3QjtBQUFBLE1BQy9DO0FBRUEsWUFBTSxVQUFVLGFBQWE7QUFBQSxRQUM1QjtBQUFBLFVBQ0MsTUFBTSxpQkFBaUI7QUFBQSxVQUN2QixVQUFVO0FBQUEsWUFDVDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUVELFVBQUksbUJBQW1CO0FBQ3ZCLFlBQU0sYUFBYSxRQUFRLHlCQUF5QixNQUFNO0FBQ3pEO0FBQUEsTUFDRCxDQUFDO0FBRUQsWUFBTSxXQUFXO0FBQUEsUUFDaEIsb0JBQW9CLE9BQU8sVUFBOEIsV0FBOEI7QUFDdEYsaUJBQU8sQ0FBQyxFQUFFLEtBQUssaUJBQWlCLENBQUM7QUFBQSxRQUNsQztBQUFBLE1BQ0Q7QUFHQSxZQUFNLGFBQWEsUUFBUSwyQkFBMkIsV0FBVyxZQUFZLE9BQU8sUUFBUTtBQUM1RixZQUFNLElBQUksUUFBUSxhQUFXLFdBQVcsU0FBUyxHQUFHLENBQUM7QUFFckQsWUFBTSx1QkFBdUIsTUFBTSxRQUFRLHVCQUF1QixrQkFBa0IsSUFBSTtBQUN4RixZQUFNLGVBQWUscUJBQXFCLEtBQUssU0FBTyxJQUFJLFNBQVMsWUFBWTtBQUMvRSxhQUFPLEdBQUcsY0FBYyxpQ0FBaUM7QUFHekQsaUJBQVcsUUFBUTtBQUNuQixZQUFNLElBQUksUUFBUSxhQUFXLFdBQVcsU0FBUyxHQUFHLENBQUM7QUFFckQsWUFBTSx1QkFBdUIsTUFBTSxRQUFRLHVCQUF1QixrQkFBa0IsSUFBSTtBQUN4RixZQUFNLG9CQUFvQixxQkFBcUIsS0FBSyxTQUFPLElBQUksU0FBUyxZQUFZO0FBQ3BGLGFBQU8sWUFBWSxtQkFBbUIsUUFBVywrQ0FBK0M7QUFFaEcsYUFBTyxHQUFHLG9CQUFvQixHQUFHLGtFQUFrRTtBQUVuRyxpQkFBVyxRQUFRO0FBQUEsSUFDcEIsQ0FBQztBQUdELFNBQUssZ0VBQWdFLFlBQVk7QUFDaEYsd0JBQWtCLHFCQUFxQixjQUFjLGtCQUFrQixJQUFJO0FBQzNFLHdCQUFrQixxQkFBcUIsY0FBYyxxQkFBcUIsQ0FBQyxDQUFDO0FBRTVFLFlBQU0saUJBQWlCO0FBQ3ZCLFlBQU0sYUFBYSxJQUFJLGNBQWM7QUFDckMsWUFBTSxnQkFBZ0IsSUFBSSxLQUFLLFVBQVU7QUFFekMsOEJBQXdCLGFBQWEsY0FBYyxhQUFhLENBQUM7QUFHakUsWUFBTSxVQUFVLGFBQWE7QUFBQSxRQUM1QjtBQUFBLFVBQ0MsTUFBTSxHQUFHLFVBQVU7QUFBQSxVQUNuQixVQUFVO0FBQUEsWUFDVDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsTUFBTSxHQUFHLFVBQVU7QUFBQSxVQUNuQixVQUFVO0FBQUEsWUFDVDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUVELFlBQU0sZ0JBQWdCLE1BQU0sUUFBUSx1QkFBdUIsa0JBQWtCLElBQUk7QUFHakYsWUFBTSxzQkFBc0IsY0FBYyxLQUFLLFNBQU8sSUFBSSxTQUFTLFNBQVM7QUFDNUUsYUFBTyxHQUFHLHFCQUFxQix1REFBdUQ7QUFDdEYsYUFBTyxZQUFZLG9CQUFvQixhQUFhLG9CQUFvQjtBQUd4RSxZQUFNLG9CQUFvQixjQUFjLEtBQUssU0FBTyxJQUFJLFNBQVMsYUFBYTtBQUM5RSxhQUFPLEdBQUcsbUJBQW1CLHlCQUF5QjtBQUFBLElBQ3ZELENBQUM7QUFFRCxTQUFLLDhFQUE4RSxZQUFZO0FBQzlGLHdCQUFrQixxQkFBcUIsY0FBYyxrQkFBa0IsSUFBSTtBQUMzRSx3QkFBa0IscUJBQXFCLGNBQWMscUJBQXFCLENBQUMsQ0FBQztBQUU1RSxZQUFNLGlCQUFpQjtBQUN2QixZQUFNLGFBQWEsSUFBSSxjQUFjO0FBQ3JDLFlBQU0sZ0JBQWdCLElBQUksS0FBSyxVQUFVO0FBRXpDLDhCQUF3QixhQUFhLGNBQWMsYUFBYSxDQUFDO0FBRWpFLFlBQU0sVUFBVSxhQUFhO0FBQUEsUUFDNUI7QUFBQSxVQUNDLE1BQU0sR0FBRyxVQUFVO0FBQUEsVUFDbkIsVUFBVTtBQUFBLFlBQ1Q7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxZQUFNLGdCQUFnQixNQUFNLFFBQVEsdUJBQXVCLGtCQUFrQixJQUFJO0FBRWpGLFlBQU0sb0JBQW9CLGNBQWMsS0FBSyxTQUFPLElBQUksU0FBUyxNQUFNO0FBQ3ZFLGFBQU8sR0FBRyxtQkFBbUIsMkRBQTJEO0FBQ3hGLGFBQU8sWUFBWSxrQkFBa0IsYUFBYSwwQ0FBMEM7QUFFNUYsWUFBTSx5QkFBeUIsY0FBYyxLQUFLLFNBQU8sSUFBSSxTQUFTLEtBQUs7QUFDM0UsYUFBTyxZQUFZLHdCQUF3QixRQUFXLDhDQUE4QztBQUFBLElBQ3JHLENBQUM7QUFFRCxTQUFLLDJFQUEyRSxZQUFZO0FBQzNGLHdCQUFrQixxQkFBcUIsY0FBYyxrQkFBa0IsSUFBSTtBQUMzRSx3QkFBa0IscUJBQXFCLGNBQWMscUJBQXFCLENBQUMsQ0FBQztBQUU1RSxZQUFNLGlCQUFpQjtBQUN2QixZQUFNLGFBQWEsSUFBSSxjQUFjO0FBQ3JDLFlBQU0sZ0JBQWdCLElBQUksS0FBSyxVQUFVO0FBRXpDLDhCQUF3QixhQUFhLGNBQWMsYUFBYSxDQUFDO0FBR2pFLFlBQU0sVUFBVSxhQUFhO0FBQUEsUUFDNUI7QUFBQSxVQUNDLE1BQU0sR0FBRyxVQUFVO0FBQUEsVUFDbkIsVUFBVTtBQUFBLFlBQ1Q7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxNQUFNLEdBQUcsVUFBVTtBQUFBLFVBQ25CLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsWUFBTSxnQkFBZ0IsTUFBTSxRQUFRLHVCQUF1QixrQkFBa0IsSUFBSTtBQUVqRixZQUFNLG9CQUFvQixjQUFjLE9BQU8sU0FBTyxJQUFJLFNBQVMsZ0JBQWdCO0FBR25GLGFBQU8sWUFBWSxrQkFBa0IsUUFBUSxHQUFHLG9EQUFvRDtBQUVwRyxZQUFNLGdCQUFnQixrQkFBa0IsS0FBSyxTQUFPLElBQUksU0FBUyxZQUFZLE1BQU07QUFDbkYsYUFBTyxHQUFHLGVBQWUsNEJBQTRCO0FBRXJELFlBQU0sZUFBZSxrQkFBa0IsS0FBSyxTQUFPLElBQUksU0FBUyxZQUFZLEtBQUs7QUFDakYsYUFBTyxHQUFHLGNBQWMsMkJBQTJCO0FBQUEsSUFDcEQsQ0FBQztBQUVELFNBQUssaUVBQWlFLFlBQVk7QUFDakYsd0JBQWtCLHFCQUFxQixjQUFjLGtCQUFrQixLQUFLO0FBQzVFLHdCQUFrQixxQkFBcUIsY0FBYyxxQkFBcUIsQ0FBQyxDQUFDO0FBRTVFLFlBQU0saUJBQWlCO0FBQ3ZCLFlBQU0sYUFBYSxJQUFJLGNBQWM7QUFDckMsWUFBTSxnQkFBZ0IsSUFBSSxLQUFLLFVBQVU7QUFFekMsOEJBQXdCLGFBQWEsY0FBYyxhQUFhLENBQUM7QUFHakUsWUFBTSxVQUFVLGFBQWE7QUFBQSxRQUM1QjtBQUFBLFVBQ0MsTUFBTSxHQUFHLFVBQVU7QUFBQSxVQUNuQixVQUFVO0FBQUEsWUFDVDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxVQUNDLE1BQU0sR0FBRyxVQUFVO0FBQUEsVUFDbkIsVUFBVTtBQUFBLFlBQ1Q7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxZQUFNLGdCQUFnQixNQUFNLFFBQVEsdUJBQXVCLGtCQUFrQixJQUFJO0FBRWpGLFlBQU0sZ0JBQWdCLGNBQWMsS0FBSyxTQUFPLElBQUksU0FBUyxXQUFXO0FBQ3hFLGFBQU8sR0FBRyxlQUFlLDBEQUEwRDtBQUVuRixZQUFNLGVBQWUsY0FBYyxLQUFLLFNBQU8sSUFBSSxTQUFTLFVBQVU7QUFDdEUsYUFBTyxZQUFZLGNBQWMsUUFBVyx3REFBd0Q7QUFBQSxJQUNyRyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSxvREFBb0QsTUFBTTtBQUMvRCxhQUFTLE1BQU07QUFDZCxZQUFNLFFBQVE7QUFBQSxJQUNmLENBQUM7QUFFRCxTQUFLLG1GQUFtRixZQUFZO0FBQ25HLHdCQUFrQixxQkFBcUIsY0FBYyxrQkFBa0IsSUFBSTtBQUMzRSx3QkFBa0IscUJBQXFCLGNBQWMscUJBQXFCLENBQUMsQ0FBQztBQUU1RSxZQUFNLGlCQUFpQjtBQUN2QixZQUFNLGFBQWEsSUFBSSxjQUFjO0FBQ3JDLFlBQU0sZ0JBQWdCLElBQUksS0FBSyxVQUFVO0FBRXpDLDhCQUF3QixhQUFhLGNBQWMsYUFBYSxDQUFDO0FBR2pFLFlBQU0sVUFBVSxhQUFhO0FBQUEsUUFDNUI7QUFBQSxVQUNDLE1BQU0sR0FBRyxVQUFVO0FBQUEsVUFDbkIsVUFBVTtBQUFBLFlBQ1Q7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsWUFBTSxnQkFBZ0IsTUFBTSxRQUFRLHVCQUF1QixrQkFBa0IsSUFBSTtBQUVqRixZQUFNLHFCQUFxQixjQUFjLEtBQUssU0FBTyxJQUFJLFNBQVMsY0FBYztBQUNoRixhQUFPLEdBQUcsb0JBQW9CLDRDQUE0QztBQUMxRSxhQUFPO0FBQUEsUUFBWSxtQkFBbUI7QUFBQSxRQUFlO0FBQUEsUUFDcEQ7QUFBQSxNQUFrRDtBQUduRCxZQUFNLG1CQUFtQixjQUFjLE9BQU8sT0FBSyxFQUFFLGFBQWE7QUFDbEUsWUFBTSx3QkFBd0IsaUJBQWlCLEtBQUssU0FBTyxJQUFJLFNBQVMsY0FBYztBQUN0RixhQUFPO0FBQUEsUUFBWTtBQUFBLFFBQXVCO0FBQUEsUUFDekM7QUFBQSxNQUF3RTtBQUFBLElBQzFFLENBQUM7QUFFRCxTQUFLLGtGQUFrRixZQUFZO0FBQ2xHLHdCQUFrQixxQkFBcUIsY0FBYyxrQkFBa0IsSUFBSTtBQUMzRSx3QkFBa0IscUJBQXFCLGNBQWMscUJBQXFCLENBQUMsQ0FBQztBQUU1RSxZQUFNLGlCQUFpQjtBQUN2QixZQUFNLGFBQWEsSUFBSSxjQUFjO0FBQ3JDLFlBQU0sZ0JBQWdCLElBQUksS0FBSyxVQUFVO0FBRXpDLDhCQUF3QixhQUFhLGNBQWMsYUFBYSxDQUFDO0FBR2pFLFlBQU0sVUFBVSxhQUFhO0FBQUEsUUFDNUI7QUFBQSxVQUNDLE1BQU0sR0FBRyxVQUFVO0FBQUEsVUFDbkIsVUFBVTtBQUFBLFlBQ1Q7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsWUFBTSxnQkFBZ0IsTUFBTSxRQUFRLHVCQUF1QixrQkFBa0IsSUFBSTtBQUVqRixZQUFNLHNCQUFzQixjQUFjLEtBQUssU0FBTyxJQUFJLFNBQVMsZUFBZTtBQUNsRixhQUFPLEdBQUcscUJBQXFCLDZDQUE2QztBQUM1RSxhQUFPO0FBQUEsUUFBWSxvQkFBb0I7QUFBQSxRQUFlO0FBQUEsUUFDckQ7QUFBQSxNQUFpRDtBQUdsRCxZQUFNLG1CQUFtQixjQUFjLE9BQU8sT0FBSyxFQUFFLGFBQWE7QUFDbEUsWUFBTSx5QkFBeUIsaUJBQWlCLEtBQUssU0FBTyxJQUFJLFNBQVMsZUFBZTtBQUN4RixhQUFPO0FBQUEsUUFBRztBQUFBLFFBQ1Q7QUFBQSxNQUFxRTtBQUFBLElBQ3ZFLENBQUM7QUFFRCxTQUFLLHNFQUFzRSxZQUFZO0FBQ3RGLHdCQUFrQixxQkFBcUIsY0FBYyxrQkFBa0IsSUFBSTtBQUMzRSx3QkFBa0IscUJBQXFCLGNBQWMscUJBQXFCLENBQUMsQ0FBQztBQUU1RSxZQUFNLGlCQUFpQjtBQUN2QixZQUFNLGFBQWEsSUFBSSxjQUFjO0FBQ3JDLFlBQU0sZ0JBQWdCLElBQUksS0FBSyxVQUFVO0FBRXpDLDhCQUF3QixhQUFhLGNBQWMsYUFBYSxDQUFDO0FBR2pFLFlBQU0sVUFBVSxhQUFhO0FBQUEsUUFDNUI7QUFBQSxVQUNDLE1BQU0sR0FBRyxVQUFVO0FBQUEsVUFDbkIsVUFBVTtBQUFBLFlBQ1Q7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxZQUFNLGdCQUFnQixNQUFNLFFBQVEsdUJBQXVCLGtCQUFrQixJQUFJO0FBRWpGLFlBQU0sc0JBQXNCLGNBQWMsS0FBSyxTQUFPLElBQUksU0FBUyxlQUFlO0FBQ2xGLGFBQU8sR0FBRyxxQkFBcUIsNkNBQTZDO0FBQzVFLGFBQU8sWUFBWSxvQkFBb0IsZUFBZSxNQUFNLGdFQUFnRTtBQUc1SCxZQUFNLG1CQUFtQixjQUFjLE9BQU8sT0FBSyxFQUFFLGFBQWE7QUFDbEUsWUFBTSx5QkFBeUIsaUJBQWlCLEtBQUssU0FBTyxJQUFJLFNBQVMsZUFBZTtBQUN4RixhQUFPO0FBQUEsUUFBRztBQUFBLFFBQ1Q7QUFBQSxNQUE4RjtBQUFBLElBQ2hHLENBQUM7QUFFRCxTQUFLLG9EQUFvRCxZQUFZO0FBQ3BFLFlBQU0saUJBQWlCO0FBQ3ZCLFlBQU0sYUFBYSxJQUFJLGNBQWM7QUFDckMsWUFBTSxnQkFBZ0IsSUFBSSxLQUFLLFVBQVU7QUFFekMsOEJBQXdCLGFBQWEsY0FBYyxhQUFhLENBQUM7QUFHakUsWUFBTSxVQUFVLGFBQWE7QUFBQSxRQUM1QjtBQUFBLFVBQ0MsTUFBTSxHQUFHLFVBQVU7QUFBQSxVQUNuQixVQUFVO0FBQUEsWUFDVDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxZQUFNLGdCQUFnQixNQUFNLFFBQVEsdUJBQXVCLGtCQUFrQixJQUFJO0FBRWpGLFlBQU0sc0JBQXNCLGNBQWMsS0FBSyxTQUFPLElBQUksU0FBUyxlQUFlO0FBQ2xGLGFBQU8sR0FBRyxxQkFBcUIsNkNBQTZDO0FBQzVFLGFBQU87QUFBQSxRQUFZLG9CQUFvQjtBQUFBLFFBQWU7QUFBQSxRQUNyRDtBQUFBLE1BQWtEO0FBR25ELFlBQU0sbUJBQW1CLGNBQWMsT0FBTyxPQUFLLEVBQUUsYUFBYTtBQUNsRSxZQUFNLHlCQUF5QixpQkFBaUIsS0FBSyxTQUFPLElBQUksU0FBUyxlQUFlO0FBQ3hGLGFBQU87QUFBQSxRQUFZO0FBQUEsUUFBd0I7QUFBQSxRQUMxQztBQUFBLE1BQXlFO0FBQUEsSUFDM0UsQ0FBQztBQUVELFNBQUssdURBQXVELFlBQVk7QUFDdkUsd0JBQWtCLHFCQUFxQixjQUFjLGtCQUFrQixJQUFJO0FBQzNFLHdCQUFrQixxQkFBcUIsY0FBYyxxQkFBcUIsQ0FBQyxDQUFDO0FBRTVFLFlBQU0saUJBQWlCO0FBQ3ZCLFlBQU0sYUFBYSxJQUFJLGNBQWM7QUFDckMsWUFBTSxnQkFBZ0IsSUFBSSxLQUFLLFVBQVU7QUFFekMsOEJBQXdCLGFBQWEsY0FBYyxhQUFhLENBQUM7QUFHakUsWUFBTSxVQUFVLGFBQWE7QUFBQSxRQUM1QjtBQUFBLFVBQ0MsTUFBTSxHQUFHLFVBQVU7QUFBQSxVQUNuQixVQUFVO0FBQUEsWUFDVDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxVQUNDLE1BQU0sR0FBRyxVQUFVO0FBQUEsVUFDbkIsVUFBVTtBQUFBLFlBQ1Q7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsTUFBTSxHQUFHLFVBQVU7QUFBQSxVQUNuQixVQUFVO0FBQUEsWUFDVDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxNQUFNLEdBQUcsVUFBVTtBQUFBLFVBQ25CLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUVELFlBQU0sZ0JBQWdCLE1BQU0sUUFBUSx1QkFBdUIsa0JBQWtCLElBQUk7QUFHakYsYUFBTyxZQUFZLGNBQWMsUUFBUSxHQUFHLDRCQUE0QjtBQUd4RSxZQUFNLG1CQUFtQixjQUFjLE9BQU8sT0FBSyxFQUFFLGFBQWE7QUFFbEUsYUFBTyxZQUFZLGlCQUFpQixRQUFRLEdBQUcsd0NBQXdDO0FBQ3ZGLGFBQU8sR0FBRyxpQkFBaUIsS0FBSyxPQUFLLEVBQUUsU0FBUyxnQkFBZ0IsR0FBRyxtQ0FBbUM7QUFDdEcsYUFBTyxHQUFHLGlCQUFpQixLQUFLLE9BQUssRUFBRSxTQUFTLGVBQWUsR0FBRyxrQ0FBa0M7QUFDcEcsYUFBTyxZQUFZLGlCQUFpQixLQUFLLE9BQUssRUFBRSxTQUFTLGVBQWUsR0FBRyxRQUFXLGtDQUFrQztBQUN4SCxhQUFPLFlBQVksaUJBQWlCLEtBQUssT0FBSyxFQUFFLFNBQVMsY0FBYyxHQUFHLFFBQVcsaUNBQWlDO0FBQUEsSUFDdkgsQ0FBQztBQUVELFNBQUssdURBQXVELFlBQVk7QUFDdkUsd0JBQWtCLHFCQUFxQixjQUFjLGtCQUFrQixJQUFJO0FBQzNFLHdCQUFrQixxQkFBcUIsY0FBYyxxQkFBcUIsQ0FBQyxDQUFDO0FBRTVFLFlBQU0saUJBQWlCO0FBQ3ZCLFlBQU0sYUFBYSxJQUFJLGNBQWM7QUFDckMsWUFBTSxnQkFBZ0IsSUFBSSxLQUFLLFVBQVU7QUFFekMsOEJBQXdCLGFBQWEsY0FBYyxhQUFhLENBQUM7QUFHakUsWUFBTSxVQUFVLGFBQWE7QUFBQSxRQUM1QjtBQUFBLFVBQ0MsTUFBTSxHQUFHLFVBQVU7QUFBQSxVQUNuQixVQUFVO0FBQUEsWUFDVDtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUVELFlBQU0sZ0JBQWdCLE1BQU0sUUFBUSx1QkFBdUIsa0JBQWtCLElBQUk7QUFHakYsWUFBTSxnQkFBZ0IsY0FBYyxLQUFLLFNBQ3hDLElBQUksSUFBSSxLQUFLLFNBQVMsaUJBQWlCLENBQUM7QUFDekMsYUFBTyxHQUFHLGVBQWUsb0RBQW9EO0FBSzdFLFlBQU0sbUJBQW1CLGNBQWMsT0FBTyxPQUFLLEVBQUUsYUFBYTtBQUNsRSxZQUFNLDBCQUEwQixpQkFBaUIsS0FBSyxTQUNyRCxJQUFJLElBQUksS0FBSyxTQUFTLGlCQUFpQixDQUFDO0FBQ3pDLGFBQU87QUFBQSxRQUFHO0FBQUEsUUFDVDtBQUFBLE1BQStGO0FBQUEsSUFDakcsQ0FBQztBQUVELFNBQUssa0VBQWtFLFlBQVk7QUFDbEYsd0JBQWtCLHFCQUFxQixjQUFjLGtCQUFrQixJQUFJO0FBQzNFLHdCQUFrQixxQkFBcUIsY0FBYyxxQkFBcUIsQ0FBQyxDQUFDO0FBRTVFLFlBQU0sV0FBVyxJQUFJLEtBQUssMkNBQTJDO0FBQ3JFLFlBQU0sVUFBVSxhQUFhO0FBQUEsUUFDNUI7QUFBQSxVQUNDLE1BQU0sU0FBUztBQUFBLFVBQ2YsVUFBVTtBQUFBLFlBQ1Q7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUVELFlBQU0sYUFBYTtBQUFBLFFBQWdCO0FBQUEsUUFBd0I7QUFBQTtBQUFBLE1BQWtEO0FBQzdHLFlBQU0sU0FBdUI7QUFBQSxRQUM1QixLQUFLLElBQUksS0FBSyxvQkFBb0I7QUFBQSxRQUNsQyxRQUFRLGFBQWE7QUFBQSxRQUNyQixPQUFPO0FBQUEsUUFDUDtBQUFBLFFBQ0EsUUFBUSxNQUFNO0FBQUEsUUFBRTtBQUFBLFFBQ2hCLE9BQU8sZ0JBQWdCLG1CQUFtQixDQUFDLENBQUM7QUFBQSxRQUM1QyxVQUFVLGdCQUFnQixzQkFBc0IsQ0FBQyxDQUFDO0FBQUEsUUFDbEQsUUFBUSxnQkFBOEMsb0JBQW9CLENBQUMsRUFBRSxLQUFLLFVBQVUsTUFBTSxTQUFTLENBQUMsQ0FBQztBQUFBLFFBQzdHLFFBQVEsZ0JBQWdCLG9CQUFvQixDQUFDLENBQUM7QUFBQSxRQUM5QyxjQUFjLGdCQUFnQiwwQkFBMEIsQ0FBQyxDQUFDO0FBQUEsUUFDMUQsc0JBQXNCLGdCQUFnQixrQ0FBa0MsQ0FBQyxDQUFDO0FBQUEsTUFDM0U7QUFFQSw0QkFBc0IsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFTO0FBRTdDLFlBQU0sZ0JBQWdCLE1BQU0sUUFBUSx1QkFBdUIsa0JBQWtCLElBQUk7QUFHakYsWUFBTSxlQUFlLGNBQWMsS0FBSyxTQUFPLElBQUksU0FBUyxrQkFBa0I7QUFDOUUsYUFBTyxHQUFHLGNBQWMsOERBQThEO0FBQ3RGLGFBQU8sWUFBWSxhQUFhLFNBQVMsZUFBZSxNQUFNO0FBQzlELGFBQU8sWUFBWSxhQUFhLE1BQU0sWUFBWSxLQUFLO0FBRXZELDRCQUFzQixJQUFJLENBQUMsR0FBRyxNQUFTO0FBQUEsSUFDeEMsQ0FBQztBQUVELFNBQUssaUVBQWlFLFlBQVk7QUFDakYsd0JBQWtCLHFCQUFxQixjQUFjLGtCQUFrQixJQUFJO0FBQzNFLHdCQUFrQixxQkFBcUIsY0FBYyxxQkFBcUIsQ0FBQyxDQUFDO0FBRTVFLFlBQU0sV0FBVyxJQUFJLEtBQUssc0NBQXNDO0FBQ2hFLFlBQU0sVUFBVSxhQUFhO0FBQUEsUUFDNUI7QUFBQSxVQUNDLE1BQU0sU0FBUztBQUFBLFVBQ2YsVUFBVTtBQUFBLFlBQ1Q7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxZQUFNLGFBQWE7QUFBQSxRQUFnQjtBQUFBLFFBQXdCO0FBQUE7QUFBQSxNQUFrRDtBQUM3RyxZQUFNLFNBQXVCO0FBQUEsUUFDNUIsS0FBSyxJQUFJLEtBQUssbUJBQW1CO0FBQUEsUUFDakMsUUFBUSxhQUFhO0FBQUEsUUFDckIsT0FBTztBQUFBLFFBQ1A7QUFBQSxRQUNBLFFBQVEsTUFBTTtBQUFBLFFBQUU7QUFBQSxRQUNoQixPQUFPLGdCQUFnQixtQkFBbUIsQ0FBQyxDQUFDO0FBQUEsUUFDNUMsVUFBVSxnQkFBZ0Isc0JBQXNCLENBQUMsQ0FBQztBQUFBLFFBQ2xELFFBQVEsZ0JBQThDLG9CQUFvQixDQUFDLEVBQUUsS0FBSyxVQUFVLE1BQU0sS0FBSyxDQUFDLENBQUM7QUFBQSxRQUN6RyxRQUFRLGdCQUFnQixvQkFBb0IsQ0FBQyxDQUFDO0FBQUEsUUFDOUMsY0FBYyxnQkFBZ0IsMEJBQTBCLENBQUMsQ0FBQztBQUFBLFFBQzFELHNCQUFzQixnQkFBZ0Isa0NBQWtDLENBQUMsQ0FBQztBQUFBLE1BQzNFO0FBRUEsNEJBQXNCLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBUztBQUU3QyxZQUFNLGdCQUFnQixNQUFNLFFBQVEsdUJBQXVCLGtCQUFrQixJQUFJO0FBSWpGLFlBQU0sZUFBZSxjQUFjLEtBQUssU0FBTyxJQUFJLFNBQVMsYUFBYTtBQUN6RSxhQUFPLEdBQUcsY0FBYyxpRUFBaUU7QUFDekYsYUFBTyxZQUFZLGFBQWEsYUFBYSxpQkFBaUI7QUFHOUQsYUFBTztBQUFBLFFBQVksY0FBYyxLQUFLLFNBQU8sSUFBSSxTQUFTLGlCQUFpQjtBQUFBLFFBQUc7QUFBQSxRQUM3RTtBQUFBLE1BQTJEO0FBQzVELGFBQU87QUFBQSxRQUFZLGNBQWMsS0FBSyxTQUFPLElBQUksU0FBUyxRQUFRO0FBQUEsUUFBRztBQUFBLFFBQ3BFO0FBQUEsTUFBMEQ7QUFFM0QsNEJBQXNCLElBQUksQ0FBQyxHQUFHLE1BQVM7QUFBQSxJQUN4QyxDQUFDO0FBRUQsU0FBSyx5RkFBeUYsWUFBWTtBQUN6Ryx3QkFBa0IscUJBQXFCLGNBQWMsa0JBQWtCLElBQUk7QUFDM0Usd0JBQWtCLHFCQUFxQixjQUFjLHFCQUFxQixDQUFDLENBQUM7QUFFNUUsWUFBTSxZQUFZLElBQUksS0FBSyxpRkFBaUY7QUFDNUcsWUFBTSxXQUFXLElBQUksU0FBUyxXQUFXLFVBQVUsV0FBVyxVQUFVO0FBQ3hFLFlBQU0sVUFBVSxhQUFhO0FBQUEsUUFDNUI7QUFBQSxVQUNDLE1BQU0sU0FBUztBQUFBLFVBQ2YsVUFBVTtBQUFBLFlBQ1Q7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxZQUFNLGFBQWE7QUFBQSxRQUFnQjtBQUFBLFFBQXdCO0FBQUE7QUFBQSxNQUFrRDtBQUM3RyxZQUFNLFNBQXVCO0FBQUEsUUFDNUIsS0FBSztBQUFBLFFBQ0wsUUFBUSxhQUFhO0FBQUEsUUFDckIsT0FBTztBQUFBLFFBQ1A7QUFBQSxRQUNBLFFBQVEsTUFBTTtBQUFBLFFBQUU7QUFBQSxRQUNoQixPQUFPLGdCQUFnQixtQkFBbUIsQ0FBQyxDQUFDO0FBQUEsUUFDNUMsVUFBVSxnQkFBZ0Isc0JBQXNCLENBQUMsQ0FBQztBQUFBLFFBQ2xELFFBQVEsZ0JBQThDLG9CQUFvQixDQUFDLEVBQUUsS0FBSyxVQUFVLE1BQU0sVUFBVSxDQUFDLENBQUM7QUFBQSxRQUM5RyxRQUFRLGdCQUFnQixvQkFBb0IsQ0FBQyxDQUFDO0FBQUEsUUFDOUMsY0FBYyxnQkFBZ0IsMEJBQTBCLENBQUMsQ0FBQztBQUFBLFFBQzFELHNCQUFzQixnQkFBZ0Isa0NBQWtDLENBQUMsQ0FBQztBQUFBLE1BQzNFO0FBRUEsNEJBQXNCLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBUztBQUU3QyxZQUFNLGdCQUFnQixNQUFNLFFBQVEsdUJBQXVCLGtCQUFrQixJQUFJO0FBRWpGLGFBQU8sZ0JBQWdCLGNBQ3JCLE9BQU8sYUFBVyxRQUFRLElBQUksU0FBUyxNQUFNLFNBQVMsU0FBUyxDQUFDLEVBQ2hFLElBQUksY0FBWSxFQUFFLE1BQU0sUUFBUSxNQUFNLGFBQWEsUUFBUSxhQUFhLE1BQU0sUUFBUSxNQUFNLFNBQVMsUUFBUSxRQUFRLEVBQUUsR0FBRyxDQUFDO0FBQUEsUUFDM0gsTUFBTTtBQUFBLFFBQ04sYUFBYTtBQUFBLFFBQ2IsTUFBTSxZQUFZO0FBQUEsUUFDbEIsU0FBUyxlQUFlO0FBQUEsTUFDekIsQ0FBQyxDQUFDO0FBRUgsNEJBQXNCLElBQUksQ0FBQyxHQUFHLE1BQVM7QUFBQSxJQUN4QyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSwwQkFBMEIsTUFBTTtBQUNyQyxTQUFLLCtEQUErRCxZQUFZO0FBQy9FLFlBQU0sZ0JBQWdCLElBQUksS0FBSyx5QkFBeUI7QUFDeEQsOEJBQXdCLGFBQWEsY0FBYyxhQUFhLENBQUM7QUFDakUsWUFBTSxVQUFVLGFBQWEsQ0FBQztBQUFBLFFBQzdCLE1BQU07QUFBQSxRQUNOLFVBQVUsQ0FBQyxPQUFPLDhCQUE4QixLQUFLO0FBQUEsTUFDdEQsQ0FBQyxDQUFDO0FBRUYsYUFBTyxhQUFhLE1BQU0sUUFBUSxnQkFBZ0Isa0JBQWtCLElBQUksR0FBRyxRQUFRLENBQUM7QUFFcEYsd0JBQWtCLHFCQUFxQixpREFBaUQsSUFBSTtBQUM1Rix1QkFBaUIsbUJBQW1CLCtDQUErQztBQUVuRixhQUFPLGdCQUFnQixNQUFNLFFBQVEsZ0JBQWdCLGtCQUFrQixJQUFJLEdBQUcsQ0FBQyxDQUFDO0FBQUEsSUFDakYsQ0FBQztBQUVELFNBQUssMkVBQTJFLFlBQVk7QUFDM0YsWUFBTSxnQkFBZ0IsSUFBSSxLQUFLLGtCQUFrQjtBQUNqRCw4QkFBd0IsYUFBYSxjQUFjLGFBQWEsQ0FBQztBQUNqRSx3QkFBa0IscUJBQXFCLGlEQUFpRCxJQUFJO0FBRTVGLFlBQU0sVUFBVSxhQUFhO0FBQUEsUUFDNUI7QUFBQSxVQUNDLE1BQU07QUFBQSxVQUNOLFVBQVUsQ0FBQyxPQUFPLDhCQUE4QixLQUFLO0FBQUEsUUFDdEQ7QUFBQSxRQUNBO0FBQUEsVUFDQyxNQUFNO0FBQUEsVUFDTixVQUFVLENBQUMsT0FBTyxnQ0FBZ0MsS0FBSztBQUFBLFFBQ3hEO0FBQUEsTUFDRCxDQUFDO0FBRUQsYUFBTyxnQkFBZ0IsTUFBTSxRQUFRLGdCQUFnQixrQkFBa0IsSUFBSSxHQUFHLENBQUMsQ0FBQztBQUNoRixhQUFPLGFBQWEsTUFBTSxRQUFRLGdCQUFnQixZQUFZLFFBQVEsa0JBQWtCLElBQUksR0FBRyxRQUFRLENBQUM7QUFBQSxJQUN6RyxDQUFDO0FBRUQsU0FBSyx5RkFBeUYsWUFBWTtBQUN6Ryx3QkFBa0IscUJBQXFCLGNBQWMsa0JBQWtCLElBQUk7QUFDM0Usd0JBQWtCLHFCQUFxQixpREFBaUQsSUFBSTtBQUM1RixZQUFNLGdCQUFnQixJQUFJLEtBQUssa0JBQWtCO0FBQ2pELDhCQUF3QixhQUFhLGNBQWMsYUFBYSxDQUFDO0FBQ2pFLFlBQU0sVUFBVSxhQUFhLENBQUM7QUFBQSxRQUM3QixNQUFNO0FBQUEsUUFDTixVQUFVLENBQUMsT0FBTywyQkFBMkIsNEJBQTRCLEtBQUs7QUFBQSxNQUMvRSxHQUFHO0FBQUEsUUFDRixNQUFNO0FBQUEsUUFDTixVQUFVLENBQUMsT0FBTyx3QkFBd0IseUJBQXlCLEtBQUs7QUFBQSxNQUN6RSxDQUFDLENBQUM7QUFFRixZQUFNLFNBQXVCO0FBQUEsUUFDNUIsS0FBSyxJQUFJLEtBQUssa0JBQWtCO0FBQUEsUUFDaEMsUUFBUSxhQUFhO0FBQUEsUUFDckIsT0FBTztBQUFBLFFBQ1AsWUFBWTtBQUFBLFVBQWdCO0FBQUEsVUFBNEI7QUFBQTtBQUFBLFFBQWtEO0FBQUEsUUFDMUcsT0FBTyxnQkFBZ0IsdUJBQXVCLENBQUMsQ0FBQztBQUFBLFFBQ2hELFVBQVUsZ0JBQWdCLDBCQUEwQixDQUFDLENBQUM7QUFBQSxRQUN0RCxRQUFRLGdCQUE4Qyx3QkFBd0IsQ0FBQyxFQUFFLEtBQUssSUFBSSxLQUFLLCtDQUErQyxHQUFHLE1BQU0sZUFBZSxDQUFDLENBQUM7QUFBQSxRQUN4SyxRQUFRLGdCQUFnQix3QkFBd0IsQ0FBQyxDQUFDO0FBQUEsUUFDbEQsY0FBYyxnQkFBZ0IsOEJBQThCLENBQUMsQ0FBQztBQUFBLFFBQzlELHNCQUFzQixnQkFBZ0IsNEJBQTRCLENBQUMsQ0FBQztBQUFBLE1BQ3JFO0FBQ0EsNEJBQXNCLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBUztBQUU3QyxZQUFNLFNBQVMsTUFBTSxRQUFRLGdCQUFnQixrQkFBa0IsSUFBSTtBQUNuRSxhQUFPLGdCQUFnQixRQUFRLElBQUksWUFBVSxFQUFFLE1BQU0sTUFBTSxNQUFNLFNBQVMsTUFBTSxRQUFRLEVBQUUsR0FBRztBQUFBLFFBQzVGLEVBQUUsTUFBTSxnQkFBZ0IsU0FBUyxlQUFlLE9BQU87QUFBQSxNQUN4RCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSywwRkFBMEYsWUFBWTtBQUMxRyx3QkFBa0IscUJBQXFCLGlEQUFpRCxJQUFJO0FBQzVGLFlBQU0sZ0JBQWdCLElBQUksS0FBSyx3QkFBd0I7QUFDdkQsOEJBQXdCLGFBQWEsY0FBYyxhQUFhLENBQUM7QUFDakUsWUFBTSwwQkFBMEIsSUFBSSxTQUFTLGVBQWUsV0FBVyxnQkFBZ0IsMkJBQTJCO0FBQ2xILFlBQU0sWUFBWSxJQUFJLEtBQUssa0JBQWtCO0FBQzdDLFlBQU0sdUJBQXVCLElBQUksU0FBUyxXQUFXLFNBQVMsd0JBQXdCO0FBQ3RGLFlBQU0sVUFBVSxhQUFhLENBQUM7QUFBQSxRQUM3QixNQUFNLHdCQUF3QjtBQUFBLFFBQzlCLFVBQVUsQ0FBQyxPQUFPLDRCQUE0QixLQUFLO0FBQUEsTUFDcEQsR0FBRztBQUFBLFFBQ0YsTUFBTSxxQkFBcUI7QUFBQSxRQUMzQixVQUFVLENBQUMsT0FBTyx5QkFBeUIsS0FBSztBQUFBLE1BQ2pELENBQUMsQ0FBQztBQUVGLFlBQU0sU0FBdUI7QUFBQSxRQUM1QixLQUFLO0FBQUEsUUFDTCxRQUFRLGFBQWE7QUFBQSxRQUNyQixPQUFPO0FBQUEsUUFDUCxZQUFZO0FBQUEsVUFBZ0I7QUFBQSxVQUF1QztBQUFBO0FBQUEsUUFBa0Q7QUFBQSxRQUNySCxPQUFPLGdCQUFnQixrQ0FBa0MsQ0FBQyxDQUFDO0FBQUEsUUFDM0QsVUFBVSxnQkFBZ0IscUNBQXFDLENBQUMsQ0FBQztBQUFBLFFBQ2pFLFFBQVEsZ0JBQWdCLG1DQUFtQyxDQUFDLENBQUM7QUFBQSxRQUM3RCxRQUFRLGdCQUFnQixtQ0FBbUMsQ0FBQyxDQUFDO0FBQUEsUUFDN0QsY0FBYyxnQkFBb0QsOEJBQThCLENBQUMsRUFBRSxLQUFLLHNCQUFzQixNQUFNLFNBQVMsQ0FBQyxDQUFDO0FBQUEsUUFDL0ksc0JBQXNCLGdCQUFnQix1Q0FBdUMsQ0FBQyxDQUFDO0FBQUEsTUFDaEY7QUFDQSw0QkFBc0IsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFTO0FBRTdDLFlBQU0sZUFBZSxNQUFNLFFBQVEsZ0JBQWdCLFlBQVksY0FBYyxrQkFBa0IsSUFBSTtBQUNuRyxhQUFPLGdCQUFnQixhQUFhLElBQUksa0JBQWdCO0FBQUEsUUFDdkQsS0FBSyxZQUFZLElBQUksU0FBUztBQUFBLFFBQzlCLFNBQVMsWUFBWTtBQUFBLE1BQ3RCLEVBQUUsR0FBRyxDQUFDO0FBQUEsUUFDTCxLQUFLLHFCQUFxQixTQUFTO0FBQUEsUUFDbkMsU0FBUyxlQUFlO0FBQUEsTUFDekIsQ0FBQyxDQUFDO0FBQUEsSUFDSCxDQUFDO0FBRUQsU0FBSyxrRUFBa0UsWUFBWTtBQUNsRix3QkFBa0IscUJBQXFCLGlEQUFpRCxJQUFJO0FBQzVGLFlBQU0sZ0JBQWdCLElBQUksS0FBSyw4QkFBOEI7QUFDN0QsOEJBQXdCLGFBQWEsY0FBYyxhQUFhLENBQUM7QUFDakUsWUFBTSxVQUFVLGFBQWEsQ0FBQztBQUFBLFFBQzdCLE1BQU0sSUFBSSxTQUFTLGVBQWUsV0FBVyxFQUFFO0FBQUEsUUFDL0MsVUFBVSxDQUFDLDhCQUE4QjtBQUFBLE1BQzFDLEdBQUc7QUFBQSxRQUNGLE1BQU0sSUFBSSxTQUFTLGVBQWUsV0FBVyxFQUFFO0FBQUEsUUFDL0MsVUFBVSxDQUFDLCtCQUErQjtBQUFBLE1BQzNDLENBQUMsQ0FBQztBQUVGLGFBQU8sZ0JBQWdCLE1BQU0sUUFBUSxzQkFBc0Isa0JBQWtCLE1BQU0sTUFBUyxHQUFHLENBQUMsQ0FBQztBQUNqRyxhQUFPLGdCQUFnQixNQUFNLFFBQVEsbUJBQW1CLGtCQUFrQixJQUFJLEdBQUcsQ0FBQyxDQUFDO0FBQUEsSUFDcEYsQ0FBQztBQUVELFNBQUssc0VBQXNFLFlBQVk7QUFDdEYsd0JBQWtCLHFCQUFxQixjQUFjLGdCQUFnQixJQUFJO0FBQ3pFLHdCQUFrQixxQkFBcUIsaURBQWlELElBQUk7QUFDNUYsWUFBTSxnQkFBZ0IsSUFBSSxLQUFLLHVCQUF1QjtBQUN0RCw4QkFBd0IsYUFBYSxjQUFjLGFBQWEsQ0FBQztBQUNqRSxZQUFNLFVBQVUsYUFBYSxDQUFDO0FBQUEsUUFDN0IsTUFBTTtBQUFBLFFBQ04sVUFBVTtBQUFBLFVBQ1Q7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDLENBQUM7QUFFRixZQUFNLFNBQVMsTUFBTSxRQUFRLGdCQUFnQixrQkFBa0IsSUFBSTtBQUNuRSxhQUFPLGdCQUFnQixRQUFRLENBQUMsQ0FBQztBQUFBLElBQ2xDLENBQUM7QUFFRCxTQUFLLGtGQUFrRixZQUFZO0FBQ2xHLHdCQUFrQixxQkFBcUIsY0FBYyxnQkFBZ0IsSUFBSTtBQUN6RSx3QkFBa0IscUJBQXFCLHlDQUF5QyxJQUFJO0FBQ3BGLFlBQU0sWUFBWSxJQUFJLEtBQUssMEVBQTBFO0FBQ3JHLFlBQU0sV0FBVyxJQUFJLFNBQVMsV0FBVyxVQUFVLG1CQUFtQjtBQUN0RSxZQUFNLFVBQVUsYUFBYSxDQUFDO0FBQUEsUUFDN0IsTUFBTSxTQUFTO0FBQUEsUUFDZixVQUFVO0FBQUEsVUFDVDtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUMsQ0FBQztBQUVGLFlBQU0sa0JBQWtCLGtCQUFrQixRQUFRLEtBQUssaUJBQWlCO0FBQ3hFLHdCQUFrQixVQUFVLENBQUksS0FBYSxjQUFnRTtBQUM1RyxjQUFNLFlBQVksZ0JBQW1CLEtBQUssU0FBUztBQUNuRCxlQUFPLFFBQVEsa0JBQWtCLGlCQUM5QixFQUFFLEdBQUcsV0FBVyxhQUFhLEVBQUUsc0NBQXNDLEtBQUssRUFBTyxJQUNqRjtBQUFBLE1BQ0o7QUFFQSxZQUFNLFNBQXVCO0FBQUEsUUFDNUIsS0FBSztBQUFBLFFBQ0wsUUFBUSxhQUFhO0FBQUEsUUFDckIsT0FBTztBQUFBLFFBQ1AsWUFBWTtBQUFBLFVBQWdCO0FBQUEsVUFBMkI7QUFBQTtBQUFBLFFBQWtEO0FBQUEsUUFDekcsT0FBTyxnQkFBZ0Isc0JBQXNCLENBQUMsQ0FBQztBQUFBLFFBQy9DLFVBQVUsZ0JBQWdCLHlCQUF5QixDQUFDLENBQUM7QUFBQSxRQUNyRCxRQUFRLGdCQUFnQix1QkFBdUIsQ0FBQyxDQUFDO0FBQUEsUUFDakQsUUFBUSxnQkFBOEMsdUJBQXVCLENBQUMsRUFBRSxLQUFLLFVBQVUsTUFBTSxXQUFXLENBQUMsQ0FBQztBQUFBLFFBQ2xILGNBQWMsZ0JBQWdCLDZCQUE2QixDQUFDLENBQUM7QUFBQSxRQUM3RCxzQkFBc0IsZ0JBQWdCLDJCQUEyQixDQUFDLENBQUM7QUFBQSxNQUNwRTtBQUNBLDRCQUFzQixJQUFJLENBQUMsTUFBTSxHQUFHLE1BQVM7QUFDN0MsdUJBQWlCLG1CQUFtQix5Q0FBeUMsa0JBQWtCLGNBQWM7QUFFN0csWUFBTSxTQUFTLE1BQU0sUUFBUSxnQkFBZ0Isa0JBQWtCLElBQUk7QUFDbkUsYUFBTyxZQUFZLE9BQU8sUUFBUSxDQUFDO0FBQ25DLGFBQU8sWUFBWSxPQUFPLENBQUMsRUFBRSxRQUFRLFNBQVMsVUFBVSxJQUFJLENBQUMsRUFBRSxTQUFTLGNBQWM7QUFBQSxJQUN2RixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSxTQUFTLE1BQU07QUFDcEIsVUFBTSxtQkFBbUIsQ0FBQyxNQUFjLGlCQUFpSTtBQUN4SyxZQUFNLGFBQWE7QUFBQSxRQUFnQjtBQUFBLFFBQXdCO0FBQUE7QUFBQSxNQUFrRDtBQUM3RyxZQUFNLFFBQVEsZ0JBQTZDLG1CQUFtQixZQUFZO0FBQzFGLFlBQU0sV0FBVyxnQkFBZ0Qsc0JBQXNCLENBQUMsQ0FBQztBQUN6RixZQUFNLFNBQVMsZ0JBQThDLG9CQUFvQixDQUFDLENBQUM7QUFDbkYsWUFBTSxTQUFTLGdCQUE4QyxvQkFBb0IsQ0FBQyxDQUFDO0FBQ25GLFlBQU0sZUFBZSxnQkFBb0QsMEJBQTBCLENBQUMsQ0FBQztBQUNyRyxZQUFNLHVCQUF1QixnQkFBNEQsa0NBQWtDLENBQUMsQ0FBQztBQUU3SCxhQUFPO0FBQUEsUUFDTixRQUFRO0FBQUEsVUFDUCxLQUFLLElBQUksS0FBSyxJQUFJO0FBQUEsVUFDbEIsUUFBUSxhQUFhO0FBQUEsVUFDckIsT0FBTyxTQUFTLElBQUksS0FBSyxJQUFJLENBQUM7QUFBQSxVQUM5QjtBQUFBLFVBQ0EsUUFBUSxNQUFNO0FBQUEsVUFBRTtBQUFBLFVBQ2hCO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsU0FBSyx1RUFBdUUsaUJBQWtCO0FBQzdGLFlBQU0sYUFBYSxJQUFJLEtBQUssY0FBYztBQUMxQyxZQUFNLGFBQWEsSUFBSSxLQUFLLGNBQWM7QUFFMUMsOEJBQXdCLGFBQWEsY0FBYyxZQUFZLFVBQVUsQ0FBQztBQUMxRSx3QkFBa0IscUJBQXFCLGNBQWMsZ0JBQWdCLElBQUk7QUFDekUsd0JBQWtCLHFCQUFxQixjQUFjLG9CQUFvQixFQUFFLENBQUMsbUJBQW1CLEdBQUcsS0FBSyxDQUFDO0FBRXhHLFlBQU0sVUFBVSxhQUFhO0FBQUEsUUFDNUI7QUFBQSxVQUNDLE1BQU07QUFBQSxVQUNOLFVBQVU7QUFBQSxZQUNULEtBQUssVUFBVTtBQUFBLGNBQ2QsT0FBTztBQUFBLGdCQUNOLENBQUMsU0FBUyxVQUFVLEdBQUc7QUFBQSxrQkFDdEIsRUFBRSxNQUFNLFdBQVcsU0FBUyxnQkFBZ0I7QUFBQSxnQkFDN0M7QUFBQSxjQUNEO0FBQUEsWUFDRCxDQUFDO0FBQUEsVUFDRjtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxNQUFNO0FBQUEsVUFDTixVQUFVO0FBQUEsWUFDVCxLQUFLLFVBQVU7QUFBQSxjQUNkLE9BQU87QUFBQSxnQkFDTixDQUFDLFNBQVMsVUFBVSxHQUFHO0FBQUEsa0JBQ3RCLEVBQUUsTUFBTSxXQUFXLFNBQVMsZ0JBQWdCO0FBQUEsZ0JBQzdDO0FBQUEsY0FDRDtBQUFBLFlBQ0QsQ0FBQztBQUFBLFVBQ0Y7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsWUFBTSxTQUFTLE1BQU0sUUFBUSxTQUFTLGtCQUFrQixJQUFJO0FBQzVELGFBQU8sR0FBRyxRQUFRLHVCQUF1QjtBQUV6QyxZQUFNLGtCQUFrQixPQUFPLE1BQU0sU0FBUyxVQUFVO0FBQ3hELGFBQU8sR0FBRyxpQkFBaUIsMkJBQTJCO0FBQ3RELGFBQU8sWUFBWSxnQkFBZ0IsUUFBUSxHQUFHLCtCQUErQjtBQUU3RSxZQUFNLFFBQVEsZ0JBQWdCLEtBQUssT0FBSyxFQUFFLFlBQVksZUFBZTtBQUNyRSxZQUFNLFFBQVEsZ0JBQWdCLEtBQUssT0FBSyxFQUFFLFlBQVksZUFBZTtBQUNyRSxhQUFPLEdBQUcsT0FBTyw2QkFBNkI7QUFDOUMsYUFBTyxHQUFHLE9BQU8sNkJBQTZCO0FBRTlDLGFBQU8sWUFBWSxNQUFNLEtBQUssTUFBTSxXQUFXLE1BQU0sNERBQTREO0FBQ2pILGFBQU8sWUFBWSxNQUFNLEtBQUssTUFBTSxXQUFXLE1BQU0sNERBQTREO0FBQUEsSUFDbEgsQ0FBQztBQUVELFNBQUsscUNBQXFDLGlCQUFrQjtBQUMzRCx3QkFBa0IscUJBQXFCLGNBQWMsZ0JBQWdCLElBQUk7QUFDekUsd0JBQWtCLHFCQUFxQixjQUFjLG9CQUFvQixDQUFDLENBQUM7QUFFM0UsWUFBTSxFQUFFLE9BQU8sSUFBSSxpQkFBaUIsd0JBQXdCLENBQUM7QUFBQSxRQUM1RCxNQUFNLFNBQVM7QUFBQSxRQUNmLFlBQVk7QUFBQSxRQUNaLE9BQU8sQ0FBQyxFQUFFLFNBQVMsbUJBQW1CLENBQUM7QUFBQSxRQUN2QyxLQUFLLElBQUksS0FBSyxpQ0FBaUM7QUFBQSxNQUNoRCxDQUFDLENBQUM7QUFFRiw0QkFBc0IsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFTO0FBRTdDLFlBQU0sU0FBUyxNQUFNLFFBQVEsU0FBUyxrQkFBa0IsSUFBSTtBQUM1RCxhQUFPLEdBQUcsUUFBUSx1QkFBdUI7QUFFekMsYUFBTyxnQkFBZ0IsT0FBTyxNQUFNLFNBQVMsVUFBVSxHQUFHLENBQUM7QUFBQSxRQUMxRCxTQUFTO0FBQUEsUUFDVCxXQUFXLElBQUksS0FBSyxpQ0FBaUM7QUFBQSxNQUN0RCxDQUFDLEdBQUcsd0RBQXdEO0FBQUEsSUFDN0QsQ0FBQztBQUVELFNBQUssa0VBQWtFLGlCQUFrQjtBQUN4RixZQUFNLGdCQUFnQixJQUFJLEtBQUsscUJBQXFCO0FBQ3BELDhCQUF3QixhQUFhLGNBQWMsYUFBYSxDQUFDO0FBQ2pFLHdCQUFrQixxQkFBcUIsY0FBYyxnQkFBZ0IsSUFBSTtBQUN6RSx3QkFBa0IscUJBQXFCLGNBQWMsb0JBQW9CLEVBQUUsQ0FBQyxtQkFBbUIsR0FBRyxLQUFLLENBQUM7QUFDeEcsd0JBQWtCLHFCQUFxQix5Q0FBeUMsSUFBSTtBQUNwRix1QkFBaUIsbUJBQW1CLHVDQUF1QztBQUMzRSxZQUFNLFVBQVUsYUFBYSxDQUFDO0FBQUEsUUFDN0IsTUFBTTtBQUFBLFFBQ04sVUFBVSxDQUFDLEtBQUssVUFBVSxFQUFFLE9BQU8sRUFBRSxDQUFDLFNBQVMsVUFBVSxHQUFHLENBQUMsRUFBRSxNQUFNLFdBQVcsU0FBUyxpQkFBaUIsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO0FBQUEsTUFDbEgsQ0FBQyxDQUFDO0FBRUYsWUFBTSxFQUFFLE9BQU8sSUFBSSxpQkFBaUIsc0JBQXNCLENBQUM7QUFBQSxRQUMxRCxNQUFNLFNBQVM7QUFBQSxRQUNmLFlBQVk7QUFBQSxRQUNaLE9BQU8sQ0FBQyxFQUFFLFNBQVMsY0FBYyxDQUFDO0FBQUEsUUFDbEMsS0FBSyxJQUFJLEtBQUssK0JBQStCO0FBQUEsTUFDOUMsQ0FBQyxDQUFDO0FBQ0YsNEJBQXNCLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBUztBQUU3QyxhQUFPLFlBQVksTUFBTSxRQUFRLFNBQVMsa0JBQWtCLElBQUksR0FBRyxNQUFTO0FBQzVFLGFBQU8sZ0JBQWdCLE1BQU0sUUFBUSxnQkFBZ0IsWUFBWSxNQUFNLGtCQUFrQixJQUFJLEdBQUcsQ0FBQyxDQUFDO0FBQUEsSUFDbkcsQ0FBQztBQUVELFNBQUssbURBQW1ELGlCQUFrQjtBQUN6RSx3QkFBa0IscUJBQXFCLGNBQWMsZ0JBQWdCLElBQUk7QUFDekUsd0JBQWtCLHFCQUFxQixjQUFjLG9CQUFvQixDQUFDLENBQUM7QUFFM0UsWUFBTSxFQUFFLFFBQVEsTUFBTSxJQUFJLGlCQUFpQix3QkFBd0IsQ0FBQztBQUFBLFFBQ25FLE1BQU0sU0FBUztBQUFBLFFBQ2YsWUFBWTtBQUFBLFFBQ1osT0FBTyxDQUFDLEVBQUUsU0FBUyxjQUFjLENBQUM7QUFBQSxRQUNsQyxLQUFLLElBQUksS0FBSyxpQ0FBaUM7QUFBQSxNQUNoRCxDQUFDLENBQUM7QUFFRiw0QkFBc0IsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFTO0FBRTdDLFlBQU0sU0FBUyxNQUFNLFFBQVEsU0FBUyxrQkFBa0IsSUFBSTtBQUM1RCxhQUFPLEdBQUcsUUFBUSw0Q0FBNEM7QUFDOUQsYUFBTyxnQkFBZ0IsT0FBTyxNQUFNLFNBQVMsVUFBVSxHQUFHLENBQUMsRUFBRSxTQUFTLGVBQWUsV0FBVyxJQUFJLEtBQUssaUNBQWlDLEVBQUUsQ0FBQyxDQUFDO0FBRTlJLFlBQU0sSUFBSSxDQUFDO0FBQUEsUUFDVixNQUFNLFNBQVM7QUFBQSxRQUNmLFlBQVk7QUFBQSxRQUNaLE9BQU8sQ0FBQyxFQUFFLFNBQVMsYUFBYSxDQUFDO0FBQUEsUUFDakMsS0FBSyxJQUFJLEtBQUssaUNBQWlDO0FBQUEsTUFDaEQsQ0FBQyxHQUFHLE1BQVM7QUFFYixZQUFNLFFBQVEsTUFBTSxRQUFRLFNBQVMsa0JBQWtCLElBQUk7QUFDM0QsYUFBTyxHQUFHLE9BQU8sMkNBQTJDO0FBQzVELGFBQU8sZ0JBQWdCLE1BQU0sTUFBTSxTQUFTLFVBQVUsR0FBRyxDQUFDLEVBQUUsU0FBUyxjQUFjLFdBQVcsSUFBSSxLQUFLLGlDQUFpQyxFQUFFLENBQUMsQ0FBQztBQUFBLElBQzdJLENBQUM7QUFFRCxTQUFLLGlEQUFpRCxpQkFBa0I7QUFDdkUsOEJBQXdCLGFBQWEsY0FBYyxJQUFJLEtBQUssaUJBQWlCLENBQUMsQ0FBQztBQUMvRSx3QkFBa0IscUJBQXFCLGNBQWMsZ0JBQWdCLElBQUk7QUFDekUsd0JBQWtCLHFCQUFxQixjQUFjLG9CQUFvQixFQUFFLENBQUMsbUJBQW1CLEdBQUcsS0FBSyxDQUFDO0FBRXhHLFlBQU0sVUFBVSxhQUFhO0FBQUEsUUFDNUI7QUFBQSxVQUNDLE1BQU07QUFBQSxVQUNOLFVBQVU7QUFBQSxZQUNULEtBQUssVUFBVTtBQUFBLGNBQ2QsT0FBTztBQUFBLGdCQUNOLENBQUMsU0FBUyxVQUFVLEdBQUc7QUFBQSxrQkFDdEIsRUFBRSxNQUFNLFdBQVcsU0FBUyxZQUFZO0FBQUEsZ0JBQ3pDO0FBQUEsY0FDRDtBQUFBLFlBQ0QsQ0FBQztBQUFBLFVBQ0Y7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBR0QsWUFBTSxnQkFBZ0IsTUFBTSxRQUFRLFNBQVMsa0JBQWtCLElBQUk7QUFDbkUsYUFBTyxHQUFHLGVBQWUsMENBQTBDO0FBQ25FLGFBQU8sWUFBWSxjQUFjLE1BQU0sU0FBUyxVQUFVLEdBQUcsUUFBUSxDQUFDO0FBR3RFLFlBQU0sc0JBQXNCLGtCQUFrQixLQUFLO0FBQ25ELFlBQU0sa0JBQWtCLE1BQU0sUUFBUSxTQUFTLGtCQUFrQixJQUFJO0FBQ3JFLGFBQU8sWUFBWSxpQkFBaUIsUUFBVyxzREFBc0Q7QUFHckcsWUFBTSxzQkFBc0Isa0JBQWtCLElBQUk7QUFDbEQsWUFBTSxrQkFBa0IsTUFBTSxRQUFRLFNBQVMsa0JBQWtCLElBQUk7QUFDckUsYUFBTyxHQUFHLGlCQUFpQixzREFBc0Q7QUFDakYsYUFBTyxZQUFZLGdCQUFnQixNQUFNLFNBQVMsVUFBVSxHQUFHLFFBQVEsQ0FBQztBQUFBLElBQ3pFLENBQUM7QUFFRCxTQUFLLHVEQUF1RCxpQkFBa0I7QUFDN0Usd0JBQWtCLHFCQUFxQixjQUFjLGdCQUFnQixJQUFJO0FBQ3pFLHdCQUFrQixxQkFBcUIsY0FBYyxvQkFBb0IsQ0FBQyxDQUFDO0FBRTNFLFlBQU0sRUFBRSxPQUFPLElBQUksaUJBQWlCLHdCQUF3QixDQUFDO0FBQUEsUUFDNUQsTUFBTSxTQUFTO0FBQUEsUUFDZixZQUFZO0FBQUEsUUFDWixPQUFPLENBQUMsRUFBRSxTQUFTLG1CQUFtQixDQUFDO0FBQUEsUUFDdkMsS0FBSyxJQUFJLEtBQUssaUNBQWlDO0FBQUEsTUFDaEQsQ0FBQyxDQUFDO0FBRUYsNEJBQXNCLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBUztBQUU3QyxZQUFNLHNCQUFzQixrQkFBa0IsS0FBSztBQUNuRCxZQUFNLFNBQVMsTUFBTSxRQUFRLFNBQVMsa0JBQWtCLElBQUk7QUFDNUQsYUFBTyxZQUFZLFFBQVEsUUFBVyw4RUFBOEU7QUFBQSxJQUNySCxDQUFDO0FBRUQsU0FBSywrR0FBK0csaUJBQWtCO0FBSXJJLFlBQU0sZUFBZSxJQUFJLEtBQUssaUJBQWlCO0FBQy9DLDhCQUF3QixhQUFhLGNBQWMsWUFBWSxDQUFDO0FBQ2hFLHdCQUFrQixxQkFBcUIsY0FBYyxnQkFBZ0IsSUFBSTtBQUN6RSx3QkFBa0IscUJBQXFCLGNBQWMsa0JBQWtCLEtBQUs7QUFDNUUsd0JBQWtCLHFCQUFxQixjQUFjLG9CQUFvQixFQUFFLENBQUMsbUJBQW1CLEdBQUcsS0FBSyxDQUFDO0FBRXhHLFlBQU0sVUFBVSxhQUFhO0FBQUEsUUFDNUI7QUFBQSxVQUNDLE1BQU07QUFBQSxVQUNOLFVBQVU7QUFBQSxZQUNULEtBQUssVUFBVTtBQUFBLGNBQ2QsaUJBQWlCO0FBQUEsY0FDakIsT0FBTztBQUFBLGdCQUNOLFlBQVksQ0FBQyxFQUFFLE1BQU0sV0FBVyxTQUFTLDRCQUE0QixDQUFDO0FBQUEsY0FDdkU7QUFBQSxZQUNELENBQUM7QUFBQSxVQUNGO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUVELFlBQU0sU0FBUyxNQUFNLFFBQVEsU0FBUyxrQkFBa0IsSUFBSTtBQUU1RCxhQUFPLFlBQVksUUFBUSxRQUFXLDBCQUEwQjtBQUFBLElBQ2pFLENBQUM7QUFFRCxTQUFLLG9EQUFvRCxpQkFBa0I7QUFHMUUsWUFBTSxlQUFlLElBQUksS0FBSyxpQkFBaUI7QUFDL0MsOEJBQXdCLGFBQWEsY0FBYyxZQUFZLENBQUM7QUFDaEUsd0JBQWtCLHFCQUFxQixjQUFjLGdCQUFnQixJQUFJO0FBQ3pFLHdCQUFrQixxQkFBcUIsY0FBYyxvQkFBb0IsRUFBRSxDQUFDLG1CQUFtQixHQUFHLEtBQUssQ0FBQztBQUV4RyxZQUFNLGdCQUFnQixJQUFJLEtBQUssaUNBQWlDO0FBQ2hFLFlBQU0sRUFBRSxPQUFPLElBQUksaUJBQWlCLHdCQUF3QixDQUFDO0FBQUEsUUFDNUQsTUFBTSxTQUFTO0FBQUEsUUFDZixZQUFZO0FBQUEsUUFDWixPQUFPLENBQUMsRUFBRSxTQUFTLG1CQUFtQixDQUFDO0FBQUEsUUFDdkMsS0FBSztBQUFBLE1BQ04sQ0FBQyxDQUFDO0FBRUYsNEJBQXNCLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBUztBQUU3QyxZQUFNLFNBQVMsTUFBTSxRQUFRLFNBQVMsa0JBQWtCLElBQUk7QUFDNUQsWUFBTSx3QkFBd0IsTUFBTSxRQUFRLGlCQUFpQixZQUFZLE1BQU0sa0JBQWtCLElBQUk7QUFFckcsYUFBTyxHQUFHLFFBQVEseUNBQXlDO0FBQzNELGFBQU8sR0FBRyx1QkFBdUIsc0NBQXNDO0FBR3ZFLFlBQU0sYUFBYSxzQkFBdUIsTUFBTTtBQUFBLFFBQy9DLE9BQUssRUFBRSxXQUFXLFlBQVksZUFBZTtBQUFBLE1BQzlDO0FBQ0EsYUFBTyxHQUFHLFlBQVksNERBQTREO0FBQUEsSUFDbkYsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sdUJBQXVCLE1BQU07QUFDbEMsYUFBUyw2QkFDUixNQUNBLHFCQUNrRztBQUNsRyxZQUFNLGFBQWE7QUFBQSxRQUFnQjtBQUFBLFFBQXdCO0FBQUE7QUFBQSxNQUFrRDtBQUM3RyxZQUFNLFFBQVEsZ0JBQTZDLG1CQUFtQixDQUFDLENBQUM7QUFDaEYsWUFBTSxXQUFXLGdCQUFnRCxzQkFBc0IsQ0FBQyxDQUFDO0FBQ3pGLFlBQU0sU0FBUyxnQkFBOEMsb0JBQW9CLENBQUMsQ0FBQztBQUNuRixZQUFNLFNBQVMsZ0JBQThDLG9CQUFvQixDQUFDLENBQUM7QUFDbkYsWUFBTSxlQUFlLGdCQUFvRCwwQkFBMEIsbUJBQW1CO0FBQ3RILFlBQU0sdUJBQXVCLGdCQUE0RCxrQ0FBa0MsQ0FBQyxDQUFDO0FBRTdILGFBQU87QUFBQSxRQUNOLFFBQVE7QUFBQSxVQUNQLEtBQUssSUFBSSxLQUFLLElBQUk7QUFBQSxVQUNsQixRQUFRLGFBQWE7QUFBQSxVQUNyQixPQUFPLFNBQVMsSUFBSSxLQUFLLElBQUksQ0FBQztBQUFBLFVBQzlCO0FBQUEsVUFDQSxRQUFRLE1BQU07QUFBQSxVQUFFO0FBQUEsVUFDaEI7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxTQUFLLGlEQUFpRCxpQkFBa0I7QUFDdkUsWUFBTSxVQUFVLElBQUksS0FBSyw2Q0FBNkM7QUFDdEUsWUFBTSxFQUFFLE9BQU8sSUFBSSw2QkFBNkIsd0JBQXdCO0FBQUEsUUFDdkUsRUFBRSxLQUFLLFNBQVMsTUFBTSxlQUFlO0FBQUEsTUFDdEMsQ0FBQztBQUVELDRCQUFzQixJQUFJLENBQUMsTUFBTSxHQUFHLE1BQVM7QUFFN0MsWUFBTSxTQUFTLE1BQU0sUUFBUSxnQkFBZ0IsWUFBWSxjQUFjLGtCQUFrQixJQUFJO0FBQzdGLFlBQU0sb0JBQW9CLE9BQU8sS0FBSyxPQUFLLEVBQUUsSUFBSSxTQUFTLE1BQU0sUUFBUSxTQUFTLENBQUM7QUFDbEYsYUFBTyxHQUFHLG1CQUFtQixxREFBcUQ7QUFDbEYsYUFBTyxZQUFZLGtCQUFtQixTQUFTLGVBQWUsTUFBTTtBQUFBLElBQ3JFLENBQUM7QUFFRCxTQUFLLCtEQUErRCxpQkFBa0I7QUFDckYsWUFBTSxXQUFXLElBQUksS0FBSyx1Q0FBdUM7QUFDakUsWUFBTSxXQUFXLElBQUksS0FBSyx1Q0FBdUM7QUFDakUsWUFBTSxFQUFFLFFBQVEsYUFBYSxJQUFJLDZCQUE2Qix3QkFBd0I7QUFBQSxRQUNyRixFQUFFLEtBQUssVUFBVSxNQUFNLFNBQVM7QUFBQSxNQUNqQyxDQUFDO0FBRUQsNEJBQXNCLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBUztBQUU3QyxZQUFNLFNBQVMsTUFBTSxRQUFRLGdCQUFnQixZQUFZLGNBQWMsa0JBQWtCLElBQUk7QUFDN0YsWUFBTSxlQUFlLE9BQU8sT0FBTyxPQUFLLEVBQUUsWUFBWSxlQUFlLE1BQU07QUFDM0UsYUFBTyxZQUFZLGFBQWEsUUFBUSxDQUFDO0FBRXpDLFlBQU0sYUFBYSxJQUFJLFFBQWMsYUFBVztBQUMvQyxjQUFNLGFBQWEsUUFBUSx3QkFBd0IsTUFBTTtBQUN4RCxxQkFBVyxRQUFRO0FBQ25CLGtCQUFRO0FBQUEsUUFDVCxDQUFDO0FBQUEsTUFDRixDQUFDO0FBRUQsbUJBQWEsSUFBSTtBQUFBLFFBQ2hCLEVBQUUsS0FBSyxVQUFVLE1BQU0sU0FBUztBQUFBLFFBQ2hDLEVBQUUsS0FBSyxVQUFVLE1BQU0sU0FBUztBQUFBLE1BQ2pDLEdBQUcsTUFBUztBQUVaLFlBQU07QUFFTixZQUFNLFFBQVEsTUFBTSxRQUFRLGdCQUFnQixZQUFZLGNBQWMsa0JBQWtCLElBQUk7QUFDNUYsWUFBTSxjQUFjLE1BQU0sT0FBTyxPQUFLLEVBQUUsWUFBWSxlQUFlLE1BQU07QUFDekUsYUFBTyxZQUFZLFlBQVksUUFBUSxDQUFDO0FBQUEsSUFDekMsQ0FBQztBQUVELFNBQUssK0NBQStDLGlCQUFrQjtBQUNyRSxZQUFNLFVBQVUsSUFBSSxLQUFLLHVDQUF1QztBQUNoRSxZQUFNLEVBQUUsT0FBTyxJQUFJLDZCQUE2Qix3QkFBd0I7QUFBQSxRQUN2RSxFQUFFLEtBQUssU0FBUyxNQUFNLFNBQVM7QUFBQSxNQUNoQyxDQUFDO0FBRUQsNEJBQXNCLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBUztBQUM3QyxZQUFNLGFBQWEsTUFBTSxRQUFRLGdCQUFnQixZQUFZLGNBQWMsa0JBQWtCLElBQUk7QUFDakcsYUFBTyxHQUFHLFdBQVcsS0FBSyxPQUFLLEVBQUUsWUFBWSxlQUFlLE1BQU0sQ0FBQztBQUVuRSw0QkFBc0IsSUFBSSxDQUFDLEdBQUcsTUFBUztBQUN2QyxZQUFNLGdCQUFnQixNQUFNLFFBQVEsZ0JBQWdCLFlBQVksY0FBYyxrQkFBa0IsSUFBSTtBQUNwRyxhQUFPLEdBQUcsQ0FBQyxjQUFjLEtBQUssT0FBSyxFQUFFLFlBQVksZUFBZSxNQUFNLENBQUM7QUFBQSxJQUN4RSxDQUFDO0FBRUQsU0FBSywwREFBMEQsaUJBQWtCO0FBQ2hGLFlBQU0sVUFBVSxJQUFJLEtBQUssNENBQTRDO0FBQ3JFLFlBQU0sRUFBRSxPQUFPLElBQUksNkJBQTZCLHlCQUF5QjtBQUFBLFFBQ3hFLEVBQUUsS0FBSyxTQUFTLE1BQU0sYUFBYTtBQUFBLE1BQ3BDLENBQUM7QUFFRCw0QkFBc0IsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFTO0FBRTdDLFlBQU0sU0FBUyxNQUFNLFFBQVEsZ0JBQWdCLFlBQVksY0FBYyxrQkFBa0IsSUFBSTtBQUM3RixZQUFNLG9CQUFvQixPQUFPLEtBQUssT0FBSyxFQUFFLElBQUksU0FBUyxNQUFNLFFBQVEsU0FBUyxDQUFDO0FBQ2xGLGFBQU8sR0FBRyxtQkFBbUIscUNBQXFDO0FBQ2xFLGFBQU8sWUFBWSxrQkFBbUIsTUFBTSx5QkFBeUI7QUFBQSxJQUN0RSxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQztBQUVELFNBQVMsaUJBQWlCLGtCQUE0QyxLQUFxQjtBQUMxRixnQkFBYyxnQ0FBZ0MsS0FBSztBQUFBLElBQ2xELHNCQUFzQixDQUFDLE1BQWMsSUFBSSxTQUFTLENBQUM7QUFBQSxFQUNwRCxDQUFzRjtBQUN2RjsiLAogICJuYW1lcyI6IFsicmVzdWx0cyIsICJ1cmkiLCAiZXh0ZW5zaW9uIl0KfQo=
