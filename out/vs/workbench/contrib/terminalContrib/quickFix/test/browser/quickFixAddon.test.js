import { strictEqual } from "assert";
import { importAMDNodeModule } from "../../../../../../amdX.js";
import { Event } from "../../../../../../base/common/event.js";
import { isWindows } from "../../../../../../base/common/platform.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestCommandService } from "../../../../../../editor/test/browser/editorTestServices.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ContextMenuService } from "../../../../../../platform/contextview/browser/contextMenuService.js";
import { IContextMenuService } from "../../../../../../platform/contextview/browser/contextView.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILabelService } from "../../../../../../platform/label/common/label.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { IOpenerService } from "../../../../../../platform/opener/common/opener.js";
import { IStorageService } from "../../../../../../platform/storage/common/storage.js";
import { TerminalCapability } from "../../../../../../platform/terminal/common/capabilities/capabilities.js";
import { CommandDetectionCapability } from "../../../../../../platform/terminal/common/capabilities/commandDetectionCapability.js";
import { TerminalCapabilityStore } from "../../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js";
import { ITerminalQuickFixService } from "../../browser/quickFix.js";
import { getQuickFixesForCommand, TerminalQuickFixAddon } from "../../browser/quickFixAddon.js";
import { freePort, FreePortOutputRegex, gitCreatePr, GitCreatePrOutputRegex, gitFastForwardPull, GitFastForwardPullOutputRegex, GitPushOutputRegex, gitPushSetUpstream, gitSimilar, GitSimilarOutputRegex, gitTwoDashes, GitTwoDashesRegex, pwshGeneralError, PwshGeneralErrorOutputRegex, pwshUnixCommandNotFoundError, PwshUnixCommandNotFoundErrorOutputRegex } from "../../browser/terminalQuickFixBuiltinActions.js";
import { TestStorageService } from "../../../../../test/common/workbenchTestServices.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { TestXtermLogger } from "../../../../../../platform/terminal/test/common/terminalTestHelpers.js";
suite("QuickFixAddon", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let quickFixAddon;
  let commandDetection;
  let commandService;
  let openerService;
  let labelService;
  let terminal;
  let instantiationService;
  setup(async () => {
    instantiationService = store.add(new TestInstantiationService());
    const TerminalCtor = (await importAMDNodeModule("@xterm/xterm", "lib/xterm.js")).Terminal;
    terminal = store.add(new TerminalCtor({
      allowProposedApi: true,
      cols: 80,
      rows: 30,
      logger: TestXtermLogger
    }));
    instantiationService.stub(IStorageService, store.add(new TestStorageService()));
    instantiationService.stub(ITerminalQuickFixService, {
      onDidRegisterProvider: Event.None,
      onDidUnregisterProvider: Event.None,
      onDidRegisterCommandSelector: Event.None,
      extensionQuickFixes: Promise.resolve([])
    });
    instantiationService.stub(IConfigurationService, new TestConfigurationService());
    labelService = instantiationService.stub(ILabelService, {});
    const capabilities = store.add(new TerminalCapabilityStore());
    instantiationService.stub(ILogService, new NullLogService());
    commandDetection = store.add(instantiationService.createInstance(CommandDetectionCapability, terminal));
    capabilities.add(TerminalCapability.CommandDetection, commandDetection);
    instantiationService.stub(IContextMenuService, store.add(instantiationService.createInstance(ContextMenuService)));
    openerService = instantiationService.stub(IOpenerService, {});
    commandService = new TestCommandService(instantiationService);
    quickFixAddon = instantiationService.createInstance(TerminalQuickFixAddon, generateUuid(), [], capabilities);
    terminal.loadAddon(quickFixAddon);
  });
  suite("registerCommandFinishedListener & getMatchActions", () => {
    suite("gitSimilarCommand", () => {
      const expectedMap = /* @__PURE__ */ new Map();
      const command = `git sttatus`;
      let output = `git: 'sttatus' is not a git command. See 'git --help'.

			The most similar command is
			status`;
      const exitCode = 1;
      const actions = [{
        id: "Git Similar",
        enabled: true,
        label: "Run: git status",
        tooltip: "Run: git status",
        command: "git status"
      }];
      const outputLines = output.split("\n");
      setup(() => {
        const command2 = gitSimilar();
        expectedMap.set(command2.commandLineMatcher.toString(), [command2]);
        quickFixAddon.registerCommandFinishedListener(command2);
      });
      suite("returns undefined when", () => {
        test("output does not match", async () => {
          strictEqual(await getQuickFixesForCommand([], terminal, createCommand(command, `invalid output`, GitSimilarOutputRegex, exitCode, [`invalid output`]), expectedMap, commandService, openerService, labelService), void 0);
        });
        test("command does not match", async () => {
          strictEqual(await getQuickFixesForCommand([], terminal, createCommand(`gt sttatus`, output, GitSimilarOutputRegex, exitCode, outputLines), expectedMap, commandService, openerService, labelService), void 0);
        });
      });
      suite("returns actions when", () => {
        test("expected unix exit code", async () => {
          assertMatchOptions(await getQuickFixesForCommand([], terminal, createCommand(command, output, GitSimilarOutputRegex, exitCode, outputLines), expectedMap, commandService, openerService, labelService), actions);
        });
        test("matching exit status", async () => {
          assertMatchOptions(await getQuickFixesForCommand([], terminal, createCommand(command, output, GitSimilarOutputRegex, 2, outputLines), expectedMap, commandService, openerService, labelService), actions);
        });
      });
      suite("returns match", () => {
        test("returns match", async () => {
          assertMatchOptions(await getQuickFixesForCommand([], terminal, createCommand(command, output, GitSimilarOutputRegex, exitCode, outputLines), expectedMap, commandService, openerService, labelService), actions);
        });
        test("returns multiple match", async () => {
          output = `git: 'pu' is not a git command. See 'git --help'.
				The most similar commands are
						pull
						push`;
          const actions2 = [{
            id: "Git Similar",
            enabled: true,
            label: "Run: git pull",
            tooltip: "Run: git pull",
            command: "git pull"
          }, {
            id: "Git Similar",
            enabled: true,
            label: "Run: git push",
            tooltip: "Run: git push",
            command: "git push"
          }];
          assertMatchOptions(await getQuickFixesForCommand([], terminal, createCommand("git pu", output, GitSimilarOutputRegex, exitCode, output.split("\n")), expectedMap, commandService, openerService, labelService), actions2);
        });
        test("passes any arguments through", async () => {
          output = `git: 'checkoutt' is not a git command. See 'git --help'.
				The most similar commands are
						checkout`;
          assertMatchOptions(await getQuickFixesForCommand([], terminal, createCommand("git checkoutt .", output, GitSimilarOutputRegex, exitCode, output.split("\n")), expectedMap, commandService, openerService, labelService), [{
            id: "Git Similar",
            enabled: true,
            label: "Run: git checkout .",
            tooltip: "Run: git checkout .",
            command: "git checkout ."
          }]);
        });
      });
    });
    suite("gitTwoDashes", () => {
      const expectedMap = /* @__PURE__ */ new Map();
      const command = `git add . -all`;
      const output = "error: did you mean `--all` (with two dashes)?";
      const exitCode = 1;
      const actions = [{
        id: "Git Two Dashes",
        enabled: true,
        label: "Run: git add . --all",
        tooltip: "Run: git add . --all",
        command: "git add . --all"
      }];
      setup(() => {
        const command2 = gitTwoDashes();
        expectedMap.set(command2.commandLineMatcher.toString(), [command2]);
        quickFixAddon.registerCommandFinishedListener(command2);
      });
      suite("returns undefined when", () => {
        test("output does not match", async () => {
          strictEqual(await getQuickFixesForCommand([], terminal, createCommand(command, `invalid output`, GitTwoDashesRegex, exitCode), expectedMap, commandService, openerService, labelService), void 0);
        });
        test("command does not match", async () => {
          strictEqual(await getQuickFixesForCommand([], terminal, createCommand(`gt sttatus`, output, GitTwoDashesRegex, exitCode), expectedMap, commandService, openerService, labelService), void 0);
        });
      });
      suite("returns actions when", () => {
        test("expected unix exit code", async () => {
          assertMatchOptions(await getQuickFixesForCommand([], terminal, createCommand(command, output, GitTwoDashesRegex, exitCode), expectedMap, commandService, openerService, labelService), actions);
        });
        test("matching exit status", async () => {
          assertMatchOptions(await getQuickFixesForCommand([], terminal, createCommand(command, output, GitTwoDashesRegex, 2), expectedMap, commandService, openerService, labelService), actions);
        });
      });
    });
    suite("gitFastForwardPull", () => {
      const expectedMap = /* @__PURE__ */ new Map();
      const command = `git checkout vnext`;
      const output = "Already on 'vnext' \n Your branch is behind 'origin/vnext' by 1 commit, and can be fast-forwarded.";
      const exitCode = 0;
      const actions = [{
        id: "Git Fast Forward Pull",
        enabled: true,
        label: "Run: git pull",
        tooltip: "Run: git pull",
        command: "git pull"
      }];
      setup(() => {
        const command2 = gitFastForwardPull();
        expectedMap.set(command2.commandLineMatcher.toString(), [command2]);
        quickFixAddon.registerCommandFinishedListener(command2);
      });
      suite("returns undefined when", () => {
        test("output does not match", async () => {
          strictEqual(await getQuickFixesForCommand([], terminal, createCommand(command, `invalid output`, GitFastForwardPullOutputRegex, exitCode), expectedMap, commandService, openerService, labelService), void 0);
        });
        test("command does not match", async () => {
          strictEqual(await getQuickFixesForCommand([], terminal, createCommand(`gt add`, output, GitFastForwardPullOutputRegex, exitCode), expectedMap, commandService, openerService, labelService), void 0);
        });
        test("exit code does not match", async () => {
          strictEqual(await getQuickFixesForCommand([], terminal, createCommand(command, output, GitFastForwardPullOutputRegex, 2), expectedMap, commandService, openerService, labelService), void 0);
        });
      });
      suite("returns actions when", () => {
        test("matching exit status, command, ouput", async () => {
          assertMatchOptions(await getQuickFixesForCommand([], terminal, createCommand(command, output, GitFastForwardPullOutputRegex, exitCode), expectedMap, commandService, openerService, labelService), actions);
        });
      });
    });
    if (!isWindows) {
      suite("freePort", () => {
        const expectedMap = /* @__PURE__ */ new Map();
        const portCommand = `yarn start dev`;
        const output = `yarn run v1.22.17
			warning ../../package.json: No license field
			Error: listen EADDRINUSE: address already in use 0.0.0.0:3000
				at Server.setupListenHandle [as _listen2] (node:net:1315:16)
				at listenInCluster (node:net:1363:12)
				at doListen (node:net:1501:7)
				at processTicksAndRejections (node:internal/process/task_queues:84:21)
			Emitted 'error' event on WebSocketServer instance at:
				at Server.emit (node:events:394:28)
				at emitErrorNT (node:net:1342:8)
				at processTicksAndRejections (node:internal/process/task_queues:83:21) {
			}
			error Command failed with exit code 1.
			info Visit https://yarnpkg.com/en/docs/cli/run for documentation about this command.`;
        const actionOptions = [{
          id: "Free Port",
          label: "Free port 3000",
          run: true,
          tooltip: "Free port 3000",
          enabled: true
        }];
        setup(() => {
          const command = freePort(() => Promise.resolve());
          expectedMap.set(command.commandLineMatcher.toString(), [command]);
          quickFixAddon.registerCommandFinishedListener(command);
        });
        suite("returns undefined when", () => {
          test("output does not match", async () => {
            strictEqual(await getQuickFixesForCommand([], terminal, createCommand(portCommand, `invalid output`, FreePortOutputRegex), expectedMap, commandService, openerService, labelService), void 0);
          });
        });
        test("returns actions", async () => {
          assertMatchOptions(await getQuickFixesForCommand([], terminal, createCommand(portCommand, output, FreePortOutputRegex), expectedMap, commandService, openerService, labelService), actionOptions);
        });
      });
    }
    suite("gitPushSetUpstream", () => {
      const expectedMap = /* @__PURE__ */ new Map();
      const command = `git push`;
      const output = `fatal: The current branch test22 has no upstream branch.
			To push the current branch and set the remote as upstream, use

				git push --set-upstream origin test22`;
      const exitCode = 128;
      const actions = [{
        id: "Git Push Set Upstream",
        enabled: true,
        label: "Run: git push --set-upstream origin test22",
        tooltip: "Run: git push --set-upstream origin test22",
        command: "git push --set-upstream origin test22"
      }];
      setup(() => {
        const command2 = gitPushSetUpstream();
        expectedMap.set(command2.commandLineMatcher.toString(), [command2]);
        quickFixAddon.registerCommandFinishedListener(command2);
      });
      suite("returns undefined when", () => {
        test("output does not match", async () => {
          strictEqual(await getQuickFixesForCommand([], terminal, createCommand(command, `invalid output`, GitPushOutputRegex, exitCode), expectedMap, commandService, openerService, labelService), void 0);
        });
        test("command does not match", async () => {
          strictEqual(await getQuickFixesForCommand([], terminal, createCommand(`git status`, output, GitPushOutputRegex, exitCode), expectedMap, commandService, openerService, labelService), void 0);
        });
      });
      suite("returns actions when", () => {
        test("expected unix exit code", async () => {
          assertMatchOptions(await getQuickFixesForCommand([], terminal, createCommand(command, output, GitPushOutputRegex, exitCode), expectedMap, commandService, openerService, labelService), actions);
        });
        test("matching exit status", async () => {
          assertMatchOptions(await getQuickFixesForCommand([], terminal, createCommand(command, output, GitPushOutputRegex, 2), expectedMap, commandService, openerService, labelService), actions);
        });
      });
    });
    suite("gitCreatePr", () => {
      const expectedMap = /* @__PURE__ */ new Map();
      const command = `git push`;
      const output = `Total 0 (delta 0), reused 0 (delta 0), pack-reused 0
			remote:
			remote: Create a pull request for 'test22' on GitHub by visiting:
			remote:      https://github.com/meganrogge/xterm.js/pull/new/test22
			remote:
			To https://github.com/meganrogge/xterm.js
			 * [new branch]        test22 -> test22
			Branch 'test22' set up to track remote branch 'test22' from 'origin'. `;
      const exitCode = 0;
      const actions = [{
        id: "Git Create Pr",
        enabled: true,
        label: "Open: https://github.com/meganrogge/xterm.js/pull/new/test22",
        tooltip: "Open: https://github.com/meganrogge/xterm.js/pull/new/test22",
        uri: URI.parse("https://github.com/meganrogge/xterm.js/pull/new/test22")
      }];
      setup(() => {
        const command2 = gitCreatePr();
        expectedMap.set(command2.commandLineMatcher.toString(), [command2]);
        quickFixAddon.registerCommandFinishedListener(command2);
      });
      suite("returns undefined when", () => {
        test("output does not match", async () => {
          strictEqual(await getQuickFixesForCommand([], terminal, createCommand(command, `invalid output`, GitCreatePrOutputRegex, exitCode), expectedMap, commandService, openerService, labelService), void 0);
        });
        test("command does not match", async () => {
          strictEqual(await getQuickFixesForCommand([], terminal, createCommand(`git status`, output, GitCreatePrOutputRegex, exitCode), expectedMap, commandService, openerService, labelService), void 0);
        });
        test("failure exit status", async () => {
          strictEqual(await getQuickFixesForCommand([], terminal, createCommand(command, output, GitCreatePrOutputRegex, 2), expectedMap, commandService, openerService, labelService), void 0);
        });
      });
      suite("returns actions when", () => {
        test("expected unix exit code", async () => {
          assertMatchOptions(await getQuickFixesForCommand([], terminal, createCommand(command, output, GitCreatePrOutputRegex, exitCode), expectedMap, commandService, openerService, labelService), actions);
        });
      });
    });
  });
  suite("gitPush - multiple providers", () => {
    const expectedMap = /* @__PURE__ */ new Map();
    const command = `git push`;
    const output = `fatal: The current branch test22 has no upstream branch.
		To push the current branch and set the remote as upstream, use

			git push --set-upstream origin test22`;
    const exitCode = 128;
    const actions = [{
      id: "Git Push Set Upstream",
      enabled: true,
      label: "Run: git push --set-upstream origin test22",
      tooltip: "Run: git push --set-upstream origin test22",
      command: "git push --set-upstream origin test22"
    }];
    setup(() => {
      const pushCommand = gitPushSetUpstream();
      const prCommand = gitCreatePr();
      quickFixAddon.registerCommandFinishedListener(prCommand);
      expectedMap.set(pushCommand.commandLineMatcher.toString(), [pushCommand, prCommand]);
    });
    suite("returns undefined when", () => {
      test("output does not match", async () => {
        strictEqual(await getQuickFixesForCommand([], terminal, createCommand(command, `invalid output`, GitPushOutputRegex, exitCode), expectedMap, commandService, openerService, labelService), void 0);
      });
      test("command does not match", async () => {
        strictEqual(await getQuickFixesForCommand([], terminal, createCommand(`git status`, output, GitPushOutputRegex, exitCode), expectedMap, commandService, openerService, labelService), void 0);
      });
    });
    suite("returns actions when", () => {
      test("expected unix exit code", async () => {
        assertMatchOptions(await getQuickFixesForCommand([], terminal, createCommand(command, output, GitPushOutputRegex, exitCode), expectedMap, commandService, openerService, labelService), actions);
      });
      test("matching exit status", async () => {
        assertMatchOptions(await getQuickFixesForCommand([], terminal, createCommand(command, output, GitPushOutputRegex, 2), expectedMap, commandService, openerService, labelService), actions);
      });
    });
  });
  suite("pwsh feedback providers", () => {
    suite("General", () => {
      const expectedMap = /* @__PURE__ */ new Map();
      const command = `not important`;
      const output = [
        `...`,
        ``,
        `Suggestion [General]:`,
        `  The most similar commands are: python3, python3m, pamon, python3.6, rtmon, echo, pushd, etsn, pwsh, pwconv.`,
        ``,
        `Suggestion [cmd-not-found]:`,
        `  Command 'python' not found, but can be installed with:`,
        `  sudo apt install python3`,
        `  sudo apt install python`,
        `  sudo apt install python-minimal`,
        `  You also have python3 installed, you can run 'python3' instead.'`,
        ``
      ].join("\n");
      const exitCode = 128;
      const actions = [
        "python3",
        "python3m",
        "pamon",
        "python3.6",
        "rtmon",
        "echo",
        "pushd",
        "etsn",
        "pwsh",
        "pwconv"
      ].map((command2) => {
        return {
          id: "Pwsh General Error",
          enabled: true,
          label: `Run: ${command2}`,
          tooltip: `Run: ${command2}`,
          command: command2
        };
      });
      setup(() => {
        const pushCommand = pwshGeneralError();
        quickFixAddon.registerCommandFinishedListener(pushCommand);
        expectedMap.set(pushCommand.commandLineMatcher.toString(), [pushCommand]);
      });
      test("returns undefined when output does not match", async () => {
        strictEqual(await getQuickFixesForCommand([], terminal, createCommand(command, `invalid output`, PwshGeneralErrorOutputRegex, exitCode), expectedMap, commandService, openerService, labelService), void 0);
      });
      test("returns actions when output matches", async () => {
        assertMatchOptions(await getQuickFixesForCommand([], terminal, createCommand(command, output, PwshGeneralErrorOutputRegex, exitCode), expectedMap, commandService, openerService, labelService), actions);
      });
    });
    suite("Unix cmd-not-found", () => {
      const expectedMap = /* @__PURE__ */ new Map();
      const command = `not important`;
      const output = [
        `...`,
        ``,
        `Suggestion [General]`,
        `  The most similar commands are: python3, python3m, pamon, python3.6, rtmon, echo, pushd, etsn, pwsh, pwconv.`,
        ``,
        `Suggestion [cmd-not-found]:`,
        `  Command 'python' not found, but can be installed with:`,
        `  sudo apt install python3`,
        `  sudo apt install python`,
        `  sudo apt install python-minimal`,
        `  You also have python3 installed, you can run 'python3' instead.'`,
        ``
      ].join("\n");
      const exitCode = 128;
      const actions = [
        "sudo apt install python3",
        "sudo apt install python",
        "sudo apt install python-minimal",
        "python3"
      ].map((command2) => {
        return {
          id: "Pwsh Unix Command Not Found Error",
          enabled: true,
          label: `Run: ${command2}`,
          tooltip: `Run: ${command2}`,
          command: command2
        };
      });
      setup(() => {
        const pushCommand = pwshUnixCommandNotFoundError();
        quickFixAddon.registerCommandFinishedListener(pushCommand);
        expectedMap.set(pushCommand.commandLineMatcher.toString(), [pushCommand]);
      });
      test("returns undefined when output does not match", async () => {
        strictEqual(await getQuickFixesForCommand([], terminal, createCommand(command, `invalid output`, PwshUnixCommandNotFoundErrorOutputRegex, exitCode), expectedMap, commandService, openerService, labelService), void 0);
      });
      test("returns actions when output matches", async () => {
        assertMatchOptions(await getQuickFixesForCommand([], terminal, createCommand(command, output, PwshUnixCommandNotFoundErrorOutputRegex, exitCode), expectedMap, commandService, openerService, labelService), actions);
      });
    });
  });
});
function createCommand(command, output, outputMatcher, exitCode, outputLines) {
  return {
    cwd: "",
    commandStartLineContent: "",
    markProperties: {},
    executedX: void 0,
    startX: void 0,
    command,
    isTrusted: true,
    exitCode,
    getOutput: () => {
      return output;
    },
    getOutputMatch: (_matcher) => {
      if (outputMatcher) {
        const regexMatch = output.match(outputMatcher) ?? void 0;
        if (regexMatch) {
          return outputLines ? { regexMatch, outputLines } : { regexMatch, outputLines: [] };
        }
      }
      return void 0;
    },
    timestamp: Date.now(),
    hasOutput: () => !!output
  };
}
function assertMatchOptions(actual, expected) {
  strictEqual(actual?.length, expected.length);
  for (let i = 0; i < expected.length; i++) {
    const expectedItem = expected[i];
    const actualItem = actual[i];
    strictEqual(actualItem.id, expectedItem.id, `ID`);
    strictEqual(actualItem.enabled, expectedItem.enabled, `enabled`);
    strictEqual(actualItem.label, expectedItem.label, `label`);
    strictEqual(actualItem.tooltip, expectedItem.tooltip, `tooltip`);
    if (expectedItem.command) {
      strictEqual(actualItem.command, expectedItem.command);
    }
    if (expectedItem.uri) {
      strictEqual(actualItem.uri.toString(), expectedItem.uri.toString());
    }
  }
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9xdWlja0ZpeC90ZXN0L2Jyb3dzZXIvcXVpY2tGaXhBZGRvbi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgeyBUZXJtaW5hbCB9IGZyb20gJ0B4dGVybS94dGVybSc7XG5pbXBvcnQgeyBzdHJpY3RFcXVhbCB9IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBpbXBvcnRBTUROb2RlTW9kdWxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYW1kWC5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFRlc3RDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci90ZXN0L2Jyb3dzZXIvZWRpdG9yVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0TWVudVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsQ29tbWFuZCwgVGVybWluYWxDYXBhYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy9jYXBhYmlsaXRpZXMuanMnO1xuaW1wb3J0IHsgQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vY2FwYWJpbGl0aWVzL2NvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5LmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy90ZXJtaW5hbENhcGFiaWxpdHlTdG9yZS5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxPdXRwdXRNYXRjaGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbFF1aWNrRml4U2VydmljZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvcXVpY2tGaXguanMnO1xuaW1wb3J0IHsgZ2V0UXVpY2tGaXhlc0ZvckNvbW1hbmQsIFRlcm1pbmFsUXVpY2tGaXhBZGRvbiB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvcXVpY2tGaXhBZGRvbi5qcyc7XG5pbXBvcnQgeyBmcmVlUG9ydCwgRnJlZVBvcnRPdXRwdXRSZWdleCwgZ2l0Q3JlYXRlUHIsIEdpdENyZWF0ZVByT3V0cHV0UmVnZXgsIGdpdEZhc3RGb3J3YXJkUHVsbCwgR2l0RmFzdEZvcndhcmRQdWxsT3V0cHV0UmVnZXgsIEdpdFB1c2hPdXRwdXRSZWdleCwgZ2l0UHVzaFNldFVwc3RyZWFtLCBnaXRTaW1pbGFyLCBHaXRTaW1pbGFyT3V0cHV0UmVnZXgsIGdpdFR3b0Rhc2hlcywgR2l0VHdvRGFzaGVzUmVnZXgsIHB3c2hHZW5lcmFsRXJyb3IsIFB3c2hHZW5lcmFsRXJyb3JPdXRwdXRSZWdleCwgcHdzaFVuaXhDb21tYW5kTm90Rm91bmRFcnJvciwgUHdzaFVuaXhDb21tYW5kTm90Rm91bmRFcnJvck91dHB1dFJlZ2V4IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90ZXJtaW5hbFF1aWNrRml4QnVpbHRpbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgVGVzdFN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vdGVzdC9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgVGVzdFh0ZXJtTG9nZ2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvdGVzdC9jb21tb24vdGVybWluYWxUZXN0SGVscGVycy5qcyc7XG5cbnN1aXRlKCdRdWlja0ZpeEFkZG9uJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBxdWlja0ZpeEFkZG9uOiBUZXJtaW5hbFF1aWNrRml4QWRkb247XG5cdGxldCBjb21tYW5kRGV0ZWN0aW9uOiBDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eTtcblx0bGV0IGNvbW1hbmRTZXJ2aWNlOiBUZXN0Q29tbWFuZFNlcnZpY2U7XG5cdGxldCBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZTtcblx0bGV0IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZTtcblx0bGV0IHRlcm1pbmFsOiBUZXJtaW5hbDtcblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cblx0c2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgVGVybWluYWxDdG9yID0gKGF3YWl0IGltcG9ydEFNRE5vZGVNb2R1bGU8dHlwZW9mIGltcG9ydCgnQHh0ZXJtL3h0ZXJtJyk+KCdAeHRlcm0veHRlcm0nLCAnbGliL3h0ZXJtLmpzJykpLlRlcm1pbmFsO1xuXHRcdHRlcm1pbmFsID0gc3RvcmUuYWRkKG5ldyBUZXJtaW5hbEN0b3Ioe1xuXHRcdFx0YWxsb3dQcm9wb3NlZEFwaTogdHJ1ZSxcblx0XHRcdGNvbHM6IDgwLFxuXHRcdFx0cm93czogMzAsXG5cdFx0XHRsb2dnZXI6IFRlc3RYdGVybUxvZ2dlclxuXHRcdH0pKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgc3RvcmUuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlcm1pbmFsUXVpY2tGaXhTZXJ2aWNlLCB7XG5cdFx0XHRvbkRpZFJlZ2lzdGVyUHJvdmlkZXI6IEV2ZW50Lk5vbmUsXG5cdFx0XHRvbkRpZFVucmVnaXN0ZXJQcm92aWRlcjogRXZlbnQuTm9uZSxcblx0XHRcdG9uRGlkUmVnaXN0ZXJDb21tYW5kU2VsZWN0b3I6IEV2ZW50Lk5vbmUsXG5cdFx0XHRleHRlbnNpb25RdWlja0ZpeGVzOiBQcm9taXNlLnJlc29sdmUoW10pXG5cdFx0fSBhcyBQYXJ0aWFsPElUZXJtaW5hbFF1aWNrRml4U2VydmljZT4pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGxhYmVsU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxhYmVsU2VydmljZSwge30gYXMgUGFydGlhbDxJTGFiZWxTZXJ2aWNlPik7XG5cdFx0Y29uc3QgY2FwYWJpbGl0aWVzID0gc3RvcmUuYWRkKG5ldyBUZXJtaW5hbENhcGFiaWxpdHlTdG9yZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0Y29tbWFuZERldGVjdGlvbiA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eSwgdGVybWluYWwpKTtcblx0XHRjYXBhYmlsaXRpZXMuYWRkKFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uLCBjb21tYW5kRGV0ZWN0aW9uKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb250ZXh0TWVudVNlcnZpY2UsIHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb250ZXh0TWVudVNlcnZpY2UpKSk7XG5cdFx0b3BlbmVyU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU9wZW5lclNlcnZpY2UsIHt9IGFzIFBhcnRpYWw8SU9wZW5lclNlcnZpY2U+KTtcblx0XHRjb21tYW5kU2VydmljZSA9IG5ldyBUZXN0Q29tbWFuZFNlcnZpY2UoaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXG5cdFx0cXVpY2tGaXhBZGRvbiA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsUXVpY2tGaXhBZGRvbiwgZ2VuZXJhdGVVdWlkKCksIFtdLCBjYXBhYmlsaXRpZXMpO1xuXHRcdHRlcm1pbmFsLmxvYWRBZGRvbihxdWlja0ZpeEFkZG9uKTtcblx0fSk7XG5cblx0c3VpdGUoJ3JlZ2lzdGVyQ29tbWFuZEZpbmlzaGVkTGlzdGVuZXIgJiBnZXRNYXRjaEFjdGlvbnMnLCAoKSA9PiB7XG5cdFx0c3VpdGUoJ2dpdFNpbWlsYXJDb21tYW5kJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRNYXAgPSBuZXcgTWFwKCk7XG5cdFx0XHRjb25zdCBjb21tYW5kID0gYGdpdCBzdHRhdHVzYDtcblx0XHRcdGxldCBvdXRwdXQgPSBgZ2l0OiAnc3R0YXR1cycgaXMgbm90IGEgZ2l0IGNvbW1hbmQuIFNlZSAnZ2l0IC0taGVscCcuXG5cblx0XHRcdFRoZSBtb3N0IHNpbWlsYXIgY29tbWFuZCBpc1xuXHRcdFx0c3RhdHVzYDtcblx0XHRcdGNvbnN0IGV4aXRDb2RlID0gMTtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSBbe1xuXHRcdFx0XHRpZDogJ0dpdCBTaW1pbGFyJyxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0bGFiZWw6ICdSdW46IGdpdCBzdGF0dXMnLFxuXHRcdFx0XHR0b29sdGlwOiAnUnVuOiBnaXQgc3RhdHVzJyxcblx0XHRcdFx0Y29tbWFuZDogJ2dpdCBzdGF0dXMnXG5cdFx0XHR9XTtcblx0XHRcdGNvbnN0IG91dHB1dExpbmVzID0gb3V0cHV0LnNwbGl0KCdcXG4nKTtcblx0XHRcdHNldHVwKCgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29tbWFuZCA9IGdpdFNpbWlsYXIoKTtcblx0XHRcdFx0ZXhwZWN0ZWRNYXAuc2V0KGNvbW1hbmQuY29tbWFuZExpbmVNYXRjaGVyLnRvU3RyaW5nKCksIFtjb21tYW5kXSk7XG5cdFx0XHRcdHF1aWNrRml4QWRkb24ucmVnaXN0ZXJDb21tYW5kRmluaXNoZWRMaXN0ZW5lcihjb21tYW5kKTtcblx0XHRcdH0pO1xuXHRcdFx0c3VpdGUoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4nLCAoKSA9PiB7XG5cdFx0XHRcdHRlc3QoJ291dHB1dCBkb2VzIG5vdCBtYXRjaCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRzdHJpY3RFcXVhbChhd2FpdCAoZ2V0UXVpY2tGaXhlc0ZvckNvbW1hbmQoW10sIHRlcm1pbmFsLCBjcmVhdGVDb21tYW5kKGNvbW1hbmQsIGBpbnZhbGlkIG91dHB1dGAsIEdpdFNpbWlsYXJPdXRwdXRSZWdleCwgZXhpdENvZGUsIFtgaW52YWxpZCBvdXRwdXRgXSksIGV4cGVjdGVkTWFwLCBjb21tYW5kU2VydmljZSwgb3BlbmVyU2VydmljZSwgbGFiZWxTZXJ2aWNlKSksIHVuZGVmaW5lZCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0ZXN0KCdjb21tYW5kIGRvZXMgbm90IG1hdGNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdHN0cmljdEVxdWFsKGF3YWl0IChnZXRRdWlja0ZpeGVzRm9yQ29tbWFuZChbXSwgdGVybWluYWwsIGNyZWF0ZUNvbW1hbmQoYGd0IHN0dGF0dXNgLCBvdXRwdXQsIEdpdFNpbWlsYXJPdXRwdXRSZWdleCwgZXhpdENvZGUsIG91dHB1dExpbmVzKSwgZXhwZWN0ZWRNYXAsIGNvbW1hbmRTZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCBsYWJlbFNlcnZpY2UpKSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHRcdHN1aXRlKCdyZXR1cm5zIGFjdGlvbnMgd2hlbicsICgpID0+IHtcblx0XHRcdFx0dGVzdCgnZXhwZWN0ZWQgdW5peCBleGl0IGNvZGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0TWF0Y2hPcHRpb25zKChhd2FpdCBnZXRRdWlja0ZpeGVzRm9yQ29tbWFuZChbXSwgdGVybWluYWwsIGNyZWF0ZUNvbW1hbmQoY29tbWFuZCwgb3V0cHV0LCBHaXRTaW1pbGFyT3V0cHV0UmVnZXgsIGV4aXRDb2RlLCBvdXRwdXRMaW5lcyksIGV4cGVjdGVkTWFwLCBjb21tYW5kU2VydmljZSwgb3BlbmVyU2VydmljZSwgbGFiZWxTZXJ2aWNlKSksIGFjdGlvbnMpO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGVzdCgnbWF0Y2hpbmcgZXhpdCBzdGF0dXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0TWF0Y2hPcHRpb25zKChhd2FpdCBnZXRRdWlja0ZpeGVzRm9yQ29tbWFuZChbXSwgdGVybWluYWwsIGNyZWF0ZUNvbW1hbmQoY29tbWFuZCwgb3V0cHV0LCBHaXRTaW1pbGFyT3V0cHV0UmVnZXgsIDIsIG91dHB1dExpbmVzKSwgZXhwZWN0ZWRNYXAsIGNvbW1hbmRTZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCBsYWJlbFNlcnZpY2UpKSwgYWN0aW9ucyk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0XHRzdWl0ZSgncmV0dXJucyBtYXRjaCcsICgpID0+IHtcblx0XHRcdFx0dGVzdCgncmV0dXJucyBtYXRjaCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRhc3NlcnRNYXRjaE9wdGlvbnMoKGF3YWl0IGdldFF1aWNrRml4ZXNGb3JDb21tYW5kKFtdLCB0ZXJtaW5hbCwgY3JlYXRlQ29tbWFuZChjb21tYW5kLCBvdXRwdXQsIEdpdFNpbWlsYXJPdXRwdXRSZWdleCwgZXhpdENvZGUsIG91dHB1dExpbmVzKSwgZXhwZWN0ZWRNYXAsIGNvbW1hbmRTZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCBsYWJlbFNlcnZpY2UpKSwgYWN0aW9ucyk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHRlc3QoJ3JldHVybnMgbXVsdGlwbGUgbWF0Y2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0b3V0cHV0ID0gYGdpdDogJ3B1JyBpcyBub3QgYSBnaXQgY29tbWFuZC4gU2VlICdnaXQgLS1oZWxwJy5cblx0XHRcdFx0VGhlIG1vc3Qgc2ltaWxhciBjb21tYW5kcyBhcmVcblx0XHRcdFx0XHRcdHB1bGxcblx0XHRcdFx0XHRcdHB1c2hgO1xuXHRcdFx0XHRcdGNvbnN0IGFjdGlvbnMgPSBbe1xuXHRcdFx0XHRcdFx0aWQ6ICdHaXQgU2ltaWxhcicsXG5cdFx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdFx0bGFiZWw6ICdSdW46IGdpdCBwdWxsJyxcblx0XHRcdFx0XHRcdHRvb2x0aXA6ICdSdW46IGdpdCBwdWxsJyxcblx0XHRcdFx0XHRcdGNvbW1hbmQ6ICdnaXQgcHVsbCdcblx0XHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0XHRpZDogJ0dpdCBTaW1pbGFyJyxcblx0XHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRsYWJlbDogJ1J1bjogZ2l0IHB1c2gnLFxuXHRcdFx0XHRcdFx0dG9vbHRpcDogJ1J1bjogZ2l0IHB1c2gnLFxuXHRcdFx0XHRcdFx0Y29tbWFuZDogJ2dpdCBwdXNoJ1xuXHRcdFx0XHRcdH1dO1xuXHRcdFx0XHRcdGFzc2VydE1hdGNoT3B0aW9ucygoYXdhaXQgZ2V0UXVpY2tGaXhlc0ZvckNvbW1hbmQoW10sIHRlcm1pbmFsLCBjcmVhdGVDb21tYW5kKCdnaXQgcHUnLCBvdXRwdXQsIEdpdFNpbWlsYXJPdXRwdXRSZWdleCwgZXhpdENvZGUsIG91dHB1dC5zcGxpdCgnXFxuJykpLCBleHBlY3RlZE1hcCwgY29tbWFuZFNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIGxhYmVsU2VydmljZSkpLCBhY3Rpb25zKTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRlc3QoJ3Bhc3NlcyBhbnkgYXJndW1lbnRzIHRocm91Z2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0b3V0cHV0ID0gYGdpdDogJ2NoZWNrb3V0dCcgaXMgbm90IGEgZ2l0IGNvbW1hbmQuIFNlZSAnZ2l0IC0taGVscCcuXG5cdFx0XHRcdFRoZSBtb3N0IHNpbWlsYXIgY29tbWFuZHMgYXJlXG5cdFx0XHRcdFx0XHRjaGVja291dGA7XG5cdFx0XHRcdFx0YXNzZXJ0TWF0Y2hPcHRpb25zKChhd2FpdCBnZXRRdWlja0ZpeGVzRm9yQ29tbWFuZChbXSwgdGVybWluYWwsIGNyZWF0ZUNvbW1hbmQoJ2dpdCBjaGVja291dHQgLicsIG91dHB1dCwgR2l0U2ltaWxhck91dHB1dFJlZ2V4LCBleGl0Q29kZSwgb3V0cHV0LnNwbGl0KCdcXG4nKSksIGV4cGVjdGVkTWFwLCBjb21tYW5kU2VydmljZSwgb3BlbmVyU2VydmljZSwgbGFiZWxTZXJ2aWNlKSksIFt7XG5cdFx0XHRcdFx0XHRpZDogJ0dpdCBTaW1pbGFyJyxcblx0XHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRsYWJlbDogJ1J1bjogZ2l0IGNoZWNrb3V0IC4nLFxuXHRcdFx0XHRcdFx0dG9vbHRpcDogJ1J1bjogZ2l0IGNoZWNrb3V0IC4nLFxuXHRcdFx0XHRcdFx0Y29tbWFuZDogJ2dpdCBjaGVja291dCAuJ1xuXHRcdFx0XHRcdH1dKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0XHRzdWl0ZSgnZ2l0VHdvRGFzaGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRNYXAgPSBuZXcgTWFwKCk7XG5cdFx0XHRjb25zdCBjb21tYW5kID0gYGdpdCBhZGQgLiAtYWxsYDtcblx0XHRcdGNvbnN0IG91dHB1dCA9ICdlcnJvcjogZGlkIHlvdSBtZWFuIGAtLWFsbGAgKHdpdGggdHdvIGRhc2hlcyk/Jztcblx0XHRcdGNvbnN0IGV4aXRDb2RlID0gMTtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSBbe1xuXHRcdFx0XHRpZDogJ0dpdCBUd28gRGFzaGVzJyxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0bGFiZWw6ICdSdW46IGdpdCBhZGQgLiAtLWFsbCcsXG5cdFx0XHRcdHRvb2x0aXA6ICdSdW46IGdpdCBhZGQgLiAtLWFsbCcsXG5cdFx0XHRcdGNvbW1hbmQ6ICdnaXQgYWRkIC4gLS1hbGwnXG5cdFx0XHR9XTtcblx0XHRcdHNldHVwKCgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29tbWFuZCA9IGdpdFR3b0Rhc2hlcygpO1xuXHRcdFx0XHRleHBlY3RlZE1hcC5zZXQoY29tbWFuZC5jb21tYW5kTGluZU1hdGNoZXIudG9TdHJpbmcoKSwgW2NvbW1hbmRdKTtcblx0XHRcdFx0cXVpY2tGaXhBZGRvbi5yZWdpc3RlckNvbW1hbmRGaW5pc2hlZExpc3RlbmVyKGNvbW1hbmQpO1xuXHRcdFx0fSk7XG5cdFx0XHRzdWl0ZSgncmV0dXJucyB1bmRlZmluZWQgd2hlbicsICgpID0+IHtcblx0XHRcdFx0dGVzdCgnb3V0cHV0IGRvZXMgbm90IG1hdGNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdHN0cmljdEVxdWFsKChhd2FpdCBnZXRRdWlja0ZpeGVzRm9yQ29tbWFuZChbXSwgdGVybWluYWwsIGNyZWF0ZUNvbW1hbmQoY29tbWFuZCwgYGludmFsaWQgb3V0cHV0YCwgR2l0VHdvRGFzaGVzUmVnZXgsIGV4aXRDb2RlKSwgZXhwZWN0ZWRNYXAsIGNvbW1hbmRTZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCBsYWJlbFNlcnZpY2UpKSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRlc3QoJ2NvbW1hbmQgZG9lcyBub3QgbWF0Y2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0c3RyaWN0RXF1YWwoKGF3YWl0IGdldFF1aWNrRml4ZXNGb3JDb21tYW5kKFtdLCB0ZXJtaW5hbCwgY3JlYXRlQ29tbWFuZChgZ3Qgc3R0YXR1c2AsIG91dHB1dCwgR2l0VHdvRGFzaGVzUmVnZXgsIGV4aXRDb2RlKSwgZXhwZWN0ZWRNYXAsIGNvbW1hbmRTZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCBsYWJlbFNlcnZpY2UpKSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHRcdHN1aXRlKCdyZXR1cm5zIGFjdGlvbnMgd2hlbicsICgpID0+IHtcblx0XHRcdFx0dGVzdCgnZXhwZWN0ZWQgdW5peCBleGl0IGNvZGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0TWF0Y2hPcHRpb25zKChhd2FpdCBnZXRRdWlja0ZpeGVzRm9yQ29tbWFuZChbXSwgdGVybWluYWwsIGNyZWF0ZUNvbW1hbmQoY29tbWFuZCwgb3V0cHV0LCBHaXRUd29EYXNoZXNSZWdleCwgZXhpdENvZGUpLCBleHBlY3RlZE1hcCwgY29tbWFuZFNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIGxhYmVsU2VydmljZSkpLCBhY3Rpb25zKTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRlc3QoJ21hdGNoaW5nIGV4aXQgc3RhdHVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGFzc2VydE1hdGNoT3B0aW9ucygoYXdhaXQgZ2V0UXVpY2tGaXhlc0ZvckNvbW1hbmQoW10sIHRlcm1pbmFsLCBjcmVhdGVDb21tYW5kKGNvbW1hbmQsIG91dHB1dCwgR2l0VHdvRGFzaGVzUmVnZXgsIDIpLCBleHBlY3RlZE1hcCwgY29tbWFuZFNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIGxhYmVsU2VydmljZSkpLCBhY3Rpb25zKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0XHRzdWl0ZSgnZ2l0RmFzdEZvcndhcmRQdWxsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRNYXAgPSBuZXcgTWFwKCk7XG5cdFx0XHRjb25zdCBjb21tYW5kID0gYGdpdCBjaGVja291dCB2bmV4dGA7XG5cdFx0XHRjb25zdCBvdXRwdXQgPSAnQWxyZWFkeSBvbiBcXCd2bmV4dFxcJyBcXG4gWW91ciBicmFuY2ggaXMgYmVoaW5kIFxcJ29yaWdpbi92bmV4dFxcJyBieSAxIGNvbW1pdCwgYW5kIGNhbiBiZSBmYXN0LWZvcndhcmRlZC4nO1xuXHRcdFx0Y29uc3QgZXhpdENvZGUgPSAwO1xuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IFt7XG5cdFx0XHRcdGlkOiAnR2l0IEZhc3QgRm9yd2FyZCBQdWxsJyxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0bGFiZWw6ICdSdW46IGdpdCBwdWxsJyxcblx0XHRcdFx0dG9vbHRpcDogJ1J1bjogZ2l0IHB1bGwnLFxuXHRcdFx0XHRjb21tYW5kOiAnZ2l0IHB1bGwnXG5cdFx0XHR9XTtcblx0XHRcdHNldHVwKCgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29tbWFuZCA9IGdpdEZhc3RGb3J3YXJkUHVsbCgpO1xuXHRcdFx0XHRleHBlY3RlZE1hcC5zZXQoY29tbWFuZC5jb21tYW5kTGluZU1hdGNoZXIudG9TdHJpbmcoKSwgW2NvbW1hbmRdKTtcblx0XHRcdFx0cXVpY2tGaXhBZGRvbi5yZWdpc3RlckNvbW1hbmRGaW5pc2hlZExpc3RlbmVyKGNvbW1hbmQpO1xuXHRcdFx0fSk7XG5cdFx0XHRzdWl0ZSgncmV0dXJucyB1bmRlZmluZWQgd2hlbicsICgpID0+IHtcblx0XHRcdFx0dGVzdCgnb3V0cHV0IGRvZXMgbm90IG1hdGNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdHN0cmljdEVxdWFsKChhd2FpdCBnZXRRdWlja0ZpeGVzRm9yQ29tbWFuZChbXSwgdGVybWluYWwsIGNyZWF0ZUNvbW1hbmQoY29tbWFuZCwgYGludmFsaWQgb3V0cHV0YCwgR2l0RmFzdEZvcndhcmRQdWxsT3V0cHV0UmVnZXgsIGV4aXRDb2RlKSwgZXhwZWN0ZWRNYXAsIGNvbW1hbmRTZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCBsYWJlbFNlcnZpY2UpKSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRlc3QoJ2NvbW1hbmQgZG9lcyBub3QgbWF0Y2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0c3RyaWN0RXF1YWwoKGF3YWl0IGdldFF1aWNrRml4ZXNGb3JDb21tYW5kKFtdLCB0ZXJtaW5hbCwgY3JlYXRlQ29tbWFuZChgZ3QgYWRkYCwgb3V0cHV0LCBHaXRGYXN0Rm9yd2FyZFB1bGxPdXRwdXRSZWdleCwgZXhpdENvZGUpLCBleHBlY3RlZE1hcCwgY29tbWFuZFNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIGxhYmVsU2VydmljZSkpLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGVzdCgnZXhpdCBjb2RlIGRvZXMgbm90IG1hdGNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdHN0cmljdEVxdWFsKChhd2FpdCBnZXRRdWlja0ZpeGVzRm9yQ29tbWFuZChbXSwgdGVybWluYWwsIGNyZWF0ZUNvbW1hbmQoY29tbWFuZCwgb3V0cHV0LCBHaXRGYXN0Rm9yd2FyZFB1bGxPdXRwdXRSZWdleCwgMiksIGV4cGVjdGVkTWFwLCBjb21tYW5kU2VydmljZSwgb3BlbmVyU2VydmljZSwgbGFiZWxTZXJ2aWNlKSksIHVuZGVmaW5lZCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0XHRzdWl0ZSgncmV0dXJucyBhY3Rpb25zIHdoZW4nLCAoKSA9PiB7XG5cdFx0XHRcdHRlc3QoJ21hdGNoaW5nIGV4aXQgc3RhdHVzLCBjb21tYW5kLCBvdXB1dCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRhc3NlcnRNYXRjaE9wdGlvbnMoKGF3YWl0IGdldFF1aWNrRml4ZXNGb3JDb21tYW5kKFtdLCB0ZXJtaW5hbCwgY3JlYXRlQ29tbWFuZChjb21tYW5kLCBvdXRwdXQsIEdpdEZhc3RGb3J3YXJkUHVsbE91dHB1dFJlZ2V4LCBleGl0Q29kZSksIGV4cGVjdGVkTWFwLCBjb21tYW5kU2VydmljZSwgb3BlbmVyU2VydmljZSwgbGFiZWxTZXJ2aWNlKSksIGFjdGlvbnMpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHRcdGlmICghaXNXaW5kb3dzKSB7XG5cdFx0XHRzdWl0ZSgnZnJlZVBvcnQnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGV4cGVjdGVkTWFwID0gbmV3IE1hcCgpO1xuXHRcdFx0XHRjb25zdCBwb3J0Q29tbWFuZCA9IGB5YXJuIHN0YXJ0IGRldmA7XG5cdFx0XHRcdGNvbnN0IG91dHB1dCA9IGB5YXJuIHJ1biB2MS4yMi4xN1xuXHRcdFx0d2FybmluZyAuLi8uLi9wYWNrYWdlLmpzb246IE5vIGxpY2Vuc2UgZmllbGRcblx0XHRcdEVycm9yOiBsaXN0ZW4gRUFERFJJTlVTRTogYWRkcmVzcyBhbHJlYWR5IGluIHVzZSAwLjAuMC4wOjMwMDBcblx0XHRcdFx0YXQgU2VydmVyLnNldHVwTGlzdGVuSGFuZGxlIFthcyBfbGlzdGVuMl0gKG5vZGU6bmV0OjEzMTU6MTYpXG5cdFx0XHRcdGF0IGxpc3RlbkluQ2x1c3RlciAobm9kZTpuZXQ6MTM2MzoxMilcblx0XHRcdFx0YXQgZG9MaXN0ZW4gKG5vZGU6bmV0OjE1MDE6Nylcblx0XHRcdFx0YXQgcHJvY2Vzc1RpY2tzQW5kUmVqZWN0aW9ucyAobm9kZTppbnRlcm5hbC9wcm9jZXNzL3Rhc2tfcXVldWVzOjg0OjIxKVxuXHRcdFx0RW1pdHRlZCAnZXJyb3InIGV2ZW50IG9uIFdlYlNvY2tldFNlcnZlciBpbnN0YW5jZSBhdDpcblx0XHRcdFx0YXQgU2VydmVyLmVtaXQgKG5vZGU6ZXZlbnRzOjM5NDoyOClcblx0XHRcdFx0YXQgZW1pdEVycm9yTlQgKG5vZGU6bmV0OjEzNDI6OClcblx0XHRcdFx0YXQgcHJvY2Vzc1RpY2tzQW5kUmVqZWN0aW9ucyAobm9kZTppbnRlcm5hbC9wcm9jZXNzL3Rhc2tfcXVldWVzOjgzOjIxKSB7XG5cdFx0XHR9XG5cdFx0XHRlcnJvciBDb21tYW5kIGZhaWxlZCB3aXRoIGV4aXQgY29kZSAxLlxuXHRcdFx0aW5mbyBWaXNpdCBodHRwczovL3lhcm5wa2cuY29tL2VuL2RvY3MvY2xpL3J1biBmb3IgZG9jdW1lbnRhdGlvbiBhYm91dCB0aGlzIGNvbW1hbmQuYDtcblx0XHRcdFx0Y29uc3QgYWN0aW9uT3B0aW9ucyA9IFt7XG5cdFx0XHRcdFx0aWQ6ICdGcmVlIFBvcnQnLFxuXHRcdFx0XHRcdGxhYmVsOiAnRnJlZSBwb3J0IDMwMDAnLFxuXHRcdFx0XHRcdHJ1bjogdHJ1ZSxcblx0XHRcdFx0XHR0b29sdGlwOiAnRnJlZSBwb3J0IDMwMDAnLFxuXHRcdFx0XHRcdGVuYWJsZWQ6IHRydWVcblx0XHRcdFx0fV07XG5cdFx0XHRcdHNldHVwKCgpID0+IHtcblx0XHRcdFx0XHRjb25zdCBjb21tYW5kID0gZnJlZVBvcnQoKCkgPT4gUHJvbWlzZS5yZXNvbHZlKCkpO1xuXHRcdFx0XHRcdGV4cGVjdGVkTWFwLnNldChjb21tYW5kLmNvbW1hbmRMaW5lTWF0Y2hlci50b1N0cmluZygpLCBbY29tbWFuZF0pO1xuXHRcdFx0XHRcdHF1aWNrRml4QWRkb24ucmVnaXN0ZXJDb21tYW5kRmluaXNoZWRMaXN0ZW5lcihjb21tYW5kKTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHN1aXRlKCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuJywgKCkgPT4ge1xuXHRcdFx0XHRcdHRlc3QoJ291dHB1dCBkb2VzIG5vdCBtYXRjaCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdHN0cmljdEVxdWFsKChhd2FpdCBnZXRRdWlja0ZpeGVzRm9yQ29tbWFuZChbXSwgdGVybWluYWwsIGNyZWF0ZUNvbW1hbmQocG9ydENvbW1hbmQsIGBpbnZhbGlkIG91dHB1dGAsIEZyZWVQb3J0T3V0cHV0UmVnZXgpLCBleHBlY3RlZE1hcCwgY29tbWFuZFNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIGxhYmVsU2VydmljZSkpLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGVzdCgncmV0dXJucyBhY3Rpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGFzc2VydE1hdGNoT3B0aW9ucygoYXdhaXQgZ2V0UXVpY2tGaXhlc0ZvckNvbW1hbmQoW10sIHRlcm1pbmFsLCBjcmVhdGVDb21tYW5kKHBvcnRDb21tYW5kLCBvdXRwdXQsIEZyZWVQb3J0T3V0cHV0UmVnZXgpLCBleHBlY3RlZE1hcCwgY29tbWFuZFNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIGxhYmVsU2VydmljZSkpLCBhY3Rpb25PcHRpb25zKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRzdWl0ZSgnZ2l0UHVzaFNldFVwc3RyZWFtJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRNYXAgPSBuZXcgTWFwKCk7XG5cdFx0XHRjb25zdCBjb21tYW5kID0gYGdpdCBwdXNoYDtcblx0XHRcdGNvbnN0IG91dHB1dCA9IGBmYXRhbDogVGhlIGN1cnJlbnQgYnJhbmNoIHRlc3QyMiBoYXMgbm8gdXBzdHJlYW0gYnJhbmNoLlxuXHRcdFx0VG8gcHVzaCB0aGUgY3VycmVudCBicmFuY2ggYW5kIHNldCB0aGUgcmVtb3RlIGFzIHVwc3RyZWFtLCB1c2VcblxuXHRcdFx0XHRnaXQgcHVzaCAtLXNldC11cHN0cmVhbSBvcmlnaW4gdGVzdDIyYDtcblx0XHRcdGNvbnN0IGV4aXRDb2RlID0gMTI4O1xuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IFt7XG5cdFx0XHRcdGlkOiAnR2l0IFB1c2ggU2V0IFVwc3RyZWFtJyxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0bGFiZWw6ICdSdW46IGdpdCBwdXNoIC0tc2V0LXVwc3RyZWFtIG9yaWdpbiB0ZXN0MjInLFxuXHRcdFx0XHR0b29sdGlwOiAnUnVuOiBnaXQgcHVzaCAtLXNldC11cHN0cmVhbSBvcmlnaW4gdGVzdDIyJyxcblx0XHRcdFx0Y29tbWFuZDogJ2dpdCBwdXNoIC0tc2V0LXVwc3RyZWFtIG9yaWdpbiB0ZXN0MjInXG5cdFx0XHR9XTtcblx0XHRcdHNldHVwKCgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29tbWFuZCA9IGdpdFB1c2hTZXRVcHN0cmVhbSgpO1xuXHRcdFx0XHRleHBlY3RlZE1hcC5zZXQoY29tbWFuZC5jb21tYW5kTGluZU1hdGNoZXIudG9TdHJpbmcoKSwgW2NvbW1hbmRdKTtcblx0XHRcdFx0cXVpY2tGaXhBZGRvbi5yZWdpc3RlckNvbW1hbmRGaW5pc2hlZExpc3RlbmVyKGNvbW1hbmQpO1xuXHRcdFx0fSk7XG5cdFx0XHRzdWl0ZSgncmV0dXJucyB1bmRlZmluZWQgd2hlbicsICgpID0+IHtcblx0XHRcdFx0dGVzdCgnb3V0cHV0IGRvZXMgbm90IG1hdGNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdHN0cmljdEVxdWFsKChhd2FpdCBnZXRRdWlja0ZpeGVzRm9yQ29tbWFuZChbXSwgdGVybWluYWwsIGNyZWF0ZUNvbW1hbmQoY29tbWFuZCwgYGludmFsaWQgb3V0cHV0YCwgR2l0UHVzaE91dHB1dFJlZ2V4LCBleGl0Q29kZSksIGV4cGVjdGVkTWFwLCBjb21tYW5kU2VydmljZSwgb3BlbmVyU2VydmljZSwgbGFiZWxTZXJ2aWNlKSksIHVuZGVmaW5lZCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0ZXN0KCdjb21tYW5kIGRvZXMgbm90IG1hdGNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdHN0cmljdEVxdWFsKChhd2FpdCBnZXRRdWlja0ZpeGVzRm9yQ29tbWFuZChbXSwgdGVybWluYWwsIGNyZWF0ZUNvbW1hbmQoYGdpdCBzdGF0dXNgLCBvdXRwdXQsIEdpdFB1c2hPdXRwdXRSZWdleCwgZXhpdENvZGUpLCBleHBlY3RlZE1hcCwgY29tbWFuZFNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIGxhYmVsU2VydmljZSkpLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdFx0c3VpdGUoJ3JldHVybnMgYWN0aW9ucyB3aGVuJywgKCkgPT4ge1xuXHRcdFx0XHR0ZXN0KCdleHBlY3RlZCB1bml4IGV4aXQgY29kZScsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRhc3NlcnRNYXRjaE9wdGlvbnMoKGF3YWl0IGdldFF1aWNrRml4ZXNGb3JDb21tYW5kKFtdLCB0ZXJtaW5hbCwgY3JlYXRlQ29tbWFuZChjb21tYW5kLCBvdXRwdXQsIEdpdFB1c2hPdXRwdXRSZWdleCwgZXhpdENvZGUpLCBleHBlY3RlZE1hcCwgY29tbWFuZFNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIGxhYmVsU2VydmljZSkpLCBhY3Rpb25zKTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRlc3QoJ21hdGNoaW5nIGV4aXQgc3RhdHVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGFzc2VydE1hdGNoT3B0aW9ucygoYXdhaXQgZ2V0UXVpY2tGaXhlc0ZvckNvbW1hbmQoW10sIHRlcm1pbmFsLCBjcmVhdGVDb21tYW5kKGNvbW1hbmQsIG91dHB1dCwgR2l0UHVzaE91dHB1dFJlZ2V4LCAyKSwgZXhwZWN0ZWRNYXAsIGNvbW1hbmRTZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCBsYWJlbFNlcnZpY2UpKSwgYWN0aW9ucyk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdFx0c3VpdGUoJ2dpdENyZWF0ZVByJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRNYXAgPSBuZXcgTWFwKCk7XG5cdFx0XHRjb25zdCBjb21tYW5kID0gYGdpdCBwdXNoYDtcblx0XHRcdGNvbnN0IG91dHB1dCA9IGBUb3RhbCAwIChkZWx0YSAwKSwgcmV1c2VkIDAgKGRlbHRhIDApLCBwYWNrLXJldXNlZCAwXG5cdFx0XHRyZW1vdGU6XG5cdFx0XHRyZW1vdGU6IENyZWF0ZSBhIHB1bGwgcmVxdWVzdCBmb3IgJ3Rlc3QyMicgb24gR2l0SHViIGJ5IHZpc2l0aW5nOlxuXHRcdFx0cmVtb3RlOiAgICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9tZWdhbnJvZ2dlL3h0ZXJtLmpzL3B1bGwvbmV3L3Rlc3QyMlxuXHRcdFx0cmVtb3RlOlxuXHRcdFx0VG8gaHR0cHM6Ly9naXRodWIuY29tL21lZ2Fucm9nZ2UveHRlcm0uanNcblx0XHRcdCAqIFtuZXcgYnJhbmNoXSAgICAgICAgdGVzdDIyIC0+IHRlc3QyMlxuXHRcdFx0QnJhbmNoICd0ZXN0MjInIHNldCB1cCB0byB0cmFjayByZW1vdGUgYnJhbmNoICd0ZXN0MjInIGZyb20gJ29yaWdpbicuIGA7XG5cdFx0XHRjb25zdCBleGl0Q29kZSA9IDA7XG5cdFx0XHRjb25zdCBhY3Rpb25zID0gW3tcblx0XHRcdFx0aWQ6ICdHaXQgQ3JlYXRlIFByJyxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0bGFiZWw6ICdPcGVuOiBodHRwczovL2dpdGh1Yi5jb20vbWVnYW5yb2dnZS94dGVybS5qcy9wdWxsL25ldy90ZXN0MjInLFxuXHRcdFx0XHR0b29sdGlwOiAnT3BlbjogaHR0cHM6Ly9naXRodWIuY29tL21lZ2Fucm9nZ2UveHRlcm0uanMvcHVsbC9uZXcvdGVzdDIyJyxcblx0XHRcdFx0dXJpOiBVUkkucGFyc2UoJ2h0dHBzOi8vZ2l0aHViLmNvbS9tZWdhbnJvZ2dlL3h0ZXJtLmpzL3B1bGwvbmV3L3Rlc3QyMicpXG5cdFx0XHR9XTtcblx0XHRcdHNldHVwKCgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29tbWFuZCA9IGdpdENyZWF0ZVByKCk7XG5cdFx0XHRcdGV4cGVjdGVkTWFwLnNldChjb21tYW5kLmNvbW1hbmRMaW5lTWF0Y2hlci50b1N0cmluZygpLCBbY29tbWFuZF0pO1xuXHRcdFx0XHRxdWlja0ZpeEFkZG9uLnJlZ2lzdGVyQ29tbWFuZEZpbmlzaGVkTGlzdGVuZXIoY29tbWFuZCk7XG5cdFx0XHR9KTtcblx0XHRcdHN1aXRlKCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuJywgKCkgPT4ge1xuXHRcdFx0XHR0ZXN0KCdvdXRwdXQgZG9lcyBub3QgbWF0Y2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0c3RyaWN0RXF1YWwoKGF3YWl0IGdldFF1aWNrRml4ZXNGb3JDb21tYW5kKFtdLCB0ZXJtaW5hbCwgY3JlYXRlQ29tbWFuZChjb21tYW5kLCBgaW52YWxpZCBvdXRwdXRgLCBHaXRDcmVhdGVQck91dHB1dFJlZ2V4LCBleGl0Q29kZSksIGV4cGVjdGVkTWFwLCBjb21tYW5kU2VydmljZSwgb3BlbmVyU2VydmljZSwgbGFiZWxTZXJ2aWNlKSksIHVuZGVmaW5lZCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0ZXN0KCdjb21tYW5kIGRvZXMgbm90IG1hdGNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdHN0cmljdEVxdWFsKChhd2FpdCBnZXRRdWlja0ZpeGVzRm9yQ29tbWFuZChbXSwgdGVybWluYWwsIGNyZWF0ZUNvbW1hbmQoYGdpdCBzdGF0dXNgLCBvdXRwdXQsIEdpdENyZWF0ZVByT3V0cHV0UmVnZXgsIGV4aXRDb2RlKSwgZXhwZWN0ZWRNYXAsIGNvbW1hbmRTZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCBsYWJlbFNlcnZpY2UpKSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRlc3QoJ2ZhaWx1cmUgZXhpdCBzdGF0dXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0c3RyaWN0RXF1YWwoKGF3YWl0IGdldFF1aWNrRml4ZXNGb3JDb21tYW5kKFtdLCB0ZXJtaW5hbCwgY3JlYXRlQ29tbWFuZChjb21tYW5kLCBvdXRwdXQsIEdpdENyZWF0ZVByT3V0cHV0UmVnZXgsIDIpLCBleHBlY3RlZE1hcCwgY29tbWFuZFNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIGxhYmVsU2VydmljZSkpLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdFx0c3VpdGUoJ3JldHVybnMgYWN0aW9ucyB3aGVuJywgKCkgPT4ge1xuXHRcdFx0XHR0ZXN0KCdleHBlY3RlZCB1bml4IGV4aXQgY29kZScsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRhc3NlcnRNYXRjaE9wdGlvbnMoKGF3YWl0IGdldFF1aWNrRml4ZXNGb3JDb21tYW5kKFtdLCB0ZXJtaW5hbCwgY3JlYXRlQ29tbWFuZChjb21tYW5kLCBvdXRwdXQsIEdpdENyZWF0ZVByT3V0cHV0UmVnZXgsIGV4aXRDb2RlKSwgZXhwZWN0ZWRNYXAsIGNvbW1hbmRTZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCBsYWJlbFNlcnZpY2UpKSwgYWN0aW9ucyk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXHRzdWl0ZSgnZ2l0UHVzaCAtIG11bHRpcGxlIHByb3ZpZGVycycsICgpID0+IHtcblx0XHRjb25zdCBleHBlY3RlZE1hcCA9IG5ldyBNYXAoKTtcblx0XHRjb25zdCBjb21tYW5kID0gYGdpdCBwdXNoYDtcblx0XHRjb25zdCBvdXRwdXQgPSBgZmF0YWw6IFRoZSBjdXJyZW50IGJyYW5jaCB0ZXN0MjIgaGFzIG5vIHVwc3RyZWFtIGJyYW5jaC5cblx0XHRUbyBwdXNoIHRoZSBjdXJyZW50IGJyYW5jaCBhbmQgc2V0IHRoZSByZW1vdGUgYXMgdXBzdHJlYW0sIHVzZVxuXG5cdFx0XHRnaXQgcHVzaCAtLXNldC11cHN0cmVhbSBvcmlnaW4gdGVzdDIyYDtcblx0XHRjb25zdCBleGl0Q29kZSA9IDEyODtcblx0XHRjb25zdCBhY3Rpb25zID0gW3tcblx0XHRcdGlkOiAnR2l0IFB1c2ggU2V0IFVwc3RyZWFtJyxcblx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRsYWJlbDogJ1J1bjogZ2l0IHB1c2ggLS1zZXQtdXBzdHJlYW0gb3JpZ2luIHRlc3QyMicsXG5cdFx0XHR0b29sdGlwOiAnUnVuOiBnaXQgcHVzaCAtLXNldC11cHN0cmVhbSBvcmlnaW4gdGVzdDIyJyxcblx0XHRcdGNvbW1hbmQ6ICdnaXQgcHVzaCAtLXNldC11cHN0cmVhbSBvcmlnaW4gdGVzdDIyJ1xuXHRcdH1dO1xuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdGNvbnN0IHB1c2hDb21tYW5kID0gZ2l0UHVzaFNldFVwc3RyZWFtKCk7XG5cdFx0XHRjb25zdCBwckNvbW1hbmQgPSBnaXRDcmVhdGVQcigpO1xuXHRcdFx0cXVpY2tGaXhBZGRvbi5yZWdpc3RlckNvbW1hbmRGaW5pc2hlZExpc3RlbmVyKHByQ29tbWFuZCk7XG5cdFx0XHRleHBlY3RlZE1hcC5zZXQocHVzaENvbW1hbmQuY29tbWFuZExpbmVNYXRjaGVyLnRvU3RyaW5nKCksIFtwdXNoQ29tbWFuZCwgcHJDb21tYW5kXSk7XG5cdFx0fSk7XG5cdFx0c3VpdGUoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4nLCAoKSA9PiB7XG5cdFx0XHR0ZXN0KCdvdXRwdXQgZG9lcyBub3QgbWF0Y2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHN0cmljdEVxdWFsKChhd2FpdCBnZXRRdWlja0ZpeGVzRm9yQ29tbWFuZChbXSwgdGVybWluYWwsIGNyZWF0ZUNvbW1hbmQoY29tbWFuZCwgYGludmFsaWQgb3V0cHV0YCwgR2l0UHVzaE91dHB1dFJlZ2V4LCBleGl0Q29kZSksIGV4cGVjdGVkTWFwLCBjb21tYW5kU2VydmljZSwgb3BlbmVyU2VydmljZSwgbGFiZWxTZXJ2aWNlKSksIHVuZGVmaW5lZCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2NvbW1hbmQgZG9lcyBub3QgbWF0Y2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHN0cmljdEVxdWFsKChhd2FpdCBnZXRRdWlja0ZpeGVzRm9yQ29tbWFuZChbXSwgdGVybWluYWwsIGNyZWF0ZUNvbW1hbmQoYGdpdCBzdGF0dXNgLCBvdXRwdXQsIEdpdFB1c2hPdXRwdXRSZWdleCwgZXhpdENvZGUpLCBleHBlY3RlZE1hcCwgY29tbWFuZFNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIGxhYmVsU2VydmljZSkpLCB1bmRlZmluZWQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdFx0c3VpdGUoJ3JldHVybnMgYWN0aW9ucyB3aGVuJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgnZXhwZWN0ZWQgdW5peCBleGl0IGNvZGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGFzc2VydE1hdGNoT3B0aW9ucygoYXdhaXQgZ2V0UXVpY2tGaXhlc0ZvckNvbW1hbmQoW10sIHRlcm1pbmFsLCBjcmVhdGVDb21tYW5kKGNvbW1hbmQsIG91dHB1dCwgR2l0UHVzaE91dHB1dFJlZ2V4LCBleGl0Q29kZSksIGV4cGVjdGVkTWFwLCBjb21tYW5kU2VydmljZSwgb3BlbmVyU2VydmljZSwgbGFiZWxTZXJ2aWNlKSksIGFjdGlvbnMpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdtYXRjaGluZyBleGl0IHN0YXR1cycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0YXNzZXJ0TWF0Y2hPcHRpb25zKChhd2FpdCBnZXRRdWlja0ZpeGVzRm9yQ29tbWFuZChbXSwgdGVybWluYWwsIGNyZWF0ZUNvbW1hbmQoY29tbWFuZCwgb3V0cHV0LCBHaXRQdXNoT3V0cHV0UmVnZXgsIDIpLCBleHBlY3RlZE1hcCwgY29tbWFuZFNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIGxhYmVsU2VydmljZSkpLCBhY3Rpb25zKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblx0c3VpdGUoJ3B3c2ggZmVlZGJhY2sgcHJvdmlkZXJzJywgKCkgPT4ge1xuXHRcdHN1aXRlKCdHZW5lcmFsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRNYXAgPSBuZXcgTWFwKCk7XG5cdFx0XHRjb25zdCBjb21tYW5kID0gYG5vdCBpbXBvcnRhbnRgO1xuXHRcdFx0Y29uc3Qgb3V0cHV0ID0gW1xuXHRcdFx0XHRgLi4uYCxcblx0XHRcdFx0YGAsXG5cdFx0XHRcdGBTdWdnZXN0aW9uIFtHZW5lcmFsXTpgLFxuXHRcdFx0XHRgICBUaGUgbW9zdCBzaW1pbGFyIGNvbW1hbmRzIGFyZTogcHl0aG9uMywgcHl0aG9uM20sIHBhbW9uLCBweXRob24zLjYsIHJ0bW9uLCBlY2hvLCBwdXNoZCwgZXRzbiwgcHdzaCwgcHdjb252LmAsXG5cdFx0XHRcdGBgLFxuXHRcdFx0XHRgU3VnZ2VzdGlvbiBbY21kLW5vdC1mb3VuZF06YCxcblx0XHRcdFx0YCAgQ29tbWFuZCAncHl0aG9uJyBub3QgZm91bmQsIGJ1dCBjYW4gYmUgaW5zdGFsbGVkIHdpdGg6YCxcblx0XHRcdFx0YCAgc3VkbyBhcHQgaW5zdGFsbCBweXRob24zYCxcblx0XHRcdFx0YCAgc3VkbyBhcHQgaW5zdGFsbCBweXRob25gLFxuXHRcdFx0XHRgICBzdWRvIGFwdCBpbnN0YWxsIHB5dGhvbi1taW5pbWFsYCxcblx0XHRcdFx0YCAgWW91IGFsc28gaGF2ZSBweXRob24zIGluc3RhbGxlZCwgeW91IGNhbiBydW4gJ3B5dGhvbjMnIGluc3RlYWQuJ2AsXG5cdFx0XHRcdGBgLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IGV4aXRDb2RlID0gMTI4O1xuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IFtcblx0XHRcdFx0J3B5dGhvbjMnLFxuXHRcdFx0XHQncHl0aG9uM20nLFxuXHRcdFx0XHQncGFtb24nLFxuXHRcdFx0XHQncHl0aG9uMy42Jyxcblx0XHRcdFx0J3J0bW9uJyxcblx0XHRcdFx0J2VjaG8nLFxuXHRcdFx0XHQncHVzaGQnLFxuXHRcdFx0XHQnZXRzbicsXG5cdFx0XHRcdCdwd3NoJyxcblx0XHRcdFx0J3B3Y29udicsXG5cdFx0XHRdLm1hcChjb21tYW5kID0+IHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRpZDogJ1B3c2ggR2VuZXJhbCBFcnJvcicsXG5cdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0XHRsYWJlbDogYFJ1bjogJHtjb21tYW5kfWAsXG5cdFx0XHRcdFx0dG9vbHRpcDogYFJ1bjogJHtjb21tYW5kfWAsXG5cdFx0XHRcdFx0Y29tbWFuZDogY29tbWFuZFxuXHRcdFx0XHR9O1xuXHRcdFx0fSk7XG5cdFx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHB1c2hDb21tYW5kID0gcHdzaEdlbmVyYWxFcnJvcigpO1xuXHRcdFx0XHRxdWlja0ZpeEFkZG9uLnJlZ2lzdGVyQ29tbWFuZEZpbmlzaGVkTGlzdGVuZXIocHVzaENvbW1hbmQpO1xuXHRcdFx0XHRleHBlY3RlZE1hcC5zZXQocHVzaENvbW1hbmQuY29tbWFuZExpbmVNYXRjaGVyLnRvU3RyaW5nKCksIFtwdXNoQ29tbWFuZF0pO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIG91dHB1dCBkb2VzIG5vdCBtYXRjaCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0c3RyaWN0RXF1YWwoKGF3YWl0IGdldFF1aWNrRml4ZXNGb3JDb21tYW5kKFtdLCB0ZXJtaW5hbCwgY3JlYXRlQ29tbWFuZChjb21tYW5kLCBgaW52YWxpZCBvdXRwdXRgLCBQd3NoR2VuZXJhbEVycm9yT3V0cHV0UmVnZXgsIGV4aXRDb2RlKSwgZXhwZWN0ZWRNYXAsIGNvbW1hbmRTZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCBsYWJlbFNlcnZpY2UpKSwgdW5kZWZpbmVkKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgncmV0dXJucyBhY3Rpb25zIHdoZW4gb3V0cHV0IG1hdGNoZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGFzc2VydE1hdGNoT3B0aW9ucygoYXdhaXQgZ2V0UXVpY2tGaXhlc0ZvckNvbW1hbmQoW10sIHRlcm1pbmFsLCBjcmVhdGVDb21tYW5kKGNvbW1hbmQsIG91dHB1dCwgUHdzaEdlbmVyYWxFcnJvck91dHB1dFJlZ2V4LCBleGl0Q29kZSksIGV4cGVjdGVkTWFwLCBjb21tYW5kU2VydmljZSwgb3BlbmVyU2VydmljZSwgbGFiZWxTZXJ2aWNlKSksIGFjdGlvbnMpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdFx0c3VpdGUoJ1VuaXggY21kLW5vdC1mb3VuZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGV4cGVjdGVkTWFwID0gbmV3IE1hcCgpO1xuXHRcdFx0Y29uc3QgY29tbWFuZCA9IGBub3QgaW1wb3J0YW50YDtcblx0XHRcdGNvbnN0IG91dHB1dCA9IFtcblx0XHRcdFx0YC4uLmAsXG5cdFx0XHRcdGBgLFxuXHRcdFx0XHRgU3VnZ2VzdGlvbiBbR2VuZXJhbF1gLFxuXHRcdFx0XHRgICBUaGUgbW9zdCBzaW1pbGFyIGNvbW1hbmRzIGFyZTogcHl0aG9uMywgcHl0aG9uM20sIHBhbW9uLCBweXRob24zLjYsIHJ0bW9uLCBlY2hvLCBwdXNoZCwgZXRzbiwgcHdzaCwgcHdjb252LmAsXG5cdFx0XHRcdGBgLFxuXHRcdFx0XHRgU3VnZ2VzdGlvbiBbY21kLW5vdC1mb3VuZF06YCxcblx0XHRcdFx0YCAgQ29tbWFuZCAncHl0aG9uJyBub3QgZm91bmQsIGJ1dCBjYW4gYmUgaW5zdGFsbGVkIHdpdGg6YCxcblx0XHRcdFx0YCAgc3VkbyBhcHQgaW5zdGFsbCBweXRob24zYCxcblx0XHRcdFx0YCAgc3VkbyBhcHQgaW5zdGFsbCBweXRob25gLFxuXHRcdFx0XHRgICBzdWRvIGFwdCBpbnN0YWxsIHB5dGhvbi1taW5pbWFsYCxcblx0XHRcdFx0YCAgWW91IGFsc28gaGF2ZSBweXRob24zIGluc3RhbGxlZCwgeW91IGNhbiBydW4gJ3B5dGhvbjMnIGluc3RlYWQuJ2AsXG5cdFx0XHRcdGBgLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IGV4aXRDb2RlID0gMTI4O1xuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IFtcblx0XHRcdFx0J3N1ZG8gYXB0IGluc3RhbGwgcHl0aG9uMycsXG5cdFx0XHRcdCdzdWRvIGFwdCBpbnN0YWxsIHB5dGhvbicsXG5cdFx0XHRcdCdzdWRvIGFwdCBpbnN0YWxsIHB5dGhvbi1taW5pbWFsJyxcblx0XHRcdFx0J3B5dGhvbjMnLFxuXHRcdFx0XS5tYXAoY29tbWFuZCA9PiB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0aWQ6ICdQd3NoIFVuaXggQ29tbWFuZCBOb3QgRm91bmQgRXJyb3InLFxuXHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdFx0bGFiZWw6IGBSdW46ICR7Y29tbWFuZH1gLFxuXHRcdFx0XHRcdHRvb2x0aXA6IGBSdW46ICR7Y29tbWFuZH1gLFxuXHRcdFx0XHRcdGNvbW1hbmQ6IGNvbW1hbmRcblx0XHRcdFx0fTtcblx0XHRcdH0pO1xuXHRcdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBwdXNoQ29tbWFuZCA9IHB3c2hVbml4Q29tbWFuZE5vdEZvdW5kRXJyb3IoKTtcblx0XHRcdFx0cXVpY2tGaXhBZGRvbi5yZWdpc3RlckNvbW1hbmRGaW5pc2hlZExpc3RlbmVyKHB1c2hDb21tYW5kKTtcblx0XHRcdFx0ZXhwZWN0ZWRNYXAuc2V0KHB1c2hDb21tYW5kLmNvbW1hbmRMaW5lTWF0Y2hlci50b1N0cmluZygpLCBbcHVzaENvbW1hbmRdKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgd2hlbiBvdXRwdXQgZG9lcyBub3QgbWF0Y2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHN0cmljdEVxdWFsKChhd2FpdCBnZXRRdWlja0ZpeGVzRm9yQ29tbWFuZChbXSwgdGVybWluYWwsIGNyZWF0ZUNvbW1hbmQoY29tbWFuZCwgYGludmFsaWQgb3V0cHV0YCwgUHdzaFVuaXhDb21tYW5kTm90Rm91bmRFcnJvck91dHB1dFJlZ2V4LCBleGl0Q29kZSksIGV4cGVjdGVkTWFwLCBjb21tYW5kU2VydmljZSwgb3BlbmVyU2VydmljZSwgbGFiZWxTZXJ2aWNlKSksIHVuZGVmaW5lZCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ3JldHVybnMgYWN0aW9ucyB3aGVuIG91dHB1dCBtYXRjaGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRhc3NlcnRNYXRjaE9wdGlvbnMoKGF3YWl0IGdldFF1aWNrRml4ZXNGb3JDb21tYW5kKFtdLCB0ZXJtaW5hbCwgY3JlYXRlQ29tbWFuZChjb21tYW5kLCBvdXRwdXQsIFB3c2hVbml4Q29tbWFuZE5vdEZvdW5kRXJyb3JPdXRwdXRSZWdleCwgZXhpdENvZGUpLCBleHBlY3RlZE1hcCwgY29tbWFuZFNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIGxhYmVsU2VydmljZSkpLCBhY3Rpb25zKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5mdW5jdGlvbiBjcmVhdGVDb21tYW5kKGNvbW1hbmQ6IHN0cmluZywgb3V0cHV0OiBzdHJpbmcsIG91dHB1dE1hdGNoZXI/OiBSZWdFeHAgfCBzdHJpbmcsIGV4aXRDb2RlPzogbnVtYmVyLCBvdXRwdXRMaW5lcz86IHN0cmluZ1tdKTogSVRlcm1pbmFsQ29tbWFuZCB7XG5cdHJldHVybiB7XG5cdFx0Y3dkOiAnJyxcblx0XHRjb21tYW5kU3RhcnRMaW5lQ29udGVudDogJycsXG5cdFx0bWFya1Byb3BlcnRpZXM6IHt9LFxuXHRcdGV4ZWN1dGVkWDogdW5kZWZpbmVkLFxuXHRcdHN0YXJ0WDogdW5kZWZpbmVkLFxuXHRcdGNvbW1hbmQsXG5cdFx0aXNUcnVzdGVkOiB0cnVlLFxuXHRcdGV4aXRDb2RlLFxuXHRcdGdldE91dHB1dDogKCkgPT4geyByZXR1cm4gb3V0cHV0OyB9LFxuXHRcdGdldE91dHB1dE1hdGNoOiAoX21hdGNoZXI6IElUZXJtaW5hbE91dHB1dE1hdGNoZXIpID0+IHtcblx0XHRcdGlmIChvdXRwdXRNYXRjaGVyKSB7XG5cdFx0XHRcdGNvbnN0IHJlZ2V4TWF0Y2ggPSBvdXRwdXQubWF0Y2gob3V0cHV0TWF0Y2hlcikgPz8gdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAocmVnZXhNYXRjaCkge1xuXHRcdFx0XHRcdHJldHVybiBvdXRwdXRMaW5lcyA/IHsgcmVnZXhNYXRjaCwgb3V0cHV0TGluZXMgfSA6IHsgcmVnZXhNYXRjaCwgb3V0cHV0TGluZXM6IFtdIH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSxcblx0XHR0aW1lc3RhbXA6IERhdGUubm93KCksXG5cdFx0aGFzT3V0cHV0OiAoKSA9PiAhIW91dHB1dFxuXHR9IGFzIElUZXJtaW5hbENvbW1hbmQ7XG59XG5cbnR5cGUgVGVzdEFjdGlvbiA9IFBpY2s8SUFjdGlvbiwgJ2lkJyB8ICdsYWJlbCcgfCAndG9vbHRpcCcgfCAnZW5hYmxlZCc+ICYgeyBjb21tYW5kPzogc3RyaW5nOyB1cmk/OiBVUkkgfTtcbmZ1bmN0aW9uIGFzc2VydE1hdGNoT3B0aW9ucyhhY3R1YWw6IFRlc3RBY3Rpb25bXSB8IHVuZGVmaW5lZCwgZXhwZWN0ZWQ6IFRlc3RBY3Rpb25bXSk6IHZvaWQge1xuXHRzdHJpY3RFcXVhbChhY3R1YWw/Lmxlbmd0aCwgZXhwZWN0ZWQubGVuZ3RoKTtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBleHBlY3RlZC5sZW5ndGg7IGkrKykge1xuXHRcdGNvbnN0IGV4cGVjdGVkSXRlbSA9IGV4cGVjdGVkW2ldO1xuXHRcdGNvbnN0IGFjdHVhbEl0ZW06IGFueSA9IGFjdHVhbFtpXTtcblx0XHRzdHJpY3RFcXVhbChhY3R1YWxJdGVtLmlkLCBleHBlY3RlZEl0ZW0uaWQsIGBJRGApO1xuXHRcdHN0cmljdEVxdWFsKGFjdHVhbEl0ZW0uZW5hYmxlZCwgZXhwZWN0ZWRJdGVtLmVuYWJsZWQsIGBlbmFibGVkYCk7XG5cdFx0c3RyaWN0RXF1YWwoYWN0dWFsSXRlbS5sYWJlbCwgZXhwZWN0ZWRJdGVtLmxhYmVsLCBgbGFiZWxgKTtcblx0XHRzdHJpY3RFcXVhbChhY3R1YWxJdGVtLnRvb2x0aXAsIGV4cGVjdGVkSXRlbS50b29sdGlwLCBgdG9vbHRpcGApO1xuXHRcdGlmIChleHBlY3RlZEl0ZW0uY29tbWFuZCkge1xuXHRcdFx0c3RyaWN0RXF1YWwoYWN0dWFsSXRlbS5jb21tYW5kLCBleHBlY3RlZEl0ZW0uY29tbWFuZCk7XG5cdFx0fVxuXHRcdGlmIChleHBlY3RlZEl0ZW0udXJpKSB7XG5cdFx0XHRzdHJpY3RFcXVhbChhY3R1YWxJdGVtLnVyaSEudG9TdHJpbmcoKSwgZXhwZWN0ZWRJdGVtLnVyaS50b1N0cmluZygpKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsMkJBQTJCO0FBRXBDLFNBQVMsYUFBYTtBQUN0QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxhQUFhLHNCQUFzQjtBQUM1QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHVCQUF1QjtBQUNoQyxTQUEyQiwwQkFBMEI7QUFDckQsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUywrQkFBK0I7QUFFeEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx5QkFBeUIsNkJBQTZCO0FBQy9ELFNBQVMsVUFBVSxxQkFBcUIsYUFBYSx3QkFBd0Isb0JB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QUFRLEdBQUcsYUFBYSxnQkFBZ0IsZUFBZSxZQUFZLEdBQUksT0FBTztBQUFBLE1BQ3ZOLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDO0FBRUQsU0FBUyxjQUFjLFNBQWlCLFFBQWdCLGVBQWlDLFVBQW1CLGFBQTBDO0FBQ3JKLFNBQU87QUFBQSxJQUNOLEtBQUs7QUFBQSxJQUNMLHlCQUF5QjtBQUFBLElBQ3pCLGdCQUFnQixDQUFDO0FBQUEsSUFDakIsV0FBVztBQUFBLElBQ1gsUUFBUTtBQUFBLElBQ1I7QUFBQSxJQUNBLFdBQVc7QUFBQSxJQUNYO0FBQUEsSUFDQSxXQUFXLE1BQU07QUFBRSxhQUFPO0FBQUEsSUFBUTtBQUFBLElBQ2xDLGdCQUFnQixDQUFDLGFBQXFDO0FBQ3JELFVBQUksZUFBZTtBQUNsQixjQUFNLGFBQWEsT0FBTyxNQUFNLGFBQWEsS0FBSztBQUNsRCxZQUFJLFlBQVk7QUFDZixpQkFBTyxjQUFjLEVBQUUsWUFBWSxZQUFZLElBQUksRUFBRSxZQUFZLGFBQWEsQ0FBQyxFQUFFO0FBQUEsUUFDbEY7QUFBQSxNQUNEO0FBQ0EsYUFBTztBQUFBLElBQ1I7QUFBQSxJQUNBLFdBQVcsS0FBSyxJQUFJO0FBQUEsSUFDcEIsV0FBVyxNQUFNLENBQUMsQ0FBQztBQUFBLEVBQ3BCO0FBQ0Q7QUFHQSxTQUFTLG1CQUFtQixRQUFrQyxVQUE4QjtBQUMzRixjQUFZLFFBQVEsUUFBUSxTQUFTLE1BQU07QUFDM0MsV0FBUyxJQUFJLEdBQUcsSUFBSSxTQUFTLFFBQVEsS0FBSztBQUN6QyxVQUFNLGVBQWUsU0FBUyxDQUFDO0FBQy9CLFVBQU0sYUFBa0IsT0FBTyxDQUFDO0FBQ2hDLGdCQUFZLFdBQVcsSUFBSSxhQUFhLElBQUksSUFBSTtBQUNoRCxnQkFBWSxXQUFXLFNBQVMsYUFBYSxTQUFTLFNBQVM7QUFDL0QsZ0JBQVksV0FBVyxPQUFPLGFBQWEsT0FBTyxPQUFPO0FBQ3pELGdCQUFZLFdBQVcsU0FBUyxhQUFhLFNBQVMsU0FBUztBQUMvRCxRQUFJLGFBQWEsU0FBUztBQUN6QixrQkFBWSxXQUFXLFNBQVMsYUFBYSxPQUFPO0FBQUEsSUFDckQ7QUFDQSxRQUFJLGFBQWEsS0FBSztBQUNyQixrQkFBWSxXQUFXLElBQUssU0FBUyxHQUFHLGFBQWEsSUFBSSxTQUFTLENBQUM7QUFBQSxJQUNwRTtBQUFBLEVBQ0Q7QUFDRDsiLAogICJuYW1lcyI6IFsiY29tbWFuZCIsICJhY3Rpb25zIl0KfQo=
