import assert from "assert";
import { LinkedList } from "../../common/linkedList.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
suite("LinkedList", function() {
  ensureNoDisposablesAreLeakedInTestSuite();
  function assertElements(list, ...elements) {
    assert.strictEqual(list.size, elements.length);
    assert.deepStrictEqual(Array.from(list), elements);
    assert.deepStrictEqual([...list], elements);
    for (const item of list) {
      assert.strictEqual(item, elements.shift());
    }
    assert.strictEqual(elements.length, 0);
  }
  test("Push/Iter", () => {
    const list = new LinkedList();
    list.push(0);
    list.push(1);
    list.push(2);
    assertElements(list, 0, 1, 2);
  });
  test("Push/Remove", () => {
    let list = new LinkedList();
    let disp = list.push(0);
    list.push(1);
    list.push(2);
    disp();
    assertElements(list, 1, 2);
    list = new LinkedList();
    list.push(0);
    disp = list.push(1);
    list.push(2);
    disp();
    assertElements(list, 0, 2);
    list = new LinkedList();
    list.push(0);
    list.push(1);
    disp = list.push(2);
    disp();
    assertElements(list, 0, 1);
    list = new LinkedList();
    list.push(0);
    list.push(1);
    disp = list.push(2);
    disp();
    disp();
    assertElements(list, 0, 1);
  });
  test("Push/toArray", () => {
    const list = new LinkedList();
    list.push("foo");
    list.push("bar");
    list.push("far");
    list.push("boo");
    assertElements(list, "foo", "bar", "far", "boo");
  });
  test("unshift/Iter", () => {
    const list = new LinkedList();
    list.unshift(0);
    list.unshift(1);
    list.unshift(2);
    assertElements(list, 2, 1, 0);
  });
  test("unshift/Remove", () => {
    let list = new LinkedList();
    let disp = list.unshift(0);
    list.unshift(1);
    list.unshift(2);
    disp();
    assertElements(list, 2, 1);
    list = new LinkedList();
    list.unshift(0);
    disp = list.unshift(1);
    list.unshift(2);
    disp();
    assertElements(list, 2, 0);
    list = new LinkedList();
    list.unshift(0);
    list.unshift(1);
    disp = list.unshift(2);
    disp();
    assertElements(list, 1, 0);
  });
  test("unshift/toArray", () => {
    const list = new LinkedList();
    list.unshift("foo");
    list.unshift("bar");
    list.unshift("far");
    list.unshift("boo");
    assertElements(list, "boo", "far", "bar", "foo");
  });
  test("pop/unshift", function() {
    const list = new LinkedList();
    list.push("a");
    list.push("b");
    assertElements(list, "a", "b");
    const a = list.shift();
    assert.strictEqual(a, "a");
    assertElements(list, "b");
    list.unshift("a");
    assertElements(list, "a", "b");
    const b = list.pop();
    assert.strictEqual(b, "b");
    assertElements(list, "a");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9jb21tb24vbGlua2VkTGlzdC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgTGlua2VkTGlzdCB9IGZyb20gJy4uLy4uL2NvbW1vbi9saW5rZWRMaXN0LmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4vdXRpbHMuanMnO1xuXG5zdWl0ZSgnTGlua2VkTGlzdCcsIGZ1bmN0aW9uICgpIHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBhc3NlcnRFbGVtZW50czxFPihsaXN0OiBMaW5rZWRMaXN0PEU+LCAuLi5lbGVtZW50czogRVtdKSB7XG5cblx0XHQvLyBjaGVjayBzaXplXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpc3Quc2l6ZSwgZWxlbWVudHMubGVuZ3RoKTtcblxuXHRcdC8vIGFzc2VydCB0b0FycmF5XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChBcnJheS5mcm9tKGxpc3QpLCBlbGVtZW50cyk7XG5cblx0XHQvLyBhc3NlcnQgU3ltYm9sLml0ZXJhdG9yICgxKVxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLmxpc3RdLCBlbGVtZW50cyk7XG5cblx0XHQvLyBhc3NlcnQgU3ltYm9sLml0ZXJhdG9yICgyKVxuXHRcdGZvciAoY29uc3QgaXRlbSBvZiBsaXN0KSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbSwgZWxlbWVudHMuc2hpZnQoKSk7XG5cdFx0fVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbGVtZW50cy5sZW5ndGgsIDApO1xuXHR9XG5cblx0dGVzdCgnUHVzaC9JdGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxpc3QgPSBuZXcgTGlua2VkTGlzdDxudW1iZXI+KCk7XG5cdFx0bGlzdC5wdXNoKDApO1xuXHRcdGxpc3QucHVzaCgxKTtcblx0XHRsaXN0LnB1c2goMik7XG5cdFx0YXNzZXJ0RWxlbWVudHMobGlzdCwgMCwgMSwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ1B1c2gvUmVtb3ZlJywgKCkgPT4ge1xuXHRcdGxldCBsaXN0ID0gbmV3IExpbmtlZExpc3Q8bnVtYmVyPigpO1xuXHRcdGxldCBkaXNwID0gbGlzdC5wdXNoKDApO1xuXHRcdGxpc3QucHVzaCgxKTtcblx0XHRsaXN0LnB1c2goMik7XG5cdFx0ZGlzcCgpO1xuXHRcdGFzc2VydEVsZW1lbnRzKGxpc3QsIDEsIDIpO1xuXG5cdFx0bGlzdCA9IG5ldyBMaW5rZWRMaXN0PG51bWJlcj4oKTtcblx0XHRsaXN0LnB1c2goMCk7XG5cdFx0ZGlzcCA9IGxpc3QucHVzaCgxKTtcblx0XHRsaXN0LnB1c2goMik7XG5cdFx0ZGlzcCgpO1xuXHRcdGFzc2VydEVsZW1lbnRzKGxpc3QsIDAsIDIpO1xuXG5cdFx0bGlzdCA9IG5ldyBMaW5rZWRMaXN0PG51bWJlcj4oKTtcblx0XHRsaXN0LnB1c2goMCk7XG5cdFx0bGlzdC5wdXNoKDEpO1xuXHRcdGRpc3AgPSBsaXN0LnB1c2goMik7XG5cdFx0ZGlzcCgpO1xuXHRcdGFzc2VydEVsZW1lbnRzKGxpc3QsIDAsIDEpO1xuXG5cdFx0bGlzdCA9IG5ldyBMaW5rZWRMaXN0PG51bWJlcj4oKTtcblx0XHRsaXN0LnB1c2goMCk7XG5cdFx0bGlzdC5wdXNoKDEpO1xuXHRcdGRpc3AgPSBsaXN0LnB1c2goMik7XG5cdFx0ZGlzcCgpO1xuXHRcdGRpc3AoKTtcblx0XHRhc3NlcnRFbGVtZW50cyhsaXN0LCAwLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnUHVzaC90b0FycmF5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGxpc3QgPSBuZXcgTGlua2VkTGlzdDxzdHJpbmc+KCk7XG5cdFx0bGlzdC5wdXNoKCdmb28nKTtcblx0XHRsaXN0LnB1c2goJ2JhcicpO1xuXHRcdGxpc3QucHVzaCgnZmFyJyk7XG5cdFx0bGlzdC5wdXNoKCdib28nKTtcblxuXHRcdGFzc2VydEVsZW1lbnRzKGxpc3QsICdmb28nLCAnYmFyJywgJ2ZhcicsICdib28nKTtcblx0fSk7XG5cblx0dGVzdCgndW5zaGlmdC9JdGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxpc3QgPSBuZXcgTGlua2VkTGlzdDxudW1iZXI+KCk7XG5cdFx0bGlzdC51bnNoaWZ0KDApO1xuXHRcdGxpc3QudW5zaGlmdCgxKTtcblx0XHRsaXN0LnVuc2hpZnQoMik7XG5cdFx0YXNzZXJ0RWxlbWVudHMobGlzdCwgMiwgMSwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Vuc2hpZnQvUmVtb3ZlJywgKCkgPT4ge1xuXHRcdGxldCBsaXN0ID0gbmV3IExpbmtlZExpc3Q8bnVtYmVyPigpO1xuXHRcdGxldCBkaXNwID0gbGlzdC51bnNoaWZ0KDApO1xuXHRcdGxpc3QudW5zaGlmdCgxKTtcblx0XHRsaXN0LnVuc2hpZnQoMik7XG5cdFx0ZGlzcCgpO1xuXHRcdGFzc2VydEVsZW1lbnRzKGxpc3QsIDIsIDEpO1xuXG5cdFx0bGlzdCA9IG5ldyBMaW5rZWRMaXN0PG51bWJlcj4oKTtcblx0XHRsaXN0LnVuc2hpZnQoMCk7XG5cdFx0ZGlzcCA9IGxpc3QudW5zaGlmdCgxKTtcblx0XHRsaXN0LnVuc2hpZnQoMik7XG5cdFx0ZGlzcCgpO1xuXHRcdGFzc2VydEVsZW1lbnRzKGxpc3QsIDIsIDApO1xuXG5cdFx0bGlzdCA9IG5ldyBMaW5rZWRMaXN0PG51bWJlcj4oKTtcblx0XHRsaXN0LnVuc2hpZnQoMCk7XG5cdFx0bGlzdC51bnNoaWZ0KDEpO1xuXHRcdGRpc3AgPSBsaXN0LnVuc2hpZnQoMik7XG5cdFx0ZGlzcCgpO1xuXHRcdGFzc2VydEVsZW1lbnRzKGxpc3QsIDEsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCd1bnNoaWZ0L3RvQXJyYXknLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGlzdCA9IG5ldyBMaW5rZWRMaXN0PHN0cmluZz4oKTtcblx0XHRsaXN0LnVuc2hpZnQoJ2ZvbycpO1xuXHRcdGxpc3QudW5zaGlmdCgnYmFyJyk7XG5cdFx0bGlzdC51bnNoaWZ0KCdmYXInKTtcblx0XHRsaXN0LnVuc2hpZnQoJ2JvbycpO1xuXHRcdGFzc2VydEVsZW1lbnRzKGxpc3QsICdib28nLCAnZmFyJywgJ2JhcicsICdmb28nKTtcblx0fSk7XG5cblx0dGVzdCgncG9wL3Vuc2hpZnQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbGlzdCA9IG5ldyBMaW5rZWRMaXN0PHN0cmluZz4oKTtcblx0XHRsaXN0LnB1c2goJ2EnKTtcblx0XHRsaXN0LnB1c2goJ2InKTtcblxuXHRcdGFzc2VydEVsZW1lbnRzKGxpc3QsICdhJywgJ2InKTtcblxuXHRcdGNvbnN0IGEgPSBsaXN0LnNoaWZ0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGEsICdhJyk7XG5cdFx0YXNzZXJ0RWxlbWVudHMobGlzdCwgJ2InKTtcblxuXHRcdGxpc3QudW5zaGlmdCgnYScpO1xuXHRcdGFzc2VydEVsZW1lbnRzKGxpc3QsICdhJywgJ2InKTtcblxuXHRcdGNvbnN0IGIgPSBsaXN0LnBvcCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiLCAnYicpO1xuXHRcdGFzc2VydEVsZW1lbnRzKGxpc3QsICdhJyk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUywrQ0FBK0M7QUFFeEQsTUFBTSxjQUFjLFdBQVk7QUFFL0IsMENBQXdDO0FBRXhDLFdBQVMsZUFBa0IsU0FBd0IsVUFBZTtBQUdqRSxXQUFPLFlBQVksS0FBSyxNQUFNLFNBQVMsTUFBTTtBQUc3QyxXQUFPLGdCQUFnQixNQUFNLEtBQUssSUFBSSxHQUFHLFFBQVE7QUFHakQsV0FBTyxnQkFBZ0IsQ0FBQyxHQUFHLElBQUksR0FBRyxRQUFRO0FBRzFDLGVBQVcsUUFBUSxNQUFNO0FBQ3hCLGFBQU8sWUFBWSxNQUFNLFNBQVMsTUFBTSxDQUFDO0FBQUEsSUFDMUM7QUFDQSxXQUFPLFlBQVksU0FBUyxRQUFRLENBQUM7QUFBQSxFQUN0QztBQUVBLE9BQUssYUFBYSxNQUFNO0FBQ3ZCLFVBQU0sT0FBTyxJQUFJLFdBQW1CO0FBQ3BDLFNBQUssS0FBSyxDQUFDO0FBQ1gsU0FBSyxLQUFLLENBQUM7QUFDWCxTQUFLLEtBQUssQ0FBQztBQUNYLG1CQUFlLE1BQU0sR0FBRyxHQUFHLENBQUM7QUFBQSxFQUM3QixDQUFDO0FBRUQsT0FBSyxlQUFlLE1BQU07QUFDekIsUUFBSSxPQUFPLElBQUksV0FBbUI7QUFDbEMsUUFBSSxPQUFPLEtBQUssS0FBSyxDQUFDO0FBQ3RCLFNBQUssS0FBSyxDQUFDO0FBQ1gsU0FBSyxLQUFLLENBQUM7QUFDWCxTQUFLO0FBQ0wsbUJBQWUsTUFBTSxHQUFHLENBQUM7QUFFekIsV0FBTyxJQUFJLFdBQW1CO0FBQzlCLFNBQUssS0FBSyxDQUFDO0FBQ1gsV0FBTyxLQUFLLEtBQUssQ0FBQztBQUNsQixTQUFLLEtBQUssQ0FBQztB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
