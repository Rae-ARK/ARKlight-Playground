import { deepStrictEqual, ok, strictEqual } from "assert";
import { homedir, userInfo } from "os";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { getShellIntegrationInjection, sanitizeEnvForLogging } from "../../node/terminalEnvironment.js";
import { getWindowsBuildNumberSync } from "../../../../base/node/windowsVersion.js";
const enabledProcessOptions = { shellIntegration: { enabled: true, suggestEnabled: false, nonce: "" }, windowsUseConptyDll: false, environmentVariableCollections: void 0, workspaceFolder: void 0, isScreenReaderOptimized: false };
const disabledProcessOptions = { shellIntegration: { enabled: false, suggestEnabled: false, nonce: "" }, windowsUseConptyDll: false, environmentVariableCollections: void 0, workspaceFolder: void 0, isScreenReaderOptimized: false };
const pwshExe = process.platform === "win32" ? "pwsh.exe" : "pwsh";
const repoRoot = process.platform === "win32" ? process.cwd()[0].toLowerCase() + process.cwd().substring(1) : process.cwd();
const logService = new NullLogService();
const productService = { applicationName: "vscode" };
const defaultEnvironment = {};
function deepStrictEqualIgnoreStableVar(actual, expected) {
  if (actual?.type === "injection" && actual.envMixin) {
    delete actual.envMixin["VSCODE_STABLE"];
  }
  deepStrictEqual(actual, expected);
}
suite("platform - terminalEnvironment", async () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("getShellIntegrationInjection", async () => {
    suite("should not enable", async () => {
      (getWindowsBuildNumberSync() < 18309 ? test.skip : test)("when isFeatureTerminal or when no executable is provided", async () => {
        strictEqual((await getShellIntegrationInjection({ executable: pwshExe, args: ["-l", "-NoLogo"], isFeatureTerminal: true }, enabledProcessOptions, defaultEnvironment, logService, productService, true)).type, "failure");
        strictEqual((await getShellIntegrationInjection({ executable: pwshExe, args: ["-l", "-NoLogo"], isFeatureTerminal: false }, enabledProcessOptions, defaultEnvironment, logService, productService, true)).type, "injection");
      });
    });
    (getWindowsBuildNumberSync() < 18309 ? suite.skip : suite)("pwsh", async () => {
      const expectedPs1 = process.platform === "win32" ? `try { . "${repoRoot}\\out\\vs\\workbench\\contrib\\terminal\\common\\scripts\\shellIntegration.ps1" } catch {}` : `. "${repoRoot}/out/vs/workbench/contrib/terminal/common/scripts/shellIntegration.ps1"`;
      suite("should override args", async () => {
        const enabledExpectedResult = Object.freeze({
          type: "injection",
          newArgs: [
            "-noexit",
            "-command",
            expectedPs1
          ],
          envMixin: {
            VSCODE_A11Y_MODE: "0",
            VSCODE_INJECTION: "1"
          }
        });
        test("when undefined, []", async () => {
          deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: pwshExe, args: [] }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
          deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: pwshExe, args: void 0 }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
        });
        suite("when no logo", async () => {
          test("array - case insensitive", async () => {
            deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: pwshExe, args: ["-NoLogo"] }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
            deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: pwshExe, args: ["-NOLOGO"] }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
            deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: pwshExe, args: ["-nol"] }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
            deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: pwshExe, args: ["-NOL"] }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
          });
          test("string - case insensitive", async () => {
            deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: pwshExe, args: "-NoLogo" }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
            deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: pwshExe, args: "-NOLOGO" }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
            deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: pwshExe, args: "-nol" }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
            deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: pwshExe, args: "-NOL" }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
          });
        });
      });
      suite("should incorporate login arg", async () => {
        const enabledExpectedResult = Object.freeze({
          type: "injection",
          newArgs: [
            "-l",
            "-noexit",
            "-command",
            expectedPs1
          ],
          envMixin: {
            VSCODE_A11Y_MODE: "0",
            VSCODE_INJECTION: "1"
          }
        });
        test("when array contains no logo and login", async () => {
          deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: pwshExe, args: ["-l", "-NoLogo"] }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
        });
        test("when string", async () => {
          deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: pwshExe, args: "-l" }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
        });
      });
      suite("should not modify args", async () => {
        test("when shell integration is disabled", async () => {
          strictEqual((await getShellIntegrationInjection({ executable: pwshExe, args: ["-l"] }, disabledProcessOptions, defaultEnvironment, logService, productService, true)).type, "failure");
          strictEqual((await getShellIntegrationInjection({ executable: pwshExe, args: "-l" }, disabledProcessOptions, defaultEnvironment, logService, productService, true)).type, "failure");
          strictEqual((await getShellIntegrationInjection({ executable: pwshExe, args: void 0 }, disabledProcessOptions, defaultEnvironment, logService, productService, true)).type, "failure");
        });
        test("when using unrecognized arg", async () => {
          strictEqual((await getShellIntegrationInjection({ executable: pwshExe, args: ["-l", "-NoLogo", "-i"] }, disabledProcessOptions, defaultEnvironment, logService, productService, true)).type, "failure");
        });
        test("when using unrecognized arg (string)", async () => {
          strictEqual((await getShellIntegrationInjection({ executable: pwshExe, args: "-i" }, disabledProcessOptions, defaultEnvironment, logService, productService, true)).type, "failure");
        });
      });
    });
    if (process.platform !== "win32") {
      suite("zsh", async () => {
        suite("should override args", async () => {
          const username = userInfo().username;
          const expectedDir = new RegExp(`.+/${username}-vscode-zsh`);
          const customZdotdir = "/custom/zsh/dotdir";
          const expectedDests = [
            new RegExp(`.+\\/${username}-vscode-zsh\\/\\.zshrc`),
            new RegExp(`.+\\/${username}-vscode-zsh\\/\\.zprofile`),
            new RegExp(`.+\\/${username}-vscode-zsh\\/\\.zshenv`),
            new RegExp(`.+\\/${username}-vscode-zsh\\/\\.zlogin`)
          ];
          const expectedSources = [
            /.+\/out\/vs\/workbench\/contrib\/terminal\/common\/scripts\/shellIntegration-rc.zsh/,
            /.+\/out\/vs\/workbench\/contrib\/terminal\/common\/scripts\/shellIntegration-profile.zsh/,
            /.+\/out\/vs\/workbench\/contrib\/terminal\/common\/scripts\/shellIntegration-env.zsh/,
            /.+\/out\/vs\/workbench\/contrib\/terminal\/common\/scripts\/shellIntegration-login.zsh/
          ];
          function assertIsEnabled(result, globalZdotdir = homedir()) {
            strictEqual(Object.keys(result.envMixin).length, 3);
            ok(result.envMixin["ZDOTDIR"]?.match(expectedDir));
            strictEqual(result.envMixin["USER_ZDOTDIR"], globalZdotdir);
            ok(result.envMixin["VSCODE_INJECTION"]?.match("1"));
            strictEqual(result.filesToCopy?.length, 4);
            ok(result.filesToCopy[0].dest.match(expectedDests[0]));
            ok(result.filesToCopy[1].dest.match(expectedDests[1]));
            ok(result.filesToCopy[2].dest.match(expectedDests[2]));
            ok(result.filesToCopy[3].dest.match(expectedDests[3]));
            ok(result.filesToCopy[0].source.match(expectedSources[0]));
            ok(result.filesToCopy[1].source.match(expectedSources[1]));
            ok(result.filesToCopy[2].source.match(expectedSources[2]));
            ok(result.filesToCopy[3].source.match(expectedSources[3]));
          }
          test("when undefined, []", async () => {
            const result1 = await getShellIntegrationInjection({ executable: "zsh", args: [] }, enabledProcessOptions, defaultEnvironment, logService, productService, true);
            deepStrictEqual(result1?.newArgs, ["-i"]);
            assertIsEnabled(result1);
            const result2 = await getShellIntegrationInjection({ executable: "zsh", args: void 0 }, enabledProcessOptions, defaultEnvironment, logService, productService, true);
            deepStrictEqual(result2?.newArgs, ["-i"]);
            assertIsEnabled(result2);
          });
          suite("should incorporate login arg", async () => {
            test("when array", async () => {
              const result = await getShellIntegrationInjection({ executable: "zsh", args: ["-l"] }, enabledProcessOptions, defaultEnvironment, logService, productService, true);
              deepStrictEqual(result?.newArgs, ["-il"]);
              assertIsEnabled(result);
            });
          });
          suite("should not modify args", async () => {
            test("when shell integration is disabled", async () => {
              strictEqual((await getShellIntegrationInjection({ executable: "zsh", args: ["-l"] }, disabledProcessOptions, defaultEnvironment, logService, productService, true)).type, "failure");
              strictEqual((await getShellIntegrationInjection({ executable: "zsh", args: void 0 }, disabledProcessOptions, defaultEnvironment, logService, productService, true)).type, "failure");
            });
            test("when using unrecognized arg", async () => {
              strictEqual((await getShellIntegrationInjection({ executable: "zsh", args: ["-l", "-fake"] }, disabledProcessOptions, defaultEnvironment, logService, productService, true)).type, "failure");
            });
          });
          suite("should incorporate global ZDOTDIR env variable", async () => {
            test("when custom ZDOTDIR", async () => {
              const result1 = await getShellIntegrationInjection({ executable: "zsh", args: [] }, enabledProcessOptions, { ...defaultEnvironment, ZDOTDIR: customZdotdir }, logService, productService, true);
              deepStrictEqual(result1?.newArgs, ["-i"]);
              assertIsEnabled(result1, customZdotdir);
            });
            test("when undefined", async () => {
              const result1 = await getShellIntegrationInjection({ executable: "zsh", args: [] }, enabledProcessOptions, void 0, logService, productService, true);
              deepStrictEqual(result1?.newArgs, ["-i"]);
              assertIsEnabled(result1);
            });
          });
        });
      });
      suite("bash", async () => {
        suite("forceShellIntegration", async () => {
          test("should inject when isFeatureTerminal is true but forceShellIntegration overrides it", async () => {
            strictEqual((await getShellIntegrationInjection({ executable: "bash", args: [], isFeatureTerminal: true, forceShellIntegration: true }, enabledProcessOptions, defaultEnvironment, logService, productService, true)).type, "injection");
          });
          test("should not inject when isFeatureTerminal is true and forceShellIntegration is false", async () => {
            strictEqual((await getShellIntegrationInjection({ executable: "bash", args: [], isFeatureTerminal: true, forceShellIntegration: false }, enabledProcessOptions, defaultEnvironment, logService, productService, true)).type, "failure");
          });
          test("should not inject when isFeatureTerminal is true and forceShellIntegration is not set", async () => {
            strictEqual((await getShellIntegrationInjection({ executable: "bash", args: [], isFeatureTerminal: true }, enabledProcessOptions, defaultEnvironment, logService, productService, true)).type, "failure");
          });
        });
        suite("should override args", async () => {
          test("when undefined, [], empty string", async () => {
            const enabledExpectedResult = Object.freeze({
              type: "injection",
              newArgs: [
                "--init-file",
                `${repoRoot}/out/vs/workbench/contrib/terminal/common/scripts/shellIntegration-bash.sh`
              ],
              envMixin: {
                VSCODE_INJECTION: "1"
              }
            });
            deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: "bash", args: [] }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
            deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: "bash", args: "" }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
            deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: "bash", args: void 0 }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
          });
          suite("should set login env variable and not modify args", async () => {
            const enabledExpectedResult = Object.freeze({
              type: "injection",
              newArgs: [
                "--init-file",
                `${repoRoot}/out/vs/workbench/contrib/terminal/common/scripts/shellIntegration-bash.sh`
              ],
              envMixin: {
                VSCODE_INJECTION: "1",
                VSCODE_SHELL_LOGIN: "1"
              }
            });
            test("when array", async () => {
              deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: "bash", args: ["-l"] }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
            });
          });
          suite("should not modify args", async () => {
            test("when shell integration is disabled", async () => {
              strictEqual((await getShellIntegrationInjection({ executable: "bash", args: ["-l"] }, disabledProcessOptions, defaultEnvironment, logService, productService, true)).type, "failure");
              strictEqual((await getShellIntegrationInjection({ executable: "bash", args: void 0 }, disabledProcessOptions, defaultEnvironment, logService, productService, true)).type, "failure");
            });
            test("when custom array entry", async () => {
              strictEqual((await getShellIntegrationInjection({ executable: "bash", args: ["-l", "-i"] }, disabledProcessOptions, defaultEnvironment, logService, productService, true)).type, "failure");
            });
          });
        });
      });
    }
    suite("custom shell integration nonce", async () => {
      test("should fail for unsupported shell but nonce should still be available", async () => {
        const customProcessOptions = {
          shellIntegration: { enabled: true, suggestEnabled: false, nonce: "custom-nonce-12345" },
          windowsUseConptyDll: false,
          environmentVariableCollections: void 0,
          workspaceFolder: void 0,
          isScreenReaderOptimized: false
        };
        const result = await getShellIntegrationInjection(
          { executable: "julia", args: ["-i"] },
          customProcessOptions,
          defaultEnvironment,
          logService,
          productService,
          true
        );
        strictEqual(result.type, "failure");
        strictEqual(customProcessOptions.shellIntegration.nonce, "custom-nonce-12345");
      });
    });
  });
  suite("sanitizeEnvForLogging", () => {
    test("should return undefined for undefined input", () => {
      strictEqual(sanitizeEnvForLogging(void 0), void 0);
    });
    test("should return empty object for empty input", () => {
      deepStrictEqual(sanitizeEnvForLogging({}), {});
    });
    test("should pass through non-sensitive values", () => {
      deepStrictEqual(sanitizeEnvForLogging({
        PATH: "/usr/bin",
        HOME: "/home/user",
        TERM: "xterm-256color"
      }), {
        PATH: "/usr/bin",
        HOME: "/home/user",
        TERM: "xterm-256color"
      });
    });
    test("should redact sensitive env var names", () => {
      deepStrictEqual(sanitizeEnvForLogging({
        API_KEY: "secret123",
        GITHUB_TOKEN: "ghp_xxxx",
        MY_SECRET: "hidden",
        PASSWORD: "pass123",
        AWS_ACCESS_KEY: "AKIA...",
        DATABASE_PASSWORD: "dbpass",
        CLIENT_SECRET: "client_secret_value",
        AUTH_TOKEN: "auth_value",
        PRIVATE_KEY: "private_key_value"
      }), {
        API_KEY: "<REDACTED>",
        GITHUB_TOKEN: "<REDACTED>",
        MY_SECRET: "<REDACTED>",
        PASSWORD: "<REDACTED>",
        AWS_ACCESS_KEY: "<REDACTED>",
        DATABASE_PASSWORD: "<REDACTED>",
        CLIENT_SECRET: "<REDACTED>",
        AUTH_TOKEN: "<REDACTED>",
        PRIVATE_KEY: "<REDACTED>"
      });
    });
    test("should redact JWT tokens by value pattern", () => {
      deepStrictEqual(sanitizeEnvForLogging({
        SOME_VAR: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"
      }), {
        SOME_VAR: "<REDACTED>"
      });
    });
    test("should redact GitHub tokens by value pattern", () => {
      deepStrictEqual(sanitizeEnvForLogging({
        MY_GH: "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      }), {
        MY_GH: "<REDACTED>"
      });
    });
    test("should redact Google API keys by value pattern", () => {
      deepStrictEqual(sanitizeEnvForLogging({
        GOOGLE_KEY: "AIzaSyDaGmWKa4JsXZ-HjGw7ISLn_3namBGewQe"
      }), {
        GOOGLE_KEY: "<REDACTED>"
      });
    });
    test("should redact long alphanumeric strings (potential secrets)", () => {
      deepStrictEqual(sanitizeEnvForLogging({
        LONG_VALUE: "abcdefghijklmnopqrstuvwxyz123456"
      }), {
        LONG_VALUE: "<REDACTED>"
      });
    });
    test("should skip undefined values", () => {
      const env = {
        DEFINED: "value",
        UNDEFINED: void 0
      };
      deepStrictEqual(sanitizeEnvForLogging(env), {
        DEFINED: "value"
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3Rlcm1pbmFsL3Rlc3Qvbm9kZS90ZXJtaW5hbEVudmlyb25tZW50LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG4vKiBlc2xpbnQtZGlzYWJsZSBsb2NhbC9jb2RlLW5vLXRlc3QtYXN5bmMtc3VpdGUgKi9cbmltcG9ydCB7IGRlZXBTdHJpY3RFcXVhbCwgb2ssIHN0cmljdEVxdWFsIH0gZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGhvbWVkaXIsIHVzZXJJbmZvIH0gZnJvbSAnb3MnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbFByb2Nlc3NPcHRpb25zIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IGdldFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb24sIElTaGVsbEludGVncmF0aW9uQ29uZmlnSW5qZWN0aW9uLCB0eXBlIElTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uRmFpbHVyZSwgc2FuaXRpemVFbnZGb3JMb2dnaW5nIH0gZnJvbSAnLi4vLi4vbm9kZS90ZXJtaW5hbEVudmlyb25tZW50LmpzJztcbmltcG9ydCB7IGdldFdpbmRvd3NCdWlsZE51bWJlclN5bmMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL25vZGUvd2luZG93c1ZlcnNpb24uanMnO1xuXG5jb25zdCBlbmFibGVkUHJvY2Vzc09wdGlvbnM6IElUZXJtaW5hbFByb2Nlc3NPcHRpb25zID0geyBzaGVsbEludGVncmF0aW9uOiB7IGVuYWJsZWQ6IHRydWUsIHN1Z2dlc3RFbmFibGVkOiBmYWxzZSwgbm9uY2U6ICcnIH0sIHdpbmRvd3NVc2VDb25wdHlEbGw6IGZhbHNlLCBlbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbnM6IHVuZGVmaW5lZCwgd29ya3NwYWNlRm9sZGVyOiB1bmRlZmluZWQsIGlzU2NyZWVuUmVhZGVyT3B0aW1pemVkOiBmYWxzZSB9O1xuY29uc3QgZGlzYWJsZWRQcm9jZXNzT3B0aW9uczogSVRlcm1pbmFsUHJvY2Vzc09wdGlvbnMgPSB7IHNoZWxsSW50ZWdyYXRpb246IHsgZW5hYmxlZDogZmFsc2UsIHN1Z2dlc3RFbmFibGVkOiBmYWxzZSwgbm9uY2U6ICcnIH0sIHdpbmRvd3NVc2VDb25wdHlEbGw6IGZhbHNlLCBlbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbnM6IHVuZGVmaW5lZCwgd29ya3NwYWNlRm9sZGVyOiB1bmRlZmluZWQsIGlzU2NyZWVuUmVhZGVyT3B0aW1pemVkOiBmYWxzZSB9O1xuY29uc3QgcHdzaEV4ZSA9IHByb2Nlc3MucGxhdGZvcm0gPT09ICd3aW4zMicgPyAncHdzaC5leGUnIDogJ3B3c2gnO1xuY29uc3QgcmVwb1Jvb3QgPSBwcm9jZXNzLnBsYXRmb3JtID09PSAnd2luMzInID8gcHJvY2Vzcy5jd2QoKVswXS50b0xvd2VyQ2FzZSgpICsgcHJvY2Vzcy5jd2QoKS5zdWJzdHJpbmcoMSkgOiBwcm9jZXNzLmN3ZCgpO1xuY29uc3QgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuY29uc3QgcHJvZHVjdFNlcnZpY2UgPSB7IGFwcGxpY2F0aW9uTmFtZTogJ3ZzY29kZScgfSBhcyBJUHJvZHVjdFNlcnZpY2U7XG5jb25zdCBkZWZhdWx0RW52aXJvbm1lbnQgPSB7fTtcblxuZnVuY3Rpb24gZGVlcFN0cmljdEVxdWFsSWdub3JlU3RhYmxlVmFyKGFjdHVhbDogSVNoZWxsSW50ZWdyYXRpb25Db25maWdJbmplY3Rpb24gfCBJU2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbkZhaWx1cmUgfCB1bmRlZmluZWQsIGV4cGVjdGVkOiBJU2hlbGxJbnRlZ3JhdGlvbkNvbmZpZ0luamVjdGlvbikge1xuXHRpZiAoYWN0dWFsPy50eXBlID09PSAnaW5qZWN0aW9uJyAmJiBhY3R1YWwuZW52TWl4aW4pIHtcblx0XHRkZWxldGUgYWN0dWFsLmVudk1peGluWydWU0NPREVfU1RBQkxFJ107XG5cdH1cblx0ZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpO1xufVxuXG5zdWl0ZSgncGxhdGZvcm0gLSB0ZXJtaW5hbEVudmlyb25tZW50JywgYXN5bmMgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblx0c3VpdGUoJ2dldFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0c3VpdGUoJ3Nob3VsZCBub3QgZW5hYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gVGhpcyB0ZXN0IGlzIG9ubHkgZXhwZWN0ZWQgdG8gd29yayBvbiBXaW5kb3dzIDEwIGJ1aWxkIDE4MzA5IGFuZCBhYm92ZVxuXHRcdFx0KGdldFdpbmRvd3NCdWlsZE51bWJlclN5bmMoKSA8IDE4MzA5ID8gdGVzdC5za2lwIDogdGVzdCkoJ3doZW4gaXNGZWF0dXJlVGVybWluYWwgb3Igd2hlbiBubyBleGVjdXRhYmxlIGlzIHByb3ZpZGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRzdHJpY3RFcXVhbCgoYXdhaXQgZ2V0U2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbih7IGV4ZWN1dGFibGU6IHB3c2hFeGUsIGFyZ3M6IFsnLWwnLCAnLU5vTG9nbyddLCBpc0ZlYXR1cmVUZXJtaW5hbDogdHJ1ZSB9LCBlbmFibGVkUHJvY2Vzc09wdGlvbnMsIGRlZmF1bHRFbnZpcm9ubWVudCwgbG9nU2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIHRydWUpKS50eXBlLCAnZmFpbHVyZScpO1xuXHRcdFx0XHRzdHJpY3RFcXVhbCgoYXdhaXQgZ2V0U2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbih7IGV4ZWN1dGFibGU6IHB3c2hFeGUsIGFyZ3M6IFsnLWwnLCAnLU5vTG9nbyddLCBpc0ZlYXR1cmVUZXJtaW5hbDogZmFsc2UgfSwgZW5hYmxlZFByb2Nlc3NPcHRpb25zLCBkZWZhdWx0RW52aXJvbm1lbnQsIGxvZ1NlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCB0cnVlKSkudHlwZSwgJ2luamVjdGlvbicpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHQvLyBUaGVzZSB0ZXN0cyBhcmUgb25seSBleHBlY3RlZCB0byB3b3JrIG9uIFdpbmRvd3MgMTAgYnVpbGQgMTgzMDkgYW5kIGFib3ZlXG5cdFx0KGdldFdpbmRvd3NCdWlsZE51bWJlclN5bmMoKSA8IDE4MzA5ID8gc3VpdGUuc2tpcCA6IHN1aXRlKSgncHdzaCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGV4cGVjdGVkUHMxID0gcHJvY2Vzcy5wbGF0Zm9ybSA9PT0gJ3dpbjMyJ1xuXHRcdFx0XHQ/IGB0cnkgeyAuIFwiJHtyZXBvUm9vdH1cXFxcb3V0XFxcXHZzXFxcXHdvcmtiZW5jaFxcXFxjb250cmliXFxcXHRlcm1pbmFsXFxcXGNvbW1vblxcXFxzY3JpcHRzXFxcXHNoZWxsSW50ZWdyYXRpb24ucHMxXCIgfSBjYXRjaCB7fWBcblx0XHRcdFx0OiBgLiBcIiR7cmVwb1Jvb3R9L291dC92cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbC9jb21tb24vc2NyaXB0cy9zaGVsbEludGVncmF0aW9uLnBzMVwiYDtcblx0XHRcdHN1aXRlKCdzaG91bGQgb3ZlcnJpZGUgYXJncycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgZW5hYmxlZEV4cGVjdGVkUmVzdWx0ID0gT2JqZWN0LmZyZWV6ZTxJU2hlbGxJbnRlZ3JhdGlvbkNvbmZpZ0luamVjdGlvbj4oe1xuXHRcdFx0XHRcdHR5cGU6ICdpbmplY3Rpb24nLFxuXHRcdFx0XHRcdG5ld0FyZ3M6IFtcblx0XHRcdFx0XHRcdCctbm9leGl0Jyxcblx0XHRcdFx0XHRcdCctY29tbWFuZCcsXG5cdFx0XHRcdFx0XHRleHBlY3RlZFBzMVxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0ZW52TWl4aW46IHtcblx0XHRcdFx0XHRcdFZTQ09ERV9BMTFZX01PREU6ICcwJyxcblx0XHRcdFx0XHRcdFZTQ09ERV9JTkpFQ1RJT046ICcxJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRlc3QoJ3doZW4gdW5kZWZpbmVkLCBbXScsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRkZWVwU3RyaWN0RXF1YWxJZ25vcmVTdGFibGVWYXIoYXdhaXQgZ2V0U2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbih7IGV4ZWN1dGFibGU6IHB3c2hFeGUsIGFyZ3M6IFtdIH0sIGVuYWJsZWRQcm9jZXNzT3B0aW9ucywgZGVmYXVsdEVudmlyb25tZW50LCBsb2dTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSwgdHJ1ZSksIGVuYWJsZWRFeHBlY3RlZFJlc3VsdCk7XG5cdFx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsSWdub3JlU3RhYmxlVmFyKGF3YWl0IGdldFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb24oeyBleGVjdXRhYmxlOiBwd3NoRXhlLCBhcmdzOiB1bmRlZmluZWQgfSwgZW5hYmxlZFByb2Nlc3NPcHRpb25zLCBkZWZhdWx0RW52aXJvbm1lbnQsIGxvZ1NlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCB0cnVlKSwgZW5hYmxlZEV4cGVjdGVkUmVzdWx0KTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHN1aXRlKCd3aGVuIG5vIGxvZ28nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0dGVzdCgnYXJyYXkgLSBjYXNlIGluc2Vuc2l0aXZlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsSWdub3JlU3RhYmxlVmFyKGF3YWl0IGdldFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb24oeyBleGVjdXRhYmxlOiBwd3NoRXhlLCBhcmdzOiBbJy1Ob0xvZ28nXSB9LCBlbmFibGVkUHJvY2Vzc09wdGlvbnMsIGRlZmF1bHRFbnZpcm9ubWVudCwgbG9nU2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIHRydWUpLCBlbmFibGVkRXhwZWN0ZWRSZXN1bHQpO1xuXHRcdFx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsSWdub3JlU3RhYmxlVmFyKGF3YWl0IGdldFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb24oeyBleGVjdXRhYmxlOiBwd3NoRXhlLCBhcmdzOiBbJy1OT0xPR08nXSB9LCBlbmFibGVkUHJvY2Vzc09wdGlvbnMsIGRlZmF1bHRFbnZpcm9ubWVudCwgbG9nU2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIHRydWUpLCBlbmFibGVkRXhwZWN0ZWRSZXN1bHQpO1xuXHRcdFx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsSWdub3JlU3RhYmxlVmFyKGF3YWl0IGdldFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb24oeyBleGVjdXRhYmxlOiBwd3NoRXhlLCBhcmdzOiBbJy1ub2wnXSB9LCBlbmFibGVkUHJvY2Vzc09wdGlvbnMsIGRlZmF1bHRFbnZpcm9ubWVudCwgbG9nU2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIHRydWUpLCBlbmFibGVkRXhwZWN0ZWRSZXN1bHQpO1xuXHRcdFx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsSWdub3JlU3RhYmxlVmFyKGF3YWl0IGdldFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb24oeyBleGVjdXRhYmxlOiBwd3NoRXhlLCBhcmdzOiBbJy1OT0wnXSB9LCBlbmFibGVkUHJvY2Vzc09wdGlvbnMsIGRlZmF1bHRFbnZpcm9ubWVudCwgbG9nU2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIHRydWUpLCBlbmFibGVkRXhwZWN0ZWRSZXN1bHQpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHRlc3QoJ3N0cmluZyAtIGNhc2UgaW5zZW5zaXRpdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRkZWVwU3RyaWN0RXF1YWxJZ25vcmVTdGFibGVWYXIoYXdhaXQgZ2V0U2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbih7IGV4ZWN1dGFibGU6IHB3c2hFeGUsIGFyZ3M6ICctTm9Mb2dvJyB9LCBlbmFibGVkUHJvY2Vzc09wdGlvbnMsIGRlZmF1bHRFbnZpcm9ubWVudCwgbG9nU2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIHRydWUpLCBlbmFibGVkRXhwZWN0ZWRSZXN1bHQpO1xuXHRcdFx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsSWdub3JlU3RhYmxlVmFyKGF3YWl0IGdldFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb24oeyBleGVjdXRhYmxlOiBwd3NoRXhlLCBhcmdzOiAnLU5PTE9HTycgfSwgZW5hYmxlZFByb2Nlc3NPcHRpb25zLCBkZWZhdWx0RW52aXJvbm1lbnQsIGxvZ1NlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCB0cnVlKSwgZW5hYmxlZEV4cGVjdGVkUmVzdWx0KTtcblx0XHRcdFx0XHRcdGRlZXBTdHJpY3RFcXVhbElnbm9yZVN0YWJsZVZhcihhd2FpdCBnZXRTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uKHsgZXhlY3V0YWJsZTogcHdzaEV4ZSwgYXJnczogJy1ub2wnIH0sIGVuYWJsZWRQcm9jZXNzT3B0aW9ucywgZGVmYXVsdEVudmlyb25tZW50LCBsb2dTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSwgdHJ1ZSksIGVuYWJsZWRFeHBlY3RlZFJlc3VsdCk7XG5cdFx0XHRcdFx0XHRkZWVwU3RyaWN0RXF1YWxJZ25vcmVTdGFibGVWYXIoYXdhaXQgZ2V0U2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbih7IGV4ZWN1dGFibGU6IHB3c2hFeGUsIGFyZ3M6ICctTk9MJyB9LCBlbmFibGVkUHJvY2Vzc09wdGlvbnMsIGRlZmF1bHRFbnZpcm9ubWVudCwgbG9nU2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIHRydWUpLCBlbmFibGVkRXhwZWN0ZWRSZXN1bHQpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdFx0c3VpdGUoJ3Nob3VsZCBpbmNvcnBvcmF0ZSBsb2dpbiBhcmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGVuYWJsZWRFeHBlY3RlZFJlc3VsdCA9IE9iamVjdC5mcmVlemU8SVNoZWxsSW50ZWdyYXRpb25Db25maWdJbmplY3Rpb24+KHtcblx0XHRcdFx0XHR0eXBlOiAnaW5qZWN0aW9uJyxcblx0XHRcdFx0XHRuZXdBcmdzOiBbXG5cdFx0XHRcdFx0XHQnLWwnLFxuXHRcdFx0XHRcdFx0Jy1ub2V4aXQnLFxuXHRcdFx0XHRcdFx0Jy1jb21tYW5kJyxcblx0XHRcdFx0XHRcdGV4cGVjdGVkUHMxXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRlbnZNaXhpbjoge1xuXHRcdFx0XHRcdFx0VlNDT0RFX0ExMVlfTU9ERTogJzAnLFxuXHRcdFx0XHRcdFx0VlNDT0RFX0lOSkVDVElPTjogJzEnXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGVzdCgnd2hlbiBhcnJheSBjb250YWlucyBubyBsb2dvIGFuZCBsb2dpbicsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRkZWVwU3RyaWN0RXF1YWxJZ25vcmVTdGFibGVWYXIoYXdhaXQgZ2V0U2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbih7IGV4ZWN1dGFibGU6IHB3c2hFeGUsIGFyZ3M6IFsnLWwnLCAnLU5vTG9nbyddIH0sIGVuYWJsZWRQcm9jZXNzT3B0aW9ucywgZGVmYXVsdEVudmlyb25tZW50LCBsb2dTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSwgdHJ1ZSksIGVuYWJsZWRFeHBlY3RlZFJlc3VsdCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0ZXN0KCd3aGVuIHN0cmluZycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRkZWVwU3RyaWN0RXF1YWxJZ25vcmVTdGFibGVWYXIoYXdhaXQgZ2V0U2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbih7IGV4ZWN1dGFibGU6IHB3c2hFeGUsIGFyZ3M6ICctbCcgfSwgZW5hYmxlZFByb2Nlc3NPcHRpb25zLCBkZWZhdWx0RW52aXJvbm1lbnQsIGxvZ1NlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCB0cnVlKSwgZW5hYmxlZEV4cGVjdGVkUmVzdWx0KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHRcdHN1aXRlKCdzaG91bGQgbm90IG1vZGlmeSBhcmdzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0ZXN0KCd3aGVuIHNoZWxsIGludGVncmF0aW9uIGlzIGRpc2FibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdHN0cmljdEVxdWFsKChhd2FpdCBnZXRTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uKHsgZXhlY3V0YWJsZTogcHdzaEV4ZSwgYXJnczogWyctbCddIH0sIGRpc2FibGVkUHJvY2Vzc09wdGlvbnMsIGRlZmF1bHRFbnZpcm9ubWVudCwgbG9nU2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIHRydWUpKS50eXBlLCAnZmFpbHVyZScpO1xuXHRcdFx0XHRcdHN0cmljdEVxdWFsKChhd2FpdCBnZXRTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uKHsgZXhlY3V0YWJsZTogcHdzaEV4ZSwgYXJnczogJy1sJyB9LCBkaXNhYmxlZFByb2Nlc3NPcHRpb25zLCBkZWZhdWx0RW52aXJvbm1lbnQsIGxvZ1NlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCB0cnVlKSkudHlwZSwgJ2ZhaWx1cmUnKTtcblx0XHRcdFx0XHRzdHJpY3RFcXVhbCgoYXdhaXQgZ2V0U2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbih7IGV4ZWN1dGFibGU6IHB3c2hFeGUsIGFyZ3M6IHVuZGVmaW5lZCB9LCBkaXNhYmxlZFByb2Nlc3NPcHRpb25zLCBkZWZhdWx0RW52aXJvbm1lbnQsIGxvZ1NlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCB0cnVlKSkudHlwZSwgJ2ZhaWx1cmUnKTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRlc3QoJ3doZW4gdXNpbmcgdW5yZWNvZ25pemVkIGFyZycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRzdHJpY3RFcXVhbCgoYXdhaXQgZ2V0U2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbih7IGV4ZWN1dGFibGU6IHB3c2hFeGUsIGFyZ3M6IFsnLWwnLCAnLU5vTG9nbycsICctaSddIH0sIGRpc2FibGVkUHJvY2Vzc09wdGlvbnMsIGRlZmF1bHRFbnZpcm9ubWVudCwgbG9nU2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIHRydWUpKS50eXBlLCAnZmFpbHVyZScpO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGVzdCgnd2hlbiB1c2luZyB1bnJlY29nbml6ZWQgYXJnIChzdHJpbmcpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdHN0cmljdEVxdWFsKChhd2FpdCBnZXRTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uKHsgZXhlY3V0YWJsZTogcHdzaEV4ZSwgYXJnczogJy1pJyB9LCBkaXNhYmxlZFByb2Nlc3NPcHRpb25zLCBkZWZhdWx0RW52aXJvbm1lbnQsIGxvZ1NlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCB0cnVlKSkudHlwZSwgJ2ZhaWx1cmUnKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdGlmIChwcm9jZXNzLnBsYXRmb3JtICE9PSAnd2luMzInKSB7XG5cdFx0XHRzdWl0ZSgnenNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRzdWl0ZSgnc2hvdWxkIG92ZXJyaWRlIGFyZ3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgdXNlcm5hbWUgPSB1c2VySW5mbygpLnVzZXJuYW1lO1xuXHRcdFx0XHRcdGNvbnN0IGV4cGVjdGVkRGlyID0gbmV3IFJlZ0V4cChgLitcXC8ke3VzZXJuYW1lfS12c2NvZGUtenNoYCk7XG5cdFx0XHRcdFx0Y29uc3QgY3VzdG9tWmRvdGRpciA9ICcvY3VzdG9tL3pzaC9kb3RkaXInO1xuXHRcdFx0XHRcdGNvbnN0IGV4cGVjdGVkRGVzdHMgPSBbXG5cdFx0XHRcdFx0XHRuZXcgUmVnRXhwKGAuK1xcXFwvJHt1c2VybmFtZX0tdnNjb2RlLXpzaFxcXFwvXFxcXC56c2hyY2ApLFxuXHRcdFx0XHRcdFx0bmV3IFJlZ0V4cChgLitcXFxcLyR7dXNlcm5hbWV9LXZzY29kZS16c2hcXFxcL1xcXFwuenByb2ZpbGVgKSxcblx0XHRcdFx0XHRcdG5ldyBSZWdFeHAoYC4rXFxcXC8ke3VzZXJuYW1lfS12c2NvZGUtenNoXFxcXC9cXFxcLnpzaGVudmApLFxuXHRcdFx0XHRcdFx0bmV3IFJlZ0V4cChgLitcXFxcLyR7dXNlcm5hbWV9LXZzY29kZS16c2hcXFxcL1xcXFwuemxvZ2luYClcblx0XHRcdFx0XHRdO1xuXHRcdFx0XHRcdGNvbnN0IGV4cGVjdGVkU291cmNlcyA9IFtcblx0XHRcdFx0XHRcdC8uK1xcL291dFxcL3ZzXFwvd29ya2JlbmNoXFwvY29udHJpYlxcL3Rlcm1pbmFsXFwvY29tbW9uXFwvc2NyaXB0c1xcL3NoZWxsSW50ZWdyYXRpb24tcmMuenNoLyxcblx0XHRcdFx0XHRcdC8uK1xcL291dFxcL3ZzXFwvd29ya2JlbmNoXFwvY29udHJpYlxcL3Rlcm1pbmFsXFwvY29tbW9uXFwvc2NyaXB0c1xcL3NoZWxsSW50ZWdyYXRpb24tcHJvZmlsZS56c2gvLFxuXHRcdFx0XHRcdFx0Ly4rXFwvb3V0XFwvdnNcXC93b3JrYmVuY2hcXC9jb250cmliXFwvdGVybWluYWxcXC9jb21tb25cXC9zY3JpcHRzXFwvc2hlbGxJbnRlZ3JhdGlvbi1lbnYuenNoLyxcblx0XHRcdFx0XHRcdC8uK1xcL291dFxcL3ZzXFwvd29ya2JlbmNoXFwvY29udHJpYlxcL3Rlcm1pbmFsXFwvY29tbW9uXFwvc2NyaXB0c1xcL3NoZWxsSW50ZWdyYXRpb24tbG9naW4uenNoL1xuXHRcdFx0XHRcdF07XG5cdFx0XHRcdFx0ZnVuY3Rpb24gYXNzZXJ0SXNFbmFibGVkKHJlc3VsdDogSVNoZWxsSW50ZWdyYXRpb25Db25maWdJbmplY3Rpb24sIGdsb2JhbFpkb3RkaXIgPSBob21lZGlyKCkpIHtcblx0XHRcdFx0XHRcdHN0cmljdEVxdWFsKE9iamVjdC5rZXlzKHJlc3VsdC5lbnZNaXhpbiEpLmxlbmd0aCwgMyk7XG5cdFx0XHRcdFx0XHRvayhyZXN1bHQuZW52TWl4aW4hWydaRE9URElSJ10/Lm1hdGNoKGV4cGVjdGVkRGlyKSk7XG5cdFx0XHRcdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQuZW52TWl4aW4hWydVU0VSX1pET1RESVInXSwgZ2xvYmFsWmRvdGRpcik7XG5cdFx0XHRcdFx0XHRvayhyZXN1bHQuZW52TWl4aW4hWydWU0NPREVfSU5KRUNUSU9OJ10/Lm1hdGNoKCcxJykpO1xuXHRcdFx0XHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LmZpbGVzVG9Db3B5Py5sZW5ndGgsIDQpO1xuXHRcdFx0XHRcdFx0b2socmVzdWx0LmZpbGVzVG9Db3B5WzBdLmRlc3QubWF0Y2goZXhwZWN0ZWREZXN0c1swXSkpO1xuXHRcdFx0XHRcdFx0b2socmVzdWx0LmZpbGVzVG9Db3B5WzFdLmRlc3QubWF0Y2goZXhwZWN0ZWREZXN0c1sxXSkpO1xuXHRcdFx0XHRcdFx0b2socmVzdWx0LmZpbGVzVG9Db3B5WzJdLmRlc3QubWF0Y2goZXhwZWN0ZWREZXN0c1syXSkpO1xuXHRcdFx0XHRcdFx0b2socmVzdWx0LmZpbGVzVG9Db3B5WzNdLmRlc3QubWF0Y2goZXhwZWN0ZWREZXN0c1szXSkpO1xuXHRcdFx0XHRcdFx0b2socmVzdWx0LmZpbGVzVG9Db3B5WzBdLnNvdXJjZS5tYXRjaChleHBlY3RlZFNvdXJjZXNbMF0pKTtcblx0XHRcdFx0XHRcdG9rKHJlc3VsdC5maWxlc1RvQ29weVsxXS5zb3VyY2UubWF0Y2goZXhwZWN0ZWRTb3VyY2VzWzFdKSk7XG5cdFx0XHRcdFx0XHRvayhyZXN1bHQuZmlsZXNUb0NvcHlbMl0uc291cmNlLm1hdGNoKGV4cGVjdGVkU291cmNlc1syXSkpO1xuXHRcdFx0XHRcdFx0b2socmVzdWx0LmZpbGVzVG9Db3B5WzNdLnNvdXJjZS5tYXRjaChleHBlY3RlZFNvdXJjZXNbM10pKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGVzdCgnd2hlbiB1bmRlZmluZWQsIFtdJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgcmVzdWx0MSA9IGF3YWl0IGdldFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb24oeyBleGVjdXRhYmxlOiAnenNoJywgYXJnczogW10gfSwgZW5hYmxlZFByb2Nlc3NPcHRpb25zLCBkZWZhdWx0RW52aXJvbm1lbnQsIGxvZ1NlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCB0cnVlKSBhcyBJU2hlbGxJbnRlZ3JhdGlvbkNvbmZpZ0luamVjdGlvbjtcblx0XHRcdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChyZXN1bHQxPy5uZXdBcmdzLCBbJy1pJ10pO1xuXHRcdFx0XHRcdFx0YXNzZXJ0SXNFbmFibGVkKHJlc3VsdDEpO1xuXHRcdFx0XHRcdFx0Y29uc3QgcmVzdWx0MiA9IGF3YWl0IGdldFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb24oeyBleGVjdXRhYmxlOiAnenNoJywgYXJnczogdW5kZWZpbmVkIH0sIGVuYWJsZWRQcm9jZXNzT3B0aW9ucywgZGVmYXVsdEVudmlyb25tZW50LCBsb2dTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSwgdHJ1ZSkgYXMgSVNoZWxsSW50ZWdyYXRpb25Db25maWdJbmplY3Rpb247XG5cdFx0XHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwocmVzdWx0Mj8ubmV3QXJncywgWyctaSddKTtcblx0XHRcdFx0XHRcdGFzc2VydElzRW5hYmxlZChyZXN1bHQyKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRzdWl0ZSgnc2hvdWxkIGluY29ycG9yYXRlIGxvZ2luIGFyZycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdHRlc3QoJ3doZW4gYXJyYXknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGdldFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb24oeyBleGVjdXRhYmxlOiAnenNoJywgYXJnczogWyctbCddIH0sIGVuYWJsZWRQcm9jZXNzT3B0aW9ucywgZGVmYXVsdEVudmlyb25tZW50LCBsb2dTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSwgdHJ1ZSkgYXMgSVNoZWxsSW50ZWdyYXRpb25Db25maWdJbmplY3Rpb247XG5cdFx0XHRcdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChyZXN1bHQ/Lm5ld0FyZ3MsIFsnLWlsJ10pO1xuXHRcdFx0XHRcdFx0XHRhc3NlcnRJc0VuYWJsZWQocmVzdWx0KTtcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHN1aXRlKCdzaG91bGQgbm90IG1vZGlmeSBhcmdzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0dGVzdCgnd2hlbiBzaGVsbCBpbnRlZ3JhdGlvbiBpcyBkaXNhYmxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdFx0c3RyaWN0RXF1YWwoKGF3YWl0IGdldFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb24oeyBleGVjdXRhYmxlOiAnenNoJywgYXJnczogWyctbCddIH0sIGRpc2FibGVkUHJvY2Vzc09wdGlvbnMsIGRlZmF1bHRFbnZpcm9ubWVudCwgbG9nU2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIHRydWUpKS50eXBlLCAnZmFpbHVyZScpO1xuXHRcdFx0XHRcdFx0XHRzdHJpY3RFcXVhbCgoYXdhaXQgZ2V0U2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbih7IGV4ZWN1dGFibGU6ICd6c2gnLCBhcmdzOiB1bmRlZmluZWQgfSwgZGlzYWJsZWRQcm9jZXNzT3B0aW9ucywgZGVmYXVsdEVudmlyb25tZW50LCBsb2dTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSwgdHJ1ZSkpLnR5cGUsICdmYWlsdXJlJyk7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdHRlc3QoJ3doZW4gdXNpbmcgdW5yZWNvZ25pemVkIGFyZycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdFx0c3RyaWN0RXF1YWwoKGF3YWl0IGdldFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb24oeyBleGVjdXRhYmxlOiAnenNoJywgYXJnczogWyctbCcsICctZmFrZSddIH0sIGRpc2FibGVkUHJvY2Vzc09wdGlvbnMsIGRlZmF1bHRFbnZpcm9ubWVudCwgbG9nU2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIHRydWUpKS50eXBlLCAnZmFpbHVyZScpO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0c3VpdGUoJ3Nob3VsZCBpbmNvcnBvcmF0ZSBnbG9iYWwgWkRPVERJUiBlbnYgdmFyaWFibGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHR0ZXN0KCd3aGVuIGN1c3RvbSBaRE9URElSJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRjb25zdCByZXN1bHQxID0gYXdhaXQgZ2V0U2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbih7IGV4ZWN1dGFibGU6ICd6c2gnLCBhcmdzOiBbXSB9LCBlbmFibGVkUHJvY2Vzc09wdGlvbnMsIHsgLi4uZGVmYXVsdEVudmlyb25tZW50LCBaRE9URElSOiBjdXN0b21aZG90ZGlyIH0sIGxvZ1NlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCB0cnVlKSBhcyBJU2hlbGxJbnRlZ3JhdGlvbkNvbmZpZ0luamVjdGlvbjtcblx0XHRcdFx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKHJlc3VsdDE/Lm5ld0FyZ3MsIFsnLWknXSk7XG5cdFx0XHRcdFx0XHRcdGFzc2VydElzRW5hYmxlZChyZXN1bHQxLCBjdXN0b21aZG90ZGlyKTtcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0dGVzdCgnd2hlbiB1bmRlZmluZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHJlc3VsdDEgPSBhd2FpdCBnZXRTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uKHsgZXhlY3V0YWJsZTogJ3pzaCcsIGFyZ3M6IFtdIH0sIGVuYWJsZWRQcm9jZXNzT3B0aW9ucywgdW5kZWZpbmVkLCBsb2dTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSwgdHJ1ZSkgYXMgSVNoZWxsSW50ZWdyYXRpb25Db25maWdJbmplY3Rpb247XG5cdFx0XHRcdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChyZXN1bHQxPy5uZXdBcmdzLCBbJy1pJ10pO1xuXHRcdFx0XHRcdFx0XHRhc3NlcnRJc0VuYWJsZWQocmVzdWx0MSk7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHRcdHN1aXRlKCdiYXNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRzdWl0ZSgnZm9yY2VTaGVsbEludGVncmF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdHRlc3QoJ3Nob3VsZCBpbmplY3Qgd2hlbiBpc0ZlYXR1cmVUZXJtaW5hbCBpcyB0cnVlIGJ1dCBmb3JjZVNoZWxsSW50ZWdyYXRpb24gb3ZlcnJpZGVzIGl0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0c3RyaWN0RXF1YWwoKGF3YWl0IGdldFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb24oeyBleGVjdXRhYmxlOiAnYmFzaCcsIGFyZ3M6IFtdLCBpc0ZlYXR1cmVUZXJtaW5hbDogdHJ1ZSwgZm9yY2VTaGVsbEludGVncmF0aW9uOiB0cnVlIH0sIGVuYWJsZWRQcm9jZXNzT3B0aW9ucywgZGVmYXVsdEVudmlyb25tZW50LCBsb2dTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSwgdHJ1ZSkpLnR5cGUsICdpbmplY3Rpb24nKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR0ZXN0KCdzaG91bGQgbm90IGluamVjdCB3aGVuIGlzRmVhdHVyZVRlcm1pbmFsIGlzIHRydWUgYW5kIGZvcmNlU2hlbGxJbnRlZ3JhdGlvbiBpcyBmYWxzZScsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdHN0cmljdEVxdWFsKChhd2FpdCBnZXRTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uKHsgZXhlY3V0YWJsZTogJ2Jhc2gnLCBhcmdzOiBbXSwgaXNGZWF0dXJlVGVybWluYWw6IHRydWUsIGZvcmNlU2hlbGxJbnRlZ3JhdGlvbjogZmFsc2UgfSwgZW5hYmxlZFByb2Nlc3NPcHRpb25zLCBkZWZhdWx0RW52aXJvbm1lbnQsIGxvZ1NlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCB0cnVlKSkudHlwZSwgJ2ZhaWx1cmUnKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR0ZXN0KCdzaG91bGQgbm90IGluamVjdCB3aGVuIGlzRmVhdHVyZVRlcm1pbmFsIGlzIHRydWUgYW5kIGZvcmNlU2hlbGxJbnRlZ3JhdGlvbiBpcyBub3Qgc2V0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0c3RyaWN0RXF1YWwoKGF3YWl0IGdldFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb24oeyBleGVjdXRhYmxlOiAnYmFzaCcsIGFyZ3M6IFtdLCBpc0ZlYXR1cmVUZXJtaW5hbDogdHJ1ZSB9LCBlbmFibGVkUHJvY2Vzc09wdGlvbnMsIGRlZmF1bHRFbnZpcm9ubWVudCwgbG9nU2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIHRydWUpKS50eXBlLCAnZmFpbHVyZScpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0c3VpdGUoJ3Nob3VsZCBvdmVycmlkZSBhcmdzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdHRlc3QoJ3doZW4gdW5kZWZpbmVkLCBbXSwgZW1wdHkgc3RyaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgZW5hYmxlZEV4cGVjdGVkUmVzdWx0ID0gT2JqZWN0LmZyZWV6ZTxJU2hlbGxJbnRlZ3JhdGlvbkNvbmZpZ0luamVjdGlvbj4oe1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnaW5qZWN0aW9uJyxcblx0XHRcdFx0XHRcdFx0bmV3QXJnczogW1xuXHRcdFx0XHRcdFx0XHRcdCctLWluaXQtZmlsZScsXG5cdFx0XHRcdFx0XHRcdFx0YCR7cmVwb1Jvb3R9L291dC92cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbC9jb21tb24vc2NyaXB0cy9zaGVsbEludGVncmF0aW9uLWJhc2guc2hgXG5cdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdGVudk1peGluOiB7XG5cdFx0XHRcdFx0XHRcdFx0VlNDT0RFX0lOSkVDVElPTjogJzEnXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsSWdub3JlU3RhYmxlVmFyKGF3YWl0IGdldFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb24oeyBleGVjdXRhYmxlOiAnYmFzaCcsIGFyZ3M6IFtdIH0sIGVuYWJsZWRQcm9jZXNzT3B0aW9ucywgZGVmYXVsdEVudmlyb25tZW50LCBsb2dTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSwgdHJ1ZSksIGVuYWJsZWRFeHBlY3RlZFJlc3VsdCk7XG5cdFx0XHRcdFx0XHRkZWVwU3RyaWN0RXF1YWxJZ25vcmVTdGFibGVWYXIoYXdhaXQgZ2V0U2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbih7IGV4ZWN1dGFibGU6ICdiYXNoJywgYXJnczogJycgfSwgZW5hYmxlZFByb2Nlc3NPcHRpb25zLCBkZWZhdWx0RW52aXJvbm1lbnQsIGxvZ1NlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCB0cnVlKSwgZW5hYmxlZEV4cGVjdGVkUmVzdWx0KTtcblx0XHRcdFx0XHRcdGRlZXBTdHJpY3RFcXVhbElnbm9yZVN0YWJsZVZhcihhd2FpdCBnZXRTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uKHsgZXhlY3V0YWJsZTogJ2Jhc2gnLCBhcmdzOiB1bmRlZmluZWQgfSwgZW5hYmxlZFByb2Nlc3NPcHRpb25zLCBkZWZhdWx0RW52aXJvbm1lbnQsIGxvZ1NlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCB0cnVlKSwgZW5hYmxlZEV4cGVjdGVkUmVzdWx0KTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRzdWl0ZSgnc2hvdWxkIHNldCBsb2dpbiBlbnYgdmFyaWFibGUgYW5kIG5vdCBtb2RpZnkgYXJncycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGVuYWJsZWRFeHBlY3RlZFJlc3VsdCA9IE9iamVjdC5mcmVlemU8SVNoZWxsSW50ZWdyYXRpb25Db25maWdJbmplY3Rpb24+KHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ2luamVjdGlvbicsXG5cdFx0XHRcdFx0XHRcdG5ld0FyZ3M6IFtcblx0XHRcdFx0XHRcdFx0XHQnLS1pbml0LWZpbGUnLFxuXHRcdFx0XHRcdFx0XHRcdGAke3JlcG9Sb290fS9vdXQvdnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvY29tbW9uL3NjcmlwdHMvc2hlbGxJbnRlZ3JhdGlvbi1iYXNoLnNoYFxuXHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHRlbnZNaXhpbjoge1xuXHRcdFx0XHRcdFx0XHRcdFZTQ09ERV9JTkpFQ1RJT046ICcxJyxcblx0XHRcdFx0XHRcdFx0XHRWU0NPREVfU0hFTExfTE9HSU46ICcxJ1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdHRlc3QoJ3doZW4gYXJyYXknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGRlZXBTdHJpY3RFcXVhbElnbm9yZVN0YWJsZVZhcihhd2FpdCBnZXRTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uKHsgZXhlY3V0YWJsZTogJ2Jhc2gnLCBhcmdzOiBbJy1sJ10gfSwgZW5hYmxlZFByb2Nlc3NPcHRpb25zLCBkZWZhdWx0RW52aXJvbm1lbnQsIGxvZ1NlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCB0cnVlKSwgZW5hYmxlZEV4cGVjdGVkUmVzdWx0KTtcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHN1aXRlKCdzaG91bGQgbm90IG1vZGlmeSBhcmdzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0dGVzdCgnd2hlbiBzaGVsbCBpbnRlZ3JhdGlvbiBpcyBkaXNhYmxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdFx0c3RyaWN0RXF1YWwoKGF3YWl0IGdldFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb24oeyBleGVjdXRhYmxlOiAnYmFzaCcsIGFyZ3M6IFsnLWwnXSB9LCBkaXNhYmxlZFByb2Nlc3NPcHRpb25zLCBkZWZhdWx0RW52aXJvbm1lbnQsIGxvZ1NlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCB0cnVlKSkudHlwZSwgJ2ZhaWx1cmUnKTtcblx0XHRcdFx0XHRcdFx0c3RyaWN0RXF1YWwoKGF3YWl0IGdldFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb24oeyBleGVjdXRhYmxlOiAnYmFzaCcsIGFyZ3M6IHVuZGVmaW5lZCB9LCBkaXNhYmxlZFByb2Nlc3NPcHRpb25zLCBkZWZhdWx0RW52aXJvbm1lbnQsIGxvZ1NlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCB0cnVlKSkudHlwZSwgJ2ZhaWx1cmUnKTtcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0dGVzdCgnd2hlbiBjdXN0b20gYXJyYXkgZW50cnknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHN0cmljdEVxdWFsKChhd2FpdCBnZXRTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uKHsgZXhlY3V0YWJsZTogJ2Jhc2gnLCBhcmdzOiBbJy1sJywgJy1pJ10gfSwgZGlzYWJsZWRQcm9jZXNzT3B0aW9ucywgZGVmYXVsdEVudmlyb25tZW50LCBsb2dTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSwgdHJ1ZSkpLnR5cGUsICdmYWlsdXJlJyk7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRzdWl0ZSgnY3VzdG9tIHNoZWxsIGludGVncmF0aW9uIG5vbmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGVzdCgnc2hvdWxkIGZhaWwgZm9yIHVuc3VwcG9ydGVkIHNoZWxsIGJ1dCBub25jZSBzaG91bGQgc3RpbGwgYmUgYXZhaWxhYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjdXN0b21Qcm9jZXNzT3B0aW9uczogSVRlcm1pbmFsUHJvY2Vzc09wdGlvbnMgPSB7XG5cdFx0XHRcdFx0c2hlbGxJbnRlZ3JhdGlvbjogeyBlbmFibGVkOiB0cnVlLCBzdWdnZXN0RW5hYmxlZDogZmFsc2UsIG5vbmNlOiAnY3VzdG9tLW5vbmNlLTEyMzQ1JyB9LFxuXG5cdFx0XHRcdFx0d2luZG93c1VzZUNvbnB0eURsbDogZmFsc2UsXG5cdFx0XHRcdFx0ZW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb25zOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0d29ya3NwYWNlRm9sZGVyOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0aXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQ6IGZhbHNlXG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Ly8gVGVzdCB3aXRoIGFuIHVuc3VwcG9ydGVkIHNoZWxsIChqdWxpYSlcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZ2V0U2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbihcblx0XHRcdFx0XHR7IGV4ZWN1dGFibGU6ICdqdWxpYScsIGFyZ3M6IFsnLWknXSB9LFxuXHRcdFx0XHRcdGN1c3RvbVByb2Nlc3NPcHRpb25zLFxuXHRcdFx0XHRcdGRlZmF1bHRFbnZpcm9ubWVudCxcblx0XHRcdFx0XHRsb2dTZXJ2aWNlLFxuXHRcdFx0XHRcdHByb2R1Y3RTZXJ2aWNlLFxuXHRcdFx0XHRcdHRydWVcblx0XHRcdFx0KTtcblxuXHRcdFx0XHQvLyBTaG91bGQgZmFpbCBkdWUgdG8gdW5zdXBwb3J0ZWQgc2hlbGxcblx0XHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LnR5cGUsICdmYWlsdXJlJyk7XG5cblx0XHRcdFx0Ly8gQnV0IHRoZSBub25jZSBzaG91bGQgYmUgYXZhaWxhYmxlIGluIHRoZSBwcm9jZXNzIG9wdGlvbnMgZm9yIHRoZSB0ZXJtaW5hbCBwcm9jZXNzIHRvIHVzZVxuXHRcdFx0XHRzdHJpY3RFcXVhbChjdXN0b21Qcm9jZXNzT3B0aW9ucy5zaGVsbEludGVncmF0aW9uLm5vbmNlLCAnY3VzdG9tLW5vbmNlLTEyMzQ1Jyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3Nhbml0aXplRW52Rm9yTG9nZ2luZycsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIHVuZGVmaW5lZCBmb3IgdW5kZWZpbmVkIGlucHV0JywgKCkgPT4ge1xuXHRcdFx0c3RyaWN0RXF1YWwoc2FuaXRpemVFbnZGb3JMb2dnaW5nKHVuZGVmaW5lZCksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIGVtcHR5IG9iamVjdCBmb3IgZW1wdHkgaW5wdXQnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoc2FuaXRpemVFbnZGb3JMb2dnaW5nKHt9KSwge30pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHBhc3MgdGhyb3VnaCBub24tc2Vuc2l0aXZlIHZhbHVlcycsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChzYW5pdGl6ZUVudkZvckxvZ2dpbmcoe1xuXHRcdFx0XHRQQVRIOiAnL3Vzci9iaW4nLFxuXHRcdFx0XHRIT01FOiAnL2hvbWUvdXNlcicsXG5cdFx0XHRcdFRFUk06ICd4dGVybS0yNTZjb2xvcidcblx0XHRcdH0pLCB7XG5cdFx0XHRcdFBBVEg6ICcvdXNyL2JpbicsXG5cdFx0XHRcdEhPTUU6ICcvaG9tZS91c2VyJyxcblx0XHRcdFx0VEVSTTogJ3h0ZXJtLTI1NmNvbG9yJ1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmVkYWN0IHNlbnNpdGl2ZSBlbnYgdmFyIG5hbWVzJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHNhbml0aXplRW52Rm9yTG9nZ2luZyh7XG5cdFx0XHRcdEFQSV9LRVk6ICdzZWNyZXQxMjMnLFxuXHRcdFx0XHRHSVRIVUJfVE9LRU46ICdnaHBfeHh4eCcsXG5cdFx0XHRcdE1ZX1NFQ1JFVDogJ2hpZGRlbicsXG5cdFx0XHRcdFBBU1NXT1JEOiAncGFzczEyMycsXG5cdFx0XHRcdEFXU19BQ0NFU1NfS0VZOiAnQUtJQS4uLicsXG5cdFx0XHRcdERBVEFCQVNFX1BBU1NXT1JEOiAnZGJwYXNzJyxcblx0XHRcdFx0Q0xJRU5UX1NFQ1JFVDogJ2NsaWVudF9zZWNyZXRfdmFsdWUnLFxuXHRcdFx0XHRBVVRIX1RPS0VOOiAnYXV0aF92YWx1ZScsXG5cdFx0XHRcdFBSSVZBVEVfS0VZOiAncHJpdmF0ZV9rZXlfdmFsdWUnXG5cdFx0XHR9KSwge1xuXHRcdFx0XHRBUElfS0VZOiAnPFJFREFDVEVEPicsXG5cdFx0XHRcdEdJVEhVQl9UT0tFTjogJzxSRURBQ1RFRD4nLFxuXHRcdFx0XHRNWV9TRUNSRVQ6ICc8UkVEQUNURUQ+Jyxcblx0XHRcdFx0UEFTU1dPUkQ6ICc8UkVEQUNURUQ+Jyxcblx0XHRcdFx0QVdTX0FDQ0VTU19LRVk6ICc8UkVEQUNURUQ+Jyxcblx0XHRcdFx0REFUQUJBU0VfUEFTU1dPUkQ6ICc8UkVEQUNURUQ+Jyxcblx0XHRcdFx0Q0xJRU5UX1NFQ1JFVDogJzxSRURBQ1RFRD4nLFxuXHRcdFx0XHRBVVRIX1RPS0VOOiAnPFJFREFDVEVEPicsXG5cdFx0XHRcdFBSSVZBVEVfS0VZOiAnPFJFREFDVEVEPidcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJlZGFjdCBKV1QgdG9rZW5zIGJ5IHZhbHVlIHBhdHRlcm4nLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoc2FuaXRpemVFbnZGb3JMb2dnaW5nKHtcblx0XHRcdFx0U09NRV9WQVI6ICdleUpoYkdjaU9pSklVekkxTmlJc0luUjVjQ0k2SWtwWFZDSjkuZXlKemRXSWlPaUl4TWpNME5UWTNPRGt3SW4wLmRvempnTnJ5UDRKM2pWbU5IbDB3NU5fWGdMMG4zSTlQbEZVUDBUSHNSOFUnXG5cdFx0XHR9KSwge1xuXHRcdFx0XHRTT01FX1ZBUjogJzxSRURBQ1RFRD4nXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZWRhY3QgR2l0SHViIHRva2VucyBieSB2YWx1ZSBwYXR0ZXJuJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHNhbml0aXplRW52Rm9yTG9nZ2luZyh7XG5cdFx0XHRcdE1ZX0dIOiAnZ2hwX3h4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eCdcblx0XHRcdH0pLCB7XG5cdFx0XHRcdE1ZX0dIOiAnPFJFREFDVEVEPidcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJlZGFjdCBHb29nbGUgQVBJIGtleXMgYnkgdmFsdWUgcGF0dGVybicsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChzYW5pdGl6ZUVudkZvckxvZ2dpbmcoe1xuXHRcdFx0XHRHT09HTEVfS0VZOiAnQUl6YVN5RGFHbVdLYTRKc1haLUhqR3c3SVNMbl8zbmFtQkdld1FlJ1xuXHRcdFx0fSksIHtcblx0XHRcdFx0R09PR0xFX0tFWTogJzxSRURBQ1RFRD4nXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZWRhY3QgbG9uZyBhbHBoYW51bWVyaWMgc3RyaW5ncyAocG90ZW50aWFsIHNlY3JldHMpJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHNhbml0aXplRW52Rm9yTG9nZ2luZyh7XG5cdFx0XHRcdExPTkdfVkFMVUU6ICdhYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ejEyMzQ1Nidcblx0XHRcdH0pLCB7XG5cdFx0XHRcdExPTkdfVkFMVUU6ICc8UkVEQUNURUQ+J1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgc2tpcCB1bmRlZmluZWQgdmFsdWVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZW52OiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB8IHVuZGVmaW5lZCB9ID0ge1xuXHRcdFx0XHRERUZJTkVEOiAndmFsdWUnLFxuXHRcdFx0XHRVTkRFRklORUQ6IHVuZGVmaW5lZFxuXHRcdFx0fTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChzYW5pdGl6ZUVudkZvckxvZ2dpbmcoZW52KSwge1xuXHRcdFx0XHRERUZJTkVEOiAndmFsdWUnXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFNBQVMsaUJBQWlCLElBQUksbUJBQW1CO0FBQ2pELFNBQVMsU0FBUyxnQkFBZ0I7QUFDbEMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxzQkFBc0I7QUFHL0IsU0FBUyw4QkFBd0csNkJBQTZCO0FBQzlJLFNBQVMsaUNBQWlDO0FBRTFDLE1BQU0sd0JBQWlELEVBQUUsa0JBQWtCLEVBQUUsU0FBUyxNQUFNLGdCQUFnQixPQUFPLE9BQU8sR0FBRyxHQUFHLHFCQUFxQixPQUFPLGdDQUFnQyxRQUFXLGlCQUFpQixRQUFXLHlCQUF5QixNQUFNO0FBQ2xRLE1BQU0seUJBQWtELEVBQUUsa0JBQWtCLEVBQUUsU0FBUyxPQUFPLGdCQUFnQixPQUFPLE9BQU8sR0FBRyxHQUFHLHFCQUFxQixPQUFPLGdDQUFnQyxRQUFX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
