import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { collapseToShorthands, formatMatchedStyles } from "../../common/cssHelpers.js";
function collapse(props) {
  return collapseToShorthands(new Map(Object.entries(props)));
}
suite("collapseToShorthands", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("margin: all sides equal \u2192 1-value", () => {
    assert.deepStrictEqual(collapse({
      "margin-top": "10px",
      "margin-right": "10px",
      "margin-bottom": "10px",
      "margin-left": "10px"
    }), ["margin: 10px;"]);
  });
  test("padding: vertical/horizontal \u2192 2-value", () => {
    assert.deepStrictEqual(collapse({
      "padding-top": "4px",
      "padding-right": "12px",
      "padding-bottom": "4px",
      "padding-left": "12px"
    }), ["padding: 4px 12px;"]);
  });
  test("margin: 3-value when left === right", () => {
    assert.deepStrictEqual(collapse({
      "margin-top": "10px",
      "margin-right": "5px",
      "margin-bottom": "20px",
      "margin-left": "5px"
    }), ["margin: 10px 5px 20px;"]);
  });
  test("margin: 4-value when all differ", () => {
    assert.deepStrictEqual(collapse({
      "margin-top": "1px",
      "margin-right": "2px",
      "margin-bottom": "3px",
      "margin-left": "4px"
    }), ["margin: 1px 2px 3px 4px;"]);
  });
  test("border-radius: uniform", () => {
    assert.deepStrictEqual(collapse({
      "border-top-left-radius": "6px",
      "border-top-right-radius": "6px",
      "border-bottom-right-radius": "6px",
      "border-bottom-left-radius": "6px"
    }), ["border-radius: 6px;"]);
  });
  test("border: uniform sides \u2192 single shorthand", () => {
    assert.deepStrictEqual(collapse({
      "border-top-width": "1px",
      "border-right-width": "1px",
      "border-bottom-width": "1px",
      "border-left-width": "1px",
      "border-top-style": "solid",
      "border-right-style": "solid",
      "border-bottom-style": "solid",
      "border-left-style": "solid",
      "border-top-color": "red",
      "border-right-color": "red",
      "border-bottom-color": "red",
      "border-left-color": "red"
    }), ["border: 1px solid red;"]);
  });
  test("border: non-uniform \u2192 per-group shorthands", () => {
    const result = collapse({
      "border-top-width": "1px",
      "border-right-width": "2px",
      "border-bottom-width": "1px",
      "border-left-width": "2px",
      "border-top-style": "solid",
      "border-right-style": "solid",
      "border-bottom-style": "solid",
      "border-left-style": "solid",
      "border-top-color": "red",
      "border-right-color": "red",
      "border-bottom-color": "red",
      "border-left-color": "red"
    });
    assert.deepStrictEqual(result, [
      "border-width: 1px 2px;",
      "border-style: solid;",
      "border-color: red;"
    ]);
  });
  test("border-image at defaults \u2192 dropped entirely", () => {
    assert.deepStrictEqual(collapse({
      "border-image-source": "none",
      "border-image-slice": "100%",
      "border-image-width": "1",
      "border-image-outset": "0",
      "border-image-repeat": "stretch",
      "color": "red"
    }), ["color: red;"]);
  });
  test("animation-range at defaults \u2192 dropped", () => {
    assert.deepStrictEqual(collapse({
      "animation-range-start": "normal",
      "animation-range-end": "normal",
      "display": "block"
    }), ["display: block;"]);
  });
  test("background: color-only when others at default", () => {
    assert.deepStrictEqual(collapse({
      "background-color": "rgb(255, 0, 0)",
      "background-image": "none",
      "background-position-x": "0px",
      "background-position-y": "0px",
      "background-size": "auto",
      "background-repeat": "repeat",
      "background-attachment": "scroll",
      "background-origin": "padding-box",
      "background-clip": "border-box"
    }), ["background: rgb(255, 0, 0);"]);
  });
  test("text-decoration: none", () => {
    assert.deepStrictEqual(collapse({
      "text-decoration-line": "none",
      "text-decoration-style": "solid",
      "text-decoration-color": "currentcolor",
      "text-decoration-thickness": "auto"
    }), ["text-decoration: none;"]);
  });
  test("text-decoration: underline with non-default style", () => {
    assert.deepStrictEqual(collapse({
      "text-decoration-line": "underline",
      "text-decoration-style": "wavy",
      "text-decoration-color": "currentcolor",
      "text-decoration-thickness": "auto"
    }), ["text-decoration: underline wavy;"]);
  });
  test("white-space: nowrap", () => {
    assert.deepStrictEqual(collapse({
      "white-space-collapse": "collapse",
      "text-wrap-mode": "nowrap"
    }), ["white-space: nowrap;"]);
  });
  test("white-space: pre-wrap", () => {
    assert.deepStrictEqual(collapse({
      "white-space-collapse": "preserve",
      "text-wrap-mode": "wrap"
    }), ["white-space: pre-wrap;"]);
  });
  test("transition: single property with cubic-bezier", () => {
    assert.deepStrictEqual(collapse({
      "transition-property": "opacity",
      "transition-duration": "0.5s",
      "transition-timing-function": "cubic-bezier(0.16, 1, 0.3, 1)",
      "transition-delay": "0s",
      "transition-behavior": "normal"
    }), ["transition: opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1);"]);
  });
  test("transition: multi-property comma-separated", () => {
    assert.deepStrictEqual(collapse({
      "transition-property": "opacity, transform",
      "transition-duration": "0.5s, 0.3s",
      "transition-timing-function": "ease, ease",
      "transition-delay": "0s, 0s",
      "transition-behavior": "normal, normal"
    }), ["transition: opacity 0.5s, transform 0.3s;"]);
  });
  test("animation: name and duration only", () => {
    assert.deepStrictEqual(collapse({
      "animation-name": "fadeIn",
      "animation-duration": "0.3s",
      "animation-timing-function": "ease",
      "animation-delay": "0s",
      "animation-iteration-count": "1",
      "animation-direction": "normal",
      "animation-fill-mode": "none",
      "animation-play-state": "running",
      "animation-timeline": "auto"
    }), ["animation: fadeIn 0.3s;"]);
  });
  test("animation: with fill-mode and custom easing", () => {
    assert.deepStrictEqual(collapse({
      "animation-name": "slideIn",
      "animation-duration": "0.5s",
      "animation-timing-function": "ease-in-out",
      "animation-delay": "0s",
      "animation-iteration-count": "1",
      "animation-direction": "normal",
      "animation-fill-mode": "forwards",
      "animation-play-state": "running",
      "animation-timeline": "auto"
    }), ["animation: slideIn 0.5s ease-in-out forwards;"]);
  });
  test("unknown properties pass through alphabetically", () => {
    assert.deepStrictEqual(collapse({
      "z-index": "1",
      "color": "red",
      "display": "flex"
    }), ["color: red;", "display: flex;", "z-index: 1;"]);
  });
  test("realistic element with multiple shorthand groups", () => {
    const result = collapse({
      "padding-top": "4px",
      "padding-right": "12px",
      "padding-bottom": "4px",
      "padding-left": "12px",
      "border-top-left-radius": "6px",
      "border-top-right-radius": "6px",
      "border-bottom-right-radius": "6px",
      "border-bottom-left-radius": "6px",
      "border-top-width": "1px",
      "border-right-width": "1px",
      "border-bottom-width": "1px",
      "border-left-width": "1px",
      "border-top-style": "solid",
      "border-right-style": "solid",
      "border-bottom-style": "solid",
      "border-left-style": "solid",
      "border-top-color": "rgb(209, 217, 224)",
      "border-right-color": "rgb(209, 217, 224)",
      "border-bottom-color": "rgb(209, 217, 224)",
      "border-left-color": "rgb(209, 217, 224)",
      "border-image-source": "none",
      "border-image-slice": "100%",
      "border-image-width": "1",
      "border-image-outset": "0",
      "border-image-repeat": "stretch",
      "background-color": "rgba(0, 0, 0, 0)",
      "background-image": "none",
      "background-position-x": "0px",
      "background-position-y": "0px",
      "background-size": "auto",
      "background-repeat": "repeat",
      "background-attachment": "scroll",
      "background-origin": "padding-box",
      "background-clip": "border-box",
      "text-decoration-line": "none",
      "text-decoration-style": "solid",
      "text-decoration-color": "currentcolor",
      "text-decoration-thickness": "auto",
      "white-space-collapse": "collapse",
      "text-wrap-mode": "nowrap",
      "transition-property": "opacity, transform",
      "transition-duration": "0.5s, 0.5s",
      "transition-timing-function": "cubic-bezier(0.16, 1, 0.3, 1), cubic-bezier(0.16, 1, 0.3, 1)",
      "transition-delay": "0s, 0s",
      "transition-behavior": "normal, normal",
      "color": "rgb(255, 255, 255)",
      "display": "inline-flex",
      "font-size": "14px"
    });
    assert.deepStrictEqual(result, [
      "padding: 4px 12px;",
      "border-radius: 6px;",
      "border: 1px solid rgb(209, 217, 224);",
      "background: rgba(0, 0, 0, 0);",
      "text-decoration: none;",
      "white-space: nowrap;",
      "transition: opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1), transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);",
      "color: rgb(255, 255, 255);",
      "display: inline-flex;",
      "font-size: 14px;"
    ]);
  });
});
function rule(selector, cssText, origin = "regular") {
  const props = cssText.split(";").map((d) => d.trim()).filter(Boolean).map((d) => {
    const [name, ...rest] = d.split(":");
    return { name: name.trim(), value: rest.join(":").trim() };
  });
  return { rule: { selectorList: { selectors: [{ text: selector }] }, origin, style: { cssText, cssProperties: props } } };
}
suite("formatAuthorStyles", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("includes direct author rules and skips user-agent", () => {
    const matched = {
      matchedCSSRules: [
        rule(".btn", "padding: 8px; color: white;"),
        rule("button", "display: inline-block;", "user-agent")
      ]
    };
    const { rulesText } = formatMatchedStyles(matched);
    assert.ok(rulesText.includes(".btn"));
    assert.ok(rulesText.includes("padding: 8px"));
    assert.ok(!rulesText.includes("display: inline-block"));
  });
  test("includes pseudo-element styles", () => {
    const matched = {
      matchedCSSRules: [rule(".btn", "color: white;")],
      pseudoElements: [
        {
          pseudoType: "before",
          matches: [rule(".btn::before", 'content: "\u2192"; color: red;')]
        },
        {
          pseudoType: "after",
          matches: [rule(".btn::after", 'content: "\u2713"; color: green;')]
        }
      ]
    };
    const { rulesText } = formatMatchedStyles(matched);
    assert.ok(rulesText.includes("/* Pseudo-elements */"));
    assert.ok(rulesText.includes(".btn::before"));
    assert.ok(rulesText.includes(".btn::after"));
    assert.ok(rulesText.includes('content: "\u2192"'));
  });
  test("skips user-agent pseudo-element rules", () => {
    const matched = {
      matchedCSSRules: [rule(".x", "color: red;")],
      pseudoElements: [
        {
          pseudoType: "before",
          matches: [rule("input::before", 'content: "";', "user-agent")]
        }
      ]
    };
    const { rulesText } = formatMatchedStyles(matched);
    assert.ok(!rulesText.includes("Pseudo-elements"));
  });
  test("filters inherited rules to inheritable properties only", () => {
    const matched = {
      matchedCSSRules: [rule(".child", "display: flex;")],
      inherited: [{
        matchedCSSRules: [rule("body", "font-family: sans-serif; background: red; margin: 0;")]
      }]
    };
    const { rulesText } = formatMatchedStyles(matched);
    assert.ok(rulesText.includes("font-family: sans-serif"));
    assert.ok(!rulesText.includes("background"));
    assert.ok(!rulesText.includes("margin"));
  });
  test("collects var references from rules", () => {
    const matched = {
      matchedCSSRules: [rule(".x", "color: var(--fg-color); border: var(--border-width) solid;")]
    };
    const { referencedVars } = formatMatchedStyles(matched);
    assert.ok(referencedVars.has("--fg-color"));
    assert.ok(referencedVars.has("--border-width"));
  });
  test("tracks author property names from cssProperties longhands", () => {
    const matched = {
      matchedCSSRules: [{
        rule: {
          selectorList: { selectors: [{ text: ".x" }] },
          origin: "regular",
          style: {
            cssText: "border: 1px solid red;",
            cssProperties: [
              { name: "border-top-width", value: "1px" },
              { name: "border-top-style", value: "solid" },
              { name: "border-top-color", value: "red" }
            ]
          }
        }
      }]
    };
    const { authorPropertyNames } = formatMatchedStyles(matched);
    assert.ok(authorPropertyNames.has("border-top-width"));
    assert.ok(authorPropertyNames.has("border-top-style"));
    assert.ok(authorPropertyNames.has("display"));
    assert.ok(authorPropertyNames.has("width"));
  });
  test("tracks user-agent property names from direct rules", () => {
    const matched = {
      matchedCSSRules: [
        rule(".btn", "color: white;"),
        rule("button", "display: inline-block; padding: 2px;", "user-agent")
      ]
    };
    const { userAgentPropertyNames } = formatMatchedStyles(matched);
    assert.ok(userAgentPropertyNames.has("display"));
    assert.ok(userAgentPropertyNames.has("padding"));
    assert.ok(!userAgentPropertyNames.has("color"));
  });
  test("tracks user-agent property names from pseudo-element rules", () => {
    const matched = {
      matchedCSSRules: [rule(".x", "color: red;")],
      pseudoElements: [
        {
          pseudoType: "before",
          matches: [rule("input::before", 'content: ""; display: block;', "user-agent")]
        }
      ]
    };
    const { userAgentPropertyNames } = formatMatchedStyles(matched);
    assert.ok(userAgentPropertyNames.has("content"));
    assert.ok(userAgentPropertyNames.has("display"));
  });
  test("tracks user-agent property names from inherited rules (inheritable only)", () => {
    const matched = {
      matchedCSSRules: [rule(".child", "display: flex;")],
      inherited: [{
        matchedCSSRules: [rule("body", "font-family: sans-serif; margin: 0;", "user-agent")]
      }]
    };
    const { userAgentPropertyNames } = formatMatchedStyles(matched);
    assert.ok(userAgentPropertyNames.has("font-family"));
    assert.ok(!userAgentPropertyNames.has("margin"));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2Jyb3dzZXJWaWV3L3Rlc3QvY29tbW9uL2Nzc0hlbHBlcnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgY29sbGFwc2VUb1Nob3J0aGFuZHMsIGZvcm1hdE1hdGNoZWRTdHlsZXMsIHR5cGUgSU1hdGNoZWRTdHlsZXMgfSBmcm9tICcuLi8uLi9jb21tb24vY3NzSGVscGVycy5qcyc7XG5cbi8qKiBIZWxwZXI6IGJ1aWxkIGEgTWFwIGZyb20gYW4gb2JqZWN0IGxpdGVyYWwgYW5kIHJ1biBjb2xsYXBzZVRvU2hvcnRoYW5kcy4gKi9cbmZ1bmN0aW9uIGNvbGxhcHNlKHByb3BzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KTogc3RyaW5nW10ge1xuXHRyZXR1cm4gY29sbGFwc2VUb1Nob3J0aGFuZHMobmV3IE1hcChPYmplY3QuZW50cmllcyhwcm9wcykpKTtcbn1cblxuc3VpdGUoJ2NvbGxhcHNlVG9TaG9ydGhhbmRzJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdC8vIFx1MjUwMFx1MjUwMCBCb3ggc2hvcnRoYW5kcyBcdTI1MDBcdTI1MDBcblxuXHR0ZXN0KCdtYXJnaW46IGFsbCBzaWRlcyBlcXVhbCBcdTIxOTIgMS12YWx1ZScsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbGxhcHNlKHtcblx0XHRcdCdtYXJnaW4tdG9wJzogJzEwcHgnLCAnbWFyZ2luLXJpZ2h0JzogJzEwcHgnLCAnbWFyZ2luLWJvdHRvbSc6ICcxMHB4JywgJ21hcmdpbi1sZWZ0JzogJzEwcHgnLFxuXHRcdH0pLCBbJ21hcmdpbjogMTBweDsnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhZGRpbmc6IHZlcnRpY2FsL2hvcml6b250YWwgXHUyMTkyIDItdmFsdWUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb2xsYXBzZSh7XG5cdFx0XHQncGFkZGluZy10b3AnOiAnNHB4JywgJ3BhZGRpbmctcmlnaHQnOiAnMTJweCcsICdwYWRkaW5nLWJvdHRvbSc6ICc0cHgnLCAncGFkZGluZy1sZWZ0JzogJzEycHgnLFxuXHRcdH0pLCBbJ3BhZGRpbmc6IDRweCAxMnB4OyddKTtcblx0fSk7XG5cblx0dGVzdCgnbWFyZ2luOiAzLXZhbHVlIHdoZW4gbGVmdCA9PT0gcmlnaHQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb2xsYXBzZSh7XG5cdFx0XHQnbWFyZ2luLXRvcCc6ICcxMHB4JywgJ21hcmdpbi1yaWdodCc6ICc1cHgnLCAnbWFyZ2luLWJvdHRvbSc6ICcyMHB4JywgJ21hcmdpbi1sZWZ0JzogJzVweCcsXG5cdFx0fSksIFsnbWFyZ2luOiAxMHB4IDVweCAyMHB4OyddKTtcblx0fSk7XG5cblx0dGVzdCgnbWFyZ2luOiA0LXZhbHVlIHdoZW4gYWxsIGRpZmZlcicsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbGxhcHNlKHtcblx0XHRcdCdtYXJnaW4tdG9wJzogJzFweCcsICdtYXJnaW4tcmlnaHQnOiAnMnB4JywgJ21hcmdpbi1ib3R0b20nOiAnM3B4JywgJ21hcmdpbi1sZWZ0JzogJzRweCcsXG5cdFx0fSksIFsnbWFyZ2luOiAxcHggMnB4IDNweCA0cHg7J10pO1xuXHR9KTtcblxuXHR0ZXN0KCdib3JkZXItcmFkaXVzOiB1bmlmb3JtJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29sbGFwc2Uoe1xuXHRcdFx0J2JvcmRlci10b3AtbGVmdC1yYWRpdXMnOiAnNnB4JywgJ2JvcmRlci10b3AtcmlnaHQtcmFkaXVzJzogJzZweCcsXG5cdFx0XHQnYm9yZGVyLWJvdHRvbS1yaWdodC1yYWRpdXMnOiAnNnB4JywgJ2JvcmRlci1ib3R0b20tbGVmdC1yYWRpdXMnOiAnNnB4Jyxcblx0XHR9KSwgWydib3JkZXItcmFkaXVzOiA2cHg7J10pO1xuXHR9KTtcblxuXHQvLyBcdTI1MDBcdTI1MDAgQm9yZGVyIFx1MjUwMFx1MjUwMFxuXG5cdHRlc3QoJ2JvcmRlcjogdW5pZm9ybSBzaWRlcyBcdTIxOTIgc2luZ2xlIHNob3J0aGFuZCcsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbGxhcHNlKHtcblx0XHRcdCdib3JkZXItdG9wLXdpZHRoJzogJzFweCcsICdib3JkZXItcmlnaHQtd2lkdGgnOiAnMXB4JywgJ2JvcmRlci1ib3R0b20td2lkdGgnOiAnMXB4JywgJ2JvcmRlci1sZWZ0LXdpZHRoJzogJzFweCcsXG5cdFx0XHQnYm9yZGVyLXRvcC1zdHlsZSc6ICdzb2xpZCcsICdib3JkZXItcmlnaHQtc3R5bGUnOiAnc29saWQnLCAnYm9yZGVyLWJvdHRvbS1zdHlsZSc6ICdzb2xpZCcsICdib3JkZXItbGVmdC1zdHlsZSc6ICdzb2xpZCcsXG5cdFx0XHQnYm9yZGVyLXRvcC1jb2xvcic6ICdyZWQnLCAnYm9yZGVyLXJpZ2h0LWNvbG9yJzogJ3JlZCcsICdib3JkZXItYm90dG9tLWNvbG9yJzogJ3JlZCcsICdib3JkZXItbGVmdC1jb2xvcic6ICdyZWQnLFxuXHRcdH0pLCBbJ2JvcmRlcjogMXB4IHNvbGlkIHJlZDsnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2JvcmRlcjogbm9uLXVuaWZvcm0gXHUyMTkyIHBlci1ncm91cCBzaG9ydGhhbmRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGNvbGxhcHNlKHtcblx0XHRcdCdib3JkZXItdG9wLXdpZHRoJzogJzFweCcsICdib3JkZXItcmlnaHQtd2lkdGgnOiAnMnB4JywgJ2JvcmRlci1ib3R0b20td2lkdGgnOiAnMXB4JywgJ2JvcmRlci1sZWZ0LXdpZHRoJzogJzJweCcsXG5cdFx0XHQnYm9yZGVyLXRvcC1zdHlsZSc6ICdzb2xpZCcsICdib3JkZXItcmlnaHQtc3R5bGUnOiAnc29saWQnLCAnYm9yZGVyLWJvdHRvbS1zdHlsZSc6ICdzb2xpZCcsICdib3JkZXItbGVmdC1zdHlsZSc6ICdzb2xpZCcsXG5cdFx0XHQnYm9yZGVyLXRvcC1jb2xvcic6ICdyZWQnLCAnYm9yZGVyLXJpZ2h0LWNvbG9yJzogJ3JlZCcsICdib3JkZXItYm90dG9tLWNvbG9yJzogJ3JlZCcsICdib3JkZXItbGVmdC1jb2xvcic6ICdyZWQnLFxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXG5cdFx0XHQnYm9yZGVyLXdpZHRoOiAxcHggMnB4OycsXG5cdFx0XHQnYm9yZGVyLXN0eWxlOiBzb2xpZDsnLFxuXHRcdFx0J2JvcmRlci1jb2xvcjogcmVkOycsXG5cdFx0XSk7XG5cdH0pO1xuXG5cdC8vIFx1MjUwMFx1MjUwMCBEcm9wLXdoZW4tYWxsLWRlZmF1bHQgXHUyNTAwXHUyNTAwXG5cblx0dGVzdCgnYm9yZGVyLWltYWdlIGF0IGRlZmF1bHRzIFx1MjE5MiBkcm9wcGVkIGVudGlyZWx5JywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29sbGFwc2Uoe1xuXHRcdFx0J2JvcmRlci1pbWFnZS1zb3VyY2UnOiAnbm9uZScsICdib3JkZXItaW1hZ2Utc2xpY2UnOiAnMTAwJScsXG5cdFx0XHQnYm9yZGVyLWltYWdlLXdpZHRoJzogJzEnLCAnYm9yZGVyLWltYWdlLW91dHNldCc6ICcwJywgJ2JvcmRlci1pbWFnZS1yZXBlYXQnOiAnc3RyZXRjaCcsXG5cdFx0XHQnY29sb3InOiAncmVkJyxcblx0XHR9KSwgWydjb2xvcjogcmVkOyddKTtcblx0fSk7XG5cblx0dGVzdCgnYW5pbWF0aW9uLXJhbmdlIGF0IGRlZmF1bHRzIFx1MjE5MiBkcm9wcGVkJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29sbGFwc2Uoe1xuXHRcdFx0J2FuaW1hdGlvbi1yYW5nZS1zdGFydCc6ICdub3JtYWwnLCAnYW5pbWF0aW9uLXJhbmdlLWVuZCc6ICdub3JtYWwnLFxuXHRcdFx0J2Rpc3BsYXknOiAnYmxvY2snLFxuXHRcdH0pLCBbJ2Rpc3BsYXk6IGJsb2NrOyddKTtcblx0fSk7XG5cblx0Ly8gXHUyNTAwXHUyNTAwIEJhY2tncm91bmQgXHUyNTAwXHUyNTAwXG5cblx0dGVzdCgnYmFja2dyb3VuZDogY29sb3Itb25seSB3aGVuIG90aGVycyBhdCBkZWZhdWx0JywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29sbGFwc2Uoe1xuXHRcdFx0J2JhY2tncm91bmQtY29sb3InOiAncmdiKDI1NSwgMCwgMCknLFxuXHRcdFx0J2JhY2tncm91bmQtaW1hZ2UnOiAnbm9uZScsICdiYWNrZ3JvdW5kLXBvc2l0aW9uLXgnOiAnMHB4JywgJ2JhY2tncm91bmQtcG9zaXRpb24teSc6ICcwcHgnLFxuXHRcdFx0J2JhY2tncm91bmQtc2l6ZSc6ICdhdXRvJywgJ2JhY2tncm91bmQtcmVwZWF0JzogJ3JlcGVhdCcsICdiYWNrZ3JvdW5kLWF0dGFjaG1lbnQnOiAnc2Nyb2xsJyxcblx0XHRcdCdiYWNrZ3JvdW5kLW9yaWdpbic6ICdwYWRkaW5nLWJveCcsICdiYWNrZ3JvdW5kLWNsaXAnOiAnYm9yZGVyLWJveCcsXG5cdFx0fSksIFsnYmFja2dyb3VuZDogcmdiKDI1NSwgMCwgMCk7J10pO1xuXHR9KTtcblxuXHQvLyBcdTI1MDBcdTI1MDAgVGV4dC1kZWNvcmF0aW9uIFx1MjUwMFx1MjUwMFxuXG5cdHRlc3QoJ3RleHQtZGVjb3JhdGlvbjogbm9uZScsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbGxhcHNlKHtcblx0XHRcdCd0ZXh0LWRlY29yYXRpb24tbGluZSc6ICdub25lJywgJ3RleHQtZGVjb3JhdGlvbi1zdHlsZSc6ICdzb2xpZCcsXG5cdFx0XHQndGV4dC1kZWNvcmF0aW9uLWNvbG9yJzogJ2N1cnJlbnRjb2xvcicsICd0ZXh0LWRlY29yYXRpb24tdGhpY2tuZXNzJzogJ2F1dG8nLFxuXHRcdH0pLCBbJ3RleHQtZGVjb3JhdGlvbjogbm9uZTsnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RleHQtZGVjb3JhdGlvbjogdW5kZXJsaW5lIHdpdGggbm9uLWRlZmF1bHQgc3R5bGUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb2xsYXBzZSh7XG5cdFx0XHQndGV4dC1kZWNvcmF0aW9uLWxpbmUnOiAndW5kZXJsaW5lJywgJ3RleHQtZGVjb3JhdGlvbi1zdHlsZSc6ICd3YXZ5Jyxcblx0XHRcdCd0ZXh0LWRlY29yYXRpb24tY29sb3InOiAnY3VycmVudGNvbG9yJywgJ3RleHQtZGVjb3JhdGlvbi10aGlja25lc3MnOiAnYXV0bycsXG5cdFx0fSksIFsndGV4dC1kZWNvcmF0aW9uOiB1bmRlcmxpbmUgd2F2eTsnXSk7XG5cdH0pO1xuXG5cdC8vIFx1MjUwMFx1MjUwMCBXaGl0ZS1zcGFjZSBcdTI1MDBcdTI1MDBcblxuXHR0ZXN0KCd3aGl0ZS1zcGFjZTogbm93cmFwJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29sbGFwc2Uoe1xuXHRcdFx0J3doaXRlLXNwYWNlLWNvbGxhcHNlJzogJ2NvbGxhcHNlJywgJ3RleHQtd3JhcC1tb2RlJzogJ25vd3JhcCcsXG5cdFx0fSksIFsnd2hpdGUtc3BhY2U6IG5vd3JhcDsnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3doaXRlLXNwYWNlOiBwcmUtd3JhcCcsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbGxhcHNlKHtcblx0XHRcdCd3aGl0ZS1zcGFjZS1jb2xsYXBzZSc6ICdwcmVzZXJ2ZScsICd0ZXh0LXdyYXAtbW9kZSc6ICd3cmFwJyxcblx0XHR9KSwgWyd3aGl0ZS1zcGFjZTogcHJlLXdyYXA7J10pO1xuXHR9KTtcblxuXHQvLyBcdTI1MDBcdTI1MDAgVHJhbnNpdGlvbiBcdTI1MDBcdTI1MDBcblxuXHR0ZXN0KCd0cmFuc2l0aW9uOiBzaW5nbGUgcHJvcGVydHkgd2l0aCBjdWJpYy1iZXppZXInLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb2xsYXBzZSh7XG5cdFx0XHQndHJhbnNpdGlvbi1wcm9wZXJ0eSc6ICdvcGFjaXR5Jyxcblx0XHRcdCd0cmFuc2l0aW9uLWR1cmF0aW9uJzogJzAuNXMnLFxuXHRcdFx0J3RyYW5zaXRpb24tdGltaW5nLWZ1bmN0aW9uJzogJ2N1YmljLWJlemllcigwLjE2LCAxLCAwLjMsIDEpJyxcblx0XHRcdCd0cmFuc2l0aW9uLWRlbGF5JzogJzBzJyxcblx0XHRcdCd0cmFuc2l0aW9uLWJlaGF2aW9yJzogJ25vcm1hbCcsXG5cdFx0fSksIFsndHJhbnNpdGlvbjogb3BhY2l0eSAwLjVzIGN1YmljLWJlemllcigwLjE2LCAxLCAwLjMsIDEpOyddKTtcblx0fSk7XG5cblx0dGVzdCgndHJhbnNpdGlvbjogbXVsdGktcHJvcGVydHkgY29tbWEtc2VwYXJhdGVkJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29sbGFwc2Uoe1xuXHRcdFx0J3RyYW5zaXRpb24tcHJvcGVydHknOiAnb3BhY2l0eSwgdHJhbnNmb3JtJyxcblx0XHRcdCd0cmFuc2l0aW9uLWR1cmF0aW9uJzogJzAuNXMsIDAuM3MnLFxuXHRcdFx0J3RyYW5zaXRpb24tdGltaW5nLWZ1bmN0aW9uJzogJ2Vhc2UsIGVhc2UnLFxuXHRcdFx0J3RyYW5zaXRpb24tZGVsYXknOiAnMHMsIDBzJyxcblx0XHRcdCd0cmFuc2l0aW9uLWJlaGF2aW9yJzogJ25vcm1hbCwgbm9ybWFsJyxcblx0XHR9KSwgWyd0cmFuc2l0aW9uOiBvcGFjaXR5IDAuNXMsIHRyYW5zZm9ybSAwLjNzOyddKTtcblx0fSk7XG5cblx0Ly8gXHUyNTAwXHUyNTAwIEFuaW1hdGlvbiBcdTI1MDBcdTI1MDBcblxuXHR0ZXN0KCdhbmltYXRpb246IG5hbWUgYW5kIGR1cmF0aW9uIG9ubHknLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb2xsYXBzZSh7XG5cdFx0XHQnYW5pbWF0aW9uLW5hbWUnOiAnZmFkZUluJywgJ2FuaW1hdGlvbi1kdXJhdGlvbic6ICcwLjNzJyxcblx0XHRcdCdhbmltYXRpb24tdGltaW5nLWZ1bmN0aW9uJzogJ2Vhc2UnLCAnYW5pbWF0aW9uLWRlbGF5JzogJzBzJyxcblx0XHRcdCdhbmltYXRpb24taXRlcmF0aW9uLWNvdW50JzogJzEnLCAnYW5pbWF0aW9uLWRpcmVjdGlvbic6ICdub3JtYWwnLFxuXHRcdFx0J2FuaW1hdGlvbi1maWxsLW1vZGUnOiAnbm9uZScsICdhbmltYXRpb24tcGxheS1zdGF0ZSc6ICdydW5uaW5nJyxcblx0XHRcdCdhbmltYXRpb24tdGltZWxpbmUnOiAnYXV0bycsXG5cdFx0fSksIFsnYW5pbWF0aW9uOiBmYWRlSW4gMC4zczsnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FuaW1hdGlvbjogd2l0aCBmaWxsLW1vZGUgYW5kIGN1c3RvbSBlYXNpbmcnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb2xsYXBzZSh7XG5cdFx0XHQnYW5pbWF0aW9uLW5hbWUnOiAnc2xpZGVJbicsICdhbmltYXRpb24tZHVyYXRpb24nOiAnMC41cycsXG5cdFx0XHQnYW5pbWF0aW9uLXRpbWluZy1mdW5jdGlvbic6ICdlYXNlLWluLW91dCcsICdhbmltYXRpb24tZGVsYXknOiAnMHMnLFxuXHRcdFx0J2FuaW1hdGlvbi1pdGVyYXRpb24tY291bnQnOiAnMScsICdhbmltYXRpb24tZGlyZWN0aW9uJzogJ25vcm1hbCcsXG5cdFx0XHQnYW5pbWF0aW9uLWZpbGwtbW9kZSc6ICdmb3J3YXJkcycsICdhbmltYXRpb24tcGxheS1zdGF0ZSc6ICdydW5uaW5nJyxcblx0XHRcdCdhbmltYXRpb24tdGltZWxpbmUnOiAnYXV0bycsXG5cdFx0fSksIFsnYW5pbWF0aW9uOiBzbGlkZUluIDAuNXMgZWFzZS1pbi1vdXQgZm9yd2FyZHM7J10pO1xuXHR9KTtcblxuXHQvLyBcdTI1MDBcdTI1MDAgUmVtYWluaW5nIHByb3BlcnRpZXMgcGFzcyB0aHJvdWdoIHNvcnRlZCBcdTI1MDBcdTI1MDBcblxuXHR0ZXN0KCd1bmtub3duIHByb3BlcnRpZXMgcGFzcyB0aHJvdWdoIGFscGhhYmV0aWNhbGx5JywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29sbGFwc2Uoe1xuXHRcdFx0J3otaW5kZXgnOiAnMScsICdjb2xvcic6ICdyZWQnLCAnZGlzcGxheSc6ICdmbGV4Jyxcblx0XHR9KSwgWydjb2xvcjogcmVkOycsICdkaXNwbGF5OiBmbGV4OycsICd6LWluZGV4OiAxOyddKTtcblx0fSk7XG5cblx0Ly8gXHUyNTAwXHUyNTAwIE1peGVkOiByZWFsaXN0aWMgR2l0SHViLWxpa2UgZWxlbWVudCBcdTI1MDBcdTI1MDBcblxuXHR0ZXN0KCdyZWFsaXN0aWMgZWxlbWVudCB3aXRoIG11bHRpcGxlIHNob3J0aGFuZCBncm91cHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gY29sbGFwc2Uoe1xuXHRcdFx0J3BhZGRpbmctdG9wJzogJzRweCcsICdwYWRkaW5nLXJpZ2h0JzogJzEycHgnLCAncGFkZGluZy1ib3R0b20nOiAnNHB4JywgJ3BhZGRpbmctbGVmdCc6ICcxMnB4Jyxcblx0XHRcdCdib3JkZXItdG9wLWxlZnQtcmFkaXVzJzogJzZweCcsICdib3JkZXItdG9wLXJpZ2h0LXJhZGl1cyc6ICc2cHgnLFxuXHRcdFx0J2JvcmRlci1ib3R0b20tcmlnaHQtcmFkaXVzJzogJzZweCcsICdib3JkZXItYm90dG9tLWxlZnQtcmFkaXVzJzogJzZweCcsXG5cdFx0XHQnYm9yZGVyLXRvcC13aWR0aCc6ICcxcHgnLCAnYm9yZGVyLXJpZ2h0LXdpZHRoJzogJzFweCcsICdib3JkZXItYm90dG9tLXdpZHRoJzogJzFweCcsICdib3JkZXItbGVmdC13aWR0aCc6ICcxcHgnLFxuXHRcdFx0J2JvcmRlci10b3Atc3R5bGUnOiAnc29saWQnLCAnYm9yZGVyLXJpZ2h0LXN0eWxlJzogJ3NvbGlkJywgJ2JvcmRlci1ib3R0b20tc3R5bGUnOiAnc29saWQnLCAnYm9yZGVyLWxlZnQtc3R5bGUnOiAnc29saWQnLFxuXHRcdFx0J2JvcmRlci10b3AtY29sb3InOiAncmdiKDIwOSwgMjE3LCAyMjQpJywgJ2JvcmRlci1yaWdodC1jb2xvcic6ICdyZ2IoMjA5LCAyMTcsIDIyNCknLFxuXHRcdFx0J2JvcmRlci1ib3R0b20tY29sb3InOiAncmdiKDIwOSwgMjE3LCAyMjQpJywgJ2JvcmRlci1sZWZ0LWNvbG9yJzogJ3JnYigyMDksIDIxNywgMjI0KScsXG5cdFx0XHQnYm9yZGVyLWltYWdlLXNvdXJjZSc6ICdub25lJywgJ2JvcmRlci1pbWFnZS1zbGljZSc6ICcxMDAlJyxcblx0XHRcdCdib3JkZXItaW1hZ2Utd2lkdGgnOiAnMScsICdib3JkZXItaW1hZ2Utb3V0c2V0JzogJzAnLCAnYm9yZGVyLWltYWdlLXJlcGVhdCc6ICdzdHJldGNoJyxcblx0XHRcdCdiYWNrZ3JvdW5kLWNvbG9yJzogJ3JnYmEoMCwgMCwgMCwgMCknLFxuXHRcdFx0J2JhY2tncm91bmQtaW1hZ2UnOiAnbm9uZScsICdiYWNrZ3JvdW5kLXBvc2l0aW9uLXgnOiAnMHB4JywgJ2JhY2tncm91bmQtcG9zaXRpb24teSc6ICcwcHgnLFxuXHRcdFx0J2JhY2tncm91bmQtc2l6ZSc6ICdhdXRvJywgJ2JhY2tncm91bmQtcmVwZWF0JzogJ3JlcGVhdCcsICdiYWNrZ3JvdW5kLWF0dGFjaG1lbnQnOiAnc2Nyb2xsJyxcblx0XHRcdCdiYWNrZ3JvdW5kLW9yaWdpbic6ICdwYWRkaW5nLWJveCcsICdiYWNrZ3JvdW5kLWNsaXAnOiAnYm9yZGVyLWJveCcsXG5cdFx0XHQndGV4dC1kZWNvcmF0aW9uLWxpbmUnOiAnbm9uZScsICd0ZXh0LWRlY29yYXRpb24tc3R5bGUnOiAnc29saWQnLFxuXHRcdFx0J3RleHQtZGVjb3JhdGlvbi1jb2xvcic6ICdjdXJyZW50Y29sb3InLCAndGV4dC1kZWNvcmF0aW9uLXRoaWNrbmVzcyc6ICdhdXRvJyxcblx0XHRcdCd3aGl0ZS1zcGFjZS1jb2xsYXBzZSc6ICdjb2xsYXBzZScsICd0ZXh0LXdyYXAtbW9kZSc6ICdub3dyYXAnLFxuXHRcdFx0J3RyYW5zaXRpb24tcHJvcGVydHknOiAnb3BhY2l0eSwgdHJhbnNmb3JtJyxcblx0XHRcdCd0cmFuc2l0aW9uLWR1cmF0aW9uJzogJzAuNXMsIDAuNXMnLFxuXHRcdFx0J3RyYW5zaXRpb24tdGltaW5nLWZ1bmN0aW9uJzogJ2N1YmljLWJlemllcigwLjE2LCAxLCAwLjMsIDEpLCBjdWJpYy1iZXppZXIoMC4xNiwgMSwgMC4zLCAxKScsXG5cdFx0XHQndHJhbnNpdGlvbi1kZWxheSc6ICcwcywgMHMnLFxuXHRcdFx0J3RyYW5zaXRpb24tYmVoYXZpb3InOiAnbm9ybWFsLCBub3JtYWwnLFxuXHRcdFx0J2NvbG9yJzogJ3JnYigyNTUsIDI1NSwgMjU1KScsXG5cdFx0XHQnZGlzcGxheSc6ICdpbmxpbmUtZmxleCcsXG5cdFx0XHQnZm9udC1zaXplJzogJzE0cHgnLFxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXG5cdFx0XHQncGFkZGluZzogNHB4IDEycHg7Jyxcblx0XHRcdCdib3JkZXItcmFkaXVzOiA2cHg7Jyxcblx0XHRcdCdib3JkZXI6IDFweCBzb2xpZCByZ2IoMjA5LCAyMTcsIDIyNCk7Jyxcblx0XHRcdCdiYWNrZ3JvdW5kOiByZ2JhKDAsIDAsIDAsIDApOycsXG5cdFx0XHQndGV4dC1kZWNvcmF0aW9uOiBub25lOycsXG5cdFx0XHQnd2hpdGUtc3BhY2U6IG5vd3JhcDsnLFxuXHRcdFx0J3RyYW5zaXRpb246IG9wYWNpdHkgMC41cyBjdWJpYy1iZXppZXIoMC4xNiwgMSwgMC4zLCAxKSwgdHJhbnNmb3JtIDAuNXMgY3ViaWMtYmV6aWVyKDAuMTYsIDEsIDAuMywgMSk7Jyxcblx0XHRcdCdjb2xvcjogcmdiKDI1NSwgMjU1LCAyNTUpOycsXG5cdFx0XHQnZGlzcGxheTogaW5saW5lLWZsZXg7Jyxcblx0XHRcdCdmb250LXNpemU6IDE0cHg7Jyxcblx0XHRdKTtcblx0fSk7XG59KTtcblxuLy8gXHUyNTAwXHUyNTAwIEhlbHBlciB0byBidWlsZCBDRFAtbGlrZSBydWxlIG1hdGNoZXMgXHUyNTAwXHUyNTAwXG5cbmZ1bmN0aW9uIHJ1bGUoc2VsZWN0b3I6IHN0cmluZywgY3NzVGV4dDogc3RyaW5nLCBvcmlnaW4gPSAncmVndWxhcicpOiB7IHJ1bGU6IHsgc2VsZWN0b3JMaXN0OiB7IHNlbGVjdG9yczogeyB0ZXh0OiBzdHJpbmcgfVtdIH07IG9yaWdpbjogc3RyaW5nOyBzdHlsZTogeyBjc3NUZXh0OiBzdHJpbmc7IGNzc1Byb3BlcnRpZXM6IHsgbmFtZTogc3RyaW5nOyB2YWx1ZTogc3RyaW5nIH1bXSB9IH0gfSB7XG5cdGNvbnN0IHByb3BzID0gY3NzVGV4dC5zcGxpdCgnOycpLm1hcChkID0+IGQudHJpbSgpKS5maWx0ZXIoQm9vbGVhbikubWFwKGQgPT4ge1xuXHRcdGNvbnN0IFtuYW1lLCAuLi5yZXN0XSA9IGQuc3BsaXQoJzonKTtcblx0XHRyZXR1cm4geyBuYW1lOiBuYW1lLnRyaW0oKSwgdmFsdWU6IHJlc3Quam9pbignOicpLnRyaW0oKSB9O1xuXHR9KTtcblx0cmV0dXJuIHsgcnVsZTogeyBzZWxlY3Rvckxpc3Q6IHsgc2VsZWN0b3JzOiBbeyB0ZXh0OiBzZWxlY3RvciB9XSB9LCBvcmlnaW4sIHN0eWxlOiB7IGNzc1RleHQsIGNzc1Byb3BlcnRpZXM6IHByb3BzIH0gfSB9O1xufVxuXG5zdWl0ZSgnZm9ybWF0QXV0aG9yU3R5bGVzJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2luY2x1ZGVzIGRpcmVjdCBhdXRob3IgcnVsZXMgYW5kIHNraXBzIHVzZXItYWdlbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWF0Y2hlZDogSU1hdGNoZWRTdHlsZXMgPSB7XG5cdFx0XHRtYXRjaGVkQ1NTUnVsZXM6IFtcblx0XHRcdFx0cnVsZSgnLmJ0bicsICdwYWRkaW5nOiA4cHg7IGNvbG9yOiB3aGl0ZTsnKSxcblx0XHRcdFx0cnVsZSgnYnV0dG9uJywgJ2Rpc3BsYXk6IGlubGluZS1ibG9jazsnLCAndXNlci1hZ2VudCcpLFxuXHRcdFx0XSxcblx0XHR9O1xuXHRcdGNvbnN0IHsgcnVsZXNUZXh0IH0gPSBmb3JtYXRNYXRjaGVkU3R5bGVzKG1hdGNoZWQpO1xuXHRcdGFzc2VydC5vayhydWxlc1RleHQuaW5jbHVkZXMoJy5idG4nKSk7XG5cdFx0YXNzZXJ0Lm9rKHJ1bGVzVGV4dC5pbmNsdWRlcygncGFkZGluZzogOHB4JykpO1xuXHRcdGFzc2VydC5vayghcnVsZXNUZXh0LmluY2x1ZGVzKCdkaXNwbGF5OiBpbmxpbmUtYmxvY2snKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luY2x1ZGVzIHBzZXVkby1lbGVtZW50IHN0eWxlcycsICgpID0+IHtcblx0XHRjb25zdCBtYXRjaGVkOiBJTWF0Y2hlZFN0eWxlcyA9IHtcblx0XHRcdG1hdGNoZWRDU1NSdWxlczogW3J1bGUoJy5idG4nLCAnY29sb3I6IHdoaXRlOycpXSxcblx0XHRcdHBzZXVkb0VsZW1lbnRzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwc2V1ZG9UeXBlOiAnYmVmb3JlJyxcblx0XHRcdFx0XHRtYXRjaGVzOiBbcnVsZSgnLmJ0bjo6YmVmb3JlJywgJ2NvbnRlbnQ6IFwiXHUyMTkyXCI7IGNvbG9yOiByZWQ7JyldLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cHNldWRvVHlwZTogJ2FmdGVyJyxcblx0XHRcdFx0XHRtYXRjaGVzOiBbcnVsZSgnLmJ0bjo6YWZ0ZXInLCAnY29udGVudDogXCJcdTI3MTNcIjsgY29sb3I6IGdyZWVuOycpXSxcblx0XHRcdFx0fSxcblx0XHRcdF0sXG5cdFx0fTtcblx0XHRjb25zdCB7IHJ1bGVzVGV4dCB9ID0gZm9ybWF0TWF0Y2hlZFN0eWxlcyhtYXRjaGVkKTtcblx0XHRhc3NlcnQub2socnVsZXNUZXh0LmluY2x1ZGVzKCcvKiBQc2V1ZG8tZWxlbWVudHMgKi8nKSk7XG5cdFx0YXNzZXJ0Lm9rKHJ1bGVzVGV4dC5pbmNsdWRlcygnLmJ0bjo6YmVmb3JlJykpO1xuXHRcdGFzc2VydC5vayhydWxlc1RleHQuaW5jbHVkZXMoJy5idG46OmFmdGVyJykpO1xuXHRcdGFzc2VydC5vayhydWxlc1RleHQuaW5jbHVkZXMoJ2NvbnRlbnQ6IFwiXHUyMTkyXCInKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NraXBzIHVzZXItYWdlbnQgcHNldWRvLWVsZW1lbnQgcnVsZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWF0Y2hlZDogSU1hdGNoZWRTdHlsZXMgPSB7XG5cdFx0XHRtYXRjaGVkQ1NTUnVsZXM6IFtydWxlKCcueCcsICdjb2xvcjogcmVkOycpXSxcblx0XHRcdHBzZXVkb0VsZW1lbnRzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwc2V1ZG9UeXBlOiAnYmVmb3JlJyxcblx0XHRcdFx0XHRtYXRjaGVzOiBbcnVsZSgnaW5wdXQ6OmJlZm9yZScsICdjb250ZW50OiBcIlwiOycsICd1c2VyLWFnZW50JyldLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSxcblx0XHR9O1xuXHRcdGNvbnN0IHsgcnVsZXNUZXh0IH0gPSBmb3JtYXRNYXRjaGVkU3R5bGVzKG1hdGNoZWQpO1xuXHRcdGFzc2VydC5vayghcnVsZXNUZXh0LmluY2x1ZGVzKCdQc2V1ZG8tZWxlbWVudHMnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbHRlcnMgaW5oZXJpdGVkIHJ1bGVzIHRvIGluaGVyaXRhYmxlIHByb3BlcnRpZXMgb25seScsICgpID0+IHtcblx0XHRjb25zdCBtYXRjaGVkOiBJTWF0Y2hlZFN0eWxlcyA9IHtcblx0XHRcdG1hdGNoZWRDU1NSdWxlczogW3J1bGUoJy5jaGlsZCcsICdkaXNwbGF5OiBmbGV4OycpXSxcblx0XHRcdGluaGVyaXRlZDogW3tcblx0XHRcdFx0bWF0Y2hlZENTU1J1bGVzOiBbcnVsZSgnYm9keScsICdmb250LWZhbWlseTogc2Fucy1zZXJpZjsgYmFja2dyb3VuZDogcmVkOyBtYXJnaW46IDA7JyldLFxuXHRcdFx0fV0sXG5cdFx0fTtcblx0XHRjb25zdCB7IHJ1bGVzVGV4dCB9ID0gZm9ybWF0TWF0Y2hlZFN0eWxlcyhtYXRjaGVkKTtcblx0XHRhc3NlcnQub2socnVsZXNUZXh0LmluY2x1ZGVzKCdmb250LWZhbWlseTogc2Fucy1zZXJpZicpKTtcblx0XHRhc3NlcnQub2soIXJ1bGVzVGV4dC5pbmNsdWRlcygnYmFja2dyb3VuZCcpKTtcblx0XHRhc3NlcnQub2soIXJ1bGVzVGV4dC5pbmNsdWRlcygnbWFyZ2luJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb2xsZWN0cyB2YXIgcmVmZXJlbmNlcyBmcm9tIHJ1bGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hdGNoZWQ6IElNYXRjaGVkU3R5bGVzID0ge1xuXHRcdFx0bWF0Y2hlZENTU1J1bGVzOiBbcnVsZSgnLngnLCAnY29sb3I6IHZhcigtLWZnLWNvbG9yKTsgYm9yZGVyOiB2YXIoLS1ib3JkZXItd2lkdGgpIHNvbGlkOycpXSxcblx0XHR9O1xuXHRcdGNvbnN0IHsgcmVmZXJlbmNlZFZhcnMgfSA9IGZvcm1hdE1hdGNoZWRTdHlsZXMobWF0Y2hlZCk7XG5cdFx0YXNzZXJ0Lm9rKHJlZmVyZW5jZWRWYXJzLmhhcygnLS1mZy1jb2xvcicpKTtcblx0XHRhc3NlcnQub2socmVmZXJlbmNlZFZhcnMuaGFzKCctLWJvcmRlci13aWR0aCcpKTtcblx0fSk7XG5cblx0dGVzdCgndHJhY2tzIGF1dGhvciBwcm9wZXJ0eSBuYW1lcyBmcm9tIGNzc1Byb3BlcnRpZXMgbG9uZ2hhbmRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hdGNoZWQ6IElNYXRjaGVkU3R5bGVzID0ge1xuXHRcdFx0bWF0Y2hlZENTU1J1bGVzOiBbe1xuXHRcdFx0XHRydWxlOiB7XG5cdFx0XHRcdFx0c2VsZWN0b3JMaXN0OiB7IHNlbGVjdG9yczogW3sgdGV4dDogJy54JyB9XSB9LFxuXHRcdFx0XHRcdG9yaWdpbjogJ3JlZ3VsYXInLFxuXHRcdFx0XHRcdHN0eWxlOiB7XG5cdFx0XHRcdFx0XHRjc3NUZXh0OiAnYm9yZGVyOiAxcHggc29saWQgcmVkOycsXG5cdFx0XHRcdFx0XHRjc3NQcm9wZXJ0aWVzOiBbXG5cdFx0XHRcdFx0XHRcdHsgbmFtZTogJ2JvcmRlci10b3Atd2lkdGgnLCB2YWx1ZTogJzFweCcgfSxcblx0XHRcdFx0XHRcdFx0eyBuYW1lOiAnYm9yZGVyLXRvcC1zdHlsZScsIHZhbHVlOiAnc29saWQnIH0sXG5cdFx0XHRcdFx0XHRcdHsgbmFtZTogJ2JvcmRlci10b3AtY29sb3InLCB2YWx1ZTogJ3JlZCcgfSxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdH1dLFxuXHRcdH07XG5cdFx0Y29uc3QgeyBhdXRob3JQcm9wZXJ0eU5hbWVzIH0gPSBmb3JtYXRNYXRjaGVkU3R5bGVzKG1hdGNoZWQpO1xuXHRcdGFzc2VydC5vayhhdXRob3JQcm9wZXJ0eU5hbWVzLmhhcygnYm9yZGVyLXRvcC13aWR0aCcpKTtcblx0XHRhc3NlcnQub2soYXV0aG9yUHJvcGVydHlOYW1lcy5oYXMoJ2JvcmRlci10b3Atc3R5bGUnKSk7XG5cdFx0Ly8gQWx3YXlzLXNob3duIHByb3BlcnRpZXNcblx0XHRhc3NlcnQub2soYXV0aG9yUHJvcGVydHlOYW1lcy5oYXMoJ2Rpc3BsYXknKSk7XG5cdFx0YXNzZXJ0Lm9rKGF1dGhvclByb3BlcnR5TmFtZXMuaGFzKCd3aWR0aCcpKTtcblx0fSk7XG5cblx0dGVzdCgndHJhY2tzIHVzZXItYWdlbnQgcHJvcGVydHkgbmFtZXMgZnJvbSBkaXJlY3QgcnVsZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWF0Y2hlZDogSU1hdGNoZWRTdHlsZXMgPSB7XG5cdFx0XHRtYXRjaGVkQ1NTUnVsZXM6IFtcblx0XHRcdFx0cnVsZSgnLmJ0bicsICdjb2xvcjogd2hpdGU7JyksXG5cdFx0XHRcdHJ1bGUoJ2J1dHRvbicsICdkaXNwbGF5OiBpbmxpbmUtYmxvY2s7IHBhZGRpbmc6IDJweDsnLCAndXNlci1hZ2VudCcpLFxuXHRcdFx0XSxcblx0XHR9O1xuXHRcdGNvbnN0IHsgdXNlckFnZW50UHJvcGVydHlOYW1lcyB9ID0gZm9ybWF0TWF0Y2hlZFN0eWxlcyhtYXRjaGVkKTtcblx0XHRhc3NlcnQub2sodXNlckFnZW50UHJvcGVydHlOYW1lcy5oYXMoJ2Rpc3BsYXknKSk7XG5cdFx0YXNzZXJ0Lm9rKHVzZXJBZ2VudFByb3BlcnR5TmFtZXMuaGFzKCdwYWRkaW5nJykpO1xuXHRcdGFzc2VydC5vayghdXNlckFnZW50UHJvcGVydHlOYW1lcy5oYXMoJ2NvbG9yJykpO1xuXHR9KTtcblxuXHR0ZXN0KCd0cmFja3MgdXNlci1hZ2VudCBwcm9wZXJ0eSBuYW1lcyBmcm9tIHBzZXVkby1lbGVtZW50IHJ1bGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hdGNoZWQ6IElNYXRjaGVkU3R5bGVzID0ge1xuXHRcdFx0bWF0Y2hlZENTU1J1bGVzOiBbcnVsZSgnLngnLCAnY29sb3I6IHJlZDsnKV0sXG5cdFx0XHRwc2V1ZG9FbGVtZW50czogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cHNldWRvVHlwZTogJ2JlZm9yZScsXG5cdFx0XHRcdFx0bWF0Y2hlczogW3J1bGUoJ2lucHV0OjpiZWZvcmUnLCAnY29udGVudDogXCJcIjsgZGlzcGxheTogYmxvY2s7JywgJ3VzZXItYWdlbnQnKV0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdH07XG5cdFx0Y29uc3QgeyB1c2VyQWdlbnRQcm9wZXJ0eU5hbWVzIH0gPSBmb3JtYXRNYXRjaGVkU3R5bGVzKG1hdGNoZWQpO1xuXHRcdGFzc2VydC5vayh1c2VyQWdlbnRQcm9wZXJ0eU5hbWVzLmhhcygnY29udGVudCcpKTtcblx0XHRhc3NlcnQub2sodXNlckFnZW50UHJvcGVydHlOYW1lcy5oYXMoJ2Rpc3BsYXknKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyYWNrcyB1c2VyLWFnZW50IHByb3BlcnR5IG5hbWVzIGZyb20gaW5oZXJpdGVkIHJ1bGVzIChpbmhlcml0YWJsZSBvbmx5KScsICgpID0+IHtcblx0XHRjb25zdCBtYXRjaGVkOiBJTWF0Y2hlZFN0eWxlcyA9IHtcblx0XHRcdG1hdGNoZWRDU1NSdWxlczogW3J1bGUoJy5jaGlsZCcsICdkaXNwbGF5OiBmbGV4OycpXSxcblx0XHRcdGluaGVyaXRlZDogW3tcblx0XHRcdFx0bWF0Y2hlZENTU1J1bGVzOiBbcnVsZSgnYm9keScsICdmb250LWZhbWlseTogc2Fucy1zZXJpZjsgbWFyZ2luOiAwOycsICd1c2VyLWFnZW50JyldLFxuXHRcdFx0fV0sXG5cdFx0fTtcblx0XHRjb25zdCB7IHVzZXJBZ2VudFByb3BlcnR5TmFtZXMgfSA9IGZvcm1hdE1hdGNoZWRTdHlsZXMobWF0Y2hlZCk7XG5cdFx0YXNzZXJ0Lm9rKHVzZXJBZ2VudFByb3BlcnR5TmFtZXMuaGFzKCdmb250LWZhbWlseScpKTtcblx0XHRhc3NlcnQub2soIXVzZXJBZ2VudFByb3BlcnR5TmFtZXMuaGFzKCdtYXJnaW4nKSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxzQkFBc0IsMkJBQWdEO0FBRy9FLFNBQVMsU0FBUyxPQUF5QztBQUMxRCxTQUFPLHFCQUFxQixJQUFJLElBQUksT0FBTyxRQUFRLEtBQUssQ0FBQyxDQUFDO0FBQzNEO0FBRUEsTUFBTSx3QkFBd0IsTUFBTTtBQUVuQywwQ0FBd0M7QUFJeEMsT0FBSywwQ0FBcUMsTUFBTTtBQUMvQyxXQUFPLGdCQUFnQixTQUFTO0FBQUEsTUFDL0IsY0FBYztBQUFBLE1BQVEsZ0JBQWdCO0FBQUEsTUFBUSxpQkFBaUI7QUFBQSxNQUFRLGVBQWU7QUFBQSxJQUN2RixDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUM7QUFBQSxFQUN0QixDQUFDO0FBRUQsT0FBSywrQ0FBMEMsTUFBTTtBQUNwRCxXQUFPLGdCQUFnQixTQUFTO0FBQUEsTUFDL0IsZUFBZTtBQUFBLE1BQU8saUJBQWlCO0FBQUEsTUFBUSxrQkFBa0I7QUFBQSxNQUFPLGdCQUFnQjtBQUFBLElBQ3pGLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDO0FBQUEsRUFDM0IsQ0FBQztBQUVELE9BQUssdUNBQXVDLE1BQU07QUFDakQsV0FBTyxnQkFBZ0IsU0FBUztBQUFBLE1BQy9CLGNBQWM7QUFBQSxNQUFRLGdCQUFnQjtBQUFBLE1BQU8saUJBQWlCO0FBQUEsTUFBUSxlQUFlO0FBQUEsSUFDdEYsQ0FBQyxHQUFHLENBQUMsd0JBQXdCLENBQUM7QUFBQSxFQUMvQixDQUFDO0FBRUQsT0FBSyxtQ0FBbUMsTUFBTTtBQUM3QyxXQUFPLGdCQUFnQixTQUFTO0FBQUEsTUFDL0IsY0FBYztBQUFBLE1BQU8sZ0JBQWdCO0FBQUEsTUFBTyxpQkFBaUI7QUFBQSxNQUFPLGVBQWU7QUFBQSxJQUNwRixDQUFDLEdBQUcsQ0FBQywwQkFBMEIsQ0FBQztBQUFB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
