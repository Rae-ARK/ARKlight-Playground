import * as assert from "assert";
import * as sinon from "sinon";
import { LogLevel } from "../../../../platform/log/common/log.js";
import { createAuthMetadata } from "../../common/extHostMcp.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
const TEST_MCP_URL = "https://example.com/mcp";
const TEST_AUTH_SERVER = "https://auth.example.com";
const TEST_RESOURCE_METADATA_URL = "https://example.com/.well-known/oauth-protected-resource";
function createMockResponse(options) {
  const headers = new Headers(options.headers ?? {});
  return {
    status: options.status ?? 200,
    statusText: options.statusText ?? "OK",
    url: options.url ?? TEST_MCP_URL,
    headers,
    body: null,
    json: async () => JSON.parse(options.body ?? "{}"),
    text: async () => options.body ?? ""
  };
}
async function createTestAuthMetadata(options) {
  const logMessages = [];
  const mockLogger = (level, message) => logMessages.push({ level, message });
  const issuer = options.serverMetadataIssuer ?? TEST_AUTH_SERVER;
  const mockFetch = sinon.stub();
  mockFetch.onCall(0).resolves(createMockResponse({
    status: 200,
    url: TEST_RESOURCE_METADATA_URL,
    body: JSON.stringify(options.resourceMetadata ?? {
      resource: TEST_MCP_URL,
      authorization_servers: [issuer]
    })
  }));
  mockFetch.onCall(1).resolves(createMockResponse({
    status: 200,
    url: `${issuer}/.well-known/oauth-authorization-server`,
    body: JSON.stringify({
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      response_types_supported: ["code"]
    })
  }));
  const wwwAuthHeader = options.scopes ? `Bearer scope="${options.scopes.join(" ")}"` : 'Bearer realm="example"';
  const originalResponse = createMockResponse({
    status: 401,
    url: TEST_MCP_URL,
    headers: {
      "WWW-Authenticate": wwwAuthHeader
    }
  });
  const authMetadata = await createAuthMetadata(
    TEST_MCP_URL,
    originalResponse.headers,
    {
      sameOriginHeaders: {},
      fetch: mockFetch,
      log: mockLogger
    }
  );
  return { authMetadata, logMessages };
}
suite("ExtHostMcp", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("IAuthMetadata", () => {
    suite("properties", () => {
      test("should expose readonly properties", async () => {
        const { authMetadata } = await createTestAuthMetadata({
          scopes: ["read", "write"],
          serverMetadataIssuer: TEST_AUTH_SERVER
        });
        assert.ok(authMetadata.authorizationServer.toString().startsWith(TEST_AUTH_SERVER));
        assert.strictEqual(authMetadata.serverMetadata.issuer, TEST_AUTH_SERVER);
        assert.deepStrictEqual(authMetadata.scopes, ["read", "write"]);
      });
      test("should allow undefined scopes", async () => {
        const { authMetadata } = await createTestAuthMetadata({
          scopes: void 0
        });
        assert.strictEqual(authMetadata.scopes, void 0);
      });
    });
    suite("update()", () => {
      test("should return true and update scopes when WWW-Authenticate header contains new scopes", async () => {
        const { authMetadata } = await createTestAuthMetadata({
          scopes: ["read"]
        });
        const response = createMockResponse({
          status: 401,
          headers: {
            "WWW-Authenticate": 'Bearer scope="read write admin"'
          }
        });
        const result = authMetadata.update(response.headers);
        assert.strictEqual(result, true);
        assert.deepStrictEqual(authMetadata.scopes, ["read", "write", "admin"]);
      });
      test("should return false when scopes are the same", async () => {
        const { authMetadata } = await createTestAuthMetadata({
          scopes: ["read", "write"]
        });
        const response = createMockResponse({
          status: 401,
          headers: {
            "WWW-Authenticate": 'Bearer scope="read write"'
          }
        });
        const result = authMetadata.update(response.headers);
        assert.strictEqual(result, false);
        assert.deepStrictEqual(authMetadata.scopes, ["read", "write"]);
      });
      test("should return false when scopes are same but in different order", async () => {
        const { authMetadata } = await createTestAuthMetadata({
          scopes: ["read", "write"]
        });
        const response = createMockResponse({
          status: 401,
          headers: {
            "WWW-Authenticate": 'Bearer scope="write read"'
          }
        });
        const result = authMetadata.update(response.headers);
        assert.strictEqual(result, false);
      });
      test("should return true when updating from undefined scopes to defined scopes", async () => {
        const { authMetadata } = await createTestAuthMetadata({
          scopes: void 0
        });
        const response = createMockResponse({
          status: 401,
          headers: {
            "WWW-Authenticate": 'Bearer scope="read"'
          }
        });
        const result = authMetadata.update(response.headers);
        assert.strictEqual(result, true);
        assert.deepStrictEqual(authMetadata.scopes, ["read"]);
      });
      test("should return true when updating from defined scopes to undefined (no scope in header)", async () => {
        const { authMetadata } = await createTestAuthMetadata({
          scopes: ["read"]
        });
        const response = createMockResponse({
          status: 401,
          headers: {
            "WWW-Authenticate": 'Bearer realm="example"'
          }
        });
        const result = authMetadata.update(response.headers);
        assert.strictEqual(result, true);
        assert.strictEqual(authMetadata.scopes, void 0);
      });
      test("should return false when no WWW-Authenticate header and scopes are already undefined", async () => {
        const { authMetadata } = await createTestAuthMetadata({
          scopes: void 0
        });
        const response = createMockResponse({
          status: 401,
          headers: {}
        });
        const result = authMetadata.update(response.headers);
        assert.strictEqual(result, false);
      });
      test("should handle multiple Bearer challenges and use first scope", async () => {
        const { authMetadata } = await createTestAuthMetadata({
          scopes: void 0
        });
        const response = createMockResponse({
          status: 401,
          headers: {
            "WWW-Authenticate": 'Bearer scope="first", Bearer scope="second"'
          }
        });
        authMetadata.update(response.headers);
        assert.deepStrictEqual(authMetadata.scopes, ["first"]);
      });
      test("should ignore non-Bearer schemes", async () => {
        const { authMetadata } = await createTestAuthMetadata({
          scopes: void 0
        });
        const response = createMockResponse({
          status: 401,
          headers: {
            "WWW-Authenticate": 'Basic realm="example"'
          }
        });
        const result = authMetadata.update(response.headers);
        assert.strictEqual(result, false);
        assert.strictEqual(authMetadata.scopes, void 0);
      });
    });
  });
  suite("createAuthMetadata", () => {
    let sandbox;
    let logMessages;
    let mockLogger;
    setup(() => {
      sandbox = sinon.createSandbox();
      logMessages = [];
      mockLogger = (level, message) => logMessages.push({ level, message });
    });
    teardown(() => {
      sandbox.restore();
    });
    test("should create IAuthMetadata with fetched server metadata", async () => {
      const mockFetch = sandbox.stub();
      mockFetch.onCall(0).resolves(createMockResponse({
        status: 200,
        url: TEST_RESOURCE_METADATA_URL,
        body: JSON.stringify({
          resource: TEST_MCP_URL,
          authorization_servers: [TEST_AUTH_SERVER],
          scopes_supported: ["read", "write"]
        })
      }));
      mockFetch.onCall(1).resolves(createMockResponse({
        status: 200,
        url: `${TEST_AUTH_SERVER}/.well-known/oauth-authorization-server`,
        body: JSON.stringify({
          issuer: TEST_AUTH_SERVER,
          authorization_endpoint: `${TEST_AUTH_SERVER}/authorize`,
          token_endpoint: `${TEST_AUTH_SERVER}/token`,
          response_types_supported: ["code"]
        })
      }));
      const originalResponse = createMockResponse({
        status: 401,
        url: TEST_MCP_URL,
        headers: {
          "WWW-Authenticate": 'Bearer scope="api.read"'
        }
      });
      const authMetadata = await createAuthMetadata(
        TEST_MCP_URL,
        originalResponse.headers,
        {
          sameOriginHeaders: { "X-Custom": "value" },
          fetch: mockFetch,
          log: mockLogger
        }
      );
      assert.ok(authMetadata.authorizationServer.toString().startsWith(TEST_AUTH_SERVER));
      assert.strictEqual(authMetadata.serverMetadata.issuer, TEST_AUTH_SERVER);
      assert.deepStrictEqual(authMetadata.scopes, ["api.read"]);
    });
    test("should fall back to default metadata when server metadata fetch fails", async () => {
      const mockFetch = sandbox.stub();
      mockFetch.onCall(0).rejects(new Error("Network error"));
      mockFetch.onCall(1).rejects(new Error("Network error"));
      const originalResponse = createMockResponse({
        status: 401,
        url: TEST_MCP_URL,
        headers: {}
      });
      const authMetadata = await createAuthMetadata(
        TEST_MCP_URL,
        originalResponse.headers,
        {
          sameOriginHeaders: {},
          fetch: mockFetch,
          log: mockLogger
        }
      );
      assert.ok(authMetadata.authorizationServer.toString().startsWith("https://example.com"));
      assert.ok(authMetadata.serverMetadata.issuer.startsWith("https://example.com"));
      assert.ok(authMetadata.serverMetadata.authorization_endpoint?.startsWith("https://example.com/authorize"));
      assert.ok(authMetadata.serverMetadata.token_endpoint?.startsWith("https://example.com/token"));
      assert.ok(logMessages.some(
        (m) => m.level === LogLevel.Info && m.message.includes("Using default auth metadata")
      ));
    });
    test("should use scopes from WWW-Authenticate header when resource metadata has none", async () => {
      const mockFetch = sandbox.stub();
      mockFetch.onCall(0).resolves(createMockResponse({
        status: 200,
        url: TEST_RESOURCE_METADATA_URL,
        body: JSON.stringify({
          resource: TEST_MCP_URL,
          authorization_servers: [TEST_AUTH_SERVER]
        })
      }));
      mockFetch.onCall(1).resolves(createMockResponse({
        status: 200,
        url: `${TEST_AUTH_SERVER}/.well-known/oauth-authorization-server`,
        body: JSON.stringify({
          issuer: TEST_AUTH_SERVER,
          authorization_endpoint: `${TEST_AUTH_SERVER}/authorize`,
          token_endpoint: `${TEST_AUTH_SERVER}/token`,
          response_types_supported: ["code"]
        })
      }));
      const originalResponse = createMockResponse({
        status: 401,
        url: TEST_MCP_URL,
        headers: {
          "WWW-Authenticate": 'Bearer scope="header.scope"'
        }
      });
      const authMetadata = await createAuthMetadata(
        TEST_MCP_URL,
        originalResponse.headers,
        {
          sameOriginHeaders: {},
          fetch: mockFetch,
          log: mockLogger
        }
      );
      assert.deepStrictEqual(authMetadata.scopes, ["header.scope"]);
    });
    test("should use scopes from WWW-Authenticate header even when resource metadata has scopes_supported", async () => {
      const mockFetch = sandbox.stub();
      mockFetch.onCall(0).resolves(createMockResponse({
        status: 200,
        url: TEST_RESOURCE_METADATA_URL,
        body: JSON.stringify({
          resource: TEST_MCP_URL,
          authorization_servers: [TEST_AUTH_SERVER],
          scopes_supported: ["resource.scope1", "resource.scope2"]
        })
      }));
      mockFetch.onCall(1).resolves(createMockResponse({
        status: 200,
        url: `${TEST_AUTH_SERVER}/.well-known/oauth-authorization-server`,
        body: JSON.stringify({
          issuer: TEST_AUTH_SERVER,
          authorization_endpoint: `${TEST_AUTH_SERVER}/authorize`,
          token_endpoint: `${TEST_AUTH_SERVER}/token`,
          response_types_supported: ["code"]
        })
      }));
      const originalResponse = createMockResponse({
        status: 401,
        url: TEST_MCP_URL,
        headers: {
          "WWW-Authenticate": 'Bearer scope="header.scope"'
        }
      });
      const authMetadata = await createAuthMetadata(
        TEST_MCP_URL,
        originalResponse.headers,
        {
          sameOriginHeaders: {},
          fetch: mockFetch,
          log: mockLogger
        }
      );
      assert.deepStrictEqual(authMetadata.scopes, ["header.scope"]);
    });
    test("should use resource_metadata challenge URL from WWW-Authenticate header", async () => {
      const mockFetch = sandbox.stub();
      mockFetch.onCall(0).resolves(createMockResponse({
        status: 200,
        url: "https://example.com/custom-resource-metadata",
        body: JSON.stringify({
          resource: TEST_MCP_URL,
          authorization_servers: [TEST_AUTH_SERVER]
        })
      }));
      mockFetch.onCall(1).resolves(createMockResponse({
        status: 200,
        url: `${TEST_AUTH_SERVER}/.well-known/oauth-authorization-server`,
        body: JSON.stringify({
          issuer: TEST_AUTH_SERVER,
          authorization_endpoint: `${TEST_AUTH_SERVER}/authorize`,
          token_endpoint: `${TEST_AUTH_SERVER}/token`,
          response_types_supported: ["code"]
        })
      }));
      const originalResponse = createMockResponse({
        status: 401,
        url: TEST_MCP_URL,
        headers: {
          "WWW-Authenticate": 'Bearer resource_metadata="https://example.com/custom-resource-metadata"'
        }
      });
      const authMetadata = await createAuthMetadata(
        TEST_MCP_URL,
        originalResponse.headers,
        {
          sameOriginHeaders: {},
          fetch: mockFetch,
          log: mockLogger
        }
      );
      assert.ok(authMetadata.authorizationServer.toString().startsWith(TEST_AUTH_SERVER));
      assert.ok(logMessages.some(
        (m) => m.level === LogLevel.Debug && m.message.includes("resource_metadata challenge")
      ));
    });
    test("should pass launch headers when fetching metadata from same origin", async () => {
      const mockFetch = sandbox.stub();
      mockFetch.onCall(0).resolves(createMockResponse({
        status: 200,
        url: TEST_RESOURCE_METADATA_URL,
        body: JSON.stringify({
          resource: TEST_MCP_URL,
          authorization_servers: [TEST_AUTH_SERVER]
        })
      }));
      mockFetch.onCall(1).resolves(createMockResponse({
        status: 200,
        url: `${TEST_AUTH_SERVER}/.well-known/oauth-authorization-server`,
        body: JSON.stringify({
          issuer: TEST_AUTH_SERVER,
          authorization_endpoint: `${TEST_AUTH_SERVER}/authorize`,
          token_endpoint: `${TEST_AUTH_SERVER}/token`,
          response_types_supported: ["code"]
        })
      }));
      const originalResponse = createMockResponse({
        status: 401,
        url: TEST_MCP_URL,
        headers: {}
      });
      const launchHeaders = {
        "Authorization": "Bearer existing-token",
        "X-Custom-Header": "custom-value"
      };
      await createAuthMetadata(
        TEST_MCP_URL,
        originalResponse.headers,
        {
          sameOriginHeaders: launchHeaders,
          fetch: mockFetch,
          log: mockLogger
        }
      );
      assert.ok(mockFetch.called, "fetch should have been called");
      const firstCallArgs = mockFetch.firstCall.args;
      assert.ok(firstCallArgs.length >= 2, "fetch should have been called with options");
      const fetchOptions = firstCallArgs[1];
      assert.ok(fetchOptions.headers, "fetch options should include headers");
    });
    test("should handle empty scope string in WWW-Authenticate header", async () => {
      const mockFetch = sandbox.stub();
      mockFetch.onCall(0).resolves(createMockResponse({
        status: 200,
        url: TEST_RESOURCE_METADATA_URL,
        body: JSON.stringify({
          resource: TEST_MCP_URL,
          authorization_servers: [TEST_AUTH_SERVER]
        })
      }));
      mockFetch.onCall(1).resolves(createMockResponse({
        status: 200,
        url: `${TEST_AUTH_SERVER}/.well-known/oauth-authorization-server`,
        body: JSON.stringify({
          issuer: TEST_AUTH_SERVER,
          authorization_endpoint: `${TEST_AUTH_SERVER}/authorize`,
          token_endpoint: `${TEST_AUTH_SERVER}/token`,
          response_types_supported: ["code"]
        })
      }));
      const originalResponse = createMockResponse({
        status: 401,
        url: TEST_MCP_URL,
        headers: {
          "WWW-Authenticate": 'Bearer scope=""'
        }
      });
      const authMetadata = await createAuthMetadata(
        TEST_MCP_URL,
        originalResponse.headers,
        {
          sameOriginHeaders: {},
          fetch: mockFetch,
          log: mockLogger
        }
      );
      assert.ok(
        authMetadata.scopes === void 0 || Array.isArray(authMetadata.scopes) && authMetadata.scopes.length === 0 || Array.isArray(authMetadata.scopes) && authMetadata.scopes.every((s) => s === ""),
        "Empty scope string should be handled gracefully"
      );
    });
    test("should handle malformed WWW-Authenticate header gracefully", async () => {
      const mockFetch = sandbox.stub();
      mockFetch.onCall(0).resolves(createMockResponse({
        status: 200,
        url: TEST_RESOURCE_METADATA_URL,
        body: JSON.stringify({
          resource: TEST_MCP_URL,
          authorization_servers: [TEST_AUTH_SERVER]
        })
      }));
      mockFetch.onCall(1).resolves(createMockResponse({
        status: 200,
        url: `${TEST_AUTH_SERVER}/.well-known/oauth-authorization-server`,
        body: JSON.stringify({
          issuer: TEST_AUTH_SERVER,
          authorization_endpoint: `${TEST_AUTH_SERVER}/authorize`,
          token_endpoint: `${TEST_AUTH_SERVER}/token`,
          response_types_supported: ["code"]
        })
      }));
      const originalResponse = createMockResponse({
        status: 401,
        url: TEST_MCP_URL,
        headers: {
          // Malformed header - missing closing quote
          "WWW-Authenticate": 'Bearer scope="unclosed'
        }
      });
      const authMetadata = await createAuthMetadata(
        TEST_MCP_URL,
        originalResponse.headers,
        {
          sameOriginHeaders: {},
          fetch: mockFetch,
          log: mockLogger
        }
      );
      assert.ok(authMetadata.authorizationServer);
      assert.ok(authMetadata.serverMetadata);
    });
    test("should handle invalid JSON in resource metadata response", async () => {
      const mockFetch = sandbox.stub();
      mockFetch.onCall(0).resolves(createMockResponse({
        status: 200,
        url: TEST_RESOURCE_METADATA_URL,
        body: "not valid json {"
      }));
      mockFetch.onCall(1).resolves(createMockResponse({
        status: 200,
        url: "https://example.com/.well-known/oauth-authorization-server",
        body: "{ invalid }"
      }));
      const originalResponse = createMockResponse({
        status: 401,
        url: TEST_MCP_URL,
        headers: {}
      });
      const authMetadata = await createAuthMetadata(
        TEST_MCP_URL,
        originalResponse.headers,
        {
          sameOriginHeaders: {},
          fetch: mockFetch,
          log: mockLogger
        }
      );
      assert.ok(authMetadata.authorizationServer);
      assert.ok(authMetadata.serverMetadata);
    });
    test("should handle non-401 status codes in update()", async () => {
      const { authMetadata } = await createTestAuthMetadata({
        scopes: ["read"]
      });
      const response = createMockResponse({
        status: 403,
        headers: {
          "WWW-Authenticate": 'Bearer scope="new.scope"'
        }
      });
      const result = authMetadata.update(response.headers);
      assert.strictEqual(typeof result, "boolean");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvdGVzdC9jb21tb24vZXh0SG9zdE1jcC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgKiBhcyBzaW5vbiBmcm9tICdzaW5vbic7XG5pbXBvcnQgeyBMb2dMZXZlbCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IGNyZWF0ZUF1dGhNZXRhZGF0YSwgQ29tbW9uUmVzcG9uc2UsIElBdXRoTWV0YWRhdGEgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdE1jcC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcblxuLy8gVGVzdCBjb25zdGFudHMgdG8gYXZvaWQgbWFnaWMgc3RyaW5nc1xuY29uc3QgVEVTVF9NQ1BfVVJMID0gJ2h0dHBzOi8vZXhhbXBsZS5jb20vbWNwJztcbmNvbnN0IFRFU1RfQVVUSF9TRVJWRVIgPSAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tJztcbmNvbnN0IFRFU1RfUkVTT1VSQ0VfTUVUQURBVEFfVVJMID0gJ2h0dHBzOi8vZXhhbXBsZS5jb20vLndlbGwta25vd24vb2F1dGgtcHJvdGVjdGVkLXJlc291cmNlJztcblxuLyoqXG4gKiBDcmVhdGVzIGEgbW9jayBDb21tb25SZXNwb25zZSBmb3IgdGVzdGluZy5cbiAqL1xuZnVuY3Rpb24gY3JlYXRlTW9ja1Jlc3BvbnNlKG9wdGlvbnM6IHtcblx0c3RhdHVzPzogbnVtYmVyO1xuXHRzdGF0dXNUZXh0Pzogc3RyaW5nO1xuXHR1cmw/OiBzdHJpbmc7XG5cdGhlYWRlcnM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuXHRib2R5Pzogc3RyaW5nO1xufSk6IENvbW1vblJlc3BvbnNlIHtcblx0Y29uc3QgaGVhZGVycyA9IG5ldyBIZWFkZXJzKG9wdGlvbnMuaGVhZGVycyA/PyB7fSk7XG5cdHJldHVybiB7XG5cdFx0c3RhdHVzOiBvcHRpb25zLnN0YXR1cyA/PyAyMDAsXG5cdFx0c3RhdHVzVGV4dDogb3B0aW9ucy5zdGF0dXNUZXh0ID8/ICdPSycsXG5cdFx0dXJsOiBvcHRpb25zLnVybCA/PyBURVNUX01DUF9VUkwsXG5cdFx0aGVhZGVycyxcblx0XHRib2R5OiBudWxsLFxuXHRcdGpzb246IGFzeW5jICgpID0+IEpTT04ucGFyc2Uob3B0aW9ucy5ib2R5ID8/ICd7fScpLFxuXHRcdHRleHQ6IGFzeW5jICgpID0+IG9wdGlvbnMuYm9keSA/PyAnJyxcblx0fTtcbn1cblxuLyoqXG4gKiBIZWxwZXIgdG8gY3JlYXRlIGFuIElBdXRoTWV0YWRhdGEgaW5zdGFuY2UgZm9yIHRlc3RpbmcgdmlhIHRoZSBmYWN0b3J5IGZ1bmN0aW9uLlxuICogVXNlcyBhIG1vY2sgZmV0Y2ggdGhhdCByZXR1cm5zIHRoZSBwcm92aWRlZCBzZXJ2ZXIgbWV0YWRhdGEuXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGNyZWF0ZVRlc3RBdXRoTWV0YWRhdGEob3B0aW9uczoge1xuXHRzY29wZXM/OiBzdHJpbmdbXTtcblx0c2VydmVyTWV0YWRhdGFJc3N1ZXI/OiBzdHJpbmc7XG5cdHJlc291cmNlTWV0YWRhdGE/OiB7IHJlc291cmNlOiBzdHJpbmc7IGF1dGhvcml6YXRpb25fc2VydmVycz86IHN0cmluZ1tdOyBzY29wZXNfc3VwcG9ydGVkPzogc3RyaW5nW10gfTtcbn0pOiBQcm9taXNlPHsgYXV0aE1ldGFkYXRhOiBJQXV0aE1ldGFkYXRhOyBsb2dNZXNzYWdlczogQXJyYXk8eyBsZXZlbDogTG9nTGV2ZWw7IG1lc3NhZ2U6IHN0cmluZyB9PiB9PiB7XG5cdGNvbnN0IGxvZ01lc3NhZ2VzOiBBcnJheTx7IGxldmVsOiBMb2dMZXZlbDsgbWVzc2FnZTogc3RyaW5nIH0+ID0gW107XG5cdGNvbnN0IG1vY2tMb2dnZXIgPSAobGV2ZWw6IExvZ0xldmVsLCBtZXNzYWdlOiBzdHJpbmcpID0+IGxvZ01lc3NhZ2VzLnB1c2goeyBsZXZlbCwgbWVzc2FnZSB9KTtcblxuXHRjb25zdCBpc3N1ZXIgPSBvcHRpb25zLnNlcnZlck1ldGFkYXRhSXNzdWVyID8/IFRFU1RfQVVUSF9TRVJWRVI7XG5cblx0Y29uc3QgbW9ja0ZldGNoID0gc2lub24uc3R1YigpO1xuXG5cdC8vIE1vY2sgcmVzb3VyY2UgbWV0YWRhdGEgZmV0Y2hcblx0bW9ja0ZldGNoLm9uQ2FsbCgwKS5yZXNvbHZlcyhjcmVhdGVNb2NrUmVzcG9uc2Uoe1xuXHRcdHN0YXR1czogMjAwLFxuXHRcdHVybDogVEVTVF9SRVNPVVJDRV9NRVRBREFUQV9VUkwsXG5cdFx0Ym9keTogSlNPTi5zdHJpbmdpZnkob3B0aW9ucy5yZXNvdXJjZU1ldGFkYXRhID8/IHtcblx0XHRcdHJlc291cmNlOiBURVNUX01DUF9VUkwsXG5cdFx0XHRhdXRob3JpemF0aW9uX3NlcnZlcnM6IFtpc3N1ZXJdXG5cdFx0fSlcblx0fSkpO1xuXG5cdC8vIE1vY2sgc2VydmVyIG1ldGFkYXRhIGZldGNoXG5cdG1vY2tGZXRjaC5vbkNhbGwoMSkucmVzb2x2ZXMoY3JlYXRlTW9ja1Jlc3BvbnNlKHtcblx0XHRzdGF0dXM6IDIwMCxcblx0XHR1cmw6IGAke2lzc3Vlcn0vLndlbGwta25vd24vb2F1dGgtYXV0aG9yaXphdGlvbi1zZXJ2ZXJgLFxuXHRcdGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdGlzc3Vlcixcblx0XHRcdGF1dGhvcml6YXRpb25fZW5kcG9pbnQ6IGAke2lzc3Vlcn0vYXV0aG9yaXplYCxcblx0XHRcdHRva2VuX2VuZHBvaW50OiBgJHtpc3N1ZXJ9L3Rva2VuYCxcblx0XHRcdHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJ11cblx0XHR9KVxuXHR9KSk7XG5cblx0Y29uc3Qgd3d3QXV0aEhlYWRlciA9IG9wdGlvbnMuc2NvcGVzXG5cdFx0PyBgQmVhcmVyIHNjb3BlPVwiJHtvcHRpb25zLnNjb3Blcy5qb2luKCcgJyl9XCJgXG5cdFx0OiAnQmVhcmVyIHJlYWxtPVwiZXhhbXBsZVwiJztcblxuXHRjb25zdCBvcmlnaW5hbFJlc3BvbnNlID0gY3JlYXRlTW9ja1Jlc3BvbnNlKHtcblx0XHRzdGF0dXM6IDQwMSxcblx0XHR1cmw6IFRFU1RfTUNQX1VSTCxcblx0XHRoZWFkZXJzOiB7XG5cdFx0XHQnV1dXLUF1dGhlbnRpY2F0ZSc6IHd3d0F1dGhIZWFkZXJcblx0XHR9XG5cdH0pO1xuXG5cdGNvbnN0IGF1dGhNZXRhZGF0YSA9IGF3YWl0IGNyZWF0ZUF1dGhNZXRhZGF0YShcblx0XHRURVNUX01DUF9VUkwsXG5cdFx0b3JpZ2luYWxSZXNwb25zZS5oZWFkZXJzLFxuXHRcdHtcblx0XHRcdHNhbWVPcmlnaW5IZWFkZXJzOiB7fSxcblx0XHRcdGZldGNoOiBtb2NrRmV0Y2gsXG5cdFx0XHRsb2c6IG1vY2tMb2dnZXJcblx0XHR9XG5cdCk7XG5cblx0cmV0dXJuIHsgYXV0aE1ldGFkYXRhLCBsb2dNZXNzYWdlcyB9O1xufVxuXG5zdWl0ZSgnRXh0SG9zdE1jcCcsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ0lBdXRoTWV0YWRhdGEnLCAoKSA9PiB7XG5cdFx0c3VpdGUoJ3Byb3BlcnRpZXMnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0KCdzaG91bGQgZXhwb3NlIHJlYWRvbmx5IHByb3BlcnRpZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHsgYXV0aE1ldGFkYXRhIH0gPSBhd2FpdCBjcmVhdGVUZXN0QXV0aE1ldGFkYXRhKHtcblx0XHRcdFx0XHRzY29wZXM6IFsncmVhZCcsICd3cml0ZSddLFxuXHRcdFx0XHRcdHNlcnZlck1ldGFkYXRhSXNzdWVyOiBURVNUX0FVVEhfU0VSVkVSXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGFzc2VydC5vayhhdXRoTWV0YWRhdGEuYXV0aG9yaXphdGlvblNlcnZlci50b1N0cmluZygpLnN0YXJ0c1dpdGgoVEVTVF9BVVRIX1NFUlZFUikpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXV0aE1ldGFkYXRhLnNlcnZlck1ldGFkYXRhLmlzc3VlciwgVEVTVF9BVVRIX1NFUlZFUik7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXV0aE1ldGFkYXRhLnNjb3BlcywgWydyZWFkJywgJ3dyaXRlJ10pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3Nob3VsZCBhbGxvdyB1bmRlZmluZWQgc2NvcGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB7IGF1dGhNZXRhZGF0YSB9ID0gYXdhaXQgY3JlYXRlVGVzdEF1dGhNZXRhZGF0YSh7XG5cdFx0XHRcdFx0c2NvcGVzOiB1bmRlZmluZWRcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF1dGhNZXRhZGF0YS5zY29wZXMsIHVuZGVmaW5lZCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHN1aXRlKCd1cGRhdGUoKScsICgpID0+IHtcblx0XHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gdHJ1ZSBhbmQgdXBkYXRlIHNjb3BlcyB3aGVuIFdXVy1BdXRoZW50aWNhdGUgaGVhZGVyIGNvbnRhaW5zIG5ldyBzY29wZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHsgYXV0aE1ldGFkYXRhIH0gPSBhd2FpdCBjcmVhdGVUZXN0QXV0aE1ldGFkYXRhKHtcblx0XHRcdFx0XHRzY29wZXM6IFsncmVhZCddXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNvbnN0IHJlc3BvbnNlID0gY3JlYXRlTW9ja1Jlc3BvbnNlKHtcblx0XHRcdFx0XHRzdGF0dXM6IDQwMSxcblx0XHRcdFx0XHRoZWFkZXJzOiB7XG5cdFx0XHRcdFx0XHQnV1dXLUF1dGhlbnRpY2F0ZSc6ICdCZWFyZXIgc2NvcGU9XCJyZWFkIHdyaXRlIGFkbWluXCInXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhdXRoTWV0YWRhdGEudXBkYXRlKHJlc3BvbnNlLmhlYWRlcnMpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHRydWUpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF1dGhNZXRhZGF0YS5zY29wZXMsIFsncmVhZCcsICd3cml0ZScsICdhZG1pbiddKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIGZhbHNlIHdoZW4gc2NvcGVzIGFyZSB0aGUgc2FtZScsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgeyBhdXRoTWV0YWRhdGEgfSA9IGF3YWl0IGNyZWF0ZVRlc3RBdXRoTWV0YWRhdGEoe1xuXHRcdFx0XHRcdHNjb3BlczogWydyZWFkJywgJ3dyaXRlJ11cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBjcmVhdGVNb2NrUmVzcG9uc2Uoe1xuXHRcdFx0XHRcdHN0YXR1czogNDAxLFxuXHRcdFx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0XHRcdCdXV1ctQXV0aGVudGljYXRlJzogJ0JlYXJlciBzY29wZT1cInJlYWQgd3JpdGVcIidcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF1dGhNZXRhZGF0YS51cGRhdGUocmVzcG9uc2UuaGVhZGVycyk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgZmFsc2UpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF1dGhNZXRhZGF0YS5zY29wZXMsIFsncmVhZCcsICd3cml0ZSddKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIGZhbHNlIHdoZW4gc2NvcGVzIGFyZSBzYW1lIGJ1dCBpbiBkaWZmZXJlbnQgb3JkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHsgYXV0aE1ldGFkYXRhIH0gPSBhd2FpdCBjcmVhdGVUZXN0QXV0aE1ldGFkYXRhKHtcblx0XHRcdFx0XHRzY29wZXM6IFsncmVhZCcsICd3cml0ZSddXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNvbnN0IHJlc3BvbnNlID0gY3JlYXRlTW9ja1Jlc3BvbnNlKHtcblx0XHRcdFx0XHRzdGF0dXM6IDQwMSxcblx0XHRcdFx0XHRoZWFkZXJzOiB7XG5cdFx0XHRcdFx0XHQnV1dXLUF1dGhlbnRpY2F0ZSc6ICdCZWFyZXIgc2NvcGU9XCJ3cml0ZSByZWFkXCInXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhdXRoTWV0YWRhdGEudXBkYXRlKHJlc3BvbnNlLmhlYWRlcnMpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIGZhbHNlKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIHRydWUgd2hlbiB1cGRhdGluZyBmcm9tIHVuZGVmaW5lZCBzY29wZXMgdG8gZGVmaW5lZCBzY29wZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHsgYXV0aE1ldGFkYXRhIH0gPSBhd2FpdCBjcmVhdGVUZXN0QXV0aE1ldGFkYXRhKHtcblx0XHRcdFx0XHRzY29wZXM6IHVuZGVmaW5lZFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRjb25zdCByZXNwb25zZSA9IGNyZWF0ZU1vY2tSZXNwb25zZSh7XG5cdFx0XHRcdFx0c3RhdHVzOiA0MDEsXG5cdFx0XHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHRcdFx0J1dXVy1BdXRoZW50aWNhdGUnOiAnQmVhcmVyIHNjb3BlPVwicmVhZFwiJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXV0aE1ldGFkYXRhLnVwZGF0ZShyZXNwb25zZS5oZWFkZXJzKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB0cnVlKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhdXRoTWV0YWRhdGEuc2NvcGVzLCBbJ3JlYWQnXSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnc2hvdWxkIHJldHVybiB0cnVlIHdoZW4gdXBkYXRpbmcgZnJvbSBkZWZpbmVkIHNjb3BlcyB0byB1bmRlZmluZWQgKG5vIHNjb3BlIGluIGhlYWRlciknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHsgYXV0aE1ldGFkYXRhIH0gPSBhd2FpdCBjcmVhdGVUZXN0QXV0aE1ldGFkYXRhKHtcblx0XHRcdFx0XHRzY29wZXM6IFsncmVhZCddXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNvbnN0IHJlc3BvbnNlID0gY3JlYXRlTW9ja1Jlc3BvbnNlKHtcblx0XHRcdFx0XHRzdGF0dXM6IDQwMSxcblx0XHRcdFx0XHRoZWFkZXJzOiB7XG5cdFx0XHRcdFx0XHQnV1dXLUF1dGhlbnRpY2F0ZSc6ICdCZWFyZXIgcmVhbG09XCJleGFtcGxlXCInXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhdXRoTWV0YWRhdGEudXBkYXRlKHJlc3BvbnNlLmhlYWRlcnMpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHRydWUpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXV0aE1ldGFkYXRhLnNjb3BlcywgdW5kZWZpbmVkKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIGZhbHNlIHdoZW4gbm8gV1dXLUF1dGhlbnRpY2F0ZSBoZWFkZXIgYW5kIHNjb3BlcyBhcmUgYWxyZWFkeSB1bmRlZmluZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHsgYXV0aE1ldGFkYXRhIH0gPSBhd2FpdCBjcmVhdGVUZXN0QXV0aE1ldGFkYXRhKHtcblx0XHRcdFx0XHRzY29wZXM6IHVuZGVmaW5lZFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRjb25zdCByZXNwb25zZSA9IGNyZWF0ZU1vY2tSZXNwb25zZSh7XG5cdFx0XHRcdFx0c3RhdHVzOiA0MDEsXG5cdFx0XHRcdFx0aGVhZGVyczoge31cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXV0aE1ldGFkYXRhLnVwZGF0ZShyZXNwb25zZS5oZWFkZXJzKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCBmYWxzZSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBtdWx0aXBsZSBCZWFyZXIgY2hhbGxlbmdlcyBhbmQgdXNlIGZpcnN0IHNjb3BlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB7IGF1dGhNZXRhZGF0YSB9ID0gYXdhaXQgY3JlYXRlVGVzdEF1dGhNZXRhZGF0YSh7XG5cdFx0XHRcdFx0c2NvcGVzOiB1bmRlZmluZWRcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBjcmVhdGVNb2NrUmVzcG9uc2Uoe1xuXHRcdFx0XHRcdHN0YXR1czogNDAxLFxuXHRcdFx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0XHRcdCdXV1ctQXV0aGVudGljYXRlJzogJ0JlYXJlciBzY29wZT1cImZpcnN0XCIsIEJlYXJlciBzY29wZT1cInNlY29uZFwiJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0YXV0aE1ldGFkYXRhLnVwZGF0ZShyZXNwb25zZS5oZWFkZXJzKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF1dGhNZXRhZGF0YS5zY29wZXMsIFsnZmlyc3QnXSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnc2hvdWxkIGlnbm9yZSBub24tQmVhcmVyIHNjaGVtZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHsgYXV0aE1ldGFkYXRhIH0gPSBhd2FpdCBjcmVhdGVUZXN0QXV0aE1ldGFkYXRhKHtcblx0XHRcdFx0XHRzY29wZXM6IHVuZGVmaW5lZFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRjb25zdCByZXNwb25zZSA9IGNyZWF0ZU1vY2tSZXNwb25zZSh7XG5cdFx0XHRcdFx0c3RhdHVzOiA0MDEsXG5cdFx0XHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHRcdFx0J1dXVy1BdXRoZW50aWNhdGUnOiAnQmFzaWMgcmVhbG09XCJleGFtcGxlXCInXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhdXRoTWV0YWRhdGEudXBkYXRlKHJlc3BvbnNlLmhlYWRlcnMpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIGZhbHNlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF1dGhNZXRhZGF0YS5zY29wZXMsIHVuZGVmaW5lZCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2NyZWF0ZUF1dGhNZXRhZGF0YScsICgpID0+IHtcblx0XHRsZXQgc2FuZGJveDogc2lub24uU2lub25TYW5kYm94O1xuXHRcdGxldCBsb2dNZXNzYWdlczogQXJyYXk8eyBsZXZlbDogTG9nTGV2ZWw7IG1lc3NhZ2U6IHN0cmluZyB9Pjtcblx0XHRsZXQgbW9ja0xvZ2dlcjogKGxldmVsOiBMb2dMZXZlbCwgbWVzc2FnZTogc3RyaW5nKSA9PiB2b2lkO1xuXG5cdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0c2FuZGJveCA9IHNpbm9uLmNyZWF0ZVNhbmRib3goKTtcblx0XHRcdGxvZ01lc3NhZ2VzID0gW107XG5cdFx0XHRtb2NrTG9nZ2VyID0gKGxldmVsLCBtZXNzYWdlKSA9PiBsb2dNZXNzYWdlcy5wdXNoKHsgbGV2ZWwsIG1lc3NhZ2UgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0XHRzYW5kYm94LnJlc3RvcmUoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBjcmVhdGUgSUF1dGhNZXRhZGF0YSB3aXRoIGZldGNoZWQgc2VydmVyIG1ldGFkYXRhJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9ja0ZldGNoID0gc2FuZGJveC5zdHViKCk7XG5cblx0XHRcdC8vIE1vY2sgcmVzb3VyY2UgbWV0YWRhdGEgZmV0Y2hcblx0XHRcdG1vY2tGZXRjaC5vbkNhbGwoMCkucmVzb2x2ZXMoY3JlYXRlTW9ja1Jlc3BvbnNlKHtcblx0XHRcdFx0c3RhdHVzOiAyMDAsXG5cdFx0XHRcdHVybDogVEVTVF9SRVNPVVJDRV9NRVRBREFUQV9VUkwsXG5cdFx0XHRcdGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0XHRyZXNvdXJjZTogVEVTVF9NQ1BfVVJMLFxuXHRcdFx0XHRcdGF1dGhvcml6YXRpb25fc2VydmVyczogW1RFU1RfQVVUSF9TRVJWRVJdLFxuXHRcdFx0XHRcdHNjb3Blc19zdXBwb3J0ZWQ6IFsncmVhZCcsICd3cml0ZSddXG5cdFx0XHRcdH0pXG5cdFx0XHR9KSk7XG5cblx0XHRcdC8vIE1vY2sgc2VydmVyIG1ldGFkYXRhIGZldGNoXG5cdFx0XHRtb2NrRmV0Y2gub25DYWxsKDEpLnJlc29sdmVzKGNyZWF0ZU1vY2tSZXNwb25zZSh7XG5cdFx0XHRcdHN0YXR1czogMjAwLFxuXHRcdFx0XHR1cmw6IGAke1RFU1RfQVVUSF9TRVJWRVJ9Ly53ZWxsLWtub3duL29hdXRoLWF1dGhvcml6YXRpb24tc2VydmVyYCxcblx0XHRcdFx0Ym9keTogSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHRcdGlzc3VlcjogVEVTVF9BVVRIX1NFUlZFUixcblx0XHRcdFx0XHRhdXRob3JpemF0aW9uX2VuZHBvaW50OiBgJHtURVNUX0FVVEhfU0VSVkVSfS9hdXRob3JpemVgLFxuXHRcdFx0XHRcdHRva2VuX2VuZHBvaW50OiBgJHtURVNUX0FVVEhfU0VSVkVSfS90b2tlbmAsXG5cdFx0XHRcdFx0cmVzcG9uc2VfdHlwZXNfc3VwcG9ydGVkOiBbJ2NvZGUnXVxuXHRcdFx0XHR9KVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRjb25zdCBvcmlnaW5hbFJlc3BvbnNlID0gY3JlYXRlTW9ja1Jlc3BvbnNlKHtcblx0XHRcdFx0c3RhdHVzOiA0MDEsXG5cdFx0XHRcdHVybDogVEVTVF9NQ1BfVVJMLFxuXHRcdFx0XHRoZWFkZXJzOiB7XG5cdFx0XHRcdFx0J1dXVy1BdXRoZW50aWNhdGUnOiAnQmVhcmVyIHNjb3BlPVwiYXBpLnJlYWRcIidcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGF1dGhNZXRhZGF0YSA9IGF3YWl0IGNyZWF0ZUF1dGhNZXRhZGF0YShcblx0XHRcdFx0VEVTVF9NQ1BfVVJMLFxuXHRcdFx0XHRvcmlnaW5hbFJlc3BvbnNlLmhlYWRlcnMsXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRzYW1lT3JpZ2luSGVhZGVyczogeyAnWC1DdXN0b20nOiAndmFsdWUnIH0sXG5cdFx0XHRcdFx0ZmV0Y2g6IG1vY2tGZXRjaCxcblx0XHRcdFx0XHRsb2c6IG1vY2tMb2dnZXJcblx0XHRcdFx0fVxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGF1dGhNZXRhZGF0YS5hdXRob3JpemF0aW9uU2VydmVyLnRvU3RyaW5nKCkuc3RhcnRzV2l0aChURVNUX0FVVEhfU0VSVkVSKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXV0aE1ldGFkYXRhLnNlcnZlck1ldGFkYXRhLmlzc3VlciwgVEVTVF9BVVRIX1NFUlZFUik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF1dGhNZXRhZGF0YS5zY29wZXMsIFsnYXBpLnJlYWQnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZmFsbCBiYWNrIHRvIGRlZmF1bHQgbWV0YWRhdGEgd2hlbiBzZXJ2ZXIgbWV0YWRhdGEgZmV0Y2ggZmFpbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2NrRmV0Y2ggPSBzYW5kYm94LnN0dWIoKTtcblxuXHRcdFx0Ly8gTW9jayByZXNvdXJjZSBtZXRhZGF0YSBmZXRjaCAtIGZhaWxzXG5cdFx0XHRtb2NrRmV0Y2gub25DYWxsKDApLnJlamVjdHMobmV3IEVycm9yKCdOZXR3b3JrIGVycm9yJykpO1xuXG5cdFx0XHQvLyBNb2NrIHNlcnZlciBtZXRhZGF0YSBmZXRjaCAtIGFsc28gZmFpbHNcblx0XHRcdG1vY2tGZXRjaC5vbkNhbGwoMSkucmVqZWN0cyhuZXcgRXJyb3IoJ05ldHdvcmsgZXJyb3InKSk7XG5cblx0XHRcdGNvbnN0IG9yaWdpbmFsUmVzcG9uc2UgPSBjcmVhdGVNb2NrUmVzcG9uc2Uoe1xuXHRcdFx0XHRzdGF0dXM6IDQwMSxcblx0XHRcdFx0dXJsOiBURVNUX01DUF9VUkwsXG5cdFx0XHRcdGhlYWRlcnM6IHt9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgYXV0aE1ldGFkYXRhID0gYXdhaXQgY3JlYXRlQXV0aE1ldGFkYXRhKFxuXHRcdFx0XHRURVNUX01DUF9VUkwsXG5cdFx0XHRcdG9yaWdpbmFsUmVzcG9uc2UuaGVhZGVycyxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHNhbWVPcmlnaW5IZWFkZXJzOiB7fSxcblx0XHRcdFx0XHRmZXRjaDogbW9ja0ZldGNoLFxuXHRcdFx0XHRcdGxvZzogbW9ja0xvZ2dlclxuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBTaG91bGQgdXNlIGRlZmF1bHQgbWV0YWRhdGEgYmFzZWQgb24gdGhlIFVSTFxuXHRcdFx0YXNzZXJ0Lm9rKGF1dGhNZXRhZGF0YS5hdXRob3JpemF0aW9uU2VydmVyLnRvU3RyaW5nKCkuc3RhcnRzV2l0aCgnaHR0cHM6Ly9leGFtcGxlLmNvbScpKTtcblx0XHRcdGFzc2VydC5vayhhdXRoTWV0YWRhdGEuc2VydmVyTWV0YWRhdGEuaXNzdWVyLnN0YXJ0c1dpdGgoJ2h0dHBzOi8vZXhhbXBsZS5jb20nKSk7XG5cdFx0XHRhc3NlcnQub2soYXV0aE1ldGFkYXRhLnNlcnZlck1ldGFkYXRhLmF1dGhvcml6YXRpb25fZW5kcG9pbnQ/LnN0YXJ0c1dpdGgoJ2h0dHBzOi8vZXhhbXBsZS5jb20vYXV0aG9yaXplJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGF1dGhNZXRhZGF0YS5zZXJ2ZXJNZXRhZGF0YS50b2tlbl9lbmRwb2ludD8uc3RhcnRzV2l0aCgnaHR0cHM6Ly9leGFtcGxlLmNvbS90b2tlbicpKTtcblxuXHRcdFx0Ly8gU2hvdWxkIGxvZyB0aGUgZmFsbGJhY2tcblx0XHRcdGFzc2VydC5vayhsb2dNZXNzYWdlcy5zb21lKG0gPT5cblx0XHRcdFx0bS5sZXZlbCA9PT0gTG9nTGV2ZWwuSW5mbyAmJlxuXHRcdFx0XHRtLm1lc3NhZ2UuaW5jbHVkZXMoJ1VzaW5nIGRlZmF1bHQgYXV0aCBtZXRhZGF0YScpXG5cdFx0XHQpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB1c2Ugc2NvcGVzIGZyb20gV1dXLUF1dGhlbnRpY2F0ZSBoZWFkZXIgd2hlbiByZXNvdXJjZSBtZXRhZGF0YSBoYXMgbm9uZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1vY2tGZXRjaCA9IHNhbmRib3guc3R1YigpO1xuXG5cdFx0XHQvLyBNb2NrIHJlc291cmNlIG1ldGFkYXRhIGZldGNoIC0gbm8gc2NvcGVzX3N1cHBvcnRlZFxuXHRcdFx0bW9ja0ZldGNoLm9uQ2FsbCgwKS5yZXNvbHZlcyhjcmVhdGVNb2NrUmVzcG9uc2Uoe1xuXHRcdFx0XHRzdGF0dXM6IDIwMCxcblx0XHRcdFx0dXJsOiBURVNUX1JFU09VUkNFX01FVEFEQVRBX1VSTCxcblx0XHRcdFx0Ym9keTogSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHRcdHJlc291cmNlOiBURVNUX01DUF9VUkwsXG5cdFx0XHRcdFx0YXV0aG9yaXphdGlvbl9zZXJ2ZXJzOiBbVEVTVF9BVVRIX1NFUlZFUl1cblx0XHRcdFx0fSlcblx0XHRcdH0pKTtcblxuXHRcdFx0Ly8gTW9jayBzZXJ2ZXIgbWV0YWRhdGEgZmV0Y2hcblx0XHRcdG1vY2tGZXRjaC5vbkNhbGwoMSkucmVzb2x2ZXMoY3JlYXRlTW9ja1Jlc3BvbnNlKHtcblx0XHRcdFx0c3RhdHVzOiAyMDAsXG5cdFx0XHRcdHVybDogYCR7VEVTVF9BVVRIX1NFUlZFUn0vLndlbGwta25vd24vb2F1dGgtYXV0aG9yaXphdGlvbi1zZXJ2ZXJgLFxuXHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdFx0aXNzdWVyOiBURVNUX0FVVEhfU0VSVkVSLFxuXHRcdFx0XHRcdGF1dGhvcml6YXRpb25fZW5kcG9pbnQ6IGAke1RFU1RfQVVUSF9TRVJWRVJ9L2F1dGhvcml6ZWAsXG5cdFx0XHRcdFx0dG9rZW5fZW5kcG9pbnQ6IGAke1RFU1RfQVVUSF9TRVJWRVJ9L3Rva2VuYCxcblx0XHRcdFx0XHRyZXNwb25zZV90eXBlc19zdXBwb3J0ZWQ6IFsnY29kZSddXG5cdFx0XHRcdH0pXG5cdFx0XHR9KSk7XG5cblx0XHRcdGNvbnN0IG9yaWdpbmFsUmVzcG9uc2UgPSBjcmVhdGVNb2NrUmVzcG9uc2Uoe1xuXHRcdFx0XHRzdGF0dXM6IDQwMSxcblx0XHRcdFx0dXJsOiBURVNUX01DUF9VUkwsXG5cdFx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0XHQnV1dXLUF1dGhlbnRpY2F0ZSc6ICdCZWFyZXIgc2NvcGU9XCJoZWFkZXIuc2NvcGVcIidcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGF1dGhNZXRhZGF0YSA9IGF3YWl0IGNyZWF0ZUF1dGhNZXRhZGF0YShcblx0XHRcdFx0VEVTVF9NQ1BfVVJMLFxuXHRcdFx0XHRvcmlnaW5hbFJlc3BvbnNlLmhlYWRlcnMsXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRzYW1lT3JpZ2luSGVhZGVyczoge30sXG5cdFx0XHRcdFx0ZmV0Y2g6IG1vY2tGZXRjaCxcblx0XHRcdFx0XHRsb2c6IG1vY2tMb2dnZXJcblx0XHRcdFx0fVxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhdXRoTWV0YWRhdGEuc2NvcGVzLCBbJ2hlYWRlci5zY29wZSddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB1c2Ugc2NvcGVzIGZyb20gV1dXLUF1dGhlbnRpY2F0ZSBoZWFkZXIgZXZlbiB3aGVuIHJlc291cmNlIG1ldGFkYXRhIGhhcyBzY29wZXNfc3VwcG9ydGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9ja0ZldGNoID0gc2FuZGJveC5zdHViKCk7XG5cblx0XHRcdC8vIE1vY2sgcmVzb3VyY2UgbWV0YWRhdGEgZmV0Y2ggLSBoYXMgc2NvcGVzX3N1cHBvcnRlZFxuXHRcdFx0bW9ja0ZldGNoLm9uQ2FsbCgwKS5yZXNvbHZlcyhjcmVhdGVNb2NrUmVzcG9uc2Uoe1xuXHRcdFx0XHRzdGF0dXM6IDIwMCxcblx0XHRcdFx0dXJsOiBURVNUX1JFU09VUkNFX01FVEFEQVRBX1VSTCxcblx0XHRcdFx0Ym9keTogSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHRcdHJlc291cmNlOiBURVNUX01DUF9VUkwsXG5cdFx0XHRcdFx0YXV0aG9yaXphdGlvbl9zZXJ2ZXJzOiBbVEVTVF9BVVRIX1NFUlZFUl0sXG5cdFx0XHRcdFx0c2NvcGVzX3N1cHBvcnRlZDogWydyZXNvdXJjZS5zY29wZTEnLCAncmVzb3VyY2Uuc2NvcGUyJ11cblx0XHRcdFx0fSlcblx0XHRcdH0pKTtcblxuXHRcdFx0Ly8gTW9jayBzZXJ2ZXIgbWV0YWRhdGEgZmV0Y2hcblx0XHRcdG1vY2tGZXRjaC5vbkNhbGwoMSkucmVzb2x2ZXMoY3JlYXRlTW9ja1Jlc3BvbnNlKHtcblx0XHRcdFx0c3RhdHVzOiAyMDAsXG5cdFx0XHRcdHVybDogYCR7VEVTVF9BVVRIX1NFUlZFUn0vLndlbGwta25vd24vb2F1dGgtYXV0aG9yaXphdGlvbi1zZXJ2ZXJgLFxuXHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdFx0aXNzdWVyOiBURVNUX0FVVEhfU0VSVkVSLFxuXHRcdFx0XHRcdGF1dGhvcml6YXRpb25fZW5kcG9pbnQ6IGAke1RFU1RfQVVUSF9TRVJWRVJ9L2F1dGhvcml6ZWAsXG5cdFx0XHRcdFx0dG9rZW5fZW5kcG9pbnQ6IGAke1RFU1RfQVVUSF9TRVJWRVJ9L3Rva2VuYCxcblx0XHRcdFx0XHRyZXNwb25zZV90eXBlc19zdXBwb3J0ZWQ6IFsnY29kZSddXG5cdFx0XHRcdH0pXG5cdFx0XHR9KSk7XG5cblx0XHRcdGNvbnN0IG9yaWdpbmFsUmVzcG9uc2UgPSBjcmVhdGVNb2NrUmVzcG9uc2Uoe1xuXHRcdFx0XHRzdGF0dXM6IDQwMSxcblx0XHRcdFx0dXJsOiBURVNUX01DUF9VUkwsXG5cdFx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0XHQnV1dXLUF1dGhlbnRpY2F0ZSc6ICdCZWFyZXIgc2NvcGU9XCJoZWFkZXIuc2NvcGVcIidcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGF1dGhNZXRhZGF0YSA9IGF3YWl0IGNyZWF0ZUF1dGhNZXRhZGF0YShcblx0XHRcdFx0VEVTVF9NQ1BfVVJMLFxuXHRcdFx0XHRvcmlnaW5hbFJlc3BvbnNlLmhlYWRlcnMsXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRzYW1lT3JpZ2luSGVhZGVyczoge30sXG5cdFx0XHRcdFx0ZmV0Y2g6IG1vY2tGZXRjaCxcblx0XHRcdFx0XHRsb2c6IG1vY2tMb2dnZXJcblx0XHRcdFx0fVxuXHRcdFx0KTtcblxuXHRcdFx0Ly8gV1dXLUF1dGhlbnRpY2F0ZSBoZWFkZXIgc2NvcGVzIHRha2UgcHJlY2VkZW5jZSBvdmVyIHJlc291cmNlIG1ldGFkYXRhIHNjb3Blc19zdXBwb3J0ZWRcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXV0aE1ldGFkYXRhLnNjb3BlcywgWydoZWFkZXIuc2NvcGUnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgdXNlIHJlc291cmNlX21ldGFkYXRhIGNoYWxsZW5nZSBVUkwgZnJvbSBXV1ctQXV0aGVudGljYXRlIGhlYWRlcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1vY2tGZXRjaCA9IHNhbmRib3guc3R1YigpO1xuXG5cdFx0XHQvLyBNb2NrIHJlc291cmNlIG1ldGFkYXRhIGZldGNoIGZyb20gY2hhbGxlbmdlIFVSTFxuXHRcdFx0bW9ja0ZldGNoLm9uQ2FsbCgwKS5yZXNvbHZlcyhjcmVhdGVNb2NrUmVzcG9uc2Uoe1xuXHRcdFx0XHRzdGF0dXM6IDIwMCxcblx0XHRcdFx0dXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9jdXN0b20tcmVzb3VyY2UtbWV0YWRhdGEnLFxuXHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdFx0cmVzb3VyY2U6IFRFU1RfTUNQX1VSTCxcblx0XHRcdFx0XHRhdXRob3JpemF0aW9uX3NlcnZlcnM6IFtURVNUX0FVVEhfU0VSVkVSXVxuXHRcdFx0XHR9KVxuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBNb2NrIHNlcnZlciBtZXRhZGF0YSBmZXRjaFxuXHRcdFx0bW9ja0ZldGNoLm9uQ2FsbCgxKS5yZXNvbHZlcyhjcmVhdGVNb2NrUmVzcG9uc2Uoe1xuXHRcdFx0XHRzdGF0dXM6IDIwMCxcblx0XHRcdFx0dXJsOiBgJHtURVNUX0FVVEhfU0VSVkVSfS8ud2VsbC1rbm93bi9vYXV0aC1hdXRob3JpemF0aW9uLXNlcnZlcmAsXG5cdFx0XHRcdGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0XHRpc3N1ZXI6IFRFU1RfQVVUSF9TRVJWRVIsXG5cdFx0XHRcdFx0YXV0aG9yaXphdGlvbl9lbmRwb2ludDogYCR7VEVTVF9BVVRIX1NFUlZFUn0vYXV0aG9yaXplYCxcblx0XHRcdFx0XHR0b2tlbl9lbmRwb2ludDogYCR7VEVTVF9BVVRIX1NFUlZFUn0vdG9rZW5gLFxuXHRcdFx0XHRcdHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJ11cblx0XHRcdFx0fSlcblx0XHRcdH0pKTtcblxuXHRcdFx0Y29uc3Qgb3JpZ2luYWxSZXNwb25zZSA9IGNyZWF0ZU1vY2tSZXNwb25zZSh7XG5cdFx0XHRcdHN0YXR1czogNDAxLFxuXHRcdFx0XHR1cmw6IFRFU1RfTUNQX1VSTCxcblx0XHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHRcdCdXV1ctQXV0aGVudGljYXRlJzogJ0JlYXJlciByZXNvdXJjZV9tZXRhZGF0YT1cImh0dHBzOi8vZXhhbXBsZS5jb20vY3VzdG9tLXJlc291cmNlLW1ldGFkYXRhXCInXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBhdXRoTWV0YWRhdGEgPSBhd2FpdCBjcmVhdGVBdXRoTWV0YWRhdGEoXG5cdFx0XHRcdFRFU1RfTUNQX1VSTCxcblx0XHRcdFx0b3JpZ2luYWxSZXNwb25zZS5oZWFkZXJzLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0c2FtZU9yaWdpbkhlYWRlcnM6IHt9LFxuXHRcdFx0XHRcdGZldGNoOiBtb2NrRmV0Y2gsXG5cdFx0XHRcdFx0bG9nOiBtb2NrTG9nZ2VyXG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5vayhhdXRoTWV0YWRhdGEuYXV0aG9yaXphdGlvblNlcnZlci50b1N0cmluZygpLnN0YXJ0c1dpdGgoVEVTVF9BVVRIX1NFUlZFUikpO1xuXG5cdFx0XHQvLyBWZXJpZnkgdGhlIHJlc291cmNlX21ldGFkYXRhIFVSTCB3YXMgbG9nZ2VkXG5cdFx0XHRhc3NlcnQub2sobG9nTWVzc2FnZXMuc29tZShtID0+XG5cdFx0XHRcdG0ubGV2ZWwgPT09IExvZ0xldmVsLkRlYnVnICYmXG5cdFx0XHRcdG0ubWVzc2FnZS5pbmNsdWRlcygncmVzb3VyY2VfbWV0YWRhdGEgY2hhbGxlbmdlJylcblx0XHRcdCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHBhc3MgbGF1bmNoIGhlYWRlcnMgd2hlbiBmZXRjaGluZyBtZXRhZGF0YSBmcm9tIHNhbWUgb3JpZ2luJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9ja0ZldGNoID0gc2FuZGJveC5zdHViKCk7XG5cblx0XHRcdC8vIE1vY2sgcmVzb3VyY2UgbWV0YWRhdGEgZmV0Y2ggdG8gc3VjY2VlZCBzbyB3ZSBjYW4gdmVyaWZ5IGhlYWRlcnNcblx0XHRcdG1vY2tGZXRjaC5vbkNhbGwoMCkucmVzb2x2ZXMoY3JlYXRlTW9ja1Jlc3BvbnNlKHtcblx0XHRcdFx0c3RhdHVzOiAyMDAsXG5cdFx0XHRcdHVybDogVEVTVF9SRVNPVVJDRV9NRVRBREFUQV9VUkwsXG5cdFx0XHRcdGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0XHRyZXNvdXJjZTogVEVTVF9NQ1BfVVJMLFxuXHRcdFx0XHRcdGF1dGhvcml6YXRpb25fc2VydmVyczogW1RFU1RfQVVUSF9TRVJWRVJdXG5cdFx0XHRcdH0pXG5cdFx0XHR9KSk7XG5cblx0XHRcdC8vIE1vY2sgc2VydmVyIG1ldGFkYXRhIGZldGNoXG5cdFx0XHRtb2NrRmV0Y2gub25DYWxsKDEpLnJlc29sdmVzKGNyZWF0ZU1vY2tSZXNwb25zZSh7XG5cdFx0XHRcdHN0YXR1czogMjAwLFxuXHRcdFx0XHR1cmw6IGAke1RFU1RfQVVUSF9TRVJWRVJ9Ly53ZWxsLWtub3duL29hdXRoLWF1dGhvcml6YXRpb24tc2VydmVyYCxcblx0XHRcdFx0Ym9keTogSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHRcdGlzc3VlcjogVEVTVF9BVVRIX1NFUlZFUixcblx0XHRcdFx0XHRhdXRob3JpemF0aW9uX2VuZHBvaW50OiBgJHtURVNUX0FVVEhfU0VSVkVSfS9hdXRob3JpemVgLFxuXHRcdFx0XHRcdHRva2VuX2VuZHBvaW50OiBgJHtURVNUX0FVVEhfU0VSVkVSfS90b2tlbmAsXG5cdFx0XHRcdFx0cmVzcG9uc2VfdHlwZXNfc3VwcG9ydGVkOiBbJ2NvZGUnXVxuXHRcdFx0XHR9KVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRjb25zdCBvcmlnaW5hbFJlc3BvbnNlID0gY3JlYXRlTW9ja1Jlc3BvbnNlKHtcblx0XHRcdFx0c3RhdHVzOiA0MDEsXG5cdFx0XHRcdHVybDogVEVTVF9NQ1BfVVJMLFxuXHRcdFx0XHRoZWFkZXJzOiB7fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGxhdW5jaEhlYWRlcnMgPSB7XG5cdFx0XHRcdCdBdXRob3JpemF0aW9uJzogJ0JlYXJlciBleGlzdGluZy10b2tlbicsXG5cdFx0XHRcdCdYLUN1c3RvbS1IZWFkZXInOiAnY3VzdG9tLXZhbHVlJ1xuXHRcdFx0fTtcblxuXHRcdFx0YXdhaXQgY3JlYXRlQXV0aE1ldGFkYXRhKFxuXHRcdFx0XHRURVNUX01DUF9VUkwsXG5cdFx0XHRcdG9yaWdpbmFsUmVzcG9uc2UuaGVhZGVycyxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHNhbWVPcmlnaW5IZWFkZXJzOiBsYXVuY2hIZWFkZXJzLFxuXHRcdFx0XHRcdGZldGNoOiBtb2NrRmV0Y2gsXG5cdFx0XHRcdFx0bG9nOiBtb2NrTG9nZ2VyXG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cblx0XHRcdC8vIFZlcmlmeSBmZXRjaCB3YXMgY2FsbGVkXG5cdFx0XHRhc3NlcnQub2sobW9ja0ZldGNoLmNhbGxlZCwgJ2ZldGNoIHNob3VsZCBoYXZlIGJlZW4gY2FsbGVkJyk7XG5cblx0XHRcdC8vIFZlcmlmeSB0aGUgZmlyc3QgY2FsbCAocmVzb3VyY2UgbWV0YWRhdGEpIGluY2x1ZGVkIHRoZSBsYXVuY2ggaGVhZGVyc1xuXHRcdFx0Y29uc3QgZmlyc3RDYWxsQXJncyA9IG1vY2tGZXRjaC5maXJzdENhbGwuYXJncztcblx0XHRcdGFzc2VydC5vayhmaXJzdENhbGxBcmdzLmxlbmd0aCA+PSAyLCAnZmV0Y2ggc2hvdWxkIGhhdmUgYmVlbiBjYWxsZWQgd2l0aCBvcHRpb25zJyk7XG5cdFx0XHRjb25zdCBmZXRjaE9wdGlvbnMgPSBmaXJzdENhbGxBcmdzWzFdIGFzIFJlcXVlc3RJbml0O1xuXHRcdFx0YXNzZXJ0Lm9rKGZldGNoT3B0aW9ucy5oZWFkZXJzLCAnZmV0Y2ggb3B0aW9ucyBzaG91bGQgaW5jbHVkZSBoZWFkZXJzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIGVtcHR5IHNjb3BlIHN0cmluZyBpbiBXV1ctQXV0aGVudGljYXRlIGhlYWRlcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1vY2tGZXRjaCA9IHNhbmRib3guc3R1YigpO1xuXG5cdFx0XHQvLyBNb2NrIHJlc291cmNlIG1ldGFkYXRhIGZldGNoXG5cdFx0XHRtb2NrRmV0Y2gub25DYWxsKDApLnJlc29sdmVzKGNyZWF0ZU1vY2tSZXNwb25zZSh7XG5cdFx0XHRcdHN0YXR1czogMjAwLFxuXHRcdFx0XHR1cmw6IFRFU1RfUkVTT1VSQ0VfTUVUQURBVEFfVVJMLFxuXHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdFx0cmVzb3VyY2U6IFRFU1RfTUNQX1VSTCxcblx0XHRcdFx0XHRhdXRob3JpemF0aW9uX3NlcnZlcnM6IFtURVNUX0FVVEhfU0VSVkVSXVxuXHRcdFx0XHR9KVxuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBNb2NrIHNlcnZlciBtZXRhZGF0YSBmZXRjaFxuXHRcdFx0bW9ja0ZldGNoLm9uQ2FsbCgxKS5yZXNvbHZlcyhjcmVhdGVNb2NrUmVzcG9uc2Uoe1xuXHRcdFx0XHRzdGF0dXM6IDIwMCxcblx0XHRcdFx0dXJsOiBgJHtURVNUX0FVVEhfU0VSVkVSfS8ud2VsbC1rbm93bi9vYXV0aC1hdXRob3JpemF0aW9uLXNlcnZlcmAsXG5cdFx0XHRcdGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0XHRpc3N1ZXI6IFRFU1RfQVVUSF9TRVJWRVIsXG5cdFx0XHRcdFx0YXV0aG9yaXphdGlvbl9lbmRwb2ludDogYCR7VEVTVF9BVVRIX1NFUlZFUn0vYXV0aG9yaXplYCxcblx0XHRcdFx0XHR0b2tlbl9lbmRwb2ludDogYCR7VEVTVF9BVVRIX1NFUlZFUn0vdG9rZW5gLFxuXHRcdFx0XHRcdHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJ11cblx0XHRcdFx0fSlcblx0XHRcdH0pKTtcblxuXHRcdFx0Y29uc3Qgb3JpZ2luYWxSZXNwb25zZSA9IGNyZWF0ZU1vY2tSZXNwb25zZSh7XG5cdFx0XHRcdHN0YXR1czogNDAxLFxuXHRcdFx0XHR1cmw6IFRFU1RfTUNQX1VSTCxcblx0XHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHRcdCdXV1ctQXV0aGVudGljYXRlJzogJ0JlYXJlciBzY29wZT1cIlwiJ1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgYXV0aE1ldGFkYXRhID0gYXdhaXQgY3JlYXRlQXV0aE1ldGFkYXRhKFxuXHRcdFx0XHRURVNUX01DUF9VUkwsXG5cdFx0XHRcdG9yaWdpbmFsUmVzcG9uc2UuaGVhZGVycyxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHNhbWVPcmlnaW5IZWFkZXJzOiB7fSxcblx0XHRcdFx0XHRmZXRjaDogbW9ja0ZldGNoLFxuXHRcdFx0XHRcdGxvZzogbW9ja0xvZ2dlclxuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBFbXB0eSBzY29wZSBzdHJpbmcgc2hvdWxkIHJlc3VsdCBpbiBlbXB0eSBhcnJheSBvciB1bmRlZmluZWRcblx0XHRcdGFzc2VydC5vayhcblx0XHRcdFx0YXV0aE1ldGFkYXRhLnNjb3BlcyA9PT0gdW5kZWZpbmVkIHx8XG5cdFx0XHRcdChBcnJheS5pc0FycmF5KGF1dGhNZXRhZGF0YS5zY29wZXMpICYmIGF1dGhNZXRhZGF0YS5zY29wZXMubGVuZ3RoID09PSAwKSB8fFxuXHRcdFx0XHQoQXJyYXkuaXNBcnJheShhdXRoTWV0YWRhdGEuc2NvcGVzKSAmJiBhdXRoTWV0YWRhdGEuc2NvcGVzLmV2ZXJ5KHMgPT4gcyA9PT0gJycpKSxcblx0XHRcdFx0J0VtcHR5IHNjb3BlIHN0cmluZyBzaG91bGQgYmUgaGFuZGxlZCBncmFjZWZ1bGx5J1xuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgbWFsZm9ybWVkIFdXVy1BdXRoZW50aWNhdGUgaGVhZGVyIGdyYWNlZnVsbHknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2NrRmV0Y2ggPSBzYW5kYm94LnN0dWIoKTtcblxuXHRcdFx0Ly8gTW9jayByZXNvdXJjZSBtZXRhZGF0YSBmZXRjaFxuXHRcdFx0bW9ja0ZldGNoLm9uQ2FsbCgwKS5yZXNvbHZlcyhjcmVhdGVNb2NrUmVzcG9uc2Uoe1xuXHRcdFx0XHRzdGF0dXM6IDIwMCxcblx0XHRcdFx0dXJsOiBURVNUX1JFU09VUkNFX01FVEFEQVRBX1VSTCxcblx0XHRcdFx0Ym9keTogSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHRcdHJlc291cmNlOiBURVNUX01DUF9VUkwsXG5cdFx0XHRcdFx0YXV0aG9yaXphdGlvbl9zZXJ2ZXJzOiBbVEVTVF9BVVRIX1NFUlZFUl1cblx0XHRcdFx0fSlcblx0XHRcdH0pKTtcblxuXHRcdFx0Ly8gTW9jayBzZXJ2ZXIgbWV0YWRhdGEgZmV0Y2hcblx0XHRcdG1vY2tGZXRjaC5vbkNhbGwoMSkucmVzb2x2ZXMoY3JlYXRlTW9ja1Jlc3BvbnNlKHtcblx0XHRcdFx0c3RhdHVzOiAyMDAsXG5cdFx0XHRcdHVybDogYCR7VEVTVF9BVVRIX1NFUlZFUn0vLndlbGwta25vd24vb2F1dGgtYXV0aG9yaXphdGlvbi1zZXJ2ZXJgLFxuXHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdFx0aXNzdWVyOiBURVNUX0FVVEhfU0VSVkVSLFxuXHRcdFx0XHRcdGF1dGhvcml6YXRpb25fZW5kcG9pbnQ6IGAke1RFU1RfQVVUSF9TRVJWRVJ9L2F1dGhvcml6ZWAsXG5cdFx0XHRcdFx0dG9rZW5fZW5kcG9pbnQ6IGAke1RFU1RfQVVUSF9TRVJWRVJ9L3Rva2VuYCxcblx0XHRcdFx0XHRyZXNwb25zZV90eXBlc19zdXBwb3J0ZWQ6IFsnY29kZSddXG5cdFx0XHRcdH0pXG5cdFx0XHR9KSk7XG5cblx0XHRcdGNvbnN0IG9yaWdpbmFsUmVzcG9uc2UgPSBjcmVhdGVNb2NrUmVzcG9uc2Uoe1xuXHRcdFx0XHRzdGF0dXM6IDQwMSxcblx0XHRcdFx0dXJsOiBURVNUX01DUF9VUkwsXG5cdFx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0XHQvLyBNYWxmb3JtZWQgaGVhZGVyIC0gbWlzc2luZyBjbG9zaW5nIHF1b3RlXG5cdFx0XHRcdFx0J1dXVy1BdXRoZW50aWNhdGUnOiAnQmVhcmVyIHNjb3BlPVwidW5jbG9zZWQnXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBTaG91bGQgbm90IHRocm93IC0gc2hvdWxkIGhhbmRsZSBncmFjZWZ1bGx5XG5cdFx0XHRjb25zdCBhdXRoTWV0YWRhdGEgPSBhd2FpdCBjcmVhdGVBdXRoTWV0YWRhdGEoXG5cdFx0XHRcdFRFU1RfTUNQX1VSTCxcblx0XHRcdFx0b3JpZ2luYWxSZXNwb25zZS5oZWFkZXJzLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0c2FtZU9yaWdpbkhlYWRlcnM6IHt9LFxuXHRcdFx0XHRcdGZldGNoOiBtb2NrRmV0Y2gsXG5cdFx0XHRcdFx0bG9nOiBtb2NrTG9nZ2VyXG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cblx0XHRcdC8vIFNob3VsZCBzdGlsbCBjcmVhdGUgdmFsaWQgYXV0aCBtZXRhZGF0YVxuXHRcdFx0YXNzZXJ0Lm9rKGF1dGhNZXRhZGF0YS5hdXRob3JpemF0aW9uU2VydmVyKTtcblx0XHRcdGFzc2VydC5vayhhdXRoTWV0YWRhdGEuc2VydmVyTWV0YWRhdGEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBpbnZhbGlkIEpTT04gaW4gcmVzb3VyY2UgbWV0YWRhdGEgcmVzcG9uc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2NrRmV0Y2ggPSBzYW5kYm94LnN0dWIoKTtcblxuXHRcdFx0Ly8gTW9jayByZXNvdXJjZSBtZXRhZGF0YSBmZXRjaCAtIHJldHVybnMgaW52YWxpZCBKU09OXG5cdFx0XHRtb2NrRmV0Y2gub25DYWxsKDApLnJlc29sdmVzKGNyZWF0ZU1vY2tSZXNwb25zZSh7XG5cdFx0XHRcdHN0YXR1czogMjAwLFxuXHRcdFx0XHR1cmw6IFRFU1RfUkVTT1VSQ0VfTUVUQURBVEFfVVJMLFxuXHRcdFx0XHRib2R5OiAnbm90IHZhbGlkIGpzb24geydcblx0XHRcdH0pKTtcblxuXHRcdFx0Ly8gTW9jayBzZXJ2ZXIgbWV0YWRhdGEgZmV0Y2ggLSBhbHNvIHJldHVybnMgaW52YWxpZCBKU09OXG5cdFx0XHRtb2NrRmV0Y2gub25DYWxsKDEpLnJlc29sdmVzKGNyZWF0ZU1vY2tSZXNwb25zZSh7XG5cdFx0XHRcdHN0YXR1czogMjAwLFxuXHRcdFx0XHR1cmw6ICdodHRwczovL2V4YW1wbGUuY29tLy53ZWxsLWtub3duL29hdXRoLWF1dGhvcml6YXRpb24tc2VydmVyJyxcblx0XHRcdFx0Ym9keTogJ3sgaW52YWxpZCB9J1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRjb25zdCBvcmlnaW5hbFJlc3BvbnNlID0gY3JlYXRlTW9ja1Jlc3BvbnNlKHtcblx0XHRcdFx0c3RhdHVzOiA0MDEsXG5cdFx0XHRcdHVybDogVEVTVF9NQ1BfVVJMLFxuXHRcdFx0XHRoZWFkZXJzOiB7fVxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFNob3VsZCBmYWxsIGJhY2sgdG8gZGVmYXVsdCBtZXRhZGF0YSwgbm90IHRocm93XG5cdFx0XHRjb25zdCBhdXRoTWV0YWRhdGEgPSBhd2FpdCBjcmVhdGVBdXRoTWV0YWRhdGEoXG5cdFx0XHRcdFRFU1RfTUNQX1VSTCxcblx0XHRcdFx0b3JpZ2luYWxSZXNwb25zZS5oZWFkZXJzLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0c2FtZU9yaWdpbkhlYWRlcnM6IHt9LFxuXHRcdFx0XHRcdGZldGNoOiBtb2NrRmV0Y2gsXG5cdFx0XHRcdFx0bG9nOiBtb2NrTG9nZ2VyXG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cblx0XHRcdC8vIFNob3VsZCB1c2UgZGVmYXVsdCBtZXRhZGF0YVxuXHRcdFx0YXNzZXJ0Lm9rKGF1dGhNZXRhZGF0YS5hdXRob3JpemF0aW9uU2VydmVyKTtcblx0XHRcdGFzc2VydC5vayhhdXRoTWV0YWRhdGEuc2VydmVyTWV0YWRhdGEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBub24tNDAxIHN0YXR1cyBjb2RlcyBpbiB1cGRhdGUoKScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgYXV0aE1ldGFkYXRhIH0gPSBhd2FpdCBjcmVhdGVUZXN0QXV0aE1ldGFkYXRhKHtcblx0XHRcdFx0c2NvcGVzOiBbJ3JlYWQnXVxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFJlc3BvbnNlIHdpdGggNDAzIGluc3RlYWQgb2YgNDAxXG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGNyZWF0ZU1vY2tSZXNwb25zZSh7XG5cdFx0XHRcdHN0YXR1czogNDAzLFxuXHRcdFx0XHRoZWFkZXJzOiB7XG5cdFx0XHRcdFx0J1dXVy1BdXRoZW50aWNhdGUnOiAnQmVhcmVyIHNjb3BlPVwibmV3LnNjb3BlXCInXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHQvLyB1cGRhdGUoKSBzaG91bGQgc3RpbGwgcHJvY2VzcyB0aGUgV1dXLUF1dGhlbnRpY2F0ZSBoZWFkZXIgcmVnYXJkbGVzcyBvZiBzdGF0dXNcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF1dGhNZXRhZGF0YS51cGRhdGUocmVzcG9uc2UuaGVhZGVycyk7XG5cblx0XHRcdC8vIFRoZSBiZWhhdmlvciBkZXBlbmRzIG9uIGltcGxlbWVudGF0aW9uIC0gZWl0aGVyIGl0IHVwZGF0ZXMgb3IgaWdub3JlcyBub24tNDAxXG5cdFx0XHQvLyBUaGlzIHRlc3QgZG9jdW1lbnRzIHRoZSBhY3R1YWwgYmVoYXZpb3Jcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlb2YgcmVzdWx0LCAnYm9vbGVhbicpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFlBQVk7QUFDeEIsWUFBWSxXQUFXO0FBQ3ZCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMEJBQXlEO0FBQ2xFLFNBQVMsK0NBQStDO0FBR3hELE1BQU0sZUFBZTtBQUNyQixNQUFNLG1CQUFtQjtBQUN6QixNQUFNLDZCQUE2QjtBQUtuQyxTQUFTLG1CQUFtQixTQU1UO0FBQ2xCLFFBQU0sVUFBVSxJQUFJLFFBQVEsUUFBUSxXQUFXLENBQUMsQ0FBQztBQUNqRCxTQUFPO0FBQUEsSUFDTixRQUFRLFFBQVEsVUFBVTtBQUFBLElBQzFCLFlBQVksUUFBUSxjQUFjO0FBQUEsSUFDbEMsS0FBSyxRQUFRLE9BQU87QUFBQSxJQUNwQjtBQUFBLElBQ0EsTUFBTTtBQUFBLElBQ04sTUFBTSxZQUFZLEtBQUssTUFBTSxRQUFRLFFBQVEsSUFBSTtBQUFBLElBQ2pELE1BQU0sWUFBWSxRQUFRLFFBQVE7QUFBQSxFQUNuQztBQUNEO0FBTUEsZUFBZSx1QkFBdUIsU0FJaUU7QUFDdEcsUUFBTSxjQUEyRCxDQUFDO0FBQ2xFLFFBQU0sYUFBYSxDQUFDLE9BQWlCLFlBQW9CLFlBQVksS0FBSyxFQUFFLE9BQU8sUUFBUSxDQUFDO0FBRTVGLFFBQU0sU0FBUyxRQUFRLHdCQUF3QjtBQUUvQyxRQUFNLFlBQVksTUFBTSxLQUFLO0FBRzdCLFlBQVUsT0FBTyxDQUFDLEVBQUUsU0FBUyxtQkFBbUI7QUFBQSxJQUMvQyxRQUFRO0FBQUEsSUFDUixLQUFLO0FBQUEsSUFDTCxNQUFNLEtBQUssVUFBVSxRQUFRLG9CQUFvQjtBQUFBLE1BQ2hE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
