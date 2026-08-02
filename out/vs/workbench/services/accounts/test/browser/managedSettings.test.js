import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { adaptManagedSettings } from "../../browser/managedSettings.js";
suite("adaptManagedSettings", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("empty response yields an empty managed settings bag", () => {
    assert.deepStrictEqual(adaptManagedSettings({}), {
      managedSettings: {}
    });
  });
  test("normalizes permissions into a dot-path managed setting", () => {
    assert.deepStrictEqual(adaptManagedSettings({
      permissions: { disableBypassPermissionsMode: "disable" }
    }), {
      managedSettings: {
        "permissions.disableBypassPermissionsMode": "disable"
      }
    });
  });
  test("carries enabledPlugins as a canonical JSON string under a single key", () => {
    const response = {
      enabledPlugins: {
        "assign-issue-to-copilot@agent-skills": true,
        "my-plugin@acme": false
      }
    };
    assert.deepStrictEqual(adaptManagedSettings(response), {
      managedSettings: {
        enabledPlugins: '{"assign-issue-to-copilot@agent-skills":true,"my-plugin@acme":false}'
      }
    });
  });
  test("carries strictKnownMarketplaces as a canonical JSON string under a single key", () => {
    assert.deepStrictEqual(adaptManagedSettings({
      strictKnownMarketplaces: [{ source: "github", repo: "rwoll/markdown-review" }]
    }), {
      managedSettings: {
        strictKnownMarketplaces: '[{"source":"github","repo":"rwoll/markdown-review"}]'
      }
    });
  });
  test("carries an empty strictKnownMarketplaces array (lockdown) as a JSON string", () => {
    assert.deepStrictEqual(adaptManagedSettings({ strictKnownMarketplaces: [] }), {
      managedSettings: { strictKnownMarketplaces: "[]" }
    });
  });
  test("carries allowedMcpServers as a canonical JSON string under a single key", () => {
    assert.deepStrictEqual(adaptManagedSettings({
      allowedMcpServers: [
        { serverName: "github" },
        { serverUrl: "https://mcp.example.com/*" },
        { serverCommand: ["npx", "-y", "server"] }
      ]
    }), {
      managedSettings: {
        allowedMcpServers: '[{"serverName":"github"},{"serverUrl":"https://mcp.example.com/*"},{"serverCommand":["npx","-y","server"]}]'
      }
    });
  });
  test("carries an empty allowedMcpServers array as a JSON string", () => {
    assert.deepStrictEqual(adaptManagedSettings({ allowedMcpServers: [] }), {
      managedSettings: { allowedMcpServers: "[]" }
    });
  });
  test("carries deniedMcpServers as a canonical JSON string under a single key", () => {
    assert.deepStrictEqual(adaptManagedSettings({
      deniedMcpServers: [
        { serverName: "blocked" },
        { serverUrl: "https://*.untrusted.example.com/*" }
      ]
    }), {
      managedSettings: {
        deniedMcpServers: '[{"serverName":"blocked"},{"serverUrl":"https://*.untrusted.example.com/*"}]'
      }
    });
  });
  test("carries customization lockdown controls", () => {
    assert.deepStrictEqual(adaptManagedSettings({
      strictPluginOnlyCustomization: true,
      allowManagedMcpServersOnly: true,
      allowManagedHooksOnly: true
    }), {
      managedSettings: {
        strictPluginOnlyCustomization: true,
        allowManagedMcpServersOnly: true,
        allowManagedHooksOnly: true
      }
    });
  });
  test("flattens scalar telemetry leaves and carries resourceAttributes and headers as single JSON keys", () => {
    assert.deepStrictEqual(adaptManagedSettings({
      telemetry: {
        enabled: true,
        serviceName: "acme-copilot",
        resourceAttributes: { "deployment.environment": "prod", "service.namespace": "acme" },
        headers: { "x-api-key": "secret" }
      }
    }), {
      managedSettings: {
        "telemetry.enabled": true,
        "telemetry.serviceName": "acme-copilot",
        "telemetry.resourceAttributes": '{"deployment.environment":"prod","service.namespace":"acme"}',
        "telemetry.headers": '{"x-api-key":"secret"}'
      }
    });
  });
  test("encodes github marketplaces as a { name: shorthand } JSON dict", () => {
    assert.deepStrictEqual(adaptManagedSettings({
      extraKnownMarketplaces: {
        "a": { source: { source: "github", repo: "github/agent-skills" } },
        "b": { source: { source: "github", repo: "acme/things", ref: "main" } }
      }
    }), {
      managedSettings: {
        extraKnownMarketplaces: '{"a":"github/agent-skills","b":"acme/things#main"}'
      }
    });
  });
  test("encodes git marketplaces as a { name: url } JSON dict", () => {
    assert.deepStrictEqual(adaptManagedSettings({
      extraKnownMarketplaces: {
        "a": { source: { source: "git", url: "https://example.com/repo.git" } },
        "b": { source: { source: "git", url: "ssh://git@host/path.git", ref: "v1" } }
      }
    }), {
      managedSettings: {
        extraKnownMarketplaces: '{"a":"https://example.com/repo.git","b":"ssh://git@host/path.git#v1"}'
      }
    });
  });
  test("encodes mixed github + git marketplaces, dedups by name", () => {
    assert.deepStrictEqual(adaptManagedSettings({
      extraKnownMarketplaces: {
        "a": { source: { source: "github", repo: "a/b" } },
        "b": { source: { source: "git", url: "https://example.com/r.git" } }
      }
    }), {
      managedSettings: {
        extraKnownMarketplaces: '{"a":"a/b","b":"https://example.com/r.git"}'
      }
    });
  });
  test("handles a full populated response (all three structured settings together)", () => {
    assert.deepStrictEqual(adaptManagedSettings({
      enabledPlugins: { "p@m": true },
      extraKnownMarketplaces: {
        "a": { source: { source: "github", repo: "a/b", ref: "r" } }
      },
      strictKnownMarketplaces: [{ source: "github", repo: "a/b" }]
    }), {
      managedSettings: {
        strictKnownMarketplaces: '[{"source":"github","repo":"a/b"}]',
        enabledPlugins: '{"p@m":true}',
        extraKnownMarketplaces: '{"a":"a/b#r"}'
      }
    });
  });
  test("resilience: unknown scalar keys flatten into the bag alongside structured keys", () => {
    assert.deepStrictEqual(adaptManagedSettings({
      enabledPlugins: { "p@m": true },
      strictKnownMarketplaces: [],
      joshsFakeSetting: true
    }), {
      managedSettings: {
        strictKnownMarketplaces: "[]",
        joshsFakeSetting: true,
        enabledPlugins: '{"p@m":true}'
      }
    });
  });
  test("resilience: a server-sent own `__proto__` key is carried like any scalar, never applied to the prototype", () => {
    const response = JSON.parse('{"permissions":{"x":1},"__proto__":{"polluted":true}}');
    assert.deepStrictEqual(adaptManagedSettings(response), {
      managedSettings: {
        "permissions.x": 1,
        "__proto__.polluted": true
      }
    });
  });
  test("resilience: a primitive own `__proto__` scalar is dropped, never pollutes the result", () => {
    const response = JSON.parse('{"permissions":{"x":1},"__proto__":true}');
    assert.deepStrictEqual(adaptManagedSettings(response), {
      managedSettings: {
        "permissions.x": 1
      }
    });
  });
  test("resilience: malformed marketplace entries are skipped, valid entries still processed", () => {
    const warnings = [];
    const result = adaptManagedSettings({
      extraKnownMarketplaces: {
        "good": { source: { source: "github", repo: "a/b" } },
        "bad-no-source": {},
        "bad-unknown-type": { source: { source: "ftp", url: "ftp://x" } }
      }
    }, (msg) => warnings.push(msg));
    assert.deepStrictEqual(result, {
      managedSettings: {
        extraKnownMarketplaces: '{"good":"a/b"}'
      }
    });
    assert.strictEqual(warnings.length, 2);
  });
  test('resilience: extraKnownMarketplaces github entry missing "repo" is skipped with a warning', () => {
    const warnings = [];
    const result = adaptManagedSettings({
      extraKnownMarketplaces: {
        "example-key": { source: { source: "github" } }
      }
    }, (msg) => warnings.push(msg));
    assert.deepStrictEqual(
      { result, warned: warnings.length, mentionsRepo: warnings.some((w) => w.includes('requires "repo"')) },
      { result: { managedSettings: {} }, warned: 1, mentionsRepo: true }
    );
  });
  test("resilience: a marketplace string array (wrong format) is treated as missing, no throw", () => {
    assert.deepStrictEqual(adaptManagedSettings({
      extraKnownMarketplaces: ["https://plugins.acme.com"]
    }), {
      managedSettings: {}
    });
  });
  test("resilience: telemetry map keys that could pollute the prototype are dropped", () => {
    const response = JSON.parse('{"telemetry":{"resourceAttributes":{"__proto__":"polluted","constructor":"x","service.namespace":"acme"}}}');
    assert.deepStrictEqual(adaptManagedSettings(response), {
      managedSettings: {
        "telemetry.resourceAttributes": '{"service.namespace":"acme"}'
      }
    });
    assert.strictEqual({}.polluted, void 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9hY2NvdW50cy90ZXN0L2Jyb3dzZXIvbWFuYWdlZFNldHRpbmdzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IGFkYXB0TWFuYWdlZFNldHRpbmdzLCBJTWFuYWdlZFNldHRpbmdzUmVzcG9uc2UgfSBmcm9tICcuLi8uLi9icm93c2VyL21hbmFnZWRTZXR0aW5ncy5qcyc7XG5cbnN1aXRlKCdhZGFwdE1hbmFnZWRTZXR0aW5ncycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdlbXB0eSByZXNwb25zZSB5aWVsZHMgYW4gZW1wdHkgbWFuYWdlZCBzZXR0aW5ncyBiYWcnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZGFwdE1hbmFnZWRTZXR0aW5ncyh7fSksIHtcblx0XHRcdG1hbmFnZWRTZXR0aW5nczoge30sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vcm1hbGl6ZXMgcGVybWlzc2lvbnMgaW50byBhIGRvdC1wYXRoIG1hbmFnZWQgc2V0dGluZycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFkYXB0TWFuYWdlZFNldHRpbmdzKHtcblx0XHRcdHBlcm1pc3Npb25zOiB7IGRpc2FibGVCeXBhc3NQZXJtaXNzaW9uc01vZGU6ICdkaXNhYmxlJyB9LFxuXHRcdH0pLCB7XG5cdFx0XHRtYW5hZ2VkU2V0dGluZ3M6IHtcblx0XHRcdFx0J3Blcm1pc3Npb25zLmRpc2FibGVCeXBhc3NQZXJtaXNzaW9uc01vZGUnOiAnZGlzYWJsZScsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYXJyaWVzIGVuYWJsZWRQbHVnaW5zIGFzIGEgY2Fub25pY2FsIEpTT04gc3RyaW5nIHVuZGVyIGEgc2luZ2xlIGtleScsICgpID0+IHtcblx0XHRjb25zdCByZXNwb25zZTogSU1hbmFnZWRTZXR0aW5nc1Jlc3BvbnNlID0ge1xuXHRcdFx0ZW5hYmxlZFBsdWdpbnM6IHtcblx0XHRcdFx0J2Fzc2lnbi1pc3N1ZS10by1jb3BpbG90QGFnZW50LXNraWxscyc6IHRydWUsXG5cdFx0XHRcdCdteS1wbHVnaW5AYWNtZSc6IGZhbHNlLFxuXHRcdFx0fSxcblx0XHR9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWRhcHRNYW5hZ2VkU2V0dGluZ3MocmVzcG9uc2UpLCB7XG5cdFx0XHRtYW5hZ2VkU2V0dGluZ3M6IHtcblx0XHRcdFx0ZW5hYmxlZFBsdWdpbnM6ICd7XCJhc3NpZ24taXNzdWUtdG8tY29waWxvdEBhZ2VudC1za2lsbHNcIjp0cnVlLFwibXktcGx1Z2luQGFjbWVcIjpmYWxzZX0nLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY2FycmllcyBzdHJpY3RLbm93bk1hcmtldHBsYWNlcyBhcyBhIGNhbm9uaWNhbCBKU09OIHN0cmluZyB1bmRlciBhIHNpbmdsZSBrZXknLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZGFwdE1hbmFnZWRTZXR0aW5ncyh7XG5cdFx0XHRzdHJpY3RLbm93bk1hcmtldHBsYWNlczogW3sgc291cmNlOiAnZ2l0aHViJywgcmVwbzogJ3J3b2xsL21hcmtkb3duLXJldmlldycgfV0sXG5cdFx0fSksIHtcblx0XHRcdG1hbmFnZWRTZXR0aW5nczoge1xuXHRcdFx0XHRzdHJpY3RLbm93bk1hcmtldHBsYWNlczogJ1t7XCJzb3VyY2VcIjpcImdpdGh1YlwiLFwicmVwb1wiOlwicndvbGwvbWFya2Rvd24tcmV2aWV3XCJ9XScsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYXJyaWVzIGFuIGVtcHR5IHN0cmljdEtub3duTWFya2V0cGxhY2VzIGFycmF5IChsb2NrZG93bikgYXMgYSBKU09OIHN0cmluZycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFkYXB0TWFuYWdlZFNldHRpbmdzKHsgc3RyaWN0S25vd25NYXJrZXRwbGFjZXM6IFtdIH0pLCB7XG5cdFx0XHRtYW5hZ2VkU2V0dGluZ3M6IHsgc3RyaWN0S25vd25NYXJrZXRwbGFjZXM6ICdbXScgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY2FycmllcyBhbGxvd2VkTWNwU2VydmVycyBhcyBhIGNhbm9uaWNhbCBKU09OIHN0cmluZyB1bmRlciBhIHNpbmdsZSBrZXknLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZGFwdE1hbmFnZWRTZXR0aW5ncyh7XG5cdFx0XHRhbGxvd2VkTWNwU2VydmVyczogW1xuXHRcdFx0XHR7IHNlcnZlck5hbWU6ICdnaXRodWInIH0sXG5cdFx0XHRcdHsgc2VydmVyVXJsOiAnaHR0cHM6Ly9tY3AuZXhhbXBsZS5jb20vKicgfSxcblx0XHRcdFx0eyBzZXJ2ZXJDb21tYW5kOiBbJ25weCcsICcteScsICdzZXJ2ZXInXSB9LFxuXHRcdFx0XSxcblx0XHR9KSwge1xuXHRcdFx0bWFuYWdlZFNldHRpbmdzOiB7XG5cdFx0XHRcdGFsbG93ZWRNY3BTZXJ2ZXJzOiAnW3tcInNlcnZlck5hbWVcIjpcImdpdGh1YlwifSx7XCJzZXJ2ZXJVcmxcIjpcImh0dHBzOi8vbWNwLmV4YW1wbGUuY29tLypcIn0se1wic2VydmVyQ29tbWFuZFwiOltcIm5weFwiLFwiLXlcIixcInNlcnZlclwiXX1dJyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhcnJpZXMgYW4gZW1wdHkgYWxsb3dlZE1jcFNlcnZlcnMgYXJyYXkgYXMgYSBKU09OIHN0cmluZycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFkYXB0TWFuYWdlZFNldHRpbmdzKHsgYWxsb3dlZE1jcFNlcnZlcnM6IFtdIH0pLCB7XG5cdFx0XHRtYW5hZ2VkU2V0dGluZ3M6IHsgYWxsb3dlZE1jcFNlcnZlcnM6ICdbXScgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY2FycmllcyBkZW5pZWRNY3BTZXJ2ZXJzIGFzIGEgY2Fub25pY2FsIEpTT04gc3RyaW5nIHVuZGVyIGEgc2luZ2xlIGtleScsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFkYXB0TWFuYWdlZFNldHRpbmdzKHtcblx0XHRcdGRlbmllZE1jcFNlcnZlcnM6IFtcblx0XHRcdFx0eyBzZXJ2ZXJOYW1lOiAnYmxvY2tlZCcgfSxcblx0XHRcdFx0eyBzZXJ2ZXJVcmw6ICdodHRwczovLyoudW50cnVzdGVkLmV4YW1wbGUuY29tLyonIH0sXG5cdFx0XHRdLFxuXHRcdH0pLCB7XG5cdFx0XHRtYW5hZ2VkU2V0dGluZ3M6IHtcblx0XHRcdFx0ZGVuaWVkTWNwU2VydmVyczogJ1t7XCJzZXJ2ZXJOYW1lXCI6XCJibG9ja2VkXCJ9LHtcInNlcnZlclVybFwiOlwiaHR0cHM6Ly8qLnVudHJ1c3RlZC5leGFtcGxlLmNvbS8qXCJ9XScsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYXJyaWVzIGN1c3RvbWl6YXRpb24gbG9ja2Rvd24gY29udHJvbHMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZGFwdE1hbmFnZWRTZXR0aW5ncyh7XG5cdFx0XHRzdHJpY3RQbHVnaW5Pbmx5Q3VzdG9taXphdGlvbjogdHJ1ZSxcblx0XHRcdGFsbG93TWFuYWdlZE1jcFNlcnZlcnNPbmx5OiB0cnVlLFxuXHRcdFx0YWxsb3dNYW5hZ2VkSG9va3NPbmx5OiB0cnVlLFxuXHRcdH0pLCB7XG5cdFx0XHRtYW5hZ2VkU2V0dGluZ3M6IHtcblx0XHRcdFx0c3RyaWN0UGx1Z2luT25seUN1c3RvbWl6YXRpb246IHRydWUsXG5cdFx0XHRcdGFsbG93TWFuYWdlZE1jcFNlcnZlcnNPbmx5OiB0cnVlLFxuXHRcdFx0XHRhbGxvd01hbmFnZWRIb29rc09ubHk6IHRydWUsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmbGF0dGVucyBzY2FsYXIgdGVsZW1ldHJ5IGxlYXZlcyBhbmQgY2FycmllcyByZXNvdXJjZUF0dHJpYnV0ZXMgYW5kIGhlYWRlcnMgYXMgc2luZ2xlIEpTT04ga2V5cycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFkYXB0TWFuYWdlZFNldHRpbmdzKHtcblx0XHRcdHRlbGVtZXRyeToge1xuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRzZXJ2aWNlTmFtZTogJ2FjbWUtY29waWxvdCcsXG5cdFx0XHRcdHJlc291cmNlQXR0cmlidXRlczogeyAnZGVwbG95bWVudC5lbnZpcm9ubWVudCc6ICdwcm9kJywgJ3NlcnZpY2UubmFtZXNwYWNlJzogJ2FjbWUnIH0sXG5cdFx0XHRcdGhlYWRlcnM6IHsgJ3gtYXBpLWtleSc6ICdzZWNyZXQnIH0sXG5cdFx0XHR9LFxuXHRcdH0pLCB7XG5cdFx0XHRtYW5hZ2VkU2V0dGluZ3M6IHtcblx0XHRcdFx0J3RlbGVtZXRyeS5lbmFibGVkJzogdHJ1ZSxcblx0XHRcdFx0J3RlbGVtZXRyeS5zZXJ2aWNlTmFtZSc6ICdhY21lLWNvcGlsb3QnLFxuXHRcdFx0XHQndGVsZW1ldHJ5LnJlc291cmNlQXR0cmlidXRlcyc6ICd7XCJkZXBsb3ltZW50LmVudmlyb25tZW50XCI6XCJwcm9kXCIsXCJzZXJ2aWNlLm5hbWVzcGFjZVwiOlwiYWNtZVwifScsXG5cdFx0XHRcdCd0ZWxlbWV0cnkuaGVhZGVycyc6ICd7XCJ4LWFwaS1rZXlcIjpcInNlY3JldFwifScsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdlbmNvZGVzIGdpdGh1YiBtYXJrZXRwbGFjZXMgYXMgYSB7IG5hbWU6IHNob3J0aGFuZCB9IEpTT04gZGljdCcsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFkYXB0TWFuYWdlZFNldHRpbmdzKHtcblx0XHRcdGV4dHJhS25vd25NYXJrZXRwbGFjZXM6IHtcblx0XHRcdFx0J2EnOiB7IHNvdXJjZTogeyBzb3VyY2U6ICdnaXRodWInLCByZXBvOiAnZ2l0aHViL2FnZW50LXNraWxscycgfSB9LFxuXHRcdFx0XHQnYic6IHsgc291cmNlOiB7IHNvdXJjZTogJ2dpdGh1YicsIHJlcG86ICdhY21lL3RoaW5ncycsIHJlZjogJ21haW4nIH0gfSxcblx0XHRcdH0sXG5cdFx0fSksIHtcblx0XHRcdG1hbmFnZWRTZXR0aW5nczoge1xuXHRcdFx0XHRleHRyYUtub3duTWFya2V0cGxhY2VzOiAne1wiYVwiOlwiZ2l0aHViL2FnZW50LXNraWxsc1wiLFwiYlwiOlwiYWNtZS90aGluZ3MjbWFpblwifScsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdlbmNvZGVzIGdpdCBtYXJrZXRwbGFjZXMgYXMgYSB7IG5hbWU6IHVybCB9IEpTT04gZGljdCcsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFkYXB0TWFuYWdlZFNldHRpbmdzKHtcblx0XHRcdGV4dHJhS25vd25NYXJrZXRwbGFjZXM6IHtcblx0XHRcdFx0J2EnOiB7IHNvdXJjZTogeyBzb3VyY2U6ICdnaXQnLCB1cmw6ICdodHRwczovL2V4YW1wbGUuY29tL3JlcG8uZ2l0JyB9IH0sXG5cdFx0XHRcdCdiJzogeyBzb3VyY2U6IHsgc291cmNlOiAnZ2l0JywgdXJsOiAnc3NoOi8vZ2l0QGhvc3QvcGF0aC5naXQnLCByZWY6ICd2MScgfSB9LFxuXHRcdFx0fSxcblx0XHR9KSwge1xuXHRcdFx0bWFuYWdlZFNldHRpbmdzOiB7XG5cdFx0XHRcdGV4dHJhS25vd25NYXJrZXRwbGFjZXM6ICd7XCJhXCI6XCJodHRwczovL2V4YW1wbGUuY29tL3JlcG8uZ2l0XCIsXCJiXCI6XCJzc2g6Ly9naXRAaG9zdC9wYXRoLmdpdCN2MVwifScsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdlbmNvZGVzIG1peGVkIGdpdGh1YiArIGdpdCBtYXJrZXRwbGFjZXMsIGRlZHVwcyBieSBuYW1lJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWRhcHRNYW5hZ2VkU2V0dGluZ3Moe1xuXHRcdFx0ZXh0cmFLbm93bk1hcmtldHBsYWNlczoge1xuXHRcdFx0XHQnYSc6IHsgc291cmNlOiB7IHNvdXJjZTogJ2dpdGh1YicsIHJlcG86ICdhL2InIH0gfSxcblx0XHRcdFx0J2InOiB7IHNvdXJjZTogeyBzb3VyY2U6ICdnaXQnLCB1cmw6ICdodHRwczovL2V4YW1wbGUuY29tL3IuZ2l0JyB9IH0sXG5cdFx0XHR9LFxuXHRcdH0pLCB7XG5cdFx0XHRtYW5hZ2VkU2V0dGluZ3M6IHtcblx0XHRcdFx0ZXh0cmFLbm93bk1hcmtldHBsYWNlczogJ3tcImFcIjpcImEvYlwiLFwiYlwiOlwiaHR0cHM6Ly9leGFtcGxlLmNvbS9yLmdpdFwifScsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVzIGEgZnVsbCBwb3B1bGF0ZWQgcmVzcG9uc2UgKGFsbCB0aHJlZSBzdHJ1Y3R1cmVkIHNldHRpbmdzIHRvZ2V0aGVyKScsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFkYXB0TWFuYWdlZFNldHRpbmdzKHtcblx0XHRcdGVuYWJsZWRQbHVnaW5zOiB7ICdwQG0nOiB0cnVlIH0sXG5cdFx0XHRleHRyYUtub3duTWFya2V0cGxhY2VzOiB7XG5cdFx0XHRcdCdhJzogeyBzb3VyY2U6IHsgc291cmNlOiAnZ2l0aHViJywgcmVwbzogJ2EvYicsIHJlZjogJ3InIH0gfSxcblx0XHRcdH0sXG5cdFx0XHRzdHJpY3RLbm93bk1hcmtldHBsYWNlczogW3sgc291cmNlOiAnZ2l0aHViJywgcmVwbzogJ2EvYicgfV0sXG5cdFx0fSksIHtcblx0XHRcdG1hbmFnZWRTZXR0aW5nczoge1xuXHRcdFx0XHRzdHJpY3RLbm93bk1hcmtldHBsYWNlczogJ1t7XCJzb3VyY2VcIjpcImdpdGh1YlwiLFwicmVwb1wiOlwiYS9iXCJ9XScsXG5cdFx0XHRcdGVuYWJsZWRQbHVnaW5zOiAne1wicEBtXCI6dHJ1ZX0nLFxuXHRcdFx0XHRleHRyYUtub3duTWFya2V0cGxhY2VzOiAne1wiYVwiOlwiYS9iI3JcIn0nLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzaWxpZW5jZTogdW5rbm93biBzY2FsYXIga2V5cyBmbGF0dGVuIGludG8gdGhlIGJhZyBhbG9uZ3NpZGUgc3RydWN0dXJlZCBrZXlzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWRhcHRNYW5hZ2VkU2V0dGluZ3Moe1xuXHRcdFx0ZW5hYmxlZFBsdWdpbnM6IHsgJ3BAbSc6IHRydWUgfSxcblx0XHRcdHN0cmljdEtub3duTWFya2V0cGxhY2VzOiBbXSxcblx0XHRcdGpvc2hzRmFrZVNldHRpbmc6IHRydWUsXG5cdFx0fSBhcyBJTWFuYWdlZFNldHRpbmdzUmVzcG9uc2UpLCB7XG5cdFx0XHRtYW5hZ2VkU2V0dGluZ3M6IHtcblx0XHRcdFx0c3RyaWN0S25vd25NYXJrZXRwbGFjZXM6ICdbXScsXG5cdFx0XHRcdGpvc2hzRmFrZVNldHRpbmc6IHRydWUsXG5cdFx0XHRcdGVuYWJsZWRQbHVnaW5zOiAne1wicEBtXCI6dHJ1ZX0nLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzaWxpZW5jZTogYSBzZXJ2ZXItc2VudCBvd24gYF9fcHJvdG9fX2Aga2V5IGlzIGNhcnJpZWQgbGlrZSBhbnkgc2NhbGFyLCBuZXZlciBhcHBsaWVkIHRvIHRoZSBwcm90b3R5cGUnLCAoKSA9PiB7XG5cdFx0Ly8gSlNPTi5wYXJzZSAobm90IGFuIG9iamVjdCBsaXRlcmFsKSB5aWVsZHMgYW4gT1dOIGVudW1lcmFibGUgYF9fcHJvdG9fX2AgZGF0YSBwcm9wZXJ0eS5cblx0XHQvLyBUaGUgc2NhbGFyIHJlbWFpbmRlciBtdXN0IGtlZXAgYHsgLi4ucmVzdCB9YCBzZW1hbnRpY3M6IGNvcHkgaXQgYXMgZGF0YSAoc28gaXQgZmxhdHRlbnNcblx0XHQvLyB0byBgX19wcm90b19fLnBvbGx1dGVkYCkgcmF0aGVyIHRoYW4gYXNzaWduaW5nIHRocm91Z2ggdGhlIGluaGVyaXRlZCBgX19wcm90b19fYCBzZXR0ZXJcblx0XHQvLyAod2hpY2ggd291bGQgc3dhcCB0aGUgcHJvdG90eXBlIGFuZCBpbnN0ZWFkIHN1cmZhY2UgdGhlIGluaGVyaXRlZCBgcG9sbHV0ZWRgIGtleSkuXG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBKU09OLnBhcnNlKCd7XCJwZXJtaXNzaW9uc1wiOntcInhcIjoxfSxcIl9fcHJvdG9fX1wiOntcInBvbGx1dGVkXCI6dHJ1ZX19JykgYXMgSU1hbmFnZWRTZXR0aW5nc1Jlc3BvbnNlO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWRhcHRNYW5hZ2VkU2V0dGluZ3MocmVzcG9uc2UpLCB7XG5cdFx0XHRtYW5hZ2VkU2V0dGluZ3M6IHtcblx0XHRcdFx0J3Blcm1pc3Npb25zLngnOiAxLFxuXHRcdFx0XHQnX19wcm90b19fLnBvbGx1dGVkJzogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc2lsaWVuY2U6IGEgcHJpbWl0aXZlIG93biBgX19wcm90b19fYCBzY2FsYXIgaXMgZHJvcHBlZCwgbmV2ZXIgcG9sbHV0ZXMgdGhlIHJlc3VsdCcsICgpID0+IHtcblx0XHQvLyBUaGUgcmV2aWV3ZXItZmxhZ2dlZCBjYXNlLiBmbGF0dGVuTWFuYWdlZFNldHRpbmdzIG9ubHkgYXNzaWducyBhdCB0aGUgYmFyZSBgX19wcm90b19fYFxuXHRcdC8vIGtleSB3aGVuIHRoZSB2YWx1ZSBpcyBhIFBSSU1JVElWRSwgd2hlcmUgdGhlIGluaGVyaXRlZCBgX19wcm90b19fYCBzZXR0ZXIgaXMgYSBuby1vcCwgc29cblx0XHQvLyB0aGUgdmFsdWUgaXMgc2ltcGx5IGRyb3BwZWQgKG5vIHByb3RvdHlwZSBtdXRhdGlvbiksIG1hdGNoaW5nIHRoZSBvcmlnaW5hbCBgLi4ucmVzdGAuXG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBKU09OLnBhcnNlKCd7XCJwZXJtaXNzaW9uc1wiOntcInhcIjoxfSxcIl9fcHJvdG9fX1wiOnRydWV9JykgYXMgSU1hbmFnZWRTZXR0aW5nc1Jlc3BvbnNlO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWRhcHRNYW5hZ2VkU2V0dGluZ3MocmVzcG9uc2UpLCB7XG5cdFx0XHRtYW5hZ2VkU2V0dGluZ3M6IHtcblx0XHRcdFx0J3Blcm1pc3Npb25zLngnOiAxLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzaWxpZW5jZTogbWFsZm9ybWVkIG1hcmtldHBsYWNlIGVudHJpZXMgYXJlIHNraXBwZWQsIHZhbGlkIGVudHJpZXMgc3RpbGwgcHJvY2Vzc2VkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHdhcm5pbmdzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGFkYXB0TWFuYWdlZFNldHRpbmdzKHtcblx0XHRcdGV4dHJhS25vd25NYXJrZXRwbGFjZXM6IHtcblx0XHRcdFx0J2dvb2QnOiB7IHNvdXJjZTogeyBzb3VyY2U6ICdnaXRodWInLCByZXBvOiAnYS9iJyB9IH0sXG5cdFx0XHRcdCdiYWQtbm8tc291cmNlJzoge30gYXMgSU1hbmFnZWRTZXR0aW5nc1Jlc3BvbnNlWydleHRyYUtub3duTWFya2V0cGxhY2VzJ10gZXh0ZW5kcyBSZWNvcmQ8c3RyaW5nLCBpbmZlciBWPiA/IFYgOiBuZXZlcixcblx0XHRcdFx0J2JhZC11bmtub3duLXR5cGUnOiB7IHNvdXJjZTogeyBzb3VyY2U6ICdmdHAnLCB1cmw6ICdmdHA6Ly94JyB9IH0gYXMgSU1hbmFnZWRTZXR0aW5nc1Jlc3BvbnNlWydleHRyYUtub3duTWFya2V0cGxhY2VzJ10gZXh0ZW5kcyBSZWNvcmQ8c3RyaW5nLCBpbmZlciBWPiA/IFYgOiBuZXZlcixcblx0XHRcdH0sXG5cdFx0fSBhcyBJTWFuYWdlZFNldHRpbmdzUmVzcG9uc2UsIG1zZyA9PiB3YXJuaW5ncy5wdXNoKG1zZykpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRtYW5hZ2VkU2V0dGluZ3M6IHtcblx0XHRcdFx0ZXh0cmFLbm93bk1hcmtldHBsYWNlczogJ3tcImdvb2RcIjpcImEvYlwifScsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3YXJuaW5ncy5sZW5ndGgsIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNpbGllbmNlOiBleHRyYUtub3duTWFya2V0cGxhY2VzIGdpdGh1YiBlbnRyeSBtaXNzaW5nIFwicmVwb1wiIGlzIHNraXBwZWQgd2l0aCBhIHdhcm5pbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgd2FybmluZ3M6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgcmVzdWx0ID0gYWRhcHRNYW5hZ2VkU2V0dGluZ3Moe1xuXHRcdFx0ZXh0cmFLbm93bk1hcmtldHBsYWNlczoge1xuXHRcdFx0XHQnZXhhbXBsZS1rZXknOiB7IHNvdXJjZTogeyBzb3VyY2U6ICdnaXRodWInIH0gfSBhcyBJTWFuYWdlZFNldHRpbmdzUmVzcG9uc2VbJ2V4dHJhS25vd25NYXJrZXRwbGFjZXMnXSBleHRlbmRzIFJlY29yZDxzdHJpbmcsIGluZmVyIFY+ID8gViA6IG5ldmVyLFxuXHRcdFx0fSxcblx0XHR9IGFzIElNYW5hZ2VkU2V0dGluZ3NSZXNwb25zZSwgbXNnID0+IHdhcm5pbmdzLnB1c2gobXNnKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsgcmVzdWx0LCB3YXJuZWQ6IHdhcm5pbmdzLmxlbmd0aCwgbWVudGlvbnNSZXBvOiB3YXJuaW5ncy5zb21lKHcgPT4gdy5pbmNsdWRlcygncmVxdWlyZXMgXCJyZXBvXCInKSkgfSxcblx0XHRcdHsgcmVzdWx0OiB7IG1hbmFnZWRTZXR0aW5nczoge30gfSwgd2FybmVkOiAxLCBtZW50aW9uc1JlcG86IHRydWUgfVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc2lsaWVuY2U6IGEgbWFya2V0cGxhY2Ugc3RyaW5nIGFycmF5ICh3cm9uZyBmb3JtYXQpIGlzIHRyZWF0ZWQgYXMgbWlzc2luZywgbm8gdGhyb3cnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZGFwdE1hbmFnZWRTZXR0aW5ncyh7XG5cdFx0XHRleHRyYUtub3duTWFya2V0cGxhY2VzOiBbJ2h0dHBzOi8vcGx1Z2lucy5hY21lLmNvbSddIGFzIHVua25vd24gYXMgSU1hbmFnZWRTZXR0aW5nc1Jlc3BvbnNlWydleHRyYUtub3duTWFya2V0cGxhY2VzJ10sXG5cdFx0fSBhcyBJTWFuYWdlZFNldHRpbmdzUmVzcG9uc2UpLCB7XG5cdFx0XHRtYW5hZ2VkU2V0dGluZ3M6IHt9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNpbGllbmNlOiB0ZWxlbWV0cnkgbWFwIGtleXMgdGhhdCBjb3VsZCBwb2xsdXRlIHRoZSBwcm90b3R5cGUgYXJlIGRyb3BwZWQnLCAoKSA9PiB7XG5cdFx0Ly8gSlNPTi5wYXJzZSB5aWVsZHMgYW4gT1dOIGVudW1lcmFibGUgYF9fcHJvdG9fX2AgZGF0YSBwcm9wZXJ0eSBvbiB0aGUgbmVzdGVkIG1hcC5cblx0XHRjb25zdCByZXNwb25zZSA9IEpTT04ucGFyc2UoJ3tcInRlbGVtZXRyeVwiOntcInJlc291cmNlQXR0cmlidXRlc1wiOntcIl9fcHJvdG9fX1wiOlwicG9sbHV0ZWRcIixcImNvbnN0cnVjdG9yXCI6XCJ4XCIsXCJzZXJ2aWNlLm5hbWVzcGFjZVwiOlwiYWNtZVwifX19JykgYXMgSU1hbmFnZWRTZXR0aW5nc1Jlc3BvbnNlO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWRhcHRNYW5hZ2VkU2V0dGluZ3MocmVzcG9uc2UpLCB7XG5cdFx0XHRtYW5hZ2VkU2V0dGluZ3M6IHtcblx0XHRcdFx0J3RlbGVtZXRyeS5yZXNvdXJjZUF0dHJpYnV0ZXMnOiAne1wic2VydmljZS5uYW1lc3BhY2VcIjpcImFjbWVcIn0nLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHt9IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KS5wb2xsdXRlZCwgdW5kZWZpbmVkKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLDRCQUFzRDtBQUUvRCxNQUFNLHdCQUF3QixNQUFNO0FBRW5DLDBDQUF3QztBQUV4QyxPQUFLLHVEQUF1RCxNQUFNO0FBQ2pFLFdBQU8sZ0JBQWdCLHFCQUFxQixDQUFDLENBQUMsR0FBRztBQUFBLE1BQ2hELGlCQUFpQixDQUFDO0FBQUEsSUFDbkIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssMERBQTBELE1BQU07QUFDcEUsV0FB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
