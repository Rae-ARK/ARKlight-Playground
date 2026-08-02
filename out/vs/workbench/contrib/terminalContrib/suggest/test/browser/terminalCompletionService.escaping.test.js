import { escapeTerminalCompletionLabel } from "../../browser/terminalCompletionService.js";
import { GeneralShellType, PosixShellType, WindowsShellType } from "../../../../../../platform/terminal/common/terminal.js";
import { strict as assert } from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
suite("escapeTerminalCompletionLabel", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const shellType = PosixShellType.Bash;
  const pathSeparator = "/";
  const cases = [
    { char: "[", label: "[abc", expected: "\\[abc" },
    { char: "]", label: "abc]", expected: "abc\\]" },
    { char: "(", label: "(abc", expected: "\\(abc" },
    { char: ")", label: "abc)", expected: "abc\\)" },
    { char: "'", label: `'abc`, expected: `\\'abc` },
    { char: '"', label: '"abc', expected: '\\"abc' },
    { char: "\\", label: "abc\\", expected: "abc\\\\" },
    { char: "`", label: "`abc", expected: "\\`abc" },
    { char: "*", label: "*abc", expected: "\\*abc" },
    { char: "?", label: "?abc", expected: "\\?abc" },
    { char: ";", label: ";abc", expected: "\\;abc" },
    { char: "&", label: "&abc", expected: "\\&abc" },
    { char: "|", label: "|abc", expected: "\\|abc" },
    { char: "<", label: "<abc", expected: "\\<abc" },
    { char: ">", label: ">abc", expected: "\\>abc" }
  ];
  for (const { char, label, expected } of cases) {
    test(`should escape '${char}' in "${label}"`, () => {
      const result = escapeTerminalCompletionLabel(label, shellType, pathSeparator);
      assert.equal(result, expected);
    });
  }
  test("should not escape when no special chars", () => {
    const result = escapeTerminalCompletionLabel("abc", shellType, pathSeparator);
    assert.equal(result, "abc");
  });
  test("should not escape for PowerShell", () => {
    const result = escapeTerminalCompletionLabel("[abc", GeneralShellType.PowerShell, pathSeparator);
    assert.equal(result, "[abc");
  });
  test("should not escape for CommandPrompt", () => {
    const result = escapeTerminalCompletionLabel("[abc", WindowsShellType.CommandPrompt, pathSeparator);
    assert.equal(result, "[abc");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9zdWdnZXN0L3Rlc3QvYnJvd3Nlci90ZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlLmVzY2FwaW5nLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBlc2NhcGVUZXJtaW5hbENvbXBsZXRpb25MYWJlbCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdGVybWluYWxDb21wbGV0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBHZW5lcmFsU2hlbGxUeXBlLCBQb3NpeFNoZWxsVHlwZSwgVGVybWluYWxTaGVsbFR5cGUsIFdpbmRvd3NTaGVsbFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgc3RyaWN0IGFzIGFzc2VydCB9IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcblxuc3VpdGUoJ2VzY2FwZVRlcm1pbmFsQ29tcGxldGlvbkxhYmVsJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblx0Y29uc3Qgc2hlbGxUeXBlOiBUZXJtaW5hbFNoZWxsVHlwZSA9IFBvc2l4U2hlbGxUeXBlLkJhc2g7XG5cdGNvbnN0IHBhdGhTZXBhcmF0b3IgPSAnLyc7XG5cdGNvbnN0IGNhc2VzID0gW1xuXHRcdHsgY2hhcjogJ1snLCBsYWJlbDogJ1thYmMnLCBleHBlY3RlZDogJ1xcXFxbYWJjJyB9LFxuXHRcdHsgY2hhcjogJ10nLCBsYWJlbDogJ2FiY10nLCBleHBlY3RlZDogJ2FiY1xcXFxdJyB9LFxuXHRcdHsgY2hhcjogJygnLCBsYWJlbDogJyhhYmMnLCBleHBlY3RlZDogJ1xcXFwoYWJjJyB9LFxuXHRcdHsgY2hhcjogJyknLCBsYWJlbDogJ2FiYyknLCBleHBlY3RlZDogJ2FiY1xcXFwpJyB9LFxuXHRcdHsgY2hhcjogJ1xcJycsIGxhYmVsOiBgJ2FiY2AsIGV4cGVjdGVkOiBgXFxcXCdhYmNgIH0sXG5cdFx0eyBjaGFyOiAnXCInLCBsYWJlbDogJ1wiYWJjJywgZXhwZWN0ZWQ6ICdcXFxcXCJhYmMnIH0sXG5cdFx0eyBjaGFyOiAnXFxcXCcsIGxhYmVsOiAnYWJjXFxcXCcsIGV4cGVjdGVkOiAnYWJjXFxcXFxcXFwnIH0sXG5cdFx0eyBjaGFyOiAnYCcsIGxhYmVsOiAnYGFiYycsIGV4cGVjdGVkOiAnXFxcXGBhYmMnIH0sXG5cdFx0eyBjaGFyOiAnKicsIGxhYmVsOiAnKmFiYycsIGV4cGVjdGVkOiAnXFxcXCphYmMnIH0sXG5cdFx0eyBjaGFyOiAnPycsIGxhYmVsOiAnP2FiYycsIGV4cGVjdGVkOiAnXFxcXD9hYmMnIH0sXG5cdFx0eyBjaGFyOiAnOycsIGxhYmVsOiAnO2FiYycsIGV4cGVjdGVkOiAnXFxcXDthYmMnIH0sXG5cdFx0eyBjaGFyOiAnJicsIGxhYmVsOiAnJmFiYycsIGV4cGVjdGVkOiAnXFxcXCZhYmMnIH0sXG5cdFx0eyBjaGFyOiAnfCcsIGxhYmVsOiAnfGFiYycsIGV4cGVjdGVkOiAnXFxcXHxhYmMnIH0sXG5cdFx0eyBjaGFyOiAnPCcsIGxhYmVsOiAnPGFiYycsIGV4cGVjdGVkOiAnXFxcXDxhYmMnIH0sXG5cdFx0eyBjaGFyOiAnPicsIGxhYmVsOiAnPmFiYycsIGV4cGVjdGVkOiAnXFxcXD5hYmMnIH0sXG5cdF07XG5cblx0Zm9yIChjb25zdCB7IGNoYXIsIGxhYmVsLCBleHBlY3RlZCB9IG9mIGNhc2VzKSB7XG5cdFx0dGVzdChgc2hvdWxkIGVzY2FwZSAnJHtjaGFyfScgaW4gXCIke2xhYmVsfVwiYCwgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXNjYXBlVGVybWluYWxDb21wbGV0aW9uTGFiZWwobGFiZWwsIHNoZWxsVHlwZSwgcGF0aFNlcGFyYXRvcik7XG5cdFx0XHRhc3NlcnQuZXF1YWwocmVzdWx0LCBleHBlY3RlZCk7XG5cdFx0fSk7XG5cdH1cblxuXHR0ZXN0KCdzaG91bGQgbm90IGVzY2FwZSB3aGVuIG5vIHNwZWNpYWwgY2hhcnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gZXNjYXBlVGVybWluYWxDb21wbGV0aW9uTGFiZWwoJ2FiYycsIHNoZWxsVHlwZSwgcGF0aFNlcGFyYXRvcik7XG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdCwgJ2FiYycpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgbm90IGVzY2FwZSBmb3IgUG93ZXJTaGVsbCcsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBlc2NhcGVUZXJtaW5hbENvbXBsZXRpb25MYWJlbCgnW2FiYycsIEdlbmVyYWxTaGVsbFR5cGUuUG93ZXJTaGVsbCwgcGF0aFNlcGFyYXRvcik7XG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdCwgJ1thYmMnKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIG5vdCBlc2NhcGUgZm9yIENvbW1hbmRQcm9tcHQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gZXNjYXBlVGVybWluYWxDb21wbGV0aW9uTGFiZWwoJ1thYmMnLCBXaW5kb3dzU2hlbGxUeXBlLkNvbW1hbmRQcm9tcHQsIHBhdGhTZXBhcmF0b3IpO1xuXHRcdGFzc2VydC5lcXVhbChyZXN1bHQsICdbYWJjJyk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLGtCQUFrQixnQkFBbUMsd0JBQXdCO0FBQ3RGLFNBQVMsVUFBVSxjQUFjO0FBQ2pDLFNBQVMsK0NBQStDO0FBRXhELE1BQU0saUNBQWlDLE1BQU07QUFDNUMsMENBQXdDO0FBQ3hDLFFBQU0sWUFBK0IsZUFBZTtBQUNwRCxRQUFNLGdCQUFnQjtBQUN0QixRQUFNLFFBQVE7QUFBQSxJQUNiLEVBQUUsTUFBTSxLQUFLLE9BQU8sUUFBUSxVQUFVLFNBQVM7QUFBQSxJQUMvQyxFQUFFLE1BQU0sS0FBSyxPQUFPLFFBQVEsVUFBVSxTQUFTO0FBQUEsSUFDL0MsRUFBRSxNQUFNLEtBQUssT0FBTyxRQUFRLFVBQVUsU0FBUztBQUFBLElBQy9DLEVBQUUsTUFBTSxLQUFLLE9BQU8sUUFBUSxVQUFVLFNBQVM7QUFBQSxJQUMvQyxFQUFFLE1BQU0sS0FBTSxPQUFPLFFBQVEsVUFBVSxTQUFTO0FBQUEsSUFDaEQsRUFBRSxNQUFNLEtBQUssT0FBTyxRQUFRLFVBQVUsU0FBUztBQUFBLElBQy9DLEVBQUUsTUFBTSxNQUFNLE9BQU8sU0FBUyxVQUFVLFVBQVU7QUFBQSxJQUNsRCxFQUFFLE1BQU0sS0FBSyxPQUFPLFFBQVEsVUFBVSxTQUFTO0FBQUEsSUFDL0MsRUFBRSxNQUFNLEtBQUssT0FBTyxRQUFRLFVBQVUsU0FBUztBQUFBLElBQy9DLEVBQUUsTUFBTSxLQUFLLE9BQU8sUUFBUSxVQUFVLFNBQVM7QUFBQSxJQUMvQyxFQUFFLE1BQU0sS0FBSyxPQUFPLFFBQVEsVUFBVSxTQUFTO0FBQUEsSUFDL0MsRUFBRSxNQUFNLEtBQUssT0FBTyxRQUFRLFVBQVUsU0FBUztBQUFBLElBQy9DLEVBQUUsTUFBTSxLQUFLLE9BQU8sUUFBUSxVQUFVLFNBQVM7QUFBQSxJQUMvQyxFQUFFLE1BQU0sS0FBSyxPQUFPLFFBQVEsVUFBVSxTQUFTO0FBQUEsSUFDL0MsRUFBRSxNQUFNLEtBQUssT0FBTyxRQUFRLFVBQVUsU0FBUztBQUFBLEVBQ2hEO0FBRUEsYUFBVyxFQUFFLE1BQU0sT0FBTyxTQUFTLEtBQUssT0FBTztBQUM5QyxTQUFLLGtCQUFrQixJQUFJLFNBQVMsS0FBSyxLQUFLLE1BQU07QUFDbkQsWUFBTSxTQUFTLDhCQUE4QixPQUFPLFdBQVcsYUFBYTtBQUM1RSxhQUFPLE1BQU0sUUFBUSxRQUFRO0FBQUEsSUFDOUIsQ0FBQztBQUFBLEVBQ0Y7QUFFQSxPQUFLLDJDQUEyQyxNQUFNO0FBQ3JELFVBQU0sU0FBUyw4QkFBOEIsT0FBTyxXQUFXLGFBQWE7QUFDNUUsV0FBTyxNQUFNLFFBQVEsS0FBSztBQUFBLEVBQzNCLENBQUM7QUFFRCxPQUFLLG9DQUFvQyxNQUFNO0FBQzlDLFVBQU0sU0FBUyw4QkFBOEIsUUFBUSxpQkFBaUIsWUFBWSxhQUFhO0FBQy9GLFdBQU8sTUFBTSxRQUFRLE1BQU07QUFBQSxFQUM1QixDQUFDO0FBRUQsT0FBSyx1Q0FBdUMsTUFBTTtBQUNqRCxVQUFNLFNBQVMsOEJBQThCLFFBQVEsaUJBQWlCLGVBQWUsYUFBYTtBQUNsRyxXQUFPLE1BQU0sUUFBUSxNQUFNO0FBQUEsRUFDNUIsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
