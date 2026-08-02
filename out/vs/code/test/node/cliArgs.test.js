import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../base/test/common/utils.js";
import { combineUriFlags } from "../../node/cliArgs.js";
suite("combineUriFlags", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("rewrites --folder-uri and --file-uri followed by a URI into --flag=value", () => {
    assert.deepStrictEqual(
      combineUriFlags([
        "--wait",
        "--folder-uri",
        "vscode-remote://ssh-remote+host/workspace",
        "--file-uri",
        "vscode-remote://ssh-remote+host/file.txt",
        "--new-window",
        "--folder-uri=vscode-remote://already-joined/workspace",
        "--folder-uri"
        // trailing flag with no value
      ]),
      [
        "--wait",
        "--folder-uri=vscode-remote://ssh-remote+host/workspace",
        "--file-uri=vscode-remote://ssh-remote+host/file.txt",
        "--new-window",
        "--folder-uri=vscode-remote://already-joined/workspace",
        "--folder-uri"
      ]
    );
  });
  test("does not join when next argument is a flag", () => {
    assert.deepStrictEqual(
      combineUriFlags(["--folder-uri", "--wait", "somepath"]),
      ["--folder-uri", "--wait", "somepath"]
    );
  });
  test("leaves unrelated arguments untouched", () => {
    assert.deepStrictEqual(
      combineUriFlags(["--wait", "--new-window", "C:\\some\\path"]),
      ["--wait", "--new-window", "C:\\some\\path"]
    );
  });
  test("does not rewrite past the -- end-of-options marker", () => {
    assert.deepStrictEqual(
      combineUriFlags([
        "--wait",
        "--folder-uri",
        "vscode-remote://host/before",
        "--",
        "--folder-uri",
        "vscode-remote://host/after",
        "--file-uri",
        "vscode-remote://host/file.txt"
      ]),
      [
        "--wait",
        "--folder-uri=vscode-remote://host/before",
        "--",
        "--folder-uri",
        "vscode-remote://host/after",
        "--file-uri",
        "vscode-remote://host/file.txt"
      ]
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2NvZGUvdGVzdC9ub2RlL2NsaUFyZ3MudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgY29tYmluZVVyaUZsYWdzIH0gZnJvbSAnLi4vLi4vbm9kZS9jbGlBcmdzLmpzJztcblxuc3VpdGUoJ2NvbWJpbmVVcmlGbGFncycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdyZXdyaXRlcyAtLWZvbGRlci11cmkgYW5kIC0tZmlsZS11cmkgZm9sbG93ZWQgYnkgYSBVUkkgaW50byAtLWZsYWc9dmFsdWUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGNvbWJpbmVVcmlGbGFncyhbXG5cdFx0XHRcdCctLXdhaXQnLFxuXHRcdFx0XHQnLS1mb2xkZXItdXJpJywgJ3ZzY29kZS1yZW1vdGU6Ly9zc2gtcmVtb3RlK2hvc3Qvd29ya3NwYWNlJyxcblx0XHRcdFx0Jy0tZmlsZS11cmknLCAndnNjb2RlLXJlbW90ZTovL3NzaC1yZW1vdGUraG9zdC9maWxlLnR4dCcsXG5cdFx0XHRcdCctLW5ldy13aW5kb3cnLFxuXHRcdFx0XHQnLS1mb2xkZXItdXJpPXZzY29kZS1yZW1vdGU6Ly9hbHJlYWR5LWpvaW5lZC93b3Jrc3BhY2UnLFxuXHRcdFx0XHQnLS1mb2xkZXItdXJpJywgLy8gdHJhaWxpbmcgZmxhZyB3aXRoIG5vIHZhbHVlXG5cdFx0XHRdKSxcblx0XHRcdFtcblx0XHRcdFx0Jy0td2FpdCcsXG5cdFx0XHRcdCctLWZvbGRlci11cmk9dnNjb2RlLXJlbW90ZTovL3NzaC1yZW1vdGUraG9zdC93b3Jrc3BhY2UnLFxuXHRcdFx0XHQnLS1maWxlLXVyaT12c2NvZGUtcmVtb3RlOi8vc3NoLXJlbW90ZStob3N0L2ZpbGUudHh0Jyxcblx0XHRcdFx0Jy0tbmV3LXdpbmRvdycsXG5cdFx0XHRcdCctLWZvbGRlci11cmk9dnNjb2RlLXJlbW90ZTovL2FscmVhZHktam9pbmVkL3dvcmtzcGFjZScsXG5cdFx0XHRcdCctLWZvbGRlci11cmknLFxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGpvaW4gd2hlbiBuZXh0IGFyZ3VtZW50IGlzIGEgZmxhZycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0Y29tYmluZVVyaUZsYWdzKFsnLS1mb2xkZXItdXJpJywgJy0td2FpdCcsICdzb21lcGF0aCddKSxcblx0XHRcdFsnLS1mb2xkZXItdXJpJywgJy0td2FpdCcsICdzb21lcGF0aCddXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnbGVhdmVzIHVucmVsYXRlZCBhcmd1bWVudHMgdW50b3VjaGVkJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRjb21iaW5lVXJpRmxhZ3MoWyctLXdhaXQnLCAnLS1uZXctd2luZG93JywgJ0M6XFxcXHNvbWVcXFxccGF0aCddKSxcblx0XHRcdFsnLS13YWl0JywgJy0tbmV3LXdpbmRvdycsICdDOlxcXFxzb21lXFxcXHBhdGgnXVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHJld3JpdGUgcGFzdCB0aGUgLS0gZW5kLW9mLW9wdGlvbnMgbWFya2VyJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRjb21iaW5lVXJpRmxhZ3MoW1xuXHRcdFx0XHQnLS13YWl0Jyxcblx0XHRcdFx0Jy0tZm9sZGVyLXVyaScsICd2c2NvZGUtcmVtb3RlOi8vaG9zdC9iZWZvcmUnLFxuXHRcdFx0XHQnLS0nLFxuXHRcdFx0XHQnLS1mb2xkZXItdXJpJywgJ3ZzY29kZS1yZW1vdGU6Ly9ob3N0L2FmdGVyJyxcblx0XHRcdFx0Jy0tZmlsZS11cmknLCAndnNjb2RlLXJlbW90ZTovL2hvc3QvZmlsZS50eHQnLFxuXHRcdFx0XSksXG5cdFx0XHRbXG5cdFx0XHRcdCctLXdhaXQnLFxuXHRcdFx0XHQnLS1mb2xkZXItdXJpPXZzY29kZS1yZW1vdGU6Ly9ob3N0L2JlZm9yZScsXG5cdFx0XHRcdCctLScsXG5cdFx0XHRcdCctLWZvbGRlci11cmknLCAndnNjb2RlLXJlbW90ZTovL2hvc3QvYWZ0ZXInLFxuXHRcdFx0XHQnLS1maWxlLXVyaScsICd2c2NvZGUtcmVtb3RlOi8vaG9zdC9maWxlLnR4dCcsXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHVCQUF1QjtBQUVoQyxNQUFNLG1CQUFtQixNQUFNO0FBRTlCLDBDQUF3QztBQUV4QyxPQUFLLDRFQUE0RSxNQUFNO0FBQ3RGLFdBQU87QUFBQSxNQUNOLGdCQUFnQjtBQUFBLFFBQ2Y7QUFBQSxRQUNBO0FBQUEsUUFBZ0I7QUFBQSxRQUNoQjtBQUFBLFFBQWM7QUFBQSxRQUNkO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQTtBQUFBLE1BQ0QsQ0FBQztBQUFBLE1BQ0Q7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssOENBQThDLE1BQU07QUFDeEQsV0FBTztBQUFBLE1BQ04sZ0JBQWdCLENBQUMsZ0JBQWdCLFVBQVUsVUFBVSxDQUFDO0FBQUEsTUFDdEQsQ0FBQyxnQkFBZ0IsVUFBVSxVQUFVO0FBQUEsSUFDdEM7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLHdDQUF3QyxNQUFNO0FBQ2xELFdBQU87QUFBQSxNQUNOLGdCQUFnQixDQUFDLFVBQVUsZ0JBQWdCLGdCQUFnQixDQUFDO0FBQUEsTUFDNUQsQ0FBQyxVQUFVLGdCQUFnQixnQkFBZ0I7QUFBQSxJQUM1QztBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssc0RBQXNELE1BQU07QUFDaEUsV0FBTztBQUFBLE1BQ04sZ0JBQWdCO0FBQUEsUUFDZjtBQUFBLFFBQ0E7QUFBQSxRQUFnQjtBQUFBLFFBQ2hCO0FBQUEsUUFDQTtBQUFBLFFBQWdCO0FBQUEsUUFDaEI7QUFBQSxRQUFjO0FBQUEsTUFDZixDQUFDO0FBQUEsTUFDRDtBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUFnQjtBQUFBLFFBQ2hCO0FBQUEsUUFBYztBQUFBLE1BQ2Y7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
