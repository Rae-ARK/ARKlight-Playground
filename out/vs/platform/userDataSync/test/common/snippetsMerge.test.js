import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { merge } from "../../common/snippetsMerge.js";
const tsSnippet1 = `{

	// Place your snippets for TypeScript here. Each snippet is defined under a snippet name and has a prefix, body and
	// description. The prefix is what is used to trigger the snippet and the body will be expanded and inserted. Possible variables are:
	// $1, $2 for tab stops, $0 for the final cursor position, Placeholders with the
	// same ids are connected.
	"Print to console": {
	// Example:
	"prefix": "log",
		"body": [
			"console.log('$1');",
			"$2"
		],
			"description": "Log output to console",
	}

}`;
const tsSnippet2 = `{

	// Place your snippets for TypeScript here. Each snippet is defined under a snippet name and has a prefix, body and
	// description. The prefix is what is used to trigger the snippet and the body will be expanded and inserted. Possible variables are:
	// $1, $2 for tab stops, $0 for the final cursor position, Placeholders with the
	// same ids are connected.
	"Print to console": {
	// Example:
	"prefix": "log",
		"body": [
			"console.log('$1');",
			"$2"
		],
			"description": "Log output to console always",
	}

}`;
const htmlSnippet1 = `{
/*
	// Place your snippets for HTML here. Each snippet is defined under a snippet name and has a prefix, body and
	// description. The prefix is what is used to trigger the snippet and the body will be expanded and inserted.
	// Example:
	"Print to console": {
	"prefix": "log",
		"body": [
			"console.log('$1');",
			"$2"
		],
			"description": "Log output to console"
	}
*/
"Div": {
	"prefix": "div",
		"body": [
			"<div>",
			"",
			"</div>"
		],
			"description": "New div"
	}
}`;
const htmlSnippet2 = `{
/*
	// Place your snippets for HTML here. Each snippet is defined under a snippet name and has a prefix, body and
	// description. The prefix is what is used to trigger the snippet and the body will be expanded and inserted.
	// Example:
	"Print to console": {
	"prefix": "log",
		"body": [
			"console.log('$1');",
			"$2"
		],
			"description": "Log output to console"
	}
*/
"Div": {
	"prefix": "div",
		"body": [
			"<div>",
			"",
			"</div>"
		],
			"description": "New div changed"
	}
}`;
const cSnippet = `{
	// Place your snippets for c here. Each snippet is defined under a snippet name and has a prefix, body and
	// description. The prefix is what is used to trigger the snippet and the body will be expanded and inserted. Possible variables are:
	// $1, $2 for tab stops, $0 for the final cursor position.Placeholders with the
	// same ids are connected.
	// Example:
	"Print to console": {
	"prefix": "log",
		"body": [
			"console.log('$1');",
			"$2"
		],
			"description": "Log output to console"
	}
}`;
suite("SnippetsMerge", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("merge when local and remote are same with one snippet", async () => {
    const local = { "html.json": htmlSnippet1 };
    const remote = { "html.json": htmlSnippet1 };
    const actual = merge(local, remote, null);
    assert.deepStrictEqual(actual.local.added, {});
    assert.deepStrictEqual(actual.local.updated, {});
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.conflicts, []);
    assert.deepStrictEqual(actual.remote.added, {});
    assert.deepStrictEqual(actual.remote.updated, {});
    assert.deepStrictEqual(actual.remote.removed, []);
  });
  test("merge when local and remote are same with multiple entries", async () => {
    const local = { "html.json": htmlSnippet1, "typescript.json": tsSnippet1 };
    const remote = { "html.json": htmlSnippet1, "typescript.json": tsSnippet1 };
    const actual = merge(local, remote, null);
    assert.deepStrictEqual(actual.local.added, {});
    assert.deepStrictEqual(actual.local.updated, {});
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.conflicts, []);
    assert.deepStrictEqual(actual.remote.added, {});
    assert.deepStrictEqual(actual.remote.updated, {});
    assert.deepStrictEqual(actual.remote.removed, []);
  });
  test("merge when local and remote are same with multiple entries in different order", async () => {
    const local = { "typescript.json": tsSnippet1, "html.json": htmlSnippet1 };
    const remote = { "html.json": htmlSnippet1, "typescript.json": tsSnippet1 };
    const actual = merge(local, remote, null);
    assert.deepStrictEqual(actual.local.added, {});
    assert.deepStrictEqual(actual.local.updated, {});
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.conflicts, []);
    assert.deepStrictEqual(actual.remote.added, {});
    assert.deepStrictEqual(actual.remote.updated, {});
    assert.deepStrictEqual(actual.remote.removed, []);
  });
  test("merge when local and remote are same with different base content", async () => {
    const local = { "html.json": htmlSnippet1, "typescript.json": tsSnippet1 };
    const remote = { "html.json": htmlSnippet1, "typescript.json": tsSnippet1 };
    const base = { "html.json": htmlSnippet2, "typescript.json": tsSnippet2 };
    const actual = merge(local, remote, base);
    assert.deepStrictEqual(actual.local.added, {});
    assert.deepStrictEqual(actual.local.updated, {});
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.conflicts, []);
    assert.deepStrictEqual(actual.remote.added, {});
    assert.deepStrictEqual(actual.remote.updated, {});
    assert.deepStrictEqual(actual.remote.removed, []);
  });
  test("merge when a new entry is added to remote", async () => {
    const local = { "html.json": htmlSnippet1 };
    const remote = { "html.json": htmlSnippet1, "typescript.json": tsSnippet1 };
    const actual = merge(local, remote, null);
    assert.deepStrictEqual(actual.local.added, { "typescript.json": tsSnippet1 });
    assert.deepStrictEqual(actual.local.updated, {});
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.conflicts, []);
    assert.deepStrictEqual(actual.remote.added, {});
    assert.deepStrictEqual(actual.remote.updated, {});
    assert.deepStrictEqual(actual.remote.removed, []);
  });
  test("merge when multiple new entries are added to remote", async () => {
    const local = {};
    const remote = { "html.json": htmlSnippet1, "typescript.json": tsSnippet1 };
    const actual = merge(local, remote, null);
    assert.deepStrictEqual(actual.local.added, remote);
    assert.deepStrictEqual(actual.local.updated, {});
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.conflicts, []);
    assert.deepStrictEqual(actual.remote.added, {});
    assert.deepStrictEqual(actual.remote.updated, {});
    assert.deepStrictEqual(actual.remote.removed, []);
  });
  test("merge when new entry is added to remote from base and local has not changed", async () => {
    const local = { "html.json": htmlSnippet1 };
    const remote = { "html.json": htmlSnippet1, "typescript.json": tsSnippet1 };
    const actual = merge(local, remote, local);
    assert.deepStrictEqual(actual.local.added, { "typescript.json": tsSnippet1 });
    assert.deepStrictEqual(actual.local.updated, {});
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.conflicts, []);
    assert.deepStrictEqual(actual.remote.added, {});
    assert.deepStrictEqual(actual.remote.updated, {});
    assert.deepStrictEqual(actual.remote.removed, []);
  });
  test("merge when an entry is removed from remote from base and local has not changed", async () => {
    const local = { "html.json": htmlSnippet1, "typescript.json": tsSnippet1 };
    const remote = { "html.json": htmlSnippet1 };
    const actual = merge(local, remote, local);
    assert.deepStrictEqual(actual.local.added, {});
    assert.deepStrictEqual(actual.local.updated, {});
    assert.deepStrictEqual(actual.local.removed, ["typescript.json"]);
    assert.deepStrictEqual(actual.conflicts, []);
    assert.deepStrictEqual(actual.remote.added, {});
    assert.deepStrictEqual(actual.remote.updated, {});
    assert.deepStrictEqual(actual.remote.removed, []);
  });
  test("merge when all entries are removed from base and local has not changed", async () => {
    const local = { "html.json": htmlSnippet1, "typescript.json": tsSnippet1 };
    const remote = {};
    const actual = merge(local, remote, local);
    assert.deepStrictEqual(actual.local.added, {});
    assert.deepStrictEqual(actual.local.updated, {});
    assert.deepStrictEqual(actual.local.removed, ["html.json", "typescript.json"]);
    assert.deepStrictEqual(actual.conflicts, []);
    assert.deepStrictEqual(actual.remote.added, {});
    assert.deepStrictEqual(actual.remote.updated, {});
    assert.deepStrictEqual(actual.remote.removed, []);
  });
  test("merge when an entry is updated in remote from base and local has not changed", async () => {
    const local = { "html.json": htmlSnippet1 };
    const remote = { "html.json": htmlSnippet2 };
    const actual = merge(local, remote, local);
    assert.deepStrictEqual(actual.local.added, {});
    assert.deepStrictEqual(actual.local.updated, { "html.json": htmlSnippet2 });
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.conflicts, []);
    assert.deepStrictEqual(actual.remote.added, {});
    assert.deepStrictEqual(actual.remote.updated, {});
    assert.deepStrictEqual(actual.remote.removed, []);
  });
  test("merge when remote has moved forwarded with multiple changes and local stays with base", async () => {
    const local = { "html.json": htmlSnippet1, "typescript.json": tsSnippet1 };
    const remote = { "html.json": htmlSnippet2, "c.json": cSnippet };
    const actual = merge(local, remote, local);
    assert.deepStrictEqual(actual.local.added, { "c.json": cSnippet });
    assert.deepStrictEqual(actual.local.updated, { "html.json": htmlSnippet2 });
    assert.deepStrictEqual(actual.local.removed, ["typescript.json"]);
    assert.deepStrictEqual(actual.conflicts, []);
    assert.deepStrictEqual(actual.remote.added, {});
    assert.deepStrictEqual(actual.remote.updated, {});
    assert.deepStrictEqual(actual.remote.removed, []);
  });
  test("merge when a new entries are added to local", async () => {
    const local = { "html.json": htmlSnippet1, "typescript.json": tsSnippet1, "c.json": cSnippet };
    const remote = { "html.json": htmlSnippet1, "typescript.json": tsSnippet1 };
    const actual = merge(local, remote, null);
    assert.deepStrictEqual(actual.local.added, {});
    assert.deepStrictEqual(actual.local.updated, {});
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.conflicts, []);
    assert.deepStrictEqual(actual.remote.added, { "c.json": cSnippet });
    assert.deepStrictEqual(actual.remote.updated, {});
    assert.deepStrictEqual(actual.remote.removed, []);
  });
  test("merge when multiple new entries are added to local from base and remote is not changed", async () => {
    const local = { "html.json": htmlSnippet1, "typescript.json": tsSnippet1, "c.json": cSnippet };
    const remote = { "typescript.json": tsSnippet1 };
    const actual = merge(local, remote, remote);
    assert.deepStrictEqual(actual.local.added, {});
    assert.deepStrictEqual(actual.local.updated, {});
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.conflicts, []);
    assert.deepStrictEqual(actual.remote.added, { "html.json": htmlSnippet1, "c.json": cSnippet });
    assert.deepStrictEqual(actual.remote.updated, {});
    assert.deepStrictEqual(actual.remote.removed, []);
  });
  test("merge when an entry is removed from local from base and remote has not changed", async () => {
    const local = { "html.json": htmlSnippet1 };
    const remote = { "html.json": htmlSnippet1, "typescript.json": tsSnippet1 };
    const actual = merge(local, remote, remote);
    assert.deepStrictEqual(actual.local.added, {});
    assert.deepStrictEqual(actual.local.updated, {});
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.conflicts, []);
    assert.deepStrictEqual(actual.remote.added, {});
    assert.deepStrictEqual(actual.remote.updated, {});
    assert.deepStrictEqual(actual.remote.removed, ["typescript.json"]);
  });
  test("merge when an entry is updated in local from base and remote has not changed", async () => {
    const local = { "html.json": htmlSnippet2, "typescript.json": tsSnippet1 };
    const remote = { "html.json": htmlSnippet1, "typescript.json": tsSnippet1 };
    const actual = merge(local, remote, remote);
    assert.deepStrictEqual(actual.local.added, {});
    assert.deepStrictEqual(actual.local.updated, {});
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.conflicts, []);
    assert.deepStrictEqual(actual.remote.added, {});
    assert.deepStrictEqual(actual.remote.updated, { "html.json": htmlSnippet2 });
    assert.deepStrictEqual(actual.remote.removed, []);
  });
  test("merge when local has moved forwarded with multiple changes and remote stays with base", async () => {
    const local = { "html.json": htmlSnippet2, "c.json": cSnippet };
    const remote = { "html.json": htmlSnippet1, "typescript.json": tsSnippet1 };
    const actual = merge(local, remote, remote);
    assert.deepStrictEqual(actual.local.added, {});
    assert.deepStrictEqual(actual.local.updated, {});
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.conflicts, []);
    assert.deepStrictEqual(actual.remote.added, { "c.json": cSnippet });
    assert.deepStrictEqual(actual.remote.updated, { "html.json": htmlSnippet2 });
    assert.deepStrictEqual(actual.remote.removed, ["typescript.json"]);
  });
  test("merge when local and remote with one entry but different value", async () => {
    const local = { "html.json": htmlSnippet1 };
    const remote = { "html.json": htmlSnippet2 };
    const actual = merge(local, remote, null);
    assert.deepStrictEqual(actual.local.added, {});
    assert.deepStrictEqual(actual.local.updated, {});
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.conflicts, ["html.json"]);
    assert.deepStrictEqual(actual.remote.added, {});
    assert.deepStrictEqual(actual.remote.updated, {});
    assert.deepStrictEqual(actual.remote.removed, []);
  });
  test("merge when the entry is removed in remote but updated in local and a new entry is added in remote", async () => {
    const base = { "html.json": htmlSnippet1 };
    const local = { "html.json": htmlSnippet2 };
    const remote = { "typescript.json": tsSnippet1 };
    const actual = merge(local, remote, base);
    assert.deepStrictEqual(actual.local.added, { "typescript.json": tsSnippet1 });
    assert.deepStrictEqual(actual.local.updated, {});
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.conflicts, ["html.json"]);
    assert.deepStrictEqual(actual.remote.added, {});
    assert.deepStrictEqual(actual.remote.updated, {});
    assert.deepStrictEqual(actual.remote.removed, []);
  });
  test("merge with single entry and local is empty", async () => {
    const base = { "html.json": htmlSnippet1 };
    const local = {};
    const remote = { "html.json": htmlSnippet2 };
    const actual = merge(local, remote, base);
    assert.deepStrictEqual(actual.local.added, { "html.json": htmlSnippet2 });
    assert.deepStrictEqual(actual.local.updated, {});
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.conflicts, []);
    assert.deepStrictEqual(actual.remote.added, {});
    assert.deepStrictEqual(actual.remote.updated, {});
    assert.deepStrictEqual(actual.remote.removed, []);
  });
  test("merge when local and remote has moved forwareded with conflicts", async () => {
    const base = { "html.json": htmlSnippet1, "typescript.json": tsSnippet1 };
    const local = { "html.json": htmlSnippet2, "c.json": cSnippet };
    const remote = { "typescript.json": tsSnippet2 };
    const actual = merge(local, remote, base);
    assert.deepStrictEqual(actual.local.added, { "typescript.json": tsSnippet2 });
    assert.deepStrictEqual(actual.local.updated, {});
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.conflicts, ["html.json"]);
    assert.deepStrictEqual(actual.remote.added, { "c.json": cSnippet });
    assert.deepStrictEqual(actual.remote.updated, {});
    assert.deepStrictEqual(actual.remote.removed, []);
  });
  test("merge when local and remote has moved forwareded with multiple conflicts", async () => {
    const base = { "html.json": htmlSnippet1, "typescript.json": tsSnippet1 };
    const local = { "html.json": htmlSnippet2, "typescript.json": tsSnippet2, "c.json": cSnippet };
    const remote = { "c.json": cSnippet };
    const actual = merge(local, remote, base);
    assert.deepStrictEqual(actual.local.added, {});
    assert.deepStrictEqual(actual.local.updated, {});
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.conflicts, ["html.json", "typescript.json"]);
    assert.deepStrictEqual(actual.remote.added, {});
    assert.deepStrictEqual(actual.remote.updated, {});
    assert.deepStrictEqual(actual.remote.removed, []);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3VzZXJEYXRhU3luYy90ZXN0L2NvbW1vbi9zbmlwcGV0c01lcmdlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IG1lcmdlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3NuaXBwZXRzTWVyZ2UuanMnO1xuXG5jb25zdCB0c1NuaXBwZXQxID0gYHtcblxuXHQvLyBQbGFjZSB5b3VyIHNuaXBwZXRzIGZvciBUeXBlU2NyaXB0IGhlcmUuIEVhY2ggc25pcHBldCBpcyBkZWZpbmVkIHVuZGVyIGEgc25pcHBldCBuYW1lIGFuZCBoYXMgYSBwcmVmaXgsIGJvZHkgYW5kXG5cdC8vIGRlc2NyaXB0aW9uLiBUaGUgcHJlZml4IGlzIHdoYXQgaXMgdXNlZCB0byB0cmlnZ2VyIHRoZSBzbmlwcGV0IGFuZCB0aGUgYm9keSB3aWxsIGJlIGV4cGFuZGVkIGFuZCBpbnNlcnRlZC4gUG9zc2libGUgdmFyaWFibGVzIGFyZTpcblx0Ly8gJDEsICQyIGZvciB0YWIgc3RvcHMsICQwIGZvciB0aGUgZmluYWwgY3Vyc29yIHBvc2l0aW9uLCBQbGFjZWhvbGRlcnMgd2l0aCB0aGVcblx0Ly8gc2FtZSBpZHMgYXJlIGNvbm5lY3RlZC5cblx0XCJQcmludCB0byBjb25zb2xlXCI6IHtcblx0Ly8gRXhhbXBsZTpcblx0XCJwcmVmaXhcIjogXCJsb2dcIixcblx0XHRcImJvZHlcIjogW1xuXHRcdFx0XCJjb25zb2xlLmxvZygnJDEnKTtcIixcblx0XHRcdFwiJDJcIlxuXHRcdF0sXG5cdFx0XHRcImRlc2NyaXB0aW9uXCI6IFwiTG9nIG91dHB1dCB0byBjb25zb2xlXCIsXG5cdH1cblxufWA7XG5cbmNvbnN0IHRzU25pcHBldDIgPSBge1xuXG5cdC8vIFBsYWNlIHlvdXIgc25pcHBldHMgZm9yIFR5cGVTY3JpcHQgaGVyZS4gRWFjaCBzbmlwcGV0IGlzIGRlZmluZWQgdW5kZXIgYSBzbmlwcGV0IG5hbWUgYW5kIGhhcyBhIHByZWZpeCwgYm9keSBhbmRcblx0Ly8gZGVzY3JpcHRpb24uIFRoZSBwcmVmaXggaXMgd2hhdCBpcyB1c2VkIHRvIHRyaWdnZXIgdGhlIHNuaXBwZXQgYW5kIHRoZSBib2R5IHdpbGwgYmUgZXhwYW5kZWQgYW5kIGluc2VydGVkLiBQb3NzaWJsZSB2YXJpYWJsZXMgYXJlOlxuXHQvLyAkMSwgJDIgZm9yIHRhYiBzdG9wcywgJDAgZm9yIHRoZSBmaW5hbCBjdXJzb3IgcG9zaXRpb24sIFBsYWNlaG9sZGVycyB3aXRoIHRoZVxuXHQvLyBzYW1lIGlkcyBhcmUgY29ubmVjdGVkLlxuXHRcIlByaW50IHRvIGNvbnNvbGVcIjoge1xuXHQvLyBFeGFtcGxlOlxuXHRcInByZWZpeFwiOiBcImxvZ1wiLFxuXHRcdFwiYm9keVwiOiBbXG5cdFx0XHRcImNvbnNvbGUubG9nKCckMScpO1wiLFxuXHRcdFx0XCIkMlwiXG5cdFx0XSxcblx0XHRcdFwiZGVzY3JpcHRpb25cIjogXCJMb2cgb3V0cHV0IHRvIGNvbnNvbGUgYWx3YXlzXCIsXG5cdH1cblxufWA7XG5cbmNvbnN0IGh0bWxTbmlwcGV0MSA9IGB7XG4vKlxuXHQvLyBQbGFjZSB5b3VyIHNuaXBwZXRzIGZvciBIVE1MIGhlcmUuIEVhY2ggc25pcHBldCBpcyBkZWZpbmVkIHVuZGVyIGEgc25pcHBldCBuYW1lIGFuZCBoYXMgYSBwcmVmaXgsIGJvZHkgYW5kXG5cdC8vIGRlc2NyaXB0aW9uLiBUaGUgcHJlZml4IGlzIHdoYXQgaXMgdXNlZCB0byB0cmlnZ2VyIHRoZSBzbmlwcGV0IGFuZCB0aGUgYm9keSB3aWxsIGJlIGV4cGFuZGVkIGFuZCBpbnNlcnRlZC5cblx0Ly8gRXhhbXBsZTpcblx0XCJQcmludCB0byBjb25zb2xlXCI6IHtcblx0XCJwcmVmaXhcIjogXCJsb2dcIixcblx0XHRcImJvZHlcIjogW1xuXHRcdFx0XCJjb25zb2xlLmxvZygnJDEnKTtcIixcblx0XHRcdFwiJDJcIlxuXHRcdF0sXG5cdFx0XHRcImRlc2NyaXB0aW9uXCI6IFwiTG9nIG91dHB1dCB0byBjb25zb2xlXCJcblx0fVxuKi9cblwiRGl2XCI6IHtcblx0XCJwcmVmaXhcIjogXCJkaXZcIixcblx0XHRcImJvZHlcIjogW1xuXHRcdFx0XCI8ZGl2PlwiLFxuXHRcdFx0XCJcIixcblx0XHRcdFwiPC9kaXY+XCJcblx0XHRdLFxuXHRcdFx0XCJkZXNjcmlwdGlvblwiOiBcIk5ldyBkaXZcIlxuXHR9XG59YDtcblxuY29uc3QgaHRtbFNuaXBwZXQyID0gYHtcbi8qXG5cdC8vIFBsYWNlIHlvdXIgc25pcHBldHMgZm9yIEhUTUwgaGVyZS4gRWFjaCBzbmlwcGV0IGlzIGRlZmluZWQgdW5kZXIgYSBzbmlwcGV0IG5hbWUgYW5kIGhhcyBhIHByZWZpeCwgYm9keSBhbmRcblx0Ly8gZGVzY3JpcHRpb24uIFRoZSBwcmVmaXggaXMgd2hhdCBpcyB1c2VkIHRvIHRyaWdnZXIgdGhlIHNuaXBwZXQgYW5kIHRoZSBib2R5IHdpbGwgYmUgZXhwYW5kZWQgYW5kIGluc2VydGVkLlxuXHQvLyBFeGFtcGxlOlxuXHRcIlByaW50IHRvIGNvbnNvbGVcIjoge1xuXHRcInByZWZpeFwiOiBcImxvZ1wiLFxuXHRcdFwiYm9keVwiOiBbXG5cdFx0XHRcImNvbnNvbGUubG9nKCckMScpO1wiLFxuXHRcdFx0XCIkMlwiXG5cdFx0XSxcblx0XHRcdFwiZGVzY3JpcHRpb25cIjogXCJMb2cgb3V0cHV0IHRvIGNvbnNvbGVcIlxuXHR9XG4qL1xuXCJEaXZcIjoge1xuXHRcInByZWZpeFwiOiBcImRpdlwiLFxuXHRcdFwiYm9keVwiOiBbXG5cdFx0XHRcIjxkaXY+XCIsXG5cdFx0XHRcIlwiLFxuXHRcdFx0XCI8L2Rpdj5cIlxuXHRcdF0sXG5cdFx0XHRcImRlc2NyaXB0aW9uXCI6IFwiTmV3IGRpdiBjaGFuZ2VkXCJcblx0fVxufWA7XG5cbmNvbnN0IGNTbmlwcGV0ID0gYHtcblx0Ly8gUGxhY2UgeW91ciBzbmlwcGV0cyBmb3IgYyBoZXJlLiBFYWNoIHNuaXBwZXQgaXMgZGVmaW5lZCB1bmRlciBhIHNuaXBwZXQgbmFtZSBhbmQgaGFzIGEgcHJlZml4LCBib2R5IGFuZFxuXHQvLyBkZXNjcmlwdGlvbi4gVGhlIHByZWZpeCBpcyB3aGF0IGlzIHVzZWQgdG8gdHJpZ2dlciB0aGUgc25pcHBldCBhbmQgdGhlIGJvZHkgd2lsbCBiZSBleHBhbmRlZCBhbmQgaW5zZXJ0ZWQuIFBvc3NpYmxlIHZhcmlhYmxlcyBhcmU6XG5cdC8vICQxLCAkMiBmb3IgdGFiIHN0b3BzLCAkMCBmb3IgdGhlIGZpbmFsIGN1cnNvciBwb3NpdGlvbi5QbGFjZWhvbGRlcnMgd2l0aCB0aGVcblx0Ly8gc2FtZSBpZHMgYXJlIGNvbm5lY3RlZC5cblx0Ly8gRXhhbXBsZTpcblx0XCJQcmludCB0byBjb25zb2xlXCI6IHtcblx0XCJwcmVmaXhcIjogXCJsb2dcIixcblx0XHRcImJvZHlcIjogW1xuXHRcdFx0XCJjb25zb2xlLmxvZygnJDEnKTtcIixcblx0XHRcdFwiJDJcIlxuXHRcdF0sXG5cdFx0XHRcImRlc2NyaXB0aW9uXCI6IFwiTG9nIG91dHB1dCB0byBjb25zb2xlXCJcblx0fVxufWA7XG5cbnN1aXRlKCdTbmlwcGV0c01lcmdlJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIGxvY2FsIGFuZCByZW1vdGUgYXJlIHNhbWUgd2l0aCBvbmUgc25pcHBldCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbCA9IHsgJ2h0bWwuanNvbic6IGh0bWxTbmlwcGV0MSB9O1xuXHRcdGNvbnN0IHJlbW90ZSA9IHsgJ2h0bWwuanNvbic6IGh0bWxTbmlwcGV0MSB9O1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWwsIHJlbW90ZSwgbnVsbCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwuY29uZmxpY3RzLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLmFkZGVkLCB7fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLnVwZGF0ZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUucmVtb3ZlZCwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIGxvY2FsIGFuZCByZW1vdGUgYXJlIHNhbWUgd2l0aCBtdWx0aXBsZSBlbnRyaWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsID0geyAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQxLCAndHlwZXNjcmlwdC5qc29uJzogdHNTbmlwcGV0MSB9O1xuXHRcdGNvbnN0IHJlbW90ZSA9IHsgJ2h0bWwuanNvbic6IGh0bWxTbmlwcGV0MSwgJ3R5cGVzY3JpcHQuanNvbic6IHRzU25pcHBldDEgfTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsLCByZW1vdGUsIG51bGwpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCB7fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmNvbmZsaWN0cywgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZS5hZGRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZS51cGRhdGVkLCB7fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLnJlbW92ZWQsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBsb2NhbCBhbmQgcmVtb3RlIGFyZSBzYW1lIHdpdGggbXVsdGlwbGUgZW50cmllcyBpbiBkaWZmZXJlbnQgb3JkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWwgPSB7ICd0eXBlc2NyaXB0Lmpzb24nOiB0c1NuaXBwZXQxLCAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQxIH07XG5cdFx0Y29uc3QgcmVtb3RlID0geyAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQxLCAndHlwZXNjcmlwdC5qc29uJzogdHNTbmlwcGV0MSB9O1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWwsIHJlbW90ZSwgbnVsbCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwuY29uZmxpY3RzLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLmFkZGVkLCB7fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLnVwZGF0ZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUucmVtb3ZlZCwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIGxvY2FsIGFuZCByZW1vdGUgYXJlIHNhbWUgd2l0aCBkaWZmZXJlbnQgYmFzZSBjb250ZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsID0geyAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQxLCAndHlwZXNjcmlwdC5qc29uJzogdHNTbmlwcGV0MSB9O1xuXHRcdGNvbnN0IHJlbW90ZSA9IHsgJ2h0bWwuanNvbic6IGh0bWxTbmlwcGV0MSwgJ3R5cGVzY3JpcHQuanNvbic6IHRzU25pcHBldDEgfTtcblx0XHRjb25zdCBiYXNlID0geyAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQyLCAndHlwZXNjcmlwdC5qc29uJzogdHNTbmlwcGV0MiB9O1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWwsIHJlbW90ZSwgYmFzZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwuY29uZmxpY3RzLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLmFkZGVkLCB7fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLnVwZGF0ZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUucmVtb3ZlZCwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIGEgbmV3IGVudHJ5IGlzIGFkZGVkIHRvIHJlbW90ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbCA9IHsgJ2h0bWwuanNvbic6IGh0bWxTbmlwcGV0MSB9O1xuXHRcdGNvbnN0IHJlbW90ZSA9IHsgJ2h0bWwuanNvbic6IGh0bWxTbmlwcGV0MSwgJ3R5cGVzY3JpcHQuanNvbic6IHRzU25pcHBldDEgfTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsLCByZW1vdGUsIG51bGwpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIHsgJ3R5cGVzY3JpcHQuanNvbic6IHRzU25pcHBldDEgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHMsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUuYWRkZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUudXBkYXRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZS5yZW1vdmVkLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gbXVsdGlwbGUgbmV3IGVudHJpZXMgYXJlIGFkZGVkIHRvIHJlbW90ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbCA9IHt9O1xuXHRcdGNvbnN0IHJlbW90ZSA9IHsgJ2h0bWwuanNvbic6IGh0bWxTbmlwcGV0MSwgJ3R5cGVzY3JpcHQuanNvbic6IHRzU25pcHBldDEgfTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsLCByZW1vdGUsIG51bGwpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIHJlbW90ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHMsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUuYWRkZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUudXBkYXRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZS5yZW1vdmVkLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gbmV3IGVudHJ5IGlzIGFkZGVkIHRvIHJlbW90ZSBmcm9tIGJhc2UgYW5kIGxvY2FsIGhhcyBub3QgY2hhbmdlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbCA9IHsgJ2h0bWwuanNvbic6IGh0bWxTbmlwcGV0MSB9O1xuXHRcdGNvbnN0IHJlbW90ZSA9IHsgJ2h0bWwuanNvbic6IGh0bWxTbmlwcGV0MSwgJ3R5cGVzY3JpcHQuanNvbic6IHRzU25pcHBldDEgfTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsLCByZW1vdGUsIGxvY2FsKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCB7ICd0eXBlc2NyaXB0Lmpzb24nOiB0c1NuaXBwZXQxIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwuY29uZmxpY3RzLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLmFkZGVkLCB7fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLnVwZGF0ZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUucmVtb3ZlZCwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIGFuIGVudHJ5IGlzIHJlbW92ZWQgZnJvbSByZW1vdGUgZnJvbSBiYXNlIGFuZCBsb2NhbCBoYXMgbm90IGNoYW5nZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWwgPSB7ICdodG1sLmpzb24nOiBodG1sU25pcHBldDEsICd0eXBlc2NyaXB0Lmpzb24nOiB0c1NuaXBwZXQxIH07XG5cdFx0Y29uc3QgcmVtb3RlID0geyAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQxIH07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbCwgcmVtb3RlLCBsb2NhbCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbJ3R5cGVzY3JpcHQuanNvbiddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHMsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUuYWRkZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUudXBkYXRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZS5yZW1vdmVkLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gYWxsIGVudHJpZXMgYXJlIHJlbW92ZWQgZnJvbSBiYXNlIGFuZCBsb2NhbCBoYXMgbm90IGNoYW5nZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWwgPSB7ICdodG1sLmpzb24nOiBodG1sU25pcHBldDEsICd0eXBlc2NyaXB0Lmpzb24nOiB0c1NuaXBwZXQxIH07XG5cdFx0Y29uc3QgcmVtb3RlID0ge307XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbCwgcmVtb3RlLCBsb2NhbCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbJ2h0bWwuanNvbicsICd0eXBlc2NyaXB0Lmpzb24nXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwuY29uZmxpY3RzLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLmFkZGVkLCB7fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLnVwZGF0ZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUucmVtb3ZlZCwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIGFuIGVudHJ5IGlzIHVwZGF0ZWQgaW4gcmVtb3RlIGZyb20gYmFzZSBhbmQgbG9jYWwgaGFzIG5vdCBjaGFuZ2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsID0geyAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQxIH07XG5cdFx0Y29uc3QgcmVtb3RlID0geyAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQyIH07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbCwgcmVtb3RlLCBsb2NhbCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIHsgJ2h0bWwuanNvbic6IGh0bWxTbmlwcGV0MiB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwuY29uZmxpY3RzLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLmFkZGVkLCB7fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLnVwZGF0ZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUucmVtb3ZlZCwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIHJlbW90ZSBoYXMgbW92ZWQgZm9yd2FyZGVkIHdpdGggbXVsdGlwbGUgY2hhbmdlcyBhbmQgbG9jYWwgc3RheXMgd2l0aCBiYXNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsID0geyAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQxLCAndHlwZXNjcmlwdC5qc29uJzogdHNTbmlwcGV0MSB9O1xuXHRcdGNvbnN0IHJlbW90ZSA9IHsgJ2h0bWwuanNvbic6IGh0bWxTbmlwcGV0MiwgJ2MuanNvbic6IGNTbmlwcGV0IH07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbCwgcmVtb3RlLCBsb2NhbCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgeyAnYy5qc29uJzogY1NuaXBwZXQgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgeyAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQyIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFsndHlwZXNjcmlwdC5qc29uJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmNvbmZsaWN0cywgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZS5hZGRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZS51cGRhdGVkLCB7fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLnJlbW92ZWQsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBhIG5ldyBlbnRyaWVzIGFyZSBhZGRlZCB0byBsb2NhbCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbCA9IHsgJ2h0bWwuanNvbic6IGh0bWxTbmlwcGV0MSwgJ3R5cGVzY3JpcHQuanNvbic6IHRzU25pcHBldDEsICdjLmpzb24nOiBjU25pcHBldCB9O1xuXHRcdGNvbnN0IHJlbW90ZSA9IHsgJ2h0bWwuanNvbic6IGh0bWxTbmlwcGV0MSwgJ3R5cGVzY3JpcHQuanNvbic6IHRzU25pcHBldDEgfTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsLCByZW1vdGUsIG51bGwpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCB7fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmNvbmZsaWN0cywgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZS5hZGRlZCwgeyAnYy5qc29uJzogY1NuaXBwZXQgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLnVwZGF0ZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUucmVtb3ZlZCwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIG11bHRpcGxlIG5ldyBlbnRyaWVzIGFyZSBhZGRlZCB0byBsb2NhbCBmcm9tIGJhc2UgYW5kIHJlbW90ZSBpcyBub3QgY2hhbmdlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbCA9IHsgJ2h0bWwuanNvbic6IGh0bWxTbmlwcGV0MSwgJ3R5cGVzY3JpcHQuanNvbic6IHRzU25pcHBldDEsICdjLmpzb24nOiBjU25pcHBldCB9O1xuXHRcdGNvbnN0IHJlbW90ZSA9IHsgJ3R5cGVzY3JpcHQuanNvbic6IHRzU25pcHBldDEgfTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsLCByZW1vdGUsIHJlbW90ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwuY29uZmxpY3RzLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLmFkZGVkLCB7ICdodG1sLmpzb24nOiBodG1sU25pcHBldDEsICdjLmpzb24nOiBjU25pcHBldCB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUudXBkYXRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZS5yZW1vdmVkLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gYW4gZW50cnkgaXMgcmVtb3ZlZCBmcm9tIGxvY2FsIGZyb20gYmFzZSBhbmQgcmVtb3RlIGhhcyBub3QgY2hhbmdlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbCA9IHsgJ2h0bWwuanNvbic6IGh0bWxTbmlwcGV0MSB9O1xuXHRcdGNvbnN0IHJlbW90ZSA9IHsgJ2h0bWwuanNvbic6IGh0bWxTbmlwcGV0MSwgJ3R5cGVzY3JpcHQuanNvbic6IHRzU25pcHBldDEgfTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsLCByZW1vdGUsIHJlbW90ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwuY29uZmxpY3RzLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLmFkZGVkLCB7fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLnVwZGF0ZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUucmVtb3ZlZCwgWyd0eXBlc2NyaXB0Lmpzb24nXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gYW4gZW50cnkgaXMgdXBkYXRlZCBpbiBsb2NhbCBmcm9tIGJhc2UgYW5kIHJlbW90ZSBoYXMgbm90IGNoYW5nZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWwgPSB7ICdodG1sLmpzb24nOiBodG1sU25pcHBldDIsICd0eXBlc2NyaXB0Lmpzb24nOiB0c1NuaXBwZXQxIH07XG5cdFx0Y29uc3QgcmVtb3RlID0geyAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQxLCAndHlwZXNjcmlwdC5qc29uJzogdHNTbmlwcGV0MSB9O1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWwsIHJlbW90ZSwgcmVtb3RlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCB7fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHMsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUuYWRkZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUudXBkYXRlZCwgeyAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQyIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZS5yZW1vdmVkLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gbG9jYWwgaGFzIG1vdmVkIGZvcndhcmRlZCB3aXRoIG11bHRpcGxlIGNoYW5nZXMgYW5kIHJlbW90ZSBzdGF5cyB3aXRoIGJhc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWwgPSB7ICdodG1sLmpzb24nOiBodG1sU25pcHBldDIsICdjLmpzb24nOiBjU25pcHBldCB9O1xuXHRcdGNvbnN0IHJlbW90ZSA9IHsgJ2h0bWwuanNvbic6IGh0bWxTbmlwcGV0MSwgJ3R5cGVzY3JpcHQuanNvbic6IHRzU25pcHBldDEgfTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsLCByZW1vdGUsIHJlbW90ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwuY29uZmxpY3RzLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLmFkZGVkLCB7ICdjLmpzb24nOiBjU25pcHBldCB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUudXBkYXRlZCwgeyAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQyIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZS5yZW1vdmVkLCBbJ3R5cGVzY3JpcHQuanNvbiddKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBsb2NhbCBhbmQgcmVtb3RlIHdpdGggb25lIGVudHJ5IGJ1dCBkaWZmZXJlbnQgdmFsdWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWwgPSB7ICdodG1sLmpzb24nOiBodG1sU25pcHBldDEgfTtcblx0XHRjb25zdCByZW1vdGUgPSB7ICdodG1sLmpzb24nOiBodG1sU25pcHBldDIgfTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsLCByZW1vdGUsIG51bGwpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCB7fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmNvbmZsaWN0cywgWydodG1sLmpzb24nXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLmFkZGVkLCB7fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLnVwZGF0ZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUucmVtb3ZlZCwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIHRoZSBlbnRyeSBpcyByZW1vdmVkIGluIHJlbW90ZSBidXQgdXBkYXRlZCBpbiBsb2NhbCBhbmQgYSBuZXcgZW50cnkgaXMgYWRkZWQgaW4gcmVtb3RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJhc2UgPSB7ICdodG1sLmpzb24nOiBodG1sU25pcHBldDEgfTtcblx0XHRjb25zdCBsb2NhbCA9IHsgJ2h0bWwuanNvbic6IGh0bWxTbmlwcGV0MiB9O1xuXHRcdGNvbnN0IHJlbW90ZSA9IHsgJ3R5cGVzY3JpcHQuanNvbic6IHRzU25pcHBldDEgfTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsLCByZW1vdGUsIGJhc2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIHsgJ3R5cGVzY3JpcHQuanNvbic6IHRzU25pcHBldDEgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHMsIFsnaHRtbC5qc29uJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZS5hZGRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZS51cGRhdGVkLCB7fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLnJlbW92ZWQsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2l0aCBzaW5nbGUgZW50cnkgYW5kIGxvY2FsIGlzIGVtcHR5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJhc2UgPSB7ICdodG1sLmpzb24nOiBodG1sU25pcHBldDEgfTtcblx0XHRjb25zdCBsb2NhbCA9IHt9O1xuXHRcdGNvbnN0IHJlbW90ZSA9IHsgJ2h0bWwuanNvbic6IGh0bWxTbmlwcGV0MiB9O1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWwsIHJlbW90ZSwgYmFzZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgeyAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQyIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwuY29uZmxpY3RzLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLmFkZGVkLCB7fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLnVwZGF0ZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUucmVtb3ZlZCwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIGxvY2FsIGFuZCByZW1vdGUgaGFzIG1vdmVkIGZvcndhcmVkZWQgd2l0aCBjb25mbGljdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYmFzZSA9IHsgJ2h0bWwuanNvbic6IGh0bWxTbmlwcGV0MSwgJ3R5cGVzY3JpcHQuanNvbic6IHRzU25pcHBldDEgfTtcblx0XHRjb25zdCBsb2NhbCA9IHsgJ2h0bWwuanNvbic6IGh0bWxTbmlwcGV0MiwgJ2MuanNvbic6IGNTbmlwcGV0IH07XG5cdFx0Y29uc3QgcmVtb3RlID0geyAndHlwZXNjcmlwdC5qc29uJzogdHNTbmlwcGV0MiB9O1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWwsIHJlbW90ZSwgYmFzZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgeyAndHlwZXNjcmlwdC5qc29uJzogdHNTbmlwcGV0MiB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCB7fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmNvbmZsaWN0cywgWydodG1sLmpzb24nXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLmFkZGVkLCB7ICdjLmpzb24nOiBjU25pcHBldCB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUudXBkYXRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZS5yZW1vdmVkLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gbG9jYWwgYW5kIHJlbW90ZSBoYXMgbW92ZWQgZm9yd2FyZWRlZCB3aXRoIG11bHRpcGxlIGNvbmZsaWN0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBiYXNlID0geyAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQxLCAndHlwZXNjcmlwdC5qc29uJzogdHNTbmlwcGV0MSB9O1xuXHRcdGNvbnN0IGxvY2FsID0geyAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQyLCAndHlwZXNjcmlwdC5qc29uJzogdHNTbmlwcGV0MiwgJ2MuanNvbic6IGNTbmlwcGV0IH07XG5cdFx0Y29uc3QgcmVtb3RlID0geyAnYy5qc29uJzogY1NuaXBwZXQgfTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsLCByZW1vdGUsIGJhc2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIHt9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCB7fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmNvbmZsaWN0cywgWydodG1sLmpzb24nLCAndHlwZXNjcmlwdC5qc29uJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZS5hZGRlZCwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZS51cGRhdGVkLCB7fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLnJlbW92ZWQsIFtdKTtcblx0fSk7XG5cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsYUFBYTtBQUV0QixNQUFNLGFBQWE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFB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
