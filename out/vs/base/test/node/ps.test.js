import { deepStrictEqual } from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../common/utils.js";
import { JS_FILENAME_PATTERN } from "../../node/ps.js";
suite("Process Utils", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("JS file regex", () => {
    function findJsFiles(cmd) {
      const matches = [];
      let match;
      while ((match = JS_FILENAME_PATTERN.exec(cmd)) !== null) {
        matches.push(match[0]);
      }
      return matches;
    }
    test("should match simple .js files", () => {
      deepStrictEqual(findJsFiles("node bootstrap.js"), ["bootstrap.js"]);
    });
    test("should match multiple .js files", () => {
      deepStrictEqual(findJsFiles("node server.js --require helper.js"), ["server.js", "helper.js"]);
    });
    test("should match .js files with hyphens", () => {
      deepStrictEqual(findJsFiles("node my-script.js"), ["my-script.js"]);
    });
    test("should not match .json files", () => {
      deepStrictEqual(findJsFiles("cat package.json"), []);
    });
    test("should not match .js prefix in .json extension (regression test for \\b fix)", () => {
      deepStrictEqual(findJsFiles("node --config tsconfig.json"), []);
      deepStrictEqual(findJsFiles("eslint.json"), []);
    });
    test("should not match .jsx files", () => {
      deepStrictEqual(findJsFiles("node component.jsx"), []);
    });
    test("should match .js but not .json in same command", () => {
      deepStrictEqual(findJsFiles("node app.js --config settings.json"), ["app.js"]);
    });
    test("should not match partial matches inside other extensions", () => {
      deepStrictEqual(findJsFiles("file.jsmith"), []);
    });
    test("should match .js at end of command", () => {
      deepStrictEqual(findJsFiles("/path/to/script.js"), ["script.js"]);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9ub2RlL3BzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBkZWVwU3RyaWN0RXF1YWwgfSBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEpTX0ZJTEVOQU1FX1BBVFRFUk4gfSBmcm9tICcuLi8uLi9ub2RlL3BzLmpzJztcblxuc3VpdGUoJ1Byb2Nlc3MgVXRpbHMnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ0pTIGZpbGUgcmVnZXgnLCAoKSA9PiB7XG5cblx0XHRmdW5jdGlvbiBmaW5kSnNGaWxlcyhjbWQ6IHN0cmluZyk6IHN0cmluZ1tdIHtcblx0XHRcdGNvbnN0IG1hdGNoZXM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRsZXQgbWF0Y2g7XG5cdFx0XHR3aGlsZSAoKG1hdGNoID0gSlNfRklMRU5BTUVfUEFUVEVSTi5leGVjKGNtZCkpICE9PSBudWxsKSB7XG5cdFx0XHRcdG1hdGNoZXMucHVzaChtYXRjaFswXSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbWF0Y2hlcztcblx0XHR9XG5cblx0XHR0ZXN0KCdzaG91bGQgbWF0Y2ggc2ltcGxlIC5qcyBmaWxlcycsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChmaW5kSnNGaWxlcygnbm9kZSBib290c3RyYXAuanMnKSwgWydib290c3RyYXAuanMnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbWF0Y2ggbXVsdGlwbGUgLmpzIGZpbGVzJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKGZpbmRKc0ZpbGVzKCdub2RlIHNlcnZlci5qcyAtLXJlcXVpcmUgaGVscGVyLmpzJyksIFsnc2VydmVyLmpzJywgJ2hlbHBlci5qcyddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBtYXRjaCAuanMgZmlsZXMgd2l0aCBoeXBoZW5zJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKGZpbmRKc0ZpbGVzKCdub2RlIG15LXNjcmlwdC5qcycpLCBbJ215LXNjcmlwdC5qcyddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgbWF0Y2ggLmpzb24gZmlsZXMnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoZmluZEpzRmlsZXMoJ2NhdCBwYWNrYWdlLmpzb24nKSwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBtYXRjaCAuanMgcHJlZml4IGluIC5qc29uIGV4dGVuc2lvbiAocmVncmVzc2lvbiB0ZXN0IGZvciBcXFxcYiBmaXgpJywgKCkgPT4ge1xuXHRcdFx0Ly8gV2l0aG91dCB0aGUgXFxiIHdvcmQgYm91bmRhcnksIHRoZSByZWdleCB3b3VsZCBpbmNvcnJlY3RseSBtYXRjaCBcInBhY2thZ2UuanNcIiBmcm9tIFwicGFja2FnZS5qc29uXCJcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChmaW5kSnNGaWxlcygnbm9kZSAtLWNvbmZpZyB0c2NvbmZpZy5qc29uJyksIFtdKTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChmaW5kSnNGaWxlcygnZXNsaW50Lmpzb24nKSwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBtYXRjaCAuanN4IGZpbGVzJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKGZpbmRKc0ZpbGVzKCdub2RlIGNvbXBvbmVudC5qc3gnKSwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG1hdGNoIC5qcyBidXQgbm90IC5qc29uIGluIHNhbWUgY29tbWFuZCcsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChmaW5kSnNGaWxlcygnbm9kZSBhcHAuanMgLS1jb25maWcgc2V0dGluZ3MuanNvbicpLCBbJ2FwcC5qcyddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgbWF0Y2ggcGFydGlhbCBtYXRjaGVzIGluc2lkZSBvdGhlciBleHRlbnNpb25zJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKGZpbmRKc0ZpbGVzKCdmaWxlLmpzbWl0aCcpLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbWF0Y2ggLmpzIGF0IGVuZCBvZiBjb21tYW5kJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKGZpbmRKc0ZpbGVzKCcvcGF0aC90by9zY3JpcHQuanMnKSwgWydzY3JpcHQuanMnXSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsMkJBQTJCO0FBRXBDLE1BQU0saUJBQWlCLE1BQU07QUFFNUIsMENBQXdDO0FBRXhDLFFBQU0saUJBQWlCLE1BQU07QUFFNUIsYUFBUyxZQUFZLEtBQXVCO0FBQzNDLFlBQU0sVUFBb0IsQ0FBQztBQUMzQixVQUFJO0FBQ0osY0FBUSxRQUFRLG9CQUFvQixLQUFLLEdBQUcsT0FBTyxNQUFNO0FBQ3hELGdCQUFRLEtBQUssTUFBTSxDQUFDLENBQUM7QUFBQSxNQUN0QjtBQUNBLGFBQU87QUFBQSxJQUNSO0FBRUEsU0FBSyxpQ0FBaUMsTUFBTTtBQUMzQyxzQkFBZ0IsWUFBWSxtQkFBbUIsR0FBRyxDQUFDLGNBQWMsQ0FBQztBQUFBLElBQ25FLENBQUM7QUFFRCxTQUFLLG1DQUFtQyxNQUFNO0FBQzdDLHNCQUFnQixZQUFZLG9DQUFvQyxHQUFHLENBQUMsYUFBYSxXQUFXLENBQUM7QUFBQSxJQUM5RixDQUFDO0FBRUQsU0FBSyx1Q0FBdUMsTUFBTTtBQUNqRCxzQkFBZ0IsWUFBWSxtQkFBbUIsR0FBRyxDQUFDLGNBQWMsQ0FBQztBQUFBLElBQ25FLENBQUM7QUFFRCxTQUFLLGdDQUFnQyxNQUFNO0FBQzFDLHNCQUFnQixZQUFZLGtCQUFrQixHQUFHLENBQUMsQ0FBQztBQUFBLElBQ3BELENBQUM7QUFFRCxTQUFLLGdGQUFnRixNQUFNO0FBRTFGLHNCQUFnQixZQUFZLDZCQUE2QixHQUFHLENBQUMsQ0FBQztBQUM5RCxzQkFBZ0IsWUFBWSxhQUFhLEdBQUcsQ0FBQyxDQUFDO0FBQUEsSUFDL0MsQ0FBQztBQUVELFNBQUssK0JBQStCLE1BQU07QUFDekMsc0JBQWdCLFlBQVksb0JBQW9CLEdBQUcsQ0FBQyxDQUFDO0FBQUEsSUFDdEQsQ0FBQztBQUVELFNBQUssa0RBQWtELE1BQU07QUFDNUQsc0JBQWdCLFlBQVksb0NBQW9DLEdBQUcsQ0FBQyxRQUFRLENBQUM7QUFBQSxJQUM5RSxDQUFDO0FBRUQsU0FBSyw0REFBNEQsTUFBTTtBQUN0RSxzQkFBZ0IsWUFBWSxhQUFhLEdBQUcsQ0FBQyxDQUFDO0FBQUEsSUFDL0MsQ0FBQztBQUVELFNBQUssc0NBQXNDLE1BQU07QUFDaEQsc0JBQWdCLFlBQVksb0JBQW9CLEdBQUcsQ0FBQyxXQUFXLENBQUM7QUFBQSxJQUNqRSxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
