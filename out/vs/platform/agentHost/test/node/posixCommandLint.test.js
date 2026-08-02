import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { findPosixOnlyCommands } from "./e2e/harness/posixCommandLint.js";
function check(commands) {
  const recorded = commands.map((command) => ({ command, toolName: "bash" }));
  return findPosixOnlyCommands(recorded).map((finding) => finding.command);
}
suite("posixCommandLint", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("flags the POSIX commands models actually reach for", () => {
    const flagged = [
      `wc -l < lines.txt`,
      `printf '%s\\n' "SHELL_VALUE_73"`,
      `ls -1`,
      `ls -la \${workdir}/`,
      `rm \${workdir}/before.txt`,
      `mv before.txt after.txt && ls -la after.txt`,
      `cat missing.txt 2>&1`,
      `mkdir -p output && printf 'NESTED' > output/report.txt`,
      `find / -maxdepth 6 -iname "edit.txt" 2>/dev/null`,
      `xxd \${workdir}/after.txt`,
      `test -f peer-edit.txt && echo EXISTS || echo MISSING`,
      `echo "$HOME"`
    ];
    assert.deepStrictEqual(check(flagged), flagged);
  });
  test("accepts the portable forms the suite standardizes on", () => {
    assert.deepStrictEqual(check([
      `echo SHELL_VALUE_73`,
      `echo "hello from test"`,
      `git status --porcelain`,
      `node -e "console.log(process.cwd())"`,
      `node -e "require('fs').renameSync('before.txt','after.txt')"`,
      `node -e "require('fs').unlinkSync('delete-me.txt')"`,
      `node -e "console.log(require('fs').readdirSync('.').join(' '))"`,
      `node -e "const fs=require('fs');fs.mkdirSync('output',{recursive:true});fs.writeFileSync('output/report.txt','X')"`,
      `node script.js`,
      // PowerShell defines `pwd` as an alias for `Get-Location`.
      `pwd`
    ]), []);
  });
  test("does not flag POSIX command names appearing as arguments", () => {
    assert.deepStrictEqual(check([
      `node -e "console.log('ls')"`,
      `echo cat`,
      `node -e "require('fs').writeFileSync('rm.txt','x')"`,
      `node -e "console.log(require('fs').readdirSync('.'))"`,
      `git status --find-renames`
    ]), []);
  });
  test("ignores recorder placeholders that look like variable expansions", () => {
    assert.deepStrictEqual(check([
      `node -e "console.log(1)" \${workdir}`,
      `echo \${homedir}`,
      `node script.js \${temp}`
    ]), []);
  });
  test("reports the reason and tool for each finding", () => {
    assert.deepStrictEqual(findPosixOnlyCommands([
      { command: `wc -l lines.txt`, toolName: "bash" },
      { command: `echo ok`, toolName: "bash" },
      { command: `cat x 2>/dev/null`, toolName: "powershell" }
    ]), [
      { command: `wc -l lines.txt`, toolName: "bash", reason: "uses a POSIX coreutil or shell builtin that is not portable to Windows shells" },
      { command: `cat x 2>/dev/null`, toolName: "powershell", reason: "uses a POSIX coreutil or shell builtin that is not portable to Windows shells" }
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvcG9zaXhDb21tYW5kTGludC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBmaW5kUG9zaXhPbmx5Q29tbWFuZHMsIHR5cGUgSVJlY29yZGVkQ29tbWFuZCB9IGZyb20gJy4vZTJlL2hhcm5lc3MvcG9zaXhDb21tYW5kTGludC5qcyc7XG5cbmZ1bmN0aW9uIGNoZWNrKGNvbW1hbmRzOiByZWFkb25seSBzdHJpbmdbXSk6IHN0cmluZ1tdIHtcblx0Y29uc3QgcmVjb3JkZWQ6IElSZWNvcmRlZENvbW1hbmRbXSA9IGNvbW1hbmRzLm1hcChjb21tYW5kID0+ICh7IGNvbW1hbmQsIHRvb2xOYW1lOiAnYmFzaCcgfSkpO1xuXHRyZXR1cm4gZmluZFBvc2l4T25seUNvbW1hbmRzKHJlY29yZGVkKS5tYXAoZmluZGluZyA9PiBmaW5kaW5nLmNvbW1hbmQpO1xufVxuXG5zdWl0ZSgncG9zaXhDb21tYW5kTGludCcsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdmbGFncyB0aGUgUE9TSVggY29tbWFuZHMgbW9kZWxzIGFjdHVhbGx5IHJlYWNoIGZvcicsICgpID0+IHtcblx0XHQvLyBFdmVyeSBvbmUgb2YgdGhlc2Ugd2FzIHJlY29yZGVkIGludG8gYSByZWFsIGZpeHR1cmUgYnkgYSBwcm92aWRlciBhbmRcblx0XHQvLyBkaXNhYmxlZCBpdHMgdGVzdCBvbiBXaW5kb3dzLlxuXHRcdGNvbnN0IGZsYWdnZWQgPSBbXG5cdFx0XHRgd2MgLWwgPCBsaW5lcy50eHRgLFxuXHRcdFx0YHByaW50ZiAnJXNcXFxcbicgXCJTSEVMTF9WQUxVRV83M1wiYCxcblx0XHRcdGBscyAtMWAsXG5cdFx0XHRgbHMgLWxhIFxcJHt3b3JrZGlyfS9gLFxuXHRcdFx0YHJtIFxcJHt3b3JrZGlyfS9iZWZvcmUudHh0YCxcblx0XHRcdGBtdiBiZWZvcmUudHh0IGFmdGVyLnR4dCAmJiBscyAtbGEgYWZ0ZXIudHh0YCxcblx0XHRcdGBjYXQgbWlzc2luZy50eHQgMj4mMWAsXG5cdFx0XHRgbWtkaXIgLXAgb3V0cHV0ICYmIHByaW50ZiAnTkVTVEVEJyA+IG91dHB1dC9yZXBvcnQudHh0YCxcblx0XHRcdGBmaW5kIC8gLW1heGRlcHRoIDYgLWluYW1lIFwiZWRpdC50eHRcIiAyPi9kZXYvbnVsbGAsXG5cdFx0XHRgeHhkIFxcJHt3b3JrZGlyfS9hZnRlci50eHRgLFxuXHRcdFx0YHRlc3QgLWYgcGVlci1lZGl0LnR4dCAmJiBlY2hvIEVYSVNUUyB8fCBlY2hvIE1JU1NJTkdgLFxuXHRcdFx0YGVjaG8gXCIkSE9NRVwiYCxcblx0XHRdO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2hlY2soZmxhZ2dlZCksIGZsYWdnZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhY2NlcHRzIHRoZSBwb3J0YWJsZSBmb3JtcyB0aGUgc3VpdGUgc3RhbmRhcmRpemVzIG9uJywgKCkgPT4ge1xuXHRcdC8vIEEgZmFsc2UgcG9zaXRpdmUgaXMgd29yc2UgdGhhbiBubyBsaW50OiBpdCB3b3VsZCBibG9jayBhIGNvcnJlY3Rcblx0XHQvLyByZWNvcmRpbmcgYW5kIHB1c2ggYXV0aG9ycyB0b3dhcmQgZGlzYWJsaW5nIHRoZSBjaGVjay5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNoZWNrKFtcblx0XHRcdGBlY2hvIFNIRUxMX1ZBTFVFXzczYCxcblx0XHRcdGBlY2hvIFwiaGVsbG8gZnJvbSB0ZXN0XCJgLFxuXHRcdFx0YGdpdCBzdGF0dXMgLS1wb3JjZWxhaW5gLFxuXHRcdFx0YG5vZGUgLWUgXCJjb25zb2xlLmxvZyhwcm9jZXNzLmN3ZCgpKVwiYCxcblx0XHRcdGBub2RlIC1lIFwicmVxdWlyZSgnZnMnKS5yZW5hbWVTeW5jKCdiZWZvcmUudHh0JywnYWZ0ZXIudHh0JylcImAsXG5cdFx0XHRgbm9kZSAtZSBcInJlcXVpcmUoJ2ZzJykudW5saW5rU3luYygnZGVsZXRlLW1lLnR4dCcpXCJgLFxuXHRcdFx0YG5vZGUgLWUgXCJjb25zb2xlLmxvZyhyZXF1aXJlKCdmcycpLnJlYWRkaXJTeW5jKCcuJykuam9pbignICcpKVwiYCxcblx0XHRcdGBub2RlIC1lIFwiY29uc3QgZnM9cmVxdWlyZSgnZnMnKTtmcy5ta2RpclN5bmMoJ291dHB1dCcse3JlY3Vyc2l2ZTp0cnVlfSk7ZnMud3JpdGVGaWxlU3luYygnb3V0cHV0L3JlcG9ydC50eHQnLCdYJylcImAsXG5cdFx0XHRgbm9kZSBzY3JpcHQuanNgLFxuXHRcdFx0Ly8gUG93ZXJTaGVsbCBkZWZpbmVzIGBwd2RgIGFzIGFuIGFsaWFzIGZvciBgR2V0LUxvY2F0aW9uYC5cblx0XHRcdGBwd2RgLFxuXHRcdF0pLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGZsYWcgUE9TSVggY29tbWFuZCBuYW1lcyBhcHBlYXJpbmcgYXMgYXJndW1lbnRzJywgKCkgPT4ge1xuXHRcdC8vIFRoZSBwYXR0ZXJucyBhcmUgYW5jaG9yZWQgdG8gYSBjb21tYW5kIHBvc2l0aW9uLCBzbyBhIGNvcmV1dGlsIG5hbWVcblx0XHQvLyBpbnNpZGUgYSBxdW90ZWQgc3RyaW5nIG9yIGFzIHBhcnQgb2YgYSBsb25nZXIgd29yZCBpcyBub3QgYSBjb21tYW5kLlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2hlY2soW1xuXHRcdFx0YG5vZGUgLWUgXCJjb25zb2xlLmxvZygnbHMnKVwiYCxcblx0XHRcdGBlY2hvIGNhdGAsXG5cdFx0XHRgbm9kZSAtZSBcInJlcXVpcmUoJ2ZzJykud3JpdGVGaWxlU3luYygncm0udHh0JywneCcpXCJgLFxuXHRcdFx0YG5vZGUgLWUgXCJjb25zb2xlLmxvZyhyZXF1aXJlKCdmcycpLnJlYWRkaXJTeW5jKCcuJykpXCJgLFxuXHRcdFx0YGdpdCBzdGF0dXMgLS1maW5kLXJlbmFtZXNgLFxuXHRcdF0pLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lnbm9yZXMgcmVjb3JkZXIgcGxhY2Vob2xkZXJzIHRoYXQgbG9vayBsaWtlIHZhcmlhYmxlIGV4cGFuc2lvbnMnLCAoKSA9PiB7XG5cdFx0Ly8gYCR7d29ya2Rpcn1gIGFuZCBmcmllbmRzIGFyZSBzdWJzdGl0dXRlZCBiYWNrIGJlZm9yZSByZXBsYXksIHNvIHRoZXlcblx0XHQvLyBhcmUgbm90IFBPU0lYIGV4cGFuc2lvbnMgZXZlbiB0aG91Z2ggdGhleSBsb29rIGxpa2UgdGhlbS5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNoZWNrKFtcblx0XHRcdGBub2RlIC1lIFwiY29uc29sZS5sb2coMSlcIiBcXCR7d29ya2Rpcn1gLFxuXHRcdFx0YGVjaG8gXFwke2hvbWVkaXJ9YCxcblx0XHRcdGBub2RlIHNjcmlwdC5qcyBcXCR7dGVtcH1gLFxuXHRcdF0pLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcG9ydHMgdGhlIHJlYXNvbiBhbmQgdG9vbCBmb3IgZWFjaCBmaW5kaW5nJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZmluZFBvc2l4T25seUNvbW1hbmRzKFtcblx0XHRcdHsgY29tbWFuZDogYHdjIC1sIGxpbmVzLnR4dGAsIHRvb2xOYW1lOiAnYmFzaCcgfSxcblx0XHRcdHsgY29tbWFuZDogYGVjaG8gb2tgLCB0b29sTmFtZTogJ2Jhc2gnIH0sXG5cdFx0XHR7IGNvbW1hbmQ6IGBjYXQgeCAyPi9kZXYvbnVsbGAsIHRvb2xOYW1lOiAncG93ZXJzaGVsbCcgfSxcblx0XHRdKSwgW1xuXHRcdFx0eyBjb21tYW5kOiBgd2MgLWwgbGluZXMudHh0YCwgdG9vbE5hbWU6ICdiYXNoJywgcmVhc29uOiAndXNlcyBhIFBPU0lYIGNvcmV1dGlsIG9yIHNoZWxsIGJ1aWx0aW4gdGhhdCBpcyBub3QgcG9ydGFibGUgdG8gV2luZG93cyBzaGVsbHMnIH0sXG5cdFx0XHR7IGNvbW1hbmQ6IGBjYXQgeCAyPi9kZXYvbnVsbGAsIHRvb2xOYW1lOiAncG93ZXJzaGVsbCcsIHJlYXNvbjogJ3VzZXMgYSBQT1NJWCBjb3JldXRpbCBvciBzaGVsbCBidWlsdGluIHRoYXQgaXMgbm90IHBvcnRhYmxlIHRvIFdpbmRvd3Mgc2hlbGxzJyB9LFxuXHRcdF0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsNkJBQW9EO0FBRTdELFNBQVMsTUFBTSxVQUF1QztBQUNyRCxRQUFNLFdBQStCLFNBQVMsSUFBSSxjQUFZLEVBQUUsU0FBUyxVQUFVLE9BQU8sRUFBRTtBQUM1RixTQUFPLHNCQUFzQixRQUFRLEVBQUUsSUFBSSxhQUFXLFFBQVEsT0FBTztBQUN0RTtBQUVBLE1BQU0sb0JBQW9CLE1BQU07QUFFL0IsMENBQXdDO0FBRXhDLE9BQUssc0RBQXNELE1BQU07QUFHaEUsVUFBTSxVQUFVO0FBQUEsTUFDZjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUNBLFdBQU8sZ0JBQWdCLE1BQU0sT0FBTyxHQUFHLE9BQU87QUFBQSxFQUMvQyxDQUFDO0FBRUQsT0FBSyx3REFBd0QsTUFBTTtBQUdsRSxXQUFPLGdCQUFnQixNQUFNO0FBQUEsTUFDNUI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBO0FBQUEsTUFFQTtBQUFBLElBQ0QsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUFBLEVBQ1AsQ0FBQztBQUVELE9BQUssNERBQTRELE1BQU07QUFHdEUsV0FBTyxnQkFBZ0IsTUFBTTtBQUFBLE1BQzVCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUFBLEVBQ1AsQ0FBQztBQUVELE9BQUssb0VBQW9FLE1BQU07QUFHOUUsV0FBTyxnQkFBZ0IsTUFBTTtBQUFBLE1BQzVCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELENBQUMsR0FBRyxDQUFDLENBQUM7QUFBQSxFQUNQLENBQUM7QUFFRCxPQUFLLGdEQUFnRCxNQUFNO0FBQzFELFdBQU8sZ0JBQWdCLHNCQUFzQjtBQUFBLE1BQzVDLEVBQUUsU0FBUyxtQkFBbUIsVUFBVSxPQUFPO0FBQUEsTUFDL0MsRUFBRSxTQUFTLFdBQVcsVUFBVSxPQUFPO0FBQUEsTUFDdkMsRUFBRSxTQUFTLHFCQUFxQixVQUFVLGFBQWE7QUFBQSxJQUN4RCxDQUFDLEdBQUc7QUFBQSxNQUNILEVBQUUsU0FBUyxtQkFBbUIsVUFBVSxRQUFRLFFBQVEsZ0ZBQWdGO0FBQUEsTUFDeEksRUFBRSxTQUFTLHFCQUFxQixVQUFVLGNBQWMsUUFBUSxnRkFBZ0Y7QUFBQSxJQUNqSixDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
