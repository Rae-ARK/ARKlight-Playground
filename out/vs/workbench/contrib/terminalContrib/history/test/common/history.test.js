import { deepStrictEqual, strictEqual, ok } from "assert";
import { VSBuffer } from "../../../../../../base/common/buffer.js";
import { Schemas } from "../../../../../../base/common/network.js";
import { join } from "../../../../../../base/common/path.js";
import { isWindows, OperatingSystem } from "../../../../../../base/common/platform.js";
import { env } from "../../../../../../base/common/process.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IStorageService } from "../../../../../../platform/storage/common/storage.js";
import { IRemoteAgentService } from "../../../../../services/remote/common/remoteAgentService.js";
import { TestStorageService } from "../../../../../test/common/workbenchTestServices.js";
import { fetchBashHistory, fetchFishHistory, fetchPwshHistory, fetchZshHistory, sanitizeFishHistoryCmd, TerminalPersistedHistory } from "../../common/history.js";
function getConfig(limit) {
  return {
    terminal: {
      integrated: {
        shellIntegration: {
          history: limit
        }
      }
    }
  };
}
const expectedCommands = [
  "single line command",
  'git commit -m "A wrapped line in pwsh history\n\nSome commit description\n\nFixes #xyz"',
  "git status",
  'two "\nline"'
];
suite("Terminal history", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  suite("TerminalPersistedHistory", () => {
    let history;
    let instantiationService;
    let configurationService;
    setup(() => {
      configurationService = new TestConfigurationService(getConfig(5));
      instantiationService = store.add(new TestInstantiationService());
      instantiationService.set(IConfigurationService, configurationService);
      instantiationService.set(IStorageService, store.add(new TestStorageService()));
      history = store.add(instantiationService.createInstance(TerminalPersistedHistory, "test"));
    });
    teardown(() => {
      instantiationService.dispose();
    });
    test("should support adding items to the cache and respect LRU", () => {
      history.add("foo", 1);
      deepStrictEqual(Array.from(history.entries), [
        ["foo", 1]
      ]);
      history.add("bar", 2);
      deepStrictEqual(Array.from(history.entries), [
        ["foo", 1],
        ["bar", 2]
      ]);
      history.add("foo", 1);
      deepStrictEqual(Array.from(history.entries), [
        ["bar", 2],
        ["foo", 1]
      ]);
    });
    test("should support removing specific items", () => {
      history.add("1", 1);
      history.add("2", 2);
      history.add("3", 3);
      history.add("4", 4);
      history.add("5", 5);
      strictEqual(Array.from(history.entries).length, 5);
      history.add("6", 6);
      strictEqual(Array.from(history.entries).length, 5);
    });
    test("should limit the number of entries based on config", () => {
      history.add("1", 1);
      history.add("2", 2);
      history.add("3", 3);
      history.add("4", 4);
      history.add("5", 5);
      strictEqual(Array.from(history.entries).length, 5);
      history.add("6", 6);
      strictEqual(Array.from(history.entries).length, 5);
      configurationService.setUserConfiguration("terminal", getConfig(2).terminal);
      configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: () => true });
      strictEqual(Array.from(history.entries).length, 2);
      history.add("7", 7);
      strictEqual(Array.from(history.entries).length, 2);
      configurationService.setUserConfiguration("terminal", getConfig(3).terminal);
      configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: () => true });
      strictEqual(Array.from(history.entries).length, 2);
      history.add("8", 8);
      strictEqual(Array.from(history.entries).length, 3);
      history.add("9", 9);
      strictEqual(Array.from(history.entries).length, 3);
    });
    test("should reload from storage service after recreation", () => {
      history.add("1", 1);
      history.add("2", 2);
      history.add("3", 3);
      strictEqual(Array.from(history.entries).length, 3);
      const history2 = store.add(instantiationService.createInstance(TerminalPersistedHistory, "test"));
      strictEqual(Array.from(history2.entries).length, 3);
    });
  });
  suite("fetchBashHistory", () => {
    let fileScheme;
    let filePath;
    const fileContent = [
      "single line command",
      'git commit -m "A wrapped line in pwsh history',
      "",
      "Some commit description",
      "",
      'Fixes #xyz"',
      "git status",
      'two "',
      'line"'
    ].join("\n");
    let instantiationService;
    let remoteConnection = null;
    let remoteEnvironment = null;
    setup(() => {
      instantiationService = new TestInstantiationService();
      instantiationService.stub(IFileService, {
        async readFile(resource) {
          const expected = URI.from({ scheme: fileScheme, path: filePath });
          strictEqual(resource.scheme, expected.scheme);
          strictEqual(resource.path, expected.path);
          return { value: VSBuffer.fromString(fileContent) };
        }
      });
      instantiationService.stub(IRemoteAgentService, {
        async getEnvironment() {
          return remoteEnvironment;
        },
        getConnection() {
          return remoteConnection;
        }
      });
    });
    teardown(() => {
      instantiationService.dispose();
    });
    if (!isWindows) {
      suite("local", () => {
        let originalEnvValues;
        setup(() => {
          originalEnvValues = { HOME: env["HOME"] };
          env["HOME"] = "/home/user";
          remoteConnection = { remoteAuthority: "some-remote" };
          fileScheme = Schemas.vscodeRemote;
          filePath = "/home/user/.bash_history";
        });
        teardown(() => {
          if (originalEnvValues["HOME"] === void 0) {
            delete env["HOME"];
          } else {
            env["HOME"] = originalEnvValues["HOME"];
          }
        });
        test("current OS", async () => {
          filePath = "/home/user/.bash_history";
          deepStrictEqual((await instantiationService.invokeFunction(fetchBashHistory)).commands, expectedCommands);
        });
      });
    }
    suite("remote", () => {
      let originalEnvValues;
      setup(() => {
        originalEnvValues = { HOME: env["HOME"] };
        env["HOME"] = "/home/user";
        remoteConnection = { remoteAuthority: "some-remote" };
        fileScheme = Schemas.vscodeRemote;
        filePath = "/home/user/.bash_history";
      });
      teardown(() => {
        if (originalEnvValues["HOME"] === void 0) {
          delete env["HOME"];
        } else {
          env["HOME"] = originalEnvValues["HOME"];
        }
      });
      test("Windows", async () => {
        remoteEnvironment = { os: OperatingSystem.Windows };
        strictEqual(await instantiationService.invokeFunction(fetchBashHistory), void 0);
      });
      test("macOS", async () => {
        remoteEnvironment = { os: OperatingSystem.Macintosh };
        deepStrictEqual((await instantiationService.invokeFunction(fetchBashHistory)).commands, expectedCommands);
      });
      test("Linux", async () => {
        remoteEnvironment = { os: OperatingSystem.Linux };
        deepStrictEqual((await instantiationService.invokeFunction(fetchBashHistory)).commands, expectedCommands);
      });
    });
  });
  suite("fetchZshHistory", () => {
    let fileScheme;
    let filePath;
    const fileContentType = [
      {
        type: "simple",
        content: [
          "single line command",
          'git commit -m "A wrapped line in pwsh history\\',
          "\\",
          "Some commit description\\",
          "\\",
          'Fixes #xyz"',
          "git status",
          'two "\\',
          'line"'
        ].join("\n")
      },
      {
        type: "extended",
        content: [
          ": 1655252330:0;single line command",
          ': 1655252330:0;git commit -m "A wrapped line in pwsh history\\',
          "\\",
          "Some commit description\\",
          "\\",
          'Fixes #xyz"',
          ": 1655252330:0;git status",
          ': 1655252330:0;two "\\',
          'line"'
        ].join("\n")
      }
    ];
    let instantiationService;
    let remoteConnection = null;
    let remoteEnvironment = null;
    for (const { type, content } of fileContentType) {
      suite(type, () => {
        setup(() => {
          instantiationService = new TestInstantiationService();
          instantiationService.stub(IFileService, {
            async readFile(resource) {
              const expected = URI.from({ scheme: fileScheme, path: filePath });
              strictEqual(resource.scheme, expected.scheme);
              strictEqual(resource.path, expected.path);
              return { value: VSBuffer.fromString(content) };
            }
          });
          instantiationService.stub(IRemoteAgentService, {
            async getEnvironment() {
              return remoteEnvironment;
            },
            getConnection() {
              return remoteConnection;
            }
          });
        });
        teardown(() => {
          instantiationService.dispose();
        });
        if (!isWindows) {
          suite("local", () => {
            let originalEnvValues;
            setup(() => {
              originalEnvValues = { HOME: env["HOME"] };
              env["HOME"] = "/home/user";
              remoteConnection = { remoteAuthority: "some-remote" };
              fileScheme = Schemas.vscodeRemote;
              filePath = "/home/user/.bash_history";
            });
            teardown(() => {
              if (originalEnvValues["HOME"] === void 0) {
                delete env["HOME"];
              } else {
                env["HOME"] = originalEnvValues["HOME"];
              }
            });
            test("current OS", async () => {
              filePath = "/home/user/.zsh_history";
              deepStrictEqual((await instantiationService.invokeFunction(fetchZshHistory)).commands, expectedCommands);
            });
          });
        }
        suite("remote", () => {
          let originalEnvValues;
          setup(() => {
            originalEnvValues = { HOME: env["HOME"] };
            env["HOME"] = "/home/user";
            remoteConnection = { remoteAuthority: "some-remote" };
            fileScheme = Schemas.vscodeRemote;
            filePath = "/home/user/.zsh_history";
          });
          teardown(() => {
            if (originalEnvValues["HOME"] === void 0) {
              delete env["HOME"];
            } else {
              env["HOME"] = originalEnvValues["HOME"];
            }
          });
          test("Windows", async () => {
            remoteEnvironment = { os: OperatingSystem.Windows };
            strictEqual(await instantiationService.invokeFunction(fetchZshHistory), void 0);
          });
          test("macOS", async () => {
            remoteEnvironment = { os: OperatingSystem.Macintosh };
            deepStrictEqual((await instantiationService.invokeFunction(fetchZshHistory)).commands, expectedCommands);
          });
          test("Linux", async () => {
            remoteEnvironment = { os: OperatingSystem.Linux };
            deepStrictEqual((await instantiationService.invokeFunction(fetchZshHistory)).commands, expectedCommands);
          });
        });
      });
    }
  });
  suite("fetchPwshHistory", () => {
    let fileScheme;
    let filePath;
    const fileContent = [
      "single line command",
      'git commit -m "A wrapped line in pwsh history`',
      "`",
      "Some commit description`",
      "`",
      'Fixes #xyz"',
      "git status",
      'two "`',
      'line"'
    ].join("\n");
    let instantiationService;
    let remoteConnection = null;
    let remoteEnvironment = null;
    setup(() => {
      instantiationService = new TestInstantiationService();
      instantiationService.stub(IFileService, {
        async readFile(resource) {
          const expected = URI.from({
            scheme: fileScheme,
            authority: remoteConnection?.remoteAuthority,
            path: URI.file(filePath).path
          });
          strictEqual(resource.toString().replaceAll("%5C", "/"), expected.toString().replaceAll("%5C", "/"));
          return { value: VSBuffer.fromString(fileContent) };
        }
      });
      instantiationService.stub(IRemoteAgentService, {
        async getEnvironment() {
          return remoteEnvironment;
        },
        getConnection() {
          return remoteConnection;
        }
      });
    });
    teardown(() => {
      instantiationService.dispose();
    });
    suite("local", () => {
      let originalEnvValues;
      setup(() => {
        originalEnvValues = { HOME: env["HOME"], APPDATA: env["APPDATA"] };
        env["HOME"] = "/home/user";
        env["APPDATA"] = "C:\\AppData";
        remoteConnection = { remoteAuthority: "some-remote" };
        fileScheme = Schemas.vscodeRemote;
        filePath = "/home/user/.zsh_history";
        originalEnvValues = { HOME: env["HOME"], APPDATA: env["APPDATA"] };
      });
      teardown(() => {
        if (originalEnvValues["HOME"] === void 0) {
          delete env["HOME"];
        } else {
          env["HOME"] = originalEnvValues["HOME"];
        }
        if (originalEnvValues["APPDATA"] === void 0) {
          delete env["APPDATA"];
        } else {
          env["APPDATA"] = originalEnvValues["APPDATA"];
        }
      });
      test("current OS", async () => {
        if (isWindows) {
          filePath = join(env["APPDATA"], "Microsoft\\Windows\\PowerShell\\PSReadLine\\ConsoleHost_history.txt");
        } else {
          filePath = join(env["HOME"], ".local/share/powershell/PSReadline/ConsoleHost_history.txt");
        }
        deepStrictEqual((await instantiationService.invokeFunction(fetchPwshHistory)).commands, expectedCommands);
      });
    });
    suite("remote", () => {
      let originalEnvValues;
      setup(() => {
        remoteConnection = { remoteAuthority: "some-remote" };
        fileScheme = Schemas.vscodeRemote;
        originalEnvValues = { HOME: env["HOME"], APPDATA: env["APPDATA"] };
      });
      teardown(() => {
        if (originalEnvValues["HOME"] === void 0) {
          delete env["HOME"];
        } else {
          env["HOME"] = originalEnvValues["HOME"];
        }
        if (originalEnvValues["APPDATA"] === void 0) {
          delete env["APPDATA"];
        } else {
          env["APPDATA"] = originalEnvValues["APPDATA"];
        }
      });
      test("Windows", async () => {
        remoteEnvironment = { os: OperatingSystem.Windows };
        env["APPDATA"] = "C:\\AppData";
        filePath = "C:\\AppData\\Microsoft\\Windows\\PowerShell\\PSReadLine\\ConsoleHost_history.txt";
        deepStrictEqual((await instantiationService.invokeFunction(fetchPwshHistory)).commands, expectedCommands);
      });
      test("macOS", async () => {
        remoteEnvironment = { os: OperatingSystem.Macintosh };
        env["HOME"] = "/home/user";
        filePath = "/home/user/.local/share/powershell/PSReadline/ConsoleHost_history.txt";
        deepStrictEqual((await instantiationService.invokeFunction(fetchPwshHistory)).commands, expectedCommands);
      });
      test("Linux", async () => {
        remoteEnvironment = { os: OperatingSystem.Linux };
        env["HOME"] = "/home/user";
        filePath = "/home/user/.local/share/powershell/PSReadline/ConsoleHost_history.txt";
        deepStrictEqual((await instantiationService.invokeFunction(fetchPwshHistory)).commands, expectedCommands);
      });
    });
  });
  suite("fetchFishHistory", () => {
    let fileScheme;
    let filePath;
    const fileContent = [
      "- cmd: single line command",
      "  when: 1650000000",
      '- cmd: git commit -m "A wrapped line in pwsh history\\n\\nSome commit description\\n\\nFixes #xyz"',
      "  when: 1650000010",
      "- cmd: git status",
      "  when: 1650000020",
      '- cmd: two "\\nline"',
      "  when: 1650000030"
    ].join("\n");
    let instantiationService;
    let remoteConnection = null;
    let remoteEnvironment = null;
    setup(() => {
      instantiationService = new TestInstantiationService();
      instantiationService.stub(IFileService, {
        async readFile(resource) {
          const expected = URI.from({ scheme: fileScheme, path: filePath });
          strictEqual(resource.scheme, expected.scheme);
          strictEqual(resource.path, expected.path);
          return { value: VSBuffer.fromString(fileContent) };
        }
      });
      instantiationService.stub(IRemoteAgentService, {
        async getEnvironment() {
          return remoteEnvironment;
        },
        getConnection() {
          return remoteConnection;
        }
      });
    });
    teardown(() => {
      instantiationService.dispose();
    });
    if (!isWindows) {
      suite("local", () => {
        let originalEnvValues;
        setup(() => {
          originalEnvValues = { HOME: env["HOME"], XDG_DATA_HOME: env["XDG_DATA_HOME"] };
          env["HOME"] = "/home/user";
          delete env["XDG_DATA_HOME"];
          remoteConnection = { remoteAuthority: "some-remote" };
          fileScheme = Schemas.vscodeRemote;
          filePath = "/home/user/.local/share/fish/fish_history";
        });
        teardown(() => {
          if (originalEnvValues["HOME"] === void 0) {
            delete env["HOME"];
          } else {
            env["HOME"] = originalEnvValues["HOME"];
          }
          if (originalEnvValues["XDG_DATA_HOME"] === void 0) {
            delete env["XDG_DATA_HOME"];
          } else {
            env["XDG_DATA_HOME"] = originalEnvValues["XDG_DATA_HOME"];
          }
        });
        test("current OS", async () => {
          filePath = "/home/user/.local/share/fish/fish_history";
          deepStrictEqual((await instantiationService.invokeFunction(fetchFishHistory)).commands, expectedCommands);
        });
      });
      suite("local (overriden path)", () => {
        let originalEnvValues;
        setup(() => {
          originalEnvValues = { XDG_DATA_HOME: env["XDG_DATA_HOME"] };
          env["XDG_DATA_HOME"] = "/home/user/data-home";
          remoteConnection = { remoteAuthority: "some-remote" };
          fileScheme = Schemas.vscodeRemote;
          filePath = "/home/user/data-home/fish/fish_history";
        });
        teardown(() => {
          if (originalEnvValues["XDG_DATA_HOME"] === void 0) {
            delete env["XDG_DATA_HOME"];
          } else {
            env["XDG_DATA_HOME"] = originalEnvValues["XDG_DATA_HOME"];
          }
        });
        test("current OS", async () => {
          filePath = "/home/user/data-home/fish/fish_history";
          deepStrictEqual((await instantiationService.invokeFunction(fetchFishHistory)).commands, expectedCommands);
        });
      });
    }
    suite("remote", () => {
      let originalEnvValues;
      setup(() => {
        originalEnvValues = { HOME: env["HOME"], XDG_DATA_HOME: env["XDG_DATA_HOME"] };
        env["HOME"] = "/home/user";
        delete env["XDG_DATA_HOME"];
        remoteConnection = { remoteAuthority: "some-remote" };
        fileScheme = Schemas.vscodeRemote;
        filePath = "/home/user/.local/share/fish/fish_history";
      });
      teardown(() => {
        if (originalEnvValues["HOME"] === void 0) {
          delete env["HOME"];
        } else {
          env["HOME"] = originalEnvValues["HOME"];
        }
        if (originalEnvValues["XDG_DATA_HOME"] === void 0) {
          delete env["XDG_DATA_HOME"];
        } else {
          env["XDG_DATA_HOME"] = originalEnvValues["XDG_DATA_HOME"];
        }
      });
      test("Windows", async () => {
        remoteEnvironment = { os: OperatingSystem.Windows };
        strictEqual(await instantiationService.invokeFunction(fetchFishHistory), void 0);
      });
      test("macOS", async () => {
        remoteEnvironment = { os: OperatingSystem.Macintosh };
        deepStrictEqual((await instantiationService.invokeFunction(fetchFishHistory)).commands, expectedCommands);
      });
      test("Linux", async () => {
        remoteEnvironment = { os: OperatingSystem.Linux };
        deepStrictEqual((await instantiationService.invokeFunction(fetchFishHistory)).commands, expectedCommands);
      });
    });
    suite("remote (overriden path)", () => {
      let originalEnvValues;
      setup(() => {
        originalEnvValues = { XDG_DATA_HOME: env["XDG_DATA_HOME"] };
        env["XDG_DATA_HOME"] = "/home/user/data-home";
        remoteConnection = { remoteAuthority: "some-remote" };
        fileScheme = Schemas.vscodeRemote;
        filePath = "/home/user/data-home/fish/fish_history";
      });
      teardown(() => {
        if (originalEnvValues["XDG_DATA_HOME"] === void 0) {
          delete env["XDG_DATA_HOME"];
        } else {
          env["XDG_DATA_HOME"] = originalEnvValues["XDG_DATA_HOME"];
        }
      });
      test("Windows", async () => {
        remoteEnvironment = { os: OperatingSystem.Windows };
        strictEqual(await instantiationService.invokeFunction(fetchFishHistory), void 0);
      });
      test("macOS", async () => {
        remoteEnvironment = { os: OperatingSystem.Macintosh };
        deepStrictEqual((await instantiationService.invokeFunction(fetchFishHistory)).commands, expectedCommands);
      });
      test("Linux", async () => {
        remoteEnvironment = { os: OperatingSystem.Linux };
        deepStrictEqual((await instantiationService.invokeFunction(fetchFishHistory)).commands, expectedCommands);
      });
    });
    suite("sanitizeFishHistoryCmd", () => {
      test("valid new-lines", () => {
        const cases = [
          "\\n",
          "\\n at start",
          "some \\n in the middle",
          "at the end \\n",
          "\\\\\\n",
          "\\\\\\n valid at start",
          "valid \\\\\\n in the middle",
          "valid in the end \\\\\\n",
          "\\\\\\\\\\n",
          "\\\\\\\\\\n valid at start",
          "valid \\\\\\\\\\n in the middle",
          "valid in the end \\\\\\\\\\n",
          "mixed valid \\r\\n",
          "mixed valid \\\\\\r\\n",
          "mixed valid \\r\\\\\\n"
        ];
        for (const x of cases) {
          ok(sanitizeFishHistoryCmd(x).includes("\n"));
        }
      });
      test("invalid new-lines", () => {
        const cases = [
          "\\\\n",
          "\\\\n invalid at start",
          "invalid \\\\n in the middle",
          "invalid in the end \\\\n",
          "\\\\\\\\n",
          "\\\\\\\\n invalid at start",
          "invalid \\\\\\\\n in the middle",
          "invalid in the end \\\\\\\\n",
          "mixed invalid \\r\\\\n",
          "mixed invalid \\r\\\\\\\\n",
          'echo "\\\\n"'
        ];
        for (const x of cases) {
          ok(!sanitizeFishHistoryCmd(x).includes("\n"));
        }
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9oaXN0b3J5L3Rlc3QvY29tbW9uL2hpc3RvcnkudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGRlZXBTdHJpY3RFcXVhbCwgc3RyaWN0RXF1YWwsIG9rIH0gZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGpvaW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGlzV2luZG93cywgT3BlcmF0aW5nU3lzdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgZW52IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcHJvY2Vzcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRFbnZpcm9ubWVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlbW90ZS9jb21tb24vcmVtb3RlQWdlbnRFbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudENvbm5lY3Rpb24sIElSZW1vdGVBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0U3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgZmV0Y2hCYXNoSGlzdG9yeSwgZmV0Y2hGaXNoSGlzdG9yeSwgZmV0Y2hQd3NoSGlzdG9yeSwgZmV0Y2hac2hIaXN0b3J5LCBzYW5pdGl6ZUZpc2hIaXN0b3J5Q21kLCBUZXJtaW5hbFBlcnNpc3RlZEhpc3RvcnksIHR5cGUgSVRlcm1pbmFsUGVyc2lzdGVkSGlzdG9yeSB9IGZyb20gJy4uLy4uL2NvbW1vbi9oaXN0b3J5LmpzJztcblxuZnVuY3Rpb24gZ2V0Q29uZmlnKGxpbWl0OiBudW1iZXIpIHtcblx0cmV0dXJuIHtcblx0XHR0ZXJtaW5hbDoge1xuXHRcdFx0aW50ZWdyYXRlZDoge1xuXHRcdFx0XHRzaGVsbEludGVncmF0aW9uOiB7XG5cdFx0XHRcdFx0aGlzdG9yeTogbGltaXRcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fTtcbn1cblxuY29uc3QgZXhwZWN0ZWRDb21tYW5kcyA9IFtcblx0J3NpbmdsZSBsaW5lIGNvbW1hbmQnLFxuXHQnZ2l0IGNvbW1pdCAtbSBcIkEgd3JhcHBlZCBsaW5lIGluIHB3c2ggaGlzdG9yeVxcblxcblNvbWUgY29tbWl0IGRlc2NyaXB0aW9uXFxuXFxuRml4ZXMgI3h5elwiJyxcblx0J2dpdCBzdGF0dXMnLFxuXHQndHdvIFwiXFxubGluZVwiJ1xuXTtcblxuc3VpdGUoJ1Rlcm1pbmFsIGhpc3RvcnknLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ1Rlcm1pbmFsUGVyc2lzdGVkSGlzdG9yeScsICgpID0+IHtcblx0XHRsZXQgaGlzdG9yeTogSVRlcm1pbmFsUGVyc2lzdGVkSGlzdG9yeTxudW1iZXI+O1xuXHRcdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRcdGxldCBjb25maWd1cmF0aW9uU2VydmljZTogVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXG5cdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKGdldENvbmZpZyg1KSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElTdG9yYWdlU2VydmljZSwgc3RvcmUuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSkpO1xuXG5cdFx0XHRoaXN0b3J5ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsUGVyc2lzdGVkSGlzdG9yeTxudW1iZXI+LCAndGVzdCcpKTtcblx0XHR9KTtcblxuXHRcdHRlYXJkb3duKCgpID0+IHtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBzdXBwb3J0IGFkZGluZyBpdGVtcyB0byB0aGUgY2FjaGUgYW5kIHJlc3BlY3QgTFJVJywgKCkgPT4ge1xuXHRcdFx0aGlzdG9yeS5hZGQoJ2ZvbycsIDEpO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKEFycmF5LmZyb20oaGlzdG9yeS5lbnRyaWVzKSwgW1xuXHRcdFx0XHRbJ2ZvbycsIDFdXG5cdFx0XHRdKTtcblx0XHRcdGhpc3RvcnkuYWRkKCdiYXInLCAyKTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChBcnJheS5mcm9tKGhpc3RvcnkuZW50cmllcyksIFtcblx0XHRcdFx0Wydmb28nLCAxXSxcblx0XHRcdFx0WydiYXInLCAyXVxuXHRcdFx0XSk7XG5cdFx0XHRoaXN0b3J5LmFkZCgnZm9vJywgMSk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoQXJyYXkuZnJvbShoaXN0b3J5LmVudHJpZXMpLCBbXG5cdFx0XHRcdFsnYmFyJywgMl0sXG5cdFx0XHRcdFsnZm9vJywgMV1cblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHN1cHBvcnQgcmVtb3Zpbmcgc3BlY2lmaWMgaXRlbXMnLCAoKSA9PiB7XG5cdFx0XHRoaXN0b3J5LmFkZCgnMScsIDEpO1xuXHRcdFx0aGlzdG9yeS5hZGQoJzInLCAyKTtcblx0XHRcdGhpc3RvcnkuYWRkKCczJywgMyk7XG5cdFx0XHRoaXN0b3J5LmFkZCgnNCcsIDQpO1xuXHRcdFx0aGlzdG9yeS5hZGQoJzUnLCA1KTtcblx0XHRcdHN0cmljdEVxdWFsKEFycmF5LmZyb20oaGlzdG9yeS5lbnRyaWVzKS5sZW5ndGgsIDUpO1xuXHRcdFx0aGlzdG9yeS5hZGQoJzYnLCA2KTtcblx0XHRcdHN0cmljdEVxdWFsKEFycmF5LmZyb20oaGlzdG9yeS5lbnRyaWVzKS5sZW5ndGgsIDUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGxpbWl0IHRoZSBudW1iZXIgb2YgZW50cmllcyBiYXNlZCBvbiBjb25maWcnLCAoKSA9PiB7XG5cdFx0XHRoaXN0b3J5LmFkZCgnMScsIDEpO1xuXHRcdFx0aGlzdG9yeS5hZGQoJzInLCAyKTtcblx0XHRcdGhpc3RvcnkuYWRkKCczJywgMyk7XG5cdFx0XHRoaXN0b3J5LmFkZCgnNCcsIDQpO1xuXHRcdFx0aGlzdG9yeS5hZGQoJzUnLCA1KTtcblx0XHRcdHN0cmljdEVxdWFsKEFycmF5LmZyb20oaGlzdG9yeS5lbnRyaWVzKS5sZW5ndGgsIDUpO1xuXHRcdFx0aGlzdG9yeS5hZGQoJzYnLCA2KTtcblx0XHRcdHN0cmljdEVxdWFsKEFycmF5LmZyb20oaGlzdG9yeS5lbnRyaWVzKS5sZW5ndGgsIDUpO1xuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ3Rlcm1pbmFsJywgZ2V0Q29uZmlnKDIpLnRlcm1pbmFsKTtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uRW1pdHRlci5maXJlKHsgYWZmZWN0c0NvbmZpZ3VyYXRpb246ICgpID0+IHRydWUgfSBhcyBhbnkpO1xuXHRcdFx0c3RyaWN0RXF1YWwoQXJyYXkuZnJvbShoaXN0b3J5LmVudHJpZXMpLmxlbmd0aCwgMik7XG5cdFx0XHRoaXN0b3J5LmFkZCgnNycsIDcpO1xuXHRcdFx0c3RyaWN0RXF1YWwoQXJyYXkuZnJvbShoaXN0b3J5LmVudHJpZXMpLmxlbmd0aCwgMik7XG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbigndGVybWluYWwnLCBnZXRDb25maWcoMykudGVybWluYWwpO1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb25FbWl0dGVyLmZpcmUoeyBhZmZlY3RzQ29uZmlndXJhdGlvbjogKCkgPT4gdHJ1ZSB9IGFzIGFueSk7XG5cdFx0XHRzdHJpY3RFcXVhbChBcnJheS5mcm9tKGhpc3RvcnkuZW50cmllcykubGVuZ3RoLCAyKTtcblx0XHRcdGhpc3RvcnkuYWRkKCc4JywgOCk7XG5cdFx0XHRzdHJpY3RFcXVhbChBcnJheS5mcm9tKGhpc3RvcnkuZW50cmllcykubGVuZ3RoLCAzKTtcblx0XHRcdGhpc3RvcnkuYWRkKCc5JywgOSk7XG5cdFx0XHRzdHJpY3RFcXVhbChBcnJheS5mcm9tKGhpc3RvcnkuZW50cmllcykubGVuZ3RoLCAzKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZWxvYWQgZnJvbSBzdG9yYWdlIHNlcnZpY2UgYWZ0ZXIgcmVjcmVhdGlvbicsICgpID0+IHtcblx0XHRcdGhpc3RvcnkuYWRkKCcxJywgMSk7XG5cdFx0XHRoaXN0b3J5LmFkZCgnMicsIDIpO1xuXHRcdFx0aGlzdG9yeS5hZGQoJzMnLCAzKTtcblx0XHRcdHN0cmljdEVxdWFsKEFycmF5LmZyb20oaGlzdG9yeS5lbnRyaWVzKS5sZW5ndGgsIDMpO1xuXHRcdFx0Y29uc3QgaGlzdG9yeTIgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxQZXJzaXN0ZWRIaXN0b3J5LCAndGVzdCcpKTtcblx0XHRcdHN0cmljdEVxdWFsKEFycmF5LmZyb20oaGlzdG9yeTIuZW50cmllcykubGVuZ3RoLCAzKTtcblx0XHR9KTtcblx0fSk7XG5cdHN1aXRlKCdmZXRjaEJhc2hIaXN0b3J5JywgKCkgPT4ge1xuXHRcdGxldCBmaWxlU2NoZW1lOiBzdHJpbmc7XG5cdFx0bGV0IGZpbGVQYXRoOiBzdHJpbmc7XG5cdFx0Y29uc3QgZmlsZUNvbnRlbnQ6IHN0cmluZyA9IFtcblx0XHRcdCdzaW5nbGUgbGluZSBjb21tYW5kJyxcblx0XHRcdCdnaXQgY29tbWl0IC1tIFwiQSB3cmFwcGVkIGxpbmUgaW4gcHdzaCBoaXN0b3J5Jyxcblx0XHRcdCcnLFxuXHRcdFx0J1NvbWUgY29tbWl0IGRlc2NyaXB0aW9uJyxcblx0XHRcdCcnLFxuXHRcdFx0J0ZpeGVzICN4eXpcIicsXG5cdFx0XHQnZ2l0IHN0YXR1cycsXG5cdFx0XHQndHdvIFwiJyxcblx0XHRcdCdsaW5lXCInXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRcdGxldCByZW1vdGVDb25uZWN0aW9uOiBQaWNrPElSZW1vdGVBZ2VudENvbm5lY3Rpb24sICdyZW1vdGVBdXRob3JpdHknPiB8IG51bGwgPSBudWxsO1xuXHRcdGxldCByZW1vdGVFbnZpcm9ubWVudDogUGljazxJUmVtb3RlQWdlbnRFbnZpcm9ubWVudCwgJ29zJz4gfCBudWxsID0gbnVsbDtcblxuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIHtcblx0XHRcdFx0YXN5bmMgcmVhZEZpbGUocmVzb3VyY2U6IFVSSSkge1xuXHRcdFx0XHRcdGNvbnN0IGV4cGVjdGVkID0gVVJJLmZyb20oeyBzY2hlbWU6IGZpbGVTY2hlbWUsIHBhdGg6IGZpbGVQYXRoIH0pO1xuXHRcdFx0XHRcdHN0cmljdEVxdWFsKHJlc291cmNlLnNjaGVtZSwgZXhwZWN0ZWQuc2NoZW1lKTtcblx0XHRcdFx0XHRzdHJpY3RFcXVhbChyZXNvdXJjZS5wYXRoLCBleHBlY3RlZC5wYXRoKTtcblx0XHRcdFx0XHRyZXR1cm4geyB2YWx1ZTogVlNCdWZmZXIuZnJvbVN0cmluZyhmaWxlQ29udGVudCkgfTtcblx0XHRcdFx0fVxuXHRcdFx0fSBhcyBQaWNrPElGaWxlU2VydmljZSwgJ3JlYWRGaWxlJz4pO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUmVtb3RlQWdlbnRTZXJ2aWNlLCB7XG5cdFx0XHRcdGFzeW5jIGdldEVudmlyb25tZW50KCkgeyByZXR1cm4gcmVtb3RlRW52aXJvbm1lbnQ7IH0sXG5cdFx0XHRcdGdldENvbm5lY3Rpb24oKSB7IHJldHVybiByZW1vdGVDb25uZWN0aW9uOyB9XG5cdFx0XHR9IGFzIFBpY2s8SVJlbW90ZUFnZW50U2VydmljZSwgJ2dldENvbm5lY3Rpb24nIHwgJ2dldEVudmlyb25tZW50Jz4pO1xuXHRcdH0pO1xuXG5cdFx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0aWYgKCFpc1dpbmRvd3MpIHtcblx0XHRcdHN1aXRlKCdsb2NhbCcsICgpID0+IHtcblx0XHRcdFx0bGV0IG9yaWdpbmFsRW52VmFsdWVzOiB7IEhPTUU6IHN0cmluZyB8IHVuZGVmaW5lZCB9O1xuXHRcdFx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRcdFx0b3JpZ2luYWxFbnZWYWx1ZXMgPSB7IEhPTUU6IGVudlsnSE9NRSddIH07XG5cdFx0XHRcdFx0ZW52WydIT01FJ10gPSAnL2hvbWUvdXNlcic7XG5cdFx0XHRcdFx0cmVtb3RlQ29ubmVjdGlvbiA9IHsgcmVtb3RlQXV0aG9yaXR5OiAnc29tZS1yZW1vdGUnIH07XG5cdFx0XHRcdFx0ZmlsZVNjaGVtZSA9IFNjaGVtYXMudnNjb2RlUmVtb3RlO1xuXHRcdFx0XHRcdGZpbGVQYXRoID0gJy9ob21lL3VzZXIvLmJhc2hfaGlzdG9yeSc7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKG9yaWdpbmFsRW52VmFsdWVzWydIT01FJ10gPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0ZGVsZXRlIGVudlsnSE9NRSddO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRlbnZbJ0hPTUUnXSA9IG9yaWdpbmFsRW52VmFsdWVzWydIT01FJ107XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGVzdCgnY3VycmVudCBPUycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRmaWxlUGF0aCA9ICcvaG9tZS91c2VyLy5iYXNoX2hpc3RvcnknO1xuXHRcdFx0XHRcdGRlZXBTdHJpY3RFcXVhbCgoYXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oZmV0Y2hCYXNoSGlzdG9yeSkpIS5jb21tYW5kcywgZXhwZWN0ZWRDb21tYW5kcyk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHN1aXRlKCdyZW1vdGUnLCAoKSA9PiB7XG5cdFx0XHRsZXQgb3JpZ2luYWxFbnZWYWx1ZXM6IHsgSE9NRTogc3RyaW5nIHwgdW5kZWZpbmVkIH07XG5cdFx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRcdG9yaWdpbmFsRW52VmFsdWVzID0geyBIT01FOiBlbnZbJ0hPTUUnXSB9O1xuXHRcdFx0XHRlbnZbJ0hPTUUnXSA9ICcvaG9tZS91c2VyJztcblx0XHRcdFx0cmVtb3RlQ29ubmVjdGlvbiA9IHsgcmVtb3RlQXV0aG9yaXR5OiAnc29tZS1yZW1vdGUnIH07XG5cdFx0XHRcdGZpbGVTY2hlbWUgPSBTY2hlbWFzLnZzY29kZVJlbW90ZTtcblx0XHRcdFx0ZmlsZVBhdGggPSAnL2hvbWUvdXNlci8uYmFzaF9oaXN0b3J5Jztcblx0XHRcdH0pO1xuXHRcdFx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdFx0XHRpZiAob3JpZ2luYWxFbnZWYWx1ZXNbJ0hPTUUnXSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0ZGVsZXRlIGVudlsnSE9NRSddO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGVudlsnSE9NRSddID0gb3JpZ2luYWxFbnZWYWx1ZXNbJ0hPTUUnXTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdXaW5kb3dzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRyZW1vdGVFbnZpcm9ubWVudCA9IHsgb3M6IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzIH07XG5cdFx0XHRcdHN0cmljdEVxdWFsKGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGZldGNoQmFzaEhpc3RvcnkpLCB1bmRlZmluZWQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdtYWNPUycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0cmVtb3RlRW52aXJvbm1lbnQgPSB7IG9zOiBPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoIH07XG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbCgoYXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oZmV0Y2hCYXNoSGlzdG9yeSkpIS5jb21tYW5kcywgZXhwZWN0ZWRDb21tYW5kcyk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ0xpbnV4JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRyZW1vdGVFbnZpcm9ubWVudCA9IHsgb3M6IE9wZXJhdGluZ1N5c3RlbS5MaW51eCB9O1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoKGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGZldGNoQmFzaEhpc3RvcnkpKSEuY29tbWFuZHMsIGV4cGVjdGVkQ29tbWFuZHMpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXHRzdWl0ZSgnZmV0Y2hac2hIaXN0b3J5JywgKCkgPT4ge1xuXHRcdGxldCBmaWxlU2NoZW1lOiBzdHJpbmc7XG5cdFx0bGV0IGZpbGVQYXRoOiBzdHJpbmc7XG5cdFx0Y29uc3QgZmlsZUNvbnRlbnRUeXBlID0gW1xuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiAnc2ltcGxlJyxcblx0XHRcdFx0Y29udGVudDogW1xuXHRcdFx0XHRcdCdzaW5nbGUgbGluZSBjb21tYW5kJyxcblx0XHRcdFx0XHQnZ2l0IGNvbW1pdCAtbSBcIkEgd3JhcHBlZCBsaW5lIGluIHB3c2ggaGlzdG9yeVxcXFwnLFxuXHRcdFx0XHRcdCdcXFxcJyxcblx0XHRcdFx0XHQnU29tZSBjb21taXQgZGVzY3JpcHRpb25cXFxcJyxcblx0XHRcdFx0XHQnXFxcXCcsXG5cdFx0XHRcdFx0J0ZpeGVzICN4eXpcIicsXG5cdFx0XHRcdFx0J2dpdCBzdGF0dXMnLFxuXHRcdFx0XHRcdCd0d28gXCJcXFxcJyxcblx0XHRcdFx0XHQnbGluZVwiJ1xuXHRcdFx0XHRdLmpvaW4oJ1xcbicpXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiAnZXh0ZW5kZWQnLFxuXHRcdFx0XHRjb250ZW50OiBbXG5cdFx0XHRcdFx0JzogMTY1NTI1MjMzMDowO3NpbmdsZSBsaW5lIGNvbW1hbmQnLFxuXHRcdFx0XHRcdCc6IDE2NTUyNTIzMzA6MDtnaXQgY29tbWl0IC1tIFwiQSB3cmFwcGVkIGxpbmUgaW4gcHdzaCBoaXN0b3J5XFxcXCcsXG5cdFx0XHRcdFx0J1xcXFwnLFxuXHRcdFx0XHRcdCdTb21lIGNvbW1pdCBkZXNjcmlwdGlvblxcXFwnLFxuXHRcdFx0XHRcdCdcXFxcJyxcblx0XHRcdFx0XHQnRml4ZXMgI3h5elwiJyxcblx0XHRcdFx0XHQnOiAxNjU1MjUyMzMwOjA7Z2l0IHN0YXR1cycsXG5cdFx0XHRcdFx0JzogMTY1NTI1MjMzMDowO3R3byBcIlxcXFwnLFxuXHRcdFx0XHRcdCdsaW5lXCInXG5cdFx0XHRcdF0uam9pbignXFxuJylcblx0XHRcdH0sXG5cdFx0XTtcblxuXHRcdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRcdGxldCByZW1vdGVDb25uZWN0aW9uOiBQaWNrPElSZW1vdGVBZ2VudENvbm5lY3Rpb24sICdyZW1vdGVBdXRob3JpdHknPiB8IG51bGwgPSBudWxsO1xuXHRcdGxldCByZW1vdGVFbnZpcm9ubWVudDogUGljazxJUmVtb3RlQWdlbnRFbnZpcm9ubWVudCwgJ29zJz4gfCBudWxsID0gbnVsbDtcblxuXHRcdGZvciAoY29uc3QgeyB0eXBlLCBjb250ZW50IH0gb2YgZmlsZUNvbnRlbnRUeXBlKSB7XG5cdFx0XHRzdWl0ZSh0eXBlLCAoKSA9PiB7XG5cdFx0XHRcdHNldHVwKCgpID0+IHtcblx0XHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKTtcblx0XHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwge1xuXHRcdFx0XHRcdFx0YXN5bmMgcmVhZEZpbGUocmVzb3VyY2U6IFVSSSkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBleHBlY3RlZCA9IFVSSS5mcm9tKHsgc2NoZW1lOiBmaWxlU2NoZW1lLCBwYXRoOiBmaWxlUGF0aCB9KTtcblx0XHRcdFx0XHRcdFx0c3RyaWN0RXF1YWwocmVzb3VyY2Uuc2NoZW1lLCBleHBlY3RlZC5zY2hlbWUpO1xuXHRcdFx0XHRcdFx0XHRzdHJpY3RFcXVhbChyZXNvdXJjZS5wYXRoLCBleHBlY3RlZC5wYXRoKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHsgdmFsdWU6IFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudCkgfTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGFzIFBpY2s8SUZpbGVTZXJ2aWNlLCAncmVhZEZpbGUnPik7XG5cdFx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUmVtb3RlQWdlbnRTZXJ2aWNlLCB7XG5cdFx0XHRcdFx0XHRhc3luYyBnZXRFbnZpcm9ubWVudCgpIHsgcmV0dXJuIHJlbW90ZUVudmlyb25tZW50OyB9LFxuXHRcdFx0XHRcdFx0Z2V0Q29ubmVjdGlvbigpIHsgcmV0dXJuIHJlbW90ZUNvbm5lY3Rpb247IH1cblx0XHRcdFx0XHR9IGFzIFBpY2s8SVJlbW90ZUFnZW50U2VydmljZSwgJ2dldENvbm5lY3Rpb24nIHwgJ2dldEVudmlyb25tZW50Jz4pO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRpZiAoIWlzV2luZG93cykge1xuXHRcdFx0XHRcdHN1aXRlKCdsb2NhbCcsICgpID0+IHtcblx0XHRcdFx0XHRcdGxldCBvcmlnaW5hbEVudlZhbHVlczogeyBIT01FOiBzdHJpbmcgfCB1bmRlZmluZWQgfTtcblx0XHRcdFx0XHRcdHNldHVwKCgpID0+IHtcblx0XHRcdFx0XHRcdFx0b3JpZ2luYWxFbnZWYWx1ZXMgPSB7IEhPTUU6IGVudlsnSE9NRSddIH07XG5cdFx0XHRcdFx0XHRcdGVudlsnSE9NRSddID0gJy9ob21lL3VzZXInO1xuXHRcdFx0XHRcdFx0XHRyZW1vdGVDb25uZWN0aW9uID0geyByZW1vdGVBdXRob3JpdHk6ICdzb21lLXJlbW90ZScgfTtcblx0XHRcdFx0XHRcdFx0ZmlsZVNjaGVtZSA9IFNjaGVtYXMudnNjb2RlUmVtb3RlO1xuXHRcdFx0XHRcdFx0XHRmaWxlUGF0aCA9ICcvaG9tZS91c2VyLy5iYXNoX2hpc3RvcnknO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGlmIChvcmlnaW5hbEVudlZhbHVlc1snSE9NRSddID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdFx0XHRkZWxldGUgZW52WydIT01FJ107XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0ZW52WydIT01FJ10gPSBvcmlnaW5hbEVudlZhbHVlc1snSE9NRSddO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdHRlc3QoJ2N1cnJlbnQgT1MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGZpbGVQYXRoID0gJy9ob21lL3VzZXIvLnpzaF9oaXN0b3J5Jztcblx0XHRcdFx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKChhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihmZXRjaFpzaEhpc3RvcnkpKSEuY29tbWFuZHMsIGV4cGVjdGVkQ29tbWFuZHMpO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0c3VpdGUoJ3JlbW90ZScsICgpID0+IHtcblx0XHRcdFx0XHRsZXQgb3JpZ2luYWxFbnZWYWx1ZXM6IHsgSE9NRTogc3RyaW5nIHwgdW5kZWZpbmVkIH07XG5cdFx0XHRcdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0XHRcdFx0b3JpZ2luYWxFbnZWYWx1ZXMgPSB7IEhPTUU6IGVudlsnSE9NRSddIH07XG5cdFx0XHRcdFx0XHRlbnZbJ0hPTUUnXSA9ICcvaG9tZS91c2VyJztcblx0XHRcdFx0XHRcdHJlbW90ZUNvbm5lY3Rpb24gPSB7IHJlbW90ZUF1dGhvcml0eTogJ3NvbWUtcmVtb3RlJyB9O1xuXHRcdFx0XHRcdFx0ZmlsZVNjaGVtZSA9IFNjaGVtYXMudnNjb2RlUmVtb3RlO1xuXHRcdFx0XHRcdFx0ZmlsZVBhdGggPSAnL2hvbWUvdXNlci8uenNoX2hpc3RvcnknO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHRlYXJkb3duKCgpID0+IHtcblx0XHRcdFx0XHRcdGlmIChvcmlnaW5hbEVudlZhbHVlc1snSE9NRSddID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdFx0ZGVsZXRlIGVudlsnSE9NRSddO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0ZW52WydIT01FJ10gPSBvcmlnaW5hbEVudlZhbHVlc1snSE9NRSddO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHRlc3QoJ1dpbmRvd3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRyZW1vdGVFbnZpcm9ubWVudCA9IHsgb3M6IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzIH07XG5cdFx0XHRcdFx0XHRzdHJpY3RFcXVhbChhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihmZXRjaFpzaEhpc3RvcnkpLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHRlc3QoJ21hY09TJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0cmVtb3RlRW52aXJvbm1lbnQgPSB7IG9zOiBPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoIH07XG5cdFx0XHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoKGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGZldGNoWnNoSGlzdG9yeSkpIS5jb21tYW5kcywgZXhwZWN0ZWRDb21tYW5kcyk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0dGVzdCgnTGludXgnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRyZW1vdGVFbnZpcm9ubWVudCA9IHsgb3M6IE9wZXJhdGluZ1N5c3RlbS5MaW51eCB9O1xuXHRcdFx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKChhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihmZXRjaFpzaEhpc3RvcnkpKSEuY29tbWFuZHMsIGV4cGVjdGVkQ29tbWFuZHMpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH1cblx0fSk7XG5cdHN1aXRlKCdmZXRjaFB3c2hIaXN0b3J5JywgKCkgPT4ge1xuXHRcdGxldCBmaWxlU2NoZW1lOiBzdHJpbmc7XG5cdFx0bGV0IGZpbGVQYXRoOiBzdHJpbmc7XG5cdFx0Y29uc3QgZmlsZUNvbnRlbnQ6IHN0cmluZyA9IFtcblx0XHRcdCdzaW5nbGUgbGluZSBjb21tYW5kJyxcblx0XHRcdCdnaXQgY29tbWl0IC1tIFwiQSB3cmFwcGVkIGxpbmUgaW4gcHdzaCBoaXN0b3J5YCcsXG5cdFx0XHQnYCcsXG5cdFx0XHQnU29tZSBjb21taXQgZGVzY3JpcHRpb25gJyxcblx0XHRcdCdgJyxcblx0XHRcdCdGaXhlcyAjeHl6XCInLFxuXHRcdFx0J2dpdCBzdGF0dXMnLFxuXHRcdFx0J3R3byBcImAnLFxuXHRcdFx0J2xpbmVcIidcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdFx0bGV0IHJlbW90ZUNvbm5lY3Rpb246IFBpY2s8SVJlbW90ZUFnZW50Q29ubmVjdGlvbiwgJ3JlbW90ZUF1dGhvcml0eSc+IHwgbnVsbCA9IG51bGw7XG5cdFx0bGV0IHJlbW90ZUVudmlyb25tZW50OiBQaWNrPElSZW1vdGVBZ2VudEVudmlyb25tZW50LCAnb3MnPiB8IG51bGwgPSBudWxsO1xuXG5cdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSBuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwge1xuXHRcdFx0XHRhc3luYyByZWFkRmlsZShyZXNvdXJjZTogVVJJKSB7XG5cdFx0XHRcdFx0Y29uc3QgZXhwZWN0ZWQgPSBVUkkuZnJvbSh7XG5cdFx0XHRcdFx0XHRzY2hlbWU6IGZpbGVTY2hlbWUsXG5cdFx0XHRcdFx0XHRhdXRob3JpdHk6IHJlbW90ZUNvbm5lY3Rpb24/LnJlbW90ZUF1dGhvcml0eSxcblx0XHRcdFx0XHRcdHBhdGg6IFVSSS5maWxlKGZpbGVQYXRoKS5wYXRoXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0Ly8gU2FuaXRpemUgdGhlIGVuY29kZWQgYC9gIGNoYXJzIGFzIHRoZXkgZG9uJ3QgaW1wYWN0IGJlaGF2aW9yXG5cdFx0XHRcdFx0c3RyaWN0RXF1YWwocmVzb3VyY2UudG9TdHJpbmcoKS5yZXBsYWNlQWxsKCclNUMnLCAnLycpLCBleHBlY3RlZC50b1N0cmluZygpLnJlcGxhY2VBbGwoJyU1QycsICcvJykpO1xuXHRcdFx0XHRcdHJldHVybiB7IHZhbHVlOiBWU0J1ZmZlci5mcm9tU3RyaW5nKGZpbGVDb250ZW50KSB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9IGFzIFBpY2s8SUZpbGVTZXJ2aWNlLCAncmVhZEZpbGUnPik7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElSZW1vdGVBZ2VudFNlcnZpY2UsIHtcblx0XHRcdFx0YXN5bmMgZ2V0RW52aXJvbm1lbnQoKSB7IHJldHVybiByZW1vdGVFbnZpcm9ubWVudDsgfSxcblx0XHRcdFx0Z2V0Q29ubmVjdGlvbigpIHsgcmV0dXJuIHJlbW90ZUNvbm5lY3Rpb247IH1cblx0XHRcdH0gYXMgUGljazxJUmVtb3RlQWdlbnRTZXJ2aWNlLCAnZ2V0Q29ubmVjdGlvbicgfCAnZ2V0RW52aXJvbm1lbnQnPik7XG5cdFx0fSk7XG5cblx0XHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgnbG9jYWwnLCAoKSA9PiB7XG5cdFx0XHRsZXQgb3JpZ2luYWxFbnZWYWx1ZXM6IHsgSE9NRTogc3RyaW5nIHwgdW5kZWZpbmVkOyBBUFBEQVRBOiBzdHJpbmcgfCB1bmRlZmluZWQgfTtcblx0XHRcdHNldHVwKCgpID0+IHtcblx0XHRcdFx0b3JpZ2luYWxFbnZWYWx1ZXMgPSB7IEhPTUU6IGVudlsnSE9NRSddLCBBUFBEQVRBOiBlbnZbJ0FQUERBVEEnXSB9O1xuXHRcdFx0XHRlbnZbJ0hPTUUnXSA9ICcvaG9tZS91c2VyJztcblx0XHRcdFx0ZW52WydBUFBEQVRBJ10gPSAnQzpcXFxcQXBwRGF0YSc7XG5cdFx0XHRcdHJlbW90ZUNvbm5lY3Rpb24gPSB7IHJlbW90ZUF1dGhvcml0eTogJ3NvbWUtcmVtb3RlJyB9O1xuXHRcdFx0XHRmaWxlU2NoZW1lID0gU2NoZW1hcy52c2NvZGVSZW1vdGU7XG5cdFx0XHRcdGZpbGVQYXRoID0gJy9ob21lL3VzZXIvLnpzaF9oaXN0b3J5Jztcblx0XHRcdFx0b3JpZ2luYWxFbnZWYWx1ZXMgPSB7IEhPTUU6IGVudlsnSE9NRSddLCBBUFBEQVRBOiBlbnZbJ0FQUERBVEEnXSB9O1xuXHRcdFx0fSk7XG5cdFx0XHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0XHRcdGlmIChvcmlnaW5hbEVudlZhbHVlc1snSE9NRSddID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRkZWxldGUgZW52WydIT01FJ107XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZW52WydIT01FJ10gPSBvcmlnaW5hbEVudlZhbHVlc1snSE9NRSddO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChvcmlnaW5hbEVudlZhbHVlc1snQVBQREFUQSddID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRkZWxldGUgZW52WydBUFBEQVRBJ107XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZW52WydBUFBEQVRBJ10gPSBvcmlnaW5hbEVudlZhbHVlc1snQVBQREFUQSddO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2N1cnJlbnQgT1MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdFx0XHRmaWxlUGF0aCA9IGpvaW4oZW52WydBUFBEQVRBJ10hLCAnTWljcm9zb2Z0XFxcXFdpbmRvd3NcXFxcUG93ZXJTaGVsbFxcXFxQU1JlYWRMaW5lXFxcXENvbnNvbGVIb3N0X2hpc3RvcnkudHh0Jyk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZmlsZVBhdGggPSBqb2luKGVudlsnSE9NRSddISwgJy5sb2NhbC9zaGFyZS9wb3dlcnNoZWxsL1BTUmVhZGxpbmUvQ29uc29sZUhvc3RfaGlzdG9yeS50eHQnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoKGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGZldGNoUHdzaEhpc3RvcnkpKSEuY29tbWFuZHMsIGV4cGVjdGVkQ29tbWFuZHMpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdFx0c3VpdGUoJ3JlbW90ZScsICgpID0+IHtcblx0XHRcdGxldCBvcmlnaW5hbEVudlZhbHVlczogeyBIT01FOiBzdHJpbmcgfCB1bmRlZmluZWQ7IEFQUERBVEE6IHN0cmluZyB8IHVuZGVmaW5lZCB9O1xuXHRcdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0XHRyZW1vdGVDb25uZWN0aW9uID0geyByZW1vdGVBdXRob3JpdHk6ICdzb21lLXJlbW90ZScgfTtcblx0XHRcdFx0ZmlsZVNjaGVtZSA9IFNjaGVtYXMudnNjb2RlUmVtb3RlO1xuXHRcdFx0XHRvcmlnaW5hbEVudlZhbHVlcyA9IHsgSE9NRTogZW52WydIT01FJ10sIEFQUERBVEE6IGVudlsnQVBQREFUQSddIH07XG5cdFx0XHR9KTtcblx0XHRcdHRlYXJkb3duKCgpID0+IHtcblx0XHRcdFx0aWYgKG9yaWdpbmFsRW52VmFsdWVzWydIT01FJ10gPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGRlbGV0ZSBlbnZbJ0hPTUUnXTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRlbnZbJ0hPTUUnXSA9IG9yaWdpbmFsRW52VmFsdWVzWydIT01FJ107XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG9yaWdpbmFsRW52VmFsdWVzWydBUFBEQVRBJ10gPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGRlbGV0ZSBlbnZbJ0FQUERBVEEnXTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRlbnZbJ0FQUERBVEEnXSA9IG9yaWdpbmFsRW52VmFsdWVzWydBUFBEQVRBJ107XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnV2luZG93cycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0cmVtb3RlRW52aXJvbm1lbnQgPSB7IG9zOiBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyB9O1xuXHRcdFx0XHRlbnZbJ0FQUERBVEEnXSA9ICdDOlxcXFxBcHBEYXRhJztcblx0XHRcdFx0ZmlsZVBhdGggPSAnQzpcXFxcQXBwRGF0YVxcXFxNaWNyb3NvZnRcXFxcV2luZG93c1xcXFxQb3dlclNoZWxsXFxcXFBTUmVhZExpbmVcXFxcQ29uc29sZUhvc3RfaGlzdG9yeS50eHQnO1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoKGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGZldGNoUHdzaEhpc3RvcnkpKSEuY29tbWFuZHMsIGV4cGVjdGVkQ29tbWFuZHMpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdtYWNPUycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0cmVtb3RlRW52aXJvbm1lbnQgPSB7IG9zOiBPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoIH07XG5cdFx0XHRcdGVudlsnSE9NRSddID0gJy9ob21lL3VzZXInO1xuXHRcdFx0XHRmaWxlUGF0aCA9ICcvaG9tZS91c2VyLy5sb2NhbC9zaGFyZS9wb3dlcnNoZWxsL1BTUmVhZGxpbmUvQ29uc29sZUhvc3RfaGlzdG9yeS50eHQnO1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoKGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGZldGNoUHdzaEhpc3RvcnkpKSEuY29tbWFuZHMsIGV4cGVjdGVkQ29tbWFuZHMpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdMaW51eCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0cmVtb3RlRW52aXJvbm1lbnQgPSB7IG9zOiBPcGVyYXRpbmdTeXN0ZW0uTGludXggfTtcblx0XHRcdFx0ZW52WydIT01FJ10gPSAnL2hvbWUvdXNlcic7XG5cdFx0XHRcdGZpbGVQYXRoID0gJy9ob21lL3VzZXIvLmxvY2FsL3NoYXJlL3Bvd2Vyc2hlbGwvUFNSZWFkbGluZS9Db25zb2xlSG9zdF9oaXN0b3J5LnR4dCc7XG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbCgoYXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oZmV0Y2hQd3NoSGlzdG9yeSkpIS5jb21tYW5kcywgZXhwZWN0ZWRDb21tYW5kcyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cdHN1aXRlKCdmZXRjaEZpc2hIaXN0b3J5JywgKCkgPT4ge1xuXHRcdGxldCBmaWxlU2NoZW1lOiBzdHJpbmc7XG5cdFx0bGV0IGZpbGVQYXRoOiBzdHJpbmc7XG5cdFx0Y29uc3QgZmlsZUNvbnRlbnQ6IHN0cmluZyA9IFtcblx0XHRcdCctIGNtZDogc2luZ2xlIGxpbmUgY29tbWFuZCcsXG5cdFx0XHQnICB3aGVuOiAxNjUwMDAwMDAwJyxcblx0XHRcdCctIGNtZDogZ2l0IGNvbW1pdCAtbSBcIkEgd3JhcHBlZCBsaW5lIGluIHB3c2ggaGlzdG9yeVxcXFxuXFxcXG5Tb21lIGNvbW1pdCBkZXNjcmlwdGlvblxcXFxuXFxcXG5GaXhlcyAjeHl6XCInLFxuXHRcdFx0JyAgd2hlbjogMTY1MDAwMDAxMCcsXG5cdFx0XHQnLSBjbWQ6IGdpdCBzdGF0dXMnLFxuXHRcdFx0JyAgd2hlbjogMTY1MDAwMDAyMCcsXG5cdFx0XHQnLSBjbWQ6IHR3byBcIlxcXFxubGluZVwiJyxcblx0XHRcdCcgIHdoZW46IDE2NTAwMDAwMzAnLFxuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0XHRsZXQgcmVtb3RlQ29ubmVjdGlvbjogUGljazxJUmVtb3RlQWdlbnRDb25uZWN0aW9uLCAncmVtb3RlQXV0aG9yaXR5Jz4gfCBudWxsID0gbnVsbDtcblx0XHRsZXQgcmVtb3RlRW52aXJvbm1lbnQ6IFBpY2s8SVJlbW90ZUFnZW50RW52aXJvbm1lbnQsICdvcyc+IHwgbnVsbCA9IG51bGw7XG5cblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUZpbGVTZXJ2aWNlLCB7XG5cdFx0XHRcdGFzeW5jIHJlYWRGaWxlKHJlc291cmNlOiBVUkkpIHtcblx0XHRcdFx0XHRjb25zdCBleHBlY3RlZCA9IFVSSS5mcm9tKHsgc2NoZW1lOiBmaWxlU2NoZW1lLCBwYXRoOiBmaWxlUGF0aCB9KTtcblx0XHRcdFx0XHRzdHJpY3RFcXVhbChyZXNvdXJjZS5zY2hlbWUsIGV4cGVjdGVkLnNjaGVtZSk7XG5cdFx0XHRcdFx0c3RyaWN0RXF1YWwocmVzb3VyY2UucGF0aCwgZXhwZWN0ZWQucGF0aCk7XG5cdFx0XHRcdFx0cmV0dXJuIHsgdmFsdWU6IFZTQnVmZmVyLmZyb21TdHJpbmcoZmlsZUNvbnRlbnQpIH07XG5cdFx0XHRcdH1cblx0XHRcdH0gYXMgUGljazxJRmlsZVNlcnZpY2UsICdyZWFkRmlsZSc+KTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVJlbW90ZUFnZW50U2VydmljZSwge1xuXHRcdFx0XHRhc3luYyBnZXRFbnZpcm9ubWVudCgpIHsgcmV0dXJuIHJlbW90ZUVudmlyb25tZW50OyB9LFxuXHRcdFx0XHRnZXRDb25uZWN0aW9uKCkgeyByZXR1cm4gcmVtb3RlQ29ubmVjdGlvbjsgfVxuXHRcdFx0fSBhcyBQaWNrPElSZW1vdGVBZ2VudFNlcnZpY2UsICdnZXRDb25uZWN0aW9uJyB8ICdnZXRFbnZpcm9ubWVudCc+KTtcblx0XHR9KTtcblxuXHRcdHRlYXJkb3duKCgpID0+IHtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdGlmICghaXNXaW5kb3dzKSB7XG5cdFx0XHRzdWl0ZSgnbG9jYWwnLCAoKSA9PiB7XG5cdFx0XHRcdGxldCBvcmlnaW5hbEVudlZhbHVlczogeyBIT01FOiBzdHJpbmcgfCB1bmRlZmluZWQ7IFhER19EQVRBX0hPTUU6IHN0cmluZyB8IHVuZGVmaW5lZCB9O1xuXHRcdFx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRcdFx0b3JpZ2luYWxFbnZWYWx1ZXMgPSB7IEhPTUU6IGVudlsnSE9NRSddLCBYREdfREFUQV9IT01FOiBlbnZbJ1hER19EQVRBX0hPTUUnXSB9O1xuXHRcdFx0XHRcdGVudlsnSE9NRSddID0gJy9ob21lL3VzZXInO1xuXHRcdFx0XHRcdGRlbGV0ZSBlbnZbJ1hER19EQVRBX0hPTUUnXTtcblx0XHRcdFx0XHRyZW1vdGVDb25uZWN0aW9uID0geyByZW1vdGVBdXRob3JpdHk6ICdzb21lLXJlbW90ZScgfTtcblx0XHRcdFx0XHRmaWxlU2NoZW1lID0gU2NoZW1hcy52c2NvZGVSZW1vdGU7XG5cdFx0XHRcdFx0ZmlsZVBhdGggPSAnL2hvbWUvdXNlci8ubG9jYWwvc2hhcmUvZmlzaC9maXNoX2hpc3RvcnknO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdFx0XHRcdGlmIChvcmlnaW5hbEVudlZhbHVlc1snSE9NRSddID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdGRlbGV0ZSBlbnZbJ0hPTUUnXTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0ZW52WydIT01FJ10gPSBvcmlnaW5hbEVudlZhbHVlc1snSE9NRSddO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAob3JpZ2luYWxFbnZWYWx1ZXNbJ1hER19EQVRBX0hPTUUnXSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRkZWxldGUgZW52WydYREdfREFUQV9IT01FJ107XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGVudlsnWERHX0RBVEFfSE9NRSddID0gb3JpZ2luYWxFbnZWYWx1ZXNbJ1hER19EQVRBX0hPTUUnXTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0ZXN0KCdjdXJyZW50IE9TJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGZpbGVQYXRoID0gJy9ob21lL3VzZXIvLmxvY2FsL3NoYXJlL2Zpc2gvZmlzaF9oaXN0b3J5Jztcblx0XHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoKGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGZldGNoRmlzaEhpc3RvcnkpKSEuY29tbWFuZHMsIGV4cGVjdGVkQ29tbWFuZHMpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHRzdWl0ZSgnbG9jYWwgKG92ZXJyaWRlbiBwYXRoKScsICgpID0+IHtcblx0XHRcdFx0bGV0IG9yaWdpbmFsRW52VmFsdWVzOiB7IFhER19EQVRBX0hPTUU6IHN0cmluZyB8IHVuZGVmaW5lZCB9O1xuXHRcdFx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRcdFx0b3JpZ2luYWxFbnZWYWx1ZXMgPSB7IFhER19EQVRBX0hPTUU6IGVudlsnWERHX0RBVEFfSE9NRSddIH07XG5cdFx0XHRcdFx0ZW52WydYREdfREFUQV9IT01FJ10gPSAnL2hvbWUvdXNlci9kYXRhLWhvbWUnO1xuXHRcdFx0XHRcdHJlbW90ZUNvbm5lY3Rpb24gPSB7IHJlbW90ZUF1dGhvcml0eTogJ3NvbWUtcmVtb3RlJyB9O1xuXHRcdFx0XHRcdGZpbGVTY2hlbWUgPSBTY2hlbWFzLnZzY29kZVJlbW90ZTtcblx0XHRcdFx0XHRmaWxlUGF0aCA9ICcvaG9tZS91c2VyL2RhdGEtaG9tZS9maXNoL2Zpc2hfaGlzdG9yeSc7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKG9yaWdpbmFsRW52VmFsdWVzWydYREdfREFUQV9IT01FJ10gPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0ZGVsZXRlIGVudlsnWERHX0RBVEFfSE9NRSddO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRlbnZbJ1hER19EQVRBX0hPTUUnXSA9IG9yaWdpbmFsRW52VmFsdWVzWydYREdfREFUQV9IT01FJ107XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGVzdCgnY3VycmVudCBPUycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRmaWxlUGF0aCA9ICcvaG9tZS91c2VyL2RhdGEtaG9tZS9maXNoL2Zpc2hfaGlzdG9yeSc7XG5cdFx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKChhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihmZXRjaEZpc2hIaXN0b3J5KSkhLmNvbW1hbmRzLCBleHBlY3RlZENvbW1hbmRzKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0c3VpdGUoJ3JlbW90ZScsICgpID0+IHtcblx0XHRcdGxldCBvcmlnaW5hbEVudlZhbHVlczogeyBIT01FOiBzdHJpbmcgfCB1bmRlZmluZWQ7IFhER19EQVRBX0hPTUU6IHN0cmluZyB8IHVuZGVmaW5lZCB9O1xuXHRcdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0XHRvcmlnaW5hbEVudlZhbHVlcyA9IHsgSE9NRTogZW52WydIT01FJ10sIFhER19EQVRBX0hPTUU6IGVudlsnWERHX0RBVEFfSE9NRSddIH07XG5cdFx0XHRcdGVudlsnSE9NRSddID0gJy9ob21lL3VzZXInO1xuXHRcdFx0XHRkZWxldGUgZW52WydYREdfREFUQV9IT01FJ107XG5cdFx0XHRcdHJlbW90ZUNvbm5lY3Rpb24gPSB7IHJlbW90ZUF1dGhvcml0eTogJ3NvbWUtcmVtb3RlJyB9O1xuXHRcdFx0XHRmaWxlU2NoZW1lID0gU2NoZW1hcy52c2NvZGVSZW1vdGU7XG5cdFx0XHRcdGZpbGVQYXRoID0gJy9ob21lL3VzZXIvLmxvY2FsL3NoYXJlL2Zpc2gvZmlzaF9oaXN0b3J5Jztcblx0XHRcdH0pO1xuXHRcdFx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdFx0XHRpZiAob3JpZ2luYWxFbnZWYWx1ZXNbJ0hPTUUnXSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0ZGVsZXRlIGVudlsnSE9NRSddO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGVudlsnSE9NRSddID0gb3JpZ2luYWxFbnZWYWx1ZXNbJ0hPTUUnXTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAob3JpZ2luYWxFbnZWYWx1ZXNbJ1hER19EQVRBX0hPTUUnXSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0ZGVsZXRlIGVudlsnWERHX0RBVEFfSE9NRSddO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGVudlsnWERHX0RBVEFfSE9NRSddID0gb3JpZ2luYWxFbnZWYWx1ZXNbJ1hER19EQVRBX0hPTUUnXTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdXaW5kb3dzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRyZW1vdGVFbnZpcm9ubWVudCA9IHsgb3M6IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzIH07XG5cdFx0XHRcdHN0cmljdEVxdWFsKGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGZldGNoRmlzaEhpc3RvcnkpLCB1bmRlZmluZWQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdtYWNPUycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0cmVtb3RlRW52aXJvbm1lbnQgPSB7IG9zOiBPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoIH07XG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbCgoYXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oZmV0Y2hGaXNoSGlzdG9yeSkpIS5jb21tYW5kcywgZXhwZWN0ZWRDb21tYW5kcyk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ0xpbnV4JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRyZW1vdGVFbnZpcm9ubWVudCA9IHsgb3M6IE9wZXJhdGluZ1N5c3RlbS5MaW51eCB9O1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoKGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGZldGNoRmlzaEhpc3RvcnkpKSEuY29tbWFuZHMsIGV4cGVjdGVkQ29tbWFuZHMpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgncmVtb3RlIChvdmVycmlkZW4gcGF0aCknLCAoKSA9PiB7XG5cdFx0XHRsZXQgb3JpZ2luYWxFbnZWYWx1ZXM6IHsgWERHX0RBVEFfSE9NRTogc3RyaW5nIHwgdW5kZWZpbmVkIH07XG5cdFx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRcdG9yaWdpbmFsRW52VmFsdWVzID0geyBYREdfREFUQV9IT01FOiBlbnZbJ1hER19EQVRBX0hPTUUnXSB9O1xuXHRcdFx0XHRlbnZbJ1hER19EQVRBX0hPTUUnXSA9ICcvaG9tZS91c2VyL2RhdGEtaG9tZSc7XG5cdFx0XHRcdHJlbW90ZUNvbm5lY3Rpb24gPSB7IHJlbW90ZUF1dGhvcml0eTogJ3NvbWUtcmVtb3RlJyB9O1xuXHRcdFx0XHRmaWxlU2NoZW1lID0gU2NoZW1hcy52c2NvZGVSZW1vdGU7XG5cdFx0XHRcdGZpbGVQYXRoID0gJy9ob21lL3VzZXIvZGF0YS1ob21lL2Zpc2gvZmlzaF9oaXN0b3J5Jztcblx0XHRcdH0pO1xuXHRcdFx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdFx0XHRpZiAob3JpZ2luYWxFbnZWYWx1ZXNbJ1hER19EQVRBX0hPTUUnXSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0ZGVsZXRlIGVudlsnWERHX0RBVEFfSE9NRSddO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGVudlsnWERHX0RBVEFfSE9NRSddID0gb3JpZ2luYWxFbnZWYWx1ZXNbJ1hER19EQVRBX0hPTUUnXTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdXaW5kb3dzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRyZW1vdGVFbnZpcm9ubWVudCA9IHsgb3M6IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzIH07XG5cdFx0XHRcdHN0cmljdEVxdWFsKGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGZldGNoRmlzaEhpc3RvcnkpLCB1bmRlZmluZWQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdtYWNPUycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0cmVtb3RlRW52aXJvbm1lbnQgPSB7IG9zOiBPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoIH07XG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbCgoYXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oZmV0Y2hGaXNoSGlzdG9yeSkpIS5jb21tYW5kcywgZXhwZWN0ZWRDb21tYW5kcyk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ0xpbnV4JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRyZW1vdGVFbnZpcm9ubWVudCA9IHsgb3M6IE9wZXJhdGluZ1N5c3RlbS5MaW51eCB9O1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoKGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGZldGNoRmlzaEhpc3RvcnkpKSEuY29tbWFuZHMsIGV4cGVjdGVkQ29tbWFuZHMpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgnc2FuaXRpemVGaXNoSGlzdG9yeUNtZCcsICgpID0+IHtcblx0XHRcdHRlc3QoJ3ZhbGlkIG5ldy1saW5lcycsICgpID0+IHtcblx0XHRcdFx0LyoqXG5cdFx0XHRcdCAqIFZhbGlkIG5ldy1saW5lcyBoYXZlIG9kZCBudW1iZXIgb2YgbGVhZGluZyBiYWNrc2xhc2hlczogXFxuLCBcXFxcXFxuLCBcXFxcXFxcXFxcblxuXHRcdFx0XHQgKi9cblx0XHRcdFx0Y29uc3QgY2FzZXMgPSBbXG5cdFx0XHRcdFx0J1xcXFxuJyxcblx0XHRcdFx0XHQnXFxcXG4gYXQgc3RhcnQnLFxuXHRcdFx0XHRcdCdzb21lIFxcXFxuIGluIHRoZSBtaWRkbGUnLFxuXHRcdFx0XHRcdCdhdCB0aGUgZW5kIFxcXFxuJyxcblx0XHRcdFx0XHQnXFxcXFxcXFxcXFxcbicsXG5cdFx0XHRcdFx0J1xcXFxcXFxcXFxcXG4gdmFsaWQgYXQgc3RhcnQnLFxuXHRcdFx0XHRcdCd2YWxpZCBcXFxcXFxcXFxcXFxuIGluIHRoZSBtaWRkbGUnLFxuXHRcdFx0XHRcdCd2YWxpZCBpbiB0aGUgZW5kIFxcXFxcXFxcXFxcXG4nLFxuXHRcdFx0XHRcdCdcXFxcXFxcXFxcXFxcXFxcXFxcXG4nLFxuXHRcdFx0XHRcdCdcXFxcXFxcXFxcXFxcXFxcXFxcXG4gdmFsaWQgYXQgc3RhcnQnLFxuXHRcdFx0XHRcdCd2YWxpZCBcXFxcXFxcXFxcXFxcXFxcXFxcXG4gaW4gdGhlIG1pZGRsZScsXG5cdFx0XHRcdFx0J3ZhbGlkIGluIHRoZSBlbmQgXFxcXFxcXFxcXFxcXFxcXFxcXFxuJyxcblx0XHRcdFx0XHQnbWl4ZWQgdmFsaWQgXFxcXHJcXFxcbicsXG5cdFx0XHRcdFx0J21peGVkIHZhbGlkIFxcXFxcXFxcXFxcXHJcXFxcbicsXG5cdFx0XHRcdFx0J21peGVkIHZhbGlkIFxcXFxyXFxcXFxcXFxcXFxcbicsXG5cdFx0XHRcdF07XG5cblx0XHRcdFx0Zm9yIChjb25zdCB4IG9mIGNhc2VzKSB7XG5cdFx0XHRcdFx0b2soc2FuaXRpemVGaXNoSGlzdG9yeUNtZCh4KS5pbmNsdWRlcygnXFxuJykpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnaW52YWxpZCBuZXctbGluZXMnLCAoKSA9PiB7XG5cdFx0XHRcdC8qKlxuXHRcdFx0XHQgKiBJbnZhbGlkIG5ldy1saW5lcyBoYXZlIGV2ZW4gbnVtYmVyIG9mIGxlYWRpbmcgYmFja3NsYXNoZXM6IFxcXFxuLCBcXFxcXFxcXG4sIFxcXFxcXFxcXFxcXG5cblx0XHRcdFx0ICovXG5cdFx0XHRcdGNvbnN0IGNhc2VzID0gW1xuXHRcdFx0XHRcdCdcXFxcXFxcXG4nLFxuXHRcdFx0XHRcdCdcXFxcXFxcXG4gaW52YWxpZCBhdCBzdGFydCcsXG5cdFx0XHRcdFx0J2ludmFsaWQgXFxcXFxcXFxuIGluIHRoZSBtaWRkbGUnLFxuXHRcdFx0XHRcdCdpbnZhbGlkIGluIHRoZSBlbmQgXFxcXFxcXFxuJyxcblx0XHRcdFx0XHQnXFxcXFxcXFxcXFxcXFxcXG4nLFxuXHRcdFx0XHRcdCdcXFxcXFxcXFxcXFxcXFxcbiBpbnZhbGlkIGF0IHN0YXJ0Jyxcblx0XHRcdFx0XHQnaW52YWxpZCBcXFxcXFxcXFxcXFxcXFxcbiBpbiB0aGUgbWlkZGxlJyxcblx0XHRcdFx0XHQnaW52YWxpZCBpbiB0aGUgZW5kIFxcXFxcXFxcXFxcXFxcXFxuJyxcblx0XHRcdFx0XHQnbWl4ZWQgaW52YWxpZCBcXFxcclxcXFxcXFxcbicsXG5cdFx0XHRcdFx0J21peGVkIGludmFsaWQgXFxcXHJcXFxcXFxcXFxcXFxcXFxcbicsXG5cdFx0XHRcdFx0J2VjaG8gXCJcXFxcXFxcXG5cIicsXG5cdFx0XHRcdF07XG5cblx0XHRcdFx0Zm9yIChjb25zdCB4IG9mIGNhc2VzKSB7XG5cdFx0XHRcdFx0b2soIXNhbml0aXplRmlzaEhpc3RvcnlDbWQoeCkuaW5jbHVkZXMoJ1xcbicpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsaUJBQWlCLGFBQWEsVUFBVTtBQUNqRCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsV0FBVyx1QkFBdUI7QUFDM0MsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGdDQUFnQztBQUV6QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFpQywyQkFBMkI7QUFDNUQsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxrQkFBa0Isa0JBQWtCLGtCQUFrQixpQkFBaUIsd0JBQXdCLGdDQUFnRTtBQUV4SyxTQUFTLFVBQVUsT0FBZTtBQUNqQyxTQUFPO0FBQUEsSUFDTixVQUFVO0FBQUEsTUFDVCxZQUFZO0FBQUEsUUFDWCxrQkFBa0I7QUFBQSxVQUNqQixTQUFTO0FBQUEsUUFDVjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNEO0FBRUEsTUFBTSxtQkFBbUI7QUFBQSxFQUN4QjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUNEO0FBRUEsTUFBTSxvQkFBb0IsTUFBTTtBQUMvQixRQUFNLFFBQVEsd0NBQXdDO0FBRXRELFFBQU0sNEJBQTRCLE1BQU07QUFDdkMsUUFBSTtBQUNKLFFBQUk7QUFDSixRQUFJO0FBRUosVUFBTSxNQUFNO0FBQ1gsNkJBQXVCLElBQUkseUJBQXlCLFVBQVUsQ0FBQyxDQUFDO0FBQ2hFLDZCQUF1QixNQUFNLElBQUksSUFBSSx5QkFBeUIsQ0FBQztBQUMvRCwyQkFBcUIsSUFBSSx1QkFBdUIsb0JBQW9CO0FBQ3BFLDJCQUFxQixJQUFJLGlCQUFpQixNQUFNLElBQUksSUFBSSxtQkFB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
