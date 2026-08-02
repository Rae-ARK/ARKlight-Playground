import * as assert from "assert";
import * as sinon from "sinon";
import {
  buildIdJagExchangeBody,
  buildResourceRedemptionBody,
  getClaimsFromJWT,
  getDefaultMetadataForUrl,
  isAuthorizationAuthorizeResponse,
  isAuthorizationDeviceResponse,
  isAuthorizationErrorResponse,
  isAuthorizationDynamicClientRegistrationResponse,
  isAuthorizationProtectedResourceMetadata,
  isAuthorizationServerMetadata,
  isAuthorizationTokenResponse,
  parseWWWAuthenticateHeader,
  fetchDynamicRegistration,
  fetchResourceMetadata,
  fetchAuthorizationServerMetadata,
  scopesMatch,
  DEFAULT_AUTH_FLOW_PORT
} from "../../common/oauth.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
import { encodeBase64, VSBuffer } from "../../common/buffer.js";
suite("OAuth", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("Type Guards", () => {
    test("isAuthorizationProtectedResourceMetadata should correctly identify protected resource metadata", () => {
      assert.strictEqual(isAuthorizationProtectedResourceMetadata({ resource: "https://example.com" }), true);
      assert.strictEqual(isAuthorizationProtectedResourceMetadata({
        resource: "https://example.com",
        scopes_supported: ["read", "write"]
      }), true);
      assert.strictEqual(isAuthorizationProtectedResourceMetadata(null), false);
      assert.strictEqual(isAuthorizationProtectedResourceMetadata(void 0), false);
      assert.strictEqual(isAuthorizationProtectedResourceMetadata({}), false);
      assert.strictEqual(isAuthorizationProtectedResourceMetadata("not an object"), false);
      assert.strictEqual(isAuthorizationProtectedResourceMetadata({
        resource: "https://example.com",
        scopes_supported: "not an array"
      }), false);
    });
    test("isAuthorizationServerMetadata should correctly identify server metadata", () => {
      assert.strictEqual(isAuthorizationServerMetadata({
        issuer: "https://example.com",
        response_types_supported: ["code"]
      }), true);
      assert.strictEqual(isAuthorizationServerMetadata({
        issuer: "https://example.com",
        authorization_endpoint: "https://example.com/auth",
        token_endpoint: "https://example.com/token",
        registration_endpoint: "https://example.com/register",
        jwks_uri: "https://example.com/jwks",
        response_types_supported: ["code"]
      }), true);
      assert.strictEqual(isAuthorizationServerMetadata({
        issuer: "http://localhost:8080",
        authorization_endpoint: "http://localhost:8080/auth",
        token_endpoint: "http://localhost:8080/token",
        response_types_supported: ["code"]
      }), true);
      assert.strictEqual(isAuthorizationServerMetadata(null), false);
      assert.strictEqual(isAuthorizationServerMetadata(void 0), false);
      assert.strictEqual(isAuthorizationServerMetadata("not an object"), false);
      assert.throws(() => isAuthorizationServerMetadata({}), /Authorization server metadata must have an issuer/);
      assert.throws(() => isAuthorizationServerMetadata({ response_types_supported: ["code"] }), /Authorization server metadata must have an issuer/);
      assert.throws(() => isAuthorizationServerMetadata({
        issuer: "https://example.com",
        authorization_endpoint: 123,
        response_types_supported: ["code"]
      }), /Authorization server metadata 'authorization_endpoint' must be a string/);
      assert.throws(() => isAuthorizationServerMetadata({
        issuer: "https://example.com",
        token_endpoint: 123,
        response_types_supported: ["code"]
      }), /Authorization server metadata 'token_endpoint' must be a string/);
      assert.throws(() => isAuthorizationServerMetadata({
        issuer: "https://example.com",
        registration_endpoint: [],
        response_types_supported: ["code"]
      }), /Authorization server metadata 'registration_endpoint' must be a string/);
      assert.throws(() => isAuthorizationServerMetadata({
        issuer: "https://example.com",
        jwks_uri: {},
        response_types_supported: ["code"]
      }), /Authorization server metadata 'jwks_uri' must be a string/);
      assert.throws(() => isAuthorizationServerMetadata({
        issuer: "ftp://example.com",
        response_types_supported: ["code"]
      }), /Authorization server metadata 'issuer' must start with http:\/\/ or https:\/\//);
      assert.throws(() => isAuthorizationServerMetadata({
        issuer: "https://example.com",
        authorization_endpoint: "ftp://example.com/auth",
        response_types_supported: ["code"]
      }), /Authorization server metadata 'authorization_endpoint' must start with http:\/\/ or https:\/\//);
      assert.throws(() => isAuthorizationServerMetadata({
        issuer: "https://example.com",
        token_endpoint: "file:///path/to/token",
        response_types_supported: ["code"]
      }), /Authorization server metadata 'token_endpoint' must start with http:\/\/ or https:\/\//);
      assert.throws(() => isAuthorizationServerMetadata({
        issuer: "https://example.com",
        registration_endpoint: "mailto:admin@example.com",
        response_types_supported: ["code"]
      }), /Authorization server metadata 'registration_endpoint' must start with http:\/\/ or https:\/\//);
      assert.throws(() => isAuthorizationServerMetadata({
        issuer: "https://example.com",
        jwks_uri: "data:application/json,{}",
        response_types_supported: ["code"]
      }), /Authorization server metadata 'jwks_uri' must start with http:\/\/ or https:\/\//);
    });
    test("isAuthorizationDynamicClientRegistrationResponse should correctly identify registration response", () => {
      assert.strictEqual(isAuthorizationDynamicClientRegistrationResponse({
        client_id: "client-123",
        client_name: "Test Client"
      }), true);
      assert.strictEqual(isAuthorizationDynamicClientRegistrationResponse(null), false);
      assert.strictEqual(isAuthorizationDynamicClientRegistrationResponse(void 0), false);
      assert.strictEqual(isAuthorizationDynamicClientRegistrationResponse({}), false);
      assert.strictEqual(isAuthorizationDynamicClientRegistrationResponse({ client_id: "just-id" }), true);
      assert.strictEqual(isAuthorizationDynamicClientRegistrationResponse({ client_name: "missing-id" }), false);
      assert.strictEqual(isAuthorizationDynamicClientRegistrationResponse("not an object"), false);
    });
    test("isAuthorizationAuthorizeResponse should correctly identify authorization response", () => {
      assert.strictEqual(isAuthorizationAuthorizeResponse({
        code: "auth-code-123",
        state: "state-123"
      }), true);
      assert.strictEqual(isAuthorizationAuthorizeResponse(null), false);
      assert.strictEqual(isAuthorizationAuthorizeResponse(void 0), false);
      assert.strictEqual(isAuthorizationAuthorizeResponse({}), false);
      assert.strictEqual(isAuthorizationAuthorizeResponse({ code: "missing-state" }), false);
      assert.strictEqual(isAuthorizationAuthorizeResponse({ state: "missing-code" }), false);
      assert.strictEqual(isAuthorizationAuthorizeResponse("not an object"), false);
    });
    test("isAuthorizationTokenResponse should correctly identify token response", () => {
      assert.strictEqual(isAuthorizationTokenResponse({
        access_token: "token-123",
        token_type: "Bearer"
      }), true);
      assert.strictEqual(isAuthorizationTokenResponse(null), false);
      assert.strictEqual(isAuthorizationTokenResponse(void 0), false);
      assert.strictEqual(isAuthorizationTokenResponse({}), false);
      assert.strictEqual(isAuthorizationTokenResponse({ access_token: "missing-type" }), false);
      assert.strictEqual(isAuthorizationTokenResponse({ token_type: "missing-token" }), false);
      assert.strictEqual(isAuthorizationTokenResponse("not an object"), false);
    });
    test("isAuthorizationDeviceResponse should correctly identify device authorization response", () => {
      assert.strictEqual(isAuthorizationDeviceResponse({
        device_code: "device-code-123",
        user_code: "ABCD-EFGH",
        verification_uri: "https://example.com/verify",
        expires_in: 1800
      }), true);
      assert.strictEqual(isAuthorizationDeviceResponse({
        device_code: "device-code-123",
        user_code: "ABCD-EFGH",
        verification_uri: "https://example.com/verify",
        verification_uri_complete: "https://example.com/verify?user_code=ABCD-EFGH",
        expires_in: 1800,
        interval: 5
      }), true);
      assert.strictEqual(isAuthorizationDeviceResponse(null), false);
      assert.strictEqual(isAuthorizationDeviceResponse(void 0), false);
      assert.strictEqual(isAuthorizationDeviceResponse({}), false);
      assert.strictEqual(isAuthorizationDeviceResponse({ device_code: "missing-others" }), false);
      assert.strictEqual(isAuthorizationDeviceResponse({ user_code: "missing-others" }), false);
      assert.strictEqual(isAuthorizationDeviceResponse({ verification_uri: "missing-others" }), false);
      assert.strictEqual(isAuthorizationDeviceResponse({ expires_in: 1800 }), false);
      assert.strictEqual(isAuthorizationDeviceResponse({
        device_code: "device-code-123",
        user_code: "ABCD-EFGH",
        verification_uri: "https://example.com/verify"
        // Missing expires_in
      }), false);
      assert.strictEqual(isAuthorizationDeviceResponse("not an object"), false);
    });
    test("isAuthorizationErrorResponse should correctly identify error response", () => {
      assert.strictEqual(isAuthorizationErrorResponse({
        error: "authorization_pending",
        error_description: "The authorization request is still pending"
      }), true);
      assert.strictEqual(isAuthorizationErrorResponse({
        error: "slow_down",
        error_description: "Polling too fast"
      }), true);
      assert.strictEqual(isAuthorizationErrorResponse({
        error: "access_denied",
        error_description: "The user denied the request"
      }), true);
      assert.strictEqual(isAuthorizationErrorResponse({
        error: "expired_token",
        error_description: "The device code has expired"
      }), true);
      assert.strictEqual(isAuthorizationErrorResponse({
        error: "invalid_request",
        error_description: "The request is missing a required parameter",
        error_uri: "https://example.com/error"
      }), true);
      assert.strictEqual(isAuthorizationErrorResponse(null), false);
      assert.strictEqual(isAuthorizationErrorResponse(void 0), false);
      assert.strictEqual(isAuthorizationErrorResponse({}), false);
      assert.strictEqual(isAuthorizationErrorResponse({ error_description: "missing-error" }), false);
      assert.strictEqual(isAuthorizationErrorResponse("not an object"), false);
    });
  });
  suite("Scope Matching", () => {
    test("scopesMatch should return true for identical scopes", () => {
      const scopes1 = ["test", "scopes"];
      const scopes2 = ["test", "scopes"];
      assert.strictEqual(scopesMatch(scopes1, scopes2), true);
    });
    test("scopesMatch should return true for scopes in different order", () => {
      const scopes1 = ["6f1cc985-85e8-487e-b0dd-aa633302a731/.default", "VSCODE_TENANT:organizations"];
      const scopes2 = ["VSCODE_TENANT:organizations", "6f1cc985-85e8-487e-b0dd-aa633302a731/.default"];
      assert.strictEqual(scopesMatch(scopes1, scopes2), true);
    });
    test("scopesMatch should return false for different scopes", () => {
      const scopes1 = ["test", "scopes"];
      const scopes2 = ["different", "scopes"];
      assert.strictEqual(scopesMatch(scopes1, scopes2), false);
    });
    test("scopesMatch should return false for different length arrays", () => {
      const scopes1 = ["test"];
      const scopes2 = ["test", "scopes"];
      assert.strictEqual(scopesMatch(scopes1, scopes2), false);
    });
    test("scopesMatch should handle complex Microsoft scopes", () => {
      const scopes1 = ["6f1cc985-85e8-487e-b0dd-aa633302a731/.default", "VSCODE_TENANT:organizations"];
      const scopes2 = ["VSCODE_TENANT:organizations", "6f1cc985-85e8-487e-b0dd-aa633302a731/.default"];
      assert.strictEqual(scopesMatch(scopes1, scopes2), true);
    });
    test("scopesMatch should handle empty arrays", () => {
      assert.strictEqual(scopesMatch([], []), true);
    });
    test("scopesMatch should handle single scope arrays", () => {
      assert.strictEqual(scopesMatch(["single"], ["single"]), true);
      assert.strictEqual(scopesMatch(["single"], ["different"]), false);
    });
    test("scopesMatch should handle duplicate scopes within arrays", () => {
      const scopes1 = ["scope1", "scope2", "scope1"];
      const scopes2 = ["scope2", "scope1", "scope1"];
      assert.strictEqual(scopesMatch(scopes1, scopes2), true);
    });
    test("scopesMatch should handle undefined values", () => {
      assert.strictEqual(scopesMatch(void 0, void 0), true);
      assert.strictEqual(scopesMatch(["read"], void 0), false);
      assert.strictEqual(scopesMatch(void 0, ["write"]), false);
    });
    test("scopesMatch should handle mixed undefined and empty arrays", () => {
      assert.strictEqual(scopesMatch([], void 0), false);
      assert.strictEqual(scopesMatch(void 0, []), false);
      assert.strictEqual(scopesMatch([], []), true);
    });
  });
  suite("Utility Functions", () => {
    test("getDefaultMetadataForUrl should return correct default endpoints", () => {
      const authorizationServer = new URL("https://auth.example.com");
      const metadata = getDefaultMetadataForUrl(authorizationServer);
      assert.strictEqual(metadata.issuer, "https://auth.example.com/");
      assert.strictEqual(metadata.authorization_endpoint, "https://auth.example.com/authorize");
      assert.strictEqual(metadata.token_endpoint, "https://auth.example.com/token");
      assert.strictEqual(metadata.registration_endpoint, "https://auth.example.com/register");
      assert.deepStrictEqual(metadata.response_types_supported, ["code", "id_token", "id_token token"]);
    });
  });
  suite("Parsing Functions", () => {
    test("parseWWWAuthenticateHeader should correctly parse simple header", () => {
      const result = parseWWWAuthenticateHeader("Bearer");
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].scheme, "Bearer");
      assert.deepStrictEqual(result[0].params, {});
    });
    test("parseWWWAuthenticateHeader should correctly parse header with parameters", () => {
      const result = parseWWWAuthenticateHeader('Bearer realm="api", error="invalid_token", error_description="The access token expired"');
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].scheme, "Bearer");
      assert.deepStrictEqual(result[0].params, {
        realm: "api",
        error: "invalid_token",
        error_description: "The access token expired"
      });
    });
    test("parseWWWAuthenticateHeader should correctly parse parameters with equal signs", () => {
      const result = parseWWWAuthenticateHeader('Bearer resource_metadata="https://example.com/.well-known/oauth-protected-resource?v=1"');
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].scheme, "Bearer");
      assert.deepStrictEqual(result[0].params, {
        resource_metadata: "https://example.com/.well-known/oauth-protected-resource?v=1"
      });
    });
    test("parseWWWAuthenticateHeader should correctly parse multiple", () => {
      const result = parseWWWAuthenticateHeader('Bearer realm="api", error="invalid_token", error_description="The access token expired", Basic realm="hi"');
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].scheme, "Bearer");
      assert.deepStrictEqual(result[0].params, {
        realm: "api",
        error: "invalid_token",
        error_description: "The access token expired"
      });
      assert.strictEqual(result[1].scheme, "Basic");
      assert.deepStrictEqual(result[1].params, {
        realm: "hi"
      });
    });
    test("getClaimsFromJWT should correctly parse a JWT token", () => {
      const payload = {
        jti: "id123",
        sub: "user123",
        iss: "https://example.com",
        aud: "client123",
        exp: 1716239022,
        iat: 1716235422,
        name: "Test User"
      };
      const header = { alg: "HS256", typ: "JWT" };
      const encodedHeader = encodeBase64(VSBuffer.fromString(JSON.stringify(header)));
      const encodedPayload = encodeBase64(VSBuffer.fromString(JSON.stringify(payload)));
      const fakeSignature = "fake-signature";
      const token = `${encodedHeader}.${encodedPayload}.${fakeSignature}`;
      const claims = getClaimsFromJWT(token);
      assert.deepStrictEqual(claims, payload);
    });
    test("getClaimsFromJWT should throw for invalid JWT format", () => {
      assert.throws(() => getClaimsFromJWT("only.two"), /Invalid JWT token format.*three parts/);
      assert.throws(() => getClaimsFromJWT("one"), /Invalid JWT token format.*three parts/);
      assert.throws(() => getClaimsFromJWT("has.four.parts.here"), /Invalid JWT token format.*three parts/);
    });
    test("getClaimsFromJWT should throw for invalid header content", () => {
      const encodedHeader = encodeBase64(VSBuffer.fromString("not-json"));
      const encodedPayload = encodeBase64(VSBuffer.fromString(JSON.stringify({ sub: "test" })));
      const token = `${encodedHeader}.${encodedPayload}.signature`;
      assert.throws(() => getClaimsFromJWT(token), /Failed to parse JWT token/);
    });
    test("getClaimsFromJWT should throw for invalid payload content", () => {
      const header = { alg: "HS256", typ: "JWT" };
      const encodedHeader = encodeBase64(VSBuffer.fromString(JSON.stringify(header)));
      const encodedPayload = encodeBase64(VSBuffer.fromString("not-json"));
      const token = `${encodedHeader}.${encodedPayload}.signature`;
      assert.throws(() => getClaimsFromJWT(token), /Failed to parse JWT token/);
    });
  });
  suite("Network Functions", () => {
    let sandbox;
    let fetchStub;
    setup(() => {
      sandbox = sinon.createSandbox();
      fetchStub = sandbox.stub(globalThis, "fetch");
    });
    teardown(() => {
      sandbox.restore();
    });
    test("fetchDynamicRegistration should make correct request and parse response", async () => {
      const mockResponse = {
        client_id: "generated-client-id",
        client_name: "Test Client",
        client_uri: "https://code.visualstudio.com"
      };
      fetchStub.resolves({
        ok: true,
        json: async () => mockResponse
      });
      const serverMetadata = {
        issuer: "https://auth.example.com",
        registration_endpoint: "https://auth.example.com/register",
        response_types_supported: ["code"]
      };
      const result = await fetchDynamicRegistration(
        serverMetadata,
        "Test Client"
      );
      assert.strictEqual(fetchStub.callCount, 1);
      const [url, options] = fetchStub.firstCall.args;
      assert.strictEqual(url, "https://auth.example.com/register");
      assert.strictEqual(options.method, "POST");
      assert.strictEqual(options.headers["Content-Type"], "application/json");
      const requestBody = JSON.parse(options.body);
      assert.strictEqual(requestBody.client_name, "Test Client");
      assert.strictEqual(requestBody.client_uri, "https://code.visualstudio.com");
      assert.deepStrictEqual(requestBody.grant_types, ["authorization_code", "refresh_token", "urn:ietf:params:oauth:grant-type:device_code"]);
      assert.deepStrictEqual(requestBody.response_types, ["code"]);
      assert.deepStrictEqual(requestBody.redirect_uris, [
        "https://insiders.vscode.dev/redirect",
        "https://vscode.dev/redirect",
        "http://127.0.0.1/",
        `http://127.0.0.1:${DEFAULT_AUTH_FLOW_PORT}/`
      ]);
      assert.deepStrictEqual(result, mockResponse);
    });
    test("fetchDynamicRegistration should throw error on non-OK response", async () => {
      fetchStub.resolves({
        ok: false,
        statusText: "Bad Request",
        text: async () => "Bad Request"
      });
      const serverMetadata = {
        issuer: "https://auth.example.com",
        registration_endpoint: "https://auth.example.com/register",
        response_types_supported: ["code"]
      };
      await assert.rejects(
        async () => await fetchDynamicRegistration(serverMetadata, "Test Client"),
        /Registration to https:\/\/auth\.example\.com\/register failed: Bad Request/
      );
    });
    test("fetchDynamicRegistration should throw error on invalid response format", async () => {
      fetchStub.resolves({
        ok: true,
        json: async () => ({ invalid: "response" })
        // Missing required fields
      });
      const serverMetadata = {
        issuer: "https://auth.example.com",
        registration_endpoint: "https://auth.example.com/register",
        response_types_supported: ["code"]
      };
      await assert.rejects(
        async () => await fetchDynamicRegistration(serverMetadata, "Test Client"),
        /Invalid authorization dynamic client registration response/
      );
    });
    test("fetchDynamicRegistration should filter grant types based on server metadata", async () => {
      const mockResponse = {
        client_id: "generated-client-id",
        client_name: "Test Client"
      };
      fetchStub.resolves({
        ok: true,
        json: async () => mockResponse
      });
      const serverMetadata = {
        issuer: "https://auth.example.com",
        registration_endpoint: "https://auth.example.com/register",
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "client_credentials", "refresh_token"]
        // Mix of supported and unsupported
      };
      await fetchDynamicRegistration(serverMetadata, "Test Client");
      assert.strictEqual(fetchStub.callCount, 1);
      const [, options] = fetchStub.firstCall.args;
      const requestBody = JSON.parse(options.body);
      assert.deepStrictEqual(requestBody.grant_types, ["authorization_code", "refresh_token"]);
    });
    test("fetchDynamicRegistration should use default grant types when server metadata has none", async () => {
      const mockResponse = {
        client_id: "generated-client-id",
        client_name: "Test Client"
      };
      fetchStub.resolves({
        ok: true,
        json: async () => mockResponse
      });
      const serverMetadata = {
        issuer: "https://auth.example.com",
        registration_endpoint: "https://auth.example.com/register",
        response_types_supported: ["code"]
        // No grant_types_supported specified
      };
      await fetchDynamicRegistration(serverMetadata, "Test Client");
      assert.strictEqual(fetchStub.callCount, 1);
      const [, options] = fetchStub.firstCall.args;
      const requestBody = JSON.parse(options.body);
      assert.deepStrictEqual(requestBody.grant_types, ["authorization_code", "refresh_token", "urn:ietf:params:oauth:grant-type:device_code"]);
    });
    test("fetchDynamicRegistration should throw error when registration endpoint is missing", async () => {
      const serverMetadata = {
        issuer: "https://auth.example.com",
        response_types_supported: ["code"]
        // registration_endpoint is missing
      };
      await assert.rejects(
        async () => await fetchDynamicRegistration(serverMetadata, "Test Client"),
        /Server does not support dynamic registration/
      );
    });
    test("fetchDynamicRegistration should handle structured error response", async () => {
      const errorResponse = {
        error: "invalid_client_metadata",
        error_description: "The client metadata is invalid"
      };
      fetchStub.resolves({
        ok: false,
        text: async () => JSON.stringify(errorResponse)
      });
      const serverMetadata = {
        issuer: "https://auth.example.com",
        registration_endpoint: "https://auth.example.com/register",
        response_types_supported: ["code"]
      };
      await assert.rejects(
        async () => await fetchDynamicRegistration(serverMetadata, "Test Client"),
        /Registration to https:\/\/auth\.example\.com\/register failed: invalid_client_metadata: The client metadata is invalid/
      );
    });
    test("fetchDynamicRegistration should handle structured error response without description", async () => {
      const errorResponse = {
        error: "invalid_redirect_uri"
      };
      fetchStub.resolves({
        ok: false,
        text: async () => JSON.stringify(errorResponse)
      });
      const serverMetadata = {
        issuer: "https://auth.example.com",
        registration_endpoint: "https://auth.example.com/register",
        response_types_supported: ["code"]
      };
      await assert.rejects(
        async () => await fetchDynamicRegistration(serverMetadata, "Test Client"),
        /Registration to https:\/\/auth\.example\.com\/register failed: invalid_redirect_uri/
      );
    });
    test("fetchDynamicRegistration should handle malformed JSON error response", async () => {
      fetchStub.resolves({
        ok: false,
        text: async () => "Invalid JSON {"
      });
      const serverMetadata = {
        issuer: "https://auth.example.com",
        registration_endpoint: "https://auth.example.com/register",
        response_types_supported: ["code"]
      };
      await assert.rejects(
        async () => await fetchDynamicRegistration(serverMetadata, "Test Client"),
        /Registration to https:\/\/auth\.example\.com\/register failed: Invalid JSON \{/
      );
    });
    test("fetchDynamicRegistration should include scopes in request when provided", async () => {
      const mockResponse = {
        client_id: "generated-client-id",
        client_name: "Test Client"
      };
      fetchStub.resolves({
        ok: true,
        json: async () => mockResponse
      });
      const serverMetadata = {
        issuer: "https://auth.example.com",
        registration_endpoint: "https://auth.example.com/register",
        response_types_supported: ["code"]
      };
      await fetchDynamicRegistration(serverMetadata, "Test Client", ["read", "write"]);
      const [, options] = fetchStub.firstCall.args;
      const requestBody = JSON.parse(options.body);
      assert.strictEqual(requestBody.scope, "read write");
    });
    test("fetchDynamicRegistration should omit scope from request when not provided", async () => {
      const mockResponse = {
        client_id: "generated-client-id",
        client_name: "Test Client"
      };
      fetchStub.resolves({
        ok: true,
        json: async () => mockResponse
      });
      const serverMetadata = {
        issuer: "https://auth.example.com",
        registration_endpoint: "https://auth.example.com/register",
        response_types_supported: ["code"]
      };
      await fetchDynamicRegistration(serverMetadata, "Test Client");
      const [, options] = fetchStub.firstCall.args;
      const requestBody = JSON.parse(options.body);
      assert.strictEqual(requestBody.scope, void 0);
    });
    test("fetchDynamicRegistration should handle empty scopes array", async () => {
      const mockResponse = {
        client_id: "generated-client-id",
        client_name: "Test Client"
      };
      fetchStub.resolves({
        ok: true,
        json: async () => mockResponse
      });
      const serverMetadata = {
        issuer: "https://auth.example.com",
        registration_endpoint: "https://auth.example.com/register",
        response_types_supported: ["code"]
      };
      await fetchDynamicRegistration(serverMetadata, "Test Client", []);
      const [, options] = fetchStub.firstCall.args;
      const requestBody = JSON.parse(options.body);
      assert.strictEqual(requestBody.scope, "");
    });
    test("fetchDynamicRegistration should handle network fetch failure", async () => {
      fetchStub.rejects(new Error("Network error"));
      const serverMetadata = {
        issuer: "https://auth.example.com",
        registration_endpoint: "https://auth.example.com/register",
        response_types_supported: ["code"]
      };
      await assert.rejects(
        async () => await fetchDynamicRegistration(serverMetadata, "Test Client"),
        /Network error/
      );
    });
    test("fetchDynamicRegistration should handle response.json() failure", async () => {
      fetchStub.resolves({
        ok: true,
        json: async () => {
          throw new Error("JSON parsing failed");
        }
      });
      const serverMetadata = {
        issuer: "https://auth.example.com",
        registration_endpoint: "https://auth.example.com/register",
        response_types_supported: ["code"]
      };
      await assert.rejects(
        async () => await fetchDynamicRegistration(serverMetadata, "Test Client"),
        /JSON parsing failed/
      );
    });
    test("fetchDynamicRegistration should handle response.text() failure for error cases", async () => {
      fetchStub.resolves({
        ok: false,
        text: async () => {
          throw new Error("Text parsing failed");
        }
      });
      const serverMetadata = {
        issuer: "https://auth.example.com",
        registration_endpoint: "https://auth.example.com/register",
        response_types_supported: ["code"]
      };
      await assert.rejects(
        async () => await fetchDynamicRegistration(serverMetadata, "Test Client"),
        /Text parsing failed/
      );
    });
  });
  suite("Client ID Fallback Scenarios", () => {
    let sandbox;
    let fetchStub;
    setup(() => {
      sandbox = sinon.createSandbox();
      fetchStub = sandbox.stub(globalThis, "fetch");
    });
    teardown(() => {
      sandbox.restore();
    });
    test("fetchDynamicRegistration should throw specific error for missing registration endpoint", async () => {
      const serverMetadata = {
        issuer: "https://auth.example.com",
        response_types_supported: ["code"]
        // registration_endpoint is missing
      };
      await assert.rejects(
        async () => await fetchDynamicRegistration(serverMetadata, "Test Client"),
        {
          message: "Server does not support dynamic registration"
        }
      );
    });
    test("fetchDynamicRegistration should throw specific error for DCR failure", async () => {
      fetchStub.resolves({
        ok: false,
        text: async () => "DCR not supported"
      });
      const serverMetadata = {
        issuer: "https://auth.example.com",
        registration_endpoint: "https://auth.example.com/register",
        response_types_supported: ["code"]
      };
      await assert.rejects(
        async () => await fetchDynamicRegistration(serverMetadata, "Test Client"),
        /Registration to https:\/\/auth\.example\.com\/register failed: DCR not supported/
      );
    });
  });
  suite("fetchResourceMetadata", () => {
    let sandbox;
    let fetchStub;
    setup(() => {
      sandbox = sinon.createSandbox();
      fetchStub = sandbox.stub();
    });
    teardown(() => {
      sandbox.restore();
    });
    test("should successfully fetch and validate resource metadata", async () => {
      const targetResource = "https://example.com/api";
      const resourceMetadataUrl = "https://example.com/.well-known/oauth-protected-resource";
      const expectedMetadata = {
        resource: "https://example.com/api",
        scopes_supported: ["read", "write"]
      };
      fetchStub.resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata)
      });
      const result = await fetchResourceMetadata(
        targetResource,
        resourceMetadataUrl,
        { fetch: fetchStub }
      );
      assert.deepStrictEqual(result.metadata, expectedMetadata);
      assert.strictEqual(result.discoveryUrl, resourceMetadataUrl);
      assert.deepStrictEqual(result.errors, []);
      assert.strictEqual(fetchStub.callCount, 1);
      assert.strictEqual(fetchStub.firstCall.args[0], resourceMetadataUrl);
      assert.strictEqual(fetchStub.firstCall.args[1].method, "GET");
      assert.strictEqual(fetchStub.firstCall.args[1].headers["Accept"], "application/json");
    });
    test("should include same-origin headers when origins match", async () => {
      const targetResource = "https://example.com/api";
      const resourceMetadataUrl = "https://example.com/.well-known/oauth-protected-resource";
      const sameOriginHeaders = {
        "X-Test-Header": "test-value",
        "X-Custom-Header": "value"
      };
      const expectedMetadata = {
        resource: "https://example.com/api"
      };
      fetchStub.resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata)
      });
      const result = await fetchResourceMetadata(
        targetResource,
        resourceMetadataUrl,
        { fetch: fetchStub, sameOriginHeaders }
      );
      assert.strictEqual(result.discoveryUrl, resourceMetadataUrl);
      const headers = fetchStub.firstCall.args[1].headers;
      assert.strictEqual(headers["Accept"], "application/json");
      assert.strictEqual(headers["X-Test-Header"], "test-value");
      assert.strictEqual(headers["X-Custom-Header"], "value");
    });
    test("should not include same-origin headers when origins differ", async () => {
      const targetResource = "https://example.com/api";
      const resourceMetadataUrl = "https://other-domain.com/.well-known/oauth-protected-resource";
      const sameOriginHeaders = {
        "X-Test-Header": "test-value"
      };
      const expectedMetadata = {
        resource: "https://example.com/api"
      };
      fetchStub.resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata)
      });
      const result = await fetchResourceMetadata(
        targetResource,
        resourceMetadataUrl,
        { fetch: fetchStub, sameOriginHeaders }
      );
      assert.strictEqual(result.discoveryUrl, resourceMetadataUrl);
      const headers = fetchStub.firstCall.args[1].headers;
      assert.strictEqual(headers["Accept"], "application/json");
      assert.strictEqual(headers["X-Test-Header"], void 0);
    });
    test("should throw error when fetch returns non-200 status", async () => {
      const targetResource = "https://example.com/api";
      const resourceMetadataUrl = "https://example.com/.well-known/oauth-protected-resource";
      fetchStub.resolves({
        status: 404,
        text: async () => "Not Found"
      });
      await assert.rejects(
        async () => fetchResourceMetadata(targetResource, resourceMetadataUrl, { fetch: fetchStub }),
        (error) => {
          assert.ok(error instanceof AggregateError || /Failed to fetch resource metadata from.*404 Not Found/.test(error.message));
          return true;
        }
      );
    });
    test("should handle error when response.text() throws", async () => {
      const targetResource = "https://example.com/api";
      const resourceMetadataUrl = "https://example.com/.well-known/oauth-protected-resource";
      fetchStub.resolves({
        status: 500,
        statusText: "Internal Server Error",
        text: async () => {
          throw new Error("Cannot read response");
        }
      });
      await assert.rejects(
        async () => fetchResourceMetadata(targetResource, resourceMetadataUrl, { fetch: fetchStub }),
        (error) => {
          assert.ok(error instanceof AggregateError || /Failed to fetch resource metadata from.*500 Internal Server Error/.test(error.message));
          return true;
        }
      );
    });
    test("should throw error when resource property does not match target resource", async () => {
      const targetResource = "https://example.com/api";
      const resourceMetadataUrl = "https://example.com/.well-known/oauth-protected-resource";
      const metadata = {
        resource: "https://different.com/api"
      };
      fetchStub.resolves({
        status: 200,
        json: async () => metadata,
        text: async () => JSON.stringify(metadata)
      });
      await assert.rejects(
        async () => fetchResourceMetadata(targetResource, resourceMetadataUrl, { fetch: fetchStub }),
        (error) => {
          assert.ok(error instanceof AggregateError);
          assert.ok(error.errors.some((e) => /does not match expected value/.test(e.message)));
          return true;
        }
      );
    });
    test("should normalize URLs when comparing resource values", async () => {
      const targetResource = "https://EXAMPLE.COM/api";
      const resourceMetadataUrl = "https://example.com/.well-known/oauth-protected-resource";
      const metadata = {
        resource: "https://example.com/api"
      };
      fetchStub.resolves({
        status: 200,
        json: async () => metadata,
        text: async () => JSON.stringify(metadata)
      });
      const result = await fetchResourceMetadata(targetResource, resourceMetadataUrl, { fetch: fetchStub });
      assert.deepStrictEqual(result.metadata, metadata);
      assert.strictEqual(result.discoveryUrl, resourceMetadataUrl);
    });
    test("should throw error when response is not valid resource metadata", async () => {
      const targetResource = "https://example.com/api";
      const resourceMetadataUrl = "https://example.com/.well-known/oauth-protected-resource";
      const invalidMetadata = {
        // Missing required 'resource' property
        scopes_supported: ["read", "write"]
      };
      fetchStub.resolves({
        status: 200,
        json: async () => invalidMetadata,
        text: async () => JSON.stringify(invalidMetadata)
      });
      await assert.rejects(
        async () => fetchResourceMetadata(targetResource, resourceMetadataUrl, { fetch: fetchStub }),
        (error) => {
          assert.ok(error instanceof AggregateError || /Invalid resource metadata/.test(error.message));
          return true;
        }
      );
    });
    test("should throw error when scopes_supported is not an array", async () => {
      const targetResource = "https://example.com/api";
      const resourceMetadataUrl = "https://example.com/.well-known/oauth-protected-resource";
      const invalidMetadata = {
        resource: "https://example.com/api",
        scopes_supported: "not an array"
      };
      fetchStub.resolves({
        status: 200,
        json: async () => invalidMetadata,
        text: async () => JSON.stringify(invalidMetadata)
      });
      await assert.rejects(
        async () => fetchResourceMetadata(targetResource, resourceMetadataUrl, { fetch: fetchStub }),
        (error) => {
          assert.ok(error instanceof AggregateError || /Invalid resource metadata/.test(error.message));
          return true;
        }
      );
    });
    test("should handle metadata with optional fields", async () => {
      const targetResource = "https://example.com/api";
      const resourceMetadataUrl = "https://example.com/.well-known/oauth-protected-resource";
      const metadata = {
        resource: "https://example.com/api",
        resource_name: "Example API",
        authorization_servers: ["https://auth.example.com"],
        jwks_uri: "https://example.com/jwks",
        scopes_supported: ["read", "write", "admin"],
        bearer_methods_supported: ["header", "body"],
        resource_documentation: "https://example.com/docs"
      };
      fetchStub.resolves({
        status: 200,
        json: async () => metadata,
        text: async () => JSON.stringify(metadata)
      });
      const result = await fetchResourceMetadata(targetResource, resourceMetadataUrl, { fetch: fetchStub });
      assert.deepStrictEqual(result.metadata, metadata);
    });
    test("should use global fetch when custom fetch is not provided", async () => {
      const targetResource = "https://example.com/api";
      const resourceMetadataUrl = "https://example.com/.well-known/oauth-protected-resource";
      const metadata = {
        resource: "https://example.com/api"
      };
      const globalFetchStub = sandbox.stub(globalThis, "fetch").resolves({
        status: 200,
        json: async () => metadata,
        text: async () => JSON.stringify(metadata)
      });
      const result = await fetchResourceMetadata(targetResource, resourceMetadataUrl);
      assert.deepStrictEqual(result.metadata, metadata);
      assert.strictEqual(result.discoveryUrl, resourceMetadataUrl);
      assert.strictEqual(globalFetchStub.callCount, 1);
    });
    test("should handle same origin with different ports", async () => {
      const targetResource = "https://example.com:8080/api";
      const resourceMetadataUrl = "https://example.com:9090/.well-known/oauth-protected-resource";
      const sameOriginHeaders = {
        "X-Test-Header": "test-value"
      };
      const metadata = {
        resource: "https://example.com:8080/api"
      };
      fetchStub.resolves({
        status: 200,
        json: async () => metadata,
        text: async () => JSON.stringify(metadata)
      });
      const result = await fetchResourceMetadata(
        targetResource,
        resourceMetadataUrl,
        { fetch: fetchStub, sameOriginHeaders }
      );
      assert.strictEqual(result.discoveryUrl, resourceMetadataUrl);
      const headers = fetchStub.firstCall.args[1].headers;
      assert.strictEqual(headers["X-Test-Header"], void 0);
    });
    test("should handle same origin with different protocols", async () => {
      const targetResource = "http://example.com/api";
      const resourceMetadataUrl = "https://example.com/.well-known/oauth-protected-resource";
      const sameOriginHeaders = {
        "X-Test-Header": "test-value"
      };
      const metadata = {
        resource: "http://example.com/api"
      };
      fetchStub.resolves({
        status: 200,
        json: async () => metadata,
        text: async () => JSON.stringify(metadata)
      });
      const result = await fetchResourceMetadata(
        targetResource,
        resourceMetadataUrl,
        { fetch: fetchStub, sameOriginHeaders }
      );
      assert.strictEqual(result.discoveryUrl, resourceMetadataUrl);
      const headers = fetchStub.firstCall.args[1].headers;
      assert.strictEqual(headers["X-Test-Header"], void 0);
    });
    test("should include error details in message with resource values", async () => {
      const targetResource = "https://example.com/api";
      const resourceMetadataUrl = "https://example.com/.well-known/oauth-protected-resource";
      const metadata = {
        resource: "https://different.com/other"
      };
      fetchStub.resolves({
        status: 200,
        json: async () => metadata,
        text: async () => JSON.stringify(metadata)
      });
      try {
        await fetchResourceMetadata(targetResource, resourceMetadataUrl, { fetch: fetchStub });
        assert.fail("Should have thrown an error");
      } catch (error) {
        const errorMessage = error instanceof AggregateError ? error.errors.map((e) => e.message).join(" ") : error.message;
        assert.ok(/does not match expected value/.test(errorMessage), "Error message should mention mismatch");
        assert.ok(/https:\/\/different\.com\/other/.test(errorMessage), "Error message should include actual resource value");
        assert.ok(/https:\/\/example\.com\/api/.test(errorMessage), "Error message should include expected resource value");
      }
    });
    test("should fallback to well-known URI with path when no resourceMetadataUrl provided", async () => {
      const targetResource = "https://example.com/api/v1";
      const expectedMetadata = {
        resource: "https://example.com/api/v1",
        scopes_supported: ["read", "write"]
      };
      fetchStub.resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata)
      });
      const result = await fetchResourceMetadata(
        targetResource,
        void 0,
        { fetch: fetchStub }
      );
      assert.deepStrictEqual(result.metadata, expectedMetadata);
      assert.strictEqual(result.discoveryUrl, "https://example.com/.well-known/oauth-protected-resource/api/v1");
      assert.strictEqual(fetchStub.callCount, 1);
      assert.strictEqual(fetchStub.firstCall.args[0], "https://example.com/.well-known/oauth-protected-resource/api/v1");
    });
    test("should fallback to well-known URI at root when path version fails", async () => {
      const targetResource = "https://example.com/api/v1";
      const expectedMetadata = {
        resource: "https://example.com/",
        scopes_supported: ["read", "write"]
      };
      fetchStub.onFirstCall().resolves({
        status: 404,
        text: async () => "Not Found",
        statusText: "Not Found"
      });
      fetchStub.onSecondCall().resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata)
      });
      const result = await fetchResourceMetadata(
        targetResource,
        void 0,
        { fetch: fetchStub }
      );
      assert.deepStrictEqual(result.metadata, expectedMetadata);
      assert.strictEqual(result.discoveryUrl, "https://example.com/.well-known/oauth-protected-resource");
      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(fetchStub.callCount, 2);
      assert.strictEqual(fetchStub.firstCall.args[0], "https://example.com/.well-known/oauth-protected-resource/api/v1");
      assert.strictEqual(fetchStub.secondCall.args[0], "https://example.com/.well-known/oauth-protected-resource");
    });
    test("should throw error when all well-known URIs fail", async () => {
      const targetResource = "https://example.com/api/v1";
      fetchStub.resolves({
        status: 404,
        text: async () => "Not Found",
        statusText: "Not Found"
      });
      await assert.rejects(
        async () => fetchResourceMetadata(targetResource, void 0, { fetch: fetchStub }),
        (error) => {
          assert.ok(error instanceof AggregateError, "Should be an AggregateError");
          assert.strictEqual(error.errors.length, 2, "Should contain 2 errors");
          assert.ok(/Failed to fetch resource metadata from.*\/api\/v1.*404/.test(error.errors[0].message), "First error should mention /api/v1 and 404");
          assert.ok(/Failed to fetch resource metadata from.*\.well-known.*404/.test(error.errors[1].message), "Second error should mention .well-known and 404");
          return true;
        }
      );
      assert.strictEqual(fetchStub.callCount, 2);
    });
    test("should not append path when target resource is root", async () => {
      const targetResource = "https://example.com/";
      const expectedMetadata = {
        resource: "https://example.com/",
        scopes_supported: ["read"]
      };
      fetchStub.resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata)
      });
      const result = await fetchResourceMetadata(
        targetResource,
        void 0,
        { fetch: fetchStub }
      );
      assert.deepStrictEqual(result.metadata, expectedMetadata);
      assert.strictEqual(result.discoveryUrl, "https://example.com/.well-known/oauth-protected-resource");
      assert.strictEqual(fetchStub.callCount, 1);
      assert.strictEqual(fetchStub.firstCall.args[0], "https://example.com/.well-known/oauth-protected-resource");
    });
    test("should include same-origin headers when using well-known fallback", async () => {
      const targetResource = "https://example.com/api";
      const sameOriginHeaders = {
        "X-Test-Header": "test-value",
        "X-Custom-Header": "value"
      };
      const expectedMetadata = {
        resource: "https://example.com/api"
      };
      fetchStub.resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata)
      });
      const result = await fetchResourceMetadata(
        targetResource,
        void 0,
        { fetch: fetchStub, sameOriginHeaders }
      );
      assert.strictEqual(result.discoveryUrl, "https://example.com/.well-known/oauth-protected-resource/api");
      const headers = fetchStub.firstCall.args[1].headers;
      assert.strictEqual(headers["Accept"], "application/json");
      assert.strictEqual(headers["X-Test-Header"], "test-value");
      assert.strictEqual(headers["X-Custom-Header"], "value");
    });
    test("should handle fetchImpl throwing network error and continue to next URL", async () => {
      const targetResource = "https://example.com/api/v1";
      const expectedMetadata = {
        resource: "https://example.com/",
        scopes_supported: ["read", "write"]
      };
      fetchStub.onFirstCall().rejects(new Error("Network connection failed"));
      fetchStub.onSecondCall().resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata)
      });
      const result = await fetchResourceMetadata(
        targetResource,
        void 0,
        { fetch: fetchStub }
      );
      assert.deepStrictEqual(result.metadata, expectedMetadata);
      assert.strictEqual(result.discoveryUrl, "https://example.com/.well-known/oauth-protected-resource");
      assert.strictEqual(result.errors.length, 1);
      assert.ok(/Network connection failed/.test(result.errors[0].message));
      assert.strictEqual(fetchStub.callCount, 2);
      assert.strictEqual(fetchStub.firstCall.args[0], "https://example.com/.well-known/oauth-protected-resource/api/v1");
      assert.strictEqual(fetchStub.secondCall.args[0], "https://example.com/.well-known/oauth-protected-resource");
    });
    test("should throw AggregateError when fetchImpl throws on all URLs", async () => {
      const targetResource = "https://example.com/api/v1";
      fetchStub.rejects(new Error("Network connection failed"));
      await assert.rejects(
        async () => fetchResourceMetadata(targetResource, void 0, { fetch: fetchStub }),
        (error) => {
          assert.ok(error instanceof AggregateError, "Should be an AggregateError");
          assert.strictEqual(error.errors.length, 2, "Should contain 2 errors");
          assert.ok(/Network connection failed/.test(error.errors[0].message), "First error should mention network failure");
          assert.ok(/Network connection failed/.test(error.errors[1].message), "Second error should mention network failure");
          return true;
        }
      );
      assert.strictEqual(fetchStub.callCount, 2);
    });
    test("should handle mix of fetch error and non-200 response", async () => {
      const targetResource = "https://example.com/api/v1";
      fetchStub.onFirstCall().rejects(new Error("Connection timeout"));
      fetchStub.onSecondCall().resolves({
        status: 404,
        text: async () => "Not Found",
        statusText: "Not Found"
      });
      await assert.rejects(
        async () => fetchResourceMetadata(targetResource, void 0, { fetch: fetchStub }),
        (error) => {
          assert.ok(error instanceof AggregateError, "Should be an AggregateError");
          assert.strictEqual(error.errors.length, 2, "Should contain 2 errors");
          assert.ok(/Connection timeout/.test(error.errors[0].message), "First error should be network error");
          assert.ok(/Failed to fetch resource metadata.*404/.test(error.errors[1].message), "Second error should be 404");
          return true;
        }
      );
      assert.strictEqual(fetchStub.callCount, 2);
    });
    test("should accept root URL in PRM resource when using root discovery fallback (no trailing slash)", async () => {
      const targetResource = "https://example.com/api/v1";
      const expectedMetadata = {
        resource: "https://example.com",
        scopes_supported: ["read", "write"]
      };
      fetchStub.onFirstCall().resolves({
        status: 404,
        text: async () => "Not Found",
        statusText: "Not Found"
      });
      fetchStub.onSecondCall().resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata)
      });
      const result = await fetchResourceMetadata(
        targetResource,
        void 0,
        { fetch: fetchStub }
      );
      assert.deepStrictEqual(result.metadata, expectedMetadata);
      assert.strictEqual(fetchStub.callCount, 2);
    });
    test("should accept root URL in PRM resource when using root discovery fallback (with trailing slash)", async () => {
      const targetResource = "https://example.com/api/v1";
      const expectedMetadata = {
        resource: "https://example.com/",
        scopes_supported: ["read", "write"]
      };
      fetchStub.onFirstCall().resolves({
        status: 404,
        text: async () => "Not Found",
        statusText: "Not Found"
      });
      fetchStub.onSecondCall().resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata)
      });
      const result = await fetchResourceMetadata(
        targetResource,
        void 0,
        { fetch: fetchStub }
      );
      assert.deepStrictEqual(result.metadata, expectedMetadata);
      assert.strictEqual(fetchStub.callCount, 2);
    });
    test("should reject PRM with full path resource when using root discovery fallback", async () => {
      const targetResource = "https://example.com/api/v1";
      const invalidMetadata = {
        resource: "https://example.com/api/v1",
        scopes_supported: ["read"]
      };
      fetchStub.onFirstCall().resolves({
        status: 404,
        text: async () => "Not Found",
        statusText: "Not Found"
      });
      fetchStub.onSecondCall().resolves({
        status: 200,
        json: async () => invalidMetadata,
        text: async () => JSON.stringify(invalidMetadata)
      });
      await assert.rejects(
        async () => fetchResourceMetadata(targetResource, void 0, { fetch: fetchStub }),
        (error) => {
          assert.ok(error instanceof AggregateError, "Should be an AggregateError");
          assert.strictEqual(error.errors.length, 2);
          assert.ok(/404/.test(error.errors[0].message));
          assert.ok(/does not match expected value/.test(error.errors[1].message));
          assert.ok(/https:\/\/example\.com\/api\/v1.*https:\/\/example\.com/.test(error.errors[1].message));
          return true;
        }
      );
      assert.strictEqual(fetchStub.callCount, 2);
    });
    test("should reject PRM with root resource when using path-appended discovery", async () => {
      const targetResource = "https://example.com/api/v1";
      const invalidMetadata = {
        resource: "https://example.com/",
        scopes_supported: ["read"]
      };
      fetchStub.resolves({
        status: 200,
        json: async () => invalidMetadata,
        text: async () => JSON.stringify(invalidMetadata)
      });
      const result = await fetchResourceMetadata(targetResource, void 0, { fetch: fetchStub });
      assert.deepStrictEqual(result.metadata, invalidMetadata);
      assert.strictEqual(result.discoveryUrl, "https://example.com/.well-known/oauth-protected-resource");
      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(fetchStub.callCount, 2);
      assert.strictEqual(fetchStub.firstCall.args[0], "https://example.com/.well-known/oauth-protected-resource/api/v1");
      assert.strictEqual(fetchStub.secondCall.args[0], "https://example.com/.well-known/oauth-protected-resource");
    });
    test("should validate against targetResource when resourceMetadataUrl is explicitly provided", async () => {
      const targetResource = "https://example.com/api/v1";
      const resourceMetadataUrl = "https://example.com/.well-known/oauth-protected-resource";
      const validMetadata = {
        resource: "https://example.com/api/v1",
        scopes_supported: ["read"]
      };
      fetchStub.resolves({
        status: 200,
        json: async () => validMetadata,
        text: async () => JSON.stringify(validMetadata)
      });
      const result = await fetchResourceMetadata(
        targetResource,
        resourceMetadataUrl,
        { fetch: fetchStub }
      );
      assert.deepStrictEqual(result.metadata, validMetadata);
      assert.strictEqual(result.discoveryUrl, resourceMetadataUrl);
      assert.strictEqual(fetchStub.callCount, 1);
      assert.strictEqual(fetchStub.firstCall.args[0], resourceMetadataUrl);
    });
    test("should fallback to root discovery when explicit resourceMetadataUrl validation fails", async () => {
      const targetResource = "https://example.com/api/v1";
      const resourceMetadataUrl = "https://example.com/.well-known/oauth-protected-resource";
      const invalidMetadata = {
        resource: "https://example.com/",
        scopes_supported: ["read"]
      };
      fetchStub.resolves({
        status: 200,
        json: async () => invalidMetadata,
        text: async () => JSON.stringify(invalidMetadata)
      });
      const result = await fetchResourceMetadata(targetResource, resourceMetadataUrl, { fetch: fetchStub });
      assert.deepStrictEqual(result.metadata, invalidMetadata);
      assert.strictEqual(result.discoveryUrl, "https://example.com/.well-known/oauth-protected-resource");
      assert.ok(result.errors.length >= 1);
      assert.ok(fetchStub.callCount >= 2);
    });
    test("should handle fetchImpl throwing error with explicit resourceMetadataUrl", async () => {
      const targetResource = "https://example.com/api";
      const resourceMetadataUrl = "https://example.com/.well-known/oauth-protected-resource";
      fetchStub.rejects(new Error("DNS resolution failed"));
      await assert.rejects(
        async () => fetchResourceMetadata(targetResource, resourceMetadataUrl, { fetch: fetchStub }),
        (error) => {
          assert.ok(error instanceof AggregateError || /DNS resolution failed/.test(error.message));
          return true;
        }
      );
      assert.ok(fetchStub.callCount >= 2);
    });
  });
  suite("fetchAuthorizationServerMetadata", () => {
    let sandbox;
    let fetchStub;
    setup(() => {
      sandbox = sinon.createSandbox();
      fetchStub = sandbox.stub();
    });
    teardown(() => {
      sandbox.restore();
    });
    test("should successfully fetch metadata from OAuth discovery endpoint with path insertion", async () => {
      const authorizationServer = "https://auth.example.com/tenant";
      const expectedMetadata = {
        issuer: "https://auth.example.com/tenant",
        authorization_endpoint: "https://auth.example.com/tenant/authorize",
        token_endpoint: "https://auth.example.com/tenant/token",
        response_types_supported: ["code"]
      };
      fetchStub.resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata),
        statusText: "OK"
      });
      const result = await fetchAuthorizationServerMetadata(authorizationServer, { fetch: fetchStub });
      assert.deepStrictEqual(result.metadata, expectedMetadata);
      assert.strictEqual(result.discoveryUrl, "https://auth.example.com/.well-known/oauth-authorization-server/tenant");
      assert.deepStrictEqual(result.errors, []);
      assert.strictEqual(fetchStub.callCount, 1);
      assert.strictEqual(fetchStub.firstCall.args[0], "https://auth.example.com/.well-known/oauth-authorization-server/tenant");
      assert.strictEqual(fetchStub.firstCall.args[1].method, "GET");
    });
    test("should fallback to OpenID Connect discovery with path insertion", async () => {
      const authorizationServer = "https://auth.example.com/tenant";
      const expectedMetadata = {
        issuer: "https://auth.example.com/tenant",
        authorization_endpoint: "https://auth.example.com/tenant/authorize",
        token_endpoint: "https://auth.example.com/tenant/token",
        response_types_supported: ["code"]
      };
      fetchStub.onFirstCall().resolves({
        status: 404,
        text: async () => "Not Found",
        statusText: "Not Found",
        json: async () => {
          throw new Error("Not JSON");
        }
      });
      fetchStub.onSecondCall().resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata),
        statusText: "OK"
      });
      const result = await fetchAuthorizationServerMetadata(authorizationServer, { fetch: fetchStub });
      assert.deepStrictEqual(result.metadata, expectedMetadata);
      assert.strictEqual(result.discoveryUrl, "https://auth.example.com/.well-known/openid-configuration/tenant");
      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(fetchStub.callCount, 2);
      assert.strictEqual(fetchStub.firstCall.args[0], "https://auth.example.com/.well-known/oauth-authorization-server/tenant");
      assert.strictEqual(fetchStub.secondCall.args[0], "https://auth.example.com/.well-known/openid-configuration/tenant");
    });
    test("should fallback to OpenID Connect discovery with path addition", async () => {
      const authorizationServer = "https://auth.example.com/tenant";
      const expectedMetadata = {
        issuer: "https://auth.example.com/tenant",
        authorization_endpoint: "https://auth.example.com/tenant/authorize",
        token_endpoint: "https://auth.example.com/tenant/token",
        response_types_supported: ["code"]
      };
      fetchStub.onFirstCall().resolves({
        status: 404,
        text: async () => "Not Found",
        statusText: "Not Found",
        json: async () => {
          throw new Error("Not JSON");
        }
      });
      fetchStub.onSecondCall().resolves({
        status: 404,
        text: async () => "Not Found",
        statusText: "Not Found",
        json: async () => {
          throw new Error("Not JSON");
        }
      });
      fetchStub.onThirdCall().resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata),
        statusText: "OK"
      });
      const result = await fetchAuthorizationServerMetadata(authorizationServer, { fetch: fetchStub });
      assert.deepStrictEqual(result.metadata, expectedMetadata);
      assert.strictEqual(result.discoveryUrl, "https://auth.example.com/tenant/.well-known/openid-configuration");
      assert.strictEqual(result.errors.length, 2);
      assert.strictEqual(fetchStub.callCount, 3);
      assert.strictEqual(fetchStub.firstCall.args[0], "https://auth.example.com/.well-known/oauth-authorization-server/tenant");
      assert.strictEqual(fetchStub.secondCall.args[0], "https://auth.example.com/.well-known/openid-configuration/tenant");
      assert.strictEqual(fetchStub.thirdCall.args[0], "https://auth.example.com/tenant/.well-known/openid-configuration");
    });
    test("should handle authorization server at root without extra path", async () => {
      const authorizationServer = "https://auth.example.com";
      const expectedMetadata = {
        issuer: "https://auth.example.com/",
        authorization_endpoint: "https://auth.example.com/authorize",
        token_endpoint: "https://auth.example.com/token",
        response_types_supported: ["code"]
      };
      fetchStub.resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata),
        statusText: "OK"
      });
      const result = await fetchAuthorizationServerMetadata(authorizationServer, { fetch: fetchStub });
      assert.deepStrictEqual(result.metadata, expectedMetadata);
      assert.strictEqual(result.discoveryUrl, "https://auth.example.com/.well-known/oauth-authorization-server");
      assert.deepStrictEqual(result.errors, []);
      assert.strictEqual(fetchStub.callCount, 1);
      assert.strictEqual(fetchStub.firstCall.args[0], "https://auth.example.com/.well-known/oauth-authorization-server");
    });
    test("should handle authorization server with trailing slash", async () => {
      const authorizationServer = "https://auth.example.com/tenant/";
      const expectedMetadata = {
        issuer: "https://auth.example.com/tenant/",
        authorization_endpoint: "https://auth.example.com/tenant/authorize",
        token_endpoint: "https://auth.example.com/tenant/token",
        response_types_supported: ["code"]
      };
      fetchStub.resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata),
        statusText: "OK"
      });
      const result = await fetchAuthorizationServerMetadata(authorizationServer, { fetch: fetchStub });
      assert.deepStrictEqual(result.metadata, expectedMetadata);
      assert.strictEqual(result.discoveryUrl, "https://auth.example.com/.well-known/oauth-authorization-server/tenant/");
      assert.deepStrictEqual(result.errors, []);
      assert.strictEqual(fetchStub.callCount, 1);
    });
    test("should include additional headers in all requests", async () => {
      const authorizationServer = "https://auth.example.com/tenant";
      const additionalHeaders = {
        "X-Custom-Header": "custom-value",
        "Authorization": "Bearer token123"
      };
      const expectedMetadata = {
        issuer: "https://auth.example.com/tenant",
        response_types_supported: ["code"]
      };
      fetchStub.resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata),
        statusText: "OK"
      });
      const result = await fetchAuthorizationServerMetadata(authorizationServer, { fetch: fetchStub, additionalHeaders });
      assert.strictEqual(result.discoveryUrl, "https://auth.example.com/.well-known/oauth-authorization-server/tenant");
      const headers = fetchStub.firstCall.args[1].headers;
      assert.strictEqual(headers["X-Custom-Header"], "custom-value");
      assert.strictEqual(headers["Authorization"], "Bearer token123");
      assert.strictEqual(headers["Accept"], "application/json");
    });
    test("should throw AggregateError when all discovery endpoints fail", async () => {
      const authorizationServer = "https://auth.example.com/tenant";
      fetchStub.resolves({
        status: 404,
        text: async () => "Not Found",
        statusText: "Not Found",
        json: async () => {
          throw new Error("Not JSON");
        }
      });
      await assert.rejects(
        async () => fetchAuthorizationServerMetadata(authorizationServer, { fetch: fetchStub }),
        (error) => {
          assert.ok(error instanceof AggregateError, "Should be an AggregateError");
          assert.strictEqual(error.errors.length, 3, "Should contain 3 errors (one for each URL)");
          assert.strictEqual(error.message, "Failed to fetch authorization server metadata from all attempted URLs");
          assert.ok(/oauth-authorization-server.*404/.test(error.errors[0].message), "First error should mention OAuth discovery and 404");
          assert.ok(/openid-configuration.*404/.test(error.errors[1].message), "Second error should mention OpenID path insertion and 404");
          assert.ok(/openid-configuration.*404/.test(error.errors[2].message), "Third error should mention OpenID path addition and 404");
          return true;
        }
      );
      assert.strictEqual(fetchStub.callCount, 3);
    });
    test("should throw single error (not AggregateError) when only one URL is tried and fails", async () => {
      const authorizationServer = "https://auth.example.com";
      fetchStub.onFirstCall().resolves({
        status: 500,
        text: async () => "Internal Server Error",
        statusText: "Internal Server Error",
        json: async () => {
          throw new Error("Not JSON");
        }
      });
      const expectedMetadata = {
        issuer: "https://auth.example.com/",
        response_types_supported: ["code"]
      };
      fetchStub.onSecondCall().resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata),
        statusText: "OK"
      });
      const result = await fetchAuthorizationServerMetadata(authorizationServer, { fetch: fetchStub });
      assert.deepStrictEqual(result.metadata, expectedMetadata);
      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(fetchStub.callCount, 2);
    });
    test("should throw AggregateError when multiple URLs fail with mixed error types", async () => {
      const authorizationServer = "https://auth.example.com/tenant";
      fetchStub.onFirstCall().rejects(new Error("Connection timeout"));
      fetchStub.onSecondCall().resolves({
        status: 404,
        text: async () => "Not Found",
        statusText: "Not Found",
        json: async () => {
          throw new Error("Not JSON");
        }
      });
      fetchStub.onThirdCall().resolves({
        status: 500,
        text: async () => "Internal Server Error",
        statusText: "Internal Server Error",
        json: async () => {
          throw new Error("Not JSON");
        }
      });
      await assert.rejects(
        async () => fetchAuthorizationServerMetadata(authorizationServer, { fetch: fetchStub }),
        (error) => {
          assert.ok(error instanceof AggregateError, "Should be an AggregateError");
          assert.strictEqual(error.errors.length, 3, "Should contain 3 errors");
          assert.ok(/Connection timeout/.test(error.errors[0].message), "First error should be network error");
          assert.ok(/404.*Not Found/.test(error.errors[1].message), "Second error should be 404");
          assert.ok(/500.*Internal Server Error/.test(error.errors[2].message), "Third error should be 500");
          return true;
        }
      );
      assert.strictEqual(fetchStub.callCount, 3);
    });
    test("should handle invalid JSON response", async () => {
      const authorizationServer = "https://auth.example.com";
      fetchStub.resolves({
        status: 200,
        json: async () => {
          throw new Error("Invalid JSON");
        },
        text: async () => "Invalid JSON",
        statusText: "OK"
      });
      await assert.rejects(
        async () => fetchAuthorizationServerMetadata(authorizationServer, { fetch: fetchStub }),
        /Failed to fetch authorization server metadata/
      );
    });
    test("should handle valid JSON but invalid metadata structure", async () => {
      const authorizationServer = "https://auth.example.com";
      const invalidMetadata = {
        // Missing required 'issuer' field
        authorization_endpoint: "https://auth.example.com/authorize"
      };
      fetchStub.resolves({
        status: 200,
        json: async () => invalidMetadata,
        text: async () => JSON.stringify(invalidMetadata),
        statusText: "OK"
      });
      await assert.rejects(
        async () => fetchAuthorizationServerMetadata(authorizationServer, { fetch: fetchStub }),
        /Failed to fetch authorization server metadata/
      );
    });
    test("should use global fetch when custom fetch is not provided", async () => {
      const authorizationServer = "https://auth.example.com";
      const expectedMetadata = {
        issuer: "https://auth.example.com/",
        response_types_supported: ["code"]
      };
      const globalFetchStub = sandbox.stub(globalThis, "fetch").resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata),
        statusText: "OK"
      });
      const result = await fetchAuthorizationServerMetadata(authorizationServer);
      assert.deepStrictEqual(result.metadata, expectedMetadata);
      assert.strictEqual(result.discoveryUrl, "https://auth.example.com/.well-known/oauth-authorization-server");
      assert.deepStrictEqual(result.errors, []);
      assert.strictEqual(globalFetchStub.callCount, 1);
    });
    test("should handle network fetch failure and continue to next endpoint", async () => {
      const authorizationServer = "https://auth.example.com";
      const expectedMetadata = {
        issuer: "https://auth.example.com/",
        response_types_supported: ["code"]
      };
      fetchStub.onFirstCall().rejects(new Error("Network error"));
      fetchStub.onSecondCall().resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata),
        statusText: "OK"
      });
      const result = await fetchAuthorizationServerMetadata(authorizationServer, { fetch: fetchStub });
      assert.deepStrictEqual(result.metadata, expectedMetadata);
      assert.strictEqual(result.errors.length, 1);
      assert.ok(/Network error/.test(result.errors[0].message));
      assert.strictEqual(fetchStub.callCount, 2);
    });
    test("should throw error when network fails on all endpoints", async () => {
      const authorizationServer = "https://auth.example.com";
      fetchStub.rejects(new Error("Network error"));
      await assert.rejects(
        async () => fetchAuthorizationServerMetadata(authorizationServer, { fetch: fetchStub }),
        (error) => {
          assert.ok(error instanceof AggregateError, "Should be an AggregateError");
          assert.strictEqual(error.errors.length, 3, "Should contain 3 errors");
          assert.strictEqual(error.message, "Failed to fetch authorization server metadata from all attempted URLs");
          assert.ok(/Network error/.test(error.errors[0].message), "First error should be network error");
          assert.ok(/Network error/.test(error.errors[1].message), "Second error should be network error");
          assert.ok(/Network error/.test(error.errors[2].message), "Third error should be network error");
          return true;
        }
      );
      assert.strictEqual(fetchStub.callCount, 3);
    });
    test("should handle mix of network error and non-200 response", async () => {
      const authorizationServer = "https://auth.example.com/tenant";
      const expectedMetadata = {
        issuer: "https://auth.example.com/tenant",
        response_types_supported: ["code"]
      };
      fetchStub.onFirstCall().rejects(new Error("Connection timeout"));
      fetchStub.onSecondCall().resolves({
        status: 404,
        text: async () => "Not Found",
        statusText: "Not Found",
        json: async () => {
          throw new Error("Not JSON");
        }
      });
      fetchStub.onThirdCall().resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata),
        statusText: "OK"
      });
      const result = await fetchAuthorizationServerMetadata(authorizationServer, { fetch: fetchStub });
      assert.deepStrictEqual(result.metadata, expectedMetadata);
      assert.strictEqual(result.errors.length, 2);
      assert.strictEqual(fetchStub.callCount, 3);
    });
    test("should handle response.text() failure in error case", async () => {
      const authorizationServer = "https://auth.example.com";
      fetchStub.resolves({
        status: 500,
        text: async () => {
          throw new Error("Cannot read text");
        },
        statusText: "Internal Server Error",
        json: async () => {
          throw new Error("Cannot read json");
        }
      });
      await assert.rejects(
        async () => fetchAuthorizationServerMetadata(authorizationServer, { fetch: fetchStub }),
        (error) => {
          assert.ok(error instanceof AggregateError, "Should be an AggregateError");
          assert.strictEqual(error.errors.length, 3, "Should contain 3 errors");
          for (const err of error.errors) {
            assert.ok(/500 Internal Server Error/.test(err.message), `Error should mention 500 and statusText: ${err.message}`);
          }
          return true;
        }
      );
    });
    test("should correctly handle path addition with trailing slash", async () => {
      const authorizationServer = "https://auth.example.com/tenant/";
      const expectedMetadata = {
        issuer: "https://auth.example.com/tenant/",
        response_types_supported: ["code"]
      };
      fetchStub.onFirstCall().resolves({
        status: 404,
        text: async () => "Not Found",
        statusText: "Not Found",
        json: async () => {
          throw new Error("Not JSON");
        }
      });
      fetchStub.onSecondCall().resolves({
        status: 404,
        text: async () => "Not Found",
        statusText: "Not Found",
        json: async () => {
          throw new Error("Not JSON");
        }
      });
      fetchStub.onThirdCall().resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata),
        statusText: "OK"
      });
      const result = await fetchAuthorizationServerMetadata(authorizationServer, { fetch: fetchStub });
      assert.deepStrictEqual(result.metadata, expectedMetadata);
      assert.strictEqual(result.discoveryUrl, "https://auth.example.com/tenant/.well-known/openid-configuration");
      assert.strictEqual(result.errors.length, 2);
      assert.strictEqual(fetchStub.callCount, 3);
      assert.strictEqual(fetchStub.thirdCall.args[0], "https://auth.example.com/tenant/.well-known/openid-configuration");
    });
    test("should handle deeply nested paths", async () => {
      const authorizationServer = "https://auth.example.com/tenant/org/sub";
      const expectedMetadata = {
        issuer: "https://auth.example.com/tenant/org/sub",
        response_types_supported: ["code"]
      };
      fetchStub.resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata),
        statusText: "OK"
      });
      const result = await fetchAuthorizationServerMetadata(authorizationServer, { fetch: fetchStub });
      assert.deepStrictEqual(result.metadata, expectedMetadata);
      assert.strictEqual(result.discoveryUrl, "https://auth.example.com/.well-known/oauth-authorization-server/tenant/org/sub");
      assert.deepStrictEqual(result.errors, []);
      assert.strictEqual(fetchStub.callCount, 1);
      assert.strictEqual(fetchStub.firstCall.args[0], "https://auth.example.com/.well-known/oauth-authorization-server/tenant/org/sub");
    });
    test("should handle 200 response with non-metadata JSON", async () => {
      const authorizationServer = "https://auth.example.com";
      const invalidResponse = {
        error: "not_supported",
        message: "Metadata not available"
      };
      fetchStub.resolves({
        status: 200,
        json: async () => invalidResponse,
        text: async () => JSON.stringify(invalidResponse),
        statusText: "OK"
      });
      await assert.rejects(
        async () => fetchAuthorizationServerMetadata(authorizationServer, { fetch: fetchStub }),
        (error) => {
          assert.ok(error instanceof AggregateError, "Should be an AggregateError");
          assert.strictEqual(error.errors.length, 3, "Should contain 3 errors");
          for (const err of error.errors) {
            assert.ok(/Failed to fetch authorization server metadata from/.test(err.message), `Error should mention failed fetch: ${err.message}`);
          }
          return true;
        }
      );
      assert.strictEqual(fetchStub.callCount, 3);
    });
    test("should validate metadata according to isAuthorizationServerMetadata", async () => {
      const authorizationServer = "https://auth.example.com";
      const validMetadata = {
        issuer: "https://auth.example.com/",
        authorization_endpoint: "https://auth.example.com/authorize",
        token_endpoint: "https://auth.example.com/token",
        jwks_uri: "https://auth.example.com/jwks",
        registration_endpoint: "https://auth.example.com/register",
        response_types_supported: ["code", "token"]
      };
      fetchStub.resolves({
        status: 200,
        json: async () => validMetadata,
        text: async () => JSON.stringify(validMetadata),
        statusText: "OK"
      });
      const result = await fetchAuthorizationServerMetadata(authorizationServer, { fetch: fetchStub });
      assert.deepStrictEqual(result.metadata, validMetadata);
      assert.strictEqual(result.discoveryUrl, "https://auth.example.com/.well-known/oauth-authorization-server");
      assert.deepStrictEqual(result.errors, []);
      assert.strictEqual(fetchStub.callCount, 1);
    });
    test("should handle URLs with query parameters", async () => {
      const authorizationServer = "https://auth.example.com/tenant?version=v2";
      const expectedMetadata = {
        issuer: "https://auth.example.com/tenant?version=v2",
        response_types_supported: ["code"]
      };
      fetchStub.resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata),
        statusText: "OK"
      });
      const result = await fetchAuthorizationServerMetadata(authorizationServer, { fetch: fetchStub });
      assert.deepStrictEqual(result.metadata, expectedMetadata);
      assert.strictEqual(result.discoveryUrl, "https://auth.example.com/.well-known/oauth-authorization-server/tenant");
      assert.deepStrictEqual(result.errors, []);
      assert.strictEqual(fetchStub.callCount, 1);
    });
    test("should handle empty additionalHeaders", async () => {
      const authorizationServer = "https://auth.example.com";
      const expectedMetadata = {
        issuer: "https://auth.example.com/",
        response_types_supported: ["code"]
      };
      fetchStub.resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata),
        statusText: "OK"
      });
      const result = await fetchAuthorizationServerMetadata(authorizationServer, { fetch: fetchStub, additionalHeaders: {} });
      assert.strictEqual(result.discoveryUrl, "https://auth.example.com/.well-known/oauth-authorization-server");
      const headers = fetchStub.firstCall.args[1].headers;
      assert.strictEqual(headers["Accept"], "application/json");
    });
  });
  suite("Cross App Access (ID-JAG) wire format", () => {
    test("buildIdJagExchangeBody emits the exact spec parameters", () => {
      const body = buildIdJagExchangeBody(
        "my_idp_client_id",
        "secret_xyz",
        "<id_token>",
        "https://auth.resource.example.com",
        "https://api.resource.example.com",
        ["todos.read", "mcp.access"]
      );
      assert.strictEqual(body.get("client_id"), "my_idp_client_id");
      assert.strictEqual(body.get("client_secret"), "secret_xyz");
      assert.strictEqual(body.get("grant_type"), "urn:ietf:params:oauth:grant-type:token-exchange");
      assert.strictEqual(body.get("subject_token"), "<id_token>");
      assert.strictEqual(body.get("subject_token_type"), "urn:ietf:params:oauth:token-type:id_token");
      assert.strictEqual(body.get("requested_token_type"), "urn:ietf:params:oauth:token-type:id-jag");
      assert.strictEqual(body.get("audience"), "https://auth.resource.example.com");
      assert.strictEqual(body.get("resource"), "https://api.resource.example.com");
      assert.strictEqual(body.get("scope"), "todos.read mcp.access");
    });
    test("buildIdJagExchangeBody omits client_secret when not provided", () => {
      const body = buildIdJagExchangeBody(
        "public_client_id",
        void 0,
        "<id_token>",
        "https://auth.resource.example.com",
        void 0,
        []
      );
      assert.strictEqual(body.has("client_secret"), false);
      assert.strictEqual(body.has("resource"), false);
      assert.strictEqual(body.has("scope"), false);
    });
    test("buildResourceRedemptionBody emits an RFC 7523 JWT-bearer grant", () => {
      const body = buildResourceRedemptionBody(
        "my_idp_client_id-at-todo0",
        "secret_xyz",
        "<id_jag>",
        "https://api.resource.example.com",
        ["todos.read", "mcp.access"]
      );
      assert.strictEqual(body.get("client_id"), "my_idp_client_id-at-todo0");
      assert.strictEqual(body.get("client_secret"), "secret_xyz");
      assert.strictEqual(body.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
      assert.strictEqual(body.get("assertion"), "<id_jag>");
      assert.strictEqual(body.get("resource"), "https://api.resource.example.com");
      assert.strictEqual(body.get("scope"), "todos.read mcp.access");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9jb21tb24vb2F1dGgudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0ICogYXMgc2lub24gZnJvbSAnc2lub24nO1xuaW1wb3J0IHtcblx0YnVpbGRJZEphZ0V4Y2hhbmdlQm9keSxcblx0YnVpbGRSZXNvdXJjZVJlZGVtcHRpb25Cb2R5LFxuXHRnZXRDbGFpbXNGcm9tSldULFxuXHRnZXREZWZhdWx0TWV0YWRhdGFGb3JVcmwsXG5cdGlzQXV0aG9yaXphdGlvbkF1dGhvcml6ZVJlc3BvbnNlLFxuXHRpc0F1dGhvcml6YXRpb25EZXZpY2VSZXNwb25zZSxcblx0aXNBdXRob3JpemF0aW9uRXJyb3JSZXNwb25zZSxcblx0aXNBdXRob3JpemF0aW9uRHluYW1pY0NsaWVudFJlZ2lzdHJhdGlvblJlc3BvbnNlLFxuXHRpc0F1dGhvcml6YXRpb25Qcm90ZWN0ZWRSZXNvdXJjZU1ldGFkYXRhLFxuXHRpc0F1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSxcblx0aXNBdXRob3JpemF0aW9uVG9rZW5SZXNwb25zZSxcblx0cGFyc2VXV1dBdXRoZW50aWNhdGVIZWFkZXIsXG5cdGZldGNoRHluYW1pY1JlZ2lzdHJhdGlvbixcblx0ZmV0Y2hSZXNvdXJjZU1ldGFkYXRhLFxuXHRmZXRjaEF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSxcblx0c2NvcGVzTWF0Y2gsXG5cdElBdXRob3JpemF0aW9uSldUQ2xhaW1zLFxuXHRJQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhLFxuXHRERUZBVUxUX0FVVEhfRkxPV19QT1JUXG59IGZyb20gJy4uLy4uL2NvbW1vbi9vYXV0aC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuL3V0aWxzLmpzJztcbmltcG9ydCB7IGVuY29kZUJhc2U2NCwgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi9jb21tb24vYnVmZmVyLmpzJztcblxuc3VpdGUoJ09BdXRoJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblx0c3VpdGUoJ1R5cGUgR3VhcmRzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2lzQXV0aG9yaXphdGlvblByb3RlY3RlZFJlc291cmNlTWV0YWRhdGEgc2hvdWxkIGNvcnJlY3RseSBpZGVudGlmeSBwcm90ZWN0ZWQgcmVzb3VyY2UgbWV0YWRhdGEnLCAoKSA9PiB7XG5cdFx0XHQvLyBWYWxpZCBtZXRhZGF0YSB3aXRoIG1pbmltYWwgcmVxdWlyZWQgZmllbGRzXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBdXRob3JpemF0aW9uUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YSh7IHJlc291cmNlOiAnaHR0cHM6Ly9leGFtcGxlLmNvbScgfSksIHRydWUpO1xuXG5cdFx0XHQvLyBWYWxpZCBtZXRhZGF0YSB3aXRoIHNjb3Blc19zdXBwb3J0ZWQgYXMgYXJyYXlcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0F1dGhvcml6YXRpb25Qcm90ZWN0ZWRSZXNvdXJjZU1ldGFkYXRhKHtcblx0XHRcdFx0cmVzb3VyY2U6ICdodHRwczovL2V4YW1wbGUuY29tJyxcblx0XHRcdFx0c2NvcGVzX3N1cHBvcnRlZDogWydyZWFkJywgJ3dyaXRlJ11cblx0XHRcdH0pLCB0cnVlKTtcblxuXHRcdFx0Ly8gSW52YWxpZCBjYXNlcyAtIG1pc3NpbmcgcmVzb3VyY2Vcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0F1dGhvcml6YXRpb25Qcm90ZWN0ZWRSZXNvdXJjZU1ldGFkYXRhKG51bGwpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBdXRob3JpemF0aW9uUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YSh1bmRlZmluZWQpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBdXRob3JpemF0aW9uUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YSh7fSksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0F1dGhvcml6YXRpb25Qcm90ZWN0ZWRSZXNvdXJjZU1ldGFkYXRhKCdub3QgYW4gb2JqZWN0JyksIGZhbHNlKTtcblxuXHRcdFx0Ly8gSW52YWxpZCBjYXNlcyAtIHNjb3Blc19zdXBwb3J0ZWQgaXMgbm90IGFuIGFycmF5IHdoZW4gcHJvdmlkZWRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0F1dGhvcml6YXRpb25Qcm90ZWN0ZWRSZXNvdXJjZU1ldGFkYXRhKHtcblx0XHRcdFx0cmVzb3VyY2U6ICdodHRwczovL2V4YW1wbGUuY29tJyxcblx0XHRcdFx0c2NvcGVzX3N1cHBvcnRlZDogJ25vdCBhbiBhcnJheSdcblx0XHRcdH0pLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpc0F1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSBzaG91bGQgY29ycmVjdGx5IGlkZW50aWZ5IHNlcnZlciBtZXRhZGF0YScsICgpID0+IHtcblx0XHRcdC8vIFZhbGlkIG1ldGFkYXRhIHdpdGggbWluaW1hbCByZXF1aXJlZCBmaWVsZHNcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0F1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSh7XG5cdFx0XHRcdGlzc3VlcjogJ2h0dHBzOi8vZXhhbXBsZS5jb20nLFxuXHRcdFx0XHRyZXNwb25zZV90eXBlc19zdXBwb3J0ZWQ6IFsnY29kZSddXG5cdFx0XHR9KSwgdHJ1ZSk7XG5cblx0XHRcdC8vIFZhbGlkIG1ldGFkYXRhIHdpdGggdmFsaWQgVVJMc1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhKHtcblx0XHRcdFx0aXNzdWVyOiAnaHR0cHM6Ly9leGFtcGxlLmNvbScsXG5cdFx0XHRcdGF1dGhvcml6YXRpb25fZW5kcG9pbnQ6ICdodHRwczovL2V4YW1wbGUuY29tL2F1dGgnLFxuXHRcdFx0XHR0b2tlbl9lbmRwb2ludDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vdG9rZW4nLFxuXHRcdFx0XHRyZWdpc3RyYXRpb25fZW5kcG9pbnQ6ICdodHRwczovL2V4YW1wbGUuY29tL3JlZ2lzdGVyJyxcblx0XHRcdFx0andrc191cmk6ICdodHRwczovL2V4YW1wbGUuY29tL2p3a3MnLFxuXHRcdFx0XHRyZXNwb25zZV90eXBlc19zdXBwb3J0ZWQ6IFsnY29kZSddXG5cdFx0XHR9KSwgdHJ1ZSk7XG5cblx0XHRcdC8vIFZhbGlkIG1ldGFkYXRhIHdpdGggaHR0cCBVUkxzIChmb3IgbG9jYWxob3N0L3Rlc3RpbmcpXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEoe1xuXHRcdFx0XHRpc3N1ZXI6ICdodHRwOi8vbG9jYWxob3N0OjgwODAnLFxuXHRcdFx0XHRhdXRob3JpemF0aW9uX2VuZHBvaW50OiAnaHR0cDovL2xvY2FsaG9zdDo4MDgwL2F1dGgnLFxuXHRcdFx0XHR0b2tlbl9lbmRwb2ludDogJ2h0dHA6Ly9sb2NhbGhvc3Q6ODA4MC90b2tlbicsXG5cdFx0XHRcdHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJ11cblx0XHRcdH0pLCB0cnVlKTtcblxuXHRcdFx0Ly8gSW52YWxpZCBjYXNlcyAtIG5vdCBhbiBvYmplY3Rcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0F1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YShudWxsKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhKHVuZGVmaW5lZCksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0F1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSgnbm90IGFuIG9iamVjdCcpLCBmYWxzZSk7XG5cblx0XHRcdC8vIEludmFsaWQgY2FzZXMgLSBtaXNzaW5nIGlzc3VlciBzaG91bGQgdGhyb3dcblx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4gaXNBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEoe30pLCAvQXV0aG9yaXphdGlvbiBzZXJ2ZXIgbWV0YWRhdGEgbXVzdCBoYXZlIGFuIGlzc3Vlci8pO1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiBpc0F1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSh7IHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJ10gfSksIC9BdXRob3JpemF0aW9uIHNlcnZlciBtZXRhZGF0YSBtdXN0IGhhdmUgYW4gaXNzdWVyLyk7XG5cblx0XHRcdC8vIEludmFsaWQgY2FzZXMgLSBVUkkgZmllbGRzIG11c3QgYmUgc3RyaW5ncyB3aGVuIHByb3ZpZGVkICh0cnV0aHkgdmFsdWVzKVxuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiBpc0F1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSh7XG5cdFx0XHRcdGlzc3VlcjogJ2h0dHBzOi8vZXhhbXBsZS5jb20nLFxuXHRcdFx0XHRhdXRob3JpemF0aW9uX2VuZHBvaW50OiAxMjMsXG5cdFx0XHRcdHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJ11cblx0XHRcdH0pLCAvQXV0aG9yaXphdGlvbiBzZXJ2ZXIgbWV0YWRhdGEgJ2F1dGhvcml6YXRpb25fZW5kcG9pbnQnIG11c3QgYmUgYSBzdHJpbmcvKTtcblxuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiBpc0F1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSh7XG5cdFx0XHRcdGlzc3VlcjogJ2h0dHBzOi8vZXhhbXBsZS5jb20nLFxuXHRcdFx0XHR0b2tlbl9lbmRwb2ludDogMTIzLFxuXHRcdFx0XHRyZXNwb25zZV90eXBlc19zdXBwb3J0ZWQ6IFsnY29kZSddXG5cdFx0XHR9KSwgL0F1dGhvcml6YXRpb24gc2VydmVyIG1ldGFkYXRhICd0b2tlbl9lbmRwb2ludCcgbXVzdCBiZSBhIHN0cmluZy8pO1xuXG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGlzQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhKHtcblx0XHRcdFx0aXNzdWVyOiAnaHR0cHM6Ly9leGFtcGxlLmNvbScsXG5cdFx0XHRcdHJlZ2lzdHJhdGlvbl9lbmRwb2ludDogW10sXG5cdFx0XHRcdHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJ11cblx0XHRcdH0pLCAvQXV0aG9yaXphdGlvbiBzZXJ2ZXIgbWV0YWRhdGEgJ3JlZ2lzdHJhdGlvbl9lbmRwb2ludCcgbXVzdCBiZSBhIHN0cmluZy8pO1xuXG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGlzQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhKHtcblx0XHRcdFx0aXNzdWVyOiAnaHR0cHM6Ly9leGFtcGxlLmNvbScsXG5cdFx0XHRcdGp3a3NfdXJpOiB7fSxcblx0XHRcdFx0cmVzcG9uc2VfdHlwZXNfc3VwcG9ydGVkOiBbJ2NvZGUnXVxuXHRcdFx0fSksIC9BdXRob3JpemF0aW9uIHNlcnZlciBtZXRhZGF0YSAnandrc191cmknIG11c3QgYmUgYSBzdHJpbmcvKTtcblxuXHRcdFx0Ly8gSW52YWxpZCBjYXNlcyAtIFVSSSBmaWVsZHMgbXVzdCBzdGFydCB3aXRoIGh0dHA6Ly8gb3IgaHR0cHM6Ly9cblx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4gaXNBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEoe1xuXHRcdFx0XHRpc3N1ZXI6ICdmdHA6Ly9leGFtcGxlLmNvbScsXG5cdFx0XHRcdHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJ11cblx0XHRcdH0pLCAvQXV0aG9yaXphdGlvbiBzZXJ2ZXIgbWV0YWRhdGEgJ2lzc3VlcicgbXVzdCBzdGFydCB3aXRoIGh0dHA6XFwvXFwvIG9yIGh0dHBzOlxcL1xcLy8pO1xuXG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGlzQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhKHtcblx0XHRcdFx0aXNzdWVyOiAnaHR0cHM6Ly9leGFtcGxlLmNvbScsXG5cdFx0XHRcdGF1dGhvcml6YXRpb25fZW5kcG9pbnQ6ICdmdHA6Ly9leGFtcGxlLmNvbS9hdXRoJyxcblx0XHRcdFx0cmVzcG9uc2VfdHlwZXNfc3VwcG9ydGVkOiBbJ2NvZGUnXVxuXHRcdFx0fSksIC9BdXRob3JpemF0aW9uIHNlcnZlciBtZXRhZGF0YSAnYXV0aG9yaXphdGlvbl9lbmRwb2ludCcgbXVzdCBzdGFydCB3aXRoIGh0dHA6XFwvXFwvIG9yIGh0dHBzOlxcL1xcLy8pO1xuXG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGlzQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhKHtcblx0XHRcdFx0aXNzdWVyOiAnaHR0cHM6Ly9leGFtcGxlLmNvbScsXG5cdFx0XHRcdHRva2VuX2VuZHBvaW50OiAnZmlsZTovLy9wYXRoL3RvL3Rva2VuJyxcblx0XHRcdFx0cmVzcG9uc2VfdHlwZXNfc3VwcG9ydGVkOiBbJ2NvZGUnXVxuXHRcdFx0fSksIC9BdXRob3JpemF0aW9uIHNlcnZlciBtZXRhZGF0YSAndG9rZW5fZW5kcG9pbnQnIG11c3Qgc3RhcnQgd2l0aCBodHRwOlxcL1xcLyBvciBodHRwczpcXC9cXC8vKTtcblxuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiBpc0F1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSh7XG5cdFx0XHRcdGlzc3VlcjogJ2h0dHBzOi8vZXhhbXBsZS5jb20nLFxuXHRcdFx0XHRyZWdpc3RyYXRpb25fZW5kcG9pbnQ6ICdtYWlsdG86YWRtaW5AZXhhbXBsZS5jb20nLFxuXHRcdFx0XHRyZXNwb25zZV90eXBlc19zdXBwb3J0ZWQ6IFsnY29kZSddXG5cdFx0XHR9KSwgL0F1dGhvcml6YXRpb24gc2VydmVyIG1ldGFkYXRhICdyZWdpc3RyYXRpb25fZW5kcG9pbnQnIG11c3Qgc3RhcnQgd2l0aCBodHRwOlxcL1xcLyBvciBodHRwczpcXC9cXC8vKTtcblxuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiBpc0F1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSh7XG5cdFx0XHRcdGlzc3VlcjogJ2h0dHBzOi8vZXhhbXBsZS5jb20nLFxuXHRcdFx0XHRqd2tzX3VyaTogJ2RhdGE6YXBwbGljYXRpb24vanNvbix7fScsXG5cdFx0XHRcdHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJ11cblx0XHRcdH0pLCAvQXV0aG9yaXphdGlvbiBzZXJ2ZXIgbWV0YWRhdGEgJ2p3a3NfdXJpJyBtdXN0IHN0YXJ0IHdpdGggaHR0cDpcXC9cXC8gb3IgaHR0cHM6XFwvXFwvLyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpc0F1dGhvcml6YXRpb25EeW5hbWljQ2xpZW50UmVnaXN0cmF0aW9uUmVzcG9uc2Ugc2hvdWxkIGNvcnJlY3RseSBpZGVudGlmeSByZWdpc3RyYXRpb24gcmVzcG9uc2UnLCAoKSA9PiB7XG5cdFx0XHQvLyBWYWxpZCByZXNwb25zZVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQXV0aG9yaXphdGlvbkR5bmFtaWNDbGllbnRSZWdpc3RyYXRpb25SZXNwb25zZSh7XG5cdFx0XHRcdGNsaWVudF9pZDogJ2NsaWVudC0xMjMnLFxuXHRcdFx0XHRjbGllbnRfbmFtZTogJ1Rlc3QgQ2xpZW50J1xuXHRcdFx0fSksIHRydWUpO1xuXG5cdFx0XHQvLyBJbnZhbGlkIGNhc2VzXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBdXRob3JpemF0aW9uRHluYW1pY0NsaWVudFJlZ2lzdHJhdGlvblJlc3BvbnNlKG51bGwpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBdXRob3JpemF0aW9uRHluYW1pY0NsaWVudFJlZ2lzdHJhdGlvblJlc3BvbnNlKHVuZGVmaW5lZCksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0F1dGhvcml6YXRpb25EeW5hbWljQ2xpZW50UmVnaXN0cmF0aW9uUmVzcG9uc2Uoe30pLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBdXRob3JpemF0aW9uRHluYW1pY0NsaWVudFJlZ2lzdHJhdGlvblJlc3BvbnNlKHsgY2xpZW50X2lkOiAnanVzdC1pZCcgfSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQXV0aG9yaXphdGlvbkR5bmFtaWNDbGllbnRSZWdpc3RyYXRpb25SZXNwb25zZSh7IGNsaWVudF9uYW1lOiAnbWlzc2luZy1pZCcgfSksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0F1dGhvcml6YXRpb25EeW5hbWljQ2xpZW50UmVnaXN0cmF0aW9uUmVzcG9uc2UoJ25vdCBhbiBvYmplY3QnKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaXNBdXRob3JpemF0aW9uQXV0aG9yaXplUmVzcG9uc2Ugc2hvdWxkIGNvcnJlY3RseSBpZGVudGlmeSBhdXRob3JpemF0aW9uIHJlc3BvbnNlJywgKCkgPT4ge1xuXHRcdFx0Ly8gVmFsaWQgcmVzcG9uc2Vcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0F1dGhvcml6YXRpb25BdXRob3JpemVSZXNwb25zZSh7XG5cdFx0XHRcdGNvZGU6ICdhdXRoLWNvZGUtMTIzJyxcblx0XHRcdFx0c3RhdGU6ICdzdGF0ZS0xMjMnXG5cdFx0XHR9KSwgdHJ1ZSk7XG5cblx0XHRcdC8vIEludmFsaWQgY2FzZXNcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0F1dGhvcml6YXRpb25BdXRob3JpemVSZXNwb25zZShudWxsKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQXV0aG9yaXphdGlvbkF1dGhvcml6ZVJlc3BvbnNlKHVuZGVmaW5lZCksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0F1dGhvcml6YXRpb25BdXRob3JpemVSZXNwb25zZSh7fSksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0F1dGhvcml6YXRpb25BdXRob3JpemVSZXNwb25zZSh7IGNvZGU6ICdtaXNzaW5nLXN0YXRlJyB9KSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQXV0aG9yaXphdGlvbkF1dGhvcml6ZVJlc3BvbnNlKHsgc3RhdGU6ICdtaXNzaW5nLWNvZGUnIH0pLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBdXRob3JpemF0aW9uQXV0aG9yaXplUmVzcG9uc2UoJ25vdCBhbiBvYmplY3QnKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaXNBdXRob3JpemF0aW9uVG9rZW5SZXNwb25zZSBzaG91bGQgY29ycmVjdGx5IGlkZW50aWZ5IHRva2VuIHJlc3BvbnNlJywgKCkgPT4ge1xuXHRcdFx0Ly8gVmFsaWQgcmVzcG9uc2Vcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0F1dGhvcml6YXRpb25Ub2tlblJlc3BvbnNlKHtcblx0XHRcdFx0YWNjZXNzX3Rva2VuOiAndG9rZW4tMTIzJyxcblx0XHRcdFx0dG9rZW5fdHlwZTogJ0JlYXJlcidcblx0XHRcdH0pLCB0cnVlKTtcblxuXHRcdFx0Ly8gSW52YWxpZCBjYXNlc1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQXV0aG9yaXphdGlvblRva2VuUmVzcG9uc2UobnVsbCksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0F1dGhvcml6YXRpb25Ub2tlblJlc3BvbnNlKHVuZGVmaW5lZCksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0F1dGhvcml6YXRpb25Ub2tlblJlc3BvbnNlKHt9KSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQXV0aG9yaXphdGlvblRva2VuUmVzcG9uc2UoeyBhY2Nlc3NfdG9rZW46ICdtaXNzaW5nLXR5cGUnIH0pLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBdXRob3JpemF0aW9uVG9rZW5SZXNwb25zZSh7IHRva2VuX3R5cGU6ICdtaXNzaW5nLXRva2VuJyB9KSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQXV0aG9yaXphdGlvblRva2VuUmVzcG9uc2UoJ25vdCBhbiBvYmplY3QnKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaXNBdXRob3JpemF0aW9uRGV2aWNlUmVzcG9uc2Ugc2hvdWxkIGNvcnJlY3RseSBpZGVudGlmeSBkZXZpY2UgYXV0aG9yaXphdGlvbiByZXNwb25zZScsICgpID0+IHtcblx0XHRcdC8vIFZhbGlkIHJlc3BvbnNlXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBdXRob3JpemF0aW9uRGV2aWNlUmVzcG9uc2Uoe1xuXHRcdFx0XHRkZXZpY2VfY29kZTogJ2RldmljZS1jb2RlLTEyMycsXG5cdFx0XHRcdHVzZXJfY29kZTogJ0FCQ0QtRUZHSCcsXG5cdFx0XHRcdHZlcmlmaWNhdGlvbl91cmk6ICdodHRwczovL2V4YW1wbGUuY29tL3ZlcmlmeScsXG5cdFx0XHRcdGV4cGlyZXNfaW46IDE4MDBcblx0XHRcdH0pLCB0cnVlKTtcblxuXHRcdFx0Ly8gVmFsaWQgcmVzcG9uc2Ugd2l0aCBvcHRpb25hbCBmaWVsZHNcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0F1dGhvcml6YXRpb25EZXZpY2VSZXNwb25zZSh7XG5cdFx0XHRcdGRldmljZV9jb2RlOiAnZGV2aWNlLWNvZGUtMTIzJyxcblx0XHRcdFx0dXNlcl9jb2RlOiAnQUJDRC1FRkdIJyxcblx0XHRcdFx0dmVyaWZpY2F0aW9uX3VyaTogJ2h0dHBzOi8vZXhhbXBsZS5jb20vdmVyaWZ5Jyxcblx0XHRcdFx0dmVyaWZpY2F0aW9uX3VyaV9jb21wbGV0ZTogJ2h0dHBzOi8vZXhhbXBsZS5jb20vdmVyaWZ5P3VzZXJfY29kZT1BQkNELUVGR0gnLFxuXHRcdFx0XHRleHBpcmVzX2luOiAxODAwLFxuXHRcdFx0XHRpbnRlcnZhbDogNVxuXHRcdFx0fSksIHRydWUpO1xuXG5cdFx0XHQvLyBJbnZhbGlkIGNhc2VzXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBdXRob3JpemF0aW9uRGV2aWNlUmVzcG9uc2UobnVsbCksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0F1dGhvcml6YXRpb25EZXZpY2VSZXNwb25zZSh1bmRlZmluZWQpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBdXRob3JpemF0aW9uRGV2aWNlUmVzcG9uc2Uoe30pLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBdXRob3JpemF0aW9uRGV2aWNlUmVzcG9uc2UoeyBkZXZpY2VfY29kZTogJ21pc3Npbmctb3RoZXJzJyB9KSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQXV0aG9yaXphdGlvbkRldmljZVJlc3BvbnNlKHsgdXNlcl9jb2RlOiAnbWlzc2luZy1vdGhlcnMnIH0pLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBdXRob3JpemF0aW9uRGV2aWNlUmVzcG9uc2UoeyB2ZXJpZmljYXRpb25fdXJpOiAnbWlzc2luZy1vdGhlcnMnIH0pLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBdXRob3JpemF0aW9uRGV2aWNlUmVzcG9uc2UoeyBleHBpcmVzX2luOiAxODAwIH0pLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBdXRob3JpemF0aW9uRGV2aWNlUmVzcG9uc2Uoe1xuXHRcdFx0XHRkZXZpY2VfY29kZTogJ2RldmljZS1jb2RlLTEyMycsXG5cdFx0XHRcdHVzZXJfY29kZTogJ0FCQ0QtRUZHSCcsXG5cdFx0XHRcdHZlcmlmaWNhdGlvbl91cmk6ICdodHRwczovL2V4YW1wbGUuY29tL3ZlcmlmeSdcblx0XHRcdFx0Ly8gTWlzc2luZyBleHBpcmVzX2luXG5cdFx0XHR9KSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQXV0aG9yaXphdGlvbkRldmljZVJlc3BvbnNlKCdub3QgYW4gb2JqZWN0JyksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2lzQXV0aG9yaXphdGlvbkVycm9yUmVzcG9uc2Ugc2hvdWxkIGNvcnJlY3RseSBpZGVudGlmeSBlcnJvciByZXNwb25zZScsICgpID0+IHtcblx0XHRcdC8vIFZhbGlkIGVycm9yIHJlc3BvbnNlXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBdXRob3JpemF0aW9uRXJyb3JSZXNwb25zZSh7XG5cdFx0XHRcdGVycm9yOiAnYXV0aG9yaXphdGlvbl9wZW5kaW5nJyxcblx0XHRcdFx0ZXJyb3JfZGVzY3JpcHRpb246ICdUaGUgYXV0aG9yaXphdGlvbiByZXF1ZXN0IGlzIHN0aWxsIHBlbmRpbmcnXG5cdFx0XHR9KSwgdHJ1ZSk7XG5cblx0XHRcdC8vIFZhbGlkIGVycm9yIHJlc3BvbnNlIHdpdGggZGlmZmVyZW50IGVycm9yIGNvZGVzXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBdXRob3JpemF0aW9uRXJyb3JSZXNwb25zZSh7XG5cdFx0XHRcdGVycm9yOiAnc2xvd19kb3duJyxcblx0XHRcdFx0ZXJyb3JfZGVzY3JpcHRpb246ICdQb2xsaW5nIHRvbyBmYXN0J1xuXHRcdFx0fSksIHRydWUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBdXRob3JpemF0aW9uRXJyb3JSZXNwb25zZSh7XG5cdFx0XHRcdGVycm9yOiAnYWNjZXNzX2RlbmllZCcsXG5cdFx0XHRcdGVycm9yX2Rlc2NyaXB0aW9uOiAnVGhlIHVzZXIgZGVuaWVkIHRoZSByZXF1ZXN0J1xuXHRcdFx0fSksIHRydWUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBdXRob3JpemF0aW9uRXJyb3JSZXNwb25zZSh7XG5cdFx0XHRcdGVycm9yOiAnZXhwaXJlZF90b2tlbicsXG5cdFx0XHRcdGVycm9yX2Rlc2NyaXB0aW9uOiAnVGhlIGRldmljZSBjb2RlIGhhcyBleHBpcmVkJ1xuXHRcdFx0fSksIHRydWUpO1xuXG5cdFx0XHQvLyBWYWxpZCByZXNwb25zZSB3aXRoIG9wdGlvbmFsIGVycm9yX3VyaVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQXV0aG9yaXphdGlvbkVycm9yUmVzcG9uc2Uoe1xuXHRcdFx0XHRlcnJvcjogJ2ludmFsaWRfcmVxdWVzdCcsXG5cdFx0XHRcdGVycm9yX2Rlc2NyaXB0aW9uOiAnVGhlIHJlcXVlc3QgaXMgbWlzc2luZyBhIHJlcXVpcmVkIHBhcmFtZXRlcicsXG5cdFx0XHRcdGVycm9yX3VyaTogJ2h0dHBzOi8vZXhhbXBsZS5jb20vZXJyb3InXG5cdFx0XHR9KSwgdHJ1ZSk7XG5cblx0XHRcdC8vIEludmFsaWQgY2FzZXNcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0F1dGhvcml6YXRpb25FcnJvclJlc3BvbnNlKG51bGwpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBdXRob3JpemF0aW9uRXJyb3JSZXNwb25zZSh1bmRlZmluZWQpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBdXRob3JpemF0aW9uRXJyb3JSZXNwb25zZSh7fSksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0F1dGhvcml6YXRpb25FcnJvclJlc3BvbnNlKHsgZXJyb3JfZGVzY3JpcHRpb246ICdtaXNzaW5nLWVycm9yJyB9KSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQXV0aG9yaXphdGlvbkVycm9yUmVzcG9uc2UoJ25vdCBhbiBvYmplY3QnKSwgZmFsc2UpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnU2NvcGUgTWF0Y2hpbmcnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2NvcGVzTWF0Y2ggc2hvdWxkIHJldHVybiB0cnVlIGZvciBpZGVudGljYWwgc2NvcGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2NvcGVzMSA9IFsndGVzdCcsICdzY29wZXMnXTtcblx0XHRcdGNvbnN0IHNjb3BlczIgPSBbJ3Rlc3QnLCAnc2NvcGVzJ107XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NvcGVzTWF0Y2goc2NvcGVzMSwgc2NvcGVzMiksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2NvcGVzTWF0Y2ggc2hvdWxkIHJldHVybiB0cnVlIGZvciBzY29wZXMgaW4gZGlmZmVyZW50IG9yZGVyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2NvcGVzMSA9IFsnNmYxY2M5ODUtODVlOC00ODdlLWIwZGQtYWE2MzMzMDJhNzMxLy5kZWZhdWx0JywgJ1ZTQ09ERV9URU5BTlQ6b3JnYW5pemF0aW9ucyddO1xuXHRcdFx0Y29uc3Qgc2NvcGVzMiA9IFsnVlNDT0RFX1RFTkFOVDpvcmdhbml6YXRpb25zJywgJzZmMWNjOTg1LTg1ZTgtNDg3ZS1iMGRkLWFhNjMzMzAyYTczMS8uZGVmYXVsdCddO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3Blc01hdGNoKHNjb3BlczEsIHNjb3BlczIpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Njb3Blc01hdGNoIHNob3VsZCByZXR1cm4gZmFsc2UgZm9yIGRpZmZlcmVudCBzY29wZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzY29wZXMxID0gWyd0ZXN0JywgJ3Njb3BlcyddO1xuXHRcdFx0Y29uc3Qgc2NvcGVzMiA9IFsnZGlmZmVyZW50JywgJ3Njb3BlcyddO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3Blc01hdGNoKHNjb3BlczEsIHNjb3BlczIpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzY29wZXNNYXRjaCBzaG91bGQgcmV0dXJuIGZhbHNlIGZvciBkaWZmZXJlbnQgbGVuZ3RoIGFycmF5cycsICgpID0+IHtcblx0XHRcdGNvbnN0IHNjb3BlczEgPSBbJ3Rlc3QnXTtcblx0XHRcdGNvbnN0IHNjb3BlczIgPSBbJ3Rlc3QnLCAnc2NvcGVzJ107XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NvcGVzTWF0Y2goc2NvcGVzMSwgc2NvcGVzMiksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Njb3Blc01hdGNoIHNob3VsZCBoYW5kbGUgY29tcGxleCBNaWNyb3NvZnQgc2NvcGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2NvcGVzMSA9IFsnNmYxY2M5ODUtODVlOC00ODdlLWIwZGQtYWE2MzMzMDJhNzMxLy5kZWZhdWx0JywgJ1ZTQ09ERV9URU5BTlQ6b3JnYW5pemF0aW9ucyddO1xuXHRcdFx0Y29uc3Qgc2NvcGVzMiA9IFsnVlNDT0RFX1RFTkFOVDpvcmdhbml6YXRpb25zJywgJzZmMWNjOTg1LTg1ZTgtNDg3ZS1iMGRkLWFhNjMzMzAyYTczMS8uZGVmYXVsdCddO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3Blc01hdGNoKHNjb3BlczEsIHNjb3BlczIpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Njb3Blc01hdGNoIHNob3VsZCBoYW5kbGUgZW1wdHkgYXJyYXlzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3Blc01hdGNoKFtdLCBbXSksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2NvcGVzTWF0Y2ggc2hvdWxkIGhhbmRsZSBzaW5nbGUgc2NvcGUgYXJyYXlzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3Blc01hdGNoKFsnc2luZ2xlJ10sIFsnc2luZ2xlJ10pLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29wZXNNYXRjaChbJ3NpbmdsZSddLCBbJ2RpZmZlcmVudCddKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2NvcGVzTWF0Y2ggc2hvdWxkIGhhbmRsZSBkdXBsaWNhdGUgc2NvcGVzIHdpdGhpbiBhcnJheXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzY29wZXMxID0gWydzY29wZTEnLCAnc2NvcGUyJywgJ3Njb3BlMSddO1xuXHRcdFx0Y29uc3Qgc2NvcGVzMiA9IFsnc2NvcGUyJywgJ3Njb3BlMScsICdzY29wZTEnXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29wZXNNYXRjaChzY29wZXMxLCBzY29wZXMyKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzY29wZXNNYXRjaCBzaG91bGQgaGFuZGxlIHVuZGVmaW5lZCB2YWx1ZXMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NvcGVzTWF0Y2godW5kZWZpbmVkLCB1bmRlZmluZWQpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29wZXNNYXRjaChbJ3JlYWQnXSwgdW5kZWZpbmVkKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3Blc01hdGNoKHVuZGVmaW5lZCwgWyd3cml0ZSddKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2NvcGVzTWF0Y2ggc2hvdWxkIGhhbmRsZSBtaXhlZCB1bmRlZmluZWQgYW5kIGVtcHR5IGFycmF5cycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29wZXNNYXRjaChbXSwgdW5kZWZpbmVkKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3Blc01hdGNoKHVuZGVmaW5lZCwgW10pLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NvcGVzTWF0Y2goW10sIFtdKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdVdGlsaXR5IEZ1bmN0aW9ucycsICgpID0+IHtcblx0XHR0ZXN0KCdnZXREZWZhdWx0TWV0YWRhdGFGb3JVcmwgc2hvdWxkIHJldHVybiBjb3JyZWN0IGRlZmF1bHQgZW5kcG9pbnRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYXV0aG9yaXphdGlvblNlcnZlciA9IG5ldyBVUkwoJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbScpO1xuXHRcdFx0Y29uc3QgbWV0YWRhdGEgPSBnZXREZWZhdWx0TWV0YWRhdGFGb3JVcmwoYXV0aG9yaXphdGlvblNlcnZlcik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtZXRhZGF0YS5pc3N1ZXIsICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWV0YWRhdGEuYXV0aG9yaXphdGlvbl9lbmRwb2ludCwgJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS9hdXRob3JpemUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtZXRhZGF0YS50b2tlbl9lbmRwb2ludCwgJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS90b2tlbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1ldGFkYXRhLnJlZ2lzdHJhdGlvbl9lbmRwb2ludCwgJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS9yZWdpc3RlcicpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtZXRhZGF0YS5yZXNwb25zZV90eXBlc19zdXBwb3J0ZWQsIFsnY29kZScsICdpZF90b2tlbicsICdpZF90b2tlbiB0b2tlbiddKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ1BhcnNpbmcgRnVuY3Rpb25zJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3BhcnNlV1dXQXV0aGVudGljYXRlSGVhZGVyIHNob3VsZCBjb3JyZWN0bHkgcGFyc2Ugc2ltcGxlIGhlYWRlcicsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlV1dXQXV0aGVudGljYXRlSGVhZGVyKCdCZWFyZXInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0uc2NoZW1lLCAnQmVhcmVyJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdFswXS5wYXJhbXMsIHt9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BhcnNlV1dXQXV0aGVudGljYXRlSGVhZGVyIHNob3VsZCBjb3JyZWN0bHkgcGFyc2UgaGVhZGVyIHdpdGggcGFyYW1ldGVycycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlV1dXQXV0aGVudGljYXRlSGVhZGVyKCdCZWFyZXIgcmVhbG09XCJhcGlcIiwgZXJyb3I9XCJpbnZhbGlkX3Rva2VuXCIsIGVycm9yX2Rlc2NyaXB0aW9uPVwiVGhlIGFjY2VzcyB0b2tlbiBleHBpcmVkXCInKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5zY2hlbWUsICdCZWFyZXInKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0WzBdLnBhcmFtcywge1xuXHRcdFx0XHRyZWFsbTogJ2FwaScsXG5cdFx0XHRcdGVycm9yOiAnaW52YWxpZF90b2tlbicsXG5cdFx0XHRcdGVycm9yX2Rlc2NyaXB0aW9uOiAnVGhlIGFjY2VzcyB0b2tlbiBleHBpcmVkJ1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwYXJzZVdXV0F1dGhlbnRpY2F0ZUhlYWRlciBzaG91bGQgY29ycmVjdGx5IHBhcnNlIHBhcmFtZXRlcnMgd2l0aCBlcXVhbCBzaWducycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlV1dXQXV0aGVudGljYXRlSGVhZGVyKCdCZWFyZXIgcmVzb3VyY2VfbWV0YWRhdGE9XCJodHRwczovL2V4YW1wbGUuY29tLy53ZWxsLWtub3duL29hdXRoLXByb3RlY3RlZC1yZXNvdXJjZT92PTFcIicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5zY2hlbWUsICdCZWFyZXInKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0WzBdLnBhcmFtcywge1xuXHRcdFx0XHRyZXNvdXJjZV9tZXRhZGF0YTogJ2h0dHBzOi8vZXhhbXBsZS5jb20vLndlbGwta25vd24vb2F1dGgtcHJvdGVjdGVkLXJlc291cmNlP3Y9MSdcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGFyc2VXV1dBdXRoZW50aWNhdGVIZWFkZXIgc2hvdWxkIGNvcnJlY3RseSBwYXJzZSBtdWx0aXBsZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlV1dXQXV0aGVudGljYXRlSGVhZGVyKCdCZWFyZXIgcmVhbG09XCJhcGlcIiwgZXJyb3I9XCJpbnZhbGlkX3Rva2VuXCIsIGVycm9yX2Rlc2NyaXB0aW9uPVwiVGhlIGFjY2VzcyB0b2tlbiBleHBpcmVkXCIsIEJhc2ljIHJlYWxtPVwiaGlcIicpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLnNjaGVtZSwgJ0JlYXJlcicpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHRbMF0ucGFyYW1zLCB7XG5cdFx0XHRcdHJlYWxtOiAnYXBpJyxcblx0XHRcdFx0ZXJyb3I6ICdpbnZhbGlkX3Rva2VuJyxcblx0XHRcdFx0ZXJyb3JfZGVzY3JpcHRpb246ICdUaGUgYWNjZXNzIHRva2VuIGV4cGlyZWQnXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMV0uc2NoZW1lLCAnQmFzaWMnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0WzFdLnBhcmFtcywge1xuXHRcdFx0XHRyZWFsbTogJ2hpJ1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblxuXHRcdHRlc3QoJ2dldENsYWltc0Zyb21KV1Qgc2hvdWxkIGNvcnJlY3RseSBwYXJzZSBhIEpXVCB0b2tlbicsICgpID0+IHtcblx0XHRcdC8vIENyZWF0ZSBhIHNhbXBsZSBKV1Qgd2l0aCBrbm93biBwYXlsb2FkXG5cdFx0XHRjb25zdCBwYXlsb2FkOiBJQXV0aG9yaXphdGlvbkpXVENsYWltcyA9IHtcblx0XHRcdFx0anRpOiAnaWQxMjMnLFxuXHRcdFx0XHRzdWI6ICd1c2VyMTIzJyxcblx0XHRcdFx0aXNzOiAnaHR0cHM6Ly9leGFtcGxlLmNvbScsXG5cdFx0XHRcdGF1ZDogJ2NsaWVudDEyMycsXG5cdFx0XHRcdGV4cDogMTcxNjIzOTAyMixcblx0XHRcdFx0aWF0OiAxNzE2MjM1NDIyLFxuXHRcdFx0XHRuYW1lOiAnVGVzdCBVc2VyJ1xuXHRcdFx0fTtcblxuXHRcdFx0Ly8gQ3JlYXRlIGZha2UgYnV0IHByb3Blcmx5IGZvcm1hdHRlZCBKV1Rcblx0XHRcdGNvbnN0IGhlYWRlciA9IHsgYWxnOiAnSFMyNTYnLCB0eXA6ICdKV1QnIH07XG5cdFx0XHRjb25zdCBlbmNvZGVkSGVhZGVyID0gZW5jb2RlQmFzZTY0KFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoaGVhZGVyKSkpO1xuXHRcdFx0Y29uc3QgZW5jb2RlZFBheWxvYWQgPSBlbmNvZGVCYXNlNjQoVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeShwYXlsb2FkKSkpO1xuXHRcdFx0Y29uc3QgZmFrZVNpZ25hdHVyZSA9ICdmYWtlLXNpZ25hdHVyZSc7XG5cdFx0XHRjb25zdCB0b2tlbiA9IGAke2VuY29kZWRIZWFkZXJ9LiR7ZW5jb2RlZFBheWxvYWR9LiR7ZmFrZVNpZ25hdHVyZX1gO1xuXG5cdFx0XHRjb25zdCBjbGFpbXMgPSBnZXRDbGFpbXNGcm9tSldUKHRva2VuKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2xhaW1zLCBwYXlsb2FkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dldENsYWltc0Zyb21KV1Qgc2hvdWxkIHRocm93IGZvciBpbnZhbGlkIEpXVCBmb3JtYXQnLCAoKSA9PiB7XG5cdFx0XHQvLyBUZXN0IHdpdGggd3JvbmcgbnVtYmVyIG9mIHBhcnRzIC0gc2hvdWxkIHRocm93IFwiSW52YWxpZCBKV1QgdG9rZW4gZm9ybWF0XCJcblx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4gZ2V0Q2xhaW1zRnJvbUpXVCgnb25seS50d28nKSwgL0ludmFsaWQgSldUIHRva2VuIGZvcm1hdC4qdGhyZWUgcGFydHMvKTtcblx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4gZ2V0Q2xhaW1zRnJvbUpXVCgnb25lJyksIC9JbnZhbGlkIEpXVCB0b2tlbiBmb3JtYXQuKnRocmVlIHBhcnRzLyk7XG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGdldENsYWltc0Zyb21KV1QoJ2hhcy5mb3VyLnBhcnRzLmhlcmUnKSwgL0ludmFsaWQgSldUIHRva2VuIGZvcm1hdC4qdGhyZWUgcGFydHMvKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dldENsYWltc0Zyb21KV1Qgc2hvdWxkIHRocm93IGZvciBpbnZhbGlkIGhlYWRlciBjb250ZW50JywgKCkgPT4ge1xuXHRcdFx0Ly8gQ3JlYXRlIEpXVCB3aXRoIGludmFsaWQgaGVhZGVyXG5cdFx0XHRjb25zdCBlbmNvZGVkSGVhZGVyID0gZW5jb2RlQmFzZTY0KFZTQnVmZmVyLmZyb21TdHJpbmcoJ25vdC1qc29uJykpO1xuXHRcdFx0Y29uc3QgZW5jb2RlZFBheWxvYWQgPSBlbmNvZGVCYXNlNjQoVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7IHN1YjogJ3Rlc3QnIH0pKSk7XG5cdFx0XHRjb25zdCB0b2tlbiA9IGAke2VuY29kZWRIZWFkZXJ9LiR7ZW5jb2RlZFBheWxvYWR9LnNpZ25hdHVyZWA7XG5cblx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4gZ2V0Q2xhaW1zRnJvbUpXVCh0b2tlbiksIC9GYWlsZWQgdG8gcGFyc2UgSldUIHRva2VuLyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZXRDbGFpbXNGcm9tSldUIHNob3VsZCB0aHJvdyBmb3IgaW52YWxpZCBwYXlsb2FkIGNvbnRlbnQnLCAoKSA9PiB7XG5cdFx0XHQvLyBDcmVhdGUgSldUIHdpdGggdmFsaWQgaGVhZGVyIGJ1dCBpbnZhbGlkIHBheWxvYWRcblx0XHRcdGNvbnN0IGhlYWRlciA9IHsgYWxnOiAnSFMyNTYnLCB0eXA6ICdKV1QnIH07XG5cdFx0XHRjb25zdCBlbmNvZGVkSGVhZGVyID0gZW5jb2RlQmFzZTY0KFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoaGVhZGVyKSkpO1xuXHRcdFx0Y29uc3QgZW5jb2RlZFBheWxvYWQgPSBlbmNvZGVCYXNlNjQoVlNCdWZmZXIuZnJvbVN0cmluZygnbm90LWpzb24nKSk7XG5cdFx0XHRjb25zdCB0b2tlbiA9IGAke2VuY29kZWRIZWFkZXJ9LiR7ZW5jb2RlZFBheWxvYWR9LnNpZ25hdHVyZWA7XG5cblx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4gZ2V0Q2xhaW1zRnJvbUpXVCh0b2tlbiksIC9GYWlsZWQgdG8gcGFyc2UgSldUIHRva2VuLyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdOZXR3b3JrIEZ1bmN0aW9ucycsICgpID0+IHtcblx0XHRsZXQgc2FuZGJveDogc2lub24uU2lub25TYW5kYm94O1xuXHRcdGxldCBmZXRjaFN0dWI6IHNpbm9uLlNpbm9uU3R1YjtcblxuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdHNhbmRib3ggPSBzaW5vbi5jcmVhdGVTYW5kYm94KCk7XG5cdFx0XHRmZXRjaFN0dWIgPSBzYW5kYm94LnN0dWIoZ2xvYmFsVGhpcywgJ2ZldGNoJyk7XG5cdFx0fSk7XG5cblx0XHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0XHRzYW5kYm94LnJlc3RvcmUoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZldGNoRHluYW1pY1JlZ2lzdHJhdGlvbiBzaG91bGQgbWFrZSBjb3JyZWN0IHJlcXVlc3QgYW5kIHBhcnNlIHJlc3BvbnNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gU2V0dXAgc3VjY2Vzc2Z1bCByZXNwb25zZVxuXHRcdFx0Y29uc3QgbW9ja1Jlc3BvbnNlID0ge1xuXHRcdFx0XHRjbGllbnRfaWQ6ICdnZW5lcmF0ZWQtY2xpZW50LWlkJyxcblx0XHRcdFx0Y2xpZW50X25hbWU6ICdUZXN0IENsaWVudCcsXG5cdFx0XHRcdGNsaWVudF91cmk6ICdodHRwczovL2NvZGUudmlzdWFsc3R1ZGlvLmNvbSdcblx0XHRcdH07XG5cblx0XHRcdGZldGNoU3R1Yi5yZXNvbHZlcyh7XG5cdFx0XHRcdG9rOiB0cnVlLFxuXHRcdFx0XHRqc29uOiBhc3luYyAoKSA9PiBtb2NrUmVzcG9uc2Vcblx0XHRcdH0gYXMgUmVzcG9uc2UpO1xuXG5cdFx0XHRjb25zdCBzZXJ2ZXJNZXRhZGF0YTogSUF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSA9IHtcblx0XHRcdFx0aXNzdWVyOiAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tJyxcblx0XHRcdFx0cmVnaXN0cmF0aW9uX2VuZHBvaW50OiAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tL3JlZ2lzdGVyJyxcblx0XHRcdFx0cmVzcG9uc2VfdHlwZXNfc3VwcG9ydGVkOiBbJ2NvZGUnXVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZmV0Y2hEeW5hbWljUmVnaXN0cmF0aW9uKFxuXHRcdFx0XHRzZXJ2ZXJNZXRhZGF0YSxcblx0XHRcdFx0J1Rlc3QgQ2xpZW50J1xuXHRcdFx0KTtcblxuXHRcdFx0Ly8gVmVyaWZ5IGZldGNoIHdhcyBjYWxsZWQgY29ycmVjdGx5XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmV0Y2hTdHViLmNhbGxDb3VudCwgMSk7XG5cdFx0XHRjb25zdCBbdXJsLCBvcHRpb25zXSA9IGZldGNoU3R1Yi5maXJzdENhbGwuYXJncztcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cmwsICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vcmVnaXN0ZXInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcHRpb25zLm1ldGhvZCwgJ1BPU1QnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcHRpb25zLmhlYWRlcnNbJ0NvbnRlbnQtVHlwZSddLCAnYXBwbGljYXRpb24vanNvbicpO1xuXG5cdFx0XHQvLyBWZXJpZnkgcmVxdWVzdCBib2R5XG5cdFx0XHRjb25zdCByZXF1ZXN0Qm9keSA9IEpTT04ucGFyc2Uob3B0aW9ucy5ib2R5IGFzIHN0cmluZyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVxdWVzdEJvZHkuY2xpZW50X25hbWUsICdUZXN0IENsaWVudCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcXVlc3RCb2R5LmNsaWVudF91cmksICdodHRwczovL2NvZGUudmlzdWFsc3R1ZGlvLmNvbScpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXF1ZXN0Qm9keS5ncmFudF90eXBlcywgWydhdXRob3JpemF0aW9uX2NvZGUnLCAncmVmcmVzaF90b2tlbicsICd1cm46aWV0ZjpwYXJhbXM6b2F1dGg6Z3JhbnQtdHlwZTpkZXZpY2VfY29kZSddKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVxdWVzdEJvZHkucmVzcG9uc2VfdHlwZXMsIFsnY29kZSddKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVxdWVzdEJvZHkucmVkaXJlY3RfdXJpcywgW1xuXHRcdFx0XHQnaHR0cHM6Ly9pbnNpZGVycy52c2NvZGUuZGV2L3JlZGlyZWN0Jyxcblx0XHRcdFx0J2h0dHBzOi8vdnNjb2RlLmRldi9yZWRpcmVjdCcsXG5cdFx0XHRcdCdodHRwOi8vMTI3LjAuMC4xLycsXG5cdFx0XHRcdGBodHRwOi8vMTI3LjAuMC4xOiR7REVGQVVMVF9BVVRIX0ZMT1dfUE9SVH0vYFxuXHRcdFx0XSk7XG5cblx0XHRcdC8vIFZlcmlmeSByZXNwb25zZSBpcyBwcm9jZXNzZWQgY29ycmVjdGx5XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgbW9ja1Jlc3BvbnNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZldGNoRHluYW1pY1JlZ2lzdHJhdGlvbiBzaG91bGQgdGhyb3cgZXJyb3Igb24gbm9uLU9LIHJlc3BvbnNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZmV0Y2hTdHViLnJlc29sdmVzKHtcblx0XHRcdFx0b2s6IGZhbHNlLFxuXHRcdFx0XHRzdGF0dXNUZXh0OiAnQmFkIFJlcXVlc3QnLFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiAnQmFkIFJlcXVlc3QnXG5cdFx0XHR9IGFzIFJlc3BvbnNlKTtcblxuXHRcdFx0Y29uc3Qgc2VydmVyTWV0YWRhdGE6IElBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEgPSB7XG5cdFx0XHRcdGlzc3VlcjogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbScsXG5cdFx0XHRcdHJlZ2lzdHJhdGlvbl9lbmRwb2ludDogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS9yZWdpc3RlcicsXG5cdFx0XHRcdHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJ11cblx0XHRcdH07XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0XHRhc3luYyAoKSA9PiBhd2FpdCBmZXRjaER5bmFtaWNSZWdpc3RyYXRpb24oc2VydmVyTWV0YWRhdGEsICdUZXN0IENsaWVudCcpLFxuXHRcdFx0XHQvUmVnaXN0cmF0aW9uIHRvIGh0dHBzOlxcL1xcL2F1dGhcXC5leGFtcGxlXFwuY29tXFwvcmVnaXN0ZXIgZmFpbGVkOiBCYWQgUmVxdWVzdC9cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmZXRjaER5bmFtaWNSZWdpc3RyYXRpb24gc2hvdWxkIHRocm93IGVycm9yIG9uIGludmFsaWQgcmVzcG9uc2UgZm9ybWF0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZmV0Y2hTdHViLnJlc29sdmVzKHtcblx0XHRcdFx0b2s6IHRydWUsXG5cdFx0XHRcdGpzb246IGFzeW5jICgpID0+ICh7IGludmFsaWQ6ICdyZXNwb25zZScgfSkgLy8gTWlzc2luZyByZXF1aXJlZCBmaWVsZHNcblx0XHRcdH0gYXMgUmVzcG9uc2UpO1xuXG5cdFx0XHRjb25zdCBzZXJ2ZXJNZXRhZGF0YTogSUF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSA9IHtcblx0XHRcdFx0aXNzdWVyOiAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tJyxcblx0XHRcdFx0cmVnaXN0cmF0aW9uX2VuZHBvaW50OiAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tL3JlZ2lzdGVyJyxcblx0XHRcdFx0cmVzcG9uc2VfdHlwZXNfc3VwcG9ydGVkOiBbJ2NvZGUnXVxuXHRcdFx0fTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRcdGFzeW5jICgpID0+IGF3YWl0IGZldGNoRHluYW1pY1JlZ2lzdHJhdGlvbihzZXJ2ZXJNZXRhZGF0YSwgJ1Rlc3QgQ2xpZW50JyksXG5cdFx0XHRcdC9JbnZhbGlkIGF1dGhvcml6YXRpb24gZHluYW1pYyBjbGllbnQgcmVnaXN0cmF0aW9uIHJlc3BvbnNlL1xuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZldGNoRHluYW1pY1JlZ2lzdHJhdGlvbiBzaG91bGQgZmlsdGVyIGdyYW50IHR5cGVzIGJhc2VkIG9uIHNlcnZlciBtZXRhZGF0YScsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFNldHVwIHN1Y2Nlc3NmdWwgcmVzcG9uc2Vcblx0XHRcdGNvbnN0IG1vY2tSZXNwb25zZSA9IHtcblx0XHRcdFx0Y2xpZW50X2lkOiAnZ2VuZXJhdGVkLWNsaWVudC1pZCcsXG5cdFx0XHRcdGNsaWVudF9uYW1lOiAnVGVzdCBDbGllbnQnXG5cdFx0XHR9O1xuXG5cdFx0XHRmZXRjaFN0dWIucmVzb2x2ZXMoe1xuXHRcdFx0XHRvazogdHJ1ZSxcblx0XHRcdFx0anNvbjogYXN5bmMgKCkgPT4gbW9ja1Jlc3BvbnNlXG5cdFx0XHR9IGFzIFJlc3BvbnNlKTtcblxuXHRcdFx0Y29uc3Qgc2VydmVyTWV0YWRhdGE6IElBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEgPSB7XG5cdFx0XHRcdGlzc3VlcjogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbScsXG5cdFx0XHRcdHJlZ2lzdHJhdGlvbl9lbmRwb2ludDogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS9yZWdpc3RlcicsXG5cdFx0XHRcdHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJ10sXG5cdFx0XHRcdGdyYW50X3R5cGVzX3N1cHBvcnRlZDogWydhdXRob3JpemF0aW9uX2NvZGUnLCAnY2xpZW50X2NyZWRlbnRpYWxzJywgJ3JlZnJlc2hfdG9rZW4nXSAvLyBNaXggb2Ygc3VwcG9ydGVkIGFuZCB1bnN1cHBvcnRlZFxuXHRcdFx0fTtcblxuXHRcdFx0YXdhaXQgZmV0Y2hEeW5hbWljUmVnaXN0cmF0aW9uKHNlcnZlck1ldGFkYXRhLCAnVGVzdCBDbGllbnQnKTtcblxuXHRcdFx0Ly8gVmVyaWZ5IGZldGNoIHdhcyBjYWxsZWQgY29ycmVjdGx5XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmV0Y2hTdHViLmNhbGxDb3VudCwgMSk7XG5cdFx0XHRjb25zdCBbLCBvcHRpb25zXSA9IGZldGNoU3R1Yi5maXJzdENhbGwuYXJncztcblxuXHRcdFx0Ly8gVmVyaWZ5IHJlcXVlc3QgYm9keSBjb250YWlucyBvbmx5IHRoZSBpbnRlcnNlY3Rpb24gb2Ygc3VwcG9ydGVkIGdyYW50IHR5cGVzXG5cdFx0XHRjb25zdCByZXF1ZXN0Qm9keSA9IEpTT04ucGFyc2Uob3B0aW9ucy5ib2R5IGFzIHN0cmluZyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlcXVlc3RCb2R5LmdyYW50X3R5cGVzLCBbJ2F1dGhvcml6YXRpb25fY29kZScsICdyZWZyZXNoX3Rva2VuJ10pOyAvLyBjbGllbnRfY3JlZGVudGlhbHMgc2hvdWxkIGJlIGZpbHRlcmVkIG91dFxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmV0Y2hEeW5hbWljUmVnaXN0cmF0aW9uIHNob3VsZCB1c2UgZGVmYXVsdCBncmFudCB0eXBlcyB3aGVuIHNlcnZlciBtZXRhZGF0YSBoYXMgbm9uZScsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFNldHVwIHN1Y2Nlc3NmdWwgcmVzcG9uc2Vcblx0XHRcdGNvbnN0IG1vY2tSZXNwb25zZSA9IHtcblx0XHRcdFx0Y2xpZW50X2lkOiAnZ2VuZXJhdGVkLWNsaWVudC1pZCcsXG5cdFx0XHRcdGNsaWVudF9uYW1lOiAnVGVzdCBDbGllbnQnXG5cdFx0XHR9O1xuXG5cdFx0XHRmZXRjaFN0dWIucmVzb2x2ZXMoe1xuXHRcdFx0XHRvazogdHJ1ZSxcblx0XHRcdFx0anNvbjogYXN5bmMgKCkgPT4gbW9ja1Jlc3BvbnNlXG5cdFx0XHR9IGFzIFJlc3BvbnNlKTtcblxuXHRcdFx0Y29uc3Qgc2VydmVyTWV0YWRhdGE6IElBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEgPSB7XG5cdFx0XHRcdGlzc3VlcjogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbScsXG5cdFx0XHRcdHJlZ2lzdHJhdGlvbl9lbmRwb2ludDogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS9yZWdpc3RlcicsXG5cdFx0XHRcdHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJ11cblx0XHRcdFx0Ly8gTm8gZ3JhbnRfdHlwZXNfc3VwcG9ydGVkIHNwZWNpZmllZFxuXHRcdFx0fTtcblxuXHRcdFx0YXdhaXQgZmV0Y2hEeW5hbWljUmVnaXN0cmF0aW9uKHNlcnZlck1ldGFkYXRhLCAnVGVzdCBDbGllbnQnKTtcblxuXHRcdFx0Ly8gVmVyaWZ5IGZldGNoIHdhcyBjYWxsZWQgY29ycmVjdGx5XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmV0Y2hTdHViLmNhbGxDb3VudCwgMSk7XG5cdFx0XHRjb25zdCBbLCBvcHRpb25zXSA9IGZldGNoU3R1Yi5maXJzdENhbGwuYXJncztcblxuXHRcdFx0Ly8gVmVyaWZ5IHJlcXVlc3QgYm9keSBjb250YWlucyBkZWZhdWx0IGdyYW50IHR5cGVzXG5cdFx0XHRjb25zdCByZXF1ZXN0Qm9keSA9IEpTT04ucGFyc2Uob3B0aW9ucy5ib2R5IGFzIHN0cmluZyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlcXVlc3RCb2R5LmdyYW50X3R5cGVzLCBbJ2F1dGhvcml6YXRpb25fY29kZScsICdyZWZyZXNoX3Rva2VuJywgJ3VybjppZXRmOnBhcmFtczpvYXV0aDpncmFudC10eXBlOmRldmljZV9jb2RlJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmV0Y2hEeW5hbWljUmVnaXN0cmF0aW9uIHNob3VsZCB0aHJvdyBlcnJvciB3aGVuIHJlZ2lzdHJhdGlvbiBlbmRwb2ludCBpcyBtaXNzaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VydmVyTWV0YWRhdGE6IElBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEgPSB7XG5cdFx0XHRcdGlzc3VlcjogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbScsXG5cdFx0XHRcdHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJ11cblx0XHRcdFx0Ly8gcmVnaXN0cmF0aW9uX2VuZHBvaW50IGlzIG1pc3Npbmdcblx0XHRcdH07XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0XHRhc3luYyAoKSA9PiBhd2FpdCBmZXRjaER5bmFtaWNSZWdpc3RyYXRpb24oc2VydmVyTWV0YWRhdGEsICdUZXN0IENsaWVudCcpLFxuXHRcdFx0XHQvU2VydmVyIGRvZXMgbm90IHN1cHBvcnQgZHluYW1pYyByZWdpc3RyYXRpb24vXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmV0Y2hEeW5hbWljUmVnaXN0cmF0aW9uIHNob3VsZCBoYW5kbGUgc3RydWN0dXJlZCBlcnJvciByZXNwb25zZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGVycm9yUmVzcG9uc2UgPSB7XG5cdFx0XHRcdGVycm9yOiAnaW52YWxpZF9jbGllbnRfbWV0YWRhdGEnLFxuXHRcdFx0XHRlcnJvcl9kZXNjcmlwdGlvbjogJ1RoZSBjbGllbnQgbWV0YWRhdGEgaXMgaW52YWxpZCdcblx0XHRcdH07XG5cblx0XHRcdGZldGNoU3R1Yi5yZXNvbHZlcyh7XG5cdFx0XHRcdG9rOiBmYWxzZSxcblx0XHRcdFx0dGV4dDogYXN5bmMgKCkgPT4gSlNPTi5zdHJpbmdpZnkoZXJyb3JSZXNwb25zZSlcblx0XHRcdH0gYXMgUmVzcG9uc2UpO1xuXG5cdFx0XHRjb25zdCBzZXJ2ZXJNZXRhZGF0YTogSUF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSA9IHtcblx0XHRcdFx0aXNzdWVyOiAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tJyxcblx0XHRcdFx0cmVnaXN0cmF0aW9uX2VuZHBvaW50OiAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tL3JlZ2lzdGVyJyxcblx0XHRcdFx0cmVzcG9uc2VfdHlwZXNfc3VwcG9ydGVkOiBbJ2NvZGUnXVxuXHRcdFx0fTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRcdGFzeW5jICgpID0+IGF3YWl0IGZldGNoRHluYW1pY1JlZ2lzdHJhdGlvbihzZXJ2ZXJNZXRhZGF0YSwgJ1Rlc3QgQ2xpZW50JyksXG5cdFx0XHRcdC9SZWdpc3RyYXRpb24gdG8gaHR0cHM6XFwvXFwvYXV0aFxcLmV4YW1wbGVcXC5jb21cXC9yZWdpc3RlciBmYWlsZWQ6IGludmFsaWRfY2xpZW50X21ldGFkYXRhOiBUaGUgY2xpZW50IG1ldGFkYXRhIGlzIGludmFsaWQvXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmV0Y2hEeW5hbWljUmVnaXN0cmF0aW9uIHNob3VsZCBoYW5kbGUgc3RydWN0dXJlZCBlcnJvciByZXNwb25zZSB3aXRob3V0IGRlc2NyaXB0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXJyb3JSZXNwb25zZSA9IHtcblx0XHRcdFx0ZXJyb3I6ICdpbnZhbGlkX3JlZGlyZWN0X3VyaSdcblx0XHRcdH07XG5cblx0XHRcdGZldGNoU3R1Yi5yZXNvbHZlcyh7XG5cdFx0XHRcdG9rOiBmYWxzZSxcblx0XHRcdFx0dGV4dDogYXN5bmMgKCkgPT4gSlNPTi5zdHJpbmdpZnkoZXJyb3JSZXNwb25zZSlcblx0XHRcdH0gYXMgUmVzcG9uc2UpO1xuXG5cdFx0XHRjb25zdCBzZXJ2ZXJNZXRhZGF0YTogSUF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSA9IHtcblx0XHRcdFx0aXNzdWVyOiAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tJyxcblx0XHRcdFx0cmVnaXN0cmF0aW9uX2VuZHBvaW50OiAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tL3JlZ2lzdGVyJyxcblx0XHRcdFx0cmVzcG9uc2VfdHlwZXNfc3VwcG9ydGVkOiBbJ2NvZGUnXVxuXHRcdFx0fTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRcdGFzeW5jICgpID0+IGF3YWl0IGZldGNoRHluYW1pY1JlZ2lzdHJhdGlvbihzZXJ2ZXJNZXRhZGF0YSwgJ1Rlc3QgQ2xpZW50JyksXG5cdFx0XHRcdC9SZWdpc3RyYXRpb24gdG8gaHR0cHM6XFwvXFwvYXV0aFxcLmV4YW1wbGVcXC5jb21cXC9yZWdpc3RlciBmYWlsZWQ6IGludmFsaWRfcmVkaXJlY3RfdXJpL1xuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZldGNoRHluYW1pY1JlZ2lzdHJhdGlvbiBzaG91bGQgaGFuZGxlIG1hbGZvcm1lZCBKU09OIGVycm9yIHJlc3BvbnNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZmV0Y2hTdHViLnJlc29sdmVzKHtcblx0XHRcdFx0b2s6IGZhbHNlLFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiAnSW52YWxpZCBKU09OIHsnXG5cdFx0XHR9IGFzIFJlc3BvbnNlKTtcblxuXHRcdFx0Y29uc3Qgc2VydmVyTWV0YWRhdGE6IElBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEgPSB7XG5cdFx0XHRcdGlzc3VlcjogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbScsXG5cdFx0XHRcdHJlZ2lzdHJhdGlvbl9lbmRwb2ludDogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS9yZWdpc3RlcicsXG5cdFx0XHRcdHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJ11cblx0XHRcdH07XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0XHRhc3luYyAoKSA9PiBhd2FpdCBmZXRjaER5bmFtaWNSZWdpc3RyYXRpb24oc2VydmVyTWV0YWRhdGEsICdUZXN0IENsaWVudCcpLFxuXHRcdFx0XHQvUmVnaXN0cmF0aW9uIHRvIGh0dHBzOlxcL1xcL2F1dGhcXC5leGFtcGxlXFwuY29tXFwvcmVnaXN0ZXIgZmFpbGVkOiBJbnZhbGlkIEpTT04gXFx7L1xuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZldGNoRHluYW1pY1JlZ2lzdHJhdGlvbiBzaG91bGQgaW5jbHVkZSBzY29wZXMgaW4gcmVxdWVzdCB3aGVuIHByb3ZpZGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9ja1Jlc3BvbnNlID0ge1xuXHRcdFx0XHRjbGllbnRfaWQ6ICdnZW5lcmF0ZWQtY2xpZW50LWlkJyxcblx0XHRcdFx0Y2xpZW50X25hbWU6ICdUZXN0IENsaWVudCdcblx0XHRcdH07XG5cblx0XHRcdGZldGNoU3R1Yi5yZXNvbHZlcyh7XG5cdFx0XHRcdG9rOiB0cnVlLFxuXHRcdFx0XHRqc29uOiBhc3luYyAoKSA9PiBtb2NrUmVzcG9uc2Vcblx0XHRcdH0gYXMgUmVzcG9uc2UpO1xuXG5cdFx0XHRjb25zdCBzZXJ2ZXJNZXRhZGF0YTogSUF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSA9IHtcblx0XHRcdFx0aXNzdWVyOiAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tJyxcblx0XHRcdFx0cmVnaXN0cmF0aW9uX2VuZHBvaW50OiAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tL3JlZ2lzdGVyJyxcblx0XHRcdFx0cmVzcG9uc2VfdHlwZXNfc3VwcG9ydGVkOiBbJ2NvZGUnXVxuXHRcdFx0fTtcblxuXHRcdFx0YXdhaXQgZmV0Y2hEeW5hbWljUmVnaXN0cmF0aW9uKHNlcnZlck1ldGFkYXRhLCAnVGVzdCBDbGllbnQnLCBbJ3JlYWQnLCAnd3JpdGUnXSk7XG5cblx0XHRcdC8vIFZlcmlmeSByZXF1ZXN0IGluY2x1ZGVzIHNjb3Blc1xuXHRcdFx0Y29uc3QgWywgb3B0aW9uc10gPSBmZXRjaFN0dWIuZmlyc3RDYWxsLmFyZ3M7XG5cdFx0XHRjb25zdCByZXF1ZXN0Qm9keSA9IEpTT04ucGFyc2Uob3B0aW9ucy5ib2R5IGFzIHN0cmluZyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVxdWVzdEJvZHkuc2NvcGUsICdyZWFkIHdyaXRlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmZXRjaER5bmFtaWNSZWdpc3RyYXRpb24gc2hvdWxkIG9taXQgc2NvcGUgZnJvbSByZXF1ZXN0IHdoZW4gbm90IHByb3ZpZGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9ja1Jlc3BvbnNlID0ge1xuXHRcdFx0XHRjbGllbnRfaWQ6ICdnZW5lcmF0ZWQtY2xpZW50LWlkJyxcblx0XHRcdFx0Y2xpZW50X25hbWU6ICdUZXN0IENsaWVudCdcblx0XHRcdH07XG5cblx0XHRcdGZldGNoU3R1Yi5yZXNvbHZlcyh7XG5cdFx0XHRcdG9rOiB0cnVlLFxuXHRcdFx0XHRqc29uOiBhc3luYyAoKSA9PiBtb2NrUmVzcG9uc2Vcblx0XHRcdH0gYXMgUmVzcG9uc2UpO1xuXG5cdFx0XHRjb25zdCBzZXJ2ZXJNZXRhZGF0YTogSUF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSA9IHtcblx0XHRcdFx0aXNzdWVyOiAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tJyxcblx0XHRcdFx0cmVnaXN0cmF0aW9uX2VuZHBvaW50OiAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tL3JlZ2lzdGVyJyxcblx0XHRcdFx0cmVzcG9uc2VfdHlwZXNfc3VwcG9ydGVkOiBbJ2NvZGUnXVxuXHRcdFx0fTtcblxuXHRcdFx0YXdhaXQgZmV0Y2hEeW5hbWljUmVnaXN0cmF0aW9uKHNlcnZlck1ldGFkYXRhLCAnVGVzdCBDbGllbnQnKTtcblxuXHRcdFx0Ly8gVmVyaWZ5IHJlcXVlc3QgZG9lcyBub3QgaW5jbHVkZSBzY29wZSB3aGVuIG5vdCBwcm92aWRlZFxuXHRcdFx0Y29uc3QgWywgb3B0aW9uc10gPSBmZXRjaFN0dWIuZmlyc3RDYWxsLmFyZ3M7XG5cdFx0XHRjb25zdCByZXF1ZXN0Qm9keSA9IEpTT04ucGFyc2Uob3B0aW9ucy5ib2R5IGFzIHN0cmluZyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVxdWVzdEJvZHkuc2NvcGUsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmZXRjaER5bmFtaWNSZWdpc3RyYXRpb24gc2hvdWxkIGhhbmRsZSBlbXB0eSBzY29wZXMgYXJyYXknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2NrUmVzcG9uc2UgPSB7XG5cdFx0XHRcdGNsaWVudF9pZDogJ2dlbmVyYXRlZC1jbGllbnQtaWQnLFxuXHRcdFx0XHRjbGllbnRfbmFtZTogJ1Rlc3QgQ2xpZW50J1xuXHRcdFx0fTtcblxuXHRcdFx0ZmV0Y2hTdHViLnJlc29sdmVzKHtcblx0XHRcdFx0b2s6IHRydWUsXG5cdFx0XHRcdGpzb246IGFzeW5jICgpID0+IG1vY2tSZXNwb25zZVxuXHRcdFx0fSBhcyBSZXNwb25zZSk7XG5cblx0XHRcdGNvbnN0IHNlcnZlck1ldGFkYXRhOiBJQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhID0ge1xuXHRcdFx0XHRpc3N1ZXI6ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20nLFxuXHRcdFx0XHRyZWdpc3RyYXRpb25fZW5kcG9pbnQ6ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vcmVnaXN0ZXInLFxuXHRcdFx0XHRyZXNwb25zZV90eXBlc19zdXBwb3J0ZWQ6IFsnY29kZSddXG5cdFx0XHR9O1xuXG5cdFx0XHRhd2FpdCBmZXRjaER5bmFtaWNSZWdpc3RyYXRpb24oc2VydmVyTWV0YWRhdGEsICdUZXN0IENsaWVudCcsIFtdKTtcblxuXHRcdFx0Ly8gVmVyaWZ5IHJlcXVlc3QgaW5jbHVkZXMgZW1wdHkgc2NvcGVcblx0XHRcdGNvbnN0IFssIG9wdGlvbnNdID0gZmV0Y2hTdHViLmZpcnN0Q2FsbC5hcmdzO1xuXHRcdFx0Y29uc3QgcmVxdWVzdEJvZHkgPSBKU09OLnBhcnNlKG9wdGlvbnMuYm9keSBhcyBzdHJpbmcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcXVlc3RCb2R5LnNjb3BlLCAnJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmZXRjaER5bmFtaWNSZWdpc3RyYXRpb24gc2hvdWxkIGhhbmRsZSBuZXR3b3JrIGZldGNoIGZhaWx1cmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRmZXRjaFN0dWIucmVqZWN0cyhuZXcgRXJyb3IoJ05ldHdvcmsgZXJyb3InKSk7XG5cblx0XHRcdGNvbnN0IHNlcnZlck1ldGFkYXRhOiBJQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhID0ge1xuXHRcdFx0XHRpc3N1ZXI6ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20nLFxuXHRcdFx0XHRyZWdpc3RyYXRpb25fZW5kcG9pbnQ6ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vcmVnaXN0ZXInLFxuXHRcdFx0XHRyZXNwb25zZV90eXBlc19zdXBwb3J0ZWQ6IFsnY29kZSddXG5cdFx0XHR9O1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdFx0YXN5bmMgKCkgPT4gYXdhaXQgZmV0Y2hEeW5hbWljUmVnaXN0cmF0aW9uKHNlcnZlck1ldGFkYXRhLCAnVGVzdCBDbGllbnQnKSxcblx0XHRcdFx0L05ldHdvcmsgZXJyb3IvXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmV0Y2hEeW5hbWljUmVnaXN0cmF0aW9uIHNob3VsZCBoYW5kbGUgcmVzcG9uc2UuanNvbigpIGZhaWx1cmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRmZXRjaFN0dWIucmVzb2x2ZXMoe1xuXHRcdFx0XHRvazogdHJ1ZSxcblx0XHRcdFx0anNvbjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignSlNPTiBwYXJzaW5nIGZhaWxlZCcpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGFzIHVua25vd24gYXMgUmVzcG9uc2UpO1xuXG5cdFx0XHRjb25zdCBzZXJ2ZXJNZXRhZGF0YTogSUF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSA9IHtcblx0XHRcdFx0aXNzdWVyOiAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tJyxcblx0XHRcdFx0cmVnaXN0cmF0aW9uX2VuZHBvaW50OiAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tL3JlZ2lzdGVyJyxcblx0XHRcdFx0cmVzcG9uc2VfdHlwZXNfc3VwcG9ydGVkOiBbJ2NvZGUnXVxuXHRcdFx0fTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRcdGFzeW5jICgpID0+IGF3YWl0IGZldGNoRHluYW1pY1JlZ2lzdHJhdGlvbihzZXJ2ZXJNZXRhZGF0YSwgJ1Rlc3QgQ2xpZW50JyksXG5cdFx0XHRcdC9KU09OIHBhcnNpbmcgZmFpbGVkL1xuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZldGNoRHluYW1pY1JlZ2lzdHJhdGlvbiBzaG91bGQgaGFuZGxlIHJlc3BvbnNlLnRleHQoKSBmYWlsdXJlIGZvciBlcnJvciBjYXNlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGZldGNoU3R1Yi5yZXNvbHZlcyh7XG5cdFx0XHRcdG9rOiBmYWxzZSxcblx0XHRcdFx0dGV4dDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignVGV4dCBwYXJzaW5nIGZhaWxlZCcpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGFzIHVua25vd24gYXMgUmVzcG9uc2UpO1xuXG5cdFx0XHRjb25zdCBzZXJ2ZXJNZXRhZGF0YTogSUF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSA9IHtcblx0XHRcdFx0aXNzdWVyOiAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tJyxcblx0XHRcdFx0cmVnaXN0cmF0aW9uX2VuZHBvaW50OiAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tL3JlZ2lzdGVyJyxcblx0XHRcdFx0cmVzcG9uc2VfdHlwZXNfc3VwcG9ydGVkOiBbJ2NvZGUnXVxuXHRcdFx0fTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRcdGFzeW5jICgpID0+IGF3YWl0IGZldGNoRHluYW1pY1JlZ2lzdHJhdGlvbihzZXJ2ZXJNZXRhZGF0YSwgJ1Rlc3QgQ2xpZW50JyksXG5cdFx0XHRcdC9UZXh0IHBhcnNpbmcgZmFpbGVkL1xuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0NsaWVudCBJRCBGYWxsYmFjayBTY2VuYXJpb3MnLCAoKSA9PiB7XG5cdFx0bGV0IHNhbmRib3g6IHNpbm9uLlNpbm9uU2FuZGJveDtcblx0XHRsZXQgZmV0Y2hTdHViOiBzaW5vbi5TaW5vblN0dWI7XG5cblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRzYW5kYm94ID0gc2lub24uY3JlYXRlU2FuZGJveCgpO1xuXHRcdFx0ZmV0Y2hTdHViID0gc2FuZGJveC5zdHViKGdsb2JhbFRoaXMsICdmZXRjaCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdFx0c2FuZGJveC5yZXN0b3JlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmZXRjaER5bmFtaWNSZWdpc3RyYXRpb24gc2hvdWxkIHRocm93IHNwZWNpZmljIGVycm9yIGZvciBtaXNzaW5nIHJlZ2lzdHJhdGlvbiBlbmRwb2ludCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlcnZlck1ldGFkYXRhOiBJQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhID0ge1xuXHRcdFx0XHRpc3N1ZXI6ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20nLFxuXHRcdFx0XHRyZXNwb25zZV90eXBlc19zdXBwb3J0ZWQ6IFsnY29kZSddXG5cdFx0XHRcdC8vIHJlZ2lzdHJhdGlvbl9lbmRwb2ludCBpcyBtaXNzaW5nXG5cdFx0XHR9O1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdFx0YXN5bmMgKCkgPT4gYXdhaXQgZmV0Y2hEeW5hbWljUmVnaXN0cmF0aW9uKHNlcnZlck1ldGFkYXRhLCAnVGVzdCBDbGllbnQnKSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG1lc3NhZ2U6ICdTZXJ2ZXIgZG9lcyBub3Qgc3VwcG9ydCBkeW5hbWljIHJlZ2lzdHJhdGlvbidcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZldGNoRHluYW1pY1JlZ2lzdHJhdGlvbiBzaG91bGQgdGhyb3cgc3BlY2lmaWMgZXJyb3IgZm9yIERDUiBmYWlsdXJlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZmV0Y2hTdHViLnJlc29sdmVzKHtcblx0XHRcdFx0b2s6IGZhbHNlLFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiAnRENSIG5vdCBzdXBwb3J0ZWQnXG5cdFx0XHR9IGFzIFJlc3BvbnNlKTtcblxuXHRcdFx0Y29uc3Qgc2VydmVyTWV0YWRhdGE6IElBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEgPSB7XG5cdFx0XHRcdGlzc3VlcjogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbScsXG5cdFx0XHRcdHJlZ2lzdHJhdGlvbl9lbmRwb2ludDogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS9yZWdpc3RlcicsXG5cdFx0XHRcdHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJ11cblx0XHRcdH07XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0XHRhc3luYyAoKSA9PiBhd2FpdCBmZXRjaER5bmFtaWNSZWdpc3RyYXRpb24oc2VydmVyTWV0YWRhdGEsICdUZXN0IENsaWVudCcpLFxuXHRcdFx0XHQvUmVnaXN0cmF0aW9uIHRvIGh0dHBzOlxcL1xcL2F1dGhcXC5leGFtcGxlXFwuY29tXFwvcmVnaXN0ZXIgZmFpbGVkOiBEQ1Igbm90IHN1cHBvcnRlZC9cblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdmZXRjaFJlc291cmNlTWV0YWRhdGEnLCAoKSA9PiB7XG5cdFx0bGV0IHNhbmRib3g6IHNpbm9uLlNpbm9uU2FuZGJveDtcblx0XHRsZXQgZmV0Y2hTdHViOiBzaW5vbi5TaW5vblN0dWI7XG5cblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRzYW5kYm94ID0gc2lub24uY3JlYXRlU2FuZGJveCgpO1xuXHRcdFx0ZmV0Y2hTdHViID0gc2FuZGJveC5zdHViKCk7XG5cdFx0fSk7XG5cblx0XHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0XHRzYW5kYm94LnJlc3RvcmUoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBzdWNjZXNzZnVsbHkgZmV0Y2ggYW5kIHZhbGlkYXRlIHJlc291cmNlIG1ldGFkYXRhJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0UmVzb3VyY2UgPSAnaHR0cHM6Ly9leGFtcGxlLmNvbS9hcGknO1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VNZXRhZGF0YVVybCA9ICdodHRwczovL2V4YW1wbGUuY29tLy53ZWxsLWtub3duL29hdXRoLXByb3RlY3RlZC1yZXNvdXJjZSc7XG5cdFx0XHRjb25zdCBleHBlY3RlZE1ldGFkYXRhID0ge1xuXHRcdFx0XHRyZXNvdXJjZTogJ2h0dHBzOi8vZXhhbXBsZS5jb20vYXBpJyxcblx0XHRcdFx0c2NvcGVzX3N1cHBvcnRlZDogWydyZWFkJywgJ3dyaXRlJ11cblx0XHRcdH07XG5cblx0XHRcdGZldGNoU3R1Yi5yZXNvbHZlcyh7XG5cdFx0XHRcdHN0YXR1czogMjAwLFxuXHRcdFx0XHRqc29uOiBhc3luYyAoKSA9PiBleHBlY3RlZE1ldGFkYXRhLFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiBKU09OLnN0cmluZ2lmeShleHBlY3RlZE1ldGFkYXRhKVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZldGNoUmVzb3VyY2VNZXRhZGF0YShcblx0XHRcdFx0dGFyZ2V0UmVzb3VyY2UsXG5cdFx0XHRcdHJlc291cmNlTWV0YWRhdGFVcmwsXG5cdFx0XHRcdHsgZmV0Y2g6IGZldGNoU3R1YiB9XG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tZXRhZGF0YSwgZXhwZWN0ZWRNZXRhZGF0YSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmRpc2NvdmVyeVVybCwgcmVzb3VyY2VNZXRhZGF0YVVybCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5lcnJvcnMsIFtdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmZXRjaFN0dWIuY2FsbENvdW50LCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmZXRjaFN0dWIuZmlyc3RDYWxsLmFyZ3NbMF0sIHJlc291cmNlTWV0YWRhdGFVcmwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZldGNoU3R1Yi5maXJzdENhbGwuYXJnc1sxXS5tZXRob2QsICdHRVQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmZXRjaFN0dWIuZmlyc3RDYWxsLmFyZ3NbMV0uaGVhZGVyc1snQWNjZXB0J10sICdhcHBsaWNhdGlvbi9qc29uJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaW5jbHVkZSBzYW1lLW9yaWdpbiBoZWFkZXJzIHdoZW4gb3JpZ2lucyBtYXRjaCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldFJlc291cmNlID0gJ2h0dHBzOi8vZXhhbXBsZS5jb20vYXBpJztcblx0XHRcdGNvbnN0IHJlc291cmNlTWV0YWRhdGFVcmwgPSAnaHR0cHM6Ly9leGFtcGxlLmNvbS8ud2VsbC1rbm93bi9vYXV0aC1wcm90ZWN0ZWQtcmVzb3VyY2UnO1xuXHRcdFx0Y29uc3Qgc2FtZU9yaWdpbkhlYWRlcnMgPSB7XG5cdFx0XHRcdCdYLVRlc3QtSGVhZGVyJzogJ3Rlc3QtdmFsdWUnLFxuXHRcdFx0XHQnWC1DdXN0b20tSGVhZGVyJzogJ3ZhbHVlJ1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGV4cGVjdGVkTWV0YWRhdGEgPSB7XG5cdFx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9hcGknXG5cdFx0XHR9O1xuXG5cdFx0XHRmZXRjaFN0dWIucmVzb2x2ZXMoe1xuXHRcdFx0XHRzdGF0dXM6IDIwMCxcblx0XHRcdFx0anNvbjogYXN5bmMgKCkgPT4gZXhwZWN0ZWRNZXRhZGF0YSxcblx0XHRcdFx0dGV4dDogYXN5bmMgKCkgPT4gSlNPTi5zdHJpbmdpZnkoZXhwZWN0ZWRNZXRhZGF0YSlcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBmZXRjaFJlc291cmNlTWV0YWRhdGEoXG5cdFx0XHRcdHRhcmdldFJlc291cmNlLFxuXHRcdFx0XHRyZXNvdXJjZU1ldGFkYXRhVXJsLFxuXHRcdFx0XHR7IGZldGNoOiBmZXRjaFN0dWIsIHNhbWVPcmlnaW5IZWFkZXJzIH1cblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZGlzY292ZXJ5VXJsLCByZXNvdXJjZU1ldGFkYXRhVXJsKTtcblx0XHRcdGNvbnN0IGhlYWRlcnMgPSBmZXRjaFN0dWIuZmlyc3RDYWxsLmFyZ3NbMV0uaGVhZGVycztcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWydBY2NlcHQnXSwgJ2FwcGxpY2F0aW9uL2pzb24nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWydYLVRlc3QtSGVhZGVyJ10sICd0ZXN0LXZhbHVlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1snWC1DdXN0b20tSGVhZGVyJ10sICd2YWx1ZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBpbmNsdWRlIHNhbWUtb3JpZ2luIGhlYWRlcnMgd2hlbiBvcmlnaW5zIGRpZmZlcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldFJlc291cmNlID0gJ2h0dHBzOi8vZXhhbXBsZS5jb20vYXBpJztcblx0XHRcdGNvbnN0IHJlc291cmNlTWV0YWRhdGFVcmwgPSAnaHR0cHM6Ly9vdGhlci1kb21haW4uY29tLy53ZWxsLWtub3duL29hdXRoLXByb3RlY3RlZC1yZXNvdXJjZSc7XG5cdFx0XHRjb25zdCBzYW1lT3JpZ2luSGVhZGVycyA9IHtcblx0XHRcdFx0J1gtVGVzdC1IZWFkZXInOiAndGVzdC12YWx1ZSdcblx0XHRcdH07XG5cdFx0XHRjb25zdCBleHBlY3RlZE1ldGFkYXRhID0ge1xuXHRcdFx0XHRyZXNvdXJjZTogJ2h0dHBzOi8vZXhhbXBsZS5jb20vYXBpJ1xuXHRcdFx0fTtcblxuXHRcdFx0ZmV0Y2hTdHViLnJlc29sdmVzKHtcblx0XHRcdFx0c3RhdHVzOiAyMDAsXG5cdFx0XHRcdGpzb246IGFzeW5jICgpID0+IGV4cGVjdGVkTWV0YWRhdGEsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+IEpTT04uc3RyaW5naWZ5KGV4cGVjdGVkTWV0YWRhdGEpXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZmV0Y2hSZXNvdXJjZU1ldGFkYXRhKFxuXHRcdFx0XHR0YXJnZXRSZXNvdXJjZSxcblx0XHRcdFx0cmVzb3VyY2VNZXRhZGF0YVVybCxcblx0XHRcdFx0eyBmZXRjaDogZmV0Y2hTdHViLCBzYW1lT3JpZ2luSGVhZGVycyB9XG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmRpc2NvdmVyeVVybCwgcmVzb3VyY2VNZXRhZGF0YVVybCk7XG5cdFx0XHRjb25zdCBoZWFkZXJzID0gZmV0Y2hTdHViLmZpcnN0Q2FsbC5hcmdzWzFdLmhlYWRlcnM7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1snQWNjZXB0J10sICdhcHBsaWNhdGlvbi9qc29uJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1snWC1UZXN0LUhlYWRlciddLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHRocm93IGVycm9yIHdoZW4gZmV0Y2ggcmV0dXJucyBub24tMjAwIHN0YXR1cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldFJlc291cmNlID0gJ2h0dHBzOi8vZXhhbXBsZS5jb20vYXBpJztcblx0XHRcdGNvbnN0IHJlc291cmNlTWV0YWRhdGFVcmwgPSAnaHR0cHM6Ly9leGFtcGxlLmNvbS8ud2VsbC1rbm93bi9vYXV0aC1wcm90ZWN0ZWQtcmVzb3VyY2UnO1xuXG5cdFx0XHQvLyBTdHViIGFsbCBwb3NzaWJsZSBVUkxzIHRvIHJldHVybiA0MDQgZm9yIHJvYnVzdCBmYWxsYmFjayB0ZXN0aW5nXG5cdFx0XHRmZXRjaFN0dWIucmVzb2x2ZXMoe1xuXHRcdFx0XHRzdGF0dXM6IDQwNCxcblx0XHRcdFx0dGV4dDogYXN5bmMgKCkgPT4gJ05vdCBGb3VuZCdcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdFx0YXN5bmMgKCkgPT4gZmV0Y2hSZXNvdXJjZU1ldGFkYXRhKHRhcmdldFJlc291cmNlLCByZXNvdXJjZU1ldGFkYXRhVXJsLCB7IGZldGNoOiBmZXRjaFN0dWIgfSksXG5cdFx0XHRcdChlcnJvcjogYW55KSA9PiB7XG5cdFx0XHRcdFx0Ly8gU2hvdWxkIGJlIEFnZ3JlZ2F0ZUVycm9yIHNpbmNlIGFsbCBVUkxzIGZhaWxcblx0XHRcdFx0XHRhc3NlcnQub2soZXJyb3IgaW5zdGFuY2VvZiBBZ2dyZWdhdGVFcnJvciB8fCAvRmFpbGVkIHRvIGZldGNoIHJlc291cmNlIG1ldGFkYXRhIGZyb20uKjQwNCBOb3QgRm91bmQvLnRlc3QoZXJyb3IubWVzc2FnZSkpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBlcnJvciB3aGVuIHJlc3BvbnNlLnRleHQoKSB0aHJvd3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXRSZXNvdXJjZSA9ICdodHRwczovL2V4YW1wbGUuY29tL2FwaSc7XG5cdFx0XHRjb25zdCByZXNvdXJjZU1ldGFkYXRhVXJsID0gJ2h0dHBzOi8vZXhhbXBsZS5jb20vLndlbGwta25vd24vb2F1dGgtcHJvdGVjdGVkLXJlc291cmNlJztcblxuXHRcdFx0Ly8gU3R1YiBhbGwgcG9zc2libGUgVVJMcyB0byByZXR1cm4gNTAwIGZvciByb2J1c3QgZmFsbGJhY2sgdGVzdGluZ1xuXHRcdFx0ZmV0Y2hTdHViLnJlc29sdmVzKHtcblx0XHRcdFx0c3RhdHVzOiA1MDAsXG5cdFx0XHRcdHN0YXR1c1RleHQ6ICdJbnRlcm5hbCBTZXJ2ZXIgRXJyb3InLFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignQ2Fubm90IHJlYWQgcmVzcG9uc2UnKTsgfVxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0XHRhc3luYyAoKSA9PiBmZXRjaFJlc291cmNlTWV0YWRhdGEodGFyZ2V0UmVzb3VyY2UsIHJlc291cmNlTWV0YWRhdGFVcmwsIHsgZmV0Y2g6IGZldGNoU3R1YiB9KSxcblx0XHRcdFx0KGVycm9yOiBhbnkpID0+IHtcblx0XHRcdFx0XHQvLyBTaG91bGQgYmUgQWdncmVnYXRlRXJyb3Igc2luY2UgYWxsIFVSTHMgZmFpbFxuXHRcdFx0XHRcdGFzc2VydC5vayhlcnJvciBpbnN0YW5jZW9mIEFnZ3JlZ2F0ZUVycm9yIHx8IC9GYWlsZWQgdG8gZmV0Y2ggcmVzb3VyY2UgbWV0YWRhdGEgZnJvbS4qNTAwIEludGVybmFsIFNlcnZlciBFcnJvci8udGVzdChlcnJvci5tZXNzYWdlKSk7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgdGhyb3cgZXJyb3Igd2hlbiByZXNvdXJjZSBwcm9wZXJ0eSBkb2VzIG5vdCBtYXRjaCB0YXJnZXQgcmVzb3VyY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXRSZXNvdXJjZSA9ICdodHRwczovL2V4YW1wbGUuY29tL2FwaSc7XG5cdFx0XHRjb25zdCByZXNvdXJjZU1ldGFkYXRhVXJsID0gJ2h0dHBzOi8vZXhhbXBsZS5jb20vLndlbGwta25vd24vb2F1dGgtcHJvdGVjdGVkLXJlc291cmNlJztcblx0XHRcdGNvbnN0IG1ldGFkYXRhID0ge1xuXHRcdFx0XHRyZXNvdXJjZTogJ2h0dHBzOi8vZGlmZmVyZW50LmNvbS9hcGknXG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBTdHViIGFsbCBwb3NzaWJsZSBVUkxzIHRvIHJldHVybiBpbnZhbGlkIG1ldGFkYXRhIGZvciByb2J1c3QgZmFsbGJhY2sgdGVzdGluZ1xuXHRcdFx0ZmV0Y2hTdHViLnJlc29sdmVzKHtcblx0XHRcdFx0c3RhdHVzOiAyMDAsXG5cdFx0XHRcdGpzb246IGFzeW5jICgpID0+IG1ldGFkYXRhLFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiBKU09OLnN0cmluZ2lmeShtZXRhZGF0YSlcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdFx0YXN5bmMgKCkgPT4gZmV0Y2hSZXNvdXJjZU1ldGFkYXRhKHRhcmdldFJlc291cmNlLCByZXNvdXJjZU1ldGFkYXRhVXJsLCB7IGZldGNoOiBmZXRjaFN0dWIgfSksXG5cdFx0XHRcdChlcnJvcjogYW55KSA9PiB7XG5cdFx0XHRcdFx0Ly8gU2hvdWxkIGJlIEFnZ3JlZ2F0ZUVycm9yIHNpbmNlIGFsbCBVUkxzIGZhaWwgdmFsaWRhdGlvblxuXHRcdFx0XHRcdGFzc2VydC5vayhlcnJvciBpbnN0YW5jZW9mIEFnZ3JlZ2F0ZUVycm9yKTtcblx0XHRcdFx0XHRhc3NlcnQub2soZXJyb3IuZXJyb3JzLnNvbWUoKGU6IEVycm9yKSA9PiAvZG9lcyBub3QgbWF0Y2ggZXhwZWN0ZWQgdmFsdWUvLnRlc3QoZS5tZXNzYWdlKSkpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vcm1hbGl6ZSBVUkxzIHdoZW4gY29tcGFyaW5nIHJlc291cmNlIHZhbHVlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldFJlc291cmNlID0gJ2h0dHBzOi8vRVhBTVBMRS5DT00vYXBpJztcblx0XHRcdGNvbnN0IHJlc291cmNlTWV0YWRhdGFVcmwgPSAnaHR0cHM6Ly9leGFtcGxlLmNvbS8ud2VsbC1rbm93bi9vYXV0aC1wcm90ZWN0ZWQtcmVzb3VyY2UnO1xuXHRcdFx0Y29uc3QgbWV0YWRhdGEgPSB7XG5cdFx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9hcGknXG5cdFx0XHR9O1xuXG5cdFx0XHRmZXRjaFN0dWIucmVzb2x2ZXMoe1xuXHRcdFx0XHRzdGF0dXM6IDIwMCxcblx0XHRcdFx0anNvbjogYXN5bmMgKCkgPT4gbWV0YWRhdGEsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+IEpTT04uc3RyaW5naWZ5KG1ldGFkYXRhKVxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFVSTCBub3JtYWxpemF0aW9uIHNob3VsZCBoYW5kbGUgaG9zdG5hbWUgY2FzZSBkaWZmZXJlbmNlc1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZmV0Y2hSZXNvdXJjZU1ldGFkYXRhKHRhcmdldFJlc291cmNlLCByZXNvdXJjZU1ldGFkYXRhVXJsLCB7IGZldGNoOiBmZXRjaFN0dWIgfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tZXRhZGF0YSwgbWV0YWRhdGEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5kaXNjb3ZlcnlVcmwsIHJlc291cmNlTWV0YWRhdGFVcmwpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHRocm93IGVycm9yIHdoZW4gcmVzcG9uc2UgaXMgbm90IHZhbGlkIHJlc291cmNlIG1ldGFkYXRhJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0UmVzb3VyY2UgPSAnaHR0cHM6Ly9leGFtcGxlLmNvbS9hcGknO1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VNZXRhZGF0YVVybCA9ICdodHRwczovL2V4YW1wbGUuY29tLy53ZWxsLWtub3duL29hdXRoLXByb3RlY3RlZC1yZXNvdXJjZSc7XG5cdFx0XHRjb25zdCBpbnZhbGlkTWV0YWRhdGEgPSB7XG5cdFx0XHRcdC8vIE1pc3NpbmcgcmVxdWlyZWQgJ3Jlc291cmNlJyBwcm9wZXJ0eVxuXHRcdFx0XHRzY29wZXNfc3VwcG9ydGVkOiBbJ3JlYWQnLCAnd3JpdGUnXVxuXHRcdFx0fTtcblxuXHRcdFx0Ly8gU3R1YiBhbGwgcG9zc2libGUgVVJMcyB0byByZXR1cm4gaW52YWxpZCBtZXRhZGF0YSBmb3Igcm9idXN0IGZhbGxiYWNrIHRlc3Rpbmdcblx0XHRcdGZldGNoU3R1Yi5yZXNvbHZlcyh7XG5cdFx0XHRcdHN0YXR1czogMjAwLFxuXHRcdFx0XHRqc29uOiBhc3luYyAoKSA9PiBpbnZhbGlkTWV0YWRhdGEsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+IEpTT04uc3RyaW5naWZ5KGludmFsaWRNZXRhZGF0YSlcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdFx0YXN5bmMgKCkgPT4gZmV0Y2hSZXNvdXJjZU1ldGFkYXRhKHRhcmdldFJlc291cmNlLCByZXNvdXJjZU1ldGFkYXRhVXJsLCB7IGZldGNoOiBmZXRjaFN0dWIgfSksXG5cdFx0XHRcdChlcnJvcjogYW55KSA9PiB7XG5cdFx0XHRcdFx0Ly8gU2hvdWxkIGJlIEFnZ3JlZ2F0ZUVycm9yIHNpbmNlIGFsbCBVUkxzIHJldHVybiBpbnZhbGlkIG1ldGFkYXRhXG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKGVycm9yIGluc3RhbmNlb2YgQWdncmVnYXRlRXJyb3IgfHwgL0ludmFsaWQgcmVzb3VyY2UgbWV0YWRhdGEvLnRlc3QoZXJyb3IubWVzc2FnZSkpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHRocm93IGVycm9yIHdoZW4gc2NvcGVzX3N1cHBvcnRlZCBpcyBub3QgYW4gYXJyYXknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXRSZXNvdXJjZSA9ICdodHRwczovL2V4YW1wbGUuY29tL2FwaSc7XG5cdFx0XHRjb25zdCByZXNvdXJjZU1ldGFkYXRhVXJsID0gJ2h0dHBzOi8vZXhhbXBsZS5jb20vLndlbGwta25vd24vb2F1dGgtcHJvdGVjdGVkLXJlc291cmNlJztcblx0XHRcdGNvbnN0IGludmFsaWRNZXRhZGF0YSA9IHtcblx0XHRcdFx0cmVzb3VyY2U6ICdodHRwczovL2V4YW1wbGUuY29tL2FwaScsXG5cdFx0XHRcdHNjb3Blc19zdXBwb3J0ZWQ6ICdub3QgYW4gYXJyYXknXG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBTdHViIGFsbCBwb3NzaWJsZSBVUkxzIHRvIHJldHVybiBpbnZhbGlkIG1ldGFkYXRhIGZvciByb2J1c3QgZmFsbGJhY2sgdGVzdGluZ1xuXHRcdFx0ZmV0Y2hTdHViLnJlc29sdmVzKHtcblx0XHRcdFx0c3RhdHVzOiAyMDAsXG5cdFx0XHRcdGpzb246IGFzeW5jICgpID0+IGludmFsaWRNZXRhZGF0YSxcblx0XHRcdFx0dGV4dDogYXN5bmMgKCkgPT4gSlNPTi5zdHJpbmdpZnkoaW52YWxpZE1ldGFkYXRhKVxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0XHRhc3luYyAoKSA9PiBmZXRjaFJlc291cmNlTWV0YWRhdGEodGFyZ2V0UmVzb3VyY2UsIHJlc291cmNlTWV0YWRhdGFVcmwsIHsgZmV0Y2g6IGZldGNoU3R1YiB9KSxcblx0XHRcdFx0KGVycm9yOiBhbnkpID0+IHtcblx0XHRcdFx0XHQvLyBTaG91bGQgYmUgQWdncmVnYXRlRXJyb3Igc2luY2UgYWxsIFVSTHMgcmV0dXJuIGludmFsaWQgbWV0YWRhdGFcblx0XHRcdFx0XHRhc3NlcnQub2soZXJyb3IgaW5zdGFuY2VvZiBBZ2dyZWdhdGVFcnJvciB8fCAvSW52YWxpZCByZXNvdXJjZSBtZXRhZGF0YS8udGVzdChlcnJvci5tZXNzYWdlKSk7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIG1ldGFkYXRhIHdpdGggb3B0aW9uYWwgZmllbGRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0UmVzb3VyY2UgPSAnaHR0cHM6Ly9leGFtcGxlLmNvbS9hcGknO1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VNZXRhZGF0YVVybCA9ICdodHRwczovL2V4YW1wbGUuY29tLy53ZWxsLWtub3duL29hdXRoLXByb3RlY3RlZC1yZXNvdXJjZSc7XG5cdFx0XHRjb25zdCBtZXRhZGF0YSA9IHtcblx0XHRcdFx0cmVzb3VyY2U6ICdodHRwczovL2V4YW1wbGUuY29tL2FwaScsXG5cdFx0XHRcdHJlc291cmNlX25hbWU6ICdFeGFtcGxlIEFQSScsXG5cdFx0XHRcdGF1dGhvcml6YXRpb25fc2VydmVyczogWydodHRwczovL2F1dGguZXhhbXBsZS5jb20nXSxcblx0XHRcdFx0andrc191cmk6ICdodHRwczovL2V4YW1wbGUuY29tL2p3a3MnLFxuXHRcdFx0XHRzY29wZXNfc3VwcG9ydGVkOiBbJ3JlYWQnLCAnd3JpdGUnLCAnYWRtaW4nXSxcblx0XHRcdFx0YmVhcmVyX21ldGhvZHNfc3VwcG9ydGVkOiBbJ2hlYWRlcicsICdib2R5J10sXG5cdFx0XHRcdHJlc291cmNlX2RvY3VtZW50YXRpb246ICdodHRwczovL2V4YW1wbGUuY29tL2RvY3MnXG5cdFx0XHR9O1xuXG5cdFx0XHRmZXRjaFN0dWIucmVzb2x2ZXMoe1xuXHRcdFx0XHRzdGF0dXM6IDIwMCxcblx0XHRcdFx0anNvbjogYXN5bmMgKCkgPT4gbWV0YWRhdGEsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+IEpTT04uc3RyaW5naWZ5KG1ldGFkYXRhKVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZldGNoUmVzb3VyY2VNZXRhZGF0YSh0YXJnZXRSZXNvdXJjZSwgcmVzb3VyY2VNZXRhZGF0YVVybCwgeyBmZXRjaDogZmV0Y2hTdHViIH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWV0YWRhdGEsIG1ldGFkYXRhKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB1c2UgZ2xvYmFsIGZldGNoIHdoZW4gY3VzdG9tIGZldGNoIGlzIG5vdCBwcm92aWRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldFJlc291cmNlID0gJ2h0dHBzOi8vZXhhbXBsZS5jb20vYXBpJztcblx0XHRcdGNvbnN0IHJlc291cmNlTWV0YWRhdGFVcmwgPSAnaHR0cHM6Ly9leGFtcGxlLmNvbS8ud2VsbC1rbm93bi9vYXV0aC1wcm90ZWN0ZWQtcmVzb3VyY2UnO1xuXHRcdFx0Y29uc3QgbWV0YWRhdGEgPSB7XG5cdFx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9hcGknXG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdGNvbnN0IGdsb2JhbEZldGNoU3R1YiA9IHNhbmRib3guc3R1YihnbG9iYWxUaGlzLCAnZmV0Y2gnKS5yZXNvbHZlcyh7XG5cdFx0XHRcdHN0YXR1czogMjAwLFxuXHRcdFx0XHRqc29uOiBhc3luYyAoKSA9PiBtZXRhZGF0YSxcblx0XHRcdFx0dGV4dDogYXN5bmMgKCkgPT4gSlNPTi5zdHJpbmdpZnkobWV0YWRhdGEpXG5cdFx0XHR9IGFzIGFueSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZldGNoUmVzb3VyY2VNZXRhZGF0YSh0YXJnZXRSZXNvdXJjZSwgcmVzb3VyY2VNZXRhZGF0YVVybCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1ldGFkYXRhLCBtZXRhZGF0YSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmRpc2NvdmVyeVVybCwgcmVzb3VyY2VNZXRhZGF0YVVybCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYmFsRmV0Y2hTdHViLmNhbGxDb3VudCwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIHNhbWUgb3JpZ2luIHdpdGggZGlmZmVyZW50IHBvcnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0UmVzb3VyY2UgPSAnaHR0cHM6Ly9leGFtcGxlLmNvbTo4MDgwL2FwaSc7XG5cdFx0XHRjb25zdCByZXNvdXJjZU1ldGFkYXRhVXJsID0gJ2h0dHBzOi8vZXhhbXBsZS5jb206OTA5MC8ud2VsbC1rbm93bi9vYXV0aC1wcm90ZWN0ZWQtcmVzb3VyY2UnO1xuXHRcdFx0Y29uc3Qgc2FtZU9yaWdpbkhlYWRlcnMgPSB7XG5cdFx0XHRcdCdYLVRlc3QtSGVhZGVyJzogJ3Rlc3QtdmFsdWUnXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgbWV0YWRhdGEgPSB7XG5cdFx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9leGFtcGxlLmNvbTo4MDgwL2FwaSdcblx0XHRcdH07XG5cblx0XHRcdGZldGNoU3R1Yi5yZXNvbHZlcyh7XG5cdFx0XHRcdHN0YXR1czogMjAwLFxuXHRcdFx0XHRqc29uOiBhc3luYyAoKSA9PiBtZXRhZGF0YSxcblx0XHRcdFx0dGV4dDogYXN5bmMgKCkgPT4gSlNPTi5zdHJpbmdpZnkobWV0YWRhdGEpXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZmV0Y2hSZXNvdXJjZU1ldGFkYXRhKFxuXHRcdFx0XHR0YXJnZXRSZXNvdXJjZSxcblx0XHRcdFx0cmVzb3VyY2VNZXRhZGF0YVVybCxcblx0XHRcdFx0eyBmZXRjaDogZmV0Y2hTdHViLCBzYW1lT3JpZ2luSGVhZGVycyB9XG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmRpc2NvdmVyeVVybCwgcmVzb3VyY2VNZXRhZGF0YVVybCk7XG5cdFx0XHQvLyBEaWZmZXJlbnQgcG9ydHMgbWVhbiBkaWZmZXJlbnQgb3JpZ2luc1xuXHRcdFx0Y29uc3QgaGVhZGVycyA9IGZldGNoU3R1Yi5maXJzdENhbGwuYXJnc1sxXS5oZWFkZXJzO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbJ1gtVGVzdC1IZWFkZXInXSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgc2FtZSBvcmlnaW4gd2l0aCBkaWZmZXJlbnQgcHJvdG9jb2xzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0UmVzb3VyY2UgPSAnaHR0cDovL2V4YW1wbGUuY29tL2FwaSc7XG5cdFx0XHRjb25zdCByZXNvdXJjZU1ldGFkYXRhVXJsID0gJ2h0dHBzOi8vZXhhbXBsZS5jb20vLndlbGwta25vd24vb2F1dGgtcHJvdGVjdGVkLXJlc291cmNlJztcblx0XHRcdGNvbnN0IHNhbWVPcmlnaW5IZWFkZXJzID0ge1xuXHRcdFx0XHQnWC1UZXN0LUhlYWRlcic6ICd0ZXN0LXZhbHVlJ1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IG1ldGFkYXRhID0ge1xuXHRcdFx0XHRyZXNvdXJjZTogJ2h0dHA6Ly9leGFtcGxlLmNvbS9hcGknXG5cdFx0XHR9O1xuXG5cdFx0XHRmZXRjaFN0dWIucmVzb2x2ZXMoe1xuXHRcdFx0XHRzdGF0dXM6IDIwMCxcblx0XHRcdFx0anNvbjogYXN5bmMgKCkgPT4gbWV0YWRhdGEsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+IEpTT04uc3RyaW5naWZ5KG1ldGFkYXRhKVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZldGNoUmVzb3VyY2VNZXRhZGF0YShcblx0XHRcdFx0dGFyZ2V0UmVzb3VyY2UsXG5cdFx0XHRcdHJlc291cmNlTWV0YWRhdGFVcmwsXG5cdFx0XHRcdHsgZmV0Y2g6IGZldGNoU3R1Yiwgc2FtZU9yaWdpbkhlYWRlcnMgfVxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5kaXNjb3ZlcnlVcmwsIHJlc291cmNlTWV0YWRhdGFVcmwpO1xuXHRcdFx0Ly8gRGlmZmVyZW50IHByb3RvY29scyBtZWFuIGRpZmZlcmVudCBvcmlnaW5zXG5cdFx0XHRjb25zdCBoZWFkZXJzID0gZmV0Y2hTdHViLmZpcnN0Q2FsbC5hcmdzWzFdLmhlYWRlcnM7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1snWC1UZXN0LUhlYWRlciddLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGluY2x1ZGUgZXJyb3IgZGV0YWlscyBpbiBtZXNzYWdlIHdpdGggcmVzb3VyY2UgdmFsdWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0UmVzb3VyY2UgPSAnaHR0cHM6Ly9leGFtcGxlLmNvbS9hcGknO1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VNZXRhZGF0YVVybCA9ICdodHRwczovL2V4YW1wbGUuY29tLy53ZWxsLWtub3duL29hdXRoLXByb3RlY3RlZC1yZXNvdXJjZSc7XG5cdFx0XHRjb25zdCBtZXRhZGF0YSA9IHtcblx0XHRcdFx0cmVzb3VyY2U6ICdodHRwczovL2RpZmZlcmVudC5jb20vb3RoZXInXG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBTdHViIGFsbCBwb3NzaWJsZSBVUkxzIHRvIHJldHVybiBpbnZhbGlkIG1ldGFkYXRhIGZvciByb2J1c3QgZmFsbGJhY2sgdGVzdGluZ1xuXHRcdFx0ZmV0Y2hTdHViLnJlc29sdmVzKHtcblx0XHRcdFx0c3RhdHVzOiAyMDAsXG5cdFx0XHRcdGpzb246IGFzeW5jICgpID0+IG1ldGFkYXRhLFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiBKU09OLnN0cmluZ2lmeShtZXRhZGF0YSlcblx0XHRcdH0pO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBmZXRjaFJlc291cmNlTWV0YWRhdGEodGFyZ2V0UmVzb3VyY2UsIHJlc291cmNlTWV0YWRhdGFVcmwsIHsgZmV0Y2g6IGZldGNoU3R1YiB9KTtcblx0XHRcdFx0YXNzZXJ0LmZhaWwoJ1Nob3VsZCBoYXZlIHRocm93biBhbiBlcnJvcicpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3I6IGFueSkge1xuXHRcdFx0XHQvLyBTaG91bGQgYmUgQWdncmVnYXRlRXJyb3Igd2l0aCB2YWxpZGF0aW9uIGVycm9yc1xuXHRcdFx0XHRjb25zdCBlcnJvck1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEFnZ3JlZ2F0ZUVycm9yID8gZXJyb3IuZXJyb3JzLm1hcCgoZTogRXJyb3IpID0+IGUubWVzc2FnZSkuam9pbignICcpIDogZXJyb3IubWVzc2FnZTtcblx0XHRcdFx0YXNzZXJ0Lm9rKC9kb2VzIG5vdCBtYXRjaCBleHBlY3RlZCB2YWx1ZS8udGVzdChlcnJvck1lc3NhZ2UpLCAnRXJyb3IgbWVzc2FnZSBzaG91bGQgbWVudGlvbiBtaXNtYXRjaCcpO1xuXHRcdFx0XHRhc3NlcnQub2soL2h0dHBzOlxcL1xcL2RpZmZlcmVudFxcLmNvbVxcL290aGVyLy50ZXN0KGVycm9yTWVzc2FnZSksICdFcnJvciBtZXNzYWdlIHNob3VsZCBpbmNsdWRlIGFjdHVhbCByZXNvdXJjZSB2YWx1ZScpO1xuXHRcdFx0XHRhc3NlcnQub2soL2h0dHBzOlxcL1xcL2V4YW1wbGVcXC5jb21cXC9hcGkvLnRlc3QoZXJyb3JNZXNzYWdlKSwgJ0Vycm9yIG1lc3NhZ2Ugc2hvdWxkIGluY2x1ZGUgZXhwZWN0ZWQgcmVzb3VyY2UgdmFsdWUnKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBmYWxsYmFjayB0byB3ZWxsLWtub3duIFVSSSB3aXRoIHBhdGggd2hlbiBubyByZXNvdXJjZU1ldGFkYXRhVXJsIHByb3ZpZGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0UmVzb3VyY2UgPSAnaHR0cHM6Ly9leGFtcGxlLmNvbS9hcGkvdjEnO1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRNZXRhZGF0YSA9IHtcblx0XHRcdFx0cmVzb3VyY2U6ICdodHRwczovL2V4YW1wbGUuY29tL2FwaS92MScsXG5cdFx0XHRcdHNjb3Blc19zdXBwb3J0ZWQ6IFsncmVhZCcsICd3cml0ZSddXG5cdFx0XHR9O1xuXG5cdFx0XHRmZXRjaFN0dWIucmVzb2x2ZXMoe1xuXHRcdFx0XHRzdGF0dXM6IDIwMCxcblx0XHRcdFx0anNvbjogYXN5bmMgKCkgPT4gZXhwZWN0ZWRNZXRhZGF0YSxcblx0XHRcdFx0dGV4dDogYXN5bmMgKCkgPT4gSlNPTi5zdHJpbmdpZnkoZXhwZWN0ZWRNZXRhZGF0YSlcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBmZXRjaFJlc291cmNlTWV0YWRhdGEoXG5cdFx0XHRcdHRhcmdldFJlc291cmNlLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdHsgZmV0Y2g6IGZldGNoU3R1YiB9XG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tZXRhZGF0YSwgZXhwZWN0ZWRNZXRhZGF0YSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmRpc2NvdmVyeVVybCwgJ2h0dHBzOi8vZXhhbXBsZS5jb20vLndlbGwta25vd24vb2F1dGgtcHJvdGVjdGVkLXJlc291cmNlL2FwaS92MScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZldGNoU3R1Yi5jYWxsQ291bnQsIDEpO1xuXHRcdFx0Ly8gU2hvdWxkIHRyeSBwYXRoLWFwcGVuZGVkIHZlcnNpb24gZmlyc3Rcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmZXRjaFN0dWIuZmlyc3RDYWxsLmFyZ3NbMF0sICdodHRwczovL2V4YW1wbGUuY29tLy53ZWxsLWtub3duL29hdXRoLXByb3RlY3RlZC1yZXNvdXJjZS9hcGkvdjEnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBmYWxsYmFjayB0byB3ZWxsLWtub3duIFVSSSBhdCByb290IHdoZW4gcGF0aCB2ZXJzaW9uIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0UmVzb3VyY2UgPSAnaHR0cHM6Ly9leGFtcGxlLmNvbS9hcGkvdjEnO1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRNZXRhZGF0YSA9IHtcblx0XHRcdFx0cmVzb3VyY2U6ICdodHRwczovL2V4YW1wbGUuY29tLycsXG5cdFx0XHRcdHNjb3Blc19zdXBwb3J0ZWQ6IFsncmVhZCcsICd3cml0ZSddXG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBGaXJzdCBjYWxsIGZhaWxzLCBzZWNvbmQgc3VjY2VlZHNcblx0XHRcdGZldGNoU3R1Yi5vbkZpcnN0Q2FsbCgpLnJlc29sdmVzKHtcblx0XHRcdFx0c3RhdHVzOiA0MDQsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+ICdOb3QgRm91bmQnLFxuXHRcdFx0XHRzdGF0dXNUZXh0OiAnTm90IEZvdW5kJ1xuXHRcdFx0fSk7XG5cblx0XHRcdGZldGNoU3R1Yi5vblNlY29uZENhbGwoKS5yZXNvbHZlcyh7XG5cdFx0XHRcdHN0YXR1czogMjAwLFxuXHRcdFx0XHRqc29uOiBhc3luYyAoKSA9PiBleHBlY3RlZE1ldGFkYXRhLFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiBKU09OLnN0cmluZ2lmeShleHBlY3RlZE1ldGFkYXRhKVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZldGNoUmVzb3VyY2VNZXRhZGF0YShcblx0XHRcdFx0dGFyZ2V0UmVzb3VyY2UsXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0eyBmZXRjaDogZmV0Y2hTdHViIH1cblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1ldGFkYXRhLCBleHBlY3RlZE1ldGFkYXRhKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZGlzY292ZXJ5VXJsLCAnaHR0cHM6Ly9leGFtcGxlLmNvbS8ud2VsbC1rbm93bi9vYXV0aC1wcm90ZWN0ZWQtcmVzb3VyY2UnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZXJyb3JzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmV0Y2hTdHViLmNhbGxDb3VudCwgMik7XG5cdFx0XHQvLyBGaXJzdCBhdHRlbXB0IHdpdGggcGF0aFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZldGNoU3R1Yi5maXJzdENhbGwuYXJnc1swXSwgJ2h0dHBzOi8vZXhhbXBsZS5jb20vLndlbGwta25vd24vb2F1dGgtcHJvdGVjdGVkLXJlc291cmNlL2FwaS92MScpO1xuXHRcdFx0Ly8gU2Vjb25kIGF0dGVtcHQgYXQgcm9vdFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZldGNoU3R1Yi5zZWNvbmRDYWxsLmFyZ3NbMF0sICdodHRwczovL2V4YW1wbGUuY29tLy53ZWxsLWtub3duL29hdXRoLXByb3RlY3RlZC1yZXNvdXJjZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHRocm93IGVycm9yIHdoZW4gYWxsIHdlbGwta25vd24gVVJJcyBmYWlsJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0UmVzb3VyY2UgPSAnaHR0cHM6Ly9leGFtcGxlLmNvbS9hcGkvdjEnO1xuXG5cdFx0XHRmZXRjaFN0dWIucmVzb2x2ZXMoe1xuXHRcdFx0XHRzdGF0dXM6IDQwNCxcblx0XHRcdFx0dGV4dDogYXN5bmMgKCkgPT4gJ05vdCBGb3VuZCcsXG5cdFx0XHRcdHN0YXR1c1RleHQ6ICdOb3QgRm91bmQnXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRcdGFzeW5jICgpID0+IGZldGNoUmVzb3VyY2VNZXRhZGF0YSh0YXJnZXRSZXNvdXJjZSwgdW5kZWZpbmVkLCB7IGZldGNoOiBmZXRjaFN0dWIgfSksXG5cdFx0XHRcdChlcnJvcjogYW55KSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKGVycm9yIGluc3RhbmNlb2YgQWdncmVnYXRlRXJyb3IsICdTaG91bGQgYmUgYW4gQWdncmVnYXRlRXJyb3InKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3IuZXJyb3JzLmxlbmd0aCwgMiwgJ1Nob3VsZCBjb250YWluIDIgZXJyb3JzJyk7XG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKC9GYWlsZWQgdG8gZmV0Y2ggcmVzb3VyY2UgbWV0YWRhdGEgZnJvbS4qXFwvYXBpXFwvdjEuKjQwNC8udGVzdChlcnJvci5lcnJvcnNbMF0ubWVzc2FnZSksICdGaXJzdCBlcnJvciBzaG91bGQgbWVudGlvbiAvYXBpL3YxIGFuZCA0MDQnKTtcblx0XHRcdFx0XHRhc3NlcnQub2soL0ZhaWxlZCB0byBmZXRjaCByZXNvdXJjZSBtZXRhZGF0YSBmcm9tLipcXC53ZWxsLWtub3duLio0MDQvLnRlc3QoZXJyb3IuZXJyb3JzWzFdLm1lc3NhZ2UpLCAnU2Vjb25kIGVycm9yIHNob3VsZCBtZW50aW9uIC53ZWxsLWtub3duIGFuZCA0MDQnKTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0KTsgYXNzZXJ0LnN0cmljdEVxdWFsKGZldGNoU3R1Yi5jYWxsQ291bnQsIDIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBhcHBlbmQgcGF0aCB3aGVuIHRhcmdldCByZXNvdXJjZSBpcyByb290JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0UmVzb3VyY2UgPSAnaHR0cHM6Ly9leGFtcGxlLmNvbS8nO1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRNZXRhZGF0YSA9IHtcblx0XHRcdFx0cmVzb3VyY2U6ICdodHRwczovL2V4YW1wbGUuY29tLycsXG5cdFx0XHRcdHNjb3Blc19zdXBwb3J0ZWQ6IFsncmVhZCddXG5cdFx0XHR9O1xuXG5cdFx0XHRmZXRjaFN0dWIucmVzb2x2ZXMoe1xuXHRcdFx0XHRzdGF0dXM6IDIwMCxcblx0XHRcdFx0anNvbjogYXN5bmMgKCkgPT4gZXhwZWN0ZWRNZXRhZGF0YSxcblx0XHRcdFx0dGV4dDogYXN5bmMgKCkgPT4gSlNPTi5zdHJpbmdpZnkoZXhwZWN0ZWRNZXRhZGF0YSlcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBmZXRjaFJlc291cmNlTWV0YWRhdGEoXG5cdFx0XHRcdHRhcmdldFJlc291cmNlLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdHsgZmV0Y2g6IGZldGNoU3R1YiB9XG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tZXRhZGF0YSwgZXhwZWN0ZWRNZXRhZGF0YSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmRpc2NvdmVyeVVybCwgJ2h0dHBzOi8vZXhhbXBsZS5jb20vLndlbGwta25vd24vb2F1dGgtcHJvdGVjdGVkLXJlc291cmNlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmV0Y2hTdHViLmNhbGxDb3VudCwgMSk7XG5cdFx0XHQvLyBCb3RoIFVSTHMgc2hvdWxkIGJlIHRoZSBzYW1lIHdoZW4gcGF0aCBpcyAvXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmV0Y2hTdHViLmZpcnN0Q2FsbC5hcmdzWzBdLCAnaHR0cHM6Ly9leGFtcGxlLmNvbS8ud2VsbC1rbm93bi9vYXV0aC1wcm90ZWN0ZWQtcmVzb3VyY2UnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBpbmNsdWRlIHNhbWUtb3JpZ2luIGhlYWRlcnMgd2hlbiB1c2luZyB3ZWxsLWtub3duIGZhbGxiYWNrJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0UmVzb3VyY2UgPSAnaHR0cHM6Ly9leGFtcGxlLmNvbS9hcGknO1xuXHRcdFx0Y29uc3Qgc2FtZU9yaWdpbkhlYWRlcnMgPSB7XG5cdFx0XHRcdCdYLVRlc3QtSGVhZGVyJzogJ3Rlc3QtdmFsdWUnLFxuXHRcdFx0XHQnWC1DdXN0b20tSGVhZGVyJzogJ3ZhbHVlJ1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGV4cGVjdGVkTWV0YWRhdGEgPSB7XG5cdFx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9hcGknXG5cdFx0XHR9O1xuXG5cdFx0XHRmZXRjaFN0dWIucmVzb2x2ZXMoe1xuXHRcdFx0XHRzdGF0dXM6IDIwMCxcblx0XHRcdFx0anNvbjogYXN5bmMgKCkgPT4gZXhwZWN0ZWRNZXRhZGF0YSxcblx0XHRcdFx0dGV4dDogYXN5bmMgKCkgPT4gSlNPTi5zdHJpbmdpZnkoZXhwZWN0ZWRNZXRhZGF0YSlcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBmZXRjaFJlc291cmNlTWV0YWRhdGEoXG5cdFx0XHRcdHRhcmdldFJlc291cmNlLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdHsgZmV0Y2g6IGZldGNoU3R1Yiwgc2FtZU9yaWdpbkhlYWRlcnMgfVxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5kaXNjb3ZlcnlVcmwsICdodHRwczovL2V4YW1wbGUuY29tLy53ZWxsLWtub3duL29hdXRoLXByb3RlY3RlZC1yZXNvdXJjZS9hcGknKTtcblx0XHRcdGNvbnN0IGhlYWRlcnMgPSBmZXRjaFN0dWIuZmlyc3RDYWxsLmFyZ3NbMV0uaGVhZGVycztcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWydBY2NlcHQnXSwgJ2FwcGxpY2F0aW9uL2pzb24nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWydYLVRlc3QtSGVhZGVyJ10sICd0ZXN0LXZhbHVlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1snWC1DdXN0b20tSGVhZGVyJ10sICd2YWx1ZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBmZXRjaEltcGwgdGhyb3dpbmcgbmV0d29yayBlcnJvciBhbmQgY29udGludWUgdG8gbmV4dCBVUkwnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXRSZXNvdXJjZSA9ICdodHRwczovL2V4YW1wbGUuY29tL2FwaS92MSc7XG5cdFx0XHRjb25zdCBleHBlY3RlZE1ldGFkYXRhID0ge1xuXHRcdFx0XHRyZXNvdXJjZTogJ2h0dHBzOi8vZXhhbXBsZS5jb20vJyxcblx0XHRcdFx0c2NvcGVzX3N1cHBvcnRlZDogWydyZWFkJywgJ3dyaXRlJ11cblx0XHRcdH07XG5cblx0XHRcdC8vIEZpcnN0IGNhbGwgdGhyb3dzIG5ldHdvcmsgZXJyb3IsIHNlY29uZCBzdWNjZWVkc1xuXHRcdFx0ZmV0Y2hTdHViLm9uRmlyc3RDYWxsKCkucmVqZWN0cyhuZXcgRXJyb3IoJ05ldHdvcmsgY29ubmVjdGlvbiBmYWlsZWQnKSk7XG5cblx0XHRcdGZldGNoU3R1Yi5vblNlY29uZENhbGwoKS5yZXNvbHZlcyh7XG5cdFx0XHRcdHN0YXR1czogMjAwLFxuXHRcdFx0XHRqc29uOiBhc3luYyAoKSA9PiBleHBlY3RlZE1ldGFkYXRhLFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiBKU09OLnN0cmluZ2lmeShleHBlY3RlZE1ldGFkYXRhKVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZldGNoUmVzb3VyY2VNZXRhZGF0YShcblx0XHRcdFx0dGFyZ2V0UmVzb3VyY2UsXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0eyBmZXRjaDogZmV0Y2hTdHViIH1cblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1ldGFkYXRhLCBleHBlY3RlZE1ldGFkYXRhKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZGlzY292ZXJ5VXJsLCAnaHR0cHM6Ly9leGFtcGxlLmNvbS8ud2VsbC1rbm93bi9vYXV0aC1wcm90ZWN0ZWQtcmVzb3VyY2UnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZXJyb3JzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQub2soL05ldHdvcmsgY29ubmVjdGlvbiBmYWlsZWQvLnRlc3QocmVzdWx0LmVycm9yc1swXS5tZXNzYWdlKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmV0Y2hTdHViLmNhbGxDb3VudCwgMik7XG5cdFx0XHQvLyBGaXJzdCBhdHRlbXB0IHdpdGggcGF0aCBzaG91bGQgaGF2ZSB0aHJvd24gZXJyb3Jcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmZXRjaFN0dWIuZmlyc3RDYWxsLmFyZ3NbMF0sICdodHRwczovL2V4YW1wbGUuY29tLy53ZWxsLWtub3duL29hdXRoLXByb3RlY3RlZC1yZXNvdXJjZS9hcGkvdjEnKTtcblx0XHRcdC8vIFNlY29uZCBhdHRlbXB0IGF0IHJvb3Qgc2hvdWxkIHN1Y2NlZWRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmZXRjaFN0dWIuc2Vjb25kQ2FsbC5hcmdzWzBdLCAnaHR0cHM6Ly9leGFtcGxlLmNvbS8ud2VsbC1rbm93bi9vYXV0aC1wcm90ZWN0ZWQtcmVzb3VyY2UnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB0aHJvdyBBZ2dyZWdhdGVFcnJvciB3aGVuIGZldGNoSW1wbCB0aHJvd3Mgb24gYWxsIFVSTHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXRSZXNvdXJjZSA9ICdodHRwczovL2V4YW1wbGUuY29tL2FwaS92MSc7XG5cblx0XHRcdC8vIEJvdGggY2FsbHMgdGhyb3cgbmV0d29yayBlcnJvcnNcblx0XHRcdGZldGNoU3R1Yi5yZWplY3RzKG5ldyBFcnJvcignTmV0d29yayBjb25uZWN0aW9uIGZhaWxlZCcpKTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRcdGFzeW5jICgpID0+IGZldGNoUmVzb3VyY2VNZXRhZGF0YSh0YXJnZXRSZXNvdXJjZSwgdW5kZWZpbmVkLCB7IGZldGNoOiBmZXRjaFN0dWIgfSksXG5cdFx0XHRcdChlcnJvcjogYW55KSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKGVycm9yIGluc3RhbmNlb2YgQWdncmVnYXRlRXJyb3IsICdTaG91bGQgYmUgYW4gQWdncmVnYXRlRXJyb3InKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3IuZXJyb3JzLmxlbmd0aCwgMiwgJ1Nob3VsZCBjb250YWluIDIgZXJyb3JzJyk7XG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKC9OZXR3b3JrIGNvbm5lY3Rpb24gZmFpbGVkLy50ZXN0KGVycm9yLmVycm9yc1swXS5tZXNzYWdlKSwgJ0ZpcnN0IGVycm9yIHNob3VsZCBtZW50aW9uIG5ldHdvcmsgZmFpbHVyZScpO1xuXHRcdFx0XHRcdGFzc2VydC5vaygvTmV0d29yayBjb25uZWN0aW9uIGZhaWxlZC8udGVzdChlcnJvci5lcnJvcnNbMV0ubWVzc2FnZSksICdTZWNvbmQgZXJyb3Igc2hvdWxkIG1lbnRpb24gbmV0d29yayBmYWlsdXJlJyk7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmZXRjaFN0dWIuY2FsbENvdW50LCAyKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgbWl4IG9mIGZldGNoIGVycm9yIGFuZCBub24tMjAwIHJlc3BvbnNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0UmVzb3VyY2UgPSAnaHR0cHM6Ly9leGFtcGxlLmNvbS9hcGkvdjEnO1xuXG5cdFx0XHQvLyBGaXJzdCBjYWxsIHRocm93cyBuZXR3b3JrIGVycm9yXG5cdFx0XHRmZXRjaFN0dWIub25GaXJzdENhbGwoKS5yZWplY3RzKG5ldyBFcnJvcignQ29ubmVjdGlvbiB0aW1lb3V0JykpO1xuXG5cdFx0XHQvLyBTZWNvbmQgY2FsbCByZXR1cm5zIDQwNFxuXHRcdFx0ZmV0Y2hTdHViLm9uU2Vjb25kQ2FsbCgpLnJlc29sdmVzKHtcblx0XHRcdFx0c3RhdHVzOiA0MDQsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+ICdOb3QgRm91bmQnLFxuXHRcdFx0XHRzdGF0dXNUZXh0OiAnTm90IEZvdW5kJ1xuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0XHRhc3luYyAoKSA9PiBmZXRjaFJlc291cmNlTWV0YWRhdGEodGFyZ2V0UmVzb3VyY2UsIHVuZGVmaW5lZCwgeyBmZXRjaDogZmV0Y2hTdHViIH0pLFxuXHRcdFx0XHQoZXJyb3I6IGFueSkgPT4ge1xuXHRcdFx0XHRcdGFzc2VydC5vayhlcnJvciBpbnN0YW5jZW9mIEFnZ3JlZ2F0ZUVycm9yLCAnU2hvdWxkIGJlIGFuIEFnZ3JlZ2F0ZUVycm9yJyk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yLmVycm9ycy5sZW5ndGgsIDIsICdTaG91bGQgY29udGFpbiAyIGVycm9ycycpO1xuXHRcdFx0XHRcdGFzc2VydC5vaygvQ29ubmVjdGlvbiB0aW1lb3V0Ly50ZXN0KGVycm9yLmVycm9yc1swXS5tZXNzYWdlKSwgJ0ZpcnN0IGVycm9yIHNob3VsZCBiZSBuZXR3b3JrIGVycm9yJyk7XG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKC9GYWlsZWQgdG8gZmV0Y2ggcmVzb3VyY2UgbWV0YWRhdGEuKjQwNC8udGVzdChlcnJvci5lcnJvcnNbMV0ubWVzc2FnZSksICdTZWNvbmQgZXJyb3Igc2hvdWxkIGJlIDQwNCcpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmV0Y2hTdHViLmNhbGxDb3VudCwgMik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgYWNjZXB0IHJvb3QgVVJMIGluIFBSTSByZXNvdXJjZSB3aGVuIHVzaW5nIHJvb3QgZGlzY292ZXJ5IGZhbGxiYWNrIChubyB0cmFpbGluZyBzbGFzaCknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXRSZXNvdXJjZSA9ICdodHRwczovL2V4YW1wbGUuY29tL2FwaS92MSc7XG5cdFx0XHQvLyBQZXIgUkZDIDk3Mjg6IHdoZW4gbWV0YWRhdGEgcmV0cmlldmVkIGZyb20gcm9vdCBkaXNjb3ZlcnkgVVJMLFxuXHRcdFx0Ly8gdGhlIHJlc291cmNlIHZhbHVlIG11c3QgbWF0Y2ggdGhlIHJvb3QgVVJMICh3aGVyZSB3ZWxsLWtub3duIHdhcyBpbnNlcnRlZClcblx0XHRcdGNvbnN0IGV4cGVjdGVkTWV0YWRhdGEgPSB7XG5cdFx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9leGFtcGxlLmNvbScsXG5cdFx0XHRcdHNjb3Blc19zdXBwb3J0ZWQ6IFsncmVhZCcsICd3cml0ZSddXG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBGaXJzdCBjYWxsIChwYXRoLWFwcGVuZGVkKSBmYWlscywgc2Vjb25kIChyb290KSBzdWNjZWVkc1xuXHRcdFx0ZmV0Y2hTdHViLm9uRmlyc3RDYWxsKCkucmVzb2x2ZXMoe1xuXHRcdFx0XHRzdGF0dXM6IDQwNCxcblx0XHRcdFx0dGV4dDogYXN5bmMgKCkgPT4gJ05vdCBGb3VuZCcsXG5cdFx0XHRcdHN0YXR1c1RleHQ6ICdOb3QgRm91bmQnXG5cdFx0XHR9KTtcblxuXHRcdFx0ZmV0Y2hTdHViLm9uU2Vjb25kQ2FsbCgpLnJlc29sdmVzKHtcblx0XHRcdFx0c3RhdHVzOiAyMDAsXG5cdFx0XHRcdGpzb246IGFzeW5jICgpID0+IGV4cGVjdGVkTWV0YWRhdGEsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+IEpTT04uc3RyaW5naWZ5KGV4cGVjdGVkTWV0YWRhdGEpXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZmV0Y2hSZXNvdXJjZU1ldGFkYXRhKFxuXHRcdFx0XHR0YXJnZXRSZXNvdXJjZSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHR7IGZldGNoOiBmZXRjaFN0dWIgfVxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWV0YWRhdGEsIGV4cGVjdGVkTWV0YWRhdGEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZldGNoU3R1Yi5jYWxsQ291bnQsIDIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGFjY2VwdCByb290IFVSTCBpbiBQUk0gcmVzb3VyY2Ugd2hlbiB1c2luZyByb290IGRpc2NvdmVyeSBmYWxsYmFjayAod2l0aCB0cmFpbGluZyBzbGFzaCknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXRSZXNvdXJjZSA9ICdodHRwczovL2V4YW1wbGUuY29tL2FwaS92MSc7XG5cdFx0XHQvLyBUZXN0IHRoYXQgdHJhaWxpbmcgc2xhc2ggZm9ybSBpcyBhbHNvIGFjY2VwdGVkIChVUkwgbm9ybWFsaXphdGlvbilcblx0XHRcdGNvbnN0IGV4cGVjdGVkTWV0YWRhdGEgPSB7XG5cdFx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS8nLFxuXHRcdFx0XHRzY29wZXNfc3VwcG9ydGVkOiBbJ3JlYWQnLCAnd3JpdGUnXVxuXHRcdFx0fTtcblxuXHRcdFx0Ly8gRmlyc3QgY2FsbCAocGF0aC1hcHBlbmRlZCkgZmFpbHMsIHNlY29uZCAocm9vdCkgc3VjY2VlZHNcblx0XHRcdGZldGNoU3R1Yi5vbkZpcnN0Q2FsbCgpLnJlc29sdmVzKHtcblx0XHRcdFx0c3RhdHVzOiA0MDQsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+ICdOb3QgRm91bmQnLFxuXHRcdFx0XHRzdGF0dXNUZXh0OiAnTm90IEZvdW5kJ1xuXHRcdFx0fSk7XG5cblx0XHRcdGZldGNoU3R1Yi5vblNlY29uZENhbGwoKS5yZXNvbHZlcyh7XG5cdFx0XHRcdHN0YXR1czogMjAwLFxuXHRcdFx0XHRqc29uOiBhc3luYyAoKSA9PiBleHBlY3RlZE1ldGFkYXRhLFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiBKU09OLnN0cmluZ2lmeShleHBlY3RlZE1ldGFkYXRhKVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZldGNoUmVzb3VyY2VNZXRhZGF0YShcblx0XHRcdFx0dGFyZ2V0UmVzb3VyY2UsXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0eyBmZXRjaDogZmV0Y2hTdHViIH1cblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1ldGFkYXRhLCBleHBlY3RlZE1ldGFkYXRhKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmZXRjaFN0dWIuY2FsbENvdW50LCAyKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZWplY3QgUFJNIHdpdGggZnVsbCBwYXRoIHJlc291cmNlIHdoZW4gdXNpbmcgcm9vdCBkaXNjb3ZlcnkgZmFsbGJhY2snLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXRSZXNvdXJjZSA9ICdodHRwczovL2V4YW1wbGUuY29tL2FwaS92MSc7XG5cdFx0XHQvLyBUaGlzIHZpb2xhdGVzIFJGQyA5NzI4OiByb290IGRpc2NvdmVyeSBQUk0gc2hvdWxkIGhhdmUgcm9vdCBVUkwsIG5vdCBmdWxsIHBhdGhcblx0XHRcdGNvbnN0IGludmFsaWRNZXRhZGF0YSA9IHtcblx0XHRcdFx0cmVzb3VyY2U6ICdodHRwczovL2V4YW1wbGUuY29tL2FwaS92MScsXG5cdFx0XHRcdHNjb3Blc19zdXBwb3J0ZWQ6IFsncmVhZCddXG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBGaXJzdCBjYWxsIChwYXRoLWFwcGVuZGVkKSBmYWlscywgc2Vjb25kIChyb290KSByZXR1cm5zIGludmFsaWQgbWV0YWRhdGFcblx0XHRcdGZldGNoU3R1Yi5vbkZpcnN0Q2FsbCgpLnJlc29sdmVzKHtcblx0XHRcdFx0c3RhdHVzOiA0MDQsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+ICdOb3QgRm91bmQnLFxuXHRcdFx0XHRzdGF0dXNUZXh0OiAnTm90IEZvdW5kJ1xuXHRcdFx0fSk7XG5cblx0XHRcdGZldGNoU3R1Yi5vblNlY29uZENhbGwoKS5yZXNvbHZlcyh7XG5cdFx0XHRcdHN0YXR1czogMjAwLFxuXHRcdFx0XHRqc29uOiBhc3luYyAoKSA9PiBpbnZhbGlkTWV0YWRhdGEsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+IEpTT04uc3RyaW5naWZ5KGludmFsaWRNZXRhZGF0YSlcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdFx0YXN5bmMgKCkgPT4gZmV0Y2hSZXNvdXJjZU1ldGFkYXRhKHRhcmdldFJlc291cmNlLCB1bmRlZmluZWQsIHsgZmV0Y2g6IGZldGNoU3R1YiB9KSxcblx0XHRcdFx0KGVycm9yOiBhbnkpID0+IHtcblx0XHRcdFx0XHRhc3NlcnQub2soZXJyb3IgaW5zdGFuY2VvZiBBZ2dyZWdhdGVFcnJvciwgJ1Nob3VsZCBiZSBhbiBBZ2dyZWdhdGVFcnJvcicpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvci5lcnJvcnMubGVuZ3RoLCAyKTtcblx0XHRcdFx0XHQvLyBGaXJzdCBlcnJvciBpcyA0MDQgZnJvbSBwYXRoLWFwcGVuZGVkIGF0dGVtcHRcblx0XHRcdFx0XHRhc3NlcnQub2soLzQwNC8udGVzdChlcnJvci5lcnJvcnNbMF0ubWVzc2FnZSkpO1xuXHRcdFx0XHRcdC8vIFNlY29uZCBlcnJvciBpcyB2YWxpZGF0aW9uIGZhaWx1cmUgZnJvbSByb290IGF0dGVtcHRcblx0XHRcdFx0XHRhc3NlcnQub2soL2RvZXMgbm90IG1hdGNoIGV4cGVjdGVkIHZhbHVlLy50ZXN0KGVycm9yLmVycm9yc1sxXS5tZXNzYWdlKSk7XG5cdFx0XHRcdFx0Ly8gQ2hlY2sgdGhhdCB2YWxpZGF0aW9uIHdhcyBhZ2FpbnN0IHJvb3QgVVJMIChvcmlnaW4pIG5vdCBmdWxsIHBhdGhcblx0XHRcdFx0XHRhc3NlcnQub2soL2h0dHBzOlxcL1xcL2V4YW1wbGVcXC5jb21cXC9hcGlcXC92MS4qaHR0cHM6XFwvXFwvZXhhbXBsZVxcLmNvbS8udGVzdChlcnJvci5lcnJvcnNbMV0ubWVzc2FnZSkpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmV0Y2hTdHViLmNhbGxDb3VudCwgMik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmVqZWN0IFBSTSB3aXRoIHJvb3QgcmVzb3VyY2Ugd2hlbiB1c2luZyBwYXRoLWFwcGVuZGVkIGRpc2NvdmVyeScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldFJlc291cmNlID0gJ2h0dHBzOi8vZXhhbXBsZS5jb20vYXBpL3YxJztcblx0XHRcdC8vIFRoaXMgdmlvbGF0ZXMgUkZDIDk3Mjg6IHBhdGgtYXBwZW5kZWQgZGlzY292ZXJ5IFBSTSBzaG91bGQgbWF0Y2ggZnVsbCB0YXJnZXQgVVJMXG5cdFx0XHRjb25zdCBpbnZhbGlkTWV0YWRhdGEgPSB7XG5cdFx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS8nLFxuXHRcdFx0XHRzY29wZXNfc3VwcG9ydGVkOiBbJ3JlYWQnXVxuXHRcdFx0fTtcblxuXHRcdFx0Ly8gRmlyc3QgYXR0ZW1wdCAocGF0aC1hcHBlbmRlZCkgZ2V0cyB0aGUgd3JvbmcgcmVzb3VyY2UgdmFsdWVcblx0XHRcdC8vIEl0IHdpbGwgZmFpbCB2YWxpZGF0aW9uIGFuZCBjb250aW51ZSB0byBzZWNvbmQgVVJMIChyb290KVxuXHRcdFx0Ly8gU2Vjb25kIGF0dGVtcHQgKHJvb3QpIHdpbGwgc3VjY2VlZCBiZWNhdXNlIHJvb3QgZXhwZWN0cyByb290IHJlc291cmNlXG5cdFx0XHRmZXRjaFN0dWIucmVzb2x2ZXMoe1xuXHRcdFx0XHRzdGF0dXM6IDIwMCxcblx0XHRcdFx0anNvbjogYXN5bmMgKCkgPT4gaW52YWxpZE1ldGFkYXRhLFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiBKU09OLnN0cmluZ2lmeShpbnZhbGlkTWV0YWRhdGEpXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gVGhpcyBzaG91bGQgYWN0dWFsbHkgc3VjY2VlZCBvbiB0aGUgc2Vjb25kIChyb290KSBhdHRlbXB0XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBmZXRjaFJlc291cmNlTWV0YWRhdGEodGFyZ2V0UmVzb3VyY2UsIHVuZGVmaW5lZCwgeyBmZXRjaDogZmV0Y2hTdHViIH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tZXRhZGF0YSwgaW52YWxpZE1ldGFkYXRhKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZGlzY292ZXJ5VXJsLCAnaHR0cHM6Ly9leGFtcGxlLmNvbS8ud2VsbC1rbm93bi9vYXV0aC1wcm90ZWN0ZWQtcmVzb3VyY2UnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZXJyb3JzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmV0Y2hTdHViLmNhbGxDb3VudCwgMik7XG5cdFx0XHQvLyBWZXJpZnkgYm90aCBVUkxzIHdlcmUgdHJpZWRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmZXRjaFN0dWIuZmlyc3RDYWxsLmFyZ3NbMF0sICdodHRwczovL2V4YW1wbGUuY29tLy53ZWxsLWtub3duL29hdXRoLXByb3RlY3RlZC1yZXNvdXJjZS9hcGkvdjEnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmZXRjaFN0dWIuc2Vjb25kQ2FsbC5hcmdzWzBdLCAnaHR0cHM6Ly9leGFtcGxlLmNvbS8ud2VsbC1rbm93bi9vYXV0aC1wcm90ZWN0ZWQtcmVzb3VyY2UnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB2YWxpZGF0ZSBhZ2FpbnN0IHRhcmdldFJlc291cmNlIHdoZW4gcmVzb3VyY2VNZXRhZGF0YVVybCBpcyBleHBsaWNpdGx5IHByb3ZpZGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0UmVzb3VyY2UgPSAnaHR0cHM6Ly9leGFtcGxlLmNvbS9hcGkvdjEnO1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VNZXRhZGF0YVVybCA9ICdodHRwczovL2V4YW1wbGUuY29tLy53ZWxsLWtub3duL29hdXRoLXByb3RlY3RlZC1yZXNvdXJjZSc7XG5cdFx0XHQvLyBXaGVuIGV4cGxpY2l0IFVSTCBwcm92aWRlZCAoZS5nLiwgZnJvbSBXV1ctQXV0aGVudGljYXRlKSwgbXVzdCBtYXRjaCB0YXJnZXRSZXNvdXJjZVxuXHRcdFx0Y29uc3QgdmFsaWRNZXRhZGF0YSA9IHtcblx0XHRcdFx0cmVzb3VyY2U6ICdodHRwczovL2V4YW1wbGUuY29tL2FwaS92MScsXG5cdFx0XHRcdHNjb3Blc19zdXBwb3J0ZWQ6IFsncmVhZCddXG5cdFx0XHR9O1xuXG5cdFx0XHRmZXRjaFN0dWIucmVzb2x2ZXMoe1xuXHRcdFx0XHRzdGF0dXM6IDIwMCxcblx0XHRcdFx0anNvbjogYXN5bmMgKCkgPT4gdmFsaWRNZXRhZGF0YSxcblx0XHRcdFx0dGV4dDogYXN5bmMgKCkgPT4gSlNPTi5zdHJpbmdpZnkodmFsaWRNZXRhZGF0YSlcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBmZXRjaFJlc291cmNlTWV0YWRhdGEoXG5cdFx0XHRcdHRhcmdldFJlc291cmNlLFxuXHRcdFx0XHRyZXNvdXJjZU1ldGFkYXRhVXJsLFxuXHRcdFx0XHR7IGZldGNoOiBmZXRjaFN0dWIgfVxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWV0YWRhdGEsIHZhbGlkTWV0YWRhdGEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5kaXNjb3ZlcnlVcmwsIHJlc291cmNlTWV0YWRhdGFVcmwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZldGNoU3R1Yi5jYWxsQ291bnQsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZldGNoU3R1Yi5maXJzdENhbGwuYXJnc1swXSwgcmVzb3VyY2VNZXRhZGF0YVVybCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZmFsbGJhY2sgdG8gcm9vdCBkaXNjb3Zlcnkgd2hlbiBleHBsaWNpdCByZXNvdXJjZU1ldGFkYXRhVXJsIHZhbGlkYXRpb24gZmFpbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXRSZXNvdXJjZSA9ICdodHRwczovL2V4YW1wbGUuY29tL2FwaS92MSc7XG5cdFx0XHRjb25zdCByZXNvdXJjZU1ldGFkYXRhVXJsID0gJ2h0dHBzOi8vZXhhbXBsZS5jb20vLndlbGwta25vd24vb2F1dGgtcHJvdGVjdGVkLXJlc291cmNlJztcblx0XHRcdGNvbnN0IGludmFsaWRNZXRhZGF0YSA9IHtcblx0XHRcdFx0cmVzb3VyY2U6ICdodHRwczovL2V4YW1wbGUuY29tLycsXG5cdFx0XHRcdHNjb3Blc19zdXBwb3J0ZWQ6IFsncmVhZCddXG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBTdHViIGFsbCBVUkxzIHRvIHJldHVybiByb290IHJlc291cmNlIG1ldGFkYXRhXG5cdFx0XHQvLyBFeHBsaWNpdCBVUkwgcmV0dXJucyByb290ICh2YWxpZGF0aW9uIGZhaWxzKSwgcGF0aC1hcHBlbmRlZCBmYWlscywgcm9vdCBzdWNjZWVkc1xuXHRcdFx0ZmV0Y2hTdHViLnJlc29sdmVzKHtcblx0XHRcdFx0c3RhdHVzOiAyMDAsXG5cdFx0XHRcdGpzb246IGFzeW5jICgpID0+IGludmFsaWRNZXRhZGF0YSxcblx0XHRcdFx0dGV4dDogYXN5bmMgKCkgPT4gSlNPTi5zdHJpbmdpZnkoaW52YWxpZE1ldGFkYXRhKVxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFNob3VsZCBzdWNjZWVkIG9uIHJvb3QgZGlzY292ZXJ5IGZhbGxiYWNrXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBmZXRjaFJlc291cmNlTWV0YWRhdGEodGFyZ2V0UmVzb3VyY2UsIHJlc291cmNlTWV0YWRhdGFVcmwsIHsgZmV0Y2g6IGZldGNoU3R1YiB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1ldGFkYXRhLCBpbnZhbGlkTWV0YWRhdGEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5kaXNjb3ZlcnlVcmwsICdodHRwczovL2V4YW1wbGUuY29tLy53ZWxsLWtub3duL29hdXRoLXByb3RlY3RlZC1yZXNvdXJjZScpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5lcnJvcnMubGVuZ3RoID49IDEpO1xuXHRcdFx0Ly8gU2hvdWxkIGhhdmUgdHJpZWQgZXhwbGljaXQgVVJMLCBwYXRoLWFwcGVuZGVkLCB0aGVuIHN1Y2NlZWRlZCBvbiByb290XG5cdFx0XHRhc3NlcnQub2soZmV0Y2hTdHViLmNhbGxDb3VudCA+PSAyKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgZmV0Y2hJbXBsIHRocm93aW5nIGVycm9yIHdpdGggZXhwbGljaXQgcmVzb3VyY2VNZXRhZGF0YVVybCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldFJlc291cmNlID0gJ2h0dHBzOi8vZXhhbXBsZS5jb20vYXBpJztcblx0XHRcdGNvbnN0IHJlc291cmNlTWV0YWRhdGFVcmwgPSAnaHR0cHM6Ly9leGFtcGxlLmNvbS8ud2VsbC1rbm93bi9vYXV0aC1wcm90ZWN0ZWQtcmVzb3VyY2UnO1xuXG5cdFx0XHQvLyBTdHViIGFsbCBwb3NzaWJsZSBVUkxzIHRvIHRocm93IG5ldHdvcmsgZXJyb3IgZm9yIHJvYnVzdCBmYWxsYmFjayB0ZXN0aW5nXG5cdFx0XHRmZXRjaFN0dWIucmVqZWN0cyhuZXcgRXJyb3IoJ0ROUyByZXNvbHV0aW9uIGZhaWxlZCcpKTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRcdGFzeW5jICgpID0+IGZldGNoUmVzb3VyY2VNZXRhZGF0YSh0YXJnZXRSZXNvdXJjZSwgcmVzb3VyY2VNZXRhZGF0YVVybCwgeyBmZXRjaDogZmV0Y2hTdHViIH0pLFxuXHRcdFx0XHQoZXJyb3I6IGFueSkgPT4ge1xuXHRcdFx0XHRcdC8vIFNob3VsZCBiZSBBZ2dyZWdhdGVFcnJvciBzaW5jZSBhbGwgVVJMcyBmYWlsXG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKGVycm9yIGluc3RhbmNlb2YgQWdncmVnYXRlRXJyb3IgfHwgL0ROUyByZXNvbHV0aW9uIGZhaWxlZC8udGVzdChlcnJvci5tZXNzYWdlKSk7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cblx0XHRcdC8vIFNob3VsZCBoYXZlIHRyaWVkIGV4cGxpY2l0IFVSTCBhbmQgd2VsbC1rbm93biBkaXNjb3Zlcnlcblx0XHRcdGFzc2VydC5vayhmZXRjaFN0dWIuY2FsbENvdW50ID49IDIpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZmV0Y2hBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEnLCAoKSA9PiB7XG5cdFx0bGV0IHNhbmRib3g6IHNpbm9uLlNpbm9uU2FuZGJveDtcblx0XHRsZXQgZmV0Y2hTdHViOiBzaW5vbi5TaW5vblN0dWI7XG5cblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRzYW5kYm94ID0gc2lub24uY3JlYXRlU2FuZGJveCgpO1xuXHRcdFx0ZmV0Y2hTdHViID0gc2FuZGJveC5zdHViKCk7XG5cdFx0fSk7XG5cblx0XHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0XHRzYW5kYm94LnJlc3RvcmUoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBzdWNjZXNzZnVsbHkgZmV0Y2ggbWV0YWRhdGEgZnJvbSBPQXV0aCBkaXNjb3ZlcnkgZW5kcG9pbnQgd2l0aCBwYXRoIGluc2VydGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGF1dGhvcml6YXRpb25TZXJ2ZXIgPSAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tL3RlbmFudCc7XG5cdFx0XHRjb25zdCBleHBlY3RlZE1ldGFkYXRhOiBJQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhID0ge1xuXHRcdFx0XHRpc3N1ZXI6ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vdGVuYW50Jyxcblx0XHRcdFx0YXV0aG9yaXphdGlvbl9lbmRwb2ludDogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS90ZW5hbnQvYXV0aG9yaXplJyxcblx0XHRcdFx0dG9rZW5fZW5kcG9pbnQ6ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vdGVuYW50L3Rva2VuJyxcblx0XHRcdFx0cmVzcG9uc2VfdHlwZXNfc3VwcG9ydGVkOiBbJ2NvZGUnXVxuXHRcdFx0fTtcblxuXHRcdFx0ZmV0Y2hTdHViLnJlc29sdmVzKHtcblx0XHRcdFx0c3RhdHVzOiAyMDAsXG5cdFx0XHRcdGpzb246IGFzeW5jICgpID0+IGV4cGVjdGVkTWV0YWRhdGEsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+IEpTT04uc3RyaW5naWZ5KGV4cGVjdGVkTWV0YWRhdGEpLFxuXHRcdFx0XHRzdGF0dXNUZXh0OiAnT0snXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZmV0Y2hBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEoYXV0aG9yaXphdGlvblNlcnZlciwgeyBmZXRjaDogZmV0Y2hTdHViIH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tZXRhZGF0YSwgZXhwZWN0ZWRNZXRhZGF0YSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmRpc2NvdmVyeVVybCwgJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS8ud2VsbC1rbm93bi9vYXV0aC1hdXRob3JpemF0aW9uLXNlcnZlci90ZW5hbnQnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LmVycm9ycywgW10pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZldGNoU3R1Yi5jYWxsQ291bnQsIDEpO1xuXHRcdFx0Ly8gU2hvdWxkIHRyeSBPQXV0aCBkaXNjb3Zlcnkgd2l0aCBwYXRoIGluc2VydGlvbjogaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tLy53ZWxsLWtub3duL29hdXRoLWF1dGhvcml6YXRpb24tc2VydmVyL3RlbmFudFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZldGNoU3R1Yi5maXJzdENhbGwuYXJnc1swXSwgJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS8ud2VsbC1rbm93bi9vYXV0aC1hdXRob3JpemF0aW9uLXNlcnZlci90ZW5hbnQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmZXRjaFN0dWIuZmlyc3RDYWxsLmFyZ3NbMV0ubWV0aG9kLCAnR0VUJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZmFsbGJhY2sgdG8gT3BlbklEIENvbm5lY3QgZGlzY292ZXJ5IHdpdGggcGF0aCBpbnNlcnRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhdXRob3JpemF0aW9uU2VydmVyID0gJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS90ZW5hbnQnO1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRNZXRhZGF0YTogSUF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSA9IHtcblx0XHRcdFx0aXNzdWVyOiAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tL3RlbmFudCcsXG5cdFx0XHRcdGF1dGhvcml6YXRpb25fZW5kcG9pbnQ6ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vdGVuYW50L2F1dGhvcml6ZScsXG5cdFx0XHRcdHRva2VuX2VuZHBvaW50OiAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tL3RlbmFudC90b2tlbicsXG5cdFx0XHRcdHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJ11cblx0XHRcdH07XG5cblx0XHRcdC8vIEZpcnN0IGNhbGwgZmFpbHMsIHNlY29uZCBzdWNjZWVkc1xuXHRcdFx0ZmV0Y2hTdHViLm9uRmlyc3RDYWxsKCkucmVzb2x2ZXMoe1xuXHRcdFx0XHRzdGF0dXM6IDQwNCxcblx0XHRcdFx0dGV4dDogYXN5bmMgKCkgPT4gJ05vdCBGb3VuZCcsXG5cdFx0XHRcdHN0YXR1c1RleHQ6ICdOb3QgRm91bmQnLFxuXHRcdFx0XHRqc29uOiBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignTm90IEpTT04nKTsgfVxuXHRcdFx0fSk7XG5cblx0XHRcdGZldGNoU3R1Yi5vblNlY29uZENhbGwoKS5yZXNvbHZlcyh7XG5cdFx0XHRcdHN0YXR1czogMjAwLFxuXHRcdFx0XHRqc29uOiBhc3luYyAoKSA9PiBleHBlY3RlZE1ldGFkYXRhLFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiBKU09OLnN0cmluZ2lmeShleHBlY3RlZE1ldGFkYXRhKSxcblx0XHRcdFx0c3RhdHVzVGV4dDogJ09LJ1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZldGNoQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhKGF1dGhvcml6YXRpb25TZXJ2ZXIsIHsgZmV0Y2g6IGZldGNoU3R1YiB9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWV0YWRhdGEsIGV4cGVjdGVkTWV0YWRhdGEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5kaXNjb3ZlcnlVcmwsICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vLndlbGwta25vd24vb3BlbmlkLWNvbmZpZ3VyYXRpb24vdGVuYW50Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVycm9ycy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZldGNoU3R1Yi5jYWxsQ291bnQsIDIpO1xuXHRcdFx0Ly8gRmlyc3QgYXR0ZW1wdDogT0F1dGggZGlzY292ZXJ5XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmV0Y2hTdHViLmZpcnN0Q2FsbC5hcmdzWzBdLCAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tLy53ZWxsLWtub3duL29hdXRoLWF1dGhvcml6YXRpb24tc2VydmVyL3RlbmFudCcpO1xuXHRcdFx0Ly8gU2Vjb25kIGF0dGVtcHQ6IE9wZW5JRCBDb25uZWN0IGRpc2NvdmVyeSB3aXRoIHBhdGggaW5zZXJ0aW9uXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmV0Y2hTdHViLnNlY29uZENhbGwuYXJnc1swXSwgJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS8ud2VsbC1rbm93bi9vcGVuaWQtY29uZmlndXJhdGlvbi90ZW5hbnQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBmYWxsYmFjayB0byBPcGVuSUQgQ29ubmVjdCBkaXNjb3Zlcnkgd2l0aCBwYXRoIGFkZGl0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYXV0aG9yaXphdGlvblNlcnZlciA9ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vdGVuYW50Jztcblx0XHRcdGNvbnN0IGV4cGVjdGVkTWV0YWRhdGE6IElBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEgPSB7XG5cdFx0XHRcdGlzc3VlcjogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS90ZW5hbnQnLFxuXHRcdFx0XHRhdXRob3JpemF0aW9uX2VuZHBvaW50OiAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tL3RlbmFudC9hdXRob3JpemUnLFxuXHRcdFx0XHR0b2tlbl9lbmRwb2ludDogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS90ZW5hbnQvdG9rZW4nLFxuXHRcdFx0XHRyZXNwb25zZV90eXBlc19zdXBwb3J0ZWQ6IFsnY29kZSddXG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBGaXJzdCB0d28gY2FsbHMgZmFpbCwgdGhpcmQgc3VjY2VlZHNcblx0XHRcdGZldGNoU3R1Yi5vbkZpcnN0Q2FsbCgpLnJlc29sdmVzKHtcblx0XHRcdFx0c3RhdHVzOiA0MDQsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+ICdOb3QgRm91bmQnLFxuXHRcdFx0XHRzdGF0dXNUZXh0OiAnTm90IEZvdW5kJyxcblx0XHRcdFx0anNvbjogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ05vdCBKU09OJyk7IH1cblx0XHRcdH0pO1xuXG5cdFx0XHRmZXRjaFN0dWIub25TZWNvbmRDYWxsKCkucmVzb2x2ZXMoe1xuXHRcdFx0XHRzdGF0dXM6IDQwNCxcblx0XHRcdFx0dGV4dDogYXN5bmMgKCkgPT4gJ05vdCBGb3VuZCcsXG5cdFx0XHRcdHN0YXR1c1RleHQ6ICdOb3QgRm91bmQnLFxuXHRcdFx0XHRqc29uOiBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignTm90IEpTT04nKTsgfVxuXHRcdFx0fSk7XG5cblx0XHRcdGZldGNoU3R1Yi5vblRoaXJkQ2FsbCgpLnJlc29sdmVzKHtcblx0XHRcdFx0c3RhdHVzOiAyMDAsXG5cdFx0XHRcdGpzb246IGFzeW5jICgpID0+IGV4cGVjdGVkTWV0YWRhdGEsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+IEpTT04uc3RyaW5naWZ5KGV4cGVjdGVkTWV0YWRhdGEpLFxuXHRcdFx0XHRzdGF0dXNUZXh0OiAnT0snXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZmV0Y2hBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEoYXV0aG9yaXphdGlvblNlcnZlciwgeyBmZXRjaDogZmV0Y2hTdHViIH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tZXRhZGF0YSwgZXhwZWN0ZWRNZXRhZGF0YSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmRpc2NvdmVyeVVybCwgJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS90ZW5hbnQvLndlbGwta25vd24vb3BlbmlkLWNvbmZpZ3VyYXRpb24nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZXJyb3JzLmxlbmd0aCwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmV0Y2hTdHViLmNhbGxDb3VudCwgMyk7XG5cdFx0XHQvLyBGaXJzdCBhdHRlbXB0OiBPQXV0aCBkaXNjb3Zlcnlcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmZXRjaFN0dWIuZmlyc3RDYWxsLmFyZ3NbMF0sICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vLndlbGwta25vd24vb2F1dGgtYXV0aG9yaXphdGlvbi1zZXJ2ZXIvdGVuYW50Jyk7XG5cdFx0XHQvLyBTZWNvbmQgYXR0ZW1wdDogT3BlbklEIENvbm5lY3QgZGlzY292ZXJ5IHdpdGggcGF0aCBpbnNlcnRpb25cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmZXRjaFN0dWIuc2Vjb25kQ2FsbC5hcmdzWzBdLCAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tLy53ZWxsLWtub3duL29wZW5pZC1jb25maWd1cmF0aW9uL3RlbmFudCcpO1xuXHRcdFx0Ly8gVGhpcmQgYXR0ZW1wdDogT3BlbklEIENvbm5lY3QgZGlzY292ZXJ5IHdpdGggcGF0aCBhZGRpdGlvblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZldGNoU3R1Yi50aGlyZENhbGwuYXJnc1swXSwgJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS90ZW5hbnQvLndlbGwta25vd24vb3BlbmlkLWNvbmZpZ3VyYXRpb24nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgYXV0aG9yaXphdGlvbiBzZXJ2ZXIgYXQgcm9vdCB3aXRob3V0IGV4dHJhIHBhdGgnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhdXRob3JpemF0aW9uU2VydmVyID0gJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbSc7XG5cdFx0XHRjb25zdCBleHBlY3RlZE1ldGFkYXRhOiBJQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhID0ge1xuXHRcdFx0XHRpc3N1ZXI6ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vJyxcblx0XHRcdFx0YXV0aG9yaXphdGlvbl9lbmRwb2ludDogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS9hdXRob3JpemUnLFxuXHRcdFx0XHR0b2tlbl9lbmRwb2ludDogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS90b2tlbicsXG5cdFx0XHRcdHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJ11cblx0XHRcdH07XG5cblx0XHRcdGZldGNoU3R1Yi5yZXNvbHZlcyh7XG5cdFx0XHRcdHN0YXR1czogMjAwLFxuXHRcdFx0XHRqc29uOiBhc3luYyAoKSA9PiBleHBlY3RlZE1ldGFkYXRhLFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiBKU09OLnN0cmluZ2lmeShleHBlY3RlZE1ldGFkYXRhKSxcblx0XHRcdFx0c3RhdHVzVGV4dDogJ09LJ1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZldGNoQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhKGF1dGhvcml6YXRpb25TZXJ2ZXIsIHsgZmV0Y2g6IGZldGNoU3R1YiB9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWV0YWRhdGEsIGV4cGVjdGVkTWV0YWRhdGEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5kaXNjb3ZlcnlVcmwsICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vLndlbGwta25vd24vb2F1dGgtYXV0aG9yaXphdGlvbi1zZXJ2ZXInKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LmVycm9ycywgW10pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZldGNoU3R1Yi5jYWxsQ291bnQsIDEpO1xuXHRcdFx0Ly8gRm9yIHJvb3QgVVJMcywgbm8gZXh0cmEgcGF0aCBpcyBhZGRlZFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZldGNoU3R1Yi5maXJzdENhbGwuYXJnc1swXSwgJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS8ud2VsbC1rbm93bi9vYXV0aC1hdXRob3JpemF0aW9uLXNlcnZlcicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBhdXRob3JpemF0aW9uIHNlcnZlciB3aXRoIHRyYWlsaW5nIHNsYXNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYXV0aG9yaXphdGlvblNlcnZlciA9ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vdGVuYW50Lyc7XG5cdFx0XHRjb25zdCBleHBlY3RlZE1ldGFkYXRhOiBJQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhID0ge1xuXHRcdFx0XHRpc3N1ZXI6ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vdGVuYW50LycsXG5cdFx0XHRcdGF1dGhvcml6YXRpb25fZW5kcG9pbnQ6ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vdGVuYW50L2F1dGhvcml6ZScsXG5cdFx0XHRcdHRva2VuX2VuZHBvaW50OiAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tL3RlbmFudC90b2tlbicsXG5cdFx0XHRcdHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJ11cblx0XHRcdH07XG5cblx0XHRcdGZldGNoU3R1Yi5yZXNvbHZlcyh7XG5cdFx0XHRcdHN0YXR1czogMjAwLFxuXHRcdFx0XHRqc29uOiBhc3luYyAoKSA9PiBleHBlY3RlZE1ldGFkYXRhLFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiBKU09OLnN0cmluZ2lmeShleHBlY3RlZE1ldGFkYXRhKSxcblx0XHRcdFx0c3RhdHVzVGV4dDogJ09LJ1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZldGNoQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhKGF1dGhvcml6YXRpb25TZXJ2ZXIsIHsgZmV0Y2g6IGZldGNoU3R1YiB9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWV0YWRhdGEsIGV4cGVjdGVkTWV0YWRhdGEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5kaXNjb3ZlcnlVcmwsICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vLndlbGwta25vd24vb2F1dGgtYXV0aG9yaXphdGlvbi1zZXJ2ZXIvdGVuYW50LycpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuZXJyb3JzLCBbXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmV0Y2hTdHViLmNhbGxDb3VudCwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaW5jbHVkZSBhZGRpdGlvbmFsIGhlYWRlcnMgaW4gYWxsIHJlcXVlc3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYXV0aG9yaXphdGlvblNlcnZlciA9ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vdGVuYW50Jztcblx0XHRcdGNvbnN0IGFkZGl0aW9uYWxIZWFkZXJzID0ge1xuXHRcdFx0XHQnWC1DdXN0b20tSGVhZGVyJzogJ2N1c3RvbS12YWx1ZScsXG5cdFx0XHRcdCdBdXRob3JpemF0aW9uJzogJ0JlYXJlciB0b2tlbjEyMydcblx0XHRcdH07XG5cdFx0XHRjb25zdCBleHBlY3RlZE1ldGFkYXRhOiBJQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhID0ge1xuXHRcdFx0XHRpc3N1ZXI6ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vdGVuYW50Jyxcblx0XHRcdFx0cmVzcG9uc2VfdHlwZXNfc3VwcG9ydGVkOiBbJ2NvZGUnXVxuXHRcdFx0fTtcblxuXHRcdFx0ZmV0Y2hTdHViLnJlc29sdmVzKHtcblx0XHRcdFx0c3RhdHVzOiAyMDAsXG5cdFx0XHRcdGpzb246IGFzeW5jICgpID0+IGV4cGVjdGVkTWV0YWRhdGEsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+IEpTT04uc3RyaW5naWZ5KGV4cGVjdGVkTWV0YWRhdGEpLFxuXHRcdFx0XHRzdGF0dXNUZXh0OiAnT0snXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZmV0Y2hBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEoYXV0aG9yaXphdGlvblNlcnZlciwgeyBmZXRjaDogZmV0Y2hTdHViLCBhZGRpdGlvbmFsSGVhZGVycyB9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5kaXNjb3ZlcnlVcmwsICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vLndlbGwta25vd24vb2F1dGgtYXV0aG9yaXphdGlvbi1zZXJ2ZXIvdGVuYW50Jyk7XG5cdFx0XHRjb25zdCBoZWFkZXJzID0gZmV0Y2hTdHViLmZpcnN0Q2FsbC5hcmdzWzFdLmhlYWRlcnM7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1snWC1DdXN0b20tSGVhZGVyJ10sICdjdXN0b20tdmFsdWUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWydBdXRob3JpemF0aW9uJ10sICdCZWFyZXIgdG9rZW4xMjMnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWydBY2NlcHQnXSwgJ2FwcGxpY2F0aW9uL2pzb24nKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgdGhyb3cgQWdncmVnYXRlRXJyb3Igd2hlbiBhbGwgZGlzY292ZXJ5IGVuZHBvaW50cyBmYWlsJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYXV0aG9yaXphdGlvblNlcnZlciA9ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vdGVuYW50JztcblxuXHRcdFx0ZmV0Y2hTdHViLnJlc29sdmVzKHtcblx0XHRcdFx0c3RhdHVzOiA0MDQsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+ICdOb3QgRm91bmQnLFxuXHRcdFx0XHRzdGF0dXNUZXh0OiAnTm90IEZvdW5kJyxcblx0XHRcdFx0anNvbjogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ05vdCBKU09OJyk7IH1cblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdFx0YXN5bmMgKCkgPT4gZmV0Y2hBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEoYXV0aG9yaXphdGlvblNlcnZlciwgeyBmZXRjaDogZmV0Y2hTdHViIH0pLFxuXHRcdFx0XHQoZXJyb3I6IGFueSkgPT4ge1xuXHRcdFx0XHRcdGFzc2VydC5vayhlcnJvciBpbnN0YW5jZW9mIEFnZ3JlZ2F0ZUVycm9yLCAnU2hvdWxkIGJlIGFuIEFnZ3JlZ2F0ZUVycm9yJyk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yLmVycm9ycy5sZW5ndGgsIDMsICdTaG91bGQgY29udGFpbiAzIGVycm9ycyAob25lIGZvciBlYWNoIFVSTCknKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3IubWVzc2FnZSwgJ0ZhaWxlZCB0byBmZXRjaCBhdXRob3JpemF0aW9uIHNlcnZlciBtZXRhZGF0YSBmcm9tIGFsbCBhdHRlbXB0ZWQgVVJMcycpO1xuXHRcdFx0XHRcdC8vIFZlcmlmeSBlYWNoIGVycm9yIGluY2x1ZGVzIHRoZSBVUkwgaXQgYXR0ZW1wdGVkXG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKC9vYXV0aC1hdXRob3JpemF0aW9uLXNlcnZlci4qNDA0Ly50ZXN0KGVycm9yLmVycm9yc1swXS5tZXNzYWdlKSwgJ0ZpcnN0IGVycm9yIHNob3VsZCBtZW50aW9uIE9BdXRoIGRpc2NvdmVyeSBhbmQgNDA0Jyk7XG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKC9vcGVuaWQtY29uZmlndXJhdGlvbi4qNDA0Ly50ZXN0KGVycm9yLmVycm9yc1sxXS5tZXNzYWdlKSwgJ1NlY29uZCBlcnJvciBzaG91bGQgbWVudGlvbiBPcGVuSUQgcGF0aCBpbnNlcnRpb24gYW5kIDQwNCcpO1xuXHRcdFx0XHRcdGFzc2VydC5vaygvb3BlbmlkLWNvbmZpZ3VyYXRpb24uKjQwNC8udGVzdChlcnJvci5lcnJvcnNbMl0ubWVzc2FnZSksICdUaGlyZCBlcnJvciBzaG91bGQgbWVudGlvbiBPcGVuSUQgcGF0aCBhZGRpdGlvbiBhbmQgNDA0Jyk7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cblx0XHRcdC8vIFNob3VsZCBoYXZlIHRyaWVkIGFsbCB0aHJlZSBlbmRwb2ludHNcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmZXRjaFN0dWIuY2FsbENvdW50LCAzKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB0aHJvdyBzaW5nbGUgZXJyb3IgKG5vdCBBZ2dyZWdhdGVFcnJvcikgd2hlbiBvbmx5IG9uZSBVUkwgaXMgdHJpZWQgYW5kIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYXV0aG9yaXphdGlvblNlcnZlciA9ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20nO1xuXG5cdFx0XHQvLyBGaXJzdCBhdHRlbXB0IHN1Y2NlZWRzIG9uIHNlY29uZCB0cnksIHNvIG9ubHkgb25lIGVycm9yIGlzIGNvbGxlY3RlZCBmb3IgZmlyc3QgVVJMXG5cdFx0XHRmZXRjaFN0dWIub25GaXJzdENhbGwoKS5yZXNvbHZlcyh7XG5cdFx0XHRcdHN0YXR1czogNTAwLFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiAnSW50ZXJuYWwgU2VydmVyIEVycm9yJyxcblx0XHRcdFx0c3RhdHVzVGV4dDogJ0ludGVybmFsIFNlcnZlciBFcnJvcicsXG5cdFx0XHRcdGpzb246IGFzeW5jICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdOb3QgSlNPTicpOyB9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgZXhwZWN0ZWRNZXRhZGF0YTogSUF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSA9IHtcblx0XHRcdFx0aXNzdWVyOiAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tLycsXG5cdFx0XHRcdHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJ11cblx0XHRcdH07XG5cblx0XHRcdGZldGNoU3R1Yi5vblNlY29uZENhbGwoKS5yZXNvbHZlcyh7XG5cdFx0XHRcdHN0YXR1czogMjAwLFxuXHRcdFx0XHRqc29uOiBhc3luYyAoKSA9PiBleHBlY3RlZE1ldGFkYXRhLFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiBKU09OLnN0cmluZ2lmeShleHBlY3RlZE1ldGFkYXRhKSxcblx0XHRcdFx0c3RhdHVzVGV4dDogJ09LJ1xuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFNob3VsZCBzdWNjZWVkIG9uIHNlY29uZCBhdHRlbXB0XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBmZXRjaEF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YShhdXRob3JpemF0aW9uU2VydmVyLCB7IGZldGNoOiBmZXRjaFN0dWIgfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tZXRhZGF0YSwgZXhwZWN0ZWRNZXRhZGF0YSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVycm9ycy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZldGNoU3R1Yi5jYWxsQ291bnQsIDIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHRocm93IEFnZ3JlZ2F0ZUVycm9yIHdoZW4gbXVsdGlwbGUgVVJMcyBmYWlsIHdpdGggbWl4ZWQgZXJyb3IgdHlwZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhdXRob3JpemF0aW9uU2VydmVyID0gJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS90ZW5hbnQnO1xuXG5cdFx0XHQvLyBGaXJzdCBjYWxsOiBuZXR3b3JrIGVycm9yXG5cdFx0XHRmZXRjaFN0dWIub25GaXJzdENhbGwoKS5yZWplY3RzKG5ldyBFcnJvcignQ29ubmVjdGlvbiB0aW1lb3V0JykpO1xuXG5cdFx0XHQvLyBTZWNvbmQgY2FsbDogNDA0XG5cdFx0XHRmZXRjaFN0dWIub25TZWNvbmRDYWxsKCkucmVzb2x2ZXMoe1xuXHRcdFx0XHRzdGF0dXM6IDQwNCxcblx0XHRcdFx0dGV4dDogYXN5bmMgKCkgPT4gJ05vdCBGb3VuZCcsXG5cdFx0XHRcdHN0YXR1c1RleHQ6ICdOb3QgRm91bmQnLFxuXHRcdFx0XHRqc29uOiBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignTm90IEpTT04nKTsgfVxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFRoaXJkIGNhbGw6IDUwMFxuXHRcdFx0ZmV0Y2hTdHViLm9uVGhpcmRDYWxsKCkucmVzb2x2ZXMoe1xuXHRcdFx0XHRzdGF0dXM6IDUwMCxcblx0XHRcdFx0dGV4dDogYXN5bmMgKCkgPT4gJ0ludGVybmFsIFNlcnZlciBFcnJvcicsXG5cdFx0XHRcdHN0YXR1c1RleHQ6ICdJbnRlcm5hbCBTZXJ2ZXIgRXJyb3InLFxuXHRcdFx0XHRqc29uOiBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignTm90IEpTT04nKTsgfVxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0XHRhc3luYyAoKSA9PiBmZXRjaEF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YShhdXRob3JpemF0aW9uU2VydmVyLCB7IGZldGNoOiBmZXRjaFN0dWIgfSksXG5cdFx0XHRcdChlcnJvcjogYW55KSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKGVycm9yIGluc3RhbmNlb2YgQWdncmVnYXRlRXJyb3IsICdTaG91bGQgYmUgYW4gQWdncmVnYXRlRXJyb3InKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3IuZXJyb3JzLmxlbmd0aCwgMywgJ1Nob3VsZCBjb250YWluIDMgZXJyb3JzJyk7XG5cdFx0XHRcdFx0Ly8gRmlyc3QgZXJyb3IgaXMgbmV0d29yayBlcnJvclxuXHRcdFx0XHRcdGFzc2VydC5vaygvQ29ubmVjdGlvbiB0aW1lb3V0Ly50ZXN0KGVycm9yLmVycm9yc1swXS5tZXNzYWdlKSwgJ0ZpcnN0IGVycm9yIHNob3VsZCBiZSBuZXR3b3JrIGVycm9yJyk7XG5cdFx0XHRcdFx0Ly8gU2Vjb25kIGVycm9yIGlzIDQwNFxuXHRcdFx0XHRcdGFzc2VydC5vaygvNDA0LipOb3QgRm91bmQvLnRlc3QoZXJyb3IuZXJyb3JzWzFdLm1lc3NhZ2UpLCAnU2Vjb25kIGVycm9yIHNob3VsZCBiZSA0MDQnKTtcblx0XHRcdFx0XHQvLyBUaGlyZCBlcnJvciBpcyA1MDBcblx0XHRcdFx0XHRhc3NlcnQub2soLzUwMC4qSW50ZXJuYWwgU2VydmVyIEVycm9yLy50ZXN0KGVycm9yLmVycm9yc1syXS5tZXNzYWdlKSwgJ1RoaXJkIGVycm9yIHNob3VsZCBiZSA1MDAnKTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZldGNoU3R1Yi5jYWxsQ291bnQsIDMpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBpbnZhbGlkIEpTT04gcmVzcG9uc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhdXRob3JpemF0aW9uU2VydmVyID0gJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbSc7XG5cblx0XHRcdGZldGNoU3R1Yi5yZXNvbHZlcyh7XG5cdFx0XHRcdHN0YXR1czogMjAwLFxuXHRcdFx0XHRqc29uOiBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignSW52YWxpZCBKU09OJyk7IH0sXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+ICdJbnZhbGlkIEpTT04nLFxuXHRcdFx0XHRzdGF0dXNUZXh0OiAnT0snXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRcdGFzeW5jICgpID0+IGZldGNoQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhKGF1dGhvcml6YXRpb25TZXJ2ZXIsIHsgZmV0Y2g6IGZldGNoU3R1YiB9KSxcblx0XHRcdFx0L0ZhaWxlZCB0byBmZXRjaCBhdXRob3JpemF0aW9uIHNlcnZlciBtZXRhZGF0YS9cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIHZhbGlkIEpTT04gYnV0IGludmFsaWQgbWV0YWRhdGEgc3RydWN0dXJlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYXV0aG9yaXphdGlvblNlcnZlciA9ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20nO1xuXHRcdFx0Y29uc3QgaW52YWxpZE1ldGFkYXRhID0ge1xuXHRcdFx0XHQvLyBNaXNzaW5nIHJlcXVpcmVkICdpc3N1ZXInIGZpZWxkXG5cdFx0XHRcdGF1dGhvcml6YXRpb25fZW5kcG9pbnQ6ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vYXV0aG9yaXplJ1xuXHRcdFx0fTtcblxuXHRcdFx0ZmV0Y2hTdHViLnJlc29sdmVzKHtcblx0XHRcdFx0c3RhdHVzOiAyMDAsXG5cdFx0XHRcdGpzb246IGFzeW5jICgpID0+IGludmFsaWRNZXRhZGF0YSxcblx0XHRcdFx0dGV4dDogYXN5bmMgKCkgPT4gSlNPTi5zdHJpbmdpZnkoaW52YWxpZE1ldGFkYXRhKSxcblx0XHRcdFx0c3RhdHVzVGV4dDogJ09LJ1xuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0XHRhc3luYyAoKSA9PiBmZXRjaEF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YShhdXRob3JpemF0aW9uU2VydmVyLCB7IGZldGNoOiBmZXRjaFN0dWIgfSksXG5cdFx0XHRcdC9GYWlsZWQgdG8gZmV0Y2ggYXV0aG9yaXphdGlvbiBzZXJ2ZXIgbWV0YWRhdGEvXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHVzZSBnbG9iYWwgZmV0Y2ggd2hlbiBjdXN0b20gZmV0Y2ggaXMgbm90IHByb3ZpZGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYXV0aG9yaXphdGlvblNlcnZlciA9ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20nO1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRNZXRhZGF0YTogSUF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSA9IHtcblx0XHRcdFx0aXNzdWVyOiAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tLycsXG5cdFx0XHRcdHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJ11cblx0XHRcdH07XG5cblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0Y29uc3QgZ2xvYmFsRmV0Y2hTdHViID0gc2FuZGJveC5zdHViKGdsb2JhbFRoaXMsICdmZXRjaCcpLnJlc29sdmVzKHtcblx0XHRcdFx0c3RhdHVzOiAyMDAsXG5cdFx0XHRcdGpzb246IGFzeW5jICgpID0+IGV4cGVjdGVkTWV0YWRhdGEsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+IEpTT04uc3RyaW5naWZ5KGV4cGVjdGVkTWV0YWRhdGEpLFxuXHRcdFx0XHRzdGF0dXNUZXh0OiAnT0snXG5cdFx0XHR9IGFzIGFueSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZldGNoQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhKGF1dGhvcml6YXRpb25TZXJ2ZXIpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tZXRhZGF0YSwgZXhwZWN0ZWRNZXRhZGF0YSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmRpc2NvdmVyeVVybCwgJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS8ud2VsbC1rbm93bi9vYXV0aC1hdXRob3JpemF0aW9uLXNlcnZlcicpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuZXJyb3JzLCBbXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYmFsRmV0Y2hTdHViLmNhbGxDb3VudCwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIG5ldHdvcmsgZmV0Y2ggZmFpbHVyZSBhbmQgY29udGludWUgdG8gbmV4dCBlbmRwb2ludCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGF1dGhvcml6YXRpb25TZXJ2ZXIgPSAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tJztcblx0XHRcdGNvbnN0IGV4cGVjdGVkTWV0YWRhdGE6IElBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEgPSB7XG5cdFx0XHRcdGlzc3VlcjogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS8nLFxuXHRcdFx0XHRyZXNwb25zZV90eXBlc19zdXBwb3J0ZWQ6IFsnY29kZSddXG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBGaXJzdCBjYWxsIHRocm93cyBuZXR3b3JrIGVycm9yLCBzZWNvbmQgc3VjY2VlZHNcblx0XHRcdGZldGNoU3R1Yi5vbkZpcnN0Q2FsbCgpLnJlamVjdHMobmV3IEVycm9yKCdOZXR3b3JrIGVycm9yJykpO1xuXHRcdFx0ZmV0Y2hTdHViLm9uU2Vjb25kQ2FsbCgpLnJlc29sdmVzKHtcblx0XHRcdFx0c3RhdHVzOiAyMDAsXG5cdFx0XHRcdGpzb246IGFzeW5jICgpID0+IGV4cGVjdGVkTWV0YWRhdGEsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+IEpTT04uc3RyaW5naWZ5KGV4cGVjdGVkTWV0YWRhdGEpLFxuXHRcdFx0XHRzdGF0dXNUZXh0OiAnT0snXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZmV0Y2hBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEoYXV0aG9yaXphdGlvblNlcnZlciwgeyBmZXRjaDogZmV0Y2hTdHViIH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tZXRhZGF0YSwgZXhwZWN0ZWRNZXRhZGF0YSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVycm9ycy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0Lm9rKC9OZXR3b3JrIGVycm9yLy50ZXN0KHJlc3VsdC5lcnJvcnNbMF0ubWVzc2FnZSkpO1xuXHRcdFx0Ly8gU2hvdWxkIGhhdmUgdHJpZWQgdHdvIGVuZHBvaW50c1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZldGNoU3R1Yi5jYWxsQ291bnQsIDIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHRocm93IGVycm9yIHdoZW4gbmV0d29yayBmYWlscyBvbiBhbGwgZW5kcG9pbnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYXV0aG9yaXphdGlvblNlcnZlciA9ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20nO1xuXG5cdFx0XHRmZXRjaFN0dWIucmVqZWN0cyhuZXcgRXJyb3IoJ05ldHdvcmsgZXJyb3InKSk7XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0XHRhc3luYyAoKSA9PiBmZXRjaEF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YShhdXRob3JpemF0aW9uU2VydmVyLCB7IGZldGNoOiBmZXRjaFN0dWIgfSksXG5cdFx0XHRcdChlcnJvcjogYW55KSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKGVycm9yIGluc3RhbmNlb2YgQWdncmVnYXRlRXJyb3IsICdTaG91bGQgYmUgYW4gQWdncmVnYXRlRXJyb3InKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3IuZXJyb3JzLmxlbmd0aCwgMywgJ1Nob3VsZCBjb250YWluIDMgZXJyb3JzJyk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yLm1lc3NhZ2UsICdGYWlsZWQgdG8gZmV0Y2ggYXV0aG9yaXphdGlvbiBzZXJ2ZXIgbWV0YWRhdGEgZnJvbSBhbGwgYXR0ZW1wdGVkIFVSTHMnKTtcblx0XHRcdFx0XHQvLyBBbGwgZXJyb3JzIHNob3VsZCBiZSBuZXR3b3JrIGVycm9yc1xuXHRcdFx0XHRcdGFzc2VydC5vaygvTmV0d29yayBlcnJvci8udGVzdChlcnJvci5lcnJvcnNbMF0ubWVzc2FnZSksICdGaXJzdCBlcnJvciBzaG91bGQgYmUgbmV0d29yayBlcnJvcicpO1xuXHRcdFx0XHRcdGFzc2VydC5vaygvTmV0d29yayBlcnJvci8udGVzdChlcnJvci5lcnJvcnNbMV0ubWVzc2FnZSksICdTZWNvbmQgZXJyb3Igc2hvdWxkIGJlIG5ldHdvcmsgZXJyb3InKTtcblx0XHRcdFx0XHRhc3NlcnQub2soL05ldHdvcmsgZXJyb3IvLnRlc3QoZXJyb3IuZXJyb3JzWzJdLm1lc3NhZ2UpLCAnVGhpcmQgZXJyb3Igc2hvdWxkIGJlIG5ldHdvcmsgZXJyb3InKTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0KTtcblxuXHRcdFx0Ly8gU2hvdWxkIGhhdmUgdHJpZWQgYWxsIHRocmVlIGVuZHBvaW50c1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZldGNoU3R1Yi5jYWxsQ291bnQsIDMpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBtaXggb2YgbmV0d29yayBlcnJvciBhbmQgbm9uLTIwMCByZXNwb25zZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGF1dGhvcml6YXRpb25TZXJ2ZXIgPSAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tL3RlbmFudCc7XG5cdFx0XHRjb25zdCBleHBlY3RlZE1ldGFkYXRhOiBJQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhID0ge1xuXHRcdFx0XHRpc3N1ZXI6ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vdGVuYW50Jyxcblx0XHRcdFx0cmVzcG9uc2VfdHlwZXNfc3VwcG9ydGVkOiBbJ2NvZGUnXVxuXHRcdFx0fTtcblxuXHRcdFx0Ly8gRmlyc3QgY2FsbCB0aHJvd3MgbmV0d29yayBlcnJvclxuXHRcdFx0ZmV0Y2hTdHViLm9uRmlyc3RDYWxsKCkucmVqZWN0cyhuZXcgRXJyb3IoJ0Nvbm5lY3Rpb24gdGltZW91dCcpKTtcblxuXHRcdFx0Ly8gU2Vjb25kIGNhbGwgcmV0dXJucyA0MDRcblx0XHRcdGZldGNoU3R1Yi5vblNlY29uZENhbGwoKS5yZXNvbHZlcyh7XG5cdFx0XHRcdHN0YXR1czogNDA0LFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiAnTm90IEZvdW5kJyxcblx0XHRcdFx0c3RhdHVzVGV4dDogJ05vdCBGb3VuZCcsXG5cdFx0XHRcdGpzb246IGFzeW5jICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdOb3QgSlNPTicpOyB9XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gVGhpcmQgY2FsbCBzdWNjZWVkc1xuXHRcdFx0ZmV0Y2hTdHViLm9uVGhpcmRDYWxsKCkucmVzb2x2ZXMoe1xuXHRcdFx0XHRzdGF0dXM6IDIwMCxcblx0XHRcdFx0anNvbjogYXN5bmMgKCkgPT4gZXhwZWN0ZWRNZXRhZGF0YSxcblx0XHRcdFx0dGV4dDogYXN5bmMgKCkgPT4gSlNPTi5zdHJpbmdpZnkoZXhwZWN0ZWRNZXRhZGF0YSksXG5cdFx0XHRcdHN0YXR1c1RleHQ6ICdPSydcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBmZXRjaEF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YShhdXRob3JpemF0aW9uU2VydmVyLCB7IGZldGNoOiBmZXRjaFN0dWIgfSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1ldGFkYXRhLCBleHBlY3RlZE1ldGFkYXRhKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZXJyb3JzLmxlbmd0aCwgMik7XG5cdFx0XHQvLyBTaG91bGQgaGF2ZSB0cmllZCBhbGwgdGhyZWUgZW5kcG9pbnRzXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmV0Y2hTdHViLmNhbGxDb3VudCwgMyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIHJlc3BvbnNlLnRleHQoKSBmYWlsdXJlIGluIGVycm9yIGNhc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhdXRob3JpemF0aW9uU2VydmVyID0gJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbSc7XG5cblx0XHRcdGZldGNoU3R1Yi5yZXNvbHZlcyh7XG5cdFx0XHRcdHN0YXR1czogNTAwLFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignQ2Fubm90IHJlYWQgdGV4dCcpOyB9LFxuXHRcdFx0XHRzdGF0dXNUZXh0OiAnSW50ZXJuYWwgU2VydmVyIEVycm9yJyxcblx0XHRcdFx0anNvbjogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCByZWFkIGpzb24nKTsgfVxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0XHRhc3luYyAoKSA9PiBmZXRjaEF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YShhdXRob3JpemF0aW9uU2VydmVyLCB7IGZldGNoOiBmZXRjaFN0dWIgfSksXG5cdFx0XHRcdChlcnJvcjogYW55KSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKGVycm9yIGluc3RhbmNlb2YgQWdncmVnYXRlRXJyb3IsICdTaG91bGQgYmUgYW4gQWdncmVnYXRlRXJyb3InKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3IuZXJyb3JzLmxlbmd0aCwgMywgJ1Nob3VsZCBjb250YWluIDMgZXJyb3JzJyk7XG5cdFx0XHRcdFx0Ly8gQWxsIGVycm9ycyBzaG91bGQgaW5jbHVkZSBzdGF0dXMgY29kZSBhbmQgc3RhdHVzVGV4dCAoZmFsbGJhY2sgd2hlbiB0ZXh0KCkgZmFpbHMpXG5cdFx0XHRcdFx0Zm9yIChjb25zdCBlcnIgb2YgZXJyb3IuZXJyb3JzKSB7XG5cdFx0XHRcdFx0XHRhc3NlcnQub2soLzUwMCBJbnRlcm5hbCBTZXJ2ZXIgRXJyb3IvLnRlc3QoZXJyLm1lc3NhZ2UpLCBgRXJyb3Igc2hvdWxkIG1lbnRpb24gNTAwIGFuZCBzdGF0dXNUZXh0OiAke2Vyci5tZXNzYWdlfWApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBjb3JyZWN0bHkgaGFuZGxlIHBhdGggYWRkaXRpb24gd2l0aCB0cmFpbGluZyBzbGFzaCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGF1dGhvcml6YXRpb25TZXJ2ZXIgPSAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tL3RlbmFudC8nO1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRNZXRhZGF0YTogSUF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSA9IHtcblx0XHRcdFx0aXNzdWVyOiAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tL3RlbmFudC8nLFxuXHRcdFx0XHRyZXNwb25zZV90eXBlc19zdXBwb3J0ZWQ6IFsnY29kZSddXG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBGaXJzdCB0d28gY2FsbHMgZmFpbCwgdGhpcmQgc3VjY2VlZHNcblx0XHRcdGZldGNoU3R1Yi5vbkZpcnN0Q2FsbCgpLnJlc29sdmVzKHtcblx0XHRcdFx0c3RhdHVzOiA0MDQsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+ICdOb3QgRm91bmQnLFxuXHRcdFx0XHRzdGF0dXNUZXh0OiAnTm90IEZvdW5kJyxcblx0XHRcdFx0anNvbjogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ05vdCBKU09OJyk7IH1cblx0XHRcdH0pO1xuXG5cdFx0XHRmZXRjaFN0dWIub25TZWNvbmRDYWxsKCkucmVzb2x2ZXMoe1xuXHRcdFx0XHRzdGF0dXM6IDQwNCxcblx0XHRcdFx0dGV4dDogYXN5bmMgKCkgPT4gJ05vdCBGb3VuZCcsXG5cdFx0XHRcdHN0YXR1c1RleHQ6ICdOb3QgRm91bmQnLFxuXHRcdFx0XHRqc29uOiBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignTm90IEpTT04nKTsgfVxuXHRcdFx0fSk7XG5cblx0XHRcdGZldGNoU3R1Yi5vblRoaXJkQ2FsbCgpLnJlc29sdmVzKHtcblx0XHRcdFx0c3RhdHVzOiAyMDAsXG5cdFx0XHRcdGpzb246IGFzeW5jICgpID0+IGV4cGVjdGVkTWV0YWRhdGEsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+IEpTT04uc3RyaW5naWZ5KGV4cGVjdGVkTWV0YWRhdGEpLFxuXHRcdFx0XHRzdGF0dXNUZXh0OiAnT0snXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZmV0Y2hBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEoYXV0aG9yaXphdGlvblNlcnZlciwgeyBmZXRjaDogZmV0Y2hTdHViIH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tZXRhZGF0YSwgZXhwZWN0ZWRNZXRhZGF0YSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmRpc2NvdmVyeVVybCwgJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS90ZW5hbnQvLndlbGwta25vd24vb3BlbmlkLWNvbmZpZ3VyYXRpb24nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZXJyb3JzLmxlbmd0aCwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmV0Y2hTdHViLmNhbGxDb3VudCwgMyk7XG5cdFx0XHQvLyBUaGlyZCBhdHRlbXB0IHNob3VsZCBjb3JyZWN0bHkgaGFuZGxlIHRyYWlsaW5nIHNsYXNoIChub3QgZG91YmxlLXNsYXNoKVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZldGNoU3R1Yi50aGlyZENhbGwuYXJnc1swXSwgJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS90ZW5hbnQvLndlbGwta25vd24vb3BlbmlkLWNvbmZpZ3VyYXRpb24nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgZGVlcGx5IG5lc3RlZCBwYXRocycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGF1dGhvcml6YXRpb25TZXJ2ZXIgPSAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tL3RlbmFudC9vcmcvc3ViJztcblx0XHRcdGNvbnN0IGV4cGVjdGVkTWV0YWRhdGE6IElBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEgPSB7XG5cdFx0XHRcdGlzc3VlcjogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS90ZW5hbnQvb3JnL3N1YicsXG5cdFx0XHRcdHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJ11cblx0XHRcdH07XG5cblx0XHRcdGZldGNoU3R1Yi5yZXNvbHZlcyh7XG5cdFx0XHRcdHN0YXR1czogMjAwLFxuXHRcdFx0XHRqc29uOiBhc3luYyAoKSA9PiBleHBlY3RlZE1ldGFkYXRhLFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiBKU09OLnN0cmluZ2lmeShleHBlY3RlZE1ldGFkYXRhKSxcblx0XHRcdFx0c3RhdHVzVGV4dDogJ09LJ1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZldGNoQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhKGF1dGhvcml6YXRpb25TZXJ2ZXIsIHsgZmV0Y2g6IGZldGNoU3R1YiB9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWV0YWRhdGEsIGV4cGVjdGVkTWV0YWRhdGEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5kaXNjb3ZlcnlVcmwsICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vLndlbGwta25vd24vb2F1dGgtYXV0aG9yaXphdGlvbi1zZXJ2ZXIvdGVuYW50L29yZy9zdWInKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LmVycm9ycywgW10pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZldGNoU3R1Yi5jYWxsQ291bnQsIDEpO1xuXHRcdFx0Ly8gU2hvdWxkIGNvcnJlY3RseSBpbnNlcnQgd2VsbC1rbm93biBwYXRoIHdpdGggbmVzdGVkIHBhdGhzXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmV0Y2hTdHViLmZpcnN0Q2FsbC5hcmdzWzBdLCAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tLy53ZWxsLWtub3duL29hdXRoLWF1dGhvcml6YXRpb24tc2VydmVyL3RlbmFudC9vcmcvc3ViJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIDIwMCByZXNwb25zZSB3aXRoIG5vbi1tZXRhZGF0YSBKU09OJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYXV0aG9yaXphdGlvblNlcnZlciA9ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20nO1xuXHRcdFx0Y29uc3QgaW52YWxpZFJlc3BvbnNlID0ge1xuXHRcdFx0XHRlcnJvcjogJ25vdF9zdXBwb3J0ZWQnLFxuXHRcdFx0XHRtZXNzYWdlOiAnTWV0YWRhdGEgbm90IGF2YWlsYWJsZSdcblx0XHRcdH07XG5cblx0XHRcdGZldGNoU3R1Yi5yZXNvbHZlcyh7XG5cdFx0XHRcdHN0YXR1czogMjAwLFxuXHRcdFx0XHRqc29uOiBhc3luYyAoKSA9PiBpbnZhbGlkUmVzcG9uc2UsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+IEpTT04uc3RyaW5naWZ5KGludmFsaWRSZXNwb25zZSksXG5cdFx0XHRcdHN0YXR1c1RleHQ6ICdPSydcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdFx0YXN5bmMgKCkgPT4gZmV0Y2hBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEoYXV0aG9yaXphdGlvblNlcnZlciwgeyBmZXRjaDogZmV0Y2hTdHViIH0pLFxuXHRcdFx0XHQoZXJyb3I6IGFueSkgPT4ge1xuXHRcdFx0XHRcdGFzc2VydC5vayhlcnJvciBpbnN0YW5jZW9mIEFnZ3JlZ2F0ZUVycm9yLCAnU2hvdWxkIGJlIGFuIEFnZ3JlZ2F0ZUVycm9yJyk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yLmVycm9ycy5sZW5ndGgsIDMsICdTaG91bGQgY29udGFpbiAzIGVycm9ycycpO1xuXHRcdFx0XHRcdC8vIEFsbCBlcnJvcnMgc2hvdWxkIGluZGljYXRlIGZhaWxlZCB0byBmZXRjaCB3aXRoIHN0YXR1cyBjb2RlXG5cdFx0XHRcdFx0Zm9yIChjb25zdCBlcnIgb2YgZXJyb3IuZXJyb3JzKSB7XG5cdFx0XHRcdFx0XHRhc3NlcnQub2soL0ZhaWxlZCB0byBmZXRjaCBhdXRob3JpemF0aW9uIHNlcnZlciBtZXRhZGF0YSBmcm9tLy50ZXN0KGVyci5tZXNzYWdlKSwgYEVycm9yIHNob3VsZCBtZW50aW9uIGZhaWxlZCBmZXRjaDogJHtlcnIubWVzc2FnZX1gKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cblx0XHRcdC8vIFNob3VsZCB0cnkgYWxsIHRocmVlIGVuZHBvaW50c1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZldGNoU3R1Yi5jYWxsQ291bnQsIDMpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHZhbGlkYXRlIG1ldGFkYXRhIGFjY29yZGluZyB0byBpc0F1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGF1dGhvcml6YXRpb25TZXJ2ZXIgPSAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tJztcblx0XHRcdC8vIFZhbGlkIG1ldGFkYXRhIHdpdGggYWxsIHJlcXVpcmVkIGZpZWxkc1xuXHRcdFx0Y29uc3QgdmFsaWRNZXRhZGF0YTogSUF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSA9IHtcblx0XHRcdFx0aXNzdWVyOiAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tLycsXG5cdFx0XHRcdGF1dGhvcml6YXRpb25fZW5kcG9pbnQ6ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vYXV0aG9yaXplJyxcblx0XHRcdFx0dG9rZW5fZW5kcG9pbnQ6ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vdG9rZW4nLFxuXHRcdFx0XHRqd2tzX3VyaTogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS9qd2tzJyxcblx0XHRcdFx0cmVnaXN0cmF0aW9uX2VuZHBvaW50OiAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tL3JlZ2lzdGVyJyxcblx0XHRcdFx0cmVzcG9uc2VfdHlwZXNfc3VwcG9ydGVkOiBbJ2NvZGUnLCAndG9rZW4nXVxuXHRcdFx0fTtcblxuXHRcdFx0ZmV0Y2hTdHViLnJlc29sdmVzKHtcblx0XHRcdFx0c3RhdHVzOiAyMDAsXG5cdFx0XHRcdGpzb246IGFzeW5jICgpID0+IHZhbGlkTWV0YWRhdGEsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+IEpTT04uc3RyaW5naWZ5KHZhbGlkTWV0YWRhdGEpLFxuXHRcdFx0XHRzdGF0dXNUZXh0OiAnT0snXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZmV0Y2hBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEoYXV0aG9yaXphdGlvblNlcnZlciwgeyBmZXRjaDogZmV0Y2hTdHViIH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tZXRhZGF0YSwgdmFsaWRNZXRhZGF0YSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmRpc2NvdmVyeVVybCwgJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS8ud2VsbC1rbm93bi9vYXV0aC1hdXRob3JpemF0aW9uLXNlcnZlcicpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuZXJyb3JzLCBbXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmV0Y2hTdHViLmNhbGxDb3VudCwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIFVSTHMgd2l0aCBxdWVyeSBwYXJhbWV0ZXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYXV0aG9yaXphdGlvblNlcnZlciA9ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vdGVuYW50P3ZlcnNpb249djInO1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRNZXRhZGF0YTogSUF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSA9IHtcblx0XHRcdFx0aXNzdWVyOiAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tL3RlbmFudD92ZXJzaW9uPXYyJyxcblx0XHRcdFx0cmVzcG9uc2VfdHlwZXNfc3VwcG9ydGVkOiBbJ2NvZGUnXVxuXHRcdFx0fTtcblxuXHRcdFx0ZmV0Y2hTdHViLnJlc29sdmVzKHtcblx0XHRcdFx0c3RhdHVzOiAyMDAsXG5cdFx0XHRcdGpzb246IGFzeW5jICgpID0+IGV4cGVjdGVkTWV0YWRhdGEsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+IEpTT04uc3RyaW5naWZ5KGV4cGVjdGVkTWV0YWRhdGEpLFxuXHRcdFx0XHRzdGF0dXNUZXh0OiAnT0snXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZmV0Y2hBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEoYXV0aG9yaXphdGlvblNlcnZlciwgeyBmZXRjaDogZmV0Y2hTdHViIH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tZXRhZGF0YSwgZXhwZWN0ZWRNZXRhZGF0YSk7XG5cdFx0XHQvLyBRdWVyeSBwYXJhbWV0ZXJzIGFyZSBub3QgaW5jbHVkZWQgaW4gdGhlIGRpc2NvdmVyeSBVUkwgKG9ubHkgcGF0aG5hbWUgaXMgZXh0cmFjdGVkKVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5kaXNjb3ZlcnlVcmwsICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vLndlbGwta25vd24vb2F1dGgtYXV0aG9yaXphdGlvbi1zZXJ2ZXIvdGVuYW50Jyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5lcnJvcnMsIFtdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmZXRjaFN0dWIuY2FsbENvdW50LCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgZW1wdHkgYWRkaXRpb25hbEhlYWRlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhdXRob3JpemF0aW9uU2VydmVyID0gJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbSc7XG5cdFx0XHRjb25zdCBleHBlY3RlZE1ldGFkYXRhOiBJQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhID0ge1xuXHRcdFx0XHRpc3N1ZXI6ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vJyxcblx0XHRcdFx0cmVzcG9uc2VfdHlwZXNfc3VwcG9ydGVkOiBbJ2NvZGUnXVxuXHRcdFx0fTtcblxuXHRcdFx0ZmV0Y2hTdHViLnJlc29sdmVzKHtcblx0XHRcdFx0c3RhdHVzOiAyMDAsXG5cdFx0XHRcdGpzb246IGFzeW5jICgpID0+IGV4cGVjdGVkTWV0YWRhdGEsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+IEpTT04uc3RyaW5naWZ5KGV4cGVjdGVkTWV0YWRhdGEpLFxuXHRcdFx0XHRzdGF0dXNUZXh0OiAnT0snXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZmV0Y2hBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEoYXV0aG9yaXphdGlvblNlcnZlciwgeyBmZXRjaDogZmV0Y2hTdHViLCBhZGRpdGlvbmFsSGVhZGVyczoge30gfSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZGlzY292ZXJ5VXJsLCAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tLy53ZWxsLWtub3duL29hdXRoLWF1dGhvcml6YXRpb24tc2VydmVyJyk7XG5cdFx0XHRjb25zdCBoZWFkZXJzID0gZmV0Y2hTdHViLmZpcnN0Q2FsbC5hcmdzWzFdLmhlYWRlcnM7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1snQWNjZXB0J10sICdhcHBsaWNhdGlvbi9qc29uJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdDcm9zcyBBcHAgQWNjZXNzIChJRC1KQUcpIHdpcmUgZm9ybWF0JywgKCkgPT4ge1xuXHRcdC8vIFNwZWM6IGRyYWZ0LWlldGYtb2F1dGgtaWRlbnRpdHktYXNzZXJ0aW9uLWF1dGh6LWdyYW50LTAzXG5cdFx0dGVzdCgnYnVpbGRJZEphZ0V4Y2hhbmdlQm9keSBlbWl0cyB0aGUgZXhhY3Qgc3BlYyBwYXJhbWV0ZXJzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYm9keSA9IGJ1aWxkSWRKYWdFeGNoYW5nZUJvZHkoXG5cdFx0XHRcdCdteV9pZHBfY2xpZW50X2lkJyxcblx0XHRcdFx0J3NlY3JldF94eXonLFxuXHRcdFx0XHQnPGlkX3Rva2VuPicsXG5cdFx0XHRcdCdodHRwczovL2F1dGgucmVzb3VyY2UuZXhhbXBsZS5jb20nLFxuXHRcdFx0XHQnaHR0cHM6Ly9hcGkucmVzb3VyY2UuZXhhbXBsZS5jb20nLFxuXHRcdFx0XHRbJ3RvZG9zLnJlYWQnLCAnbWNwLmFjY2VzcyddLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJvZHkuZ2V0KCdjbGllbnRfaWQnKSwgJ215X2lkcF9jbGllbnRfaWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChib2R5LmdldCgnY2xpZW50X3NlY3JldCcpLCAnc2VjcmV0X3h5eicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJvZHkuZ2V0KCdncmFudF90eXBlJyksICd1cm46aWV0ZjpwYXJhbXM6b2F1dGg6Z3JhbnQtdHlwZTp0b2tlbi1leGNoYW5nZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJvZHkuZ2V0KCdzdWJqZWN0X3Rva2VuJyksICc8aWRfdG9rZW4+Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYm9keS5nZXQoJ3N1YmplY3RfdG9rZW5fdHlwZScpLCAndXJuOmlldGY6cGFyYW1zOm9hdXRoOnRva2VuLXR5cGU6aWRfdG9rZW4nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChib2R5LmdldCgncmVxdWVzdGVkX3Rva2VuX3R5cGUnKSwgJ3VybjppZXRmOnBhcmFtczpvYXV0aDp0b2tlbi10eXBlOmlkLWphZycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJvZHkuZ2V0KCdhdWRpZW5jZScpLCAnaHR0cHM6Ly9hdXRoLnJlc291cmNlLmV4YW1wbGUuY29tJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYm9keS5nZXQoJ3Jlc291cmNlJyksICdodHRwczovL2FwaS5yZXNvdXJjZS5leGFtcGxlLmNvbScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJvZHkuZ2V0KCdzY29wZScpLCAndG9kb3MucmVhZCBtY3AuYWNjZXNzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdidWlsZElkSmFnRXhjaGFuZ2VCb2R5IG9taXRzIGNsaWVudF9zZWNyZXQgd2hlbiBub3QgcHJvdmlkZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBib2R5ID0gYnVpbGRJZEphZ0V4Y2hhbmdlQm9keShcblx0XHRcdFx0J3B1YmxpY19jbGllbnRfaWQnLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdCc8aWRfdG9rZW4+Jyxcblx0XHRcdFx0J2h0dHBzOi8vYXV0aC5yZXNvdXJjZS5leGFtcGxlLmNvbScsXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0W10sXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYm9keS5oYXMoJ2NsaWVudF9zZWNyZXQnKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJvZHkuaGFzKCdyZXNvdXJjZScpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYm9keS5oYXMoJ3Njb3BlJyksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2J1aWxkUmVzb3VyY2VSZWRlbXB0aW9uQm9keSBlbWl0cyBhbiBSRkMgNzUyMyBKV1QtYmVhcmVyIGdyYW50JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYm9keSA9IGJ1aWxkUmVzb3VyY2VSZWRlbXB0aW9uQm9keShcblx0XHRcdFx0J215X2lkcF9jbGllbnRfaWQtYXQtdG9kbzAnLFxuXHRcdFx0XHQnc2VjcmV0X3h5eicsXG5cdFx0XHRcdCc8aWRfamFnPicsXG5cdFx0XHRcdCdodHRwczovL2FwaS5yZXNvdXJjZS5leGFtcGxlLmNvbScsXG5cdFx0XHRcdFsndG9kb3MucmVhZCcsICdtY3AuYWNjZXNzJ10sXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYm9keS5nZXQoJ2NsaWVudF9pZCcpLCAnbXlfaWRwX2NsaWVudF9pZC1hdC10b2RvMCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJvZHkuZ2V0KCdjbGllbnRfc2VjcmV0JyksICdzZWNyZXRfeHl6Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYm9keS5nZXQoJ2dyYW50X3R5cGUnKSwgJ3VybjppZXRmOnBhcmFtczpvYXV0aDpncmFudC10eXBlOmp3dC1iZWFyZXInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChib2R5LmdldCgnYXNzZXJ0aW9uJyksICc8aWRfamFnPicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJvZHkuZ2V0KCdyZXNvdXJjZScpLCAnaHR0cHM6Ly9hcGkucmVzb3VyY2UuZXhhbXBsZS5jb20nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChib2R5LmdldCgnc2NvcGUnKSwgJ3RvZG9zLnJlYWQgbWNwLmFjY2VzcycpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxZQUFZO0FBQ3hCLFlBQVksV0FBVztBQUN2QjtBQUFBLEVBQ0M7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNB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
