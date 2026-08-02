import assert from "assert";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { McpServerType } from "../../../../../../platform/mcp/common/mcpPlatformTypes.js";
import { convertBareEnvVarsToVsCodeSyntax as convertBareEnvVarsToVsCodeSyntaxRaw } from "../../../common/plugins/agentPluginServiceImpl.js";
import { CustomizationType, McpServerStatus } from "../../../../../../platform/agentHost/common/state/protocol/state.js";
function stubMcpCustomization() {
  return { type: CustomizationType.McpServer, id: "stub", uri: "file:///test", name: "test", enabled: true, state: { kind: McpServerStatus.Starting } };
}
function convertBareEnvVarsToVsCodeSyntax(def) {
  return convertBareEnvVarsToVsCodeSyntaxRaw({ ...def, customization: stubMcpCustomization() });
}
suite("convertBareEnvVarsToVsCodeSyntax", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function asStdio(result) {
    assert.strictEqual(result.configuration.type, McpServerType.LOCAL);
    return result.configuration;
  }
  function asRemote(result) {
    assert.strictEqual(result.configuration.type, McpServerType.REMOTE);
    return result.configuration;
  }
  suite("stdio (LOCAL) servers", () => {
    test("converts bare ${VAR} in command to ${env:VAR}", () => {
      const cfg = asStdio(convertBareEnvVarsToVsCodeSyntax({
        name: "test",
        uri: URI.parse("file:///test"),
        configuration: {
          type: McpServerType.LOCAL,
          command: "${MY_TOOL_PATH}/bin/server"
        }
      }));
      assert.strictEqual(cfg.command, "${env:MY_TOOL_PATH}/bin/server");
    });
    test("converts bare ${VAR} in args", () => {
      const cfg = asStdio(convertBareEnvVarsToVsCodeSyntax({
        name: "test",
        uri: URI.parse("file:///test"),
        configuration: {
          type: McpServerType.LOCAL,
          command: "node",
          args: ["--token", "${ENTERPRISE_GITHUB_TOKEN}"]
        }
      }));
      assert.deepStrictEqual(cfg.args, ["--token", "${env:ENTERPRISE_GITHUB_TOKEN}"]);
    });
    test("converts bare ${VAR} in env values", () => {
      const cfg = asStdio(convertBareEnvVarsToVsCodeSyntax({
        name: "test",
        uri: URI.parse("file:///test"),
        configuration: {
          type: McpServerType.LOCAL,
          command: "server",
          env: {
            TOKEN: "${ENTERPRISE_GITHUB_TOKEN}",
            STATIC: "literal-value"
          }
        }
      }));
      assert.strictEqual(cfg.env.TOKEN, "${env:ENTERPRISE_GITHUB_TOKEN}");
      assert.strictEqual(cfg.env.STATIC, "literal-value");
    });
    test("converts bare ${VAR} in cwd", () => {
      const cfg = asStdio(convertBareEnvVarsToVsCodeSyntax({
        name: "test",
        uri: URI.parse("file:///test"),
        configuration: {
          type: McpServerType.LOCAL,
          command: "server",
          cwd: "${PROJECT_DIR}/subdir"
        }
      }));
      assert.strictEqual(cfg.cwd, "${env:PROJECT_DIR}/subdir");
    });
    test("converts bare ${VAR} in envFile", () => {
      const cfg = asStdio(convertBareEnvVarsToVsCodeSyntax({
        name: "test",
        uri: URI.parse("file:///test"),
        configuration: {
          type: McpServerType.LOCAL,
          command: "server",
          envFile: "${HOME}/.env"
        }
      }));
      assert.strictEqual(cfg.envFile, "${env:HOME}/.env");
    });
    test("does not convert already-namespaced ${env:VAR} references", () => {
      const cfg = asStdio(convertBareEnvVarsToVsCodeSyntax({
        name: "test",
        uri: URI.parse("file:///test"),
        configuration: {
          type: McpServerType.LOCAL,
          command: "${env:ALREADY_RESOLVED}/bin/server"
        }
      }));
      assert.strictEqual(cfg.command, "${env:ALREADY_RESOLVED}/bin/server");
    });
    test("does not convert ${config:...} references", () => {
      const cfg = asStdio(convertBareEnvVarsToVsCodeSyntax({
        name: "test",
        uri: URI.parse("file:///test"),
        configuration: {
          type: McpServerType.LOCAL,
          command: "${config:editor.fontSize}"
        }
      }));
      assert.strictEqual(cfg.command, "${config:editor.fontSize}");
    });
    test("does not convert lowercase/camelCase VS Code variable tokens", () => {
      const cfg = asStdio(convertBareEnvVarsToVsCodeSyntax({
        name: "test",
        uri: URI.parse("file:///test"),
        configuration: {
          type: McpServerType.LOCAL,
          command: "${workspaceFolder}/server",
          cwd: "${fileDirname}"
        }
      }));
      assert.strictEqual(cfg.command, "${workspaceFolder}/server");
      assert.strictEqual(cfg.cwd, "${fileDirname}");
    });
    test("converts multiple bare ${VAR} references in a single string", () => {
      const cfg = asStdio(convertBareEnvVarsToVsCodeSyntax({
        name: "test",
        uri: URI.parse("file:///test"),
        configuration: {
          type: McpServerType.LOCAL,
          command: "${BIN_DIR}/run --config ${CONFIG_DIR}/cfg.json"
        }
      }));
      assert.strictEqual(cfg.command, "${env:BIN_DIR}/run --config ${env:CONFIG_DIR}/cfg.json");
    });
    test("leaves strings without any ${VAR} unchanged", () => {
      const cfg = asStdio(convertBareEnvVarsToVsCodeSyntax({
        name: "test",
        uri: URI.parse("file:///test"),
        configuration: {
          type: McpServerType.LOCAL,
          command: "/usr/bin/server",
          args: ["--port", "8080"],
          env: { KEY: "plain-value" }
        }
      }));
      assert.strictEqual(cfg.command, "/usr/bin/server");
      assert.deepStrictEqual(cfg.args, ["--port", "8080"]);
      assert.strictEqual(cfg.env.KEY, "plain-value");
    });
    test("preserves non-string env values (numbers and null)", () => {
      const cfg = asStdio(convertBareEnvVarsToVsCodeSyntax({
        name: "test",
        uri: URI.parse("file:///test"),
        configuration: {
          type: McpServerType.LOCAL,
          command: "server",
          env: {
            PORT: 3e3,
            UNSET: null,
            TOKEN: "${MY_TOKEN}"
          }
        }
      }));
      assert.strictEqual(cfg.env.PORT, 3e3);
      assert.strictEqual(cfg.env.UNSET, null);
      assert.strictEqual(cfg.env.TOKEN, "${env:MY_TOKEN}");
    });
    test("converts underscore-prefixed variable names", () => {
      const cfg = asStdio(convertBareEnvVarsToVsCodeSyntax({
        name: "test",
        uri: URI.parse("file:///test"),
        configuration: {
          type: McpServerType.LOCAL,
          command: "${_PRIVATE_BIN}/server"
        }
      }));
      assert.strictEqual(cfg.command, "${env:_PRIVATE_BIN}/server");
    });
    test("preserves the definition name unchanged", () => {
      const result = convertBareEnvVarsToVsCodeSyntax({
        name: "my-mcp-server",
        uri: URI.parse("file:///test"),
        configuration: {
          type: McpServerType.LOCAL,
          command: "${MY_PATH}/server"
        }
      });
      assert.strictEqual(result.name, "my-mcp-server");
    });
    test("preserves uri as a URI instance", () => {
      const input = URI.parse("file:///plugins/my-plugin");
      const result = convertBareEnvVarsToVsCodeSyntax({
        name: "test",
        uri: input,
        configuration: {
          type: McpServerType.LOCAL,
          command: "${MY_PATH}/server"
        }
      });
      assert.ok(URI.isUri(result.uri), "uri must remain a URI instance");
      assert.strictEqual(result.uri.toString(), input.toString());
    });
  });
  suite("remote (HTTP) servers", () => {
    test("converts bare ${VAR} in url", () => {
      const cfg = asRemote(convertBareEnvVarsToVsCodeSyntax({
        name: "test",
        uri: URI.parse("file:///test"),
        configuration: {
          type: McpServerType.REMOTE,
          url: "https://${API_HOST}/mcp"
        }
      }));
      assert.strictEqual(cfg.url, "https://${env:API_HOST}/mcp");
    });
    test("converts bare ${VAR} in header values", () => {
      const cfg = asRemote(convertBareEnvVarsToVsCodeSyntax({
        name: "test",
        uri: URI.parse("file:///test"),
        configuration: {
          type: McpServerType.REMOTE,
          url: "https://example.com/mcp",
          headers: {
            Authorization: "Bearer ${API_TOKEN}",
            "X-Custom": "static-value"
          }
        }
      }));
      assert.strictEqual(cfg.headers.Authorization, "Bearer ${env:API_TOKEN}");
      assert.strictEqual(cfg.headers["X-Custom"], "static-value");
    });
    test("does not convert already-namespaced ${env:VAR} in url", () => {
      const cfg = asRemote(convertBareEnvVarsToVsCodeSyntax({
        name: "test",
        uri: URI.parse("file:///test"),
        configuration: {
          type: McpServerType.REMOTE,
          url: "https://${env:API_HOST}/mcp"
        }
      }));
      assert.strictEqual(cfg.url, "https://${env:API_HOST}/mcp");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vcGx1Z2lucy9jb252ZXJ0QmFyZUVudlZhcnNUb1ZzQ29kZVN5bnRheC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSU1jcFJlbW90ZVNlcnZlckNvbmZpZ3VyYXRpb24sIElNY3BTdGRpb1NlcnZlckNvbmZpZ3VyYXRpb24sIE1jcFNlcnZlclR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tY3AvY29tbW9uL21jcFBsYXRmb3JtVHlwZXMuanMnO1xuaW1wb3J0IHsgY29udmVydEJhcmVFbnZWYXJzVG9Wc0NvZGVTeW50YXggYXMgY29udmVydEJhcmVFbnZWYXJzVG9Wc0NvZGVTeW50YXhSYXcgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcGx1Z2lucy9hZ2VudFBsdWdpblNlcnZpY2VJbXBsLmpzJztcbmltcG9ydCB7IEN1c3RvbWl6YXRpb25UeXBlLCBNY3BTZXJ2ZXJTdGF0dXMsIHR5cGUgTWNwU2VydmVyQ3VzdG9taXphdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHR5cGUgeyBJTWNwU2VydmVyRGVmaW5pdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50UGx1Z2lucy9jb21tb24vcGx1Z2luUGFyc2Vycy5qcyc7XG5cbmZ1bmN0aW9uIHN0dWJNY3BDdXN0b21pemF0aW9uKCk6IE1jcFNlcnZlckN1c3RvbWl6YXRpb24ge1xuXHRyZXR1cm4geyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIsIGlkOiAnc3R1YicsIHVyaTogJ2ZpbGU6Ly8vdGVzdCcsIG5hbWU6ICd0ZXN0JywgZW5hYmxlZDogdHJ1ZSwgc3RhdGU6IHsga2luZDogTWNwU2VydmVyU3RhdHVzLlN0YXJ0aW5nIH0gfTtcbn1cblxuLyoqXG4gKiBXcmFwcyB0aGUgcHJvZHVjdGlvbiB7QGxpbmsgY29udmVydEJhcmVFbnZWYXJzVG9Wc0NvZGVTeW50YXhSYXd9IHNvIHRlc3RzXG4gKiBkb24ndCBoYXZlIHRvIHNwZWxsIG91dCB0aGUgcHJvdG9jb2wtbGV2ZWwgYGN1c3RvbWl6YXRpb25gIHByb2plY3Rpb24gb25cbiAqIGV2ZXJ5IGZpeHR1cmUgXHUyMDE0IHRoZSBlbnYtdmFyIGNvbnZlcnNpb24gbmV2ZXIgdG91Y2hlcyBpdC5cbiAqL1xuZnVuY3Rpb24gY29udmVydEJhcmVFbnZWYXJzVG9Wc0NvZGVTeW50YXgoZGVmOiBPbWl0PElNY3BTZXJ2ZXJEZWZpbml0aW9uLCAnY3VzdG9taXphdGlvbic+KSB7XG5cdHJldHVybiBjb252ZXJ0QmFyZUVudlZhcnNUb1ZzQ29kZVN5bnRheFJhdyh7IC4uLmRlZiwgY3VzdG9taXphdGlvbjogc3R1Yk1jcEN1c3RvbWl6YXRpb24oKSB9KTtcbn1cblxuc3VpdGUoJ2NvbnZlcnRCYXJlRW52VmFyc1RvVnNDb2RlU3ludGF4JywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHQvKiogSGVscGVyIHRvIG5hcnJvdyB0aGUgcmVzdWx0IGNvbmZpZ3VyYXRpb24gdG8gYSBzdGRpbyBzZXJ2ZXIuICovXG5cdGZ1bmN0aW9uIGFzU3RkaW8ocmVzdWx0OiBSZXR1cm5UeXBlPHR5cGVvZiBjb252ZXJ0QmFyZUVudlZhcnNUb1ZzQ29kZVN5bnRheD4pOiBJTWNwU3RkaW9TZXJ2ZXJDb25maWd1cmF0aW9uIHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbmZpZ3VyYXRpb24udHlwZSwgTWNwU2VydmVyVHlwZS5MT0NBTCk7XG5cdFx0cmV0dXJuIHJlc3VsdC5jb25maWd1cmF0aW9uIGFzIElNY3BTdGRpb1NlcnZlckNvbmZpZ3VyYXRpb247XG5cdH1cblxuXHQvKiogSGVscGVyIHRvIG5hcnJvdyB0aGUgcmVzdWx0IGNvbmZpZ3VyYXRpb24gdG8gYSByZW1vdGUgc2VydmVyLiAqL1xuXHRmdW5jdGlvbiBhc1JlbW90ZShyZXN1bHQ6IFJldHVyblR5cGU8dHlwZW9mIGNvbnZlcnRCYXJlRW52VmFyc1RvVnNDb2RlU3ludGF4Pik6IElNY3BSZW1vdGVTZXJ2ZXJDb25maWd1cmF0aW9uIHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbmZpZ3VyYXRpb24udHlwZSwgTWNwU2VydmVyVHlwZS5SRU1PVEUpO1xuXHRcdHJldHVybiByZXN1bHQuY29uZmlndXJhdGlvbiBhcyBJTWNwUmVtb3RlU2VydmVyQ29uZmlndXJhdGlvbjtcblx0fVxuXG5cdHN1aXRlKCdzdGRpbyAoTE9DQUwpIHNlcnZlcnMnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdjb252ZXJ0cyBiYXJlICR7VkFSfSBpbiBjb21tYW5kIHRvICR7ZW52OlZBUn0nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjZmcgPSBhc1N0ZGlvKGNvbnZlcnRCYXJlRW52VmFyc1RvVnNDb2RlU3ludGF4KHtcblx0XHRcdFx0bmFtZTogJ3Rlc3QnLFxuXHRcdFx0XHR1cmk6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0JyksXG5cdFx0XHRcdGNvbmZpZ3VyYXRpb246IHtcblx0XHRcdFx0XHR0eXBlOiBNY3BTZXJ2ZXJUeXBlLkxPQ0FMLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICcke01ZX1RPT0xfUEFUSH0vYmluL3NlcnZlcicsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2ZnLmNvbW1hbmQsICcke2VudjpNWV9UT09MX1BBVEh9L2Jpbi9zZXJ2ZXInKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbnZlcnRzIGJhcmUgJHtWQVJ9IGluIGFyZ3MnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjZmcgPSBhc1N0ZGlvKGNvbnZlcnRCYXJlRW52VmFyc1RvVnNDb2RlU3ludGF4KHtcblx0XHRcdFx0bmFtZTogJ3Rlc3QnLFxuXHRcdFx0XHR1cmk6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0JyksXG5cdFx0XHRcdGNvbmZpZ3VyYXRpb246IHtcblx0XHRcdFx0XHR0eXBlOiBNY3BTZXJ2ZXJUeXBlLkxPQ0FMLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICdub2RlJyxcblx0XHRcdFx0XHRhcmdzOiBbJy0tdG9rZW4nLCAnJHtFTlRFUlBSSVNFX0dJVEhVQl9UT0tFTn0nXSxcblx0XHRcdFx0fSxcblx0XHRcdH0pKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2ZnLmFyZ3MsIFsnLS10b2tlbicsICcke2VudjpFTlRFUlBSSVNFX0dJVEhVQl9UT0tFTn0nXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb252ZXJ0cyBiYXJlICR7VkFSfSBpbiBlbnYgdmFsdWVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2ZnID0gYXNTdGRpbyhjb252ZXJ0QmFyZUVudlZhcnNUb1ZzQ29kZVN5bnRheCh7XG5cdFx0XHRcdG5hbWU6ICd0ZXN0Jyxcblx0XHRcdFx0dXJpOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdCcpLFxuXHRcdFx0XHRjb25maWd1cmF0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogTWNwU2VydmVyVHlwZS5MT0NBTCxcblx0XHRcdFx0XHRjb21tYW5kOiAnc2VydmVyJyxcblx0XHRcdFx0XHRlbnY6IHtcblx0XHRcdFx0XHRcdFRPS0VOOiAnJHtFTlRFUlBSSVNFX0dJVEhVQl9UT0tFTn0nLFxuXHRcdFx0XHRcdFx0U1RBVElDOiAnbGl0ZXJhbC12YWx1ZScsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdH0pKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZmcuZW52IS5UT0tFTiwgJyR7ZW52OkVOVEVSUFJJU0VfR0lUSFVCX1RPS0VOfScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNmZy5lbnYhLlNUQVRJQywgJ2xpdGVyYWwtdmFsdWUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbnZlcnRzIGJhcmUgJHtWQVJ9IGluIGN3ZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNmZyA9IGFzU3RkaW8oY29udmVydEJhcmVFbnZWYXJzVG9Wc0NvZGVTeW50YXgoe1xuXHRcdFx0XHRuYW1lOiAndGVzdCcsXG5cdFx0XHRcdHVyaTogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QnKSxcblx0XHRcdFx0Y29uZmlndXJhdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IE1jcFNlcnZlclR5cGUuTE9DQUwsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ3NlcnZlcicsXG5cdFx0XHRcdFx0Y3dkOiAnJHtQUk9KRUNUX0RJUn0vc3ViZGlyJyxcblx0XHRcdFx0fSxcblx0XHRcdH0pKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZmcuY3dkLCAnJHtlbnY6UFJPSkVDVF9ESVJ9L3N1YmRpcicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29udmVydHMgYmFyZSAke1ZBUn0gaW4gZW52RmlsZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGNmZyA9IGFzU3RkaW8oY29udmVydEJhcmVFbnZWYXJzVG9Wc0NvZGVTeW50YXgoe1xuXHRcdFx0XHRuYW1lOiAndGVzdCcsXG5cdFx0XHRcdHVyaTogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QnKSxcblx0XHRcdFx0Y29uZmlndXJhdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IE1jcFNlcnZlclR5cGUuTE9DQUwsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ3NlcnZlcicsXG5cdFx0XHRcdFx0ZW52RmlsZTogJyR7SE9NRX0vLmVudicsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2ZnLmVudkZpbGUsICcke2VudjpIT01FfS8uZW52Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBjb252ZXJ0IGFscmVhZHktbmFtZXNwYWNlZCAke2VudjpWQVJ9IHJlZmVyZW5jZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjZmcgPSBhc1N0ZGlvKGNvbnZlcnRCYXJlRW52VmFyc1RvVnNDb2RlU3ludGF4KHtcblx0XHRcdFx0bmFtZTogJ3Rlc3QnLFxuXHRcdFx0XHR1cmk6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0JyksXG5cdFx0XHRcdGNvbmZpZ3VyYXRpb246IHtcblx0XHRcdFx0XHR0eXBlOiBNY3BTZXJ2ZXJUeXBlLkxPQ0FMLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICcke2VudjpBTFJFQURZX1JFU09MVkVEfS9iaW4vc2VydmVyJyxcblx0XHRcdFx0fSxcblx0XHRcdH0pKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZmcuY29tbWFuZCwgJyR7ZW52OkFMUkVBRFlfUkVTT0xWRUR9L2Jpbi9zZXJ2ZXInKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IGNvbnZlcnQgJHtjb25maWc6Li4ufSByZWZlcmVuY2VzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2ZnID0gYXNTdGRpbyhjb252ZXJ0QmFyZUVudlZhcnNUb1ZzQ29kZVN5bnRheCh7XG5cdFx0XHRcdG5hbWU6ICd0ZXN0Jyxcblx0XHRcdFx0dXJpOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdCcpLFxuXHRcdFx0XHRjb25maWd1cmF0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogTWNwU2VydmVyVHlwZS5MT0NBTCxcblx0XHRcdFx0XHRjb21tYW5kOiAnJHtjb25maWc6ZWRpdG9yLmZvbnRTaXplfScsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2ZnLmNvbW1hbmQsICcke2NvbmZpZzplZGl0b3IuZm9udFNpemV9Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBjb252ZXJ0IGxvd2VyY2FzZS9jYW1lbENhc2UgVlMgQ29kZSB2YXJpYWJsZSB0b2tlbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjZmcgPSBhc1N0ZGlvKGNvbnZlcnRCYXJlRW52VmFyc1RvVnNDb2RlU3ludGF4KHtcblx0XHRcdFx0bmFtZTogJ3Rlc3QnLFxuXHRcdFx0XHR1cmk6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0JyksXG5cdFx0XHRcdGNvbmZpZ3VyYXRpb246IHtcblx0XHRcdFx0XHR0eXBlOiBNY3BTZXJ2ZXJUeXBlLkxPQ0FMLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICcke3dvcmtzcGFjZUZvbGRlcn0vc2VydmVyJyxcblx0XHRcdFx0XHRjd2Q6ICcke2ZpbGVEaXJuYW1lfScsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2ZnLmNvbW1hbmQsICcke3dvcmtzcGFjZUZvbGRlcn0vc2VydmVyJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2ZnLmN3ZCwgJyR7ZmlsZURpcm5hbWV9Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb252ZXJ0cyBtdWx0aXBsZSBiYXJlICR7VkFSfSByZWZlcmVuY2VzIGluIGEgc2luZ2xlIHN0cmluZycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNmZyA9IGFzU3RkaW8oY29udmVydEJhcmVFbnZWYXJzVG9Wc0NvZGVTeW50YXgoe1xuXHRcdFx0XHRuYW1lOiAndGVzdCcsXG5cdFx0XHRcdHVyaTogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QnKSxcblx0XHRcdFx0Y29uZmlndXJhdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IE1jcFNlcnZlclR5cGUuTE9DQUwsXG5cdFx0XHRcdFx0Y29tbWFuZDogJyR7QklOX0RJUn0vcnVuIC0tY29uZmlnICR7Q09ORklHX0RJUn0vY2ZnLmpzb24nLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNmZy5jb21tYW5kLCAnJHtlbnY6QklOX0RJUn0vcnVuIC0tY29uZmlnICR7ZW52OkNPTkZJR19ESVJ9L2NmZy5qc29uJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdsZWF2ZXMgc3RyaW5ncyB3aXRob3V0IGFueSAke1ZBUn0gdW5jaGFuZ2VkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2ZnID0gYXNTdGRpbyhjb252ZXJ0QmFyZUVudlZhcnNUb1ZzQ29kZVN5bnRheCh7XG5cdFx0XHRcdG5hbWU6ICd0ZXN0Jyxcblx0XHRcdFx0dXJpOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdCcpLFxuXHRcdFx0XHRjb25maWd1cmF0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogTWNwU2VydmVyVHlwZS5MT0NBTCxcblx0XHRcdFx0XHRjb21tYW5kOiAnL3Vzci9iaW4vc2VydmVyJyxcblx0XHRcdFx0XHRhcmdzOiBbJy0tcG9ydCcsICc4MDgwJ10sXG5cdFx0XHRcdFx0ZW52OiB7IEtFWTogJ3BsYWluLXZhbHVlJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNmZy5jb21tYW5kLCAnL3Vzci9iaW4vc2VydmVyJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNmZy5hcmdzLCBbJy0tcG9ydCcsICc4MDgwJ10pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNmZy5lbnYhLktFWSwgJ3BsYWluLXZhbHVlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcmVzZXJ2ZXMgbm9uLXN0cmluZyBlbnYgdmFsdWVzIChudW1iZXJzIGFuZCBudWxsKScsICgpID0+IHtcblx0XHRcdGNvbnN0IGNmZyA9IGFzU3RkaW8oY29udmVydEJhcmVFbnZWYXJzVG9Wc0NvZGVTeW50YXgoe1xuXHRcdFx0XHRuYW1lOiAndGVzdCcsXG5cdFx0XHRcdHVyaTogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QnKSxcblx0XHRcdFx0Y29uZmlndXJhdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IE1jcFNlcnZlclR5cGUuTE9DQUwsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ3NlcnZlcicsXG5cdFx0XHRcdFx0ZW52OiB7XG5cdFx0XHRcdFx0XHRQT1JUOiAzMDAwLFxuXHRcdFx0XHRcdFx0VU5TRVQ6IG51bGwsXG5cdFx0XHRcdFx0XHRUT0tFTjogJyR7TVlfVE9LRU59Jyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNmZy5lbnYhLlBPUlQsIDMwMDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNmZy5lbnYhLlVOU0VULCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZmcuZW52IS5UT0tFTiwgJyR7ZW52Ok1ZX1RPS0VOfScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29udmVydHMgdW5kZXJzY29yZS1wcmVmaXhlZCB2YXJpYWJsZSBuYW1lcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNmZyA9IGFzU3RkaW8oY29udmVydEJhcmVFbnZWYXJzVG9Wc0NvZGVTeW50YXgoe1xuXHRcdFx0XHRuYW1lOiAndGVzdCcsXG5cdFx0XHRcdHVyaTogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QnKSxcblx0XHRcdFx0Y29uZmlndXJhdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IE1jcFNlcnZlclR5cGUuTE9DQUwsXG5cdFx0XHRcdFx0Y29tbWFuZDogJyR7X1BSSVZBVEVfQklOfS9zZXJ2ZXInLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNmZy5jb21tYW5kLCAnJHtlbnY6X1BSSVZBVEVfQklOfS9zZXJ2ZXInKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ByZXNlcnZlcyB0aGUgZGVmaW5pdGlvbiBuYW1lIHVuY2hhbmdlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNvbnZlcnRCYXJlRW52VmFyc1RvVnNDb2RlU3ludGF4KHtcblx0XHRcdFx0bmFtZTogJ215LW1jcC1zZXJ2ZXInLFxuXHRcdFx0XHR1cmk6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0JyksXG5cdFx0XHRcdGNvbmZpZ3VyYXRpb246IHtcblx0XHRcdFx0XHR0eXBlOiBNY3BTZXJ2ZXJUeXBlLkxPQ0FMLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICcke01ZX1BBVEh9L3NlcnZlcicsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubmFtZSwgJ215LW1jcC1zZXJ2ZXInKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ByZXNlcnZlcyB1cmkgYXMgYSBVUkkgaW5zdGFuY2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IFVSSS5wYXJzZSgnZmlsZTovLy9wbHVnaW5zL215LXBsdWdpbicpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY29udmVydEJhcmVFbnZWYXJzVG9Wc0NvZGVTeW50YXgoe1xuXHRcdFx0XHRuYW1lOiAndGVzdCcsXG5cdFx0XHRcdHVyaTogaW5wdXQsXG5cdFx0XHRcdGNvbmZpZ3VyYXRpb246IHtcblx0XHRcdFx0XHR0eXBlOiBNY3BTZXJ2ZXJUeXBlLkxPQ0FMLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICcke01ZX1BBVEh9L3NlcnZlcicsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5vayhVUkkuaXNVcmkocmVzdWx0LnVyaSksICd1cmkgbXVzdCByZW1haW4gYSBVUkkgaW5zdGFuY2UnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudXJpLnRvU3RyaW5nKCksIGlucHV0LnRvU3RyaW5nKCkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncmVtb3RlIChIVFRQKSBzZXJ2ZXJzJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnY29udmVydHMgYmFyZSAke1ZBUn0gaW4gdXJsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2ZnID0gYXNSZW1vdGUoY29udmVydEJhcmVFbnZWYXJzVG9Wc0NvZGVTeW50YXgoe1xuXHRcdFx0XHRuYW1lOiAndGVzdCcsXG5cdFx0XHRcdHVyaTogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QnKSxcblx0XHRcdFx0Y29uZmlndXJhdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IE1jcFNlcnZlclR5cGUuUkVNT1RFLFxuXHRcdFx0XHRcdHVybDogJ2h0dHBzOi8vJHtBUElfSE9TVH0vbWNwJyxcblx0XHRcdFx0fSxcblx0XHRcdH0pKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZmcudXJsLCAnaHR0cHM6Ly8ke2VudjpBUElfSE9TVH0vbWNwJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb252ZXJ0cyBiYXJlICR7VkFSfSBpbiBoZWFkZXIgdmFsdWVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2ZnID0gYXNSZW1vdGUoY29udmVydEJhcmVFbnZWYXJzVG9Wc0NvZGVTeW50YXgoe1xuXHRcdFx0XHRuYW1lOiAndGVzdCcsXG5cdFx0XHRcdHVyaTogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QnKSxcblx0XHRcdFx0Y29uZmlndXJhdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IE1jcFNlcnZlclR5cGUuUkVNT1RFLFxuXHRcdFx0XHRcdHVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vbWNwJyxcblx0XHRcdFx0XHRoZWFkZXJzOiB7XG5cdFx0XHRcdFx0XHRBdXRob3JpemF0aW9uOiAnQmVhcmVyICR7QVBJX1RPS0VOfScsXG5cdFx0XHRcdFx0XHQnWC1DdXN0b20nOiAnc3RhdGljLXZhbHVlJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNmZy5oZWFkZXJzIS5BdXRob3JpemF0aW9uLCAnQmVhcmVyICR7ZW52OkFQSV9UT0tFTn0nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZmcuaGVhZGVycyFbJ1gtQ3VzdG9tJ10sICdzdGF0aWMtdmFsdWUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IGNvbnZlcnQgYWxyZWFkeS1uYW1lc3BhY2VkICR7ZW52OlZBUn0gaW4gdXJsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2ZnID0gYXNSZW1vdGUoY29udmVydEJhcmVFbnZWYXJzVG9Wc0NvZGVTeW50YXgoe1xuXHRcdFx0XHRuYW1lOiAndGVzdCcsXG5cdFx0XHRcdHVyaTogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QnKSxcblx0XHRcdFx0Y29uZmlndXJhdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IE1jcFNlcnZlclR5cGUuUkVNT1RFLFxuXHRcdFx0XHRcdHVybDogJ2h0dHBzOi8vJHtlbnY6QVBJX0hPU1R9L21jcCcsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2ZnLnVybCwgJ2h0dHBzOi8vJHtlbnY6QVBJX0hPU1R9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
