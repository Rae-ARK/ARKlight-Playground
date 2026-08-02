import * as assert from "assert";
import { computeDefaultDocumentColors } from "../../../common/languages/defaultDocumentColorsComputer.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
suite("Default Document Colors Computer", () => {
  class TestDocumentModel {
    constructor(content) {
      this.content = content;
    }
    getValue() {
      return this.content;
    }
    positionAt(offset) {
      const lines = this.content.substring(0, offset).split("\n");
      return {
        lineNumber: lines.length,
        column: lines[lines.length - 1].length + 1
      };
    }
    findMatches(regex) {
      return [...this.content.matchAll(regex)];
    }
  }
  ensureNoDisposablesAreLeakedInTestSuite();
  test("Hex colors in strings should be detected", () => {
    const model = new TestDocumentModel(`const color = '#ff0000';`);
    const colors = computeDefaultDocumentColors(model);
    assert.strictEqual(colors.length, 1, "Should detect one hex color");
    assert.strictEqual(colors[0].color.red, 1, "Red component should be 1 (255/255)");
    assert.strictEqual(colors[0].color.green, 0, "Green component should be 0");
    assert.strictEqual(colors[0].color.blue, 0, "Blue component should be 0");
    assert.strictEqual(colors[0].color.alpha, 1, "Alpha should be 1");
  });
  test("Hex colors in double quotes should be detected", () => {
    const model = new TestDocumentModel('const color = "#00ff00";');
    const colors = computeDefaultDocumentColors(model);
    assert.strictEqual(colors.length, 1, "Should detect one hex color");
    assert.strictEqual(colors[0].color.red, 0, "Red component should be 0");
    assert.strictEqual(colors[0].color.green, 1, "Green component should be 1 (255/255)");
    assert.strictEqual(colors[0].color.blue, 0, "Blue component should be 0");
  });
  test("Multiple hex colors in array should be detected", () => {
    const model = new TestDocumentModel(`const colors = ['#ff0000', '#00ff00', '#0000ff'];`);
    const colors = computeDefaultDocumentColors(model);
    assert.strictEqual(colors.length, 3, "Should detect three hex colors");
    assert.strictEqual(colors[0].color.red, 1, "First color red component should be 1");
    assert.strictEqual(colors[0].color.green, 0, "First color green component should be 0");
    assert.strictEqual(colors[0].color.blue, 0, "First color blue component should be 0");
    assert.strictEqual(colors[1].color.red, 0, "Second color red component should be 0");
    assert.strictEqual(colors[1].color.green, 1, "Second color green component should be 1");
    assert.strictEqual(colors[1].color.blue, 0, "Second color blue component should be 0");
    assert.strictEqual(colors[2].color.red, 0, "Third color red component should be 0");
    assert.strictEqual(colors[2].color.green, 0, "Third color green component should be 0");
    assert.strictEqual(colors[2].color.blue, 1, "Third color blue component should be 1");
  });
  test("Existing functionality should still work", () => {
    const testCases = [
      { content: `const color = ' #ff0000';`, name: "hex with space before" },
      { content: "#ff0000", name: "hex at start of line" },
      { content: "  #ff0000", name: "hex with whitespace before" }
    ];
    testCases.forEach((testCase) => {
      const model = new TestDocumentModel(testCase.content);
      const colors = computeDefaultDocumentColors(model);
      assert.strictEqual(colors.length, 1, `Should still detect ${testCase.name}`);
    });
  });
  test("8-digit hex colors should also work", () => {
    const model = new TestDocumentModel(`const color = '#ff0000ff';`);
    const colors = computeDefaultDocumentColors(model);
    assert.strictEqual(colors.length, 1, "Should detect one 8-digit hex color");
    assert.strictEqual(colors[0].color.red, 1, "Red component should be 1");
    assert.strictEqual(colors[0].color.green, 0, "Green component should be 0");
    assert.strictEqual(colors[0].color.blue, 0, "Blue component should be 0");
    assert.strictEqual(colors[0].color.alpha, 1, "Alpha should be 1 (ff/255)");
  });
  test("hsl 100 percent saturation works with decimals", () => {
    const model = new TestDocumentModel("const color = hsl(253, 100.00%, 47.10%);");
    const colors = computeDefaultDocumentColors(model);
    assert.strictEqual(colors.length, 1, "Should detect one hsl color");
  });
  test("hsl 100 percent saturation works without decimals", () => {
    const model = new TestDocumentModel("const color = hsl(253, 100%, 47.10%);");
    const colors = computeDefaultDocumentColors(model);
    assert.strictEqual(colors.length, 1, "Should detect one hsl color");
  });
  test("hsl not 100 percent saturation should also work", () => {
    const model = new TestDocumentModel("const color = hsl(0, 83.60%, 47.80%);");
    const colors = computeDefaultDocumentColors(model);
    assert.strictEqual(colors.length, 1, "Should detect one hsl color");
  });
  test("hsl with decimal hue values should work", () => {
    const testCases = [
      { content: "hsl(253.5, 100%, 50%)", name: "decimal hue" },
      { content: "hsl(360.0, 50%, 50%)", name: "360.0 hue" },
      { content: "hsl(100.5, 50.5%, 50.5%)", name: "all decimals" },
      { content: "hsl(0.5, 50%, 50%)", name: "small decimal hue" },
      { content: "hsl(359.9, 100%, 50%)", name: "near-max decimal hue" }
    ];
    testCases.forEach((testCase) => {
      const model = new TestDocumentModel(`const color = ${testCase.content};`);
      const colors = computeDefaultDocumentColors(model);
      assert.strictEqual(colors.length, 1, `Should detect hsl color with ${testCase.name}: ${testCase.content}`);
    });
  });
  test("hsla with decimal values should work", () => {
    const testCases = [
      { content: "hsla(253.5, 100%, 50%, 0.5)", name: "decimal hue with alpha" },
      { content: "hsla(360.0, 50.5%, 50.5%, 1)", name: "all decimals with alpha 1" },
      { content: "hsla(0.5, 50%, 50%, 0.25)", name: "small decimal hue with alpha" }
    ];
    testCases.forEach((testCase) => {
      const model = new TestDocumentModel(`const color = ${testCase.content};`);
      const colors = computeDefaultDocumentColors(model);
      assert.strictEqual(colors.length, 1, `Should detect hsla color with ${testCase.name}: ${testCase.content}`);
    });
  });
  test("hsl with space separator (CSS Level 4 syntax) should work", () => {
    const testCases = [
      { content: "hsl(253 100% 50%)", name: "space-separated" },
      { content: "hsl(253.5 100% 50%)", name: "space-separated with decimal hue" },
      { content: "hsla(253 100% 50% / 0.5)", name: "hsla with slash separator for alpha" },
      { content: "hsla(253.5 100% 50% / 0.5)", name: "hsla with decimal hue and slash separator" },
      { content: "hsla(253 100% 50% / 1)", name: "hsla with slash and alpha 1" }
    ];
    testCases.forEach((testCase) => {
      const model = new TestDocumentModel(`const color = ${testCase.content};`);
      const colors = computeDefaultDocumentColors(model);
      assert.strictEqual(colors.length, 1, `Should detect hsl color with ${testCase.name}: ${testCase.content}`);
    });
  });
  test("rgb and rgba with CSS Level 4 space-separated syntax should work", () => {
    const testCases = [
      { content: "rgb(255 0 0)", name: "rgb space-separated" },
      { content: "rgb(128 128 128)", name: "rgb space-separated gray" },
      { content: "rgba(255 0 0 / 0.5)", name: "rgba with slash separator for alpha" },
      { content: "rgba(128 128 128 / 0.8)", name: "rgba gray with slash separator" },
      { content: "rgba(255 0 0 / 1)", name: "rgba with slash and alpha 1" },
      // Traditional comma syntax should still work
      { content: "rgb(255, 0, 0)", name: "rgb comma-separated (traditional)" },
      { content: "rgba(255, 0, 0, 0.5)", name: "rgba comma-separated (traditional)" }
    ];
    testCases.forEach((testCase) => {
      const model = new TestDocumentModel(`const color = ${testCase.content};`);
      const colors = computeDefaultDocumentColors(model);
      assert.strictEqual(colors.length, 1, `Should detect rgb/rgba color with ${testCase.name}: ${testCase.content}`);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci90ZXN0L2NvbW1vbi9sYW5ndWFnZXMvZGVmYXVsdERvY3VtZW50Q29sb3JzQ29tcHV0ZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgKiBhcyBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGNvbXB1dGVEZWZhdWx0RG9jdW1lbnRDb2xvcnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL2RlZmF1bHREb2N1bWVudENvbG9yc0NvbXB1dGVyLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuXG5zdWl0ZSgnRGVmYXVsdCBEb2N1bWVudCBDb2xvcnMgQ29tcHV0ZXInLCAoKSA9PiB7XG5cblx0Y2xhc3MgVGVzdERvY3VtZW50TW9kZWwge1xuXHRcdGNvbnN0cnVjdG9yKHByaXZhdGUgY29udGVudDogc3RyaW5nKSB7IH1cblxuXHRcdGdldFZhbHVlKCk6IHN0cmluZyB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jb250ZW50O1xuXHRcdH1cblxuXHRcdHBvc2l0aW9uQXQob2Zmc2V0OiBudW1iZXIpIHtcblx0XHRcdGNvbnN0IGxpbmVzID0gdGhpcy5jb250ZW50LnN1YnN0cmluZygwLCBvZmZzZXQpLnNwbGl0KCdcXG4nKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGxpbmVOdW1iZXI6IGxpbmVzLmxlbmd0aCxcblx0XHRcdFx0Y29sdW1uOiBsaW5lc1tsaW5lcy5sZW5ndGggLSAxXS5sZW5ndGggKyAxXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGZpbmRNYXRjaGVzKHJlZ2V4OiBSZWdFeHApOiBSZWdFeHBNYXRjaEFycmF5W10ge1xuXHRcdFx0cmV0dXJuIFsuLi50aGlzLmNvbnRlbnQubWF0Y2hBbGwocmVnZXgpXTtcblx0XHR9XG5cdH1cblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdIZXggY29sb3JzIGluIHN0cmluZ3Mgc2hvdWxkIGJlIGRldGVjdGVkJywgKCkgPT4ge1xuXHRcdC8vIFRlc3QgY2FzZSBmcm9tIGlzc3VlOiBoZXggY29sb3IgaW5zaWRlIHN0cmluZyBpcyBub3QgZGV0ZWN0ZWRcblx0XHRjb25zdCBtb2RlbCA9IG5ldyBUZXN0RG9jdW1lbnRNb2RlbChgY29uc3QgY29sb3IgPSAnI2ZmMDAwMCc7YCk7XG5cdFx0Y29uc3QgY29sb3JzID0gY29tcHV0ZURlZmF1bHREb2N1bWVudENvbG9ycyhtb2RlbCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sb3JzLmxlbmd0aCwgMSwgJ1Nob3VsZCBkZXRlY3Qgb25lIGhleCBjb2xvcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2xvcnNbMF0uY29sb3IucmVkLCAxLCAnUmVkIGNvbXBvbmVudCBzaG91bGQgYmUgMSAoMjU1LzI1NSknKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sb3JzWzBdLmNvbG9yLmdyZWVuLCAwLCAnR3JlZW4gY29tcG9uZW50IHNob3VsZCBiZSAwJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbG9yc1swXS5jb2xvci5ibHVlLCAwLCAnQmx1ZSBjb21wb25lbnQgc2hvdWxkIGJlIDAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sb3JzWzBdLmNvbG9yLmFscGhhLCAxLCAnQWxwaGEgc2hvdWxkIGJlIDEnKTtcblx0fSk7XG5cblx0dGVzdCgnSGV4IGNvbG9ycyBpbiBkb3VibGUgcXVvdGVzIHNob3VsZCBiZSBkZXRlY3RlZCcsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IG5ldyBUZXN0RG9jdW1lbnRNb2RlbCgnY29uc3QgY29sb3IgPSBcIiMwMGZmMDBcIjsnKTtcblx0XHRjb25zdCBjb2xvcnMgPSBjb21wdXRlRGVmYXVsdERvY3VtZW50Q29sb3JzKG1vZGVsKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2xvcnMubGVuZ3RoLCAxLCAnU2hvdWxkIGRldGVjdCBvbmUgaGV4IGNvbG9yJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbG9yc1swXS5jb2xvci5yZWQsIDAsICdSZWQgY29tcG9uZW50IHNob3VsZCBiZSAwJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbG9yc1swXS5jb2xvci5ncmVlbiwgMSwgJ0dyZWVuIGNvbXBvbmVudCBzaG91bGQgYmUgMSAoMjU1LzI1NSknKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sb3JzWzBdLmNvbG9yLmJsdWUsIDAsICdCbHVlIGNvbXBvbmVudCBzaG91bGQgYmUgMCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdNdWx0aXBsZSBoZXggY29sb3JzIGluIGFycmF5IHNob3VsZCBiZSBkZXRlY3RlZCcsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IG5ldyBUZXN0RG9jdW1lbnRNb2RlbChgY29uc3QgY29sb3JzID0gWycjZmYwMDAwJywgJyMwMGZmMDAnLCAnIzAwMDBmZiddO2ApO1xuXHRcdGNvbnN0IGNvbG9ycyA9IGNvbXB1dGVEZWZhdWx0RG9jdW1lbnRDb2xvcnMobW9kZWwpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbG9ycy5sZW5ndGgsIDMsICdTaG91bGQgZGV0ZWN0IHRocmVlIGhleCBjb2xvcnMnKTtcblxuXHRcdC8vIEZpcnN0IGNvbG9yOiByZWRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sb3JzWzBdLmNvbG9yLnJlZCwgMSwgJ0ZpcnN0IGNvbG9yIHJlZCBjb21wb25lbnQgc2hvdWxkIGJlIDEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sb3JzWzBdLmNvbG9yLmdyZWVuLCAwLCAnRmlyc3QgY29sb3IgZ3JlZW4gY29tcG9uZW50IHNob3VsZCBiZSAwJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbG9yc1swXS5jb2xvci5ibHVlLCAwLCAnRmlyc3QgY29sb3IgYmx1ZSBjb21wb25lbnQgc2hvdWxkIGJlIDAnKTtcblxuXHRcdC8vIFNlY29uZCBjb2xvcjogZ3JlZW5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sb3JzWzFdLmNvbG9yLnJlZCwgMCwgJ1NlY29uZCBjb2xvciByZWQgY29tcG9uZW50IHNob3VsZCBiZSAwJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbG9yc1sxXS5jb2xvci5ncmVlbiwgMSwgJ1NlY29uZCBjb2xvciBncmVlbiBjb21wb25lbnQgc2hvdWxkIGJlIDEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sb3JzWzFdLmNvbG9yLmJsdWUsIDAsICdTZWNvbmQgY29sb3IgYmx1ZSBjb21wb25lbnQgc2hvdWxkIGJlIDAnKTtcblxuXHRcdC8vIFRoaXJkIGNvbG9yOiBibHVlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbG9yc1syXS5jb2xvci5yZWQsIDAsICdUaGlyZCBjb2xvciByZWQgY29tcG9uZW50IHNob3VsZCBiZSAwJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbG9yc1syXS5jb2xvci5ncmVlbiwgMCwgJ1RoaXJkIGNvbG9yIGdyZWVuIGNvbXBvbmVudCBzaG91bGQgYmUgMCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2xvcnNbMl0uY29sb3IuYmx1ZSwgMSwgJ1RoaXJkIGNvbG9yIGJsdWUgY29tcG9uZW50IHNob3VsZCBiZSAxJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0V4aXN0aW5nIGZ1bmN0aW9uYWxpdHkgc2hvdWxkIHN0aWxsIHdvcmsnLCAoKSA9PiB7XG5cdFx0Ly8gVGVzdCBjYXNlcyB0aGF0IHdlcmUgYWxyZWFkeSB3b3JraW5nXG5cdFx0Y29uc3QgdGVzdENhc2VzID0gW1xuXHRcdFx0eyBjb250ZW50OiBgY29uc3QgY29sb3IgPSAnICNmZjAwMDAnO2AsIG5hbWU6ICdoZXggd2l0aCBzcGFjZSBiZWZvcmUnIH0sXG5cdFx0XHR7IGNvbnRlbnQ6ICcjZmYwMDAwJywgbmFtZTogJ2hleCBhdCBzdGFydCBvZiBsaW5lJyB9LFxuXHRcdFx0eyBjb250ZW50OiAnICAjZmYwMDAwJywgbmFtZTogJ2hleCB3aXRoIHdoaXRlc3BhY2UgYmVmb3JlJyB9XG5cdFx0XTtcblxuXHRcdHRlc3RDYXNlcy5mb3JFYWNoKHRlc3RDYXNlID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gbmV3IFRlc3REb2N1bWVudE1vZGVsKHRlc3RDYXNlLmNvbnRlbnQpO1xuXHRcdFx0Y29uc3QgY29sb3JzID0gY29tcHV0ZURlZmF1bHREb2N1bWVudENvbG9ycyhtb2RlbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sb3JzLmxlbmd0aCwgMSwgYFNob3VsZCBzdGlsbCBkZXRlY3QgJHt0ZXN0Q2FzZS5uYW1lfWApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCc4LWRpZ2l0IGhleCBjb2xvcnMgc2hvdWxkIGFsc28gd29yaycsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IG5ldyBUZXN0RG9jdW1lbnRNb2RlbChgY29uc3QgY29sb3IgPSAnI2ZmMDAwMGZmJztgKTtcblx0XHRjb25zdCBjb2xvcnMgPSBjb21wdXRlRGVmYXVsdERvY3VtZW50Q29sb3JzKG1vZGVsKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2xvcnMubGVuZ3RoLCAxLCAnU2hvdWxkIGRldGVjdCBvbmUgOC1kaWdpdCBoZXggY29sb3InKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sb3JzWzBdLmNvbG9yLnJlZCwgMSwgJ1JlZCBjb21wb25lbnQgc2hvdWxkIGJlIDEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sb3JzWzBdLmNvbG9yLmdyZWVuLCAwLCAnR3JlZW4gY29tcG9uZW50IHNob3VsZCBiZSAwJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbG9yc1swXS5jb2xvci5ibHVlLCAwLCAnQmx1ZSBjb21wb25lbnQgc2hvdWxkIGJlIDAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sb3JzWzBdLmNvbG9yLmFscGhhLCAxLCAnQWxwaGEgc2hvdWxkIGJlIDEgKGZmLzI1NSknKTtcblx0fSk7XG5cblx0dGVzdCgnaHNsIDEwMCBwZXJjZW50IHNhdHVyYXRpb24gd29ya3Mgd2l0aCBkZWNpbWFscycsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IG5ldyBUZXN0RG9jdW1lbnRNb2RlbCgnY29uc3QgY29sb3IgPSBoc2woMjUzLCAxMDAuMDAlLCA0Ny4xMCUpOycpO1xuXHRcdGNvbnN0IGNvbG9ycyA9IGNvbXB1dGVEZWZhdWx0RG9jdW1lbnRDb2xvcnMobW9kZWwpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbG9ycy5sZW5ndGgsIDEsICdTaG91bGQgZGV0ZWN0IG9uZSBoc2wgY29sb3InKTtcblx0fSk7XG5cblx0dGVzdCgnaHNsIDEwMCBwZXJjZW50IHNhdHVyYXRpb24gd29ya3Mgd2l0aG91dCBkZWNpbWFscycsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IG5ldyBUZXN0RG9jdW1lbnRNb2RlbCgnY29uc3QgY29sb3IgPSBoc2woMjUzLCAxMDAlLCA0Ny4xMCUpOycpO1xuXHRcdGNvbnN0IGNvbG9ycyA9IGNvbXB1dGVEZWZhdWx0RG9jdW1lbnRDb2xvcnMobW9kZWwpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbG9ycy5sZW5ndGgsIDEsICdTaG91bGQgZGV0ZWN0IG9uZSBoc2wgY29sb3InKTtcblx0fSk7XG5cblx0dGVzdCgnaHNsIG5vdCAxMDAgcGVyY2VudCBzYXR1cmF0aW9uIHNob3VsZCBhbHNvIHdvcmsnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBuZXcgVGVzdERvY3VtZW50TW9kZWwoJ2NvbnN0IGNvbG9yID0gaHNsKDAsIDgzLjYwJSwgNDcuODAlKTsnKTtcblx0XHRjb25zdCBjb2xvcnMgPSBjb21wdXRlRGVmYXVsdERvY3VtZW50Q29sb3JzKG1vZGVsKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2xvcnMubGVuZ3RoLCAxLCAnU2hvdWxkIGRldGVjdCBvbmUgaHNsIGNvbG9yJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hzbCB3aXRoIGRlY2ltYWwgaHVlIHZhbHVlcyBzaG91bGQgd29yaycsICgpID0+IHtcblx0XHQvLyBUZXN0IGNhc2UgZnJvbSBpc3N1ZSAjMTgwNDM2IGNvbW1lbnRcblx0XHRjb25zdCB0ZXN0Q2FzZXMgPSBbXG5cdFx0XHR7IGNvbnRlbnQ6ICdoc2woMjUzLjUsIDEwMCUsIDUwJSknLCBuYW1lOiAnZGVjaW1hbCBodWUnIH0sXG5cdFx0XHR7IGNvbnRlbnQ6ICdoc2woMzYwLjAsIDUwJSwgNTAlKScsIG5hbWU6ICczNjAuMCBodWUnIH0sXG5cdFx0XHR7IGNvbnRlbnQ6ICdoc2woMTAwLjUsIDUwLjUlLCA1MC41JSknLCBuYW1lOiAnYWxsIGRlY2ltYWxzJyB9LFxuXHRcdFx0eyBjb250ZW50OiAnaHNsKDAuNSwgNTAlLCA1MCUpJywgbmFtZTogJ3NtYWxsIGRlY2ltYWwgaHVlJyB9LFxuXHRcdFx0eyBjb250ZW50OiAnaHNsKDM1OS45LCAxMDAlLCA1MCUpJywgbmFtZTogJ25lYXItbWF4IGRlY2ltYWwgaHVlJyB9XG5cdFx0XTtcblxuXHRcdHRlc3RDYXNlcy5mb3JFYWNoKHRlc3RDYXNlID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gbmV3IFRlc3REb2N1bWVudE1vZGVsKGBjb25zdCBjb2xvciA9ICR7dGVzdENhc2UuY29udGVudH07YCk7XG5cdFx0XHRjb25zdCBjb2xvcnMgPSBjb21wdXRlRGVmYXVsdERvY3VtZW50Q29sb3JzKG1vZGVsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2xvcnMubGVuZ3RoLCAxLCBgU2hvdWxkIGRldGVjdCBoc2wgY29sb3Igd2l0aCAke3Rlc3RDYXNlLm5hbWV9OiAke3Rlc3RDYXNlLmNvbnRlbnR9YCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hzbGEgd2l0aCBkZWNpbWFsIHZhbHVlcyBzaG91bGQgd29yaycsICgpID0+IHtcblx0XHRjb25zdCB0ZXN0Q2FzZXMgPSBbXG5cdFx0XHR7IGNvbnRlbnQ6ICdoc2xhKDI1My41LCAxMDAlLCA1MCUsIDAuNSknLCBuYW1lOiAnZGVjaW1hbCBodWUgd2l0aCBhbHBoYScgfSxcblx0XHRcdHsgY29udGVudDogJ2hzbGEoMzYwLjAsIDUwLjUlLCA1MC41JSwgMSknLCBuYW1lOiAnYWxsIGRlY2ltYWxzIHdpdGggYWxwaGEgMScgfSxcblx0XHRcdHsgY29udGVudDogJ2hzbGEoMC41LCA1MCUsIDUwJSwgMC4yNSknLCBuYW1lOiAnc21hbGwgZGVjaW1hbCBodWUgd2l0aCBhbHBoYScgfVxuXHRcdF07XG5cblx0XHR0ZXN0Q2FzZXMuZm9yRWFjaCh0ZXN0Q2FzZSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IG5ldyBUZXN0RG9jdW1lbnRNb2RlbChgY29uc3QgY29sb3IgPSAke3Rlc3RDYXNlLmNvbnRlbnR9O2ApO1xuXHRcdFx0Y29uc3QgY29sb3JzID0gY29tcHV0ZURlZmF1bHREb2N1bWVudENvbG9ycyhtb2RlbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sb3JzLmxlbmd0aCwgMSwgYFNob3VsZCBkZXRlY3QgaHNsYSBjb2xvciB3aXRoICR7dGVzdENhc2UubmFtZX06ICR7dGVzdENhc2UuY29udGVudH1gKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaHNsIHdpdGggc3BhY2Ugc2VwYXJhdG9yIChDU1MgTGV2ZWwgNCBzeW50YXgpIHNob3VsZCB3b3JrJywgKCkgPT4ge1xuXHRcdC8vIENTUyBMZXZlbCA0IGFsbG93cyBzcGFjZS1zZXBhcmF0ZWQgdmFsdWVzIGluc3RlYWQgb2YgY29tbWEtc2VwYXJhdGVkXG5cdFx0Y29uc3QgdGVzdENhc2VzID0gW1xuXHRcdFx0eyBjb250ZW50OiAnaHNsKDI1MyAxMDAlIDUwJSknLCBuYW1lOiAnc3BhY2Utc2VwYXJhdGVkJyB9LFxuXHRcdFx0eyBjb250ZW50OiAnaHNsKDI1My41IDEwMCUgNTAlKScsIG5hbWU6ICdzcGFjZS1zZXBhcmF0ZWQgd2l0aCBkZWNpbWFsIGh1ZScgfSxcblx0XHRcdHsgY29udGVudDogJ2hzbGEoMjUzIDEwMCUgNTAlIC8gMC41KScsIG5hbWU6ICdoc2xhIHdpdGggc2xhc2ggc2VwYXJhdG9yIGZvciBhbHBoYScgfSxcblx0XHRcdHsgY29udGVudDogJ2hzbGEoMjUzLjUgMTAwJSA1MCUgLyAwLjUpJywgbmFtZTogJ2hzbGEgd2l0aCBkZWNpbWFsIGh1ZSBhbmQgc2xhc2ggc2VwYXJhdG9yJyB9LFxuXHRcdFx0eyBjb250ZW50OiAnaHNsYSgyNTMgMTAwJSA1MCUgLyAxKScsIG5hbWU6ICdoc2xhIHdpdGggc2xhc2ggYW5kIGFscGhhIDEnIH1cblx0XHRdO1xuXG5cdFx0dGVzdENhc2VzLmZvckVhY2godGVzdENhc2UgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBuZXcgVGVzdERvY3VtZW50TW9kZWwoYGNvbnN0IGNvbG9yID0gJHt0ZXN0Q2FzZS5jb250ZW50fTtgKTtcblx0XHRcdGNvbnN0IGNvbG9ycyA9IGNvbXB1dGVEZWZhdWx0RG9jdW1lbnRDb2xvcnMobW9kZWwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbG9ycy5sZW5ndGgsIDEsIGBTaG91bGQgZGV0ZWN0IGhzbCBjb2xvciB3aXRoICR7dGVzdENhc2UubmFtZX06ICR7dGVzdENhc2UuY29udGVudH1gKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmdiIGFuZCByZ2JhIHdpdGggQ1NTIExldmVsIDQgc3BhY2Utc2VwYXJhdGVkIHN5bnRheCBzaG91bGQgd29yaycsICgpID0+IHtcblx0XHQvLyBDU1MgTGV2ZWwgNCBhbGxvd3Mgc3BhY2Utc2VwYXJhdGVkIHZhbHVlcyBmb3IgUkdCL1JHQkFcblx0XHRjb25zdCB0ZXN0Q2FzZXMgPSBbXG5cdFx0XHR7IGNvbnRlbnQ6ICdyZ2IoMjU1IDAgMCknLCBuYW1lOiAncmdiIHNwYWNlLXNlcGFyYXRlZCcgfSxcblx0XHRcdHsgY29udGVudDogJ3JnYigxMjggMTI4IDEyOCknLCBuYW1lOiAncmdiIHNwYWNlLXNlcGFyYXRlZCBncmF5JyB9LFxuXHRcdFx0eyBjb250ZW50OiAncmdiYSgyNTUgMCAwIC8gMC41KScsIG5hbWU6ICdyZ2JhIHdpdGggc2xhc2ggc2VwYXJhdG9yIGZvciBhbHBoYScgfSxcblx0XHRcdHsgY29udGVudDogJ3JnYmEoMTI4IDEyOCAxMjggLyAwLjgpJywgbmFtZTogJ3JnYmEgZ3JheSB3aXRoIHNsYXNoIHNlcGFyYXRvcicgfSxcblx0XHRcdHsgY29udGVudDogJ3JnYmEoMjU1IDAgMCAvIDEpJywgbmFtZTogJ3JnYmEgd2l0aCBzbGFzaCBhbmQgYWxwaGEgMScgfSxcblx0XHRcdC8vIFRyYWRpdGlvbmFsIGNvbW1hIHN5bnRheCBzaG91bGQgc3RpbGwgd29ya1xuXHRcdFx0eyBjb250ZW50OiAncmdiKDI1NSwgMCwgMCknLCBuYW1lOiAncmdiIGNvbW1hLXNlcGFyYXRlZCAodHJhZGl0aW9uYWwpJyB9LFxuXHRcdFx0eyBjb250ZW50OiAncmdiYSgyNTUsIDAsIDAsIDAuNSknLCBuYW1lOiAncmdiYSBjb21tYS1zZXBhcmF0ZWQgKHRyYWRpdGlvbmFsKScgfVxuXHRcdF07XG5cblx0XHR0ZXN0Q2FzZXMuZm9yRWFjaCh0ZXN0Q2FzZSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IG5ldyBUZXN0RG9jdW1lbnRNb2RlbChgY29uc3QgY29sb3IgPSAke3Rlc3RDYXNlLmNvbnRlbnR9O2ApO1xuXHRcdFx0Y29uc3QgY29sb3JzID0gY29tcHV0ZURlZmF1bHREb2N1bWVudENvbG9ycyhtb2RlbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sb3JzLmxlbmd0aCwgMSwgYFNob3VsZCBkZXRlY3QgcmdiL3JnYmEgY29sb3Igd2l0aCAke3Rlc3RDYXNlLm5hbWV9OiAke3Rlc3RDYXNlLmNvbnRlbnR9YCk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFJQSxZQUFZLFlBQVk7QUFDeEIsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUywrQ0FBK0M7QUFFeEQsTUFBTSxvQ0FBb0MsTUFBTTtBQUFBLEVBRS9DLE1BQU0sa0JBQWtCO0FBQUEsSUFDdkIsWUFBb0IsU0FBaUI7QUFBakI7QUFBQSxJQUFtQjtBQUFBLElBRXZDLFdBQW1CO0FBQ2xCLGFBQU8sS0FBSztBQUFBLElBQ2I7QUFBQSxJQUVBLFdBQVcsUUFBZ0I7QUFDMUIsWUFBTSxRQUFRLEtBQUssUUFBUSxVQUFVLEdBQUcsTUFBTSxFQUFFLE1BQU0sSUFBSTtBQUMxRCxhQUFPO0FBQUEsUUFDTixZQUFZLE1BQU07QUFBQSxRQUNsQixRQUFRLE1BQU0sTUFBTSxTQUFTLENBQUMsRUFBRSxTQUFTO0FBQUEsTUFDMUM7QUFBQSxJQUNEO0FBQUEsSUFFQSxZQUFZLE9BQW1DO0FBQzlDLGFBQU8sQ0FBQyxHQUFHLEtBQUssUUFBUSxTQUFTLEtBQUssQ0FBQztBQUFBLElBQ3hDO0FBQUEsRUFDRDtBQUVBLDBDQUF3QztBQUV4QyxPQUFLLDRDQUE0QyxNQUFNO0FBRXRELFVB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
