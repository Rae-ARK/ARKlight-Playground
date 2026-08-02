import * as assert from "assert";
import { Lazy } from "../../../../../../base/common/lazy.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { wrapTablesWithScrollable } from "../../../browser/widget/chatContentParts/chatMarkdownTableScrolling.js";
function buildContainer(tables) {
  const container = document.createElement("div");
  for (const rows of tables) {
    const table = document.createElement("table");
    rows.forEach((rowData, rowIndex) => {
      const section = rowIndex === 0 ? table.createTHead() : table.tBodies[0] ?? table.createTBody();
      const tr = section.insertRow();
      for (const text of rowData) {
        const cell = rowIndex === 0 ? document.createElement("th") : tr.insertCell();
        cell.textContent = text;
        if (rowIndex === 0) {
          tr.appendChild(cell);
        }
      }
    });
    container.appendChild(table);
  }
  return container;
}
suite("wrapTablesWithScrollable", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function wrap(container) {
    const layoutParticipants = /* @__PURE__ */ new Set();
    store.add(wrapTablesWithScrollable(container, new Lazy(() => layoutParticipants)));
    return { layoutParticipants };
  }
  test("replaces each table with a scroll wrapper in the DOM", () => {
    const container = buildContainer([[
      ["ID", "Name"],
      ["001", "Alice"]
    ]]);
    assert.strictEqual(container.children[0].tagName, "TABLE");
    wrap(container);
    const wrapper = container.children[0];
    assert.ok(
      wrapper.classList.contains("rendered-markdown-table-scroll-wrapper"),
      "outer node should have the scroll wrapper class"
    );
  });
  test("table is preserved inside the scroll wrapper", () => {
    const container = buildContainer([[["A", "BB"], ["C", "DD"]]]);
    wrap(container);
    const table = container.querySelector("table");
    assert.ok(table, "table should still exist in DOM");
    assert.ok(container.contains(table), "table should be inside container");
    assert.ok(!container.children[0].isSameNode(table), "table should not be a direct child anymore");
  });
  test("registers a layout participant for each table", () => {
    const container = buildContainer([
      [["H1", "H2"], ["a", "bb"]],
      [["X", "YY"], ["c", "dd"]]
    ]);
    const { layoutParticipants } = wrap(container);
    assert.strictEqual(layoutParticipants.size, 2, "one layout participant registered per table");
  });
  test("sets column min-width capped at 3ch", () => {
    const container = buildContainer([[
      ["ID", "Name"],
      ["001", "Alice"],
      ["002", "Longer Name"]
    ]]);
    wrap(container);
    const table = container.querySelector("table");
    assert.deepStrictEqual(
      Array.from(table.rows[0].cells).map((cell) => cell.style.minWidth),
      ["3ch", "3ch"]
    );
    assert.deepStrictEqual(
      Array.from(table.rows[1].cells).map((cell) => cell.style.minWidth),
      ["", ""]
    );
  });
  test("uses actual char count when below the 3ch cap", () => {
    const container = buildContainer([[["AB", "C"], ["DE", "F"]]]);
    wrap(container);
    const table = container.querySelector("table");
    assert.strictEqual(table.rows[0].cells[0].style.minWidth, "2ch");
    assert.strictEqual(table.rows[0].cells[1].style.minWidth, "");
  });
  test("does not set min-width on single-character columns", () => {
    const container = buildContainer([[["X", "hello"], ["Y", "world"]]]);
    wrap(container);
    const table = container.querySelector("table");
    assert.strictEqual(table.rows[0].cells[0].style.minWidth, "", "single-char column should have no min-width");
  });
  test("handles multiple tables independently", () => {
    const container = buildContainer([
      [["AB", "C"], ["DE", "F"]],
      [["X", "YYY"], ["Z", "WWW"]]
    ]);
    wrap(container);
    const tables = container.querySelectorAll("table");
    assert.strictEqual(tables.length, 2);
    assert.strictEqual(tables[0].rows[0].cells[0].style.minWidth, "2ch");
    assert.strictEqual(tables[0].rows[0].cells[1].style.minWidth, "");
    assert.strictEqual(tables[1].rows[0].cells[0].style.minWidth, "");
    assert.strictEqual(tables[1].rows[0].cells[1].style.minWidth, "3ch");
  });
  test("no-ops on a container with no tables", () => {
    const container = document.createElement("div");
    container.innerHTML = "<p>hello</p>";
    const { layoutParticipants } = wrap(container);
    assert.strictEqual(layoutParticipants.size, 0);
    assert.strictEqual(container.querySelector("table"), null);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3dpZGdldC9jaGF0TWFya2Rvd25UYWJsZVNjcm9sbGluZy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBMYXp5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGF6eS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IHdyYXBUYWJsZXNXaXRoU2Nyb2xsYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdE1hcmtkb3duVGFibGVTY3JvbGxpbmcuanMnO1xuXG4vKiogQnVpbGRzIGFuIEhUTUxFbGVtZW50IGNvbnRhaW5pbmcgb25lIG9yIG1vcmUgdGFibGVzIGZyb20gbWFya2Rvd24tc3R5bGUgMi1EIGFycmF5cy4gKi9cbmZ1bmN0aW9uIGJ1aWxkQ29udGFpbmVyKHRhYmxlczogc3RyaW5nW11bXVtdKTogSFRNTERpdkVsZW1lbnQge1xuXHRjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0Zm9yIChjb25zdCByb3dzIG9mIHRhYmxlcykge1xuXHRcdGNvbnN0IHRhYmxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndGFibGUnKTtcblx0XHRyb3dzLmZvckVhY2goKHJvd0RhdGEsIHJvd0luZGV4KSA9PiB7XG5cdFx0XHRjb25zdCBzZWN0aW9uID0gcm93SW5kZXggPT09IDBcblx0XHRcdFx0PyB0YWJsZS5jcmVhdGVUSGVhZCgpXG5cdFx0XHRcdDogKHRhYmxlLnRCb2RpZXNbMF0gPz8gdGFibGUuY3JlYXRlVEJvZHkoKSk7XG5cdFx0XHRjb25zdCB0ciA9IHNlY3Rpb24uaW5zZXJ0Um93KCk7XG5cdFx0XHRmb3IgKGNvbnN0IHRleHQgb2Ygcm93RGF0YSkge1xuXHRcdFx0XHRjb25zdCBjZWxsID0gcm93SW5kZXggPT09IDAgPyBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCd0aCcpIDogdHIuaW5zZXJ0Q2VsbCgpO1xuXHRcdFx0XHRjZWxsLnRleHRDb250ZW50ID0gdGV4dDtcblx0XHRcdFx0aWYgKHJvd0luZGV4ID09PSAwKSB7XG5cdFx0XHRcdFx0dHIuYXBwZW5kQ2hpbGQoY2VsbCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQodGFibGUpO1xuXHR9XG5cdHJldHVybiBjb250YWluZXI7XG59XG5cbnN1aXRlKCd3cmFwVGFibGVzV2l0aFNjcm9sbGFibGUnLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gd3JhcChjb250YWluZXI6IEhUTUxEaXZFbGVtZW50KTogeyBsYXlvdXRQYXJ0aWNpcGFudHM6IFNldDwoKSA9PiB2b2lkPiB9IHtcblx0XHRjb25zdCBsYXlvdXRQYXJ0aWNpcGFudHMgPSBuZXcgU2V0PCgpID0+IHZvaWQ+KCk7XG5cdFx0c3RvcmUuYWRkKHdyYXBUYWJsZXNXaXRoU2Nyb2xsYWJsZShjb250YWluZXIsIG5ldyBMYXp5KCgpID0+IGxheW91dFBhcnRpY2lwYW50cykpKTtcblx0XHRyZXR1cm4geyBsYXlvdXRQYXJ0aWNpcGFudHMgfTtcblx0fVxuXG5cdHRlc3QoJ3JlcGxhY2VzIGVhY2ggdGFibGUgd2l0aCBhIHNjcm9sbCB3cmFwcGVyIGluIHRoZSBET00nLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gYnVpbGRDb250YWluZXIoW1tcblx0XHRcdFsnSUQnLCAnTmFtZSddLFxuXHRcdFx0WycwMDEnLCAnQWxpY2UnXSxcblx0XHRdXSk7XG5cdFx0Ly8gQmVmb3JlOiBkaXJlY3QgY2hpbGQgaXMgPHRhYmxlPlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250YWluZXIuY2hpbGRyZW5bMF0udGFnTmFtZSwgJ1RBQkxFJyk7XG5cblx0XHR3cmFwKGNvbnRhaW5lcik7XG5cblx0XHQvLyBBZnRlcjogZGlyZWN0IGNoaWxkIGlzIHRoZSBtb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50IHdyYXBwZXJcblx0XHRjb25zdCB3cmFwcGVyID0gY29udGFpbmVyLmNoaWxkcmVuWzBdO1xuXHRcdGFzc2VydC5vayh3cmFwcGVyLmNsYXNzTGlzdC5jb250YWlucygncmVuZGVyZWQtbWFya2Rvd24tdGFibGUtc2Nyb2xsLXdyYXBwZXInKSxcblx0XHRcdCdvdXRlciBub2RlIHNob3VsZCBoYXZlIHRoZSBzY3JvbGwgd3JhcHBlciBjbGFzcycpO1xuXHR9KTtcblxuXHR0ZXN0KCd0YWJsZSBpcyBwcmVzZXJ2ZWQgaW5zaWRlIHRoZSBzY3JvbGwgd3JhcHBlcicsICgpID0+IHtcblx0XHRjb25zdCBjb250YWluZXIgPSBidWlsZENvbnRhaW5lcihbW1snQScsICdCQiddLCBbJ0MnLCAnREQnXV1dKTtcblx0XHR3cmFwKGNvbnRhaW5lcik7XG5cblx0XHQvLyBUaGUgdGFibGUgbXVzdCBzdGlsbCBiZSBpbiB0aGUgZG9jdW1lbnQsIG5lc3RlZCBpbnNpZGUgdGhlIHdyYXBwZXJcblx0XHRjb25zdCB0YWJsZSA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCd0YWJsZScpO1xuXHRcdGFzc2VydC5vayh0YWJsZSwgJ3RhYmxlIHNob3VsZCBzdGlsbCBleGlzdCBpbiBET00nKTtcblx0XHRhc3NlcnQub2soY29udGFpbmVyLmNvbnRhaW5zKHRhYmxlKSwgJ3RhYmxlIHNob3VsZCBiZSBpbnNpZGUgY29udGFpbmVyJyk7XG5cdFx0YXNzZXJ0Lm9rKCFjb250YWluZXIuY2hpbGRyZW5bMF0uaXNTYW1lTm9kZSh0YWJsZSksICd0YWJsZSBzaG91bGQgbm90IGJlIGEgZGlyZWN0IGNoaWxkIGFueW1vcmUnKTtcblx0fSk7XG5cblx0dGVzdCgncmVnaXN0ZXJzIGEgbGF5b3V0IHBhcnRpY2lwYW50IGZvciBlYWNoIHRhYmxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGJ1aWxkQ29udGFpbmVyKFtcblx0XHRcdFtbJ0gxJywgJ0gyJ10sIFsnYScsICdiYiddXSxcblx0XHRcdFtbJ1gnLCAnWVknXSwgWydjJywgJ2RkJ11dLFxuXHRcdF0pO1xuXHRcdGNvbnN0IHsgbGF5b3V0UGFydGljaXBhbnRzIH0gPSB3cmFwKGNvbnRhaW5lcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxheW91dFBhcnRpY2lwYW50cy5zaXplLCAyLCAnb25lIGxheW91dCBwYXJ0aWNpcGFudCByZWdpc3RlcmVkIHBlciB0YWJsZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXRzIGNvbHVtbiBtaW4td2lkdGggY2FwcGVkIGF0IDNjaCcsICgpID0+IHtcblx0XHRjb25zdCBjb250YWluZXIgPSBidWlsZENvbnRhaW5lcihbW1xuXHRcdFx0WydJRCcsICdOYW1lJ10sXG5cdFx0XHRbJzAwMScsICdBbGljZSddLFxuXHRcdFx0WycwMDInLCAnTG9uZ2VyIE5hbWUnXSxcblx0XHRdXSk7XG5cdFx0d3JhcChjb250YWluZXIpO1xuXG5cdFx0Y29uc3QgdGFibGUgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcigndGFibGUnKSE7XG5cdFx0Ly8gbWluLXdpZHRoIGlzIHNldCBvbmx5IG9uIHRoZSBmaXJzdCByb3c7IG90aGVyIHJvd3MgYXJlIHVudG91Y2hlZFxuXHRcdC8vIGNvbCAwIG1heCA9IDMgY2hhcnMgLT4gM2NoOyBjb2wgMSBtYXggPSAxMSBjaGFycyAtPiBjYXBwZWQgYXQgM2NoXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdEFycmF5LmZyb20odGFibGUucm93c1swXS5jZWxscykubWFwKGNlbGwgPT4gY2VsbC5zdHlsZS5taW5XaWR0aCksXG5cdFx0XHRbJzNjaCcsICczY2gnXVxuXHRcdCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdEFycmF5LmZyb20odGFibGUucm93c1sxXS5jZWxscykubWFwKGNlbGwgPT4gY2VsbC5zdHlsZS5taW5XaWR0aCksXG5cdFx0XHRbJycsICcnXVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgYWN0dWFsIGNoYXIgY291bnQgd2hlbiBiZWxvdyB0aGUgM2NoIGNhcCcsICgpID0+IHtcblx0XHRjb25zdCBjb250YWluZXIgPSBidWlsZENvbnRhaW5lcihbW1snQUInLCAnQyddLCBbJ0RFJywgJ0YnXV1dKTtcblx0XHR3cmFwKGNvbnRhaW5lcik7XG5cblx0XHRjb25zdCB0YWJsZSA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCd0YWJsZScpITtcblx0XHQvLyBjb2wgMCBtYXg9MiAtPiAyY2g7IGNvbCAxIG1heD0xIC0+IG5vIG1pbi13aWR0aFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YWJsZS5yb3dzWzBdLmNlbGxzWzBdLnN0eWxlLm1pbldpZHRoLCAnMmNoJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhYmxlLnJvd3NbMF0uY2VsbHNbMV0uc3R5bGUubWluV2lkdGgsICcnKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3Qgc2V0IG1pbi13aWR0aCBvbiBzaW5nbGUtY2hhcmFjdGVyIGNvbHVtbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gYnVpbGRDb250YWluZXIoW1tbJ1gnLCAnaGVsbG8nXSwgWydZJywgJ3dvcmxkJ11dXSk7XG5cdFx0d3JhcChjb250YWluZXIpO1xuXG5cdFx0Y29uc3QgdGFibGUgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcigndGFibGUnKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhYmxlLnJvd3NbMF0uY2VsbHNbMF0uc3R5bGUubWluV2lkdGgsICcnLCAnc2luZ2xlLWNoYXIgY29sdW1uIHNob3VsZCBoYXZlIG5vIG1pbi13aWR0aCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVzIG11bHRpcGxlIHRhYmxlcyBpbmRlcGVuZGVudGx5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGJ1aWxkQ29udGFpbmVyKFtcblx0XHRcdFtbJ0FCJywgJ0MnXSwgWydERScsICdGJ11dLFxuXHRcdFx0W1snWCcsICdZWVknXSwgWydaJywgJ1dXVyddXSxcblx0XHRdKTtcblx0XHR3cmFwKGNvbnRhaW5lcik7XG5cblx0XHRjb25zdCB0YWJsZXMgPSBjb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgndGFibGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFibGVzLmxlbmd0aCwgMik7XG5cblx0XHQvLyBUYWJsZSAxOiBjb2wgMCBtYXg9MiwgY29sIDEgbWF4PTEgLT4gb25seSBjb2wgMCBnZXRzIG1pbi13aWR0aFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YWJsZXNbMF0ucm93c1swXS5jZWxsc1swXS5zdHlsZS5taW5XaWR0aCwgJzJjaCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YWJsZXNbMF0ucm93c1swXS5jZWxsc1sxXS5zdHlsZS5taW5XaWR0aCwgJycpO1xuXG5cdFx0Ly8gVGFibGUgMjogY29sIDAgbWF4PTEsIGNvbCAxIG1heD0zIC0+IG9ubHkgY29sIDEgZ2V0cyBtaW4td2lkdGhcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFibGVzWzFdLnJvd3NbMF0uY2VsbHNbMF0uc3R5bGUubWluV2lkdGgsICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFibGVzWzFdLnJvd3NbMF0uY2VsbHNbMV0uc3R5bGUubWluV2lkdGgsICczY2gnKTtcblx0fSk7XG5cblx0dGVzdCgnbm8tb3BzIG9uIGEgY29udGFpbmVyIHdpdGggbm8gdGFibGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGNvbnRhaW5lci5pbm5lckhUTUwgPSAnPHA+aGVsbG88L3A+Jztcblx0XHRjb25zdCB7IGxheW91dFBhcnRpY2lwYW50cyB9ID0gd3JhcChjb250YWluZXIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXlvdXRQYXJ0aWNpcGFudHMuc2l6ZSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCd0YWJsZScpLCBudWxsKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksWUFBWTtBQUN4QixTQUFTLFlBQVk7QUFDckIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxnQ0FBZ0M7QUFHekMsU0FBUyxlQUFlLFFBQXNDO0FBQzdELFFBQU0sWUFBWSxTQUFTLGNBQWMsS0FBSztBQUM5QyxhQUFXLFFBQVEsUUFBUTtBQUMxQixVQUFNLFFBQVEsU0FBUyxjQUFjLE9BQU87QUFDNUMsU0FBSyxRQUFRLENBQUMsU0FBUyxhQUFhO0FB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
