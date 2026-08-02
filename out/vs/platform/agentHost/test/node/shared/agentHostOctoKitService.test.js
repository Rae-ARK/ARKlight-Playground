import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { NullLogService } from "../../../../log/common/log.js";
import { AgentHostOctoKitService } from "../../../node/shared/agentHostOctoKitService.js";
import { createTestGitHubEndpointService } from "../testGitHubEndpointService.js";
function getUrl(input) {
  if (typeof input === "string") {
    return input;
  }
  return input instanceof URL ? input.href : input.url;
}
function makeService(fetchImpl, enterpriseUri) {
  return new AgentHostOctoKitService(fetchImpl, new NullLogService(), createTestGitHubEndpointService(enterpriseUri));
}
function signal() {
  return new AbortController().signal;
}
function capturingFetch(response) {
  let lastCapture = { url: "", init: void 0 };
  const impl = async (input, init) => {
    lastCapture = { url: getUrl(input), init };
    return response;
  };
  return { fetch: impl, captured: () => lastCapture };
}
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
suite("AgentHostOctoKitService", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("createPullRequest posts the expected request and parses the response", async () => {
    const { fetch, captured } = capturingFetch(jsonResponse({ html_url: "https://github.com/o/r/pull/42", number: 42, node_id: "PR_node_42" }));
    const service = makeService(fetch);
    const result = await service.createPullRequest("o", "r", "My PR", "Body", "feature", "main", false, "gh-token", signal());
    assert.deepStrictEqual(result, { url: "https://github.com/o/r/pull/42", number: 42, nodeId: "PR_node_42" });
    const cap = captured();
    assert.strictEqual(cap.url, "https://api.github.com/repos/o/r/pulls");
    assert.strictEqual(cap.init?.method, "POST");
    const headers = cap.init?.headers;
    assert.strictEqual(headers["Authorization"], "Bearer gh-token");
    assert.strictEqual(headers["Accept"], "application/vnd.github+json");
    assert.strictEqual(headers["X-GitHub-Api-Version"], "2022-11-28");
    assert.strictEqual(headers["Content-Type"], "application/json");
    assert.deepStrictEqual(JSON.parse(cap.init?.body), {
      title: "My PR",
      body: "Body",
      head: "feature",
      base: "main",
      draft: false
    });
  });
  test("createPullRequest forwards the draft flag", async () => {
    const { fetch, captured } = capturingFetch(jsonResponse({ html_url: "https://github.com/o/r/pull/7", number: 7 }));
    const service = makeService(fetch);
    await service.createPullRequest("o", "r", "t", "b", "h", "b", true, "tok", signal());
    const sent = JSON.parse(captured().init?.body);
    assert.strictEqual(sent.draft, true);
  });
  test("createPullRequest forwards the abort signal", async () => {
    const { fetch, captured } = capturingFetch(jsonResponse({ html_url: "https://github.com/o/r/pull/7", number: 7 }));
    const service = makeService(fetch);
    const controller = new AbortController();
    await service.createPullRequest("o", "r", "t", "b", "h", "b", true, "tok", controller.signal);
    assert.strictEqual(captured().init?.signal, controller.signal);
  });
  test("findPullRequestByHeadBranch fetches the latest matching pull request", async () => {
    const { fetch, captured } = capturingFetch(jsonResponse([{ html_url: "https://github.com/o/r/pull/9", number: 9, node_id: "PR_node_9" }]));
    const service = makeService(fetch);
    const result = await service.findPullRequestByHeadBranch("o", "r", "feature/test", "tok", signal());
    assert.deepStrictEqual({
      result,
      url: captured().url,
      method: captured().init?.method
    }, {
      result: { url: "https://github.com/o/r/pull/9", number: 9, nodeId: "PR_node_9" },
      url: "https://api.github.com/repos/o/r/pulls?head=o%3Afeature%2Ftest&state=all&sort=updated&direction=desc&per_page=1",
      method: "GET"
    });
  });
  test("findPullRequestByHeadBranch qualifies a fork branch with its head owner", async () => {
    const { fetch, captured } = capturingFetch(jsonResponse([{ html_url: "https://github.com/o/r/pull/9", number: 9 }]));
    const service = makeService(fetch);
    await service.findPullRequestByHeadBranch("o", "r", "feature/test", "tok", signal(), "fork-owner");
    assert.strictEqual(captured().url, "https://api.github.com/repos/o/r/pulls?head=fork-owner%3Afeature%2Ftest&state=all&sort=updated&direction=desc&per_page=1");
  });
  test("createPullRequest throws on non-OK response", async () => {
    const service = makeService(capturingFetch(new Response('{"message":"Validation Failed"}', { status: 422, statusText: "Unprocessable Entity" })).fetch);
    await assert.rejects(
      () => service.createPullRequest("o", "r", "t", "b", "h", "b", false, "tok", signal()),
      /422 Unprocessable Entity - {"message":"Validation Failed"}/
    );
  });
  test("createPullRequest truncates long non-OK response bodies", async () => {
    const service = makeService(capturingFetch(new Response(`prefix
${"x".repeat(600)}`, { status: 500, statusText: "Server Error" })).fetch);
    await assert.rejects(
      () => service.createPullRequest("o", "r", "t", "b", "h", "b", false, "tok", signal()),
      (err) => err instanceof Error && err.message.includes(`prefix ${"x".repeat(493)}...`) && !err.message.includes("x".repeat(600))
    );
  });
  test("createPullRequest throws when response is missing html_url or number", async () => {
    const service = makeService(capturingFetch(jsonResponse({
      html_url: "https://github.com/o/r/pull/1"
      /* missing number */
    })).fetch);
    await assert.rejects(
      () => service.createPullRequest("o", "r", "t", "b", "h", "b", false, "tok", signal()),
      /Failed to create pull request for o\/r/
    );
  });
  test("enablePullRequestAutoMerge posts the GraphQL mutation", async () => {
    const { fetch, captured } = capturingFetch(jsonResponse({ data: { enablePullRequestAutoMerge: { pullRequest: { id: "PR_node_42" } } } }));
    const service = makeService(fetch);
    await service.enablePullRequestAutoMerge("PR_node_42", "SQUASH", "gh-token", signal());
    const cap = captured();
    const headers = cap.init?.headers;
    assert.deepStrictEqual({
      url: cap.url,
      method: cap.init?.method,
      authorization: headers["Authorization"],
      variables: JSON.parse(cap.init?.body).variables
    }, {
      url: "https://api.github.com/graphql",
      method: "POST",
      authorization: "Bearer gh-token",
      variables: { pullRequestId: "PR_node_42", mergeMethod: "SQUASH" }
    });
  });
  test("enablePullRequestAutoMerge throws when GraphQL returns errors", async () => {
    const service = makeService(capturingFetch(jsonResponse({ errors: [{ message: "Pull request is in clean status" }] })).fetch);
    await assert.rejects(
      () => service.enablePullRequestAutoMerge("PR_node_42", "MERGE", "tok", signal()),
      /GitHub GraphQL request failed: Pull request is in clean status/
    );
  });
  test("routes REST calls to the GitHub Enterprise Server API base", async () => {
    const { fetch, captured } = capturingFetch(jsonResponse({ html_url: "https://ghe.acme.com/o/r/pull/7", number: 7, node_id: "n" }));
    const service = makeService(fetch, "https://ghe.acme.com");
    await service.createPullRequest("o", "r", "T", "B", "feature", "main", false, "tok", signal());
    assert.strictEqual(captured().url, "https://ghe.acme.com/api/v3/repos/o/r/pulls");
  });
  test("routes GraphQL calls to the GitHub Enterprise Server GraphQL endpoint", async () => {
    const { fetch, captured } = capturingFetch(jsonResponse({ data: { enablePullRequestAutoMerge: { pullRequest: { id: "PR_1" } } } }));
    const service = makeService(fetch, "https://ghe.acme.com");
    await service.enablePullRequestAutoMerge("PR_1", "MERGE", "tok", signal());
    assert.strictEqual(captured().url, "https://ghe.acme.com/api/graphql");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvc2hhcmVkL2FnZW50SG9zdE9jdG9LaXRTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0T2N0b0tpdFNlcnZpY2UsIHR5cGUgRmV0Y2hGdW5jdGlvbiB9IGZyb20gJy4uLy4uLy4uL25vZGUvc2hhcmVkL2FnZW50SG9zdE9jdG9LaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRlc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UgfSBmcm9tICcuLi90ZXN0R2l0SHViRW5kcG9pbnRTZXJ2aWNlLmpzJztcblxudHlwZSBDYXB0dXJlZCA9IHsgdXJsOiBzdHJpbmc7IGluaXQ6IFJlcXVlc3RJbml0IHwgdW5kZWZpbmVkIH07XG5cbmZ1bmN0aW9uIGdldFVybChpbnB1dDogc3RyaW5nIHwgVVJMIHwgUmVxdWVzdCk6IHN0cmluZyB7XG5cdGlmICh0eXBlb2YgaW5wdXQgPT09ICdzdHJpbmcnKSB7XG5cdFx0cmV0dXJuIGlucHV0O1xuXHR9XG5cdHJldHVybiBpbnB1dCBpbnN0YW5jZW9mIFVSTCA/IGlucHV0LmhyZWYgOiBpbnB1dC51cmw7XG59XG5cbmZ1bmN0aW9uIG1ha2VTZXJ2aWNlKGZldGNoSW1wbDogRmV0Y2hGdW5jdGlvbiwgZW50ZXJwcmlzZVVyaT86IHN0cmluZyk6IEFnZW50SG9zdE9jdG9LaXRTZXJ2aWNlIHtcblx0cmV0dXJuIG5ldyBBZ2VudEhvc3RPY3RvS2l0U2VydmljZShmZXRjaEltcGwsIG5ldyBOdWxsTG9nU2VydmljZSgpLCBjcmVhdGVUZXN0R2l0SHViRW5kcG9pbnRTZXJ2aWNlKGVudGVycHJpc2VVcmkpKTtcbn1cblxuZnVuY3Rpb24gc2lnbmFsKCk6IEFib3J0U2lnbmFsIHtcblx0cmV0dXJuIG5ldyBBYm9ydENvbnRyb2xsZXIoKS5zaWduYWw7XG59XG5cbmZ1bmN0aW9uIGNhcHR1cmluZ0ZldGNoKHJlc3BvbnNlOiBSZXNwb25zZSk6IHsgZmV0Y2g6IEZldGNoRnVuY3Rpb247IGNhcHR1cmVkOiAoKSA9PiBDYXB0dXJlZCB9IHtcblx0bGV0IGxhc3RDYXB0dXJlOiBDYXB0dXJlZCA9IHsgdXJsOiAnJywgaW5pdDogdW5kZWZpbmVkIH07XG5cdGNvbnN0IGltcGw6IEZldGNoRnVuY3Rpb24gPSBhc3luYyAoaW5wdXQsIGluaXQpID0+IHtcblx0XHRsYXN0Q2FwdHVyZSA9IHsgdXJsOiBnZXRVcmwoaW5wdXQpLCBpbml0IH07XG5cdFx0cmV0dXJuIHJlc3BvbnNlO1xuXHR9O1xuXHRyZXR1cm4geyBmZXRjaDogaW1wbCwgY2FwdHVyZWQ6ICgpID0+IGxhc3RDYXB0dXJlIH07XG59XG5cbmZ1bmN0aW9uIGpzb25SZXNwb25zZShib2R5OiB1bmtub3duLCBzdGF0dXMgPSAyMDApOiBSZXNwb25zZSB7XG5cdHJldHVybiBuZXcgUmVzcG9uc2UoSlNPTi5zdHJpbmdpZnkoYm9keSksIHtcblx0XHRzdGF0dXMsXG5cdFx0aGVhZGVyczogeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0sXG5cdH0pO1xufVxuXG5zdWl0ZSgnQWdlbnRIb3N0T2N0b0tpdFNlcnZpY2UnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2NyZWF0ZVB1bGxSZXF1ZXN0IHBvc3RzIHRoZSBleHBlY3RlZCByZXF1ZXN0IGFuZCBwYXJzZXMgdGhlIHJlc3BvbnNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgZmV0Y2gsIGNhcHR1cmVkIH0gPSBjYXB0dXJpbmdGZXRjaChqc29uUmVzcG9uc2UoeyBodG1sX3VybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9vL3IvcHVsbC80MicsIG51bWJlcjogNDIsIG5vZGVfaWQ6ICdQUl9ub2RlXzQyJyB9KSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG1ha2VTZXJ2aWNlKGZldGNoKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlUHVsbFJlcXVlc3QoJ28nLCAncicsICdNeSBQUicsICdCb2R5JywgJ2ZlYXR1cmUnLCAnbWFpbicsIGZhbHNlLCAnZ2gtdG9rZW4nLCBzaWduYWwoKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyB1cmw6ICdodHRwczovL2dpdGh1Yi5jb20vby9yL3B1bGwvNDInLCBudW1iZXI6IDQyLCBub2RlSWQ6ICdQUl9ub2RlXzQyJyB9KTtcblxuXHRcdGNvbnN0IGNhcCA9IGNhcHR1cmVkKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhcC51cmwsICdodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL28vci9wdWxscycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYXAuaW5pdD8ubWV0aG9kLCAnUE9TVCcpO1xuXHRcdGNvbnN0IGhlYWRlcnMgPSBjYXAuaW5pdD8uaGVhZGVycyBhcyBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWydBdXRob3JpemF0aW9uJ10sICdCZWFyZXIgZ2gtdG9rZW4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1snQWNjZXB0J10sICdhcHBsaWNhdGlvbi92bmQuZ2l0aHViK2pzb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1snWC1HaXRIdWItQXBpLVZlcnNpb24nXSwgJzIwMjItMTEtMjgnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1snQ29udGVudC1UeXBlJ10sICdhcHBsaWNhdGlvbi9qc29uJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChKU09OLnBhcnNlKGNhcC5pbml0Py5ib2R5IGFzIHN0cmluZyksIHtcblx0XHRcdHRpdGxlOiAnTXkgUFInLFxuXHRcdFx0Ym9keTogJ0JvZHknLFxuXHRcdFx0aGVhZDogJ2ZlYXR1cmUnLFxuXHRcdFx0YmFzZTogJ21haW4nLFxuXHRcdFx0ZHJhZnQ6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVQdWxsUmVxdWVzdCBmb3J3YXJkcyB0aGUgZHJhZnQgZmxhZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGZldGNoLCBjYXB0dXJlZCB9ID0gY2FwdHVyaW5nRmV0Y2goanNvblJlc3BvbnNlKHsgaHRtbF91cmw6ICdodHRwczovL2dpdGh1Yi5jb20vby9yL3B1bGwvNycsIG51bWJlcjogNyB9KSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG1ha2VTZXJ2aWNlKGZldGNoKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuY3JlYXRlUHVsbFJlcXVlc3QoJ28nLCAncicsICd0JywgJ2InLCAnaCcsICdiJywgdHJ1ZSwgJ3RvaycsIHNpZ25hbCgpKTtcblxuXHRcdGNvbnN0IHNlbnQgPSBKU09OLnBhcnNlKGNhcHR1cmVkKCkuaW5pdD8uYm9keSBhcyBzdHJpbmcpIGFzIHsgZHJhZnQ6IGJvb2xlYW4gfTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VudC5kcmFmdCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZVB1bGxSZXF1ZXN0IGZvcndhcmRzIHRoZSBhYm9ydCBzaWduYWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBmZXRjaCwgY2FwdHVyZWQgfSA9IGNhcHR1cmluZ0ZldGNoKGpzb25SZXNwb25zZSh7IGh0bWxfdXJsOiAnaHR0cHM6Ly9naXRodWIuY29tL28vci9wdWxsLzcnLCBudW1iZXI6IDcgfSkpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBtYWtlU2VydmljZShmZXRjaCk7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuY3JlYXRlUHVsbFJlcXVlc3QoJ28nLCAncicsICd0JywgJ2InLCAnaCcsICdiJywgdHJ1ZSwgJ3RvaycsIGNvbnRyb2xsZXIuc2lnbmFsKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYXB0dXJlZCgpLmluaXQ/LnNpZ25hbCwgY29udHJvbGxlci5zaWduYWwpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaW5kUHVsbFJlcXVlc3RCeUhlYWRCcmFuY2ggZmV0Y2hlcyB0aGUgbGF0ZXN0IG1hdGNoaW5nIHB1bGwgcmVxdWVzdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGZldGNoLCBjYXB0dXJlZCB9ID0gY2FwdHVyaW5nRmV0Y2goanNvblJlc3BvbnNlKFt7IGh0bWxfdXJsOiAnaHR0cHM6Ly9naXRodWIuY29tL28vci9wdWxsLzknLCBudW1iZXI6IDksIG5vZGVfaWQ6ICdQUl9ub2RlXzknIH1dKSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG1ha2VTZXJ2aWNlKGZldGNoKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuZmluZFB1bGxSZXF1ZXN0QnlIZWFkQnJhbmNoKCdvJywgJ3InLCAnZmVhdHVyZS90ZXN0JywgJ3RvaycsIHNpZ25hbCgpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVzdWx0LFxuXHRcdFx0dXJsOiBjYXB0dXJlZCgpLnVybCxcblx0XHRcdG1ldGhvZDogY2FwdHVyZWQoKS5pbml0Py5tZXRob2QsXG5cdFx0fSwge1xuXHRcdFx0cmVzdWx0OiB7IHVybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9vL3IvcHVsbC85JywgbnVtYmVyOiA5LCBub2RlSWQ6ICdQUl9ub2RlXzknIH0sXG5cdFx0XHR1cmw6ICdodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL28vci9wdWxscz9oZWFkPW8lM0FmZWF0dXJlJTJGdGVzdCZzdGF0ZT1hbGwmc29ydD11cGRhdGVkJmRpcmVjdGlvbj1kZXNjJnBlcl9wYWdlPTEnLFxuXHRcdFx0bWV0aG9kOiAnR0VUJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZmluZFB1bGxSZXF1ZXN0QnlIZWFkQnJhbmNoIHF1YWxpZmllcyBhIGZvcmsgYnJhbmNoIHdpdGggaXRzIGhlYWQgb3duZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBmZXRjaCwgY2FwdHVyZWQgfSA9IGNhcHR1cmluZ0ZldGNoKGpzb25SZXNwb25zZShbeyBodG1sX3VybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9vL3IvcHVsbC85JywgbnVtYmVyOiA5IH1dKSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG1ha2VTZXJ2aWNlKGZldGNoKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuZmluZFB1bGxSZXF1ZXN0QnlIZWFkQnJhbmNoKCdvJywgJ3InLCAnZmVhdHVyZS90ZXN0JywgJ3RvaycsIHNpZ25hbCgpLCAnZm9yay1vd25lcicpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhcHR1cmVkKCkudXJsLCAnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9vL3IvcHVsbHM/aGVhZD1mb3JrLW93bmVyJTNBZmVhdHVyZSUyRnRlc3Qmc3RhdGU9YWxsJnNvcnQ9dXBkYXRlZCZkaXJlY3Rpb249ZGVzYyZwZXJfcGFnZT0xJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZVB1bGxSZXF1ZXN0IHRocm93cyBvbiBub24tT0sgcmVzcG9uc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG1ha2VTZXJ2aWNlKGNhcHR1cmluZ0ZldGNoKG5ldyBSZXNwb25zZSgne1wibWVzc2FnZVwiOlwiVmFsaWRhdGlvbiBGYWlsZWRcIn0nLCB7IHN0YXR1czogNDIyLCBzdGF0dXNUZXh0OiAnVW5wcm9jZXNzYWJsZSBFbnRpdHknIH0pKS5mZXRjaCk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdCgpID0+IHNlcnZpY2UuY3JlYXRlUHVsbFJlcXVlc3QoJ28nLCAncicsICd0JywgJ2InLCAnaCcsICdiJywgZmFsc2UsICd0b2snLCBzaWduYWwoKSksXG5cdFx0XHQvNDIyIFVucHJvY2Vzc2FibGUgRW50aXR5IC0ge1wibWVzc2FnZVwiOlwiVmFsaWRhdGlvbiBGYWlsZWRcIn0vLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZVB1bGxSZXF1ZXN0IHRydW5jYXRlcyBsb25nIG5vbi1PSyByZXNwb25zZSBib2RpZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG1ha2VTZXJ2aWNlKGNhcHR1cmluZ0ZldGNoKG5ldyBSZXNwb25zZShgcHJlZml4XFxuJHsneCcucmVwZWF0KDYwMCl9YCwgeyBzdGF0dXM6IDUwMCwgc3RhdHVzVGV4dDogJ1NlcnZlciBFcnJvcicgfSkpLmZldGNoKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0KCkgPT4gc2VydmljZS5jcmVhdGVQdWxsUmVxdWVzdCgnbycsICdyJywgJ3QnLCAnYicsICdoJywgJ2InLCBmYWxzZSwgJ3RvaycsIHNpZ25hbCgpKSxcblx0XHRcdGVyciA9PiBlcnIgaW5zdGFuY2VvZiBFcnJvciAmJiBlcnIubWVzc2FnZS5pbmNsdWRlcyhgcHJlZml4ICR7J3gnLnJlcGVhdCg0OTMpfS4uLmApICYmICFlcnIubWVzc2FnZS5pbmNsdWRlcygneCcucmVwZWF0KDYwMCkpLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZVB1bGxSZXF1ZXN0IHRocm93cyB3aGVuIHJlc3BvbnNlIGlzIG1pc3NpbmcgaHRtbF91cmwgb3IgbnVtYmVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBtYWtlU2VydmljZShjYXB0dXJpbmdGZXRjaChqc29uUmVzcG9uc2UoeyBodG1sX3VybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9vL3IvcHVsbC8xJyAvKiBtaXNzaW5nIG51bWJlciAqLyB9KSkuZmV0Y2gpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHQoKSA9PiBzZXJ2aWNlLmNyZWF0ZVB1bGxSZXF1ZXN0KCdvJywgJ3InLCAndCcsICdiJywgJ2gnLCAnYicsIGZhbHNlLCAndG9rJywgc2lnbmFsKCkpLFxuXHRcdFx0L0ZhaWxlZCB0byBjcmVhdGUgcHVsbCByZXF1ZXN0IGZvciBvXFwvci8sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZW5hYmxlUHVsbFJlcXVlc3RBdXRvTWVyZ2UgcG9zdHMgdGhlIEdyYXBoUUwgbXV0YXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBmZXRjaCwgY2FwdHVyZWQgfSA9IGNhcHR1cmluZ0ZldGNoKGpzb25SZXNwb25zZSh7IGRhdGE6IHsgZW5hYmxlUHVsbFJlcXVlc3RBdXRvTWVyZ2U6IHsgcHVsbFJlcXVlc3Q6IHsgaWQ6ICdQUl9ub2RlXzQyJyB9IH0gfSB9KSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG1ha2VTZXJ2aWNlKGZldGNoKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuZW5hYmxlUHVsbFJlcXVlc3RBdXRvTWVyZ2UoJ1BSX25vZGVfNDInLCAnU1FVQVNIJywgJ2doLXRva2VuJywgc2lnbmFsKCkpO1xuXG5cdFx0Y29uc3QgY2FwID0gY2FwdHVyZWQoKTtcblx0XHRjb25zdCBoZWFkZXJzID0gY2FwLmluaXQ/LmhlYWRlcnMgYXMgUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHVybDogY2FwLnVybCxcblx0XHRcdG1ldGhvZDogY2FwLmluaXQ/Lm1ldGhvZCxcblx0XHRcdGF1dGhvcml6YXRpb246IGhlYWRlcnNbJ0F1dGhvcml6YXRpb24nXSxcblx0XHRcdHZhcmlhYmxlczogKEpTT04ucGFyc2UoY2FwLmluaXQ/LmJvZHkgYXMgc3RyaW5nKSBhcyB7IHZhcmlhYmxlczogdW5rbm93biB9KS52YXJpYWJsZXMsXG5cdFx0fSwge1xuXHRcdFx0dXJsOiAnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9ncmFwaHFsJyxcblx0XHRcdG1ldGhvZDogJ1BPU1QnLFxuXHRcdFx0YXV0aG9yaXphdGlvbjogJ0JlYXJlciBnaC10b2tlbicsXG5cdFx0XHR2YXJpYWJsZXM6IHsgcHVsbFJlcXVlc3RJZDogJ1BSX25vZGVfNDInLCBtZXJnZU1ldGhvZDogJ1NRVUFTSCcgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZW5hYmxlUHVsbFJlcXVlc3RBdXRvTWVyZ2UgdGhyb3dzIHdoZW4gR3JhcGhRTCByZXR1cm5zIGVycm9ycycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gbWFrZVNlcnZpY2UoY2FwdHVyaW5nRmV0Y2goanNvblJlc3BvbnNlKHsgZXJyb3JzOiBbeyBtZXNzYWdlOiAnUHVsbCByZXF1ZXN0IGlzIGluIGNsZWFuIHN0YXR1cycgfV0gfSkpLmZldGNoKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0KCkgPT4gc2VydmljZS5lbmFibGVQdWxsUmVxdWVzdEF1dG9NZXJnZSgnUFJfbm9kZV80MicsICdNRVJHRScsICd0b2snLCBzaWduYWwoKSksXG5cdFx0XHQvR2l0SHViIEdyYXBoUUwgcmVxdWVzdCBmYWlsZWQ6IFB1bGwgcmVxdWVzdCBpcyBpbiBjbGVhbiBzdGF0dXMvLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JvdXRlcyBSRVNUIGNhbGxzIHRvIHRoZSBHaXRIdWIgRW50ZXJwcmlzZSBTZXJ2ZXIgQVBJIGJhc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBmZXRjaCwgY2FwdHVyZWQgfSA9IGNhcHR1cmluZ0ZldGNoKGpzb25SZXNwb25zZSh7IGh0bWxfdXJsOiAnaHR0cHM6Ly9naGUuYWNtZS5jb20vby9yL3B1bGwvNycsIG51bWJlcjogNywgbm9kZV9pZDogJ24nIH0pKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbWFrZVNlcnZpY2UoZmV0Y2gsICdodHRwczovL2doZS5hY21lLmNvbScpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5jcmVhdGVQdWxsUmVxdWVzdCgnbycsICdyJywgJ1QnLCAnQicsICdmZWF0dXJlJywgJ21haW4nLCBmYWxzZSwgJ3RvaycsIHNpZ25hbCgpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYXB0dXJlZCgpLnVybCwgJ2h0dHBzOi8vZ2hlLmFjbWUuY29tL2FwaS92My9yZXBvcy9vL3IvcHVsbHMnKTtcblx0fSk7XG5cblx0dGVzdCgncm91dGVzIEdyYXBoUUwgY2FsbHMgdG8gdGhlIEdpdEh1YiBFbnRlcnByaXNlIFNlcnZlciBHcmFwaFFMIGVuZHBvaW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgZmV0Y2gsIGNhcHR1cmVkIH0gPSBjYXB0dXJpbmdGZXRjaChqc29uUmVzcG9uc2UoeyBkYXRhOiB7IGVuYWJsZVB1bGxSZXF1ZXN0QXV0b01lcmdlOiB7IHB1bGxSZXF1ZXN0OiB7IGlkOiAnUFJfMScgfSB9IH0gfSkpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBtYWtlU2VydmljZShmZXRjaCwgJ2h0dHBzOi8vZ2hlLmFjbWUuY29tJyk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLmVuYWJsZVB1bGxSZXF1ZXN0QXV0b01lcmdlKCdQUl8xJywgJ01FUkdFJywgJ3RvaycsIHNpZ25hbCgpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYXB0dXJlZCgpLnVybCwgJ2h0dHBzOi8vZ2hlLmFjbWUuY29tL2FwaS9ncmFwaHFsJyk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywrQkFBbUQ7QUFDNUQsU0FBUyx1Q0FBdUM7QUFJaEQsU0FBUyxPQUFPLE9BQXVDO0FBQ3RELE1BQUksT0FBTyxVQUFVLFVBQVU7QUFDOUIsV0FBTztBQUFBLEVBQ1I7QUFDQSxTQUFPLGlCQUFpQixNQUFNLE1BQU0sT0FBTyxNQUFNO0FBQ2xEO0FBRUEsU0FBUyxZQUFZLFdBQTBCLGVBQWlEO0FBQy9GLFNBQU8sSUFBSSx3QkFBd0IsV0FBVyxJQUFJLGVBQWUsR0FBRyxnQ0FBZ0MsYUFBYSxDQUFDO0FBQ25IO0FBRUEsU0FBUyxTQUFzQjtBQUM5QixTQUFPLElBQUksZ0JBQWdCLEVBQUU7QUFDOUI7QUFFQSxTQUFTLGVBQWUsVUFBd0U7QUFDL0YsTUFBSSxjQUF3QixFQUFFLEtBQUssSUFBSSxNQUFNLE9BQVU7QUFDdkQsUUFBTSxPQUFzQixPQUFPLE9BQU8sU0FBUztBQUNsRCxrQkFBYyxFQUFFLEtBQUssT0FBTyxLQUFLLEdBQUcsS0FBSztBQUN6QyxXQUFPO0FBQUEsRUFDUjtBQUNBLFNBQU8sRUFBRSxPQUFPLE1BQU0sVUFBVSxNQUFNLFlBQVk7QUFDbkQ7QUFFQSxTQUFTLGFBQWEsTUFBZSxTQUFTLEtBQWU7QUFDNUQsU0FBTyxJQUFJLFNBQVMsS0FBSyxVQUFVLElBQUks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
