import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { OffsetRange } from "../../../common/core/ranges/offsetRange.js";
import { PositionOffsetTransformer } from "../../../common/core/text/positionToOffset.js";
suite("PositionOffsetTransformer", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const str = "123456\nabcdef\nghijkl\nmnopqr";
  const t = new PositionOffsetTransformer(str);
  test("getPosition", () => {
    assert.deepStrictEqual(
      new OffsetRange(0, str.length + 2).map((i) => t.getPosition(i).toString()),
      [
        "(1,1)",
        "(1,2)",
        "(1,3)",
        "(1,4)",
        "(1,5)",
        "(1,6)",
        "(1,7)",
        "(2,1)",
        "(2,2)",
        "(2,3)",
        "(2,4)",
        "(2,5)",
        "(2,6)",
        "(2,7)",
        "(3,1)",
        "(3,2)",
        "(3,3)",
        "(3,4)",
        "(3,5)",
        "(3,6)",
        "(3,7)",
        "(4,1)",
        "(4,2)",
        "(4,3)",
        "(4,4)",
        "(4,5)",
        "(4,6)",
        "(4,7)",
        "(4,8)"
      ]
    );
  });
  test("getOffset", () => {
    for (let i = 0; i < str.length + 1; i++) {
      assert.strictEqual(t.getOffset(t.getPosition(i)), i);
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci90ZXN0L2NvbW1vbi9jb3JlL3Bvc2l0aW9uT2Zmc2V0VHJhbnNmb3JtZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgT2Zmc2V0UmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZXMvb2Zmc2V0UmFuZ2UuanMnO1xuaW1wb3J0IHsgUG9zaXRpb25PZmZzZXRUcmFuc2Zvcm1lciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3RleHQvcG9zaXRpb25Ub09mZnNldC5qcyc7XG5cbnN1aXRlKCdQb3NpdGlvbk9mZnNldFRyYW5zZm9ybWVyJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBzdHIgPSAnMTIzNDU2XFxuYWJjZGVmXFxuZ2hpamtsXFxubW5vcHFyJztcblxuXHRjb25zdCB0ID0gbmV3IFBvc2l0aW9uT2Zmc2V0VHJhbnNmb3JtZXIoc3RyKTtcblx0dGVzdCgnZ2V0UG9zaXRpb24nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdG5ldyBPZmZzZXRSYW5nZSgwLCBzdHIubGVuZ3RoICsgMikubWFwKGkgPT4gdC5nZXRQb3NpdGlvbihpKS50b1N0cmluZygpKSxcblx0XHRcdFtcblx0XHRcdFx0JygxLDEpJyxcblx0XHRcdFx0JygxLDIpJyxcblx0XHRcdFx0JygxLDMpJyxcblx0XHRcdFx0JygxLDQpJyxcblx0XHRcdFx0JygxLDUpJyxcblx0XHRcdFx0JygxLDYpJyxcblx0XHRcdFx0JygxLDcpJyxcblx0XHRcdFx0JygyLDEpJyxcblx0XHRcdFx0JygyLDIpJyxcblx0XHRcdFx0JygyLDMpJyxcblx0XHRcdFx0JygyLDQpJyxcblx0XHRcdFx0JygyLDUpJyxcblx0XHRcdFx0JygyLDYpJyxcblx0XHRcdFx0JygyLDcpJyxcblx0XHRcdFx0JygzLDEpJyxcblx0XHRcdFx0JygzLDIpJyxcblx0XHRcdFx0JygzLDMpJyxcblx0XHRcdFx0JygzLDQpJyxcblx0XHRcdFx0JygzLDUpJyxcblx0XHRcdFx0JygzLDYpJyxcblx0XHRcdFx0JygzLDcpJyxcblx0XHRcdFx0Jyg0LDEpJyxcblx0XHRcdFx0Jyg0LDIpJyxcblx0XHRcdFx0Jyg0LDMpJyxcblx0XHRcdFx0Jyg0LDQpJyxcblx0XHRcdFx0Jyg0LDUpJyxcblx0XHRcdFx0Jyg0LDYpJyxcblx0XHRcdFx0Jyg0LDcpJyxcblx0XHRcdFx0Jyg0LDgpJ1xuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldE9mZnNldCcsICgpID0+IHtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHN0ci5sZW5ndGggKyAxOyBpKyspIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0LmdldE9mZnNldCh0LmdldFBvc2l0aW9uKGkpKSwgaSk7XG5cdFx0fVxuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsaUNBQWlDO0FBRTFDLE1BQU0sNkJBQTZCLE1BQU07QUFDeEMsMENBQXdDO0FBRXhDLFFBQU0sTUFBTTtBQUVaLFFBQU0sSUFBSSxJQUFJLDBCQUEwQixHQUFHO0FBQzNDLE9BQUssZUFBZSxNQUFNO0FBQ3pCLFdBQU87QUFBQSxNQUNOLElBQUksWUFBWSxHQUFHLElBQUksU0FBUyxDQUFDLEVBQUUsSUFBSSxPQUFLLEVBQUUsWUFBWSxDQUFDLEVBQUUsU0FBUyxDQUFDO0FBQUEsTUFDdkU7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxhQUFhLE1BQU07QUFDdkIsYUFBUyxJQUFJLEdBQUcsSUFBSSxJQUFJLFNBQVMsR0FBRyxLQUFLO0FBQ3hDLGFBQU8sWUFBWSxFQUFFLFVBQVUsRUFBRSxZQUFZLENBQUMsQ0FBQyxHQUFHLENBQUM7QUFBQSxJQUNwRDtBQUFBLEVBQ0QsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
