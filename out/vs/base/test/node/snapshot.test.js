import * as fs from "fs";
import { tmpdir } from "os";
import { getRandomTestPath } from "./testUtils.js";
import { Promises } from "../../node/pfs.js";
import { SnapshotContext, assertSnapshot } from "../common/snapshot.js";
import { URI } from "../../common/uri.js";
import { join } from "../../common/path.js";
import { assertThrowsAsync, ensureNoDisposablesAreLeakedInTestSuite } from "../common/utils.js";
suite("snapshot", () => {
  let testDir;
  ensureNoDisposablesAreLeakedInTestSuite();
  setup(function() {
    testDir = getRandomTestPath(tmpdir(), "vsctests", "snapshot");
    return fs.promises.mkdir(testDir, { recursive: true });
  });
  teardown(function() {
    return Promises.rm(testDir);
  });
  const makeContext = (test2) => {
    return new class extends SnapshotContext {
      constructor() {
        super(test2);
        this.snapshotsDir = URI.file(testDir);
      }
    }();
  };
  const snapshotFileTree = async () => {
    let str = "";
    const printDir = async (dir, indent) => {
      const children = await Promises.readdir(dir);
      for (const child of children) {
        const p = join(dir, child);
        if ((await fs.promises.stat(p)).isFile()) {
          const content = await fs.promises.readFile(p, "utf-8");
          str += `${" ".repeat(indent)}${child}:
`;
          for (const line of content.split("\n")) {
            str += `${" ".repeat(indent + 2)}${line}
`;
          }
        } else {
          str += `${" ".repeat(indent)}${child}/
`;
          await printDir(p, indent + 2);
        }
      }
    };
    await printDir(testDir, 0);
    await assertSnapshot(str);
  };
  test("creates a snapshot", async () => {
    const ctx = makeContext({
      file: "foo/bar",
      fullTitle: () => "hello world!"
    });
    await ctx.assert({ cool: true });
    await snapshotFileTree();
  });
  test("validates a snapshot", async () => {
    const ctx1 = makeContext({
      file: "foo/bar",
      fullTitle: () => "hello world!"
    });
    await ctx1.assert({ cool: true });
    const ctx2 = makeContext({
      file: "foo/bar",
      fullTitle: () => "hello world!"
    });
    await ctx2.assert({ cool: true });
    const ctx3 = makeContext({
      file: "foo/bar",
      fullTitle: () => "hello world!"
    });
    await assertThrowsAsync(() => ctx3.assert({ cool: false }));
  });
  test("cleans up old snapshots", async () => {
    const ctx1 = makeContext({
      file: "foo/bar",
      fullTitle: () => "hello world!"
    });
    await ctx1.assert({ cool: true });
    await ctx1.assert({ nifty: true });
    await ctx1.assert({ customName: 1 }, { name: "thirdTest", extension: "txt" });
    await ctx1.assert({ customName: 2 }, { name: "fourthTest" });
    await snapshotFileTree();
    const ctx2 = makeContext({
      file: "foo/bar",
      fullTitle: () => "hello world!"
    });
    await ctx2.assert({ cool: true });
    await ctx2.assert({ customName: 1 }, { name: "thirdTest" });
    await ctx2.removeOldSnapshots();
    await snapshotFileTree();
  });
  test("formats object nicely", async () => {
    const circular = {};
    circular.a = circular;
    await assertSnapshot([
      1,
      true,
      void 0,
      null,
      123n,
      /* @__PURE__ */ Symbol("heyo"),
      "hello",
      { hello: "world" },
      circular,
      /* @__PURE__ */ new Map([["hello", 1], ["goodbye", 2]]),
      /* @__PURE__ */ new Set([1, 2, 3]),
      function helloWorld() {
      },
      /hello/g,
      new Array(10).fill("long string".repeat(10)),
      { [/* @__PURE__ */ Symbol.for("debug.description")]() {
        return `Range [1 -> 5]`;
      } }
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9ub2RlL3NuYXBzaG90LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgeyB0bXBkaXIgfSBmcm9tICdvcyc7XG5pbXBvcnQgeyBnZXRSYW5kb21UZXN0UGF0aCB9IGZyb20gJy4vdGVzdFV0aWxzLmpzJztcbmltcG9ydCB7IFByb21pc2VzIH0gZnJvbSAnLi4vLi4vbm9kZS9wZnMuanMnO1xuaW1wb3J0IHsgU25hcHNob3RDb250ZXh0LCBhc3NlcnRTbmFwc2hvdCB9IGZyb20gJy4uL2NvbW1vbi9zbmFwc2hvdC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGpvaW4gfSBmcm9tICcuLi8uLi9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBhc3NlcnRUaHJvd3NBc3luYywgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vY29tbW9uL3V0aWxzLmpzJztcblxuLy8gdGVzdHMgZm9yIHNuYXBzaG90IGFyZSBpbiBOb2RlIHNvIHRoYXQgd2UgY2FuIHVzZSBuYXRpdmUgRlMgb3BlcmF0aW9ucyB0b1xuLy8gc2V0IHVwIGFuZCB2YWxpZGF0ZSB0aGluZ3MuXG4vL1xuLy8gVXNlcyBzbmFwc2hvdHMgZm9yIHRlc3Rpbmcgc25hcHNob3RzLiBJdCdzIHNuYXBjZXB0aW9uIVxuXG5zdWl0ZSgnc25hcHNob3QnLCAoKSA9PiB7XG5cdGxldCB0ZXN0RGlyOiBzdHJpbmc7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c2V0dXAoZnVuY3Rpb24gKCkge1xuXHRcdHRlc3REaXIgPSBnZXRSYW5kb21UZXN0UGF0aCh0bXBkaXIoKSwgJ3ZzY3Rlc3RzJywgJ3NuYXBzaG90Jyk7XG5cdFx0cmV0dXJuIGZzLnByb21pc2VzLm1rZGlyKHRlc3REaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHR9KTtcblxuXHR0ZWFyZG93bihmdW5jdGlvbiAoKSB7XG5cdFx0cmV0dXJuIFByb21pc2VzLnJtKHRlc3REaXIpO1xuXHR9KTtcblxuXHRjb25zdCBtYWtlQ29udGV4dCA9ICh0ZXN0OiBQYXJ0aWFsPE1vY2hhLlRlc3Q+IHwgdW5kZWZpbmVkKSA9PiB7XG5cdFx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIFNuYXBzaG90Q29udGV4dCB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIodGVzdCBhcyBNb2NoYS5UZXN0KTtcblx0XHRcdFx0dGhpcy5zbmFwc2hvdHNEaXIgPSBVUkkuZmlsZSh0ZXN0RGlyKTtcblx0XHRcdH1cblx0XHR9O1xuXHR9O1xuXG5cdGNvbnN0IHNuYXBzaG90RmlsZVRyZWUgPSBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IHN0ciA9ICcnO1xuXG5cdFx0Y29uc3QgcHJpbnREaXIgPSBhc3luYyAoZGlyOiBzdHJpbmcsIGluZGVudDogbnVtYmVyKSA9PiB7XG5cdFx0XHRjb25zdCBjaGlsZHJlbiA9IGF3YWl0IFByb21pc2VzLnJlYWRkaXIoZGlyKTtcblx0XHRcdGZvciAoY29uc3QgY2hpbGQgb2YgY2hpbGRyZW4pIHtcblx0XHRcdFx0Y29uc3QgcCA9IGpvaW4oZGlyLCBjaGlsZCk7XG5cdFx0XHRcdGlmICgoYXdhaXQgZnMucHJvbWlzZXMuc3RhdChwKSkuaXNGaWxlKCkpIHtcblx0XHRcdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgZnMucHJvbWlzZXMucmVhZEZpbGUocCwgJ3V0Zi04Jyk7XG5cdFx0XHRcdFx0c3RyICs9IGAkeycgJy5yZXBlYXQoaW5kZW50KX0ke2NoaWxkfTpcXG5gO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgbGluZSBvZiBjb250ZW50LnNwbGl0KCdcXG4nKSkge1xuXHRcdFx0XHRcdFx0c3RyICs9IGAkeycgJy5yZXBlYXQoaW5kZW50ICsgMil9JHtsaW5lfVxcbmA7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHN0ciArPSBgJHsnICcucmVwZWF0KGluZGVudCl9JHtjaGlsZH0vXFxuYDtcblx0XHRcdFx0XHRhd2FpdCBwcmludERpcihwLCBpbmRlbnQgKyAyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRhd2FpdCBwcmludERpcih0ZXN0RGlyLCAwKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChzdHIpO1xuXHR9O1xuXG5cdHRlc3QoJ2NyZWF0ZXMgYSBzbmFwc2hvdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjdHggPSBtYWtlQ29udGV4dCh7XG5cdFx0XHRmaWxlOiAnZm9vL2JhcicsXG5cdFx0XHRmdWxsVGl0bGU6ICgpID0+ICdoZWxsbyB3b3JsZCEnXG5cdFx0fSk7XG5cblx0XHRhd2FpdCBjdHguYXNzZXJ0KHsgY29vbDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBzbmFwc2hvdEZpbGVUcmVlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ZhbGlkYXRlcyBhIHNuYXBzaG90JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGN0eDEgPSBtYWtlQ29udGV4dCh7XG5cdFx0XHRmaWxlOiAnZm9vL2JhcicsXG5cdFx0XHRmdWxsVGl0bGU6ICgpID0+ICdoZWxsbyB3b3JsZCEnXG5cdFx0fSk7XG5cblx0XHRhd2FpdCBjdHgxLmFzc2VydCh7IGNvb2w6IHRydWUgfSk7XG5cblx0XHRjb25zdCBjdHgyID0gbWFrZUNvbnRleHQoe1xuXHRcdFx0ZmlsZTogJ2Zvby9iYXInLFxuXHRcdFx0ZnVsbFRpdGxlOiAoKSA9PiAnaGVsbG8gd29ybGQhJ1xuXHRcdH0pO1xuXG5cdFx0Ly8gc2hvdWxkIHBhc3M6XG5cdFx0YXdhaXQgY3R4Mi5hc3NlcnQoeyBjb29sOiB0cnVlIH0pO1xuXG5cdFx0Y29uc3QgY3R4MyA9IG1ha2VDb250ZXh0KHtcblx0XHRcdGZpbGU6ICdmb28vYmFyJyxcblx0XHRcdGZ1bGxUaXRsZTogKCkgPT4gJ2hlbGxvIHdvcmxkISdcblx0XHR9KTtcblxuXHRcdC8vIHNob3VsZCBmYWlsOlxuXHRcdGF3YWl0IGFzc2VydFRocm93c0FzeW5jKCgpID0+IGN0eDMuYXNzZXJ0KHsgY29vbDogZmFsc2UgfSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGVhbnMgdXAgb2xkIHNuYXBzaG90cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjdHgxID0gbWFrZUNvbnRleHQoe1xuXHRcdFx0ZmlsZTogJ2Zvby9iYXInLFxuXHRcdFx0ZnVsbFRpdGxlOiAoKSA9PiAnaGVsbG8gd29ybGQhJ1xuXHRcdH0pO1xuXG5cdFx0YXdhaXQgY3R4MS5hc3NlcnQoeyBjb29sOiB0cnVlIH0pO1xuXHRcdGF3YWl0IGN0eDEuYXNzZXJ0KHsgbmlmdHk6IHRydWUgfSk7XG5cdFx0YXdhaXQgY3R4MS5hc3NlcnQoeyBjdXN0b21OYW1lOiAxIH0sIHsgbmFtZTogJ3RoaXJkVGVzdCcsIGV4dGVuc2lvbjogJ3R4dCcgfSk7XG5cdFx0YXdhaXQgY3R4MS5hc3NlcnQoeyBjdXN0b21OYW1lOiAyIH0sIHsgbmFtZTogJ2ZvdXJ0aFRlc3QnIH0pO1xuXG5cdFx0YXdhaXQgc25hcHNob3RGaWxlVHJlZSgpO1xuXG5cdFx0Y29uc3QgY3R4MiA9IG1ha2VDb250ZXh0KHtcblx0XHRcdGZpbGU6ICdmb28vYmFyJyxcblx0XHRcdGZ1bGxUaXRsZTogKCkgPT4gJ2hlbGxvIHdvcmxkISdcblx0XHR9KTtcblxuXHRcdGF3YWl0IGN0eDIuYXNzZXJ0KHsgY29vbDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBjdHgyLmFzc2VydCh7IGN1c3RvbU5hbWU6IDEgfSwgeyBuYW1lOiAndGhpcmRUZXN0JyB9KTtcblx0XHRhd2FpdCBjdHgyLnJlbW92ZU9sZFNuYXBzaG90cygpO1xuXG5cdFx0YXdhaXQgc25hcHNob3RGaWxlVHJlZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdmb3JtYXRzIG9iamVjdCBuaWNlbHknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2lyY3VsYXI6IGFueSA9IHt9O1xuXHRcdGNpcmN1bGFyLmEgPSBjaXJjdWxhcjtcblxuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KFtcblx0XHRcdDEsXG5cdFx0XHR0cnVlLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0bnVsbCxcblx0XHRcdDEyM24sXG5cdFx0XHRTeW1ib2woJ2hleW8nKSxcblx0XHRcdCdoZWxsbycsXG5cdFx0XHR7IGhlbGxvOiAnd29ybGQnIH0sXG5cdFx0XHRjaXJjdWxhcixcblx0XHRcdG5ldyBNYXAoW1snaGVsbG8nLCAxXSwgWydnb29kYnllJywgMl1dKSxcblx0XHRcdG5ldyBTZXQoWzEsIDIsIDNdKSxcblx0XHRcdGZ1bmN0aW9uIGhlbGxvV29ybGQoKSB7IH0sXG5cdFx0XHQvaGVsbG8vZyxcblx0XHRcdG5ldyBBcnJheSgxMCkuZmlsbCgnbG9uZyBzdHJpbmcnLnJlcGVhdCgxMCkpLFxuXHRcdFx0eyBbU3ltYm9sLmZvcignZGVidWcuZGVzY3JpcHRpb24nKV0oKSB7IHJldHVybiBgUmFuZ2UgWzEgLT4gNV1gOyB9IH0sXG5cdFx0XSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFFBQVE7QUFDcEIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUJBQWlCLHNCQUFzQjtBQUNoRCxTQUFTLFdBQVc7QUFDcEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsbUJBQW1CLCtDQUErQztBQU8zRSxNQUFNLFlBQVksTUFBTTtBQUN2QixNQUFJO0FBRUosMENBQXdDO0FBRXhDLFFBQU0sV0FBWTtBQUNqQixjQUFVLGtCQUFrQixPQUFPLEdBQUcsWUFBWSxVQUFVO0FBQzVELFdBQU8sR0FBRyxTQUFTLE1BQU0sU0FBUyxFQUFFLFdBQVcsS0FBSyxDQUFDO0FBQUEsRUFDdEQsQ0FBQztBQUVELFdBQVMsV0FBWTtBQUNwQixXQUFPLFNBQVMsR0FBRyxPQUFPO0FBQUEsRUFDM0IsQ0FBQztBQUVELFFBQU0sY0FBYyxDQUFDQSxVQUEwQztBQUM5RCxXQUFPLElBQUksY0FBYyxnQkFBZ0I7QUFBQSxNQUN4QyxjQUFjO0FBQ2IsY0FBTUEsS0FBa0I7QUFDeEIsYUFBSyxlQUFlLElBQUksS0FBSyxPQUFPO0FBQUEsTUFDckM7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUVBLFFBQU0sbUJBQW1CLFlBQVk7QUFDcEMsUUFBSSxNQUFNO0FBRVYsVUFBTSxXQUFXLE9BQU8sS0FBYSxXQUFtQjtBQUN2RCxZQUFNLFdBQVcsTUFBTSxTQUFTLFFBQVEsR0FBRztBQUMzQyxpQkFBVyxTQUFTLFVBQVU7QUFDN0IsY0FBTSxJQUFJLEtBQUssS0FBSyxLQUFLO0FBQ3pCLGFBQUssTUFBTSxHQUFHLFNBQVMsS0FBSyxDQUFDLEdBQUcsT0FBTyxHQUFHO0FBQ3pDLGdCQUFNLFVBQVUsTUFBTSxHQUFHLFNBQVMsU0FBUyxHQUFHLE9BQU87QUFDckQsaUJBQU8sR0FBRyxJQUFJLE9BQU8sTUFBTSxDQUFDLEdBQUcsS0FBSztBQUFBO0FBQ3BDLHFCQUFXLFFBQVEsUUFBUSxNQUFNLElBQUksR0FBRztBQUN2QyxtQkFBTyxHQUFHLElBQUksT0FBTyxTQUFTLENBQUMsQ0FBQyxHQUFHLElBQUk7QUFBQTtBQUFBLFVBQ3hDO0FBQUEsUUFDRCxPQUFPO0FBQ04saUJBQU8sR0FBRyxJQUFJLE9BQU8sTUFBTSxDQUFDLEdBQUcsS0FBSztBQUFBO0FBQ3BDLGdCQUFNLFNBQVMsR0FBRyxTQUFTLENBQUM7QUFBQSxRQUM3QjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsVUFBTSxTQUFTLFNBQVMsQ0FBQztBQUN6QixVQUFNLGVBQWUsR0FBRztBQUFBLEVBQ3pCO0FBRUEsT0FBSyxzQkFBc0IsWUFBWTtBQUN0QyxVQUFNLE1BQU0sWUFBWTtBQUFBLE1BQ3ZCLE1BQU07QUFBQSxNQUNOLFdBQVcsTUFBTTtBQUFBLElBQ2xCLENBQUM7QUFFRCxVQUFNLElBQUksT0FBTyxFQUFFLE1BQU0sS0FBSyxDQUFDO0FBQy9CLFVBQU0saUJBQWlCO0FBQUEsRUFDeEIsQ0FBQztBQUVELE9BQUssd0JBQXdCLFlBQVk7QUFDeEMsVUFBTSxPQUFPLFlBQVk7QUFBQSxNQUN4QixNQUFNO0FBQUEsTUFDTixXQUFXLE1BQU07QUFBQSxJQUNsQixDQUFDO0FBRUQsVUFBTSxLQUFLLE9BQU8sRUFBRSxNQUFNLEtBQUssQ0FBQztBQUVoQyxVQUFNLE9BQU8sWUFBWTtBQUFBLE1BQ3hCLE1BQU07QUFBQSxNQUNOLFdBQVcsTUFBTTtBQUFBLElBQ2xCLENBQUM7QUFHRCxVQUFNLEtBQUssT0FBTyxFQUFFLE1BQU0sS0FBSyxDQUFDO0FBRWhDLFVBQU0sT0FBTyxZQUFZO0FBQUEsTUFDeEIsTUFBTTtBQUFBLE1BQ04sV0FBVyxNQUFNO0FBQUEsSUFDbEIsQ0FBQztBQUdELFVBQU0sa0JBQWtCLE1BQU0sS0FBSyxPQUFPLEVBQUUsTUFBTSxNQUFNLENBQUMsQ0FBQztBQUFBLEVBQzNELENBQUM7QUFFRCxPQUFLLDJCQUEyQixZQUFZO0FBQzNDLFVBQU0sT0FBTyxZQUFZO0FBQUEsTUFDeEIsTUFBTTtBQUFBLE1BQ04sV0FBVyxNQUFNO0FBQUEsSUFDbEIsQ0FBQztBQUVELFVBQU0sS0FBSyxPQUFPLEVBQUUsTUFBTSxLQUFLLENBQUM7QUFDaEMsVUFBTSxLQUFLLE9BQU8sRUFBRSxPQUFPLEtBQUssQ0FBQztBQUNqQyxVQUFNLEtBQUssT0FBTyxFQUFFLFlBQVksRUFBRSxHQUFHLEVBQUUsTUFBTSxhQUFhLFdBQVcsTUFBTSxDQUFDO0FBQzVFLFVBQU0sS0FBSyxPQUFPLEVBQUUsWUFBWSxFQUFFLEdBQUcsRUFBRSxNQUFNLGFBQWEsQ0FBQztBQUUzRCxVQUFNLGlCQUFpQjtBQUV2QixVQUFNLE9BQU8sWUFBWTtBQUFBLE1BQ3hCLE1BQU07QUFBQSxNQUNOLFdBQVcsTUFBTTtBQUFBLElBQ2xCLENBQUM7QUFFRCxVQUFNLEtBQUssT0FBTyxFQUFFLE1BQU0sS0FBSyxDQUFDO0FBQ2hDLFVBQU0sS0FBSyxPQUFPLEVBQUUsWUFBWSxFQUFFLEdBQUcsRUFBRSxNQUFNLFlBQVksQ0FBQztBQUMxRCxVQUFNLEtBQUssbUJBQW1CO0FBRTlCLFVBQU0saUJBQWlCO0FBQUEsRUFDeEIsQ0FBQztBQUVELE9BQUsseUJBQXlCLFlBQVk7QUFDekMsVUFBTSxXQUFnQixDQUFDO0FBQ3ZCLGFBQVMsSUFBSTtBQUViLFVBQU0sZUFBZTtBQUFBLE1BQ3BCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsdUJBQU8sTUFBTTtBQUFBLE1BQ2I7QUFBQSxNQUNBLEVBQUUsT0FBTyxRQUFRO0FBQUEsTUFDakI7QUFBQSxNQUNBLG9CQUFJLElBQUksQ0FBQyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztBQUFBLE1BQ3RDLG9CQUFJLElBQUksQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDakIsU0FBUyxhQUFhO0FBQUEsTUFBRTtBQUFBLE1BQ3hCO0FBQUEsTUFDQSxJQUFJLE1BQU0sRUFBRSxFQUFFLEtBQUssY0FBYyxPQUFPLEVBQUUsQ0FBQztBQUFBLE1BQzNDLEVBQUUsQ0FBQyx1QkFBTyxJQUFJLG1CQUFtQixDQUFDLElBQUk7QUFBRSxlQUFPO0FBQUEsTUFBa0IsRUFBRTtBQUFBLElBQ3BFLENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogWyJ0ZXN0Il0KfQo=
