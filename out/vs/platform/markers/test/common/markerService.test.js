import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { MarkerSeverity } from "../../common/markers.js";
import * as markerService from "../../common/markerService.js";
function randomMarkerData(severity = MarkerSeverity.Error) {
  return {
    severity,
    message: Math.random().toString(16),
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: 1,
    endColumn: 1
  };
}
suite("Marker Service", () => {
  let service;
  teardown(function() {
    service.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("query", () => {
    service = new markerService.MarkerService();
    service.changeAll("far", [{
      resource: URI.parse("file:///c/test/file.cs"),
      marker: randomMarkerData(MarkerSeverity.Error)
    }]);
    assert.strictEqual(service.read().length, 1);
    assert.strictEqual(service.read({ owner: "far" }).length, 1);
    assert.strictEqual(service.read({ resource: URI.parse("file:///c/test/file.cs") }).length, 1);
    assert.strictEqual(service.read({ owner: "far", resource: URI.parse("file:///c/test/file.cs") }).length, 1);
    service.changeAll("boo", [{
      resource: URI.parse("file:///c/test/file.cs"),
      marker: randomMarkerData(MarkerSeverity.Warning)
    }]);
    assert.strictEqual(service.read().length, 2);
    assert.strictEqual(service.read({ owner: "far" }).length, 1);
    assert.strictEqual(service.read({ owner: "boo" }).length, 1);
    assert.strictEqual(service.read({ severities: MarkerSeverity.Error }).length, 1);
    assert.strictEqual(service.read({ severities: MarkerSeverity.Warning }).length, 1);
    assert.strictEqual(service.read({ severities: MarkerSeverity.Hint }).length, 0);
    assert.strictEqual(service.read({ severities: MarkerSeverity.Error | MarkerSeverity.Warning }).length, 2);
  });
  test("changeOne override", () => {
    service = new markerService.MarkerService();
    service.changeOne("far", URI.parse("file:///path/only.cs"), [randomMarkerData()]);
    assert.strictEqual(service.read().length, 1);
    assert.strictEqual(service.read({ owner: "far" }).length, 1);
    service.changeOne("boo", URI.parse("file:///path/only.cs"), [randomMarkerData()]);
    assert.strictEqual(service.read().length, 2);
    assert.strictEqual(service.read({ owner: "far" }).length, 1);
    assert.strictEqual(service.read({ owner: "boo" }).length, 1);
    service.changeOne("far", URI.parse("file:///path/only.cs"), [randomMarkerData(), randomMarkerData()]);
    assert.strictEqual(service.read({ owner: "far" }).length, 2);
    assert.strictEqual(service.read({ owner: "boo" }).length, 1);
  });
  test("changeOne/All clears", () => {
    service = new markerService.MarkerService();
    service.changeOne("far", URI.parse("file:///path/only.cs"), [randomMarkerData()]);
    service.changeOne("boo", URI.parse("file:///path/only.cs"), [randomMarkerData()]);
    assert.strictEqual(service.read({ owner: "far" }).length, 1);
    assert.strictEqual(service.read({ owner: "boo" }).length, 1);
    assert.strictEqual(service.read().length, 2);
    service.changeOne("far", URI.parse("file:///path/only.cs"), []);
    assert.strictEqual(service.read({ owner: "far" }).length, 0);
    assert.strictEqual(service.read({ owner: "boo" }).length, 1);
    assert.strictEqual(service.read().length, 1);
    service.changeAll("boo", []);
    assert.strictEqual(service.read({ owner: "far" }).length, 0);
    assert.strictEqual(service.read({ owner: "boo" }).length, 0);
    assert.strictEqual(service.read().length, 0);
  });
  test("changeAll sends event for cleared", () => {
    service = new markerService.MarkerService();
    service.changeAll("far", [{
      resource: URI.parse("file:///d/path"),
      marker: randomMarkerData()
    }, {
      resource: URI.parse("file:///d/path"),
      marker: randomMarkerData()
    }]);
    assert.strictEqual(service.read({ owner: "far" }).length, 2);
    const d = service.onMarkerChanged((changedResources) => {
      assert.strictEqual(changedResources.length, 1);
      changedResources.forEach((u) => assert.strictEqual(u.toString(), "file:///d/path"));
      assert.strictEqual(service.read({ owner: "far" }).length, 0);
    });
    service.changeAll("far", []);
    d.dispose();
  });
  test("changeAll merges", () => {
    service = new markerService.MarkerService();
    service.changeAll("far", [{
      resource: URI.parse("file:///c/test/file.cs"),
      marker: randomMarkerData()
    }, {
      resource: URI.parse("file:///c/test/file.cs"),
      marker: randomMarkerData()
    }]);
    assert.strictEqual(service.read({ owner: "far" }).length, 2);
  });
  test("changeAll must not break integrety, issue #12635", () => {
    service = new markerService.MarkerService();
    service.changeAll("far", [{
      resource: URI.parse("scheme:path1"),
      marker: randomMarkerData()
    }, {
      resource: URI.parse("scheme:path2"),
      marker: randomMarkerData()
    }]);
    service.changeAll("boo", [{
      resource: URI.parse("scheme:path1"),
      marker: randomMarkerData()
    }]);
    service.changeAll("far", [{
      resource: URI.parse("scheme:path1"),
      marker: randomMarkerData()
    }, {
      resource: URI.parse("scheme:path2"),
      marker: randomMarkerData()
    }]);
    assert.strictEqual(service.read({ owner: "far" }).length, 2);
    assert.strictEqual(service.read({ resource: URI.parse("scheme:path1") }).length, 2);
  });
  test("invalid marker data", () => {
    const data = randomMarkerData();
    service = new markerService.MarkerService();
    data.message = void 0;
    service.changeOne("far", URI.parse("some:uri/path"), [data]);
    assert.strictEqual(service.read({ owner: "far" }).length, 0);
    data.message = null;
    service.changeOne("far", URI.parse("some:uri/path"), [data]);
    assert.strictEqual(service.read({ owner: "far" }).length, 0);
    data.message = "null";
    service.changeOne("far", URI.parse("some:uri/path"), [data]);
    assert.strictEqual(service.read({ owner: "far" }).length, 1);
  });
  test("MapMap#remove returns bad values, https://github.com/microsoft/vscode/issues/13548", () => {
    service = new markerService.MarkerService();
    service.changeOne("o", URI.parse("some:uri/1"), [randomMarkerData()]);
    service.changeOne("o", URI.parse("some:uri/2"), []);
  });
  test("Error code of zero in markers get removed, #31275", function() {
    const data = {
      code: "0",
      startLineNumber: 1,
      startColumn: 2,
      endLineNumber: 1,
      endColumn: 5,
      message: "test",
      severity: 0,
      source: "me"
    };
    service = new markerService.MarkerService();
    service.changeOne("far", URI.parse("some:thing"), [data]);
    const marker = service.read({ resource: URI.parse("some:thing") });
    assert.strictEqual(marker.length, 1);
    assert.strictEqual(marker[0].code, "0");
  });
  test("modelVersionId is preserved on IMarker when present in IMarkerData", () => {
    service = new markerService.MarkerService();
    const resource = URI.parse("file:///path/file.ts");
    const dataWithVersion = {
      ...randomMarkerData(),
      modelVersionId: 42
    };
    service.changeOne("owner", resource, [dataWithVersion]);
    const markersWithVersion = service.read({ resource });
    assert.strictEqual(markersWithVersion.length, 1);
    assert.strictEqual(markersWithVersion[0].modelVersionId, 42);
    const dataWithoutVersion = randomMarkerData();
    service.changeOne("owner", resource, [dataWithoutVersion]);
    const markersWithoutVersion = service.read({ resource });
    assert.strictEqual(markersWithoutVersion.length, 1);
    assert.strictEqual(markersWithoutVersion[0].modelVersionId, void 0);
  });
  test("resource filter hides markers for the filtered resource", () => {
    service = new markerService.MarkerService();
    const resource1 = URI.parse("file:///path/file1.cs");
    const resource2 = URI.parse("file:///path/file2.cs");
    service.changeOne("owner1", resource1, [randomMarkerData()]);
    service.changeOne("owner1", resource2, [randomMarkerData()]);
    assert.strictEqual(service.read().length, 2);
    assert.strictEqual(service.read({ resource: resource1 }).length, 1);
    assert.strictEqual(service.read({ resource: resource2 }).length, 1);
    const filter = service.installResourceFilter(resource1, "Test filter");
    assert.strictEqual(service.read().length, 2);
    assert.strictEqual(service.read({ resource: resource1 }).length, 1);
    assert.strictEqual(service.read({ resource: resource2 }).length, 1);
    filter.dispose();
    assert.strictEqual(service.read().length, 2);
    assert.strictEqual(service.read({ resource: resource1 }).length, 1);
    assert.strictEqual(service.read({ resource: resource2 }).length, 1);
  });
  test("resource filter hides markers for the filtered resource UNLESS explicit read", () => {
    service = new markerService.MarkerService();
    const resource1 = URI.parse("file:///path/file1.cs");
    const resource2 = URI.parse("file:///path/file2.cs");
    service.changeOne("owner1", resource1, [randomMarkerData()]);
    service.changeOne("owner1", resource2, [randomMarkerData()]);
    assert.strictEqual(service.read().length, 2);
    assert.strictEqual(service.read({ resource: resource1 }).length, 1);
    assert.strictEqual(service.read({ resource: resource2 }).length, 1);
    const filter = service.installResourceFilter(resource1, "Test filter");
    assert.strictEqual(service.read().length, 2);
    assert.strictEqual(service.read({ resource: resource1 }).length, 1);
    assert.strictEqual(service.read({ resource: resource2 }).length, 1);
    assert.strictEqual(service.read({ ignoreResourceFilters: true }).length, 2);
    assert.strictEqual(service.read({ resource: resource1, ignoreResourceFilters: true }).length, 1);
    assert.strictEqual(service.read({ resource: resource1, ignoreResourceFilters: true })[0].severity, MarkerSeverity.Error);
    assert.strictEqual(service.read({ resource: resource2, ignoreResourceFilters: true }).length, 1);
    assert.strictEqual(service.read({ resource: resource2, ignoreResourceFilters: true })[0].severity, MarkerSeverity.Error);
    filter.dispose();
  });
  test("resource filter affects all filter combinations", () => {
    service = new markerService.MarkerService();
    const resource = URI.parse("file:///path/file.cs");
    service.changeOne("owner1", resource, [randomMarkerData(MarkerSeverity.Error)]);
    service.changeOne("owner2", resource, [randomMarkerData(MarkerSeverity.Warning)]);
    assert.strictEqual(service.read().length, 2);
    assert.strictEqual(service.read({ resource }).length, 2);
    assert.strictEqual(service.read({ owner: "owner1" }).length, 1);
    assert.strictEqual(service.read({ owner: "owner2" }).length, 1);
    assert.strictEqual(service.read({ owner: "owner1", resource }).length, 1);
    assert.strictEqual(service.read({ severities: MarkerSeverity.Error }).length, 1);
    assert.strictEqual(service.read({ severities: MarkerSeverity.Warning }).length, 1);
    const filter = service.installResourceFilter(resource, "Filter reason");
    assert.strictEqual(service.read().length, 1);
    assert.strictEqual(service.read({ resource }).length, 1);
    assert.strictEqual(service.read({ owner: "owner1" }).length, 1);
    assert.strictEqual(service.read({ owner: "owner2" }).length, 1);
    const ownerResourceMarkers = service.read({ owner: "owner1", resource });
    assert.strictEqual(ownerResourceMarkers.length, 1);
    assert.strictEqual(ownerResourceMarkers[0].severity, MarkerSeverity.Info);
    assert.strictEqual(ownerResourceMarkers[0].owner, "markersFilter");
    assert.strictEqual(service.read({ severities: MarkerSeverity.Error }).length, 1);
    assert.strictEqual(service.read({ severities: MarkerSeverity.Warning }).length, 1);
    assert.strictEqual(service.read({ severities: MarkerSeverity.Info }).length, 1);
    filter.dispose();
    assert.strictEqual(service.read().length, 2);
  });
  test("multiple filters for same resource are handled correctly", () => {
    service = new markerService.MarkerService();
    const resource = URI.parse("file:///path/file.cs");
    service.changeOne("owner1", resource, [randomMarkerData()]);
    assert.strictEqual(service.read().length, 1);
    assert.strictEqual(service.read({ resource }).length, 1);
    const filter1 = service.installResourceFilter(resource, "First filter");
    const filter2 = service.installResourceFilter(resource, "Second filter");
    assert.strictEqual(service.read().length, 1);
    assert.strictEqual(service.read({ resource }).length, 1);
    filter1.dispose();
    assert.strictEqual(service.read().length, 1);
    assert.strictEqual(service.read({ resource }).length, 1);
    filter2.dispose();
    assert.strictEqual(service.read().length, 1);
    assert.strictEqual(service.read({ resource }).length, 1);
  });
  test("resource filter with reason shows info marker when markers are filtered", () => {
    service = new markerService.MarkerService();
    const resource = URI.parse("file:///path/file.cs");
    service.changeOne("owner1", resource, [
      randomMarkerData(MarkerSeverity.Error),
      randomMarkerData(MarkerSeverity.Warning)
    ]);
    assert.strictEqual(service.read().length, 2);
    assert.strictEqual(service.read({ resource }).length, 2);
    const filterReason = "Test filter reason";
    const filter = service.installResourceFilter(resource, filterReason);
    const markers = service.read({ resource });
    assert.strictEqual(markers.length, 1);
    assert.strictEqual(markers[0].severity, MarkerSeverity.Info);
    assert.ok(markers[0].message.includes(filterReason));
    filter.dispose();
    assert.strictEqual(service.read({ resource }).length, 2);
  });
  test("reading all markers shows info marker for filtered resources", () => {
    service = new markerService.MarkerService();
    const resource1 = URI.parse("file:///path/file1.cs");
    const resource2 = URI.parse("file:///path/file2.cs");
    service.changeOne("owner1", resource1, [randomMarkerData()]);
    service.changeOne("owner1", resource2, [randomMarkerData()]);
    assert.strictEqual(service.read().length, 2);
    const filterReason = "Resource is being edited";
    const filter = service.installResourceFilter(resource1, filterReason);
    const allMarkers = service.read();
    assert.strictEqual(allMarkers.length, 2);
    const infoMarker = allMarkers.find(
      (marker) => marker.owner === "markersFilter" && marker.severity === MarkerSeverity.Info
    );
    assert.ok(infoMarker);
    assert.strictEqual(infoMarker?.resource.toString(), resource1.toString());
    assert.ok(infoMarker?.message.includes(filterReason));
    filter.dispose();
  });
  test("out of order filter disposal works correctly", () => {
    service = new markerService.MarkerService();
    const resource = URI.parse("file:///path/file.cs");
    service.changeOne("owner1", resource, [randomMarkerData()]);
    assert.strictEqual(service.read().length, 1);
    assert.strictEqual(service.read({ resource }).length, 1);
    const filter1 = service.installResourceFilter(resource, "First filter");
    const filter2 = service.installResourceFilter(resource, "Second filter");
    const filter3 = service.installResourceFilter(resource, "Third filter");
    assert.strictEqual(service.read().length, 1);
    assert.strictEqual(service.read({ resource }).length, 1);
    filter2.dispose();
    assert.strictEqual(service.read().length, 1);
    assert.strictEqual(service.read({ resource }).length, 1);
    const markers = service.read({ resource });
    assert.ok(markers[0].message.includes("Problems are paused because"));
    filter3.dispose();
    filter1.dispose();
    assert.strictEqual(service.read().length, 1);
    assert.strictEqual(service.read({ resource }).length, 1);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL21hcmtlcnMvdGVzdC9jb21tb24vbWFya2VyU2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSU1hcmtlckRhdGEsIE1hcmtlclNldmVyaXR5IH0gZnJvbSAnLi4vLi4vY29tbW9uL21hcmtlcnMuanMnO1xuaW1wb3J0ICogYXMgbWFya2VyU2VydmljZSBmcm9tICcuLi8uLi9jb21tb24vbWFya2VyU2VydmljZS5qcyc7XG5cbmZ1bmN0aW9uIHJhbmRvbU1hcmtlckRhdGEoc2V2ZXJpdHkgPSBNYXJrZXJTZXZlcml0eS5FcnJvcik6IElNYXJrZXJEYXRhIHtcblx0cmV0dXJuIHtcblx0XHRzZXZlcml0eSxcblx0XHRtZXNzYWdlOiBNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDE2KSxcblx0XHRzdGFydExpbmVOdW1iZXI6IDEsXG5cdFx0c3RhcnRDb2x1bW46IDEsXG5cdFx0ZW5kTGluZU51bWJlcjogMSxcblx0XHRlbmRDb2x1bW46IDFcblx0fTtcbn1cblxuc3VpdGUoJ01hcmtlciBTZXJ2aWNlJywgKCkgPT4ge1xuXG5cdGxldCBzZXJ2aWNlOiBtYXJrZXJTZXJ2aWNlLk1hcmtlclNlcnZpY2U7XG5cblx0dGVhcmRvd24oZnVuY3Rpb24gKCkge1xuXHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdxdWVyeScsICgpID0+IHtcblxuXHRcdHNlcnZpY2UgPSBuZXcgbWFya2VyU2VydmljZS5NYXJrZXJTZXJ2aWNlKCk7XG5cblx0XHRzZXJ2aWNlLmNoYW5nZUFsbCgnZmFyJywgW3tcblx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vYy90ZXN0L2ZpbGUuY3MnKSxcblx0XHRcdG1hcmtlcjogcmFuZG9tTWFya2VyRGF0YShNYXJrZXJTZXZlcml0eS5FcnJvcilcblx0XHR9XSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKCkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKHsgb3duZXI6ICdmYXInIH0pLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCh7IHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vYy90ZXN0L2ZpbGUuY3MnKSB9KS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyBvd25lcjogJ2ZhcicsIHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vYy90ZXN0L2ZpbGUuY3MnKSB9KS5sZW5ndGgsIDEpO1xuXG5cblx0XHRzZXJ2aWNlLmNoYW5nZUFsbCgnYm9vJywgW3tcblx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vYy90ZXN0L2ZpbGUuY3MnKSxcblx0XHRcdG1hcmtlcjogcmFuZG9tTWFya2VyRGF0YShNYXJrZXJTZXZlcml0eS5XYXJuaW5nKVxuXHRcdH1dKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoKS5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyBvd25lcjogJ2ZhcicgfSkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKHsgb3duZXI6ICdib28nIH0pLmxlbmd0aCwgMSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKHsgc2V2ZXJpdGllczogTWFya2VyU2V2ZXJpdHkuRXJyb3IgfSkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKHsgc2V2ZXJpdGllczogTWFya2VyU2V2ZXJpdHkuV2FybmluZyB9KS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyBzZXZlcml0aWVzOiBNYXJrZXJTZXZlcml0eS5IaW50IH0pLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCh7IHNldmVyaXRpZXM6IE1hcmtlclNldmVyaXR5LkVycm9yIHwgTWFya2VyU2V2ZXJpdHkuV2FybmluZyB9KS5sZW5ndGgsIDIpO1xuXG5cdH0pO1xuXG5cblx0dGVzdCgnY2hhbmdlT25lIG92ZXJyaWRlJywgKCkgPT4ge1xuXG5cdFx0c2VydmljZSA9IG5ldyBtYXJrZXJTZXJ2aWNlLk1hcmtlclNlcnZpY2UoKTtcblx0XHRzZXJ2aWNlLmNoYW5nZU9uZSgnZmFyJywgVVJJLnBhcnNlKCdmaWxlOi8vL3BhdGgvb25seS5jcycpLCBbcmFuZG9tTWFya2VyRGF0YSgpXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCgpLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCh7IG93bmVyOiAnZmFyJyB9KS5sZW5ndGgsIDEpO1xuXG5cdFx0c2VydmljZS5jaGFuZ2VPbmUoJ2JvbycsIFVSSS5wYXJzZSgnZmlsZTovLy9wYXRoL29ubHkuY3MnKSwgW3JhbmRvbU1hcmtlckRhdGEoKV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoKS5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyBvd25lcjogJ2ZhcicgfSkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKHsgb3duZXI6ICdib28nIH0pLmxlbmd0aCwgMSk7XG5cblx0XHRzZXJ2aWNlLmNoYW5nZU9uZSgnZmFyJywgVVJJLnBhcnNlKCdmaWxlOi8vL3BhdGgvb25seS5jcycpLCBbcmFuZG9tTWFya2VyRGF0YSgpLCByYW5kb21NYXJrZXJEYXRhKCldKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKHsgb3duZXI6ICdmYXInIH0pLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCh7IG93bmVyOiAnYm9vJyB9KS5sZW5ndGgsIDEpO1xuXG5cdH0pO1xuXG5cdHRlc3QoJ2NoYW5nZU9uZS9BbGwgY2xlYXJzJywgKCkgPT4ge1xuXG5cdFx0c2VydmljZSA9IG5ldyBtYXJrZXJTZXJ2aWNlLk1hcmtlclNlcnZpY2UoKTtcblx0XHRzZXJ2aWNlLmNoYW5nZU9uZSgnZmFyJywgVVJJLnBhcnNlKCdmaWxlOi8vL3BhdGgvb25seS5jcycpLCBbcmFuZG9tTWFya2VyRGF0YSgpXSk7XG5cdFx0c2VydmljZS5jaGFuZ2VPbmUoJ2JvbycsIFVSSS5wYXJzZSgnZmlsZTovLy9wYXRoL29ubHkuY3MnKSwgW3JhbmRvbU1hcmtlckRhdGEoKV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyBvd25lcjogJ2ZhcicgfSkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKHsgb3duZXI6ICdib28nIH0pLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCgpLmxlbmd0aCwgMik7XG5cblx0XHRzZXJ2aWNlLmNoYW5nZU9uZSgnZmFyJywgVVJJLnBhcnNlKCdmaWxlOi8vL3BhdGgvb25seS5jcycpLCBbXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCh7IG93bmVyOiAnZmFyJyB9KS5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyBvd25lcjogJ2JvbycgfSkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKCkubGVuZ3RoLCAxKTtcblxuXHRcdHNlcnZpY2UuY2hhbmdlQWxsKCdib28nLCBbXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCh7IG93bmVyOiAnZmFyJyB9KS5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyBvd25lcjogJ2JvbycgfSkubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKCkubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnY2hhbmdlQWxsIHNlbmRzIGV2ZW50IGZvciBjbGVhcmVkJywgKCkgPT4ge1xuXG5cdFx0c2VydmljZSA9IG5ldyBtYXJrZXJTZXJ2aWNlLk1hcmtlclNlcnZpY2UoKTtcblx0XHRzZXJ2aWNlLmNoYW5nZUFsbCgnZmFyJywgW3tcblx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vZC9wYXRoJyksXG5cdFx0XHRtYXJrZXI6IHJhbmRvbU1hcmtlckRhdGEoKVxuXHRcdH0sIHtcblx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vZC9wYXRoJyksXG5cdFx0XHRtYXJrZXI6IHJhbmRvbU1hcmtlckRhdGEoKVxuXHRcdH1dKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyBvd25lcjogJ2ZhcicgfSkubGVuZ3RoLCAyKTtcblxuXHRcdGNvbnN0IGQgPSBzZXJ2aWNlLm9uTWFya2VyQ2hhbmdlZChjaGFuZ2VkUmVzb3VyY2VzID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VkUmVzb3VyY2VzLmxlbmd0aCwgMSk7XG5cdFx0XHRjaGFuZ2VkUmVzb3VyY2VzLmZvckVhY2godSA9PiBhc3NlcnQuc3RyaWN0RXF1YWwodS50b1N0cmluZygpLCAnZmlsZTovLy9kL3BhdGgnKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKHsgb3duZXI6ICdmYXInIH0pLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHRzZXJ2aWNlLmNoYW5nZUFsbCgnZmFyJywgW10pO1xuXG5cdFx0ZC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NoYW5nZUFsbCBtZXJnZXMnLCAoKSA9PiB7XG5cdFx0c2VydmljZSA9IG5ldyBtYXJrZXJTZXJ2aWNlLk1hcmtlclNlcnZpY2UoKTtcblxuXHRcdHNlcnZpY2UuY2hhbmdlQWxsKCdmYXInLCBbe1xuXHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovLy9jL3Rlc3QvZmlsZS5jcycpLFxuXHRcdFx0bWFya2VyOiByYW5kb21NYXJrZXJEYXRhKClcblx0XHR9LCB7XG5cdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKCdmaWxlOi8vL2MvdGVzdC9maWxlLmNzJyksXG5cdFx0XHRtYXJrZXI6IHJhbmRvbU1hcmtlckRhdGEoKVxuXHRcdH1dKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyBvd25lcjogJ2ZhcicgfSkubGVuZ3RoLCAyKTtcblx0fSk7XG5cblx0dGVzdCgnY2hhbmdlQWxsIG11c3Qgbm90IGJyZWFrIGludGVncmV0eSwgaXNzdWUgIzEyNjM1JywgKCkgPT4ge1xuXHRcdHNlcnZpY2UgPSBuZXcgbWFya2VyU2VydmljZS5NYXJrZXJTZXJ2aWNlKCk7XG5cblx0XHRzZXJ2aWNlLmNoYW5nZUFsbCgnZmFyJywgW3tcblx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ3NjaGVtZTpwYXRoMScpLFxuXHRcdFx0bWFya2VyOiByYW5kb21NYXJrZXJEYXRhKClcblx0XHR9LCB7XG5cdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKCdzY2hlbWU6cGF0aDInKSxcblx0XHRcdG1hcmtlcjogcmFuZG9tTWFya2VyRGF0YSgpXG5cdFx0fV0pO1xuXG5cdFx0c2VydmljZS5jaGFuZ2VBbGwoJ2JvbycsIFt7XG5cdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKCdzY2hlbWU6cGF0aDEnKSxcblx0XHRcdG1hcmtlcjogcmFuZG9tTWFya2VyRGF0YSgpXG5cdFx0fV0pO1xuXG5cdFx0c2VydmljZS5jaGFuZ2VBbGwoJ2ZhcicsIFt7XG5cdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKCdzY2hlbWU6cGF0aDEnKSxcblx0XHRcdG1hcmtlcjogcmFuZG9tTWFya2VyRGF0YSgpXG5cdFx0fSwge1xuXHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZSgnc2NoZW1lOnBhdGgyJyksXG5cdFx0XHRtYXJrZXI6IHJhbmRvbU1hcmtlckRhdGEoKVxuXHRcdH1dKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyBvd25lcjogJ2ZhcicgfSkubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgnc2NoZW1lOnBhdGgxJykgfSkubGVuZ3RoLCAyKTtcblx0fSk7XG5cblx0dGVzdCgnaW52YWxpZCBtYXJrZXIgZGF0YScsICgpID0+IHtcblxuXHRcdGNvbnN0IGRhdGEgPSByYW5kb21NYXJrZXJEYXRhKCk7XG5cdFx0c2VydmljZSA9IG5ldyBtYXJrZXJTZXJ2aWNlLk1hcmtlclNlcnZpY2UoKTtcblxuXHRcdGRhdGEubWVzc2FnZSA9IHVuZGVmaW5lZCE7XG5cdFx0c2VydmljZS5jaGFuZ2VPbmUoJ2ZhcicsIFVSSS5wYXJzZSgnc29tZTp1cmkvcGF0aCcpLCBbZGF0YV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyBvd25lcjogJ2ZhcicgfSkubGVuZ3RoLCAwKTtcblxuXHRcdGRhdGEubWVzc2FnZSA9IG51bGwhO1xuXHRcdHNlcnZpY2UuY2hhbmdlT25lKCdmYXInLCBVUkkucGFyc2UoJ3NvbWU6dXJpL3BhdGgnKSwgW2RhdGFdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKHsgb3duZXI6ICdmYXInIH0pLmxlbmd0aCwgMCk7XG5cblx0XHRkYXRhLm1lc3NhZ2UgPSAnbnVsbCc7XG5cdFx0c2VydmljZS5jaGFuZ2VPbmUoJ2ZhcicsIFVSSS5wYXJzZSgnc29tZTp1cmkvcGF0aCcpLCBbZGF0YV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyBvd25lcjogJ2ZhcicgfSkubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnTWFwTWFwI3JlbW92ZSByZXR1cm5zIGJhZCB2YWx1ZXMsIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMzU0OCcsICgpID0+IHtcblx0XHRzZXJ2aWNlID0gbmV3IG1hcmtlclNlcnZpY2UuTWFya2VyU2VydmljZSgpO1xuXG5cdFx0c2VydmljZS5jaGFuZ2VPbmUoJ28nLCBVUkkucGFyc2UoJ3NvbWU6dXJpLzEnKSwgW3JhbmRvbU1hcmtlckRhdGEoKV0pO1xuXHRcdHNlcnZpY2UuY2hhbmdlT25lKCdvJywgVVJJLnBhcnNlKCdzb21lOnVyaS8yJyksIFtdKTtcblxuXHR9KTtcblxuXHR0ZXN0KCdFcnJvciBjb2RlIG9mIHplcm8gaW4gbWFya2VycyBnZXQgcmVtb3ZlZCwgIzMxMjc1JywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGRhdGEgPSA8SU1hcmtlckRhdGE+e1xuXHRcdFx0Y29kZTogJzAnLFxuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAxLFxuXHRcdFx0c3RhcnRDb2x1bW46IDIsXG5cdFx0XHRlbmRMaW5lTnVtYmVyOiAxLFxuXHRcdFx0ZW5kQ29sdW1uOiA1LFxuXHRcdFx0bWVzc2FnZTogJ3Rlc3QnLFxuXHRcdFx0c2V2ZXJpdHk6IDAgYXMgTWFya2VyU2V2ZXJpdHksXG5cdFx0XHRzb3VyY2U6ICdtZSdcblx0XHR9O1xuXHRcdHNlcnZpY2UgPSBuZXcgbWFya2VyU2VydmljZS5NYXJrZXJTZXJ2aWNlKCk7XG5cblx0XHRzZXJ2aWNlLmNoYW5nZU9uZSgnZmFyJywgVVJJLnBhcnNlKCdzb21lOnRoaW5nJyksIFtkYXRhXSk7XG5cdFx0Y29uc3QgbWFya2VyID0gc2VydmljZS5yZWFkKHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgnc29tZTp0aGluZycpIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlci5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJbMF0uY29kZSwgJzAnKTtcblx0fSk7XG5cblx0dGVzdCgnbW9kZWxWZXJzaW9uSWQgaXMgcHJlc2VydmVkIG9uIElNYXJrZXIgd2hlbiBwcmVzZW50IGluIElNYXJrZXJEYXRhJywgKCkgPT4ge1xuXHRcdHNlcnZpY2UgPSBuZXcgbWFya2VyU2VydmljZS5NYXJrZXJTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vcGF0aC9maWxlLnRzJyk7XG5cblx0XHQvLyBUZXN0IHdpdGggbW9kZWxWZXJzaW9uSWQgcHJlc2VudFxuXHRcdGNvbnN0IGRhdGFXaXRoVmVyc2lvbjogSU1hcmtlckRhdGEgPSB7XG5cdFx0XHQuLi5yYW5kb21NYXJrZXJEYXRhKCksXG5cdFx0XHRtb2RlbFZlcnNpb25JZDogNDJcblx0XHR9O1xuXHRcdHNlcnZpY2UuY2hhbmdlT25lKCdvd25lcicsIHJlc291cmNlLCBbZGF0YVdpdGhWZXJzaW9uXSk7XG5cblx0XHRjb25zdCBtYXJrZXJzV2l0aFZlcnNpb24gPSBzZXJ2aWNlLnJlYWQoeyByZXNvdXJjZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1dpdGhWZXJzaW9uLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNXaXRoVmVyc2lvblswXS5tb2RlbFZlcnNpb25JZCwgNDIpO1xuXG5cdFx0Ly8gVGVzdCB3aXRob3V0IG1vZGVsVmVyc2lvbklkIChzaG91bGQgYmUgdW5kZWZpbmVkKVxuXHRcdGNvbnN0IGRhdGFXaXRob3V0VmVyc2lvbjogSU1hcmtlckRhdGEgPSByYW5kb21NYXJrZXJEYXRhKCk7XG5cdFx0c2VydmljZS5jaGFuZ2VPbmUoJ293bmVyJywgcmVzb3VyY2UsIFtkYXRhV2l0aG91dFZlcnNpb25dKTtcblxuXHRcdGNvbnN0IG1hcmtlcnNXaXRob3V0VmVyc2lvbiA9IHNlcnZpY2UucmVhZCh7IHJlc291cmNlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzV2l0aG91dFZlcnNpb24ubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1dpdGhvdXRWZXJzaW9uWzBdLm1vZGVsVmVyc2lvbklkLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvdXJjZSBmaWx0ZXIgaGlkZXMgbWFya2VycyBmb3IgdGhlIGZpbHRlcmVkIHJlc291cmNlJywgKCkgPT4ge1xuXHRcdHNlcnZpY2UgPSBuZXcgbWFya2VyU2VydmljZS5NYXJrZXJTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcmVzb3VyY2UxID0gVVJJLnBhcnNlKCdmaWxlOi8vL3BhdGgvZmlsZTEuY3MnKTtcblx0XHRjb25zdCByZXNvdXJjZTIgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vcGF0aC9maWxlMi5jcycpO1xuXG5cdFx0Ly8gQWRkIG1hcmtlcnMgdG8gYm90aCByZXNvdXJjZXNcblx0XHRzZXJ2aWNlLmNoYW5nZU9uZSgnb3duZXIxJywgcmVzb3VyY2UxLCBbcmFuZG9tTWFya2VyRGF0YSgpXSk7XG5cdFx0c2VydmljZS5jaGFuZ2VPbmUoJ293bmVyMScsIHJlc291cmNlMiwgW3JhbmRvbU1hcmtlckRhdGEoKV0pO1xuXG5cdFx0Ly8gVmVyaWZ5IGJvdGggcmVzb3VyY2VzIGhhdmUgbWFya2Vyc1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoKS5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyByZXNvdXJjZTogcmVzb3VyY2UxIH0pLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCh7IHJlc291cmNlOiByZXNvdXJjZTIgfSkubGVuZ3RoLCAxKTtcblxuXHRcdC8vIEluc3RhbGwgZmlsdGVyIGZvciByZXNvdXJjZTFcblx0XHRjb25zdCBmaWx0ZXIgPSBzZXJ2aWNlLmluc3RhbGxSZXNvdXJjZUZpbHRlcihyZXNvdXJjZTEsICdUZXN0IGZpbHRlcicpO1xuXG5cdFx0Ly8gVmVyaWZ5IHJlc291cmNlMSBtYXJrZXJzIGFyZSBmaWx0ZXJlZCBvdXQsIGJ1dCBoYXZlIDEgaW5mbyBtYXJrZXIgaW5zdGVhZFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoKS5sZW5ndGgsIDIpOyAvLyAxIHJlYWwgKyAxIGluZm9cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKHsgcmVzb3VyY2U6IHJlc291cmNlMSB9KS5sZW5ndGgsIDEpOyAvLyAxIGluZm9cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKHsgcmVzb3VyY2U6IHJlc291cmNlMiB9KS5sZW5ndGgsIDEpO1xuXG5cdFx0Ly8gRGlzcG9zZSBmaWx0ZXJcblx0XHRmaWx0ZXIuZGlzcG9zZSgpO1xuXG5cdFx0Ly8gVmVyaWZ5IHJlc291cmNlMSBtYXJrZXJzIGFyZSB2aXNpYmxlIGFnYWluXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCgpLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCh7IHJlc291cmNlOiByZXNvdXJjZTEgfSkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKHsgcmVzb3VyY2U6IHJlc291cmNlMiB9KS5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvdXJjZSBmaWx0ZXIgaGlkZXMgbWFya2VycyBmb3IgdGhlIGZpbHRlcmVkIHJlc291cmNlIFVOTEVTUyBleHBsaWNpdCByZWFkJywgKCkgPT4ge1xuXHRcdHNlcnZpY2UgPSBuZXcgbWFya2VyU2VydmljZS5NYXJrZXJTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcmVzb3VyY2UxID0gVVJJLnBhcnNlKCdmaWxlOi8vL3BhdGgvZmlsZTEuY3MnKTtcblx0XHRjb25zdCByZXNvdXJjZTIgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vcGF0aC9maWxlMi5jcycpO1xuXG5cdFx0Ly8gQWRkIG1hcmtlcnMgdG8gYm90aCByZXNvdXJjZXNcblx0XHRzZXJ2aWNlLmNoYW5nZU9uZSgnb3duZXIxJywgcmVzb3VyY2UxLCBbcmFuZG9tTWFya2VyRGF0YSgpXSk7XG5cdFx0c2VydmljZS5jaGFuZ2VPbmUoJ293bmVyMScsIHJlc291cmNlMiwgW3JhbmRvbU1hcmtlckRhdGEoKV0pO1xuXG5cdFx0Ly8gVmVyaWZ5IGJvdGggcmVzb3VyY2VzIGhhdmUgbWFya2Vyc1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoKS5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyByZXNvdXJjZTogcmVzb3VyY2UxIH0pLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCh7IHJlc291cmNlOiByZXNvdXJjZTIgfSkubGVuZ3RoLCAxKTtcblxuXHRcdC8vIEluc3RhbGwgZmlsdGVyIGZvciByZXNvdXJjZTFcblx0XHRjb25zdCBmaWx0ZXIgPSBzZXJ2aWNlLmluc3RhbGxSZXNvdXJjZUZpbHRlcihyZXNvdXJjZTEsICdUZXN0IGZpbHRlcicpO1xuXG5cdFx0Ly8gVmVyaWZ5IHJlc291cmNlMSBtYXJrZXJzIGFyZSBmaWx0ZXJlZCBvdXQsIGJ1dCBoYXZlIDEgaW5mbyBtYXJrZXIgaW5zdGVhZFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoKS5sZW5ndGgsIDIpOyAvLyAxIHJlYWwgKyAxIGluZm9cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKHsgcmVzb3VyY2U6IHJlc291cmNlMSB9KS5sZW5ndGgsIDEpOyAvLyAxIGluZm9cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKHsgcmVzb3VyY2U6IHJlc291cmNlMiB9KS5sZW5ndGgsIDEpO1xuXG5cdFx0Ly8gVmVyaWZ5IHJlc291cmNlMSBtYXJrZXJzIGFyZSB2aXNpYmxlIGFnYWluXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCh7IGlnbm9yZVJlc291cmNlRmlsdGVyczogdHJ1ZSB9KS5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyByZXNvdXJjZTogcmVzb3VyY2UxLCBpZ25vcmVSZXNvdXJjZUZpbHRlcnM6IHRydWUgfSkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKHsgcmVzb3VyY2U6IHJlc291cmNlMSwgaWdub3JlUmVzb3VyY2VGaWx0ZXJzOiB0cnVlIH0pWzBdLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5FcnJvcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCh7IHJlc291cmNlOiByZXNvdXJjZTIsIGlnbm9yZVJlc291cmNlRmlsdGVyczogdHJ1ZSB9KS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyByZXNvdXJjZTogcmVzb3VyY2UyLCBpZ25vcmVSZXNvdXJjZUZpbHRlcnM6IHRydWUgfSlbMF0uc2V2ZXJpdHksIE1hcmtlclNldmVyaXR5LkVycm9yKTtcblxuXHRcdC8vIERpc3Bvc2UgZmlsdGVyXG5cdFx0ZmlsdGVyLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb3VyY2UgZmlsdGVyIGFmZmVjdHMgYWxsIGZpbHRlciBjb21iaW5hdGlvbnMnLCAoKSA9PiB7XG5cdFx0c2VydmljZSA9IG5ldyBtYXJrZXJTZXJ2aWNlLk1hcmtlclNlcnZpY2UoKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5wYXJzZSgnZmlsZTovLy9wYXRoL2ZpbGUuY3MnKTtcblxuXHRcdHNlcnZpY2UuY2hhbmdlT25lKCdvd25lcjEnLCByZXNvdXJjZSwgW3JhbmRvbU1hcmtlckRhdGEoTWFya2VyU2V2ZXJpdHkuRXJyb3IpXSk7XG5cdFx0c2VydmljZS5jaGFuZ2VPbmUoJ293bmVyMicsIHJlc291cmNlLCBbcmFuZG9tTWFya2VyRGF0YShNYXJrZXJTZXZlcml0eS5XYXJuaW5nKV0pO1xuXG5cdFx0Ly8gVmVyaWZ5IGluaXRpYWwgc3RhdGVcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKCkubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKHsgcmVzb3VyY2UgfSkubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKHsgb3duZXI6ICdvd25lcjEnIH0pLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCh7IG93bmVyOiAnb3duZXIyJyB9KS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyBvd25lcjogJ293bmVyMScsIHJlc291cmNlIH0pLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCh7IHNldmVyaXRpZXM6IE1hcmtlclNldmVyaXR5LkVycm9yIH0pLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCh7IHNldmVyaXRpZXM6IE1hcmtlclNldmVyaXR5Lldhcm5pbmcgfSkubGVuZ3RoLCAxKTtcblxuXHRcdC8vIEluc3RhbGwgZmlsdGVyXG5cdFx0Y29uc3QgZmlsdGVyID0gc2VydmljZS5pbnN0YWxsUmVzb3VyY2VGaWx0ZXIocmVzb3VyY2UsICdGaWx0ZXIgcmVhc29uJyk7XG5cblx0XHQvLyBWZXJpZnkgaW5mb3JtYXRpb24gbWFya2VyIGlzIHNob3duIGZvciByZXNvdXJjZSBxdWVyaWVzXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCgpLmxlbmd0aCwgMSk7IC8vIDEgaW5mbyBtYXJrZXJcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKHsgcmVzb3VyY2UgfSkubGVuZ3RoLCAxKTsgLy8gMSBpbmZvIG1hcmtlclxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyBvd25lcjogJ293bmVyMScgfSkubGVuZ3RoLCAxKTsgLy8gMSBpbmZvIG1hcmtlclxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyBvd25lcjogJ293bmVyMicgfSkubGVuZ3RoLCAxKTsgLy8gMSBpbmZvIG1hcmtlclxuXG5cdFx0Ly8gVmVyaWZ5IG93bmVyK3Jlc291cmNlIHF1ZXJ5IHJldHVybnMgYW4gaW5mbyBtYXJrZXIgZm9yIGZpbHRlcmVkIHJlc291cmNlc1xuXHRcdGNvbnN0IG93bmVyUmVzb3VyY2VNYXJrZXJzID0gc2VydmljZS5yZWFkKHsgb3duZXI6ICdvd25lcjEnLCByZXNvdXJjZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3duZXJSZXNvdXJjZU1hcmtlcnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3duZXJSZXNvdXJjZU1hcmtlcnNbMF0uc2V2ZXJpdHksIE1hcmtlclNldmVyaXR5LkluZm8pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvd25lclJlc291cmNlTWFya2Vyc1swXS5vd25lciwgJ21hcmtlcnNGaWx0ZXInKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyBzZXZlcml0aWVzOiBNYXJrZXJTZXZlcml0eS5FcnJvciB9KS5sZW5ndGgsIDEpOyAvLyAxIGluZm8gbWFya2VyXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCh7IHNldmVyaXRpZXM6IE1hcmtlclNldmVyaXR5Lldhcm5pbmcgfSkubGVuZ3RoLCAxKTsgLy8gMSBpbmZvIG1hcmtlclxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyBzZXZlcml0aWVzOiBNYXJrZXJTZXZlcml0eS5JbmZvIH0pLmxlbmd0aCwgMSk7IC8vIE91ciBpbmZvIG1hcmtlclxuXG5cdFx0Ly8gUmVtb3ZlIGZpbHRlciBhbmQgdmVyaWZ5IG1hcmtlcnMgYXJlIHZpc2libGUgYWdhaW5cblx0XHRmaWx0ZXIuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoKS5sZW5ndGgsIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aXBsZSBmaWx0ZXJzIGZvciBzYW1lIHJlc291cmNlIGFyZSBoYW5kbGVkIGNvcnJlY3RseScsICgpID0+IHtcblx0XHRzZXJ2aWNlID0gbmV3IG1hcmtlclNlcnZpY2UuTWFya2VyU2VydmljZSgpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLnBhcnNlKCdmaWxlOi8vL3BhdGgvZmlsZS5jcycpO1xuXG5cdFx0Ly8gQWRkIG1hcmtlciB0byByZXNvdXJjZVxuXHRcdHNlcnZpY2UuY2hhbmdlT25lKCdvd25lcjEnLCByZXNvdXJjZSwgW3JhbmRvbU1hcmtlckRhdGEoKV0pO1xuXG5cdFx0Ly8gVmVyaWZ5IHJlc291cmNlIGhhcyBtYXJrZXJzXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCgpLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCh7IHJlc291cmNlIH0pLmxlbmd0aCwgMSk7XG5cblx0XHQvLyBJbnN0YWxsIHR3byBmaWx0ZXJzIGZvciB0aGUgc2FtZSByZXNvdXJjZVxuXHRcdGNvbnN0IGZpbHRlcjEgPSBzZXJ2aWNlLmluc3RhbGxSZXNvdXJjZUZpbHRlcihyZXNvdXJjZSwgJ0ZpcnN0IGZpbHRlcicpO1xuXHRcdGNvbnN0IGZpbHRlcjIgPSBzZXJ2aWNlLmluc3RhbGxSZXNvdXJjZUZpbHRlcihyZXNvdXJjZSwgJ1NlY29uZCBmaWx0ZXInKTtcblxuXHRcdC8vIFZlcmlmeSByZXNvdXJjZSBtYXJrZXJzIGFyZSBmaWx0ZXJlZCBvdXQgYnV0IGluZm8gbWFya2VyIGlzIHNob3duXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCgpLmxlbmd0aCwgMSk7IC8vIDEgaW5mbyBtYXJrZXJcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKHsgcmVzb3VyY2UgfSkubGVuZ3RoLCAxKTsgLy8gMSBpbmZvIG1hcmtlclxuXG5cdFx0Ly8gRGlzcG9zZSBvbmx5IG9uZSBmaWx0ZXJcblx0XHRmaWx0ZXIxLmRpc3Bvc2UoKTtcblxuXHRcdC8vIFZlcmlmeSByZXNvdXJjZSBtYXJrZXJzIGFyZSBzdGlsbCBmaWx0ZXJlZCBvdXQgYmVjYXVzZSBvbmUgZmlsdGVyIHJlbWFpbnNcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKCkubGVuZ3RoLCAxKTsgLy8gc3RpbGwgMSBpbmZvIG1hcmtlclxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyByZXNvdXJjZSB9KS5sZW5ndGgsIDEpOyAvLyBzdGlsbCAxIGluZm8gbWFya2VyXG5cblx0XHQvLyBEaXNwb3NlIHRoZSBzZWNvbmQgZmlsdGVyXG5cdFx0ZmlsdGVyMi5kaXNwb3NlKCk7XG5cblx0XHQvLyBOb3cgYWxsIGZpbHRlcnMgYXJlIGdvbmUsIHNvIG1hcmtlcnMgc2hvdWxkIGJlIHZpc2libGUgYWdhaW5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKCkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKHsgcmVzb3VyY2UgfSkubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb3VyY2UgZmlsdGVyIHdpdGggcmVhc29uIHNob3dzIGluZm8gbWFya2VyIHdoZW4gbWFya2VycyBhcmUgZmlsdGVyZWQnLCAoKSA9PiB7XG5cdFx0c2VydmljZSA9IG5ldyBtYXJrZXJTZXJ2aWNlLk1hcmtlclNlcnZpY2UoKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5wYXJzZSgnZmlsZTovLy9wYXRoL2ZpbGUuY3MnKTtcblxuXHRcdC8vIEFkZCBlcnJvciBhbmQgd2FybmluZyB0byB0aGUgcmVzb3VyY2Vcblx0XHRzZXJ2aWNlLmNoYW5nZU9uZSgnb3duZXIxJywgcmVzb3VyY2UsIFtcblx0XHRcdHJhbmRvbU1hcmtlckRhdGEoTWFya2VyU2V2ZXJpdHkuRXJyb3IpLFxuXHRcdFx0cmFuZG9tTWFya2VyRGF0YShNYXJrZXJTZXZlcml0eS5XYXJuaW5nKVxuXHRcdF0pO1xuXG5cdFx0Ly8gVmVyaWZ5IGluaXRpYWwgc3RhdGVcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKCkubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKHsgcmVzb3VyY2UgfSkubGVuZ3RoLCAyKTtcblxuXHRcdC8vIEFwcGx5IGEgZmlsdGVyIHdpdGggcmVhc29uXG5cdFx0Y29uc3QgZmlsdGVyUmVhc29uID0gJ1Rlc3QgZmlsdGVyIHJlYXNvbic7XG5cdFx0Y29uc3QgZmlsdGVyID0gc2VydmljZS5pbnN0YWxsUmVzb3VyY2VGaWx0ZXIocmVzb3VyY2UsIGZpbHRlclJlYXNvbik7XG5cblx0XHQvLyBWZXJpZnkgdGhhdCB3ZSBnZXQgYSBzaW5nbGUgaW5mbyBtYXJrZXIgd2l0aCBvdXIgcmVhc29uXG5cdFx0Y29uc3QgbWFya2VycyA9IHNlcnZpY2UucmVhZCh7IHJlc291cmNlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0uc2V2ZXJpdHksIE1hcmtlclNldmVyaXR5LkluZm8pO1xuXHRcdGFzc2VydC5vayhtYXJrZXJzWzBdLm1lc3NhZ2UuaW5jbHVkZXMoZmlsdGVyUmVhc29uKSk7XG5cblx0XHQvLyBSZW1vdmUgZmlsdGVyIGFuZCB2ZXJpZnkgdGhlIG9yaWdpbmFsIG1hcmtlcnMgYXJlIGJhY2tcblx0XHRmaWx0ZXIuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyByZXNvdXJjZSB9KS5sZW5ndGgsIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkaW5nIGFsbCBtYXJrZXJzIHNob3dzIGluZm8gbWFya2VyIGZvciBmaWx0ZXJlZCByZXNvdXJjZXMnLCAoKSA9PiB7XG5cdFx0c2VydmljZSA9IG5ldyBtYXJrZXJTZXJ2aWNlLk1hcmtlclNlcnZpY2UoKTtcblx0XHRjb25zdCByZXNvdXJjZTEgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vcGF0aC9maWxlMS5jcycpO1xuXHRcdGNvbnN0IHJlc291cmNlMiA9IFVSSS5wYXJzZSgnZmlsZTovLy9wYXRoL2ZpbGUyLmNzJyk7XG5cblx0XHQvLyBBZGQgbWFya2VycyB0byBib3RoIHJlc291cmNlc1xuXHRcdHNlcnZpY2UuY2hhbmdlT25lKCdvd25lcjEnLCByZXNvdXJjZTEsIFtyYW5kb21NYXJrZXJEYXRhKCldKTtcblx0XHRzZXJ2aWNlLmNoYW5nZU9uZSgnb3duZXIxJywgcmVzb3VyY2UyLCBbcmFuZG9tTWFya2VyRGF0YSgpXSk7XG5cblx0XHQvLyBWZXJpZnkgaW5pdGlhbCBzdGF0ZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoKS5sZW5ndGgsIDIpO1xuXG5cdFx0Ly8gRmlsdGVyIG9uZSByZXNvdXJjZSB3aXRoIGEgcmVhc29uXG5cdFx0Y29uc3QgZmlsdGVyUmVhc29uID0gJ1Jlc291cmNlIGlzIGJlaW5nIGVkaXRlZCc7XG5cdFx0Y29uc3QgZmlsdGVyID0gc2VydmljZS5pbnN0YWxsUmVzb3VyY2VGaWx0ZXIocmVzb3VyY2UxLCBmaWx0ZXJSZWFzb24pO1xuXG5cdFx0Ly8gUmVhZCBhbGwgbWFya2Vyc1xuXHRcdGNvbnN0IGFsbE1hcmtlcnMgPSBzZXJ2aWNlLnJlYWQoKTtcblxuXHRcdC8vIFNob3VsZCBoYXZlIDIgbWFya2VycyAtIG9uZSByZWFsIG1hcmtlciBhbmQgb25lIGluZm8gbWFya2VyXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFsbE1hcmtlcnMubGVuZ3RoLCAyKTtcblxuXHRcdC8vIEZpbmQgdGhlIGluZm8gbWFya2VyXG5cdFx0Y29uc3QgaW5mb01hcmtlciA9IGFsbE1hcmtlcnMuZmluZChtYXJrZXIgPT5cblx0XHRcdG1hcmtlci5vd25lciA9PT0gJ21hcmtlcnNGaWx0ZXInICYmXG5cdFx0XHRtYXJrZXIuc2V2ZXJpdHkgPT09IE1hcmtlclNldmVyaXR5LkluZm9cblx0XHQpO1xuXG5cdFx0Ly8gVmVyaWZ5IHRoZSBpbmZvIG1hcmtlclxuXHRcdGFzc2VydC5vayhpbmZvTWFya2VyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5mb01hcmtlcj8ucmVzb3VyY2UudG9TdHJpbmcoKSwgcmVzb3VyY2UxLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5vayhpbmZvTWFya2VyPy5tZXNzYWdlLmluY2x1ZGVzKGZpbHRlclJlYXNvbikpO1xuXG5cdFx0Ly8gUmVtb3ZlIGZpbHRlclxuXHRcdGZpbHRlci5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ291dCBvZiBvcmRlciBmaWx0ZXIgZGlzcG9zYWwgd29ya3MgY29ycmVjdGx5JywgKCkgPT4ge1xuXHRcdHNlcnZpY2UgPSBuZXcgbWFya2VyU2VydmljZS5NYXJrZXJTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vcGF0aC9maWxlLmNzJyk7XG5cblx0XHQvLyBBZGQgbWFya2VyIHRvIHJlc291cmNlXG5cdFx0c2VydmljZS5jaGFuZ2VPbmUoJ293bmVyMScsIHJlc291cmNlLCBbcmFuZG9tTWFya2VyRGF0YSgpXSk7XG5cblx0XHQvLyBWZXJpZnkgcmVzb3VyY2UgaGFzIG1hcmtlcnNcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKCkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKHsgcmVzb3VyY2UgfSkubGVuZ3RoLCAxKTtcblxuXHRcdC8vIEluc3RhbGwgdGhyZWUgZmlsdGVycyBmb3IgdGhlIHNhbWUgcmVzb3VyY2Vcblx0XHRjb25zdCBmaWx0ZXIxID0gc2VydmljZS5pbnN0YWxsUmVzb3VyY2VGaWx0ZXIocmVzb3VyY2UsICdGaXJzdCBmaWx0ZXInKTtcblx0XHRjb25zdCBmaWx0ZXIyID0gc2VydmljZS5pbnN0YWxsUmVzb3VyY2VGaWx0ZXIocmVzb3VyY2UsICdTZWNvbmQgZmlsdGVyJyk7XG5cdFx0Y29uc3QgZmlsdGVyMyA9IHNlcnZpY2UuaW5zdGFsbFJlc291cmNlRmlsdGVyKHJlc291cmNlLCAnVGhpcmQgZmlsdGVyJyk7XG5cblx0XHQvLyBWZXJpZnkgcmVzb3VyY2UgbWFya2VycyBhcmUgZmlsdGVyZWQgb3V0IGJ1dCBpbmZvIG1hcmtlciBpcyBzaG93blxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoKS5sZW5ndGgsIDEpOyAvLyAxIGluZm8gbWFya2VyXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCh7IHJlc291cmNlIH0pLmxlbmd0aCwgMSk7IC8vIDEgaW5mbyBtYXJrZXJcblxuXHRcdC8vIERpc3Bvc2UgZmlsdGVycyBpbiBhIGRpZmZlcmVudCBvcmRlciB0aGFuIHRoZXkgd2VyZSBjcmVhdGVkXG5cdFx0ZmlsdGVyMi5kaXNwb3NlKCk7ICAvLyBSZW1vdmUgdGhlIHNlY29uZCBmaWx0ZXIgZmlyc3RcblxuXHRcdC8vIFZlcmlmeSByZXNvdXJjZSBtYXJrZXJzIGFyZSBzdGlsbCBmaWx0ZXJlZCBvdXQgd2l0aCAyIGZpbHRlcnMgcmVtYWluaW5nXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCgpLmxlbmd0aCwgMSk7IC8vIHN0aWxsIDEgaW5mbyBtYXJrZXJcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKHsgcmVzb3VyY2UgfSkubGVuZ3RoLCAxKTsgLy8gc3RpbGwgMSBpbmZvIG1hcmtlclxuXG5cdFx0Ly8gQ2hlY2sgaWYgbWVzc2FnZSBjb250YWlucyB0aGUgY29ycmVjdCBjb3VudCBvZiBmaWx0ZXJzXG5cdFx0Y29uc3QgbWFya2VycyA9IHNlcnZpY2UucmVhZCh7IHJlc291cmNlIH0pO1xuXHRcdGFzc2VydC5vayhtYXJrZXJzWzBdLm1lc3NhZ2UuaW5jbHVkZXMoJ1Byb2JsZW1zIGFyZSBwYXVzZWQgYmVjYXVzZScpKTtcblxuXHRcdC8vIFJlbW92ZSByZW1haW5pbmcgZmlsdGVycyBpbiBhbnkgb3JkZXJcblx0XHRmaWx0ZXIzLmRpc3Bvc2UoKTtcblx0XHRmaWx0ZXIxLmRpc3Bvc2UoKTtcblxuXHRcdC8vIE5vdyBhbGwgZmlsdGVycyBhcmUgZ29uZSwgc28gbWFya2VycyBzaG91bGQgYmUgdmlzaWJsZSBhZ2FpblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoKS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyByZXNvdXJjZSB9KS5sZW5ndGgsIDEpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFzQixzQkFBc0I7QUFDNUMsWUFBWSxtQkFBbUI7QUFFL0IsU0FBUyxpQkFBaUIsV0FBVyxlQUFlLE9BQW9CO0FBQ3ZFLFNBQU87QUFBQSxJQUNOO0FBQUEsSUFDQSxTQUFTLEtBQUssT0FBTyxFQUFFLFNBQVMsRUFBRTtBQUFBLElBQ2xDLGlCQUFpQjtBQUFBLElBQ2pCLGFBQWE7QUFBQSxJQUNiLGVBQWU7QUFBQSxJQUNmLFdBQVc7QUFBQSxFQUNaO0FBQ0Q7QUFFQSxNQUFNLGtCQUFrQixNQUFNO0FBRTdCLE1BQUk7QUFFSixXQUFTLFdBQVk7QUFDcEIsWUFBUSxRQUFRO0FBQUEsRUFDakIsQ0FBQztBQUVELDBDQUF3QztBQUV4QyxPQUFLLFNBQVMsTUFBTTtBQUVuQixjQUFVLElBQUksY0FBYyxjQUFjO0FBRTFDLFlBQVEsVUFBVSxPQUFPLENBQUM7QUFBQSxNQUN6QixVQUFVLElBQUksTUFBTSx3QkFBd0I7QUFBQSxNQUM1QyxRQUFRLGlCQUFpQixlQUFlLEtBQUs7QUFBQSxJQUM5QyxDQUFDLENBQUM7QUFFRixXQUFPLFlBQVksUUFBUSxLQUFLLEVBQUUsUUFBUSxDQUFDO0FBQzNDLFdBQU8sWUFBWSxRQUFRLEtBQUssRUFBRSxPQUFPLE1BQU0sQ0FBQyxFQUFFLFFBQVEsQ0FBQztBQUMzRCxXQUFPLFlBQVksUUFBUSxLQUFLLEVBQUUsVUFBVSxJQUFJLE1BQU0sd0JBQXdCLEVBQUUsQ0FBQyxFQUFFLFFBQVEsQ0FBQztBQUM1RixXQUFPLFlBQVksUUFBUSxLQUFLLEVBQUUsT0FBTyxPQUFPLFVBQVUsSUFBSSxNQUFNLHdCQUF3QixFQUFFLENBQUMsRUFBRSxRQUFRLENBQUM7QUFHMUcsWUFB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
