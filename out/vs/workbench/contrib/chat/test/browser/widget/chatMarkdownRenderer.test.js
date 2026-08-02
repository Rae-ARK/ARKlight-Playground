import assert from "assert";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { assertSnapshot } from "../../../../../../base/test/common/snapshot.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { ChatContentMarkdownRenderer } from "../../../browser/widget/chatContentMarkdownRenderer.js";
import { workbenchInstantiationService } from "../../../../../test/browser/workbenchTestServices.js";
suite("ChatMarkdownRenderer", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let testRenderer;
  setup(() => {
    const instantiationService = store.add(workbenchInstantiationService(void 0, store));
    testRenderer = instantiationService.createInstance(ChatContentMarkdownRenderer);
  });
  test("simple", async () => {
    const md = new MarkdownString("a");
    const result = store.add(testRenderer.render(md));
    await assertSnapshot(result.element.textContent);
  });
  test("plain text fast path preserves rendered markdown shape and single tildes", () => {
    const md = new MarkdownString("Hello, ~world~. This is plain.", { isTrusted: true, supportHtml: true, supportThemeIcons: true });
    const result = store.add(testRenderer.render(md));
    assert.deepStrictEqual({
      outerHTML: result.element.outerHTML,
      textContent: result.element.textContent
    }, {
      outerHTML: '<div class="rendered-markdown"><p>Hello, ~world~. This is plain.</p></div>',
      textContent: "Hello, ~world~. This is plain."
    });
  });
  test("plain text fast path reuses target element", () => {
    const md = new MarkdownString("Hello, world.");
    const target = document.createElement("div");
    target.appendChild(document.createElement("span"));
    const result = store.add(testRenderer.render(md, void 0, target));
    assert.deepStrictEqual({
      sameElement: result.element === target,
      outerHTML: target.outerHTML
    }, {
      sameElement: true,
      outerHTML: '<div class="rendered-markdown"><p>Hello, world.</p></div>'
    });
  });
  test("only renders strikethrough with double tildes", () => {
    const md = new MarkdownString("Keep ~single tildes~ but strike ~~double tildes~~.");
    const result = store.add(testRenderer.render(md, { markedOptions: { gfm: true } }));
    assert.deepStrictEqual({
      outerHTML: result.element.outerHTML,
      textContent: result.element.textContent
    }, {
      outerHTML: '<div class="rendered-markdown"><p>Keep ~single tildes~ but strike <del>double tildes</del>.</p></div>',
      textContent: "Keep ~single tildes~ but strike double tildes."
    });
  });
  test("supportHtml with one-line markdown", async () => {
    const md = new MarkdownString("**hello**");
    md.supportHtml = true;
    const result = store.add(testRenderer.render(md));
    await assertSnapshot(result.element.outerHTML);
    const md2 = new MarkdownString("1. [_hello_](https://example.com) test **text**");
    md2.supportHtml = true;
    const result2 = store.add(testRenderer.render(md2));
    await assertSnapshot(result2.element.outerHTML);
  });
  test("invalid HTML", async () => {
    const md = new MarkdownString("1<canvas>2<details>3</details></canvas>4");
    md.supportHtml = true;
    const result = store.add(testRenderer.render(md));
    await assertSnapshot(result.element.outerHTML);
  });
  test("invalid HTML with attributes", async () => {
    const md = new MarkdownString('1<details id="id1" style="display: none">2<details id="my id 2">3</details></details>4');
    md.supportHtml = true;
    const result = store.add(testRenderer.render(md));
    await assertSnapshot(result.element.outerHTML);
  });
  test("valid HTML", async () => {
    const md = new MarkdownString(`
<h1>heading</h1>
<ul>
	<li>1</li>
	<li><b>hi</b></li>
</ul>
<pre><code>code here</code></pre>`);
    md.supportHtml = true;
    const result = store.add(testRenderer.render(md));
    await assertSnapshot(result.element.outerHTML);
  });
  test("mixed valid and invalid HTML", async () => {
    const md = new MarkdownString(`
<h1>heading</h1>
<details>
<ul>
	<li><span><details><i>1</i></details></span></li>
	<li><b>hi</b></li>
</ul>
</details>
<pre><canvas>canvas here</canvas></pre><details></details>`);
    md.supportHtml = true;
    const result = store.add(testRenderer.render(md));
    await assertSnapshot(result.element.outerHTML);
  });
  test("self-closing elements", async () => {
    {
      const md = new MarkdownString('<area><hr><br><input type="text" value="test">');
      md.supportHtml = true;
      const result = store.add(testRenderer.render(md));
      await assertSnapshot(result.element.outerHTML);
    }
    {
      const md = new MarkdownString('<area><hr><br><input type="checkbox">');
      md.supportHtml = true;
      const result = store.add(testRenderer.render(md));
      await assertSnapshot(result.element.outerHTML);
    }
  });
  test("html comments", async () => {
    const md = new MarkdownString("<!-- comment1 <div></div> --><div>content</div><!-- comment2 -->");
    md.supportHtml = true;
    const result = store.add(testRenderer.render(md));
    await assertSnapshot(result.element.outerHTML);
  });
  test("CDATA", async () => {
    const md = new MarkdownString("<![CDATA[<div>content</div>]]>");
    md.supportHtml = true;
    const result = store.add(testRenderer.render(md));
    await assertSnapshot(result.element.outerHTML);
  });
  test("remote images are disallowed", async () => {
    const md = new MarkdownString('<img src="http://disallowed.com/image.jpg">');
    md.supportHtml = true;
    const result = store.add(testRenderer.render(md));
    await assertSnapshot(result.element.outerHTML);
  });
  test("code block ending at end of content does not leak body tag", async () => {
    const md = new MarkdownString("text\n```ts\nconst x = 1;\n```");
    md.supportHtml = true;
    const result = store.add(testRenderer.render(md));
    const textContent = result.element.textContent;
    assert.ok(!textContent?.includes("</body>"), `Rendered text should not contain </body>, got: ${textContent}`);
  });
  test("fillInIncompleteTokens closes bare codespan when supportHtml is set", () => {
    const md = new MarkdownString("Created isolated worktree for branch `xyz", { supportHtml: true });
    const result = store.add(testRenderer.render(md, { fillInIncompleteTokens: true }));
    const codeEl = result.element.querySelector("code");
    assert.ok(codeEl, `Expected a <code> element in: ${result.element.outerHTML}`);
    assert.strictEqual(codeEl.textContent, "xyz");
    assert.ok(!result.element.textContent?.includes("`"), `Rendered text should not contain a bare backtick, got: ${result.element.textContent}`);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3dpZGdldC9jaGF0TWFya2Rvd25SZW5kZXJlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBhc3NlcnRTbmFwc2hvdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vc25hcHNob3QuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGVudE1hcmtkb3duUmVuZGVyZXIgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudE1hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcblxuc3VpdGUoJ0NoYXRNYXJrZG93blJlbmRlcmVyJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCB0ZXN0UmVuZGVyZXI6IENoYXRDb250ZW50TWFya2Rvd25SZW5kZXJlcjtcblx0c2V0dXAoKCkgPT4ge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgc3RvcmUpKTtcblx0XHR0ZXN0UmVuZGVyZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0Q29udGVudE1hcmtkb3duUmVuZGVyZXIpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaW1wbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbWQgPSBuZXcgTWFya2Rvd25TdHJpbmcoJ2EnKTtcblx0XHRjb25zdCByZXN1bHQgPSBzdG9yZS5hZGQodGVzdFJlbmRlcmVyLnJlbmRlcihtZCkpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KHJlc3VsdC5lbGVtZW50LnRleHRDb250ZW50KTtcblx0fSk7XG5cblx0dGVzdCgncGxhaW4gdGV4dCBmYXN0IHBhdGggcHJlc2VydmVzIHJlbmRlcmVkIG1hcmtkb3duIHNoYXBlIGFuZCBzaW5nbGUgdGlsZGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1kID0gbmV3IE1hcmtkb3duU3RyaW5nKCdIZWxsbywgfndvcmxkfi4gVGhpcyBpcyBwbGFpbi4nLCB7IGlzVHJ1c3RlZDogdHJ1ZSwgc3VwcG9ydEh0bWw6IHRydWUsIHN1cHBvcnRUaGVtZUljb25zOiB0cnVlIH0pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHN0b3JlLmFkZCh0ZXN0UmVuZGVyZXIucmVuZGVyKG1kKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG91dGVySFRNTDogcmVzdWx0LmVsZW1lbnQub3V0ZXJIVE1MLFxuXHRcdFx0dGV4dENvbnRlbnQ6IHJlc3VsdC5lbGVtZW50LnRleHRDb250ZW50LFxuXHRcdH0sIHtcblx0XHRcdG91dGVySFRNTDogJzxkaXYgY2xhc3M9XCJyZW5kZXJlZC1tYXJrZG93blwiPjxwPkhlbGxvLCB+d29ybGR+LiBUaGlzIGlzIHBsYWluLjwvcD48L2Rpdj4nLFxuXHRcdFx0dGV4dENvbnRlbnQ6ICdIZWxsbywgfndvcmxkfi4gVGhpcyBpcyBwbGFpbi4nLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwbGFpbiB0ZXh0IGZhc3QgcGF0aCByZXVzZXMgdGFyZ2V0IGVsZW1lbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWQgPSBuZXcgTWFya2Rvd25TdHJpbmcoJ0hlbGxvLCB3b3JsZC4nKTtcblx0XHRjb25zdCB0YXJnZXQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR0YXJnZXQuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpKTtcblx0XHRjb25zdCByZXN1bHQgPSBzdG9yZS5hZGQodGVzdFJlbmRlcmVyLnJlbmRlcihtZCwgdW5kZWZpbmVkLCB0YXJnZXQpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c2FtZUVsZW1lbnQ6IHJlc3VsdC5lbGVtZW50ID09PSB0YXJnZXQsXG5cdFx0XHRvdXRlckhUTUw6IHRhcmdldC5vdXRlckhUTUwsXG5cdFx0fSwge1xuXHRcdFx0c2FtZUVsZW1lbnQ6IHRydWUsXG5cdFx0XHRvdXRlckhUTUw6ICc8ZGl2IGNsYXNzPVwicmVuZGVyZWQtbWFya2Rvd25cIj48cD5IZWxsbywgd29ybGQuPC9wPjwvZGl2PicsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29ubHkgcmVuZGVycyBzdHJpa2V0aHJvdWdoIHdpdGggZG91YmxlIHRpbGRlcycsICgpID0+IHtcblx0XHRjb25zdCBtZCA9IG5ldyBNYXJrZG93blN0cmluZygnS2VlcCB+c2luZ2xlIHRpbGRlc34gYnV0IHN0cmlrZSB+fmRvdWJsZSB0aWxkZXN+fi4nKTtcblx0XHRjb25zdCByZXN1bHQgPSBzdG9yZS5hZGQodGVzdFJlbmRlcmVyLnJlbmRlcihtZCwgeyBtYXJrZWRPcHRpb25zOiB7IGdmbTogdHJ1ZSB9IH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0b3V0ZXJIVE1MOiByZXN1bHQuZWxlbWVudC5vdXRlckhUTUwsXG5cdFx0XHR0ZXh0Q29udGVudDogcmVzdWx0LmVsZW1lbnQudGV4dENvbnRlbnQsXG5cdFx0fSwge1xuXHRcdFx0b3V0ZXJIVE1MOiAnPGRpdiBjbGFzcz1cInJlbmRlcmVkLW1hcmtkb3duXCI+PHA+S2VlcCB+c2luZ2xlIHRpbGRlc34gYnV0IHN0cmlrZSA8ZGVsPmRvdWJsZSB0aWxkZXM8L2RlbD4uPC9wPjwvZGl2PicsXG5cdFx0XHR0ZXh0Q29udGVudDogJ0tlZXAgfnNpbmdsZSB0aWxkZXN+IGJ1dCBzdHJpa2UgZG91YmxlIHRpbGRlcy4nLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzdXBwb3J0SHRtbCB3aXRoIG9uZS1saW5lIG1hcmtkb3duJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1kID0gbmV3IE1hcmtkb3duU3RyaW5nKCcqKmhlbGxvKionKTtcblx0XHRtZC5zdXBwb3J0SHRtbCA9IHRydWU7XG5cdFx0Y29uc3QgcmVzdWx0ID0gc3RvcmUuYWRkKHRlc3RSZW5kZXJlci5yZW5kZXIobWQpKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChyZXN1bHQuZWxlbWVudC5vdXRlckhUTUwpO1xuXG5cdFx0Y29uc3QgbWQyID0gbmV3IE1hcmtkb3duU3RyaW5nKCcxLiBbX2hlbGxvX10oaHR0cHM6Ly9leGFtcGxlLmNvbSkgdGVzdCAqKnRleHQqKicpO1xuXHRcdG1kMi5zdXBwb3J0SHRtbCA9IHRydWU7XG5cdFx0Y29uc3QgcmVzdWx0MiA9IHN0b3JlLmFkZCh0ZXN0UmVuZGVyZXIucmVuZGVyKG1kMikpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KHJlc3VsdDIuZWxlbWVudC5vdXRlckhUTUwpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnZhbGlkIEhUTUwnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbWQgPSBuZXcgTWFya2Rvd25TdHJpbmcoJzE8Y2FudmFzPjI8ZGV0YWlscz4zPC9kZXRhaWxzPjwvY2FudmFzPjQnKTtcblx0XHRtZC5zdXBwb3J0SHRtbCA9IHRydWU7XG5cdFx0Y29uc3QgcmVzdWx0ID0gc3RvcmUuYWRkKHRlc3RSZW5kZXJlci5yZW5kZXIobWQpKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChyZXN1bHQuZWxlbWVudC5vdXRlckhUTUwpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnZhbGlkIEhUTUwgd2l0aCBhdHRyaWJ1dGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1kID0gbmV3IE1hcmtkb3duU3RyaW5nKCcxPGRldGFpbHMgaWQ9XCJpZDFcIiBzdHlsZT1cImRpc3BsYXk6IG5vbmVcIj4yPGRldGFpbHMgaWQ9XCJteSBpZCAyXCI+MzwvZGV0YWlscz48L2RldGFpbHM+NCcpO1xuXHRcdG1kLnN1cHBvcnRIdG1sID0gdHJ1ZTtcblx0XHRjb25zdCByZXN1bHQgPSBzdG9yZS5hZGQodGVzdFJlbmRlcmVyLnJlbmRlcihtZCkpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KHJlc3VsdC5lbGVtZW50Lm91dGVySFRNTCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ZhbGlkIEhUTUwnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbWQgPSBuZXcgTWFya2Rvd25TdHJpbmcoYFxuPGgxPmhlYWRpbmc8L2gxPlxuPHVsPlxuXHQ8bGk+MTwvbGk+XG5cdDxsaT48Yj5oaTwvYj48L2xpPlxuPC91bD5cbjxwcmU+PGNvZGU+Y29kZSBoZXJlPC9jb2RlPjwvcHJlPmApO1xuXHRcdG1kLnN1cHBvcnRIdG1sID0gdHJ1ZTtcblx0XHRjb25zdCByZXN1bHQgPSBzdG9yZS5hZGQodGVzdFJlbmRlcmVyLnJlbmRlcihtZCkpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KHJlc3VsdC5lbGVtZW50Lm91dGVySFRNTCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21peGVkIHZhbGlkIGFuZCBpbnZhbGlkIEhUTUwnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbWQgPSBuZXcgTWFya2Rvd25TdHJpbmcoYFxuPGgxPmhlYWRpbmc8L2gxPlxuPGRldGFpbHM+XG48dWw+XG5cdDxsaT48c3Bhbj48ZGV0YWlscz48aT4xPC9pPjwvZGV0YWlscz48L3NwYW4+PC9saT5cblx0PGxpPjxiPmhpPC9iPjwvbGk+XG48L3VsPlxuPC9kZXRhaWxzPlxuPHByZT48Y2FudmFzPmNhbnZhcyBoZXJlPC9jYW52YXM+PC9wcmU+PGRldGFpbHM+PC9kZXRhaWxzPmApO1xuXHRcdG1kLnN1cHBvcnRIdG1sID0gdHJ1ZTtcblx0XHRjb25zdCByZXN1bHQgPSBzdG9yZS5hZGQodGVzdFJlbmRlcmVyLnJlbmRlcihtZCkpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KHJlc3VsdC5lbGVtZW50Lm91dGVySFRNTCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlbGYtY2xvc2luZyBlbGVtZW50cycsIGFzeW5jICgpID0+IHtcblx0XHR7XG5cdFx0XHRjb25zdCBtZCA9IG5ldyBNYXJrZG93blN0cmluZygnPGFyZWE+PGhyPjxicj48aW5wdXQgdHlwZT1cInRleHRcIiB2YWx1ZT1cInRlc3RcIj4nKTtcblx0XHRcdG1kLnN1cHBvcnRIdG1sID0gdHJ1ZTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHN0b3JlLmFkZCh0ZXN0UmVuZGVyZXIucmVuZGVyKG1kKSk7XG5cdFx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChyZXN1bHQuZWxlbWVudC5vdXRlckhUTUwpO1xuXHRcdH1cblx0XHR7XG5cdFx0XHRjb25zdCBtZCA9IG5ldyBNYXJrZG93blN0cmluZygnPGFyZWE+PGhyPjxicj48aW5wdXQgdHlwZT1cImNoZWNrYm94XCI+Jyk7XG5cdFx0XHRtZC5zdXBwb3J0SHRtbCA9IHRydWU7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBzdG9yZS5hZGQodGVzdFJlbmRlcmVyLnJlbmRlcihtZCkpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QocmVzdWx0LmVsZW1lbnQub3V0ZXJIVE1MKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2h0bWwgY29tbWVudHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbWQgPSBuZXcgTWFya2Rvd25TdHJpbmcoJzwhLS0gY29tbWVudDEgPGRpdj48L2Rpdj4gLS0+PGRpdj5jb250ZW50PC9kaXY+PCEtLSBjb21tZW50MiAtLT4nKTtcblx0XHRtZC5zdXBwb3J0SHRtbCA9IHRydWU7XG5cdFx0Y29uc3QgcmVzdWx0ID0gc3RvcmUuYWRkKHRlc3RSZW5kZXJlci5yZW5kZXIobWQpKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChyZXN1bHQuZWxlbWVudC5vdXRlckhUTUwpO1xuXHR9KTtcblxuXHR0ZXN0KCdDREFUQScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtZCA9IG5ldyBNYXJrZG93blN0cmluZygnPCFbQ0RBVEFbPGRpdj5jb250ZW50PC9kaXY+XV0+Jyk7XG5cdFx0bWQuc3VwcG9ydEh0bWwgPSB0cnVlO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHN0b3JlLmFkZCh0ZXN0UmVuZGVyZXIucmVuZGVyKG1kKSk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QocmVzdWx0LmVsZW1lbnQub3V0ZXJIVE1MKTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3RlIGltYWdlcyBhcmUgZGlzYWxsb3dlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtZCA9IG5ldyBNYXJrZG93blN0cmluZygnPGltZyBzcmM9XCJodHRwOi8vZGlzYWxsb3dlZC5jb20vaW1hZ2UuanBnXCI+Jyk7XG5cdFx0bWQuc3VwcG9ydEh0bWwgPSB0cnVlO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHN0b3JlLmFkZCh0ZXN0UmVuZGVyZXIucmVuZGVyKG1kKSk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QocmVzdWx0LmVsZW1lbnQub3V0ZXJIVE1MKTtcblx0fSk7XG5cblx0dGVzdCgnY29kZSBibG9jayBlbmRpbmcgYXQgZW5kIG9mIGNvbnRlbnQgZG9lcyBub3QgbGVhayBib2R5IHRhZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtZCA9IG5ldyBNYXJrZG93blN0cmluZygndGV4dFxcbmBgYHRzXFxuY29uc3QgeCA9IDE7XFxuYGBgJyk7XG5cdFx0bWQuc3VwcG9ydEh0bWwgPSB0cnVlO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHN0b3JlLmFkZCh0ZXN0UmVuZGVyZXIucmVuZGVyKG1kKSk7XG5cdFx0Y29uc3QgdGV4dENvbnRlbnQgPSByZXN1bHQuZWxlbWVudC50ZXh0Q29udGVudDtcblx0XHRhc3NlcnQub2soIXRleHRDb250ZW50Py5pbmNsdWRlcygnPC9ib2R5PicpLCBgUmVuZGVyZWQgdGV4dCBzaG91bGQgbm90IGNvbnRhaW4gPC9ib2R5PiwgZ290OiAke3RleHRDb250ZW50fWApO1xuXHR9KTtcblxuXHR0ZXN0KCdmaWxsSW5JbmNvbXBsZXRlVG9rZW5zIGNsb3NlcyBiYXJlIGNvZGVzcGFuIHdoZW4gc3VwcG9ydEh0bWwgaXMgc2V0JywgKCkgPT4ge1xuXHRcdC8vIFJlZ3Jlc3Npb246IHRoZSBjaGF0IGNvbnRlbnQgcmVuZGVyZXIgd3JhcHMgYHN1cHBvcnRIdG1sYCBtYXJrZG93blxuXHRcdC8vIGluIGA8Ym9keT4uLi48L2JvZHk+YCwgd2hpY2ggcHJvZHVjZXMgYSB0cmFpbGluZyBodG1sIHRva2VuLiBUaGVcblx0XHQvLyBwYXJhZ3JhcGgvY29kZXNwYW4gZml4dXAgaW4gYGZpbGxJbkluY29tcGxldGVUb2tlbnNgIG11c3Qgc3RpbGxcblx0XHQvLyBmaXJlIHNvIHN0cmVhbWluZyBhIHBhcnRpYWwgYmFja3RpY2sgKGUuZy4gdGhlIGFnZW50IGhvc3Rcblx0XHQvLyBcIkNyZWF0ZWQgaXNvbGF0ZWQgd29ya3RyZWUgZm9yIGJyYW5jaCBgeHl6XCIgYW5ub3VuY2VtZW50KSBkb2VzXG5cdFx0Ly8gbm90IGxlYXZlIGEgYmFyZSBgIGluIHRoZSBET00gdW50aWwgdGhlIGNsb3NpbmcgYmFja3RpY2sgYXJyaXZlcy5cblx0XHRjb25zdCBtZCA9IG5ldyBNYXJrZG93blN0cmluZygnQ3JlYXRlZCBpc29sYXRlZCB3b3JrdHJlZSBmb3IgYnJhbmNoIGB4eXonLCB7IHN1cHBvcnRIdG1sOiB0cnVlIH0pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHN0b3JlLmFkZCh0ZXN0UmVuZGVyZXIucmVuZGVyKG1kLCB7IGZpbGxJbkluY29tcGxldGVUb2tlbnM6IHRydWUgfSkpO1xuXG5cdFx0Y29uc3QgY29kZUVsID0gcmVzdWx0LmVsZW1lbnQucXVlcnlTZWxlY3RvcignY29kZScpO1xuXHRcdGFzc2VydC5vayhjb2RlRWwsIGBFeHBlY3RlZCBhIDxjb2RlPiBlbGVtZW50IGluOiAke3Jlc3VsdC5lbGVtZW50Lm91dGVySFRNTH1gKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29kZUVsIS50ZXh0Q29udGVudCwgJ3h5eicpO1xuXHRcdGFzc2VydC5vayghcmVzdWx0LmVsZW1lbnQudGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdgJyksIGBSZW5kZXJlZCB0ZXh0IHNob3VsZCBub3QgY29udGFpbiBhIGJhcmUgYmFja3RpY2ssIGdvdDogJHtyZXN1bHQuZWxlbWVudC50ZXh0Q29udGVudH1gKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHNCQUFz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
