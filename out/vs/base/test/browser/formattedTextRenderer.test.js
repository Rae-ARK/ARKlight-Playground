import assert from "assert";
import { renderFormattedText, renderText } from "../../browser/formattedTextRenderer.js";
import { DisposableStore } from "../../common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../common/utils.js";
import { $ } from "../../browser/dom.js";
suite("FormattedTextRenderer", () => {
  const store = new DisposableStore();
  setup(() => {
    store.clear();
  });
  teardown(() => {
    store.clear();
  });
  test("render simple element", () => {
    const result = renderText("testing");
    assert.strictEqual(result.nodeType, document.ELEMENT_NODE);
    assert.strictEqual(result.textContent, "testing");
    assert.strictEqual(result.tagName, "DIV");
  });
  test("render element with target", () => {
    const target = $("div.testClass");
    const result = renderText("testing", {}, target);
    assert.strictEqual(result.nodeType, document.ELEMENT_NODE);
    assert.strictEqual(result, target);
    assert.strictEqual(result.className, "testClass");
  });
  test("simple formatting", () => {
    let result = renderFormattedText("**bold**");
    assert.strictEqual(result.children.length, 1);
    assert.strictEqual(result.firstChild.textContent, "bold");
    assert.strictEqual(result.firstChild.tagName, "B");
    assert.strictEqual(result.innerHTML, "<b>bold</b>");
    result = renderFormattedText("__italics__");
    assert.strictEqual(result.innerHTML, "<i>italics</i>");
    result = renderFormattedText("``code``");
    assert.strictEqual(result.innerHTML, "``code``");
    result = renderFormattedText("``code``", { renderCodeSegments: true });
    assert.strictEqual(result.innerHTML, "<code>code</code>");
    result = renderFormattedText("this string has **bold**, __italics__, and ``code``!!", { renderCodeSegments: true });
    assert.strictEqual(result.innerHTML, "this string has <b>bold</b>, <i>italics</i>, and <code>code</code>!!");
  });
  test("no formatting", () => {
    const result = renderFormattedText("this is just a string");
    assert.strictEqual(result.innerHTML, "this is just a string");
  });
  test("preserve newlines", () => {
    const result = renderFormattedText("line one\nline two");
    assert.strictEqual(result.innerHTML, "line one<br>line two");
  });
  test("action", () => {
    let callbackCalled = false;
    const result = renderFormattedText("[[action]]", {
      actionHandler: {
        callback(content) {
          assert.strictEqual(content, "0");
          callbackCalled = true;
        },
        disposables: store
      }
    });
    assert.strictEqual(result.innerHTML, "<a>action</a>");
    const event = document.createEvent("MouseEvent");
    event.initEvent("click", true, true);
    result.firstChild.dispatchEvent(event);
    assert.strictEqual(callbackCalled, true);
  });
  test("fancy action", () => {
    let callbackCalled = false;
    const result = renderFormattedText("__**[[action]]**__", {
      actionHandler: {
        callback(content) {
          assert.strictEqual(content, "0");
          callbackCalled = true;
        },
        disposables: store
      }
    });
    assert.strictEqual(result.innerHTML, "<i><b><a>action</a></b></i>");
    const event = document.createEvent("MouseEvent");
    event.initEvent("click", true, true);
    result.firstChild.firstChild.firstChild.dispatchEvent(event);
    assert.strictEqual(callbackCalled, true);
  });
  test("fancier action", () => {
    let callbackCalled = false;
    const result = renderFormattedText("``__**[[action]]**__``", {
      renderCodeSegments: true,
      actionHandler: {
        callback(content) {
          assert.strictEqual(content, "0");
          callbackCalled = true;
        },
        disposables: store
      }
    });
    assert.strictEqual(result.innerHTML, "<code><i><b><a>action</a></b></i></code>");
    const event = document.createEvent("MouseEvent");
    event.initEvent("click", true, true);
    result.firstChild.firstChild.firstChild.firstChild.dispatchEvent(event);
    assert.strictEqual(callbackCalled, true);
  });
  test("escaped formatting", () => {
    const result = renderFormattedText("\\*\\*bold\\*\\*");
    assert.strictEqual(result.children.length, 0);
    assert.strictEqual(result.innerHTML, "**bold**");
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9icm93c2VyL2Zvcm1hdHRlZFRleHRSZW5kZXJlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgcmVuZGVyRm9ybWF0dGVkVGV4dCwgcmVuZGVyVGV4dCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvZm9ybWF0dGVkVGV4dFJlbmRlcmVyLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7ICQgfSBmcm9tICcuLi8uLi9icm93c2VyL2RvbS5qcyc7XG5cbnN1aXRlKCdGb3JtYXR0ZWRUZXh0UmVuZGVyZXInLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRzdG9yZS5jbGVhcigpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0c3RvcmUuY2xlYXIoKTtcblx0fSk7XG5cblx0dGVzdCgncmVuZGVyIHNpbXBsZSBlbGVtZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdDogSFRNTEVsZW1lbnQgPSByZW5kZXJUZXh0KCd0ZXN0aW5nJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm5vZGVUeXBlLCBkb2N1bWVudC5FTEVNRU5UX05PREUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudGV4dENvbnRlbnQsICd0ZXN0aW5nJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC50YWdOYW1lLCAnRElWJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbmRlciBlbGVtZW50IHdpdGggdGFyZ2V0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHRhcmdldCA9ICQoJ2Rpdi50ZXN0Q2xhc3MnKTtcblx0XHRjb25zdCByZXN1bHQgPSByZW5kZXJUZXh0KCd0ZXN0aW5nJywge30sIHRhcmdldCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5ub2RlVHlwZSwgZG9jdW1lbnQuRUxFTUVOVF9OT0RFKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB0YXJnZXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY2xhc3NOYW1lLCAndGVzdENsYXNzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NpbXBsZSBmb3JtYXR0aW5nJywgKCkgPT4ge1xuXHRcdGxldCByZXN1bHQ6IEhUTUxFbGVtZW50ID0gcmVuZGVyRm9ybWF0dGVkVGV4dCgnKipib2xkKionKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNoaWxkcmVuLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5maXJzdENoaWxkIS50ZXh0Q29udGVudCwgJ2JvbGQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKDxIVE1MRWxlbWVudD5yZXN1bHQuZmlyc3RDaGlsZCkudGFnTmFtZSwgJ0InKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmlubmVySFRNTCwgJzxiPmJvbGQ8L2I+Jyk7XG5cblx0XHRyZXN1bHQgPSByZW5kZXJGb3JtYXR0ZWRUZXh0KCdfX2l0YWxpY3NfXycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaW5uZXJIVE1MLCAnPGk+aXRhbGljczwvaT4nKTtcblxuXHRcdHJlc3VsdCA9IHJlbmRlckZvcm1hdHRlZFRleHQoJ2BgY29kZWBgJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbm5lckhUTUwsICdgYGNvZGVgYCcpO1xuXG5cdFx0cmVzdWx0ID0gcmVuZGVyRm9ybWF0dGVkVGV4dCgnYGBjb2RlYGAnLCB7IHJlbmRlckNvZGVTZWdtZW50czogdHJ1ZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmlubmVySFRNTCwgJzxjb2RlPmNvZGU8L2NvZGU+Jyk7XG5cblx0XHRyZXN1bHQgPSByZW5kZXJGb3JtYXR0ZWRUZXh0KCd0aGlzIHN0cmluZyBoYXMgKipib2xkKiosIF9faXRhbGljc19fLCBhbmQgYGBjb2RlYGAhIScsIHsgcmVuZGVyQ29kZVNlZ21lbnRzOiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaW5uZXJIVE1MLCAndGhpcyBzdHJpbmcgaGFzIDxiPmJvbGQ8L2I+LCA8aT5pdGFsaWNzPC9pPiwgYW5kIDxjb2RlPmNvZGU8L2NvZGU+ISEnKTtcblx0fSk7XG5cblx0dGVzdCgnbm8gZm9ybWF0dGluZycsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQ6IEhUTUxFbGVtZW50ID0gcmVuZGVyRm9ybWF0dGVkVGV4dCgndGhpcyBpcyBqdXN0IGEgc3RyaW5nJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbm5lckhUTUwsICd0aGlzIGlzIGp1c3QgYSBzdHJpbmcnKTtcblx0fSk7XG5cblx0dGVzdCgncHJlc2VydmUgbmV3bGluZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0OiBIVE1MRWxlbWVudCA9IHJlbmRlckZvcm1hdHRlZFRleHQoJ2xpbmUgb25lXFxubGluZSB0d28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmlubmVySFRNTCwgJ2xpbmUgb25lPGJyPmxpbmUgdHdvJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FjdGlvbicsICgpID0+IHtcblx0XHRsZXQgY2FsbGJhY2tDYWxsZWQgPSBmYWxzZTtcblx0XHRjb25zdCByZXN1bHQ6IEhUTUxFbGVtZW50ID0gcmVuZGVyRm9ybWF0dGVkVGV4dCgnW1thY3Rpb25dXScsIHtcblx0XHRcdGFjdGlvbkhhbmRsZXI6IHtcblx0XHRcdFx0Y2FsbGJhY2soY29udGVudCkge1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50LCAnMCcpO1xuXHRcdFx0XHRcdGNhbGxiYWNrQ2FsbGVkID0gdHJ1ZTtcblx0XHRcdFx0fSxcblx0XHRcdFx0ZGlzcG9zYWJsZXM6IHN0b3JlXG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbm5lckhUTUwsICc8YT5hY3Rpb248L2E+Jyk7XG5cblx0XHRjb25zdCBldmVudDogTW91c2VFdmVudCA9IGRvY3VtZW50LmNyZWF0ZUV2ZW50KCdNb3VzZUV2ZW50Jyk7XG5cdFx0ZXZlbnQuaW5pdEV2ZW50KCdjbGljaycsIHRydWUsIHRydWUpO1xuXHRcdHJlc3VsdC5maXJzdENoaWxkIS5kaXNwYXRjaEV2ZW50KGV2ZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbGJhY2tDYWxsZWQsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdmYW5jeSBhY3Rpb24nLCAoKSA9PiB7XG5cdFx0bGV0IGNhbGxiYWNrQ2FsbGVkID0gZmFsc2U7XG5cdFx0Y29uc3QgcmVzdWx0OiBIVE1MRWxlbWVudCA9IHJlbmRlckZvcm1hdHRlZFRleHQoJ19fKipbW2FjdGlvbl1dKipfXycsIHtcblx0XHRcdGFjdGlvbkhhbmRsZXI6IHtcblx0XHRcdFx0Y2FsbGJhY2soY29udGVudCkge1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50LCAnMCcpO1xuXHRcdFx0XHRcdGNhbGxiYWNrQ2FsbGVkID0gdHJ1ZTtcblx0XHRcdFx0fSxcblx0XHRcdFx0ZGlzcG9zYWJsZXM6IHN0b3JlXG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbm5lckhUTUwsICc8aT48Yj48YT5hY3Rpb248L2E+PC9iPjwvaT4nKTtcblxuXHRcdGNvbnN0IGV2ZW50OiBNb3VzZUV2ZW50ID0gZG9jdW1lbnQuY3JlYXRlRXZlbnQoJ01vdXNlRXZlbnQnKTtcblx0XHRldmVudC5pbml0RXZlbnQoJ2NsaWNrJywgdHJ1ZSwgdHJ1ZSk7XG5cdFx0cmVzdWx0LmZpcnN0Q2hpbGQhLmZpcnN0Q2hpbGQhLmZpcnN0Q2hpbGQhLmRpc3BhdGNoRXZlbnQoZXZlbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWxsYmFja0NhbGxlZCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZhbmNpZXIgYWN0aW9uJywgKCkgPT4ge1xuXHRcdGxldCBjYWxsYmFja0NhbGxlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IHJlc3VsdDogSFRNTEVsZW1lbnQgPSByZW5kZXJGb3JtYXR0ZWRUZXh0KCdgYF9fKipbW2FjdGlvbl1dKipfX2BgJywge1xuXHRcdFx0cmVuZGVyQ29kZVNlZ21lbnRzOiB0cnVlLFxuXHRcdFx0YWN0aW9uSGFuZGxlcjoge1xuXHRcdFx0XHRjYWxsYmFjayhjb250ZW50KSB7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnQsICcwJyk7XG5cdFx0XHRcdFx0Y2FsbGJhY2tDYWxsZWQgPSB0cnVlO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRkaXNwb3NhYmxlczogc3RvcmVcblx0XHRcdH1cblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmlubmVySFRNTCwgJzxjb2RlPjxpPjxiPjxhPmFjdGlvbjwvYT48L2I+PC9pPjwvY29kZT4nKTtcblxuXHRcdGNvbnN0IGV2ZW50OiBNb3VzZUV2ZW50ID0gZG9jdW1lbnQuY3JlYXRlRXZlbnQoJ01vdXNlRXZlbnQnKTtcblx0XHRldmVudC5pbml0RXZlbnQoJ2NsaWNrJywgdHJ1ZSwgdHJ1ZSk7XG5cdFx0cmVzdWx0LmZpcnN0Q2hpbGQhLmZpcnN0Q2hpbGQhLmZpcnN0Q2hpbGQhLmZpcnN0Q2hpbGQhLmRpc3BhdGNoRXZlbnQoZXZlbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWxsYmFja0NhbGxlZCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VzY2FwZWQgZm9ybWF0dGluZycsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQ6IEhUTUxFbGVtZW50ID0gcmVuZGVyRm9ybWF0dGVkVGV4dCgnXFxcXCpcXFxcKmJvbGRcXFxcKlxcXFwqJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jaGlsZHJlbi5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaW5uZXJIVE1MLCAnKipib2xkKionKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHFCQUFxQixrQkFBa0I7QUFDaEQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxTQUFTO0FBRWxCLE1BQU0seUJBQXlCLE1BQU07QUFDcEMsUUFBTSxRQUFRLElBQUksZ0JBQWdCO0FBRWxDLFFBQU0sTUFBTTtBQUNYLFVBQU0sTUFBTTtBQUFBLEVBQ2IsQ0FB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
