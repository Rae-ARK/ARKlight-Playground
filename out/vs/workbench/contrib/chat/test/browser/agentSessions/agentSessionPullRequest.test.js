import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { getAgentSessionPullRequestContextValue, getAgentSessionPullRequestUri } from "../../../browser/agentSessions/agentSessionsModel.js";
suite("agentSessionPullRequest", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function probe(metadata) {
    return {
      uri: getAgentSessionPullRequestUri({ metadata })?.toString(),
      contextValue: getAgentSessionPullRequestContextValue({ metadata })
    };
  }
  test("resolves from pullRequestUrl, falls back to number + owner/name, otherwise none", () => {
    assert.deepStrictEqual([
      probe(void 0),
      probe({}),
      probe({ pullRequestUrl: "https://github.com/microsoft/vscode/pull/42" }),
      probe({ pullRequestNumber: 42, owner: "microsoft", name: "vscode" }),
      // A task-backed cloud session that has not produced a pull request.
      probe({ owner: "microsoft", name: "vscode", branch: "copilot/fix-1" }),
      // Partial data is not enough to build a pull request url.
      probe({ pullRequestNumber: 42, owner: "microsoft" }),
      // Empty owner/name would produce `https://github.com///pull/42`.
      probe({ pullRequestNumber: 42, owner: "", name: "" }),
      probe({ pullRequestNumber: 42, owner: "microsoft", name: "" }),
      // Non-string/number metadata must not be coerced.
      probe({ pullRequestUrl: 42 }),
      probe({ pullRequestNumber: "42", owner: "microsoft", name: "vscode" })
    ], [
      { uri: void 0, contextValue: "none" },
      { uri: void 0, contextValue: "none" },
      { uri: "https://github.com/microsoft/vscode/pull/42", contextValue: "available" },
      { uri: "https://github.com/microsoft/vscode/pull/42", contextValue: "available" },
      { uri: void 0, contextValue: "none" },
      { uri: void 0, contextValue: "none" },
      { uri: void 0, contextValue: "none" },
      { uri: void 0, contextValue: "none" },
      { uri: void 0, contextValue: "none" },
      { uri: void 0, contextValue: "none" }
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uUHVsbFJlcXVlc3QudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgZ2V0QWdlbnRTZXNzaW9uUHVsbFJlcXVlc3RDb250ZXh0VmFsdWUsIGdldEFnZW50U2Vzc2lvblB1bGxSZXF1ZXN0VXJpIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnNNb2RlbC5qcyc7XG5cbnN1aXRlKCdhZ2VudFNlc3Npb25QdWxsUmVxdWVzdCcsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBwcm9iZShtZXRhZGF0YTogeyBba2V5OiBzdHJpbmddOiB1bmtub3duIH0gfCB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dXJpOiBnZXRBZ2VudFNlc3Npb25QdWxsUmVxdWVzdFVyaSh7IG1ldGFkYXRhIH0pPy50b1N0cmluZygpLFxuXHRcdFx0Y29udGV4dFZhbHVlOiBnZXRBZ2VudFNlc3Npb25QdWxsUmVxdWVzdENvbnRleHRWYWx1ZSh7IG1ldGFkYXRhIH0pXG5cdFx0fTtcblx0fVxuXG5cdHRlc3QoJ3Jlc29sdmVzIGZyb20gcHVsbFJlcXVlc3RVcmwsIGZhbGxzIGJhY2sgdG8gbnVtYmVyICsgb3duZXIvbmFtZSwgb3RoZXJ3aXNlIG5vbmUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRwcm9iZSh1bmRlZmluZWQpLFxuXHRcdFx0cHJvYmUoe30pLFxuXHRcdFx0cHJvYmUoeyBwdWxsUmVxdWVzdFVybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvNDInIH0pLFxuXHRcdFx0cHJvYmUoeyBwdWxsUmVxdWVzdE51bWJlcjogNDIsIG93bmVyOiAnbWljcm9zb2Z0JywgbmFtZTogJ3ZzY29kZScgfSksXG5cdFx0XHQvLyBBIHRhc2stYmFja2VkIGNsb3VkIHNlc3Npb24gdGhhdCBoYXMgbm90IHByb2R1Y2VkIGEgcHVsbCByZXF1ZXN0LlxuXHRcdFx0cHJvYmUoeyBvd25lcjogJ21pY3Jvc29mdCcsIG5hbWU6ICd2c2NvZGUnLCBicmFuY2g6ICdjb3BpbG90L2ZpeC0xJyB9KSxcblx0XHRcdC8vIFBhcnRpYWwgZGF0YSBpcyBub3QgZW5vdWdoIHRvIGJ1aWxkIGEgcHVsbCByZXF1ZXN0IHVybC5cblx0XHRcdHByb2JlKHsgcHVsbFJlcXVlc3ROdW1iZXI6IDQyLCBvd25lcjogJ21pY3Jvc29mdCcgfSksXG5cdFx0XHQvLyBFbXB0eSBvd25lci9uYW1lIHdvdWxkIHByb2R1Y2UgYGh0dHBzOi8vZ2l0aHViLmNvbS8vL3B1bGwvNDJgLlxuXHRcdFx0cHJvYmUoeyBwdWxsUmVxdWVzdE51bWJlcjogNDIsIG93bmVyOiAnJywgbmFtZTogJycgfSksXG5cdFx0XHRwcm9iZSh7IHB1bGxSZXF1ZXN0TnVtYmVyOiA0Miwgb3duZXI6ICdtaWNyb3NvZnQnLCBuYW1lOiAnJyB9KSxcblx0XHRcdC8vIE5vbi1zdHJpbmcvbnVtYmVyIG1ldGFkYXRhIG11c3Qgbm90IGJlIGNvZXJjZWQuXG5cdFx0XHRwcm9iZSh7IHB1bGxSZXF1ZXN0VXJsOiA0MiB9KSxcblx0XHRcdHByb2JlKHsgcHVsbFJlcXVlc3ROdW1iZXI6ICc0MicsIG93bmVyOiAnbWljcm9zb2Z0JywgbmFtZTogJ3ZzY29kZScgfSksXG5cdFx0XSwgW1xuXHRcdFx0eyB1cmk6IHVuZGVmaW5lZCwgY29udGV4dFZhbHVlOiAnbm9uZScgfSxcblx0XHRcdHsgdXJpOiB1bmRlZmluZWQsIGNvbnRleHRWYWx1ZTogJ25vbmUnIH0sXG5cdFx0XHR7IHVyaTogJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvNDInLCBjb250ZXh0VmFsdWU6ICdhdmFpbGFibGUnIH0sXG5cdFx0XHR7IHVyaTogJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvNDInLCBjb250ZXh0VmFsdWU6ICdhdmFpbGFibGUnIH0sXG5cdFx0XHR7IHVyaTogdW5kZWZpbmVkLCBjb250ZXh0VmFsdWU6ICdub25lJyB9LFxuXHRcdFx0eyB1cmk6IHVuZGVmaW5lZCwgY29udGV4dFZhbHVlOiAnbm9uZScgfSxcblx0XHRcdHsgdXJpOiB1bmRlZmluZWQsIGNvbnRleHRWYWx1ZTogJ25vbmUnIH0sXG5cdFx0XHR7IHVyaTogdW5kZWZpbmVkLCBjb250ZXh0VmFsdWU6ICdub25lJyB9LFxuXHRcdFx0eyB1cmk6IHVuZGVmaW5lZCwgY29udGV4dFZhbHVlOiAnbm9uZScgfSxcblx0XHRcdHsgdXJpOiB1bmRlZmluZWQsIGNvbnRleHRWYWx1ZTogJ25vbmUnIH0sXG5cdFx0XSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyx3Q0FBd0MscUNBQXFDO0FBRXRGLE1BQU0sMkJBQTJCLE1BQU07QUFFdEMsMENBQXdDO0FBRXhDLFdBQVMsTUFBTSxVQUFrRDtBQUNoRSxXQUFPO0FBQUEsTUFDTixLQUFLLDhCQUE4QixFQUFFLFNBQVMsQ0FBQyxHQUFHLFNBQVM7QUFBQSxNQUMzRCxjQUFjLHVDQUF1QyxFQUFFLFNBQVMsQ0FBQztBQUFBLElBQ2xFO0FBQUEsRUFDRDtBQUVBLE9BQUssbUZBQW1GLE1BQU07QUFDN0YsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixNQUFNLE1BQVM7QUFBQSxNQUNmLE1BQU0sQ0FBQyxDQUFDO0FBQUEsTUFDUixNQUFNLEVBQUUsZ0JBQWdCLDhDQUE4QyxDQUFDO0FBQUEsTUFDdkUsTUFBTSxFQUFFLG1CQUFtQixJQUFJLE9BQU8sYUFBYSxNQUFNLFNBQVMsQ0FBQztBQUFBO0FBQUEsTUFFbkUsTUFBTSxFQUFFLE9BQU8sYUFBYSxNQUFNLFVBQVUsUUFBUSxnQkFBZ0IsQ0FBQztBQUFBO0FBQUEsTUFFckUsTUFBTSxFQUFFLG1CQUFtQixJQUFJLE9BQU8sWUFBWSxDQUFDO0FBQUE7QUFBQSxNQUVuRCxNQUFNLEVBQUUsbUJBQW1CLElBQUksT0FBTyxJQUFJLE1BQU0sR0FBRyxDQUFDO0FBQUEsTUFDcEQsTUFBTSxFQUFFLG1CQUFtQixJQUFJLE9BQU8sYUFBYSxNQUFNLEdBQUcsQ0FBQztBQUFBO0FBQUEsTUFFN0QsTUFBTSxFQUFFLGdCQUFnQixHQUFHLENBQUM7QUFBQSxNQUM1QixNQUFNLEVBQUUsbUJBQW1CLE1BQU0sT0FBTyxhQUFhLE1BQU0sU0FBUyxDQUFDO0FBQUEsSUFDdEUsR0FBRztBQUFBLE1BQ0YsRUFBRSxLQUFLLFFBQVcsY0FBYyxPQUFPO0FBQUEsTUFDdkMsRUFBRSxLQUFLLFFBQVcsY0FBYyxPQUFPO0FBQUEsTUFDdkMsRUFBRSxLQUFLLCtDQUErQyxjQUFjLFlBQVk7QUFBQSxNQUNoRixFQUFFLEtBQUssK0NBQStDLGNBQWMsWUFBWTtBQUFBLE1BQ2hGLEVBQUUsS0FBSyxRQUFXLGNBQWMsT0FBTztBQUFBLE1BQ3ZDLEVBQUUsS0FBSyxRQUFXLGNBQWMsT0FBTztBQUFBLE1BQ3ZDLEVBQUUsS0FBSyxRQUFXLGNBQWMsT0FBTztBQUFBLE1BQ3ZDLEVBQUUsS0FBSyxRQUFXLGNBQWMsT0FBTztBQUFBLE1BQ3ZDLEVBQUUsS0FBSyxRQUFXLGNBQWMsT0FBTztBQUFBLE1BQ3ZDLEVBQUUsS0FBSyxRQUFXLGNBQWMsT0FBTztBQUFBLElBQ3hDLENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
