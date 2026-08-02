import assert from "assert";
import { readFileSync } from "fs";
import { FileAccess } from "../../common/network.js";
import { URI } from "../../common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../common/utils.js";
suite("URI - perf", function() {
  if (1) {
    return;
  }
  ensureNoDisposablesAreLeakedInTestSuite();
  let manyFileUris;
  setup(function() {
    manyFileUris = [];
    const data = readFileSync(FileAccess.asFileUri("vs/base/test/node/uri.perf.data.txt").fsPath).toString();
    const lines = data.split("\n");
    for (const line of lines) {
      manyFileUris.push(URI.file(line));
    }
  });
  function perfTest(name, callback) {
    test(name, (_done) => {
      const t1 = Date.now();
      callback();
      const d = Date.now() - t1;
      console.log(`${name} took ${d}ms (${(d / manyFileUris.length).toPrecision(3)} ms/uri) (${manyFileUris.length} uris)`);
      _done();
    });
  }
  perfTest("toString", function() {
    for (const uri of manyFileUris) {
      const data = uri.toString();
      assert.ok(data);
    }
  });
  perfTest("toString(skipEncoding)", function() {
    for (const uri of manyFileUris) {
      const data = uri.toString(true);
      assert.ok(data);
    }
  });
  perfTest("fsPath", function() {
    for (const uri of manyFileUris) {
      const data = uri.fsPath;
      assert.ok(data);
    }
  });
  perfTest("toJSON", function() {
    for (const uri of manyFileUris) {
      const data = uri.toJSON();
      assert.ok(data);
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9ub2RlL3VyaS5wZXJmLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyByZWFkRmlsZVN5bmMgfSBmcm9tICdmcyc7XG5pbXBvcnQgeyBGaWxlQWNjZXNzIH0gZnJvbSAnLi4vLi4vY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi9jb21tb24vdXRpbHMuanMnO1xuXG5zdWl0ZSgnVVJJIC0gcGVyZicsIGZ1bmN0aW9uICgpIHtcblxuXHQvLyBDT01NRU5UIFRISVMgT1VUIFRPIFJVTiBURVNUXG5cdGlmICgxKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IG1hbnlGaWxlVXJpczogVVJJW107XG5cdHNldHVwKGZ1bmN0aW9uICgpIHtcblx0XHRtYW55RmlsZVVyaXMgPSBbXTtcblx0XHRjb25zdCBkYXRhID0gcmVhZEZpbGVTeW5jKEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy9iYXNlL3Rlc3Qvbm9kZS91cmkucGVyZi5kYXRhLnR4dCcpLmZzUGF0aCkudG9TdHJpbmcoKTtcblx0XHRjb25zdCBsaW5lcyA9IGRhdGEuc3BsaXQoJ1xcbicpO1xuXHRcdGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuXHRcdFx0bWFueUZpbGVVcmlzLnB1c2goVVJJLmZpbGUobGluZSkpO1xuXHRcdH1cblx0fSk7XG5cblx0ZnVuY3Rpb24gcGVyZlRlc3QobmFtZTogc3RyaW5nLCBjYWxsYmFjazogRnVuY3Rpb24pIHtcblx0XHR0ZXN0KG5hbWUsIF9kb25lID0+IHtcblx0XHRcdGNvbnN0IHQxID0gRGF0ZS5ub3coKTtcblx0XHRcdGNhbGxiYWNrKCk7XG5cdFx0XHRjb25zdCBkID0gRGF0ZS5ub3coKSAtIHQxO1xuXHRcdFx0Y29uc29sZS5sb2coYCR7bmFtZX0gdG9vayAke2R9bXMgKCR7KGQgLyBtYW55RmlsZVVyaXMubGVuZ3RoKS50b1ByZWNpc2lvbigzKX0gbXMvdXJpKSAoJHttYW55RmlsZVVyaXMubGVuZ3RofSB1cmlzKWApO1xuXHRcdFx0X2RvbmUoKTtcblx0XHR9KTtcblx0fVxuXG5cdHBlcmZUZXN0KCd0b1N0cmluZycsIGZ1bmN0aW9uICgpIHtcblx0XHRmb3IgKGNvbnN0IHVyaSBvZiBtYW55RmlsZVVyaXMpIHtcblx0XHRcdGNvbnN0IGRhdGEgPSB1cmkudG9TdHJpbmcoKTtcblx0XHRcdGFzc2VydC5vayhkYXRhKTtcblx0XHR9XG5cdH0pO1xuXG5cdHBlcmZUZXN0KCd0b1N0cmluZyhza2lwRW5jb2RpbmcpJywgZnVuY3Rpb24gKCkge1xuXHRcdGZvciAoY29uc3QgdXJpIG9mIG1hbnlGaWxlVXJpcykge1xuXHRcdFx0Y29uc3QgZGF0YSA9IHVyaS50b1N0cmluZyh0cnVlKTtcblx0XHRcdGFzc2VydC5vayhkYXRhKTtcblx0XHR9XG5cdH0pO1xuXG5cdHBlcmZUZXN0KCdmc1BhdGgnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Zm9yIChjb25zdCB1cmkgb2YgbWFueUZpbGVVcmlzKSB7XG5cdFx0XHRjb25zdCBkYXRhID0gdXJpLmZzUGF0aDtcblx0XHRcdGFzc2VydC5vayhkYXRhKTtcblx0XHR9XG5cdH0pO1xuXG5cdHBlcmZUZXN0KCd0b0pTT04nLCBmdW5jdGlvbiAoKSB7XG5cdFx0Zm9yIChjb25zdCB1cmkgb2YgbWFueUZpbGVVcmlzKSB7XG5cdFx0XHRjb25zdCBkYXRhID0gdXJpLnRvSlNPTigpO1xuXHRcdFx0YXNzZXJ0Lm9rKGRhdGEpO1xuXHRcdH1cblx0fSk7XG5cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUV4RCxNQUFNLGNBQWMsV0FBWTtBQUcvQixNQUFJLEdBQUc7QUFDTjtBQUFBLEVBQ0Q7QUFFQSwwQ0FBd0M7QUFFeEMsTUFBSTtBQUNKLFFBQU0sV0FBWTtBQUNqQixtQkFBZSxDQUFDO0FBQ2hCLFVBQU0sT0FBTyxhQUFhLFdBQVcsVUFBVSxxQ0FBcUMsRUFBRSxNQUFNLEVBQUUsU0FBUztBQUN2RyxVQUFNLFFBQVEsS0FBSyxNQUFNLElBQUk7QUFDN0IsZUFBVyxRQUFRLE9BQU87QUFDekIsbUJBQWEsS0FBSyxJQUFJLEtBQUssSUFBSSxDQUFDO0FBQUEsSUFDakM7QUFBQSxFQUNELENBQUM7QUFFRCxXQUFTLFNBQVMsTUFBYyxVQUFvQjtBQUNuRCxTQUFLLE1BQU0sV0FBUztBQUNuQixZQUFNLEtBQUssS0FBSyxJQUFJO0FBQ3BCLGVBQVM7QUFDVCxZQUFNLElBQUksS0FBSyxJQUFJLElBQUk7QUFDdkIsY0FBUSxJQUFJLEdBQUcsSUFBSSxTQUFTLENBQUMsUUFBUSxJQUFJLGFBQWEsUUFBUSxZQUFZLENBQUMsQ0FBQyxhQUFhLGFBQWEsTUFBTSxRQUFRO0FBQ3BILFlBQU07QUFBQSxJQUNQLENBQUM7QUFBQSxFQUNGO0FBRUEsV0FBUyxZQUFZLFdBQVk7QUFDaEMsZUFBVyxPQUFPLGNBQWM7QUFDL0IsWUFBTSxPQUFPLElBQUksU0FBUztBQUMxQixhQUFPLEdBQUcsSUFBSTtBQUFBLElBQ2Y7QUFBQSxFQUNELENBQUM7QUFFRCxXQUFTLDBCQUEwQixXQUFZO0FBQzlDLGVBQVcsT0FBTyxjQUFjO0FBQy9CLFlBQU0sT0FBTyxJQUFJLFNBQVMsSUFBSTtBQUM5QixhQUFPLEdBQUcsSUFBSTtBQUFBLElBQ2Y7QUFBQSxFQUNELENBQUM7QUFFRCxXQUFTLFVBQVUsV0FBWTtBQUM5QixlQUFXLE9BQU8sY0FBYztBQUMvQixZQUFNLE9BQU8sSUFBSTtBQUNqQixhQUFPLEdBQUcsSUFBSTtBQUFBLElBQ2Y7QUFBQSxFQUNELENBQUM7QUFFRCxXQUFTLFVBQVUsV0FBWTtBQUM5QixlQUFXLE9BQU8sY0FBYztBQUMvQixZQUFNLE9BQU8sSUFBSSxPQUFPO0FBQ3hCLGFBQU8sR0FBRyxJQUFJO0FBQUEsSUFDZjtBQUFBLEVBQ0QsQ0FBQztBQUVGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
