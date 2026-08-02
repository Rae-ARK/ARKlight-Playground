import assert from "assert";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { ListProjection } from "../../../browser/explorerProjections/listProjection.js";
import { TestId } from "../../../common/testId.js";
import { TestDiffOpType, TestItemExpandState } from "../../../common/testTypes.js";
import { TestTreeTestHarness } from "../testObjectTree.js";
import { TestTestItem } from "../../common/testStubs.js";
import { upcastPartial } from "../../../../../../base/test/common/mock.js";
suite("Workbench - Testing Explorer Hierarchal by Name Projection", () => {
  let harness;
  let onTestChanged;
  let resultsService;
  teardown(() => {
    harness.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  setup(() => {
    onTestChanged = new Emitter();
    resultsService = upcastPartial({
      onResultsChanged: Event.None,
      onTestChanged: onTestChanged.event,
      getStateById: () => void 0
    });
    harness = new TestTreeTestHarness((l) => new ListProjection({}, l, resultsService));
  });
  test("renders initial tree", () => {
    harness.flush();
    assert.deepStrictEqual(harness.tree.getRendered(), [
      { e: "aa" },
      { e: "ab" },
      { e: "b" }
    ]);
  });
  test("updates render if second test provider appears", async () => {
    harness.flush();
    harness.pushDiff({
      op: TestDiffOpType.Add,
      item: { controllerId: "ctrl2", expand: TestItemExpandState.Expanded, item: new TestTestItem(new TestId(["ctrl2"]), "root2").toTestItem() }
    }, {
      op: TestDiffOpType.Add,
      item: { controllerId: "ctrl2", expand: TestItemExpandState.NotExpandable, item: new TestTestItem(new TestId(["ctrl2", "id-c"]), "c", void 0).toTestItem() }
    });
    assert.deepStrictEqual(harness.flush(), [
      { e: "root", children: [{ e: "aa" }, { e: "ab" }, { e: "b" }] },
      { e: "root2", children: [{ e: "c" }] }
    ]);
  });
  test("updates nodes if they add children", async () => {
    harness.flush();
    harness.c.root.children.get("id-a").children.add(new TestTestItem(new TestId(["ctrlId", "id-a", "id-ac"]), "ac"));
    assert.deepStrictEqual(harness.flush(), [
      { e: "aa" },
      { e: "ab" },
      { e: "ac" },
      { e: "b" }
    ]);
  });
  test("updates nodes if they remove children", async () => {
    harness.flush();
    harness.c.root.children.get("id-a").children.delete("id-ab");
    assert.deepStrictEqual(harness.flush(), [
      { e: "aa" },
      { e: "b" }
    ]);
  });
  test("swaps when node is no longer leaf", async () => {
    harness.flush();
    harness.c.root.children.get("id-b").children.add(new TestTestItem(new TestId(["ctrlId", "id-b", "id-ba"]), "ba"));
    assert.deepStrictEqual(harness.flush(), [
      { e: "aa" },
      { e: "ab" },
      { e: "ba" }
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlc3RpbmcvdGVzdC9icm93c2VyL2V4cGxvcmVyUHJvamVjdGlvbnMvbmFtZVByb2plY3Rpb24udGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBMaXN0UHJvamVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZXhwbG9yZXJQcm9qZWN0aW9ucy9saXN0UHJvamVjdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0SWQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdGVzdElkLmpzJztcbmltcG9ydCB7IFRlc3RSZXN1bHRJdGVtQ2hhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Rlc3RSZXN1bHQuanMnO1xuaW1wb3J0IHsgVGVzdERpZmZPcFR5cGUsIFRlc3RJdGVtRXhwYW5kU3RhdGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdGVzdFR5cGVzLmpzJztcbmltcG9ydCB7IFRlc3RUcmVlVGVzdEhhcm5lc3MgfSBmcm9tICcuLi90ZXN0T2JqZWN0VHJlZS5qcyc7XG5pbXBvcnQgeyBUZXN0VGVzdEl0ZW0gfSBmcm9tICcuLi8uLi9jb21tb24vdGVzdFN0dWJzLmpzJztcbmltcG9ydCB7IHVwY2FzdFBhcnRpYWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgSVRlc3RSZXN1bHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Rlc3RSZXN1bHRTZXJ2aWNlLmpzJztcblxuc3VpdGUoJ1dvcmtiZW5jaCAtIFRlc3RpbmcgRXhwbG9yZXIgSGllcmFyY2hhbCBieSBOYW1lIFByb2plY3Rpb24nLCAoKSA9PiB7XG5cdGxldCBoYXJuZXNzOiBUZXN0VHJlZVRlc3RIYXJuZXNzPExpc3RQcm9qZWN0aW9uPjtcblx0bGV0IG9uVGVzdENoYW5nZWQ6IEVtaXR0ZXI8VGVzdFJlc3VsdEl0ZW1DaGFuZ2U+O1xuXHRsZXQgcmVzdWx0c1NlcnZpY2U6IElUZXN0UmVzdWx0U2VydmljZTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0aGFybmVzcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRvblRlc3RDaGFuZ2VkID0gbmV3IEVtaXR0ZXIoKTtcblx0XHRyZXN1bHRzU2VydmljZSA9IHVwY2FzdFBhcnRpYWw8SVRlc3RSZXN1bHRTZXJ2aWNlPih7XG5cdFx0XHRvblJlc3VsdHNDaGFuZ2VkOiBFdmVudC5Ob25lLFxuXHRcdFx0b25UZXN0Q2hhbmdlZDogb25UZXN0Q2hhbmdlZC5ldmVudCxcblx0XHRcdGdldFN0YXRlQnlJZDogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdH0pO1xuXG5cdFx0aGFybmVzcyA9IG5ldyBUZXN0VHJlZVRlc3RIYXJuZXNzKGwgPT4gbmV3IExpc3RQcm9qZWN0aW9uKHt9LCBsLCByZXN1bHRzU2VydmljZSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW5kZXJzIGluaXRpYWwgdHJlZScsICgpID0+IHtcblx0XHRoYXJuZXNzLmZsdXNoKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChoYXJuZXNzLnRyZWUuZ2V0UmVuZGVyZWQoKSwgW1xuXHRcdFx0eyBlOiAnYWEnIH0sIHsgZTogJ2FiJyB9LCB7IGU6ICdiJyB9XG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZXMgcmVuZGVyIGlmIHNlY29uZCB0ZXN0IHByb3ZpZGVyIGFwcGVhcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0aGFybmVzcy5mbHVzaCgpO1xuXHRcdGhhcm5lc3MucHVzaERpZmYoe1xuXHRcdFx0b3A6IFRlc3REaWZmT3BUeXBlLkFkZCxcblx0XHRcdGl0ZW06IHsgY29udHJvbGxlcklkOiAnY3RybDInLCBleHBhbmQ6IFRlc3RJdGVtRXhwYW5kU3RhdGUuRXhwYW5kZWQsIGl0ZW06IG5ldyBUZXN0VGVzdEl0ZW0obmV3IFRlc3RJZChbJ2N0cmwyJ10pLCAncm9vdDInKS50b1Rlc3RJdGVtKCkgfSxcblx0XHR9LCB7XG5cdFx0XHRvcDogVGVzdERpZmZPcFR5cGUuQWRkLFxuXHRcdFx0aXRlbTogeyBjb250cm9sbGVySWQ6ICdjdHJsMicsIGV4cGFuZDogVGVzdEl0ZW1FeHBhbmRTdGF0ZS5Ob3RFeHBhbmRhYmxlLCBpdGVtOiBuZXcgVGVzdFRlc3RJdGVtKG5ldyBUZXN0SWQoWydjdHJsMicsICdpZC1jJ10pLCAnYycsIHVuZGVmaW5lZCkudG9UZXN0SXRlbSgpIH0sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGhhcm5lc3MuZmx1c2goKSwgW1xuXHRcdFx0eyBlOiAncm9vdCcsIGNoaWxkcmVuOiBbeyBlOiAnYWEnIH0sIHsgZTogJ2FiJyB9LCB7IGU6ICdiJyB9XSB9LFxuXHRcdFx0eyBlOiAncm9vdDInLCBjaGlsZHJlbjogW3sgZTogJ2MnIH1dIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZXMgbm9kZXMgaWYgdGhleSBhZGQgY2hpbGRyZW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0aGFybmVzcy5mbHVzaCgpO1xuXG5cdFx0aGFybmVzcy5jLnJvb3QuY2hpbGRyZW4uZ2V0KCdpZC1hJykhLmNoaWxkcmVuLmFkZChuZXcgVGVzdFRlc3RJdGVtKG5ldyBUZXN0SWQoWydjdHJsSWQnLCAnaWQtYScsICdpZC1hYyddKSwgJ2FjJykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChoYXJuZXNzLmZsdXNoKCksIFtcblx0XHRcdHsgZTogJ2FhJyB9LFxuXHRcdFx0eyBlOiAnYWInIH0sXG5cdFx0XHR7IGU6ICdhYycgfSxcblx0XHRcdHsgZTogJ2InIH1cblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlcyBub2RlcyBpZiB0aGV5IHJlbW92ZSBjaGlsZHJlbicsIGFzeW5jICgpID0+IHtcblx0XHRoYXJuZXNzLmZsdXNoKCk7XG5cdFx0aGFybmVzcy5jLnJvb3QuY2hpbGRyZW4uZ2V0KCdpZC1hJykhLmNoaWxkcmVuLmRlbGV0ZSgnaWQtYWInKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaGFybmVzcy5mbHVzaCgpLCBbXG5cdFx0XHR7IGU6ICdhYScgfSxcblx0XHRcdHsgZTogJ2InIH1cblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnc3dhcHMgd2hlbiBub2RlIGlzIG5vIGxvbmdlciBsZWFmJywgYXN5bmMgKCkgPT4ge1xuXHRcdGhhcm5lc3MuZmx1c2goKTtcblx0XHRoYXJuZXNzLmMucm9vdC5jaGlsZHJlbi5nZXQoJ2lkLWInKSEuY2hpbGRyZW4uYWRkKG5ldyBUZXN0VGVzdEl0ZW0obmV3IFRlc3RJZChbJ2N0cmxJZCcsICdpZC1iJywgJ2lkLWJhJ10pLCAnYmEnKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGhhcm5lc3MuZmx1c2goKSwgW1xuXHRcdFx0eyBlOiAnYWEnIH0sXG5cdFx0XHR7IGU6ICdhYicgfSxcblx0XHRcdHsgZTogJ2JhJyB9LFxuXHRcdF0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsY0FBYztBQUV2QixTQUFTLGdCQUFnQiwyQkFBMkI7QUFDcEQsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxxQkFBcUI7QUFHOUIsTUFBTSw4REFBOEQsTUFBTTtBQUN6RSxNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFFSixXQUFTLE1BQU07QUFDZCxZQUFRLFFBQVE7QUFBQSxFQUNqQixDQUFDO0FBRUQsMENBQXdDO0FBRXhDLFFBQU0sTUFBTTtBQUNYLG9CQUFnQixJQUFJLFFBQVE7QUFDNUIscUJBQWlCLGNBQWtDO0FBQUEsTUFDbEQsa0JBQWtCLE1BQU07QUFBQSxNQUN4QixlQUFlLGNBQWM7QUFBQSxNQUM3QixjQUFjLE1BQU07QUFBQSxJQUNyQixDQUFDO0FBRUQsY0FBVSxJQUFJLG9CQUFvQixPQUFLLElBQUksZUFBZSxDQUFDLEdBQUcsR0FBRyxjQUFjLENBQUM7QUFBQSxFQUNqRixDQUFDO0FBRUQsT0FBSyx3QkFBd0IsTUFBTTtBQUNsQyxZQUFRLE1BQU07QUFDZCxXQUFPLGdCQUFnQixRQUFRLEtBQUssWUFBWSxHQUFHO0FBQUEsTUFDbEQsRUFBRSxHQUFHLEtBQUs7QUFBQSxNQUFHLEVBQUUsR0FBRyxLQUFLO0FBQUEsTUFBRyxFQUFFLEdBQUcsSUFBSTtBQUFBLElBQ3BDLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGtEQUFrRCxZQUFZO0FBQ2xFLFlBQVEsTUFBTTtBQUNkLFlBQVEsU0FBUztBQUFBLE1BQ2hCLElBQUksZUFBZTtBQUFBLE1BQ25CLE1BQU0sRUFBRSxjQUFjLFNBQVMsUUFBUSxvQkFBb0IsVUFBVSxNQUFNLElBQUksYUFBYSxJQUFJLE9BQU8sQ0FBQyxPQUFPLENBQUMsR0FBRyxPQUFPLEVBQUUsV0FBVyxFQUFFO0FBQUEsSUFDMUksR0FBRztBQUFBLE1BQ0YsSUFBSSxlQUFlO0FBQUEsTUFDbkIsTUFBTSxFQUFFLGNBQWMsU0FBUyxRQUFRLG9CQUFvQixlQUFlLE1BQU0sSUFBSSxhQUFhLElBQUksT0FBTyxDQUFDLFNBQVMsTUFBTSxDQUFDLEdBQUcsS0FBSyxNQUFTLEVBQUUsV0FBVyxFQUFFO0FBQUEsSUFDOUosQ0FBQztBQUVELFdBQU8sZ0JBQWdCLFFBQVEsTUFBTSxHQUFHO0FBQUEsTUFDdkMsRUFBRSxHQUFHLFFBQVEsVUFBVSxDQUFDLEVBQUUsR0FBRyxLQUFLLEdBQUcsRUFBRSxHQUFHLEtBQUssR0FBRyxFQUFFLEdBQUcsSUFBSSxDQUFDLEVBQUU7QUFBQSxNQUM5RCxFQUFFLEdBQUcsU0FBUyxVQUFVLENBQUMsRUFBRSxHQUFHLElBQUksQ0FBQyxFQUFFO0FBQUEsSUFDdEMsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssc0NBQXNDLFlBQVk7QUFDdEQsWUFBUSxNQUFNO0FBRWQsWUFBUSxFQUFFLEtBQUssU0FBUyxJQUFJLE1BQU0sRUFBRyxTQUFTLElBQUksSUFBSSxhQUFhLElBQUksT0FBTyxDQUFDLFVBQVUsUUFBUSxPQUFPLENBQUMsR0FBRyxJQUFJLENBQUM7QUFFakgsV0FBTyxnQkFBZ0IsUUFBUSxNQUFNLEdBQUc7QUFBQSxNQUN2QyxFQUFFLEdBQUcsS0FBSztBQUFBLE1BQ1YsRUFBRSxHQUFHLEtBQUs7QUFBQSxNQUNWLEVBQUUsR0FBRyxLQUFLO0FBQUEsTUFDVixFQUFFLEdBQUcsSUFBSTtBQUFBLElBQ1YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUsseUNBQXlDLFlBQVk7QUFDekQsWUFBUSxNQUFNO0FBQ2QsWUFBUSxFQUFFLEtBQUssU0FBUyxJQUFJLE1BQU0sRUFBRyxTQUFTLE9BQU8sT0FBTztBQUU1RCxXQUFPLGdCQUFnQixRQUFRLE1BQU0sR0FBRztBQUFBLE1BQ3ZDLEVBQUUsR0FBRyxLQUFLO0FBQUEsTUFDVixFQUFFLEdBQUcsSUFBSTtBQUFBLElBQ1YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUsscUNBQXFDLFlBQVk7QUFDckQsWUFBUSxNQUFNO0FBQ2QsWUFBUSxFQUFFLEtBQUssU0FBUyxJQUFJLE1BQU0sRUFBRyxTQUFTLElBQUksSUFBSSxhQUFhLElBQUksT0FBTyxDQUFDLFVBQVUsUUFBUSxPQUFPLENBQUMsR0FBRyxJQUFJLENBQUM7QUFFakgsV0FBTyxnQkFBZ0IsUUFBUSxNQUFNLEdBQUc7QUFBQSxNQUN2QyxFQUFFLEdBQUcsS0FBSztBQUFBLE1BQ1YsRUFBRSxHQUFHLEtBQUs7QUFBQSxNQUNWLEVBQUUsR0FBRyxLQUFLO0FBQUEsSUFDWCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
