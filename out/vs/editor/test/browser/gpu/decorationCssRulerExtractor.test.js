import { deepStrictEqual } from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { DecorationCssRuleExtractor } from "../../../browser/gpu/css/decorationCssRuleExtractor.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { $, getActiveDocument } from "../../../../base/browser/dom.js";
function randomClass() {
  return "test-class-" + generateUuid();
}
suite("DecorationCssRulerExtractor", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let doc;
  let container;
  let extractor;
  let testClassName;
  function addStyleElement(content) {
    const styleElement = $("style");
    styleElement.textContent = content;
    container.append(styleElement);
  }
  function assertStyles(className, expectedCssText) {
    deepStrictEqual(extractor.getStyleRules(container, className).map((e) => e.cssText), expectedCssText);
  }
  setup(() => {
    doc = getActiveDocument();
    extractor = store.add(new DecorationCssRuleExtractor());
    testClassName = randomClass();
    container = $("div");
    doc.body.append(container);
  });
  teardown(() => {
    container.remove();
  });
  test("unknown class should give no styles", () => {
    assertStyles(randomClass(), []);
  });
  test("single style should be picked up", () => {
    addStyleElement(`.${testClassName} { color: red; }`);
    assertStyles(testClassName, [
      `.${testClassName} { color: red; }`
    ]);
  });
  test("multiple styles from the same selector should be picked up", () => {
    addStyleElement(`.${testClassName} { color: red; opacity: 0.5; }`);
    assertStyles(testClassName, [
      `.${testClassName} { color: red; opacity: 0.5; }`
    ]);
  });
  test("multiple styles from  different selectors should be picked up", () => {
    addStyleElement([
      `.${testClassName} { color: red; opacity: 0.5; }`,
      `.${testClassName}:hover { opacity: 1; }`
    ].join("\n"));
    assertStyles(testClassName, [
      `.${testClassName} { color: red; opacity: 0.5; }`,
      `.${testClassName}:hover { opacity: 1; }`
    ]);
  });
  test("multiple styles from the different stylesheets should be picked up", () => {
    addStyleElement(`.${testClassName} { color: red; opacity: 0.5; }`);
    addStyleElement(`.${testClassName}:hover { opacity: 1; }`);
    assertStyles(testClassName, [
      `.${testClassName} { color: red; opacity: 0.5; }`,
      `.${testClassName}:hover { opacity: 1; }`
    ]);
  });
  test("should not pick up styles from selectors where the prefix is the class", () => {
    addStyleElement([
      `.${testClassName} { color: red; }`,
      `.${testClassName}-ignoreme { opacity: 1; }`,
      `.${testClassName}fake { opacity: 1; }`
    ].join("\n"));
    assertStyles(testClassName, [
      `.${testClassName} { color: red; }`
    ]);
  });
  test("should pick up styles with pseudo-class selectors", () => {
    addStyleElement(`.${testClassName} { background-color: green; }`);
    addStyleElement(`.${testClassName}:not(.other) { color: blue; }`);
    const rules = extractor.getStyleRules(container, testClassName);
    deepStrictEqual(rules.length, 2);
    deepStrictEqual(rules[0].style.backgroundColor, "green");
    deepStrictEqual(rules[1].style.color, "blue");
  });
  test("should pick up styles when className has multiple space-separated classes", () => {
    const secondClassName = randomClass();
    addStyleElement([
      `.${testClassName} { color: red; }`,
      `.${secondClassName} { opacity: 0.5; }`,
      `.${testClassName}.${secondClassName} { font-weight: bold; }`
    ].join("\n"));
    const rules = extractor.getStyleRules(container, `${testClassName} ${secondClassName}`);
    deepStrictEqual(rules.length, 3);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci90ZXN0L2Jyb3dzZXIvZ3B1L2RlY29yYXRpb25Dc3NSdWxlckV4dHJhY3Rvci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZGVlcFN0cmljdEVxdWFsIH0gZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRGVjb3JhdGlvbkNzc1J1bGVFeHRyYWN0b3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2dwdS9jc3MvZGVjb3JhdGlvbkNzc1J1bGVFeHRyYWN0b3IuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyAkLCBnZXRBY3RpdmVEb2N1bWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuXG5mdW5jdGlvbiByYW5kb21DbGFzcygpOiBzdHJpbmcge1xuXHRyZXR1cm4gJ3Rlc3QtY2xhc3MtJyArIGdlbmVyYXRlVXVpZCgpO1xufVxuXG5zdWl0ZSgnRGVjb3JhdGlvbkNzc1J1bGVyRXh0cmFjdG9yJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBkb2M6IERvY3VtZW50O1xuXHRsZXQgY29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0bGV0IGV4dHJhY3RvcjogRGVjb3JhdGlvbkNzc1J1bGVFeHRyYWN0b3I7XG5cdGxldCB0ZXN0Q2xhc3NOYW1lOiBzdHJpbmc7XG5cblx0ZnVuY3Rpb24gYWRkU3R5bGVFbGVtZW50KGNvbnRlbnQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHN0eWxlRWxlbWVudCA9ICQoJ3N0eWxlJyk7XG5cdFx0c3R5bGVFbGVtZW50LnRleHRDb250ZW50ID0gY29udGVudDtcblx0XHRjb250YWluZXIuYXBwZW5kKHN0eWxlRWxlbWVudCk7XG5cdH1cblxuXHRmdW5jdGlvbiBhc3NlcnRTdHlsZXMoY2xhc3NOYW1lOiBzdHJpbmcsIGV4cGVjdGVkQ3NzVGV4dDogc3RyaW5nW10pOiB2b2lkIHtcblx0XHRkZWVwU3RyaWN0RXF1YWwoZXh0cmFjdG9yLmdldFN0eWxlUnVsZXMoY29udGFpbmVyLCBjbGFzc05hbWUpLm1hcChlID0+IGUuY3NzVGV4dCksIGV4cGVjdGVkQ3NzVGV4dCk7XG5cdH1cblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0ZG9jID0gZ2V0QWN0aXZlRG9jdW1lbnQoKTtcblx0XHRleHRyYWN0b3IgPSBzdG9yZS5hZGQobmV3IERlY29yYXRpb25Dc3NSdWxlRXh0cmFjdG9yKCkpO1xuXHRcdHRlc3RDbGFzc05hbWUgPSByYW5kb21DbGFzcygpO1xuXHRcdGNvbnRhaW5lciA9ICQoJ2RpdicpO1xuXHRcdGRvYy5ib2R5LmFwcGVuZChjb250YWluZXIpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0Y29udGFpbmVyLnJlbW92ZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd1bmtub3duIGNsYXNzIHNob3VsZCBnaXZlIG5vIHN0eWxlcycsICgpID0+IHtcblx0XHRhc3NlcnRTdHlsZXMocmFuZG9tQ2xhc3MoKSwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaW5nbGUgc3R5bGUgc2hvdWxkIGJlIHBpY2tlZCB1cCcsICgpID0+IHtcblx0XHRhZGRTdHlsZUVsZW1lbnQoYC4ke3Rlc3RDbGFzc05hbWV9IHsgY29sb3I6IHJlZDsgfWApO1xuXHRcdGFzc2VydFN0eWxlcyh0ZXN0Q2xhc3NOYW1lLCBbXG5cdFx0XHRgLiR7dGVzdENsYXNzTmFtZX0geyBjb2xvcjogcmVkOyB9YFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aXBsZSBzdHlsZXMgZnJvbSB0aGUgc2FtZSBzZWxlY3RvciBzaG91bGQgYmUgcGlja2VkIHVwJywgKCkgPT4ge1xuXHRcdGFkZFN0eWxlRWxlbWVudChgLiR7dGVzdENsYXNzTmFtZX0geyBjb2xvcjogcmVkOyBvcGFjaXR5OiAwLjU7IH1gKTtcblx0XHRhc3NlcnRTdHlsZXModGVzdENsYXNzTmFtZSwgW1xuXHRcdFx0YC4ke3Rlc3RDbGFzc05hbWV9IHsgY29sb3I6IHJlZDsgb3BhY2l0eTogMC41OyB9YFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aXBsZSBzdHlsZXMgZnJvbSAgZGlmZmVyZW50IHNlbGVjdG9ycyBzaG91bGQgYmUgcGlja2VkIHVwJywgKCkgPT4ge1xuXHRcdGFkZFN0eWxlRWxlbWVudChbXG5cdFx0XHRgLiR7dGVzdENsYXNzTmFtZX0geyBjb2xvcjogcmVkOyBvcGFjaXR5OiAwLjU7IH1gLFxuXHRcdFx0YC4ke3Rlc3RDbGFzc05hbWV9OmhvdmVyIHsgb3BhY2l0eTogMTsgfWAsXG5cdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0YXNzZXJ0U3R5bGVzKHRlc3RDbGFzc05hbWUsIFtcblx0XHRcdGAuJHt0ZXN0Q2xhc3NOYW1lfSB7IGNvbG9yOiByZWQ7IG9wYWNpdHk6IDAuNTsgfWAsXG5cdFx0XHRgLiR7dGVzdENsYXNzTmFtZX06aG92ZXIgeyBvcGFjaXR5OiAxOyB9YCxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnbXVsdGlwbGUgc3R5bGVzIGZyb20gdGhlIGRpZmZlcmVudCBzdHlsZXNoZWV0cyBzaG91bGQgYmUgcGlja2VkIHVwJywgKCkgPT4ge1xuXHRcdGFkZFN0eWxlRWxlbWVudChgLiR7dGVzdENsYXNzTmFtZX0geyBjb2xvcjogcmVkOyBvcGFjaXR5OiAwLjU7IH1gKTtcblx0XHRhZGRTdHlsZUVsZW1lbnQoYC4ke3Rlc3RDbGFzc05hbWV9OmhvdmVyIHsgb3BhY2l0eTogMTsgfWApO1xuXHRcdGFzc2VydFN0eWxlcyh0ZXN0Q2xhc3NOYW1lLCBbXG5cdFx0XHRgLiR7dGVzdENsYXNzTmFtZX0geyBjb2xvcjogcmVkOyBvcGFjaXR5OiAwLjU7IH1gLFxuXHRcdFx0YC4ke3Rlc3RDbGFzc05hbWV9OmhvdmVyIHsgb3BhY2l0eTogMTsgfWAsXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBub3QgcGljayB1cCBzdHlsZXMgZnJvbSBzZWxlY3RvcnMgd2hlcmUgdGhlIHByZWZpeCBpcyB0aGUgY2xhc3MnLCAoKSA9PiB7XG5cdFx0YWRkU3R5bGVFbGVtZW50KFtcblx0XHRcdGAuJHt0ZXN0Q2xhc3NOYW1lfSB7IGNvbG9yOiByZWQ7IH1gLFxuXHRcdFx0YC4ke3Rlc3RDbGFzc05hbWV9LWlnbm9yZW1lIHsgb3BhY2l0eTogMTsgfWAsXG5cdFx0XHRgLiR7dGVzdENsYXNzTmFtZX1mYWtlIHsgb3BhY2l0eTogMTsgfWAsXG5cdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0YXNzZXJ0U3R5bGVzKHRlc3RDbGFzc05hbWUsIFtcblx0XHRcdGAuJHt0ZXN0Q2xhc3NOYW1lfSB7IGNvbG9yOiByZWQ7IH1gLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgcGljayB1cCBzdHlsZXMgd2l0aCBwc2V1ZG8tY2xhc3Mgc2VsZWN0b3JzJywgKCkgPT4ge1xuXHRcdGFkZFN0eWxlRWxlbWVudChgLiR7dGVzdENsYXNzTmFtZX0geyBiYWNrZ3JvdW5kLWNvbG9yOiBncmVlbjsgfWApO1xuXHRcdGFkZFN0eWxlRWxlbWVudChgLiR7dGVzdENsYXNzTmFtZX06bm90KC5vdGhlcikgeyBjb2xvcjogYmx1ZTsgfWApO1xuXHRcdGNvbnN0IHJ1bGVzID0gZXh0cmFjdG9yLmdldFN0eWxlUnVsZXMoY29udGFpbmVyLCB0ZXN0Q2xhc3NOYW1lKTtcblx0XHRkZWVwU3RyaWN0RXF1YWwocnVsZXMubGVuZ3RoLCAyKTtcblx0XHRkZWVwU3RyaWN0RXF1YWwocnVsZXNbMF0uc3R5bGUuYmFja2dyb3VuZENvbG9yLCAnZ3JlZW4nKTtcblx0XHRkZWVwU3RyaWN0RXF1YWwocnVsZXNbMV0uc3R5bGUuY29sb3IsICdibHVlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBwaWNrIHVwIHN0eWxlcyB3aGVuIGNsYXNzTmFtZSBoYXMgbXVsdGlwbGUgc3BhY2Utc2VwYXJhdGVkIGNsYXNzZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vjb25kQ2xhc3NOYW1lID0gcmFuZG9tQ2xhc3MoKTtcblx0XHRhZGRTdHlsZUVsZW1lbnQoW1xuXHRcdFx0YC4ke3Rlc3RDbGFzc05hbWV9IHsgY29sb3I6IHJlZDsgfWAsXG5cdFx0XHRgLiR7c2Vjb25kQ2xhc3NOYW1lfSB7IG9wYWNpdHk6IDAuNTsgfWAsXG5cdFx0XHRgLiR7dGVzdENsYXNzTmFtZX0uJHtzZWNvbmRDbGFzc05hbWV9IHsgZm9udC13ZWlnaHQ6IGJvbGQ7IH1gLFxuXHRcdF0uam9pbignXFxuJykpO1xuXHRcdC8vIFBhc3Mgc3BhY2Utc2VwYXJhdGVkIGNsYXNzZXMgbGlrZSAnY2xhc3MxIGNsYXNzMidcblx0XHRjb25zdCBydWxlcyA9IGV4dHJhY3Rvci5nZXRTdHlsZVJ1bGVzKGNvbnRhaW5lciwgYCR7dGVzdENsYXNzTmFtZX0gJHtzZWNvbmRDbGFzc05hbWV9YCk7XG5cdFx0Ly8gU2hvdWxkIGZpbmQgcnVsZXMgZm9yIGJvdGggY2xhc3NlcyBhbmQgdGhlIGNoYWluZWQgc2VsZWN0b3Jcblx0XHRkZWVwU3RyaWN0RXF1YWwocnVsZXMubGVuZ3RoLCAzKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsR0FBRyx5QkFBeUI7QUFFckMsU0FBUyxjQUFzQjtBQUM5QixTQUFPLGdCQUFnQixhQUFhO0FBQ3JDO0FBRUEsTUFBTSwrQkFBK0IsTUFBTTtBQUMxQyxRQUFNLFFBQVEsd0NBQXdDO0FBRXRELE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFFSixXQUFTLGdCQUFnQixTQUF1QjtBQUMvQyxVQUFNLGVBQWUsRUFBRSxPQUFPO0FBQzlCLGlCQUFhLGNBQWM7QUFDM0IsY0FBVSxPQUFPLFlBQVk7QUFBQSxFQUM5QjtBQUVBLFdBQVMsYUFBYSxXQUFtQixpQkFBaUM7QUFDekUsb0JBQWdCLFVBQVUsY0FBYyxXQUFXLFNBQVMsRUFBRSxJQUFJLE9BQUssRUFBRSxPQUFPLEdBQUcsZUFBZTtBQUFBLEVBQ25HO0FBRUEsUUFBTSxNQUFNO0FBQ1gsVUFBTSxrQkFBa0I7QUFDeEIsZ0JBQVksTUFBTSxJQUFJLElBQUksMkJBQTJCLENBQUM7QUFDdEQsb0JBQWdCLFlBQVk7QUFDNUIsZ0JBQVksRUFBRSxLQUFLO0FBQ25CLFFBQUksS0FBSyxPQUFPLFNBQVM7QUFBQSxFQUMxQixDQUFDO0FBRUQsV0FBUyxNQUFNO0FBQ2QsY0FBVSxPQUFPO0FBQUEsRUFDbEIsQ0FBQztBQUVELE9BQUssdUNBQXVDLE1BQU07QUFDakQsaUJBQWEsWUFBWSxHQUFHLENBQUMsQ0FBQztBQUFBLEVBQy9CLENBQUM7QUFFRCxPQUFLLG9DQUFvQyxNQUFNO0FBQzlDLG9CQUFnQixJQUFJLGFBQWEsa0JBQWtCO0FBQ25ELGlCQUFhLGVBQWU7QUFBQSxNQUMzQixJQUFJLGFBQWE7QUFBQSxJQUNsQixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyw4REFBOEQsTUFBTTtBQUN4RSxvQkFBZ0IsSUFBSSxhQUFhLGdDQUFnQztBQUNqRSxpQkFBYSxlQUFlO0FBQUEsTUFDM0IsSUFBSSxhQUFhO0FBQUEsSUFDbEIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssaUVBQWlFLE1BQU07QUFDM0Usb0JBQWdCO0FBQUEsTUFDZixJQUFJLGFBQWE7QUFBQSxNQUNqQixJQUFJLGFBQWE7QUFBQSxJQUNsQixFQUFFLEtBQUssSUFBSSxDQUFDO0FBQ1osaUJBQWEsZUFBZTtBQUFBLE1BQzNCLElBQUksYUFBYTtBQUFBLE1BQ2pCLElBQUksYUFBYTtBQUFBLElBQ2xCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHNFQUFzRSxNQUFNO0FBQ2hGLG9CQUFnQixJQUFJLGFBQWEsZ0NBQWdDO0FBQ2pFLG9CQUFnQixJQUFJLGFBQWEsd0JBQXdCO0FBQ3pELGlCQUFhLGVBQWU7QUFBQSxNQUMzQixJQUFJLGFBQWE7QUFBQSxNQUNqQixJQUFJLGFBQWE7QUFBQSxJQUNsQixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywwRUFBMEUsTUFBTTtBQUNwRixvQkFBZ0I7QUFBQSxNQUNmLElBQUksYUFBYTtBQUFBLE1BQ2pCLElBQUksYUFBYTtBQUFBLE1BQ2pCLElBQUksYUFBYTtBQUFBLElBQ2xCLEVBQUUsS0FBSyxJQUFJLENBQUM7QUFDWixpQkFBYSxlQUFlO0FBQUEsTUFDM0IsSUFBSSxhQUFhO0FBQUEsSUFDbEIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUsscURBQXFELE1BQU07QUFDL0Qsb0JBQWdCLElBQUksYUFBYSwrQkFBK0I7QUFDaEUsb0JBQWdCLElBQUksYUFBYSwrQkFBK0I7QUFDaEUsVUFBTSxRQUFRLFVBQVUsY0FBYyxXQUFXLGFBQWE7QUFDOUQsb0JBQWdCLE1BQU0sUUFBUSxDQUFDO0FBQy9CLG9CQUFnQixNQUFNLENBQUMsRUFBRSxNQUFNLGlCQUFpQixPQUFPO0FBQ3ZELG9CQUFnQixNQUFNLENBQUMsRUFBRSxNQUFNLE9BQU8sTUFBTTtBQUFBLEVBQzdDLENBQUM7QUFFRCxPQUFLLDZFQUE2RSxNQUFNO0FBQ3ZGLFVBQU0sa0JBQWtCLFlBQVk7QUFDcEMsb0JBQWdCO0FBQUEsTUFDZixJQUFJLGFBQWE7QUFBQSxNQUNqQixJQUFJLGVBQWU7QUFBQSxNQUNuQixJQUFJLGFBQWEsSUFBSSxlQUFlO0FBQUEsSUFDckMsRUFBRSxLQUFLLElBQUksQ0FBQztBQUVaLFVBQU0sUUFBUSxVQUFVLGNBQWMsV0FBVyxHQUFHLGFBQWEsSUFBSSxlQUFlLEVBQUU7QUFFdEYsb0JBQWdCLE1BQU0sUUFBUSxDQUFDO0FBQUEsRUFDaEMsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
