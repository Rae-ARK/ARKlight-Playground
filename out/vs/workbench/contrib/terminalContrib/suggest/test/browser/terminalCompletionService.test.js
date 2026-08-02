import { URI } from "../../../../../../base/common/uri.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { TerminalCompletionService } from "../../browser/terminalCompletionService.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import assert, { fail } from "assert";
import { isWindows } from "../../../../../../base/common/platform.js";
import { createFileStat } from "../../../../../test/common/workbenchTestServices.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { TerminalCapabilityStore } from "../../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js";
import { ShellEnvDetectionCapability } from "../../../../../../platform/terminal/common/capabilities/shellEnvDetectionCapability.js";
import { TerminalCapability } from "../../../../../../platform/terminal/common/capabilities/capabilities.js";
import { TerminalCompletionItemKind } from "../../browser/terminalCompletionItem.js";
import { count } from "../../../../../../base/common/strings.js";
import { ITerminalLogService, WindowsShellType } from "../../../../../../platform/terminal/common/terminal.js";
import { gitBashToWindowsPath, windowsToGitBashPath } from "../../browser/terminalGitBashHelpers.js";
import { NullLogService } from "../../../../../../platform/log/common/log.js";
import { TerminalSuggestSettingId } from "../../common/terminalSuggestConfiguration.js";
import { TestPathService, workbenchInstantiationService } from "../../../../../test/browser/workbenchTestServices.js";
const pathSeparator = isWindows ? "\\" : "/";
function assertCompletions(actual, expected, expectedConfig, pathSep) {
  const sep = pathSep ?? pathSeparator;
  assert.deepStrictEqual(
    actual?.map((e) => ({
      label: e.label,
      detail: e.detail ?? "",
      kind: e.kind ?? TerminalCompletionItemKind.Folder,
      replacementRange: e.replacementRange
    })),
    expected.map((e) => ({
      label: e.label.replaceAll("/", sep),
      detail: e.detail ? e.detail.replaceAll("/", sep) : "",
      kind: e.kind ?? TerminalCompletionItemKind.Folder,
      replacementRange: expectedConfig.replacementRange
    }))
  );
}
function assertPartialCompletionsExist(actual, expectedPartial, expectedConfig) {
  if (!actual) {
    fail();
  }
  const expectedMapped = expectedPartial.map((e) => ({
    label: e.label.replaceAll("/", pathSeparator),
    detail: e.detail ? e.detail.replaceAll("/", pathSeparator) : "",
    kind: e.kind ?? TerminalCompletionItemKind.Folder,
    replacementRange: expectedConfig.replacementRange
  }));
  for (const expectedItem of expectedMapped) {
    assert.deepStrictEqual(actual.map((e) => ({
      label: e.label,
      detail: e.detail ?? "",
      kind: e.kind ?? TerminalCompletionItemKind.Folder,
      replacementRange: e.replacementRange
    })).find((e) => e.detail === expectedItem.detail), expectedItem);
  }
}
const testEnv = {
  HOME: "/home/user",
  USERPROFILE: "/home/user"
};
let homeDir = isWindows ? testEnv["USERPROFILE"] : testEnv["HOME"];
if (!homeDir.endsWith("/")) {
  homeDir += "/";
}
const standardTildeItem = Object.freeze({ label: "~", detail: homeDir });
suite("TerminalCompletionService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let configurationService;
  let capabilities;
  let validResources;
  let childResources;
  let terminalCompletionService;
  const provider = "testProvider";
  setup(() => {
    instantiationService = workbenchInstantiationService({
      pathService: () => new TestPathService(URI.file(homeDir ?? "/"))
    }, store);
    const normalizePath = (path) => path === "/" ? path : path.replace(/\/+$/, "");
    const doesResourceExist = (resource) => validResources.some((e) => normalizePath(e.path) === normalizePath(resource.path)) || childResources.some((e) => normalizePath(e.resource.path) === normalizePath(resource.path));
    configurationService = new TestConfigurationService();
    instantiationService.stub(ITerminalLogService, new NullLogService());
    instantiationService.stub(IConfigurationService, configurationService);
    instantiationService.stub(IFileService, {
      async stat(resource) {
        if (!doesResourceExist(resource)) {
          throw new Error("Doesn't exist");
        }
        return createFileStat(resource);
      },
      async resolve(resource, options) {
        if (!doesResourceExist(resource)) {
          throw new Error("Doesn't exist");
        }
        const children = childResources.filter((child) => {
          const childFsPath = child.resource.path.replace(/\/$/, "");
          const parentFsPath = resource.path.replace(/\/$/, "");
          return childFsPath.startsWith(parentFsPath) && count(childFsPath, "/") === count(parentFsPath, "/") + 1;
        });
        return createFileStat(resource, void 0, void 0, void 0, void 0, children);
      },
      async realpath(resource) {
        if (resource.path.includes("symlink-file")) {
          return resource.with({ path: "/target/actual-file.txt" });
        } else if (resource.path.includes("symlink-folder")) {
          return resource.with({ path: "/target/actual-folder" });
        }
        return void 0;
      }
    });
    terminalCompletionService = store.add(instantiationService.createInstance(TerminalCompletionService));
    terminalCompletionService.processEnv = testEnv;
    validResources = [];
    childResources = [];
    capabilities = store.add(new TerminalCapabilityStore());
  });
  suite("resolveResources should return undefined", () => {
    test("if neither showFiles nor showDirectories are true", async () => {
      const resourceOptions = {
        cwd: URI.parse("file:///test"),
        pathSeparator
      };
      validResources = [URI.parse("file:///test")];
      const result = await terminalCompletionService.resolveResources(resourceOptions, "cd ", 3, provider, capabilities);
      assert(!result);
    });
  });
  suite("resolveResources should return folder completions", () => {
    setup(() => {
      validResources = [URI.parse("file:///test")];
      childResources = [
        { resource: URI.parse("file:///test/folder1/"), isDirectory: true, isFile: false },
        { resource: URI.parse("file:///test/file1.txt"), isDirectory: false, isFile: true }
      ];
    });
    test("| should return root-level completions", async () => {
      const resourceOptions = {
        cwd: URI.parse("file:///test"),
        showDirectories: true,
        pathSeparator
      };
      const result = await terminalCompletionService.resolveResources(resourceOptions, "", 1, provider, capabilities);
      assertCompletions(result, [
        { label: ".", detail: "/test/" },
        { label: "./folder1/", detail: "/test/folder1/" },
        { label: "../", detail: "/" },
        standardTildeItem
      ], { replacementRange: [1, 1] });
    });
    test("./| should return folder completions", async () => {
      const resourceOptions = {
        cwd: URI.parse("file:///test"),
        showDirectories: true,
        pathSeparator
      };
      const result = await terminalCompletionService.resolveResources(resourceOptions, "./", 3, provider, capabilities);
      assertCompletions(result, [
        { label: "./", detail: "/test/" },
        { label: "./folder1/", detail: "/test/folder1/" },
        { label: "./../", detail: "/" }
      ], { replacementRange: [1, 3] });
    });
    test("../| should return parent folder completions", async () => {
      validResources = [
        URI.parse("file:///parent/folder1"),
        URI.parse("file:///parent")
      ];
      childResources = [
        { resource: URI.parse("file:///parent/folder1/"), isDirectory: true },
        { resource: URI.parse("file:///parent/folder2/"), isDirectory: true }
      ];
      const resourceOptions = {
        cwd: URI.parse("file:///parent/folder1"),
        showDirectories: true,
        pathSeparator
      };
      const result = await terminalCompletionService.resolveResources(resourceOptions, "../", 3, provider, capabilities);
      assertCompletions(result, [
        { label: "../", detail: "/parent/" },
        { label: "../folder1/", detail: "/parent/folder1/" },
        { label: "../folder2/", detail: "/parent/folder2/" },
        { label: "../../", detail: "/" }
      ], { replacementRange: [0, 3] });
    });
    test("cd ./| should return folder completions", async () => {
      const resourceOptions = {
        cwd: URI.parse("file:///test"),
        showDirectories: true,
        pathSeparator
      };
      const result = await terminalCompletionService.resolveResources(resourceOptions, "cd ./", 5, provider, capabilities);
      assertCompletions(result, [
        { label: "./", detail: "/test/" },
        { label: "./folder1/", detail: "/test/folder1/" },
        { label: "./../", detail: "/" }
      ], { replacementRange: [3, 5] });
    });
    test("cd ./f| should return folder completions", async () => {
      const resourceOptions = {
        cwd: URI.parse("file:///test"),
        showDirectories: true,
        pathSeparator
      };
      const result = await terminalCompletionService.resolveResources(resourceOptions, "cd ./f", 6, provider, capabilities);
      assertCompletions(result, [
        { label: "./", detail: "/test/" },
        { label: "./folder1/", detail: "/test/folder1/" },
        { label: "./../", detail: "/" }
      ], { replacementRange: [3, 6] });
    });
  });
  suite("resolveResources should handle file and folder completion requests correctly", () => {
    setup(() => {
      validResources = [URI.parse("file:///test")];
      childResources = [
        { resource: URI.parse("file:///test/.hiddenFile"), isFile: true, executable: true },
        { resource: URI.parse("file:///test/.hiddenFolder/"), isDirectory: true },
        { resource: URI.parse("file:///test/folder1/"), isDirectory: true },
        { resource: URI.parse("file:///test/file1.txt"), isFile: true, executable: true }
      ];
    });
    test("./| should handle hidden files and folders", async () => {
      const resourceOptions = {
        cwd: URI.parse("file:///test"),
        showDirectories: true,
        showFiles: true,
        pathSeparator
      };
      const result = await terminalCompletionService.resolveResources(resourceOptions, "./", 2, provider, capabilities);
      assertCompletions(result, [
        { label: "./", detail: "/test/" },
        { label: "./.hiddenFile", detail: "/test/.hiddenFile", kind: TerminalCompletionItemKind.File },
        { label: "./.hiddenFolder/", detail: "/test/.hiddenFolder/" },
        { label: "./folder1/", detail: "/test/folder1/" },
        { label: "./file1.txt", detail: "/test/file1.txt", kind: TerminalCompletionItemKind.File },
        { label: "./../", detail: "/" }
      ], { replacementRange: [0, 2] });
    });
    test("./h| should handle hidden files and folders", async () => {
      const resourceOptions = {
        cwd: URI.parse("file:///test"),
        showDirectories: true,
        showFiles: true,
        pathSeparator
      };
      const result = await terminalCompletionService.resolveResources(resourceOptions, "./h", 3, provider, capabilities);
      assertCompletions(result, [
        { label: "./", detail: "/test/" },
        { label: "./.hiddenFile", detail: "/test/.hiddenFile", kind: TerminalCompletionItemKind.File },
        { label: "./.hiddenFolder/", detail: "/test/.hiddenFolder/" },
        { label: "./folder1/", detail: "/test/folder1/" },
        { label: "./file1.txt", detail: "/test/file1.txt", kind: TerminalCompletionItemKind.File },
        { label: "./../", detail: "/" }
      ], { replacementRange: [0, 3] });
    });
  });
  suite("~ -> $HOME", () => {
    let resourceOptions;
    let shellEnvDetection;
    setup(() => {
      shellEnvDetection = store.add(new ShellEnvDetectionCapability());
      shellEnvDetection.setEnvironment({
        HOME: "/home",
        USERPROFILE: "/home"
      }, true);
      capabilities.add(TerminalCapability.ShellEnvDetection, shellEnvDetection);
      resourceOptions = {
        cwd: URI.parse("file:///test/folder1"),
        // Updated to reflect home directory
        showFiles: true,
        showDirectories: true,
        pathSeparator
      };
      validResources = [
        URI.parse("file:///test"),
        URI.parse("file:///test/folder1"),
        URI.parse("file:///home"),
        URI.parse("file:///home/vscode"),
        URI.parse("file:///home/vscode/foo"),
        URI.parse("file:///home/vscode/bar.txt")
      ];
      childResources = [
        { resource: URI.parse("file:///home/vscode"), isDirectory: true },
        { resource: URI.parse("file:///home/vscode/foo"), isDirectory: true },
        { resource: URI.parse("file:///home/vscode/bar.txt"), isFile: true, executable: true }
      ];
    });
    test("~| should return completion for ~", async () => {
      assertPartialCompletionsExist(await terminalCompletionService.resolveResources(resourceOptions, "~", 1, provider, capabilities), [
        { label: "~", detail: "/home/" }
      ], { replacementRange: [0, 1] });
    });
    test("~/| should return folder completions relative to $HOME", async () => {
      assertCompletions(await terminalCompletionService.resolveResources(resourceOptions, "~/", 2, provider, capabilities), [
        { label: "~/", detail: "/home/" },
        { label: "~/vscode/", detail: "/home/vscode/" }
      ], { replacementRange: [0, 2] });
    });
    test("~/vscode/| should return folder completions relative to $HOME/vscode", async () => {
      assertCompletions(await terminalCompletionService.resolveResources(resourceOptions, "~/vscode/", 9, provider, capabilities), [
        { label: "~/vscode/", detail: "/home/vscode/" },
        { label: "~/vscode/foo/", detail: "/home/vscode/foo/" },
        { label: "~/vscode/bar.txt", detail: "/home/vscode/bar.txt", kind: TerminalCompletionItemKind.File }
      ], { replacementRange: [0, 9] });
    });
  });
  suite("resolveResources edge cases and advanced scenarios", () => {
    setup(() => {
      validResources = [];
      childResources = [];
    });
    if (isWindows) {
      test("C:/Foo/| absolute paths on Windows", async () => {
        const resourceOptions = {
          cwd: URI.parse("file:///C:"),
          showDirectories: true,
          pathSeparator
        };
        validResources = [URI.parse("file:///C:/Foo")];
        childResources = [
          { resource: URI.parse("file:///C:/Foo/Bar"), isDirectory: true, isFile: false },
          { resource: URI.parse("file:///C:/Foo/Baz.txt"), isDirectory: false, isFile: true }
        ];
        const result = await terminalCompletionService.resolveResources(resourceOptions, "C:/Foo/", 7, provider, capabilities);
        assertCompletions(result, [
          { label: "C:/Foo/", detail: "C:/Foo/" },
          { label: "C:/Foo/Bar/", detail: "C:/Foo/Bar/" }
        ], { replacementRange: [0, 7] });
      });
      test("c:/foo/| case insensitivity on Windows", async () => {
        const resourceOptions = {
          cwd: URI.parse("file:///c:"),
          showDirectories: true,
          pathSeparator
        };
        validResources = [URI.parse("file:///c:/foo")];
        childResources = [
          { resource: URI.parse("file:///c:/foo/Bar"), isDirectory: true, isFile: false }
        ];
        const result = await terminalCompletionService.resolveResources(resourceOptions, "c:/foo/", 7, provider, capabilities);
        assertCompletions(result, [
          // Note that the detail is normalizes drive letters to capital case intentionally
          { label: "c:/foo/", detail: "C:/foo/" },
          { label: "c:/foo/Bar/", detail: "C:/foo/Bar/" }
        ], { replacementRange: [0, 7] });
      });
    } else {
      test("/foo/| absolute paths NOT on Windows", async () => {
        const resourceOptions = {
          cwd: URI.parse("file:///"),
          showDirectories: true,
          pathSeparator
        };
        validResources = [URI.parse("file:///foo")];
        childResources = [
          { resource: URI.parse("file:///foo/Bar"), isDirectory: true, isFile: false },
          { resource: URI.parse("file:///foo/Baz.txt"), isDirectory: false, isFile: true }
        ];
        const result = await terminalCompletionService.resolveResources(resourceOptions, "/foo/", 5, provider, capabilities);
        assertCompletions(result, [
          { label: "/foo/", detail: "/foo/" },
          { label: "/foo/Bar/", detail: "/foo/Bar/" }
        ], { replacementRange: [0, 5] });
      });
    }
    if (isWindows) {
      test(".\\folder | Case insensitivity should resolve correctly on Windows", async () => {
        const resourceOptions = {
          cwd: URI.parse("file:///C:/test"),
          showDirectories: true,
          pathSeparator: "\\"
        };
        validResources = [URI.parse("file:///C:/test")];
        childResources = [
          { resource: URI.parse("file:///C:/test/FolderA/"), isDirectory: true },
          { resource: URI.parse("file:///C:/test/anotherFolder/"), isDirectory: true }
        ];
        const result = await terminalCompletionService.resolveResources(resourceOptions, ".\\folder", 8, provider, capabilities);
        assertCompletions(result, [
          { label: ".\\", detail: "C:\\test\\" },
          { label: ".\\FolderA\\", detail: "C:\\test\\FolderA\\" },
          { label: ".\\anotherFolder\\", detail: "C:\\test\\anotherFolder\\" },
          { label: ".\\..\\", detail: "C:\\" }
        ], { replacementRange: [0, 8] });
      });
    } else {
      test("./folder | Case sensitivity should resolve correctly on Mac/Unix", async () => {
        const resourceOptions = {
          cwd: URI.parse("file:///test"),
          showDirectories: true,
          pathSeparator: "/"
        };
        validResources = [URI.parse("file:///test")];
        childResources = [
          { resource: URI.parse("file:///test/FolderA/"), isDirectory: true },
          { resource: URI.parse("file:///test/foldera/"), isDirectory: true }
        ];
        const result = await terminalCompletionService.resolveResources(resourceOptions, "./folder", 8, provider, capabilities);
        assertCompletions(result, [
          { label: "./", detail: "/test/" },
          { label: "./FolderA/", detail: "/test/FolderA/" },
          { label: "./foldera/", detail: "/test/foldera/" },
          { label: "./../", detail: "/" }
        ], { replacementRange: [0, 8] });
      });
    }
    test("| Empty input should resolve to current directory", async () => {
      const resourceOptions = {
        cwd: URI.parse("file:///test"),
        showDirectories: true,
        pathSeparator
      };
      validResources = [URI.parse("file:///test")];
      childResources = [
        { resource: URI.parse("file:///test/folder1/"), isDirectory: true },
        { resource: URI.parse("file:///test/folder2/"), isDirectory: true }
      ];
      const result = await terminalCompletionService.resolveResources(resourceOptions, "", 0, provider, capabilities);
      assertCompletions(result, [
        { label: ".", detail: "/test/" },
        { label: "./folder1/", detail: "/test/folder1/" },
        { label: "./folder2/", detail: "/test/folder2/" },
        { label: "../", detail: "/" },
        standardTildeItem
      ], { replacementRange: [0, 0] });
    });
    test("should ignore environment variable setting prefixes", async () => {
      const resourceOptions = {
        cwd: URI.parse("file:///test"),
        showDirectories: true,
        pathSeparator
      };
      validResources = [URI.parse("file:///test")];
      childResources = [
        { resource: URI.parse("file:///test/folder1/"), isDirectory: true },
        { resource: URI.parse("file:///test/folder2/"), isDirectory: true }
      ];
      const result = await terminalCompletionService.resolveResources(resourceOptions, "FOO=./", 2, provider, capabilities);
      assertCompletions(result, [
        { label: ".", detail: "/test/" },
        { label: "./folder1/", detail: "/test/folder1/" },
        { label: "./folder2/", detail: "/test/folder2/" },
        { label: "../", detail: "/" },
        standardTildeItem
      ], { replacementRange: [0, 2] });
    });
    test("should not return completions when relative folder prefix does not exist", async () => {
      const resourceOptions = {
        cwd: URI.parse("file:///test"),
        showDirectories: true,
        pathSeparator
      };
      validResources = [URI.parse("file:///test")];
      childResources = [
        { resource: URI.parse("file:///test/src/"), isDirectory: true },
        { resource: URI.parse("file:///test/vs/"), isDirectory: true }
      ];
      const result = await terminalCompletionService.resolveResources(resourceOptions, "s/", 2, provider, capabilities);
      assert.strictEqual(result, void 0);
    });
    test("./| should handle large directories with many results gracefully", async () => {
      const resourceOptions = {
        cwd: URI.parse("file:///test"),
        showDirectories: true,
        pathSeparator
      };
      validResources = [URI.parse("file:///test")];
      childResources = Array.from({ length: 1e3 }, (_, i) => ({
        resource: URI.parse(`file:///test/folder${i}/`),
        isDirectory: true
      }));
      const result = await terminalCompletionService.resolveResources(resourceOptions, "./", 2, provider, capabilities);
      assert(result);
      assert.strictEqual(result?.length, 1002);
      assert.strictEqual(result[0].label, `.${pathSeparator}`);
      assert.strictEqual(result.at(-1)?.label, `.${pathSeparator}..${pathSeparator}`);
    });
    test("./folder| should include current folder with trailing / is missing", async () => {
      const resourceOptions = {
        cwd: URI.parse("file:///test"),
        showDirectories: true,
        pathSeparator
      };
      validResources = [URI.parse("file:///test")];
      childResources = [
        { resource: URI.parse("file:///test/folder1/"), isDirectory: true },
        { resource: URI.parse("file:///test/folder2/"), isDirectory: true }
      ];
      const result = await terminalCompletionService.resolveResources(resourceOptions, "./folder1", 10, provider, capabilities);
      assertCompletions(result, [
        { label: "./", detail: "/test/" },
        { label: "./folder1/", detail: "/test/folder1/" },
        { label: "./folder2/", detail: "/test/folder2/" },
        { label: "./../", detail: "/" }
      ], { replacementRange: [1, 10] });
    });
    test("should resolve nested folder when name matches cwd basename", async () => {
      const resourceOptions = {
        cwd: URI.parse("file:///test"),
        showDirectories: true,
        pathSeparator
      };
      validResources = [
        URI.parse("file:///test"),
        URI.parse("file:///test/test")
      ];
      childResources = [
        { resource: URI.parse("file:///test/test/"), isDirectory: true },
        { resource: URI.parse("file:///test/test/inner/"), isDirectory: true }
      ];
      const result = await terminalCompletionService.resolveResources(resourceOptions, "test/", 5, provider, capabilities);
      assertCompletions(result, [
        { label: "./test/", detail: "/test/test/" },
        { label: "./test/inner/", detail: "/test/test/inner/" },
        // ../` from the viewed folder (/test/test/) goes to /test/, not /
        { label: "./test/../", detail: "/test/" }
      ], { replacementRange: [0, 5] });
    });
    test("test/| should normalize current and parent folders", async () => {
      const resourceOptions = {
        cwd: URI.parse("file:///test"),
        showDirectories: true,
        pathSeparator
      };
      validResources = [
        URI.parse("file:///test"),
        URI.parse("file:///test/folder1"),
        URI.parse("file:///test/folder2")
      ];
      childResources = [
        { resource: URI.parse("file:///test/folder1/"), isDirectory: true },
        { resource: URI.parse("file:///test/folder2/"), isDirectory: true }
      ];
      const result = await terminalCompletionService.resolveResources(resourceOptions, "./test/", 7, provider, capabilities);
      assertCompletions(result, [
        { label: "./test/", detail: "/test/" },
        { label: "./test/folder1/", detail: "/test/folder1/" },
        { label: "./test/folder2/", detail: "/test/folder2/" },
        { label: "./test/../", detail: "/" }
      ], { replacementRange: [0, 7] });
    });
  });
  suite("cdpath", () => {
    let shellEnvDetection;
    setup(() => {
      validResources = [
        URI.parse("file:///test"),
        URI.parse("file:///cdpath_value")
      ];
      childResources = [
        { resource: URI.parse("file:///cdpath_value/folder1/"), isDirectory: true },
        { resource: URI.parse("file:///cdpath_value/file1.txt"), isFile: true }
      ];
      shellEnvDetection = store.add(new ShellEnvDetectionCapability());
      shellEnvDetection.setEnvironment({ CDPATH: "/cdpath_value" }, true);
      capabilities.add(TerminalCapability.ShellEnvDetection, shellEnvDetection);
    });
    test("cd | should show paths from $CDPATH (relative)", async () => {
      configurationService.setUserConfiguration("terminal.integrated.suggest.cdPath", "relative");
      const resourceOptions = {
        cwd: URI.parse("file:///test"),
        showDirectories: true,
        showFiles: true,
        pathSeparator
      };
      const result = await terminalCompletionService.resolveResources(resourceOptions, "cd ", 3, provider, capabilities);
      assertPartialCompletionsExist(result, [
        { label: "folder1", detail: "CDPATH /cdpath_value/folder1/" }
      ], { replacementRange: [3, 3] });
    });
    test("cd | should show paths from $CDPATH (absolute)", async () => {
      configurationService.setUserConfiguration("terminal.integrated.suggest.cdPath", "absolute");
      const resourceOptions = {
        cwd: URI.parse("file:///test"),
        showDirectories: true,
        showFiles: true,
        pathSeparator
      };
      const result = await terminalCompletionService.resolveResources(resourceOptions, "cd ", 3, provider, capabilities);
      assertPartialCompletionsExist(result, [
        { label: "/cdpath_value/folder1/", detail: "CDPATH" }
      ], { replacementRange: [3, 3] });
    });
    test("cd | should support pulling from multiple paths in $CDPATH", async () => {
      configurationService.setUserConfiguration("terminal.integrated.suggest.cdPath", "relative");
      const pathPrefix = isWindows ? "c:\\" : "/";
      const delimeter = isWindows ? ";" : ":";
      const separator = isWindows ? "\\" : "/";
      shellEnvDetection.setEnvironment({ CDPATH: `${pathPrefix}cdpath1_value${delimeter}${pathPrefix}cdpath2_value${separator}inner_dir` }, true);
      const uriPathPrefix = isWindows ? "file:///c:/" : "file:///";
      validResources = [
        URI.parse(`${uriPathPrefix}test`),
        URI.parse(`${uriPathPrefix}cdpath1_value`),
        URI.parse(`${uriPathPrefix}cdpath2_value`),
        URI.parse(`${uriPathPrefix}cdpath2_value/inner_dir`)
      ];
      childResources = [
        { resource: URI.parse(`${uriPathPrefix}cdpath1_value/folder1/`), isDirectory: true },
        { resource: URI.parse(`${uriPathPrefix}cdpath1_value/folder2/`), isDirectory: true },
        { resource: URI.parse(`${uriPathPrefix}cdpath1_value/file1.txt`), isFile: true },
        { resource: URI.parse(`${uriPathPrefix}cdpath2_value/inner_dir/folder1/`), isDirectory: true },
        { resource: URI.parse(`${uriPathPrefix}cdpath2_value/inner_dir/folder2/`), isDirectory: true },
        { resource: URI.parse(`${uriPathPrefix}cdpath2_value/inner_dir/file1.txt`), isFile: true }
      ];
      const resourceOptions = {
        cwd: URI.parse(`${uriPathPrefix}test`),
        showDirectories: true,
        showFiles: true,
        pathSeparator
      };
      const result = await terminalCompletionService.resolveResources(resourceOptions, "cd ", 3, provider, capabilities);
      const finalPrefix = isWindows ? "C:\\" : "/";
      assertPartialCompletionsExist(result, [
        { label: "folder1", detail: `CDPATH ${finalPrefix}cdpath1_value/folder1/` },
        { label: "folder2", detail: `CDPATH ${finalPrefix}cdpath1_value/folder2/` },
        { label: "folder1", detail: `CDPATH ${finalPrefix}cdpath2_value/inner_dir/folder1/` },
        { label: "folder2", detail: `CDPATH ${finalPrefix}cdpath2_value/inner_dir/folder2/` }
      ], { replacementRange: [3, 3] });
    });
  });
  if (isWindows) {
    suite("gitbash", () => {
      test("should convert Git Bash absolute path to Windows absolute path", () => {
        assert.strictEqual(gitBashToWindowsPath("/"), "C:\\");
        assert.strictEqual(gitBashToWindowsPath("/c/"), "C:\\");
        assert.strictEqual(gitBashToWindowsPath("/c/Users/foo"), "C:\\Users\\foo");
        assert.strictEqual(gitBashToWindowsPath("/d/bar"), "D:\\bar");
      });
      test("should convert Windows absolute path to Git Bash absolute path", () => {
        assert.strictEqual(windowsToGitBashPath("C:\\"), "/c/");
        assert.strictEqual(windowsToGitBashPath("C:\\Users\\foo"), "/c/Users/foo");
        assert.strictEqual(windowsToGitBashPath("D:\\bar"), "/d/bar");
        assert.strictEqual(windowsToGitBashPath("E:\\some\\path"), "/e/some/path");
      });
      test("resolveResources with c:/ style absolute path for Git Bash", async () => {
        const resourceOptions = {
          cwd: URI.file("C:\\Users\\foo"),
          showDirectories: true,
          showFiles: true,
          pathSeparator: "/"
        };
        validResources = [
          URI.file("C:\\Users\\foo"),
          URI.file("C:\\Users\\foo\\bar"),
          URI.file("C:\\Users\\foo\\baz.txt")
        ];
        childResources = [
          { resource: URI.file("C:\\Users\\foo\\bar"), isDirectory: true, isFile: false },
          { resource: URI.file("C:\\Users\\foo\\baz.txt"), isFile: true, executable: true }
        ];
        const result = await terminalCompletionService.resolveResources(resourceOptions, "C:/Users/foo/", 13, provider, capabilities, WindowsShellType.GitBash);
        assertCompletions(result, [
          { label: "C:/Users/foo/", detail: "C:\\Users\\foo\\" },
          { label: "C:/Users/foo/bar/", detail: "C:\\Users\\foo\\bar\\" },
          { label: "C:/Users/foo/baz.txt", detail: "C:\\Users\\foo\\baz.txt", kind: TerminalCompletionItemKind.File }
        ], { replacementRange: [0, 13] }, "/");
      });
      test("resolveResources with cwd as Windows path (relative)", async () => {
        const resourceOptions = {
          cwd: URI.file("C:\\Users\\foo"),
          showDirectories: true,
          showFiles: true,
          pathSeparator: "/"
        };
        validResources = [
          URI.file("C:\\Users\\foo"),
          URI.file("C:\\Users\\foo\\bar"),
          URI.file("C:\\Users\\foo\\baz.txt")
        ];
        childResources = [
          { resource: URI.file("C:\\Users\\foo\\bar"), isDirectory: true },
          { resource: URI.file("C:\\Users\\foo\\baz.txt"), isFile: true, executable: true }
        ];
        const result = await terminalCompletionService.resolveResources(resourceOptions, "./", 2, provider, capabilities, WindowsShellType.GitBash);
        assertCompletions(result, [
          { label: "./", detail: "C:\\Users\\foo\\" },
          { label: "./bar/", detail: "C:\\Users\\foo\\bar\\" },
          { label: "./baz.txt", detail: "C:\\Users\\foo\\baz.txt", kind: TerminalCompletionItemKind.File },
          { label: "./../", detail: "C:\\Users\\" }
        ], { replacementRange: [0, 2] }, "/");
      });
      test("resolveResources with cwd as Windows path (absolute)", async () => {
        const resourceOptions = {
          cwd: URI.file("C:\\Users\\foo"),
          showDirectories: true,
          showFiles: true,
          pathSeparator: "/"
        };
        validResources = [
          URI.file("C:\\Users\\foo"),
          URI.file("C:\\Users\\foo\\bar"),
          URI.file("C:\\Users\\foo\\baz.txt")
        ];
        childResources = [
          { resource: URI.file("C:\\Users\\foo\\bar"), isDirectory: true },
          { resource: URI.file("C:\\Users\\foo\\baz.txt"), isFile: true, executable: true }
        ];
        const result = await terminalCompletionService.resolveResources(resourceOptions, "/c/Users/foo/", 13, provider, capabilities, WindowsShellType.GitBash);
        assertCompletions(result, [
          { label: "/c/Users/foo/", detail: "C:\\Users\\foo\\" },
          { label: "/c/Users/foo/bar/", detail: "C:\\Users\\foo\\bar\\" },
          { label: "/c/Users/foo/baz.txt", detail: "C:\\Users\\foo\\baz.txt", kind: TerminalCompletionItemKind.File }
        ], { replacementRange: [0, 13] }, "/");
      });
    });
  }
  if (!isWindows) {
    suite("symlink support", () => {
      test("should include symlink target information in completions", async () => {
        const resourceOptions = {
          cwd: URI.parse("file:///test"),
          pathSeparator,
          showFiles: true,
          showDirectories: true
        };
        validResources = [URI.parse("file:///test")];
        childResources = [
          { resource: URI.parse("file:///test/regular-file.txt"), isFile: true },
          { resource: URI.parse("file:///test/symlink-file"), isFile: true, isSymbolicLink: true },
          { resource: URI.parse("file:///test/symlink-folder"), isDirectory: true, isSymbolicLink: true },
          { resource: URI.parse("file:///test/regular-folder"), isDirectory: true }
        ];
        const result = await terminalCompletionService.resolveResources(resourceOptions, "ls ", 3, provider, capabilities);
        const symlinkFileCompletion = result?.find((c) => c.label === "./symlink-file");
        const symlinkFolderCompletion = result?.find((c) => c.label === "./symlink-folder/");
        assert.strictEqual(symlinkFileCompletion?.detail, "/test/symlink-file -> /target/actual-file.txt", "Symlink file detail should match target");
        assert.strictEqual(symlinkFolderCompletion?.detail, "/test/symlink-folder -> /target/actual-folder", "Symlink folder detail should match target");
      });
    });
  }
  if (!isWindows) {
    suite("remote file completion (e.g. WSL)", () => {
      const remoteAuthority = "wsl+Ubuntu";
      const remoteTestEnv = {
        HOME: "/home/remoteuser",
        USERPROFILE: "/home/remoteuser"
      };
      test("/absolute/path should preserve remote authority", async () => {
        terminalCompletionService.processEnv = remoteTestEnv;
        const resourceOptions = {
          cwd: URI.from({ scheme: "vscode-remote", authority: remoteAuthority, path: "/home/remoteuser" }),
          showDirectories: true,
          pathSeparator: "/"
        };
        validResources = [
          URI.from({ scheme: "vscode-remote", authority: remoteAuthority, path: "/home" }),
          URI.from({ scheme: "vscode-remote", authority: remoteAuthority, path: "/home/remoteuser" })
        ];
        childResources = [
          { resource: URI.from({ scheme: "vscode-remote", authority: remoteAuthority, path: "/home/remoteuser" }), isDirectory: true }
        ];
        const result = await terminalCompletionService.resolveResources(resourceOptions, "/home/", 6, provider, capabilities);
        assert.ok(result && result.length > 0, "Should return completions for remote absolute path");
        const absoluteCompletion = result?.find((c) => c.label === "/home/");
        assert.ok(absoluteCompletion, "Should have absolute path completion");
        assert.ok(absoluteCompletion.detail?.includes("/home/"), "Detail should show remote path");
      });
      test("~/ should preserve remote authority for tilde expansion", async () => {
        terminalCompletionService.processEnv = remoteTestEnv;
        const resourceOptions = {
          cwd: URI.from({ scheme: "vscode-remote", authority: remoteAuthority, path: "/home/remoteuser/project" }),
          showDirectories: true,
          pathSeparator: "/"
        };
        validResources = [
          URI.from({ scheme: "vscode-remote", authority: remoteAuthority, path: "/home/remoteuser" }),
          URI.from({ scheme: "vscode-remote", authority: remoteAuthority, path: "/home/remoteuser/project" })
        ];
        childResources = [
          { resource: URI.from({ scheme: "vscode-remote", authority: remoteAuthority, path: "/home/remoteuser/Documents" }), isDirectory: true },
          { resource: URI.from({ scheme: "vscode-remote", authority: remoteAuthority, path: "/home/remoteuser/project" }), isDirectory: true }
        ];
        const result = await terminalCompletionService.resolveResources(resourceOptions, "~/", 2, provider, capabilities);
        assert.ok(result && result.length > 0, "Should return completions for remote tilde path");
        const documentsCompletion = result?.find((c) => c.detail?.includes("Documents"));
        assert.ok(documentsCompletion, "Should find Documents folder from remote home");
      });
      test("./relative should preserve remote authority for relative paths", async () => {
        terminalCompletionService.processEnv = remoteTestEnv;
        const resourceOptions = {
          cwd: URI.from({ scheme: "vscode-remote", authority: remoteAuthority, path: "/home/remoteuser/project" }),
          showDirectories: true,
          pathSeparator: "/"
        };
        validResources = [
          URI.from({ scheme: "vscode-remote", authority: remoteAuthority, path: "/home/remoteuser/project" })
        ];
        childResources = [
          { resource: URI.from({ scheme: "vscode-remote", authority: remoteAuthority, path: "/home/remoteuser/project/src" }), isDirectory: true },
          { resource: URI.from({ scheme: "vscode-remote", authority: remoteAuthority, path: "/home/remoteuser/project/docs" }), isDirectory: true }
        ];
        const result = await terminalCompletionService.resolveResources(resourceOptions, "./", 2, provider, capabilities);
        assert.ok(result && result.length > 0, "Should return completions for remote relative path");
        const srcCompletion = result?.find((c) => c.detail?.includes("/home/remoteuser/project/src"));
        assert.ok(srcCompletion, "Should find src folder completion with remote path in detail");
      });
    });
  }
  suite("completion label escaping", () => {
    test("| should escape special characters in file/folder names for POSIX shells", async () => {
      const resourceOptions = {
        cwd: URI.parse("file:///test"),
        showDirectories: true,
        showFiles: true,
        pathSeparator
      };
      validResources = [URI.parse("file:///test")];
      childResources = [
        { resource: URI.parse("file:///test/[folder1]/"), isDirectory: true },
        { resource: URI.parse("file:///test/folder 2/"), isDirectory: true },
        { resource: URI.parse("file:///test/!special$chars&/"), isDirectory: true },
        { resource: URI.parse("file:///test/!special$chars2&"), isFile: true, executable: true }
      ];
      const result = await terminalCompletionService.resolveResources(resourceOptions, "", 0, provider, capabilities);
      assertCompletions(result, [
        { label: ".", detail: "/test/" },
        { label: "./[folder1]/", detail: "/test/[folder1]/" },
        { label: "./folder 2/", detail: "/test/folder 2/" },
        { label: "./!special$chars&/", detail: "/test/!special$chars&/" },
        { label: "./!special$chars2&", detail: "/test/!special$chars2&", kind: TerminalCompletionItemKind.File },
        { label: "../", detail: "/" },
        standardTildeItem
      ], { replacementRange: [0, 0] });
    });
  });
  suite("Provider Configuration", () => {
    class TestTerminalCompletionService extends TerminalCompletionService {
      getEnabledProviders(providers) {
        return super._getEnabledProviders(providers);
      }
    }
    let testTerminalCompletionService;
    setup(() => {
      testTerminalCompletionService = store.add(instantiationService.createInstance(TestTerminalCompletionService));
    });
    function createMockProvider(id) {
      return {
        id,
        provideCompletions: async () => [{
          label: `completion-from-${id}`,
          kind: TerminalCompletionItemKind.Method,
          replacementRange: [0, 0],
          provider: id
        }]
      };
    }
    test("should enable providers by default when no configuration exists", () => {
      const defaultProvider = createMockProvider("terminal-suggest");
      const newProvider = createMockProvider("new-extension-provider");
      const providers = [defaultProvider, newProvider];
      configurationService.setUserConfiguration(TerminalSuggestSettingId.Providers, {});
      const result = testTerminalCompletionService.getEnabledProviders(providers);
      assert.strictEqual(result.length, 2, "Should enable both providers by default");
      assert.ok(result.includes(defaultProvider), "Should include default provider");
      assert.ok(result.includes(newProvider), "Should include new provider");
    });
    test("should disable providers when explicitly set to false", () => {
      const provider1 = createMockProvider("provider1");
      const provider2 = createMockProvider("provider2");
      const providers = [provider1, provider2];
      configurationService.setUserConfiguration(TerminalSuggestSettingId.Providers, {
        "provider1": false
      });
      const result = testTerminalCompletionService.getEnabledProviders(providers);
      assert.strictEqual(result.length, 1, "Should enable only one provider");
      assert.ok(result.includes(provider2), "Should include unconfigured provider");
      assert.ok(!result.includes(provider1), "Should not include disabled provider");
    });
    test("should enable providers when explicitly set to true", () => {
      const provider1 = createMockProvider("provider1");
      const provider2 = createMockProvider("provider2");
      const providers = [provider1, provider2];
      configurationService.setUserConfiguration(TerminalSuggestSettingId.Providers, {
        "provider1": true
      });
      const result = testTerminalCompletionService.getEnabledProviders(providers);
      assert.strictEqual(result.length, 2, "Should enable both providers");
      assert.ok(result.includes(provider1), "Should include explicitly enabled provider");
      assert.ok(result.includes(provider2), "Should include unconfigured provider");
    });
    test("should handle mixed configuration correctly", () => {
      const provider1 = createMockProvider("provider1");
      const provider2 = createMockProvider("provider2");
      const provider3 = createMockProvider("provider3");
      const providers = [provider1, provider2, provider3];
      configurationService.setUserConfiguration(TerminalSuggestSettingId.Providers, {
        "provider1": true,
        "provider2": false
      });
      const result = testTerminalCompletionService.getEnabledProviders(providers);
      assert.strictEqual(result.length, 2, "Should enable two providers");
      assert.ok(result.includes(provider1), "Should include explicitly enabled provider");
      assert.ok(result.includes(provider3), "Should include unconfigured provider");
      assert.ok(!result.includes(provider2), "Should not include disabled provider");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9zdWdnZXN0L3Rlc3QvYnJvd3Nlci90ZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlLCBJRmlsZVN0YXRXaXRoTWV0YWRhdGEsIElSZXNvbHZlTWV0YWRhdGFGaWxlT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlLCBUZXJtaW5hbENvbXBsZXRpb25SZXNvdXJjZU9wdGlvbnMsIHR5cGUgSVRlcm1pbmFsQ29tcGxldGlvblByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90ZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IGFzc2VydCwgeyBmYWlsIH0gZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGlzV2luZG93cywgdHlwZSBJUHJvY2Vzc0Vudmlyb25tZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgY3JlYXRlRmlsZVN0YXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENhcGFiaWxpdHlTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvdGVybWluYWxDYXBhYmlsaXR5U3RvcmUuanMnO1xuaW1wb3J0IHsgU2hlbGxFbnZEZXRlY3Rpb25DYXBhYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy9zaGVsbEVudkRldGVjdGlvbkNhcGFiaWxpdHkuanMnO1xuaW1wb3J0IHsgVGVybWluYWxDYXBhYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy9jYXBhYmlsaXRpZXMuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsQ29tcGxldGlvbiwgVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQgfSBmcm9tICcuLi8uLi9icm93c2VyL3Rlcm1pbmFsQ29tcGxldGlvbkl0ZW0uanMnO1xuaW1wb3J0IHsgY291bnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbExvZ1NlcnZpY2UsIFdpbmRvd3NTaGVsbFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgZ2l0QmFzaFRvV2luZG93c1BhdGgsIHdpbmRvd3NUb0dpdEJhc2hQYXRoIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90ZXJtaW5hbEdpdEJhc2hIZWxwZXJzLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgVGVybWluYWxTdWdnZXN0U2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rlcm1pbmFsU3VnZ2VzdENvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdFBhdGhTZXJ2aWNlLCB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuXG5jb25zdCBwYXRoU2VwYXJhdG9yID0gaXNXaW5kb3dzID8gJ1xcXFwnIDogJy8nO1xuXG5pbnRlcmZhY2UgSUFzc2VydGlvblRlcm1pbmFsQ29tcGxldGlvbiB7XG5cdGxhYmVsOiBzdHJpbmc7XG5cdGRldGFpbD86IHN0cmluZztcblx0a2luZD86IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kO1xufVxuXG5pbnRlcmZhY2UgSUFzc2VydGlvbkNvbW1hbmRMaW5lQ29uZmlnIHtcblx0cmVwbGFjZW1lbnRSYW5nZTogW251bWJlciwgbnVtYmVyXTtcbn1cblxuLyoqXG4gKiBBc3NlcnQgdGhlIHNldCBvZiBjb21wbGV0aW9ucyBleGlzdCBleGFjdGx5LCBpbmNsdWRpbmcgdGhlaXIgb3JkZXIuXG4gKi9cbmZ1bmN0aW9uIGFzc2VydENvbXBsZXRpb25zKGFjdHVhbDogSVRlcm1pbmFsQ29tcGxldGlvbltdIHwgdW5kZWZpbmVkLCBleHBlY3RlZDogSUFzc2VydGlvblRlcm1pbmFsQ29tcGxldGlvbltdLCBleHBlY3RlZENvbmZpZzogSUFzc2VydGlvbkNvbW1hbmRMaW5lQ29uZmlnLCBwYXRoU2VwPzogc3RyaW5nKSB7XG5cdGNvbnN0IHNlcCA9IHBhdGhTZXAgPz8gcGF0aFNlcGFyYXRvcjtcblx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRhY3R1YWw/Lm1hcChlID0+ICh7XG5cdFx0XHRsYWJlbDogZS5sYWJlbCxcblx0XHRcdGRldGFpbDogZS5kZXRhaWwgPz8gJycsXG5cdFx0XHRraW5kOiBlLmtpbmQgPz8gVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuRm9sZGVyLFxuXHRcdFx0cmVwbGFjZW1lbnRSYW5nZTogZS5yZXBsYWNlbWVudFJhbmdlLFxuXHRcdH0pKSwgZXhwZWN0ZWQubWFwKGUgPT4gKHtcblx0XHRcdGxhYmVsOiBlLmxhYmVsLnJlcGxhY2VBbGwoJy8nLCBzZXApLFxuXHRcdFx0ZGV0YWlsOiBlLmRldGFpbCA/IGUuZGV0YWlsLnJlcGxhY2VBbGwoJy8nLCBzZXApIDogJycsXG5cdFx0XHRraW5kOiBlLmtpbmQgPz8gVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuRm9sZGVyLFxuXHRcdFx0cmVwbGFjZW1lbnRSYW5nZTogZXhwZWN0ZWRDb25maWcucmVwbGFjZW1lbnRSYW5nZSxcblx0XHR9KSlcblx0KTtcbn1cblxuLyoqXG4gKiBBc3NlcnQgYSBzZXQgb2YgY29tcGxldGlvbnMgZXhpc3Qgd2l0aGluIHRoZSBhY3R1YWwgc2V0LlxuICovXG5mdW5jdGlvbiBhc3NlcnRQYXJ0aWFsQ29tcGxldGlvbnNFeGlzdChhY3R1YWw6IElUZXJtaW5hbENvbXBsZXRpb25bXSB8IHVuZGVmaW5lZCwgZXhwZWN0ZWRQYXJ0aWFsOiBJQXNzZXJ0aW9uVGVybWluYWxDb21wbGV0aW9uW10sIGV4cGVjdGVkQ29uZmlnOiBJQXNzZXJ0aW9uQ29tbWFuZExpbmVDb25maWcpIHtcblx0aWYgKCFhY3R1YWwpIHtcblx0XHRmYWlsKCk7XG5cdH1cblx0Y29uc3QgZXhwZWN0ZWRNYXBwZWQgPSBleHBlY3RlZFBhcnRpYWwubWFwKGUgPT4gKHtcblx0XHRsYWJlbDogZS5sYWJlbC5yZXBsYWNlQWxsKCcvJywgcGF0aFNlcGFyYXRvciksXG5cdFx0ZGV0YWlsOiBlLmRldGFpbCA/IGUuZGV0YWlsLnJlcGxhY2VBbGwoJy8nLCBwYXRoU2VwYXJhdG9yKSA6ICcnLFxuXHRcdGtpbmQ6IGUua2luZCA/PyBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5Gb2xkZXIsXG5cdFx0cmVwbGFjZW1lbnRSYW5nZTogZXhwZWN0ZWRDb25maWcucmVwbGFjZW1lbnRSYW5nZSxcblx0fSkpO1xuXHRmb3IgKGNvbnN0IGV4cGVjdGVkSXRlbSBvZiBleHBlY3RlZE1hcHBlZCkge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLm1hcChlID0+ICh7XG5cdFx0XHRsYWJlbDogZS5sYWJlbCxcblx0XHRcdGRldGFpbDogZS5kZXRhaWwgPz8gJycsXG5cdFx0XHRraW5kOiBlLmtpbmQgPz8gVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuRm9sZGVyLFxuXHRcdFx0cmVwbGFjZW1lbnRSYW5nZTogZS5yZXBsYWNlbWVudFJhbmdlLFxuXHRcdH0pKS5maW5kKGUgPT4gZS5kZXRhaWwgPT09IGV4cGVjdGVkSXRlbS5kZXRhaWwpLCBleHBlY3RlZEl0ZW0pO1xuXHR9XG59XG5cbmNvbnN0IHRlc3RFbnY6IElQcm9jZXNzRW52aXJvbm1lbnQgPSB7XG5cdEhPTUU6ICcvaG9tZS91c2VyJyxcblx0VVNFUlBST0ZJTEU6ICcvaG9tZS91c2VyJ1xufTtcblxubGV0IGhvbWVEaXIgPSBpc1dpbmRvd3MgPyB0ZXN0RW52WydVU0VSUFJPRklMRSddIDogdGVzdEVudlsnSE9NRSddO1xuaWYgKCFob21lRGlyIS5lbmRzV2l0aCgnLycpKSB7XG5cdGhvbWVEaXIgKz0gJy8nO1xufVxuY29uc3Qgc3RhbmRhcmRUaWxkZUl0ZW0gPSBPYmplY3QuZnJlZXplKHsgbGFiZWw6ICd+JywgZGV0YWlsOiBob21lRGlyIH0pO1xuXG5zdWl0ZSgnVGVybWluYWxDb21wbGV0aW9uU2VydmljZScsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdGxldCBjb25maWd1cmF0aW9uU2VydmljZTogVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRsZXQgY2FwYWJpbGl0aWVzOiBUZXJtaW5hbENhcGFiaWxpdHlTdG9yZTtcblx0bGV0IHZhbGlkUmVzb3VyY2VzOiBVUklbXTtcblx0bGV0IGNoaWxkUmVzb3VyY2VzOiB7IHJlc291cmNlOiBVUkk7IGlzRmlsZT86IGJvb2xlYW47IGlzRGlyZWN0b3J5PzogYm9vbGVhbjsgaXNTeW1ib2xpY0xpbms/OiBib29sZWFuOyBleGVjdXRhYmxlPzogYm9vbGVhbiB9W107XG5cdGxldCB0ZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlOiBUZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlO1xuXHRjb25zdCBwcm92aWRlciA9ICd0ZXN0UHJvdmlkZXInO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHtcblx0XHRcdHBhdGhTZXJ2aWNlOiAoKSA9PiBuZXcgVGVzdFBhdGhTZXJ2aWNlKFVSSS5maWxlKGhvbWVEaXIgPz8gJy8nKSksXG5cdFx0fSwgc3RvcmUpO1xuXHRcdGNvbnN0IG5vcm1hbGl6ZVBhdGggPSAocGF0aDogc3RyaW5nKSA9PiBwYXRoID09PSAnLycgPyBwYXRoIDogcGF0aC5yZXBsYWNlKC9cXC8rJC8sICcnKTtcblx0XHRjb25zdCBkb2VzUmVzb3VyY2VFeGlzdCA9IChyZXNvdXJjZTogVVJJKSA9PiB2YWxpZFJlc291cmNlcy5zb21lKGUgPT4gbm9ybWFsaXplUGF0aChlLnBhdGgpID09PSBub3JtYWxpemVQYXRoKHJlc291cmNlLnBhdGgpKSB8fCBjaGlsZFJlc291cmNlcy5zb21lKGUgPT4gbm9ybWFsaXplUGF0aChlLnJlc291cmNlLnBhdGgpID09PSBub3JtYWxpemVQYXRoKHJlc291cmNlLnBhdGgpKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZXJtaW5hbExvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUZpbGVTZXJ2aWNlLCB7XG5cdFx0XHRhc3luYyBzdGF0KHJlc291cmNlKSB7XG5cdFx0XHRcdGlmICghZG9lc1Jlc291cmNlRXhpc3QocmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdEb2VzblxcJ3QgZXhpc3QnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gY3JlYXRlRmlsZVN0YXQocmVzb3VyY2UpO1xuXHRcdFx0fSxcblx0XHRcdGFzeW5jIHJlc29sdmUocmVzb3VyY2U6IFVSSSwgb3B0aW9uczogSVJlc29sdmVNZXRhZGF0YUZpbGVPcHRpb25zKTogUHJvbWlzZTxJRmlsZVN0YXRXaXRoTWV0YWRhdGE+IHtcblx0XHRcdFx0aWYgKCFkb2VzUmVzb3VyY2VFeGlzdChyZXNvdXJjZSkpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0RvZXNuXFwndCBleGlzdCcpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGNoaWxkcmVuID0gY2hpbGRSZXNvdXJjZXMuZmlsdGVyKGNoaWxkID0+IHtcblx0XHRcdFx0XHRjb25zdCBjaGlsZEZzUGF0aCA9IGNoaWxkLnJlc291cmNlLnBhdGgucmVwbGFjZSgvXFwvJC8sICcnKTtcblx0XHRcdFx0XHRjb25zdCBwYXJlbnRGc1BhdGggPSByZXNvdXJjZS5wYXRoLnJlcGxhY2UoL1xcLyQvLCAnJyk7XG5cdFx0XHRcdFx0cmV0dXJuIChcblx0XHRcdFx0XHRcdGNoaWxkRnNQYXRoLnN0YXJ0c1dpdGgocGFyZW50RnNQYXRoKSAmJlxuXHRcdFx0XHRcdFx0Y291bnQoY2hpbGRGc1BhdGgsICcvJykgPT09IGNvdW50KHBhcmVudEZzUGF0aCwgJy8nKSArIDFcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0cmV0dXJuIGNyZWF0ZUZpbGVTdGF0KHJlc291cmNlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGNoaWxkcmVuKTtcblx0XHRcdH0sXG5cdFx0XHRhc3luYyByZWFscGF0aChyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+IHtcblx0XHRcdFx0aWYgKHJlc291cmNlLnBhdGguaW5jbHVkZXMoJ3N5bWxpbmstZmlsZScpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHJlc291cmNlLndpdGgoeyBwYXRoOiAnL3RhcmdldC9hY3R1YWwtZmlsZS50eHQnIH0pO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHJlc291cmNlLnBhdGguaW5jbHVkZXMoJ3N5bWxpbmstZm9sZGVyJykpIHtcblx0XHRcdFx0XHRyZXR1cm4gcmVzb3VyY2Uud2l0aCh7IHBhdGg6ICcvdGFyZ2V0L2FjdHVhbC1mb2xkZXInIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGVybWluYWxDb21wbGV0aW9uU2VydmljZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlKSk7XG5cdFx0dGVybWluYWxDb21wbGV0aW9uU2VydmljZS5wcm9jZXNzRW52ID0gdGVzdEVudjtcblx0XHR2YWxpZFJlc291cmNlcyA9IFtdO1xuXHRcdGNoaWxkUmVzb3VyY2VzID0gW107XG5cdFx0Y2FwYWJpbGl0aWVzID0gc3RvcmUuYWRkKG5ldyBUZXJtaW5hbENhcGFiaWxpdHlTdG9yZSgpKTtcblx0fSk7XG5cblx0c3VpdGUoJ3Jlc29sdmVSZXNvdXJjZXMgc2hvdWxkIHJldHVybiB1bmRlZmluZWQnLCAoKSA9PiB7XG5cdFx0dGVzdCgnaWYgbmVpdGhlciBzaG93RmlsZXMgbm9yIHNob3dEaXJlY3RvcmllcyBhcmUgdHJ1ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc291cmNlT3B0aW9uczogVGVybWluYWxDb21wbGV0aW9uUmVzb3VyY2VPcHRpb25zID0ge1xuXHRcdFx0XHRjd2Q6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0JyksXG5cdFx0XHRcdHBhdGhTZXBhcmF0b3Jcblx0XHRcdH07XG5cdFx0XHR2YWxpZFJlc291cmNlcyA9IFtVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdCcpXTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UucmVzb2x2ZVJlc291cmNlcyhyZXNvdXJjZU9wdGlvbnMsICdjZCAnLCAzLCBwcm92aWRlciwgY2FwYWJpbGl0aWVzKTtcblx0XHRcdGFzc2VydCghcmVzdWx0KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3Jlc29sdmVSZXNvdXJjZXMgc2hvdWxkIHJldHVybiBmb2xkZXIgY29tcGxldGlvbnMnLCAoKSA9PiB7XG5cdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0dmFsaWRSZXNvdXJjZXMgPSBbVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QnKV07XG5cdFx0XHRjaGlsZFJlc291cmNlcyA9IFtcblx0XHRcdFx0eyByZXNvdXJjZTogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QvZm9sZGVyMS8nKSwgaXNEaXJlY3Rvcnk6IHRydWUsIGlzRmlsZTogZmFsc2UgfSxcblx0XHRcdFx0eyByZXNvdXJjZTogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QvZmlsZTEudHh0JyksIGlzRGlyZWN0b3J5OiBmYWxzZSwgaXNGaWxlOiB0cnVlIH0sXG5cdFx0XHRdO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnfCBzaG91bGQgcmV0dXJuIHJvb3QtbGV2ZWwgY29tcGxldGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXNvdXJjZU9wdGlvbnM6IFRlcm1pbmFsQ29tcGxldGlvblJlc291cmNlT3B0aW9ucyA9IHtcblx0XHRcdFx0Y3dkOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdCcpLFxuXHRcdFx0XHRzaG93RGlyZWN0b3JpZXM6IHRydWUsXG5cdFx0XHRcdHBhdGhTZXBhcmF0b3Jcblx0XHRcdH07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0ZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlLnJlc29sdmVSZXNvdXJjZXMocmVzb3VyY2VPcHRpb25zLCAnJywgMSwgcHJvdmlkZXIsIGNhcGFiaWxpdGllcyk7XG5cblx0XHRcdGFzc2VydENvbXBsZXRpb25zKHJlc3VsdCwgW1xuXHRcdFx0XHR7IGxhYmVsOiAnLicsIGRldGFpbDogJy90ZXN0LycgfSxcblx0XHRcdFx0eyBsYWJlbDogJy4vZm9sZGVyMS8nLCBkZXRhaWw6ICcvdGVzdC9mb2xkZXIxLycgfSxcblx0XHRcdFx0eyBsYWJlbDogJy4uLycsIGRldGFpbDogJy8nIH0sXG5cdFx0XHRcdHN0YW5kYXJkVGlsZGVJdGVtLFxuXHRcdFx0XSwgeyByZXBsYWNlbWVudFJhbmdlOiBbMSwgMV0gfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCcuL3wgc2hvdWxkIHJldHVybiBmb2xkZXIgY29tcGxldGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXNvdXJjZU9wdGlvbnM6IFRlcm1pbmFsQ29tcGxldGlvblJlc291cmNlT3B0aW9ucyA9IHtcblx0XHRcdFx0Y3dkOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdCcpLFxuXHRcdFx0XHRzaG93RGlyZWN0b3JpZXM6IHRydWUsXG5cdFx0XHRcdHBhdGhTZXBhcmF0b3Jcblx0XHRcdH07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0ZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlLnJlc29sdmVSZXNvdXJjZXMocmVzb3VyY2VPcHRpb25zLCAnLi8nLCAzLCBwcm92aWRlciwgY2FwYWJpbGl0aWVzKTtcblxuXHRcdFx0YXNzZXJ0Q29tcGxldGlvbnMocmVzdWx0LCBbXG5cdFx0XHRcdHsgbGFiZWw6ICcuLycsIGRldGFpbDogJy90ZXN0LycgfSxcblx0XHRcdFx0eyBsYWJlbDogJy4vZm9sZGVyMS8nLCBkZXRhaWw6ICcvdGVzdC9mb2xkZXIxLycgfSxcblx0XHRcdFx0eyBsYWJlbDogJy4vLi4vJywgZGV0YWlsOiAnLycgfSxcblx0XHRcdF0sIHsgcmVwbGFjZW1lbnRSYW5nZTogWzEsIDNdIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnLi4vfCBzaG91bGQgcmV0dXJuIHBhcmVudCBmb2xkZXIgY29tcGxldGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBTY2VuYXJpbzogY3dkIGlzIC9wYXJlbnQvZm9sZGVyMSwgc2libGluZyBpcyAvcGFyZW50L2ZvbGRlcjJcblx0XHRcdC8vIFdoZW4gdHlwaW5nIC4uLywgc2hvdWxkIHNlZSBjb250ZW50cyBvZiAvcGFyZW50LyAoZm9sZGVyMSBhbmQgZm9sZGVyMilcblx0XHRcdHZhbGlkUmVzb3VyY2VzID0gW1xuXHRcdFx0XHRVUkkucGFyc2UoJ2ZpbGU6Ly8vcGFyZW50L2ZvbGRlcjEnKSxcblx0XHRcdFx0VVJJLnBhcnNlKCdmaWxlOi8vL3BhcmVudCcpLFxuXHRcdFx0XTtcblx0XHRcdGNoaWxkUmVzb3VyY2VzID0gW1xuXHRcdFx0XHR7IHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vcGFyZW50L2ZvbGRlcjEvJyksIGlzRGlyZWN0b3J5OiB0cnVlIH0sXG5cdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovLy9wYXJlbnQvZm9sZGVyMi8nKSwgaXNEaXJlY3Rvcnk6IHRydWUgfSxcblx0XHRcdF07XG5cdFx0XHRjb25zdCByZXNvdXJjZU9wdGlvbnM6IFRlcm1pbmFsQ29tcGxldGlvblJlc291cmNlT3B0aW9ucyA9IHtcblx0XHRcdFx0Y3dkOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vcGFyZW50L2ZvbGRlcjEnKSxcblx0XHRcdFx0c2hvd0RpcmVjdG9yaWVzOiB0cnVlLFxuXHRcdFx0XHRwYXRoU2VwYXJhdG9yXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGVybWluYWxDb21wbGV0aW9uU2VydmljZS5yZXNvbHZlUmVzb3VyY2VzKHJlc291cmNlT3B0aW9ucywgJy4uLycsIDMsIHByb3ZpZGVyLCBjYXBhYmlsaXRpZXMpO1xuXG5cdFx0XHRhc3NlcnRDb21wbGV0aW9ucyhyZXN1bHQsIFtcblx0XHRcdFx0eyBsYWJlbDogJy4uLycsIGRldGFpbDogJy9wYXJlbnQvJyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnLi4vZm9sZGVyMS8nLCBkZXRhaWw6ICcvcGFyZW50L2ZvbGRlcjEvJyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnLi4vZm9sZGVyMi8nLCBkZXRhaWw6ICcvcGFyZW50L2ZvbGRlcjIvJyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnLi4vLi4vJywgZGV0YWlsOiAnLycgfSxcblx0XHRcdF0sIHsgcmVwbGFjZW1lbnRSYW5nZTogWzAsIDNdIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2QgLi98IHNob3VsZCByZXR1cm4gZm9sZGVyIGNvbXBsZXRpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VPcHRpb25zOiBUZXJtaW5hbENvbXBsZXRpb25SZXNvdXJjZU9wdGlvbnMgPSB7XG5cdFx0XHRcdGN3ZDogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QnKSxcblx0XHRcdFx0c2hvd0RpcmVjdG9yaWVzOiB0cnVlLFxuXHRcdFx0XHRwYXRoU2VwYXJhdG9yXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGVybWluYWxDb21wbGV0aW9uU2VydmljZS5yZXNvbHZlUmVzb3VyY2VzKHJlc291cmNlT3B0aW9ucywgJ2NkIC4vJywgNSwgcHJvdmlkZXIsIGNhcGFiaWxpdGllcyk7XG5cblx0XHRcdGFzc2VydENvbXBsZXRpb25zKHJlc3VsdCwgW1xuXHRcdFx0XHR7IGxhYmVsOiAnLi8nLCBkZXRhaWw6ICcvdGVzdC8nIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICcuL2ZvbGRlcjEvJywgZGV0YWlsOiAnL3Rlc3QvZm9sZGVyMS8nIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICcuLy4uLycsIGRldGFpbDogJy8nIH0sXG5cdFx0XHRdLCB7IHJlcGxhY2VtZW50UmFuZ2U6IFszLCA1XSB9KTtcblx0XHR9KTtcblx0XHR0ZXN0KCdjZCAuL2Z8IHNob3VsZCByZXR1cm4gZm9sZGVyIGNvbXBsZXRpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VPcHRpb25zOiBUZXJtaW5hbENvbXBsZXRpb25SZXNvdXJjZU9wdGlvbnMgPSB7XG5cdFx0XHRcdGN3ZDogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QnKSxcblx0XHRcdFx0c2hvd0RpcmVjdG9yaWVzOiB0cnVlLFxuXHRcdFx0XHRwYXRoU2VwYXJhdG9yXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGVybWluYWxDb21wbGV0aW9uU2VydmljZS5yZXNvbHZlUmVzb3VyY2VzKHJlc291cmNlT3B0aW9ucywgJ2NkIC4vZicsIDYsIHByb3ZpZGVyLCBjYXBhYmlsaXRpZXMpO1xuXG5cdFx0XHRhc3NlcnRDb21wbGV0aW9ucyhyZXN1bHQsIFtcblx0XHRcdFx0eyBsYWJlbDogJy4vJywgZGV0YWlsOiAnL3Rlc3QvJyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnLi9mb2xkZXIxLycsIGRldGFpbDogJy90ZXN0L2ZvbGRlcjEvJyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnLi8uLi8nLCBkZXRhaWw6ICcvJyB9LFxuXHRcdFx0XSwgeyByZXBsYWNlbWVudFJhbmdlOiBbMywgNl0gfSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdyZXNvbHZlUmVzb3VyY2VzIHNob3VsZCBoYW5kbGUgZmlsZSBhbmQgZm9sZGVyIGNvbXBsZXRpb24gcmVxdWVzdHMgY29ycmVjdGx5JywgKCkgPT4ge1xuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdHZhbGlkUmVzb3VyY2VzID0gW1VSSS5wYXJzZSgnZmlsZTovLy90ZXN0JyldO1xuXHRcdFx0Y2hpbGRSZXNvdXJjZXMgPSBbXG5cdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0Ly5oaWRkZW5GaWxlJyksIGlzRmlsZTogdHJ1ZSwgZXhlY3V0YWJsZTogdHJ1ZSB9LFxuXHRcdFx0XHR7IHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC8uaGlkZGVuRm9sZGVyLycpLCBpc0RpcmVjdG9yeTogdHJ1ZSB9LFxuXHRcdFx0XHR7IHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC9mb2xkZXIxLycpLCBpc0RpcmVjdG9yeTogdHJ1ZSB9LFxuXHRcdFx0XHR7IHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC9maWxlMS50eHQnKSwgaXNGaWxlOiB0cnVlLCBleGVjdXRhYmxlOiB0cnVlIH0sXG5cdFx0XHRdO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnLi98IHNob3VsZCBoYW5kbGUgaGlkZGVuIGZpbGVzIGFuZCBmb2xkZXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VPcHRpb25zOiBUZXJtaW5hbENvbXBsZXRpb25SZXNvdXJjZU9wdGlvbnMgPSB7XG5cdFx0XHRcdGN3ZDogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QnKSxcblx0XHRcdFx0c2hvd0RpcmVjdG9yaWVzOiB0cnVlLFxuXHRcdFx0XHRzaG93RmlsZXM6IHRydWUsXG5cdFx0XHRcdHBhdGhTZXBhcmF0b3Jcblx0XHRcdH07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0ZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlLnJlc29sdmVSZXNvdXJjZXMocmVzb3VyY2VPcHRpb25zLCAnLi8nLCAyLCBwcm92aWRlciwgY2FwYWJpbGl0aWVzKTtcblxuXHRcdFx0YXNzZXJ0Q29tcGxldGlvbnMocmVzdWx0LCBbXG5cdFx0XHRcdHsgbGFiZWw6ICcuLycsIGRldGFpbDogJy90ZXN0LycgfSxcblx0XHRcdFx0eyBsYWJlbDogJy4vLmhpZGRlbkZpbGUnLCBkZXRhaWw6ICcvdGVzdC8uaGlkZGVuRmlsZScsIGtpbmQ6IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkZpbGUgfSxcblx0XHRcdFx0eyBsYWJlbDogJy4vLmhpZGRlbkZvbGRlci8nLCBkZXRhaWw6ICcvdGVzdC8uaGlkZGVuRm9sZGVyLycgfSxcblx0XHRcdFx0eyBsYWJlbDogJy4vZm9sZGVyMS8nLCBkZXRhaWw6ICcvdGVzdC9mb2xkZXIxLycgfSxcblx0XHRcdFx0eyBsYWJlbDogJy4vZmlsZTEudHh0JywgZGV0YWlsOiAnL3Rlc3QvZmlsZTEudHh0Jywga2luZDogVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuRmlsZSB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnLi8uLi8nLCBkZXRhaWw6ICcvJyB9LFxuXHRcdFx0XSwgeyByZXBsYWNlbWVudFJhbmdlOiBbMCwgMl0gfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCcuL2h8IHNob3VsZCBoYW5kbGUgaGlkZGVuIGZpbGVzIGFuZCBmb2xkZXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VPcHRpb25zOiBUZXJtaW5hbENvbXBsZXRpb25SZXNvdXJjZU9wdGlvbnMgPSB7XG5cdFx0XHRcdGN3ZDogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QnKSxcblx0XHRcdFx0c2hvd0RpcmVjdG9yaWVzOiB0cnVlLFxuXHRcdFx0XHRzaG93RmlsZXM6IHRydWUsXG5cdFx0XHRcdHBhdGhTZXBhcmF0b3Jcblx0XHRcdH07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0ZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlLnJlc29sdmVSZXNvdXJjZXMocmVzb3VyY2VPcHRpb25zLCAnLi9oJywgMywgcHJvdmlkZXIsIGNhcGFiaWxpdGllcyk7XG5cblx0XHRcdGFzc2VydENvbXBsZXRpb25zKHJlc3VsdCwgW1xuXHRcdFx0XHR7IGxhYmVsOiAnLi8nLCBkZXRhaWw6ICcvdGVzdC8nIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICcuLy5oaWRkZW5GaWxlJywgZGV0YWlsOiAnL3Rlc3QvLmhpZGRlbkZpbGUnLCBraW5kOiBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5GaWxlIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICcuLy5oaWRkZW5Gb2xkZXIvJywgZGV0YWlsOiAnL3Rlc3QvLmhpZGRlbkZvbGRlci8nIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICcuL2ZvbGRlcjEvJywgZGV0YWlsOiAnL3Rlc3QvZm9sZGVyMS8nIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICcuL2ZpbGUxLnR4dCcsIGRldGFpbDogJy90ZXN0L2ZpbGUxLnR4dCcsIGtpbmQ6IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkZpbGUgfSxcblx0XHRcdFx0eyBsYWJlbDogJy4vLi4vJywgZGV0YWlsOiAnLycgfSxcblx0XHRcdF0sIHsgcmVwbGFjZW1lbnRSYW5nZTogWzAsIDNdIH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnfiAtPiAkSE9NRScsICgpID0+IHtcblx0XHRsZXQgcmVzb3VyY2VPcHRpb25zOiBUZXJtaW5hbENvbXBsZXRpb25SZXNvdXJjZU9wdGlvbnM7XG5cdFx0bGV0IHNoZWxsRW52RGV0ZWN0aW9uOiBTaGVsbEVudkRldGVjdGlvbkNhcGFiaWxpdHk7XG5cblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRzaGVsbEVudkRldGVjdGlvbiA9IHN0b3JlLmFkZChuZXcgU2hlbGxFbnZEZXRlY3Rpb25DYXBhYmlsaXR5KCkpO1xuXHRcdFx0c2hlbGxFbnZEZXRlY3Rpb24uc2V0RW52aXJvbm1lbnQoe1xuXHRcdFx0XHRIT01FOiAnL2hvbWUnLFxuXHRcdFx0XHRVU0VSUFJPRklMRTogJy9ob21lJ1xuXHRcdFx0fSwgdHJ1ZSk7XG5cdFx0XHRjYXBhYmlsaXRpZXMuYWRkKFRlcm1pbmFsQ2FwYWJpbGl0eS5TaGVsbEVudkRldGVjdGlvbiwgc2hlbGxFbnZEZXRlY3Rpb24pO1xuXG5cdFx0XHRyZXNvdXJjZU9wdGlvbnMgPSB7XG5cdFx0XHRcdGN3ZDogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QvZm9sZGVyMScpLC8vIFVwZGF0ZWQgdG8gcmVmbGVjdCBob21lIGRpcmVjdG9yeVxuXHRcdFx0XHRzaG93RmlsZXM6IHRydWUsXG5cdFx0XHRcdHNob3dEaXJlY3RvcmllczogdHJ1ZSxcblx0XHRcdFx0cGF0aFNlcGFyYXRvclxuXHRcdFx0fTtcblx0XHRcdHZhbGlkUmVzb3VyY2VzID0gW1xuXHRcdFx0XHRVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdCcpLFxuXHRcdFx0XHRVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC9mb2xkZXIxJyksXG5cdFx0XHRcdFVSSS5wYXJzZSgnZmlsZTovLy9ob21lJyksXG5cdFx0XHRcdFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3ZzY29kZScpLFxuXHRcdFx0XHRVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS92c2NvZGUvZm9vJyksXG5cdFx0XHRcdFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3ZzY29kZS9iYXIudHh0JyksXG5cdFx0XHRdO1xuXHRcdFx0Y2hpbGRSZXNvdXJjZXMgPSBbXG5cdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3ZzY29kZScpLCBpc0RpcmVjdG9yeTogdHJ1ZSB9LFxuXHRcdFx0XHR7IHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS92c2NvZGUvZm9vJyksIGlzRGlyZWN0b3J5OiB0cnVlIH0sXG5cdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3ZzY29kZS9iYXIudHh0JyksIGlzRmlsZTogdHJ1ZSwgZXhlY3V0YWJsZTogdHJ1ZSB9LFxuXHRcdFx0XTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ358IHNob3VsZCByZXR1cm4gY29tcGxldGlvbiBmb3IgficsIGFzeW5jICgpID0+IHtcblx0XHRcdGFzc2VydFBhcnRpYWxDb21wbGV0aW9uc0V4aXN0KGF3YWl0IHRlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UucmVzb2x2ZVJlc291cmNlcyhyZXNvdXJjZU9wdGlvbnMsICd+JywgMSwgcHJvdmlkZXIsIGNhcGFiaWxpdGllcyksIFtcblx0XHRcdFx0eyBsYWJlbDogJ34nLCBkZXRhaWw6ICcvaG9tZS8nIH0sXG5cdFx0XHRdLCB7IHJlcGxhY2VtZW50UmFuZ2U6IFswLCAxXSB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ34vfCBzaG91bGQgcmV0dXJuIGZvbGRlciBjb21wbGV0aW9ucyByZWxhdGl2ZSB0byAkSE9NRScsIGFzeW5jICgpID0+IHtcblx0XHRcdGFzc2VydENvbXBsZXRpb25zKGF3YWl0IHRlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UucmVzb2x2ZVJlc291cmNlcyhyZXNvdXJjZU9wdGlvbnMsICd+LycsIDIsIHByb3ZpZGVyLCBjYXBhYmlsaXRpZXMpLCBbXG5cdFx0XHRcdHsgbGFiZWw6ICd+LycsIGRldGFpbDogJy9ob21lLycgfSxcblx0XHRcdFx0eyBsYWJlbDogJ34vdnNjb2RlLycsIGRldGFpbDogJy9ob21lL3ZzY29kZS8nIH0sXG5cdFx0XHRdLCB7IHJlcGxhY2VtZW50UmFuZ2U6IFswLCAyXSB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ34vdnNjb2RlL3wgc2hvdWxkIHJldHVybiBmb2xkZXIgY29tcGxldGlvbnMgcmVsYXRpdmUgdG8gJEhPTUUvdnNjb2RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0Q29tcGxldGlvbnMoYXdhaXQgdGVybWluYWxDb21wbGV0aW9uU2VydmljZS5yZXNvbHZlUmVzb3VyY2VzKHJlc291cmNlT3B0aW9ucywgJ34vdnNjb2RlLycsIDksIHByb3ZpZGVyLCBjYXBhYmlsaXRpZXMpLCBbXG5cdFx0XHRcdHsgbGFiZWw6ICd+L3ZzY29kZS8nLCBkZXRhaWw6ICcvaG9tZS92c2NvZGUvJyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnfi92c2NvZGUvZm9vLycsIGRldGFpbDogJy9ob21lL3ZzY29kZS9mb28vJyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnfi92c2NvZGUvYmFyLnR4dCcsIGRldGFpbDogJy9ob21lL3ZzY29kZS9iYXIudHh0Jywga2luZDogVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuRmlsZSB9LFxuXHRcdFx0XSwgeyByZXBsYWNlbWVudFJhbmdlOiBbMCwgOV0gfSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdyZXNvbHZlUmVzb3VyY2VzIGVkZ2UgY2FzZXMgYW5kIGFkdmFuY2VkIHNjZW5hcmlvcycsICgpID0+IHtcblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHR2YWxpZFJlc291cmNlcyA9IFtdO1xuXHRcdFx0Y2hpbGRSZXNvdXJjZXMgPSBbXTtcblx0XHR9KTtcblxuXHRcdGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdHRlc3QoJ0M6L0Zvby98IGFic29sdXRlIHBhdGhzIG9uIFdpbmRvd3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc291cmNlT3B0aW9uczogVGVybWluYWxDb21wbGV0aW9uUmVzb3VyY2VPcHRpb25zID0ge1xuXHRcdFx0XHRcdGN3ZDogVVJJLnBhcnNlKCdmaWxlOi8vL0M6JyksXG5cdFx0XHRcdFx0c2hvd0RpcmVjdG9yaWVzOiB0cnVlLFxuXHRcdFx0XHRcdHBhdGhTZXBhcmF0b3Jcblx0XHRcdFx0fTtcblx0XHRcdFx0dmFsaWRSZXNvdXJjZXMgPSBbVVJJLnBhcnNlKCdmaWxlOi8vL0M6L0ZvbycpXTtcblx0XHRcdFx0Y2hpbGRSZXNvdXJjZXMgPSBbXG5cdFx0XHRcdFx0eyByZXNvdXJjZTogVVJJLnBhcnNlKCdmaWxlOi8vL0M6L0Zvby9CYXInKSwgaXNEaXJlY3Rvcnk6IHRydWUsIGlzRmlsZTogZmFsc2UgfSxcblx0XHRcdFx0XHR7IHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vQzovRm9vL0Jhei50eHQnKSwgaXNEaXJlY3Rvcnk6IGZhbHNlLCBpc0ZpbGU6IHRydWUgfVxuXHRcdFx0XHRdO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0ZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlLnJlc29sdmVSZXNvdXJjZXMocmVzb3VyY2VPcHRpb25zLCAnQzovRm9vLycsIDcsIHByb3ZpZGVyLCBjYXBhYmlsaXRpZXMpO1xuXG5cdFx0XHRcdGFzc2VydENvbXBsZXRpb25zKHJlc3VsdCwgW1xuXHRcdFx0XHRcdHsgbGFiZWw6ICdDOi9Gb28vJywgZGV0YWlsOiAnQzovRm9vLycgfSxcblx0XHRcdFx0XHR7IGxhYmVsOiAnQzovRm9vL0Jhci8nLCBkZXRhaWw6ICdDOi9Gb28vQmFyLycgfSxcblx0XHRcdFx0XSwgeyByZXBsYWNlbWVudFJhbmdlOiBbMCwgN10gfSk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2M6L2Zvby98IGNhc2UgaW5zZW5zaXRpdml0eSBvbiBXaW5kb3dzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXNvdXJjZU9wdGlvbnM6IFRlcm1pbmFsQ29tcGxldGlvblJlc291cmNlT3B0aW9ucyA9IHtcblx0XHRcdFx0XHRjd2Q6IFVSSS5wYXJzZSgnZmlsZTovLy9jOicpLFxuXHRcdFx0XHRcdHNob3dEaXJlY3RvcmllczogdHJ1ZSxcblx0XHRcdFx0XHRwYXRoU2VwYXJhdG9yXG5cdFx0XHRcdH07XG5cdFx0XHRcdHZhbGlkUmVzb3VyY2VzID0gW1VSSS5wYXJzZSgnZmlsZTovLy9jOi9mb28nKV07XG5cdFx0XHRcdGNoaWxkUmVzb3VyY2VzID0gW1xuXHRcdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovLy9jOi9mb28vQmFyJyksIGlzRGlyZWN0b3J5OiB0cnVlLCBpc0ZpbGU6IGZhbHNlIH1cblx0XHRcdFx0XTtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGVybWluYWxDb21wbGV0aW9uU2VydmljZS5yZXNvbHZlUmVzb3VyY2VzKHJlc291cmNlT3B0aW9ucywgJ2M6L2Zvby8nLCA3LCBwcm92aWRlciwgY2FwYWJpbGl0aWVzKTtcblxuXHRcdFx0XHRhc3NlcnRDb21wbGV0aW9ucyhyZXN1bHQsIFtcblx0XHRcdFx0XHQvLyBOb3RlIHRoYXQgdGhlIGRldGFpbCBpcyBub3JtYWxpemVzIGRyaXZlIGxldHRlcnMgdG8gY2FwaXRhbCBjYXNlIGludGVudGlvbmFsbHlcblx0XHRcdFx0XHR7IGxhYmVsOiAnYzovZm9vLycsIGRldGFpbDogJ0M6L2Zvby8nIH0sXG5cdFx0XHRcdFx0eyBsYWJlbDogJ2M6L2Zvby9CYXIvJywgZGV0YWlsOiAnQzovZm9vL0Jhci8nIH0sXG5cdFx0XHRcdF0sIHsgcmVwbGFjZW1lbnRSYW5nZTogWzAsIDddIH0pO1xuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRlc3QoJy9mb28vfCBhYnNvbHV0ZSBwYXRocyBOT1Qgb24gV2luZG93cycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzb3VyY2VPcHRpb25zOiBUZXJtaW5hbENvbXBsZXRpb25SZXNvdXJjZU9wdGlvbnMgPSB7XG5cdFx0XHRcdFx0Y3dkOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vJyksXG5cdFx0XHRcdFx0c2hvd0RpcmVjdG9yaWVzOiB0cnVlLFxuXHRcdFx0XHRcdHBhdGhTZXBhcmF0b3Jcblx0XHRcdFx0fTtcblx0XHRcdFx0dmFsaWRSZXNvdXJjZXMgPSBbVVJJLnBhcnNlKCdmaWxlOi8vL2ZvbycpXTtcblx0XHRcdFx0Y2hpbGRSZXNvdXJjZXMgPSBbXG5cdFx0XHRcdFx0eyByZXNvdXJjZTogVVJJLnBhcnNlKCdmaWxlOi8vL2Zvby9CYXInKSwgaXNEaXJlY3Rvcnk6IHRydWUsIGlzRmlsZTogZmFsc2UgfSxcblx0XHRcdFx0XHR7IHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vZm9vL0Jhei50eHQnKSwgaXNEaXJlY3Rvcnk6IGZhbHNlLCBpc0ZpbGU6IHRydWUgfVxuXHRcdFx0XHRdO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0ZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlLnJlc29sdmVSZXNvdXJjZXMocmVzb3VyY2VPcHRpb25zLCAnL2Zvby8nLCA1LCBwcm92aWRlciwgY2FwYWJpbGl0aWVzKTtcblxuXHRcdFx0XHRhc3NlcnRDb21wbGV0aW9ucyhyZXN1bHQsIFtcblx0XHRcdFx0XHR7IGxhYmVsOiAnL2Zvby8nLCBkZXRhaWw6ICcvZm9vLycgfSxcblx0XHRcdFx0XHR7IGxhYmVsOiAnL2Zvby9CYXIvJywgZGV0YWlsOiAnL2Zvby9CYXIvJyB9LFxuXHRcdFx0XHRdLCB7IHJlcGxhY2VtZW50UmFuZ2U6IFswLCA1XSB9KTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdHRlc3QoJy5cXFxcZm9sZGVyIHwgQ2FzZSBpbnNlbnNpdGl2aXR5IHNob3VsZCByZXNvbHZlIGNvcnJlY3RseSBvbiBXaW5kb3dzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXNvdXJjZU9wdGlvbnM6IFRlcm1pbmFsQ29tcGxldGlvblJlc291cmNlT3B0aW9ucyA9IHtcblx0XHRcdFx0XHRjd2Q6IFVSSS5wYXJzZSgnZmlsZTovLy9DOi90ZXN0JyksXG5cdFx0XHRcdFx0c2hvd0RpcmVjdG9yaWVzOiB0cnVlLFxuXHRcdFx0XHRcdHBhdGhTZXBhcmF0b3I6ICdcXFxcJ1xuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdHZhbGlkUmVzb3VyY2VzID0gW1VSSS5wYXJzZSgnZmlsZTovLy9DOi90ZXN0JyldO1xuXHRcdFx0XHRjaGlsZFJlc291cmNlcyA9IFtcblx0XHRcdFx0XHR7IHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vQzovdGVzdC9Gb2xkZXJBLycpLCBpc0RpcmVjdG9yeTogdHJ1ZSB9LFxuXHRcdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovLy9DOi90ZXN0L2Fub3RoZXJGb2xkZXIvJyksIGlzRGlyZWN0b3J5OiB0cnVlIH1cblx0XHRcdFx0XTtcblxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0ZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlLnJlc29sdmVSZXNvdXJjZXMocmVzb3VyY2VPcHRpb25zLCAnLlxcXFxmb2xkZXInLCA4LCBwcm92aWRlciwgY2FwYWJpbGl0aWVzKTtcblxuXHRcdFx0XHRhc3NlcnRDb21wbGV0aW9ucyhyZXN1bHQsIFtcblx0XHRcdFx0XHR7IGxhYmVsOiAnLlxcXFwnLCBkZXRhaWw6ICdDOlxcXFx0ZXN0XFxcXCcgfSxcblx0XHRcdFx0XHR7IGxhYmVsOiAnLlxcXFxGb2xkZXJBXFxcXCcsIGRldGFpbDogJ0M6XFxcXHRlc3RcXFxcRm9sZGVyQVxcXFwnIH0sXG5cdFx0XHRcdFx0eyBsYWJlbDogJy5cXFxcYW5vdGhlckZvbGRlclxcXFwnLCBkZXRhaWw6ICdDOlxcXFx0ZXN0XFxcXGFub3RoZXJGb2xkZXJcXFxcJyB9LFxuXHRcdFx0XHRcdHsgbGFiZWw6ICcuXFxcXC4uXFxcXCcsIGRldGFpbDogJ0M6XFxcXCcgfSxcblx0XHRcdFx0XSwgeyByZXBsYWNlbWVudFJhbmdlOiBbMCwgOF0gfSk7XG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGVzdCgnLi9mb2xkZXIgfCBDYXNlIHNlbnNpdGl2aXR5IHNob3VsZCByZXNvbHZlIGNvcnJlY3RseSBvbiBNYWMvVW5peCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzb3VyY2VPcHRpb25zOiBUZXJtaW5hbENvbXBsZXRpb25SZXNvdXJjZU9wdGlvbnMgPSB7XG5cdFx0XHRcdFx0Y3dkOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdCcpLFxuXHRcdFx0XHRcdHNob3dEaXJlY3RvcmllczogdHJ1ZSxcblx0XHRcdFx0XHRwYXRoU2VwYXJhdG9yOiAnLydcblx0XHRcdFx0fTtcblx0XHRcdFx0dmFsaWRSZXNvdXJjZXMgPSBbVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QnKV07XG5cdFx0XHRcdGNoaWxkUmVzb3VyY2VzID0gW1xuXHRcdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0L0ZvbGRlckEvJyksIGlzRGlyZWN0b3J5OiB0cnVlIH0sXG5cdFx0XHRcdFx0eyByZXNvdXJjZTogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QvZm9sZGVyYS8nKSwgaXNEaXJlY3Rvcnk6IHRydWUgfVxuXHRcdFx0XHRdO1xuXG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UucmVzb2x2ZVJlc291cmNlcyhyZXNvdXJjZU9wdGlvbnMsICcuL2ZvbGRlcicsIDgsIHByb3ZpZGVyLCBjYXBhYmlsaXRpZXMpO1xuXG5cdFx0XHRcdGFzc2VydENvbXBsZXRpb25zKHJlc3VsdCwgW1xuXHRcdFx0XHRcdHsgbGFiZWw6ICcuLycsIGRldGFpbDogJy90ZXN0LycgfSxcblx0XHRcdFx0XHR7IGxhYmVsOiAnLi9Gb2xkZXJBLycsIGRldGFpbDogJy90ZXN0L0ZvbGRlckEvJyB9LFxuXHRcdFx0XHRcdHsgbGFiZWw6ICcuL2ZvbGRlcmEvJywgZGV0YWlsOiAnL3Rlc3QvZm9sZGVyYS8nIH0sXG5cdFx0XHRcdFx0eyBsYWJlbDogJy4vLi4vJywgZGV0YWlsOiAnLycgfVxuXHRcdFx0XHRdLCB7IHJlcGxhY2VtZW50UmFuZ2U6IFswLCA4XSB9KTtcblx0XHRcdH0pO1xuXG5cdFx0fVxuXHRcdHRlc3QoJ3wgRW1wdHkgaW5wdXQgc2hvdWxkIHJlc29sdmUgdG8gY3VycmVudCBkaXJlY3RvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXNvdXJjZU9wdGlvbnM6IFRlcm1pbmFsQ29tcGxldGlvblJlc291cmNlT3B0aW9ucyA9IHtcblx0XHRcdFx0Y3dkOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdCcpLFxuXHRcdFx0XHRzaG93RGlyZWN0b3JpZXM6IHRydWUsXG5cdFx0XHRcdHBhdGhTZXBhcmF0b3Jcblx0XHRcdH07XG5cdFx0XHR2YWxpZFJlc291cmNlcyA9IFtVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdCcpXTtcblx0XHRcdGNoaWxkUmVzb3VyY2VzID0gW1xuXHRcdFx0XHR7IHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC9mb2xkZXIxLycpLCBpc0RpcmVjdG9yeTogdHJ1ZSB9LFxuXHRcdFx0XHR7IHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC9mb2xkZXIyLycpLCBpc0RpcmVjdG9yeTogdHJ1ZSB9XG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGVybWluYWxDb21wbGV0aW9uU2VydmljZS5yZXNvbHZlUmVzb3VyY2VzKHJlc291cmNlT3B0aW9ucywgJycsIDAsIHByb3ZpZGVyLCBjYXBhYmlsaXRpZXMpO1xuXG5cdFx0XHRhc3NlcnRDb21wbGV0aW9ucyhyZXN1bHQsIFtcblx0XHRcdFx0eyBsYWJlbDogJy4nLCBkZXRhaWw6ICcvdGVzdC8nIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICcuL2ZvbGRlcjEvJywgZGV0YWlsOiAnL3Rlc3QvZm9sZGVyMS8nIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICcuL2ZvbGRlcjIvJywgZGV0YWlsOiAnL3Rlc3QvZm9sZGVyMi8nIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICcuLi8nLCBkZXRhaWw6ICcvJyB9LFxuXHRcdFx0XHRzdGFuZGFyZFRpbGRlSXRlbSxcblx0XHRcdF0sIHsgcmVwbGFjZW1lbnRSYW5nZTogWzAsIDBdIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGlnbm9yZSBlbnZpcm9ubWVudCB2YXJpYWJsZSBzZXR0aW5nIHByZWZpeGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VPcHRpb25zOiBUZXJtaW5hbENvbXBsZXRpb25SZXNvdXJjZU9wdGlvbnMgPSB7XG5cdFx0XHRcdGN3ZDogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QnKSxcblx0XHRcdFx0c2hvd0RpcmVjdG9yaWVzOiB0cnVlLFxuXHRcdFx0XHRwYXRoU2VwYXJhdG9yXG5cdFx0XHR9O1xuXHRcdFx0dmFsaWRSZXNvdXJjZXMgPSBbVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QnKV07XG5cdFx0XHRjaGlsZFJlc291cmNlcyA9IFtcblx0XHRcdFx0eyByZXNvdXJjZTogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QvZm9sZGVyMS8nKSwgaXNEaXJlY3Rvcnk6IHRydWUgfSxcblx0XHRcdFx0eyByZXNvdXJjZTogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QvZm9sZGVyMi8nKSwgaXNEaXJlY3Rvcnk6IHRydWUgfVxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UucmVzb2x2ZVJlc291cmNlcyhyZXNvdXJjZU9wdGlvbnMsICdGT089Li8nLCAyLCBwcm92aWRlciwgY2FwYWJpbGl0aWVzKTtcblxuXHRcdFx0Ly8gTXVzdCBub3QgaW5jbHVkZSBGT089IHByZWZpeCBpbiBjb21wbGV0aW9uc1xuXHRcdFx0YXNzZXJ0Q29tcGxldGlvbnMocmVzdWx0LCBbXG5cdFx0XHRcdHsgbGFiZWw6ICcuJywgZGV0YWlsOiAnL3Rlc3QvJyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnLi9mb2xkZXIxLycsIGRldGFpbDogJy90ZXN0L2ZvbGRlcjEvJyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnLi9mb2xkZXIyLycsIGRldGFpbDogJy90ZXN0L2ZvbGRlcjIvJyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnLi4vJywgZGV0YWlsOiAnLycgfSxcblx0XHRcdFx0c3RhbmRhcmRUaWxkZUl0ZW0sXG5cdFx0XHRdLCB7IHJlcGxhY2VtZW50UmFuZ2U6IFswLCAyXSB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgcmV0dXJuIGNvbXBsZXRpb25zIHdoZW4gcmVsYXRpdmUgZm9sZGVyIHByZWZpeCBkb2VzIG5vdCBleGlzdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc291cmNlT3B0aW9uczogVGVybWluYWxDb21wbGV0aW9uUmVzb3VyY2VPcHRpb25zID0ge1xuXHRcdFx0XHRjd2Q6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0JyksXG5cdFx0XHRcdHNob3dEaXJlY3RvcmllczogdHJ1ZSxcblx0XHRcdFx0cGF0aFNlcGFyYXRvclxuXHRcdFx0fTtcblx0XHRcdHZhbGlkUmVzb3VyY2VzID0gW1VSSS5wYXJzZSgnZmlsZTovLy90ZXN0JyldO1xuXHRcdFx0Y2hpbGRSZXNvdXJjZXMgPSBbXG5cdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0L3NyYy8nKSwgaXNEaXJlY3Rvcnk6IHRydWUgfSxcblx0XHRcdFx0eyByZXNvdXJjZTogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QvdnMvJyksIGlzRGlyZWN0b3J5OiB0cnVlIH1cblx0XHRcdF07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0ZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlLnJlc29sdmVSZXNvdXJjZXMocmVzb3VyY2VPcHRpb25zLCAncy8nLCAyLCBwcm92aWRlciwgY2FwYWJpbGl0aWVzKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJy4vfCBzaG91bGQgaGFuZGxlIGxhcmdlIGRpcmVjdG9yaWVzIHdpdGggbWFueSByZXN1bHRzIGdyYWNlZnVsbHknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXNvdXJjZU9wdGlvbnM6IFRlcm1pbmFsQ29tcGxldGlvblJlc291cmNlT3B0aW9ucyA9IHtcblx0XHRcdFx0Y3dkOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdCcpLFxuXHRcdFx0XHRzaG93RGlyZWN0b3JpZXM6IHRydWUsXG5cdFx0XHRcdHBhdGhTZXBhcmF0b3Jcblx0XHRcdH07XG5cdFx0XHR2YWxpZFJlc291cmNlcyA9IFtVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdCcpXTtcblx0XHRcdGNoaWxkUmVzb3VyY2VzID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogMTAwMCB9LCAoXywgaSkgPT4gKHtcblx0XHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZShgZmlsZTovLy90ZXN0L2ZvbGRlciR7aX0vYCksXG5cdFx0XHRcdGlzRGlyZWN0b3J5OiB0cnVlXG5cdFx0XHR9KSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0ZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlLnJlc29sdmVSZXNvdXJjZXMocmVzb3VyY2VPcHRpb25zLCAnLi8nLCAyLCBwcm92aWRlciwgY2FwYWJpbGl0aWVzKTtcblxuXHRcdFx0YXNzZXJ0KHJlc3VsdCk7XG5cdFx0XHQvLyBpbmNsdWRlcyB0aGUgMTAwMCBmb2xkZXJzICsgLi8gYW5kIC4vLi4vXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Py5sZW5ndGgsIDEwMDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5sYWJlbCwgYC4ke3BhdGhTZXBhcmF0b3J9YCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmF0KC0xKT8ubGFiZWwsIGAuJHtwYXRoU2VwYXJhdG9yfS4uJHtwYXRoU2VwYXJhdG9yfWApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnLi9mb2xkZXJ8IHNob3VsZCBpbmNsdWRlIGN1cnJlbnQgZm9sZGVyIHdpdGggdHJhaWxpbmcgLyBpcyBtaXNzaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VPcHRpb25zOiBUZXJtaW5hbENvbXBsZXRpb25SZXNvdXJjZU9wdGlvbnMgPSB7XG5cdFx0XHRcdGN3ZDogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QnKSxcblx0XHRcdFx0c2hvd0RpcmVjdG9yaWVzOiB0cnVlLFxuXHRcdFx0XHRwYXRoU2VwYXJhdG9yXG5cdFx0XHR9O1xuXHRcdFx0dmFsaWRSZXNvdXJjZXMgPSBbVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QnKV07XG5cdFx0XHRjaGlsZFJlc291cmNlcyA9IFtcblx0XHRcdFx0eyByZXNvdXJjZTogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QvZm9sZGVyMS8nKSwgaXNEaXJlY3Rvcnk6IHRydWUgfSxcblx0XHRcdFx0eyByZXNvdXJjZTogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QvZm9sZGVyMi8nKSwgaXNEaXJlY3Rvcnk6IHRydWUgfVxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UucmVzb2x2ZVJlc291cmNlcyhyZXNvdXJjZU9wdGlvbnMsICcuL2ZvbGRlcjEnLCAxMCwgcHJvdmlkZXIsIGNhcGFiaWxpdGllcyk7XG5cblx0XHRcdGFzc2VydENvbXBsZXRpb25zKHJlc3VsdCwgW1xuXHRcdFx0XHR7IGxhYmVsOiAnLi8nLCBkZXRhaWw6ICcvdGVzdC8nIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICcuL2ZvbGRlcjEvJywgZGV0YWlsOiAnL3Rlc3QvZm9sZGVyMS8nIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICcuL2ZvbGRlcjIvJywgZGV0YWlsOiAnL3Rlc3QvZm9sZGVyMi8nIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICcuLy4uLycsIGRldGFpbDogJy8nIH1cblx0XHRcdF0sIHsgcmVwbGFjZW1lbnRSYW5nZTogWzEsIDEwXSB9KTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgcmVzb2x2ZSBuZXN0ZWQgZm9sZGVyIHdoZW4gbmFtZSBtYXRjaGVzIGN3ZCBiYXNlbmFtZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc291cmNlT3B0aW9uczogVGVybWluYWxDb21wbGV0aW9uUmVzb3VyY2VPcHRpb25zID0ge1xuXHRcdFx0XHRjd2Q6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0JyksXG5cdFx0XHRcdHNob3dEaXJlY3RvcmllczogdHJ1ZSxcblx0XHRcdFx0cGF0aFNlcGFyYXRvclxuXHRcdFx0fTtcblx0XHRcdHZhbGlkUmVzb3VyY2VzID0gW1xuXHRcdFx0XHRVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdCcpLFxuXHRcdFx0XHRVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC90ZXN0JyksXG5cdFx0XHRdO1xuXHRcdFx0Y2hpbGRSZXNvdXJjZXMgPSBbXG5cdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0L3Rlc3QvJyksIGlzRGlyZWN0b3J5OiB0cnVlIH0sXG5cdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0L3Rlc3QvaW5uZXIvJyksIGlzRGlyZWN0b3J5OiB0cnVlIH1cblx0XHRcdF07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0ZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlLnJlc29sdmVSZXNvdXJjZXMocmVzb3VyY2VPcHRpb25zLCAndGVzdC8nLCA1LCBwcm92aWRlciwgY2FwYWJpbGl0aWVzKTtcblxuXHRcdFx0YXNzZXJ0Q29tcGxldGlvbnMocmVzdWx0LCBbXG5cdFx0XHRcdHsgbGFiZWw6ICcuL3Rlc3QvJywgZGV0YWlsOiAnL3Rlc3QvdGVzdC8nIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICcuL3Rlc3QvaW5uZXIvJywgZGV0YWlsOiAnL3Rlc3QvdGVzdC9pbm5lci8nIH0sXG5cdFx0XHRcdC8vIC4uL2AgZnJvbSB0aGUgdmlld2VkIGZvbGRlciAoL3Rlc3QvdGVzdC8pIGdvZXMgdG8gL3Rlc3QvLCBub3QgL1xuXHRcdFx0XHR7IGxhYmVsOiAnLi90ZXN0Ly4uLycsIGRldGFpbDogJy90ZXN0LycgfVxuXHRcdFx0XSwgeyByZXBsYWNlbWVudFJhbmdlOiBbMCwgNV0gfSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgndGVzdC98IHNob3VsZCBub3JtYWxpemUgY3VycmVudCBhbmQgcGFyZW50IGZvbGRlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXNvdXJjZU9wdGlvbnM6IFRlcm1pbmFsQ29tcGxldGlvblJlc291cmNlT3B0aW9ucyA9IHtcblx0XHRcdFx0Y3dkOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdCcpLFxuXHRcdFx0XHRzaG93RGlyZWN0b3JpZXM6IHRydWUsXG5cdFx0XHRcdHBhdGhTZXBhcmF0b3Jcblx0XHRcdH07XG5cdFx0XHR2YWxpZFJlc291cmNlcyA9IFtcblx0XHRcdFx0VVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QnKSxcblx0XHRcdFx0VVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QvZm9sZGVyMScpLFxuXHRcdFx0XHRVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC9mb2xkZXIyJylcblx0XHRcdF07XG5cdFx0XHRjaGlsZFJlc291cmNlcyA9IFtcblx0XHRcdFx0eyByZXNvdXJjZTogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QvZm9sZGVyMS8nKSwgaXNEaXJlY3Rvcnk6IHRydWUgfSxcblx0XHRcdFx0eyByZXNvdXJjZTogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QvZm9sZGVyMi8nKSwgaXNEaXJlY3Rvcnk6IHRydWUgfVxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UucmVzb2x2ZVJlc291cmNlcyhyZXNvdXJjZU9wdGlvbnMsICcuL3Rlc3QvJywgNywgcHJvdmlkZXIsIGNhcGFiaWxpdGllcyk7XG5cblx0XHRcdGFzc2VydENvbXBsZXRpb25zKHJlc3VsdCwgW1xuXHRcdFx0XHR7IGxhYmVsOiAnLi90ZXN0LycsIGRldGFpbDogJy90ZXN0LycgfSxcblx0XHRcdFx0eyBsYWJlbDogJy4vdGVzdC9mb2xkZXIxLycsIGRldGFpbDogJy90ZXN0L2ZvbGRlcjEvJyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnLi90ZXN0L2ZvbGRlcjIvJywgZGV0YWlsOiAnL3Rlc3QvZm9sZGVyMi8nIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICcuL3Rlc3QvLi4vJywgZGV0YWlsOiAnLycgfVxuXHRcdFx0XSwgeyByZXBsYWNlbWVudFJhbmdlOiBbMCwgN10gfSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdjZHBhdGgnLCAoKSA9PiB7XG5cdFx0bGV0IHNoZWxsRW52RGV0ZWN0aW9uOiBTaGVsbEVudkRldGVjdGlvbkNhcGFiaWxpdHk7XG5cblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHR2YWxpZFJlc291cmNlcyA9IFtcblx0XHRcdFx0VVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QnKSxcblx0XHRcdFx0VVJJLnBhcnNlKCdmaWxlOi8vL2NkcGF0aF92YWx1ZScpXG5cdFx0XHRdO1xuXHRcdFx0Y2hpbGRSZXNvdXJjZXMgPSBbXG5cdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovLy9jZHBhdGhfdmFsdWUvZm9sZGVyMS8nKSwgaXNEaXJlY3Rvcnk6IHRydWUgfSxcblx0XHRcdFx0eyByZXNvdXJjZTogVVJJLnBhcnNlKCdmaWxlOi8vL2NkcGF0aF92YWx1ZS9maWxlMS50eHQnKSwgaXNGaWxlOiB0cnVlIH0sXG5cdFx0XHRdO1xuXG5cdFx0XHRzaGVsbEVudkRldGVjdGlvbiA9IHN0b3JlLmFkZChuZXcgU2hlbGxFbnZEZXRlY3Rpb25DYXBhYmlsaXR5KCkpO1xuXHRcdFx0c2hlbGxFbnZEZXRlY3Rpb24uc2V0RW52aXJvbm1lbnQoeyBDRFBBVEg6ICcvY2RwYXRoX3ZhbHVlJyB9LCB0cnVlKTtcblx0XHRcdGNhcGFiaWxpdGllcy5hZGQoVGVybWluYWxDYXBhYmlsaXR5LlNoZWxsRW52RGV0ZWN0aW9uLCBzaGVsbEVudkRldGVjdGlvbik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjZCB8IHNob3VsZCBzaG93IHBhdGhzIGZyb20gJENEUEFUSCAocmVsYXRpdmUpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ3Rlcm1pbmFsLmludGVncmF0ZWQuc3VnZ2VzdC5jZFBhdGgnLCAncmVsYXRpdmUnKTtcblx0XHRcdGNvbnN0IHJlc291cmNlT3B0aW9uczogVGVybWluYWxDb21wbGV0aW9uUmVzb3VyY2VPcHRpb25zID0ge1xuXHRcdFx0XHRjd2Q6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0JyksXG5cdFx0XHRcdHNob3dEaXJlY3RvcmllczogdHJ1ZSxcblx0XHRcdFx0c2hvd0ZpbGVzOiB0cnVlLFxuXHRcdFx0XHRwYXRoU2VwYXJhdG9yXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGVybWluYWxDb21wbGV0aW9uU2VydmljZS5yZXNvbHZlUmVzb3VyY2VzKHJlc291cmNlT3B0aW9ucywgJ2NkICcsIDMsIHByb3ZpZGVyLCBjYXBhYmlsaXRpZXMpO1xuXG5cdFx0XHRhc3NlcnRQYXJ0aWFsQ29tcGxldGlvbnNFeGlzdChyZXN1bHQsIFtcblx0XHRcdFx0eyBsYWJlbDogJ2ZvbGRlcjEnLCBkZXRhaWw6ICdDRFBBVEggL2NkcGF0aF92YWx1ZS9mb2xkZXIxLycgfSxcblx0XHRcdF0sIHsgcmVwbGFjZW1lbnRSYW5nZTogWzMsIDNdIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2QgfCBzaG91bGQgc2hvdyBwYXRocyBmcm9tICRDRFBBVEggKGFic29sdXRlKScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnN1Z2dlc3QuY2RQYXRoJywgJ2Fic29sdXRlJyk7XG5cdFx0XHRjb25zdCByZXNvdXJjZU9wdGlvbnM6IFRlcm1pbmFsQ29tcGxldGlvblJlc291cmNlT3B0aW9ucyA9IHtcblx0XHRcdFx0Y3dkOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdCcpLFxuXHRcdFx0XHRzaG93RGlyZWN0b3JpZXM6IHRydWUsXG5cdFx0XHRcdHNob3dGaWxlczogdHJ1ZSxcblx0XHRcdFx0cGF0aFNlcGFyYXRvclxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UucmVzb2x2ZVJlc291cmNlcyhyZXNvdXJjZU9wdGlvbnMsICdjZCAnLCAzLCBwcm92aWRlciwgY2FwYWJpbGl0aWVzKTtcblxuXHRcdFx0YXNzZXJ0UGFydGlhbENvbXBsZXRpb25zRXhpc3QocmVzdWx0LCBbXG5cdFx0XHRcdHsgbGFiZWw6ICcvY2RwYXRoX3ZhbHVlL2ZvbGRlcjEvJywgZGV0YWlsOiAnQ0RQQVRIJyB9LFxuXHRcdFx0XSwgeyByZXBsYWNlbWVudFJhbmdlOiBbMywgM10gfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjZCB8IHNob3VsZCBzdXBwb3J0IHB1bGxpbmcgZnJvbSBtdWx0aXBsZSBwYXRocyBpbiAkQ0RQQVRIJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ3Rlcm1pbmFsLmludGVncmF0ZWQuc3VnZ2VzdC5jZFBhdGgnLCAncmVsYXRpdmUnKTtcblx0XHRcdGNvbnN0IHBhdGhQcmVmaXggPSBpc1dpbmRvd3MgPyAnYzpcXFxcJyA6ICcvJztcblx0XHRcdGNvbnN0IGRlbGltZXRlciA9IGlzV2luZG93cyA/ICc7JyA6ICc6Jztcblx0XHRcdGNvbnN0IHNlcGFyYXRvciA9IGlzV2luZG93cyA/ICdcXFxcJyA6ICcvJztcblx0XHRcdHNoZWxsRW52RGV0ZWN0aW9uLnNldEVudmlyb25tZW50KHsgQ0RQQVRIOiBgJHtwYXRoUHJlZml4fWNkcGF0aDFfdmFsdWUke2RlbGltZXRlcn0ke3BhdGhQcmVmaXh9Y2RwYXRoMl92YWx1ZSR7c2VwYXJhdG9yfWlubmVyX2RpcmAgfSwgdHJ1ZSk7XG5cblx0XHRcdGNvbnN0IHVyaVBhdGhQcmVmaXggPSBpc1dpbmRvd3MgPyAnZmlsZTovLy9jOi8nIDogJ2ZpbGU6Ly8vJztcblx0XHRcdHZhbGlkUmVzb3VyY2VzID0gW1xuXHRcdFx0XHRVUkkucGFyc2UoYCR7dXJpUGF0aFByZWZpeH10ZXN0YCksXG5cdFx0XHRcdFVSSS5wYXJzZShgJHt1cmlQYXRoUHJlZml4fWNkcGF0aDFfdmFsdWVgKSxcblx0XHRcdFx0VVJJLnBhcnNlKGAke3VyaVBhdGhQcmVmaXh9Y2RwYXRoMl92YWx1ZWApLFxuXHRcdFx0XHRVUkkucGFyc2UoYCR7dXJpUGF0aFByZWZpeH1jZHBhdGgyX3ZhbHVlL2lubmVyX2RpcmApXG5cdFx0XHRdO1xuXHRcdFx0Y2hpbGRSZXNvdXJjZXMgPSBbXG5cdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5wYXJzZShgJHt1cmlQYXRoUHJlZml4fWNkcGF0aDFfdmFsdWUvZm9sZGVyMS9gKSwgaXNEaXJlY3Rvcnk6IHRydWUgfSxcblx0XHRcdFx0eyByZXNvdXJjZTogVVJJLnBhcnNlKGAke3VyaVBhdGhQcmVmaXh9Y2RwYXRoMV92YWx1ZS9mb2xkZXIyL2ApLCBpc0RpcmVjdG9yeTogdHJ1ZSB9LFxuXHRcdFx0XHR7IHJlc291cmNlOiBVUkkucGFyc2UoYCR7dXJpUGF0aFByZWZpeH1jZHBhdGgxX3ZhbHVlL2ZpbGUxLnR4dGApLCBpc0ZpbGU6IHRydWUgfSxcblx0XHRcdFx0eyByZXNvdXJjZTogVVJJLnBhcnNlKGAke3VyaVBhdGhQcmVmaXh9Y2RwYXRoMl92YWx1ZS9pbm5lcl9kaXIvZm9sZGVyMS9gKSwgaXNEaXJlY3Rvcnk6IHRydWUgfSxcblx0XHRcdFx0eyByZXNvdXJjZTogVVJJLnBhcnNlKGAke3VyaVBhdGhQcmVmaXh9Y2RwYXRoMl92YWx1ZS9pbm5lcl9kaXIvZm9sZGVyMi9gKSwgaXNEaXJlY3Rvcnk6IHRydWUgfSxcblx0XHRcdFx0eyByZXNvdXJjZTogVVJJLnBhcnNlKGAke3VyaVBhdGhQcmVmaXh9Y2RwYXRoMl92YWx1ZS9pbm5lcl9kaXIvZmlsZTEudHh0YCksIGlzRmlsZTogdHJ1ZSB9LFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgcmVzb3VyY2VPcHRpb25zOiBUZXJtaW5hbENvbXBsZXRpb25SZXNvdXJjZU9wdGlvbnMgPSB7XG5cdFx0XHRcdGN3ZDogVVJJLnBhcnNlKGAke3VyaVBhdGhQcmVmaXh9dGVzdGApLFxuXHRcdFx0XHRzaG93RGlyZWN0b3JpZXM6IHRydWUsXG5cdFx0XHRcdHNob3dGaWxlczogdHJ1ZSxcblx0XHRcdFx0cGF0aFNlcGFyYXRvclxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UucmVzb2x2ZVJlc291cmNlcyhyZXNvdXJjZU9wdGlvbnMsICdjZCAnLCAzLCBwcm92aWRlciwgY2FwYWJpbGl0aWVzKTtcblxuXHRcdFx0Y29uc3QgZmluYWxQcmVmaXggPSBpc1dpbmRvd3MgPyAnQzpcXFxcJyA6ICcvJztcblx0XHRcdGFzc2VydFBhcnRpYWxDb21wbGV0aW9uc0V4aXN0KHJlc3VsdCwgW1xuXHRcdFx0XHR7IGxhYmVsOiAnZm9sZGVyMScsIGRldGFpbDogYENEUEFUSCAke2ZpbmFsUHJlZml4fWNkcGF0aDFfdmFsdWUvZm9sZGVyMS9gIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICdmb2xkZXIyJywgZGV0YWlsOiBgQ0RQQVRIICR7ZmluYWxQcmVmaXh9Y2RwYXRoMV92YWx1ZS9mb2xkZXIyL2AgfSxcblx0XHRcdFx0eyBsYWJlbDogJ2ZvbGRlcjEnLCBkZXRhaWw6IGBDRFBBVEggJHtmaW5hbFByZWZpeH1jZHBhdGgyX3ZhbHVlL2lubmVyX2Rpci9mb2xkZXIxL2AgfSxcblx0XHRcdFx0eyBsYWJlbDogJ2ZvbGRlcjInLCBkZXRhaWw6IGBDRFBBVEggJHtmaW5hbFByZWZpeH1jZHBhdGgyX3ZhbHVlL2lubmVyX2Rpci9mb2xkZXIyL2AgfSxcblx0XHRcdF0sIHsgcmVwbGFjZW1lbnRSYW5nZTogWzMsIDNdIH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0c3VpdGUoJ2dpdGJhc2gnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0KCdzaG91bGQgY29udmVydCBHaXQgQmFzaCBhYnNvbHV0ZSBwYXRoIHRvIFdpbmRvd3MgYWJzb2x1dGUgcGF0aCcsICgpID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdpdEJhc2hUb1dpbmRvd3NQYXRoKCcvJyksICdDOlxcXFwnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdpdEJhc2hUb1dpbmRvd3NQYXRoKCcvYy8nKSwgJ0M6XFxcXCcpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2l0QmFzaFRvV2luZG93c1BhdGgoJy9jL1VzZXJzL2ZvbycpLCAnQzpcXFxcVXNlcnNcXFxcZm9vJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnaXRCYXNoVG9XaW5kb3dzUGF0aCgnL2QvYmFyJyksICdEOlxcXFxiYXInKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdzaG91bGQgY29udmVydCBXaW5kb3dzIGFic29sdXRlIHBhdGggdG8gR2l0IEJhc2ggYWJzb2x1dGUgcGF0aCcsICgpID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdpbmRvd3NUb0dpdEJhc2hQYXRoKCdDOlxcXFwnKSwgJy9jLycpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2luZG93c1RvR2l0QmFzaFBhdGgoJ0M6XFxcXFVzZXJzXFxcXGZvbycpLCAnL2MvVXNlcnMvZm9vJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3aW5kb3dzVG9HaXRCYXNoUGF0aCgnRDpcXFxcYmFyJyksICcvZC9iYXInKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdpbmRvd3NUb0dpdEJhc2hQYXRoKCdFOlxcXFxzb21lXFxcXHBhdGgnKSwgJy9lL3NvbWUvcGF0aCcpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3Jlc29sdmVSZXNvdXJjZXMgd2l0aCBjOi8gc3R5bGUgYWJzb2x1dGUgcGF0aCBmb3IgR2l0IEJhc2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc291cmNlT3B0aW9uczogVGVybWluYWxDb21wbGV0aW9uUmVzb3VyY2VPcHRpb25zID0ge1xuXHRcdFx0XHRcdGN3ZDogVVJJLmZpbGUoJ0M6XFxcXFVzZXJzXFxcXGZvbycpLFxuXHRcdFx0XHRcdHNob3dEaXJlY3RvcmllczogdHJ1ZSxcblx0XHRcdFx0XHRzaG93RmlsZXM6IHRydWUsXG5cdFx0XHRcdFx0cGF0aFNlcGFyYXRvcjogJy8nXG5cdFx0XHRcdH07XG5cdFx0XHRcdHZhbGlkUmVzb3VyY2VzID0gW1xuXHRcdFx0XHRcdFVSSS5maWxlKCdDOlxcXFxVc2Vyc1xcXFxmb28nKSxcblx0XHRcdFx0XHRVUkkuZmlsZSgnQzpcXFxcVXNlcnNcXFxcZm9vXFxcXGJhcicpLFxuXHRcdFx0XHRcdFVSSS5maWxlKCdDOlxcXFxVc2Vyc1xcXFxmb29cXFxcYmF6LnR4dCcpXG5cdFx0XHRcdF07XG5cdFx0XHRcdGNoaWxkUmVzb3VyY2VzID0gW1xuXHRcdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5maWxlKCdDOlxcXFxVc2Vyc1xcXFxmb29cXFxcYmFyJyksIGlzRGlyZWN0b3J5OiB0cnVlLCBpc0ZpbGU6IGZhbHNlIH0sXG5cdFx0XHRcdFx0eyByZXNvdXJjZTogVVJJLmZpbGUoJ0M6XFxcXFVzZXJzXFxcXGZvb1xcXFxiYXoudHh0JyksIGlzRmlsZTogdHJ1ZSwgZXhlY3V0YWJsZTogdHJ1ZSB9XG5cdFx0XHRcdF07XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UucmVzb2x2ZVJlc291cmNlcyhyZXNvdXJjZU9wdGlvbnMsICdDOi9Vc2Vycy9mb28vJywgMTMsIHByb3ZpZGVyLCBjYXBhYmlsaXRpZXMsIFdpbmRvd3NTaGVsbFR5cGUuR2l0QmFzaCk7XG5cdFx0XHRcdGFzc2VydENvbXBsZXRpb25zKHJlc3VsdCwgW1xuXHRcdFx0XHRcdHsgbGFiZWw6ICdDOi9Vc2Vycy9mb28vJywgZGV0YWlsOiAnQzpcXFxcVXNlcnNcXFxcZm9vXFxcXCcgfSxcblx0XHRcdFx0XHR7IGxhYmVsOiAnQzovVXNlcnMvZm9vL2Jhci8nLCBkZXRhaWw6ICdDOlxcXFxVc2Vyc1xcXFxmb29cXFxcYmFyXFxcXCcgfSxcblx0XHRcdFx0XHR7IGxhYmVsOiAnQzovVXNlcnMvZm9vL2Jhei50eHQnLCBkZXRhaWw6ICdDOlxcXFxVc2Vyc1xcXFxmb29cXFxcYmF6LnR4dCcsIGtpbmQ6IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkZpbGUgfSxcblx0XHRcdFx0XSwgeyByZXBsYWNlbWVudFJhbmdlOiBbMCwgMTNdIH0sICcvJyk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ3Jlc29sdmVSZXNvdXJjZXMgd2l0aCBjd2QgYXMgV2luZG93cyBwYXRoIChyZWxhdGl2ZSknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc291cmNlT3B0aW9uczogVGVybWluYWxDb21wbGV0aW9uUmVzb3VyY2VPcHRpb25zID0ge1xuXHRcdFx0XHRcdGN3ZDogVVJJLmZpbGUoJ0M6XFxcXFVzZXJzXFxcXGZvbycpLFxuXHRcdFx0XHRcdHNob3dEaXJlY3RvcmllczogdHJ1ZSxcblx0XHRcdFx0XHRzaG93RmlsZXM6IHRydWUsXG5cdFx0XHRcdFx0cGF0aFNlcGFyYXRvcjogJy8nXG5cdFx0XHRcdH07XG5cdFx0XHRcdHZhbGlkUmVzb3VyY2VzID0gW1xuXHRcdFx0XHRcdFVSSS5maWxlKCdDOlxcXFxVc2Vyc1xcXFxmb28nKSxcblx0XHRcdFx0XHRVUkkuZmlsZSgnQzpcXFxcVXNlcnNcXFxcZm9vXFxcXGJhcicpLFxuXHRcdFx0XHRcdFVSSS5maWxlKCdDOlxcXFxVc2Vyc1xcXFxmb29cXFxcYmF6LnR4dCcpXG5cdFx0XHRcdF07XG5cdFx0XHRcdGNoaWxkUmVzb3VyY2VzID0gW1xuXHRcdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5maWxlKCdDOlxcXFxVc2Vyc1xcXFxmb29cXFxcYmFyJyksIGlzRGlyZWN0b3J5OiB0cnVlIH0sXG5cdFx0XHRcdFx0eyByZXNvdXJjZTogVVJJLmZpbGUoJ0M6XFxcXFVzZXJzXFxcXGZvb1xcXFxiYXoudHh0JyksIGlzRmlsZTogdHJ1ZSwgZXhlY3V0YWJsZTogdHJ1ZSB9XG5cdFx0XHRcdF07XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UucmVzb2x2ZVJlc291cmNlcyhyZXNvdXJjZU9wdGlvbnMsICcuLycsIDIsIHByb3ZpZGVyLCBjYXBhYmlsaXRpZXMsIFdpbmRvd3NTaGVsbFR5cGUuR2l0QmFzaCk7XG5cdFx0XHRcdGFzc2VydENvbXBsZXRpb25zKHJlc3VsdCwgW1xuXHRcdFx0XHRcdHsgbGFiZWw6ICcuLycsIGRldGFpbDogJ0M6XFxcXFVzZXJzXFxcXGZvb1xcXFwnIH0sXG5cdFx0XHRcdFx0eyBsYWJlbDogJy4vYmFyLycsIGRldGFpbDogJ0M6XFxcXFVzZXJzXFxcXGZvb1xcXFxiYXJcXFxcJyB9LFxuXHRcdFx0XHRcdHsgbGFiZWw6ICcuL2Jhei50eHQnLCBkZXRhaWw6ICdDOlxcXFxVc2Vyc1xcXFxmb29cXFxcYmF6LnR4dCcsIGtpbmQ6IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkZpbGUgfSxcblx0XHRcdFx0XHR7IGxhYmVsOiAnLi8uLi8nLCBkZXRhaWw6ICdDOlxcXFxVc2Vyc1xcXFwnIH1cblx0XHRcdFx0XSwgeyByZXBsYWNlbWVudFJhbmdlOiBbMCwgMl0gfSwgJy8nKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdyZXNvbHZlUmVzb3VyY2VzIHdpdGggY3dkIGFzIFdpbmRvd3MgcGF0aCAoYWJzb2x1dGUpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXNvdXJjZU9wdGlvbnM6IFRlcm1pbmFsQ29tcGxldGlvblJlc291cmNlT3B0aW9ucyA9IHtcblx0XHRcdFx0XHRjd2Q6IFVSSS5maWxlKCdDOlxcXFxVc2Vyc1xcXFxmb28nKSxcblx0XHRcdFx0XHRzaG93RGlyZWN0b3JpZXM6IHRydWUsXG5cdFx0XHRcdFx0c2hvd0ZpbGVzOiB0cnVlLFxuXHRcdFx0XHRcdHBhdGhTZXBhcmF0b3I6ICcvJ1xuXHRcdFx0XHR9O1xuXHRcdFx0XHR2YWxpZFJlc291cmNlcyA9IFtcblx0XHRcdFx0XHRVUkkuZmlsZSgnQzpcXFxcVXNlcnNcXFxcZm9vJyksXG5cdFx0XHRcdFx0VVJJLmZpbGUoJ0M6XFxcXFVzZXJzXFxcXGZvb1xcXFxiYXInKSxcblx0XHRcdFx0XHRVUkkuZmlsZSgnQzpcXFxcVXNlcnNcXFxcZm9vXFxcXGJhei50eHQnKVxuXHRcdFx0XHRdO1xuXHRcdFx0XHRjaGlsZFJlc291cmNlcyA9IFtcblx0XHRcdFx0XHR7IHJlc291cmNlOiBVUkkuZmlsZSgnQzpcXFxcVXNlcnNcXFxcZm9vXFxcXGJhcicpLCBpc0RpcmVjdG9yeTogdHJ1ZSB9LFxuXHRcdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5maWxlKCdDOlxcXFxVc2Vyc1xcXFxmb29cXFxcYmF6LnR4dCcpLCBpc0ZpbGU6IHRydWUsIGV4ZWN1dGFibGU6IHRydWUgfVxuXHRcdFx0XHRdO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0ZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlLnJlc29sdmVSZXNvdXJjZXMocmVzb3VyY2VPcHRpb25zLCAnL2MvVXNlcnMvZm9vLycsIDEzLCBwcm92aWRlciwgY2FwYWJpbGl0aWVzLCBXaW5kb3dzU2hlbGxUeXBlLkdpdEJhc2gpO1xuXHRcdFx0XHRhc3NlcnRDb21wbGV0aW9ucyhyZXN1bHQsIFtcblx0XHRcdFx0XHR7IGxhYmVsOiAnL2MvVXNlcnMvZm9vLycsIGRldGFpbDogJ0M6XFxcXFVzZXJzXFxcXGZvb1xcXFwnIH0sXG5cdFx0XHRcdFx0eyBsYWJlbDogJy9jL1VzZXJzL2Zvby9iYXIvJywgZGV0YWlsOiAnQzpcXFxcVXNlcnNcXFxcZm9vXFxcXGJhclxcXFwnIH0sXG5cdFx0XHRcdFx0eyBsYWJlbDogJy9jL1VzZXJzL2Zvby9iYXoudHh0JywgZGV0YWlsOiAnQzpcXFxcVXNlcnNcXFxcZm9vXFxcXGJhei50eHQnLCBraW5kOiBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5GaWxlIH0sXG5cdFx0XHRcdF0sIHsgcmVwbGFjZW1lbnRSYW5nZTogWzAsIDEzXSB9LCAnLycpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblx0aWYgKCFpc1dpbmRvd3MpIHtcblx0XHRzdWl0ZSgnc3ltbGluayBzdXBwb3J0JywgKCkgPT4ge1xuXHRcdFx0dGVzdCgnc2hvdWxkIGluY2x1ZGUgc3ltbGluayB0YXJnZXQgaW5mb3JtYXRpb24gaW4gY29tcGxldGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc291cmNlT3B0aW9uczogVGVybWluYWxDb21wbGV0aW9uUmVzb3VyY2VPcHRpb25zID0ge1xuXHRcdFx0XHRcdGN3ZDogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QnKSxcblx0XHRcdFx0XHRwYXRoU2VwYXJhdG9yLFxuXHRcdFx0XHRcdHNob3dGaWxlczogdHJ1ZSxcblx0XHRcdFx0XHRzaG93RGlyZWN0b3JpZXM6IHRydWVcblx0XHRcdFx0fTtcblxuXHRcdFx0XHR2YWxpZFJlc291cmNlcyA9IFtVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdCcpXTtcblxuXHRcdFx0XHQvLyBDcmVhdGUgbW9jayBjaGlsZHJlbiBpbmNsdWRpbmcgYSBzeW1ib2xpYyBsaW5rXG5cdFx0XHRcdGNoaWxkUmVzb3VyY2VzID0gW1xuXHRcdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0L3JlZ3VsYXItZmlsZS50eHQnKSwgaXNGaWxlOiB0cnVlIH0sXG5cdFx0XHRcdFx0eyByZXNvdXJjZTogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3Qvc3ltbGluay1maWxlJyksIGlzRmlsZTogdHJ1ZSwgaXNTeW1ib2xpY0xpbms6IHRydWUgfSxcblx0XHRcdFx0XHR7IHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC9zeW1saW5rLWZvbGRlcicpLCBpc0RpcmVjdG9yeTogdHJ1ZSwgaXNTeW1ib2xpY0xpbms6IHRydWUgfSxcblx0XHRcdFx0XHR7IHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC9yZWd1bGFyLWZvbGRlcicpLCBpc0RpcmVjdG9yeTogdHJ1ZSB9LFxuXHRcdFx0XHRdO1xuXG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UucmVzb2x2ZVJlc291cmNlcyhyZXNvdXJjZU9wdGlvbnMsICdscyAnLCAzLCBwcm92aWRlciwgY2FwYWJpbGl0aWVzKTtcblxuXHRcdFx0XHQvLyBGaW5kIHRoZSBzeW1saW5rIGNvbXBsZXRpb25cblx0XHRcdFx0Y29uc3Qgc3ltbGlua0ZpbGVDb21wbGV0aW9uID0gcmVzdWx0Py5maW5kKGMgPT4gYy5sYWJlbCA9PT0gJy4vc3ltbGluay1maWxlJyk7XG5cdFx0XHRcdGNvbnN0IHN5bWxpbmtGb2xkZXJDb21wbGV0aW9uID0gcmVzdWx0Py5maW5kKGMgPT4gYy5sYWJlbCA9PT0gJy4vc3ltbGluay1mb2xkZXIvJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzeW1saW5rRmlsZUNvbXBsZXRpb24/LmRldGFpbCwgJy90ZXN0L3N5bWxpbmstZmlsZSAtPiAvdGFyZ2V0L2FjdHVhbC1maWxlLnR4dCcsICdTeW1saW5rIGZpbGUgZGV0YWlsIHNob3VsZCBtYXRjaCB0YXJnZXQnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN5bWxpbmtGb2xkZXJDb21wbGV0aW9uPy5kZXRhaWwsICcvdGVzdC9zeW1saW5rLWZvbGRlciAtPiAvdGFyZ2V0L2FjdHVhbC1mb2xkZXInLCAnU3ltbGluayBmb2xkZXIgZGV0YWlsIHNob3VsZCBtYXRjaCB0YXJnZXQnKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cdGlmICghaXNXaW5kb3dzKSB7XG5cdFx0c3VpdGUoJ3JlbW90ZSBmaWxlIGNvbXBsZXRpb24gKGUuZy4gV1NMKScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlbW90ZUF1dGhvcml0eSA9ICd3c2wrVWJ1bnR1Jztcblx0XHRcdGNvbnN0IHJlbW90ZVRlc3RFbnY6IElQcm9jZXNzRW52aXJvbm1lbnQgPSB7XG5cdFx0XHRcdEhPTUU6ICcvaG9tZS9yZW1vdGV1c2VyJyxcblx0XHRcdFx0VVNFUlBST0ZJTEU6ICcvaG9tZS9yZW1vdGV1c2VyJ1xuXHRcdFx0fTtcblxuXHRcdFx0dGVzdCgnL2Fic29sdXRlL3BhdGggc2hvdWxkIHByZXNlcnZlIHJlbW90ZSBhdXRob3JpdHknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHRlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UucHJvY2Vzc0VudiA9IHJlbW90ZVRlc3RFbnY7XG5cdFx0XHRcdGNvbnN0IHJlc291cmNlT3B0aW9uczogVGVybWluYWxDb21wbGV0aW9uUmVzb3VyY2VPcHRpb25zID0ge1xuXHRcdFx0XHRcdGN3ZDogVVJJLmZyb20oeyBzY2hlbWU6ICd2c2NvZGUtcmVtb3RlJywgYXV0aG9yaXR5OiByZW1vdGVBdXRob3JpdHksIHBhdGg6ICcvaG9tZS9yZW1vdGV1c2VyJyB9KSxcblx0XHRcdFx0XHRzaG93RGlyZWN0b3JpZXM6IHRydWUsXG5cdFx0XHRcdFx0cGF0aFNlcGFyYXRvcjogJy8nXG5cdFx0XHRcdH07XG5cdFx0XHRcdHZhbGlkUmVzb3VyY2VzID0gW1xuXHRcdFx0XHRcdFVSSS5mcm9tKHsgc2NoZW1lOiAndnNjb2RlLXJlbW90ZScsIGF1dGhvcml0eTogcmVtb3RlQXV0aG9yaXR5LCBwYXRoOiAnL2hvbWUnIH0pLFxuXHRcdFx0XHRcdFVSSS5mcm9tKHsgc2NoZW1lOiAndnNjb2RlLXJlbW90ZScsIGF1dGhvcml0eTogcmVtb3RlQXV0aG9yaXR5LCBwYXRoOiAnL2hvbWUvcmVtb3RldXNlcicgfSksXG5cdFx0XHRcdF07XG5cdFx0XHRcdGNoaWxkUmVzb3VyY2VzID0gW1xuXHRcdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5mcm9tKHsgc2NoZW1lOiAndnNjb2RlLXJlbW90ZScsIGF1dGhvcml0eTogcmVtb3RlQXV0aG9yaXR5LCBwYXRoOiAnL2hvbWUvcmVtb3RldXNlcicgfSksIGlzRGlyZWN0b3J5OiB0cnVlIH0sXG5cdFx0XHRcdF07XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UucmVzb2x2ZVJlc291cmNlcyhyZXNvdXJjZU9wdGlvbnMsICcvaG9tZS8nLCA2LCBwcm92aWRlciwgY2FwYWJpbGl0aWVzKTtcblxuXHRcdFx0XHQvLyBDaGVjayB0aGF0IHJlc3VsdHMgZXhpc3QgYW5kIGhhdmUgdGhlIGNvcnJlY3Qgc2NoZW1lL2F1dGhvcml0eVxuXHRcdFx0XHRhc3NlcnQub2socmVzdWx0ICYmIHJlc3VsdC5sZW5ndGggPiAwLCAnU2hvdWxkIHJldHVybiBjb21wbGV0aW9ucyBmb3IgcmVtb3RlIGFic29sdXRlIHBhdGgnKTtcblx0XHRcdFx0Ly8gVmVyaWZ5IGNvbXBsZXRpb25zIGNvbnRhaW4gcGF0aHMgcmVzb2x2ZWQgdmlhIHRoZSByZW1vdGUgZmlsZSBzZXJ2aWNlIChub3QgbG9jYWwgZmlsZTovLylcblx0XHRcdFx0Y29uc3QgYWJzb2x1dGVDb21wbGV0aW9uID0gcmVzdWx0Py5maW5kKGMgPT4gYy5sYWJlbCA9PT0gJy9ob21lLycpO1xuXHRcdFx0XHRhc3NlcnQub2soYWJzb2x1dGVDb21wbGV0aW9uLCAnU2hvdWxkIGhhdmUgYWJzb2x1dGUgcGF0aCBjb21wbGV0aW9uJyk7XG5cdFx0XHRcdGFzc2VydC5vayhhYnNvbHV0ZUNvbXBsZXRpb24uZGV0YWlsPy5pbmNsdWRlcygnL2hvbWUvJyksICdEZXRhaWwgc2hvdWxkIHNob3cgcmVtb3RlIHBhdGgnKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCd+LyBzaG91bGQgcHJlc2VydmUgcmVtb3RlIGF1dGhvcml0eSBmb3IgdGlsZGUgZXhwYW5zaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0ZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlLnByb2Nlc3NFbnYgPSByZW1vdGVUZXN0RW52O1xuXHRcdFx0XHRjb25zdCByZXNvdXJjZU9wdGlvbnM6IFRlcm1pbmFsQ29tcGxldGlvblJlc291cmNlT3B0aW9ucyA9IHtcblx0XHRcdFx0XHRjd2Q6IFVSSS5mcm9tKHsgc2NoZW1lOiAndnNjb2RlLXJlbW90ZScsIGF1dGhvcml0eTogcmVtb3RlQXV0aG9yaXR5LCBwYXRoOiAnL2hvbWUvcmVtb3RldXNlci9wcm9qZWN0JyB9KSxcblx0XHRcdFx0XHRzaG93RGlyZWN0b3JpZXM6IHRydWUsXG5cdFx0XHRcdFx0cGF0aFNlcGFyYXRvcjogJy8nXG5cdFx0XHRcdH07XG5cdFx0XHRcdHZhbGlkUmVzb3VyY2VzID0gW1xuXHRcdFx0XHRcdFVSSS5mcm9tKHsgc2NoZW1lOiAndnNjb2RlLXJlbW90ZScsIGF1dGhvcml0eTogcmVtb3RlQXV0aG9yaXR5LCBwYXRoOiAnL2hvbWUvcmVtb3RldXNlcicgfSksXG5cdFx0XHRcdFx0VVJJLmZyb20oeyBzY2hlbWU6ICd2c2NvZGUtcmVtb3RlJywgYXV0aG9yaXR5OiByZW1vdGVBdXRob3JpdHksIHBhdGg6ICcvaG9tZS9yZW1vdGV1c2VyL3Byb2plY3QnIH0pLFxuXHRcdFx0XHRdO1xuXHRcdFx0XHRjaGlsZFJlc291cmNlcyA9IFtcblx0XHRcdFx0XHR7IHJlc291cmNlOiBVUkkuZnJvbSh7IHNjaGVtZTogJ3ZzY29kZS1yZW1vdGUnLCBhdXRob3JpdHk6IHJlbW90ZUF1dGhvcml0eSwgcGF0aDogJy9ob21lL3JlbW90ZXVzZXIvRG9jdW1lbnRzJyB9KSwgaXNEaXJlY3Rvcnk6IHRydWUgfSxcblx0XHRcdFx0XHR7IHJlc291cmNlOiBVUkkuZnJvbSh7IHNjaGVtZTogJ3ZzY29kZS1yZW1vdGUnLCBhdXRob3JpdHk6IHJlbW90ZUF1dGhvcml0eSwgcGF0aDogJy9ob21lL3JlbW90ZXVzZXIvcHJvamVjdCcgfSksIGlzRGlyZWN0b3J5OiB0cnVlIH0sXG5cdFx0XHRcdF07XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UucmVzb2x2ZVJlc291cmNlcyhyZXNvdXJjZU9wdGlvbnMsICd+LycsIDIsIHByb3ZpZGVyLCBjYXBhYmlsaXRpZXMpO1xuXG5cdFx0XHRcdC8vIENoZWNrIHRoYXQgcmVzdWx0cyBleGlzdCBmb3IgcmVtb3RlIHRpbGRlIHBhdGhcblx0XHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCAmJiByZXN1bHQubGVuZ3RoID4gMCwgJ1Nob3VsZCByZXR1cm4gY29tcGxldGlvbnMgZm9yIHJlbW90ZSB0aWxkZSBwYXRoJyk7XG5cdFx0XHRcdC8vIFZlcmlmeSB0aGUgdGlsZGUgcGF0aCB3YXMgcmVzb2x2ZWQgdXNpbmcgdGhlIHJlbW90ZSBob21lIGRpcmVjdG9yeVxuXHRcdFx0XHRjb25zdCBkb2N1bWVudHNDb21wbGV0aW9uID0gcmVzdWx0Py5maW5kKGMgPT4gYy5kZXRhaWw/LmluY2x1ZGVzKCdEb2N1bWVudHMnKSk7XG5cdFx0XHRcdGFzc2VydC5vayhkb2N1bWVudHNDb21wbGV0aW9uLCAnU2hvdWxkIGZpbmQgRG9jdW1lbnRzIGZvbGRlciBmcm9tIHJlbW90ZSBob21lJyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnLi9yZWxhdGl2ZSBzaG91bGQgcHJlc2VydmUgcmVtb3RlIGF1dGhvcml0eSBmb3IgcmVsYXRpdmUgcGF0aHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHRlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UucHJvY2Vzc0VudiA9IHJlbW90ZVRlc3RFbnY7XG5cdFx0XHRcdGNvbnN0IHJlc291cmNlT3B0aW9uczogVGVybWluYWxDb21wbGV0aW9uUmVzb3VyY2VPcHRpb25zID0ge1xuXHRcdFx0XHRcdGN3ZDogVVJJLmZyb20oeyBzY2hlbWU6ICd2c2NvZGUtcmVtb3RlJywgYXV0aG9yaXR5OiByZW1vdGVBdXRob3JpdHksIHBhdGg6ICcvaG9tZS9yZW1vdGV1c2VyL3Byb2plY3QnIH0pLFxuXHRcdFx0XHRcdHNob3dEaXJlY3RvcmllczogdHJ1ZSxcblx0XHRcdFx0XHRwYXRoU2VwYXJhdG9yOiAnLydcblx0XHRcdFx0fTtcblx0XHRcdFx0dmFsaWRSZXNvdXJjZXMgPSBbXG5cdFx0XHRcdFx0VVJJLmZyb20oeyBzY2hlbWU6ICd2c2NvZGUtcmVtb3RlJywgYXV0aG9yaXR5OiByZW1vdGVBdXRob3JpdHksIHBhdGg6ICcvaG9tZS9yZW1vdGV1c2VyL3Byb2plY3QnIH0pLFxuXHRcdFx0XHRdO1xuXHRcdFx0XHRjaGlsZFJlc291cmNlcyA9IFtcblx0XHRcdFx0XHR7IHJlc291cmNlOiBVUkkuZnJvbSh7IHNjaGVtZTogJ3ZzY29kZS1yZW1vdGUnLCBhdXRob3JpdHk6IHJlbW90ZUF1dGhvcml0eSwgcGF0aDogJy9ob21lL3JlbW90ZXVzZXIvcHJvamVjdC9zcmMnIH0pLCBpc0RpcmVjdG9yeTogdHJ1ZSB9LFxuXHRcdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5mcm9tKHsgc2NoZW1lOiAndnNjb2RlLXJlbW90ZScsIGF1dGhvcml0eTogcmVtb3RlQXV0aG9yaXR5LCBwYXRoOiAnL2hvbWUvcmVtb3RldXNlci9wcm9qZWN0L2RvY3MnIH0pLCBpc0RpcmVjdG9yeTogdHJ1ZSB9LFxuXHRcdFx0XHRdO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0ZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlLnJlc29sdmVSZXNvdXJjZXMocmVzb3VyY2VPcHRpb25zLCAnLi8nLCAyLCBwcm92aWRlciwgY2FwYWJpbGl0aWVzKTtcblxuXHRcdFx0XHQvLyBDaGVjayB0aGF0IHJlc3VsdHMgZXhpc3QgZm9yIHJlbW90ZSByZWxhdGl2ZSBwYXRoXG5cdFx0XHRcdGFzc2VydC5vayhyZXN1bHQgJiYgcmVzdWx0Lmxlbmd0aCA+IDAsICdTaG91bGQgcmV0dXJuIGNvbXBsZXRpb25zIGZvciByZW1vdGUgcmVsYXRpdmUgcGF0aCcpO1xuXHRcdFx0XHQvLyBWZXJpZnkgY29tcGxldGlvbnMgYXJlIGZyb20gdGhlIHJlbW90ZSBmaWxlc3lzdGVtXG5cdFx0XHRcdGNvbnN0IHNyY0NvbXBsZXRpb24gPSByZXN1bHQ/LmZpbmQoYyA9PiBjLmRldGFpbD8uaW5jbHVkZXMoJy9ob21lL3JlbW90ZXVzZXIvcHJvamVjdC9zcmMnKSk7XG5cdFx0XHRcdGFzc2VydC5vayhzcmNDb21wbGV0aW9uLCAnU2hvdWxkIGZpbmQgc3JjIGZvbGRlciBjb21wbGV0aW9uIHdpdGggcmVtb3RlIHBhdGggaW4gZGV0YWlsJyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdHN1aXRlKCdjb21wbGV0aW9uIGxhYmVsIGVzY2FwaW5nJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3wgc2hvdWxkIGVzY2FwZSBzcGVjaWFsIGNoYXJhY3RlcnMgaW4gZmlsZS9mb2xkZXIgbmFtZXMgZm9yIFBPU0lYIHNoZWxscycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc291cmNlT3B0aW9uczogVGVybWluYWxDb21wbGV0aW9uUmVzb3VyY2VPcHRpb25zID0ge1xuXHRcdFx0XHRjd2Q6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0JyksXG5cdFx0XHRcdHNob3dEaXJlY3RvcmllczogdHJ1ZSxcblx0XHRcdFx0c2hvd0ZpbGVzOiB0cnVlLFxuXHRcdFx0XHRwYXRoU2VwYXJhdG9yXG5cdFx0XHR9O1xuXHRcdFx0dmFsaWRSZXNvdXJjZXMgPSBbVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QnKV07XG5cdFx0XHRjaGlsZFJlc291cmNlcyA9IFtcblx0XHRcdFx0eyByZXNvdXJjZTogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QvW2ZvbGRlcjFdLycpLCBpc0RpcmVjdG9yeTogdHJ1ZSB9LFxuXHRcdFx0XHR7IHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC9mb2xkZXIgMi8nKSwgaXNEaXJlY3Rvcnk6IHRydWUgfSxcblx0XHRcdFx0eyByZXNvdXJjZTogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QvIXNwZWNpYWwkY2hhcnMmLycpLCBpc0RpcmVjdG9yeTogdHJ1ZSB9LFxuXHRcdFx0XHR7IHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC8hc3BlY2lhbCRjaGFyczImJyksIGlzRmlsZTogdHJ1ZSwgZXhlY3V0YWJsZTogdHJ1ZSB9XG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGVybWluYWxDb21wbGV0aW9uU2VydmljZS5yZXNvbHZlUmVzb3VyY2VzKHJlc291cmNlT3B0aW9ucywgJycsIDAsIHByb3ZpZGVyLCBjYXBhYmlsaXRpZXMpO1xuXG5cdFx0XHRhc3NlcnRDb21wbGV0aW9ucyhyZXN1bHQsIFtcblx0XHRcdFx0eyBsYWJlbDogJy4nLCBkZXRhaWw6ICcvdGVzdC8nIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICcuL1tmb2xkZXIxXS8nLCBkZXRhaWw6ICcvdGVzdC9cXFtmb2xkZXIxXVxcLycgfSxcblx0XHRcdFx0eyBsYWJlbDogJy4vZm9sZGVyXFwgMi8nLCBkZXRhaWw6ICcvdGVzdC9mb2xkZXJcXCAyLycgfSxcblx0XHRcdFx0eyBsYWJlbDogJy4vXFwhc3BlY2lhbFxcJGNoYXJzXFwmLycsIGRldGFpbDogJy90ZXN0L1xcIXNwZWNpYWxcXCRjaGFyc1xcJi8nIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICcuL1xcIXNwZWNpYWxcXCRjaGFyczJcXCYnLCBkZXRhaWw6ICcvdGVzdC9cXCFzcGVjaWFsXFwkY2hhcnMyXFwmJywga2luZDogVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuRmlsZSB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnLi4vJywgZGV0YWlsOiAnLycgfSxcblx0XHRcdFx0c3RhbmRhcmRUaWxkZUl0ZW0sXG5cdFx0XHRdLCB7IHJlcGxhY2VtZW50UmFuZ2U6IFswLCAwXSB9KTtcblx0XHR9KTtcblxuXHR9KTtcblxuXHRzdWl0ZSgnUHJvdmlkZXIgQ29uZmlndXJhdGlvbicsICgpID0+IHtcblx0XHQvLyBUZXN0IGNsYXNzIHRoYXQgZXh0ZW5kcyBUZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlIHRvIGFjY2VzcyBwcm90ZWN0ZWQgbWV0aG9kc1xuXHRcdGNsYXNzIFRlc3RUZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlIGV4dGVuZHMgVGVybWluYWxDb21wbGV0aW9uU2VydmljZSB7XG5cdFx0XHRwdWJsaWMgZ2V0RW5hYmxlZFByb3ZpZGVycyhwcm92aWRlcnM6IElUZXJtaW5hbENvbXBsZXRpb25Qcm92aWRlcltdKTogSVRlcm1pbmFsQ29tcGxldGlvblByb3ZpZGVyW10ge1xuXHRcdFx0XHRyZXR1cm4gc3VwZXIuX2dldEVuYWJsZWRQcm92aWRlcnMocHJvdmlkZXJzKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRsZXQgdGVzdFRlcm1pbmFsQ29tcGxldGlvblNlcnZpY2U6IFRlc3RUZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlO1xuXG5cdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0dGVzdFRlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFRlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UpKTtcblx0XHR9KTtcblxuXHRcdC8vIE1vY2sgcHJvdmlkZXIgZm9yIHRlc3Rpbmdcblx0XHRmdW5jdGlvbiBjcmVhdGVNb2NrUHJvdmlkZXIoaWQ6IHN0cmluZyk6IElUZXJtaW5hbENvbXBsZXRpb25Qcm92aWRlciB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpZCxcblx0XHRcdFx0cHJvdmlkZUNvbXBsZXRpb25zOiBhc3luYyAoKSA9PiBbe1xuXHRcdFx0XHRcdGxhYmVsOiBgY29tcGxldGlvbi1mcm9tLSR7aWR9YCxcblx0XHRcdFx0XHRraW5kOiBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5NZXRob2QsXG5cdFx0XHRcdFx0cmVwbGFjZW1lbnRSYW5nZTogWzAsIDBdLFxuXHRcdFx0XHRcdHByb3ZpZGVyOiBpZFxuXHRcdFx0XHR9XVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHR0ZXN0KCdzaG91bGQgZW5hYmxlIHByb3ZpZGVycyBieSBkZWZhdWx0IHdoZW4gbm8gY29uZmlndXJhdGlvbiBleGlzdHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBkZWZhdWx0UHJvdmlkZXIgPSBjcmVhdGVNb2NrUHJvdmlkZXIoJ3Rlcm1pbmFsLXN1Z2dlc3QnKTtcblx0XHRcdGNvbnN0IG5ld1Byb3ZpZGVyID0gY3JlYXRlTW9ja1Byb3ZpZGVyKCduZXctZXh0ZW5zaW9uLXByb3ZpZGVyJyk7XG5cdFx0XHRjb25zdCBwcm92aWRlcnMgPSBbZGVmYXVsdFByb3ZpZGVyLCBuZXdQcm92aWRlcl07XG5cblx0XHRcdC8vIFNldCBlbXB0eSBjb25maWd1cmF0aW9uIChubyBwcm92aWRlciBrZXlzKVxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oVGVybWluYWxTdWdnZXN0U2V0dGluZ0lkLlByb3ZpZGVycywge30pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSB0ZXN0VGVybWluYWxDb21wbGV0aW9uU2VydmljZS5nZXRFbmFibGVkUHJvdmlkZXJzKHByb3ZpZGVycyk7XG5cblx0XHRcdC8vIEJvdGggcHJvdmlkZXJzIHNob3VsZCBiZSBlbmFibGVkIHNpbmNlIHRoZXkncmUgbm90IGV4cGxpY2l0bHkgZGlzYWJsZWRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAyLCAnU2hvdWxkIGVuYWJsZSBib3RoIHByb3ZpZGVycyBieSBkZWZhdWx0Jyk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKGRlZmF1bHRQcm92aWRlciksICdTaG91bGQgaW5jbHVkZSBkZWZhdWx0IHByb3ZpZGVyJyk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKG5ld1Byb3ZpZGVyKSwgJ1Nob3VsZCBpbmNsdWRlIG5ldyBwcm92aWRlcicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGRpc2FibGUgcHJvdmlkZXJzIHdoZW4gZXhwbGljaXRseSBzZXQgdG8gZmFsc2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlcjEgPSBjcmVhdGVNb2NrUHJvdmlkZXIoJ3Byb3ZpZGVyMScpO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIyID0gY3JlYXRlTW9ja1Byb3ZpZGVyKCdwcm92aWRlcjInKTtcblx0XHRcdGNvbnN0IHByb3ZpZGVycyA9IFtwcm92aWRlcjEsIHByb3ZpZGVyMl07XG5cblx0XHRcdC8vIERpc2FibGUgcHJvdmlkZXIxLCBsZWF2ZSBwcm92aWRlcjIgdW5jb25maWd1cmVkXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihUZXJtaW5hbFN1Z2dlc3RTZXR0aW5nSWQuUHJvdmlkZXJzLCB7XG5cdFx0XHRcdCdwcm92aWRlcjEnOiBmYWxzZVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRlc3RUZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlLmdldEVuYWJsZWRQcm92aWRlcnMocHJvdmlkZXJzKTtcblxuXHRcdFx0Ly8gT25seSBwcm92aWRlcjIgc2hvdWxkIGJlIGVuYWJsZWRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxLCAnU2hvdWxkIGVuYWJsZSBvbmx5IG9uZSBwcm92aWRlcicpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcyhwcm92aWRlcjIpLCAnU2hvdWxkIGluY2x1ZGUgdW5jb25maWd1cmVkIHByb3ZpZGVyJyk7XG5cdFx0XHRhc3NlcnQub2soIXJlc3VsdC5pbmNsdWRlcyhwcm92aWRlcjEpLCAnU2hvdWxkIG5vdCBpbmNsdWRlIGRpc2FibGVkIHByb3ZpZGVyJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZW5hYmxlIHByb3ZpZGVycyB3aGVuIGV4cGxpY2l0bHkgc2V0IHRvIHRydWUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlcjEgPSBjcmVhdGVNb2NrUHJvdmlkZXIoJ3Byb3ZpZGVyMScpO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIyID0gY3JlYXRlTW9ja1Byb3ZpZGVyKCdwcm92aWRlcjInKTtcblx0XHRcdGNvbnN0IHByb3ZpZGVycyA9IFtwcm92aWRlcjEsIHByb3ZpZGVyMl07XG5cblx0XHRcdC8vIEV4cGxpY2l0bHkgZW5hYmxlIHByb3ZpZGVyMSwgbGVhdmUgcHJvdmlkZXIyIHVuY29uZmlndXJlZFxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oVGVybWluYWxTdWdnZXN0U2V0dGluZ0lkLlByb3ZpZGVycywge1xuXHRcdFx0XHQncHJvdmlkZXIxJzogdHJ1ZVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRlc3RUZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlLmdldEVuYWJsZWRQcm92aWRlcnMocHJvdmlkZXJzKTtcblxuXHRcdFx0Ly8gQm90aCBwcm92aWRlcnMgc2hvdWxkIGJlIGVuYWJsZWRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAyLCAnU2hvdWxkIGVuYWJsZSBib3RoIHByb3ZpZGVycycpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcyhwcm92aWRlcjEpLCAnU2hvdWxkIGluY2x1ZGUgZXhwbGljaXRseSBlbmFibGVkIHByb3ZpZGVyJyk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKHByb3ZpZGVyMiksICdTaG91bGQgaW5jbHVkZSB1bmNvbmZpZ3VyZWQgcHJvdmlkZXInKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgbWl4ZWQgY29uZmlndXJhdGlvbiBjb3JyZWN0bHknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlcjEgPSBjcmVhdGVNb2NrUHJvdmlkZXIoJ3Byb3ZpZGVyMScpO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIyID0gY3JlYXRlTW9ja1Byb3ZpZGVyKCdwcm92aWRlcjInKTtcblx0XHRcdGNvbnN0IHByb3ZpZGVyMyA9IGNyZWF0ZU1vY2tQcm92aWRlcigncHJvdmlkZXIzJyk7XG5cdFx0XHRjb25zdCBwcm92aWRlcnMgPSBbcHJvdmlkZXIxLCBwcm92aWRlcjIsIHByb3ZpZGVyM107XG5cblx0XHRcdC8vIE1peGVkIGNvbmZpZ3VyYXRpb246IGVuYWJsZSBwcm92aWRlcjEsIGRpc2FibGUgcHJvdmlkZXIyLCBsZWF2ZSBwcm92aWRlcjMgdW5jb25maWd1cmVkXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihUZXJtaW5hbFN1Z2dlc3RTZXR0aW5nSWQuUHJvdmlkZXJzLCB7XG5cdFx0XHRcdCdwcm92aWRlcjEnOiB0cnVlLFxuXHRcdFx0XHQncHJvdmlkZXIyJzogZmFsc2Vcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSB0ZXN0VGVybWluYWxDb21wbGV0aW9uU2VydmljZS5nZXRFbmFibGVkUHJvdmlkZXJzKHByb3ZpZGVycyk7XG5cblx0XHRcdC8vIHByb3ZpZGVyMSBhbmQgcHJvdmlkZXIzIHNob3VsZCBiZSBlbmFibGVkLCBwcm92aWRlcjIgc2hvdWxkIGJlIGRpc2FibGVkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMiwgJ1Nob3VsZCBlbmFibGUgdHdvIHByb3ZpZGVycycpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcyhwcm92aWRlcjEpLCAnU2hvdWxkIGluY2x1ZGUgZXhwbGljaXRseSBlbmFibGVkIHByb3ZpZGVyJyk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKHByb3ZpZGVyMyksICdTaG91bGQgaW5jbHVkZSB1bmNvbmZpZ3VyZWQgcHJvdmlkZXInKTtcblx0XHRcdGFzc2VydC5vayghcmVzdWx0LmluY2x1ZGVzKHByb3ZpZGVyMiksICdTaG91bGQgbm90IGluY2x1ZGUgZGlzYWJsZWQgcHJvdmlkZXInKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsV0FBVztBQUNwQixTQUFTLG9CQUF3RTtBQUNqRixTQUFTLGlDQUFzRztBQUMvRyxTQUFTLCtDQUErQztBQUN4RCxPQUFPLFVBQVUsWUFBWTtBQUM3QixTQUFTLGlCQUEyQztBQUVwRCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUE4QixrQ0FBa0M7QUFDaEUsU0FBUyxhQUFhO0FBQ3RCLFNBQVMscUJBQXFCLHdCQUF3QjtBQUN0RCxTQUFTLHNCQUFzQiw0QkFBNEI7QUFDM0QsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxpQkFBaUIscUNBQXFDO0FBRS9ELE1BQU0sZ0JBQWdCLFlBQVksT0FBTztBQWV6QyxTQUFTLGtCQUFrQixRQUEyQyxVQUEwQyxnQkFBNkMsU0FBa0I7QUFDOUssUUFBTSxNQUFNLFdBQVc7QUFDdkIsU0FBTztBQUFBLElBQ04sUUFBUSxJQUFJLFFBQU07QUFBQSxNQUNqQixPQUFPLEVBQUU7QUFBQSxNQUNULFFBQVEsRUFBRSxVQUFVO0FBQUEsTUFDcEIsTUFBTSxFQUFFLFFBQVEsMkJBQTJCO0FBQUEsTUFDM0Msa0JBQWtCLEVBQUU7QUFBQSxJQUNyQixFQUFFO0FBQUEsSUFBRyxTQUFTLElBQUksUUFBTTtBQUFBLE1BQ3ZCLE9BQU8sRUFBRSxNQUFNLFdBQVcsS0FBSyxHQUFHO0FBQUEsTUFDbEMsUUFBUSxFQUFFLFNBQVMsRUFBRSxPQUFPLFdBQVcsS0FBSyxHQUFHLElBQUk7QUFBQSxNQUNuRCxNQUFNLEVBQUUsUUFBUSwyQkFBMkI7QUFBQSxNQUMzQyxrQkFBa0IsZUFBZTtBQUFBLElBQ2xDLEVBQUU7QUFBQSxFQUNIO0FBQ0Q7QUFLQSxTQUFTLDhCQUE4QixRQUEyQyxpQkFBaUQsZ0JBQTZDO0FBQy9LLE1BQUksQ0FBQyxRQUFRO0FBQ1osU0FBSztBQUFBLEVBQ047QUFDQSxRQUFNLGlCQUFpQixnQkFBZ0IsSUFBSSxRQUFNO0FBQUEsSUFDaEQsT0FBTyxFQUFFLE1BQU0sV0FBVyxLQUFLLGFBQWE7QUFBQSxJQUM1QyxRQUFRLEVBQUUsU0FBUyxFQUFFLE9BQU8sV0FBVyxLQUFLLGFBQWEsSUFBSTtBQUFBLElBQzdELE1BQU0sRUFBRSxRQUFRLDJCQUEyQjtBQUFBLElBQzNDLGtCQUFrQixlQUFlO0FBQUEsRUFDbEMsRUFBRTtBQUNGLGFBQVcsZ0JBQWdCLGdCQUFnQjtBQUMxQyxXQUFPLGdCQUFnQixPQUFPLElBQUksUUFBTTtBQUFBLE1BQ3ZDLE9BQU8sRUFBRTtBQUFBLE1BQ1QsUUFBUSxFQUFFLFVBQVU7QUFBQSxNQUNwQixNQUFNLEVBQUUsUUFBUSwyQkFBMkI7QUFBQSxNQUMzQyxrQkFBa0IsRUFBRTtBQUFBLElBQ3JCLEVBQUUsRUFBRSxLQUFLLE9BQUssRUFBRSxXQUFXLGFBQWEsTUFBTSxHQUFHLFlBQVk7QUFBQSxFQUM5RDtBQUNEO0FBRUEsTUFBTSxVQUErQjtBQUFBLEVBQ3BDLE1BQU07QUFBQSxFQUNOLGFBQWE7QUFDZDtBQUVBLElBQUksVUFBVSxZQUFZLFFBQVEsYUFBYSxJQUFJLFFBQVEsTUFBTTtBQUNqRSxJQUFJLENBQUMsUUFBUyxTQUFTLEdBQUcsR0FBRztBQUM1QixhQUFXO0FBQ1o7QUFDQSxNQUFNLG9CQUFvQixPQUFPLE9BQU8sRUFBRSxPQUFPLEtBQUssUUFBUSxRQUFRLENBQUM7QUFFdkUsTUFBTSw2QkFBNkIsTUFBTTtBQUN4QyxRQUFNLFFBQVEsd0NBQXdDO0FBQ3RELE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUNKLFFBQU0sV0FBVztBQUVqQixRQUFNLE1BQU07QUFDWCwyQkFBdUIsOEJBQThCO0FBQUEsTUFDcEQsYUFBYSxNQUFNLElBQUksZ0JBQWdCLElBQUksS0FBSyxXQUFXLEdBQUcsQ0FBQztBQUFBLElBQ2hFLEdBQUcsS0FBSztBQUNSLFVBQU0sZ0JBQWdCLENBQUMsU0FBaUIsU0FBUyxNQUFNLE9BQU8sS0FBSyxRQUFRLFFBQVEsRUFBRTtBQUNyRixVQUFNLG9CQUFvQixDQUFDLGFBQWtCLGVBQWUsS0FBSyxPQUFLLGNBQWMsRUFBRSxJQUFJLE1BQU0sY0FBYyxTQUFTLElBQUksQ0FBQyxLQUFLLGVBQWUsS0FBSyxPQUFLLGNBQWMsRUFBRSxTQUFTLElBQUksTUFBTSxjQUFjLFNBQVMsSUFBSSxDQUFDO0FBQ3pOLDJCQUF1QixJQUFJLHlCQUF5QjtBQUNwRCx5QkFBcUIsS0FBSyxxQkFBcUIsSUFBSSxlQUFlLENBQUM7QUFDbkUseUJBQXFCLEtBQUssdUJBQXVCLG9CQUFvQjtBQUNyRSx5QkFBcUIsS0FBSyxjQUFjO0FBQUEsTUFDdkMsTUFBTSxLQUFLLFVBQVU7QUFDcEIsWUFBSSxDQUFDLGtCQUFrQixRQUFRLEdBQUc7QUFDakMsZ0JBQU0sSUFBSSxNQUFNLGVBQWdCO0FBQUEsUUFDakM7QUFDQSxlQUFPLGVBQWUsUUFBUTtBQUFBLE1BQy9CO0FBQUEsTUFDQSxNQUFNLFFBQVEsVUFBZSxTQUFzRTtBQUNsRyxZQUFJLENBQUMsa0JBQWtCLFFBQVEsR0FBRztBQUNqQyxnQkFBTSxJQUFJLE1BQU0sZUFBZ0I7QUFBQSxRQUNqQztBQUNBLGNBQU0sV0FBVyxlQUFlLE9BQU8sV0FBUztBQUMvQyxnQkFBTSxjQUFjLE1BQU0sU0FBUyxLQUFLLFFBQVEsT0FBTyxFQUFFO0FBQ3pELGdCQUFNLGVBQWUsU0FBUyxLQUFLLFFBQVEsT0FBTyxFQUFFO0FBQ3BELGlCQUNDLFlBQVksV0FBVyxZQUFZLEtBQ25DLE1BQU0sYUFBYSxHQUFHLE1BQU0sTUFBTSxjQUFjLEdBQUcsSUFBSTtBQUFBLFFBRXpELENBQUM7QUFDRCxlQUFPLGVBQWUsVUFBVSxRQUFXLFFBQVcsUUFBVyxRQUFXLFFBQVE7QUFBQSxNQUNyRjtBQUFBLE1BQ0EsTUFBTSxTQUFTLFVBQXlDO0FBQ3ZELFlBQUksU0FBUyxLQUFLLFNBQVMsY0FBYyxHQUFHO0FBQzNDLGlCQUFPLFNBQVMsS0FBSyxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFBQSxRQUN6RCxXQUFXLFNBQVMsS0FBSyxTQUFTLGdCQUFnQixHQUFHO0FBQ3BELGlCQUFPLFNBQVMsS0FBSyxFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFBQSxRQUN2RDtBQUNBLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRCxDQUFDO0FBQ0QsZ0NBQTRCLE1BQU0sSUFBSSxxQkFBcUIsZUFBZSx5QkFBeUIsQ0FBQztBQUNwRyw4QkFBMEIsYUFBYTtBQUN2QyxxQkFBaUIsQ0FBQztBQUNsQixxQkFBaUIsQ0FBQztBQUNsQixtQkFBZSxNQUFNLElBQUksSUFBSSx3QkFBd0IsQ0FBQztBQUFBLEVBQ3ZELENBQUM7QUFFRCxRQUFNLDRDQUE0QyxNQUFNO0FBQ3ZELFNBQUsscURBQXFELFlBQVk7QUFDckUsWUFBTSxrQkFBcUQ7QUFBQSxRQUMxRCxLQUFLLElBQUksTUFBTSxjQUFjO0FBQUEsUUFDN0I7QUFBQSxNQUNEO0FBQ0EsdUJBQWlCLENBQUMsSUFBSSxNQUFNLGNBQWMsQ0FBQztBQUMzQyxZQUFNLFNBQVMsTUFBTSwwQkFBMEIsaUJBQWlCLGlCQUFpQixPQUFPLEdBQUcsVUFBVSxZQUFZO0FBQ2pILGFBQU8sQ0FBQyxNQUFNO0FBQUEsSUFDZixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSxxREFBcUQsTUFBTTtBQUNoRSxVQUFNLE1BQU07QUFDWCx1QkFBaUIsQ0FBQyxJQUFJLE1BQU0sY0FBYyxDQUFDO0FBQzNDLHVCQUFpQjtBQUFBLFFBQ2hCLEVBQUUsVUFBVSxJQUFJLE1BQU0sdUJBQXVCLEdBQUcsYUFBYSxNQUFNLFFBQVEsTUFBTTtBQUFBLFFBQ2pGLEVBQUUsVUFBVSxJQUFJLE1BQU0sd0JBQXdCLEdBQUcsYUFBYSxPQUFPLFFBQVEsS0FBSztBQUFBLE1BQ25GO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSywwQ0FBMEMsWUFBWTtBQUMxRCxZQUFNLGtCQUFxRDtBQUFBLFFBQzFELEtBQUssSUFBSSxNQUFNLGNBQWM7QUFBQSxRQUM3QixpQkFBaUI7QUFBQSxRQUNqQjtBQUFBLE1BQ0Q7QUFDQSxZQUFNLFNBQVMsTUFBTSwwQkFBMEIsaUJBQWlCLGlCQUFpQixJQUFJLEdBQUcsVUFBVSxZQUFZO0FBRTlHLHdCQUFrQixRQUFRO0FBQUEsUUFDekIsRUFBRSxPQUFPLEtBQUssUUFBUSxTQUFTO0FBQUEsUUFDL0IsRUFBRSxPQUFPLGNBQWMsUUFBUSxpQkFBaUI7QUFBQSxRQUNoRCxFQUFFLE9BQU8sT0FBTyxRQUFRLElBQUk7QUFBQSxRQUM1QjtBQUFBLE1BQ0QsR0FBRyxFQUFFLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7QUFBQSxJQUNoQyxDQUFDO0FBRUQsU0FBSyx3Q0FBd0MsWUFBWTtBQUN4RCxZQUFNLGtCQUFxRDtBQUFBLFFBQzFELEtBQUssSUFBSSxNQUFNLGNBQWM7QUFBQSxRQUM3QixpQkFBaUI7QUFBQSxRQUNqQjtBQUFBLE1BQ0Q7QUFDQSxZQUFNLFNBQVMsTUFBTSwwQkFBMEIsaUJBQWlCLGlCQUFpQixNQUFNLEdBQUcsVUFBVSxZQUFZO0FBRWhILHdCQUFrQixRQUFRO0FBQUEsUUFDekIsRUFBRSxPQUFPLE1BQU0sUUFBUSxTQUFTO0FBQUEsUUFDaEMsRUFBRSxPQUFPLGNBQWMsUUFBUSxpQkFBaUI7QUFBQSxRQUNoRCxFQUFFLE9BQU8sU0FBUyxRQUFRLElBQUk7QUFBQSxNQUMvQixHQUFHLEVBQUUsa0JBQWtCLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztBQUFBLElBQ2hDLENBQUM7QUFFRCxTQUFLLGdEQUFnRCxZQUFZO0FBR2hFLHVCQUFpQjtBQUFBLFFBQ2hCLElBQUksTUFBTSx3QkFBd0I7QUFBQSxRQUNsQyxJQUFJLE1BQU0sZ0JBQWdCO0FBQUEsTUFDM0I7QUFDQSx1QkFBaUI7QUFBQSxRQUNoQixFQUFFLFVBQVUsSUFBSSxNQUFNLHlCQUF5QixHQUFHLGFBQWEsS0FBSztBQUFBLFFBQ3BFLEVBQUUsVUFBVSxJQUFJLE1BQU0seUJBQXlCLEdBQUcsYUFBYSxLQUFLO0FBQUEsTUFDckU7QUFDQSxZQUFNLGtCQUFxRDtBQUFBLFFBQzFELEtBQUssSUFBSSxNQUFNLHdCQUF3QjtBQUFBLFFBQ3ZDLGlCQUFpQjtBQUFBLFFBQ2pCO0FBQUEsTUFDRDtBQUNBLFlBQU0sU0FBUyxNQUFNLDBCQUEwQixpQkFBaUIsaUJBQWlCLE9BQU8sR0FBRyxVQUFVLFlBQVk7QUFFakgsd0JBQWtCLFFBQVE7QUFBQSxRQUN6QixFQUFFLE9BQU8sT0FBTyxRQUFRLFdBQVc7QUFBQSxRQUNuQyxFQUFFLE9BQU8sZUFBZSxRQUFRLG1CQUFtQjtBQUFBLFFBQ25ELEVBQUUsT0FBTyxlQUFlLFFBQVEsbUJBQW1CO0FBQUEsUUFDbkQsRUFBRSxPQUFPLFVBQVUsUUFBUSxJQUFJO0FBQUEsTUFDaEMsR0FBRyxFQUFFLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7QUFBQSxJQUNoQyxDQUFDO0FBRUQsU0FBSywyQ0FBMkMsWUFBWTtBQUMzRCxZQUFNLGtCQUFxRDtBQUFBLFFBQzFELEtBQUssSUFBSSxNQUFNLGNBQWM7QUFBQSxRQUM3QixpQkFBaUI7QUFBQSxRQUNqQjtBQUFBLE1BQ0Q7QUFDQSxZQUFNLFNBQVMsTUFBTSwwQkFBMEIsaUJBQWlCLGlCQUFpQixTQUFTLEdBQUcsVUFBVSxZQUFZO0FBRW5ILHdCQUFrQixRQUFRO0FBQUEsUUFDekIsRUFBRSxPQUFPLE1BQU0sUUFBUSxTQUFTO0FBQUEsUUFDaEMsRUFBRSxPQUFPLGNBQWMsUUFBUSxpQkFBaUI7QUFBQSxRQUNoRCxFQUFFLE9BQU8sU0FBUyxRQUFRLElBQUk7QUFBQSxNQUMvQixHQUFHLEVBQUUsa0JBQWtCLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztBQUFBLElBQ2hDLENBQUM7QUFDRCxTQUFLLDRDQUE0QyxZQUFZO0FBQzVELFlBQU0sa0JBQXFEO0FBQUEsUUFDMUQsS0FBSyxJQUFJLE1BQU0sY0FBYztBQUFBLFFBQzdCLGlCQUFpQjtBQUFBLFFBQ2pCO0FBQUEsTUFDRDtBQUNBLFlBQU0sU0FBUyxNQUFNLDBCQUEwQixpQkFBaUIsaUJBQWlCLFVBQVUsR0FBRyxVQUFVLFlBQVk7QUFFcEgsd0JBQWtCLFFBQVE7QUFBQSxRQUN6QixFQUFFLE9BQU8sTUFBTSxRQUFRLFNBQVM7QUFBQSxRQUNoQyxFQUFFLE9BQU8sY0FBYyxRQUFRLGlCQUFpQjtBQUFBLFFBQ2hELEVBQUUsT0FBTyxTQUFTLFFBQVEsSUFBSTtBQUFBLE1BQy9CLEdBQUcsRUFBRSxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO0FBQUEsSUFDaEMsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sZ0ZBQWdGLE1BQU07QUFDM0YsVUFBTSxNQUFNO0FBQ1gsdUJBQWlCLENBQUMsSUFBSSxNQUFNLGNBQWMsQ0FBQztBQUMzQyx1QkFBaUI7QUFBQSxRQUNoQixFQUFFLFVBQVUsSUFBSSxNQUFNLDBCQUEwQixHQUFHLFFBQVEsTUFBTSxZQUFZLEtBQUs7QUFBQSxRQUNsRixFQUFFLFVBQVUsSUFBSSxNQUFNLDZCQUE2QixHQUFHLGFBQWEsS0FBSztBQUFBLFFBQ3hFLEVBQUUsVUFBVSxJQUFJLE1BQU0sdUJBQXVCLEdBQUcsYUFBYSxLQUFLO0FBQUEsUUFDbEUsRUFBRSxVQUFVLElBQUksTUFBTSx3QkFBd0IsR0FBRyxRQUFRLE1BQU0sWUFBWSxLQUFLO0FBQUEsTUFDakY7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLDhDQUE4QyxZQUFZO0FBQzlELFlBQU0sa0JBQXFEO0FBQUEsUUFDMUQsS0FBSyxJQUFJLE1BQU0sY0FBYztBQUFBLFFBQzdCLGlCQUFpQjtBQUFBLFFBQ2pCLFdBQVc7QUFBQSxRQUNYO0FBQUEsTUFDRDtBQUNBLFlBQU0sU0FBUyxNQUFNLDBCQUEwQixpQkFBaUIsaUJBQWlCLE1BQU0sR0FBRyxVQUFVLFlBQVk7QUFFaEgsd0JBQWtCLFFBQVE7QUFBQSxRQUN6QixFQUFFLE9BQU8sTUFBTSxRQUFRLFNBQVM7QUFBQSxRQUNoQyxFQUFFLE9BQU8saUJBQWlCLFFBQVEscUJBQXFCLE1BQU0sMkJBQTJCLEtBQUs7QUFBQSxRQUM3RixFQUFFLE9BQU8sb0JBQW9CLFFBQVEsdUJBQXVCO0FBQUEsUUFDNUQsRUFBRSxPQUFPLGNBQWMsUUFBUSxpQkFBaUI7QUFBQSxRQUNoRCxFQUFFLE9BQU8sZUFBZSxRQUFRLG1CQUFtQixNQUFNLDJCQUEyQixLQUFLO0FBQUEsUUFDekYsRUFBRSxPQUFPLFNBQVMsUUFBUSxJQUFJO0FBQUEsTUFDL0IsR0FBRyxFQUFFLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7QUFBQSxJQUNoQyxDQUFDO0FBRUQsU0FBSywrQ0FBK0MsWUFBWTtBQUMvRCxZQUFNLGtCQUFxRDtBQUFBLFFBQzFELEtBQUssSUFBSSxNQUFNLGNBQWM7QUFBQSxRQUM3QixpQkFBaUI7QUFBQSxRQUNqQixXQUFXO0FBQUEsUUFDWDtBQUFBLE1BQ0Q7QUFDQSxZQUFNLFNBQVMsTUFBTSwwQkFBMEIsaUJBQWlCLGlCQUFpQixPQUFPLEdBQUcsVUFBVSxZQUFZO0FBRWpILHdCQUFrQixRQUFRO0FBQUEsUUFDekIsRUFBRSxPQUFPLE1BQU0sUUFBUSxTQUFTO0FBQUEsUUFDaEMsRUFBRSxPQUFPLGlCQUFpQixRQUFRLHFCQUFxQixNQUFNLDJCQUEyQixLQUFLO0FBQUEsUUFDN0YsRUFBRSxPQUFPLG9CQUFvQixRQUFRLHVCQUF1QjtBQUFBLFFBQzVELEVBQUUsT0FBTyxjQUFjLFFBQVEsaUJBQWlCO0FBQUEsUUFDaEQsRUFBRSxPQUFPLGVBQWUsUUFBUSxtQkFBbUIsTUFBTSwyQkFBMkIsS0FBSztBQUFBLFFBQ3pGLEVBQUUsT0FBTyxTQUFTLFFBQVEsSUFBSTtBQUFBLE1BQy9CLEdBQUcsRUFBRSxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO0FBQUEsSUFDaEMsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sY0FBYyxNQUFNO0FBQ3pCLFFBQUk7QUFDSixRQUFJO0FBRUosVUFBTSxNQUFNO0FBQ1gsMEJBQW9CLE1BQU0sSUFBSSxJQUFJLDRCQUE0QixDQUFDO0FBQy9ELHdCQUFrQixlQUFlO0FBQUEsUUFDaEMsTUFBTTtBQUFBLFFBQ04sYUFBYTtBQUFBLE1BQ2QsR0FBRyxJQUFJO0FBQ1AsbUJBQWEsSUFBSSxtQkFBbUIsbUJBQW1CLGlCQUFpQjtBQUV4RSx3QkFBa0I7QUFBQSxRQUNqQixLQUFLLElBQUksTUFBTSxzQkFBc0I7QUFBQTtBQUFBLFFBQ3JDLFdBQVc7QUFBQSxRQUNYLGlCQUFpQjtBQUFBLFFBQ2pCO0FBQUEsTUFDRDtBQUNBLHVCQUFpQjtBQUFBLFFBQ2hCLElBQUksTUFBTSxjQUFjO0FBQUEsUUFDeEIsSUFBSSxNQUFNLHNCQUFzQjtBQUFBLFFBQ2hDLElBQUksTUFBTSxjQUFjO0FBQUEsUUFDeEIsSUFBSSxNQUFNLHFCQUFxQjtBQUFBLFFBQy9CLElBQUksTUFBTSx5QkFBeUI7QUFBQSxRQUNuQyxJQUFJLE1BQU0sNkJBQTZCO0FBQUEsTUFDeEM7QUFDQSx1QkFBaUI7QUFBQSxRQUNoQixFQUFFLFVBQVUsSUFBSSxNQUFNLHFCQUFxQixHQUFHLGFBQWEsS0FBSztBQUFBLFFBQ2hFLEVBQUUsVUFBVSxJQUFJLE1BQU0seUJBQXlCLEdBQUcsYUFBYSxLQUFLO0FBQUEsUUFDcEUsRUFBRSxVQUFVLElBQUksTUFBTSw2QkFBNkIsR0FBRyxRQUFRLE1BQU0sWUFBWSxLQUFLO0FBQUEsTUFDdEY7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLHFDQUFxQyxZQUFZO0FBQ3JELG9DQUE4QixNQUFNLDBCQUEwQixpQkFBaUIsaUJBQWlCLEtBQUssR0FBRyxVQUFVLFlBQVksR0FBRztBQUFBLFFBQ2hJLEVBQUUsT0FBTyxLQUFLLFFBQVEsU0FBUztBQUFBLE1BQ2hDLEdBQUcsRUFBRSxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO0FBQUEsSUFDaEMsQ0FBQztBQUVELFNBQUssMERBQTBELFlBQVk7QUFDMUUsd0JBQWtCLE1BQU0sMEJBQTBCLGlCQUFpQixpQkFBaUIsTUFBTSxHQUFHLFVBQVUsWUFBWSxHQUFHO0FBQUEsUUFDckgsRUFBRSxPQUFPLE1BQU0sUUFBUSxTQUFTO0FBQUEsUUFDaEMsRUFBRSxPQUFPLGFBQWEsUUFBUSxnQkFBZ0I7QUFBQSxNQUMvQyxHQUFHLEVBQUUsa0JBQWtCLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztBQUFBLElBQ2hDLENBQUM7QUFFRCxTQUFLLHdFQUF3RSxZQUFZO0FBQ3hGLHdCQUFrQixNQUFNLDBCQUEwQixpQkFBaUIsaUJBQWlCLGFBQWEsR0FBRyxVQUFVLFlBQVksR0FBRztBQUFBLFFBQzVILEVBQUUsT0FBTyxhQUFhLFFBQVEsZ0JBQWdCO0FBQUEsUUFDOUMsRUFBRSxPQUFPLGlCQUFpQixRQUFRLG9CQUFvQjtBQUFBLFFBQ3RELEVBQUUsT0FBTyxvQkFBb0IsUUFBUSx3QkFBd0IsTUFBTSwyQkFBMkIsS0FBSztBQUFBLE1BQ3BHLEdBQUcsRUFBRSxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO0FBQUEsSUFDaEMsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sc0RBQXNELE1BQU07QUFDakUsVUFBTSxNQUFNO0FBQ1gsdUJBQWlCLENBQUM7QUFDbEIsdUJBQWlCLENBQUM7QUFBQSxJQUNuQixDQUFDO0FBRUQsUUFBSSxXQUFXO0FBQ2QsV0FBSyxzQ0FBc0MsWUFBWTtBQUN0RCxjQUFNLGtCQUFxRDtBQUFBLFVBQzFELEtBQUssSUFBSSxNQUFNLFlBQVk7QUFBQSxVQUMzQixpQkFBaUI7QUFBQSxVQUNqQjtBQUFBLFFBQ0Q7QUFDQSx5QkFBaUIsQ0FBQyxJQUFJLE1BQU0sZ0JBQWdCLENBQUM7QUFDN0MseUJBQWlCO0FBQUEsVUFDaEIsRUFBRSxVQUFVLElBQUksTUFBTSxvQkFBb0IsR0FBRyxhQUFhLE1BQU0sUUFBUSxNQUFNO0FBQUEsVUFDOUUsRUFBRSxVQUFVLElBQUksTUFBTSx3QkFBd0IsR0FBRyxhQUFhLE9BQU8sUUFBUSxLQUFLO0FBQUEsUUFDbkY7QUFDQSxjQUFNLFNBQVMsTUFBTSwwQkFBMEIsaUJBQWlCLGlCQUFpQixXQUFXLEdBQUcsVUFBVSxZQUFZO0FBRXJILDBCQUFrQixRQUFRO0FBQUEsVUFDekIsRUFBRSxPQUFPLFdBQVcsUUFBUSxVQUFVO0FBQUEsVUFDdEMsRUFBRSxPQUFPLGVBQWUsUUFBUSxjQUFjO0FBQUEsUUFDL0MsR0FBRyxFQUFFLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7QUFBQSxNQUNoQyxDQUFDO0FBQ0QsV0FBSywwQ0FBMEMsWUFBWTtBQUMxRCxjQUFNLGtCQUFxRDtBQUFBLFVBQzFELEtBQUssSUFBSSxNQUFNLFlBQVk7QUFBQSxVQUMzQixpQkFBaUI7QUFBQSxVQUNqQjtBQUFBLFFBQ0Q7QUFDQSx5QkFBaUIsQ0FBQyxJQUFJLE1BQU0sZ0JBQWdCLENBQUM7QUFDN0MseUJBQWlCO0FBQUEsVUFDaEIsRUFBRSxVQUFVLElBQUksTUFBTSxvQkFBb0IsR0FBRyxhQUFhLE1BQU0sUUFBUSxNQUFNO0FBQUEsUUFDL0U7QUFDQSxjQUFNLFNBQVMsTUFBTSwwQkFBMEIsaUJBQWlCLGlCQUFpQixXQUFXLEdBQUcsVUFBVSxZQUFZO0FBRXJILDBCQUFrQixRQUFRO0FBQUE7QUFBQSxVQUV6QixFQUFFLE9BQU8sV0FBVyxRQUFRLFVBQVU7QUFBQSxVQUN0QyxFQUFFLE9BQU8sZUFBZSxRQUFRLGNBQWM7QUFBQSxRQUMvQyxHQUFHLEVBQUUsa0JBQWtCLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztBQUFBLE1BQ2hDLENBQUM7QUFBQSxJQUNGLE9BQU87QUFDTixXQUFLLHdDQUF3QyxZQUFZO0FBQ3hELGNBQU0sa0JBQXFEO0FBQUEsVUFDMUQsS0FBSyxJQUFJLE1BQU0sVUFBVTtBQUFBLFVBQ3pCLGlCQUFpQjtBQUFBLFVBQ2pCO0FBQUEsUUFDRDtBQUNBLHlCQUFpQixDQUFDLElBQUksTUFBTSxhQUFhLENBQUM7QUFDMUMseUJBQWlCO0FBQUEsVUFDaEIsRUFBRSxVQUFVLElBQUksTUFBTSxpQkFBaUIsR0FBRyxhQUFhLE1BQU0sUUFBUSxNQUFNO0FBQUEsVUFDM0UsRUFBRSxVQUFVLElBQUksTUFBTSxxQkFBcUIsR0FBRyxhQUFhLE9BQU8sUUFBUSxLQUFLO0FBQUEsUUFDaEY7QUFDQSxjQUFNLFNBQVMsTUFBTSwwQkFBMEIsaUJBQWlCLGlCQUFpQixTQUFTLEdBQUcsVUFBVSxZQUFZO0FBRW5ILDBCQUFrQixRQUFRO0FBQUEsVUFDekIsRUFBRSxPQUFPLFNBQVMsUUFBUSxRQUFRO0FBQUEsVUFDbEMsRUFBRSxPQUFPLGFBQWEsUUFBUSxZQUFZO0FBQUEsUUFDM0MsR0FBRyxFQUFFLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7QUFBQSxNQUNoQyxDQUFDO0FBQUEsSUFDRjtBQUVBLFFBQUksV0FBVztBQUNkLFdBQUssc0VBQXNFLFlBQVk7QUFDdEYsY0FBTSxrQkFBcUQ7QUFBQSxVQUMxRCxLQUFLLElBQUksTUFBTSxpQkFBaUI7QUFBQSxVQUNoQyxpQkFBaUI7QUFBQSxVQUNqQixlQUFlO0FBQUEsUUFDaEI7QUFFQSx5QkFBaUIsQ0FBQyxJQUFJLE1BQU0saUJBQWlCLENBQUM7QUFDOUMseUJBQWlCO0FBQUEsVUFDaEIsRUFBRSxVQUFVLElBQUksTUFBTSwwQkFBMEIsR0FBRyxhQUFhLEtBQUs7QUFBQSxVQUNyRSxFQUFFLFVBQVUsSUFBSSxNQUFNLGdDQUFnQyxHQUFHLGFBQWEsS0FBSztBQUFBLFFBQzVFO0FBRUEsY0FBTSxTQUFTLE1BQU0sMEJBQTBCLGlCQUFpQixpQkFBaUIsYUFBYSxHQUFHLFVBQVUsWUFBWTtBQUV2SCwwQkFBa0IsUUFBUTtBQUFBLFVBQ3pCLEVBQUUsT0FBTyxPQUFPLFFBQVEsYUFBYTtBQUFBLFVBQ3JDLEVBQUUsT0FBTyxnQkFBZ0IsUUFBUSxzQkFBc0I7QUFBQSxVQUN2RCxFQUFFLE9BQU8sc0JBQXNCLFFBQVEsNEJBQTRCO0FBQUEsVUFDbkUsRUFBRSxPQUFPLFdBQVcsUUFBUSxPQUFPO0FBQUEsUUFDcEMsR0FBRyxFQUFFLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7QUFBQSxNQUNoQyxDQUFDO0FBQUEsSUFDRixPQUFPO0FBQ04sV0FBSyxvRUFBb0UsWUFBWTtBQUNwRixjQUFNLGtCQUFxRDtBQUFBLFVBQzFELEtBQUssSUFBSSxNQUFNLGNBQWM7QUFBQSxVQUM3QixpQkFBaUI7QUFBQSxVQUNqQixlQUFlO0FBQUEsUUFDaEI7QUFDQSx5QkFBaUIsQ0FBQyxJQUFJLE1BQU0sY0FBYyxDQUFDO0FBQzNDLHlCQUFpQjtBQUFBLFVBQ2hCLEVBQUUsVUFBVSxJQUFJLE1BQU0sdUJBQXVCLEdBQUcsYUFBYSxLQUFLO0FBQUEsVUFDbEUsRUFBRSxVQUFVLElBQUksTUFBTSx1QkFBdUIsR0FBRyxhQUFhLEtBQUs7QUFBQSxRQUNuRTtBQUVBLGNBQU0sU0FBUyxNQUFNLDBCQUEwQixpQkFBaUIsaUJBQWlCLFlBQVksR0FBRyxVQUFVLFlBQVk7QUFFdEgsMEJBQWtCLFFBQVE7QUFBQSxVQUN6QixFQUFFLE9BQU8sTUFBTSxRQUFRLFNBQVM7QUFBQSxVQUNoQyxFQUFFLE9BQU8sY0FBYyxRQUFRLGlCQUFpQjtBQUFBLFVBQ2hELEVBQUUsT0FBTyxjQUFjLFFBQVEsaUJBQWlCO0FBQUEsVUFDaEQsRUFBRSxPQUFPLFNBQVMsUUFBUSxJQUFJO0FBQUEsUUFDL0IsR0FBRyxFQUFFLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7QUFBQSxNQUNoQyxDQUFDO0FBQUEsSUFFRjtBQUNBLFNBQUsscURBQXFELFlBQVk7QUFDckUsWUFBTSxrQkFBcUQ7QUFBQSxRQUMxRCxLQUFLLElBQUksTUFBTSxjQUFjO0FBQUEsUUFDN0IsaUJBQWlCO0FBQUEsUUFDakI7QUFBQSxNQUNEO0FBQ0EsdUJBQWlCLENBQUMsSUFBSSxNQUFNLGNBQWMsQ0FBQztBQUMzQyx1QkFBaUI7QUFBQSxRQUNoQixFQUFFLFVBQVUsSUFBSSxNQUFNLHVCQUF1QixHQUFHLGFBQWEsS0FBSztBQUFBLFFBQ2xFLEVBQUUsVUFBVSxJQUFJLE1BQU0sdUJBQXVCLEdBQUcsYUFBYSxLQUFLO0FBQUEsTUFDbkU7QUFDQSxZQUFNLFNBQVMsTUFBTSwwQkFBMEIsaUJBQWlCLGlCQUFpQixJQUFJLEdBQUcsVUFBVSxZQUFZO0FBRTlHLHdCQUFrQixRQUFRO0FBQUEsUUFDekIsRUFBRSxPQUFPLEtBQUssUUFBUSxTQUFTO0FBQUEsUUFDL0IsRUFBRSxPQUFPLGNBQWMsUUFBUSxpQkFBaUI7QUFBQSxRQUNoRCxFQUFFLE9BQU8sY0FBYyxRQUFRLGlCQUFpQjtBQUFBLFFBQ2hELEVBQUUsT0FBTyxPQUFPLFFBQVEsSUFBSTtBQUFBLFFBQzVCO0FBQUEsTUFDRCxHQUFHLEVBQUUsa0JBQWtCLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztBQUFBLElBQ2hDLENBQUM7QUFFRCxTQUFLLHVEQUF1RCxZQUFZO0FBQ3ZFLFlBQU0sa0JBQXFEO0FBQUEsUUFDMUQsS0FBSyxJQUFJLE1BQU0sY0FBYztBQUFBLFFBQzdCLGlCQUFpQjtBQUFBLFFBQ2pCO0FBQUEsTUFDRDtBQUNBLHVCQUFpQixDQUFDLElBQUksTUFBTSxjQUFjLENBQUM7QUFDM0MsdUJBQWlCO0FBQUEsUUFDaEIsRUFBRSxVQUFVLElBQUksTUFBTSx1QkFBdUIsR0FBRyxhQUFhLEtBQUs7QUFBQSxRQUNsRSxFQUFFLFVBQVUsSUFBSSxNQUFNLHVCQUF1QixHQUFHLGFBQWEsS0FBSztBQUFBLE1BQ25FO0FBQ0EsWUFBTSxTQUFTLE1BQU0sMEJBQTBCLGlCQUFpQixpQkFBaUIsVUFBVSxHQUFHLFVBQVUsWUFBWTtBQUdwSCx3QkFBa0IsUUFBUTtBQUFBLFFBQ3pCLEVBQUUsT0FBTyxLQUFLLFFBQVEsU0FBUztBQUFBLFFBQy9CLEVBQUUsT0FBTyxjQUFjLFFBQVEsaUJBQWlCO0FBQUEsUUFDaEQsRUFBRSxPQUFPLGNBQWMsUUFBUSxpQkFBaUI7QUFBQSxRQUNoRCxFQUFFLE9BQU8sT0FBTyxRQUFRLElBQUk7QUFBQSxRQUM1QjtBQUFBLE1BQ0QsR0FBRyxFQUFFLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7QUFBQSxJQUNoQyxDQUFDO0FBRUQsU0FBSyw0RUFBNEUsWUFBWTtBQUM1RixZQUFNLGtCQUFxRDtBQUFBLFFBQzFELEtBQUssSUFBSSxNQUFNLGNBQWM7QUFBQSxRQUM3QixpQkFBaUI7QUFBQSxRQUNqQjtBQUFBLE1BQ0Q7QUFDQSx1QkFBaUIsQ0FBQyxJQUFJLE1BQU0sY0FBYyxDQUFDO0FBQzNDLHVCQUFpQjtBQUFBLFFBQ2hCLEVBQUUsVUFBVSxJQUFJLE1BQU0sbUJBQW1CLEdBQUcsYUFBYSxLQUFLO0FBQUEsUUFDOUQsRUFBRSxVQUFVLElBQUksTUFBTSxrQkFBa0IsR0FBRyxhQUFhLEtBQUs7QUFBQSxNQUM5RDtBQUNBLFlBQU0sU0FBUyxNQUFNLDBCQUEwQixpQkFBaUIsaUJBQWlCLE1BQU0sR0FBRyxVQUFVLFlBQVk7QUFFaEgsYUFBTyxZQUFZLFFBQVEsTUFBUztBQUFBLElBQ3JDLENBQUM7QUFFRCxTQUFLLG9FQUFvRSxZQUFZO0FBQ3BGLFlBQU0sa0JBQXFEO0FBQUEsUUFDMUQsS0FBSyxJQUFJLE1BQU0sY0FBYztBQUFBLFFBQzdCLGlCQUFpQjtBQUFBLFFBQ2pCO0FBQUEsTUFDRDtBQUNBLHVCQUFpQixDQUFDLElBQUksTUFBTSxjQUFjLENBQUM7QUFDM0MsdUJBQWlCLE1BQU0sS0FBSyxFQUFFLFFBQVEsSUFBSyxHQUFHLENBQUMsR0FBRyxPQUFPO0FBQUEsUUFDeEQsVUFBVSxJQUFJLE1BQU0sc0JBQXNCLENBQUMsR0FBRztBQUFBLFFBQzlDLGFBQWE7QUFBQSxNQUNkLEVBQUU7QUFDRixZQUFNLFNBQVMsTUFBTSwwQkFBMEIsaUJBQWlCLGlCQUFpQixNQUFNLEdBQUcsVUFBVSxZQUFZO0FBRWhILGFBQU8sTUFBTTtBQUViLGFBQU8sWUFBWSxRQUFRLFFBQVEsSUFBSTtBQUN2QyxhQUFPLFlBQVksT0FBTyxDQUFDLEVBQUUsT0FBTyxJQUFJLGFBQWEsRUFBRTtBQUN2RCxhQUFPLFlBQVksT0FBTyxHQUFHLEVBQUUsR0FBRyxPQUFPLElBQUksYUFBYSxLQUFLLGFBQWEsRUFBRTtBQUFBLElBQy9FLENBQUM7QUFFRCxTQUFLLHNFQUFzRSxZQUFZO0FBQ3RGLFlBQU0sa0JBQXFEO0FBQUEsUUFDMUQsS0FBSyxJQUFJLE1BQU0sY0FBYztBQUFBLFFBQzdCLGlCQUFpQjtBQUFBLFFBQ2pCO0FBQUEsTUFDRDtBQUNBLHVCQUFpQixDQUFDLElBQUksTUFBTSxjQUFjLENBQUM7QUFDM0MsdUJBQWlCO0FBQUEsUUFDaEIsRUFBRSxVQUFVLElBQUksTUFBTSx1QkFBdUIsR0FBRyxhQUFhLEtBQUs7QUFBQSxRQUNsRSxFQUFFLFVBQVUsSUFBSSxNQUFNLHVCQUF1QixHQUFHLGFBQWEsS0FBSztBQUFBLE1BQ25FO0FBQ0EsWUFBTSxTQUFTLE1BQU0sMEJBQTBCLGlCQUFpQixpQkFBaUIsYUFBYSxJQUFJLFVBQVUsWUFBWTtBQUV4SCx3QkFBa0IsUUFBUTtBQUFBLFFBQ3pCLEVBQUUsT0FBTyxNQUFNLFFBQVEsU0FBUztBQUFBLFFBQ2hDLEVBQUUsT0FBTyxjQUFjLFFBQVEsaUJBQWlCO0FBQUEsUUFDaEQsRUFBRSxPQUFPLGNBQWMsUUFBUSxpQkFBaUI7QUFBQSxRQUNoRCxFQUFFLE9BQU8sU0FBUyxRQUFRLElBQUk7QUFBQSxNQUMvQixHQUFHLEVBQUUsa0JBQWtCLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQztBQUFBLElBQ2pDLENBQUM7QUFDRCxTQUFLLCtEQUErRCxZQUFZO0FBQy9FLFlBQU0sa0JBQXFEO0FBQUEsUUFDMUQsS0FBSyxJQUFJLE1BQU0sY0FBYztBQUFBLFFBQzdCLGlCQUFpQjtBQUFBLFFBQ2pCO0FBQUEsTUFDRDtBQUNBLHVCQUFpQjtBQUFBLFFBQ2hCLElBQUksTUFBTSxjQUFjO0FBQUEsUUFDeEIsSUFBSSxNQUFNLG1CQUFtQjtBQUFBLE1BQzlCO0FBQ0EsdUJBQWlCO0FBQUEsUUFDaEIsRUFBRSxVQUFVLElBQUksTUFBTSxvQkFBb0IsR0FBRyxhQUFhLEtBQUs7QUFBQSxRQUMvRCxFQUFFLFVBQVUsSUFBSSxNQUFNLDBCQUEwQixHQUFHLGFBQWEsS0FBSztBQUFBLE1BQ3RFO0FBQ0EsWUFBTSxTQUFTLE1BQU0sMEJBQTBCLGlCQUFpQixpQkFBaUIsU0FBUyxHQUFHLFVBQVUsWUFBWTtBQUVuSCx3QkFBa0IsUUFBUTtBQUFBLFFBQ3pCLEVBQUUsT0FBTyxXQUFXLFFBQVEsY0FBYztBQUFBLFFBQzFDLEVBQUUsT0FBTyxpQkFBaUIsUUFBUSxvQkFBb0I7QUFBQTtBQUFBLFFBRXRELEVBQUUsT0FBTyxjQUFjLFFBQVEsU0FBUztBQUFBLE1BQ3pDLEdBQUcsRUFBRSxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO0FBQUEsSUFDaEMsQ0FBQztBQUNELFNBQUssc0RBQXNELFlBQVk7QUFDdEUsWUFBTSxrQkFBcUQ7QUFBQSxRQUMxRCxLQUFLLElBQUksTUFBTSxjQUFjO0FBQUEsUUFDN0IsaUJBQWlCO0FBQUEsUUFDakI7QUFBQSxNQUNEO0FBQ0EsdUJBQWlCO0FBQUEsUUFDaEIsSUFBSSxNQUFNLGNBQWM7QUFBQSxRQUN4QixJQUFJLE1BQU0sc0JBQXNCO0FBQUEsUUFDaEMsSUFBSSxNQUFNLHNCQUFzQjtBQUFBLE1BQ2pDO0FBQ0EsdUJBQWlCO0FBQUEsUUFDaEIsRUFBRSxVQUFVLElBQUksTUFBTSx1QkFBdUIsR0FBRyxhQUFhLEtBQUs7QUFBQSxRQUNsRSxFQUFFLFVBQVUsSUFBSSxNQUFNLHVCQUF1QixHQUFHLGFBQWEsS0FBSztBQUFBLE1BQ25FO0FBQ0EsWUFBTSxTQUFTLE1BQU0sMEJBQTBCLGlCQUFpQixpQkFBaUIsV0FBVyxHQUFHLFVBQVUsWUFBWTtBQUVySCx3QkFBa0IsUUFBUTtBQUFBLFFBQ3pCLEVBQUUsT0FBTyxXQUFXLFFBQVEsU0FBUztBQUFBLFFBQ3JDLEVBQUUsT0FBTyxtQkFBbUIsUUFBUSxpQkFBaUI7QUFBQSxRQUNyRCxFQUFFLE9BQU8sbUJBQW1CLFFBQVEsaUJBQWlCO0FBQUEsUUFDckQsRUFBRSxPQUFPLGNBQWMsUUFBUSxJQUFJO0FBQUEsTUFDcEMsR0FBRyxFQUFFLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7QUFBQSxJQUNoQyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSxVQUFVLE1BQU07QUFDckIsUUFBSTtBQUVKLFVBQU0sTUFBTTtBQUNYLHVCQUFpQjtBQUFBLFFBQ2hCLElBQUksTUFBTSxjQUFjO0FBQUEsUUFDeEIsSUFBSSxNQUFNLHNCQUFzQjtBQUFBLE1BQ2pDO0FBQ0EsdUJBQWlCO0FBQUEsUUFDaEIsRUFBRSxVQUFVLElBQUksTUFBTSwrQkFBK0IsR0FBRyxhQUFhLEtBQUs7QUFBQSxRQUMxRSxFQUFFLFVBQVUsSUFBSSxNQUFNLGdDQUFnQyxHQUFHLFFBQVEsS0FBSztBQUFBLE1BQ3ZFO0FBRUEsMEJBQW9CLE1BQU0sSUFBSSxJQUFJLDRCQUE0QixDQUFDO0FBQy9ELHdCQUFrQixlQUFlLEVBQUUsUUFBUSxnQkFBZ0IsR0FBRyxJQUFJO0FBQ2xFLG1CQUFhLElBQUksbUJBQW1CLG1CQUFtQixpQkFBaUI7QUFBQSxJQUN6RSxDQUFDO0FBRUQsU0FBSyxrREFBa0QsWUFBWTtBQUNsRSwyQkFBcUIscUJBQXFCLHNDQUFzQyxVQUFVO0FBQzFGLFlBQU0sa0JBQXFEO0FBQUEsUUFDMUQsS0FBSyxJQUFJLE1BQU0sY0FBYztBQUFBLFFBQzdCLGlCQUFpQjtBQUFBLFFBQ2pCLFdBQVc7QUFBQSxRQUNYO0FBQUEsTUFDRDtBQUNBLFlBQU0sU0FBUyxNQUFNLDBCQUEwQixpQkFBaUIsaUJBQWlCLE9BQU8sR0FBRyxVQUFVLFlBQVk7QUFFakgsb0NBQThCLFFBQVE7QUFBQSxRQUNyQyxFQUFFLE9BQU8sV0FBVyxRQUFRLGdDQUFnQztBQUFBLE1BQzdELEdBQUcsRUFBRSxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO0FBQUEsSUFDaEMsQ0FBQztBQUVELFNBQUssa0RBQWtELFlBQVk7QUFDbEUsMkJBQXFCLHFCQUFxQixzQ0FBc0MsVUFBVTtBQUMxRixZQUFNLGtCQUFxRDtBQUFBLFFBQzFELEtBQUssSUFBSSxNQUFNLGNBQWM7QUFBQSxRQUM3QixpQkFBaUI7QUFBQSxRQUNqQixXQUFXO0FBQUEsUUFDWDtBQUFBLE1BQ0Q7QUFDQSxZQUFNLFNBQVMsTUFBTSwwQkFBMEIsaUJBQWlCLGlCQUFpQixPQUFPLEdBQUcsVUFBVSxZQUFZO0FBRWpILG9DQUE4QixRQUFRO0FBQUEsUUFDckMsRUFBRSxPQUFPLDBCQUEwQixRQUFRLFNBQVM7QUFBQSxNQUNyRCxHQUFHLEVBQUUsa0JBQWtCLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztBQUFBLElBQ2hDLENBQUM7QUFFRCxTQUFLLDhEQUE4RCxZQUFZO0FBQzlFLDJCQUFxQixxQkFBcUIsc0NBQXNDLFVBQVU7QUFDMUYsWUFBTSxhQUFhLFlBQVksU0FBUztBQUN4QyxZQUFNLFlBQVksWUFBWSxNQUFNO0FBQ3BDLFlBQU0sWUFBWSxZQUFZLE9BQU87QUFDckMsd0JBQWtCLGVBQWUsRUFBRSxRQUFRLEdBQUcsVUFBVSxnQkFBZ0IsU0FBUyxHQUFHLFVBQVUsZ0JBQWdCLFNBQVMsWUFBWSxHQUFHLElBQUk7QUFFMUksWUFBTSxnQkFBZ0IsWUFBWSxnQkFBZ0I7QUFDbEQsdUJBQWlCO0FBQUEsUUFDaEIsSUFBSSxNQUFNLEdBQUcsYUFBYSxNQUFNO0FBQUEsUUFDaEMsSUFBSSxNQUFNLEdBQUcsYUFBYSxlQUFlO0FBQUEsUUFDekMsSUFBSSxNQUFNLEdBQUcsYUFBYSxlQUFlO0FBQUEsUUFDekMsSUFBSSxNQUFNLEdBQUcsYUFBYSx5QkFBeUI7QUFBQSxNQUNwRDtBQUNBLHVCQUFpQjtBQUFBLFFBQ2hCLEVBQUUsVUFBVSxJQUFJLE1BQU0sR0FBRyxhQUFhLHdCQUF3QixHQUFHLGFBQWEsS0FBSztBQUFBLFFBQ25GLEVBQUUsVUFBVSxJQUFJLE1BQU0sR0FBRyxhQUFhLHdCQUF3QixHQUFHLGFBQWEsS0FBSztBQUFBLFFBQ25GLEVBQUUsVUFBVSxJQUFJLE1BQU0sR0FBRyxhQUFhLHlCQUF5QixHQUFHLFFBQVEsS0FBSztBQUFBLFFBQy9FLEVBQUUsVUFBVSxJQUFJLE1BQU0sR0FBRyxhQUFhLGtDQUFrQyxHQUFHLGFBQWEsS0FBSztBQUFBLFFBQzdGLEVBQUUsVUFBVSxJQUFJLE1BQU0sR0FBRyxhQUFhLGtDQUFrQyxHQUFHLGFBQWEsS0FBSztBQUFBLFFBQzdGLEVBQUUsVUFBVSxJQUFJLE1BQU0sR0FBRyxhQUFhLG1DQUFtQyxHQUFHLFFBQVEsS0FBSztBQUFBLE1BQzFGO0FBRUEsWUFBTSxrQkFBcUQ7QUFBQSxRQUMxRCxLQUFLLElBQUksTUFBTSxHQUFHLGFBQWEsTUFBTTtBQUFBLFFBQ3JDLGlCQUFpQjtBQUFBLFFBQ2pCLFdBQVc7QUFBQSxRQUNYO0FBQUEsTUFDRDtBQUNBLFlBQU0sU0FBUyxNQUFNLDBCQUEwQixpQkFBaUIsaUJBQWlCLE9BQU8sR0FBRyxVQUFVLFlBQVk7QUFFakgsWUFBTSxjQUFjLFlBQVksU0FBUztBQUN6QyxvQ0FBOEIsUUFBUTtBQUFBLFFBQ3JDLEVBQUUsT0FBTyxXQUFXLFFBQVEsVUFBVSxXQUFXLHlCQUF5QjtBQUFBLFFBQzFFLEVBQUUsT0FBTyxXQUFXLFFBQVEsVUFBVSxXQUFXLHlCQUF5QjtBQUFBLFFBQzFFLEVBQUUsT0FBTyxXQUFXLFFBQVEsVUFBVSxXQUFXLG1DQUFtQztBQUFBLFFBQ3BGLEVBQUUsT0FBTyxXQUFXLFFBQVEsVUFBVSxXQUFXLG1DQUFtQztBQUFBLE1BQ3JGLEdBQUcsRUFBRSxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO0FBQUEsSUFDaEMsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE1BQUksV0FBVztBQUNkLFVBQU0sV0FBVyxNQUFNO0FBQ3RCLFdBQUssa0VBQWtFLE1BQU07QUFDNUUsZUFBTyxZQUFZLHFCQUFxQixHQUFHLEdBQUcsTUFBTTtBQUNwRCxlQUFPLFlBQVkscUJBQXFCLEtBQUssR0FBRyxNQUFNO0FBQ3RELGVBQU8sWUFBWSxxQkFBcUIsY0FBYyxHQUFHLGdCQUFnQjtBQUN6RSxlQUFPLFlBQVkscUJBQXFCLFFBQVEsR0FBRyxTQUFTO0FBQUEsTUFDN0QsQ0FBQztBQUVELFdBQUssa0VBQWtFLE1BQU07QUFDNUUsZUFBTyxZQUFZLHFCQUFxQixNQUFNLEdBQUcsS0FBSztBQUN0RCxlQUFPLFlBQVkscUJBQXFCLGdCQUFnQixHQUFHLGNBQWM7QUFDekUsZUFBTyxZQUFZLHFCQUFxQixTQUFTLEdBQUcsUUFBUTtBQUM1RCxlQUFPLFlBQVkscUJBQXFCLGdCQUFnQixHQUFHLGNBQWM7QUFBQSxNQUMxRSxDQUFDO0FBRUQsV0FBSyw4REFBOEQsWUFBWTtBQUM5RSxjQUFNLGtCQUFxRDtBQUFBLFVBQzFELEtBQUssSUFBSSxLQUFLLGdCQUFnQjtBQUFBLFVBQzlCLGlCQUFpQjtBQUFBLFVBQ2pCLFdBQVc7QUFBQSxVQUNYLGVBQWU7QUFBQSxRQUNoQjtBQUNBLHlCQUFpQjtBQUFBLFVBQ2hCLElBQUksS0FBSyxnQkFBZ0I7QUFBQSxVQUN6QixJQUFJLEtBQUsscUJBQXFCO0FBQUEsVUFDOUIsSUFBSSxLQUFLLHlCQUF5QjtBQUFBLFFBQ25DO0FBQ0EseUJBQWlCO0FBQUEsVUFDaEIsRUFBRSxVQUFVLElBQUksS0FBSyxxQkFBcUIsR0FBRyxhQUFhLE1BQU0sUUFBUSxNQUFNO0FBQUEsVUFDOUUsRUFBRSxVQUFVLElBQUksS0FBSyx5QkFBeUIsR0FBRyxRQUFRLE1BQU0sWUFBWSxLQUFLO0FBQUEsUUFDakY7QUFDQSxjQUFNLFNBQVMsTUFBTSwwQkFBMEIsaUJBQWlCLGlCQUFpQixpQkFBaUIsSUFBSSxVQUFVLGNBQWMsaUJBQWlCLE9BQU87QUFDdEosMEJBQWtCLFFBQVE7QUFBQSxVQUN6QixFQUFFLE9BQU8saUJBQWlCLFFBQVEsbUJBQW1CO0FBQUEsVUFDckQsRUFBRSxPQUFPLHFCQUFxQixRQUFRLHdCQUF3QjtBQUFBLFVBQzlELEVBQUUsT0FBTyx3QkFBd0IsUUFBUSwyQkFBMkIsTUFBTSwyQkFBMkIsS0FBSztBQUFBLFFBQzNHLEdBQUcsRUFBRSxrQkFBa0IsQ0FBQyxHQUFHLEVBQUUsRUFBRSxHQUFHLEdBQUc7QUFBQSxNQUN0QyxDQUFDO0FBQ0QsV0FBSyx3REFBd0QsWUFBWTtBQUN4RSxjQUFNLGtCQUFxRDtBQUFBLFVBQzFELEtBQUssSUFBSSxLQUFLLGdCQUFnQjtBQUFBLFVBQzlCLGlCQUFpQjtBQUFBLFVBQ2pCLFdBQVc7QUFBQSxVQUNYLGVBQWU7QUFBQSxRQUNoQjtBQUNBLHlCQUFpQjtBQUFBLFVBQ2hCLElBQUksS0FBSyxnQkFBZ0I7QUFBQSxVQUN6QixJQUFJLEtBQUsscUJBQXFCO0FBQUEsVUFDOUIsSUFBSSxLQUFLLHlCQUF5QjtBQUFBLFFBQ25DO0FBQ0EseUJBQWlCO0FBQUEsVUFDaEIsRUFBRSxVQUFVLElBQUksS0FBSyxxQkFBcUIsR0FBRyxhQUFhLEtBQUs7QUFBQSxVQUMvRCxFQUFFLFVBQVUsSUFBSSxLQUFLLHlCQUF5QixHQUFHLFFBQVEsTUFBTSxZQUFZLEtBQUs7QUFBQSxRQUNqRjtBQUNBLGNBQU0sU0FBUyxNQUFNLDBCQUEwQixpQkFBaUIsaUJBQWlCLE1BQU0sR0FBRyxVQUFVLGNBQWMsaUJBQWlCLE9BQU87QUFDMUksMEJBQWtCLFFBQVE7QUFBQSxVQUN6QixFQUFFLE9BQU8sTUFBTSxRQUFRLG1CQUFtQjtBQUFBLFVBQzFDLEVBQUUsT0FBTyxVQUFVLFFBQVEsd0JBQXdCO0FBQUEsVUFDbkQsRUFBRSxPQUFPLGFBQWEsUUFBUSwyQkFBMkIsTUFBTSwyQkFBMkIsS0FBSztBQUFBLFVBQy9GLEVBQUUsT0FBTyxTQUFTLFFBQVEsY0FBYztBQUFBLFFBQ3pDLEdBQUcsRUFBRSxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsRUFBRSxHQUFHLEdBQUc7QUFBQSxNQUNyQyxDQUFDO0FBRUQsV0FBSyx3REFBd0QsWUFBWTtBQUN4RSxjQUFNLGtCQUFxRDtBQUFBLFVBQzFELEtBQUssSUFBSSxLQUFLLGdCQUFnQjtBQUFBLFVBQzlCLGlCQUFpQjtBQUFBLFVBQ2pCLFdBQVc7QUFBQSxVQUNYLGVBQWU7QUFBQSxRQUNoQjtBQUNBLHlCQUFpQjtBQUFBLFVBQ2hCLElBQUksS0FBSyxnQkFBZ0I7QUFBQSxVQUN6QixJQUFJLEtBQUsscUJBQXFCO0FBQUEsVUFDOUIsSUFBSSxLQUFLLHlCQUF5QjtBQUFBLFFBQ25DO0FBQ0EseUJBQWlCO0FBQUEsVUFDaEIsRUFBRSxVQUFVLElBQUksS0FBSyxxQkFBcUIsR0FBRyxhQUFhLEtBQUs7QUFBQSxVQUMvRCxFQUFFLFVBQVUsSUFBSSxLQUFLLHlCQUF5QixHQUFHLFFBQVEsTUFBTSxZQUFZLEtBQUs7QUFBQSxRQUNqRjtBQUNBLGNBQU0sU0FBUyxNQUFNLDBCQUEwQixpQkFBaUIsaUJBQWlCLGlCQUFpQixJQUFJLFVBQVUsY0FBYyxpQkFBaUIsT0FBTztBQUN0SiwwQkFBa0IsUUFBUTtBQUFBLFVBQ3pCLEVBQUUsT0FBTyxpQkFBaUIsUUFBUSxtQkFBbUI7QUFBQSxVQUNyRCxFQUFFLE9BQU8scUJBQXFCLFFBQVEsd0JBQXdCO0FBQUEsVUFDOUQsRUFBRSxPQUFPLHdCQUF3QixRQUFRLDJCQUEyQixNQUFNLDJCQUEyQixLQUFLO0FBQUEsUUFDM0csR0FBRyxFQUFFLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxFQUFFLEdBQUcsR0FBRztBQUFBLE1BQ3RDLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGO0FBQ0EsTUFBSSxDQUFDLFdBQVc7QUFDZixVQUFNLG1CQUFtQixNQUFNO0FBQzlCLFdBQUssNERBQTRELFlBQVk7QUFDNUUsY0FBTSxrQkFBcUQ7QUFBQSxVQUMxRCxLQUFLLElBQUksTUFBTSxjQUFjO0FBQUEsVUFDN0I7QUFBQSxVQUNBLFdBQVc7QUFBQSxVQUNYLGlCQUFpQjtBQUFBLFFBQ2xCO0FBRUEseUJBQWlCLENBQUMsSUFBSSxNQUFNLGNBQWMsQ0FBQztBQUczQyx5QkFBaUI7QUFBQSxVQUNoQixFQUFFLFVBQVUsSUFBSSxNQUFNLCtCQUErQixHQUFHLFFBQVEsS0FBSztBQUFBLFVBQ3JFLEVBQUUsVUFBVSxJQUFJLE1BQU0sMkJBQTJCLEdBQUcsUUFBUSxNQUFNLGdCQUFnQixLQUFLO0FBQUEsVUFDdkYsRUFBRSxVQUFVLElBQUksTUFBTSw2QkFBNkIsR0FBRyxhQUFhLE1BQU0sZ0JBQWdCLEtBQUs7QUFBQSxVQUM5RixFQUFFLFVBQVUsSUFBSSxNQUFNLDZCQUE2QixHQUFHLGFBQWEsS0FBSztBQUFBLFFBQ3pFO0FBRUEsY0FBTSxTQUFTLE1BQU0sMEJBQTBCLGlCQUFpQixpQkFBaUIsT0FBTyxHQUFHLFVBQVUsWUFBWTtBQUdqSCxjQUFNLHdCQUF3QixRQUFRLEtBQUssT0FBSyxFQUFFLFVBQVUsZ0JBQWdCO0FBQzVFLGNBQU0sMEJBQTBCLFFBQVEsS0FBSyxPQUFLLEVBQUUsVUFBVSxtQkFBbUI7QUFDakYsZUFBTyxZQUFZLHVCQUF1QixRQUFRLGlEQUFpRCx5Q0FBeUM7QUFDNUksZUFBTyxZQUFZLHlCQUF5QixRQUFRLGlEQUFpRCwyQ0FBMkM7QUFBQSxNQUNqSixDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRjtBQUNBLE1BQUksQ0FBQyxXQUFXO0FBQ2YsVUFBTSxxQ0FBcUMsTUFBTTtBQUNoRCxZQUFNLGtCQUFrQjtBQUN4QixZQUFNLGdCQUFxQztBQUFBLFFBQzFDLE1BQU07QUFBQSxRQUNOLGFBQWE7QUFBQSxNQUNkO0FBRUEsV0FBSyxtREFBbUQsWUFBWTtBQUNuRSxrQ0FBMEIsYUFBYTtBQUN2QyxjQUFNLGtCQUFxRDtBQUFBLFVBQzFELEtBQUssSUFBSSxLQUFLLEVBQUUsUUFBUSxpQkFBaUIsV0FBVyxpQkFBaUIsTUFBTSxtQkFBbUIsQ0FBQztBQUFBLFVBQy9GLGlCQUFpQjtBQUFBLFVBQ2pCLGVBQWU7QUFBQSxRQUNoQjtBQUNBLHlCQUFpQjtBQUFBLFVBQ2hCLElBQUksS0FBSyxFQUFFLFFBQVEsaUJBQWlCLFdBQVcsaUJBQWlCLE1BQU0sUUFBUSxDQUFDO0FBQUEsVUFDL0UsSUFBSSxLQUFLLEVBQUUsUUFBUSxpQkFBaUIsV0FBVyxpQkFBaUIsTUFBTSxtQkFBbUIsQ0FBQztBQUFBLFFBQzNGO0FBQ0EseUJBQWlCO0FBQUEsVUFDaEIsRUFBRSxVQUFVLElBQUksS0FBSyxFQUFFLFFBQVEsaUJBQWlCLFdBQVcsaUJBQWlCLE1BQU0sbUJBQW1CLENBQUMsR0FBRyxhQUFhLEtBQUs7QUFBQSxRQUM1SDtBQUNBLGNBQU0sU0FBUyxNQUFNLDBCQUEwQixpQkFBaUIsaUJBQWlCLFVBQVUsR0FBRyxVQUFVLFlBQVk7QUFHcEgsZUFBTyxHQUFHLFVBQVUsT0FBTyxTQUFTLEdBQUcsb0RBQW9EO0FBRTNGLGNBQU0scUJBQXFCLFFBQVEsS0FBSyxPQUFLLEVBQUUsVUFBVSxRQUFRO0FBQ2pFLGVBQU8sR0FBRyxvQkFBb0Isc0NBQXNDO0FBQ3BFLGVBQU8sR0FBRyxtQkFBbUIsUUFBUSxTQUFTLFFBQVEsR0FBRyxnQ0FBZ0M7QUFBQSxNQUMxRixDQUFDO0FBRUQsV0FBSywyREFBMkQsWUFBWTtBQUMzRSxrQ0FBMEIsYUFBYTtBQUN2QyxjQUFNLGtCQUFxRDtBQUFBLFVBQzFELEtBQUssSUFBSSxLQUFLLEVBQUUsUUFBUSxpQkFBaUIsV0FBVyxpQkFBaUIsTUFBTSwyQkFBMkIsQ0FBQztBQUFBLFVBQ3ZHLGlCQUFpQjtBQUFBLFVBQ2pCLGVBQWU7QUFBQSxRQUNoQjtBQUNBLHlCQUFpQjtBQUFBLFVBQ2hCLElBQUksS0FBSyxFQUFFLFFBQVEsaUJBQWlCLFdBQVcsaUJBQWlCLE1BQU0sbUJBQW1CLENBQUM7QUFBQSxVQUMxRixJQUFJLEtBQUssRUFBRSxRQUFRLGlCQUFpQixXQUFXLGlCQUFpQixNQUFNLDJCQUEyQixDQUFDO0FBQUEsUUFDbkc7QUFDQSx5QkFBaUI7QUFBQSxVQUNoQixFQUFFLFVBQVUsSUFBSSxLQUFLLEVBQUUsUUFBUSxpQkFBaUIsV0FBVyxpQkFBaUIsTUFBTSw2QkFBNkIsQ0FBQyxHQUFHLGFBQWEsS0FBSztBQUFBLFVBQ3JJLEVBQUUsVUFBVSxJQUFJLEtBQUssRUFBRSxRQUFRLGlCQUFpQixXQUFXLGlCQUFpQixNQUFNLDJCQUEyQixDQUFDLEdBQUcsYUFBYSxLQUFLO0FBQUEsUUFDcEk7QUFDQSxjQUFNLFNBQVMsTUFBTSwwQkFBMEIsaUJBQWlCLGlCQUFpQixNQUFNLEdBQUcsVUFBVSxZQUFZO0FBR2hILGVBQU8sR0FBRyxVQUFVLE9BQU8sU0FBUyxHQUFHLGlEQUFpRDtBQUV4RixjQUFNLHNCQUFzQixRQUFRLEtBQUssT0FBSyxFQUFFLFFBQVEsU0FBUyxXQUFXLENBQUM7QUFDN0UsZUFBTyxHQUFHLHFCQUFxQiwrQ0FBK0M7QUFBQSxNQUMvRSxDQUFDO0FBRUQsV0FBSyxrRUFBa0UsWUFBWTtBQUNsRixrQ0FBMEIsYUFBYTtBQUN2QyxjQUFNLGtCQUFxRDtBQUFBLFVBQzFELEtBQUssSUFBSSxLQUFLLEVBQUUsUUFBUSxpQkFBaUIsV0FBVyxpQkFBaUIsTUFBTSwyQkFBMkIsQ0FBQztBQUFBLFVBQ3ZHLGlCQUFpQjtBQUFBLFVBQ2pCLGVBQWU7QUFBQSxRQUNoQjtBQUNBLHlCQUFpQjtBQUFBLFVBQ2hCLElBQUksS0FBSyxFQUFFLFFBQVEsaUJBQWlCLFdBQVcsaUJBQWlCLE1BQU0sMkJBQTJCLENBQUM7QUFBQSxRQUNuRztBQUNBLHlCQUFpQjtBQUFBLFVBQ2hCLEVBQUUsVUFBVSxJQUFJLEtBQUssRUFBRSxRQUFRLGlCQUFpQixXQUFXLGlCQUFpQixNQUFNLCtCQUErQixDQUFDLEdBQUcsYUFBYSxLQUFLO0FBQUEsVUFDdkksRUFBRSxVQUFVLElBQUksS0FBSyxFQUFFLFFBQVEsaUJBQWlCLFdBQVcsaUJBQWlCLE1BQU0sZ0NBQWdDLENBQUMsR0FBRyxhQUFhLEtBQUs7QUFBQSxRQUN6STtBQUNBLGNBQU0sU0FBUyxNQUFNLDBCQUEwQixpQkFBaUIsaUJBQWlCLE1BQU0sR0FBRyxVQUFVLFlBQVk7QUFHaEgsZUFBTyxHQUFHLFVBQVUsT0FBTyxTQUFTLEdBQUcsb0RBQW9EO0FBRTNGLGNBQU0sZ0JBQWdCLFFBQVEsS0FBSyxPQUFLLEVBQUUsUUFBUSxTQUFTLDhCQUE4QixDQUFDO0FBQzFGLGVBQU8sR0FBRyxlQUFlLDhEQUE4RDtBQUFBLE1BQ3hGLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGO0FBRUEsUUFBTSw2QkFBNkIsTUFBTTtBQUN4QyxTQUFLLDRFQUE0RSxZQUFZO0FBQzVGLFlBQU0sa0JBQXFEO0FBQUEsUUFDMUQsS0FBSyxJQUFJLE1BQU0sY0FBYztBQUFBLFFBQzdCLGlCQUFpQjtBQUFBLFFBQ2pCLFdBQVc7QUFBQSxRQUNYO0FBQUEsTUFDRDtBQUNBLHVCQUFpQixDQUFDLElBQUksTUFBTSxjQUFjLENBQUM7QUFDM0MsdUJBQWlCO0FBQUEsUUFDaEIsRUFBRSxVQUFVLElBQUksTUFBTSx5QkFBeUIsR0FBRyxhQUFhLEtBQUs7QUFBQSxRQUNwRSxFQUFFLFVBQVUsSUFBSSxNQUFNLHdCQUF3QixHQUFHLGFBQWEsS0FBSztBQUFBLFFBQ25FLEVBQUUsVUFBVSxJQUFJLE1BQU0sK0JBQStCLEdBQUcsYUFBYSxLQUFLO0FBQUEsUUFDMUUsRUFBRSxVQUFVLElBQUksTUFBTSwrQkFBK0IsR0FBRyxRQUFRLE1BQU0sWUFBWSxLQUFLO0FBQUEsTUFDeEY7QUFDQSxZQUFNLFNBQVMsTUFBTSwwQkFBMEIsaUJBQWlCLGlCQUFpQixJQUFJLEdBQUcsVUFBVSxZQUFZO0FBRTlHLHdCQUFrQixRQUFRO0FBQUEsUUFDekIsRUFBRSxPQUFPLEtBQUssUUFBUSxTQUFTO0FBQUEsUUFDL0IsRUFBRSxPQUFPLGdCQUFnQixRQUFRLG1CQUFxQjtBQUFBLFFBQ3RELEVBQUUsT0FBTyxlQUFnQixRQUFRLGtCQUFtQjtBQUFBLFFBQ3BELEVBQUUsT0FBTyxzQkFBeUIsUUFBUSx5QkFBNEI7QUFBQSxRQUN0RSxFQUFFLE9BQU8sc0JBQXlCLFFBQVEsMEJBQTZCLE1BQU0sMkJBQTJCLEtBQUs7QUFBQSxRQUM3RyxFQUFFLE9BQU8sT0FBTyxRQUFRLElBQUk7QUFBQSxRQUM1QjtBQUFBLE1BQ0QsR0FBRyxFQUFFLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7QUFBQSxJQUNoQyxDQUFDO0FBQUEsRUFFRixDQUFDO0FBRUQsUUFBTSwwQkFBMEIsTUFBTTtBQUFBLElBRXJDLE1BQU0sc0NBQXNDLDBCQUEwQjtBQUFBLE1BQzlELG9CQUFvQixXQUF5RTtBQUNuRyxlQUFPLE1BQU0scUJBQXFCLFNBQVM7QUFBQSxNQUM1QztBQUFBLElBQ0Q7QUFFQSxRQUFJO0FBRUosVUFBTSxNQUFNO0FBQ1gsc0NBQWdDLE1BQU0sSUFBSSxxQkFBcUIsZUFBZSw2QkFBNkIsQ0FBQztBQUFBLElBQzdHLENBQUM7QUFHRCxhQUFTLG1CQUFtQixJQUF5QztBQUNwRSxhQUFPO0FBQUEsUUFDTjtBQUFBLFFBQ0Esb0JBQW9CLFlBQVksQ0FBQztBQUFBLFVBQ2hDLE9BQU8sbUJBQW1CLEVBQUU7QUFBQSxVQUM1QixNQUFNLDJCQUEyQjtBQUFBLFVBQ2pDLGtCQUFrQixDQUFDLEdBQUcsQ0FBQztBQUFBLFVBQ3ZCLFVBQVU7QUFBQSxRQUNYLENBQUM7QUFBQSxNQUNGO0FBQUEsSUFDRDtBQUVBLFNBQUssbUVBQW1FLE1BQU07QUFDN0UsWUFBTSxrQkFBa0IsbUJBQW1CLGtCQUFrQjtBQUM3RCxZQUFNLGNBQWMsbUJBQW1CLHdCQUF3QjtBQUMvRCxZQUFNLFlBQVksQ0FBQyxpQkFBaUIsV0FBVztBQUcvQywyQkFBcUIscUJBQXFCLHlCQUF5QixXQUFXLENBQUMsQ0FBQztBQUVoRixZQUFNLFNBQVMsOEJBQThCLG9CQUFvQixTQUFTO0FBRzFFLGFBQU8sWUFBWSxPQUFPLFFBQVEsR0FBRyx5Q0FBeUM7QUFDOUUsYUFBTyxHQUFHLE9BQU8sU0FBUyxlQUFlLEdBQUcsaUNBQWlDO0FBQzdFLGFBQU8sR0FBRyxPQUFPLFNBQVMsV0FBVyxHQUFHLDZCQUE2QjtBQUFBLElBQ3RFLENBQUM7QUFFRCxTQUFLLHlEQUF5RCxNQUFNO0FBQ25FLFlBQU0sWUFBWSxtQkFBbUIsV0FBVztBQUNoRCxZQUFNLFlBQVksbUJBQW1CLFdBQVc7QUFDaEQsWUFBTSxZQUFZLENBQUMsV0FBVyxTQUFTO0FBR3ZDLDJCQUFxQixxQkFBcUIseUJBQXlCLFdBQVc7QUFBQSxRQUM3RSxhQUFhO0FBQUEsTUFDZCxDQUFDO0FBRUQsWUFBTSxTQUFTLDhCQUE4QixvQkFBb0IsU0FBUztBQUcxRSxhQUFPLFlBQVksT0FBTyxRQUFRLEdBQUcsaUNBQWlDO0FBQ3RFLGFBQU8sR0FBRyxPQUFPLFNBQVMsU0FBUyxHQUFHLHNDQUFzQztBQUM1RSxhQUFPLEdBQUcsQ0FBQyxPQUFPLFNBQVMsU0FBUyxHQUFHLHNDQUFzQztBQUFBLElBQzlFLENBQUM7QUFFRCxTQUFLLHVEQUF1RCxNQUFNO0FBQ2pFLFlBQU0sWUFBWSxtQkFBbUIsV0FBVztBQUNoRCxZQUFNLFlBQVksbUJBQW1CLFdBQVc7QUFDaEQsWUFBTSxZQUFZLENBQUMsV0FBVyxTQUFTO0FBR3ZDLDJCQUFxQixxQkFBcUIseUJBQXlCLFdBQVc7QUFBQSxRQUM3RSxhQUFhO0FBQUEsTUFDZCxDQUFDO0FBRUQsWUFBTSxTQUFTLDhCQUE4QixvQkFBb0IsU0FBUztBQUcxRSxhQUFPLFlBQVksT0FBTyxRQUFRLEdBQUcsOEJBQThCO0FBQ25FLGFBQU8sR0FBRyxPQUFPLFNBQVMsU0FBUyxHQUFHLDRDQUE0QztBQUNsRixhQUFPLEdBQUcsT0FBTyxTQUFTLFNBQVMsR0FBRyxzQ0FBc0M7QUFBQSxJQUM3RSxDQUFDO0FBRUQsU0FBSywrQ0FBK0MsTUFBTTtBQUN6RCxZQUFNLFlBQVksbUJBQW1CLFdBQVc7QUFDaEQsWUFBTSxZQUFZLG1CQUFtQixXQUFXO0FBQ2hELFlBQU0sWUFBWSxtQkFBbUIsV0FBVztBQUNoRCxZQUFNLFlBQVksQ0FBQyxXQUFXLFdBQVcsU0FBUztBQUdsRCwyQkFBcUIscUJBQXFCLHlCQUF5QixXQUFXO0FBQUEsUUFDN0UsYUFBYTtBQUFBLFFBQ2IsYUFBYTtBQUFBLE1BQ2QsQ0FBQztBQUVELFlBQU0sU0FBUyw4QkFBOEIsb0JBQW9CLFNBQVM7QUFHMUUsYUFBTyxZQUFZLE9BQU8sUUFBUSxHQUFHLDZCQUE2QjtBQUNsRSxhQUFPLEdBQUcsT0FBTyxTQUFTLFNBQVMsR0FBRyw0Q0FBNEM7QUFDbEYsYUFBTyxHQUFHLE9BQU8sU0FBUyxTQUFTLEdBQUcsc0NBQXNDO0FBQzVFLGFBQU8sR0FBRyxDQUFDLE9BQU8sU0FBUyxTQUFTLEdBQUcsc0NBQXNDO0FBQUEsSUFDOUUsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
