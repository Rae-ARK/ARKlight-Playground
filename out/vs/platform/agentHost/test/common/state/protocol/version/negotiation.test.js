import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { isCompatibleProtocolVersion, negotiateProtocolVersion } from "../../../../../common/state/protocol/version/negotiation.js";
suite("Protocol version negotiation", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("matrix of compatibility rules", () => {
    const cases = [
      // Exact match always works.
      ["0.1.0", "0.1.0", true],
      ["1.2.3", "1.2.3", true],
      // 0.x: minor must match; offered <= server.
      ["0.1.0", "0.1.5", true],
      ["0.1.5", "0.1.5", true],
      ["0.1.5", "0.1.0", false],
      ["0.2.0", "0.1.0", false],
      ["0.0.1", "0.1.0", false],
      // >=1.x: same major; offered <= server.
      ["1.0.0", "1.2.3", true],
      ["1.2.3", "1.0.0", false],
      ["2.0.0", "1.2.3", false],
      // Invalid versions: never compatible.
      ["not-a-version", "0.1.0", false],
      ["0.1.0", "0.1", false]
    ];
    const actual = cases.map(([offered, server, expected]) => ({
      offered,
      server,
      expected,
      got: isCompatibleProtocolVersion(offered, server)
    }));
    assert.deepStrictEqual(
      actual.filter((c) => c.got !== c.expected),
      [],
      "mismatched compatibility checks"
    );
  });
  test("negotiate picks the highest compatible offered version", () => {
    assert.strictEqual(negotiateProtocolVersion(["0.1.0", "0.1.2", "0.1.1"], "0.1.5"), "0.1.2");
    assert.strictEqual(negotiateProtocolVersion(["0.1.0", "0.2.0"], "0.1.0"), "0.1.0");
    assert.strictEqual(negotiateProtocolVersion(["0.0.5", "0.2.0"], "0.1.0"), void 0);
    assert.strictEqual(negotiateProtocolVersion([], "0.1.0"), void 0);
    assert.strictEqual(negotiateProtocolVersion(["0.1.2", "0.1.0"], "0.1.5"), "0.1.2");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC92ZXJzaW9uL25lZ290aWF0aW9uLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IGlzQ29tcGF0aWJsZVByb3RvY29sVmVyc2lvbiwgbmVnb3RpYXRlUHJvdG9jb2xWZXJzaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3ZlcnNpb24vbmVnb3RpYXRpb24uanMnO1xuXG5zdWl0ZSgnUHJvdG9jb2wgdmVyc2lvbiBuZWdvdGlhdGlvbicsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnbWF0cml4IG9mIGNvbXBhdGliaWxpdHkgcnVsZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2FzZXM6IFJlYWRvbmx5QXJyYXk8cmVhZG9ubHkgW3N0cmluZywgc3RyaW5nLCBib29sZWFuXT4gPSBbXG5cdFx0XHQvLyBFeGFjdCBtYXRjaCBhbHdheXMgd29ya3MuXG5cdFx0XHRbJzAuMS4wJywgJzAuMS4wJywgdHJ1ZV0sXG5cdFx0XHRbJzEuMi4zJywgJzEuMi4zJywgdHJ1ZV0sXG5cdFx0XHQvLyAwLng6IG1pbm9yIG11c3QgbWF0Y2g7IG9mZmVyZWQgPD0gc2VydmVyLlxuXHRcdFx0WycwLjEuMCcsICcwLjEuNScsIHRydWVdLFxuXHRcdFx0WycwLjEuNScsICcwLjEuNScsIHRydWVdLFxuXHRcdFx0WycwLjEuNScsICcwLjEuMCcsIGZhbHNlXSxcblx0XHRcdFsnMC4yLjAnLCAnMC4xLjAnLCBmYWxzZV0sXG5cdFx0XHRbJzAuMC4xJywgJzAuMS4wJywgZmFsc2VdLFxuXHRcdFx0Ly8gPj0xLng6IHNhbWUgbWFqb3I7IG9mZmVyZWQgPD0gc2VydmVyLlxuXHRcdFx0WycxLjAuMCcsICcxLjIuMycsIHRydWVdLFxuXHRcdFx0WycxLjIuMycsICcxLjAuMCcsIGZhbHNlXSxcblx0XHRcdFsnMi4wLjAnLCAnMS4yLjMnLCBmYWxzZV0sXG5cdFx0XHQvLyBJbnZhbGlkIHZlcnNpb25zOiBuZXZlciBjb21wYXRpYmxlLlxuXHRcdFx0Wydub3QtYS12ZXJzaW9uJywgJzAuMS4wJywgZmFsc2VdLFxuXHRcdFx0WycwLjEuMCcsICcwLjEnLCBmYWxzZV0sXG5cdFx0XTtcblx0XHRjb25zdCBhY3R1YWwgPSBjYXNlcy5tYXAoKFtvZmZlcmVkLCBzZXJ2ZXIsIGV4cGVjdGVkXSkgPT4gKHtcblx0XHRcdG9mZmVyZWQsIHNlcnZlciwgZXhwZWN0ZWQsIGdvdDogaXNDb21wYXRpYmxlUHJvdG9jb2xWZXJzaW9uKG9mZmVyZWQsIHNlcnZlciksXG5cdFx0fSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRhY3R1YWwuZmlsdGVyKGMgPT4gYy5nb3QgIT09IGMuZXhwZWN0ZWQpLFxuXHRcdFx0W10sXG5cdFx0XHQnbWlzbWF0Y2hlZCBjb21wYXRpYmlsaXR5IGNoZWNrcycsXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnbmVnb3RpYXRlIHBpY2tzIHRoZSBoaWdoZXN0IGNvbXBhdGlibGUgb2ZmZXJlZCB2ZXJzaW9uJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZWdvdGlhdGVQcm90b2NvbFZlcnNpb24oWycwLjEuMCcsICcwLjEuMicsICcwLjEuMSddLCAnMC4xLjUnKSwgJzAuMS4yJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5lZ290aWF0ZVByb3RvY29sVmVyc2lvbihbJzAuMS4wJywgJzAuMi4wJ10sICcwLjEuMCcpLCAnMC4xLjAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmVnb3RpYXRlUHJvdG9jb2xWZXJzaW9uKFsnMC4wLjUnLCAnMC4yLjAnXSwgJzAuMS4wJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5lZ290aWF0ZVByb3RvY29sVmVyc2lvbihbXSwgJzAuMS4wJyksIHVuZGVmaW5lZCk7XG5cdFx0Ly8gT3JkZXIgb2Ygb2ZmZXJlZCB2ZXJzaW9ucyBkb2VzIG5vdCBhZmZlY3QgdGhlIHJlc3VsdC5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmVnb3RpYXRlUHJvdG9jb2xWZXJzaW9uKFsnMC4xLjInLCAnMC4xLjAnXSwgJzAuMS41JyksICcwLjEuMicpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsNkJBQTZCLGdDQUFnQztBQUV0RSxNQUFNLGdDQUFnQyxNQUFNO0FBQzNDLDBDQUF3QztBQUV4QyxPQUFLLGlDQUFpQyxNQUFNO0FBQzNDLFVBQU0sUUFBMkQ7QUFBQTtBQUFBLE1BRWhFLENBQUMsU0FBUyxTQUFTLElBQUk7QUFBQSxNQUN2QixDQUFDLFNBQVMsU0FBUyxJQUFJO0FBQUE7QUFBQSxNQUV2QixDQUFDLFNBQVMsU0FBUyxJQUFJO0FBQUEsTUFDdkIsQ0FBQyxTQUFTLFNBQVMsSUFBSTtBQUFBLE1BQ3ZCLENBQUMsU0FBUyxTQUFTLEtBQUs7QUFBQSxNQUN4QixDQUFDLFNBQVMsU0FBUyxLQUFLO0FBQUEsTUFDeEIsQ0FBQyxTQUFTLFNBQVMsS0FBSztBQUFBO0FBQUEsTUFFeEIsQ0FBQyxTQUFTLFNBQVMsSUFBSTtBQUFBLE1BQ3ZCLENBQUMsU0FBUyxTQUFTLEtBQUs7QUFBQSxNQUN4QixDQUFDLFNBQVMsU0FBUyxLQUFLO0FBQUE7QUFBQSxNQUV4QixDQUFDLGlCQUFpQixTQUFTLEtBQUs7QUFBQSxNQUNoQyxDQUFDLFNBQVMsT0FBTyxLQUFLO0FBQUEsSUFDdkI7QUFDQSxVQUFNLFNBQVMsTUFBTSxJQUFJLENBQUMsQ0FBQyxTQUFTLFFBQVEsUUFBUSxPQUFPO0FBQUEsTUFDMUQ7QUFBQSxNQUFTO0FBQUEsTUFBUTtBQUFBLE1BQVUsS0FBSyw0QkFBNEIsU0FBUyxNQUFNO0FBQUEsSUFDNUUsRUFBRTtBQUNGLFdBQU87QUFBQSxNQUNOLE9BQU8sT0FBTyxPQUFLLEVBQUUsUUFBUSxFQUFFLFFBQVE7QUFBQSxNQUN2QyxDQUFDO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLDBEQUEwRCxNQUFNO0FBQ3BFLFdBQU8sWUFBWSx5QkFBeUIsQ0FBQyxTQUFTLFNBQVMsT0FBTyxHQUFHLE9BQU8sR0FBRyxPQUFPO0FBQzFGLFdBQU8sWUFBWSx5QkFBeUIsQ0FBQyxTQUFTLE9BQU8sR0FBRyxPQUFPLEdBQUcsT0FBTztBQUNqRixXQUFPLFlBQVkseUJBQXlCLENBQUMsU0FBUyxPQUFPLEdBQUcsT0FBTyxHQUFHLE1BQVM7QUFDbkYsV0FBTyxZQUFZLHlCQUF5QixDQUFDLEdBQUcsT0FBTyxHQUFHLE1BQVM7QUFFbkUsV0FBTyxZQUFZLHlCQUF5QixDQUFDLFNBQVMsT0FBTyxHQUFHLE9BQU8sR0FBRyxPQUFPO0FBQUEsRUFDbEYsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
