import * as assert from "assert";
import { sanitizeHtml } from "../../browser/domSanitize.js";
import { Schemas } from "../../common/network.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../common/utils.js";
suite("DomSanitize", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("removes unsupported tags by default", () => {
    const html = "<div>safe<script>alert(1)<\/script>content</div>";
    const result = sanitizeHtml(html);
    const str = result.toString();
    assert.ok(str.includes("<div>"));
    assert.ok(str.includes("safe"));
    assert.ok(str.includes("content"));
    assert.ok(!str.includes("<script>"));
    assert.ok(!str.includes("alert(1)"));
  });
  test("removes unsupported attributes by default", () => {
    const html = '<div onclick="alert(1)" title="safe">content</div>';
    const result = sanitizeHtml(html);
    const str = result.toString();
    assert.ok(str.includes('<div title="safe">'));
    assert.ok(!str.includes("onclick"));
    assert.ok(!str.includes("alert(1)"));
  });
  test("allows custom tags via config", () => {
    {
      const html = "<div>removed</div><custom-tag>hello</custom-tag>";
      const result = sanitizeHtml(html, {
        allowedTags: { override: ["custom-tag"] }
      });
      assert.strictEqual(result.toString(), "removed<custom-tag>hello</custom-tag>");
    }
    {
      const html = "<div>kept</div><augmented-tag>world</augmented-tag>";
      const result = sanitizeHtml(html, {
        allowedTags: { augment: ["augmented-tag"] }
      });
      assert.strictEqual(result.toString(), "<div>kept</div><augmented-tag>world</augmented-tag>");
    }
  });
  test("allows custom attributes via config", () => {
    const html = '<div custom-attr="value">content</div>';
    const result = sanitizeHtml(html, {
      allowedAttributes: { override: ["custom-attr"] }
    });
    const str = result.toString();
    assert.ok(str.includes('custom-attr="value"'));
  });
  test("Attributes in config should be case insensitive", () => {
    const html = '<div Custom-Attr="value">content</div>';
    {
      const result = sanitizeHtml(html, {
        allowedAttributes: { override: ["custom-attr"] }
      });
      assert.ok(result.toString().includes('custom-attr="value"'));
    }
    {
      const result = sanitizeHtml(html, {
        allowedAttributes: { override: ["CUSTOM-ATTR"] }
      });
      assert.ok(result.toString().includes('custom-attr="value"'));
    }
  });
  test("removes unsupported protocols for href by default", () => {
    const html = '<a href="javascript:alert(1)">bad link</a>';
    const result = sanitizeHtml(html);
    const str = result.toString();
    assert.ok(str.includes("<a>bad link</a>"));
    assert.ok(!str.includes("javascript:"));
  });
  test("removes unsupported protocols for src by default", () => {
    const html = '<img alt="text" src="javascript:alert(1)">';
    const result = sanitizeHtml(html);
    const str = result.toString();
    assert.ok(str.includes('<img alt="text">'));
    assert.ok(!str.includes("javascript:"));
  });
  test("allows safe protocols for href", () => {
    const html = '<a href="https://example.com">safe link</a>';
    const result = sanitizeHtml(html);
    assert.ok(result.toString().includes('href="https://example.com"'));
  });
  test("allows fragment links", () => {
    const html = '<a href="#section">fragment link</a>';
    const result = sanitizeHtml(html);
    const str = result.toString();
    assert.ok(str.includes('href="#section"'));
  });
  test("removes data images by default", () => {
    const html = '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==">';
    const result = sanitizeHtml(html);
    const str = result.toString();
    assert.ok(str.includes("<img>"));
    assert.ok(!str.includes('src="data:'));
  });
  test("allows data images when enabled", () => {
    const html = '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==">';
    const result = sanitizeHtml(html, {
      allowedMediaProtocols: { override: [Schemas.data] }
    });
    assert.ok(result.toString().includes('src="data:image/png;base64,'));
  });
  test("Removes relative paths for img src by default", () => {
    const html = '<img src="path/img.png">';
    const result = sanitizeHtml(html);
    assert.strictEqual(result.toString(), "<img>");
  });
  test("Can allow relative paths for image", () => {
    const html = '<img src="path/img.png">';
    const result = sanitizeHtml(html, {
      allowRelativeMediaPaths: true
    });
    assert.strictEqual(result.toString(), '<img src="path/img.png">');
  });
  test("Supports dynamic attribute sanitization", () => {
    const html = '<div title="a" other="1">text1</div><div title="b" other="2">text2</div>';
    const result = sanitizeHtml(html, {
      allowedAttributes: {
        override: [
          {
            attributeName: "title",
            shouldKeep: (_el, data) => {
              return data.attrValue.includes("b");
            }
          }
        ]
      }
    });
    assert.strictEqual(result.toString(), '<div>text1</div><div title="b">text2</div>');
  });
  test("Supports changing attributes in dynamic sanitization", () => {
    const html = '<div title="abc" other="1">text1</div><div title="xyz" other="2">text2</div>';
    const result = sanitizeHtml(html, {
      allowedAttributes: {
        override: [
          {
            attributeName: "title",
            shouldKeep: (_el, data) => {
              if (data.attrValue === "abc") {
                return false;
              }
              return data.attrValue + data.attrValue;
            }
          }
        ]
      }
    });
    assert.strictEqual(result.toString(), '<div>text1</div><div title="xyzxyz">text2</div>');
  });
  test("Attr name should clear previously set dynamic sanitizer", () => {
    const html = '<div title="abc" other="1">text1</div><div title="xyz" other="2">text2</div>';
    const result = sanitizeHtml(html, {
      allowedAttributes: {
        override: [
          {
            attributeName: "title",
            shouldKeep: () => false
          },
          "title"
          // Should allow everything since it comes after custom rule
        ]
      }
    });
    assert.strictEqual(result.toString(), '<div title="abc">text1</div><div title="xyz">text2</div>');
  });
  suite("replaceWithPlaintext", () => {
    test("replaces unsupported tags with plaintext representation", () => {
      const html = "<div>safe<script>alert(1)<\/script>content</div>";
      const result = sanitizeHtml(html, {
        replaceWithPlaintext: true
      });
      const str = result.toString();
      assert.strictEqual(str, `<div>safe&lt;script&gt;alert(1)&lt;/script&gt;content</div>`);
    });
    test("handles self-closing tags correctly", () => {
      const html = '<div><input type="text"><custom-input /></div>';
      const result = sanitizeHtml(html, {
        replaceWithPlaintext: true
      });
      assert.strictEqual(result.toString(), '<div>&lt;input type="text"&gt;&lt;custom-input&gt;&lt;/custom-input&gt;</div>');
    });
    test("handles tags with attributes", () => {
      const html = '<div><unknown-tag class="test" id="myid">content</unknown-tag></div>';
      const result = sanitizeHtml(html, {
        replaceWithPlaintext: true
      });
      assert.strictEqual(result.toString(), '<div>&lt;unknown-tag class="test" id="myid"&gt;content&lt;/unknown-tag&gt;</div>');
    });
    test("handles nested unsupported tags", () => {
      const html = "<div><outer><inner>nested</inner></outer></div>";
      const result = sanitizeHtml(html, {
        replaceWithPlaintext: true
      });
      assert.strictEqual(result.toString(), "<div>&lt;outer&gt;&lt;inner&gt;nested&lt;/inner&gt;&lt;/outer&gt;</div>");
    });
    test("handles comments correctly", () => {
      const html = "<div><!-- this is a comment -->content</div>";
      const result = sanitizeHtml(html, {
        replaceWithPlaintext: true
      });
      assert.strictEqual(result.toString(), "<div>&lt;!-- this is a comment --&gt;content</div>");
    });
    test("handles empty tags", () => {
      const html = "<div><empty></empty></div>";
      const result = sanitizeHtml(html, {
        replaceWithPlaintext: true
      });
      assert.strictEqual(result.toString(), "<div>&lt;empty&gt;&lt;/empty&gt;</div>");
    });
    test("works with custom allowed tags configuration", () => {
      const html = "<div><custom>allowed</custom><forbidden>not allowed</forbidden></div>";
      const result = sanitizeHtml(html, {
        replaceWithPlaintext: true,
        allowedTags: { augment: ["custom"] }
      });
      assert.strictEqual(result.toString(), "<div><custom>allowed</custom>&lt;forbidden&gt;not allowed&lt;/forbidden&gt;</div>");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9icm93c2VyL2RvbVNhbml0aXplLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IHNhbml0aXplSHRtbCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvZG9tU2FuaXRpemUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uL2NvbW1vbi91dGlscy5qcyc7XG5cbnN1aXRlKCdEb21TYW5pdGl6ZScsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdyZW1vdmVzIHVuc3VwcG9ydGVkIHRhZ3MgYnkgZGVmYXVsdCcsICgpID0+IHtcblx0XHRjb25zdCBodG1sID0gJzxkaXY+c2FmZTxzY3JpcHQ+YWxlcnQoMSk8L3NjcmlwdD5jb250ZW50PC9kaXY+Jztcblx0XHRjb25zdCByZXN1bHQgPSBzYW5pdGl6ZUh0bWwoaHRtbCk7XG5cdFx0Y29uc3Qgc3RyID0gcmVzdWx0LnRvU3RyaW5nKCk7XG5cblx0XHRhc3NlcnQub2soc3RyLmluY2x1ZGVzKCc8ZGl2PicpKTtcblx0XHRhc3NlcnQub2soc3RyLmluY2x1ZGVzKCdzYWZlJykpO1xuXHRcdGFzc2VydC5vayhzdHIuaW5jbHVkZXMoJ2NvbnRlbnQnKSk7XG5cdFx0YXNzZXJ0Lm9rKCFzdHIuaW5jbHVkZXMoJzxzY3JpcHQ+JykpO1xuXHRcdGFzc2VydC5vayghc3RyLmluY2x1ZGVzKCdhbGVydCgxKScpKTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlcyB1bnN1cHBvcnRlZCBhdHRyaWJ1dGVzIGJ5IGRlZmF1bHQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaHRtbCA9ICc8ZGl2IG9uY2xpY2s9XCJhbGVydCgxKVwiIHRpdGxlPVwic2FmZVwiPmNvbnRlbnQ8L2Rpdj4nO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHNhbml0aXplSHRtbChodG1sKTtcblx0XHRjb25zdCBzdHIgPSByZXN1bHQudG9TdHJpbmcoKTtcblxuXHRcdGFzc2VydC5vayhzdHIuaW5jbHVkZXMoJzxkaXYgdGl0bGU9XCJzYWZlXCI+JykpO1xuXHRcdGFzc2VydC5vayghc3RyLmluY2x1ZGVzKCdvbmNsaWNrJykpO1xuXHRcdGFzc2VydC5vayghc3RyLmluY2x1ZGVzKCdhbGVydCgxKScpKTtcblx0fSk7XG5cblx0dGVzdCgnYWxsb3dzIGN1c3RvbSB0YWdzIHZpYSBjb25maWcnLCAoKSA9PiB7XG5cdFx0e1xuXHRcdFx0Y29uc3QgaHRtbCA9ICc8ZGl2PnJlbW92ZWQ8L2Rpdj48Y3VzdG9tLXRhZz5oZWxsbzwvY3VzdG9tLXRhZz4nO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2FuaXRpemVIdG1sKGh0bWwsIHtcblx0XHRcdFx0YWxsb3dlZFRhZ3M6IHsgb3ZlcnJpZGU6IFsnY3VzdG9tLXRhZyddIH1cblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC50b1N0cmluZygpLCAncmVtb3ZlZDxjdXN0b20tdGFnPmhlbGxvPC9jdXN0b20tdGFnPicpO1xuXHRcdH1cblx0XHR7XG5cdFx0XHRjb25zdCBodG1sID0gJzxkaXY+a2VwdDwvZGl2PjxhdWdtZW50ZWQtdGFnPndvcmxkPC9hdWdtZW50ZWQtdGFnPic7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBzYW5pdGl6ZUh0bWwoaHRtbCwge1xuXHRcdFx0XHRhbGxvd2VkVGFnczogeyBhdWdtZW50OiBbJ2F1Z21lbnRlZC10YWcnXSB9XG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudG9TdHJpbmcoKSwgJzxkaXY+a2VwdDwvZGl2PjxhdWdtZW50ZWQtdGFnPndvcmxkPC9hdWdtZW50ZWQtdGFnPicpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnYWxsb3dzIGN1c3RvbSBhdHRyaWJ1dGVzIHZpYSBjb25maWcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaHRtbCA9ICc8ZGl2IGN1c3RvbS1hdHRyPVwidmFsdWVcIj5jb250ZW50PC9kaXY+Jztcblx0XHRjb25zdCByZXN1bHQgPSBzYW5pdGl6ZUh0bWwoaHRtbCwge1xuXHRcdFx0YWxsb3dlZEF0dHJpYnV0ZXM6IHsgb3ZlcnJpZGU6IFsnY3VzdG9tLWF0dHInXSB9XG5cdFx0fSk7XG5cdFx0Y29uc3Qgc3RyID0gcmVzdWx0LnRvU3RyaW5nKCk7XG5cblx0XHRhc3NlcnQub2soc3RyLmluY2x1ZGVzKCdjdXN0b20tYXR0cj1cInZhbHVlXCInKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0F0dHJpYnV0ZXMgaW4gY29uZmlnIHNob3VsZCBiZSBjYXNlIGluc2Vuc2l0aXZlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGh0bWwgPSAnPGRpdiBDdXN0b20tQXR0cj1cInZhbHVlXCI+Y29udGVudDwvZGl2Pic7XG5cblx0XHR7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBzYW5pdGl6ZUh0bWwoaHRtbCwge1xuXHRcdFx0XHRhbGxvd2VkQXR0cmlidXRlczogeyBvdmVycmlkZTogWydjdXN0b20tYXR0ciddIH1cblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC50b1N0cmluZygpLmluY2x1ZGVzKCdjdXN0b20tYXR0cj1cInZhbHVlXCInKSk7XG5cdFx0fVxuXHRcdHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNhbml0aXplSHRtbChodG1sLCB7XG5cdFx0XHRcdGFsbG93ZWRBdHRyaWJ1dGVzOiB7IG92ZXJyaWRlOiBbJ0NVU1RPTS1BVFRSJ10gfVxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LnRvU3RyaW5nKCkuaW5jbHVkZXMoJ2N1c3RvbS1hdHRyPVwidmFsdWVcIicpKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92ZXMgdW5zdXBwb3J0ZWQgcHJvdG9jb2xzIGZvciBocmVmIGJ5IGRlZmF1bHQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaHRtbCA9ICc8YSBocmVmPVwiamF2YXNjcmlwdDphbGVydCgxKVwiPmJhZCBsaW5rPC9hPic7XG5cdFx0Y29uc3QgcmVzdWx0ID0gc2FuaXRpemVIdG1sKGh0bWwpO1xuXHRcdGNvbnN0IHN0ciA9IHJlc3VsdC50b1N0cmluZygpO1xuXG5cdFx0YXNzZXJ0Lm9rKHN0ci5pbmNsdWRlcygnPGE+YmFkIGxpbms8L2E+JykpO1xuXHRcdGFzc2VydC5vayghc3RyLmluY2x1ZGVzKCdqYXZhc2NyaXB0OicpKTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlcyB1bnN1cHBvcnRlZCBwcm90b2NvbHMgZm9yIHNyYyBieSBkZWZhdWx0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGh0bWwgPSAnPGltZyBhbHQ9XCJ0ZXh0XCIgc3JjPVwiamF2YXNjcmlwdDphbGVydCgxKVwiPic7XG5cdFx0Y29uc3QgcmVzdWx0ID0gc2FuaXRpemVIdG1sKGh0bWwpO1xuXHRcdGNvbnN0IHN0ciA9IHJlc3VsdC50b1N0cmluZygpO1xuXG5cdFx0YXNzZXJ0Lm9rKHN0ci5pbmNsdWRlcygnPGltZyBhbHQ9XCJ0ZXh0XCI+JykpO1xuXHRcdGFzc2VydC5vayghc3RyLmluY2x1ZGVzKCdqYXZhc2NyaXB0OicpKTtcblx0fSk7XG5cblx0dGVzdCgnYWxsb3dzIHNhZmUgcHJvdG9jb2xzIGZvciBocmVmJywgKCkgPT4ge1xuXHRcdGNvbnN0IGh0bWwgPSAnPGEgaHJlZj1cImh0dHBzOi8vZXhhbXBsZS5jb21cIj5zYWZlIGxpbms8L2E+Jztcblx0XHRjb25zdCByZXN1bHQgPSBzYW5pdGl6ZUh0bWwoaHRtbCk7XG5cblx0XHRhc3NlcnQub2socmVzdWx0LnRvU3RyaW5nKCkuaW5jbHVkZXMoJ2hyZWY9XCJodHRwczovL2V4YW1wbGUuY29tXCInKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FsbG93cyBmcmFnbWVudCBsaW5rcycsICgpID0+IHtcblx0XHRjb25zdCBodG1sID0gJzxhIGhyZWY9XCIjc2VjdGlvblwiPmZyYWdtZW50IGxpbms8L2E+Jztcblx0XHRjb25zdCByZXN1bHQgPSBzYW5pdGl6ZUh0bWwoaHRtbCk7XG5cdFx0Y29uc3Qgc3RyID0gcmVzdWx0LnRvU3RyaW5nKCk7XG5cblx0XHRhc3NlcnQub2soc3RyLmluY2x1ZGVzKCdocmVmPVwiI3NlY3Rpb25cIicpKTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlcyBkYXRhIGltYWdlcyBieSBkZWZhdWx0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGh0bWwgPSAnPGltZyBzcmM9XCJkYXRhOmltYWdlL3BuZztiYXNlNjQsaVZCT1J3MEtHZ29BQUFBTlNVaEVVZ0FBQUFFQUFBQUJDQVlBQUFBZkZjU0pBQUFBRFVsRVFWUjQybVA4LzUraEhnQUhnZ0ovUGNoSTd3QUFBQUJKUlU1RXJrSmdnZz09XCI+Jztcblx0XHRjb25zdCByZXN1bHQgPSBzYW5pdGl6ZUh0bWwoaHRtbCk7XG5cdFx0Y29uc3Qgc3RyID0gcmVzdWx0LnRvU3RyaW5nKCk7XG5cblx0XHRhc3NlcnQub2soc3RyLmluY2x1ZGVzKCc8aW1nPicpKTtcblx0XHRhc3NlcnQub2soIXN0ci5pbmNsdWRlcygnc3JjPVwiZGF0YTonKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FsbG93cyBkYXRhIGltYWdlcyB3aGVuIGVuYWJsZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaHRtbCA9ICc8aW1nIHNyYz1cImRhdGE6aW1hZ2UvcG5nO2Jhc2U2NCxpVkJPUncwS0dnb0FBQUFOU1VoRVVnQUFBQUVBQUFBQkNBWUFBQUFmRmNTSkFBQUFEVWxFUVZSNDJtUDgvNStoSGdBSGdnSi9QY2hJN3dBQUFBQkpSVTVFcmtKZ2dnPT1cIj4nO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHNhbml0aXplSHRtbChodG1sLCB7XG5cdFx0XHRhbGxvd2VkTWVkaWFQcm90b2NvbHM6IHsgb3ZlcnJpZGU6IFtTY2hlbWFzLmRhdGFdIH1cblx0XHR9KTtcblxuXHRcdGFzc2VydC5vayhyZXN1bHQudG9TdHJpbmcoKS5pbmNsdWRlcygnc3JjPVwiZGF0YTppbWFnZS9wbmc7YmFzZTY0LCcpKTtcblx0fSk7XG5cblx0dGVzdCgnUmVtb3ZlcyByZWxhdGl2ZSBwYXRocyBmb3IgaW1nIHNyYyBieSBkZWZhdWx0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGh0bWwgPSAnPGltZyBzcmM9XCJwYXRoL2ltZy5wbmdcIj4nO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHNhbml0aXplSHRtbChodG1sKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnRvU3RyaW5nKCksICc8aW1nPicpO1xuXHR9KTtcblxuXHR0ZXN0KCdDYW4gYWxsb3cgcmVsYXRpdmUgcGF0aHMgZm9yIGltYWdlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGh0bWwgPSAnPGltZyBzcmM9XCJwYXRoL2ltZy5wbmdcIj4nO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHNhbml0aXplSHRtbChodG1sLCB7XG5cdFx0XHRhbGxvd1JlbGF0aXZlTWVkaWFQYXRoczogdHJ1ZSxcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnRvU3RyaW5nKCksICc8aW1nIHNyYz1cInBhdGgvaW1nLnBuZ1wiPicpO1xuXHR9KTtcblxuXHR0ZXN0KCdTdXBwb3J0cyBkeW5hbWljIGF0dHJpYnV0ZSBzYW5pdGl6YXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgaHRtbCA9ICc8ZGl2IHRpdGxlPVwiYVwiIG90aGVyPVwiMVwiPnRleHQxPC9kaXY+PGRpdiB0aXRsZT1cImJcIiBvdGhlcj1cIjJcIj50ZXh0MjwvZGl2Pic7XG5cdFx0Y29uc3QgcmVzdWx0ID0gc2FuaXRpemVIdG1sKGh0bWwsIHtcblx0XHRcdGFsbG93ZWRBdHRyaWJ1dGVzOiB7XG5cdFx0XHRcdG92ZXJyaWRlOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0YXR0cmlidXRlTmFtZTogJ3RpdGxlJyxcblx0XHRcdFx0XHRcdHNob3VsZEtlZXA6IChfZWwsIGRhdGEpID0+IHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGRhdGEuYXR0clZhbHVlLmluY2x1ZGVzKCdiJyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC50b1N0cmluZygpLCAnPGRpdj50ZXh0MTwvZGl2PjxkaXYgdGl0bGU9XCJiXCI+dGV4dDI8L2Rpdj4nKTtcblx0fSk7XG5cblx0dGVzdCgnU3VwcG9ydHMgY2hhbmdpbmcgYXR0cmlidXRlcyBpbiBkeW5hbWljIHNhbml0aXphdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBodG1sID0gJzxkaXYgdGl0bGU9XCJhYmNcIiBvdGhlcj1cIjFcIj50ZXh0MTwvZGl2PjxkaXYgdGl0bGU9XCJ4eXpcIiBvdGhlcj1cIjJcIj50ZXh0MjwvZGl2Pic7XG5cdFx0Y29uc3QgcmVzdWx0ID0gc2FuaXRpemVIdG1sKGh0bWwsIHtcblx0XHRcdGFsbG93ZWRBdHRyaWJ1dGVzOiB7XG5cdFx0XHRcdG92ZXJyaWRlOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0YXR0cmlidXRlTmFtZTogJ3RpdGxlJyxcblx0XHRcdFx0XHRcdHNob3VsZEtlZXA6IChfZWwsIGRhdGEpID0+IHtcblx0XHRcdFx0XHRcdFx0aWYgKGRhdGEuYXR0clZhbHVlID09PSAnYWJjJykge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZGF0YS5hdHRyVmFsdWUgKyBkYXRhLmF0dHJWYWx1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdF1cblx0XHRcdH1cblx0XHR9KTtcblx0XHQvLyB4eXogdGl0bGUgc2hvdWxkIGJlIHByZXNlcnZlZCBhbmQgZG91YmxlZFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudG9TdHJpbmcoKSwgJzxkaXY+dGV4dDE8L2Rpdj48ZGl2IHRpdGxlPVwieHl6eHl6XCI+dGV4dDI8L2Rpdj4nKTtcblx0fSk7XG5cblx0dGVzdCgnQXR0ciBuYW1lIHNob3VsZCBjbGVhciBwcmV2aW91c2x5IHNldCBkeW5hbWljIHNhbml0aXplcicsICgpID0+IHtcblx0XHRjb25zdCBodG1sID0gJzxkaXYgdGl0bGU9XCJhYmNcIiBvdGhlcj1cIjFcIj50ZXh0MTwvZGl2PjxkaXYgdGl0bGU9XCJ4eXpcIiBvdGhlcj1cIjJcIj50ZXh0MjwvZGl2Pic7XG5cdFx0Y29uc3QgcmVzdWx0ID0gc2FuaXRpemVIdG1sKGh0bWwsIHtcblx0XHRcdGFsbG93ZWRBdHRyaWJ1dGVzOiB7XG5cdFx0XHRcdG92ZXJyaWRlOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0YXR0cmlidXRlTmFtZTogJ3RpdGxlJyxcblx0XHRcdFx0XHRcdHNob3VsZEtlZXA6ICgpID0+IGZhbHNlXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHQndGl0bGUnIC8vIFNob3VsZCBhbGxvdyBldmVyeXRoaW5nIHNpbmNlIGl0IGNvbWVzIGFmdGVyIGN1c3RvbSBydWxlXG5cdFx0XHRcdF1cblx0XHRcdH1cblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnRvU3RyaW5nKCksICc8ZGl2IHRpdGxlPVwiYWJjXCI+dGV4dDE8L2Rpdj48ZGl2IHRpdGxlPVwieHl6XCI+dGV4dDI8L2Rpdj4nKTtcblx0fSk7XG5cblx0c3VpdGUoJ3JlcGxhY2VXaXRoUGxhaW50ZXh0JywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncmVwbGFjZXMgdW5zdXBwb3J0ZWQgdGFncyB3aXRoIHBsYWludGV4dCByZXByZXNlbnRhdGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IGh0bWwgPSAnPGRpdj5zYWZlPHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0PmNvbnRlbnQ8L2Rpdj4nO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2FuaXRpemVIdG1sKGh0bWwsIHtcblx0XHRcdFx0cmVwbGFjZVdpdGhQbGFpbnRleHQ6IHRydWVcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3Qgc3RyID0gcmVzdWx0LnRvU3RyaW5nKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyLCBgPGRpdj5zYWZlJmx0O3NjcmlwdCZndDthbGVydCgxKSZsdDsvc2NyaXB0Jmd0O2NvbnRlbnQ8L2Rpdj5gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgc2VsZi1jbG9zaW5nIHRhZ3MgY29ycmVjdGx5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaHRtbCA9ICc8ZGl2PjxpbnB1dCB0eXBlPVwidGV4dFwiPjxjdXN0b20taW5wdXQgLz48L2Rpdj4nO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2FuaXRpemVIdG1sKGh0bWwsIHtcblx0XHRcdFx0cmVwbGFjZVdpdGhQbGFpbnRleHQ6IHRydWVcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC50b1N0cmluZygpLCAnPGRpdj4mbHQ7aW5wdXQgdHlwZT1cInRleHRcIiZndDsmbHQ7Y3VzdG9tLWlucHV0Jmd0OyZsdDsvY3VzdG9tLWlucHV0Jmd0OzwvZGl2PicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyB0YWdzIHdpdGggYXR0cmlidXRlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGh0bWwgPSAnPGRpdj48dW5rbm93bi10YWcgY2xhc3M9XCJ0ZXN0XCIgaWQ9XCJteWlkXCI+Y29udGVudDwvdW5rbm93bi10YWc+PC9kaXY+Jztcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNhbml0aXplSHRtbChodG1sLCB7XG5cdFx0XHRcdHJlcGxhY2VXaXRoUGxhaW50ZXh0OiB0cnVlXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudG9TdHJpbmcoKSwgJzxkaXY+Jmx0O3Vua25vd24tdGFnIGNsYXNzPVwidGVzdFwiIGlkPVwibXlpZFwiJmd0O2NvbnRlbnQmbHQ7L3Vua25vd24tdGFnJmd0OzwvZGl2PicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyBuZXN0ZWQgdW5zdXBwb3J0ZWQgdGFncycsICgpID0+IHtcblx0XHRcdGNvbnN0IGh0bWwgPSAnPGRpdj48b3V0ZXI+PGlubmVyPm5lc3RlZDwvaW5uZXI+PC9vdXRlcj48L2Rpdj4nO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2FuaXRpemVIdG1sKGh0bWwsIHtcblx0XHRcdFx0cmVwbGFjZVdpdGhQbGFpbnRleHQ6IHRydWVcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC50b1N0cmluZygpLCAnPGRpdj4mbHQ7b3V0ZXImZ3Q7Jmx0O2lubmVyJmd0O25lc3RlZCZsdDsvaW5uZXImZ3Q7Jmx0Oy9vdXRlciZndDs8L2Rpdj4nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgY29tbWVudHMgY29ycmVjdGx5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaHRtbCA9ICc8ZGl2PjwhLS0gdGhpcyBpcyBhIGNvbW1lbnQgLS0+Y29udGVudDwvZGl2Pic7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBzYW5pdGl6ZUh0bWwoaHRtbCwge1xuXHRcdFx0XHRyZXBsYWNlV2l0aFBsYWludGV4dDogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnRvU3RyaW5nKCksICc8ZGl2PiZsdDshLS0gdGhpcyBpcyBhIGNvbW1lbnQgLS0mZ3Q7Y29udGVudDwvZGl2PicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyBlbXB0eSB0YWdzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaHRtbCA9ICc8ZGl2PjxlbXB0eT48L2VtcHR5PjwvZGl2Pic7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBzYW5pdGl6ZUh0bWwoaHRtbCwge1xuXHRcdFx0XHRyZXBsYWNlV2l0aFBsYWludGV4dDogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnRvU3RyaW5nKCksICc8ZGl2PiZsdDtlbXB0eSZndDsmbHQ7L2VtcHR5Jmd0OzwvZGl2PicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd29ya3Mgd2l0aCBjdXN0b20gYWxsb3dlZCB0YWdzIGNvbmZpZ3VyYXRpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBodG1sID0gJzxkaXY+PGN1c3RvbT5hbGxvd2VkPC9jdXN0b20+PGZvcmJpZGRlbj5ub3QgYWxsb3dlZDwvZm9yYmlkZGVuPjwvZGl2Pic7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBzYW5pdGl6ZUh0bWwoaHRtbCwge1xuXHRcdFx0XHRyZXBsYWNlV2l0aFBsYWludGV4dDogdHJ1ZSxcblx0XHRcdFx0YWxsb3dlZFRhZ3M6IHsgYXVnbWVudDogWydjdXN0b20nXSB9XG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudG9TdHJpbmcoKSwgJzxkaXY+PGN1c3RvbT5hbGxvd2VkPC9jdXN0b20+Jmx0O2ZvcmJpZGRlbiZndDtub3QgYWxsb3dlZCZsdDsvZm9yYmlkZGVuJmd0OzwvZGl2PicpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxZQUFZO0FBQ3hCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZUFBZTtBQUN4QixTQUFTLCtDQUErQztBQUV4RCxNQUFNLGVBQWUsTUFBTTtBQUUxQiwwQ0FBd0M7QUFFeEMsT0FBSyx1Q0FBdUMsTUFBTTtBQUNqRCxVQUFNLE9BQU87QUFDYixVQUFNLFNBQVMsYUFBYSxJQUFJO0FBQ2hDLFVBQU0sTUFBTSxPQUFPLFNBQVM7QUFFNUIsV0FBTyxHQUFHLElBQUksU0FBUyxPQUFPLENBQUM7QUFDL0IsV0FBTyxHQUFHLElBQUksU0FBUyxNQUFNLENBQUM7QUFDOUIsV0FBTyxHQUFHLElBQUksU0FBUyxTQUFTLENBQUM7QUFDakMsV0FBTyxHQUFHLENBQUMsSUFBSSxTQUFTLFVBQVUsQ0FBQztBQUNuQyxXQUFPLEdBQUcsQ0FBQyxJQUFJLFNBQVMsVUFBVSxDQUFDO0FBQUEsRUFDcEMsQ0FBQztBQUVELE9BQUssNkNBQTZDLE1BQU07QUFDdkQsVUFBTSxPQUFPO0FBQ2IsVUFBTSxTQUFTLGFBQWEsSUFBSTtBQUNoQyxVQUFNLE1BQU0sT0FBTyxTQUFTO0FBRTVCLFdBQU8sR0FBRyxJQUFJLFNBQVMsb0JBQW9CLENBQUM7QUFDNUMsV0FBTyxHQUFHLENBQUMsSUFBSSxTQUFTLFNBQVMsQ0FBQztBQUNsQyxXQUFPLEdBQUcsQ0FBQyxJQUFJLFNBQVMsVUFBVSxDQUFDO0FBQUEsRUFDcEMsQ0FBQztBQUVELE9BQUssaUNBQWlDLE1BQU07QUFDM0M7QUFDQyxZQUFNLE9BQU87QUFDYixZQUFNLFNBQVMsYUFBYSxNQUFNO0FBQUEsUUFDakMsYUFBYSxFQUFFLFVBQVUsQ0FBQyxZQUFZLEVBQUU7QUFBQSxNQUN6QyxDQUFDO0FBQ0QsYUFBTyxZQUFZLE9BQU8sU0FBUyxHQUFHLHVDQUF1QztBQUFBLElBQzlFO0FBQ0E7QUFDQyxZQUFNLE9BQU87QUFDYixZQUFNLFNBQVMsYUFBYSxNQUFNO0FBQUEsUUFDakMsYUFBYSxFQUFFLFNBQVMsQ0FBQyxlQUFlLEVBQUU7QUFBQSxNQUMzQyxDQUFDO0FBQ0QsYUFBTyxZQUFZLE9BQU8sU0FBUyxHQUFHLHFEQUFxRDtBQUFBLElBQzVGO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyx1Q0FBdUMsTUFBTTtBQUNqRCxVQUFNLE9BQU87QUFDYixVQUFNLFNBQVMsYUFBYSxNQUFNO0FBQUEsTUFDakMsbUJBQW1CLEVBQUUsVUFBVSxDQUFDLGFBQWEsRUFBRTtBQUFBLElBQ2hELENBQUM7QUFDRCxVQUFNLE1BQU0sT0FBTyxTQUFTO0FBRTVCLFdBQU8sR0FBRyxJQUFJLFNBQVMscUJBQXFCLENBQUM7QUFBQSxFQUM5QyxDQUFDO0FBRUQsT0FBSyxtREFBbUQsTUFBTTtBQUM3RCxVQUFNLE9BQU87QUFFYjtBQUNDLFlBQU0sU0FBUyxhQUFhLE1BQU07QUFBQSxRQUNqQyxtQkFBbUIsRUFBRSxVQUFVLENBQUMsYUFBYSxFQUFFO0FBQUEsTUFDaEQsQ0FBQztBQUNELGFBQU8sR0FBRyxPQUFPLFNBQVMsRUFBRSxTQUFTLHFCQUFxQixDQUFDO0FBQUEsSUFDNUQ7QUFDQTtBQUNDLFlBQU0sU0FBUyxhQUFhLE1BQU07QUFBQSxRQUNqQyxtQkFBbUIsRUFBRSxVQUFVLENBQUMsYUFBYSxFQUFFO0FBQUEsTUFDaEQsQ0FBQztBQUNELGFBQU8sR0FBRyxPQUFPLFNBQVMsRUFBRSxTQUFTLHFCQUFxQixDQUFDO0FBQUEsSUFDNUQ7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLHFEQUFxRCxNQUFNO0FBQy9ELFVBQU0sT0FBTztBQUNiLFVBQU0sU0FBUyxhQUFhLElBQUk7QUFDaEMsVUFBTSxNQUFNLE9BQU8sU0FBUztBQUU1QixXQUFPLEdBQUcsSUFBSSxTQUFTLGlCQUFpQixDQUFDO0FBQ3pDLFdBQU8sR0FBRyxDQUFDLElBQUksU0FBUyxhQUFhLENBQUM7QUFBQSxFQUN2QyxDQUFDO0FBRUQsT0FBSyxvREFBb0QsTUFBTTtBQUM5RCxVQUFNLE9BQU87QUFDYixVQUFNLFNBQVMsYUFBYSxJQUFJO0FBQ2hDLFVBQU0sTUFBTSxPQUFPLFNBQVM7QUFFNUIsV0FBTyxHQUFHLElBQUksU0FBUyxrQkFBa0IsQ0FBQztBQUMxQyxXQUFPLEdBQUcsQ0FBQyxJQUFJLFNBQVMsYUFBYSxDQUFDO0FBQUEsRUFDdkMsQ0FBQztBQUVELE9BQUssa0NBQWtDLE1BQU07QUFDNUMsVUFBTSxPQUFPO0FBQ2IsVUFBTSxTQUFTLGFBQWEsSUFBSTtBQUVoQyxXQUFPLEdBQUcsT0FBTyxTQUFTLEVBQUUsU0FBUyw0QkFBNEIsQ0FBQztBQUFBLEVBQ25FLENBQUM7QUFFRCxPQUFLLHlCQUF5QixNQUFNO0FBQ25DLFVBQU0sT0FBTztBQUNiLFVBQU0sU0FBUyxhQUFhLElBQUk7QUFDaEMsVUFBTSxNQUFNLE9BQU8sU0FBUztBQUU1QixXQUFPLEdBQUcsSUFBSSxTQUFTLGlCQUFpQixDQUFDO0FBQUEsRUFDMUMsQ0FBQztBQUVELE9BQUssa0NBQWtDLE1BQU07QUFDNUMsVUFBTSxPQUFPO0FBQ2IsVUFBTSxTQUFTLGFBQWEsSUFBSTtBQUNoQyxVQUFNLE1BQU0sT0FBTyxTQUFTO0FBRTVCLFdBQU8sR0FBRyxJQUFJLFNBQVMsT0FBTyxDQUFDO0FBQy9CLFdBQU8sR0FBRyxDQUFDLElBQUksU0FBUyxZQUFZLENBQUM7QUFBQSxFQUN0QyxDQUFDO0FBRUQsT0FBSyxtQ0FBbUMsTUFBTTtBQUM3QyxVQUFNLE9BQU87QUFDYixVQUFNLFNBQVMsYUFBYSxNQUFNO0FBQUEsTUFDakMsdUJBQXVCLEVBQUUsVUFBVSxDQUFDLFFBQVEsSUFBSSxFQUFFO0FBQUEsSUFDbkQsQ0FBQztBQUVELFdBQU8sR0FBRyxPQUFPLFNBQVMsRUFBRSxTQUFTLDZCQUE2QixDQUFDO0FBQUEsRUFDcEUsQ0FBQztBQUVELE9BQUssaURBQWlELE1BQU07QUFDM0QsVUFBTSxPQUFPO0FBQ2IsVUFBTSxTQUFTLGFBQWEsSUFBSTtBQUNoQyxXQUFPLFlBQVksT0FBTyxTQUFTLEdBQUcsT0FBTztBQUFBLEVBQzlDLENBQUM7QUFFRCxPQUFLLHNDQUFzQyxNQUFNO0FBQ2hELFVBQU0sT0FBTztBQUNiLFVBQU0sU0FBUyxhQUFhLE1BQU07QUFBQSxNQUNqQyx5QkFBeUI7QUFBQSxJQUMxQixDQUFDO0FBQ0QsV0FBTyxZQUFZLE9BQU8sU0FBUyxHQUFHLDBCQUEwQjtBQUFBLEVBQ2pFLENBQUM7QUFFRCxPQUFLLDJDQUEyQyxNQUFNO0FBQ3JELFVBQU0sT0FBTztBQUNiLFVBQU0sU0FBUyxhQUFhLE1BQU07QUFBQSxNQUNqQyxtQkFBbUI7QUFBQSxRQUNsQixVQUFVO0FBQUEsVUFDVDtBQUFBLFlBQ0MsZUFBZTtBQUFBLFlBQ2YsWUFBWSxDQUFDLEtBQUssU0FBUztBQUMxQixxQkFBTyxLQUFLLFVBQVUsU0FBUyxHQUFHO0FBQUEsWUFDbkM7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFDRCxXQUFPLFlBQVksT0FBTyxTQUFTLEdBQUcsNENBQTRDO0FBQUEsRUFDbkYsQ0FBQztBQUVELE9BQUssd0RBQXdELE1BQU07QUFDbEUsVUFBTSxPQUFPO0FBQ2IsVUFBTSxTQUFTLGFBQWEsTUFBTTtBQUFBLE1BQ2pDLG1CQUFtQjtBQUFBLFFBQ2xCLFVBQVU7QUFBQSxVQUNUO0FBQUEsWUFDQyxlQUFlO0FBQUEsWUFDZixZQUFZLENBQUMsS0FBSyxTQUFTO0FBQzFCLGtCQUFJLEtBQUssY0FBYyxPQUFPO0FBQzdCLHVCQUFPO0FBQUEsY0FDUjtBQUNBLHFCQUFPLEtBQUssWUFBWSxLQUFLO0FBQUEsWUFDOUI7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFFRCxXQUFPLFlBQVksT0FBTyxTQUFTLEdBQUcsaURBQWlEO0FBQUEsRUFDeEYsQ0FBQztBQUVELE9BQUssMkRBQTJELE1BQU07QUFDckUsVUFBTSxPQUFPO0FBQ2IsVUFBTSxTQUFTLGFBQWEsTUFBTTtBQUFBLE1BQ2pDLG1CQUFtQjtBQUFBLFFBQ2xCLFVBQVU7QUFBQSxVQUNUO0FBQUEsWUFDQyxlQUFlO0FBQUEsWUFDZixZQUFZLE1BQU07QUFBQSxVQUNuQjtBQUFBLFVBQ0E7QUFBQTtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQ0QsV0FBTyxZQUFZLE9BQU8sU0FBUyxHQUFHLDBEQUEwRDtBQUFBLEVBQ2pHLENBQUM7QUFFRCxRQUFNLHdCQUF3QixNQUFNO0FBRW5DLFNBQUssMkRBQTJELE1BQU07QUFDckUsWUFBTSxPQUFPO0FBQ2IsWUFBTSxTQUFTLGFBQWEsTUFBTTtBQUFBLFFBQ2pDLHNCQUFzQjtBQUFBLE1BQ3ZCLENBQUM7QUFDRCxZQUFNLE1BQU0sT0FBTyxTQUFTO0FBQzVCLGFBQU8sWUFBWSxLQUFLLDZEQUE2RDtBQUFBLElBQ3RGLENBQUM7QUFFRCxTQUFLLHVDQUF1QyxNQUFNO0FBQ2pELFlBQU0sT0FBTztBQUNiLFlBQU0sU0FBUyxhQUFhLE1BQU07QUFBQSxRQUNqQyxzQkFBc0I7QUFBQSxNQUN2QixDQUFDO0FBQ0QsYUFBTyxZQUFZLE9BQU8sU0FBUyxHQUFHLCtFQUErRTtBQUFBLElBQ3RILENBQUM7QUFFRCxTQUFLLGdDQUFnQyxNQUFNO0FBQzFDLFlBQU0sT0FBTztBQUNiLFlBQU0sU0FBUyxhQUFhLE1BQU07QUFBQSxRQUNqQyxzQkFBc0I7QUFBQSxNQUN2QixDQUFDO0FBQ0QsYUFBTyxZQUFZLE9BQU8sU0FBUyxHQUFHLGtGQUFrRjtBQUFBLElBQ3pILENBQUM7QUFFRCxTQUFLLG1DQUFtQyxNQUFNO0FBQzdDLFlBQU0sT0FBTztBQUNiLFlBQU0sU0FBUyxhQUFhLE1BQU07QUFBQSxRQUNqQyxzQkFBc0I7QUFBQSxNQUN2QixDQUFDO0FBQ0QsYUFBTyxZQUFZLE9BQU8sU0FBUyxHQUFHLHlFQUF5RTtBQUFBLElBQ2hILENBQUM7QUFFRCxTQUFLLDhCQUE4QixNQUFNO0FBQ3hDLFlBQU0sT0FBTztBQUNiLFlBQU0sU0FBUyxhQUFhLE1BQU07QUFBQSxRQUNqQyxzQkFBc0I7QUFBQSxNQUN2QixDQUFDO0FBQ0QsYUFBTyxZQUFZLE9BQU8sU0FBUyxHQUFHLG9EQUFvRDtBQUFBLElBQzNGLENBQUM7QUFFRCxTQUFLLHNCQUFzQixNQUFNO0FBQ2hDLFlBQU0sT0FBTztBQUNiLFlBQU0sU0FBUyxhQUFhLE1BQU07QUFBQSxRQUNqQyxzQkFBc0I7QUFBQSxNQUN2QixDQUFDO0FBQ0QsYUFBTyxZQUFZLE9BQU8sU0FBUyxHQUFHLHdDQUF3QztBQUFBLElBQy9FLENBQUM7QUFFRCxTQUFLLGdEQUFnRCxNQUFNO0FBQzFELFlBQU0sT0FBTztBQUNiLFlBQU0sU0FBUyxhQUFhLE1BQU07QUFBQSxRQUNqQyxzQkFBc0I7QUFBQSxRQUN0QixhQUFhLEVBQUUsU0FBUyxDQUFDLFFBQVEsRUFBRTtBQUFBLE1BQ3BDLENBQUM7QUFDRCxhQUFPLFlBQVksT0FBTyxTQUFTLEdBQUcsbUZBQW1GO0FBQUEsSUFDMUgsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
