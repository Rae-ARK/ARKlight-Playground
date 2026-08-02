import assert from "assert";
import { CancellationToken, CancellationTokenSource } from "../../../../../../../base/common/cancellation.js";
import { match } from "../../../../../../../base/common/glob.js";
import { Schemas } from "../../../../../../../base/common/network.js";
import { basename, relativePath } from "../../../../../../../base/common/resources.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { mock } from "../../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { IConfigurationService } from "../../../../../../../platform/configuration/common/configuration.js";
import { IFileService } from "../../../../../../../platform/files/common/files.js";
import { FileService } from "../../../../../../../platform/files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../../../../../platform/files/common/inMemoryFilesystemProvider.js";
import { TestInstantiationService } from "../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../../../../../platform/log/common/log.js";
import { IWorkspaceContextService } from "../../../../../../../platform/workspace/common/workspace.js";
import { IWorkbenchEnvironmentService } from "../../../../../../services/environment/common/environmentService.js";
import { ISearchService } from "../../../../../../services/search/common/search.js";
import { IUserDataProfileService } from "../../../../../../services/userDataProfile/common/userDataProfile.js";
import { IPathService } from "../../../../../../services/path/common/pathService.js";
import { PromptsConfig } from "../../../../common/promptSyntax/config/config.js";
import { getSourceDescription, PromptFileSource, PromptsType } from "../../../../common/promptSyntax/promptTypes.js";
import { hasGlobPattern, isValidGlob, isValidPromptFolderPath, PromptFilesLocator } from "../../../../common/promptSyntax/utils/promptFilesLocator.js";
import { mockFiles } from "../testUtils/mockFilesystem.js";
import { mockService } from "./mock.js";
import { TestUserDataProfileService, TestWorkspaceTrustManagementService } from "../../../../../../test/common/workbenchTestServices.js";
import { PromptsStorage } from "../../../../common/promptSyntax/service/promptsService.js";
import { runWithFakedTimers } from "../../../../../../../base/test/common/timeTravelScheduler.js";
import { IWorkspaceTrustManagementService } from "../../../../../../../platform/workspace/common/workspaceTrust.js";
function mockConfigService(configValues) {
  return mockService({
    getValue(key) {
      if (typeof key === "object") {
        return {};
      }
      if (typeof key !== "string") {
        assert.fail(`Unsupported configuration key '${key}'.`);
      }
      if (configValues.hasOwnProperty(key)) {
        return configValues[key];
      }
      assert.fail(`Unsupported configuration key '${key}'.`);
    }
  });
}
function mockWorkspaceService(folders) {
  return mockService({
    getWorkspace() {
      return new class extends mock() {
        constructor() {
          super(...arguments);
          this.folders = folders;
        }
      }();
    },
    getWorkspaceFolder() {
      return null;
    }
  });
}
function testT(name, fn) {
  return test(name, () => runWithFakedTimers({ useFakeTimers: true }, fn));
}
suite("PromptFilesLocator", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let fileService;
  const configValues = {};
  let workspaceTrustService;
  const setLocations = (value) => {
    configValues[PromptsConfig.PROMPT_LOCATIONS_KEY] = value;
    configValues[PromptsConfig.INSTRUCTIONS_LOCATION_KEY] = value;
    configValues[PromptsConfig.MODE_LOCATION_KEY] = value;
    configValues[PromptsConfig.SKILLS_LOCATION_KEY] = value;
  };
  const setWorkspaceFolders = (paths) => {
    const workspaceFolders = paths.map((path, index) => {
      const uri = URI.file(path);
      return new class extends mock() {
        constructor() {
          super(...arguments);
          this.uri = uri;
          this.name = basename(uri);
          this.index = index;
        }
      }();
    });
    instantiationService.stub(IWorkspaceContextService, mockWorkspaceService(workspaceFolders));
  };
  setup(async () => {
    instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(ILogService, new NullLogService());
    fileService = disposables.add(instantiationService.createInstance(FileService));
    const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
    instantiationService.stub(IFileService, fileService);
    workspaceTrustService = disposables.add(new TestWorkspaceTrustManagementService());
    instantiationService.stub(IWorkspaceTrustManagementService, workspaceTrustService);
    for (const key of Object.keys(configValues)) {
      delete configValues[key];
    }
    Object.assign(configValues, {
      "explorer.excludeGitIgnore": false,
      "files.exclude": {},
      "search.exclude": {},
      [PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS]: false
    });
    instantiationService.stub(IConfigurationService, mockConfigService(configValues));
    setWorkspaceFolders([]);
    instantiationService.stub(IWorkbenchEnvironmentService, {});
    instantiationService.stub(IUserDataProfileService, new TestUserDataProfileService());
    instantiationService.stub(ISearchService, {
      schemeHasFileSearchProvider(scheme) {
        return true;
      },
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
    instantiationService.stub(IPathService, {
      userHome(options) {
        const uri = URI.file("/Users/legomushroom");
        if (options?.preferLocal) {
          return uri;
        }
        return Promise.resolve(uri);
      }
    });
  });
  suite("empty workspace", () => {
    const EMPTY_WORKSPACE = [];
    suite("empty filesystem", () => {
      testT("no config value", async () => {
        setLocations(void 0);
        setWorkspaceFolders(EMPTY_WORKSPACE);
        await mockFiles(fileService, []);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        assertOutcome(
          await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
          [],
          "No prompts must be found."
        );
      });
      testT("object config value", async () => {
        setLocations({
          "/Users/legomushroom/repos/prompts/": true,
          "/tmp/prompts/": false
        });
        setWorkspaceFolders(EMPTY_WORKSPACE);
        await mockFiles(fileService, []);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        assertOutcome(
          await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
          [],
          "No prompts must be found."
        );
      });
      testT("array config value", async () => {
        setLocations([
          "relative/path/to/prompts/",
          "/abs/path"
        ]);
        setWorkspaceFolders(EMPTY_WORKSPACE);
        await mockFiles(fileService, []);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        assertOutcome(
          await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
          [],
          "No prompts must be found."
        );
      });
      testT("null config value", async () => {
        setLocations(null);
        setWorkspaceFolders(EMPTY_WORKSPACE);
        await mockFiles(fileService, []);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        assertOutcome(
          await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
          [],
          "No prompts must be found."
        );
      });
      testT("string config value", async () => {
        setLocations("/etc/hosts/prompts");
        setWorkspaceFolders(EMPTY_WORKSPACE);
        await mockFiles(fileService, []);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        assertOutcome(
          await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
          [],
          "No prompts must be found."
        );
      });
    });
    suite("non-empty filesystem", () => {
      testT("core logic", async () => {
        setLocations({
          "/Users/legomushroom/repos/prompts": true,
          "/tmp/prompts/": true,
          "/absolute/path/prompts": false,
          ".copilot/prompts": true
        });
        setWorkspaceFolders(EMPTY_WORKSPACE);
        await mockFiles(fileService, [
          {
            path: "/Users/legomushroom/repos/prompts/test.prompt.md",
            contents: ["Hello, World!"]
          },
          {
            path: "/Users/legomushroom/repos/prompts/refactor-tests.prompt.md",
            contents: ["some file content goes here"]
          },
          {
            path: "/tmp/prompts/translate.to-rust.prompt.md",
            contents: ["some more random file contents"]
          },
          {
            path: "/absolute/path/prompts/some-prompt-file.prompt.md",
            contents: ["hey hey hey"]
          }
        ]);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        assertOutcome(
          await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
          [
            "/Users/legomushroom/repos/prompts/test.prompt.md",
            "/Users/legomushroom/repos/prompts/refactor-tests.prompt.md",
            "/tmp/prompts/translate.to-rust.prompt.md"
          ],
          "Must find correct prompts."
        );
      });
      suite("absolute", () => {
        testT("wild card", async () => {
          const settings = [
            "/Users/legomushroom/repos/vscode/**",
            "/Users/legomushroom/repos/vscode/**/*.prompt.md",
            "/Users/legomushroom/repos/vscode/**/*.md",
            "/Users/legomushroom/repos/vscode/**/*",
            "/Users/legomushroom/repos/vscode/deps/**",
            "/Users/legomushroom/repos/vscode/deps/**/*.prompt.md",
            "/Users/legomushroom/repos/vscode/deps/**/*",
            "/Users/legomushroom/repos/vscode/deps/**/*.md",
            "/Users/legomushroom/repos/vscode/**/text/**",
            "/Users/legomushroom/repos/vscode/**/text/**/*",
            "/Users/legomushroom/repos/vscode/**/text/**/*.md",
            "/Users/legomushroom/repos/vscode/**/text/**/*.prompt.md",
            "/Users/legomushroom/repos/vscode/deps/text/**",
            "/Users/legomushroom/repos/vscode/deps/text/**/*",
            "/Users/legomushroom/repos/vscode/deps/text/**/*.md",
            "/Users/legomushroom/repos/vscode/deps/text/**/*.prompt.md"
          ];
          for (const setting of settings) {
            setLocations({ [setting]: true });
            setWorkspaceFolders(EMPTY_WORKSPACE);
            await mockFiles(fileService, [
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/my.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md",
                contents: ["oh hi, robot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md",
                contents: ["oh hi, rabot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/readme.md",
                contents: ["non prompt file"]
              }
            ]);
            const locator = instantiationService.createInstance(PromptFilesLocator);
            assertOutcome(
              await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
              [
                "/Users/legomushroom/repos/vscode/deps/text/my.prompt.md",
                "/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md",
                "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md",
                "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md"
              ],
              "Must find correct prompts."
            );
          }
        });
        testT(`specific`, async () => {
          const testSettings = [
            [
              "/Users/legomushroom/repos/vscode/**/*specific*"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/*specific*.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/*specific*.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/specific*",
              "/Users/legomushroom/repos/vscode/**/unspecific1.prompt.md",
              "/Users/legomushroom/repos/vscode/**/unspecific2.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/specific.prompt.md",
              "/Users/legomushroom/repos/vscode/**/unspecific*.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/nested/specific.prompt.md",
              "/Users/legomushroom/repos/vscode/**/nested/unspecific*.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/nested/*specific*"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/*spec*.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/*spec*"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/*spec*.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/deps/**/*spec*.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/text/**/*spec*.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/text/nested/*spec*"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/text/nested/*specific*"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/**/*specific*"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/**/specific*",
              "/Users/legomushroom/repos/vscode/deps/**/unspecific*.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/**/specific*.md",
              "/Users/legomushroom/repos/vscode/deps/**/unspecific*.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/**/specific.prompt.md",
              "/Users/legomushroom/repos/vscode/deps/**/unspecific1.prompt.md",
              "/Users/legomushroom/repos/vscode/deps/**/unspecific2.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/**/specific.prompt.md",
              "/Users/legomushroom/repos/vscode/deps/**/unspecific1*.md",
              "/Users/legomushroom/repos/vscode/deps/**/unspecific2*.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/text/**/*specific*"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/text/**/specific*",
              "/Users/legomushroom/repos/vscode/deps/text/**/unspecific*.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/text/**/specific*.md",
              "/Users/legomushroom/repos/vscode/deps/text/**/unspecific*.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/text/**/specific.prompt.md",
              "/Users/legomushroom/repos/vscode/deps/text/**/unspecific1.prompt.md",
              "/Users/legomushroom/repos/vscode/deps/text/**/unspecific2.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/text/**/specific.prompt.md",
              "/Users/legomushroom/repos/vscode/deps/text/**/unspecific1*.md",
              "/Users/legomushroom/repos/vscode/deps/text/**/unspecific2*.md"
            ]
          ];
          for (const settings of testSettings) {
            const vscodeSettings = {};
            for (const setting of settings) {
              vscodeSettings[setting] = true;
            }
            setLocations(vscodeSettings);
            setWorkspaceFolders(EMPTY_WORKSPACE);
            await mockFiles(fileService, [
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/my.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/default.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md",
                contents: ["oh hi, robot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md",
                contents: ["oh hi, rawbot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/readme.md",
                contents: ["non prompt file"]
              }
            ]);
            const locator = instantiationService.createInstance(PromptFilesLocator);
            assertOutcome(
              await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
              [
                "/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md",
                "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md",
                "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md"
              ],
              "Must find correct prompts."
            );
          }
        });
      });
    });
  });
  suite("single-root workspace", () => {
    suite("glob pattern", () => {
      suite("relative", () => {
        testT("wild card", async () => {
          const testSettings = [
            "**",
            "**/*.prompt.md",
            "**/*.md",
            "**/*",
            "deps/**",
            "deps/**/*.prompt.md",
            "deps/**/*",
            "deps/**/*.md",
            "**/text/**",
            "**/text/**/*",
            "**/text/**/*.md",
            "**/text/**/*.prompt.md",
            "deps/text/**",
            "deps/text/**/*",
            "deps/text/**/*.md",
            "deps/text/**/*.prompt.md"
          ];
          for (const setting of testSettings) {
            setLocations({ [setting]: true });
            setWorkspaceFolders(["/Users/legomushroom/repos/vscode"]);
            await mockFiles(fileService, [
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/my.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md",
                contents: ["oh hi, robot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md",
                contents: ["oh hi, rabot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/readme.md",
                contents: ["non prompt file"]
              }
            ]);
            const locator = instantiationService.createInstance(PromptFilesLocator);
            assertOutcome(
              await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
              [
                "/Users/legomushroom/repos/vscode/deps/text/my.prompt.md",
                "/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md",
                "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md",
                "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md"
              ],
              "Must find correct prompts."
            );
          }
        });
        testT(`specific`, async () => {
          const testSettings = [
            [
              "**/*specific*"
            ],
            [
              "**/*specific*.prompt.md"
            ],
            [
              "**/*specific*.md"
            ],
            [
              "**/specific*",
              "**/unspecific1.prompt.md",
              "**/unspecific2.prompt.md"
            ],
            [
              "**/specific.prompt.md",
              "**/unspecific*.prompt.md"
            ],
            [
              "**/nested/specific.prompt.md",
              "**/nested/unspecific*.prompt.md"
            ],
            [
              "**/nested/*specific*"
            ],
            [
              "**/*spec*.prompt.md"
            ],
            [
              "**/*spec*"
            ],
            [
              "**/*spec*.md"
            ],
            [
              "**/deps/**/*spec*.md"
            ],
            [
              "**/text/**/*spec*.md"
            ],
            [
              "deps/text/nested/*spec*"
            ],
            [
              "deps/text/nested/*specific*"
            ],
            [
              "deps/**/*specific*"
            ],
            [
              "deps/**/specific*",
              "deps/**/unspecific*.prompt.md"
            ],
            [
              "deps/**/specific*.md",
              "deps/**/unspecific*.md"
            ],
            [
              "deps/**/specific.prompt.md",
              "deps/**/unspecific1.prompt.md",
              "deps/**/unspecific2.prompt.md"
            ],
            [
              "deps/**/specific.prompt.md",
              "deps/**/unspecific1*.md",
              "deps/**/unspecific2*.md"
            ],
            [
              "deps/text/**/*specific*"
            ],
            [
              "deps/text/**/specific*",
              "deps/text/**/unspecific*.prompt.md"
            ],
            [
              "deps/text/**/specific*.md",
              "deps/text/**/unspecific*.md"
            ],
            [
              "deps/text/**/specific.prompt.md",
              "deps/text/**/unspecific1.prompt.md",
              "deps/text/**/unspecific2.prompt.md"
            ],
            [
              "deps/text/**/specific.prompt.md",
              "deps/text/**/unspecific1*.md",
              "deps/text/**/unspecific2*.md"
            ]
          ];
          for (const settings of testSettings) {
            const vscodeSettings = {};
            for (const setting of settings) {
              vscodeSettings[setting] = true;
            }
            setLocations(vscodeSettings);
            setWorkspaceFolders(["/Users/legomushroom/repos/vscode"]);
            await mockFiles(fileService, [
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/my.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/default.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md",
                contents: ["oh hi, robot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md",
                contents: ["oh hi, rawbot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/readme.md",
                contents: ["non prompt file"]
              }
            ]);
            const locator = instantiationService.createInstance(PromptFilesLocator);
            assertOutcome(
              await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
              [
                "/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md",
                "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md",
                "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md"
              ],
              "Must find correct prompts."
            );
          }
        });
      });
      suite("absolute", () => {
        testT("wild card", async () => {
          const settings = [
            "/Users/legomushroom/repos/vscode/**",
            "/Users/legomushroom/repos/vscode/**/*.prompt.md",
            "/Users/legomushroom/repos/vscode/**/*.md",
            "/Users/legomushroom/repos/vscode/**/*",
            "/Users/legomushroom/repos/vscode/deps/**",
            "/Users/legomushroom/repos/vscode/deps/**/*.prompt.md",
            "/Users/legomushroom/repos/vscode/deps/**/*",
            "/Users/legomushroom/repos/vscode/deps/**/*.md",
            "/Users/legomushroom/repos/vscode/**/text/**",
            "/Users/legomushroom/repos/vscode/**/text/**/*",
            "/Users/legomushroom/repos/vscode/**/text/**/*.md",
            "/Users/legomushroom/repos/vscode/**/text/**/*.prompt.md",
            "/Users/legomushroom/repos/vscode/deps/text/**",
            "/Users/legomushroom/repos/vscode/deps/text/**/*",
            "/Users/legomushroom/repos/vscode/deps/text/**/*.md",
            "/Users/legomushroom/repos/vscode/deps/text/**/*.prompt.md"
          ];
          for (const setting of settings) {
            setLocations({ [setting]: true });
            setWorkspaceFolders(["/Users/legomushroom/repos/vscode"]);
            await mockFiles(fileService, [
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/my.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md",
                contents: ["oh hi, robot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md",
                contents: ["oh hi, rabot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/readme.md",
                contents: ["non prompt file"]
              }
            ]);
            const locator = instantiationService.createInstance(PromptFilesLocator);
            assertOutcome(
              await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
              [
                "/Users/legomushroom/repos/vscode/deps/text/my.prompt.md",
                "/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md",
                "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md",
                "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md"
              ],
              "Must find correct prompts."
            );
          }
        });
        testT(`specific`, async () => {
          const testSettings = [
            [
              "/Users/legomushroom/repos/vscode/**/*specific*"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/*specific*.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/*specific*.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/specific*",
              "/Users/legomushroom/repos/vscode/**/unspecific1.prompt.md",
              "/Users/legomushroom/repos/vscode/**/unspecific2.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/specific.prompt.md",
              "/Users/legomushroom/repos/vscode/**/unspecific*.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/nested/specific.prompt.md",
              "/Users/legomushroom/repos/vscode/**/nested/unspecific*.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/nested/*specific*"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/*spec*.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/*spec*"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/*spec*.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/deps/**/*spec*.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/**/text/**/*spec*.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/text/nested/*spec*"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/text/nested/*specific*"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/**/*specific*"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/**/specific*",
              "/Users/legomushroom/repos/vscode/deps/**/unspecific*.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/**/specific*.md",
              "/Users/legomushroom/repos/vscode/deps/**/unspecific*.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/**/specific.prompt.md",
              "/Users/legomushroom/repos/vscode/deps/**/unspecific1.prompt.md",
              "/Users/legomushroom/repos/vscode/deps/**/unspecific2.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/**/specific.prompt.md",
              "/Users/legomushroom/repos/vscode/deps/**/unspecific1*.md",
              "/Users/legomushroom/repos/vscode/deps/**/unspecific2*.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/text/**/*specific*"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/text/**/specific*",
              "/Users/legomushroom/repos/vscode/deps/text/**/unspecific*.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/text/**/specific*.md",
              "/Users/legomushroom/repos/vscode/deps/text/**/unspecific*.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/text/**/specific.prompt.md",
              "/Users/legomushroom/repos/vscode/deps/text/**/unspecific1.prompt.md",
              "/Users/legomushroom/repos/vscode/deps/text/**/unspecific2.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/deps/text/**/specific.prompt.md",
              "/Users/legomushroom/repos/vscode/deps/text/**/unspecific1*.md",
              "/Users/legomushroom/repos/vscode/deps/text/**/unspecific2*.md"
            ]
          ];
          for (const settings of testSettings) {
            const vscodeSettings = {};
            for (const setting of settings) {
              vscodeSettings[setting] = true;
            }
            setLocations(vscodeSettings);
            setWorkspaceFolders(["/Users/legomushroom/repos/vscode"]);
            await mockFiles(fileService, [
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/my.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/default.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md",
                contents: ["oh hi, robot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md",
                contents: ["oh hi, rawbot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/deps/text/nested/readme.md",
                contents: ["non prompt file"]
              }
            ]);
            const locator = instantiationService.createInstance(PromptFilesLocator);
            assertOutcome(
              await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
              [
                "/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md",
                "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md",
                "/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md"
              ],
              "Must find correct prompts."
            );
          }
        });
      });
    });
  });
  testT("core logic", async () => {
    setLocations({
      "/Users/legomushroom/repos/prompts": true,
      "/tmp/prompts/": true,
      "/absolute/path/prompts": false,
      ".copilot/prompts": true
    });
    setWorkspaceFolders([
      "/Users/legomushroom/repos/vscode"
    ]);
    await mockFiles(fileService, [
      {
        path: "/Users/legomushroom/repos/prompts/test.prompt.md",
        contents: ["Hello, World!"]
      },
      {
        path: "/Users/legomushroom/repos/prompts/refactor-tests.prompt.md",
        contents: ["some file content goes here"]
      },
      {
        path: "/tmp/prompts/translate.to-rust.prompt.md",
        contents: ["some more random file contents"]
      },
      {
        path: "/absolute/path/prompts/some-prompt-file.prompt.md",
        contents: ["hey hey hey"]
      },
      {
        path: "/Users/legomushroom/repos/vscode/.copilot/prompts/default.prompt.md",
        contents: ["oh hi, robot!"]
      },
      {
        path: "/Users/legomushroom/repos/vscode/.github/prompts/my.prompt.md",
        contents: ["oh hi, bot!"]
      }
    ]);
    const locator = instantiationService.createInstance(PromptFilesLocator);
    assertOutcome(
      await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
      [
        "/Users/legomushroom/repos/vscode/.github/prompts/my.prompt.md",
        "/Users/legomushroom/repos/prompts/test.prompt.md",
        "/Users/legomushroom/repos/prompts/refactor-tests.prompt.md",
        "/tmp/prompts/translate.to-rust.prompt.md",
        "/Users/legomushroom/repos/vscode/.copilot/prompts/default.prompt.md"
      ],
      "Must find correct prompts."
    );
  });
  testT("with disabled `.github/prompts` location", async () => {
    setLocations({
      "/Users/legomushroom/repos/prompts": true,
      "/tmp/prompts/": true,
      "/absolute/path/prompts": false,
      ".copilot/prompts": true,
      ".github/prompts": false
    });
    setWorkspaceFolders([
      "/Users/legomushroom/repos/vscode"
    ]);
    await mockFiles(fileService, [
      {
        path: "/Users/legomushroom/repos/prompts/test.prompt.md",
        contents: ["Hello, World!"]
      },
      {
        path: "/Users/legomushroom/repos/prompts/refactor-tests.prompt.md",
        contents: ["some file content goes here"]
      },
      {
        path: "/tmp/prompts/translate.to-rust.prompt.md",
        contents: ["some more random file contents"]
      },
      {
        path: "/absolute/path/prompts/some-prompt-file.prompt.md",
        contents: ["hey hey hey"]
      },
      {
        path: "/Users/legomushroom/repos/vscode/.copilot/prompts/default.prompt.md",
        contents: ["oh hi, robot!"]
      },
      {
        path: "/Users/legomushroom/repos/vscode/.github/prompts/my.prompt.md",
        contents: ["oh hi, bot!"]
      },
      {
        path: "/Users/legomushroom/repos/vscode/.github/prompts/your.prompt.md",
        contents: ["oh hi, bot!"]
      }
    ]);
    const locator = instantiationService.createInstance(PromptFilesLocator);
    assertOutcome(
      await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
      [
        "/Users/legomushroom/repos/prompts/test.prompt.md",
        "/Users/legomushroom/repos/prompts/refactor-tests.prompt.md",
        "/tmp/prompts/translate.to-rust.prompt.md",
        "/Users/legomushroom/repos/vscode/.copilot/prompts/default.prompt.md"
      ],
      "Must find correct prompts."
    );
  });
  suite("multi-root workspace", () => {
    suite("core logic", () => {
      testT("without top-level `.github` folder", async () => {
        setLocations({
          "/Users/legomushroom/repos/prompts": true,
          "/tmp/prompts/": true,
          "/absolute/path/prompts": false,
          ".copilot/prompts": false
        });
        setWorkspaceFolders([
          "/Users/legomushroom/repos/vscode",
          "/Users/legomushroom/repos/node"
        ]);
        await mockFiles(fileService, [
          {
            path: "/Users/legomushroom/repos/prompts/test.prompt.md",
            contents: ["Hello, World!"]
          },
          {
            path: "/Users/legomushroom/repos/prompts/refactor-tests.prompt.md",
            contents: ["some file content goes here"]
          },
          {
            path: "/tmp/prompts/translate.to-rust.prompt.md",
            contents: ["some more random file contents"]
          },
          {
            path: "/absolute/path/prompts/some-prompt-file.prompt.md",
            contents: ["hey hey hey"]
          },
          {
            path: "/Users/legomushroom/repos/vscode/.copilot/prompts/prompt1.prompt.md",
            contents: ["oh hi, robot!"]
          },
          {
            path: "/Users/legomushroom/repos/vscode/.github/prompts/default.prompt.md",
            contents: ["oh hi, bot!"]
          },
          {
            path: "/Users/legomushroom/repos/node/.copilot/prompts/prompt5.prompt.md",
            contents: ["oh hi, robot!"]
          },
          {
            path: "/Users/legomushroom/repos/node/.github/prompts/refactor-static-classes.prompt.md",
            contents: ["file contents"]
          },
          {
            path: "/Users/legomushroom/repos/.github/prompts/prompt-name.prompt.md",
            contents: ["oh hi, robot!"]
          },
          {
            path: "/Users/legomushroom/repos/.github/prompts/name-of-the-prompt.prompt.md",
            contents: ["oh hi, raw bot!"]
          }
        ]);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        assertOutcome(
          await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
          [
            "/Users/legomushroom/repos/vscode/.github/prompts/default.prompt.md",
            "/Users/legomushroom/repos/node/.github/prompts/refactor-static-classes.prompt.md",
            "/Users/legomushroom/repos/prompts/test.prompt.md",
            "/Users/legomushroom/repos/prompts/refactor-tests.prompt.md",
            "/tmp/prompts/translate.to-rust.prompt.md"
          ],
          "Must find correct prompts."
        );
      });
      testT("with top-level `.github` folder", async () => {
        setLocations({
          "/Users/legomushroom/repos/prompts": true,
          "/tmp/prompts/": true,
          "/absolute/path/prompts": false,
          ".copilot/prompts": false
        });
        setWorkspaceFolders([
          "/Users/legomushroom/repos/vscode",
          "/Users/legomushroom/repos/node",
          "/var/shared/prompts"
        ]);
        await mockFiles(fileService, [
          {
            path: "/Users/legomushroom/repos/prompts/test.prompt.md",
            contents: ["Hello, World!"]
          },
          {
            path: "/Users/legomushroom/repos/prompts/refactor-tests.prompt.md",
            contents: ["some file content goes here"]
          },
          {
            path: "/tmp/prompts/translate.to-rust.prompt.md",
            contents: ["some more random file contents"]
          },
          {
            path: "/absolute/path/prompts/some-prompt-file.prompt.md",
            contents: ["hey hey hey"]
          },
          {
            path: "/Users/legomushroom/repos/vscode/.copilot/prompts/prompt1.prompt.md",
            contents: ["oh hi, robot!"]
          },
          {
            path: "/Users/legomushroom/repos/vscode/.github/prompts/default.prompt.md",
            contents: ["oh hi, bot!"]
          },
          {
            path: "/Users/legomushroom/repos/node/.copilot/prompts/prompt5.prompt.md",
            contents: ["oh hi, robot!"]
          },
          {
            path: "/Users/legomushroom/repos/node/.github/prompts/refactor-static-classes.prompt.md",
            contents: ["file contents"]
          },
          {
            path: "/var/shared/prompts/.github/prompts/prompt-name.prompt.md",
            contents: ["oh hi, robot!"]
          },
          {
            path: "/var/shared/prompts/.github/prompts/name-of-the-prompt.prompt.md",
            contents: ["oh hi, raw bot!"]
          }
        ]);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        assertOutcome(
          await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
          [
            "/Users/legomushroom/repos/vscode/.github/prompts/default.prompt.md",
            "/Users/legomushroom/repos/node/.github/prompts/refactor-static-classes.prompt.md",
            "/var/shared/prompts/.github/prompts/prompt-name.prompt.md",
            "/var/shared/prompts/.github/prompts/name-of-the-prompt.prompt.md",
            "/Users/legomushroom/repos/prompts/test.prompt.md",
            "/Users/legomushroom/repos/prompts/refactor-tests.prompt.md",
            "/tmp/prompts/translate.to-rust.prompt.md"
          ],
          "Must find correct prompts."
        );
      });
      testT("with disabled `.github/prompts` location", async () => {
        setLocations({
          "/Users/legomushroom/repos/prompts": true,
          "/tmp/prompts/": true,
          "/absolute/path/prompts": false,
          ".copilot/prompts": false,
          ".github/prompts": false
        });
        setWorkspaceFolders([
          "/Users/legomushroom/repos/vscode",
          "/Users/legomushroom/repos/node",
          "/var/shared/prompts"
        ]);
        await mockFiles(fileService, [
          {
            path: "/Users/legomushroom/repos/prompts/test.prompt.md",
            contents: ["Hello, World!"]
          },
          {
            path: "/Users/legomushroom/repos/prompts/refactor-tests.prompt.md",
            contents: ["some file content goes here"]
          },
          {
            path: "/tmp/prompts/translate.to-rust.prompt.md",
            contents: ["some more random file contents"]
          },
          {
            path: "/absolute/path/prompts/some-prompt-file.prompt.md",
            contents: ["hey hey hey"]
          },
          {
            path: "/Users/legomushroom/repos/vscode/.copilot/prompts/prompt1.prompt.md",
            contents: ["oh hi, robot!"]
          },
          {
            path: "/Users/legomushroom/repos/vscode/.github/prompts/default.prompt.md",
            contents: ["oh hi, bot!"]
          },
          {
            path: "/Users/legomushroom/repos/node/.copilot/prompts/prompt5.prompt.md",
            contents: ["oh hi, robot!"]
          },
          {
            path: "/Users/legomushroom/repos/node/.github/prompts/refactor-static-classes.prompt.md",
            contents: ["file contents"]
          },
          {
            path: "/var/shared/prompts/.github/prompts/prompt-name.prompt.md",
            contents: ["oh hi, robot!"]
          },
          {
            path: "/var/shared/prompts/.github/prompts/name-of-the-prompt.prompt.md",
            contents: ["oh hi, raw bot!"]
          }
        ]);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        assertOutcome(
          await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
          [
            "/Users/legomushroom/repos/prompts/test.prompt.md",
            "/Users/legomushroom/repos/prompts/refactor-tests.prompt.md",
            "/tmp/prompts/translate.to-rust.prompt.md"
          ],
          "Must find correct prompts."
        );
      });
      testT("mixed", async () => {
        setLocations({
          "/Users/legomushroom/repos/**/*test*": true,
          ".copilot/prompts": false,
          ".github/prompts": true,
          "/absolute/path/prompts/some-prompt-file.prompt.md": true
        });
        setWorkspaceFolders([
          "/Users/legomushroom/repos/vscode",
          "/Users/legomushroom/repos/node",
          "/var/shared/prompts"
        ]);
        await mockFiles(fileService, [
          {
            path: "/Users/legomushroom/repos/prompts/test.prompt.md",
            contents: ["Hello, World!"]
          },
          {
            path: "/Users/legomushroom/repos/prompts/refactor-tests.prompt.md",
            contents: ["some file content goes here"]
          },
          {
            path: "/Users/legomushroom/repos/prompts/elf.prompt.md",
            contents: ["haalo!"]
          },
          {
            path: "/tmp/prompts/translate.to-rust.prompt.md",
            contents: ["some more random file contents"]
          },
          {
            path: "/absolute/path/prompts/some-prompt-file.prompt.md",
            contents: ["hey hey hey"]
          },
          {
            path: "/Users/legomushroom/repos/vscode/.copilot/prompts/prompt1.prompt.md",
            contents: ["oh hi, robot!"]
          },
          {
            path: "/Users/legomushroom/repos/vscode/.github/prompts/default.prompt.md",
            contents: ["oh hi, bot!"]
          },
          {
            path: "/Users/legomushroom/repos/node/.copilot/prompts/prompt5.prompt.md",
            contents: ["oh hi, robot!"]
          },
          {
            path: "/Users/legomushroom/repos/node/.github/prompts/refactor-static-classes.prompt.md",
            contents: ["file contents"]
          },
          {
            path: "/var/shared/prompts/.github/prompts/prompt-name.prompt.md",
            contents: ["oh hi, robot!"]
          },
          {
            path: "/var/shared/prompts/.github/prompts/name-of-the-prompt.prompt.md",
            contents: ["oh hi, raw bot!"]
          }
        ]);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        assertOutcome(
          await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
          [
            // all of these are due to the `.github/prompts` setting
            "/Users/legomushroom/repos/vscode/.github/prompts/default.prompt.md",
            "/Users/legomushroom/repos/node/.github/prompts/refactor-static-classes.prompt.md",
            "/var/shared/prompts/.github/prompts/prompt-name.prompt.md",
            "/var/shared/prompts/.github/prompts/name-of-the-prompt.prompt.md",
            // all of these are due to the `/Users/legomushroom/repos/**/*test*` setting
            "/Users/legomushroom/repos/prompts/test.prompt.md",
            "/Users/legomushroom/repos/prompts/refactor-tests.prompt.md",
            // this one is due to the specific `/absolute/path/prompts/some-prompt-file.prompt.md` setting
            "/absolute/path/prompts/some-prompt-file.prompt.md"
          ],
          "Must find correct prompts."
        );
      });
    });
    suite("glob pattern", () => {
      suite("relative", () => {
        testT("wild card", async () => {
          const testSettings = [
            "**",
            "**/*.prompt.md",
            "**/*.md",
            "**/*",
            "gen*/**",
            "gen*/**/*.prompt.md",
            "gen*/**/*",
            "gen*/**/*.md",
            "**/gen*/**",
            "**/gen*/**/*",
            "**/gen*/**/*.md",
            "**/gen*/**/*.prompt.md",
            "{generic,general,gen}/**",
            "{generic,general,gen}/**/*.prompt.md",
            "{generic,general,gen}/**/*",
            "{generic,general,gen}/**/*.md",
            "**/{generic,general,gen}/**",
            "**/{generic,general,gen}/**/*",
            "**/{generic,general,gen}/**/*.md",
            "**/{generic,general,gen}/**/*.prompt.md"
          ];
          for (const setting of testSettings) {
            setLocations({ [setting]: true });
            setWorkspaceFolders([
              "/Users/legomushroom/repos/vscode",
              "/Users/legomushroom/repos/prompts"
            ]);
            await mockFiles(fileService, [
              {
                path: "/Users/legomushroom/repos/vscode/gen/text/my.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/gen/text/nested/specific.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/gen/text/nested/unspecific1.prompt.md",
                contents: ["oh hi, robot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/gen/text/nested/unspecific2.prompt.md",
                contents: ["oh hi, rabot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/gen/text/nested/readme.md",
                contents: ["non prompt file"]
              },
              {
                path: "/Users/legomushroom/repos/prompts/general/common.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/prompts/general/uncommon-10.prompt.md",
                contents: ["oh hi, robot!"]
              },
              {
                path: "/Users/legomushroom/repos/prompts/general/license.md",
                contents: ["non prompt file"]
              }
            ]);
            const locator = instantiationService.createInstance(PromptFilesLocator);
            assertOutcome(
              await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
              [
                "/Users/legomushroom/repos/vscode/gen/text/my.prompt.md",
                "/Users/legomushroom/repos/vscode/gen/text/nested/specific.prompt.md",
                "/Users/legomushroom/repos/vscode/gen/text/nested/unspecific1.prompt.md",
                "/Users/legomushroom/repos/vscode/gen/text/nested/unspecific2.prompt.md",
                // -
                "/Users/legomushroom/repos/prompts/general/common.prompt.md",
                "/Users/legomushroom/repos/prompts/general/uncommon-10.prompt.md"
              ],
              "Must find correct prompts."
            );
          }
        });
        testT(`specific`, async () => {
          const testSettings = [
            [
              "**/my.prompt.md",
              "**/*specific*",
              "**/*common*"
            ],
            [
              "**/my.prompt.md",
              "**/*specific*.prompt.md",
              "**/*common*.prompt.md"
            ],
            [
              "**/my*.md",
              "**/*specific*.md",
              "**/*common*.md"
            ],
            [
              "**/my*.md",
              "**/specific*",
              "**/unspecific*",
              "**/common*",
              "**/uncommon*"
            ],
            [
              "**/my.prompt.md",
              "**/specific.prompt.md",
              "**/unspecific1.prompt.md",
              "**/unspecific2.prompt.md",
              "**/common.prompt.md",
              "**/uncommon-10.prompt.md"
            ],
            [
              "gen*/**/my.prompt.md",
              "gen*/**/*specific*",
              "gen*/**/*common*"
            ],
            [
              "gen*/**/my.prompt.md",
              "gen*/**/*specific*.prompt.md",
              "gen*/**/*common*.prompt.md"
            ],
            [
              "gen*/**/my*.md",
              "gen*/**/*specific*.md",
              "gen*/**/*common*.md"
            ],
            [
              "gen*/**/my*.md",
              "gen*/**/specific*",
              "gen*/**/unspecific*",
              "gen*/**/common*",
              "gen*/**/uncommon*"
            ],
            [
              "gen*/**/my.prompt.md",
              "gen*/**/specific.prompt.md",
              "gen*/**/unspecific1.prompt.md",
              "gen*/**/unspecific2.prompt.md",
              "gen*/**/common.prompt.md",
              "gen*/**/uncommon-10.prompt.md"
            ],
            [
              "gen/text/my.prompt.md",
              "gen/text/nested/specific.prompt.md",
              "gen/text/nested/unspecific1.prompt.md",
              "gen/text/nested/unspecific2.prompt.md",
              "general/common.prompt.md",
              "general/uncommon-10.prompt.md"
            ],
            [
              "gen/text/my.prompt.md",
              "gen/text/nested/*specific*",
              "general/*common*"
            ],
            [
              "gen/text/my.prompt.md",
              "gen/text/**/specific.prompt.md",
              "gen/text/**/unspecific1.prompt.md",
              "gen/text/**/unspecific2.prompt.md",
              "general/*"
            ],
            [
              "{gen,general}/**/my.prompt.md",
              "{gen,general}/**/*specific*",
              "{gen,general}/**/*common*"
            ],
            [
              "{gen,general}/**/my.prompt.md",
              "{gen,general}/**/*specific*.prompt.md",
              "{gen,general}/**/*common*.prompt.md"
            ],
            [
              "{gen,general}/**/my*.md",
              "{gen,general}/**/*specific*.md",
              "{gen,general}/**/*common*.md"
            ],
            [
              "{gen,general}/**/my*.md",
              "{gen,general}/**/specific*",
              "{gen,general}/**/unspecific*",
              "{gen,general}/**/common*",
              "{gen,general}/**/uncommon*"
            ],
            [
              "{gen,general}/**/my.prompt.md",
              "{gen,general}/**/specific.prompt.md",
              "{gen,general}/**/unspecific1.prompt.md",
              "{gen,general}/**/unspecific2.prompt.md",
              "{gen,general}/**/common.prompt.md",
              "{gen,general}/**/uncommon-10.prompt.md"
            ]
          ];
          for (const settings of testSettings) {
            const vscodeSettings = {};
            for (const setting of settings) {
              vscodeSettings[setting] = true;
            }
            setLocations(vscodeSettings);
            setWorkspaceFolders([
              "/Users/legomushroom/repos/vscode",
              "/Users/legomushroom/repos/prompts"
            ]);
            await mockFiles(fileService, [
              {
                path: "/Users/legomushroom/repos/vscode/gen/text/my.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/gen/text/nested/specific.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/gen/text/nested/unspecific1.prompt.md",
                contents: ["oh hi, robot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/gen/text/nested/unspecific2.prompt.md",
                contents: ["oh hi, rabot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/gen/text/nested/readme.md",
                contents: ["non prompt file"]
              },
              {
                path: "/Users/legomushroom/repos/prompts/general/common.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/prompts/general/uncommon-10.prompt.md",
                contents: ["oh hi, robot!"]
              },
              {
                path: "/Users/legomushroom/repos/prompts/general/license.md",
                contents: ["non prompt file"]
              }
            ]);
            const locator = instantiationService.createInstance(PromptFilesLocator);
            assertOutcome(
              await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
              [
                "/Users/legomushroom/repos/vscode/gen/text/my.prompt.md",
                "/Users/legomushroom/repos/vscode/gen/text/nested/specific.prompt.md",
                "/Users/legomushroom/repos/vscode/gen/text/nested/unspecific1.prompt.md",
                "/Users/legomushroom/repos/vscode/gen/text/nested/unspecific2.prompt.md",
                // -
                "/Users/legomushroom/repos/prompts/general/common.prompt.md",
                "/Users/legomushroom/repos/prompts/general/uncommon-10.prompt.md"
              ],
              "Must find correct prompts."
            );
          }
        });
      });
      suite("absolute", () => {
        testT("wild card", async () => {
          const testSettings = [
            "/Users/legomushroom/repos/**",
            "/Users/legomushroom/repos/**/*.prompt.md",
            "/Users/legomushroom/repos/**/*.md",
            "/Users/legomushroom/repos/**/*",
            "/Users/legomushroom/repos/**/gen*/**",
            "/Users/legomushroom/repos/**/gen*/**/*.prompt.md",
            "/Users/legomushroom/repos/**/gen*/**/*",
            "/Users/legomushroom/repos/**/gen*/**/*.md",
            "/Users/legomushroom/repos/**/gen*/**",
            "/Users/legomushroom/repos/**/gen*/**/*",
            "/Users/legomushroom/repos/**/gen*/**/*.md",
            "/Users/legomushroom/repos/**/gen*/**/*.prompt.md",
            "/Users/legomushroom/repos/{vscode,prompts}/**",
            "/Users/legomushroom/repos/{vscode,prompts}/**/*.prompt.md",
            "/Users/legomushroom/repos/{vscode,prompts}/**/*.md",
            "/Users/legomushroom/repos/{vscode,prompts}/**/*",
            "/Users/legomushroom/repos/{vscode,prompts}/**/gen*/**",
            "/Users/legomushroom/repos/{vscode,prompts}/**/gen*/**/*.prompt.md",
            "/Users/legomushroom/repos/{vscode,prompts}/**/gen*/**/*",
            "/Users/legomushroom/repos/{vscode,prompts}/**/gen*/**/*.md",
            "/Users/legomushroom/repos/{vscode,prompts}/**/gen*/**",
            "/Users/legomushroom/repos/{vscode,prompts}/**/gen*/**/*",
            "/Users/legomushroom/repos/{vscode,prompts}/**/gen*/**/*.md",
            "/Users/legomushroom/repos/{vscode,prompts}/**/gen*/**/*.prompt.md",
            "/Users/legomushroom/repos/{vscode,prompts}/**/{general,gen}/**",
            "/Users/legomushroom/repos/{vscode,prompts}/**/{general,gen}/**/*.prompt.md",
            "/Users/legomushroom/repos/{vscode,prompts}/**/{general,gen}/**/*",
            "/Users/legomushroom/repos/{vscode,prompts}/**/{general,gen}/**/*.md",
            "/Users/legomushroom/repos/{vscode,prompts}/**/{general,gen}/**",
            "/Users/legomushroom/repos/{vscode,prompts}/**/{general,gen}/**/*",
            "/Users/legomushroom/repos/{vscode,prompts}/**/{general,gen}/**/*.md",
            "/Users/legomushroom/repos/{vscode,prompts}/**/{general,gen}/**/*.prompt.md"
          ];
          for (const setting of testSettings) {
            setLocations({ [setting]: true });
            setWorkspaceFolders([
              "/Users/legomushroom/repos/vscode",
              "/Users/legomushroom/repos/prompts"
            ]);
            await mockFiles(fileService, [
              {
                path: "/Users/legomushroom/repos/vscode/gen/text/my.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/gen/text/nested/specific.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/gen/text/nested/unspecific1.prompt.md",
                contents: ["oh hi, robot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/gen/text/nested/unspecific2.prompt.md",
                contents: ["oh hi, rabot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/gen/text/nested/readme.md",
                contents: ["non prompt file"]
              },
              {
                path: "/Users/legomushroom/repos/prompts/general/common.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/prompts/general/uncommon-10.prompt.md",
                contents: ["oh hi, robot!"]
              },
              {
                path: "/Users/legomushroom/repos/prompts/general/license.md",
                contents: ["non prompt file"]
              }
            ]);
            const locator = instantiationService.createInstance(PromptFilesLocator);
            assertOutcome(
              await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
              [
                "/Users/legomushroom/repos/vscode/gen/text/my.prompt.md",
                "/Users/legomushroom/repos/vscode/gen/text/nested/specific.prompt.md",
                "/Users/legomushroom/repos/vscode/gen/text/nested/unspecific1.prompt.md",
                "/Users/legomushroom/repos/vscode/gen/text/nested/unspecific2.prompt.md",
                // -
                "/Users/legomushroom/repos/prompts/general/common.prompt.md",
                "/Users/legomushroom/repos/prompts/general/uncommon-10.prompt.md"
              ],
              "Must find correct prompts."
            );
          }
        });
        testT(`specific`, async () => {
          const testSettings = [
            [
              "/Users/legomushroom/repos/**/my.prompt.md",
              "/Users/legomushroom/repos/**/*specific*",
              "/Users/legomushroom/repos/**/*common*"
            ],
            [
              "/Users/legomushroom/repos/**/my.prompt.md",
              "/Users/legomushroom/repos/**/*specific*.prompt.md",
              "/Users/legomushroom/repos/**/*common*.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/**/my*.md",
              "/Users/legomushroom/repos/**/*specific*.md",
              "/Users/legomushroom/repos/**/*common*.md"
            ],
            [
              "/Users/legomushroom/repos/**/my*.md",
              "/Users/legomushroom/repos/**/specific*",
              "/Users/legomushroom/repos/**/unspecific*",
              "/Users/legomushroom/repos/**/common*",
              "/Users/legomushroom/repos/**/uncommon*"
            ],
            [
              "/Users/legomushroom/repos/**/my.prompt.md",
              "/Users/legomushroom/repos/**/specific.prompt.md",
              "/Users/legomushroom/repos/**/unspecific1.prompt.md",
              "/Users/legomushroom/repos/**/unspecific2.prompt.md",
              "/Users/legomushroom/repos/**/common.prompt.md",
              "/Users/legomushroom/repos/**/uncommon-10.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/**/gen*/**/my.prompt.md",
              "/Users/legomushroom/repos/**/gen*/**/*specific*",
              "/Users/legomushroom/repos/**/gen*/**/*common*"
            ],
            [
              "/Users/legomushroom/repos/**/gen*/**/my.prompt.md",
              "/Users/legomushroom/repos/**/gen*/**/*specific*.prompt.md",
              "/Users/legomushroom/repos/**/gen*/**/*common*.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/**/gen*/**/my*.md",
              "/Users/legomushroom/repos/**/gen*/**/*specific*.md",
              "/Users/legomushroom/repos/**/gen*/**/*common*.md"
            ],
            [
              "/Users/legomushroom/repos/**/gen*/**/my*.md",
              "/Users/legomushroom/repos/**/gen*/**/specific*",
              "/Users/legomushroom/repos/**/gen*/**/unspecific*",
              "/Users/legomushroom/repos/**/gen*/**/common*",
              "/Users/legomushroom/repos/**/gen*/**/uncommon*"
            ],
            [
              "/Users/legomushroom/repos/**/gen*/**/my.prompt.md",
              "/Users/legomushroom/repos/**/gen*/**/specific.prompt.md",
              "/Users/legomushroom/repos/**/gen*/**/unspecific1.prompt.md",
              "/Users/legomushroom/repos/**/gen*/**/unspecific2.prompt.md",
              "/Users/legomushroom/repos/**/gen*/**/common.prompt.md",
              "/Users/legomushroom/repos/**/gen*/**/uncommon-10.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/gen/text/my.prompt.md",
              "/Users/legomushroom/repos/vscode/gen/text/nested/specific.prompt.md",
              "/Users/legomushroom/repos/vscode/gen/text/nested/unspecific1.prompt.md",
              "/Users/legomushroom/repos/vscode/gen/text/nested/unspecific2.prompt.md",
              "/Users/legomushroom/repos/prompts/general/common.prompt.md",
              "/Users/legomushroom/repos/prompts/general/uncommon-10.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/vscode/gen/text/my.prompt.md",
              "/Users/legomushroom/repos/vscode/gen/text/nested/*specific*",
              "/Users/legomushroom/repos/prompts/general/*common*"
            ],
            [
              "/Users/legomushroom/repos/vscode/gen/text/my.prompt.md",
              "/Users/legomushroom/repos/vscode/gen/text/**/specific.prompt.md",
              "/Users/legomushroom/repos/vscode/gen/text/**/unspecific1.prompt.md",
              "/Users/legomushroom/repos/vscode/gen/text/**/unspecific2.prompt.md",
              "/Users/legomushroom/repos/prompts/general/*"
            ],
            [
              "/Users/legomushroom/repos/**/{gen,general}/**/my.prompt.md",
              "/Users/legomushroom/repos/**/{gen,general}/**/*specific*",
              "/Users/legomushroom/repos/**/{gen,general}/**/*common*"
            ],
            [
              "/Users/legomushroom/repos/**/{gen,general}/**/my.prompt.md",
              "/Users/legomushroom/repos/**/{gen,general}/**/*specific*.prompt.md",
              "/Users/legomushroom/repos/**/{gen,general}/**/*common*.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/**/{gen,general}/**/my*.md",
              "/Users/legomushroom/repos/**/{gen,general}/**/*specific*.md",
              "/Users/legomushroom/repos/**/{gen,general}/**/*common*.md"
            ],
            [
              "/Users/legomushroom/repos/**/{gen,general}/**/my*.md",
              "/Users/legomushroom/repos/**/{gen,general}/**/specific*",
              "/Users/legomushroom/repos/**/{gen,general}/**/unspecific*",
              "/Users/legomushroom/repos/**/{gen,general}/**/common*",
              "/Users/legomushroom/repos/**/{gen,general}/**/uncommon*"
            ],
            [
              "/Users/legomushroom/repos/**/{gen,general}/**/my.prompt.md",
              "/Users/legomushroom/repos/**/{gen,general}/**/specific.prompt.md",
              "/Users/legomushroom/repos/**/{gen,general}/**/unspecific1.prompt.md",
              "/Users/legomushroom/repos/**/{gen,general}/**/unspecific2.prompt.md",
              "/Users/legomushroom/repos/**/{gen,general}/**/common.prompt.md",
              "/Users/legomushroom/repos/**/{gen,general}/**/uncommon-10.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/my.prompt.md",
              "/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/*specific*",
              "/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/*common*"
            ],
            [
              "/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/my.prompt.md",
              "/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/*specific*.prompt.md",
              "/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/*common*.prompt.md"
            ],
            [
              "/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/my*.md",
              "/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/*specific*.md",
              "/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/*common*.md"
            ],
            [
              "/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/my*.md",
              "/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/specific*",
              "/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/unspecific*",
              "/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/common*",
              "/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/uncommon*"
            ],
            [
              "/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/my.prompt.md",
              "/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/specific.prompt.md",
              "/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/unspecific1.prompt.md",
              "/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/unspecific2.prompt.md",
              "/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/common.prompt.md",
              "/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/uncommon-10.prompt.md"
            ]
          ];
          for (const settings of testSettings) {
            const vscodeSettings = {};
            for (const setting of settings) {
              vscodeSettings[setting] = true;
            }
            setLocations(vscodeSettings);
            setWorkspaceFolders([
              "/Users/legomushroom/repos/vscode",
              "/Users/legomushroom/repos/prompts"
            ]);
            await mockFiles(fileService, [
              {
                path: "/Users/legomushroom/repos/vscode/gen/text/my.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/gen/text/nested/specific.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/gen/text/nested/unspecific1.prompt.md",
                contents: ["oh hi, robot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/gen/text/nested/unspecific2.prompt.md",
                contents: ["oh hi, rabot!"]
              },
              {
                path: "/Users/legomushroom/repos/vscode/gen/text/nested/readme.md",
                contents: ["non prompt file"]
              },
              {
                path: "/Users/legomushroom/repos/prompts/general/common.prompt.md",
                contents: ["oh hi, bot!"]
              },
              {
                path: "/Users/legomushroom/repos/prompts/general/uncommon-10.prompt.md",
                contents: ["oh hi, robot!"]
              },
              {
                path: "/Users/legomushroom/repos/prompts/general/license.md",
                contents: ["non prompt file"]
              }
            ]);
            const locator = instantiationService.createInstance(PromptFilesLocator);
            assertOutcome(
              await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
              [
                "/Users/legomushroom/repos/vscode/gen/text/my.prompt.md",
                "/Users/legomushroom/repos/vscode/gen/text/nested/specific.prompt.md",
                "/Users/legomushroom/repos/vscode/gen/text/nested/unspecific1.prompt.md",
                "/Users/legomushroom/repos/vscode/gen/text/nested/unspecific2.prompt.md",
                // -
                "/Users/legomushroom/repos/prompts/general/common.prompt.md",
                "/Users/legomushroom/repos/prompts/general/uncommon-10.prompt.md"
              ],
              "Must find correct prompts."
            );
          }
        });
      });
    });
  });
  suite("instructions", () => {
    testT("finds instructions files in subdirectories of .github/instructions", async () => {
      setLocations({
        ".github/instructions": true,
        ".claude/rules": false,
        "~/.copilot/instructions": false
      });
      setWorkspaceFolders(["/Users/legomushroom/repos/vscode"]);
      await mockFiles(fileService, [
        {
          path: "/Users/legomushroom/repos/vscode/.github/instructions/root.instructions.md",
          contents: ["root instructions"]
        },
        {
          path: "/Users/legomushroom/repos/vscode/.github/instructions/frontend/react.instructions.md",
          contents: ["react instructions"]
        },
        {
          path: "/Users/legomushroom/repos/vscode/.github/instructions/frontend/css.instructions.md",
          contents: ["css instructions"]
        },
        {
          path: "/Users/legomushroom/repos/vscode/.github/instructions/backend/api.instructions.md",
          contents: ["api instructions"]
        }
      ]);
      const locator = instantiationService.createInstance(PromptFilesLocator);
      assertOutcome(
        await locator.listFiles(PromptsType.instructions, PromptsStorage.local, CancellationToken.None),
        [
          "/Users/legomushroom/repos/vscode/.github/instructions/root.instructions.md",
          "/Users/legomushroom/repos/vscode/.github/instructions/frontend/react.instructions.md",
          "/Users/legomushroom/repos/vscode/.github/instructions/frontend/css.instructions.md",
          "/Users/legomushroom/repos/vscode/.github/instructions/backend/api.instructions.md"
        ],
        "Must find instructions files recursively in subdirectories of .github/instructions."
      );
    });
  });
  suite("skills", () => {
    suite("findAgentSkills", () => {
      testT("finds skill files in configured locations", async () => {
        setLocations({
          ".claude/skills": true,
          // disable other defaults
          ".github/skills": false,
          "~/.copilot/skills": false,
          "~/.claude/skills": false
        });
        setWorkspaceFolders(["/Users/legomushroom/repos/vscode"]);
        await mockFiles(fileService, [
          {
            path: "/Users/legomushroom/repos/vscode/.claude/skills/pptx/SKILL.md",
            contents: ["# PPTX Skill"]
          },
          {
            path: "/Users/legomushroom/repos/vscode/.claude/skills/excel/SKILL.md",
            contents: ["# Excel Skill"]
          }
        ]);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        const skills = await locator.findAgentSkills(CancellationToken.None);
        assertOutcome(
          skills.map((s) => s.uri),
          [
            "/Users/legomushroom/repos/vscode/.claude/skills/pptx/SKILL.md",
            "/Users/legomushroom/repos/vscode/.claude/skills/excel/SKILL.md"
          ],
          "Must find skill files."
        );
      });
      testT("ignores folders without SKILL.md", async () => {
        setLocations({
          ".claude/skills": true,
          // disable other defaults
          ".github/skills": false,
          "~/.copilot/skills": false,
          "~/.claude/skills": false
        });
        setWorkspaceFolders(["/Users/legomushroom/repos/vscode"]);
        await mockFiles(fileService, [
          {
            path: "/Users/legomushroom/repos/vscode/.claude/skills/valid-skill/SKILL.md",
            contents: ["# Valid Skill"]
          },
          {
            path: "/Users/legomushroom/repos/vscode/.claude/skills/invalid-skill/readme.md",
            contents: ["Not a skill file"]
          },
          {
            path: "/Users/legomushroom/repos/vscode/.claude/skills/another-invalid/index.js",
            contents: ['console.log("not a skill")']
          }
        ]);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        const skills = await locator.findAgentSkills(CancellationToken.None);
        assertOutcome(
          skills.map((s) => s.uri),
          [
            "/Users/legomushroom/repos/vscode/.claude/skills/valid-skill/SKILL.md"
          ],
          "Must only find folders with SKILL.md."
        );
      });
      testT("returns empty array when no skills exist", async () => {
        setLocations({
          ".claude/skills": true,
          // disable other defaults
          ".github/skills": false,
          "~/.copilot/skills": false,
          "~/.claude/skills": false
        });
        setWorkspaceFolders(["/Users/legomushroom/repos/vscode"]);
        await mockFiles(fileService, []);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        const skills = await locator.findAgentSkills(CancellationToken.None);
        assertOutcome(
          skills.map((s) => s.uri),
          [],
          "Must return empty array when no skills exist."
        );
      });
      testT("returns empty array when skill folder does not exist", async () => {
        setLocations({
          ".claude/skills": true,
          // disable other defaults
          ".github/skills": false,
          "~/.copilot/skills": false,
          "~/.claude/skills": false
        });
        setWorkspaceFolders(["/Users/legomushroom/repos/vscode"]);
        await mockFiles(fileService, []);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        const skills = await locator.findAgentSkills(CancellationToken.None);
        assertOutcome(
          skills.map((s) => s.uri),
          [],
          "Must return empty array when folder does not exist."
        );
      });
      testT("finds skills across multiple workspace folders", async () => {
        setLocations({
          ".claude/skills": true,
          // disable other defaults
          ".github/skills": false,
          "~/.copilot/skills": false,
          "~/.claude/skills": false
        });
        setWorkspaceFolders([
          "/Users/legomushroom/repos/vscode",
          "/Users/legomushroom/repos/node"
        ]);
        await mockFiles(fileService, [
          {
            path: "/Users/legomushroom/repos/vscode/.claude/skills/skill-a/SKILL.md",
            contents: ["# Skill A"]
          },
          {
            path: "/Users/legomushroom/repos/node/.claude/skills/skill-b/SKILL.md",
            contents: ["# Skill B"]
          }
        ]);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        const skills = await locator.findAgentSkills(CancellationToken.None);
        assertOutcome(
          skills.map((s) => s.uri),
          [
            "/Users/legomushroom/repos/vscode/.claude/skills/skill-a/SKILL.md",
            "/Users/legomushroom/repos/node/.claude/skills/skill-b/SKILL.md"
          ],
          "Must find skills across all workspace folders."
        );
      });
    });
    suite("listFiles with PromptsType.skill", () => {
      testT("does not list skills when location is disabled", async () => {
        setLocations({
          ".claude/skills": false,
          // disable other defaults
          ".github/skills": false,
          "~/.copilot/skills": false,
          "~/.claude/skills": false
        });
        setWorkspaceFolders(["/Users/legomushroom/repos/vscode"]);
        await mockFiles(fileService, [
          {
            path: "/Users/legomushroom/repos/vscode/.claude/skills/pptx/SKILL.md",
            contents: ["# PPTX Skill"]
          }
        ]);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        const files = await locator.listFiles(PromptsType.skill, PromptsStorage.local, CancellationToken.None);
        assertOutcome(
          files,
          [],
          "Must not list skills when location is disabled."
        );
      });
    });
    suite("toAbsoluteLocationsForSkills path validation", () => {
      testT("rejects glob patterns in skill paths via getConfigBasedSourceFolders", async () => {
        setLocations({
          "skills/**": true,
          "skills/*": true,
          "**/skills": true,
          // disable defaults
          ".github/skills": false,
          ".agents/skills": false,
          ".claude/skills": false,
          "~/.copilot/skills": false,
          "~/.agents/skills": false,
          "~/.claude/skills": false
        });
        setWorkspaceFolders(["/Users/legomushroom/repos/vscode"]);
        await mockFiles(fileService, []);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        const folders = await locator.getConfigBasedSourceFolders(PromptsType.skill);
        assertOutcome(
          folders,
          [],
          "Must reject glob patterns in skill paths."
        );
      });
      testT("rejects absolute paths in skill paths via getConfigBasedSourceFolders", async () => {
        setLocations({
          "/absolute/path/skills": true,
          // disable defaults
          ".github/skills": false,
          ".agents/skills": false,
          ".claude/skills": false,
          "~/.copilot/skills": false,
          "~/.agents/skills": false,
          "~/.claude/skills": false
        });
        setWorkspaceFolders(["/Users/legomushroom/repos/vscode"]);
        await mockFiles(fileService, []);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        const folders = await locator.getConfigBasedSourceFolders(PromptsType.skill);
        assertOutcome(
          folders,
          [],
          "Must reject absolute paths in skill paths."
        );
      });
      testT("accepts relative paths in skill paths via getConfigBasedSourceFolders", async () => {
        setLocations({
          "./my-skills": true,
          "custom/skills": true,
          // disable defaults
          ".github/skills": false,
          ".agents/skills": false,
          ".claude/skills": false,
          "~/.copilot/skills": false,
          "~/.agents/skills": false,
          "~/.claude/skills": false
        });
        setWorkspaceFolders(["/Users/legomushroom/repos/vscode"]);
        await mockFiles(fileService, []);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        const folders = await locator.getConfigBasedSourceFolders(PromptsType.skill);
        assertOutcome(
          folders,
          [
            "/Users/legomushroom/repos/vscode/my-skills",
            "/Users/legomushroom/repos/vscode/custom/skills"
          ],
          "Must accept relative paths in skill paths."
        );
      });
      testT("accepts parent relative paths for monorepos via getConfigBasedSourceFolders", async () => {
        setLocations({
          "../shared-skills": true,
          // disable defaults
          ".github/skills": false,
          ".agents/skills": false,
          ".claude/skills": false,
          "~/.copilot/skills": false,
          "~/.agents/skills": false,
          "~/.claude/skills": false
        });
        setWorkspaceFolders(["/Users/legomushroom/repos/vscode"]);
        await mockFiles(fileService, []);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        const folders = await locator.getConfigBasedSourceFolders(PromptsType.skill);
        assertOutcome(
          folders,
          [
            "/Users/legomushroom/repos/shared-skills"
          ],
          "Must accept parent relative paths for monorepos."
        );
      });
      testT("accepts tilde paths for user home skills", async () => {
        setLocations({
          "~/my-skills": true,
          // disable defaults
          ".github/skills": false,
          ".agents/skills": false,
          ".claude/skills": false,
          "~/.copilot/skills": false,
          "~/.agents/skills": false,
          "~/.claude/skills": false
        });
        setWorkspaceFolders(["/Users/legomushroom/repos/vscode"]);
        await mockFiles(fileService, []);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        const folders = await locator.getConfigBasedSourceFolders(PromptsType.skill);
        assertOutcome(
          folders,
          [
            "/Users/legomushroom/my-skills"
          ],
          "Must accept tilde paths for user home skills."
        );
      });
    });
    suite("getConfigBasedSourceFolders for skills", () => {
      testT("returns source folders without glob processing", async () => {
        setLocations({
          ".claude/skills": true,
          "custom-skills": true,
          // explicitly disable other defaults we don't want for this test
          ".github/skills": false,
          ".agents/skills": false,
          "~/.copilot/skills": false,
          "~/.agents/skills": false,
          "~/.claude/skills": false
        });
        setWorkspaceFolders([
          "/Users/legomushroom/repos/vscode",
          "/Users/legomushroom/repos/node"
        ]);
        await mockFiles(fileService, []);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        const folders = await locator.getConfigBasedSourceFolders(PromptsType.skill);
        assertOutcome(
          folders,
          [
            "/Users/legomushroom/repos/vscode/.claude/skills",
            "/Users/legomushroom/repos/node/.claude/skills",
            "/Users/legomushroom/repos/vscode/custom-skills",
            "/Users/legomushroom/repos/node/custom-skills"
          ],
          "Must return skill source folders without glob processing."
        );
      });
      testT("filters out invalid skill paths from source folders", async () => {
        setLocations({
          ".claude/skills": true,
          "skills/**": true,
          // glob - should be filtered out
          "/absolute/skills": true,
          // absolute - should be filtered out
          // explicitly disable other defaults we don't want for this test
          ".github/skills": false,
          ".agents/skills": false,
          "~/.copilot/skills": false,
          "~/.agents/skills": false,
          "~/.claude/skills": false
        });
        setWorkspaceFolders(["/Users/legomushroom/repos/vscode"]);
        await mockFiles(fileService, []);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        const folders = await locator.getConfigBasedSourceFolders(PromptsType.skill);
        assertOutcome(
          folders,
          [
            "/Users/legomushroom/repos/vscode/.claude/skills"
          ],
          "Must filter out invalid skill paths."
        );
      });
      testT("includes default skill source folders from defaults", async () => {
        setLocations({
          "custom-skills": true
        });
        setWorkspaceFolders(["/Users/legomushroom/repos/vscode"]);
        await mockFiles(fileService, []);
        const locator = instantiationService.createInstance(PromptFilesLocator);
        const folders = await locator.getConfigBasedSourceFolders(PromptsType.skill);
        assertOutcome(
          folders,
          [
            // defaults
            "/Users/legomushroom/repos/vscode/.agents/skills",
            "/Users/legomushroom/repos/vscode/.github/skills",
            "/Users/legomushroom/repos/vscode/.claude/skills",
            "/Users/legomushroom/.agents/skills",
            "/Users/legomushroom/.copilot/skills",
            "/Users/legomushroom/.claude/skills",
            // custom
            "/Users/legomushroom/repos/vscode/custom-skills"
          ],
          "Must include default skill source folders."
        );
      });
    });
  });
  suite("isValidGlob", () => {
    testT("valid patterns", async () => {
      const globs = [
        "**",
        "*",
        "**",
        "**/*",
        "**/*.prompt.md",
        "/Users/legomushroom/**/*.prompt.md",
        "/Users/legomushroom/*.prompt.md",
        "/Users/legomushroom/*",
        "/Users/legomushroom/repos/{repo1,test}",
        "/Users/legomushroom/repos/{repo1,test}/**",
        "/Users/legomushroom/repos/{repo1,test}/*",
        "/Users/legomushroom/**/{repo1,test}/**",
        "/Users/legomushroom/**/{repo1,test}",
        "/Users/legomushroom/**/{repo1,test}/*",
        "/Users/legomushroom/**/repo[1,2,3]",
        "/Users/legomushroom/**/repo[1,2,3]/**",
        "/Users/legomushroom/**/repo[1,2,3]/*",
        "/Users/legomushroom/**/repo[1,2,3]/**/*.prompt.md",
        "repo[1,2,3]/**/*.prompt.md",
        "repo[[1,2,3]/**/*.prompt.md",
        "{repo1,test}/*.prompt.md",
        "{repo1,test}/*",
        "/{repo1,test}/*",
        "/{repo1,test}}/*"
      ];
      for (const glob of globs) {
        assert(
          isValidGlob(glob) === true,
          `'${glob}' must be a 'valid' glob pattern.`
        );
      }
    });
    testT("invalid patterns", async () => {
      const globs = [
        ".",
        "\\*",
        "\\?",
        "\\*\\?\\*",
        "repo[1,2,3",
        "repo1,2,3]",
        "repo\\[1,2,3]",
        "repo[1,2,3\\]",
        "repo\\[1,2,3\\]",
        "{repo1,repo2",
        "repo1,repo2}",
        "\\{repo1,repo2}",
        "{repo1,repo2\\}",
        "\\{repo1,repo2\\}",
        "/Users/legomushroom/repos",
        "/Users/legomushroom/repo[1,2,3",
        "/Users/legomushroom/repo1,2,3]",
        "/Users/legomushroom/repo\\[1,2,3]",
        "/Users/legomushroom/repo[1,2,3\\]",
        "/Users/legomushroom/repo\\[1,2,3\\]",
        "/Users/legomushroom/{repo1,repo2",
        "/Users/legomushroom/repo1,repo2}",
        "/Users/legomushroom/\\{repo1,repo2}",
        "/Users/legomushroom/{repo1,repo2\\}",
        "/Users/legomushroom/\\{repo1,repo2\\}"
      ];
      for (const glob of globs) {
        assert(
          isValidGlob(glob) === false,
          `'${glob}' must be an 'invalid' glob pattern.`
        );
      }
    });
  });
  suite("isValidSkillPath", () => {
    testT("accepts relative paths", async () => {
      const validPaths = [
        "someFolder",
        "./someFolder",
        "my-skills",
        "./my-skills",
        "folder/subfolder",
        "./folder/subfolder"
      ];
      for (const path of validPaths) {
        assert.strictEqual(
          isValidPromptFolderPath(path),
          true,
          `'${path}' must be accepted as a valid skill path (relative path).`
        );
      }
    });
    testT("accepts user home paths", async () => {
      const validPaths = [
        "~/folder",
        "~/.copilot/skills",
        "~/.claude/skills",
        "~/my-skills"
      ];
      for (const path of validPaths) {
        assert.strictEqual(
          isValidPromptFolderPath(path),
          true,
          `'${path}' must be accepted as a valid skill path (user home path).`
        );
      }
    });
    testT("accepts parent relative paths for monorepos", async () => {
      const validPaths = [
        "../folder",
        "../shared-skills",
        "../../common/skills",
        "../parent/folder"
      ];
      for (const path of validPaths) {
        assert.strictEqual(
          isValidPromptFolderPath(path),
          true,
          `'${path}' must be accepted as a valid skill path (parent relative path).`
        );
      }
    });
    testT("rejects absolute paths", async () => {
      const invalidPaths = [
        // Unix absolute paths
        "/Users/username/skills",
        "/absolute/path",
        "/usr/local/skills",
        // Windows absolute paths
        "C:\\Users\\skills",
        "D:/skills",
        "c:\\folder"
      ];
      for (const path of invalidPaths) {
        assert.strictEqual(
          isValidPromptFolderPath(path),
          false,
          `'${path}' must be rejected (absolute paths not supported for portability).`
        );
      }
    });
    testT("rejects tilde paths without path separator", async () => {
      const invalidPaths = [
        "~abc",
        "~skills",
        "~.config",
        // Windows-style backslash paths are not supported for cross-platform sharing
        "~\\folder",
        "~\\.copilot\\skills"
      ];
      for (const path of invalidPaths) {
        assert.strictEqual(
          isValidPromptFolderPath(path),
          false,
          `'${path}' must be rejected (tilde must be followed by / only, not \\).`
        );
      }
    });
    testT("rejects paths with backslashes", async () => {
      const invalidPaths = [
        "folder\\subfolder",
        ".\\skills",
        "..\\parent\\folder",
        "my\\skills\\folder"
      ];
      for (const path of invalidPaths) {
        assert.strictEqual(
          isValidPromptFolderPath(path),
          false,
          `'${path}' must be rejected (backslash paths not supported for cross-platform sharing).`
        );
      }
    });
    testT("rejects glob patterns", async () => {
      const invalidPaths = [
        "skills/*",
        "skills/**",
        "**/skills",
        "skills/*.md",
        "skills/**/*.md",
        "{skill1,skill2}",
        "skill[1,2,3]",
        "skills?",
        "./skills/*",
        "~/skills/**"
      ];
      for (const path of invalidPaths) {
        assert.strictEqual(
          isValidPromptFolderPath(path),
          false,
          `'${path}' must be rejected (glob patterns not supported for performance).`
        );
      }
    });
    testT("rejects empty or whitespace paths", async () => {
      const invalidPaths = [
        "",
        "   ",
        "	",
        "\n"
      ];
      for (const path of invalidPaths) {
        assert.strictEqual(
          isValidPromptFolderPath(path),
          false,
          `'${path}' must be rejected (empty or whitespace only).`
        );
      }
    });
    testT("handles paths with spaces", async () => {
      const validPaths = [
        "my skills",
        "./my skills/folder",
        "~/my skills",
        "../shared skills"
      ];
      for (const path of validPaths) {
        assert.strictEqual(
          isValidPromptFolderPath(path),
          true,
          `'${path}' must be accepted (paths with spaces are valid).`
        );
      }
    });
  });
  suite("hasGlobPattern", () => {
    testT("detects single wildcard", async () => {
      const pathsWithGlob = [
        "skills/*",
        "my-skills/*",
        "*.md",
        "*/folder"
      ];
      for (const path of pathsWithGlob) {
        assert.strictEqual(
          hasGlobPattern(path),
          true,
          `'${path}' must be detected as having a glob pattern.`
        );
      }
    });
    testT("detects double wildcard", async () => {
      const pathsWithGlob = [
        "skills/**",
        "**/skills",
        "**/*.md",
        "a/**/b"
      ];
      for (const path of pathsWithGlob) {
        assert.strictEqual(
          hasGlobPattern(path),
          true,
          `'${path}' must be detected as having a glob pattern.`
        );
      }
    });
    testT("returns false for paths without wildcards", async () => {
      const pathsWithoutGlob = [
        "skills",
        "./skills/folder",
        "~/skills",
        "../parent/folder",
        ".github/prompts"
      ];
      for (const path of pathsWithoutGlob) {
        assert.strictEqual(
          hasGlobPattern(path),
          false,
          `'${path}' must not be detected as having a glob pattern.`
        );
      }
    });
  });
  suite("getConfigBasedSourceFolders", () => {
    testT("gets unambiguous list of folders", async () => {
      setLocations({
        ".github/prompts": true,
        "/Users/**/repos/**": true,
        "gen/text/**": true,
        "gen/text/nested/*.prompt.md": true,
        "general/*": true,
        "/Users/legomushroom/repos/vscode/my-prompts": true,
        "/Users/legomushroom/repos/vscode/your-prompts/*.md": true,
        "/Users/legomushroom/repos/prompts/shared-prompts/*": true
      });
      setWorkspaceFolders([
        "/Users/legomushroom/repos/vscode",
        "/Users/legomushroom/repos/prompts"
      ]);
      await mockFiles(fileService, []);
      const locator = instantiationService.createInstance(PromptFilesLocator);
      assertOutcome(
        await locator.getConfigBasedSourceFolders(PromptsType.prompt),
        [
          "/Users/legomushroom/repos/vscode/.github/prompts",
          "/Users/legomushroom/repos/prompts/.github/prompts",
          "/Users/legomushroom/repos/vscode/gen/text/nested",
          "/Users/legomushroom/repos/prompts/gen/text/nested",
          "/Users/legomushroom/repos/vscode/general",
          "/Users/legomushroom/repos/prompts/general",
          "/Users/legomushroom/repos/vscode/my-prompts",
          "/Users/legomushroom/repos/vscode/your-prompts",
          "/Users/legomushroom/repos/prompts/shared-prompts"
        ],
        "Must find correct prompts."
      );
    });
  });
  suite("findAgentMDsInWorkspace", () => {
    testT("finds AGENTS.md files using FileSearchProvider", async () => {
      setWorkspaceFolders(["/Users/legomushroom/repos/workspace"]);
      await mockFiles(fileService, [
        {
          path: "/Users/legomushroom/repos/workspace/AGENTS.md",
          contents: ["# Root agents"]
        },
        {
          path: "/Users/legomushroom/repos/workspace/src/AGENTS.md",
          contents: ["# Src agents"]
        }
      ]);
      const locator = instantiationService.createInstance(PromptFilesLocator);
      const result = (await locator.findAgentMDsInWorkspace(CancellationToken.None)).map((f) => f.uri);
      assertOutcome(
        result,
        [
          "/Users/legomushroom/repos/workspace/AGENTS.md",
          "/Users/legomushroom/repos/workspace/src/AGENTS.md"
        ],
        "Must find all AGENTS.md files using search service."
      );
    });
    testT("finds AGENTS.md files using file service fallback", async () => {
      setWorkspaceFolders(["/Users/legomushroom/repos/workspace"]);
      await mockFiles(fileService, [
        {
          path: "/Users/legomushroom/repos/workspace/AGENTS.md",
          contents: ["# Root agents"]
        },
        {
          path: "/Users/legomushroom/repos/workspace/src/AGENTS.md",
          contents: ["# Src agents"]
        },
        {
          path: "/Users/legomushroom/repos/workspace/src/nested/AGENTS.md",
          contents: ["# Nested agents"]
        }
      ]);
      instantiationService.stub(ISearchService, {
        schemeHasFileSearchProvider: () => false,
        async fileSearch() {
          throw new Error("FileSearchProvider not available");
        }
      });
      const locator = instantiationService.createInstance(PromptFilesLocator);
      const result = (await locator.findAgentMDsInWorkspace(CancellationToken.None)).map((f) => f.uri);
      assertOutcome(
        result,
        [
          "/Users/legomushroom/repos/workspace/AGENTS.md",
          "/Users/legomushroom/repos/workspace/src/AGENTS.md",
          "/Users/legomushroom/repos/workspace/src/nested/AGENTS.md"
        ],
        "Must find all AGENTS.md files using file service fallback."
      );
    });
    testT("handles cancellation token in file service fallback", async () => {
      setWorkspaceFolders(["/Users/legomushroom/repos/workspace"]);
      await mockFiles(fileService, [
        {
          path: "/Users/legomushroom/repos/workspace/AGENTS.md",
          contents: ["# Root agents"]
        }
      ]);
      instantiationService.stub(ISearchService, {
        schemeHasFileSearchProvider: () => false,
        async fileSearch() {
          throw new Error("FileSearchProvider not available");
        }
      });
      const locator = instantiationService.createInstance(PromptFilesLocator);
      const source = new CancellationTokenSource();
      source.cancel();
      const result = (await locator.findAgentMDsInWorkspace(source.token)).map((f) => f.uri);
      assertOutcome(
        result,
        [],
        "Must return empty array when cancelled."
      );
    });
  });
  suite("getWorkspaceFolderRoots", () => {
    let locator;
    const setWorkspaceFoldersForRoots = (paths) => {
      setWorkspaceFolders(paths);
      locator = instantiationService.createInstance(PromptFilesLocator);
    };
    testT("returns only workspace folder when it has .git", async () => {
      setWorkspaceFoldersForRoots(["/repos/my-project"]);
      await mockFiles(fileService, [
        { path: "/repos/my-project/.git/HEAD", contents: ["ref: refs/heads/main"] },
        { path: "/repos/my-project/src/index.ts", contents: ["export {};"] }
      ]);
      const roots = await locator.getWorkspaceFolderRoots(true);
      assert.deepStrictEqual(
        roots.map((r) => r.path),
        ["/repos/my-project"],
        "Should only return the workspace folder itself when it has .git"
      );
    });
    testT("walks up to parent with .git when workspace folder has no .git", async () => {
      setWorkspaceFoldersForRoots(["/repos/monorepo/packages/my-app"]);
      await mockFiles(fileService, [
        { path: "/repos/monorepo/.git/HEAD", contents: ["ref: refs/heads/main"] },
        { path: "/repos/monorepo/packages/my-app/src/index.ts", contents: ["export {};"] }
      ]);
      workspaceTrustService.setTrustedUris([URI.file("/repos/monorepo")]);
      const roots = await locator.getWorkspaceFolderRoots(true);
      assert.deepStrictEqual(
        roots.map((r) => r.path).sort(),
        [
          "/repos/monorepo",
          "/repos/monorepo/packages",
          "/repos/monorepo/packages/my-app"
        ].sort(),
        "Should include workspace folder and all parents up to the one with .git"
      );
    });
    testT("does not walk up when includeParents is false", async () => {
      setWorkspaceFoldersForRoots(["/repos/monorepo/packages/my-app"]);
      await mockFiles(fileService, [
        { path: "/repos/monorepo/.git/HEAD", contents: ["ref: refs/heads/main"] },
        { path: "/repos/monorepo/packages/my-app/src/index.ts", contents: ["export {};"] }
      ]);
      workspaceTrustService.setTrustedUris([URI.file("/repos/monorepo")]);
      const roots = await locator.getWorkspaceFolderRoots(false);
      assert.deepStrictEqual(
        roots.map((r) => r.path),
        ["/repos/monorepo/packages/my-app"],
        "Should only return workspace folders when includeParents is false"
      );
    });
    testT("excludes vscode-agent-host workspace folders", async () => {
      const localFolder = URI.file("/repos/local-project");
      const agentHostFolder = URI.from({ scheme: "vscode-agent-host", authority: "remote", path: "/repos/remote-project" });
      const folders = [localFolder, agentHostFolder].map((uri, index) => new class extends mock() {
        constructor() {
          super(...arguments);
          this.uri = uri;
          this.name = basename(uri);
          this.index = index;
        }
      }());
      instantiationService.stub(IWorkspaceContextService, mockWorkspaceService(folders));
      locator = instantiationService.createInstance(PromptFilesLocator);
      await mockFiles(fileService, [
        { path: "/repos/local-project/.git/HEAD", contents: ["ref: refs/heads/main"] }
      ]);
      const roots = await locator.getWorkspaceFolderRoots(true);
      assert.deepStrictEqual(
        roots.map((r) => r.toString()),
        [localFolder.toString()],
        "Should exclude vscode-agent-host workspace folders from prompt-file discovery roots"
      );
    });
    testT("returns only workspace folder when no .git is found", async () => {
      setWorkspaceFoldersForRoots(["/Users/legomushroom/my-project"]);
      await mockFiles(fileService, [
        { path: "/Users/legomushroom/my-project/src/index.ts", contents: ["export {};"] }
      ]);
      const roots = await locator.getWorkspaceFolderRoots(true);
      assert.deepStrictEqual(
        roots.map((r) => r.path),
        ["/Users/legomushroom/my-project"],
        "Should only return the workspace folder when no .git is found in any parent"
      );
    });
  });
  suite("getHookSourceFolders", () => {
    testT("returns source metadata for hook folders", async () => {
      configValues[PromptsConfig.HOOKS_LOCATION_KEY] = {
        ".github/hooks": true,
        "~/.copilot/hooks": true,
        // disable Claude paths (which are filtered out anyway)
        ".claude/settings.json": false,
        ".claude/settings.local.json": false,
        "~/.claude/settings.json": false
      };
      setWorkspaceFolders(["/Users/legomushroom/repos/vscode"]);
      await mockFiles(fileService, []);
      const locator = instantiationService.createInstance(PromptFilesLocator);
      const folders = await locator.getHookSourceFolders();
      assert.deepStrictEqual(
        folders.map((f) => ({ path: f.uri.path, source: f.source, storage: f.storage })),
        [
          { path: "/Users/legomushroom/repos/vscode/.github/hooks", source: PromptFileSource.GitHubWorkspace, storage: PromptsStorage.local },
          { path: "/Users/legomushroom/.copilot/hooks", source: PromptFileSource.CopilotPersonal, storage: PromptsStorage.user }
        ]
      );
    });
    testT("excludes Claude paths", async () => {
      configValues[PromptsConfig.HOOKS_LOCATION_KEY] = {
        ".github/hooks": true,
        ".claude/settings.json": true,
        ".claude/settings.local.json": true,
        "~/.claude/settings.json": true,
        "~/.copilot/hooks": true
      };
      setWorkspaceFolders(["/Users/legomushroom/repos/vscode"]);
      await mockFiles(fileService, []);
      const locator = instantiationService.createInstance(PromptFilesLocator);
      const folders = await locator.getHookSourceFolders();
      const paths = folders.map((f) => f.uri.path);
      assert.ok(!paths.some((p) => p.includes(".claude")), "Claude paths must be excluded");
      assert.deepStrictEqual(paths, [
        "/Users/legomushroom/repos/vscode/.github/hooks",
        "/Users/legomushroom/.copilot/hooks"
      ]);
    });
  });
  suite("listFiles with PromptsType.hook", () => {
    testT("only returns targeted json files, not sibling json files", async () => {
      configValues[PromptsConfig.HOOKS_LOCATION_KEY] = {
        ".claude/settings.json": true,
        ".claude/settings.local.json": true,
        "~/.claude/settings.json": true,
        ".github/hooks": true,
        "~/.copilot/hooks": true
      };
      setWorkspaceFolders(["/Users/legomushroom/repos/vscode"]);
      await mockFiles(fileService, [
        // targeted files that should be found
        { path: "/Users/legomushroom/repos/vscode/.claude/settings.json", contents: ["{}"] },
        { path: "/Users/legomushroom/repos/vscode/.claude/settings.local.json", contents: ["{}"] },
        // sibling files in .claude/ that should NOT be found
        { path: "/Users/legomushroom/repos/vscode/.claude/config.json", contents: ["{}"] },
        { path: "/Users/legomushroom/repos/vscode/.claude/stats-cache.json", contents: ["{}"] },
        // hook directory files that should be found
        { path: "/Users/legomushroom/repos/vscode/.github/hooks/pre-commit.json", contents: ["{}"] }
      ]);
      const locator = instantiationService.createInstance(PromptFilesLocator);
      const files = await locator.listFiles(PromptsType.hook, PromptsStorage.local, CancellationToken.None);
      assert.deepStrictEqual(
        files.map((f) => f.path).sort(),
        [
          "/Users/legomushroom/repos/vscode/.claude/settings.json",
          "/Users/legomushroom/repos/vscode/.claude/settings.local.json",
          "/Users/legomushroom/repos/vscode/.github/hooks/pre-commit.json"
        ]
      );
    });
    testT("returns hook files from user home specific json paths", async () => {
      configValues[PromptsConfig.HOOKS_LOCATION_KEY] = {
        "~/.claude/settings.json": true,
        "~/.copilot/hooks": true
      };
      setWorkspaceFolders(["/Users/legomushroom/repos/vscode"]);
      await mockFiles(fileService, [
        // targeted user file
        { path: "/Users/legomushroom/.claude/settings.json", contents: ["{}"] },
        // sibling files that should NOT be found
        { path: "/Users/legomushroom/.claude/config.json", contents: ["{}"] },
        { path: "/Users/legomushroom/.claude/stats-cache.json", contents: ["{}"] },
        // hook directory files
        { path: "/Users/legomushroom/.copilot/hooks/my-hook.json", contents: ["{}"] }
      ]);
      const locator = instantiationService.createInstance(PromptFilesLocator);
      const files = await locator.listFiles(PromptsType.hook, PromptsStorage.user, CancellationToken.None);
      assert.deepStrictEqual(
        files.map((f) => f.path).sort(),
        [
          "/Users/legomushroom/.claude/settings.json",
          "/Users/legomushroom/.copilot/hooks/my-hook.json"
        ]
      );
    });
  });
  suite("getSourceDescription", () => {
    test("returns descriptions for all known folder sources", () => {
      const folderSources = [
        PromptFileSource.AgentsWorkspace,
        PromptFileSource.AgentsPersonal,
        PromptFileSource.GitHubWorkspace,
        PromptFileSource.CopilotPersonal,
        PromptFileSource.ClaudeWorkspace,
        PromptFileSource.ClaudeWorkspaceLocal,
        PromptFileSource.ClaudePersonal,
        PromptFileSource.UserData,
        PromptFileSource.ConfigWorkspace,
        PromptFileSource.ConfigPersonal
      ];
      for (const source of folderSources) {
        const description = getSourceDescription(source);
        assert.ok(typeof description === "string" && description.length > 0, `Expected a description for ${source}`);
      }
    });
    test("returns undefined for extension/plugin sources", () => {
      assert.strictEqual(getSourceDescription(PromptFileSource.ExtensionContribution), void 0);
      assert.strictEqual(getSourceDescription(PromptFileSource.ExtensionAPI), void 0);
      assert.strictEqual(getSourceDescription(PromptFileSource.Plugin), void 0);
    });
  });
});
function assertOutcome(actual, expected, message) {
  assert.deepStrictEqual(actual.map((uri) => uri.path), expected, message);
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vcHJvbXB0U3ludGF4L3V0aWxzL3Byb21wdEZpbGVzTG9jYXRvci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IG1hdGNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZ2xvYi5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgcmVsYXRpdmVQYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25PdmVycmlkZXMsIElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2luTWVtb3J5RmlsZXN5c3RlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2UsIElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgSVdvcmtzcGFjZUZvbGRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElGaWxlTWF0Y2gsIElGaWxlUXVlcnksIElTZWFyY2hTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvc2VhcmNoL2NvbW1vbi9zZWFyY2guanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBJUGF0aFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9wYXRoL2NvbW1vbi9wYXRoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBQcm9tcHRzQ29uZmlnIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9jb25maWcvY29uZmlnLmpzJztcbmltcG9ydCB7IGdldFNvdXJjZURlc2NyaXB0aW9uLCBQcm9tcHRGaWxlU291cmNlLCBQcm9tcHRzVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvcHJvbXB0VHlwZXMuanMnO1xuaW1wb3J0IHsgaGFzR2xvYlBhdHRlcm4sIGlzVmFsaWRHbG9iLCBpc1ZhbGlkUHJvbXB0Rm9sZGVyUGF0aCwgUHJvbXB0RmlsZXNMb2NhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC91dGlscy9wcm9tcHRGaWxlc0xvY2F0b3IuanMnO1xuaW1wb3J0IHsgbW9ja0ZpbGVzIH0gZnJvbSAnLi4vdGVzdFV0aWxzL21vY2tGaWxlc3lzdGVtLmpzJztcbmltcG9ydCB7IG1vY2tTZXJ2aWNlIH0gZnJvbSAnLi9tb2NrLmpzJztcbmltcG9ydCB7IFRlc3RVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlLCBUZXN0V29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBQcm9tcHRzU3RvcmFnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvc2VydmljZS9wcm9tcHRzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBydW5XaXRoRmFrZWRUaW1lcnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3RpbWVUcmF2ZWxTY2hlZHVsZXIuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZVRydXN0LmpzJztcblxuLyoqXG4gKiBNb2NrZWQgaW5zdGFuY2Ugb2Yge0BsaW5rIElDb25maWd1cmF0aW9uU2VydmljZX0uXG4gKi9cbmZ1bmN0aW9uIG1vY2tDb25maWdTZXJ2aWNlKGNvbmZpZ1ZhbHVlczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiBJQ29uZmlndXJhdGlvblNlcnZpY2Uge1xuXHRyZXR1cm4gbW9ja1NlcnZpY2U8SUNvbmZpZ3VyYXRpb25TZXJ2aWNlPih7XG5cdFx0Z2V0VmFsdWUoa2V5Pzogc3RyaW5nIHwgSUNvbmZpZ3VyYXRpb25PdmVycmlkZXMpIHtcblx0XHRcdC8vIEhhbmRsZSBvYmplY3QgY29uZmlndXJhdGlvbiBvdmVycmlkZXMgKGUuZy4sIGZvciBmaWxlIGV4Y2x1ZGUgcGF0dGVybnMpXG5cdFx0XHRpZiAodHlwZW9mIGtleSA9PT0gJ29iamVjdCcpIHtcblx0XHRcdFx0cmV0dXJuIHt9O1xuXHRcdFx0fVxuXHRcdFx0aWYgKHR5cGVvZiBrZXkgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGFzc2VydC5mYWlsKGBVbnN1cHBvcnRlZCBjb25maWd1cmF0aW9uIGtleSAnJHtrZXl9Jy5gKTtcblx0XHRcdH1cblx0XHRcdGlmIChjb25maWdWYWx1ZXMuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuXHRcdFx0XHRyZXR1cm4gY29uZmlnVmFsdWVzW2tleV07XG5cdFx0XHR9XG5cdFx0XHRhc3NlcnQuZmFpbChgVW5zdXBwb3J0ZWQgY29uZmlndXJhdGlvbiBrZXkgJyR7a2V5fScuYCk7XG5cdFx0fSxcblx0fSk7XG59XG5cbi8qKlxuICogTW9ja2VkIGluc3RhbmNlIG9mIHtAbGluayBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2V9LlxuICovXG5mdW5jdGlvbiBtb2NrV29ya3NwYWNlU2VydmljZShmb2xkZXJzOiBJV29ya3NwYWNlRm9sZGVyW10pOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2Uge1xuXHRyZXR1cm4gbW9ja1NlcnZpY2U8SVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlPih7XG5cdFx0Z2V0V29ya3NwYWNlKCk6IElXb3Jrc3BhY2Uge1xuXHRcdFx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVdvcmtzcGFjZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIGZvbGRlcnMgPSBmb2xkZXJzO1xuXHRcdFx0fTtcblx0XHR9LFxuXHRcdGdldFdvcmtzcGFjZUZvbGRlcigpOiBJV29ya3NwYWNlRm9sZGVyIHwgbnVsbCB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0fSk7XG59XG5cbmZ1bmN0aW9uIHRlc3RUKG5hbWU6IHN0cmluZywgZm46ICgpID0+IFByb21pc2U8dm9pZD4pOiBNb2NoYS5UZXN0IHtcblx0cmV0dXJuIHRlc3QobmFtZSwgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBmbikpO1xufVxuXG5zdWl0ZSgnUHJvbXB0RmlsZXNMb2NhdG9yJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRsZXQgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZTtcblx0Y29uc3QgY29uZmlnVmFsdWVzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHt9O1xuXHRsZXQgd29ya3NwYWNlVHJ1c3RTZXJ2aWNlOiBUZXN0V29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZTtcblxuXHQvLyBTZXRzIGFsbCBwcm9tcHQgZmlsZSBsb2NhdGlvbiBjb25maWcga2V5cyB0byB0aGUgc2FtZSB2YWx1ZVxuXHRjb25zdCBzZXRMb2NhdGlvbnMgPSAodmFsdWU6IHVua25vd24pID0+IHtcblx0XHRjb25maWdWYWx1ZXNbUHJvbXB0c0NvbmZpZy5QUk9NUFRfTE9DQVRJT05TX0tFWV0gPSB2YWx1ZTtcblx0XHRjb25maWdWYWx1ZXNbUHJvbXB0c0NvbmZpZy5JTlNUUlVDVElPTlNfTE9DQVRJT05fS0VZXSA9IHZhbHVlO1xuXHRcdGNvbmZpZ1ZhbHVlc1tQcm9tcHRzQ29uZmlnLk1PREVfTE9DQVRJT05fS0VZXSA9IHZhbHVlO1xuXHRcdGNvbmZpZ1ZhbHVlc1tQcm9tcHRzQ29uZmlnLlNLSUxMU19MT0NBVElPTl9LRVldID0gdmFsdWU7XG5cdH07XG5cblx0Ly8gU3R1YnMgd29ya3NwYWNlIGNvbnRleHQgc2VydmljZSB3aXRoIHRoZSBnaXZlbiBmb2xkZXIgcGF0aHNcblx0Y29uc3Qgc2V0V29ya3NwYWNlRm9sZGVycyA9IChwYXRoczogc3RyaW5nW10pID0+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXJzID0gcGF0aHMubWFwKChwYXRoLCBpbmRleCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUocGF0aCk7XG5cdFx0XHRyZXR1cm4gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJV29ya3NwYWNlRm9sZGVyPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgdXJpID0gdXJpO1xuXHRcdFx0XHRvdmVycmlkZSBuYW1lID0gYmFzZW5hbWUodXJpKTtcblx0XHRcdFx0b3ZlcnJpZGUgaW5kZXggPSBpbmRleDtcblx0XHRcdH07XG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIG1vY2tXb3Jrc3BhY2VTZXJ2aWNlKHdvcmtzcGFjZUZvbGRlcnMpKTtcblx0fTtcblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cblx0XHRmaWxlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShGaWxlU2VydmljZSkpO1xuXHRcdGNvbnN0IGZpbGVTeXN0ZW1Qcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoU2NoZW1hcy5maWxlLCBmaWxlU3lzdGVtUHJvdmlkZXIpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXG5cdFx0d29ya3NwYWNlVHJ1c3RTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0V29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLCB3b3Jrc3BhY2VUcnVzdFNlcnZpY2UpO1xuXG5cdFx0Ly8gUmVzZXQgY29uZmlnIHZhbHVlcyB0byBkZWZhdWx0c1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKGNvbmZpZ1ZhbHVlcykpIHtcblx0XHRcdGRlbGV0ZSBjb25maWdWYWx1ZXNba2V5XTtcblx0XHR9XG5cdFx0T2JqZWN0LmFzc2lnbihjb25maWdWYWx1ZXMsIHtcblx0XHRcdCdleHBsb3Jlci5leGNsdWRlR2l0SWdub3JlJzogZmFsc2UsXG5cdFx0XHQnZmlsZXMuZXhjbHVkZSc6IHt9LFxuXHRcdFx0J3NlYXJjaC5leGNsdWRlJzoge30sXG5cdFx0XHRbUHJvbXB0c0NvbmZpZy5VU0VfQ1VTVE9NSVpBVElPTlNfSU5fUEFSRU5UX1JFUE9TXTogZmFsc2UsXG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIG1vY2tDb25maWdTZXJ2aWNlKGNvbmZpZ1ZhbHVlcykpO1xuXG5cdFx0c2V0V29ya3NwYWNlRm9sZGVycyhbXSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsIHt9IGFzIElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UsIG5ldyBUZXN0VXNlckRhdGFQcm9maWxlU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZWFyY2hTZXJ2aWNlLCB7XG5cdFx0XHRzY2hlbWVIYXNGaWxlU2VhcmNoUHJvdmlkZXIoc2NoZW1lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9LFxuXHRcdFx0YXN5bmMgZmlsZVNlYXJjaChxdWVyeTogSUZpbGVRdWVyeSkge1xuXHRcdFx0XHRjb25zdCBmaW5kRmlsZXNJbkxvY2F0aW9uID0gYXN5bmMgKGxvY2F0aW9uOiBVUkksIHJlc3VsdHM6IFVSSVtdID0gW10pID0+IHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0Y29uc3QgcmVzb2x2ZSA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlc29sdmUobG9jYXRpb24pO1xuXHRcdFx0XHRcdFx0aWYgKHJlc29sdmUuaXNGaWxlKSB7XG5cdFx0XHRcdFx0XHRcdHJlc3VsdHMucHVzaChyZXNvbHZlLnJlc291cmNlKTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAocmVzb2x2ZS5pc0RpcmVjdG9yeSAmJiByZXNvbHZlLmNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0XHRcdGZvciAoY29uc3QgY2hpbGQgb2YgcmVzb2x2ZS5jaGlsZHJlbikge1xuXHRcdFx0XHRcdFx0XHRcdGF3YWl0IGZpbmRGaWxlc0luTG9jYXRpb24oY2hpbGQucmVzb3VyY2UsIHJlc3VsdHMpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHJlc3VsdHM7XG5cdFx0XHRcdH07XG5cdFx0XHRcdGNvbnN0IHJlc3VsdHM6IElGaWxlTWF0Y2hbXSA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGZvbGRlclF1ZXJ5IG9mIHF1ZXJ5LmZvbGRlclF1ZXJpZXMpIHtcblx0XHRcdFx0XHRjb25zdCBhbGxGaWxlcyA9IGF3YWl0IGZpbmRGaWxlc0luTG9jYXRpb24oZm9sZGVyUXVlcnkuZm9sZGVyKTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHJlc291cmNlIG9mIGFsbEZpbGVzKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBwYXRoSW5Gb2xkZXIgPSByZWxhdGl2ZVBhdGgoZm9sZGVyUXVlcnkuZm9sZGVyLCByZXNvdXJjZSkgPz8gJyc7XG5cdFx0XHRcdFx0XHRpZiAocXVlcnkuZmlsZVBhdHRlcm4gPT09IHVuZGVmaW5lZCB8fCBtYXRjaChxdWVyeS5maWxlUGF0dGVybiwgcGF0aEluRm9sZGVyKSkge1xuXHRcdFx0XHRcdFx0XHRyZXN1bHRzLnB1c2goeyByZXNvdXJjZSB9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHsgcmVzdWx0cywgbWVzc2FnZXM6IFtdIH07XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUGF0aFNlcnZpY2UsIHtcblx0XHRcdHVzZXJIb21lKG9wdGlvbnM/OiB7IHByZWZlckxvY2FsOiBib29sZWFuIH0pOiBVUkkgfCBQcm9taXNlPFVSST4ge1xuXHRcdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL1VzZXJzL2xlZ29tdXNocm9vbScpO1xuXHRcdFx0XHRpZiAob3B0aW9ucz8ucHJlZmVyTG9jYWwpIHtcblx0XHRcdFx0XHRyZXR1cm4gdXJpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodXJpKTtcblx0XHRcdH1cblx0XHR9IGFzIElQYXRoU2VydmljZSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdlbXB0eSB3b3Jrc3BhY2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgRU1QVFlfV09SS1NQQUNFOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0c3VpdGUoJ2VtcHR5IGZpbGVzeXN0ZW0nLCAoKSA9PiB7XG5cdFx0XHR0ZXN0VCgnbm8gY29uZmlnIHZhbHVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRzZXRMb2NhdGlvbnModW5kZWZpbmVkKTtcblx0XHRcdFx0c2V0V29ya3NwYWNlRm9sZGVycyhFTVBUWV9XT1JLU1BBQ0UpO1xuXHRcdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtdKTtcblx0XHRcdFx0Y29uc3QgbG9jYXRvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdEZpbGVzTG9jYXRvcik7XG5cblx0XHRcdFx0YXNzZXJ0T3V0Y29tZShcblx0XHRcdFx0XHRhd2FpdCBsb2NhdG9yLmxpc3RGaWxlcyhQcm9tcHRzVHlwZS5wcm9tcHQsIFByb21wdHNTdG9yYWdlLmxvY2FsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSxcblx0XHRcdFx0XHRbXSxcblx0XHRcdFx0XHQnTm8gcHJvbXB0cyBtdXN0IGJlIGZvdW5kLicsXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdFQoJ29iamVjdCBjb25maWcgdmFsdWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHNldExvY2F0aW9ucyh7XG5cdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cy8nOiB0cnVlLFxuXHRcdFx0XHRcdCcvdG1wL3Byb21wdHMvJzogZmFsc2UsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRzZXRXb3Jrc3BhY2VGb2xkZXJzKEVNUFRZX1dPUktTUEFDRSk7XG5cdFx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW10pO1xuXHRcdFx0XHRjb25zdCBsb2NhdG9yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0RmlsZXNMb2NhdG9yKTtcblxuXHRcdFx0XHRhc3NlcnRPdXRjb21lKFxuXHRcdFx0XHRcdGF3YWl0IGxvY2F0b3IubGlzdEZpbGVzKFByb21wdHNUeXBlLnByb21wdCwgUHJvbXB0c1N0b3JhZ2UubG9jYWwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLFxuXHRcdFx0XHRcdFtdLFxuXHRcdFx0XHRcdCdObyBwcm9tcHRzIG11c3QgYmUgZm91bmQuJyxcblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0VCgnYXJyYXkgY29uZmlnIHZhbHVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRzZXRMb2NhdGlvbnMoW1xuXHRcdFx0XHRcdCdyZWxhdGl2ZS9wYXRoL3RvL3Byb21wdHMvJyxcblx0XHRcdFx0XHQnL2Ficy9wYXRoJyxcblx0XHRcdFx0XSk7XG5cdFx0XHRcdHNldFdvcmtzcGFjZUZvbGRlcnMoRU1QVFlfV09SS1NQQUNFKTtcblx0XHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXSk7XG5cdFx0XHRcdGNvbnN0IGxvY2F0b3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRGaWxlc0xvY2F0b3IpO1xuXG5cdFx0XHRcdGFzc2VydE91dGNvbWUoXG5cdFx0XHRcdFx0YXdhaXQgbG9jYXRvci5saXN0RmlsZXMoUHJvbXB0c1R5cGUucHJvbXB0LCBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksXG5cdFx0XHRcdFx0W10sXG5cdFx0XHRcdFx0J05vIHByb21wdHMgbXVzdCBiZSBmb3VuZC4nLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3RUKCdudWxsIGNvbmZpZyB2YWx1ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0c2V0TG9jYXRpb25zKG51bGwpO1xuXHRcdFx0XHRzZXRXb3Jrc3BhY2VGb2xkZXJzKEVNUFRZX1dPUktTUEFDRSk7XG5cdFx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW10pO1xuXHRcdFx0XHRjb25zdCBsb2NhdG9yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0RmlsZXNMb2NhdG9yKTtcblxuXHRcdFx0XHRhc3NlcnRPdXRjb21lKFxuXHRcdFx0XHRcdGF3YWl0IGxvY2F0b3IubGlzdEZpbGVzKFByb21wdHNUeXBlLnByb21wdCwgUHJvbXB0c1N0b3JhZ2UubG9jYWwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLFxuXHRcdFx0XHRcdFtdLFxuXHRcdFx0XHRcdCdObyBwcm9tcHRzIG11c3QgYmUgZm91bmQuJyxcblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0VCgnc3RyaW5nIGNvbmZpZyB2YWx1ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0c2V0TG9jYXRpb25zKCcvZXRjL2hvc3RzL3Byb21wdHMnKTtcblx0XHRcdFx0c2V0V29ya3NwYWNlRm9sZGVycyhFTVBUWV9XT1JLU1BBQ0UpO1xuXHRcdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtdKTtcblx0XHRcdFx0Y29uc3QgbG9jYXRvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdEZpbGVzTG9jYXRvcik7XG5cblx0XHRcdFx0YXNzZXJ0T3V0Y29tZShcblx0XHRcdFx0XHRhd2FpdCBsb2NhdG9yLmxpc3RGaWxlcyhQcm9tcHRzVHlwZS5wcm9tcHQsIFByb21wdHNTdG9yYWdlLmxvY2FsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSxcblx0XHRcdFx0XHRbXSxcblx0XHRcdFx0XHQnTm8gcHJvbXB0cyBtdXN0IGJlIGZvdW5kLicsXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHN1aXRlKCdub24tZW1wdHkgZmlsZXN5c3RlbScsICgpID0+IHtcblx0XHRcdHRlc3RUKCdjb3JlIGxvZ2ljJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRzZXRMb2NhdGlvbnMoe1xuXHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMnOiB0cnVlLFxuXHRcdFx0XHRcdCcvdG1wL3Byb21wdHMvJzogdHJ1ZSxcblx0XHRcdFx0XHQnL2Fic29sdXRlL3BhdGgvcHJvbXB0cyc6IGZhbHNlLFxuXHRcdFx0XHRcdCcuY29waWxvdC9wcm9tcHRzJzogdHJ1ZSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHNldFdvcmtzcGFjZUZvbGRlcnMoRU1QVFlfV09SS1NQQUNFKTtcblx0XHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cy90ZXN0LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRjb250ZW50czogWydIZWxsbywgV29ybGQhJ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzL3JlZmFjdG9yLXRlc3RzLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRjb250ZW50czogWydzb21lIGZpbGUgY29udGVudCBnb2VzIGhlcmUnXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHBhdGg6ICcvdG1wL3Byb21wdHMvdHJhbnNsYXRlLnRvLXJ1c3QucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ3NvbWUgbW9yZSByYW5kb20gZmlsZSBjb250ZW50cyddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cGF0aDogJy9hYnNvbHV0ZS9wYXRoL3Byb21wdHMvc29tZS1wcm9tcHQtZmlsZS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6IFsnaGV5IGhleSBoZXknXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRdKTtcblx0XHRcdFx0Y29uc3QgbG9jYXRvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdEZpbGVzTG9jYXRvcik7XG5cblx0XHRcdFx0YXNzZXJ0T3V0Y29tZShcblx0XHRcdFx0XHRhd2FpdCBsb2NhdG9yLmxpc3RGaWxlcyhQcm9tcHRzVHlwZS5wcm9tcHQsIFByb21wdHNTdG9yYWdlLmxvY2FsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzL3Rlc3QucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMvcmVmYWN0b3ItdGVzdHMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdCcvdG1wL3Byb21wdHMvdHJhbnNsYXRlLnRvLXJ1c3QucHJvbXB0Lm1kJ1xuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0J011c3QgZmluZCBjb3JyZWN0IHByb21wdHMuJyxcblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHRzdWl0ZSgnYWJzb2x1dGUnLCAoKSA9PiB7XG5cdFx0XHRcdHRlc3RUKCd3aWxkIGNhcmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3Qgc2V0dGluZ3MgPSBbXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvKionLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLyoqLyoucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8qKi8qLm1kJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8qKi8qJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzLyoqJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzLyoqLyoucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzLyoqLyonLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvKiovKi5tZCcsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvKiovdGV4dC8qKicsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvKiovdGV4dC8qKi8qJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8qKi90ZXh0LyoqLyoubWQnLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLyoqL3RleHQvKiovKi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC8qKicsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0LyoqLyonLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC8qKi8qLm1kJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvKiovKi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdF07XG5cblx0XHRcdFx0XHRmb3IgKGNvbnN0IHNldHRpbmcgb2Ygc2V0dGluZ3MpIHtcblx0XHRcdFx0XHRcdHNldExvY2F0aW9ucyh7IFtzZXR0aW5nXTogdHJ1ZSB9KTtcblx0XHRcdFx0XHRcdHNldFdvcmtzcGFjZUZvbGRlcnMoRU1QVFlfV09SS1NQQUNFKTtcblx0XHRcdFx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC9teS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCBib3QhJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0L25lc3RlZC9zcGVjaWZpYy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCBib3QhJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0L25lc3RlZC91bnNwZWNpZmljMS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCByb2JvdCEnXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvbmVzdGVkL3Vuc3BlY2lmaWMyLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIHJhYm90ISddLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC9uZXN0ZWQvcmVhZG1lLm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogWydub24gcHJvbXB0IGZpbGUnXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdF0pO1xuXHRcdFx0XHRcdFx0Y29uc3QgbG9jYXRvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdEZpbGVzTG9jYXRvcik7XG5cblx0XHRcdFx0XHRcdGFzc2VydE91dGNvbWUoXG5cdFx0XHRcdFx0XHRcdGF3YWl0IGxvY2F0b3IubGlzdEZpbGVzKFByb21wdHNUeXBlLnByb21wdCwgUHJvbXB0c1N0b3JhZ2UubG9jYWwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLFxuXHRcdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC9teS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvbmVzdGVkL3NwZWNpZmljLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC9uZXN0ZWQvdW5zcGVjaWZpYzEucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0L25lc3RlZC91bnNwZWNpZmljMi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHQnTXVzdCBmaW5kIGNvcnJlY3QgcHJvbXB0cy4nLFxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHRlc3RUKGBzcGVjaWZpY2AsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRjb25zdCB0ZXN0U2V0dGluZ3MgPSBbXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8qKi8qc3BlY2lmaWMqJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8qKi8qc3BlY2lmaWMqLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvKiovKnNwZWNpZmljKi5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvKiovc3BlY2lmaWMqJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLyoqL3Vuc3BlY2lmaWMxLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8qKi91bnNwZWNpZmljMi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLyoqL3NwZWNpZmljLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8qKi91bnNwZWNpZmljKi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLyoqL25lc3RlZC9zcGVjaWZpYy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvKiovbmVzdGVkL3Vuc3BlY2lmaWMqLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvKiovbmVzdGVkLypzcGVjaWZpYyonLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLyoqLypzcGVjKi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLyoqLypzcGVjKicsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvKiovKnNwZWMqLm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8qKi9kZXBzLyoqLypzcGVjKi5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvKiovdGV4dC8qKi8qc3BlYyoubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC9uZXN0ZWQvKnNwZWMqJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvbmVzdGVkLypzcGVjaWZpYyonLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvKiovKnNwZWNpZmljKicsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy8qKi9zcGVjaWZpYyonLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy8qKi91bnNwZWNpZmljKi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvKiovc3BlY2lmaWMqLm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvKiovdW5zcGVjaWZpYyoubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvKiovc3BlY2lmaWMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvKiovdW5zcGVjaWZpYzEucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvKiovdW5zcGVjaWZpYzIucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzLyoqL3NwZWNpZmljLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzLyoqL3Vuc3BlY2lmaWMxKi5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzLyoqL3Vuc3BlY2lmaWMyKi5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0LyoqLypzcGVjaWZpYyonLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC8qKi9zcGVjaWZpYyonLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0LyoqL3Vuc3BlY2lmaWMqLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0LyoqL3NwZWNpZmljKi5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvKiovdW5zcGVjaWZpYyoubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC8qKi9zcGVjaWZpYy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0LyoqL3Vuc3BlY2lmaWMxLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvKiovdW5zcGVjaWZpYzIucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvKiovc3BlY2lmaWMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC8qKi91bnNwZWNpZmljMSoubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0LyoqL3Vuc3BlY2lmaWMyKi5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdF07XG5cblx0XHRcdFx0XHRmb3IgKGNvbnN0IHNldHRpbmdzIG9mIHRlc3RTZXR0aW5ncykge1xuXHRcdFx0XHRcdFx0Y29uc3QgdnNjb2RlU2V0dGluZ3M6IFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+ID0ge307XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IHNldHRpbmcgb2Ygc2V0dGluZ3MpIHtcblx0XHRcdFx0XHRcdFx0dnNjb2RlU2V0dGluZ3Nbc2V0dGluZ10gPSB0cnVlO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRzZXRMb2NhdGlvbnModnNjb2RlU2V0dGluZ3MpO1xuXHRcdFx0XHRcdFx0c2V0V29ya3NwYWNlRm9sZGVycyhFTVBUWV9XT1JLU1BBQ0UpO1xuXHRcdFx0XHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0L215LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIGJvdCEnXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvbmVzdGVkL2RlZmF1bHQucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgYm90ISddLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC9uZXN0ZWQvc3BlY2lmaWMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgYm90ISddLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC9uZXN0ZWQvdW5zcGVjaWZpYzEucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgcm9ib3QhJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0L25lc3RlZC91bnNwZWNpZmljMi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCByYXdib3QhJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0L25lc3RlZC9yZWFkbWUubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ25vbiBwcm9tcHQgZmlsZSddLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XSk7XG5cdFx0XHRcdFx0XHRjb25zdCBsb2NhdG9yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0RmlsZXNMb2NhdG9yKTtcblxuXHRcdFx0XHRcdFx0YXNzZXJ0T3V0Y29tZShcblx0XHRcdFx0XHRcdFx0YXdhaXQgbG9jYXRvci5saXN0RmlsZXMoUHJvbXB0c1R5cGUucHJvbXB0LCBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksXG5cdFx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0L25lc3RlZC9zcGVjaWZpYy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvbmVzdGVkL3Vuc3BlY2lmaWMxLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC9uZXN0ZWQvdW5zcGVjaWZpYzIucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0J011c3QgZmluZCBjb3JyZWN0IHByb21wdHMuJyxcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnc2luZ2xlLXJvb3Qgd29ya3NwYWNlJywgKCkgPT4ge1xuXHRcdHN1aXRlKCdnbG9iIHBhdHRlcm4nLCAoKSA9PiB7XG5cdFx0XHRzdWl0ZSgncmVsYXRpdmUnLCAoKSA9PiB7XG5cdFx0XHRcdHRlc3RUKCd3aWxkIGNhcmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgdGVzdFNldHRpbmdzID0gW1xuXHRcdFx0XHRcdFx0JyoqJyxcblx0XHRcdFx0XHRcdCcqKi8qLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHQnKiovKi5tZCcsXG5cdFx0XHRcdFx0XHQnKiovKicsXG5cdFx0XHRcdFx0XHQnZGVwcy8qKicsXG5cdFx0XHRcdFx0XHQnZGVwcy8qKi8qLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHQnZGVwcy8qKi8qJyxcblx0XHRcdFx0XHRcdCdkZXBzLyoqLyoubWQnLFxuXHRcdFx0XHRcdFx0JyoqL3RleHQvKionLFxuXHRcdFx0XHRcdFx0JyoqL3RleHQvKiovKicsXG5cdFx0XHRcdFx0XHQnKiovdGV4dC8qKi8qLm1kJyxcblx0XHRcdFx0XHRcdCcqKi90ZXh0LyoqLyoucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdCdkZXBzL3RleHQvKionLFxuXHRcdFx0XHRcdFx0J2RlcHMvdGV4dC8qKi8qJyxcblx0XHRcdFx0XHRcdCdkZXBzL3RleHQvKiovKi5tZCcsXG5cdFx0XHRcdFx0XHQnZGVwcy90ZXh0LyoqLyoucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRdO1xuXG5cdFx0XHRcdFx0Zm9yIChjb25zdCBzZXR0aW5nIG9mIHRlc3RTZXR0aW5ncykge1xuXHRcdFx0XHRcdFx0c2V0TG9jYXRpb25zKHsgW3NldHRpbmddOiB0cnVlIH0pO1xuXHRcdFx0XHRcdFx0c2V0V29ya3NwYWNlRm9sZGVycyhbJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlJ10pO1xuXHRcdFx0XHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0L215LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIGJvdCEnXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvbmVzdGVkL3NwZWNpZmljLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIGJvdCEnXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvbmVzdGVkL3Vuc3BlY2lmaWMxLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIHJvYm90ISddLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC9uZXN0ZWQvdW5zcGVjaWZpYzIucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgcmFib3QhJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0L25lc3RlZC9yZWFkbWUubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ25vbiBwcm9tcHQgZmlsZSddLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XSk7XG5cdFx0XHRcdFx0XHRjb25zdCBsb2NhdG9yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0RmlsZXNMb2NhdG9yKTtcblxuXHRcdFx0XHRcdFx0YXNzZXJ0T3V0Y29tZShcblx0XHRcdFx0XHRcdFx0YXdhaXQgbG9jYXRvci5saXN0RmlsZXMoUHJvbXB0c1R5cGUucHJvbXB0LCBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksXG5cdFx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0L215LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC9uZXN0ZWQvc3BlY2lmaWMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0L25lc3RlZC91bnNwZWNpZmljMS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvbmVzdGVkL3Vuc3BlY2lmaWMyLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdCdNdXN0IGZpbmQgY29ycmVjdCBwcm9tcHRzLicsXG5cdFx0XHRcdFx0XHQpO1xuXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHR0ZXN0VChgc3BlY2lmaWNgLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgdGVzdFNldHRpbmdzID0gW1xuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnKiovKnNwZWNpZmljKicsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnKiovKnNwZWNpZmljKi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0JyoqLypzcGVjaWZpYyoubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0JyoqL3NwZWNpZmljKicsXG5cdFx0XHRcdFx0XHRcdCcqKi91bnNwZWNpZmljMS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnKiovdW5zcGVjaWZpYzIucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcqKi9zcGVjaWZpYy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnKiovdW5zcGVjaWZpYyoucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcqKi9uZXN0ZWQvc3BlY2lmaWMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0JyoqL25lc3RlZC91bnNwZWNpZmljKi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0JyoqL25lc3RlZC8qc3BlY2lmaWMqJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcqKi8qc3BlYyoucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcqKi8qc3BlYyonLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0JyoqLypzcGVjKi5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnKiovZGVwcy8qKi8qc3BlYyoubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0JyoqL3RleHQvKiovKnNwZWMqLm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCdkZXBzL3RleHQvbmVzdGVkLypzcGVjKicsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnZGVwcy90ZXh0L25lc3RlZC8qc3BlY2lmaWMqJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCdkZXBzLyoqLypzcGVjaWZpYyonLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0J2RlcHMvKiovc3BlY2lmaWMqJyxcblx0XHRcdFx0XHRcdFx0J2RlcHMvKiovdW5zcGVjaWZpYyoucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCdkZXBzLyoqL3NwZWNpZmljKi5tZCcsXG5cdFx0XHRcdFx0XHRcdCdkZXBzLyoqL3Vuc3BlY2lmaWMqLm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCdkZXBzLyoqL3NwZWNpZmljLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCdkZXBzLyoqL3Vuc3BlY2lmaWMxLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCdkZXBzLyoqL3Vuc3BlY2lmaWMyLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnZGVwcy8qKi9zcGVjaWZpYy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnZGVwcy8qKi91bnNwZWNpZmljMSoubWQnLFxuXHRcdFx0XHRcdFx0XHQnZGVwcy8qKi91bnNwZWNpZmljMioubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0J2RlcHMvdGV4dC8qKi8qc3BlY2lmaWMqJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCdkZXBzL3RleHQvKiovc3BlY2lmaWMqJyxcblx0XHRcdFx0XHRcdFx0J2RlcHMvdGV4dC8qKi91bnNwZWNpZmljKi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0J2RlcHMvdGV4dC8qKi9zcGVjaWZpYyoubWQnLFxuXHRcdFx0XHRcdFx0XHQnZGVwcy90ZXh0LyoqL3Vuc3BlY2lmaWMqLm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCdkZXBzL3RleHQvKiovc3BlY2lmaWMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0J2RlcHMvdGV4dC8qKi91bnNwZWNpZmljMS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnZGVwcy90ZXh0LyoqL3Vuc3BlY2lmaWMyLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnZGVwcy90ZXh0LyoqL3NwZWNpZmljLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCdkZXBzL3RleHQvKiovdW5zcGVjaWZpYzEqLm1kJyxcblx0XHRcdFx0XHRcdFx0J2RlcHMvdGV4dC8qKi91bnNwZWNpZmljMioubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRdO1xuXG5cdFx0XHRcdFx0Zm9yIChjb25zdCBzZXR0aW5ncyBvZiB0ZXN0U2V0dGluZ3MpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHZzY29kZVNldHRpbmdzOiBSZWNvcmQ8c3RyaW5nLCBib29sZWFuPiA9IHt9O1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBzZXR0aW5nIG9mIHNldHRpbmdzKSB7XG5cdFx0XHRcdFx0XHRcdHZzY29kZVNldHRpbmdzW3NldHRpbmddID0gdHJ1ZTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0c2V0TG9jYXRpb25zKHZzY29kZVNldHRpbmdzKTtcblx0XHRcdFx0XHRcdHNldFdvcmtzcGFjZUZvbGRlcnMoWycvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZSddKTtcblx0XHRcdFx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC9teS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCBib3QhJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0L25lc3RlZC9kZWZhdWx0LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIGJvdCEnXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvbmVzdGVkL3NwZWNpZmljLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIGJvdCEnXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvbmVzdGVkL3Vuc3BlY2lmaWMxLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIHJvYm90ISddLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC9uZXN0ZWQvdW5zcGVjaWZpYzIucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgcmF3Ym90ISddLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC9uZXN0ZWQvcmVhZG1lLm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogWydub24gcHJvbXB0IGZpbGUnXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdF0pO1xuXHRcdFx0XHRcdFx0Y29uc3QgbG9jYXRvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdEZpbGVzTG9jYXRvcik7XG5cblx0XHRcdFx0XHRcdGFzc2VydE91dGNvbWUoXG5cdFx0XHRcdFx0XHRcdGF3YWl0IGxvY2F0b3IubGlzdEZpbGVzKFByb21wdHNUeXBlLnByb21wdCwgUHJvbXB0c1N0b3JhZ2UubG9jYWwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLFxuXHRcdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC9uZXN0ZWQvc3BlY2lmaWMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0L25lc3RlZC91bnNwZWNpZmljMS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvbmVzdGVkL3Vuc3BlY2lmaWMyLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdCdNdXN0IGZpbmQgY29ycmVjdCBwcm9tcHRzLicsXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0c3VpdGUoJ2Fic29sdXRlJywgKCkgPT4ge1xuXHRcdFx0XHR0ZXN0VCgnd2lsZCBjYXJkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHNldHRpbmdzID0gW1xuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLyoqJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8qKi8qLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvKiovKi5tZCcsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvKiovKicsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy8qKicsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy8qKi8qLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy8qKi8qJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzLyoqLyoubWQnLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLyoqL3RleHQvKionLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLyoqL3RleHQvKiovKicsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvKiovdGV4dC8qKi8qLm1kJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8qKi90ZXh0LyoqLyoucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvKionLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC8qKi8qJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvKiovKi5tZCcsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0LyoqLyoucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRdO1xuXG5cdFx0XHRcdFx0Zm9yIChjb25zdCBzZXR0aW5nIG9mIHNldHRpbmdzKSB7XG5cblx0XHRcdFx0XHRcdHNldExvY2F0aW9ucyh7IFtzZXR0aW5nXTogdHJ1ZSB9KTtcblx0XHRcdFx0XHRcdHNldFdvcmtzcGFjZUZvbGRlcnMoWycvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZSddKTtcblx0XHRcdFx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC9teS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCBib3QhJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0L25lc3RlZC9zcGVjaWZpYy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCBib3QhJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0L25lc3RlZC91bnNwZWNpZmljMS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCByb2JvdCEnXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvbmVzdGVkL3Vuc3BlY2lmaWMyLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIHJhYm90ISddLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC9uZXN0ZWQvcmVhZG1lLm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogWydub24gcHJvbXB0IGZpbGUnXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdF0pO1xuXHRcdFx0XHRcdFx0Y29uc3QgbG9jYXRvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdEZpbGVzTG9jYXRvcik7XG5cblx0XHRcdFx0XHRcdGFzc2VydE91dGNvbWUoXG5cdFx0XHRcdFx0XHRcdGF3YWl0IGxvY2F0b3IubGlzdEZpbGVzKFByb21wdHNUeXBlLnByb21wdCwgUHJvbXB0c1N0b3JhZ2UubG9jYWwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLFxuXHRcdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC9teS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvbmVzdGVkL3NwZWNpZmljLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC9uZXN0ZWQvdW5zcGVjaWZpYzEucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0L25lc3RlZC91bnNwZWNpZmljMi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHQnTXVzdCBmaW5kIGNvcnJlY3QgcHJvbXB0cy4nLFxuXHRcdFx0XHRcdFx0KTtcblxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dGVzdFQoYHNwZWNpZmljYCwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHRlc3RTZXR0aW5ncyA9IFtcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLyoqLypzcGVjaWZpYyonLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLyoqLypzcGVjaWZpYyoucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8qKi8qc3BlY2lmaWMqLm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8qKi9zcGVjaWZpYyonLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvKiovdW5zcGVjaWZpYzEucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLyoqL3Vuc3BlY2lmaWMyLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvKiovc3BlY2lmaWMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLyoqL3Vuc3BlY2lmaWMqLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvKiovbmVzdGVkL3NwZWNpZmljLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8qKi9uZXN0ZWQvdW5zcGVjaWZpYyoucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8qKi9uZXN0ZWQvKnNwZWNpZmljKicsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvKiovKnNwZWMqLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvKiovKnNwZWMqJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8qKi8qc3BlYyoubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLyoqL2RlcHMvKiovKnNwZWMqLm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8qKi90ZXh0LyoqLypzcGVjKi5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0L25lc3RlZC8qc3BlYyonLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC9uZXN0ZWQvKnNwZWNpZmljKicsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy8qKi8qc3BlY2lmaWMqJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzLyoqL3NwZWNpZmljKicsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzLyoqL3Vuc3BlY2lmaWMqLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy8qKi9zcGVjaWZpYyoubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy8qKi91bnNwZWNpZmljKi5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy8qKi9zcGVjaWZpYy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy8qKi91bnNwZWNpZmljMS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy8qKi91bnNwZWNpZmljMi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvKiovc3BlY2lmaWMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvKiovdW5zcGVjaWZpYzEqLm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvKiovdW5zcGVjaWZpYzIqLm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvKiovKnNwZWNpZmljKicsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0LyoqL3NwZWNpZmljKicsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvKiovdW5zcGVjaWZpYyoucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvKiovc3BlY2lmaWMqLm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC8qKi91bnNwZWNpZmljKi5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0LyoqL3NwZWNpZmljLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvKiovdW5zcGVjaWZpYzEucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC8qKi91bnNwZWNpZmljMi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC8qKi9zcGVjaWZpYy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0LyoqL3Vuc3BlY2lmaWMxKi5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvKiovdW5zcGVjaWZpYzIqLm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XTtcblxuXHRcdFx0XHRcdGZvciAoY29uc3Qgc2V0dGluZ3Mgb2YgdGVzdFNldHRpbmdzKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB2c2NvZGVTZXR0aW5nczogUmVjb3JkPHN0cmluZywgYm9vbGVhbj4gPSB7fTtcblx0XHRcdFx0XHRcdGZvciAoY29uc3Qgc2V0dGluZyBvZiBzZXR0aW5ncykge1xuXHRcdFx0XHRcdFx0XHR2c2NvZGVTZXR0aW5nc1tzZXR0aW5nXSA9IHRydWU7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdHNldExvY2F0aW9ucyh2c2NvZGVTZXR0aW5ncyk7XG5cdFx0XHRcdFx0XHRzZXRXb3Jrc3BhY2VGb2xkZXJzKFsnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUnXSk7XG5cdFx0XHRcdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvbXkucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgYm90ISddLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC9uZXN0ZWQvZGVmYXVsdC5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCBib3QhJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0L25lc3RlZC9zcGVjaWZpYy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCBib3QhJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0L25lc3RlZC91bnNwZWNpZmljMS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCByb2JvdCEnXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvbmVzdGVkL3Vuc3BlY2lmaWMyLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIHJhd2JvdCEnXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvbmVzdGVkL3JlYWRtZS5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnbm9uIHByb21wdCBmaWxlJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHRcdGNvbnN0IGxvY2F0b3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRGaWxlc0xvY2F0b3IpO1xuXG5cdFx0XHRcdFx0XHRhc3NlcnRPdXRjb21lKFxuXHRcdFx0XHRcdFx0XHRhd2FpdCBsb2NhdG9yLmxpc3RGaWxlcyhQcm9tcHRzVHlwZS5wcm9tcHQsIFByb21wdHNTdG9yYWdlLmxvY2FsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSxcblx0XHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9kZXBzL3RleHQvbmVzdGVkL3NwZWNpZmljLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2RlcHMvdGV4dC9uZXN0ZWQvdW5zcGVjaWZpYzEucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZGVwcy90ZXh0L25lc3RlZC91bnNwZWNpZmljMi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHQnTXVzdCBmaW5kIGNvcnJlY3QgcHJvbXB0cy4nLFxuXHRcdFx0XHRcdFx0KTtcblxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdFQoJ2NvcmUgbG9naWMnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0TG9jYXRpb25zKHtcblx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMnOiB0cnVlLFxuXHRcdFx0Jy90bXAvcHJvbXB0cy8nOiB0cnVlLFxuXHRcdFx0Jy9hYnNvbHV0ZS9wYXRoL3Byb21wdHMnOiBmYWxzZSxcblx0XHRcdCcuY29waWxvdC9wcm9tcHRzJzogdHJ1ZSxcblx0XHR9KTtcblx0XHRzZXRXb3Jrc3BhY2VGb2xkZXJzKFtcblx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZScsXG5cdFx0XSk7XG5cdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHR7XG5cdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMvdGVzdC5wcm9tcHQubWQnLFxuXHRcdFx0XHRjb250ZW50czogWydIZWxsbywgV29ybGQhJ10sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzL3JlZmFjdG9yLXRlc3RzLnByb21wdC5tZCcsXG5cdFx0XHRcdGNvbnRlbnRzOiBbJ3NvbWUgZmlsZSBjb250ZW50IGdvZXMgaGVyZSddLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0cGF0aDogJy90bXAvcHJvbXB0cy90cmFuc2xhdGUudG8tcnVzdC5wcm9tcHQubWQnLFxuXHRcdFx0XHRjb250ZW50czogWydzb21lIG1vcmUgcmFuZG9tIGZpbGUgY29udGVudHMnXSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHBhdGg6ICcvYWJzb2x1dGUvcGF0aC9wcm9tcHRzL3NvbWUtcHJvbXB0LWZpbGUucHJvbXB0Lm1kJyxcblx0XHRcdFx0Y29udGVudHM6IFsnaGV5IGhleSBoZXknXSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8uY29waWxvdC9wcm9tcHRzL2RlZmF1bHQucHJvbXB0Lm1kJyxcblx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIHJvYm90ISddLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLy5naXRodWIvcHJvbXB0cy9teS5wcm9tcHQubWQnLFxuXHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgYm90ISddLFxuXHRcdFx0fSxcblx0XHRdKTtcblx0XHRjb25zdCBsb2NhdG9yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0RmlsZXNMb2NhdG9yKTtcblxuXHRcdGFzc2VydE91dGNvbWUoXG5cdFx0XHRhd2FpdCBsb2NhdG9yLmxpc3RGaWxlcyhQcm9tcHRzVHlwZS5wcm9tcHQsIFByb21wdHNTdG9yYWdlLmxvY2FsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSxcblx0XHRcdFtcblx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLy5naXRodWIvcHJvbXB0cy9teS5wcm9tcHQubWQnLFxuXHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzL3Rlc3QucHJvbXB0Lm1kJyxcblx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cy9yZWZhY3Rvci10ZXN0cy5wcm9tcHQubWQnLFxuXHRcdFx0XHQnL3RtcC9wcm9tcHRzL3RyYW5zbGF0ZS50by1ydXN0LnByb21wdC5tZCcsXG5cdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8uY29waWxvdC9wcm9tcHRzL2RlZmF1bHQucHJvbXB0Lm1kJyxcblx0XHRcdF0sXG5cdFx0XHQnTXVzdCBmaW5kIGNvcnJlY3QgcHJvbXB0cy4nLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3RUKCd3aXRoIGRpc2FibGVkIGAuZ2l0aHViL3Byb21wdHNgIGxvY2F0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldExvY2F0aW9ucyh7XG5cdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzJzogdHJ1ZSxcblx0XHRcdCcvdG1wL3Byb21wdHMvJzogdHJ1ZSxcblx0XHRcdCcvYWJzb2x1dGUvcGF0aC9wcm9tcHRzJzogZmFsc2UsXG5cdFx0XHQnLmNvcGlsb3QvcHJvbXB0cyc6IHRydWUsXG5cdFx0XHQnLmdpdGh1Yi9wcm9tcHRzJzogZmFsc2UsXG5cdFx0fSk7XG5cdFx0c2V0V29ya3NwYWNlRm9sZGVycyhbXG5cdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUnLFxuXHRcdF0pO1xuXHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0e1xuXHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzL3Rlc3QucHJvbXB0Lm1kJyxcblx0XHRcdFx0Y29udGVudHM6IFsnSGVsbG8sIFdvcmxkISddLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cy9yZWZhY3Rvci10ZXN0cy5wcm9tcHQubWQnLFxuXHRcdFx0XHRjb250ZW50czogWydzb21lIGZpbGUgY29udGVudCBnb2VzIGhlcmUnXSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHBhdGg6ICcvdG1wL3Byb21wdHMvdHJhbnNsYXRlLnRvLXJ1c3QucHJvbXB0Lm1kJyxcblx0XHRcdFx0Y29udGVudHM6IFsnc29tZSBtb3JlIHJhbmRvbSBmaWxlIGNvbnRlbnRzJ10sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRwYXRoOiAnL2Fic29sdXRlL3BhdGgvcHJvbXB0cy9zb21lLXByb21wdC1maWxlLnByb21wdC5tZCcsXG5cdFx0XHRcdGNvbnRlbnRzOiBbJ2hleSBoZXkgaGV5J10sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvLmNvcGlsb3QvcHJvbXB0cy9kZWZhdWx0LnByb21wdC5tZCcsXG5cdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCByb2JvdCEnXSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8uZ2l0aHViL3Byb21wdHMvbXkucHJvbXB0Lm1kJyxcblx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIGJvdCEnXSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8uZ2l0aHViL3Byb21wdHMveW91ci5wcm9tcHQubWQnLFxuXHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgYm90ISddLFxuXHRcdFx0fSxcblx0XHRdKTtcblx0XHRjb25zdCBsb2NhdG9yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0RmlsZXNMb2NhdG9yKTtcblxuXHRcdGFzc2VydE91dGNvbWUoXG5cdFx0XHRhd2FpdCBsb2NhdG9yLmxpc3RGaWxlcyhQcm9tcHRzVHlwZS5wcm9tcHQsIFByb21wdHNTdG9yYWdlLmxvY2FsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSxcblx0XHRcdFtcblx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cy90ZXN0LnByb21wdC5tZCcsXG5cdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMvcmVmYWN0b3ItdGVzdHMucHJvbXB0Lm1kJyxcblx0XHRcdFx0Jy90bXAvcHJvbXB0cy90cmFuc2xhdGUudG8tcnVzdC5wcm9tcHQubWQnLFxuXHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvLmNvcGlsb3QvcHJvbXB0cy9kZWZhdWx0LnByb21wdC5tZCcsXG5cdFx0XHRdLFxuXHRcdFx0J011c3QgZmluZCBjb3JyZWN0IHByb21wdHMuJyxcblx0XHQpO1xuXHR9KTtcblxuXHRzdWl0ZSgnbXVsdGktcm9vdCB3b3Jrc3BhY2UnLCAoKSA9PiB7XG5cdFx0c3VpdGUoJ2NvcmUgbG9naWMnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0VCgnd2l0aG91dCB0b3AtbGV2ZWwgYC5naXRodWJgIGZvbGRlcicsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0c2V0TG9jYXRpb25zKHtcblx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzJzogdHJ1ZSxcblx0XHRcdFx0XHQnL3RtcC9wcm9tcHRzLyc6IHRydWUsXG5cdFx0XHRcdFx0Jy9hYnNvbHV0ZS9wYXRoL3Byb21wdHMnOiBmYWxzZSxcblx0XHRcdFx0XHQnLmNvcGlsb3QvcHJvbXB0cyc6IGZhbHNlLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0c2V0V29ya3NwYWNlRm9sZGVycyhbXG5cdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlJyxcblx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9ub2RlJyxcblx0XHRcdFx0XSk7XG5cdFx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMvdGVzdC5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6IFsnSGVsbG8sIFdvcmxkISddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cy9yZWZhY3Rvci10ZXN0cy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6IFsnc29tZSBmaWxlIGNvbnRlbnQgZ29lcyBoZXJlJ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwYXRoOiAnL3RtcC9wcm9tcHRzL3RyYW5zbGF0ZS50by1ydXN0LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRjb250ZW50czogWydzb21lIG1vcmUgcmFuZG9tIGZpbGUgY29udGVudHMnXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHBhdGg6ICcvYWJzb2x1dGUvcGF0aC9wcm9tcHRzL3NvbWUtcHJvbXB0LWZpbGUucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ2hleSBoZXkgaGV5J10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvLmNvcGlsb3QvcHJvbXB0cy9wcm9tcHQxLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgcm9ib3QhJ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvLmdpdGh1Yi9wcm9tcHRzL2RlZmF1bHQucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCBib3QhJ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9ub2RlLy5jb3BpbG90L3Byb21wdHMvcHJvbXB0NS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIHJvYm90ISddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mvbm9kZS8uZ2l0aHViL3Byb21wdHMvcmVmYWN0b3Itc3RhdGljLWNsYXNzZXMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ2ZpbGUgY29udGVudHMnXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLy5naXRodWIvcHJvbXB0cy9wcm9tcHQtbmFtZS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIHJvYm90ISddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvLmdpdGh1Yi9wcm9tcHRzL25hbWUtb2YtdGhlLXByb21wdC5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIHJhdyBib3QhJ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XSk7XG5cdFx0XHRcdGNvbnN0IGxvY2F0b3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRGaWxlc0xvY2F0b3IpO1xuXG5cdFx0XHRcdGFzc2VydE91dGNvbWUoXG5cdFx0XHRcdFx0YXdhaXQgbG9jYXRvci5saXN0RmlsZXMoUHJvbXB0c1R5cGUucHJvbXB0LCBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLy5naXRodWIvcHJvbXB0cy9kZWZhdWx0LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9ub2RlLy5naXRodWIvcHJvbXB0cy9yZWZhY3Rvci1zdGF0aWMtY2xhc3Nlcy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cy90ZXN0LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzL3JlZmFjdG9yLXRlc3RzLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHQnL3RtcC9wcm9tcHRzL3RyYW5zbGF0ZS50by1ydXN0LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHQnTXVzdCBmaW5kIGNvcnJlY3QgcHJvbXB0cy4nLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3RUKCd3aXRoIHRvcC1sZXZlbCBgLmdpdGh1YmAgZm9sZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRzZXRMb2NhdGlvbnMoe1xuXHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMnOiB0cnVlLFxuXHRcdFx0XHRcdCcvdG1wL3Byb21wdHMvJzogdHJ1ZSxcblx0XHRcdFx0XHQnL2Fic29sdXRlL3BhdGgvcHJvbXB0cyc6IGZhbHNlLFxuXHRcdFx0XHRcdCcuY29waWxvdC9wcm9tcHRzJzogZmFsc2UsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRzZXRXb3Jrc3BhY2VGb2xkZXJzKFtcblx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUnLFxuXHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL25vZGUnLFxuXHRcdFx0XHRcdCcvdmFyL3NoYXJlZC9wcm9tcHRzJyxcblx0XHRcdFx0XSk7XG5cdFx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMvdGVzdC5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6IFsnSGVsbG8sIFdvcmxkISddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cy9yZWZhY3Rvci10ZXN0cy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6IFsnc29tZSBmaWxlIGNvbnRlbnQgZ29lcyBoZXJlJ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwYXRoOiAnL3RtcC9wcm9tcHRzL3RyYW5zbGF0ZS50by1ydXN0LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRjb250ZW50czogWydzb21lIG1vcmUgcmFuZG9tIGZpbGUgY29udGVudHMnXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHBhdGg6ICcvYWJzb2x1dGUvcGF0aC9wcm9tcHRzL3NvbWUtcHJvbXB0LWZpbGUucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ2hleSBoZXkgaGV5J10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvLmNvcGlsb3QvcHJvbXB0cy9wcm9tcHQxLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgcm9ib3QhJ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvLmdpdGh1Yi9wcm9tcHRzL2RlZmF1bHQucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCBib3QhJ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9ub2RlLy5jb3BpbG90L3Byb21wdHMvcHJvbXB0NS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIHJvYm90ISddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mvbm9kZS8uZ2l0aHViL3Byb21wdHMvcmVmYWN0b3Itc3RhdGljLWNsYXNzZXMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ2ZpbGUgY29udGVudHMnXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHBhdGg6ICcvdmFyL3NoYXJlZC9wcm9tcHRzLy5naXRodWIvcHJvbXB0cy9wcm9tcHQtbmFtZS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIHJvYm90ISddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cGF0aDogJy92YXIvc2hhcmVkL3Byb21wdHMvLmdpdGh1Yi9wcm9tcHRzL25hbWUtb2YtdGhlLXByb21wdC5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIHJhdyBib3QhJ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XSk7XG5cdFx0XHRcdGNvbnN0IGxvY2F0b3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRGaWxlc0xvY2F0b3IpO1xuXG5cdFx0XHRcdGFzc2VydE91dGNvbWUoXG5cdFx0XHRcdFx0YXdhaXQgbG9jYXRvci5saXN0RmlsZXMoUHJvbXB0c1R5cGUucHJvbXB0LCBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLy5naXRodWIvcHJvbXB0cy9kZWZhdWx0LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9ub2RlLy5naXRodWIvcHJvbXB0cy9yZWZhY3Rvci1zdGF0aWMtY2xhc3Nlcy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Jy92YXIvc2hhcmVkL3Byb21wdHMvLmdpdGh1Yi9wcm9tcHRzL3Byb21wdC1uYW1lLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHQnL3Zhci9zaGFyZWQvcHJvbXB0cy8uZ2l0aHViL3Byb21wdHMvbmFtZS1vZi10aGUtcHJvbXB0LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzL3Rlc3QucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMvcmVmYWN0b3ItdGVzdHMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdCcvdG1wL3Byb21wdHMvdHJhbnNsYXRlLnRvLXJ1c3QucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdCdNdXN0IGZpbmQgY29ycmVjdCBwcm9tcHRzLicsXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdFQoJ3dpdGggZGlzYWJsZWQgYC5naXRodWIvcHJvbXB0c2AgbG9jYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHNldExvY2F0aW9ucyh7XG5cdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cyc6IHRydWUsXG5cdFx0XHRcdFx0Jy90bXAvcHJvbXB0cy8nOiB0cnVlLFxuXHRcdFx0XHRcdCcvYWJzb2x1dGUvcGF0aC9wcm9tcHRzJzogZmFsc2UsXG5cdFx0XHRcdFx0Jy5jb3BpbG90L3Byb21wdHMnOiBmYWxzZSxcblx0XHRcdFx0XHQnLmdpdGh1Yi9wcm9tcHRzJzogZmFsc2UsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRzZXRXb3Jrc3BhY2VGb2xkZXJzKFtcblx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUnLFxuXHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL25vZGUnLFxuXHRcdFx0XHRcdCcvdmFyL3NoYXJlZC9wcm9tcHRzJyxcblx0XHRcdFx0XSk7XG5cdFx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMvdGVzdC5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6IFsnSGVsbG8sIFdvcmxkISddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cy9yZWZhY3Rvci10ZXN0cy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6IFsnc29tZSBmaWxlIGNvbnRlbnQgZ29lcyBoZXJlJ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwYXRoOiAnL3RtcC9wcm9tcHRzL3RyYW5zbGF0ZS50by1ydXN0LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRjb250ZW50czogWydzb21lIG1vcmUgcmFuZG9tIGZpbGUgY29udGVudHMnXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHBhdGg6ICcvYWJzb2x1dGUvcGF0aC9wcm9tcHRzL3NvbWUtcHJvbXB0LWZpbGUucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ2hleSBoZXkgaGV5J10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvLmNvcGlsb3QvcHJvbXB0cy9wcm9tcHQxLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgcm9ib3QhJ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvLmdpdGh1Yi9wcm9tcHRzL2RlZmF1bHQucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCBib3QhJ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9ub2RlLy5jb3BpbG90L3Byb21wdHMvcHJvbXB0NS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIHJvYm90ISddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mvbm9kZS8uZ2l0aHViL3Byb21wdHMvcmVmYWN0b3Itc3RhdGljLWNsYXNzZXMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ2ZpbGUgY29udGVudHMnXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHBhdGg6ICcvdmFyL3NoYXJlZC9wcm9tcHRzLy5naXRodWIvcHJvbXB0cy9wcm9tcHQtbmFtZS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIHJvYm90ISddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cGF0aDogJy92YXIvc2hhcmVkL3Byb21wdHMvLmdpdGh1Yi9wcm9tcHRzL25hbWUtb2YtdGhlLXByb21wdC5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIHJhdyBib3QhJ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XSk7XG5cdFx0XHRcdGNvbnN0IGxvY2F0b3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRGaWxlc0xvY2F0b3IpO1xuXG5cdFx0XHRcdGFzc2VydE91dGNvbWUoXG5cdFx0XHRcdFx0YXdhaXQgbG9jYXRvci5saXN0RmlsZXMoUHJvbXB0c1R5cGUucHJvbXB0LCBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cy90ZXN0LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzL3JlZmFjdG9yLXRlc3RzLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHQnL3RtcC9wcm9tcHRzL3RyYW5zbGF0ZS50by1ydXN0LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHQnTXVzdCBmaW5kIGNvcnJlY3QgcHJvbXB0cy4nLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3RUKCdtaXhlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0c2V0TG9jYXRpb25zKHtcblx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi8qdGVzdConOiB0cnVlLFxuXHRcdFx0XHRcdCcuY29waWxvdC9wcm9tcHRzJzogZmFsc2UsXG5cdFx0XHRcdFx0Jy5naXRodWIvcHJvbXB0cyc6IHRydWUsXG5cdFx0XHRcdFx0Jy9hYnNvbHV0ZS9wYXRoL3Byb21wdHMvc29tZS1wcm9tcHQtZmlsZS5wcm9tcHQubWQnOiB0cnVlLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0c2V0V29ya3NwYWNlRm9sZGVycyhbXG5cdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlJyxcblx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9ub2RlJyxcblx0XHRcdFx0XHQnL3Zhci9zaGFyZWQvcHJvbXB0cycsXG5cdFx0XHRcdF0pO1xuXHRcdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzL3Rlc3QucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ0hlbGxvLCBXb3JsZCEnXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMvcmVmYWN0b3ItdGVzdHMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ3NvbWUgZmlsZSBjb250ZW50IGdvZXMgaGVyZSddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cy9lbGYucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ2hhYWxvISddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cGF0aDogJy90bXAvcHJvbXB0cy90cmFuc2xhdGUudG8tcnVzdC5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6IFsnc29tZSBtb3JlIHJhbmRvbSBmaWxlIGNvbnRlbnRzJ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwYXRoOiAnL2Fic29sdXRlL3BhdGgvcHJvbXB0cy9zb21lLXByb21wdC1maWxlLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRjb250ZW50czogWydoZXkgaGV5IGhleSddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLy5jb3BpbG90L3Byb21wdHMvcHJvbXB0MS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIHJvYm90ISddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLy5naXRodWIvcHJvbXB0cy9kZWZhdWx0LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgYm90ISddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mvbm9kZS8uY29waWxvdC9wcm9tcHRzL3Byb21wdDUucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCByb2JvdCEnXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL25vZGUvLmdpdGh1Yi9wcm9tcHRzL3JlZmFjdG9yLXN0YXRpYy1jbGFzc2VzLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRjb250ZW50czogWydmaWxlIGNvbnRlbnRzJ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwYXRoOiAnL3Zhci9zaGFyZWQvcHJvbXB0cy8uZ2l0aHViL3Byb21wdHMvcHJvbXB0LW5hbWUucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCByb2JvdCEnXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHBhdGg6ICcvdmFyL3NoYXJlZC9wcm9tcHRzLy5naXRodWIvcHJvbXB0cy9uYW1lLW9mLXRoZS1wcm9tcHQucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCByYXcgYm90ISddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdF0pO1xuXHRcdFx0XHRjb25zdCBsb2NhdG9yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0RmlsZXNMb2NhdG9yKTtcblxuXHRcdFx0XHRhc3NlcnRPdXRjb21lKFxuXHRcdFx0XHRcdGF3YWl0IGxvY2F0b3IubGlzdEZpbGVzKFByb21wdHNUeXBlLnByb21wdCwgUHJvbXB0c1N0b3JhZ2UubG9jYWwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdC8vIGFsbCBvZiB0aGVzZSBhcmUgZHVlIHRvIHRoZSBgLmdpdGh1Yi9wcm9tcHRzYCBzZXR0aW5nXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvLmdpdGh1Yi9wcm9tcHRzL2RlZmF1bHQucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL25vZGUvLmdpdGh1Yi9wcm9tcHRzL3JlZmFjdG9yLXN0YXRpYy1jbGFzc2VzLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHQnL3Zhci9zaGFyZWQvcHJvbXB0cy8uZ2l0aHViL3Byb21wdHMvcHJvbXB0LW5hbWUucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdCcvdmFyL3NoYXJlZC9wcm9tcHRzLy5naXRodWIvcHJvbXB0cy9uYW1lLW9mLXRoZS1wcm9tcHQucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdC8vIGFsbCBvZiB0aGVzZSBhcmUgZHVlIHRvIHRoZSBgL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi8qdGVzdCpgIHNldHRpbmdcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMvdGVzdC5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cy9yZWZhY3Rvci10ZXN0cy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Ly8gdGhpcyBvbmUgaXMgZHVlIHRvIHRoZSBzcGVjaWZpYyBgL2Fic29sdXRlL3BhdGgvcHJvbXB0cy9zb21lLXByb21wdC1maWxlLnByb21wdC5tZGAgc2V0dGluZ1xuXHRcdFx0XHRcdFx0Jy9hYnNvbHV0ZS9wYXRoL3Byb21wdHMvc29tZS1wcm9tcHQtZmlsZS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0J011c3QgZmluZCBjb3JyZWN0IHByb21wdHMuJyxcblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ2dsb2IgcGF0dGVybicsICgpID0+IHtcblx0XHRcdHN1aXRlKCdyZWxhdGl2ZScsICgpID0+IHtcblx0XHRcdFx0dGVzdFQoJ3dpbGQgY2FyZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRjb25zdCB0ZXN0U2V0dGluZ3MgPSBbXG5cdFx0XHRcdFx0XHQnKionLFxuXHRcdFx0XHRcdFx0JyoqLyoucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdCcqKi8qLm1kJyxcblx0XHRcdFx0XHRcdCcqKi8qJyxcblx0XHRcdFx0XHRcdCdnZW4qLyoqJyxcblx0XHRcdFx0XHRcdCdnZW4qLyoqLyoucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdCdnZW4qLyoqLyonLFxuXHRcdFx0XHRcdFx0J2dlbiovKiovKi5tZCcsXG5cdFx0XHRcdFx0XHQnKiovZ2VuKi8qKicsXG5cdFx0XHRcdFx0XHQnKiovZ2VuKi8qKi8qJyxcblx0XHRcdFx0XHRcdCcqKi9nZW4qLyoqLyoubWQnLFxuXHRcdFx0XHRcdFx0JyoqL2dlbiovKiovKi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0J3tnZW5lcmljLGdlbmVyYWwsZ2VufS8qKicsXG5cdFx0XHRcdFx0XHQne2dlbmVyaWMsZ2VuZXJhbCxnZW59LyoqLyoucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdCd7Z2VuZXJpYyxnZW5lcmFsLGdlbn0vKiovKicsXG5cdFx0XHRcdFx0XHQne2dlbmVyaWMsZ2VuZXJhbCxnZW59LyoqLyoubWQnLFxuXHRcdFx0XHRcdFx0JyoqL3tnZW5lcmljLGdlbmVyYWwsZ2VufS8qKicsXG5cdFx0XHRcdFx0XHQnKiove2dlbmVyaWMsZ2VuZXJhbCxnZW59LyoqLyonLFxuXHRcdFx0XHRcdFx0JyoqL3tnZW5lcmljLGdlbmVyYWwsZ2VufS8qKi8qLm1kJyxcblx0XHRcdFx0XHRcdCcqKi97Z2VuZXJpYyxnZW5lcmFsLGdlbn0vKiovKi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdF07XG5cblx0XHRcdFx0XHRmb3IgKGNvbnN0IHNldHRpbmcgb2YgdGVzdFNldHRpbmdzKSB7XG5cblx0XHRcdFx0XHRcdHNldExvY2F0aW9ucyh7IFtzZXR0aW5nXTogdHJ1ZSB9KTtcblx0XHRcdFx0XHRcdHNldFdvcmtzcGFjZUZvbGRlcnMoW1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzJyxcblx0XHRcdFx0XHRcdF0pO1xuXHRcdFx0XHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZ2VuL3RleHQvbXkucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgYm90ISddLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2dlbi90ZXh0L25lc3RlZC9zcGVjaWZpYy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCBib3QhJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZ2VuL3RleHQvbmVzdGVkL3Vuc3BlY2lmaWMxLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIHJvYm90ISddLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2dlbi90ZXh0L25lc3RlZC91bnNwZWNpZmljMi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCByYWJvdCEnXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9nZW4vdGV4dC9uZXN0ZWQvcmVhZG1lLm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogWydub24gcHJvbXB0IGZpbGUnXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMvZ2VuZXJhbC9jb21tb24ucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgYm90ISddLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cy9nZW5lcmFsL3VuY29tbW9uLTEwLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIHJvYm90ISddLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cy9nZW5lcmFsL2xpY2Vuc2UubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ25vbiBwcm9tcHQgZmlsZSddLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XSk7XG5cdFx0XHRcdFx0XHRjb25zdCBsb2NhdG9yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0RmlsZXNMb2NhdG9yKTtcblxuXHRcdFx0XHRcdFx0YXNzZXJ0T3V0Y29tZShcblx0XHRcdFx0XHRcdFx0YXdhaXQgbG9jYXRvci5saXN0RmlsZXMoUHJvbXB0c1R5cGUucHJvbXB0LCBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksXG5cdFx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZ2VuL3RleHQvbXkucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZ2VuL3RleHQvbmVzdGVkL3NwZWNpZmljLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2dlbi90ZXh0L25lc3RlZC91bnNwZWNpZmljMS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9nZW4vdGV4dC9uZXN0ZWQvdW5zcGVjaWZpYzIucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHQvLyAtXG5cdFx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cy9nZW5lcmFsL2NvbW1vbi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMvZ2VuZXJhbC91bmNvbW1vbi0xMC5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHQnTXVzdCBmaW5kIGNvcnJlY3QgcHJvbXB0cy4nLFxuXHRcdFx0XHRcdFx0KTtcblxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dGVzdFQoYHNwZWNpZmljYCwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHRlc3RTZXR0aW5ncyA9IFtcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0JyoqL215LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcqKi8qc3BlY2lmaWMqJyxcblx0XHRcdFx0XHRcdFx0JyoqLypjb21tb24qJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcqKi9teS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnKiovKnNwZWNpZmljKi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnKiovKmNvbW1vbioucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcqKi9teSoubWQnLFxuXHRcdFx0XHRcdFx0XHQnKiovKnNwZWNpZmljKi5tZCcsXG5cdFx0XHRcdFx0XHRcdCcqKi8qY29tbW9uKi5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnKiovbXkqLm1kJyxcblx0XHRcdFx0XHRcdFx0JyoqL3NwZWNpZmljKicsXG5cdFx0XHRcdFx0XHRcdCcqKi91bnNwZWNpZmljKicsXG5cdFx0XHRcdFx0XHRcdCcqKi9jb21tb24qJyxcblx0XHRcdFx0XHRcdFx0JyoqL3VuY29tbW9uKicsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnKiovbXkucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0JyoqL3NwZWNpZmljLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcqKi91bnNwZWNpZmljMS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnKiovdW5zcGVjaWZpYzIucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0JyoqL2NvbW1vbi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnKiovdW5jb21tb24tMTAucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCdnZW4qLyoqL215LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCdnZW4qLyoqLypzcGVjaWZpYyonLFxuXHRcdFx0XHRcdFx0XHQnZ2VuKi8qKi8qY29tbW9uKicsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnZ2VuKi8qKi9teS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnZ2VuKi8qKi8qc3BlY2lmaWMqLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCdnZW4qLyoqLypjb21tb24qLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnZ2VuKi8qKi9teSoubWQnLFxuXHRcdFx0XHRcdFx0XHQnZ2VuKi8qKi8qc3BlY2lmaWMqLm1kJyxcblx0XHRcdFx0XHRcdFx0J2dlbiovKiovKmNvbW1vbioubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0J2dlbiovKiovbXkqLm1kJyxcblx0XHRcdFx0XHRcdFx0J2dlbiovKiovc3BlY2lmaWMqJyxcblx0XHRcdFx0XHRcdFx0J2dlbiovKiovdW5zcGVjaWZpYyonLFxuXHRcdFx0XHRcdFx0XHQnZ2VuKi8qKi9jb21tb24qJyxcblx0XHRcdFx0XHRcdFx0J2dlbiovKiovdW5jb21tb24qJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCdnZW4qLyoqL215LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCdnZW4qLyoqL3NwZWNpZmljLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCdnZW4qLyoqL3Vuc3BlY2lmaWMxLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCdnZW4qLyoqL3Vuc3BlY2lmaWMyLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCdnZW4qLyoqL2NvbW1vbi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnZ2VuKi8qKi91bmNvbW1vbi0xMC5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0J2dlbi90ZXh0L215LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCdnZW4vdGV4dC9uZXN0ZWQvc3BlY2lmaWMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0J2dlbi90ZXh0L25lc3RlZC91bnNwZWNpZmljMS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnZ2VuL3RleHQvbmVzdGVkL3Vuc3BlY2lmaWMyLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCdnZW5lcmFsL2NvbW1vbi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnZ2VuZXJhbC91bmNvbW1vbi0xMC5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0J2dlbi90ZXh0L215LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCdnZW4vdGV4dC9uZXN0ZWQvKnNwZWNpZmljKicsXG5cdFx0XHRcdFx0XHRcdCdnZW5lcmFsLypjb21tb24qJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCdnZW4vdGV4dC9teS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnZ2VuL3RleHQvKiovc3BlY2lmaWMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0J2dlbi90ZXh0LyoqL3Vuc3BlY2lmaWMxLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCdnZW4vdGV4dC8qKi91bnNwZWNpZmljMi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnZ2VuZXJhbC8qJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCd7Z2VuLGdlbmVyYWx9LyoqL215LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCd7Z2VuLGdlbmVyYWx9LyoqLypzcGVjaWZpYyonLFxuXHRcdFx0XHRcdFx0XHQne2dlbixnZW5lcmFsfS8qKi8qY29tbW9uKicsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQne2dlbixnZW5lcmFsfS8qKi9teS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQne2dlbixnZW5lcmFsfS8qKi8qc3BlY2lmaWMqLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCd7Z2VuLGdlbmVyYWx9LyoqLypjb21tb24qLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQne2dlbixnZW5lcmFsfS8qKi9teSoubWQnLFxuXHRcdFx0XHRcdFx0XHQne2dlbixnZW5lcmFsfS8qKi8qc3BlY2lmaWMqLm1kJyxcblx0XHRcdFx0XHRcdFx0J3tnZW4sZ2VuZXJhbH0vKiovKmNvbW1vbioubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0J3tnZW4sZ2VuZXJhbH0vKiovbXkqLm1kJyxcblx0XHRcdFx0XHRcdFx0J3tnZW4sZ2VuZXJhbH0vKiovc3BlY2lmaWMqJyxcblx0XHRcdFx0XHRcdFx0J3tnZW4sZ2VuZXJhbH0vKiovdW5zcGVjaWZpYyonLFxuXHRcdFx0XHRcdFx0XHQne2dlbixnZW5lcmFsfS8qKi9jb21tb24qJyxcblx0XHRcdFx0XHRcdFx0J3tnZW4sZ2VuZXJhbH0vKiovdW5jb21tb24qJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCd7Z2VuLGdlbmVyYWx9LyoqL215LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCd7Z2VuLGdlbmVyYWx9LyoqL3NwZWNpZmljLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCd7Z2VuLGdlbmVyYWx9LyoqL3Vuc3BlY2lmaWMxLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCd7Z2VuLGdlbmVyYWx9LyoqL3Vuc3BlY2lmaWMyLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCd7Z2VuLGdlbmVyYWx9LyoqL2NvbW1vbi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQne2dlbixnZW5lcmFsfS8qKi91bmNvbW1vbi0xMC5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRdO1xuXG5cdFx0XHRcdFx0Zm9yIChjb25zdCBzZXR0aW5ncyBvZiB0ZXN0U2V0dGluZ3MpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHZzY29kZVNldHRpbmdzOiBSZWNvcmQ8c3RyaW5nLCBib29sZWFuPiA9IHt9O1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBzZXR0aW5nIG9mIHNldHRpbmdzKSB7XG5cdFx0XHRcdFx0XHRcdHZzY29kZVNldHRpbmdzW3NldHRpbmddID0gdHJ1ZTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0c2V0TG9jYXRpb25zKHZzY29kZVNldHRpbmdzKTtcblx0XHRcdFx0XHRcdHNldFdvcmtzcGFjZUZvbGRlcnMoW1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzJyxcblx0XHRcdFx0XHRcdF0pO1xuXHRcdFx0XHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZ2VuL3RleHQvbXkucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgYm90ISddLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2dlbi90ZXh0L25lc3RlZC9zcGVjaWZpYy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCBib3QhJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZ2VuL3RleHQvbmVzdGVkL3Vuc3BlY2lmaWMxLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIHJvYm90ISddLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2dlbi90ZXh0L25lc3RlZC91bnNwZWNpZmljMi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCByYWJvdCEnXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9nZW4vdGV4dC9uZXN0ZWQvcmVhZG1lLm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogWydub24gcHJvbXB0IGZpbGUnXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMvZ2VuZXJhbC9jb21tb24ucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgYm90ISddLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cy9nZW5lcmFsL3VuY29tbW9uLTEwLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIHJvYm90ISddLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cy9nZW5lcmFsL2xpY2Vuc2UubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ25vbiBwcm9tcHQgZmlsZSddLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XSk7XG5cdFx0XHRcdFx0XHRjb25zdCBsb2NhdG9yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0RmlsZXNMb2NhdG9yKTtcblxuXHRcdFx0XHRcdFx0YXNzZXJ0T3V0Y29tZShcblx0XHRcdFx0XHRcdFx0YXdhaXQgbG9jYXRvci5saXN0RmlsZXMoUHJvbXB0c1R5cGUucHJvbXB0LCBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksXG5cdFx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZ2VuL3RleHQvbXkucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZ2VuL3RleHQvbmVzdGVkL3NwZWNpZmljLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2dlbi90ZXh0L25lc3RlZC91bnNwZWNpZmljMS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9nZW4vdGV4dC9uZXN0ZWQvdW5zcGVjaWZpYzIucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHQvLyAtXG5cdFx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cy9nZW5lcmFsL2NvbW1vbi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMvZ2VuZXJhbC91bmNvbW1vbi0xMC5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHQnTXVzdCBmaW5kIGNvcnJlY3QgcHJvbXB0cy4nLFxuXHRcdFx0XHRcdFx0KTtcblxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0c3VpdGUoJ2Fic29sdXRlJywgKCkgPT4ge1xuXHRcdFx0XHR0ZXN0VCgnd2lsZCBjYXJkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHRlc3RTZXR0aW5ncyA9IFtcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqLyoucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqLyoubWQnLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiovKicsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi9nZW4qLyoqJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL2dlbiovKiovKi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiovZ2VuKi8qKi8qJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL2dlbiovKiovKi5tZCcsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi9nZW4qLyoqJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL2dlbiovKiovKicsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi9nZW4qLyoqLyoubWQnLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiovZ2VuKi8qKi8qLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy97dnNjb2RlLHByb21wdHN9LyoqJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3t2c2NvZGUscHJvbXB0c30vKiovKi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mve3ZzY29kZSxwcm9tcHRzfS8qKi8qLm1kJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3t2c2NvZGUscHJvbXB0c30vKiovKicsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy97dnNjb2RlLHByb21wdHN9LyoqL2dlbiovKionLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mve3ZzY29kZSxwcm9tcHRzfS8qKi9nZW4qLyoqLyoucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3t2c2NvZGUscHJvbXB0c30vKiovZ2VuKi8qKi8qJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3t2c2NvZGUscHJvbXB0c30vKiovZ2VuKi8qKi8qLm1kJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3t2c2NvZGUscHJvbXB0c30vKiovZ2VuKi8qKicsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy97dnNjb2RlLHByb21wdHN9LyoqL2dlbiovKiovKicsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy97dnNjb2RlLHByb21wdHN9LyoqL2dlbiovKiovKi5tZCcsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy97dnNjb2RlLHByb21wdHN9LyoqL2dlbiovKiovKi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mve3ZzY29kZSxwcm9tcHRzfS8qKi97Z2VuZXJhbCxnZW59LyoqJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3t2c2NvZGUscHJvbXB0c30vKiove2dlbmVyYWwsZ2VufS8qKi8qLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy97dnNjb2RlLHByb21wdHN9LyoqL3tnZW5lcmFsLGdlbn0vKiovKicsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy97dnNjb2RlLHByb21wdHN9LyoqL3tnZW5lcmFsLGdlbn0vKiovKi5tZCcsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy97dnNjb2RlLHByb21wdHN9LyoqL3tnZW5lcmFsLGdlbn0vKionLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mve3ZzY29kZSxwcm9tcHRzfS8qKi97Z2VuZXJhbCxnZW59LyoqLyonLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mve3ZzY29kZSxwcm9tcHRzfS8qKi97Z2VuZXJhbCxnZW59LyoqLyoubWQnLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mve3ZzY29kZSxwcm9tcHRzfS8qKi97Z2VuZXJhbCxnZW59LyoqLyoucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRdO1xuXG5cdFx0XHRcdFx0Zm9yIChjb25zdCBzZXR0aW5nIG9mIHRlc3RTZXR0aW5ncykge1xuXHRcdFx0XHRcdFx0c2V0TG9jYXRpb25zKHsgW3NldHRpbmddOiB0cnVlIH0pO1xuXHRcdFx0XHRcdFx0c2V0V29ya3NwYWNlRm9sZGVycyhbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZScsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMnLFxuXHRcdFx0XHRcdFx0XSk7XG5cdFx0XHRcdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9nZW4vdGV4dC9teS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCBib3QhJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZ2VuL3RleHQvbmVzdGVkL3NwZWNpZmljLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIGJvdCEnXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9nZW4vdGV4dC9uZXN0ZWQvdW5zcGVjaWZpYzEucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgcm9ib3QhJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZ2VuL3RleHQvbmVzdGVkL3Vuc3BlY2lmaWMyLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIHJhYm90ISddLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2dlbi90ZXh0L25lc3RlZC9yZWFkbWUubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ25vbiBwcm9tcHQgZmlsZSddLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cy9nZW5lcmFsL2NvbW1vbi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCBib3QhJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzL2dlbmVyYWwvdW5jb21tb24tMTAucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgcm9ib3QhJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzL2dlbmVyYWwvbGljZW5zZS5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnbm9uIHByb21wdCBmaWxlJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHRcdGNvbnN0IGxvY2F0b3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRGaWxlc0xvY2F0b3IpO1xuXG5cdFx0XHRcdFx0XHRhc3NlcnRPdXRjb21lKFxuXHRcdFx0XHRcdFx0XHRhd2FpdCBsb2NhdG9yLmxpc3RGaWxlcyhQcm9tcHRzVHlwZS5wcm9tcHQsIFByb21wdHNTdG9yYWdlLmxvY2FsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSxcblx0XHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9nZW4vdGV4dC9teS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9nZW4vdGV4dC9uZXN0ZWQvc3BlY2lmaWMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZ2VuL3RleHQvbmVzdGVkL3Vuc3BlY2lmaWMxLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2dlbi90ZXh0L25lc3RlZC91bnNwZWNpZmljMi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdC8vIC1cblx0XHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzL2dlbmVyYWwvY29tbW9uLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cy9nZW5lcmFsL3VuY29tbW9uLTEwLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdCdNdXN0IGZpbmQgY29ycmVjdCBwcm9tcHRzLicsXG5cdFx0XHRcdFx0XHQpO1xuXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHR0ZXN0VChgc3BlY2lmaWNgLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgdGVzdFNldHRpbmdzID0gW1xuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi9teS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi8qc3BlY2lmaWMqJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiovKmNvbW1vbionLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiovbXkucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiovKnNwZWNpZmljKi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi8qY29tbW9uKi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiovbXkqLm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiovKnNwZWNpZmljKi5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqLypjb21tb24qLm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL215Ki5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL3NwZWNpZmljKicsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL3Vuc3BlY2lmaWMqJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiovY29tbW9uKicsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL3VuY29tbW9uKicsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi9teS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi9zcGVjaWZpYy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi91bnNwZWNpZmljMS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi91bnNwZWNpZmljMi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi9jb21tb24ucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiovdW5jb21tb24tMTAucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL2dlbiovKiovbXkucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiovZ2VuKi8qKi8qc3BlY2lmaWMqJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiovZ2VuKi8qKi8qY29tbW9uKicsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi9nZW4qLyoqL215LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL2dlbiovKiovKnNwZWNpZmljKi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi9nZW4qLyoqLypjb21tb24qLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi9nZW4qLyoqL215Ki5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL2dlbiovKiovKnNwZWNpZmljKi5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL2dlbiovKiovKmNvbW1vbioubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiovZ2VuKi8qKi9teSoubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi9nZW4qLyoqL3NwZWNpZmljKicsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL2dlbiovKiovdW5zcGVjaWZpYyonLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi9nZW4qLyoqL2NvbW1vbionLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi9nZW4qLyoqL3VuY29tbW9uKicsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi9nZW4qLyoqL215LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL2dlbiovKiovc3BlY2lmaWMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiovZ2VuKi8qKi91bnNwZWNpZmljMS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi9nZW4qLyoqL3Vuc3BlY2lmaWMyLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL2dlbiovKiovY29tbW9uLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL2dlbiovKiovdW5jb21tb24tMTAucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9nZW4vdGV4dC9teS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZ2VuL3RleHQvbmVzdGVkL3NwZWNpZmljLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9nZW4vdGV4dC9uZXN0ZWQvdW5zcGVjaWZpYzEucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2dlbi90ZXh0L25lc3RlZC91bnNwZWNpZmljMi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzL2dlbmVyYWwvY29tbW9uLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMvZ2VuZXJhbC91bmNvbW1vbi0xMC5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2dlbi90ZXh0L215LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9nZW4vdGV4dC9uZXN0ZWQvKnNwZWNpZmljKicsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMvZ2VuZXJhbC8qY29tbW9uKicsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZ2VuL3RleHQvbXkucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2dlbi90ZXh0LyoqL3NwZWNpZmljLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9nZW4vdGV4dC8qKi91bnNwZWNpZmljMS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZ2VuL3RleHQvKiovdW5zcGVjaWZpYzIucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cy9nZW5lcmFsLyonLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiove2dlbixnZW5lcmFsfS8qKi9teS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi97Z2VuLGdlbmVyYWx9LyoqLypzcGVjaWZpYyonLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi97Z2VuLGdlbmVyYWx9LyoqLypjb21tb24qJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL3tnZW4sZ2VuZXJhbH0vKiovbXkucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiove2dlbixnZW5lcmFsfS8qKi8qc3BlY2lmaWMqLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL3tnZW4sZ2VuZXJhbH0vKiovKmNvbW1vbioucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL3tnZW4sZ2VuZXJhbH0vKiovbXkqLm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiove2dlbixnZW5lcmFsfS8qKi8qc3BlY2lmaWMqLm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiove2dlbixnZW5lcmFsfS8qKi8qY29tbW9uKi5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi97Z2VuLGdlbmVyYWx9LyoqL215Ki5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL3tnZW4sZ2VuZXJhbH0vKiovc3BlY2lmaWMqJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiove2dlbixnZW5lcmFsfS8qKi91bnNwZWNpZmljKicsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL3tnZW4sZ2VuZXJhbH0vKiovY29tbW9uKicsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL3tnZW4sZ2VuZXJhbH0vKiovdW5jb21tb24qJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL3tnZW4sZ2VuZXJhbH0vKiovbXkucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiove2dlbixnZW5lcmFsfS8qKi9zcGVjaWZpYy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy8qKi97Z2VuLGdlbmVyYWx9LyoqL3Vuc3BlY2lmaWMxLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zLyoqL3tnZW4sZ2VuZXJhbH0vKiovdW5zcGVjaWZpYzIucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiove2dlbixnZW5lcmFsfS8qKi9jb21tb24ucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvKiove2dlbixnZW5lcmFsfS8qKi91bmNvbW1vbi0xMC5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mve3Byb21wdHMsdnNjb2RlLGNvcGlsb3R9L3tnZW4sZ2VuZXJhbH0vKiovbXkucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mve3Byb21wdHMsdnNjb2RlLGNvcGlsb3R9L3tnZW4sZ2VuZXJhbH0vKiovKnNwZWNpZmljKicsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3twcm9tcHRzLHZzY29kZSxjb3BpbG90fS97Z2VuLGdlbmVyYWx9LyoqLypjb21tb24qJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3twcm9tcHRzLHZzY29kZSxjb3BpbG90fS97Z2VuLGdlbmVyYWx9LyoqL215LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3twcm9tcHRzLHZzY29kZSxjb3BpbG90fS97Z2VuLGdlbmVyYWx9LyoqLypzcGVjaWZpYyoucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mve3Byb21wdHMsdnNjb2RlLGNvcGlsb3R9L3tnZW4sZ2VuZXJhbH0vKiovKmNvbW1vbioucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3twcm9tcHRzLHZzY29kZSxjb3BpbG90fS97Z2VuLGdlbmVyYWx9LyoqL215Ki5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3twcm9tcHRzLHZzY29kZSxjb3BpbG90fS97Z2VuLGdlbmVyYWx9LyoqLypzcGVjaWZpYyoubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy97cHJvbXB0cyx2c2NvZGUsY29waWxvdH0ve2dlbixnZW5lcmFsfS8qKi8qY29tbW9uKi5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy97cHJvbXB0cyx2c2NvZGUsY29waWxvdH0ve2dlbixnZW5lcmFsfS8qKi9teSoubWQnLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy97cHJvbXB0cyx2c2NvZGUsY29waWxvdH0ve2dlbixnZW5lcmFsfS8qKi9zcGVjaWZpYyonLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy97cHJvbXB0cyx2c2NvZGUsY29waWxvdH0ve2dlbixnZW5lcmFsfS8qKi91bnNwZWNpZmljKicsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3twcm9tcHRzLHZzY29kZSxjb3BpbG90fS97Z2VuLGdlbmVyYWx9LyoqL2NvbW1vbionLFxuXHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy97cHJvbXB0cyx2c2NvZGUsY29waWxvdH0ve2dlbixnZW5lcmFsfS8qKi91bmNvbW1vbionLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mve3Byb21wdHMsdnNjb2RlLGNvcGlsb3R9L3tnZW4sZ2VuZXJhbH0vKiovbXkucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mve3Byb21wdHMsdnNjb2RlLGNvcGlsb3R9L3tnZW4sZ2VuZXJhbH0vKiovc3BlY2lmaWMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mve3Byb21wdHMsdnNjb2RlLGNvcGlsb3R9L3tnZW4sZ2VuZXJhbH0vKiovdW5zcGVjaWZpYzEucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mve3Byb21wdHMsdnNjb2RlLGNvcGlsb3R9L3tnZW4sZ2VuZXJhbH0vKiovdW5zcGVjaWZpYzIucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mve3Byb21wdHMsdnNjb2RlLGNvcGlsb3R9L3tnZW4sZ2VuZXJhbH0vKiovY29tbW9uLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3twcm9tcHRzLHZzY29kZSxjb3BpbG90fS97Z2VuLGdlbmVyYWx9LyoqL3VuY29tbW9uLTEwLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdF07XG5cblx0XHRcdFx0XHRmb3IgKGNvbnN0IHNldHRpbmdzIG9mIHRlc3RTZXR0aW5ncykge1xuXHRcdFx0XHRcdFx0Y29uc3QgdnNjb2RlU2V0dGluZ3M6IFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+ID0ge307XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IHNldHRpbmcgb2Ygc2V0dGluZ3MpIHtcblx0XHRcdFx0XHRcdFx0dnNjb2RlU2V0dGluZ3Nbc2V0dGluZ10gPSB0cnVlO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRzZXRMb2NhdGlvbnModnNjb2RlU2V0dGluZ3MpO1xuXHRcdFx0XHRcdFx0c2V0V29ya3NwYWNlRm9sZGVycyhbXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZScsXG5cdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMnLFxuXHRcdFx0XHRcdFx0XSk7XG5cdFx0XHRcdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9nZW4vdGV4dC9teS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCBib3QhJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZ2VuL3RleHQvbmVzdGVkL3NwZWNpZmljLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIGJvdCEnXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9nZW4vdGV4dC9uZXN0ZWQvdW5zcGVjaWZpYzEucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgcm9ib3QhJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZ2VuL3RleHQvbmVzdGVkL3Vuc3BlY2lmaWMyLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnb2ggaGksIHJhYm90ISddLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2dlbi90ZXh0L25lc3RlZC9yZWFkbWUubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ25vbiBwcm9tcHQgZmlsZSddLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cy9nZW5lcmFsL2NvbW1vbi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ29oIGhpLCBib3QhJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzL2dlbmVyYWwvdW5jb21tb24tMTAucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogWydvaCBoaSwgcm9ib3QhJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzL2dlbmVyYWwvbGljZW5zZS5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFsnbm9uIHByb21wdCBmaWxlJ10sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHRcdGNvbnN0IGxvY2F0b3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRGaWxlc0xvY2F0b3IpO1xuXG5cdFx0XHRcdFx0XHRhc3NlcnRPdXRjb21lKFxuXHRcdFx0XHRcdFx0XHRhd2FpdCBsb2NhdG9yLmxpc3RGaWxlcyhQcm9tcHRzVHlwZS5wcm9tcHQsIFByb21wdHNTdG9yYWdlLmxvY2FsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSxcblx0XHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9nZW4vdGV4dC9teS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9nZW4vdGV4dC9uZXN0ZWQvc3BlY2lmaWMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZ2VuL3RleHQvbmVzdGVkL3Vuc3BlY2lmaWMxLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2dlbi90ZXh0L25lc3RlZC91bnNwZWNpZmljMi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdC8vIC1cblx0XHRcdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzL2dlbmVyYWwvY29tbW9uLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvcHJvbXB0cy9nZW5lcmFsL3VuY29tbW9uLTEwLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdCdNdXN0IGZpbmQgY29ycmVjdCBwcm9tcHRzLicsXG5cdFx0XHRcdFx0XHQpO1xuXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnaW5zdHJ1Y3Rpb25zJywgKCkgPT4ge1xuXHRcdHRlc3RUKCdmaW5kcyBpbnN0cnVjdGlvbnMgZmlsZXMgaW4gc3ViZGlyZWN0b3JpZXMgb2YgLmdpdGh1Yi9pbnN0cnVjdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRMb2NhdGlvbnMoe1xuXHRcdFx0XHQnLmdpdGh1Yi9pbnN0cnVjdGlvbnMnOiB0cnVlLFxuXHRcdFx0XHQnLmNsYXVkZS9ydWxlcyc6IGZhbHNlLFxuXHRcdFx0XHQnfi8uY29waWxvdC9pbnN0cnVjdGlvbnMnOiBmYWxzZSxcblx0XHRcdH0pO1xuXHRcdFx0c2V0V29ya3NwYWNlRm9sZGVycyhbJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlJ10pO1xuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvLmdpdGh1Yi9pbnN0cnVjdGlvbnMvcm9vdC5pbnN0cnVjdGlvbnMubWQnLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbJ3Jvb3QgaW5zdHJ1Y3Rpb25zJ10sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvLmdpdGh1Yi9pbnN0cnVjdGlvbnMvZnJvbnRlbmQvcmVhY3QuaW5zdHJ1Y3Rpb25zLm1kJyxcblx0XHRcdFx0XHRjb250ZW50czogWydyZWFjdCBpbnN0cnVjdGlvbnMnXSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8uZ2l0aHViL2luc3RydWN0aW9ucy9mcm9udGVuZC9jc3MuaW5zdHJ1Y3Rpb25zLm1kJyxcblx0XHRcdFx0XHRjb250ZW50czogWydjc3MgaW5zdHJ1Y3Rpb25zJ10sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvLmdpdGh1Yi9pbnN0cnVjdGlvbnMvYmFja2VuZC9hcGkuaW5zdHJ1Y3Rpb25zLm1kJyxcblx0XHRcdFx0XHRjb250ZW50czogWydhcGkgaW5zdHJ1Y3Rpb25zJ10sXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblx0XHRcdGNvbnN0IGxvY2F0b3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRGaWxlc0xvY2F0b3IpO1xuXG5cdFx0XHRhc3NlcnRPdXRjb21lKFxuXHRcdFx0XHRhd2FpdCBsb2NhdG9yLmxpc3RGaWxlcyhQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIFByb21wdHNTdG9yYWdlLmxvY2FsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8uZ2l0aHViL2luc3RydWN0aW9ucy9yb290Lmluc3RydWN0aW9ucy5tZCcsXG5cdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLy5naXRodWIvaW5zdHJ1Y3Rpb25zL2Zyb250ZW5kL3JlYWN0Lmluc3RydWN0aW9ucy5tZCcsXG5cdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLy5naXRodWIvaW5zdHJ1Y3Rpb25zL2Zyb250ZW5kL2Nzcy5pbnN0cnVjdGlvbnMubWQnLFxuXHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8uZ2l0aHViL2luc3RydWN0aW9ucy9iYWNrZW5kL2FwaS5pbnN0cnVjdGlvbnMubWQnLFxuXHRcdFx0XHRdLFxuXHRcdFx0XHQnTXVzdCBmaW5kIGluc3RydWN0aW9ucyBmaWxlcyByZWN1cnNpdmVseSBpbiBzdWJkaXJlY3RvcmllcyBvZiAuZ2l0aHViL2luc3RydWN0aW9ucy4nLFxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3NraWxscycsICgpID0+IHtcblx0XHRzdWl0ZSgnZmluZEFnZW50U2tpbGxzJywgKCkgPT4ge1xuXHRcdFx0dGVzdFQoJ2ZpbmRzIHNraWxsIGZpbGVzIGluIGNvbmZpZ3VyZWQgbG9jYXRpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRzZXRMb2NhdGlvbnMoe1xuXHRcdFx0XHRcdCcuY2xhdWRlL3NraWxscyc6IHRydWUsXG5cdFx0XHRcdFx0Ly8gZGlzYWJsZSBvdGhlciBkZWZhdWx0c1xuXHRcdFx0XHRcdCcuZ2l0aHViL3NraWxscyc6IGZhbHNlLFxuXHRcdFx0XHRcdCd+Ly5jb3BpbG90L3NraWxscyc6IGZhbHNlLFxuXHRcdFx0XHRcdCd+Ly5jbGF1ZGUvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRzZXRXb3Jrc3BhY2VGb2xkZXJzKFsnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUnXSk7XG5cdFx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8uY2xhdWRlL3NraWxscy9wcHR4L1NLSUxMLm1kJyxcblx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJyMgUFBUWCBTa2lsbCddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLy5jbGF1ZGUvc2tpbGxzL2V4Y2VsL1NLSUxMLm1kJyxcblx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJyMgRXhjZWwgU2tpbGwnXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRdKTtcblx0XHRcdFx0Y29uc3QgbG9jYXRvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdEZpbGVzTG9jYXRvcik7XG5cblx0XHRcdFx0Y29uc3Qgc2tpbGxzID0gYXdhaXQgbG9jYXRvci5maW5kQWdlbnRTa2lsbHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRcdGFzc2VydE91dGNvbWUoXG5cdFx0XHRcdFx0c2tpbGxzLm1hcChzID0+IHMudXJpKSxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvLmNsYXVkZS9za2lsbHMvcHB0eC9TS0lMTC5tZCcsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvLmNsYXVkZS9za2lsbHMvZXhjZWwvU0tJTEwubWQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0J011c3QgZmluZCBza2lsbCBmaWxlcy4nLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3RUKCdpZ25vcmVzIGZvbGRlcnMgd2l0aG91dCBTS0lMTC5tZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0c2V0TG9jYXRpb25zKHtcblx0XHRcdFx0XHQnLmNsYXVkZS9za2lsbHMnOiB0cnVlLFxuXHRcdFx0XHRcdC8vIGRpc2FibGUgb3RoZXIgZGVmYXVsdHNcblx0XHRcdFx0XHQnLmdpdGh1Yi9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0XHQnfi8uY29waWxvdC9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0XHQnfi8uY2xhdWRlL3NraWxscyc6IGZhbHNlLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0c2V0V29ya3NwYWNlRm9sZGVycyhbJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlJ10pO1xuXHRcdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvLmNsYXVkZS9za2lsbHMvdmFsaWQtc2tpbGwvU0tJTEwubWQnLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6IFsnIyBWYWxpZCBTa2lsbCddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLy5jbGF1ZGUvc2tpbGxzL2ludmFsaWQtc2tpbGwvcmVhZG1lLm1kJyxcblx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbJ05vdCBhIHNraWxsIGZpbGUnXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8uY2xhdWRlL3NraWxscy9hbm90aGVyLWludmFsaWQvaW5kZXguanMnLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6IFsnY29uc29sZS5sb2coXCJub3QgYSBza2lsbFwiKSddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdF0pO1xuXHRcdFx0XHRjb25zdCBsb2NhdG9yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0RmlsZXNMb2NhdG9yKTtcblxuXHRcdFx0XHRjb25zdCBza2lsbHMgPSBhd2FpdCBsb2NhdG9yLmZpbmRBZ2VudFNraWxscyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0YXNzZXJ0T3V0Y29tZShcblx0XHRcdFx0XHRza2lsbHMubWFwKHMgPT4gcy51cmkpLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8uY2xhdWRlL3NraWxscy92YWxpZC1za2lsbC9TS0lMTC5tZCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHQnTXVzdCBvbmx5IGZpbmQgZm9sZGVycyB3aXRoIFNLSUxMLm1kLicsXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdFQoJ3JldHVybnMgZW1wdHkgYXJyYXkgd2hlbiBubyBza2lsbHMgZXhpc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHNldExvY2F0aW9ucyh7XG5cdFx0XHRcdFx0Jy5jbGF1ZGUvc2tpbGxzJzogdHJ1ZSxcblx0XHRcdFx0XHQvLyBkaXNhYmxlIG90aGVyIGRlZmF1bHRzXG5cdFx0XHRcdFx0Jy5naXRodWIvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdFx0J34vLmNvcGlsb3Qvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdFx0J34vLmNsYXVkZS9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHNldFdvcmtzcGFjZUZvbGRlcnMoWycvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZSddKTtcblx0XHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXSk7XG5cdFx0XHRcdGNvbnN0IGxvY2F0b3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRGaWxlc0xvY2F0b3IpO1xuXG5cdFx0XHRcdGNvbnN0IHNraWxscyA9IGF3YWl0IGxvY2F0b3IuZmluZEFnZW50U2tpbGxzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRhc3NlcnRPdXRjb21lKFxuXHRcdFx0XHRcdHNraWxscy5tYXAocyA9PiBzLnVyaSksXG5cdFx0XHRcdFx0W10sXG5cdFx0XHRcdFx0J011c3QgcmV0dXJuIGVtcHR5IGFycmF5IHdoZW4gbm8gc2tpbGxzIGV4aXN0LicsXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdFQoJ3JldHVybnMgZW1wdHkgYXJyYXkgd2hlbiBza2lsbCBmb2xkZXIgZG9lcyBub3QgZXhpc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHNldExvY2F0aW9ucyh7XG5cdFx0XHRcdFx0Jy5jbGF1ZGUvc2tpbGxzJzogdHJ1ZSxcblx0XHRcdFx0XHQvLyBkaXNhYmxlIG90aGVyIGRlZmF1bHRzXG5cdFx0XHRcdFx0Jy5naXRodWIvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdFx0J34vLmNvcGlsb3Qvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdFx0J34vLmNsYXVkZS9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHNldFdvcmtzcGFjZUZvbGRlcnMoWycvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZSddKTtcblx0XHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXSk7XG5cdFx0XHRcdGNvbnN0IGxvY2F0b3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRGaWxlc0xvY2F0b3IpO1xuXG5cdFx0XHRcdGNvbnN0IHNraWxscyA9IGF3YWl0IGxvY2F0b3IuZmluZEFnZW50U2tpbGxzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRhc3NlcnRPdXRjb21lKFxuXHRcdFx0XHRcdHNraWxscy5tYXAocyA9PiBzLnVyaSksXG5cdFx0XHRcdFx0W10sXG5cdFx0XHRcdFx0J011c3QgcmV0dXJuIGVtcHR5IGFycmF5IHdoZW4gZm9sZGVyIGRvZXMgbm90IGV4aXN0LicsXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdFQoJ2ZpbmRzIHNraWxscyBhY3Jvc3MgbXVsdGlwbGUgd29ya3NwYWNlIGZvbGRlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHNldExvY2F0aW9ucyh7XG5cdFx0XHRcdFx0Jy5jbGF1ZGUvc2tpbGxzJzogdHJ1ZSxcblx0XHRcdFx0XHQvLyBkaXNhYmxlIG90aGVyIGRlZmF1bHRzXG5cdFx0XHRcdFx0Jy5naXRodWIvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdFx0J34vLmNvcGlsb3Qvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdFx0J34vLmNsYXVkZS9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHNldFdvcmtzcGFjZUZvbGRlcnMoW1xuXHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZScsXG5cdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mvbm9kZScsXG5cdFx0XHRcdF0pO1xuXHRcdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvLmNsYXVkZS9za2lsbHMvc2tpbGwtYS9TS0lMTC5tZCcsXG5cdFx0XHRcdFx0XHRjb250ZW50czogWycjIFNraWxsIEEnXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL25vZGUvLmNsYXVkZS9za2lsbHMvc2tpbGwtYi9TS0lMTC5tZCcsXG5cdFx0XHRcdFx0XHRjb250ZW50czogWycjIFNraWxsIEInXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRdKTtcblx0XHRcdFx0Y29uc3QgbG9jYXRvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdEZpbGVzTG9jYXRvcik7XG5cblx0XHRcdFx0Y29uc3Qgc2tpbGxzID0gYXdhaXQgbG9jYXRvci5maW5kQWdlbnRTa2lsbHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRcdGFzc2VydE91dGNvbWUoXG5cdFx0XHRcdFx0c2tpbGxzLm1hcChzID0+IHMudXJpKSxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvLmNsYXVkZS9za2lsbHMvc2tpbGwtYS9TS0lMTC5tZCcsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9ub2RlLy5jbGF1ZGUvc2tpbGxzL3NraWxsLWIvU0tJTEwubWQnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0J011c3QgZmluZCBza2lsbHMgYWNyb3NzIGFsbCB3b3Jrc3BhY2UgZm9sZGVycy4nLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgnbGlzdEZpbGVzIHdpdGggUHJvbXB0c1R5cGUuc2tpbGwnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0VCgnZG9lcyBub3QgbGlzdCBza2lsbHMgd2hlbiBsb2NhdGlvbiBpcyBkaXNhYmxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0c2V0TG9jYXRpb25zKHtcblx0XHRcdFx0XHQnLmNsYXVkZS9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0XHQvLyBkaXNhYmxlIG90aGVyIGRlZmF1bHRzXG5cdFx0XHRcdFx0Jy5naXRodWIvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdFx0J34vLmNvcGlsb3Qvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdFx0J34vLmNsYXVkZS9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHNldFdvcmtzcGFjZUZvbGRlcnMoWycvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZSddKTtcblx0XHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLy5jbGF1ZGUvc2tpbGxzL3BwdHgvU0tJTEwubWQnLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6IFsnIyBQUFRYIFNraWxsJ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XSk7XG5cdFx0XHRcdGNvbnN0IGxvY2F0b3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRGaWxlc0xvY2F0b3IpO1xuXG5cdFx0XHRcdGNvbnN0IGZpbGVzID0gYXdhaXQgbG9jYXRvci5saXN0RmlsZXMoUHJvbXB0c1R5cGUuc2tpbGwsIFByb21wdHNTdG9yYWdlLmxvY2FsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0YXNzZXJ0T3V0Y29tZShcblx0XHRcdFx0XHRmaWxlcyxcblx0XHRcdFx0XHRbXSxcblx0XHRcdFx0XHQnTXVzdCBub3QgbGlzdCBza2lsbHMgd2hlbiBsb2NhdGlvbiBpcyBkaXNhYmxlZC4nLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgndG9BYnNvbHV0ZUxvY2F0aW9uc0ZvclNraWxscyBwYXRoIHZhbGlkYXRpb24nLCAoKSA9PiB7XG5cdFx0XHR0ZXN0VCgncmVqZWN0cyBnbG9iIHBhdHRlcm5zIGluIHNraWxsIHBhdGhzIHZpYSBnZXRDb25maWdCYXNlZFNvdXJjZUZvbGRlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHNldExvY2F0aW9ucyh7XG5cdFx0XHRcdFx0J3NraWxscy8qKic6IHRydWUsXG5cdFx0XHRcdFx0J3NraWxscy8qJzogdHJ1ZSxcblx0XHRcdFx0XHQnKiovc2tpbGxzJzogdHJ1ZSxcblx0XHRcdFx0XHQvLyBkaXNhYmxlIGRlZmF1bHRzXG5cdFx0XHRcdFx0Jy5naXRodWIvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdFx0Jy5hZ2VudHMvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdFx0Jy5jbGF1ZGUvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdFx0J34vLmNvcGlsb3Qvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdFx0J34vLmFnZW50cy9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0XHQnfi8uY2xhdWRlL3NraWxscyc6IGZhbHNlLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0c2V0V29ya3NwYWNlRm9sZGVycyhbJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlJ10pO1xuXHRcdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtdKTtcblx0XHRcdFx0Y29uc3QgbG9jYXRvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdEZpbGVzTG9jYXRvcik7XG5cblx0XHRcdFx0Y29uc3QgZm9sZGVycyA9IGF3YWl0IGxvY2F0b3IuZ2V0Q29uZmlnQmFzZWRTb3VyY2VGb2xkZXJzKFByb21wdHNUeXBlLnNraWxsKTtcblx0XHRcdFx0YXNzZXJ0T3V0Y29tZShcblx0XHRcdFx0XHRmb2xkZXJzLFxuXHRcdFx0XHRcdFtdLFxuXHRcdFx0XHRcdCdNdXN0IHJlamVjdCBnbG9iIHBhdHRlcm5zIGluIHNraWxsIHBhdGhzLicsXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdFQoJ3JlamVjdHMgYWJzb2x1dGUgcGF0aHMgaW4gc2tpbGwgcGF0aHMgdmlhIGdldENvbmZpZ0Jhc2VkU291cmNlRm9sZGVycycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0c2V0TG9jYXRpb25zKHtcblx0XHRcdFx0XHQnL2Fic29sdXRlL3BhdGgvc2tpbGxzJzogdHJ1ZSxcblx0XHRcdFx0XHQvLyBkaXNhYmxlIGRlZmF1bHRzXG5cdFx0XHRcdFx0Jy5naXRodWIvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdFx0Jy5hZ2VudHMvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdFx0Jy5jbGF1ZGUvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdFx0J34vLmNvcGlsb3Qvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdFx0J34vLmFnZW50cy9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0XHQnfi8uY2xhdWRlL3NraWxscyc6IGZhbHNlLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0c2V0V29ya3NwYWNlRm9sZGVycyhbJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlJ10pO1xuXHRcdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtdKTtcblx0XHRcdFx0Y29uc3QgbG9jYXRvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdEZpbGVzTG9jYXRvcik7XG5cblx0XHRcdFx0Y29uc3QgZm9sZGVycyA9IGF3YWl0IGxvY2F0b3IuZ2V0Q29uZmlnQmFzZWRTb3VyY2VGb2xkZXJzKFByb21wdHNUeXBlLnNraWxsKTtcblx0XHRcdFx0YXNzZXJ0T3V0Y29tZShcblx0XHRcdFx0XHRmb2xkZXJzLFxuXHRcdFx0XHRcdFtdLFxuXHRcdFx0XHRcdCdNdXN0IHJlamVjdCBhYnNvbHV0ZSBwYXRocyBpbiBza2lsbCBwYXRocy4nLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3RUKCdhY2NlcHRzIHJlbGF0aXZlIHBhdGhzIGluIHNraWxsIHBhdGhzIHZpYSBnZXRDb25maWdCYXNlZFNvdXJjZUZvbGRlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHNldExvY2F0aW9ucyh7XG5cdFx0XHRcdFx0Jy4vbXktc2tpbGxzJzogdHJ1ZSxcblx0XHRcdFx0XHQnY3VzdG9tL3NraWxscyc6IHRydWUsXG5cdFx0XHRcdFx0Ly8gZGlzYWJsZSBkZWZhdWx0c1xuXHRcdFx0XHRcdCcuZ2l0aHViL3NraWxscyc6IGZhbHNlLFxuXHRcdFx0XHRcdCcuYWdlbnRzL3NraWxscyc6IGZhbHNlLFxuXHRcdFx0XHRcdCcuY2xhdWRlL3NraWxscyc6IGZhbHNlLFxuXHRcdFx0XHRcdCd+Ly5jb3BpbG90L3NraWxscyc6IGZhbHNlLFxuXHRcdFx0XHRcdCd+Ly5hZ2VudHMvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdFx0J34vLmNsYXVkZS9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHNldFdvcmtzcGFjZUZvbGRlcnMoWycvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZSddKTtcblx0XHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXSk7XG5cdFx0XHRcdGNvbnN0IGxvY2F0b3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRGaWxlc0xvY2F0b3IpO1xuXG5cdFx0XHRcdGNvbnN0IGZvbGRlcnMgPSBhd2FpdCBsb2NhdG9yLmdldENvbmZpZ0Jhc2VkU291cmNlRm9sZGVycyhQcm9tcHRzVHlwZS5za2lsbCk7XG5cdFx0XHRcdGFzc2VydE91dGNvbWUoXG5cdFx0XHRcdFx0Zm9sZGVycyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvbXktc2tpbGxzJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS9jdXN0b20vc2tpbGxzJyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdCdNdXN0IGFjY2VwdCByZWxhdGl2ZSBwYXRocyBpbiBza2lsbCBwYXRocy4nLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3RUKCdhY2NlcHRzIHBhcmVudCByZWxhdGl2ZSBwYXRocyBmb3IgbW9ub3JlcG9zIHZpYSBnZXRDb25maWdCYXNlZFNvdXJjZUZvbGRlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHNldExvY2F0aW9ucyh7XG5cdFx0XHRcdFx0Jy4uL3NoYXJlZC1za2lsbHMnOiB0cnVlLFxuXHRcdFx0XHRcdC8vIGRpc2FibGUgZGVmYXVsdHNcblx0XHRcdFx0XHQnLmdpdGh1Yi9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0XHQnLmFnZW50cy9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0XHQnLmNsYXVkZS9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0XHQnfi8uY29waWxvdC9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0XHQnfi8uYWdlbnRzL3NraWxscyc6IGZhbHNlLFxuXHRcdFx0XHRcdCd+Ly5jbGF1ZGUvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRzZXRXb3Jrc3BhY2VGb2xkZXJzKFsnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUnXSk7XG5cdFx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW10pO1xuXHRcdFx0XHRjb25zdCBsb2NhdG9yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0RmlsZXNMb2NhdG9yKTtcblxuXHRcdFx0XHRjb25zdCBmb2xkZXJzID0gYXdhaXQgbG9jYXRvci5nZXRDb25maWdCYXNlZFNvdXJjZUZvbGRlcnMoUHJvbXB0c1R5cGUuc2tpbGwpO1xuXHRcdFx0XHRhc3NlcnRPdXRjb21lKFxuXHRcdFx0XHRcdGZvbGRlcnMsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mvc2hhcmVkLXNraWxscycsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHQnTXVzdCBhY2NlcHQgcGFyZW50IHJlbGF0aXZlIHBhdGhzIGZvciBtb25vcmVwb3MuJyxcblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0VCgnYWNjZXB0cyB0aWxkZSBwYXRocyBmb3IgdXNlciBob21lIHNraWxscycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0c2V0TG9jYXRpb25zKHtcblx0XHRcdFx0XHQnfi9teS1za2lsbHMnOiB0cnVlLFxuXHRcdFx0XHRcdC8vIGRpc2FibGUgZGVmYXVsdHNcblx0XHRcdFx0XHQnLmdpdGh1Yi9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0XHQnLmFnZW50cy9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0XHQnLmNsYXVkZS9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0XHQnfi8uY29waWxvdC9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0XHQnfi8uYWdlbnRzL3NraWxscyc6IGZhbHNlLFxuXHRcdFx0XHRcdCd+Ly5jbGF1ZGUvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRzZXRXb3Jrc3BhY2VGb2xkZXJzKFsnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUnXSk7XG5cdFx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW10pO1xuXHRcdFx0XHRjb25zdCBsb2NhdG9yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0RmlsZXNMb2NhdG9yKTtcblxuXHRcdFx0XHRjb25zdCBmb2xkZXJzID0gYXdhaXQgbG9jYXRvci5nZXRDb25maWdCYXNlZFNvdXJjZUZvbGRlcnMoUHJvbXB0c1R5cGUuc2tpbGwpO1xuXHRcdFx0XHRhc3NlcnRPdXRjb21lKFxuXHRcdFx0XHRcdGZvbGRlcnMsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vbXktc2tpbGxzJyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdCdNdXN0IGFjY2VwdCB0aWxkZSBwYXRocyBmb3IgdXNlciBob21lIHNraWxscy4nLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgnZ2V0Q29uZmlnQmFzZWRTb3VyY2VGb2xkZXJzIGZvciBza2lsbHMnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0VCgncmV0dXJucyBzb3VyY2UgZm9sZGVycyB3aXRob3V0IGdsb2IgcHJvY2Vzc2luZycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0c2V0TG9jYXRpb25zKHtcblx0XHRcdFx0XHQnLmNsYXVkZS9za2lsbHMnOiB0cnVlLFxuXHRcdFx0XHRcdCdjdXN0b20tc2tpbGxzJzogdHJ1ZSxcblx0XHRcdFx0XHQvLyBleHBsaWNpdGx5IGRpc2FibGUgb3RoZXIgZGVmYXVsdHMgd2UgZG9uJ3Qgd2FudCBmb3IgdGhpcyB0ZXN0XG5cdFx0XHRcdFx0Jy5naXRodWIvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdFx0Jy5hZ2VudHMvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdFx0J34vLmNvcGlsb3Qvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdFx0J34vLmFnZW50cy9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0XHQnfi8uY2xhdWRlL3NraWxscyc6IGZhbHNlLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0c2V0V29ya3NwYWNlRm9sZGVycyhbXG5cdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlJyxcblx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9ub2RlJyxcblx0XHRcdFx0XSk7XG5cdFx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW10pO1xuXHRcdFx0XHRjb25zdCBsb2NhdG9yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0RmlsZXNMb2NhdG9yKTtcblxuXHRcdFx0XHRjb25zdCBmb2xkZXJzID0gYXdhaXQgbG9jYXRvci5nZXRDb25maWdCYXNlZFNvdXJjZUZvbGRlcnMoUHJvbXB0c1R5cGUuc2tpbGwpO1xuXHRcdFx0XHRhc3NlcnRPdXRjb21lKFxuXHRcdFx0XHRcdGZvbGRlcnMsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLy5jbGF1ZGUvc2tpbGxzJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL25vZGUvLmNsYXVkZS9za2lsbHMnLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2N1c3RvbS1za2lsbHMnLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mvbm9kZS9jdXN0b20tc2tpbGxzJyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdCdNdXN0IHJldHVybiBza2lsbCBzb3VyY2UgZm9sZGVycyB3aXRob3V0IGdsb2IgcHJvY2Vzc2luZy4nLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3RUKCdmaWx0ZXJzIG91dCBpbnZhbGlkIHNraWxsIHBhdGhzIGZyb20gc291cmNlIGZvbGRlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHNldExvY2F0aW9ucyh7XG5cdFx0XHRcdFx0Jy5jbGF1ZGUvc2tpbGxzJzogdHJ1ZSxcblx0XHRcdFx0XHQnc2tpbGxzLyoqJzogdHJ1ZSwgLy8gZ2xvYiAtIHNob3VsZCBiZSBmaWx0ZXJlZCBvdXRcblx0XHRcdFx0XHQnL2Fic29sdXRlL3NraWxscyc6IHRydWUsIC8vIGFic29sdXRlIC0gc2hvdWxkIGJlIGZpbHRlcmVkIG91dFxuXHRcdFx0XHRcdC8vIGV4cGxpY2l0bHkgZGlzYWJsZSBvdGhlciBkZWZhdWx0cyB3ZSBkb24ndCB3YW50IGZvciB0aGlzIHRlc3Rcblx0XHRcdFx0XHQnLmdpdGh1Yi9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0XHQnLmFnZW50cy9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0XHQnfi8uY29waWxvdC9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0XHQnfi8uYWdlbnRzL3NraWxscyc6IGZhbHNlLFxuXHRcdFx0XHRcdCd+Ly5jbGF1ZGUvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRzZXRXb3Jrc3BhY2VGb2xkZXJzKFsnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUnXSk7XG5cdFx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW10pO1xuXHRcdFx0XHRjb25zdCBsb2NhdG9yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0RmlsZXNMb2NhdG9yKTtcblxuXHRcdFx0XHRjb25zdCBmb2xkZXJzID0gYXdhaXQgbG9jYXRvci5nZXRDb25maWdCYXNlZFNvdXJjZUZvbGRlcnMoUHJvbXB0c1R5cGUuc2tpbGwpO1xuXHRcdFx0XHRhc3NlcnRPdXRjb21lKFxuXHRcdFx0XHRcdGZvbGRlcnMsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLy5jbGF1ZGUvc2tpbGxzJyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdCdNdXN0IGZpbHRlciBvdXQgaW52YWxpZCBza2lsbCBwYXRocy4nLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3RUKCdpbmNsdWRlcyBkZWZhdWx0IHNraWxsIHNvdXJjZSBmb2xkZXJzIGZyb20gZGVmYXVsdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHNldExvY2F0aW9ucyh7XG5cdFx0XHRcdFx0J2N1c3RvbS1za2lsbHMnOiB0cnVlLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0c2V0V29ya3NwYWNlRm9sZGVycyhbJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlJ10pO1xuXHRcdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtdKTtcblx0XHRcdFx0Y29uc3QgbG9jYXRvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdEZpbGVzTG9jYXRvcik7XG5cblx0XHRcdFx0Y29uc3QgZm9sZGVycyA9IGF3YWl0IGxvY2F0b3IuZ2V0Q29uZmlnQmFzZWRTb3VyY2VGb2xkZXJzKFByb21wdHNUeXBlLnNraWxsKTtcblx0XHRcdFx0YXNzZXJ0T3V0Y29tZShcblx0XHRcdFx0XHRmb2xkZXJzLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdC8vIGRlZmF1bHRzXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvLmFnZW50cy9za2lsbHMnLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLy5naXRodWIvc2tpbGxzJyxcblx0XHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8uY2xhdWRlL3NraWxscycsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS8uYWdlbnRzL3NraWxscycsXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS8uY29waWxvdC9za2lsbHMnLFxuXHRcdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vLmNsYXVkZS9za2lsbHMnLFxuXHRcdFx0XHRcdFx0Ly8gY3VzdG9tXG5cdFx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvY3VzdG9tLXNraWxscycsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHQnTXVzdCBpbmNsdWRlIGRlZmF1bHQgc2tpbGwgc291cmNlIGZvbGRlcnMuJyxcblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnaXNWYWxpZEdsb2InLCAoKSA9PiB7XG5cdFx0dGVzdFQoJ3ZhbGlkIHBhdHRlcm5zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZ2xvYnMgPSBbXG5cdFx0XHRcdCcqKicsXG5cdFx0XHRcdCdcXConLFxuXHRcdFx0XHQnXFwqKicsXG5cdFx0XHRcdCcqKi8qJyxcblx0XHRcdFx0JyoqLyoucHJvbXB0Lm1kJyxcblx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vKiovKi5wcm9tcHQubWQnLFxuXHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS8qLnByb21wdC5tZCcsXG5cdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tLyonLFxuXHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy97cmVwbzEsdGVzdH0nLFxuXHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy97cmVwbzEsdGVzdH0vKionLFxuXHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy97cmVwbzEsdGVzdH0vKicsXG5cdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tLyoqL3tyZXBvMSx0ZXN0fS8qKicsXG5cdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tLyoqL3tyZXBvMSx0ZXN0fScsXG5cdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tLyoqL3tyZXBvMSx0ZXN0fS8qJyxcblx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vKiovcmVwb1sxLDIsM10nLFxuXHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS8qKi9yZXBvWzEsMiwzXS8qKicsXG5cdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tLyoqL3JlcG9bMSwyLDNdLyonLFxuXHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS8qKi9yZXBvWzEsMiwzXS8qKi8qLnByb21wdC5tZCcsXG5cdFx0XHRcdCdyZXBvWzEsMiwzXS8qKi8qLnByb21wdC5tZCcsXG5cdFx0XHRcdCdyZXBvW1sxLDIsM10vKiovKi5wcm9tcHQubWQnLFxuXHRcdFx0XHQne3JlcG8xLHRlc3R9LyoucHJvbXB0Lm1kJyxcblx0XHRcdFx0J3tyZXBvMSx0ZXN0fS8qJyxcblx0XHRcdFx0Jy97cmVwbzEsdGVzdH0vKicsXG5cdFx0XHRcdCcve3JlcG8xLHRlc3R9fS8qJyxcblx0XHRcdF07XG5cblx0XHRcdGZvciAoY29uc3QgZ2xvYiBvZiBnbG9icykge1xuXHRcdFx0XHRhc3NlcnQoXG5cdFx0XHRcdFx0KGlzVmFsaWRHbG9iKGdsb2IpID09PSB0cnVlKSxcblx0XHRcdFx0XHRgJyR7Z2xvYn0nIG11c3QgYmUgYSAndmFsaWQnIGdsb2IgcGF0dGVybi5gLFxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdFQoJ2ludmFsaWQgcGF0dGVybnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBnbG9icyA9IFtcblx0XHRcdFx0Jy4nLFxuXHRcdFx0XHQnXFxcXConLFxuXHRcdFx0XHQnXFxcXD8nLFxuXHRcdFx0XHQnXFxcXCpcXFxcP1xcXFwqJyxcblx0XHRcdFx0J3JlcG9bMSwyLDMnLFxuXHRcdFx0XHQncmVwbzEsMiwzXScsXG5cdFx0XHRcdCdyZXBvXFxcXFsxLDIsM10nLFxuXHRcdFx0XHQncmVwb1sxLDIsM1xcXFxdJyxcblx0XHRcdFx0J3JlcG9cXFxcWzEsMiwzXFxcXF0nLFxuXHRcdFx0XHQne3JlcG8xLHJlcG8yJyxcblx0XHRcdFx0J3JlcG8xLHJlcG8yfScsXG5cdFx0XHRcdCdcXFxce3JlcG8xLHJlcG8yfScsXG5cdFx0XHRcdCd7cmVwbzEscmVwbzJcXFxcfScsXG5cdFx0XHRcdCdcXFxce3JlcG8xLHJlcG8yXFxcXH0nLFxuXHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcycsXG5cdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9bMSwyLDMnLFxuXHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvMSwyLDNdJyxcblx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb1xcXFxbMSwyLDNdJyxcblx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb1sxLDIsM1xcXFxdJyxcblx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb1xcXFxbMSwyLDNcXFxcXScsXG5cdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3tyZXBvMSxyZXBvMicsXG5cdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG8xLHJlcG8yfScsXG5cdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL1xcXFx7cmVwbzEscmVwbzJ9Jyxcblx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20ve3JlcG8xLHJlcG8yXFxcXH0nLFxuXHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9cXFxce3JlcG8xLHJlcG8yXFxcXH0nLFxuXHRcdFx0XTtcblxuXHRcdFx0Zm9yIChjb25zdCBnbG9iIG9mIGdsb2JzKSB7XG5cdFx0XHRcdGFzc2VydChcblx0XHRcdFx0XHQoaXNWYWxpZEdsb2IoZ2xvYikgPT09IGZhbHNlKSxcblx0XHRcdFx0XHRgJyR7Z2xvYn0nIG11c3QgYmUgYW4gJ2ludmFsaWQnIGdsb2IgcGF0dGVybi5gLFxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnaXNWYWxpZFNraWxsUGF0aCcsICgpID0+IHtcblx0XHR0ZXN0VCgnYWNjZXB0cyByZWxhdGl2ZSBwYXRocycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHZhbGlkUGF0aHMgPSBbXG5cdFx0XHRcdCdzb21lRm9sZGVyJyxcblx0XHRcdFx0Jy4vc29tZUZvbGRlcicsXG5cdFx0XHRcdCdteS1za2lsbHMnLFxuXHRcdFx0XHQnLi9teS1za2lsbHMnLFxuXHRcdFx0XHQnZm9sZGVyL3N1YmZvbGRlcicsXG5cdFx0XHRcdCcuL2ZvbGRlci9zdWJmb2xkZXInLFxuXHRcdFx0XTtcblxuXHRcdFx0Zm9yIChjb25zdCBwYXRoIG9mIHZhbGlkUGF0aHMpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdGlzVmFsaWRQcm9tcHRGb2xkZXJQYXRoKHBhdGgpLFxuXHRcdFx0XHRcdHRydWUsXG5cdFx0XHRcdFx0YCcke3BhdGh9JyBtdXN0IGJlIGFjY2VwdGVkIGFzIGEgdmFsaWQgc2tpbGwgcGF0aCAocmVsYXRpdmUgcGF0aCkuYCxcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3RUKCdhY2NlcHRzIHVzZXIgaG9tZSBwYXRocycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHZhbGlkUGF0aHMgPSBbXG5cdFx0XHRcdCd+L2ZvbGRlcicsXG5cdFx0XHRcdCd+Ly5jb3BpbG90L3NraWxscycsXG5cdFx0XHRcdCd+Ly5jbGF1ZGUvc2tpbGxzJyxcblx0XHRcdFx0J34vbXktc2tpbGxzJyxcblx0XHRcdF07XG5cblx0XHRcdGZvciAoY29uc3QgcGF0aCBvZiB2YWxpZFBhdGhzKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0XHRpc1ZhbGlkUHJvbXB0Rm9sZGVyUGF0aChwYXRoKSxcblx0XHRcdFx0XHR0cnVlLFxuXHRcdFx0XHRcdGAnJHtwYXRofScgbXVzdCBiZSBhY2NlcHRlZCBhcyBhIHZhbGlkIHNraWxsIHBhdGggKHVzZXIgaG9tZSBwYXRoKS5gLFxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdFQoJ2FjY2VwdHMgcGFyZW50IHJlbGF0aXZlIHBhdGhzIGZvciBtb25vcmVwb3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB2YWxpZFBhdGhzID0gW1xuXHRcdFx0XHQnLi4vZm9sZGVyJyxcblx0XHRcdFx0Jy4uL3NoYXJlZC1za2lsbHMnLFxuXHRcdFx0XHQnLi4vLi4vY29tbW9uL3NraWxscycsXG5cdFx0XHRcdCcuLi9wYXJlbnQvZm9sZGVyJyxcblx0XHRcdF07XG5cblx0XHRcdGZvciAoY29uc3QgcGF0aCBvZiB2YWxpZFBhdGhzKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0XHRpc1ZhbGlkUHJvbXB0Rm9sZGVyUGF0aChwYXRoKSxcblx0XHRcdFx0XHR0cnVlLFxuXHRcdFx0XHRcdGAnJHtwYXRofScgbXVzdCBiZSBhY2NlcHRlZCBhcyBhIHZhbGlkIHNraWxsIHBhdGggKHBhcmVudCByZWxhdGl2ZSBwYXRoKS5gLFxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdFQoJ3JlamVjdHMgYWJzb2x1dGUgcGF0aHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnZhbGlkUGF0aHMgPSBbXG5cdFx0XHRcdC8vIFVuaXggYWJzb2x1dGUgcGF0aHNcblx0XHRcdFx0Jy9Vc2Vycy91c2VybmFtZS9za2lsbHMnLFxuXHRcdFx0XHQnL2Fic29sdXRlL3BhdGgnLFxuXHRcdFx0XHQnL3Vzci9sb2NhbC9za2lsbHMnLFxuXHRcdFx0XHQvLyBXaW5kb3dzIGFic29sdXRlIHBhdGhzXG5cdFx0XHRcdCdDOlxcXFxVc2Vyc1xcXFxza2lsbHMnLFxuXHRcdFx0XHQnRDovc2tpbGxzJyxcblx0XHRcdFx0J2M6XFxcXGZvbGRlcicsXG5cdFx0XHRdO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHBhdGggb2YgaW52YWxpZFBhdGhzKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0XHRpc1ZhbGlkUHJvbXB0Rm9sZGVyUGF0aChwYXRoKSxcblx0XHRcdFx0XHRmYWxzZSxcblx0XHRcdFx0XHRgJyR7cGF0aH0nIG11c3QgYmUgcmVqZWN0ZWQgKGFic29sdXRlIHBhdGhzIG5vdCBzdXBwb3J0ZWQgZm9yIHBvcnRhYmlsaXR5KS5gLFxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdFQoJ3JlamVjdHMgdGlsZGUgcGF0aHMgd2l0aG91dCBwYXRoIHNlcGFyYXRvcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGludmFsaWRQYXRocyA9IFtcblx0XHRcdFx0J35hYmMnLFxuXHRcdFx0XHQnfnNraWxscycsXG5cdFx0XHRcdCd+LmNvbmZpZycsXG5cdFx0XHRcdC8vIFdpbmRvd3Mtc3R5bGUgYmFja3NsYXNoIHBhdGhzIGFyZSBub3Qgc3VwcG9ydGVkIGZvciBjcm9zcy1wbGF0Zm9ybSBzaGFyaW5nXG5cdFx0XHRcdCd+XFxcXGZvbGRlcicsXG5cdFx0XHRcdCd+XFxcXC5jb3BpbG90XFxcXHNraWxscycsXG5cdFx0XHRdO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHBhdGggb2YgaW52YWxpZFBhdGhzKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0XHRpc1ZhbGlkUHJvbXB0Rm9sZGVyUGF0aChwYXRoKSxcblx0XHRcdFx0XHRmYWxzZSxcblx0XHRcdFx0XHRgJyR7cGF0aH0nIG11c3QgYmUgcmVqZWN0ZWQgKHRpbGRlIG11c3QgYmUgZm9sbG93ZWQgYnkgLyBvbmx5LCBub3QgXFxcXCkuYCxcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3RUKCdyZWplY3RzIHBhdGhzIHdpdGggYmFja3NsYXNoZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnZhbGlkUGF0aHMgPSBbXG5cdFx0XHRcdCdmb2xkZXJcXFxcc3ViZm9sZGVyJyxcblx0XHRcdFx0Jy5cXFxcc2tpbGxzJyxcblx0XHRcdFx0Jy4uXFxcXHBhcmVudFxcXFxmb2xkZXInLFxuXHRcdFx0XHQnbXlcXFxcc2tpbGxzXFxcXGZvbGRlcicsXG5cdFx0XHRdO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHBhdGggb2YgaW52YWxpZFBhdGhzKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0XHRpc1ZhbGlkUHJvbXB0Rm9sZGVyUGF0aChwYXRoKSxcblx0XHRcdFx0XHRmYWxzZSxcblx0XHRcdFx0XHRgJyR7cGF0aH0nIG11c3QgYmUgcmVqZWN0ZWQgKGJhY2tzbGFzaCBwYXRocyBub3Qgc3VwcG9ydGVkIGZvciBjcm9zcy1wbGF0Zm9ybSBzaGFyaW5nKS5gLFxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdFQoJ3JlamVjdHMgZ2xvYiBwYXR0ZXJucycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGludmFsaWRQYXRocyA9IFtcblx0XHRcdFx0J3NraWxscy8qJyxcblx0XHRcdFx0J3NraWxscy8qKicsXG5cdFx0XHRcdCcqKi9za2lsbHMnLFxuXHRcdFx0XHQnc2tpbGxzLyoubWQnLFxuXHRcdFx0XHQnc2tpbGxzLyoqLyoubWQnLFxuXHRcdFx0XHQne3NraWxsMSxza2lsbDJ9Jyxcblx0XHRcdFx0J3NraWxsWzEsMiwzXScsXG5cdFx0XHRcdCdza2lsbHM/Jyxcblx0XHRcdFx0Jy4vc2tpbGxzLyonLFxuXHRcdFx0XHQnfi9za2lsbHMvKionLFxuXHRcdFx0XTtcblxuXHRcdFx0Zm9yIChjb25zdCBwYXRoIG9mIGludmFsaWRQYXRocykge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0aXNWYWxpZFByb21wdEZvbGRlclBhdGgocGF0aCksXG5cdFx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRcdFx0YCcke3BhdGh9JyBtdXN0IGJlIHJlamVjdGVkIChnbG9iIHBhdHRlcm5zIG5vdCBzdXBwb3J0ZWQgZm9yIHBlcmZvcm1hbmNlKS5gLFxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdFQoJ3JlamVjdHMgZW1wdHkgb3Igd2hpdGVzcGFjZSBwYXRocycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGludmFsaWRQYXRocyA9IFtcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcgICAnLFxuXHRcdFx0XHQnXFx0Jyxcblx0XHRcdFx0J1xcbicsXG5cdFx0XHRdO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHBhdGggb2YgaW52YWxpZFBhdGhzKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0XHRpc1ZhbGlkUHJvbXB0Rm9sZGVyUGF0aChwYXRoKSxcblx0XHRcdFx0XHRmYWxzZSxcblx0XHRcdFx0XHRgJyR7cGF0aH0nIG11c3QgYmUgcmVqZWN0ZWQgKGVtcHR5IG9yIHdoaXRlc3BhY2Ugb25seSkuYCxcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3RUKCdoYW5kbGVzIHBhdGhzIHdpdGggc3BhY2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdmFsaWRQYXRocyA9IFtcblx0XHRcdFx0J215IHNraWxscycsXG5cdFx0XHRcdCcuL215IHNraWxscy9mb2xkZXInLFxuXHRcdFx0XHQnfi9teSBza2lsbHMnLFxuXHRcdFx0XHQnLi4vc2hhcmVkIHNraWxscycsXG5cdFx0XHRdO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHBhdGggb2YgdmFsaWRQYXRocykge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0aXNWYWxpZFByb21wdEZvbGRlclBhdGgocGF0aCksXG5cdFx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0XHRgJyR7cGF0aH0nIG11c3QgYmUgYWNjZXB0ZWQgKHBhdGhzIHdpdGggc3BhY2VzIGFyZSB2YWxpZCkuYCxcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2hhc0dsb2JQYXR0ZXJuJywgKCkgPT4ge1xuXHRcdHRlc3RUKCdkZXRlY3RzIHNpbmdsZSB3aWxkY2FyZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHBhdGhzV2l0aEdsb2IgPSBbXG5cdFx0XHRcdCdza2lsbHMvKicsXG5cdFx0XHRcdCdteS1za2lsbHMvKicsXG5cdFx0XHRcdCcqLm1kJyxcblx0XHRcdFx0JyovZm9sZGVyJyxcblx0XHRcdF07XG5cblx0XHRcdGZvciAoY29uc3QgcGF0aCBvZiBwYXRoc1dpdGhHbG9iKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0XHRoYXNHbG9iUGF0dGVybihwYXRoKSxcblx0XHRcdFx0XHR0cnVlLFxuXHRcdFx0XHRcdGAnJHtwYXRofScgbXVzdCBiZSBkZXRlY3RlZCBhcyBoYXZpbmcgYSBnbG9iIHBhdHRlcm4uYCxcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3RUKCdkZXRlY3RzIGRvdWJsZSB3aWxkY2FyZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHBhdGhzV2l0aEdsb2IgPSBbXG5cdFx0XHRcdCdza2lsbHMvKionLFxuXHRcdFx0XHQnKiovc2tpbGxzJyxcblx0XHRcdFx0JyoqLyoubWQnLFxuXHRcdFx0XHQnYS8qKi9iJyxcblx0XHRcdF07XG5cblx0XHRcdGZvciAoY29uc3QgcGF0aCBvZiBwYXRoc1dpdGhHbG9iKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0XHRoYXNHbG9iUGF0dGVybihwYXRoKSxcblx0XHRcdFx0XHR0cnVlLFxuXHRcdFx0XHRcdGAnJHtwYXRofScgbXVzdCBiZSBkZXRlY3RlZCBhcyBoYXZpbmcgYSBnbG9iIHBhdHRlcm4uYCxcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3RUKCdyZXR1cm5zIGZhbHNlIGZvciBwYXRocyB3aXRob3V0IHdpbGRjYXJkcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHBhdGhzV2l0aG91dEdsb2IgPSBbXG5cdFx0XHRcdCdza2lsbHMnLFxuXHRcdFx0XHQnLi9za2lsbHMvZm9sZGVyJyxcblx0XHRcdFx0J34vc2tpbGxzJyxcblx0XHRcdFx0Jy4uL3BhcmVudC9mb2xkZXInLFxuXHRcdFx0XHQnLmdpdGh1Yi9wcm9tcHRzJyxcblx0XHRcdF07XG5cblx0XHRcdGZvciAoY29uc3QgcGF0aCBvZiBwYXRoc1dpdGhvdXRHbG9iKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0XHRoYXNHbG9iUGF0dGVybihwYXRoKSxcblx0XHRcdFx0XHRmYWxzZSxcblx0XHRcdFx0XHRgJyR7cGF0aH0nIG11c3Qgbm90IGJlIGRldGVjdGVkIGFzIGhhdmluZyBhIGdsb2IgcGF0dGVybi5gLFxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZ2V0Q29uZmlnQmFzZWRTb3VyY2VGb2xkZXJzJywgKCkgPT4ge1xuXHRcdHRlc3RUKCdnZXRzIHVuYW1iaWd1b3VzIGxpc3Qgb2YgZm9sZGVycycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldExvY2F0aW9ucyh7XG5cdFx0XHRcdCcuZ2l0aHViL3Byb21wdHMnOiB0cnVlLFxuXHRcdFx0XHQnL1VzZXJzLyoqL3JlcG9zLyoqJzogdHJ1ZSxcblx0XHRcdFx0J2dlbi90ZXh0LyoqJzogdHJ1ZSxcblx0XHRcdFx0J2dlbi90ZXh0L25lc3RlZC8qLnByb21wdC5tZCc6IHRydWUsXG5cdFx0XHRcdCdnZW5lcmFsLyonOiB0cnVlLFxuXHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvbXktcHJvbXB0cyc6IHRydWUsXG5cdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS95b3VyLXByb21wdHMvKi5tZCc6IHRydWUsXG5cdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMvc2hhcmVkLXByb21wdHMvKic6IHRydWUsXG5cdFx0XHR9KTtcblx0XHRcdHNldFdvcmtzcGFjZUZvbGRlcnMoW1xuXHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUnLFxuXHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzJyxcblx0XHRcdF0pO1xuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXSk7XG5cdFx0XHRjb25zdCBsb2NhdG9yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0RmlsZXNMb2NhdG9yKTtcblxuXHRcdFx0YXNzZXJ0T3V0Y29tZShcblx0XHRcdFx0YXdhaXQgbG9jYXRvci5nZXRDb25maWdCYXNlZFNvdXJjZUZvbGRlcnMoUHJvbXB0c1R5cGUucHJvbXB0KSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8uZ2l0aHViL3Byb21wdHMnLFxuXHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMvLmdpdGh1Yi9wcm9tcHRzJyxcblx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvZ2VuL3RleHQvbmVzdGVkJyxcblx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy9wcm9tcHRzL2dlbi90ZXh0L25lc3RlZCcsXG5cdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL2dlbmVyYWwnLFxuXHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMvZ2VuZXJhbCcsXG5cdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlL215LXByb21wdHMnLFxuXHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS95b3VyLXByb21wdHMnLFxuXHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3Byb21wdHMvc2hhcmVkLXByb21wdHMnLFxuXHRcdFx0XHRdLFxuXHRcdFx0XHQnTXVzdCBmaW5kIGNvcnJlY3QgcHJvbXB0cy4nLFxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2ZpbmRBZ2VudE1Ec0luV29ya3NwYWNlJywgKCkgPT4ge1xuXHRcdHRlc3RUKCdmaW5kcyBBR0VOVFMubWQgZmlsZXMgdXNpbmcgRmlsZVNlYXJjaFByb3ZpZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0V29ya3NwYWNlRm9sZGVycyhbJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mvd29ya3NwYWNlJ10pO1xuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy93b3Jrc3BhY2UvQUdFTlRTLm1kJyxcblx0XHRcdFx0XHRjb250ZW50czogWycjIFJvb3QgYWdlbnRzJ11cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3dvcmtzcGFjZS9zcmMvQUdFTlRTLm1kJyxcblx0XHRcdFx0XHRjb250ZW50czogWycjIFNyYyBhZ2VudHMnXVxuXHRcdFx0XHR9XG5cdFx0XHRdKTtcblx0XHRcdGNvbnN0IGxvY2F0b3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRGaWxlc0xvY2F0b3IpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSAoYXdhaXQgbG9jYXRvci5maW5kQWdlbnRNRHNJbldvcmtzcGFjZShDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSkubWFwKGYgPT4gZi51cmkpO1xuXHRcdFx0YXNzZXJ0T3V0Y29tZShcblx0XHRcdFx0cmVzdWx0LFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mvd29ya3NwYWNlL0FHRU5UUy5tZCcsXG5cdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mvd29ya3NwYWNlL3NyYy9BR0VOVFMubWQnXG5cdFx0XHRcdF0sXG5cdFx0XHRcdCdNdXN0IGZpbmQgYWxsIEFHRU5UUy5tZCBmaWxlcyB1c2luZyBzZWFyY2ggc2VydmljZS4nXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdFQoJ2ZpbmRzIEFHRU5UUy5tZCBmaWxlcyB1c2luZyBmaWxlIHNlcnZpY2UgZmFsbGJhY2snLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRXb3Jrc3BhY2VGb2xkZXJzKFsnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy93b3Jrc3BhY2UnXSk7XG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3dvcmtzcGFjZS9BR0VOVFMubWQnLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbJyMgUm9vdCBhZ2VudHMnXVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mvd29ya3NwYWNlL3NyYy9BR0VOVFMubWQnLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbJyMgU3JjIGFnZW50cyddXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy93b3Jrc3BhY2Uvc3JjL25lc3RlZC9BR0VOVFMubWQnLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiBbJyMgTmVzdGVkIGFnZW50cyddXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2VhcmNoU2VydmljZSwge1xuXHRcdFx0XHRzY2hlbWVIYXNGaWxlU2VhcmNoUHJvdmlkZXI6ICgpID0+IGZhbHNlLFxuXHRcdFx0XHRhc3luYyBmaWxlU2VhcmNoKCkgeyB0aHJvdyBuZXcgRXJyb3IoJ0ZpbGVTZWFyY2hQcm92aWRlciBub3QgYXZhaWxhYmxlJyk7IH1cblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgbG9jYXRvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdEZpbGVzTG9jYXRvcik7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IChhd2FpdCBsb2NhdG9yLmZpbmRBZ2VudE1Ec0luV29ya3NwYWNlKENhbmNlbGxhdGlvblRva2VuLk5vbmUpKS5tYXAoZiA9PiBmLnVyaSk7XG5cdFx0XHRhc3NlcnRPdXRjb21lKFxuXHRcdFx0XHRyZXN1bHQsXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy93b3Jrc3BhY2UvQUdFTlRTLm1kJyxcblx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy93b3Jrc3BhY2Uvc3JjL0FHRU5UUy5tZCcsXG5cdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mvd29ya3NwYWNlL3NyYy9uZXN0ZWQvQUdFTlRTLm1kJ1xuXHRcdFx0XHRdLFxuXHRcdFx0XHQnTXVzdCBmaW5kIGFsbCBBR0VOVFMubWQgZmlsZXMgdXNpbmcgZmlsZSBzZXJ2aWNlIGZhbGxiYWNrLidcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0VCgnaGFuZGxlcyBjYW5jZWxsYXRpb24gdG9rZW4gaW4gZmlsZSBzZXJ2aWNlIGZhbGxiYWNrJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0V29ya3NwYWNlRm9sZGVycyhbJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3Mvd29ya3NwYWNlJ10pO1xuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy93b3Jrc3BhY2UvQUdFTlRTLm1kJyxcblx0XHRcdFx0XHRjb250ZW50czogWycjIFJvb3QgYWdlbnRzJ11cblx0XHRcdFx0fVxuXHRcdFx0XSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZWFyY2hTZXJ2aWNlLCB7XG5cdFx0XHRcdHNjaGVtZUhhc0ZpbGVTZWFyY2hQcm92aWRlcjogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdGFzeW5jIGZpbGVTZWFyY2goKSB7IHRocm93IG5ldyBFcnJvcignRmlsZVNlYXJjaFByb3ZpZGVyIG5vdCBhdmFpbGFibGUnKTsgfVxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBsb2NhdG9yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0RmlsZXNMb2NhdG9yKTtcblxuXHRcdFx0Y29uc3Qgc291cmNlID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0XHQvLyBDYW5jZWwgaW1tZWRpYXRlbHlcblx0XHRcdHNvdXJjZS5jYW5jZWwoKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IChhd2FpdCBsb2NhdG9yLmZpbmRBZ2VudE1Ec0luV29ya3NwYWNlKHNvdXJjZS50b2tlbikpLm1hcChmID0+IGYudXJpKTtcblx0XHRcdGFzc2VydE91dGNvbWUoXG5cdFx0XHRcdHJlc3VsdCxcblx0XHRcdFx0W10sXG5cdFx0XHRcdCdNdXN0IHJldHVybiBlbXB0eSBhcnJheSB3aGVuIGNhbmNlbGxlZC4nXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdH0pO1xuXG5cdHN1aXRlKCdnZXRXb3Jrc3BhY2VGb2xkZXJSb290cycsICgpID0+IHtcblx0XHRsZXQgbG9jYXRvcjogUHJvbXB0RmlsZXNMb2NhdG9yO1xuXG5cdFx0Ly8gT3ZlcnJpZGUgc2V0V29ya3NwYWNlRm9sZGVycyB0byBhbHNvIGNyZWF0ZSB0aGUgbG9jYXRvclxuXHRcdGNvbnN0IHNldFdvcmtzcGFjZUZvbGRlcnNGb3JSb290cyA9IChwYXRoczogc3RyaW5nW10pID0+IHtcblx0XHRcdHNldFdvcmtzcGFjZUZvbGRlcnMocGF0aHMpO1xuXHRcdFx0bG9jYXRvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdEZpbGVzTG9jYXRvcik7XG5cdFx0fTtcblxuXHRcdHRlc3RUKCdyZXR1cm5zIG9ubHkgd29ya3NwYWNlIGZvbGRlciB3aGVuIGl0IGhhcyAuZ2l0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0V29ya3NwYWNlRm9sZGVyc0ZvclJvb3RzKFsnL3JlcG9zL215LXByb2plY3QnXSk7XG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0eyBwYXRoOiAnL3JlcG9zL215LXByb2plY3QvLmdpdC9IRUFEJywgY29udGVudHM6IFsncmVmOiByZWZzL2hlYWRzL21haW4nXSB9LFxuXHRcdFx0XHR7IHBhdGg6ICcvcmVwb3MvbXktcHJvamVjdC9zcmMvaW5kZXgudHMnLCBjb250ZW50czogWydleHBvcnQge307J10gfSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCByb290cyA9IGF3YWl0IGxvY2F0b3IuZ2V0V29ya3NwYWNlRm9sZGVyUm9vdHModHJ1ZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRyb290cy5tYXAociA9PiByLnBhdGgpLFxuXHRcdFx0XHRbJy9yZXBvcy9teS1wcm9qZWN0J10sXG5cdFx0XHRcdCdTaG91bGQgb25seSByZXR1cm4gdGhlIHdvcmtzcGFjZSBmb2xkZXIgaXRzZWxmIHdoZW4gaXQgaGFzIC5naXQnLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3RUKCd3YWxrcyB1cCB0byBwYXJlbnQgd2l0aCAuZ2l0IHdoZW4gd29ya3NwYWNlIGZvbGRlciBoYXMgbm8gLmdpdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldFdvcmtzcGFjZUZvbGRlcnNGb3JSb290cyhbJy9yZXBvcy9tb25vcmVwby9wYWNrYWdlcy9teS1hcHAnXSk7XG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0eyBwYXRoOiAnL3JlcG9zL21vbm9yZXBvLy5naXQvSEVBRCcsIGNvbnRlbnRzOiBbJ3JlZjogcmVmcy9oZWFkcy9tYWluJ10gfSxcblx0XHRcdFx0eyBwYXRoOiAnL3JlcG9zL21vbm9yZXBvL3BhY2thZ2VzL215LWFwcC9zcmMvaW5kZXgudHMnLCBjb250ZW50czogWydleHBvcnQge307J10gfSxcblx0XHRcdF0pO1xuXG5cdFx0XHR3b3Jrc3BhY2VUcnVzdFNlcnZpY2Uuc2V0VHJ1c3RlZFVyaXMoW1VSSS5maWxlKCcvcmVwb3MvbW9ub3JlcG8nKV0pO1xuXG5cdFx0XHRjb25zdCByb290cyA9IGF3YWl0IGxvY2F0b3IuZ2V0V29ya3NwYWNlRm9sZGVyUm9vdHModHJ1ZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRyb290cy5tYXAociA9PiByLnBhdGgpLnNvcnQoKSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCcvcmVwb3MvbW9ub3JlcG8nLFxuXHRcdFx0XHRcdCcvcmVwb3MvbW9ub3JlcG8vcGFja2FnZXMnLFxuXHRcdFx0XHRcdCcvcmVwb3MvbW9ub3JlcG8vcGFja2FnZXMvbXktYXBwJyxcblx0XHRcdFx0XS5zb3J0KCksXG5cdFx0XHRcdCdTaG91bGQgaW5jbHVkZSB3b3Jrc3BhY2UgZm9sZGVyIGFuZCBhbGwgcGFyZW50cyB1cCB0byB0aGUgb25lIHdpdGggLmdpdCcsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdFQoJ2RvZXMgbm90IHdhbGsgdXAgd2hlbiBpbmNsdWRlUGFyZW50cyBpcyBmYWxzZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldFdvcmtzcGFjZUZvbGRlcnNGb3JSb290cyhbJy9yZXBvcy9tb25vcmVwby9wYWNrYWdlcy9teS1hcHAnXSk7XG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0eyBwYXRoOiAnL3JlcG9zL21vbm9yZXBvLy5naXQvSEVBRCcsIGNvbnRlbnRzOiBbJ3JlZjogcmVmcy9oZWFkcy9tYWluJ10gfSxcblx0XHRcdFx0eyBwYXRoOiAnL3JlcG9zL21vbm9yZXBvL3BhY2thZ2VzL215LWFwcC9zcmMvaW5kZXgudHMnLCBjb250ZW50czogWydleHBvcnQge307J10gfSxcblx0XHRcdF0pO1xuXG5cdFx0XHR3b3Jrc3BhY2VUcnVzdFNlcnZpY2Uuc2V0VHJ1c3RlZFVyaXMoW1VSSS5maWxlKCcvcmVwb3MvbW9ub3JlcG8nKV0pO1xuXG5cdFx0XHRjb25zdCByb290cyA9IGF3YWl0IGxvY2F0b3IuZ2V0V29ya3NwYWNlRm9sZGVyUm9vdHMoZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0cm9vdHMubWFwKHIgPT4gci5wYXRoKSxcblx0XHRcdFx0WycvcmVwb3MvbW9ub3JlcG8vcGFja2FnZXMvbXktYXBwJ10sXG5cdFx0XHRcdCdTaG91bGQgb25seSByZXR1cm4gd29ya3NwYWNlIGZvbGRlcnMgd2hlbiBpbmNsdWRlUGFyZW50cyBpcyBmYWxzZScsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdFQoJ2V4Y2x1ZGVzIHZzY29kZS1hZ2VudC1ob3N0IHdvcmtzcGFjZSBmb2xkZXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gQWdlbnQgaG9zdCBmb2xkZXJzIHN1cmZhY2UgY3VzdG9taXphdGlvbnMgdGhyb3VnaCBBSFAsIG5vdCB2aWFcblx0XHRcdC8vIGZpbGVzeXN0ZW0gc2Nhbm5pbmcuIEluY2x1ZGluZyB0aGVtIGhlcmUgd291bGQgaXNzdWUgYSBgcmVzb3VyY2VMaXN0YFxuXHRcdFx0Ly8gSlNPTi1SUEMgcGVyIGNvbmZpZ3VyZWQgbG9jYXRpb24gZm9yIGV2ZXJ5IG5vbmV4aXN0ZW50IGAuZ2l0aHViYCAvXG5cdFx0XHQvLyBgLmNsYXVkZWAgZm9sZGVyIG9uIHRoZSByZW1vdGUuXG5cdFx0XHRjb25zdCBsb2NhbEZvbGRlciA9IFVSSS5maWxlKCcvcmVwb3MvbG9jYWwtcHJvamVjdCcpO1xuXHRcdFx0Y29uc3QgYWdlbnRIb3N0Rm9sZGVyID0gVVJJLmZyb20oeyBzY2hlbWU6ICd2c2NvZGUtYWdlbnQtaG9zdCcsIGF1dGhvcml0eTogJ3JlbW90ZScsIHBhdGg6ICcvcmVwb3MvcmVtb3RlLXByb2plY3QnIH0pO1xuXHRcdFx0Y29uc3QgZm9sZGVycyA9IFtsb2NhbEZvbGRlciwgYWdlbnRIb3N0Rm9sZGVyXS5tYXAoKHVyaSwgaW5kZXgpID0+IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVdvcmtzcGFjZUZvbGRlcj4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHVyaSA9IHVyaTtcblx0XHRcdFx0b3ZlcnJpZGUgbmFtZSA9IGJhc2VuYW1lKHVyaSk7XG5cdFx0XHRcdG92ZXJyaWRlIGluZGV4ID0gaW5kZXg7XG5cdFx0XHR9KTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBtb2NrV29ya3NwYWNlU2VydmljZShmb2xkZXJzKSk7XG5cdFx0XHRsb2NhdG9yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0RmlsZXNMb2NhdG9yKTtcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7IHBhdGg6ICcvcmVwb3MvbG9jYWwtcHJvamVjdC8uZ2l0L0hFQUQnLCBjb250ZW50czogWydyZWY6IHJlZnMvaGVhZHMvbWFpbiddIH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3Qgcm9vdHMgPSBhd2FpdCBsb2NhdG9yLmdldFdvcmtzcGFjZUZvbGRlclJvb3RzKHRydWUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0cm9vdHMubWFwKHIgPT4gci50b1N0cmluZygpKSxcblx0XHRcdFx0W2xvY2FsRm9sZGVyLnRvU3RyaW5nKCldLFxuXHRcdFx0XHQnU2hvdWxkIGV4Y2x1ZGUgdnNjb2RlLWFnZW50LWhvc3Qgd29ya3NwYWNlIGZvbGRlcnMgZnJvbSBwcm9tcHQtZmlsZSBkaXNjb3Zlcnkgcm9vdHMnLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3RUKCdyZXR1cm5zIG9ubHkgd29ya3NwYWNlIGZvbGRlciB3aGVuIG5vIC5naXQgaXMgZm91bmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRXb3Jrc3BhY2VGb2xkZXJzRm9yUm9vdHMoWycvVXNlcnMvbGVnb211c2hyb29tL215LXByb2plY3QnXSk7XG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0eyBwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9teS1wcm9qZWN0L3NyYy9pbmRleC50cycsIGNvbnRlbnRzOiBbJ2V4cG9ydCB7fTsnXSB9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IHJvb3RzID0gYXdhaXQgbG9jYXRvci5nZXRXb3Jrc3BhY2VGb2xkZXJSb290cyh0cnVlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHJvb3RzLm1hcChyID0+IHIucGF0aCksXG5cdFx0XHRcdFsnL1VzZXJzL2xlZ29tdXNocm9vbS9teS1wcm9qZWN0J10sXG5cdFx0XHRcdCdTaG91bGQgb25seSByZXR1cm4gdGhlIHdvcmtzcGFjZSBmb2xkZXIgd2hlbiBubyAuZ2l0IGlzIGZvdW5kIGluIGFueSBwYXJlbnQnLFxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG5cdHN1aXRlKCdnZXRIb29rU291cmNlRm9sZGVycycsICgpID0+IHtcblx0XHR0ZXN0VCgncmV0dXJucyBzb3VyY2UgbWV0YWRhdGEgZm9yIGhvb2sgZm9sZGVycycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbmZpZ1ZhbHVlc1tQcm9tcHRzQ29uZmlnLkhPT0tTX0xPQ0FUSU9OX0tFWV0gPSB7XG5cdFx0XHRcdCcuZ2l0aHViL2hvb2tzJzogdHJ1ZSxcblx0XHRcdFx0J34vLmNvcGlsb3QvaG9va3MnOiB0cnVlLFxuXHRcdFx0XHQvLyBkaXNhYmxlIENsYXVkZSBwYXRocyAod2hpY2ggYXJlIGZpbHRlcmVkIG91dCBhbnl3YXkpXG5cdFx0XHRcdCcuY2xhdWRlL3NldHRpbmdzLmpzb24nOiBmYWxzZSxcblx0XHRcdFx0Jy5jbGF1ZGUvc2V0dGluZ3MubG9jYWwuanNvbic6IGZhbHNlLFxuXHRcdFx0XHQnfi8uY2xhdWRlL3NldHRpbmdzLmpzb24nOiBmYWxzZSxcblx0XHRcdH07XG5cdFx0XHRzZXRXb3Jrc3BhY2VGb2xkZXJzKFsnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUnXSk7XG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtdKTtcblx0XHRcdGNvbnN0IGxvY2F0b3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRGaWxlc0xvY2F0b3IpO1xuXG5cdFx0XHRjb25zdCBmb2xkZXJzID0gYXdhaXQgbG9jYXRvci5nZXRIb29rU291cmNlRm9sZGVycygpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRmb2xkZXJzLm1hcChmID0+ICh7IHBhdGg6IGYudXJpLnBhdGgsIHNvdXJjZTogZi5zb3VyY2UsIHN0b3JhZ2U6IGYuc3RvcmFnZSB9KSksXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR7IHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8uZ2l0aHViL2hvb2tzJywgc291cmNlOiBQcm9tcHRGaWxlU291cmNlLkdpdEh1YldvcmtzcGFjZSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwgfSxcblx0XHRcdFx0XHR7IHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tLy5jb3BpbG90L2hvb2tzJywgc291cmNlOiBQcm9tcHRGaWxlU291cmNlLkNvcGlsb3RQZXJzb25hbCwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UudXNlciB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3RUKCdleGNsdWRlcyBDbGF1ZGUgcGF0aHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25maWdWYWx1ZXNbUHJvbXB0c0NvbmZpZy5IT09LU19MT0NBVElPTl9LRVldID0ge1xuXHRcdFx0XHQnLmdpdGh1Yi9ob29rcyc6IHRydWUsXG5cdFx0XHRcdCcuY2xhdWRlL3NldHRpbmdzLmpzb24nOiB0cnVlLFxuXHRcdFx0XHQnLmNsYXVkZS9zZXR0aW5ncy5sb2NhbC5qc29uJzogdHJ1ZSxcblx0XHRcdFx0J34vLmNsYXVkZS9zZXR0aW5ncy5qc29uJzogdHJ1ZSxcblx0XHRcdFx0J34vLmNvcGlsb3QvaG9va3MnOiB0cnVlLFxuXHRcdFx0fTtcblx0XHRcdHNldFdvcmtzcGFjZUZvbGRlcnMoWycvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZSddKTtcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW10pO1xuXHRcdFx0Y29uc3QgbG9jYXRvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdEZpbGVzTG9jYXRvcik7XG5cblx0XHRcdGNvbnN0IGZvbGRlcnMgPSBhd2FpdCBsb2NhdG9yLmdldEhvb2tTb3VyY2VGb2xkZXJzKCk7XG5cblx0XHRcdC8vIENsYXVkZSBwYXRocyBzaG91bGQgYmUgZmlsdGVyZWQgb3V0XG5cdFx0XHRjb25zdCBwYXRocyA9IGZvbGRlcnMubWFwKGYgPT4gZi51cmkucGF0aCk7XG5cdFx0XHRhc3NlcnQub2soIXBhdGhzLnNvbWUocCA9PiBwLmluY2x1ZGVzKCcuY2xhdWRlJykpLCAnQ2xhdWRlIHBhdGhzIG11c3QgYmUgZXhjbHVkZWQnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGF0aHMsIFtcblx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLy5naXRodWIvaG9va3MnLFxuXHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS8uY29waWxvdC9ob29rcycsXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2xpc3RGaWxlcyB3aXRoIFByb21wdHNUeXBlLmhvb2snLCAoKSA9PiB7XG5cdFx0dGVzdFQoJ29ubHkgcmV0dXJucyB0YXJnZXRlZCBqc29uIGZpbGVzLCBub3Qgc2libGluZyBqc29uIGZpbGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uZmlnVmFsdWVzW1Byb21wdHNDb25maWcuSE9PS1NfTE9DQVRJT05fS0VZXSA9IHtcblx0XHRcdFx0Jy5jbGF1ZGUvc2V0dGluZ3MuanNvbic6IHRydWUsXG5cdFx0XHRcdCcuY2xhdWRlL3NldHRpbmdzLmxvY2FsLmpzb24nOiB0cnVlLFxuXHRcdFx0XHQnfi8uY2xhdWRlL3NldHRpbmdzLmpzb24nOiB0cnVlLFxuXHRcdFx0XHQnLmdpdGh1Yi9ob29rcyc6IHRydWUsXG5cdFx0XHRcdCd+Ly5jb3BpbG90L2hvb2tzJzogdHJ1ZSxcblx0XHRcdH07XG5cdFx0XHRzZXRXb3Jrc3BhY2VGb2xkZXJzKFsnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUnXSk7XG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0Ly8gdGFyZ2V0ZWQgZmlsZXMgdGhhdCBzaG91bGQgYmUgZm91bmRcblx0XHRcdFx0eyBwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvLmNsYXVkZS9zZXR0aW5ncy5qc29uJywgY29udGVudHM6IFsne30nXSB9LFxuXHRcdFx0XHR7IHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tL3JlcG9zL3ZzY29kZS8uY2xhdWRlL3NldHRpbmdzLmxvY2FsLmpzb24nLCBjb250ZW50czogWyd7fSddIH0sXG5cdFx0XHRcdC8vIHNpYmxpbmcgZmlsZXMgaW4gLmNsYXVkZS8gdGhhdCBzaG91bGQgTk9UIGJlIGZvdW5kXG5cdFx0XHRcdHsgcGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLy5jbGF1ZGUvY29uZmlnLmpzb24nLCBjb250ZW50czogWyd7fSddIH0sXG5cdFx0XHRcdHsgcGF0aDogJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLy5jbGF1ZGUvc3RhdHMtY2FjaGUuanNvbicsIGNvbnRlbnRzOiBbJ3t9J10gfSxcblx0XHRcdFx0Ly8gaG9vayBkaXJlY3RvcnkgZmlsZXMgdGhhdCBzaG91bGQgYmUgZm91bmRcblx0XHRcdFx0eyBwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS9yZXBvcy92c2NvZGUvLmdpdGh1Yi9ob29rcy9wcmUtY29tbWl0Lmpzb24nLCBjb250ZW50czogWyd7fSddIH0sXG5cdFx0XHRdKTtcblx0XHRcdGNvbnN0IGxvY2F0b3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRGaWxlc0xvY2F0b3IpO1xuXG5cdFx0XHRjb25zdCBmaWxlcyA9IGF3YWl0IGxvY2F0b3IubGlzdEZpbGVzKFByb21wdHNUeXBlLmhvb2ssIFByb21wdHNTdG9yYWdlLmxvY2FsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdGZpbGVzLm1hcChmID0+IGYucGF0aCkuc29ydCgpLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLy5jbGF1ZGUvc2V0dGluZ3MuanNvbicsXG5cdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLy5jbGF1ZGUvc2V0dGluZ3MubG9jYWwuanNvbicsXG5cdFx0XHRcdFx0Jy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlLy5naXRodWIvaG9va3MvcHJlLWNvbW1pdC5qc29uJyxcblx0XHRcdFx0XSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0VCgncmV0dXJucyBob29rIGZpbGVzIGZyb20gdXNlciBob21lIHNwZWNpZmljIGpzb24gcGF0aHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25maWdWYWx1ZXNbUHJvbXB0c0NvbmZpZy5IT09LU19MT0NBVElPTl9LRVldID0ge1xuXHRcdFx0XHQnfi8uY2xhdWRlL3NldHRpbmdzLmpzb24nOiB0cnVlLFxuXHRcdFx0XHQnfi8uY29waWxvdC9ob29rcyc6IHRydWUsXG5cdFx0XHR9O1xuXHRcdFx0c2V0V29ya3NwYWNlRm9sZGVycyhbJy9Vc2Vycy9sZWdvbXVzaHJvb20vcmVwb3MvdnNjb2RlJ10pO1xuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdC8vIHRhcmdldGVkIHVzZXIgZmlsZVxuXHRcdFx0XHR7IHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tLy5jbGF1ZGUvc2V0dGluZ3MuanNvbicsIGNvbnRlbnRzOiBbJ3t9J10gfSxcblx0XHRcdFx0Ly8gc2libGluZyBmaWxlcyB0aGF0IHNob3VsZCBOT1QgYmUgZm91bmRcblx0XHRcdFx0eyBwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS8uY2xhdWRlL2NvbmZpZy5qc29uJywgY29udGVudHM6IFsne30nXSB9LFxuXHRcdFx0XHR7IHBhdGg6ICcvVXNlcnMvbGVnb211c2hyb29tLy5jbGF1ZGUvc3RhdHMtY2FjaGUuanNvbicsIGNvbnRlbnRzOiBbJ3t9J10gfSxcblx0XHRcdFx0Ly8gaG9vayBkaXJlY3RvcnkgZmlsZXNcblx0XHRcdFx0eyBwYXRoOiAnL1VzZXJzL2xlZ29tdXNocm9vbS8uY29waWxvdC9ob29rcy9teS1ob29rLmpzb24nLCBjb250ZW50czogWyd7fSddIH0sXG5cdFx0XHRdKTtcblx0XHRcdGNvbnN0IGxvY2F0b3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRGaWxlc0xvY2F0b3IpO1xuXG5cdFx0XHRjb25zdCBmaWxlcyA9IGF3YWl0IGxvY2F0b3IubGlzdEZpbGVzKFByb21wdHNUeXBlLmhvb2ssIFByb21wdHNTdG9yYWdlLnVzZXIsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0ZmlsZXMubWFwKGYgPT4gZi5wYXRoKS5zb3J0KCksXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQnL1VzZXJzL2xlZ29tdXNocm9vbS8uY2xhdWRlL3NldHRpbmdzLmpzb24nLFxuXHRcdFx0XHRcdCcvVXNlcnMvbGVnb211c2hyb29tLy5jb3BpbG90L2hvb2tzL215LWhvb2suanNvbicsXG5cdFx0XHRcdF0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZ2V0U291cmNlRGVzY3JpcHRpb24nLCAoKSA9PiB7XG5cdFx0dGVzdCgncmV0dXJucyBkZXNjcmlwdGlvbnMgZm9yIGFsbCBrbm93biBmb2xkZXIgc291cmNlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGZvbGRlclNvdXJjZXM6IFByb21wdEZpbGVTb3VyY2VbXSA9IFtcblx0XHRcdFx0UHJvbXB0RmlsZVNvdXJjZS5BZ2VudHNXb3Jrc3BhY2UsXG5cdFx0XHRcdFByb21wdEZpbGVTb3VyY2UuQWdlbnRzUGVyc29uYWwsXG5cdFx0XHRcdFByb21wdEZpbGVTb3VyY2UuR2l0SHViV29ya3NwYWNlLFxuXHRcdFx0XHRQcm9tcHRGaWxlU291cmNlLkNvcGlsb3RQZXJzb25hbCxcblx0XHRcdFx0UHJvbXB0RmlsZVNvdXJjZS5DbGF1ZGVXb3Jrc3BhY2UsXG5cdFx0XHRcdFByb21wdEZpbGVTb3VyY2UuQ2xhdWRlV29ya3NwYWNlTG9jYWwsXG5cdFx0XHRcdFByb21wdEZpbGVTb3VyY2UuQ2xhdWRlUGVyc29uYWwsXG5cdFx0XHRcdFByb21wdEZpbGVTb3VyY2UuVXNlckRhdGEsXG5cdFx0XHRcdFByb21wdEZpbGVTb3VyY2UuQ29uZmlnV29ya3NwYWNlLFxuXHRcdFx0XHRQcm9tcHRGaWxlU291cmNlLkNvbmZpZ1BlcnNvbmFsLFxuXHRcdFx0XTtcblxuXHRcdFx0Zm9yIChjb25zdCBzb3VyY2Ugb2YgZm9sZGVyU291cmNlcykge1xuXHRcdFx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IGdldFNvdXJjZURlc2NyaXB0aW9uKHNvdXJjZSk7XG5cdFx0XHRcdGFzc2VydC5vayh0eXBlb2YgZGVzY3JpcHRpb24gPT09ICdzdHJpbmcnICYmIGRlc2NyaXB0aW9uLmxlbmd0aCA+IDAsIGBFeHBlY3RlZCBhIGRlc2NyaXB0aW9uIGZvciAke3NvdXJjZX1gKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciBleHRlbnNpb24vcGx1Z2luIHNvdXJjZXMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U291cmNlRGVzY3JpcHRpb24oUHJvbXB0RmlsZVNvdXJjZS5FeHRlbnNpb25Db250cmlidXRpb24pLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFNvdXJjZURlc2NyaXB0aW9uKFByb21wdEZpbGVTb3VyY2UuRXh0ZW5zaW9uQVBJKSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRTb3VyY2VEZXNjcmlwdGlvbihQcm9tcHRGaWxlU291cmNlLlBsdWdpbiksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbmZ1bmN0aW9uIGFzc2VydE91dGNvbWUoYWN0dWFsOiByZWFkb25seSBVUklbXSwgZXhwZWN0ZWQ6IHN0cmluZ1tdLCBtZXNzYWdlOiBzdHJpbmcpIHtcblx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubWFwKCh1cmkpID0+IHVyaS5wYXRoKSwgZXhwZWN0ZWQsIG1lc3NhZ2UpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsbUJBQW1CLCtCQUErQjtBQUMzRCxTQUFTLGFBQWE7QUFDdEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsVUFBVSxvQkFBb0I7QUFDdkMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsWUFBWTtBQUNyQixTQUFTLCtDQUErQztBQUN4RCxTQUFrQyw2QkFBNkI7QUFDL0QsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxhQUFhLHNCQUFzQjtBQUM1QyxTQUFxQixnQ0FBa0Q7QUFDdkUsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBaUMsc0JBQXNCO0FBQ3ZELFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsc0JBQXNCLGtCQUFrQixtQkFBbUI7QUFDcEUsU0FBUyxnQkFBZ0IsYUFBYSx5QkFBeUIsMEJBQTBCO0FBQ3pGLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsNEJBQTRCLDJDQUEyQztBQUNoRixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHdDQUF3QztBQUtqRCxTQUFTLGtCQUFrQixjQUE4RDtBQUN4RixTQUFPLFlBQW1DO0FBQUEsSUFDekMsU0FBUyxL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VSxZQUFZLFFBQVEsZUFBZSxPQUFPLGtCQUFrQixJQUFJO0FBQUEsY0FDeEY7QUFBQSxnQkFDQztBQUFBLGdCQUNBO0FBQUEsZ0JBQ0E7QUFBQSxnQkFDQTtBQUFBLGNBQ0Q7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFVBQ0Q7QUFBQSxRQUNELENBQUM7QUFFRCxjQUFNLFlBQVksWUFBWTtBQUM3QixnQkFBTSxlQUFlO0FBQUEsWUFDcEI7QUFBQSxjQUNDO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsY0FDQTtBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FD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QUFBQSxnQkFDQztBQUFBLGdCQUNBO0FBQUEsZ0JBQ0E7QUFBQSxnQkFDQTtBQUFBLGNBQ0Q7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFVBRUQ7QUFBQSxRQUNELENBQUM7QUFFRCxjQUFNLFlBQVksWUFBWTtBQUM3QixnQkFBTSxlQUFlO0FBQUEsWUFDcEI7QUFBQSxjQUNDO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsY0FDQTtBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFB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WUFBWSxZQUFZO0FBQzdCLGdCQUFNLGVBQWU7QUFBQSxZQUNwQjtBQUFBLGNBQ0M7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsY0FDQTtBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsY0FDQTtBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLGNBQ0E7QUFBQSxjQUNBO0FB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QUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxjQUNBO0FB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QSxjQUNDO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0M7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQztBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFVBQ0Q7QUFFQSxxQkFBVyxZQUFZLGNBQWM7QUFDcEMsa0JBQU0saUJBQTBDLENBQUM7QUFDakQsdUJBQVcsV0FBVyxVQUFVO0FBQy9CLDZCQUFlLE9BQU8sSUFBSTtBQUFBLFlBQzNCO0FBRUEseUJBQWEsY0FBYztBQUMzQixnQ0FBb0I7QUFBQSxjQUNuQjtBQUFBLGNBQ0E7QUFBQSxZQUNELENBQUM7QUFDRCxrQkFBTSxVQUFVLGFBQWE7QUFBQSxjQUM1QjtBQUFBLGdCQUNDLE1BQU07QUFBQSxnQkFDTixVQUFVLENBQUMsYUFBYTtBQUFBLGNBQ3pCO0FBQUEsY0FDQTtBQUFBLGdCQUNDLE1BQU07QUFBQSxnQkFDTixVQUFVLENBQUMsYUFBYTtBQUFBLGNBQ3pCO0FBQUEsY0FDQTtBQUFBLGdCQUNDLE1BQU07QUFBQSxnQkFDTixVQUFVLENBQUMsZUFBZTtBQUFBLGNBQzNCO0FBQUEsY0FDQTtBQUFBLGdCQUNDLE1BQU07QUFBQSxnQkFDTixVQUFVLENBQUMsZUFBZTtBQUFBLGNBQzNCO0FBQUEsY0FDQTtBQUFBLGdCQUNDLE1BQU07QUFBQSxnQkFDTixVQUFVLENBQUMsaUJBQWlCO0FBQUEsY0FDN0I7QUFBQSxjQUNBO0FBQUEsZ0JBQ0MsTUFBTTtBQUFBLGdCQUNOLFVBQVUsQ0FBQyxhQUFhO0FBQUEsY0FDekI7QUFBQSxjQUNBO0FBQUEsZ0JBQ0MsTUFBTTtBQUFBLGdCQUNOLFVBQVUsQ0FBQyxlQUFlO0FBQUEsY0FDM0I7QUFBQSxjQUNBO0FBQUEsZ0JBQ0MsTUFBTTtBQUFBLGdCQUNOLFVBQVUsQ0FBQyxpQkFBaUI7QUFBQSxjQUM3QjtBQUFBLFlBQ0QsQ0FBQztBQUNELGtCQUFNLFVBQVUscUJBQXFCLGVBQWUsa0JBQWtCO0FBRXRFO0FBQUEsY0FDQyxNQUFNLFFBQVEsVUFBVSxZQUFZLFFBQVEsZUFBZSxPQUFPLGtCQUFrQixJQUFJO0FBQUEsY0FDeEY7QUFBQSxnQkFDQztBQUFBLGdCQUNBO0FBQUEsZ0JBQ0E7QUFBQSxnQkFDQTtBQUFBO0FBQUEsZ0JBRUE7QUFBQSxnQkFDQTtBQUFBLGNBQ0Q7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFVBRUQ7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLGdCQUFnQixNQUFNO0FBQzNCLFVBQU0sc0VBQXNFLFlBQVk7QUFDdkYsbUJBQWE7QUFBQSxRQUNaLHdCQUF3QjtBQUFBLFFBQ3hCLGlCQUFpQjtBQUFBLFFBQ2pCLDJCQUEyQjtBQUFBLE1BQzVCLENBQUM7QUFDRCwwQkFBb0IsQ0FBQyxrQ0FBa0MsQ0FBQztBQUN4RCxZQUFNLFVBQVUsYUFBYTtBQUFBLFFBQzVCO0FBQUEsVUFDQyxNQUFNO0FBQUEsVUFDTixVQUFVLENBQUMsbUJBQW1CO0FBQUEsUUFDL0I7QUFBQSxRQUNBO0FBQUEsVUFDQyxNQUFNO0FBQUEsVUFDTixVQUFVLENBQUMsb0JBQW9CO0FBQUEsUUFDaEM7QUFBQSxRQUNBO0FBQUEsVUFDQyxNQUFNO0FBQUEsVUFDTixVQUFVLENBQUMsa0JBQWtCO0FBQUEsUUFDOUI7QUFBQSxRQUNBO0FBQUEsVUFDQyxNQUFNO0FBQUEsVUFDTixVQUFVLENBQUMsa0JBQWtCO0FBQUEsUUFDOUI7QUFBQSxNQUNELENBQUM7QUFDRCxZQUFNLFVBQVUscUJBQXFCLGVBQWUsa0JBQWtCO0FBRXRFO0FBQUEsUUFDQyxNQUFNLFFBQVEsVUFBVSxZQUFZLGNBQWMsZUFBZSxPQUFPLGtCQUFrQixJQUFJO0FBQUEsUUFDOUY7QUFBQSxVQUNDO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSxVQUFVLE1BQU07QUFDckIsVUFBTSxtQkFBbUIsTUFBTTtBQUM5QixZQUFNLDZDQUE2QyxZQUFZO0FBQzlELHFCQUFhO0FBQUEsVUFDWixrQkFBa0I7QUFBQTtBQUFBLFVBRWxCLGtCQUFrQjtBQUFBLFVBQ2xCLHFCQUFxQjtBQUFBLFVBQ3JCLG9CQUFvQjtBQUFBLFFBQ3JCLENBQUM7QUFDRCw0QkFBb0IsQ0FBQyxrQ0FBa0MsQ0FBQztBQUN4RCxjQUFNLFVBQVUsYUFBYTtBQUFBLFVBQzVCO0FBQUEsWUFDQyxNQUFNO0FBQUEsWUFDTixVQUFVLENBQUMsY0FBYztBQUFBLFVBQzFCO0FBQUEsVUFDQTtBQUFBLFlBQ0MsTUFBTTtBQUFBLFlBQ04sVUFBVSxDQUFDLGVBQWU7QUFBQSxVQUMzQjtBQUFBLFFBQ0QsQ0FBQztBQUNELGNBQU0sVUFBVSxxQkFBcUIsZUFBZSxrQkFBa0I7QUFFdEUsY0FBTSxTQUFTLE1BQU0sUUFBUSxnQkFBZ0Isa0JBQWtCLElBQUk7QUFDbkU7QUFBQSxVQUNDLE9BQU8sSUFBSSxPQUFLLEVBQUUsR0FBRztBQUFBLFVBQ3JCO0FBQUEsWUFDQztBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxZQUFNLG9DQUFvQyxZQUFZO0FBQ3JELHFCQUFhO0FBQUEsVUFDWixrQkFBa0I7QUFBQTtBQUFBLFVBRWxCLGtCQUFrQjtBQUFBLFVBQ2xCLHFCQUFxQjtBQUFBLFVBQ3JCLG9CQUFvQjtBQUFBLFFBQ3JCLENBQUM7QUFDRCw0QkFBb0IsQ0FBQyxrQ0FBa0MsQ0FBQztBQUN4RCxjQUFNLFVBQVUsYUFBYTtBQUFBLFVBQzVCO0FBQUEsWUFDQyxNQUFNO0FBQUEsWUFDTixVQUFVLENBQUMsZUFBZTtBQUFBLFVBQzNCO0FBQUEsVUFDQTtBQUFBLFlBQ0MsTUFBTTtBQUFBLFlBQ04sVUFBVSxDQUFDLGtCQUFrQjtBQUFBLFVBQzlCO0FBQUEsVUFDQTtBQUFBLFlBQ0MsTUFBTTtBQUFBLFlBQ04sVUFBVSxDQUFDLDRCQUE0QjtBQUFBLFVBQ3hDO0FBQUEsUUFDRCxDQUFDO0FBQ0QsY0FBTSxVQUFVLHFCQUFxQixlQUFlLGtCQUFrQjtBQUV0RSxjQUFNLFNBQVMsTUFBTSxRQUFRLGdCQUFnQixrQkFBa0IsSUFBSTtBQUNuRTtBQUFBLFVBQ0MsT0FBTyxJQUFJLE9BQUssRUFBRSxHQUFHO0FBQUEsVUFDckI7QUFBQSxZQUNDO0FBQUEsVUFDRDtBQUFBLFVBQ0E7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsWUFBTSw0Q0FBNEMsWUFBWTtBQUM3RCxxQkFBYTtBQUFBLFVBQ1osa0JBQWtCO0FBQUE7QUFBQSxVQUVsQixrQkFBa0I7QUFBQSxVQUNsQixxQkFBcUI7QUFBQSxVQUNyQixvQkFBb0I7QUFBQSxRQUNyQixDQUFDO0FBQ0QsNEJBQW9CLENBQUMsa0NBQWtDLENBQUM7QUFDeEQsY0FBTSxVQUFVLGFBQWEsQ0FBQyxDQUFDO0FBQy9CLGNBQU0sVUFBVSxxQkFBcUIsZUFBZSxrQkFBa0I7QUFFdEUsY0FBTSxTQUFTLE1BQU0sUUFBUSxnQkFBZ0Isa0JBQWtCLElBQUk7QUFDbkU7QUFBQSxVQUNDLE9BQU8sSUFBSSxPQUFLLEVBQUUsR0FBRztBQUFBLFVBQ3JCLENBQUM7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUVELFlBQU0sd0RBQXdELFlBQVk7QUFDekUscUJBQWE7QUFBQSxVQUNaLGtCQUFrQjtBQUFBO0FBQUEsVUFFbEIsa0JBQWtCO0FBQUEsVUFDbEIscUJBQXFCO0FBQUEsVUFDckIsb0JBQW9CO0FBQUEsUUFDckIsQ0FBQztBQUNELDRCQUFvQixDQUFDLGtDQUFrQyxDQUFDO0FBQ3hELGNBQU0sVUFBVSxhQUFhLENBQUMsQ0FBQztBQUMvQixjQUFNLFVBQVUscUJBQXFCLGVBQWUsa0JBQWtCO0FBRXRFLGNBQU0sU0FBUyxNQUFNLFFBQVEsZ0JBQWdCLGtCQUFrQixJQUFJO0FBQ25FO0FBQUEsVUFDQyxPQUFPLElBQUksT0FBSyxFQUFFLEdBQUc7QUFBQSxVQUNyQixDQUFDO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxZQUFNLGtEQUFrRCxZQUFZO0FBQ25FLHFCQUFhO0FBQUEsVUFDWixrQkFBa0I7QUFBQTtBQUFBLFVBRWxCLGtCQUFrQjtBQUFBLFVBQ2xCLHFCQUFxQjtBQUFBLFVBQ3JCLG9CQUFvQjtBQUFBLFFBQ3JCLENBQUM7QUFDRCw0QkFBb0I7QUFBQSxVQUNuQjtBQUFBLFVBQ0E7QUFBQSxRQUNELENBQUM7QUFDRCxjQUFNLFVBQVUsYUFBYTtBQUFBLFVBQzVCO0FBQUEsWUFDQyxNQUFNO0FBQUEsWUFDTixVQUFVLENBQUMsV0FBVztBQUFBLFVBQ3ZCO0FBQUEsVUFDQTtBQUFBLFlBQ0MsTUFBTTtBQUFBLFlBQ04sVUFBVSxDQUFDLFdBQVc7QUFBQSxVQUN2QjtBQUFBLFFBQ0QsQ0FBQztBQUNELGNBQU0sVUFBVSxxQkFBcUIsZUFBZSxrQkFBa0I7QUFFdEUsY0FBTSxTQUFTLE1BQU0sUUFBUSxnQkFBZ0Isa0JBQWtCLElBQUk7QUFDbkU7QUFBQSxVQUNDLE9BQU8sSUFBSSxPQUFLLEVBQUUsR0FBRztBQUFBLFVBQ3JCO0FBQUEsWUFDQztBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxVQUFNLG9DQUFvQyxNQUFNO0FBQy9DLFlBQU0sa0RBQWtELFlBQVk7QUFDbkUscUJBQWE7QUFBQSxVQUNaLGtCQUFrQjtBQUFBO0FBQUEsVUFFbEIsa0JBQWtCO0FBQUEsVUFDbEIscUJBQXFCO0FBQUEsVUFDckIsb0JBQW9CO0FBQUEsUUFDckIsQ0FBQztBQUNELDRCQUFvQixDQUFDLGtDQUFrQyxDQUFDO0FBQ3hELGNBQU0sVUFBVSxhQUFhO0FBQUEsVUFDNUI7QUFBQSxZQUNDLE1BQU07QUFBQSxZQUNOLFVBQVUsQ0FBQyxjQUFjO0FBQUEsVUFDMUI7QUFBQSxRQUNELENBQUM7QUFDRCxjQUFNLFVBQVUscUJBQXFCLGVBQWUsa0JBQWtCO0FBRXRFLGNBQU0sUUFBUSxNQUFNLFFBQVEsVUFBVSxZQUFZLE9BQU8sZUFBZSxPQUFPLGtCQUFrQixJQUFJO0FBQ3JHO0FBQUEsVUFDQztBQUFBLFVBQ0EsQ0FBQztBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsVUFBTSxnREFBZ0QsTUFBTTtBQUMzRCxZQUFNLHdFQUF3RSxZQUFZO0FBQ3pGLHFCQUFhO0FBQUEsVUFDWixhQUFhO0FBQUEsVUFDYixZQUFZO0FBQUEsVUFDWixhQUFhO0FBQUE7QUFBQSxVQUViLGtCQUFrQjtBQUFBLFVBQ2xCLGtCQUFrQjtBQUFBLFVBQ2xCLGtCQUFrQjtBQUFBLFVBQ2xCLHFCQUFxQjtBQUFBLFVBQ3JCLG9CQUFvQjtBQUFBLFVBQ3BCLG9CQUFvQjtBQUFBLFFBQ3JCLENBQUM7QUFDRCw0QkFBb0IsQ0FBQyxrQ0FBa0MsQ0FBQztBQUN4RCxjQUFNLFVBQVUsYUFBYSxDQUFDLENBQUM7QUFDL0IsY0FBTSxVQUFVLHFCQUFxQixlQUFlLGtCQUFrQjtBQUV0RSxjQUFNLFVBQVUsTUFBTSxRQUFRLDRCQUE0QixZQUFZLEtBQUs7QUFDM0U7QUFBQSxVQUNDO0FBQUEsVUFDQSxDQUFDO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxZQUFNLHlFQUF5RSxZQUFZO0FBQzFGLHFCQUFhO0FBQUEsVUFDWix5QkFBeUI7QUFBQTtBQUFBLFVBRXpCLGtCQUFrQjtBQUFBLFVBQ2xCLGtCQUFrQjtBQUFBLFVBQ2xCLGtCQUFrQjtBQUFBLFVBQ2xCLHFCQUFxQjtBQUFBLFVBQ3JCLG9CQUFvQjtBQUFBLFVBQ3BCLG9CQUFvQjtBQUFBLFFBQ3JCLENBQUM7QUFDRCw0QkFBb0IsQ0FBQyxrQ0FBa0MsQ0FBQztBQUN4RCxjQUFNLFVBQVUsYUFBYSxDQUFDLENBQUM7QUFDL0IsY0FBTSxVQUFVLHFCQUFxQixlQUFlLGtCQUFrQjtBQUV0RSxjQUFNLFVBQVUsTUFBTSxRQUFRLDRCQUE0QixZQUFZLEtBQUs7QUFDM0U7QUFBQSxVQUNDO0FBQUEsVUFDQSxDQUFDO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxZQUFNLHlFQUF5RSxZQUFZO0FBQzFGLHFCQUFhO0FBQUEsVUFDWixlQUFlO0FBQUEsVUFDZixpQkFBaUI7QUFBQTtBQUFBLFVBRWpCLGtCQUFrQjtBQUFBLFVBQ2xCLGtCQUFrQjtBQUFBLFVBQ2xCLGtCQUFrQjtBQUFBLFVBQ2xCLHFCQUFxQjtBQUFBLFVBQ3JCLG9CQUFvQjtBQUFBLFVBQ3BCLG9CQUFvQjtBQUFBLFFBQ3JCLENBQUM7QUFDRCw0QkFBb0IsQ0FBQyxrQ0FBa0MsQ0FBQztBQUN4RCxjQUFNLFVBQVUsYUFBYSxDQUFDLENBQUM7QUFDL0IsY0FBTSxVQUFVLHFCQUFxQixlQUFlLGtCQUFrQjtBQUV0RSxjQUFNLFVBQVUsTUFBTSxRQUFRLDRCQUE0QixZQUFZLEtBQUs7QUFDM0U7QUFBQSxVQUNDO0FBQUEsVUFDQTtBQUFBLFlBQ0M7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFVBQ0E7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsWUFBTSwrRUFBK0UsWUFBWTtBQUNoRyxxQkFBYTtBQUFBLFVBQ1osb0JBQW9CO0FBQUE7QUFBQSxVQUVwQixrQkFBa0I7QUFBQSxVQUNsQixrQkFBa0I7QUFBQSxVQUNsQixrQkFBa0I7QUFBQSxVQUNsQixxQkFBcUI7QUFBQSxVQUNyQixvQkFBb0I7QUFBQSxVQUNwQixvQkFBb0I7QUFBQSxRQUNyQixDQUFDO0FBQ0QsNEJBQW9CLENBQUMsa0NBQWtDLENBQUM7QUFDeEQsY0FBTSxVQUFVLGFBQWEsQ0FBQyxDQUFDO0FBQy9CLGNBQU0sVUFBVSxxQkFBcUIsZUFBZSxrQkFBa0I7QUFFdEUsY0FBTSxVQUFVLE1BQU0sUUFBUSw0QkFBNEIsWUFBWSxLQUFLO0FBQzNFO0FBQUEsVUFDQztBQUFBLFVBQ0E7QUFBQSxZQUNDO0FBQUEsVUFDRDtBQUFBLFVBQ0E7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsWUFBTSw0Q0FBNEMsWUFBWTtBQUM3RCxxQkFBYTtBQUFBLFVBQ1osZUFBZTtBQUFBO0FBQUEsVUFFZixrQkFBa0I7QUFBQSxVQUNsQixrQkFBa0I7QUFBQSxVQUNsQixrQkFBa0I7QUFBQSxVQUNsQixxQkFBcUI7QUFBQSxVQUNyQixvQkFBb0I7QUFBQSxVQUNwQixvQkFBb0I7QUFBQSxRQUNyQixDQUFDO0FBQ0QsNEJBQW9CLENBQUMsa0NBQWtDLENBQUM7QUFDeEQsY0FBTSxVQUFVLGFBQWEsQ0FBQyxDQUFDO0FBQy9CLGNBQU0sVUFBVSxxQkFBcUIsZUFBZSxrQkFBa0I7QUFFdEUsY0FBTSxVQUFVLE1BQU0sUUFBUSw0QkFBNEIsWUFBWSxLQUFLO0FBQzNFO0FBQUEsVUFDQztBQUFBLFVBQ0E7QUFBQSxZQUNDO0FBQUEsVUFDRDtBQUFBLFVBQ0E7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsVUFBTSwwQ0FBMEMsTUFBTTtBQUNyRCxZQUFNLGtEQUFrRCxZQUFZO0FBQ25FLHFCQUFhO0FBQUEsVUFDWixrQkFBa0I7QUFBQSxVQUNsQixpQkFBaUI7QUFBQTtBQUFBLFVBRWpCLGtCQUFrQjtBQUFBLFVBQ2xCLGtCQUFrQjtBQUFBLFVBQ2xCLHFCQUFxQjtBQUFBLFVBQ3JCLG9CQUFvQjtBQUFBLFVBQ3BCLG9CQUFvQjtBQUFBLFFBQ3JCLENBQUM7QUFDRCw0QkFBb0I7QUFBQSxVQUNuQjtBQUFBLFVBQ0E7QUFBQSxRQUNELENBQUM7QUFDRCxjQUFNLFVBQVUsYUFBYSxDQUFDLENBQUM7QUFDL0IsY0FBTSxVQUFVLHFCQUFxQixlQUFlLGtCQUFrQjtBQUV0RSxjQUFNLFVBQVUsTUFBTSxRQUFRLDRCQUE0QixZQUFZLEtBQUs7QUFDM0U7QUFBQSxVQUNDO0FBQUEsVUFDQTtBQUFBLFlBQ0M7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxZQUFNLHVEQUF1RCxZQUFZO0FBQ3hFLHFCQUFhO0FBQUEsVUFDWixrQkFBa0I7QUFBQSxVQUNsQixhQUFhO0FBQUE7QUFBQSxVQUNiLG9CQUFvQjtBQUFBO0FBQUE7QUFBQSxVQUVwQixrQkFBa0I7QUFBQSxVQUNsQixrQkFBa0I7QUFBQSxVQUNsQixxQkFBcUI7QUFBQSxVQUNyQixvQkFBb0I7QUFBQSxVQUNwQixvQkFBb0I7QUFBQSxRQUNyQixDQUFDO0FBQ0QsNEJBQW9CLENBQUMsa0NBQWtDLENBQUM7QUFDeEQsY0FBTSxVQUFVLGFBQWEsQ0FBQyxDQUFDO0FBQy9CLGNBQU0sVUFBVSxxQkFBcUIsZUFBZSxrQkFBa0I7QUFFdEUsY0FBTSxVQUFVLE1BQU0sUUFBUSw0QkFBNEIsWUFBWSxLQUFLO0FBQzNFO0FBQUEsVUFDQztBQUFBLFVBQ0E7QUFBQSxZQUNDO0FBQUEsVUFDRDtBQUFBLFVBQ0E7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsWUFBTSx1REFBdUQsWUFBWTtBQUN4RSxxQkFBYTtBQUFBLFVBQ1osaUJBQWlCO0FBQUEsUUFDbEIsQ0FBQztBQUNELDRCQUFvQixDQUFDLGtDQUFrQyxDQUFDO0FBQ3hELGNBQU0sVUFBVSxhQUFhLENBQUMsQ0FBQztBQUMvQixjQUFNLFVBQVUscUJBQXFCLGVBQWUsa0JBQWtCO0FBRXRFLGNBQU0sVUFBVSxNQUFNLFFBQVEsNEJBQTRCLFlBQVksS0FBSztBQUMzRTtBQUFBLFVBQ0M7QUFBQSxVQUNBO0FBQUE7QUFBQSxZQUVDO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQTtBQUFBLFlBRUE7QUFBQSxVQUNEO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLGVBQWUsTUFBTTtBQUMxQixVQUFNLGtCQUFrQixZQUFZO0FBQ25DLFlBQU0sUUFBUTtBQUFBLFFBQ2I7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFFQSxpQkFBVyxRQUFRLE9BQU87QUFDekI7QUFBQSxVQUNFLFlBQVksSUFBSSxNQUFNO0FBQUEsVUFDdkIsSUFBSSxJQUFJO0FBQUEsUUFDVDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFFRCxVQUFNLG9CQUFvQixZQUFZO0FBQ3JDLFlBQU0sUUFBUTtBQUFBLFFBQ2I7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBRUEsaUJBQVcsUUFBUSxPQUFPO0FBQ3pCO0FBQUEsVUFDRSxZQUFZLElBQUksTUFBTTtBQUFBLFVBQ3ZCLElBQUksSUFBSTtBQUFBLFFBQ1Q7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSxvQkFBb0IsTUFBTTtBQUMvQixVQUFNLDBCQUEwQixZQUFZO0FBQzNDLFlBQU0sYUFBYTtBQUFBLFFBQ2xCO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBRUEsaUJBQVcsUUFBUSxZQUFZO0FBQzlCLGVBQU87QUFBQSxVQUNOLHdCQUF3QixJQUFJO0FBQUEsVUFDNUI7QUFBQSxVQUNBLElBQUksSUFBSTtBQUFBLFFBQ1Q7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsVUFBTSwyQkFBMkIsWUFBWTtBQUM1QyxZQUFNLGFBQWE7QUFBQSxRQUNsQjtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFFQSxpQkFBVyxRQUFRLFlBQVk7QUFDOUIsZUFBTztBQUFBLFVBQ04sd0JBQXdCLElBQUk7QUFBQSxVQUM1QjtBQUFBLFVBQ0EsSUFBSSxJQUFJO0FBQUEsUUFDVDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFFRCxVQUFNLCtDQUErQyxZQUFZO0FBQ2hFLFlBQU0sYUFBYTtBQUFBLFFBQ2xCO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUVBLGlCQUFXLFFBQVEsWUFBWTtBQUM5QixlQUFPO0FBQUEsVUFDTix3QkFBd0IsSUFBSTtBQUFBLFVBQzVCO0FBQUEsVUFDQSxJQUFJLElBQUk7QUFBQSxRQUNUO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUVELFVBQU0sMEJBQTBCLFlBQVk7QUFDM0MsWUFBTSxlQUFlO0FBQUE7QUFBQSxRQUVwQjtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUE7QUFBQSxRQUVBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBRUEsaUJBQVcsUUFBUSxjQUFjO0FBQ2hDLGVBQU87QUFBQSxVQUNOLHdCQUF3QixJQUFJO0FBQUEsVUFDNUI7QUFBQSxVQUNBLElBQUksSUFBSTtBQUFBLFFBQ1Q7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsVUFBTSw4Q0FBOEMsWUFBWTtBQUMvRCxZQUFNLGVBQWU7QUFBQSxRQUNwQjtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUE7QUFBQSxRQUVBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFFQSxpQkFBVyxRQUFRLGNBQWM7QUFDaEMsZUFBTztBQUFBLFVBQ04sd0JBQXdCLElBQUk7QUFBQSxVQUM1QjtBQUFBLFVBQ0EsSUFBSSxJQUFJO0FBQUEsUUFDVDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFFRCxVQUFNLGtDQUFrQyxZQUFZO0FBQ25ELFlBQU0sZUFBZTtBQUFBLFFBQ3BCO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUVBLGlCQUFXLFFBQVEsY0FBYztBQUNoQyxlQUFPO0FBQUEsVUFDTix3QkFBd0IsSUFBSTtBQUFBLFVBQzVCO0FBQUEsVUFDQSxJQUFJLElBQUk7QUFBQSxRQUNUO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUVELFVBQU0seUJBQXlCLFlBQVk7QUFDMUMsWUFBTSxlQUFlO0FBQUEsUUFDcEI7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBRUEsaUJBQVcsUUFBUSxjQUFjO0FBQ2hDLGVBQU87QUFBQSxVQUNOLHdCQUF3QixJQUFJO0FBQUEsVUFDNUI7QUFBQSxVQUNBLElBQUksSUFBSTtBQUFBLFFBQ1Q7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsVUFBTSxxQ0FBcUMsWUFBWTtBQUN0RCxZQUFNLGVBQWU7QUFBQSxRQUNwQjtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFFQSxpQkFBVyxRQUFRLGNBQWM7QUFDaEMsZUFBTztBQUFBLFVBQ04sd0JBQXdCLElBQUk7QUFBQSxVQUM1QjtBQUFBLFVBQ0EsSUFBSSxJQUFJO0FBQUEsUUFDVDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFFRCxVQUFNLDZCQUE2QixZQUFZO0FBQzlDLFlBQU0sYUFBYTtBQUFBLFFBQ2xCO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUVBLGlCQUFXLFFBQVEsWUFBWTtBQUM5QixlQUFPO0FBQUEsVUFDTix3QkFBd0IsSUFBSTtBQUFBLFVBQzVCO0FBQUEsVUFDQSxJQUFJLElBQUk7QUFBQSxRQUNUO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sa0JBQWtCLE1BQU07QUFDN0IsVUFBTSwyQkFBMkIsWUFBWTtBQUM1QyxZQUFNLGdCQUFnQjtBQUFBLFFBQ3JCO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUVBLGlCQUFXLFFBQVEsZUFBZTtBQUNqQyxlQUFPO0FBQUEsVUFDTixlQUFlLElBQUk7QUFBQSxVQUNuQjtBQUFBLFVBQ0EsSUFBSSxJQUFJO0FBQUEsUUFDVDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFFRCxVQUFNLDJCQUEyQixZQUFZO0FBQzVDLFlBQU0sZ0JBQWdCO0FBQUEsUUFDckI7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBRUEsaUJBQVcsUUFBUSxlQUFlO0FBQ2pDLGVBQU87QUFBQSxVQUNOLGVBQWUsSUFBSTtBQUFBLFVBQ25CO0FBQUEsVUFDQSxJQUFJLElBQUk7QUFBQSxRQUNUO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUVELFVBQU0sNkNBQTZDLFlBQVk7QUFDOUQsWUFBTSxtQkFBbUI7QUFBQSxRQUN4QjtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBRUEsaUJBQVcsUUFBUSxrQkFBa0I7QUFDcEMsZUFBTztBQUFBLFVBQ04sZUFBZSxJQUFJO0FBQUEsVUFDbkI7QUFBQSxVQUNBLElBQUksSUFBSTtBQUFBLFFBQ1Q7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSwrQkFBK0IsTUFBTTtBQUMxQyxVQUFNLG9DQUFvQyxZQUFZO0FBQ3JELG1CQUFhO0FBQUEsUUFDWixtQkFBbUI7QUFBQSxRQUNuQixzQkFBc0I7QUFBQSxRQUN0QixlQUFlO0FBQUEsUUFDZiwrQkFBK0I7QUFBQSxRQUMvQixhQUFhO0FBQUEsUUFDYiwrQ0FBK0M7QUFBQSxRQUMvQyxzREFBc0Q7QUFBQSxRQUN0RCxzREFBc0Q7QUFBQSxNQUN2RCxDQUFDO0FBQ0QsMEJBQW9CO0FBQUEsUUFDbkI7QUFBQSxRQUNBO0FBQUEsTUFDRCxDQUFDO0FBQ0QsWUFBTSxVQUFVLGFBQWEsQ0FBQyxDQUFDO0FBQy9CLFlBQU0sVUFBVSxxQkFBcUIsZUFBZSxrQkFBa0I7QUFFdEU7QUFBQSxRQUNDLE1BQU0sUUFBUSw0QkFBNEIsWUFBWSxNQUFNO0FBQUEsUUFDNUQ7QUFBQSxVQUNDO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLDJCQUEyQixNQUFNO0FBQ3RDLFVBQU0sa0RBQWtELFlBQVk7QUFDbkUsMEJBQW9CLENBQUMscUNBQXFDLENBQUM7QUFDM0QsWUFBTSxVQUFVLGFBQWE7QUFBQSxRQUM1QjtBQUFBLFVBQ0MsTUFBTTtBQUFBLFVBQ04sVUFBVSxDQUFDLGVBQWU7QUFBQSxRQUMzQjtBQUFBLFFBQ0E7QUFBQSxVQUNDLE1BQU07QUFBQSxVQUNOLFVBQVUsQ0FBQyxjQUFjO0FBQUEsUUFDMUI7QUFBQSxNQUNELENBQUM7QUFDRCxZQUFNLFVBQVUscUJBQXFCLGVBQWUsa0JBQWtCO0FBRXRFLFlBQU0sVUFBVSxNQUFNLFFBQVEsd0JBQXdCLGtCQUFrQixJQUFJLEdBQUcsSUFBSSxPQUFLLEVBQUUsR0FBRztBQUM3RjtBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsVUFDQztBQUFBLFVBQ0E7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFFRCxVQUFNLHFEQUFxRCxZQUFZO0FBQ3RFLDBCQUFvQixDQUFDLHFDQUFxQyxDQUFDO0FBQzNELFlBQU0sVUFBVSxhQUFhO0FBQUEsUUFDNUI7QUFBQSxVQUNDLE1BQU07QUFBQSxVQUNOLFVBQVUsQ0FBQyxlQUFlO0FBQUEsUUFDM0I7QUFBQSxRQUNBO0FBQUEsVUFDQyxNQUFNO0FBQUEsVUFDTixVQUFVLENBQUMsY0FBYztBQUFBLFFBQzFCO0FBQUEsUUFDQTtBQUFBLFVBQ0MsTUFBTTtBQUFBLFVBQ04sVUFBVSxDQUFDLGlCQUFpQjtBQUFBLFFBQzdCO0FBQUEsTUFDRCxDQUFDO0FBQ0QsMkJBQXFCLEtBQUssZ0JBQWdCO0FBQUEsUUFDekMsNkJBQTZCLE1BQU07QUFBQSxRQUNuQyxNQUFNLGFBQWE7QUFBRSxnQkFBTSxJQUFJLE1BQU0sa0NBQWtDO0FBQUEsUUFBRztBQUFBLE1BQzNFLENBQUM7QUFDRCxZQUFNLFVBQVUscUJBQXFCLGVBQWUsa0JBQWtCO0FBRXRFLFlBQU0sVUFBVSxNQUFNLFFBQVEsd0JBQXdCLGtCQUFrQixJQUFJLEdBQUcsSUFBSSxPQUFLLEVBQUUsR0FBRztBQUM3RjtBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsVUFDQztBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsVUFBTSx1REFBdUQsWUFBWTtBQUN4RSwwQkFBb0IsQ0FBQyxxQ0FBcUMsQ0FBQztBQUMzRCxZQUFNLFVBQVUsYUFBYTtBQUFBLFFBQzVCO0FBQUEsVUFDQyxNQUFNO0FBQUEsVUFDTixVQUFVLENBQUMsZUFBZTtBQUFBLFFBQzNCO0FBQUEsTUFDRCxDQUFDO0FBQ0QsMkJBQXFCLEtBQUssZ0JBQWdCO0FBQUEsUUFDekMsNkJBQTZCLE1BQU07QUFBQSxRQUNuQyxNQUFNLGFBQWE7QUFBRSxnQkFBTSxJQUFJLE1BQU0sa0NBQWtDO0FBQUEsUUFBRztBQUFBLE1BQzNFLENBQUM7QUFDRCxZQUFNLFVBQVUscUJBQXFCLGVBQWUsa0JBQWtCO0FBRXRFLFlBQU0sU0FBUyxJQUFJLHdCQUF3QjtBQUUzQyxhQUFPLE9BQU87QUFDZCxZQUFNLFVBQVUsTUFBTSxRQUFRLHdCQUF3QixPQUFPLEtBQUssR0FBRyxJQUFJLE9BQUssRUFBRSxHQUFHO0FBQ25GO0FBQUEsUUFDQztBQUFBLFFBQ0EsQ0FBQztBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFFRixDQUFDO0FBRUQsUUFBTSwyQkFBMkIsTUFBTTtBQUN0QyxRQUFJO0FBR0osVUFBTSw4QkFBOEIsQ0FBQyxVQUFvQjtBQUN4RCwwQkFBb0IsS0FBSztBQUN6QixnQkFBVSxxQkFBcUIsZUFBZSxrQkFBa0I7QUFBQSxJQUNqRTtBQUVBLFVBQU0sa0RBQWtELFlBQVk7QUFDbkUsa0NBQTRCLENBQUMsbUJBQW1CLENBQUM7QUFDakQsWUFBTSxVQUFVLGFBQWE7QUFBQSxRQUM1QixFQUFFLE1BQU0sK0JBQStCLFVBQVUsQ0FBQyxzQkFBc0IsRUFBRTtBQUFBLFFBQzFFLEVBQUUsTUFBTSxrQ0FBa0MsVUFBVSxDQUFDLFlBQVksRUFBRTtBQUFBLE1BQ3BFLENBQUM7QUFFRCxZQUFNLFFBQVEsTUFBTSxRQUFRLHdCQUF3QixJQUFJO0FBQ3hELGFBQU87QUFBQSxRQUNOLE1BQU0sSUFBSSxPQUFLLEVBQUUsSUFBSTtBQUFBLFFBQ3JCLENBQUMsbUJBQW1CO0FBQUEsUUFDcEI7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsVUFBTSxrRUFBa0UsWUFBWTtBQUNuRixrQ0FBNEIsQ0FBQyxpQ0FBaUMsQ0FBQztBQUMvRCxZQUFNLFVBQVUsYUFBYTtBQUFBLFFBQzVCLEVBQUUsTUFBTSw2QkFBNkIsVUFBVSxDQUFDLHNCQUFzQixFQUFFO0FBQUEsUUFDeEUsRUFBRSxNQUFNLGdEQUFnRCxVQUFVLENBQUMsWUFBWSxFQUFFO0FBQUEsTUFDbEYsQ0FBQztBQUVELDRCQUFzQixlQUFlLENBQUMsSUFBSSxLQUFLLGlCQUFpQixDQUFDLENBQUM7QUFFbEUsWUFBTSxRQUFRLE1BQU0sUUFBUSx3QkFBd0IsSUFBSTtBQUN4RCxhQUFPO0FBQUEsUUFDTixNQUFNLElBQUksT0FBSyxFQUFFLElBQUksRUFBRSxLQUFLO0FBQUEsUUFDNUI7QUFBQSxVQUNDO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxRQUNELEVBQUUsS0FBSztBQUFBLFFBQ1A7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsVUFBTSxpREFBaUQsWUFBWTtBQUNsRSxrQ0FBNEIsQ0FBQyxpQ0FBaUMsQ0FBQztBQUMvRCxZQUFNLFVBQVUsYUFBYTtBQUFBLFFBQzVCLEVBQUUsTUFBTSw2QkFBNkIsVUFBVSxDQUFDLHNCQUFzQixFQUFFO0FBQUEsUUFDeEUsRUFBRSxNQUFNLGdEQUFnRCxVQUFVLENBQUMsWUFBWSxFQUFFO0FBQUEsTUFDbEYsQ0FBQztBQUVELDRCQUFzQixlQUFlLENBQUMsSUFBSSxLQUFLLGlCQUFpQixDQUFDLENBQUM7QUFFbEUsWUFBTSxRQUFRLE1BQU0sUUFBUSx3QkFBd0IsS0FBSztBQUN6RCxhQUFPO0FBQUEsUUFDTixNQUFNLElBQUksT0FBSyxFQUFFLElBQUk7QUFBQSxRQUNyQixDQUFDLGlDQUFpQztBQUFBLFFBQ2xDO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUVELFVBQU0sZ0RBQWdELFlBQVk7QUFLakUsWUFBTSxjQUFjLElBQUksS0FBSyxzQkFBc0I7QUFDbkQsWUFBTSxrQkFBa0IsSUFBSSxLQUFLLEVBQUUsUUFBUSxxQkFBcUIsV0FBVyxVQUFVLE1BQU0sd0JBQXdCLENBQUM7QUFDcEgsWUFBTSxVQUFVLENBQUMsYUFBYSxlQUFlLEVBQUUsSUFBSSxDQUFDLEtBQUssVUFBVSxJQUFJLGNBQWMsS0FBdUIsRUFBRTtBQUFBLFFBQXZDO0FBQUE7QUFDdEUsZUFBUyxNQUFNO0FBQ2YsZUFBUyxPQUFPLFNBQVMsR0FBRztBQUM1QixlQUFTLFFBQVE7QUFBQTtBQUFBLE1BQ2xCLEdBQUM7QUFDRCwyQkFBcUIsS0FBSywwQkFBMEIscUJBQXFCLE9BQU8sQ0FBQztBQUNqRixnQkFBVSxxQkFBcUIsZUFBZSxrQkFBa0I7QUFDaEUsWUFBTSxVQUFVLGFBQWE7QUFBQSxRQUM1QixFQUFFLE1BQU0sa0NBQWtDLFVBQVUsQ0FBQyxzQkFBc0IsRUFBRTtBQUFBLE1BQzlFLENBQUM7QUFFRCxZQUFNLFFBQVEsTUFBTSxRQUFRLHdCQUF3QixJQUFJO0FBQ3hELGFBQU87QUFBQSxRQUNOLE1BQU0sSUFBSSxPQUFLLEVBQUUsU0FBUyxDQUFDO0FBQUEsUUFDM0IsQ0FBQyxZQUFZLFNBQVMsQ0FBQztBQUFBLFFBQ3ZCO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUVELFVBQU0sdURBQXVELFlBQVk7QUFDeEUsa0NBQTRCLENBQUMsZ0NBQWdDLENBQUM7QUFDOUQsWUFBTSxVQUFVLGFBQWE7QUFBQSxRQUM1QixFQUFFLE1BQU0sK0NBQStDLFVBQVUsQ0FBQyxZQUFZLEVBQUU7QUFBQSxNQUNqRixDQUFDO0FBRUQsWUFBTSxRQUFRLE1BQU0sUUFBUSx3QkFBd0IsSUFBSTtBQUN4RCxhQUFPO0FBQUEsUUFDTixNQUFNLElBQUksT0FBSyxFQUFFLElBQUk7QUFBQSxRQUNyQixDQUFDLGdDQUFnQztBQUFBLFFBQ2pDO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNELFFBQU0sd0JBQXdCLE1BQU07QUFDbkMsVUFBTSw0Q0FBNEMsWUFBWTtBQUM3RCxtQkFBYSxjQUFjLGtCQUFrQixJQUFJO0FBQUEsUUFDaEQsaUJBQWlCO0FBQUEsUUFDakIsb0JBQW9CO0FBQUE7QUFBQSxRQUVwQix5QkFBeUI7QUFBQSxRQUN6QiwrQkFBK0I7QUFBQSxRQUMvQiwyQkFBMkI7QUFBQSxNQUM1QjtBQUNBLDBCQUFvQixDQUFDLGtDQUFrQyxDQUFDO0FBQ3hELFlBQU0sVUFBVSxhQUFhLENBQUMsQ0FBQztBQUMvQixZQUFNLFVBQVUscUJBQXFCLGVBQWUsa0JBQWtCO0FBRXRFLFlBQU0sVUFBVSxNQUFNLFFBQVEscUJBQXFCO0FBRW5ELGFBQU87QUFBQSxRQUNOLFFBQVEsSUFBSSxRQUFNLEVBQUUsTUFBTSxFQUFFLElBQUksTUFBTSxRQUFRLEVBQUUsUUFBUSxTQUFTLEVBQUUsUUFBUSxFQUFFO0FBQUEsUUFDN0U7QUFBQSxVQUNDLEVBQUUsTUFBTSxrREFBa0QsUUFBUSxpQkFBaUIsaUJBQWlCLFNBQVMsZUFBZSxNQUFNO0FBQUEsVUFDbEksRUFBRSxNQUFNLHNDQUFzQyxRQUFRLGlCQUFpQixpQkFBaUIsU0FBUyxlQUFlLEtBQUs7QUFBQSxRQUN0SDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFFRCxVQUFNLHlCQUF5QixZQUFZO0FBQzFDLG1CQUFhLGNBQWMsa0JBQWtCLElBQUk7QUFBQSxRQUNoRCxpQkFBaUI7QUFBQSxRQUNqQix5QkFBeUI7QUFBQSxRQUN6QiwrQkFBK0I7QUFBQSxRQUMvQiwyQkFBMkI7QUFBQSxRQUMzQixvQkFBb0I7QUFBQSxNQUNyQjtBQUNBLDBCQUFvQixDQUFDLGtDQUFrQyxDQUFDO0FBQ3hELFlBQU0sVUFBVSxhQUFhLENBQUMsQ0FBQztBQUMvQixZQUFNLFVBQVUscUJBQXFCLGVBQWUsa0JBQWtCO0FBRXRFLFlBQU0sVUFBVSxNQUFNLFFBQVEscUJBQXFCO0FBR25ELFlBQU0sUUFBUSxRQUFRLElBQUksT0FBSyxFQUFFLElBQUksSUFBSTtBQUN6QyxhQUFPLEdBQUcsQ0FBQyxNQUFNLEtBQUssT0FBSyxFQUFFLFNBQVMsU0FBUyxDQUFDLEdBQUcsK0JBQStCO0FBQ2xGLGFBQU8sZ0JBQWdCLE9BQU87QUFBQSxRQUM3QjtBQUFBLFFBQ0E7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLG1DQUFtQyxNQUFNO0FBQzlDLFVBQU0sNERBQTRELFlBQVk7QUFDN0UsbUJBQWEsY0FBYyxrQkFBa0IsSUFBSTtBQUFBLFFBQ2hELHlCQUF5QjtBQUFBLFFBQ3pCLCtCQUErQjtBQUFBLFFBQy9CLDJCQUEyQjtBQUFBLFFBQzNCLGlCQUFpQjtBQUFBLFFBQ2pCLG9CQUFvQjtBQUFBLE1BQ3JCO0FBQ0EsMEJBQW9CLENBQUMsa0NBQWtDLENBQUM7QUFDeEQsWUFBTSxVQUFVLGFBQWE7QUFBQTtBQUFBLFFBRTVCLEVBQUUsTUFBTSwwREFBMEQsVUFBVSxDQUFDLElBQUksRUFBRTtBQUFBLFFBQ25GLEVBQUUsTUFBTSxnRUFBZ0UsVUFBVSxDQUFDLElBQUksRUFBRTtBQUFBO0FBQUEsUUFFekYsRUFBRSxNQUFNLHdEQUF3RCxVQUFVLENBQUMsSUFBSSxFQUFFO0FBQUEsUUFDakYsRUFBRSxNQUFNLDZEQUE2RCxVQUFVLENBQUMsSUFBSSxFQUFFO0FBQUE7QUFBQSxRQUV0RixFQUFFLE1BQU0sa0VBQWtFLFVBQVUsQ0FBQyxJQUFJLEVBQUU7QUFBQSxNQUM1RixDQUFDO0FBQ0QsWUFBTSxVQUFVLHFCQUFxQixlQUFlLGtCQUFrQjtBQUV0RSxZQUFNLFFBQVEsTUFBTSxRQUFRLFVBQVUsWUFBWSxNQUFNLGVBQWUsT0FBTyxrQkFBa0IsSUFBSTtBQUNwRyxhQUFPO0FBQUEsUUFDTixNQUFNLElBQUksT0FBSyxFQUFFLElBQUksRUFBRSxLQUFLO0FBQUEsUUFDNUI7QUFBQSxVQUNDO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUVELFVBQU0seURBQXlELFlBQVk7QUFDMUUsbUJBQWEsY0FBYyxrQkFBa0IsSUFBSTtBQUFBLFFBQ2hELDJCQUEyQjtBQUFBLFFBQzNCLG9CQUFvQjtBQUFBLE1BQ3JCO0FBQ0EsMEJBQW9CLENBQUMsa0NBQWtDLENBQUM7QUFDeEQsWUFBTSxVQUFVLGFBQWE7QUFBQTtBQUFBLFFBRTVCLEVBQUUsTUFBTSw2Q0FBNkMsVUFBVSxDQUFDLElBQUksRUFBRTtBQUFBO0FBQUEsUUFFdEUsRUFBRSxNQUFNLDJDQUEyQyxVQUFVLENBQUMsSUFBSSxFQUFFO0FBQUEsUUFDcEUsRUFBRSxNQUFNLGdEQUFnRCxVQUFVLENBQUMsSUFBSSxFQUFFO0FBQUE7QUFBQSxRQUV6RSxFQUFFLE1BQU0sbURBQW1ELFVBQVUsQ0FBQyxJQUFJLEVBQUU7QUFBQSxNQUM3RSxDQUFDO0FBQ0QsWUFBTSxVQUFVLHFCQUFxQixlQUFlLGtCQUFrQjtBQUV0RSxZQUFNLFFBQVEsTUFBTSxRQUFRLFVBQVUsWUFBWSxNQUFNLGVBQWUsTUFBTSxrQkFBa0IsSUFBSTtBQUNuRyxhQUFPO0FBQUEsUUFDTixNQUFNLElBQUksT0FBSyxFQUFFLElBQUksRUFBRSxLQUFLO0FBQUEsUUFDNUI7QUFBQSxVQUNDO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSx3QkFBd0IsTUFBTTtBQUNuQyxTQUFLLHFEQUFxRCxNQUFNO0FBQy9ELFlBQU0sZ0JBQW9DO0FBQUEsUUFDekMsaUJBQWlCO0FBQUEsUUFDakIsaUJBQWlCO0FBQUEsUUFDakIsaUJBQWlCO0FBQUEsUUFDakIsaUJBQWlCO0FBQUEsUUFDakIsaUJBQWlCO0FBQUEsUUFDakIsaUJBQWlCO0FBQUEsUUFDakIsaUJBQWlCO0FBQUEsUUFDakIsaUJBQWlCO0FBQUEsUUFDakIsaUJBQWlCO0FBQUEsUUFDakIsaUJBQWlCO0FBQUEsTUFDbEI7QUFFQSxpQkFBVyxVQUFVLGVBQWU7QUFDbkMsY0FBTSxjQUFjLHFCQUFxQixNQUFNO0FBQy9DLGVBQU8sR0FBRyxPQUFPLGdCQUFnQixZQUFZLFlBQVksU0FBUyxHQUFHLDhCQUE4QixNQUFNLEVBQUU7QUFBQSxNQUM1RztBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssa0RBQWtELE1BQU07QUFDNUQsYUFBTyxZQUFZLHFCQUFxQixpQkFBaUIscUJBQXFCLEdBQUcsTUFBUztBQUMxRixhQUFPLFlBQVkscUJBQXFCLGlCQUFpQixZQUFZLEdBQUcsTUFBUztBQUNqRixhQUFPLFlBQVkscUJBQXFCLGlCQUFpQixNQUFNLEdBQUcsTUFBUztBQUFBLElBQzVFLENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDO0FBRUQsU0FBUyxjQUFjLFFBQXdCLFVBQW9CLFNBQWlCO0FBQ25GLFNBQU8sZ0JBQWdCLE9BQU8sSUFBSSxDQUFDLFFBQVEsSUFBSSxJQUFJLEdBQUcsVUFBVSxPQUFPO0FBQ3hFOyIsCiAgIm5hbWVzIjogWyJyZXN1bHRzIl0KfQo=
