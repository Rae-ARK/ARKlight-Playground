import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { GITHUB_COPILOT_PROTECTED_RESOURCE, GITHUB_REPO_PROTECTED_RESOURCE } from "../../common/agentService.js";
import { deriveGitHubEndpoints, gitHubCopilotResource, gitHubMcpServerUrl, gitHubRepoResource } from "../../common/githubEndpoints.js";
suite("githubEndpoints", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const DOT_COM = {
    apiBaseUri: "https://api.github.com",
    graphQlUri: "https://api.github.com/graphql",
    oauthServer: "https://github.com/login/oauth",
    enterpriseHost: void 0
  };
  test("deriveGitHubEndpoints: github.com defaults for unset / empty / unparseable / github.com host", () => {
    assert.deepStrictEqual({
      unset: deriveGitHubEndpoints(void 0),
      empty: deriveGitHubEndpoints(""),
      garbage: deriveGitHubEndpoints("not a uri"),
      dotCom: deriveGitHubEndpoints("https://github.com"),
      apiDotCom: deriveGitHubEndpoints("https://api.github.com")
    }, {
      unset: DOT_COM,
      empty: DOT_COM,
      garbage: DOT_COM,
      dotCom: DOT_COM,
      apiDotCom: DOT_COM
    });
  });
  test("deriveGitHubEndpoints: GitHub Enterprise Cloud (.ghe.com) uses the api. subdomain", () => {
    assert.deepStrictEqual(deriveGitHubEndpoints("https://acme.ghe.com"), {
      apiBaseUri: "https://api.acme.ghe.com",
      graphQlUri: "https://api.acme.ghe.com/graphql",
      oauthServer: "https://acme.ghe.com/login/oauth",
      enterpriseHost: "acme.ghe.com"
    });
  });
  test("deriveGitHubEndpoints: GitHub Enterprise Server uses /api/v3 and /api/graphql", () => {
    assert.deepStrictEqual(deriveGitHubEndpoints("https://ghe.acme.com"), {
      apiBaseUri: "https://ghe.acme.com/api/v3",
      graphQlUri: "https://ghe.acme.com/api/graphql",
      oauthServer: "https://ghe.acme.com/login/oauth",
      enterpriseHost: "ghe.acme.com"
    });
  });
  test("deriveGitHubEndpoints: preserves scheme and ignores path", () => {
    assert.deepStrictEqual(deriveGitHubEndpoints("http://ghe.local/some/path"), {
      apiBaseUri: "http://ghe.local/api/v3",
      graphQlUri: "http://ghe.local/api/graphql",
      oauthServer: "http://ghe.local/login/oauth",
      enterpriseHost: "ghe.local"
    });
  });
  test("gitHubMcpServerUrl derives the MCP endpoint from the per-user Copilot API host", () => {
    assert.deepStrictEqual({
      default: gitHubMcpServerUrl(void 0),
      enterprise: gitHubMcpServerUrl("https://api.enterprise.githubcopilot.com/v1?tenant=acme#fragment"),
      ghe: gitHubMcpServerUrl("https://copilot-api.ghe.acme.com"),
      invalid: gitHubMcpServerUrl("not a uri")
    }, {
      default: "https://api.githubcopilot.com/mcp",
      enterprise: "https://api.enterprise.githubcopilot.com/mcp",
      ghe: "https://copilot-api.ghe.acme.com/mcp",
      invalid: void 0
    });
  });
  test("resource builders derive resource + authorization_servers from endpoints", () => {
    const endpoints = deriveGitHubEndpoints("https://ghe.acme.com");
    assert.deepStrictEqual({
      copilot: gitHubCopilotResource(endpoints),
      repo: gitHubRepoResource(endpoints)
    }, {
      copilot: {
        resource: "https://ghe.acme.com/api/v3",
        resource_name: "GitHub Copilot",
        authorization_servers: ["https://ghe.acme.com/login/oauth"],
        scopes_supported: ["read:user", "user:email"],
        required: true
      },
      repo: {
        resource: "https://ghe.acme.com/api/v3/repos",
        resource_name: "GitHub Repository",
        authorization_servers: ["https://ghe.acme.com/login/oauth"],
        scopes_supported: ["repo"],
        required: false
      }
    });
  });
  test("github.com resources are byte-for-byte the canonical protected-resource constants", () => {
    const endpoints = deriveGitHubEndpoints(void 0);
    assert.deepStrictEqual({
      copilot: gitHubCopilotResource(endpoints),
      repo: gitHubRepoResource(endpoints)
    }, {
      copilot: GITHUB_COPILOT_PROTECTED_RESOURCE,
      repo: GITHUB_REPO_PROTECTED_RESOURCE
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L2NvbW1vbi9naXRodWJFbmRwb2ludHMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgR0lUSFVCX0NPUElMT1RfUFJPVEVDVEVEX1JFU09VUkNFLCBHSVRIVUJfUkVQT19QUk9URUNURURfUkVTT1VSQ0UgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGRlcml2ZUdpdEh1YkVuZHBvaW50cywgZ2l0SHViQ29waWxvdFJlc291cmNlLCBnaXRIdWJNY3BTZXJ2ZXJVcmwsIGdpdEh1YlJlcG9SZXNvdXJjZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9naXRodWJFbmRwb2ludHMuanMnO1xuXG5zdWl0ZSgnZ2l0aHViRW5kcG9pbnRzJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBET1RfQ09NID0ge1xuXHRcdGFwaUJhc2VVcmk6ICdodHRwczovL2FwaS5naXRodWIuY29tJyxcblx0XHRncmFwaFFsVXJpOiAnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9ncmFwaHFsJyxcblx0XHRvYXV0aFNlcnZlcjogJ2h0dHBzOi8vZ2l0aHViLmNvbS9sb2dpbi9vYXV0aCcsXG5cdFx0ZW50ZXJwcmlzZUhvc3Q6IHVuZGVmaW5lZCxcblx0fTtcblxuXHR0ZXN0KCdkZXJpdmVHaXRIdWJFbmRwb2ludHM6IGdpdGh1Yi5jb20gZGVmYXVsdHMgZm9yIHVuc2V0IC8gZW1wdHkgLyB1bnBhcnNlYWJsZSAvIGdpdGh1Yi5jb20gaG9zdCcsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHVuc2V0OiBkZXJpdmVHaXRIdWJFbmRwb2ludHModW5kZWZpbmVkKSxcblx0XHRcdGVtcHR5OiBkZXJpdmVHaXRIdWJFbmRwb2ludHMoJycpLFxuXHRcdFx0Z2FyYmFnZTogZGVyaXZlR2l0SHViRW5kcG9pbnRzKCdub3QgYSB1cmknKSxcblx0XHRcdGRvdENvbTogZGVyaXZlR2l0SHViRW5kcG9pbnRzKCdodHRwczovL2dpdGh1Yi5jb20nKSxcblx0XHRcdGFwaURvdENvbTogZGVyaXZlR2l0SHViRW5kcG9pbnRzKCdodHRwczovL2FwaS5naXRodWIuY29tJyksXG5cdFx0fSwge1xuXHRcdFx0dW5zZXQ6IERPVF9DT00sXG5cdFx0XHRlbXB0eTogRE9UX0NPTSxcblx0XHRcdGdhcmJhZ2U6IERPVF9DT00sXG5cdFx0XHRkb3RDb206IERPVF9DT00sXG5cdFx0XHRhcGlEb3RDb206IERPVF9DT00sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rlcml2ZUdpdEh1YkVuZHBvaW50czogR2l0SHViIEVudGVycHJpc2UgQ2xvdWQgKC5naGUuY29tKSB1c2VzIHRoZSBhcGkuIHN1YmRvbWFpbicsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRlcml2ZUdpdEh1YkVuZHBvaW50cygnaHR0cHM6Ly9hY21lLmdoZS5jb20nKSwge1xuXHRcdFx0YXBpQmFzZVVyaTogJ2h0dHBzOi8vYXBpLmFjbWUuZ2hlLmNvbScsXG5cdFx0XHRncmFwaFFsVXJpOiAnaHR0cHM6Ly9hcGkuYWNtZS5naGUuY29tL2dyYXBocWwnLFxuXHRcdFx0b2F1dGhTZXJ2ZXI6ICdodHRwczovL2FjbWUuZ2hlLmNvbS9sb2dpbi9vYXV0aCcsXG5cdFx0XHRlbnRlcnByaXNlSG9zdDogJ2FjbWUuZ2hlLmNvbScsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rlcml2ZUdpdEh1YkVuZHBvaW50czogR2l0SHViIEVudGVycHJpc2UgU2VydmVyIHVzZXMgL2FwaS92MyBhbmQgL2FwaS9ncmFwaHFsJywgKCkgPT4ge1xuXHRcdC8vIFRoZSBHcmFwaFFMIGVuZHBvaW50IGlzIGAvYXBpL2dyYXBocWxgLCBOT1QgYGFwaUJhc2VVcmkgKyAvZ3JhcGhxbGBcblx0XHQvLyAod2hpY2ggd291bGQgZ2l2ZSB0aGUgd3JvbmcgYC9hcGkvdjMvZ3JhcGhxbGApLlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGVyaXZlR2l0SHViRW5kcG9pbnRzKCdodHRwczovL2doZS5hY21lLmNvbScpLCB7XG5cdFx0XHRhcGlCYXNlVXJpOiAnaHR0cHM6Ly9naGUuYWNtZS5jb20vYXBpL3YzJyxcblx0XHRcdGdyYXBoUWxVcmk6ICdodHRwczovL2doZS5hY21lLmNvbS9hcGkvZ3JhcGhxbCcsXG5cdFx0XHRvYXV0aFNlcnZlcjogJ2h0dHBzOi8vZ2hlLmFjbWUuY29tL2xvZ2luL29hdXRoJyxcblx0XHRcdGVudGVycHJpc2VIb3N0OiAnZ2hlLmFjbWUuY29tJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGVyaXZlR2l0SHViRW5kcG9pbnRzOiBwcmVzZXJ2ZXMgc2NoZW1lIGFuZCBpZ25vcmVzIHBhdGgnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkZXJpdmVHaXRIdWJFbmRwb2ludHMoJ2h0dHA6Ly9naGUubG9jYWwvc29tZS9wYXRoJyksIHtcblx0XHRcdGFwaUJhc2VVcmk6ICdodHRwOi8vZ2hlLmxvY2FsL2FwaS92MycsXG5cdFx0XHRncmFwaFFsVXJpOiAnaHR0cDovL2doZS5sb2NhbC9hcGkvZ3JhcGhxbCcsXG5cdFx0XHRvYXV0aFNlcnZlcjogJ2h0dHA6Ly9naGUubG9jYWwvbG9naW4vb2F1dGgnLFxuXHRcdFx0ZW50ZXJwcmlzZUhvc3Q6ICdnaGUubG9jYWwnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdnaXRIdWJNY3BTZXJ2ZXJVcmwgZGVyaXZlcyB0aGUgTUNQIGVuZHBvaW50IGZyb20gdGhlIHBlci11c2VyIENvcGlsb3QgQVBJIGhvc3QnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRkZWZhdWx0OiBnaXRIdWJNY3BTZXJ2ZXJVcmwodW5kZWZpbmVkKSxcblx0XHRcdGVudGVycHJpc2U6IGdpdEh1Yk1jcFNlcnZlclVybCgnaHR0cHM6Ly9hcGkuZW50ZXJwcmlzZS5naXRodWJjb3BpbG90LmNvbS92MT90ZW5hbnQ9YWNtZSNmcmFnbWVudCcpLFxuXHRcdFx0Z2hlOiBnaXRIdWJNY3BTZXJ2ZXJVcmwoJ2h0dHBzOi8vY29waWxvdC1hcGkuZ2hlLmFjbWUuY29tJyksXG5cdFx0XHRpbnZhbGlkOiBnaXRIdWJNY3BTZXJ2ZXJVcmwoJ25vdCBhIHVyaScpLFxuXHRcdH0sIHtcblx0XHRcdGRlZmF1bHQ6ICdodHRwczovL2FwaS5naXRodWJjb3BpbG90LmNvbS9tY3AnLFxuXHRcdFx0ZW50ZXJwcmlzZTogJ2h0dHBzOi8vYXBpLmVudGVycHJpc2UuZ2l0aHViY29waWxvdC5jb20vbWNwJyxcblx0XHRcdGdoZTogJ2h0dHBzOi8vY29waWxvdC1hcGkuZ2hlLmFjbWUuY29tL21jcCcsXG5cdFx0XHRpbnZhbGlkOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc291cmNlIGJ1aWxkZXJzIGRlcml2ZSByZXNvdXJjZSArIGF1dGhvcml6YXRpb25fc2VydmVycyBmcm9tIGVuZHBvaW50cycsICgpID0+IHtcblx0XHRjb25zdCBlbmRwb2ludHMgPSBkZXJpdmVHaXRIdWJFbmRwb2ludHMoJ2h0dHBzOi8vZ2hlLmFjbWUuY29tJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjb3BpbG90OiBnaXRIdWJDb3BpbG90UmVzb3VyY2UoZW5kcG9pbnRzKSxcblx0XHRcdHJlcG86IGdpdEh1YlJlcG9SZXNvdXJjZShlbmRwb2ludHMpLFxuXHRcdH0sIHtcblx0XHRcdGNvcGlsb3Q6IHtcblx0XHRcdFx0cmVzb3VyY2U6ICdodHRwczovL2doZS5hY21lLmNvbS9hcGkvdjMnLFxuXHRcdFx0XHRyZXNvdXJjZV9uYW1lOiAnR2l0SHViIENvcGlsb3QnLFxuXHRcdFx0XHRhdXRob3JpemF0aW9uX3NlcnZlcnM6IFsnaHR0cHM6Ly9naGUuYWNtZS5jb20vbG9naW4vb2F1dGgnXSxcblx0XHRcdFx0c2NvcGVzX3N1cHBvcnRlZDogWydyZWFkOnVzZXInLCAndXNlcjplbWFpbCddLFxuXHRcdFx0XHRyZXF1aXJlZDogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0XHRyZXBvOiB7XG5cdFx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9naGUuYWNtZS5jb20vYXBpL3YzL3JlcG9zJyxcblx0XHRcdFx0cmVzb3VyY2VfbmFtZTogJ0dpdEh1YiBSZXBvc2l0b3J5Jyxcblx0XHRcdFx0YXV0aG9yaXphdGlvbl9zZXJ2ZXJzOiBbJ2h0dHBzOi8vZ2hlLmFjbWUuY29tL2xvZ2luL29hdXRoJ10sXG5cdFx0XHRcdHNjb3Blc19zdXBwb3J0ZWQ6IFsncmVwbyddLFxuXHRcdFx0XHRyZXF1aXJlZDogZmFsc2UsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdnaXRodWIuY29tIHJlc291cmNlcyBhcmUgYnl0ZS1mb3ItYnl0ZSB0aGUgY2Fub25pY2FsIHByb3RlY3RlZC1yZXNvdXJjZSBjb25zdGFudHMnLCAoKSA9PiB7XG5cdFx0Ly8gQmFja3dhcmQtY29tcGF0IGludmFyaWFudDogd2l0aCBubyBlbnRlcnByaXNlIFVSSSwgdG9rZW4tc3RvcmUga2V5cyBhbmRcblx0XHQvLyBhZHZlcnRpc2VkIG1ldGFkYXRhIG11c3QgYmUgdW5jaGFuZ2VkIGZvciB0aGUgY29tbW9uIG5vbi1lbnRlcnByaXNlIGNhc2UuXG5cdFx0Y29uc3QgZW5kcG9pbnRzID0gZGVyaXZlR2l0SHViRW5kcG9pbnRzKHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjb3BpbG90OiBnaXRIdWJDb3BpbG90UmVzb3VyY2UoZW5kcG9pbnRzKSxcblx0XHRcdHJlcG86IGdpdEh1YlJlcG9SZXNvdXJjZShlbmRwb2ludHMpLFxuXHRcdH0sIHtcblx0XHRcdGNvcGlsb3Q6IEdJVEhVQl9DT1BJTE9UX1BST1RFQ1RFRF9SRVNPVVJDRSxcblx0XHRcdHJlcG86IEdJVEhVQl9SRVBPX1BST1RFQ1RFRF9SRVNPVVJDRSxcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLG1DQUFtQyxzQ0FBc0M7QUFDbEYsU0FBUyx1QkFBdUIsdUJBQXVCLG9CQUFvQiwwQkFBMEI7QUFFckcsTUFBTSxtQkFBbUIsTUFBTTtBQUM5QiwwQ0FBd0M7QUFFeEMsUUFBTSxVQUFVO0FBQUEsSUFDZixZQUFZO0FBQUEsSUFDWixZQUFZO0FBQUEsSUFDWixhQUFhO0FBQUEsSUFDYixnQkFBZ0I7QUFBQSxFQUNqQjtBQUVBLE9BQUssZ0dBQWdHLE1BQU07QUFDMUcsV0FBTyxnQkFBZ0I7QUFBQSxN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
