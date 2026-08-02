var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import assert from "assert";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { ILanguageService } from "../../../../../../editor/common/languages/language.js";
import { IModelService } from "../../../../../../editor/common/services/model.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { ConfigurationService } from "../../../../../../platform/configuration/common/configurationService.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { FileService } from "../../../../../../platform/files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../../../../platform/files/common/inMemoryFilesystemProvider.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { NullPolicyService } from "../../../../../../platform/policy/common/policy.js";
import { ChatModeKind } from "../../../common/constants.js";
import { getPromptFileType } from "../../../common/promptSyntax/config/promptFileLocations.js";
import { PromptsType } from "../../../common/promptSyntax/promptTypes.js";
import { MockFilesystem } from "./testUtils/mockFilesystem.js";
import { PromptFileParser } from "../../../common/promptSyntax/promptFileParser.js";
class ExpectedReference {
  constructor(dirname, ref) {
    this.ref = ref;
    this.uri = ref.content.startsWith("/") ? URI.file(ref.content) : URI.joinPath(dirname, ref.content);
  }
  /**
   * Range of the underlying file reference token.
   */
  get range() {
    return this.ref.range;
  }
  /**
   * String representation of the expected reference.
   */
  toString() {
    return `file-prompt:${this.uri.path}`;
  }
}
function toUri(filePath) {
  return URI.parse("testFs://" + filePath);
}
let TestPromptFileReference = class extends Disposable {
  constructor(fileStructure, rootFileUri, expectedReferences, fileService, instantiationService) {
    super();
    this.fileStructure = fileStructure;
    this.rootFileUri = rootFileUri;
    this.expectedReferences = expectedReferences;
    this.fileService = fileService;
    this.instantiationService = instantiationService;
    const fileSystemProvider = this._register(new InMemoryFileSystemProvider());
    this._register(this.fileService.registerProvider("testFs", fileSystemProvider));
  }
  /**
   * Run the test.
   */
  async run() {
    const mockFs = this.instantiationService.createInstance(MockFilesystem, this.fileStructure);
    await mockFs.mock(toUri("/"));
    const content = await this.fileService.readFile(this.rootFileUri);
    const ast = new PromptFileParser().parse(this.rootFileUri, content.value.toString());
    assert(ast.body, "Prompt file must have a body");
    const resolvedReferences = ast.body.fileReferences ?? [];
    for (let i = 0; i < this.expectedReferences.length; i++) {
      const expectedReference = this.expectedReferences[i];
      const resolvedReference = resolvedReferences[i];
      const resolvedUri = ast.body.resolveFilePath(resolvedReference.content);
      assert.equal(resolvedUri?.fsPath, expectedReference.uri.fsPath);
      assert.deepStrictEqual(resolvedReference.range, expectedReference.range);
    }
    assert.strictEqual(
      resolvedReferences.length,
      this.expectedReferences.length,
      [
        `
Expected(${this.expectedReferences.length}): [
 ${this.expectedReferences.join("\n ")}
]`,
        `Received(${resolvedReferences.length}): [
 ${resolvedReferences.join("\n ")}
]`
      ].join("\n")
    );
    const result = {};
    result.promptType = getPromptFileType(this.rootFileUri);
    if (ast.header) {
      for (const key of ["tools", "model", "agent", "applyTo", "description"]) {
        if (ast.header[key]) {
          result[key] = ast.header[key];
        }
      }
    }
    await mockFs.delete();
    return result;
  }
};
TestPromptFileReference = __decorateClass([
  __decorateParam(3, IFileService),
  __decorateParam(4, IInstantiationService)
], TestPromptFileReference);
function createFileReference(filePath, lineNumber, startColumnNumber) {
  const range = new Range(
    lineNumber,
    startColumnNumber + "#file:".length,
    lineNumber,
    startColumnNumber + "#file:".length + filePath.length
  );
  return {
    range,
    content: filePath,
    isMarkdownLink: false
  };
}
function createMarkdownReference(lineNumber, startColumnNumber, firstSeg, secondSeg) {
  const range = new Range(
    lineNumber,
    startColumnNumber + firstSeg.length + 1,
    lineNumber,
    startColumnNumber + firstSeg.length + secondSeg.length - 1
  );
  return {
    range,
    content: secondSeg.substring(1, secondSeg.length - 1),
    isMarkdownLink: true
  };
}
suite("PromptFileReference", function() {
  const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  setup(async () => {
    const nullPolicyService = new NullPolicyService();
    const nullLogService = testDisposables.add(new NullLogService());
    const nullFileService = testDisposables.add(new FileService(nullLogService));
    const nullConfigService = testDisposables.add(new ConfigurationService(
      URI.file("/config.json"),
      nullFileService,
      nullPolicyService,
      nullLogService
    ));
    instantiationService = testDisposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, nullFileService);
    instantiationService.stub(ILogService, nullLogService);
    instantiationService.stub(IConfigurationService, nullConfigService);
    instantiationService.stub(IModelService, { getModel() {
      return null;
    } });
    instantiationService.stub(ILanguageService, {
      guessLanguageIdByFilepathOrFirstLine(uri) {
        return getPromptFileType(uri) ?? null;
      }
    });
  });
  test("resolves nested file references", async function() {
    const rootFolderName = "resolves-nested-file-references";
    const rootFolder = `/${rootFolderName}`;
    const rootUri = toUri(rootFolder);
    const test2 = testDisposables.add(instantiationService.createInstance(
      TestPromptFileReference,
      /**
       * The file structure to be created on the disk for the test.
       */
      [{
        name: rootFolderName,
        children: [
          {
            name: "file1.prompt.md",
            contents: "## Some Header\nsome contents\n "
          },
          {
            name: "file2.prompt.md",
            contents: "## Files\n	- this file #file:folder1/file3.prompt.md \n	- also this [file4.prompt.md](./folder1/some-other-folder/file4.prompt.md) please!\n "
          },
          {
            name: "folder1",
            children: [
              {
                name: "file3.prompt.md",
                contents: `
[](./some-other-folder/non-existing-folder)
	- some seemingly random #file:${rootFolder}/folder1/some-other-folder/yetAnotherFolder\u{1F92D}/another-file.prompt.md contents
 some more	 content`
              },
              {
                name: "some-other-folder",
                children: [
                  {
                    name: "file4.prompt.md",
                    contents: "this file has a non-existing #file:./some-non-existing/file.prompt.md		reference\n\n\nand some\n non-prompt #file:./some-non-prompt-file.md		 	[](../../folder1/)	"
                  },
                  {
                    name: "file.txt",
                    contents: "contents of a non-prompt-snippet file"
                  },
                  {
                    name: "yetAnotherFolder\u{1F92D}",
                    children: [
                      {
                        name: "another-file.prompt.md",
                        contents: `[caption](${rootFolder}/folder1/some-other-folder)
another-file.prompt.md contents	 [#file:file.txt](../file.txt)`
                      },
                      {
                        name: "one_more_file_just_in_case.prompt.md",
                        contents: "one_more_file_just_in_case.prompt.md contents"
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }],
      /**
       * The root file path to start the resolve process from.
       */
      toUri(`/${rootFolderName}/file2.prompt.md`),
      /**
       * The expected references to be resolved.
       */
      [
        new ExpectedReference(
          rootUri,
          createFileReference("folder1/file3.prompt.md", 2, 14)
        ),
        new ExpectedReference(
          rootUri,
          createMarkdownReference(
            3,
            14,
            "[file4.prompt.md]",
            "(./folder1/some-other-folder/file4.prompt.md)"
          )
        )
      ]
    ));
    await test2.run();
  });
  suite("metadata", () => {
    test("tools", async function() {
      const rootFolderName = "resolves-nested-file-references";
      const rootFolder = `/${rootFolderName}`;
      const rootUri = toUri(rootFolder);
      const test2 = testDisposables.add(instantiationService.createInstance(
        TestPromptFileReference,
        /**
         * The file structure to be created on the disk for the test.
         */
        [{
          name: rootFolderName,
          children: [
            {
              name: "file1.prompt.md",
              contents: [
                "## Some Header",
                "some contents",
                " "
              ]
            },
            {
              name: "file2.prompt.md",
              contents: [
                "---",
                "description: 'Root prompt description.'",
                "tools: ['my-tool1']",
                'agent: "agent" ',
                "---",
                "## Files",
                "	- this file #file:folder1/file3.prompt.md ",
                "	- also this [file4.prompt.md](./folder1/some-other-folder/file4.prompt.md) please!",
                " "
              ]
            },
            {
              name: "folder1",
              children: [
                {
                  name: "file3.prompt.md",
                  contents: [
                    "---",
                    "tools: [ 'my-tool1' , ]",
                    "---",
                    "",
                    "[](./some-other-folder/non-existing-folder)",
                    `	- some seemingly random #file:${rootFolder}/folder1/some-other-folder/yetAnotherFolder\u{1F92D}/another-file.prompt.md contents`,
                    " some more	 content"
                  ]
                },
                {
                  name: "some-other-folder",
                  children: [
                    {
                      name: "file4.prompt.md",
                      contents: [
                        "---",
                        `tools: ['my-tool1', "my-tool2", true, , ]`,
                        "something: true",
                        "agent: 'ask'	",
                        "---",
                        "this file has a non-existing #file:./some-non-existing/file.prompt.md		reference",
                        "",
                        "",
                        "and some",
                        " non-prompt #file:./some-non-prompt-file.md		 	[](../../folder1/)	"
                      ]
                    },
                    {
                      name: "file.txt",
                      contents: "contents of a non-prompt-snippet file"
                    },
                    {
                      name: "yetAnotherFolder\u{1F92D}",
                      children: [
                        {
                          name: "another-file.prompt.md",
                          contents: [
                            "---",
                            `tools: ['my-tool3', "my-tool2" ]`,
                            "---",
                            `[](${rootFolder}/folder1/some-other-folder)`,
                            "another-file.prompt.md contents	 [#file:file.txt](../file.txt)"
                          ]
                        },
                        {
                          name: "one_more_file_just_in_case.prompt.md",
                          contents: "one_more_file_just_in_case.prompt.md contents"
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }],
        /**
         * The root file path to start the resolve process from.
         */
        toUri(`/${rootFolderName}/file2.prompt.md`),
        /**
         * The expected references to be resolved.
         */
        [
          new ExpectedReference(
            rootUri,
            createFileReference("folder1/file3.prompt.md", 7, 14)
          ),
          new ExpectedReference(
            rootUri,
            createMarkdownReference(
              8,
              14,
              "[file4.prompt.md]",
              "(./folder1/some-other-folder/file4.prompt.md)"
            )
          )
        ]
      ));
      const metadata = await test2.run();
      assert.deepStrictEqual(
        metadata,
        {
          promptType: PromptsType.prompt,
          agent: "agent",
          description: "Root prompt description.",
          tools: ["my-tool1"]
        },
        "Must have correct metadata."
      );
    });
    suite("applyTo", () => {
      test("prompt language", async function() {
        const rootFolderName = "resolves-nested-file-references";
        const rootFolder = `/${rootFolderName}`;
        const rootUri = toUri(rootFolder);
        const test2 = testDisposables.add(instantiationService.createInstance(
          TestPromptFileReference,
          /**
           * The file structure to be created on the disk for the test.
           */
          [{
            name: rootFolderName,
            children: [
              {
                name: "file1.prompt.md",
                contents: [
                  "## Some Header",
                  "some contents",
                  " "
                ]
              },
              {
                name: "file2.prompt.md",
                contents: [
                  "---",
                  "applyTo: '**/*'",
                  "tools: [ 'my-tool12' , ]",
                  "description: 'Description of my prompt.'",
                  "---",
                  "## Files",
                  "	- this file #file:folder1/file3.prompt.md ",
                  "	- also this [file4.prompt.md](./folder1/some-other-folder/file4.prompt.md) please!",
                  " "
                ]
              },
              {
                name: "folder1",
                children: [
                  {
                    name: "file3.prompt.md",
                    contents: [
                      "---",
                      "tools: [ 'my-tool1' , ]",
                      "---",
                      " some more	 content"
                    ]
                  },
                  {
                    name: "some-other-folder",
                    children: [
                      {
                        name: "file4.prompt.md",
                        contents: [
                          "---",
                          `tools: ['my-tool1', "my-tool2", true, , 'my-tool3' , ]`,
                          "something: true",
                          "agent: 'agent'	",
                          "---",
                          "",
                          "",
                          "and some more content"
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }],
          /**
           * The root file path to start the resolve process from.
           */
          toUri(`/${rootFolderName}/file2.prompt.md`),
          /**
           * The expected references to be resolved.
           */
          [
            new ExpectedReference(
              rootUri,
              createFileReference("folder1/file3.prompt.md", 7, 14)
            ),
            new ExpectedReference(
              rootUri,
              createMarkdownReference(
                8,
                14,
                "[file4.prompt.md]",
                "(./folder1/some-other-folder/file4.prompt.md)"
              )
            )
          ]
        ));
        const metadata = await test2.run();
        assert.deepStrictEqual(
          metadata,
          {
            promptType: PromptsType.prompt,
            description: "Description of my prompt.",
            tools: ["my-tool12"],
            applyTo: "**/*"
          },
          "Must have correct metadata."
        );
      });
      test("instructions language", async function() {
        const rootFolderName = "resolves-nested-file-references";
        const rootFolder = `/${rootFolderName}`;
        const rootUri = toUri(rootFolder);
        const test2 = testDisposables.add(instantiationService.createInstance(
          TestPromptFileReference,
          /**
           * The file structure to be created on the disk for the test.
           */
          [{
            name: rootFolderName,
            children: [
              {
                name: "file1.prompt.md",
                contents: [
                  "## Some Header",
                  "some contents",
                  " "
                ]
              },
              {
                name: "file2.instructions.md",
                contents: [
                  "---",
                  "applyTo: '**/*'",
                  "tools: [ 'my-tool12' , ]",
                  "description: 'Description of my instructions file.'",
                  "---",
                  "## Files",
                  "	- this file #file:folder1/file3.prompt.md ",
                  "	- also this [file4.prompt.md](./folder1/some-other-folder/file4.prompt.md) please!",
                  " "
                ]
              },
              {
                name: "folder1",
                children: [
                  {
                    name: "file3.prompt.md",
                    contents: [
                      "---",
                      "tools: [ 'my-tool1' , ]",
                      "---",
                      " some more	 content"
                    ]
                  },
                  {
                    name: "some-other-folder",
                    children: [
                      {
                        name: "file4.prompt.md",
                        contents: [
                          "---",
                          `tools: ['my-tool1', "my-tool2", true, , 'my-tool3' , ]`,
                          "something: true",
                          "agent: 'agent'	",
                          "---",
                          "",
                          "",
                          "and some more content"
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }],
          /**
           * The root file path to start the resolve process from.
           */
          toUri(`/${rootFolderName}/file2.instructions.md`),
          /**
           * The expected references to be resolved.
           */
          [
            new ExpectedReference(
              rootUri,
              createFileReference("folder1/file3.prompt.md", 7, 14)
            ),
            new ExpectedReference(
              rootUri,
              createMarkdownReference(
                8,
                14,
                "[file4.prompt.md]",
                "(./folder1/some-other-folder/file4.prompt.md)"
              )
            )
          ]
        ));
        const metadata = await test2.run();
        assert.deepStrictEqual(
          metadata,
          {
            promptType: PromptsType.instructions,
            applyTo: "**/*",
            description: "Description of my instructions file.",
            tools: ["my-tool12"]
          },
          "Must have correct metadata."
        );
      });
    });
    suite("tools and agent compatibility", () => {
      test("ask agent", async function() {
        const rootFolderName = "resolves-nested-file-references";
        const rootFolder = `/${rootFolderName}`;
        const rootUri = toUri(rootFolder);
        const test2 = testDisposables.add(instantiationService.createInstance(
          TestPromptFileReference,
          /**
           * The file structure to be created on the disk for the test.
           */
          [{
            name: rootFolderName,
            children: [
              {
                name: "file1.prompt.md",
                contents: [
                  "## Some Header",
                  "some contents",
                  " "
                ]
              },
              {
                name: "file2.prompt.md",
                contents: [
                  "---",
                  "description: 'Description of my prompt.'",
                  'agent: "ask" ',
                  "---",
                  "## Files",
                  "	- this file #file:folder1/file3.prompt.md ",
                  "	- also this [file4.prompt.md](./folder1/some-other-folder/file4.prompt.md) please!",
                  " "
                ]
              },
              {
                name: "folder1",
                children: [
                  {
                    name: "file3.prompt.md",
                    contents: [
                      "---",
                      "tools: [ 'my-tool1' , ]",
                      "agent: 'agent'	",
                      "---",
                      " some more	 content"
                    ]
                  },
                  {
                    name: "some-other-folder",
                    children: [
                      {
                        name: "file4.prompt.md",
                        contents: [
                          "---",
                          `tools: ['my-tool1', "my-tool2", true, , ]`,
                          "something: true",
                          "agent: 'ask'	",
                          "---",
                          "",
                          "",
                          "and some more content"
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }],
          /**
           * The root file path to start the resolve process from.
           */
          toUri(`/${rootFolderName}/file2.prompt.md`),
          /**
           * The expected references to be resolved.
           */
          [
            new ExpectedReference(
              rootUri,
              createFileReference("folder1/file3.prompt.md", 6, 14)
            ),
            new ExpectedReference(
              rootUri,
              createMarkdownReference(
                7,
                14,
                "[file4.prompt.md]",
                "(./folder1/some-other-folder/file4.prompt.md)"
              )
            )
          ]
        ));
        const metadata = await test2.run();
        assert.deepStrictEqual(
          metadata,
          {
            promptType: PromptsType.prompt,
            agent: ChatModeKind.Ask,
            description: "Description of my prompt."
          },
          "Must have correct metadata."
        );
      });
      test("edit agent", async function() {
        const rootFolderName = "resolves-nested-file-references";
        const rootFolder = `/${rootFolderName}`;
        const rootUri = toUri(rootFolder);
        const test2 = testDisposables.add(instantiationService.createInstance(
          TestPromptFileReference,
          /**
           * The file structure to be created on the disk for the test.
           */
          [{
            name: rootFolderName,
            children: [
              {
                name: "file1.prompt.md",
                contents: [
                  "## Some Header",
                  "some contents",
                  " "
                ]
              },
              {
                name: "file2.prompt.md",
                contents: [
                  "---",
                  "description: 'Description of my prompt.'",
                  'agent:		"edit"		',
                  "---",
                  "## Files",
                  "	- this file #file:folder1/file3.prompt.md ",
                  "	- also this [file4.prompt.md](./folder1/some-other-folder/file4.prompt.md) please!",
                  " "
                ]
              },
              {
                name: "folder1",
                children: [
                  {
                    name: "file3.prompt.md",
                    contents: [
                      "---",
                      "tools: [ 'my-tool1' , ]",
                      "---",
                      " some more	 content"
                    ]
                  },
                  {
                    name: "some-other-folder",
                    children: [
                      {
                        name: "file4.prompt.md",
                        contents: [
                          "---",
                          `tools: ['my-tool1', "my-tool2", true, , ]`,
                          "something: true",
                          "agent: 'agent'	",
                          "---",
                          "",
                          "",
                          "and some more content"
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }],
          /**
           * The root file path to start the resolve process from.
           */
          toUri(`/${rootFolderName}/file2.prompt.md`),
          /**
           * The expected references to be resolved.
           */
          [
            new ExpectedReference(
              rootUri,
              createFileReference("folder1/file3.prompt.md", 6, 14)
            ),
            new ExpectedReference(
              rootUri,
              createMarkdownReference(
                7,
                14,
                "[file4.prompt.md]",
                "(./folder1/some-other-folder/file4.prompt.md)"
              )
            )
          ]
        ));
        const metadata = await test2.run();
        assert.deepStrictEqual(
          metadata,
          {
            promptType: PromptsType.prompt,
            agent: ChatModeKind.Edit,
            description: "Description of my prompt."
          },
          "Must have correct metadata."
        );
      });
      test("agent", async function() {
        const rootFolderName = "resolves-nested-file-references";
        const rootFolder = `/${rootFolderName}`;
        const rootUri = toUri(rootFolder);
        const test2 = testDisposables.add(instantiationService.createInstance(
          TestPromptFileReference,
          /**
           * The file structure to be created on the disk for the test.
           */
          [{
            name: rootFolderName,
            children: [
              {
                name: "file1.prompt.md",
                contents: [
                  "## Some Header",
                  "some contents",
                  " "
                ]
              },
              {
                name: "file2.prompt.md",
                contents: [
                  "---",
                  "description: 'Description of my prompt.'",
                  'agent: 		 "agent" 		 ',
                  "---",
                  "## Files",
                  "	- this file #file:folder1/file3.prompt.md ",
                  "	- also this [file4.prompt.md](./folder1/some-other-folder/file4.prompt.md) please!",
                  " "
                ]
              },
              {
                name: "folder1",
                children: [
                  {
                    name: "file3.prompt.md",
                    contents: [
                      "---",
                      "tools: [ 'my-tool1' , ]",
                      "---",
                      " some more	 content"
                    ]
                  },
                  {
                    name: "some-other-folder",
                    children: [
                      {
                        name: "file4.prompt.md",
                        contents: [
                          "---",
                          `tools: ['my-tool1', "my-tool2", true, , 'my-tool3' , ]`,
                          "something: true",
                          "agent: 'agent'	",
                          "---",
                          "",
                          "",
                          "and some more content"
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }],
          /**
           * The root file path to start the resolve process from.
           */
          toUri(`/${rootFolderName}/file2.prompt.md`),
          /**
           * The expected references to be resolved.
           */
          [
            new ExpectedReference(
              rootUri,
              createFileReference("folder1/file3.prompt.md", 6, 14)
            ),
            new ExpectedReference(
              rootUri,
              createMarkdownReference(
                7,
                14,
                "[file4.prompt.md]",
                "(./folder1/some-other-folder/file4.prompt.md)"
              )
            )
          ]
        ));
        const metadata = await test2.run();
        assert.deepStrictEqual(
          metadata,
          {
            promptType: PromptsType.prompt,
            agent: ChatModeKind.Agent,
            description: "Description of my prompt."
          },
          "Must have correct metadata."
        );
      });
      test("no agent", async function() {
        const rootFolderName = "resolves-nested-file-references";
        const rootFolder = `/${rootFolderName}`;
        const rootUri = toUri(rootFolder);
        const test2 = testDisposables.add(instantiationService.createInstance(
          TestPromptFileReference,
          /**
           * The file structure to be created on the disk for the test.
           */
          [{
            name: rootFolderName,
            children: [
              {
                name: "file1.prompt.md",
                contents: [
                  "## Some Header",
                  "some contents",
                  " "
                ]
              },
              {
                name: "file2.prompt.md",
                contents: [
                  "---",
                  "tools: [ 'my-tool12' , ]",
                  "description: 'Description of the prompt file.'",
                  "---",
                  "## Files",
                  "	- this file #file:folder1/file3.prompt.md ",
                  "	- also this [file4.prompt.md](./folder1/some-other-folder/file4.prompt.md) please!",
                  " "
                ]
              },
              {
                name: "folder1",
                children: [
                  {
                    name: "file3.prompt.md",
                    contents: [
                      "---",
                      "tools: [ 'my-tool1' , ]",
                      "---",
                      " some more	 content"
                    ]
                  },
                  {
                    name: "some-other-folder",
                    children: [
                      {
                        name: "file4.prompt.md",
                        contents: [
                          "---",
                          `tools: ['my-tool1', "my-tool2", true, , 'my-tool3' , ]`,
                          "something: true",
                          "agent: 'agent'	",
                          "---",
                          "",
                          "",
                          "and some more content"
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }],
          /**
           * The root file path to start the resolve process from.
           */
          toUri(`/${rootFolderName}/file2.prompt.md`),
          /**
           * The expected references to be resolved.
           */
          [
            new ExpectedReference(
              rootUri,
              createFileReference("folder1/file3.prompt.md", 6, 14)
            ),
            new ExpectedReference(
              rootUri,
              createMarkdownReference(
                7,
                14,
                "[file4.prompt.md]",
                "(./folder1/some-other-folder/file4.prompt.md)"
              )
            )
          ]
        ));
        const metadata = await test2.run();
        assert.deepStrictEqual(
          metadata,
          {
            promptType: PromptsType.prompt,
            tools: ["my-tool12"],
            description: "Description of the prompt file."
          },
          "Must have correct metadata."
        );
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdEZpbGVSZWZlcmVuY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vaW5NZW1vcnlGaWxlc3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBOdWxsUG9saWN5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3BvbGljeS9jb21tb24vcG9saWN5LmpzJztcbmltcG9ydCB7IENoYXRNb2RlS2luZCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgZ2V0UHJvbXB0RmlsZVR5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L2NvbmZpZy9wcm9tcHRGaWxlTG9jYXRpb25zLmpzJztcbmltcG9ydCB7IFByb21wdHNUeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBJTW9ja0ZvbGRlciwgTW9ja0ZpbGVzeXN0ZW0gfSBmcm9tICcuL3Rlc3RVdGlscy9tb2NrRmlsZXN5c3RlbS5qcyc7XG5pbXBvcnQgeyBJQm9keUZpbGVSZWZlcmVuY2UsIFByb21wdEZpbGVQYXJzZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdEZpbGVQYXJzZXIuanMnO1xuXG4vKipcbiAqIFJlcHJlc2VudHMgYSBmaWxlIHJlZmVyZW5jZSB3aXRoIGFuIGV4cGVjdGVkXG4gKiBlcnJvciBjb25kaXRpb24gdmFsdWUgZm9yIHRlc3RpbmcgcHVycG9zZXMuXG4gKi9cbmNsYXNzIEV4cGVjdGVkUmVmZXJlbmNlIHtcblx0LyoqXG5cdCAqIFVSSSBjb21wb25lbnQgb2YgdGhlIGV4cGVjdGVkIHJlZmVyZW5jZS5cblx0ICovXG5cdHB1YmxpYyByZWFkb25seSB1cmk6IFVSSTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRkaXJuYW1lOiBVUkksXG5cdFx0cHVibGljIHJlYWRvbmx5IHJlZjogSUJvZHlGaWxlUmVmZXJlbmNlLFxuXHQpIHtcblx0XHR0aGlzLnVyaSA9IChyZWYuY29udGVudC5zdGFydHNXaXRoKCcvJykpXG5cdFx0XHQ/IFVSSS5maWxlKHJlZi5jb250ZW50KVxuXHRcdFx0OiBVUkkuam9pblBhdGgoZGlybmFtZSwgcmVmLmNvbnRlbnQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJhbmdlIG9mIHRoZSB1bmRlcmx5aW5nIGZpbGUgcmVmZXJlbmNlIHRva2VuLlxuXHQgKi9cblx0cHVibGljIGdldCByYW5nZSgpOiBSYW5nZSB7XG5cdFx0cmV0dXJuIHRoaXMucmVmLnJhbmdlO1xuXHR9XG5cblx0LyoqXG5cdCAqIFN0cmluZyByZXByZXNlbnRhdGlvbiBvZiB0aGUgZXhwZWN0ZWQgcmVmZXJlbmNlLlxuXHQgKi9cblx0cHVibGljIHRvU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGBmaWxlLXByb21wdDoke3RoaXMudXJpLnBhdGh9YDtcblx0fVxufVxuXG5mdW5jdGlvbiB0b1VyaShmaWxlUGF0aDogc3RyaW5nKTogVVJJIHtcblx0cmV0dXJuIFVSSS5wYXJzZSgndGVzdEZzOi8vJyArIGZpbGVQYXRoKTtcbn1cblxuLyoqXG4gKiBBIHJldXNhYmxlIHRlc3QgdXRpbGl0eSB0byB0ZXN0IHRoZSBgUHJvbXB0RmlsZVJlZmVyZW5jZWAgY2xhc3MuXG4gKi9cbmNsYXNzIFRlc3RQcm9tcHRGaWxlUmVmZXJlbmNlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZmlsZVN0cnVjdHVyZTogSU1vY2tGb2xkZXJbXSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHJvb3RGaWxlVXJpOiBVUkksXG5cdFx0cHJpdmF0ZSByZWFkb25seSBleHBlY3RlZFJlZmVyZW5jZXM6IEV4cGVjdGVkUmVmZXJlbmNlW10sXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHQvLyBjcmVhdGUgaW4tbWVtb3J5IGZpbGUgc3lzdGVtXG5cdFx0Y29uc3QgZmlsZVN5c3RlbVByb3ZpZGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcigndGVzdEZzJywgZmlsZVN5c3RlbVByb3ZpZGVyKSk7XG5cdH1cblxuXHQvKipcblx0ICogUnVuIHRoZSB0ZXN0LlxuXHQgKi9cblx0cHVibGljIGFzeW5jIHJ1bigpOiBQcm9taXNlPGFueT4ge1xuXHRcdC8vIGNyZWF0ZSB0aGUgZmlsZXMgc3RydWN0dXJlIG9uIHRoZSBkaXNrXG5cdFx0Y29uc3QgbW9ja0ZzID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNb2NrRmlsZXN5c3RlbSwgdGhpcy5maWxlU3RydWN0dXJlKTtcblx0XHRhd2FpdCBtb2NrRnMubW9jayh0b1VyaSgnLycpKTtcblxuXHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKHRoaXMucm9vdEZpbGVVcmkpO1xuXG5cdFx0Y29uc3QgYXN0ID0gbmV3IFByb21wdEZpbGVQYXJzZXIoKS5wYXJzZSh0aGlzLnJvb3RGaWxlVXJpLCBjb250ZW50LnZhbHVlLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydChhc3QuYm9keSwgJ1Byb21wdCBmaWxlIG11c3QgaGF2ZSBhIGJvZHknKTtcblxuXHRcdC8vIHJlc29sdmUgdGhlIHJvb3QgZmlsZSByZWZlcmVuY2UgaW5jbHVkaW5nIGFsbCBuZXN0ZWQgcmVmZXJlbmNlc1xuXHRcdGNvbnN0IHJlc29sdmVkUmVmZXJlbmNlcyA9IGFzdC5ib2R5LmZpbGVSZWZlcmVuY2VzID8/IFtdO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmV4cGVjdGVkUmVmZXJlbmNlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRSZWZlcmVuY2UgPSB0aGlzLmV4cGVjdGVkUmVmZXJlbmNlc1tpXTtcblx0XHRcdGNvbnN0IHJlc29sdmVkUmVmZXJlbmNlID0gcmVzb2x2ZWRSZWZlcmVuY2VzW2ldO1xuXG5cdFx0XHRjb25zdCByZXNvbHZlZFVyaSA9IGFzdC5ib2R5LnJlc29sdmVGaWxlUGF0aChyZXNvbHZlZFJlZmVyZW5jZS5jb250ZW50KTtcblxuXHRcdFx0YXNzZXJ0LmVxdWFsKHJlc29sdmVkVXJpPy5mc1BhdGgsIGV4cGVjdGVkUmVmZXJlbmNlLnVyaS5mc1BhdGgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXNvbHZlZFJlZmVyZW5jZS5yYW5nZSwgZXhwZWN0ZWRSZWZlcmVuY2UucmFuZ2UpO1xuXHRcdH1cblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHJlc29sdmVkUmVmZXJlbmNlcy5sZW5ndGgsXG5cdFx0XHR0aGlzLmV4cGVjdGVkUmVmZXJlbmNlcy5sZW5ndGgsXG5cdFx0XHRbXG5cdFx0XHRcdGBcXG5FeHBlY3RlZCgke3RoaXMuZXhwZWN0ZWRSZWZlcmVuY2VzLmxlbmd0aH0pOiBbXFxuICR7dGhpcy5leHBlY3RlZFJlZmVyZW5jZXMuam9pbignXFxuICcpfVxcbl1gLFxuXHRcdFx0XHRgUmVjZWl2ZWQoJHtyZXNvbHZlZFJlZmVyZW5jZXMubGVuZ3RofSk6IFtcXG4gJHtyZXNvbHZlZFJlZmVyZW5jZXMuam9pbignXFxuICcpfVxcbl1gLFxuXHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHQpO1xuXG5cdFx0Y29uc3QgcmVzdWx0OiBhbnkgPSB7fTtcblx0XHRyZXN1bHQucHJvbXB0VHlwZSA9IGdldFByb21wdEZpbGVUeXBlKHRoaXMucm9vdEZpbGVVcmkpO1xuXHRcdGlmIChhc3QuaGVhZGVyKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBbJ3Rvb2xzJywgJ21vZGVsJywgJ2FnZW50JywgJ2FwcGx5VG8nLCAnZGVzY3JpcHRpb24nXSBhcyBjb25zdCkge1xuXHRcdFx0XHRpZiAoYXN0LmhlYWRlcltrZXldKSB7XG5cdFx0XHRcdFx0cmVzdWx0W2tleV0gPSBhc3QuaGVhZGVyW2tleV07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRhd2FpdCBtb2NrRnMuZGVsZXRlKCk7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbi8qKlxuICogQ3JlYXRlIGV4cGVjdGVkIGZpbGUgcmVmZXJlbmNlIGZvciB0ZXN0aW5nIHB1cnBvc2VzLlxuICpcbiAqIE5vdGUhIFRoaXMgdXRpbGl0eSBhbHNvIHVzZSBmb3IgYG1hcmtkb3duIGxpbmtzYCBhdCB0aGUgbW9tZW50LlxuICpcbiAqIEBwYXJhbSBmaWxlUGF0aCBUaGUgZXhwZWN0ZWQgcGF0aCBvZiB0aGUgZmlsZSByZWZlcmVuY2UgKHdpdGhvdXQgdGhlIGAjZmlsZTpgIHByZWZpeCkuXG4gKiBAcGFyYW0gbGluZU51bWJlciBUaGUgZXhwZWN0ZWQgbGluZSBudW1iZXIgb2YgdGhlIGZpbGUgcmVmZXJlbmNlLlxuICogQHBhcmFtIHN0YXJ0Q29sdW1uTnVtYmVyIFRoZSBleHBlY3RlZCBzdGFydCBjb2x1bW4gbnVtYmVyIG9mIHRoZSBmaWxlIHJlZmVyZW5jZS5cbiAqL1xuZnVuY3Rpb24gY3JlYXRlRmlsZVJlZmVyZW5jZShmaWxlUGF0aDogc3RyaW5nLCBsaW5lTnVtYmVyOiBudW1iZXIsIHN0YXJ0Q29sdW1uTnVtYmVyOiBudW1iZXIpOiBJQm9keUZpbGVSZWZlcmVuY2Uge1xuXHRjb25zdCByYW5nZSA9IG5ldyBSYW5nZShcblx0XHRsaW5lTnVtYmVyLFxuXHRcdHN0YXJ0Q29sdW1uTnVtYmVyICsgJyNmaWxlOicubGVuZ3RoLFxuXHRcdGxpbmVOdW1iZXIsXG5cdFx0c3RhcnRDb2x1bW5OdW1iZXIgKyAnI2ZpbGU6Jy5sZW5ndGggKyBmaWxlUGF0aC5sZW5ndGgsXG5cdCk7XG5cblx0cmV0dXJuIHtcblx0XHRyYW5nZSxcblx0XHRjb250ZW50OiBmaWxlUGF0aCxcblx0XHRpc01hcmtkb3duTGluazogZmFsc2UsXG5cdH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZU1hcmtkb3duUmVmZXJlbmNlKGxpbmVOdW1iZXI6IG51bWJlciwgc3RhcnRDb2x1bW5OdW1iZXI6IG51bWJlciwgZmlyc3RTZWc6IHN0cmluZywgc2Vjb25kU2VnOiBzdHJpbmcpOiBJQm9keUZpbGVSZWZlcmVuY2Uge1xuXHRjb25zdCByYW5nZSA9IG5ldyBSYW5nZShcblx0XHRsaW5lTnVtYmVyLFxuXHRcdHN0YXJ0Q29sdW1uTnVtYmVyICsgZmlyc3RTZWcubGVuZ3RoICsgMSxcblx0XHRsaW5lTnVtYmVyLFxuXHRcdHN0YXJ0Q29sdW1uTnVtYmVyICsgZmlyc3RTZWcubGVuZ3RoICsgc2Vjb25kU2VnLmxlbmd0aCAtIDEsXG5cdCk7XG5cblx0cmV0dXJuIHtcblx0XHRyYW5nZSxcblx0XHRjb250ZW50OiBzZWNvbmRTZWcuc3Vic3RyaW5nKDEsIHNlY29uZFNlZy5sZW5ndGggLSAxKSxcblx0XHRpc01hcmtkb3duTGluazogdHJ1ZSxcblx0fTtcbn1cblxuc3VpdGUoJ1Byb21wdEZpbGVSZWZlcmVuY2UnLCBmdW5jdGlvbiAoKSB7XG5cdGNvbnN0IHRlc3REaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbnVsbFBvbGljeVNlcnZpY2UgPSBuZXcgTnVsbFBvbGljeVNlcnZpY2UoKTtcblx0XHRjb25zdCBudWxsTG9nU2VydmljZSA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IG51bGxGaWxlU2VydmljZSA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG51bGxMb2dTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgbnVsbENvbmZpZ1NlcnZpY2UgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBDb25maWd1cmF0aW9uU2VydmljZShcblx0XHRcdFVSSS5maWxlKCcvY29uZmlnLmpzb24nKSxcblx0XHRcdG51bGxGaWxlU2VydmljZSxcblx0XHRcdG51bGxQb2xpY3lTZXJ2aWNlLFxuXHRcdFx0bnVsbExvZ1NlcnZpY2UsXG5cdFx0KSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgbnVsbEZpbGVTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBudWxsTG9nU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIG51bGxDb25maWdTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElNb2RlbFNlcnZpY2UsIHsgZ2V0TW9kZWwoKSB7IHJldHVybiBudWxsOyB9IH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxhbmd1YWdlU2VydmljZSwge1xuXHRcdFx0Z3Vlc3NMYW5ndWFnZUlkQnlGaWxlcGF0aE9yRmlyc3RMaW5lKHVyaTogVVJJKSB7XG5cdFx0XHRcdHJldHVybiBnZXRQcm9tcHRGaWxlVHlwZSh1cmkpID8/IG51bGw7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVzIG5lc3RlZCBmaWxlIHJlZmVyZW5jZXMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgcm9vdEZvbGRlck5hbWUgPSAncmVzb2x2ZXMtbmVzdGVkLWZpbGUtcmVmZXJlbmNlcyc7XG5cdFx0Y29uc3Qgcm9vdEZvbGRlciA9IGAvJHtyb290Rm9sZGVyTmFtZX1gO1xuXHRcdGNvbnN0IHJvb3RVcmkgPSB0b1VyaShyb290Rm9sZGVyKTtcblxuXHRcdGNvbnN0IHRlc3QgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RQcm9tcHRGaWxlUmVmZXJlbmNlLFxuXHRcdFx0LyoqXG5cdFx0XHQgKiBUaGUgZmlsZSBzdHJ1Y3R1cmUgdG8gYmUgY3JlYXRlZCBvbiB0aGUgZGlzayBmb3IgdGhlIHRlc3QuXG5cdFx0XHQgKi9cblx0XHRcdFt7XG5cdFx0XHRcdG5hbWU6IHJvb3RGb2xkZXJOYW1lLFxuXHRcdFx0XHRjaGlsZHJlbjogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdG5hbWU6ICdmaWxlMS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6ICcjIyBTb21lIEhlYWRlclxcbnNvbWUgY29udGVudHNcXG4gJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdG5hbWU6ICdmaWxlMi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6ICcjIyBGaWxlc1xcblxcdC0gdGhpcyBmaWxlICNmaWxlOmZvbGRlcjEvZmlsZTMucHJvbXB0Lm1kIFxcblxcdC0gYWxzbyB0aGlzIFtmaWxlNC5wcm9tcHQubWRdKC4vZm9sZGVyMS9zb21lLW90aGVyLWZvbGRlci9maWxlNC5wcm9tcHQubWQpIHBsZWFzZSFcXG4gJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdG5hbWU6ICdmb2xkZXIxJyxcblx0XHRcdFx0XHRcdGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRuYW1lOiAnZmlsZTMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogYFxcbltdKC4vc29tZS1vdGhlci1mb2xkZXIvbm9uLWV4aXN0aW5nLWZvbGRlcilcXG5cXHQtIHNvbWUgc2VlbWluZ2x5IHJhbmRvbSAjZmlsZToke3Jvb3RGb2xkZXJ9L2ZvbGRlcjEvc29tZS1vdGhlci1mb2xkZXIveWV0QW5vdGhlckZvbGRlclx1RDgzRVx1REQyRC9hbm90aGVyLWZpbGUucHJvbXB0Lm1kIGNvbnRlbnRzXFxuIHNvbWUgbW9yZVxcdCBjb250ZW50YCxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdG5hbWU6ICdzb21lLW90aGVyLWZvbGRlcicsXG5cdFx0XHRcdFx0XHRcdFx0Y2hpbGRyZW46IFtcblx0XHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0bmFtZTogJ2ZpbGU0LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiAndGhpcyBmaWxlIGhhcyBhIG5vbi1leGlzdGluZyAjZmlsZTouL3NvbWUtbm9uLWV4aXN0aW5nL2ZpbGUucHJvbXB0Lm1kXFx0XFx0cmVmZXJlbmNlXFxuXFxuXFxuYW5kIHNvbWVcXG4gbm9uLXByb21wdCAjZmlsZTouL3NvbWUtbm9uLXByb21wdC1maWxlLm1kXFx0XFx0IFxcdFtdKC4uLy4uL2ZvbGRlcjEvKVxcdCcsXG5cdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRuYW1lOiAnZmlsZS50eHQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogJ2NvbnRlbnRzIG9mIGEgbm9uLXByb21wdC1zbmlwcGV0IGZpbGUnLFxuXHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0bmFtZTogJ3lldEFub3RoZXJGb2xkZXJcdUQ4M0VcdUREMkQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRjaGlsZHJlbjogW1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdG5hbWU6ICdhbm90aGVyLWZpbGUucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBgW2NhcHRpb25dKCR7cm9vdEZvbGRlcn0vZm9sZGVyMS9zb21lLW90aGVyLWZvbGRlcilcXG5hbm90aGVyLWZpbGUucHJvbXB0Lm1kIGNvbnRlbnRzXFx0IFsjZmlsZTpmaWxlLnR4dF0oLi4vZmlsZS50eHQpYCxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdG5hbWU6ICdvbmVfbW9yZV9maWxlX2p1c3RfaW5fY2FzZS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6ICdvbmVfbW9yZV9maWxlX2p1c3RfaW5fY2FzZS5wcm9tcHQubWQgY29udGVudHMnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9XSxcblx0XHRcdC8qKlxuXHRcdFx0ICogVGhlIHJvb3QgZmlsZSBwYXRoIHRvIHN0YXJ0IHRoZSByZXNvbHZlIHByb2Nlc3MgZnJvbS5cblx0XHRcdCAqL1xuXHRcdFx0dG9VcmkoYC8ke3Jvb3RGb2xkZXJOYW1lfS9maWxlMi5wcm9tcHQubWRgKSxcblx0XHRcdC8qKlxuXHRcdFx0ICogVGhlIGV4cGVjdGVkIHJlZmVyZW5jZXMgdG8gYmUgcmVzb2x2ZWQuXG5cdFx0XHQgKi9cblx0XHRcdFtcblx0XHRcdFx0bmV3IEV4cGVjdGVkUmVmZXJlbmNlKFxuXHRcdFx0XHRcdHJvb3RVcmksXG5cdFx0XHRcdFx0Y3JlYXRlRmlsZVJlZmVyZW5jZSgnZm9sZGVyMS9maWxlMy5wcm9tcHQubWQnLCAyLCAxNCksXG5cdFx0XHRcdCksXG5cdFx0XHRcdG5ldyBFeHBlY3RlZFJlZmVyZW5jZShcblx0XHRcdFx0XHRyb290VXJpLFxuXHRcdFx0XHRcdGNyZWF0ZU1hcmtkb3duUmVmZXJlbmNlKFxuXHRcdFx0XHRcdFx0MywgMTQsXG5cdFx0XHRcdFx0XHQnW2ZpbGU0LnByb21wdC5tZF0nLCAnKC4vZm9sZGVyMS9zb21lLW90aGVyLWZvbGRlci9maWxlNC5wcm9tcHQubWQpJyxcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHQpLFxuXHRcdFx0XVxuXHRcdCkpO1xuXG5cdFx0YXdhaXQgdGVzdC5ydW4oKTtcblx0fSk7XG5cblxuXHRzdWl0ZSgnbWV0YWRhdGEnLCAoKSA9PiB7XG5cdFx0dGVzdCgndG9vbHMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICdyZXNvbHZlcy1uZXN0ZWQtZmlsZS1yZWZlcmVuY2VzJztcblx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdGNvbnN0IHJvb3RVcmkgPSB0b1VyaShyb290Rm9sZGVyKTtcblxuXHRcdFx0Y29uc3QgdGVzdCA9IHRlc3REaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFByb21wdEZpbGVSZWZlcmVuY2UsXG5cdFx0XHRcdC8qKlxuXHRcdFx0XHQgKiBUaGUgZmlsZSBzdHJ1Y3R1cmUgdG8gYmUgY3JlYXRlZCBvbiB0aGUgZGlzayBmb3IgdGhlIHRlc3QuXG5cdFx0XHRcdCAqL1xuXHRcdFx0XHRbe1xuXHRcdFx0XHRcdG5hbWU6IHJvb3RGb2xkZXJOYW1lLFxuXHRcdFx0XHRcdGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdG5hbWU6ICdmaWxlMS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0XHRcdCcjIyBTb21lIEhlYWRlcicsXG5cdFx0XHRcdFx0XHRcdFx0J3NvbWUgY29udGVudHMnLFxuXHRcdFx0XHRcdFx0XHRcdCcgJyxcblx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdG5hbWU6ICdmaWxlMi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnUm9vdCBwcm9tcHQgZGVzY3JpcHRpb24uXFwnJyxcblx0XHRcdFx0XHRcdFx0XHQndG9vbHM6IFtcXCdteS10b29sMVxcJ10nLFxuXHRcdFx0XHRcdFx0XHRcdCdhZ2VudDogXCJhZ2VudFwiICcsXG5cdFx0XHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHRcdFx0JyMjIEZpbGVzJyxcblx0XHRcdFx0XHRcdFx0XHQnXFx0LSB0aGlzIGZpbGUgI2ZpbGU6Zm9sZGVyMS9maWxlMy5wcm9tcHQubWQgJyxcblx0XHRcdFx0XHRcdFx0XHQnXFx0LSBhbHNvIHRoaXMgW2ZpbGU0LnByb21wdC5tZF0oLi9mb2xkZXIxL3NvbWUtb3RoZXItZm9sZGVyL2ZpbGU0LnByb21wdC5tZCkgcGxlYXNlIScsXG5cdFx0XHRcdFx0XHRcdFx0JyAnLFxuXHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0bmFtZTogJ2ZvbGRlcjEnLFxuXHRcdFx0XHRcdFx0XHRjaGlsZHJlbjogW1xuXHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdG5hbWU6ICdmaWxlMy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdCd0b29sczogWyBcXCdteS10b29sMVxcJyAsIF0nLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0JycsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdCdbXSguL3NvbWUtb3RoZXItZm9sZGVyL25vbi1leGlzdGluZy1mb2xkZXIpJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0YFxcdC0gc29tZSBzZWVtaW5nbHkgcmFuZG9tICNmaWxlOiR7cm9vdEZvbGRlcn0vZm9sZGVyMS9zb21lLW90aGVyLWZvbGRlci95ZXRBbm90aGVyRm9sZGVyXHVEODNFXHVERDJEL2Fub3RoZXItZmlsZS5wcm9tcHQubWQgY29udGVudHNgLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHQnIHNvbWUgbW9yZVxcdCBjb250ZW50Jyxcblx0XHRcdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRuYW1lOiAnc29tZS1vdGhlci1mb2xkZXInLFxuXHRcdFx0XHRcdFx0XHRcdFx0Y2hpbGRyZW46IFtcblx0XHRcdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdG5hbWU6ICdmaWxlNC5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCd0b29sczogW1xcJ215LXRvb2wxXFwnLCBcIm15LXRvb2wyXCIsIHRydWUsICwgXScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnc29tZXRoaW5nOiB0cnVlJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCdhZ2VudDogXFwnYXNrXFwnXFx0Jyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0J3RoaXMgZmlsZSBoYXMgYSBub24tZXhpc3RpbmcgI2ZpbGU6Li9zb21lLW5vbi1leGlzdGluZy9maWxlLnByb21wdC5tZFxcdFxcdHJlZmVyZW5jZScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0J2FuZCBzb21lJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCcgbm9uLXByb21wdCAjZmlsZTouL3NvbWUtbm9uLXByb21wdC1maWxlLm1kXFx0XFx0IFxcdFtdKC4uLy4uL2ZvbGRlcjEvKVxcdCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdG5hbWU6ICdmaWxlLnR4dCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6ICdjb250ZW50cyBvZiBhIG5vbi1wcm9tcHQtc25pcHBldCBmaWxlJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdG5hbWU6ICd5ZXRBbm90aGVyRm9sZGVyXHVEODNFXHVERDJEJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRjaGlsZHJlbjogW1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRuYW1lOiAnYW5vdGhlci1maWxlLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0J3Rvb2xzOiBbXFwnbXktdG9vbDNcXCcsIFwibXktdG9vbDJcIiBdJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRgW10oJHtyb290Rm9sZGVyfS9mb2xkZXIxL3NvbWUtb3RoZXItZm9sZGVyKWAsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0J2Fub3RoZXItZmlsZS5wcm9tcHQubWQgY29udGVudHNcXHQgWyNmaWxlOmZpbGUudHh0XSguLi9maWxlLnR4dCknLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0bmFtZTogJ29uZV9tb3JlX2ZpbGVfanVzdF9pbl9jYXNlLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiAnb25lX21vcmVfZmlsZV9qdXN0X2luX2Nhc2UucHJvbXB0Lm1kIGNvbnRlbnRzJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fV0sXG5cdFx0XHRcdC8qKlxuXHRcdFx0XHQgKiBUaGUgcm9vdCBmaWxlIHBhdGggdG8gc3RhcnQgdGhlIHJlc29sdmUgcHJvY2VzcyBmcm9tLlxuXHRcdFx0XHQgKi9cblx0XHRcdFx0dG9VcmkoYC8ke3Jvb3RGb2xkZXJOYW1lfS9maWxlMi5wcm9tcHQubWRgKSxcblx0XHRcdFx0LyoqXG5cdFx0XHRcdCAqIFRoZSBleHBlY3RlZCByZWZlcmVuY2VzIHRvIGJlIHJlc29sdmVkLlxuXHRcdFx0XHQgKi9cblx0XHRcdFx0W1xuXHRcdFx0XHRcdG5ldyBFeHBlY3RlZFJlZmVyZW5jZShcblx0XHRcdFx0XHRcdHJvb3RVcmksXG5cdFx0XHRcdFx0XHRjcmVhdGVGaWxlUmVmZXJlbmNlKCdmb2xkZXIxL2ZpbGUzLnByb21wdC5tZCcsIDcsIDE0KSxcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdG5ldyBFeHBlY3RlZFJlZmVyZW5jZShcblx0XHRcdFx0XHRcdHJvb3RVcmksXG5cdFx0XHRcdFx0XHRjcmVhdGVNYXJrZG93blJlZmVyZW5jZShcblx0XHRcdFx0XHRcdFx0OCwgMTQsXG5cdFx0XHRcdFx0XHRcdCdbZmlsZTQucHJvbXB0Lm1kXScsICcoLi9mb2xkZXIxL3NvbWUtb3RoZXItZm9sZGVyL2ZpbGU0LnByb21wdC5tZCknLFxuXHRcdFx0XHRcdFx0KSxcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHRdXG5cdFx0XHQpKTtcblxuXHRcdFx0Y29uc3QgbWV0YWRhdGEgPSBhd2FpdCB0ZXN0LnJ1bigpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRtZXRhZGF0YSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHByb21wdFR5cGU6IFByb21wdHNUeXBlLnByb21wdCxcblx0XHRcdFx0XHRhZ2VudDogJ2FnZW50Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1Jvb3QgcHJvbXB0IGRlc2NyaXB0aW9uLicsXG5cdFx0XHRcdFx0dG9vbHM6IFsnbXktdG9vbDEnXSxcblx0XHRcdFx0fSxcblx0XHRcdFx0J011c3QgaGF2ZSBjb3JyZWN0IG1ldGFkYXRhLicsXG5cdFx0XHQpO1xuXG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgnYXBwbHlUbycsICgpID0+IHtcblx0XHRcdHRlc3QoJ3Byb21wdCBsYW5ndWFnZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0Y29uc3Qgcm9vdEZvbGRlck5hbWUgPSAncmVzb2x2ZXMtbmVzdGVkLWZpbGUtcmVmZXJlbmNlcyc7XG5cdFx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdFx0Y29uc3Qgcm9vdFVyaSA9IHRvVXJpKHJvb3RGb2xkZXIpO1xuXG5cdFx0XHRcdGNvbnN0IHRlc3QgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RQcm9tcHRGaWxlUmVmZXJlbmNlLFxuXHRcdFx0XHRcdC8qKlxuXHRcdFx0XHRcdCAqIFRoZSBmaWxlIHN0cnVjdHVyZSB0byBiZSBjcmVhdGVkIG9uIHRoZSBkaXNrIGZvciB0aGUgdGVzdC5cblx0XHRcdFx0XHQgKi9cblx0XHRcdFx0XHRbe1xuXHRcdFx0XHRcdFx0bmFtZTogcm9vdEZvbGRlck5hbWUsXG5cdFx0XHRcdFx0XHRjaGlsZHJlbjogW1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0bmFtZTogJ2ZpbGUxLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdFx0XHRcdCcjIyBTb21lIEhlYWRlcicsXG5cdFx0XHRcdFx0XHRcdFx0XHQnc29tZSBjb250ZW50cycsXG5cdFx0XHRcdFx0XHRcdFx0XHQnICcsXG5cdFx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdG5hbWU6ICdmaWxlMi5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdFx0XHRcdCdhcHBseVRvOiBcXCcqKi8qXFwnJyxcblx0XHRcdFx0XHRcdFx0XHRcdCd0b29sczogWyBcXCdteS10b29sMTJcXCcgLCBdJyxcblx0XHRcdFx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnRGVzY3JpcHRpb24gb2YgbXkgcHJvbXB0LlxcJycsXG5cdFx0XHRcdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdFx0XHRcdCcjIyBGaWxlcycsXG5cdFx0XHRcdFx0XHRcdFx0XHQnXFx0LSB0aGlzIGZpbGUgI2ZpbGU6Zm9sZGVyMS9maWxlMy5wcm9tcHQubWQgJyxcblx0XHRcdFx0XHRcdFx0XHRcdCdcXHQtIGFsc28gdGhpcyBbZmlsZTQucHJvbXB0Lm1kXSguL2ZvbGRlcjEvc29tZS1vdGhlci1mb2xkZXIvZmlsZTQucHJvbXB0Lm1kKSBwbGVhc2UhJyxcblx0XHRcdFx0XHRcdFx0XHRcdCcgJyxcblx0XHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0bmFtZTogJ2ZvbGRlcjEnLFxuXHRcdFx0XHRcdFx0XHRcdGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdG5hbWU6ICdmaWxlMy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdCd0b29sczogWyBcXCdteS10b29sMVxcJyAsIF0nLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdCcgc29tZSBtb3JlXFx0IGNvbnRlbnQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0bmFtZTogJ3NvbWUtb3RoZXItZm9sZGVyJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0Y2hpbGRyZW46IFtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRuYW1lOiAnZmlsZTQucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQndG9vbHM6IFtcXCdteS10b29sMVxcJywgXCJteS10b29sMlwiLCB0cnVlLCAsIFxcJ215LXRvb2wzXFwnICwgXScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCdzb21ldGhpbmc6IHRydWUnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnYWdlbnQ6IFxcJ2FnZW50XFwnXFx0Jyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0J2FuZCBzb21lIG1vcmUgY29udGVudCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdC8qKlxuXHRcdFx0XHRcdCAqIFRoZSByb290IGZpbGUgcGF0aCB0byBzdGFydCB0aGUgcmVzb2x2ZSBwcm9jZXNzIGZyb20uXG5cdFx0XHRcdFx0ICovXG5cdFx0XHRcdFx0dG9VcmkoYC8ke3Jvb3RGb2xkZXJOYW1lfS9maWxlMi5wcm9tcHQubWRgKSxcblx0XHRcdFx0XHQvKipcblx0XHRcdFx0XHQgKiBUaGUgZXhwZWN0ZWQgcmVmZXJlbmNlcyB0byBiZSByZXNvbHZlZC5cblx0XHRcdFx0XHQgKi9cblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRuZXcgRXhwZWN0ZWRSZWZlcmVuY2UoXG5cdFx0XHRcdFx0XHRcdHJvb3RVcmksXG5cdFx0XHRcdFx0XHRcdGNyZWF0ZUZpbGVSZWZlcmVuY2UoJ2ZvbGRlcjEvZmlsZTMucHJvbXB0Lm1kJywgNywgMTQpLFxuXHRcdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRcdG5ldyBFeHBlY3RlZFJlZmVyZW5jZShcblx0XHRcdFx0XHRcdFx0cm9vdFVyaSxcblx0XHRcdFx0XHRcdFx0Y3JlYXRlTWFya2Rvd25SZWZlcmVuY2UoXG5cdFx0XHRcdFx0XHRcdFx0OCwgMTQsXG5cdFx0XHRcdFx0XHRcdFx0J1tmaWxlNC5wcm9tcHQubWRdJywgJyguL2ZvbGRlcjEvc29tZS1vdGhlci1mb2xkZXIvZmlsZTQucHJvbXB0Lm1kKScsXG5cdFx0XHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KSk7XG5cblx0XHRcdFx0Y29uc3QgbWV0YWRhdGEgPSBhd2FpdCB0ZXN0LnJ1bigpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0bWV0YWRhdGEsXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cHJvbXB0VHlwZTogUHJvbXB0c1R5cGUucHJvbXB0LFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdEZXNjcmlwdGlvbiBvZiBteSBwcm9tcHQuJyxcblx0XHRcdFx0XHRcdHRvb2xzOiBbJ215LXRvb2wxMiddLFxuXHRcdFx0XHRcdFx0YXBwbHlUbzogJyoqLyonLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0J011c3QgaGF2ZSBjb3JyZWN0IG1ldGFkYXRhLicsXG5cdFx0XHRcdCk7XG5cblx0XHRcdH0pO1xuXG5cblx0XHRcdHRlc3QoJ2luc3RydWN0aW9ucyBsYW5ndWFnZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0Y29uc3Qgcm9vdEZvbGRlck5hbWUgPSAncmVzb2x2ZXMtbmVzdGVkLWZpbGUtcmVmZXJlbmNlcyc7XG5cdFx0XHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBgLyR7cm9vdEZvbGRlck5hbWV9YDtcblx0XHRcdFx0Y29uc3Qgcm9vdFVyaSA9IHRvVXJpKHJvb3RGb2xkZXIpO1xuXG5cdFx0XHRcdGNvbnN0IHRlc3QgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RQcm9tcHRGaWxlUmVmZXJlbmNlLFxuXHRcdFx0XHRcdC8qKlxuXHRcdFx0XHRcdCAqIFRoZSBmaWxlIHN0cnVjdHVyZSB0byBiZSBjcmVhdGVkIG9uIHRoZSBkaXNrIGZvciB0aGUgdGVzdC5cblx0XHRcdFx0XHQgKi9cblx0XHRcdFx0XHRbe1xuXHRcdFx0XHRcdFx0bmFtZTogcm9vdEZvbGRlck5hbWUsXG5cdFx0XHRcdFx0XHRjaGlsZHJlbjogW1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0bmFtZTogJ2ZpbGUxLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdFx0XHRcdCcjIyBTb21lIEhlYWRlcicsXG5cdFx0XHRcdFx0XHRcdFx0XHQnc29tZSBjb250ZW50cycsXG5cdFx0XHRcdFx0XHRcdFx0XHQnICcsXG5cdFx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdG5hbWU6ICdmaWxlMi5pbnN0cnVjdGlvbnMubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdFx0XHRcdCdhcHBseVRvOiBcXCcqKi8qXFwnJyxcblx0XHRcdFx0XHRcdFx0XHRcdCd0b29sczogWyBcXCdteS10b29sMTJcXCcgLCBdJyxcblx0XHRcdFx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXFwnRGVzY3JpcHRpb24gb2YgbXkgaW5zdHJ1Y3Rpb25zIGZpbGUuXFwnJyxcblx0XHRcdFx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0XHRcdFx0JyMjIEZpbGVzJyxcblx0XHRcdFx0XHRcdFx0XHRcdCdcXHQtIHRoaXMgZmlsZSAjZmlsZTpmb2xkZXIxL2ZpbGUzLnByb21wdC5tZCAnLFxuXHRcdFx0XHRcdFx0XHRcdFx0J1xcdC0gYWxzbyB0aGlzIFtmaWxlNC5wcm9tcHQubWRdKC4vZm9sZGVyMS9zb21lLW90aGVyLWZvbGRlci9maWxlNC5wcm9tcHQubWQpIHBsZWFzZSEnLFxuXHRcdFx0XHRcdFx0XHRcdFx0JyAnLFxuXHRcdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRuYW1lOiAnZm9sZGVyMScsXG5cdFx0XHRcdFx0XHRcdFx0Y2hpbGRyZW46IFtcblx0XHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0bmFtZTogJ2ZpbGUzLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0J3Rvb2xzOiBbIFxcJ215LXRvb2wxXFwnICwgXScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0JyBzb21lIG1vcmVcXHQgY29udGVudCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRuYW1lOiAnc29tZS1vdGhlci1mb2xkZXInLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRjaGlsZHJlbjogW1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdG5hbWU6ICdmaWxlNC5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCd0b29sczogW1xcJ215LXRvb2wxXFwnLCBcIm15LXRvb2wyXCIsIHRydWUsICwgXFwnbXktdG9vbDNcXCcgLCBdJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0J3NvbWV0aGluZzogdHJ1ZScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCdhZ2VudDogXFwnYWdlbnRcXCdcXHQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0JycsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnYW5kIHNvbWUgbW9yZSBjb250ZW50Jyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0LyoqXG5cdFx0XHRcdFx0ICogVGhlIHJvb3QgZmlsZSBwYXRoIHRvIHN0YXJ0IHRoZSByZXNvbHZlIHByb2Nlc3MgZnJvbS5cblx0XHRcdFx0XHQgKi9cblx0XHRcdFx0XHR0b1VyaShgLyR7cm9vdEZvbGRlck5hbWV9L2ZpbGUyLmluc3RydWN0aW9ucy5tZGApLFxuXHRcdFx0XHRcdC8qKlxuXHRcdFx0XHRcdCAqIFRoZSBleHBlY3RlZCByZWZlcmVuY2VzIHRvIGJlIHJlc29sdmVkLlxuXHRcdFx0XHRcdCAqL1xuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdG5ldyBFeHBlY3RlZFJlZmVyZW5jZShcblx0XHRcdFx0XHRcdFx0cm9vdFVyaSxcblx0XHRcdFx0XHRcdFx0Y3JlYXRlRmlsZVJlZmVyZW5jZSgnZm9sZGVyMS9maWxlMy5wcm9tcHQubWQnLCA3LCAxNCksXG5cdFx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdFx0bmV3IEV4cGVjdGVkUmVmZXJlbmNlKFxuXHRcdFx0XHRcdFx0XHRyb290VXJpLFxuXHRcdFx0XHRcdFx0XHRjcmVhdGVNYXJrZG93blJlZmVyZW5jZShcblx0XHRcdFx0XHRcdFx0XHQ4LCAxNCxcblx0XHRcdFx0XHRcdFx0XHQnW2ZpbGU0LnByb21wdC5tZF0nLCAnKC4vZm9sZGVyMS9zb21lLW90aGVyLWZvbGRlci9maWxlNC5wcm9tcHQubWQpJyxcblx0XHRcdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpKTtcblxuXHRcdFx0XHRjb25zdCBtZXRhZGF0YSA9IGF3YWl0IHRlc3QucnVuKCk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHRtZXRhZGF0YSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwcm9tcHRUeXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsXG5cdFx0XHRcdFx0XHRhcHBseVRvOiAnKiovKicsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0Rlc2NyaXB0aW9uIG9mIG15IGluc3RydWN0aW9ucyBmaWxlLicsXG5cdFx0XHRcdFx0XHR0b29sczogWydteS10b29sMTInXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdCdNdXN0IGhhdmUgY29ycmVjdCBtZXRhZGF0YS4nLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgndG9vbHMgYW5kIGFnZW50IGNvbXBhdGliaWxpdHknLCAoKSA9PiB7XG5cdFx0XHR0ZXN0KCdhc2sgYWdlbnQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdGNvbnN0IHJvb3RGb2xkZXJOYW1lID0gJ3Jlc29sdmVzLW5lc3RlZC1maWxlLXJlZmVyZW5jZXMnO1xuXHRcdFx0XHRjb25zdCByb290Rm9sZGVyID0gYC8ke3Jvb3RGb2xkZXJOYW1lfWA7XG5cdFx0XHRcdGNvbnN0IHJvb3RVcmkgPSB0b1VyaShyb290Rm9sZGVyKTtcblxuXHRcdFx0XHRjb25zdCB0ZXN0ID0gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0UHJvbXB0RmlsZVJlZmVyZW5jZSxcblx0XHRcdFx0XHQvKipcblx0XHRcdFx0XHQgKiBUaGUgZmlsZSBzdHJ1Y3R1cmUgdG8gYmUgY3JlYXRlZCBvbiB0aGUgZGlzayBmb3IgdGhlIHRlc3QuXG5cdFx0XHRcdFx0ICovXG5cdFx0XHRcdFx0W3tcblx0XHRcdFx0XHRcdG5hbWU6IHJvb3RGb2xkZXJOYW1lLFxuXHRcdFx0XHRcdFx0Y2hpbGRyZW46IFtcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdG5hbWU6ICdmaWxlMS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHQnIyMgU29tZSBIZWFkZXInLFxuXHRcdFx0XHRcdFx0XHRcdFx0J3NvbWUgY29udGVudHMnLFxuXHRcdFx0XHRcdFx0XHRcdFx0JyAnLFxuXHRcdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRuYW1lOiAnZmlsZTIucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFxcJ0Rlc2NyaXB0aW9uIG9mIG15IHByb21wdC5cXCcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0J2FnZW50OiBcImFza1wiICcsXG5cdFx0XHRcdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdFx0XHRcdCcjIyBGaWxlcycsXG5cdFx0XHRcdFx0XHRcdFx0XHQnXFx0LSB0aGlzIGZpbGUgI2ZpbGU6Zm9sZGVyMS9maWxlMy5wcm9tcHQubWQgJyxcblx0XHRcdFx0XHRcdFx0XHRcdCdcXHQtIGFsc28gdGhpcyBbZmlsZTQucHJvbXB0Lm1kXSguL2ZvbGRlcjEvc29tZS1vdGhlci1mb2xkZXIvZmlsZTQucHJvbXB0Lm1kKSBwbGVhc2UhJyxcblx0XHRcdFx0XHRcdFx0XHRcdCcgJyxcblx0XHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0bmFtZTogJ2ZvbGRlcjEnLFxuXHRcdFx0XHRcdFx0XHRcdGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdG5hbWU6ICdmaWxlMy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdCd0b29sczogWyBcXCdteS10b29sMVxcJyAsIF0nLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdCdhZ2VudDogXFwnYWdlbnRcXCdcXHQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdCcgc29tZSBtb3JlXFx0IGNvbnRlbnQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0bmFtZTogJ3NvbWUtb3RoZXItZm9sZGVyJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0Y2hpbGRyZW46IFtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRuYW1lOiAnZmlsZTQucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQndG9vbHM6IFtcXCdteS10b29sMVxcJywgXCJteS10b29sMlwiLCB0cnVlLCAsIF0nLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnc29tZXRoaW5nOiB0cnVlJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0J2FnZW50OiBcXCdhc2tcXCdcXHQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0JycsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnYW5kIHNvbWUgbW9yZSBjb250ZW50Jyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0LyoqXG5cdFx0XHRcdFx0ICogVGhlIHJvb3QgZmlsZSBwYXRoIHRvIHN0YXJ0IHRoZSByZXNvbHZlIHByb2Nlc3MgZnJvbS5cblx0XHRcdFx0XHQgKi9cblx0XHRcdFx0XHR0b1VyaShgLyR7cm9vdEZvbGRlck5hbWV9L2ZpbGUyLnByb21wdC5tZGApLFxuXHRcdFx0XHRcdC8qKlxuXHRcdFx0XHRcdCAqIFRoZSBleHBlY3RlZCByZWZlcmVuY2VzIHRvIGJlIHJlc29sdmVkLlxuXHRcdFx0XHRcdCAqL1xuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdG5ldyBFeHBlY3RlZFJlZmVyZW5jZShcblx0XHRcdFx0XHRcdFx0cm9vdFVyaSxcblx0XHRcdFx0XHRcdFx0Y3JlYXRlRmlsZVJlZmVyZW5jZSgnZm9sZGVyMS9maWxlMy5wcm9tcHQubWQnLCA2LCAxNCksXG5cdFx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdFx0bmV3IEV4cGVjdGVkUmVmZXJlbmNlKFxuXHRcdFx0XHRcdFx0XHRyb290VXJpLFxuXHRcdFx0XHRcdFx0XHRjcmVhdGVNYXJrZG93blJlZmVyZW5jZShcblx0XHRcdFx0XHRcdFx0XHQ3LCAxNCxcblx0XHRcdFx0XHRcdFx0XHQnW2ZpbGU0LnByb21wdC5tZF0nLCAnKC4vZm9sZGVyMS9zb21lLW90aGVyLWZvbGRlci9maWxlNC5wcm9tcHQubWQpJyxcblx0XHRcdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpKTtcblxuXHRcdFx0XHRjb25zdCBtZXRhZGF0YSA9IGF3YWl0IHRlc3QucnVuKCk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHRtZXRhZGF0YSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwcm9tcHRUeXBlOiBQcm9tcHRzVHlwZS5wcm9tcHQsXG5cdFx0XHRcdFx0XHRhZ2VudDogQ2hhdE1vZGVLaW5kLkFzayxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnRGVzY3JpcHRpb24gb2YgbXkgcHJvbXB0LicsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHQnTXVzdCBoYXZlIGNvcnJlY3QgbWV0YWRhdGEuJyxcblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdlZGl0IGFnZW50JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICdyZXNvbHZlcy1uZXN0ZWQtZmlsZS1yZWZlcmVuY2VzJztcblx0XHRcdFx0Y29uc3Qgcm9vdEZvbGRlciA9IGAvJHtyb290Rm9sZGVyTmFtZX1gO1xuXHRcdFx0XHRjb25zdCByb290VXJpID0gdG9Vcmkocm9vdEZvbGRlcik7XG5cblx0XHRcdFx0Y29uc3QgdGVzdCA9IHRlc3REaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFByb21wdEZpbGVSZWZlcmVuY2UsXG5cdFx0XHRcdFx0LyoqXG5cdFx0XHRcdFx0ICogVGhlIGZpbGUgc3RydWN0dXJlIHRvIGJlIGNyZWF0ZWQgb24gdGhlIGRpc2sgZm9yIHRoZSB0ZXN0LlxuXHRcdFx0XHRcdCAqL1xuXHRcdFx0XHRcdFt7XG5cdFx0XHRcdFx0XHRuYW1lOiByb290Rm9sZGVyTmFtZSxcblx0XHRcdFx0XHRcdGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRuYW1lOiAnZmlsZTEucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0XHRcdFx0JyMjIFNvbWUgSGVhZGVyJyxcblx0XHRcdFx0XHRcdFx0XHRcdCdzb21lIGNvbnRlbnRzJyxcblx0XHRcdFx0XHRcdFx0XHRcdCcgJyxcblx0XHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0bmFtZTogJ2ZpbGUyLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcXCdEZXNjcmlwdGlvbiBvZiBteSBwcm9tcHQuXFwnJyxcblx0XHRcdFx0XHRcdFx0XHRcdCdhZ2VudDpcXHRcXHRcImVkaXRcIlxcdFxcdCcsXG5cdFx0XHRcdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdFx0XHRcdCcjIyBGaWxlcycsXG5cdFx0XHRcdFx0XHRcdFx0XHQnXFx0LSB0aGlzIGZpbGUgI2ZpbGU6Zm9sZGVyMS9maWxlMy5wcm9tcHQubWQgJyxcblx0XHRcdFx0XHRcdFx0XHRcdCdcXHQtIGFsc28gdGhpcyBbZmlsZTQucHJvbXB0Lm1kXSguL2ZvbGRlcjEvc29tZS1vdGhlci1mb2xkZXIvZmlsZTQucHJvbXB0Lm1kKSBwbGVhc2UhJyxcblx0XHRcdFx0XHRcdFx0XHRcdCcgJyxcblx0XHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0bmFtZTogJ2ZvbGRlcjEnLFxuXHRcdFx0XHRcdFx0XHRcdGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdG5hbWU6ICdmaWxlMy5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdCd0b29sczogWyBcXCdteS10b29sMVxcJyAsIF0nLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdCcgc29tZSBtb3JlXFx0IGNvbnRlbnQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0bmFtZTogJ3NvbWUtb3RoZXItZm9sZGVyJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0Y2hpbGRyZW46IFtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRuYW1lOiAnZmlsZTQucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQndG9vbHM6IFtcXCdteS10b29sMVxcJywgXCJteS10b29sMlwiLCB0cnVlLCAsIF0nLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnc29tZXRoaW5nOiB0cnVlJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0J2FnZW50OiBcXCdhZ2VudFxcJ1xcdCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0JycsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCdhbmQgc29tZSBtb3JlIGNvbnRlbnQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHQvKipcblx0XHRcdFx0XHQgKiBUaGUgcm9vdCBmaWxlIHBhdGggdG8gc3RhcnQgdGhlIHJlc29sdmUgcHJvY2VzcyBmcm9tLlxuXHRcdFx0XHRcdCAqL1xuXHRcdFx0XHRcdHRvVXJpKGAvJHtyb290Rm9sZGVyTmFtZX0vZmlsZTIucHJvbXB0Lm1kYCksXG5cdFx0XHRcdFx0LyoqXG5cdFx0XHRcdFx0ICogVGhlIGV4cGVjdGVkIHJlZmVyZW5jZXMgdG8gYmUgcmVzb2x2ZWQuXG5cdFx0XHRcdFx0ICovXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0bmV3IEV4cGVjdGVkUmVmZXJlbmNlKFxuXHRcdFx0XHRcdFx0XHRyb290VXJpLFxuXHRcdFx0XHRcdFx0XHRjcmVhdGVGaWxlUmVmZXJlbmNlKCdmb2xkZXIxL2ZpbGUzLnByb21wdC5tZCcsIDYsIDE0KSxcblx0XHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0XHRuZXcgRXhwZWN0ZWRSZWZlcmVuY2UoXG5cdFx0XHRcdFx0XHRcdHJvb3RVcmksXG5cdFx0XHRcdFx0XHRcdGNyZWF0ZU1hcmtkb3duUmVmZXJlbmNlKFxuXHRcdFx0XHRcdFx0XHRcdDcsIDE0LFxuXHRcdFx0XHRcdFx0XHRcdCdbZmlsZTQucHJvbXB0Lm1kXScsICcoLi9mb2xkZXIxL3NvbWUtb3RoZXItZm9sZGVyL2ZpbGU0LnByb21wdC5tZCknLFxuXHRcdFx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCkpO1xuXG5cdFx0XHRcdGNvbnN0IG1ldGFkYXRhID0gYXdhaXQgdGVzdC5ydW4oKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdG1ldGFkYXRhLFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHByb21wdFR5cGU6IFByb21wdHNUeXBlLnByb21wdCxcblx0XHRcdFx0XHRcdGFnZW50OiBDaGF0TW9kZUtpbmQuRWRpdCxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnRGVzY3JpcHRpb24gb2YgbXkgcHJvbXB0LicsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHQnTXVzdCBoYXZlIGNvcnJlY3QgbWV0YWRhdGEuJyxcblx0XHRcdFx0KTtcblxuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2FnZW50JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZSA9ICdyZXNvbHZlcy1uZXN0ZWQtZmlsZS1yZWZlcmVuY2VzJztcblx0XHRcdFx0Y29uc3Qgcm9vdEZvbGRlciA9IGAvJHtyb290Rm9sZGVyTmFtZX1gO1xuXHRcdFx0XHRjb25zdCByb290VXJpID0gdG9Vcmkocm9vdEZvbGRlcik7XG5cblx0XHRcdFx0Y29uc3QgdGVzdCA9IHRlc3REaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFByb21wdEZpbGVSZWZlcmVuY2UsXG5cdFx0XHRcdFx0LyoqXG5cdFx0XHRcdFx0ICogVGhlIGZpbGUgc3RydWN0dXJlIHRvIGJlIGNyZWF0ZWQgb24gdGhlIGRpc2sgZm9yIHRoZSB0ZXN0LlxuXHRcdFx0XHRcdCAqL1xuXHRcdFx0XHRcdFt7XG5cdFx0XHRcdFx0XHRuYW1lOiByb290Rm9sZGVyTmFtZSxcblx0XHRcdFx0XHRcdGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRuYW1lOiAnZmlsZTEucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0XHRcdFx0JyMjIFNvbWUgSGVhZGVyJyxcblx0XHRcdFx0XHRcdFx0XHRcdCdzb21lIGNvbnRlbnRzJyxcblx0XHRcdFx0XHRcdFx0XHRcdCcgJyxcblx0XHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0bmFtZTogJ2ZpbGUyLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcXCdEZXNjcmlwdGlvbiBvZiBteSBwcm9tcHQuXFwnJyxcblx0XHRcdFx0XHRcdFx0XHRcdCdhZ2VudDogXFx0XFx0IFwiYWdlbnRcIiBcXHRcXHQgJyxcblx0XHRcdFx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0XHRcdFx0JyMjIEZpbGVzJyxcblx0XHRcdFx0XHRcdFx0XHRcdCdcXHQtIHRoaXMgZmlsZSAjZmlsZTpmb2xkZXIxL2ZpbGUzLnByb21wdC5tZCAnLFxuXHRcdFx0XHRcdFx0XHRcdFx0J1xcdC0gYWxzbyB0aGlzIFtmaWxlNC5wcm9tcHQubWRdKC4vZm9sZGVyMS9zb21lLW90aGVyLWZvbGRlci9maWxlNC5wcm9tcHQubWQpIHBsZWFzZSEnLFxuXHRcdFx0XHRcdFx0XHRcdFx0JyAnLFxuXHRcdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRuYW1lOiAnZm9sZGVyMScsXG5cdFx0XHRcdFx0XHRcdFx0Y2hpbGRyZW46IFtcblx0XHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0bmFtZTogJ2ZpbGUzLnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0J3Rvb2xzOiBbIFxcJ215LXRvb2wxXFwnICwgXScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0JyBzb21lIG1vcmVcXHQgY29udGVudCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRuYW1lOiAnc29tZS1vdGhlci1mb2xkZXInLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRjaGlsZHJlbjogW1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdG5hbWU6ICdmaWxlNC5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCd0b29sczogW1xcJ215LXRvb2wxXFwnLCBcIm15LXRvb2wyXCIsIHRydWUsICwgXFwnbXktdG9vbDNcXCcgLCBdJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0J3NvbWV0aGluZzogdHJ1ZScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCdhZ2VudDogXFwnYWdlbnRcXCdcXHQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0JycsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnYW5kIHNvbWUgbW9yZSBjb250ZW50Jyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0LyoqXG5cdFx0XHRcdFx0ICogVGhlIHJvb3QgZmlsZSBwYXRoIHRvIHN0YXJ0IHRoZSByZXNvbHZlIHByb2Nlc3MgZnJvbS5cblx0XHRcdFx0XHQgKi9cblx0XHRcdFx0XHR0b1VyaShgLyR7cm9vdEZvbGRlck5hbWV9L2ZpbGUyLnByb21wdC5tZGApLFxuXHRcdFx0XHRcdC8qKlxuXHRcdFx0XHRcdCAqIFRoZSBleHBlY3RlZCByZWZlcmVuY2VzIHRvIGJlIHJlc29sdmVkLlxuXHRcdFx0XHRcdCAqL1xuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdG5ldyBFeHBlY3RlZFJlZmVyZW5jZShcblx0XHRcdFx0XHRcdFx0cm9vdFVyaSxcblx0XHRcdFx0XHRcdFx0Y3JlYXRlRmlsZVJlZmVyZW5jZSgnZm9sZGVyMS9maWxlMy5wcm9tcHQubWQnLCA2LCAxNCksXG5cdFx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdFx0bmV3IEV4cGVjdGVkUmVmZXJlbmNlKFxuXHRcdFx0XHRcdFx0XHRyb290VXJpLFxuXHRcdFx0XHRcdFx0XHRjcmVhdGVNYXJrZG93blJlZmVyZW5jZShcblx0XHRcdFx0XHRcdFx0XHQ3LCAxNCxcblx0XHRcdFx0XHRcdFx0XHQnW2ZpbGU0LnByb21wdC5tZF0nLCAnKC4vZm9sZGVyMS9zb21lLW90aGVyLWZvbGRlci9maWxlNC5wcm9tcHQubWQpJyxcblx0XHRcdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpKTtcblxuXHRcdFx0XHRjb25zdCBtZXRhZGF0YSA9IGF3YWl0IHRlc3QucnVuKCk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHRtZXRhZGF0YSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwcm9tcHRUeXBlOiBQcm9tcHRzVHlwZS5wcm9tcHQsXG5cdFx0XHRcdFx0XHRhZ2VudDogQ2hhdE1vZGVLaW5kLkFnZW50LFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdEZXNjcmlwdGlvbiBvZiBteSBwcm9tcHQuJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdCdNdXN0IGhhdmUgY29ycmVjdCBtZXRhZGF0YS4nLFxuXHRcdFx0XHQpO1xuXG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnbm8gYWdlbnQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdGNvbnN0IHJvb3RGb2xkZXJOYW1lID0gJ3Jlc29sdmVzLW5lc3RlZC1maWxlLXJlZmVyZW5jZXMnO1xuXHRcdFx0XHRjb25zdCByb290Rm9sZGVyID0gYC8ke3Jvb3RGb2xkZXJOYW1lfWA7XG5cdFx0XHRcdGNvbnN0IHJvb3RVcmkgPSB0b1VyaShyb290Rm9sZGVyKTtcblxuXHRcdFx0XHRjb25zdCB0ZXN0ID0gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0UHJvbXB0RmlsZVJlZmVyZW5jZSxcblx0XHRcdFx0XHQvKipcblx0XHRcdFx0XHQgKiBUaGUgZmlsZSBzdHJ1Y3R1cmUgdG8gYmUgY3JlYXRlZCBvbiB0aGUgZGlzayBmb3IgdGhlIHRlc3QuXG5cdFx0XHRcdFx0ICovXG5cdFx0XHRcdFx0W3tcblx0XHRcdFx0XHRcdG5hbWU6IHJvb3RGb2xkZXJOYW1lLFxuXHRcdFx0XHRcdFx0Y2hpbGRyZW46IFtcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdG5hbWU6ICdmaWxlMS5wcm9tcHQubWQnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHQnIyMgU29tZSBIZWFkZXInLFxuXHRcdFx0XHRcdFx0XHRcdFx0J3NvbWUgY29udGVudHMnLFxuXHRcdFx0XHRcdFx0XHRcdFx0JyAnLFxuXHRcdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRuYW1lOiAnZmlsZTIucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHRcdFx0XHQndG9vbHM6IFsgXFwnbXktdG9vbDEyXFwnICwgXScsXG5cdFx0XHRcdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFxcJ0Rlc2NyaXB0aW9uIG9mIHRoZSBwcm9tcHQgZmlsZS5cXCcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHRcdFx0XHQnIyMgRmlsZXMnLFxuXHRcdFx0XHRcdFx0XHRcdFx0J1xcdC0gdGhpcyBmaWxlICNmaWxlOmZvbGRlcjEvZmlsZTMucHJvbXB0Lm1kICcsXG5cdFx0XHRcdFx0XHRcdFx0XHQnXFx0LSBhbHNvIHRoaXMgW2ZpbGU0LnByb21wdC5tZF0oLi9mb2xkZXIxL3NvbWUtb3RoZXItZm9sZGVyL2ZpbGU0LnByb21wdC5tZCkgcGxlYXNlIScsXG5cdFx0XHRcdFx0XHRcdFx0XHQnICcsXG5cdFx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdG5hbWU6ICdmb2xkZXIxJyxcblx0XHRcdFx0XHRcdFx0XHRjaGlsZHJlbjogW1xuXHRcdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRuYW1lOiAnZmlsZTMucHJvbXB0Lm1kJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6IFtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHQndG9vbHM6IFsgXFwnbXktdG9vbDFcXCcgLCBdJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnIHNvbWUgbW9yZVxcdCBjb250ZW50Jyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdG5hbWU6ICdzb21lLW90aGVyLWZvbGRlcicsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0bmFtZTogJ2ZpbGU0LnByb21wdC5tZCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogW1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0J3Rvb2xzOiBbXFwnbXktdG9vbDFcXCcsIFwibXktdG9vbDJcIiwgdHJ1ZSwgLCBcXCdteS10b29sM1xcJyAsIF0nLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnc29tZXRoaW5nOiB0cnVlJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0J2FnZW50OiBcXCdhZ2VudFxcJ1xcdCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0JycsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCdhbmQgc29tZSBtb3JlIGNvbnRlbnQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHQvKipcblx0XHRcdFx0XHQgKiBUaGUgcm9vdCBmaWxlIHBhdGggdG8gc3RhcnQgdGhlIHJlc29sdmUgcHJvY2VzcyBmcm9tLlxuXHRcdFx0XHRcdCAqL1xuXHRcdFx0XHRcdHRvVXJpKGAvJHtyb290Rm9sZGVyTmFtZX0vZmlsZTIucHJvbXB0Lm1kYCksXG5cdFx0XHRcdFx0LyoqXG5cdFx0XHRcdFx0ICogVGhlIGV4cGVjdGVkIHJlZmVyZW5jZXMgdG8gYmUgcmVzb2x2ZWQuXG5cdFx0XHRcdFx0ICovXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0bmV3IEV4cGVjdGVkUmVmZXJlbmNlKFxuXHRcdFx0XHRcdFx0XHRyb290VXJpLFxuXHRcdFx0XHRcdFx0XHRjcmVhdGVGaWxlUmVmZXJlbmNlKCdmb2xkZXIxL2ZpbGUzLnByb21wdC5tZCcsIDYsIDE0KSxcblx0XHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0XHRuZXcgRXhwZWN0ZWRSZWZlcmVuY2UoXG5cdFx0XHRcdFx0XHRcdHJvb3RVcmksXG5cdFx0XHRcdFx0XHRcdGNyZWF0ZU1hcmtkb3duUmVmZXJlbmNlKFxuXHRcdFx0XHRcdFx0XHRcdDcsIDE0LFxuXHRcdFx0XHRcdFx0XHRcdCdbZmlsZTQucHJvbXB0Lm1kXScsICcoLi9mb2xkZXIxL3NvbWUtb3RoZXItZm9sZGVyL2ZpbGU0LnByb21wdC5tZCknLFxuXHRcdFx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCkpO1xuXG5cdFx0XHRcdGNvbnN0IG1ldGFkYXRhID0gYXdhaXQgdGVzdC5ydW4oKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdG1ldGFkYXRhLFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHByb21wdFR5cGU6IFByb21wdHNUeXBlLnByb21wdCxcblx0XHRcdFx0XHRcdHRvb2xzOiBbJ215LXRvb2wxMiddLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdEZXNjcmlwdGlvbiBvZiB0aGUgcHJvbXB0IGZpbGUuJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdCdNdXN0IGhhdmUgY29ycmVjdCBtZXRhZGF0YS4nLFxuXHRcdFx0XHQpO1xuXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGFBQWE7QUFDdEIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxhQUFhLHNCQUFzQjtBQUM1QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHlCQUF5QjtBQUNsQyxT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
