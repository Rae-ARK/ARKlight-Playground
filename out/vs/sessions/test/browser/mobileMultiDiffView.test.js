import assert from "assert";
import { mainWindow } from "../../../base/browser/window.js";
import { EventType as TouchEventType } from "../../../base/browser/touch.js";
import { toDisposable } from "../../../base/common/lifecycle.js";
import { URI } from "../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../base/test/common/utils.js";
import { MobileMultiDiffView } from "../../browser/parts/mobile/contributions/mobileMultiDiffView.js";
suite("MobileMultiDiffView", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("loads visible files incrementally instead of batching the initial viewport", async () => {
    const fileCount = 100;
    const files = /* @__PURE__ */ new Map();
    const diffs = [];
    for (let i = 0; i < fileCount; i++) {
      const originalURI = URI.parse(`inmemory://original/src/file${i}.ts`);
      const modifiedURI = URI.parse(`inmemory://modified/src/file${i}.ts`);
      files.set(originalURI.toString(), `export const value${i} = ${i};
`);
      files.set(modifiedURI.toString(), `export const value${i} = ${i + 1};
`);
      diffs.push({
        originalURI,
        modifiedURI,
        identical: false,
        added: 1,
        removed: 1
      });
    }
    const readUris = [];
    const textFileService = {
      read(uri) {
        readUris.push(uri.toString());
        return Promise.resolve({ value: files.get(uri.toString()) ?? "" });
      }
    };
    const fileService = {};
    const languageService = {
      guessLanguageIdByFilepathOrFirstLine() {
        return "typescript";
      }
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    store.add(toDisposable(() => container.remove()));
    const view = store.add(new MobileMultiDiffView(container, { diffs }, textFileService, fileService, languageService));
    await animationFrames(2);
    const initialReadCount = readUris.length;
    assert.strictEqual(initialReadCount, 2, "opening the view should load one visible file pair");
    const initialMountedSections = container.querySelectorAll(".mobile-multi-diff-file-section").length;
    assert.ok(initialMountedSections > 0, "opening the view should mount visible file sections");
    assert.ok(initialMountedSections < fileCount, "opening the view should not mount every file section");
    const scrollWrapper = container.querySelector(".mobile-overlay-scroll");
    assert.ok(scrollWrapper, "scroll wrapper should exist");
    const virtualContent = container.querySelector(".mobile-multi-diff-virtual-content");
    assert.ok(virtualContent, "virtual content should exist");
    let appendChildCount = 0;
    const originalAppendChild = virtualContent.appendChild;
    virtualContent.appendChild = function(node) {
      appendChildCount++;
      return originalAppendChild.call(this, node);
    };
    store.add(toDisposable(() => {
      virtualContent.appendChild = originalAppendChild;
    }));
    scrollWrapper.scrollTop = scrollWrapper.scrollHeight;
    scrollWrapper.dispatchEvent(new Event("scroll"));
    await animationFrames(2);
    assert.ok(readUris.length > initialReadCount, "scrolling should load more files");
    assert.ok(readUris.length <= initialReadCount + 4, "scrolling should load at most one additional file pair per frame");
    const mountedSectionsAfterScroll = container.querySelectorAll(".mobile-multi-diff-file-section").length;
    assert.ok(mountedSectionsAfterScroll > 0, "scrolling should mount file sections for the new viewport");
    assert.ok(mountedSectionsAfterScroll < fileCount, "scrolling should still not mount every file section");
    scrollWrapper.scrollTop = 0;
    scrollWrapper.dispatchEvent(new Event("scroll"));
    await animationFrames(2);
    assert.strictEqual(new Set(readUris).size, readUris.length, "remounting loaded files should not reread resources");
    assert.strictEqual(appendChildCount, 0, "scrolling should not reappend mounted file sections");
    view.dispose();
  });
  test("uses a larger tappable file header to expand and collapse sections", async () => {
    const originalURI = URI.parse("inmemory://original/src/toggle.ts");
    const modifiedURI = URI.parse("inmemory://modified/src/toggle.ts");
    const files = /* @__PURE__ */ new Map([
      [originalURI.toString(), "export const value = 1;\n"],
      [modifiedURI.toString(), "export const value = 2;\n"]
    ]);
    const textFileService = {
      read(uri) {
        return Promise.resolve({ value: files.get(uri.toString()) ?? "" });
      }
    };
    const fileService = {};
    const languageService = {
      guessLanguageIdByFilepathOrFirstLine() {
        return "typescript";
      }
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    store.add(toDisposable(() => container.remove()));
    const view = store.add(new MobileMultiDiffView(container, {
      diffs: [{
        originalURI,
        modifiedURI,
        identical: false,
        added: 1,
        removed: 1
      }]
    }, textFileService, fileService, languageService));
    const section = container.querySelector(".mobile-multi-diff-file-section");
    assert.ok(section, "file section should exist");
    const header = section.querySelector(".mobile-multi-diff-file-header");
    assert.ok(header, "file header should exist");
    const chevron = header.querySelector(".mobile-multi-diff-file-chevron");
    assert.ok(chevron, "file header chevron should exist");
    assert.strictEqual(mainWindow.getComputedStyle(header).height, "44px", "file header should be a touch-friendly height");
    header.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    assert.ok(section.classList.contains("collapsed"), "tapping the header should collapse the file section");
    assert.strictEqual(chevron.getAttribute("aria-expanded"), "false");
    chevron.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    assert.ok(!section.classList.contains("collapsed"), "tapping the chevron should expand once without bubbling into a second toggle");
    assert.strictEqual(chevron.getAttribute("aria-expanded"), "true");
    chevron.dispatchEvent(new Event(TouchEventType.Tap, { bubbles: true, cancelable: true }));
    assert.ok(section.classList.contains("collapsed"), "touch tapping the chevron should collapse through the header target");
    assert.strictEqual(chevron.getAttribute("aria-expanded"), "false");
    view.dispose();
  });
  test("virtualizes rows inside a loaded large file body", async () => {
    const lineCount = 200;
    const originalURI = URI.parse("inmemory://original/src/large.ts");
    const modifiedURI = URI.parse("inmemory://modified/src/large.ts");
    const originalText = Array.from({ length: lineCount }, (_, i) => `export const fileValue${i} = ${i};`).join("\n");
    const modifiedText = Array.from({ length: lineCount }, (_, i) => `export const fileValue${i} = ${i + 1e3};`).join("\n");
    const files = /* @__PURE__ */ new Map([
      [originalURI.toString(), originalText],
      [modifiedURI.toString(), modifiedText]
    ]);
    const textFileService = {
      read(uri) {
        return Promise.resolve({ value: files.get(uri.toString()) ?? "" });
      }
    };
    const fileService = {};
    const languageService = {
      guessLanguageIdByFilepathOrFirstLine() {
        return "typescript";
      }
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    store.add(toDisposable(() => container.remove()));
    const view = store.add(new MobileMultiDiffView(container, {
      diffs: [{
        originalURI,
        modifiedURI,
        identical: false,
        added: lineCount,
        removed: lineCount
      }]
    }, textFileService, fileService, languageService));
    await waitForCondition(() => container.querySelectorAll(".mobile-diff-line").length > 0, "loaded file should render visible rows");
    const renderedRows = container.querySelectorAll(".mobile-diff-line").length;
    assert.ok(renderedRows < lineCount * 2, "loaded file should not render every diff row");
    const bodyInner = container.querySelector(".mobile-multi-diff-file-content-inner");
    assert.ok(bodyInner, "loaded file should render a stable body wrapper");
    assertEntryOrder(container);
    const scrollWrapper = container.querySelector(".mobile-overlay-scroll");
    assert.ok(scrollWrapper, "scroll wrapper should exist");
    scrollWrapper.scrollTop = 1200;
    scrollWrapper.dispatchEvent(new Event("scroll"));
    await waitForCondition(() => container.querySelector(".mobile-multi-diff-file-content-inner") === bodyInner, "scrolling should keep the same body wrapper");
    const renderedRowsAfterScroll = container.querySelectorAll(".mobile-diff-line").length;
    assert.ok(renderedRowsAfterScroll < lineCount * 2, "scrolling should keep rendering only the visible diff rows");
    assertEntryOrder(container);
    view.dispose();
  });
  test("prefetches the next file near a boundary without mounting its section", async () => {
    const fileCount = 3;
    const lineCount = 200;
    const files = /* @__PURE__ */ new Map();
    const diffs = [];
    for (let i = 0; i < fileCount; i++) {
      const originalURI = URI.parse(`inmemory://original/src/prefetch${i}.ts`);
      const modifiedURI = URI.parse(`inmemory://modified/src/prefetch${i}.ts`);
      files.set(originalURI.toString(), Array.from({ length: lineCount }, (_, line) => `export const value${line} = ${line};`).join("\n"));
      files.set(modifiedURI.toString(), Array.from({ length: lineCount }, (_, line) => `export const value${line} = ${line + 1e3};`).join("\n"));
      diffs.push({
        originalURI,
        modifiedURI,
        identical: false,
        added: lineCount,
        removed: lineCount
      });
    }
    const readUris = [];
    const textFileService = {
      read(uri) {
        readUris.push(uri.toString());
        return Promise.resolve({ value: files.get(uri.toString()) ?? "" });
      }
    };
    const fileService = {};
    const languageService = {
      guessLanguageIdByFilepathOrFirstLine() {
        return "typescript";
      }
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    store.add(toDisposable(() => container.remove()));
    const view = store.add(new MobileMultiDiffView(container, { diffs }, textFileService, fileService, languageService));
    await waitForCondition(() => container.querySelectorAll(".mobile-diff-line").length > 0, "first file should load before prefetching near its boundary");
    assert.ok(readUris.some((uri) => uri.includes("prefetch0.ts")), "opening should read the first file");
    assert.ok(!readUris.some((uri) => uri.includes("prefetch1.ts")), "opening should not immediately prefetch the next large file");
    const scrollWrapper = container.querySelector(".mobile-overlay-scroll");
    assert.ok(scrollWrapper, "scroll wrapper should exist");
    scrollWrapper.scrollTop = 5e3;
    scrollWrapper.dispatchEvent(new Event("scroll"));
    await waitForCondition(() => readUris.some((uri) => uri.includes("prefetch1.ts")), "approaching a file boundary should prefetch the next file");
    assert.strictEqual(container.querySelector('.mobile-multi-diff-file-section[data-index="1"]'), null, "prefetching should not mount the next file section");
    assert.ok(!readUris.some((uri) => uri.includes("prefetch2.ts")), "prefetching should stay bounded to the near file");
    view.dispose();
  });
  test("starts loading the newly visible file while an older load is pending", async () => {
    const fileCount = 40;
    const files = /* @__PURE__ */ new Map();
    const diffs = [];
    for (let i = 0; i < fileCount; i++) {
      const originalURI = URI.parse(`inmemory://original/src/file${i}.ts`);
      const modifiedURI = URI.parse(`inmemory://modified/src/file${i}.ts`);
      files.set(originalURI.toString(), `export const value${i} = ${i};
`);
      files.set(modifiedURI.toString(), `export const value${i} = ${i + 1};
`);
      diffs.push({
        originalURI,
        modifiedURI,
        identical: false,
        added: 100,
        removed: 100
      });
    }
    const readUris = [];
    const pendingReads = /* @__PURE__ */ new Map();
    const textFileService = {
      read(uri) {
        readUris.push(uri.toString());
        const pending = deferred();
        pendingReads.set(uri.toString(), pending);
        return pending.promise;
      }
    };
    const fileService = {};
    const languageService = {
      guessLanguageIdByFilepathOrFirstLine() {
        return "typescript";
      }
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    store.add(toDisposable(() => container.remove()));
    const view = store.add(new MobileMultiDiffView(container, { diffs }, textFileService, fileService, languageService));
    await animationFrames(2);
    assert.ok(readUris.some((uri) => uri.includes("file0.ts")), "opening the view should start loading the first file");
    const scrollWrapper = container.querySelector(".mobile-overlay-scroll");
    assert.ok(scrollWrapper, "scroll wrapper should exist");
    scrollWrapper.scrollTop = scrollWrapper.scrollHeight;
    scrollWrapper.dispatchEvent(new Event("scroll"));
    await animationFrames(3);
    assert.ok(readUris.some((uri) => uri.includes(`file${fileCount - 1}.ts`)), "scrolling should start loading the newly visible file even while the first file is pending");
    view.dispose();
    resolvePendingReads(pendingReads, files);
  });
  test("keeps an unloaded large file body covered by a sticky loading placeholder", async () => {
    const fileCount = 3;
    const files = /* @__PURE__ */ new Map();
    const diffs = [];
    for (let i = 0; i < fileCount; i++) {
      const originalURI = URI.parse(`inmemory://original/src/large${i}.ts`);
      const modifiedURI = URI.parse(`inmemory://modified/src/large${i}.ts`);
      files.set(originalURI.toString(), `export const value${i} = ${i};
`);
      files.set(modifiedURI.toString(), `export const value${i} = ${i + 1};
`);
      diffs.push({
        originalURI,
        modifiedURI,
        identical: false,
        added: 1e3,
        removed: 1e3
      });
    }
    const pendingReads = /* @__PURE__ */ new Map();
    const textFileService = {
      read(uri) {
        const pending = deferred();
        pendingReads.set(uri.toString(), pending);
        return pending.promise;
      }
    };
    const fileService = {};
    const languageService = {
      guessLanguageIdByFilepathOrFirstLine() {
        return "typescript";
      }
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    store.add(toDisposable(() => container.remove()));
    const view = store.add(new MobileMultiDiffView(container, { diffs }, textFileService, fileService, languageService));
    await animationFrames(2);
    const scrollWrapper = container.querySelector(".mobile-overlay-scroll");
    assert.ok(scrollWrapper, "scroll wrapper should exist");
    scrollWrapper.scrollTop = scrollWrapper.scrollHeight;
    scrollWrapper.dispatchEvent(new Event("scroll"));
    await animationFrames(2);
    const placeholderContent = Array.from(container.querySelectorAll(".mobile-multi-diff-file-content-placeholder"));
    const bottomFileContent = placeholderContent.find((content) => Number(content.parentElement.dataset.index) === fileCount - 1);
    assert.ok(bottomFileContent, "the unloaded file at the new scroll position should render placeholder content");
    assert.strictEqual(bottomFileContent.style.transform, "", "loading placeholders should not rely on JS scroll transforms");
    assert.ok(bottomFileContent.style.height, "the placeholder should reserve the file body height");
    const emptyState = bottomFileContent.querySelector(".mobile-diff-empty-state");
    assert.ok(emptyState, "the placeholder should contain a loading message");
    assert.ok(emptyState.textContent?.includes("Loading"), "the placeholder should not be blank");
    assert.ok(emptyState.style.height, "the placeholder message should reserve visible viewport height");
    assert.strictEqual(mainWindow.getComputedStyle(emptyState).position, "sticky", "the loading message should remain visible during native scroll");
    view.dispose();
    resolvePendingReads(pendingReads, files);
  });
});
function animationFrame() {
  return new Promise((resolve) => mainWindow.requestAnimationFrame(() => resolve()));
}
async function animationFrames(count) {
  for (let i = 0; i < count; i++) {
    await animationFrame();
  }
}
async function waitForCondition(condition, message) {
  for (let i = 0; i < 60; i++) {
    if (condition()) {
      return;
    }
    await animationFrame();
  }
  assert.fail(message);
}
function assertEntryOrder(container) {
  const indexes = Array.from(container.querySelectorAll(".mobile-multi-diff-body-entry"), (element) => Number(element.dataset.entryIndex));
  assert.deepStrictEqual(indexes, indexes.slice().sort((a, b) => a - b), "rendered body entries should stay in document order");
}
function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function resolvePendingReads(pendingReads, files) {
  for (const [uri, pending] of pendingReads) {
    pending.resolve({ value: files.get(uri) ?? "" });
  }
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL3Rlc3QvYnJvd3Nlci9tb2JpbGVNdWx0aURpZmZWaWV3LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBFdmVudFR5cGUgYXMgVG91Y2hFdmVudFR5cGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdG91Y2guanMnO1xuaW1wb3J0IHsgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSVRleHRGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy90ZXh0ZmlsZS9jb21tb24vdGV4dGZpbGVzLmpzJztcbmltcG9ydCB7IE1vYmlsZU11bHRpRGlmZlZpZXcgfSBmcm9tICcuLi8uLi9icm93c2VyL3BhcnRzL21vYmlsZS9jb250cmlidXRpb25zL21vYmlsZU11bHRpRGlmZlZpZXcuanMnO1xuaW1wb3J0IHsgSUZpbGVEaWZmVmlld0RhdGEgfSBmcm9tICcuLi8uLi9icm93c2VyL3BhcnRzL21vYmlsZS9jb250cmlidXRpb25zL21vYmlsZURpZmZWaWV3LmpzJztcblxuc3VpdGUoJ01vYmlsZU11bHRpRGlmZlZpZXcnLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnbG9hZHMgdmlzaWJsZSBmaWxlcyBpbmNyZW1lbnRhbGx5IGluc3RlYWQgb2YgYmF0Y2hpbmcgdGhlIGluaXRpYWwgdmlld3BvcnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZUNvdW50ID0gMTAwO1xuXHRcdGNvbnN0IGZpbGVzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0XHRjb25zdCBkaWZmczogSUZpbGVEaWZmVmlld0RhdGFbXSA9IFtdO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBmaWxlQ291bnQ7IGkrKykge1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWxVUkkgPSBVUkkucGFyc2UoYGlubWVtb3J5Oi8vb3JpZ2luYWwvc3JjL2ZpbGUke2l9LnRzYCk7XG5cdFx0XHRjb25zdCBtb2RpZmllZFVSSSA9IFVSSS5wYXJzZShgaW5tZW1vcnk6Ly9tb2RpZmllZC9zcmMvZmlsZSR7aX0udHNgKTtcblx0XHRcdGZpbGVzLnNldChvcmlnaW5hbFVSSS50b1N0cmluZygpLCBgZXhwb3J0IGNvbnN0IHZhbHVlJHtpfSA9ICR7aX07XFxuYCk7XG5cdFx0XHRmaWxlcy5zZXQobW9kaWZpZWRVUkkudG9TdHJpbmcoKSwgYGV4cG9ydCBjb25zdCB2YWx1ZSR7aX0gPSAke2kgKyAxfTtcXG5gKTtcblx0XHRcdGRpZmZzLnB1c2goe1xuXHRcdFx0XHRvcmlnaW5hbFVSSSxcblx0XHRcdFx0bW9kaWZpZWRVUkksXG5cdFx0XHRcdGlkZW50aWNhbDogZmFsc2UsXG5cdFx0XHRcdGFkZGVkOiAxLFxuXHRcdFx0XHRyZW1vdmVkOiAxLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVhZFVyaXM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgdGV4dEZpbGVTZXJ2aWNlID0ge1xuXHRcdFx0cmVhZCh1cmk6IFVSSSkge1xuXHRcdFx0XHRyZWFkVXJpcy5wdXNoKHVyaS50b1N0cmluZygpKTtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IHZhbHVlOiBmaWxlcy5nZXQodXJpLnRvU3RyaW5nKCkpID8/ICcnIH0pO1xuXHRcdFx0fVxuXHRcdH0gYXMgdW5rbm93biBhcyBJVGV4dEZpbGVTZXJ2aWNlO1xuXG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSB7fSBhcyBJRmlsZVNlcnZpY2U7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlID0ge1xuXHRcdFx0Z3Vlc3NMYW5ndWFnZUlkQnlGaWxlcGF0aE9yRmlyc3RMaW5lKCk6IHN0cmluZyB7XG5cdFx0XHRcdHJldHVybiAndHlwZXNjcmlwdCc7XG5cdFx0XHR9XG5cdFx0fSBhcyB1bmtub3duIGFzIElMYW5ndWFnZVNlcnZpY2U7XG5cblx0XHRjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGNvbnRhaW5lcik7XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBjb250YWluZXIucmVtb3ZlKCkpKTtcblxuXHRcdGNvbnN0IHZpZXcgPSBzdG9yZS5hZGQobmV3IE1vYmlsZU11bHRpRGlmZlZpZXcoY29udGFpbmVyLCB7IGRpZmZzIH0sIHRleHRGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UsIGxhbmd1YWdlU2VydmljZSkpO1xuXHRcdGF3YWl0IGFuaW1hdGlvbkZyYW1lcygyKTtcblxuXHRcdGNvbnN0IGluaXRpYWxSZWFkQ291bnQgPSByZWFkVXJpcy5sZW5ndGg7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluaXRpYWxSZWFkQ291bnQsIDIsICdvcGVuaW5nIHRoZSB2aWV3IHNob3VsZCBsb2FkIG9uZSB2aXNpYmxlIGZpbGUgcGFpcicpO1xuXHRcdGNvbnN0IGluaXRpYWxNb3VudGVkU2VjdGlvbnMgPSBjb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnLm1vYmlsZS1tdWx0aS1kaWZmLWZpbGUtc2VjdGlvbicpLmxlbmd0aDtcblx0XHRhc3NlcnQub2soaW5pdGlhbE1vdW50ZWRTZWN0aW9ucyA+IDAsICdvcGVuaW5nIHRoZSB2aWV3IHNob3VsZCBtb3VudCB2aXNpYmxlIGZpbGUgc2VjdGlvbnMnKTtcblx0XHRhc3NlcnQub2soaW5pdGlhbE1vdW50ZWRTZWN0aW9ucyA8IGZpbGVDb3VudCwgJ29wZW5pbmcgdGhlIHZpZXcgc2hvdWxkIG5vdCBtb3VudCBldmVyeSBmaWxlIHNlY3Rpb24nKTtcblxuXHRcdGNvbnN0IHNjcm9sbFdyYXBwZXIgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcignLm1vYmlsZS1vdmVybGF5LXNjcm9sbCcpIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcblx0XHRhc3NlcnQub2soc2Nyb2xsV3JhcHBlciwgJ3Njcm9sbCB3cmFwcGVyIHNob3VsZCBleGlzdCcpO1xuXHRcdGNvbnN0IHZpcnR1YWxDb250ZW50ID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5tb2JpbGUtbXVsdGktZGlmZi12aXJ0dWFsLWNvbnRlbnQnKSBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG5cdFx0YXNzZXJ0Lm9rKHZpcnR1YWxDb250ZW50LCAndmlydHVhbCBjb250ZW50IHNob3VsZCBleGlzdCcpO1xuXG5cdFx0bGV0IGFwcGVuZENoaWxkQ291bnQgPSAwO1xuXHRcdGNvbnN0IG9yaWdpbmFsQXBwZW5kQ2hpbGQgPSB2aXJ0dWFsQ29udGVudC5hcHBlbmRDaGlsZDtcblx0XHR2aXJ0dWFsQ29udGVudC5hcHBlbmRDaGlsZCA9IGZ1bmN0aW9uIDxUIGV4dGVuZHMgTm9kZT4obm9kZTogVCk6IFQge1xuXHRcdFx0YXBwZW5kQ2hpbGRDb3VudCsrO1xuXHRcdFx0cmV0dXJuIG9yaWdpbmFsQXBwZW5kQ2hpbGQuY2FsbCh0aGlzLCBub2RlKSBhcyBUO1xuXHRcdH07XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR2aXJ0dWFsQ29udGVudC5hcHBlbmRDaGlsZCA9IG9yaWdpbmFsQXBwZW5kQ2hpbGQ7XG5cdFx0fSkpO1xuXG5cdFx0c2Nyb2xsV3JhcHBlci5zY3JvbGxUb3AgPSBzY3JvbGxXcmFwcGVyLnNjcm9sbEhlaWdodDtcblx0XHRzY3JvbGxXcmFwcGVyLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdzY3JvbGwnKSk7XG5cdFx0YXdhaXQgYW5pbWF0aW9uRnJhbWVzKDIpO1xuXG5cdFx0YXNzZXJ0Lm9rKHJlYWRVcmlzLmxlbmd0aCA+IGluaXRpYWxSZWFkQ291bnQsICdzY3JvbGxpbmcgc2hvdWxkIGxvYWQgbW9yZSBmaWxlcycpO1xuXHRcdGFzc2VydC5vayhyZWFkVXJpcy5sZW5ndGggPD0gaW5pdGlhbFJlYWRDb3VudCArIDQsICdzY3JvbGxpbmcgc2hvdWxkIGxvYWQgYXQgbW9zdCBvbmUgYWRkaXRpb25hbCBmaWxlIHBhaXIgcGVyIGZyYW1lJyk7XG5cdFx0Y29uc3QgbW91bnRlZFNlY3Rpb25zQWZ0ZXJTY3JvbGwgPSBjb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnLm1vYmlsZS1tdWx0aS1kaWZmLWZpbGUtc2VjdGlvbicpLmxlbmd0aDtcblx0XHRhc3NlcnQub2sobW91bnRlZFNlY3Rpb25zQWZ0ZXJTY3JvbGwgPiAwLCAnc2Nyb2xsaW5nIHNob3VsZCBtb3VudCBmaWxlIHNlY3Rpb25zIGZvciB0aGUgbmV3IHZpZXdwb3J0Jyk7XG5cdFx0YXNzZXJ0Lm9rKG1vdW50ZWRTZWN0aW9uc0FmdGVyU2Nyb2xsIDwgZmlsZUNvdW50LCAnc2Nyb2xsaW5nIHNob3VsZCBzdGlsbCBub3QgbW91bnQgZXZlcnkgZmlsZSBzZWN0aW9uJyk7XG5cblx0XHRzY3JvbGxXcmFwcGVyLnNjcm9sbFRvcCA9IDA7XG5cdFx0c2Nyb2xsV3JhcHBlci5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnc2Nyb2xsJykpO1xuXHRcdGF3YWl0IGFuaW1hdGlvbkZyYW1lcygyKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXcgU2V0KHJlYWRVcmlzKS5zaXplLCByZWFkVXJpcy5sZW5ndGgsICdyZW1vdW50aW5nIGxvYWRlZCBmaWxlcyBzaG91bGQgbm90IHJlcmVhZCByZXNvdXJjZXMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwZW5kQ2hpbGRDb3VudCwgMCwgJ3Njcm9sbGluZyBzaG91bGQgbm90IHJlYXBwZW5kIG1vdW50ZWQgZmlsZSBzZWN0aW9ucycpO1xuXG5cdFx0dmlldy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgYSBsYXJnZXIgdGFwcGFibGUgZmlsZSBoZWFkZXIgdG8gZXhwYW5kIGFuZCBjb2xsYXBzZSBzZWN0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbFVSSSA9IFVSSS5wYXJzZSgnaW5tZW1vcnk6Ly9vcmlnaW5hbC9zcmMvdG9nZ2xlLnRzJyk7XG5cdFx0Y29uc3QgbW9kaWZpZWRVUkkgPSBVUkkucGFyc2UoJ2lubWVtb3J5Oi8vbW9kaWZpZWQvc3JjL3RvZ2dsZS50cycpO1xuXHRcdGNvbnN0IGZpbGVzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oW1xuXHRcdFx0W29yaWdpbmFsVVJJLnRvU3RyaW5nKCksICdleHBvcnQgY29uc3QgdmFsdWUgPSAxO1xcbiddLFxuXHRcdFx0W21vZGlmaWVkVVJJLnRvU3RyaW5nKCksICdleHBvcnQgY29uc3QgdmFsdWUgPSAyO1xcbiddLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgdGV4dEZpbGVTZXJ2aWNlID0ge1xuXHRcdFx0cmVhZCh1cmk6IFVSSSkge1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHsgdmFsdWU6IGZpbGVzLmdldCh1cmkudG9TdHJpbmcoKSkgPz8gJycgfSk7XG5cdFx0XHR9XG5cdFx0fSBhcyB1bmtub3duIGFzIElUZXh0RmlsZVNlcnZpY2U7XG5cblx0XHRjb25zdCBmaWxlU2VydmljZSA9IHt9IGFzIElGaWxlU2VydmljZTtcblx0XHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSB7XG5cdFx0XHRndWVzc0xhbmd1YWdlSWRCeUZpbGVwYXRoT3JGaXJzdExpbmUoKTogc3RyaW5nIHtcblx0XHRcdFx0cmV0dXJuICd0eXBlc2NyaXB0Jztcblx0XHRcdH1cblx0XHR9IGFzIHVua25vd24gYXMgSUxhbmd1YWdlU2VydmljZTtcblxuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoY29udGFpbmVyKTtcblx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGNvbnRhaW5lci5yZW1vdmUoKSkpO1xuXG5cdFx0Y29uc3QgdmlldyA9IHN0b3JlLmFkZChuZXcgTW9iaWxlTXVsdGlEaWZmVmlldyhjb250YWluZXIsIHtcblx0XHRcdGRpZmZzOiBbe1xuXHRcdFx0XHRvcmlnaW5hbFVSSSxcblx0XHRcdFx0bW9kaWZpZWRVUkksXG5cdFx0XHRcdGlkZW50aWNhbDogZmFsc2UsXG5cdFx0XHRcdGFkZGVkOiAxLFxuXHRcdFx0XHRyZW1vdmVkOiAxLFxuXHRcdFx0fV1cblx0XHR9LCB0ZXh0RmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlLCBsYW5ndWFnZVNlcnZpY2UpKTtcblxuXHRcdGNvbnN0IHNlY3Rpb24gPSBjb250YWluZXIucXVlcnlTZWxlY3RvcignLm1vYmlsZS1tdWx0aS1kaWZmLWZpbGUtc2VjdGlvbicpIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcblx0XHRhc3NlcnQub2soc2VjdGlvbiwgJ2ZpbGUgc2VjdGlvbiBzaG91bGQgZXhpc3QnKTtcblx0XHRjb25zdCBoZWFkZXIgPSBzZWN0aW9uLnF1ZXJ5U2VsZWN0b3IoJy5tb2JpbGUtbXVsdGktZGlmZi1maWxlLWhlYWRlcicpIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcblx0XHRhc3NlcnQub2soaGVhZGVyLCAnZmlsZSBoZWFkZXIgc2hvdWxkIGV4aXN0Jyk7XG5cdFx0Y29uc3QgY2hldnJvbiA9IGhlYWRlci5xdWVyeVNlbGVjdG9yKCcubW9iaWxlLW11bHRpLWRpZmYtZmlsZS1jaGV2cm9uJykgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuXHRcdGFzc2VydC5vayhjaGV2cm9uLCAnZmlsZSBoZWFkZXIgY2hldnJvbiBzaG91bGQgZXhpc3QnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFpbldpbmRvdy5nZXRDb21wdXRlZFN0eWxlKGhlYWRlcikuaGVpZ2h0LCAnNDRweCcsICdmaWxlIGhlYWRlciBzaG91bGQgYmUgYSB0b3VjaC1mcmllbmRseSBoZWlnaHQnKTtcblxuXHRcdGhlYWRlci5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdjbGljaycsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG5cdFx0YXNzZXJ0Lm9rKHNlY3Rpb24uY2xhc3NMaXN0LmNvbnRhaW5zKCdjb2xsYXBzZWQnKSwgJ3RhcHBpbmcgdGhlIGhlYWRlciBzaG91bGQgY29sbGFwc2UgdGhlIGZpbGUgc2VjdGlvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGV2cm9uLmdldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpLCAnZmFsc2UnKTtcblxuXHRcdGNoZXZyb24uZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnY2xpY2snLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuXHRcdGFzc2VydC5vayghc2VjdGlvbi5jbGFzc0xpc3QuY29udGFpbnMoJ2NvbGxhcHNlZCcpLCAndGFwcGluZyB0aGUgY2hldnJvbiBzaG91bGQgZXhwYW5kIG9uY2Ugd2l0aG91dCBidWJibGluZyBpbnRvIGEgc2Vjb25kIHRvZ2dsZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGV2cm9uLmdldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpLCAndHJ1ZScpO1xuXG5cdFx0Y2hldnJvbi5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudChUb3VjaEV2ZW50VHlwZS5UYXAsIHsgYnViYmxlczogdHJ1ZSwgY2FuY2VsYWJsZTogdHJ1ZSB9KSk7XG5cdFx0YXNzZXJ0Lm9rKHNlY3Rpb24uY2xhc3NMaXN0LmNvbnRhaW5zKCdjb2xsYXBzZWQnKSwgJ3RvdWNoIHRhcHBpbmcgdGhlIGNoZXZyb24gc2hvdWxkIGNvbGxhcHNlIHRocm91Z2ggdGhlIGhlYWRlciB0YXJnZXQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hldnJvbi5nZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnKSwgJ2ZhbHNlJyk7XG5cblx0XHR2aWV3LmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgndmlydHVhbGl6ZXMgcm93cyBpbnNpZGUgYSBsb2FkZWQgbGFyZ2UgZmlsZSBib2R5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxpbmVDb3VudCA9IDIwMDtcblx0XHRjb25zdCBvcmlnaW5hbFVSSSA9IFVSSS5wYXJzZSgnaW5tZW1vcnk6Ly9vcmlnaW5hbC9zcmMvbGFyZ2UudHMnKTtcblx0XHRjb25zdCBtb2RpZmllZFVSSSA9IFVSSS5wYXJzZSgnaW5tZW1vcnk6Ly9tb2RpZmllZC9zcmMvbGFyZ2UudHMnKTtcblx0XHRjb25zdCBvcmlnaW5hbFRleHQgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiBsaW5lQ291bnQgfSwgKF8sIGkpID0+IGBleHBvcnQgY29uc3QgZmlsZVZhbHVlJHtpfSA9ICR7aX07YCkuam9pbignXFxuJyk7XG5cdFx0Y29uc3QgbW9kaWZpZWRUZXh0ID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogbGluZUNvdW50IH0sIChfLCBpKSA9PiBgZXhwb3J0IGNvbnN0IGZpbGVWYWx1ZSR7aX0gPSAke2kgKyAxMDAwfTtgKS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCBmaWxlcyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KFtcblx0XHRcdFtvcmlnaW5hbFVSSS50b1N0cmluZygpLCBvcmlnaW5hbFRleHRdLFxuXHRcdFx0W21vZGlmaWVkVVJJLnRvU3RyaW5nKCksIG1vZGlmaWVkVGV4dF0sXG5cdFx0XSk7XG5cblx0XHRjb25zdCB0ZXh0RmlsZVNlcnZpY2UgPSB7XG5cdFx0XHRyZWFkKHVyaTogVVJJKSB7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoeyB2YWx1ZTogZmlsZXMuZ2V0KHVyaS50b1N0cmluZygpKSA/PyAnJyB9KTtcblx0XHRcdH1cblx0XHR9IGFzIHVua25vd24gYXMgSVRleHRGaWxlU2VydmljZTtcblxuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0ge30gYXMgSUZpbGVTZXJ2aWNlO1xuXHRcdGNvbnN0IGxhbmd1YWdlU2VydmljZSA9IHtcblx0XHRcdGd1ZXNzTGFuZ3VhZ2VJZEJ5RmlsZXBhdGhPckZpcnN0TGluZSgpOiBzdHJpbmcge1xuXHRcdFx0XHRyZXR1cm4gJ3R5cGVzY3JpcHQnO1xuXHRcdFx0fVxuXHRcdH0gYXMgdW5rbm93biBhcyBJTGFuZ3VhZ2VTZXJ2aWNlO1xuXG5cdFx0Y29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChjb250YWluZXIpO1xuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gY29udGFpbmVyLnJlbW92ZSgpKSk7XG5cblx0XHRjb25zdCB2aWV3ID0gc3RvcmUuYWRkKG5ldyBNb2JpbGVNdWx0aURpZmZWaWV3KGNvbnRhaW5lciwge1xuXHRcdFx0ZGlmZnM6IFt7XG5cdFx0XHRcdG9yaWdpbmFsVVJJLFxuXHRcdFx0XHRtb2RpZmllZFVSSSxcblx0XHRcdFx0aWRlbnRpY2FsOiBmYWxzZSxcblx0XHRcdFx0YWRkZWQ6IGxpbmVDb3VudCxcblx0XHRcdFx0cmVtb3ZlZDogbGluZUNvdW50LFxuXHRcdFx0fV1cblx0XHR9LCB0ZXh0RmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlLCBsYW5ndWFnZVNlcnZpY2UpKTtcblx0XHRhd2FpdCB3YWl0Rm9yQ29uZGl0aW9uKCgpID0+IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCcubW9iaWxlLWRpZmYtbGluZScpLmxlbmd0aCA+IDAsICdsb2FkZWQgZmlsZSBzaG91bGQgcmVuZGVyIHZpc2libGUgcm93cycpO1xuXG5cdFx0Y29uc3QgcmVuZGVyZWRSb3dzID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy5tb2JpbGUtZGlmZi1saW5lJykubGVuZ3RoO1xuXHRcdGFzc2VydC5vayhyZW5kZXJlZFJvd3MgPCBsaW5lQ291bnQgKiAyLCAnbG9hZGVkIGZpbGUgc2hvdWxkIG5vdCByZW5kZXIgZXZlcnkgZGlmZiByb3cnKTtcblxuXHRcdGNvbnN0IGJvZHlJbm5lciA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcubW9iaWxlLW11bHRpLWRpZmYtZmlsZS1jb250ZW50LWlubmVyJykgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuXHRcdGFzc2VydC5vayhib2R5SW5uZXIsICdsb2FkZWQgZmlsZSBzaG91bGQgcmVuZGVyIGEgc3RhYmxlIGJvZHkgd3JhcHBlcicpO1xuXHRcdGFzc2VydEVudHJ5T3JkZXIoY29udGFpbmVyKTtcblxuXHRcdGNvbnN0IHNjcm9sbFdyYXBwZXIgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcignLm1vYmlsZS1vdmVybGF5LXNjcm9sbCcpIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcblx0XHRhc3NlcnQub2soc2Nyb2xsV3JhcHBlciwgJ3Njcm9sbCB3cmFwcGVyIHNob3VsZCBleGlzdCcpO1xuXHRcdHNjcm9sbFdyYXBwZXIuc2Nyb2xsVG9wID0gMTIwMDtcblx0XHRzY3JvbGxXcmFwcGVyLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdzY3JvbGwnKSk7XG5cdFx0YXdhaXQgd2FpdEZvckNvbmRpdGlvbigoKSA9PiBjb250YWluZXIucXVlcnlTZWxlY3RvcignLm1vYmlsZS1tdWx0aS1kaWZmLWZpbGUtY29udGVudC1pbm5lcicpID09PSBib2R5SW5uZXIsICdzY3JvbGxpbmcgc2hvdWxkIGtlZXAgdGhlIHNhbWUgYm9keSB3cmFwcGVyJyk7XG5cblx0XHRjb25zdCByZW5kZXJlZFJvd3NBZnRlclNjcm9sbCA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCcubW9iaWxlLWRpZmYtbGluZScpLmxlbmd0aDtcblx0XHRhc3NlcnQub2socmVuZGVyZWRSb3dzQWZ0ZXJTY3JvbGwgPCBsaW5lQ291bnQgKiAyLCAnc2Nyb2xsaW5nIHNob3VsZCBrZWVwIHJlbmRlcmluZyBvbmx5IHRoZSB2aXNpYmxlIGRpZmYgcm93cycpO1xuXHRcdGFzc2VydEVudHJ5T3JkZXIoY29udGFpbmVyKTtcblxuXHRcdHZpZXcuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVmZXRjaGVzIHRoZSBuZXh0IGZpbGUgbmVhciBhIGJvdW5kYXJ5IHdpdGhvdXQgbW91bnRpbmcgaXRzIHNlY3Rpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZUNvdW50ID0gMztcblx0XHRjb25zdCBsaW5lQ291bnQgPSAyMDA7XG5cdFx0Y29uc3QgZmlsZXMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRcdGNvbnN0IGRpZmZzOiBJRmlsZURpZmZWaWV3RGF0YVtdID0gW107XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGZpbGVDb3VudDsgaSsrKSB7XG5cdFx0XHRjb25zdCBvcmlnaW5hbFVSSSA9IFVSSS5wYXJzZShgaW5tZW1vcnk6Ly9vcmlnaW5hbC9zcmMvcHJlZmV0Y2gke2l9LnRzYCk7XG5cdFx0XHRjb25zdCBtb2RpZmllZFVSSSA9IFVSSS5wYXJzZShgaW5tZW1vcnk6Ly9tb2RpZmllZC9zcmMvcHJlZmV0Y2gke2l9LnRzYCk7XG5cdFx0XHRmaWxlcy5zZXQob3JpZ2luYWxVUkkudG9TdHJpbmcoKSwgQXJyYXkuZnJvbSh7IGxlbmd0aDogbGluZUNvdW50IH0sIChfLCBsaW5lKSA9PiBgZXhwb3J0IGNvbnN0IHZhbHVlJHtsaW5lfSA9ICR7bGluZX07YCkuam9pbignXFxuJykpO1xuXHRcdFx0ZmlsZXMuc2V0KG1vZGlmaWVkVVJJLnRvU3RyaW5nKCksIEFycmF5LmZyb20oeyBsZW5ndGg6IGxpbmVDb3VudCB9LCAoXywgbGluZSkgPT4gYGV4cG9ydCBjb25zdCB2YWx1ZSR7bGluZX0gPSAke2xpbmUgKyAxMDAwfTtgKS5qb2luKCdcXG4nKSk7XG5cdFx0XHRkaWZmcy5wdXNoKHtcblx0XHRcdFx0b3JpZ2luYWxVUkksXG5cdFx0XHRcdG1vZGlmaWVkVVJJLFxuXHRcdFx0XHRpZGVudGljYWw6IGZhbHNlLFxuXHRcdFx0XHRhZGRlZDogbGluZUNvdW50LFxuXHRcdFx0XHRyZW1vdmVkOiBsaW5lQ291bnQsXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRjb25zdCByZWFkVXJpczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCB0ZXh0RmlsZVNlcnZpY2UgPSB7XG5cdFx0XHRyZWFkKHVyaTogVVJJKSB7XG5cdFx0XHRcdHJlYWRVcmlzLnB1c2godXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHsgdmFsdWU6IGZpbGVzLmdldCh1cmkudG9TdHJpbmcoKSkgPz8gJycgfSk7XG5cdFx0XHR9XG5cdFx0fSBhcyB1bmtub3duIGFzIElUZXh0RmlsZVNlcnZpY2U7XG5cblx0XHRjb25zdCBmaWxlU2VydmljZSA9IHt9IGFzIElGaWxlU2VydmljZTtcblx0XHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSB7XG5cdFx0XHRndWVzc0xhbmd1YWdlSWRCeUZpbGVwYXRoT3JGaXJzdExpbmUoKTogc3RyaW5nIHtcblx0XHRcdFx0cmV0dXJuICd0eXBlc2NyaXB0Jztcblx0XHRcdH1cblx0XHR9IGFzIHVua25vd24gYXMgSUxhbmd1YWdlU2VydmljZTtcblxuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoY29udGFpbmVyKTtcblx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGNvbnRhaW5lci5yZW1vdmUoKSkpO1xuXG5cdFx0Y29uc3QgdmlldyA9IHN0b3JlLmFkZChuZXcgTW9iaWxlTXVsdGlEaWZmVmlldyhjb250YWluZXIsIHsgZGlmZnMgfSwgdGV4dEZpbGVTZXJ2aWNlLCBmaWxlU2VydmljZSwgbGFuZ3VhZ2VTZXJ2aWNlKSk7XG5cdFx0YXdhaXQgd2FpdEZvckNvbmRpdGlvbigoKSA9PiBjb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnLm1vYmlsZS1kaWZmLWxpbmUnKS5sZW5ndGggPiAwLCAnZmlyc3QgZmlsZSBzaG91bGQgbG9hZCBiZWZvcmUgcHJlZmV0Y2hpbmcgbmVhciBpdHMgYm91bmRhcnknKTtcblxuXHRcdGFzc2VydC5vayhyZWFkVXJpcy5zb21lKHVyaSA9PiB1cmkuaW5jbHVkZXMoJ3ByZWZldGNoMC50cycpKSwgJ29wZW5pbmcgc2hvdWxkIHJlYWQgdGhlIGZpcnN0IGZpbGUnKTtcblx0XHRhc3NlcnQub2soIXJlYWRVcmlzLnNvbWUodXJpID0+IHVyaS5pbmNsdWRlcygncHJlZmV0Y2gxLnRzJykpLCAnb3BlbmluZyBzaG91bGQgbm90IGltbWVkaWF0ZWx5IHByZWZldGNoIHRoZSBuZXh0IGxhcmdlIGZpbGUnKTtcblxuXHRcdGNvbnN0IHNjcm9sbFdyYXBwZXIgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcignLm1vYmlsZS1vdmVybGF5LXNjcm9sbCcpIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcblx0XHRhc3NlcnQub2soc2Nyb2xsV3JhcHBlciwgJ3Njcm9sbCB3cmFwcGVyIHNob3VsZCBleGlzdCcpO1xuXHRcdHNjcm9sbFdyYXBwZXIuc2Nyb2xsVG9wID0gNTAwMDtcblx0XHRzY3JvbGxXcmFwcGVyLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdzY3JvbGwnKSk7XG5cblx0XHRhd2FpdCB3YWl0Rm9yQ29uZGl0aW9uKCgpID0+IHJlYWRVcmlzLnNvbWUodXJpID0+IHVyaS5pbmNsdWRlcygncHJlZmV0Y2gxLnRzJykpLCAnYXBwcm9hY2hpbmcgYSBmaWxlIGJvdW5kYXJ5IHNob3VsZCBwcmVmZXRjaCB0aGUgbmV4dCBmaWxlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcubW9iaWxlLW11bHRpLWRpZmYtZmlsZS1zZWN0aW9uW2RhdGEtaW5kZXg9XCIxXCJdJyksIG51bGwsICdwcmVmZXRjaGluZyBzaG91bGQgbm90IG1vdW50IHRoZSBuZXh0IGZpbGUgc2VjdGlvbicpO1xuXHRcdGFzc2VydC5vayghcmVhZFVyaXMuc29tZSh1cmkgPT4gdXJpLmluY2x1ZGVzKCdwcmVmZXRjaDIudHMnKSksICdwcmVmZXRjaGluZyBzaG91bGQgc3RheSBib3VuZGVkIHRvIHRoZSBuZWFyIGZpbGUnKTtcblxuXHRcdHZpZXcuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdGFydHMgbG9hZGluZyB0aGUgbmV3bHkgdmlzaWJsZSBmaWxlIHdoaWxlIGFuIG9sZGVyIGxvYWQgaXMgcGVuZGluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmaWxlQ291bnQgPSA0MDtcblx0XHRjb25zdCBmaWxlcyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdFx0Y29uc3QgZGlmZnM6IElGaWxlRGlmZlZpZXdEYXRhW10gPSBbXTtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZmlsZUNvdW50OyBpKyspIHtcblx0XHRcdGNvbnN0IG9yaWdpbmFsVVJJID0gVVJJLnBhcnNlKGBpbm1lbW9yeTovL29yaWdpbmFsL3NyYy9maWxlJHtpfS50c2ApO1xuXHRcdFx0Y29uc3QgbW9kaWZpZWRVUkkgPSBVUkkucGFyc2UoYGlubWVtb3J5Oi8vbW9kaWZpZWQvc3JjL2ZpbGUke2l9LnRzYCk7XG5cdFx0XHRmaWxlcy5zZXQob3JpZ2luYWxVUkkudG9TdHJpbmcoKSwgYGV4cG9ydCBjb25zdCB2YWx1ZSR7aX0gPSAke2l9O1xcbmApO1xuXHRcdFx0ZmlsZXMuc2V0KG1vZGlmaWVkVVJJLnRvU3RyaW5nKCksIGBleHBvcnQgY29uc3QgdmFsdWUke2l9ID0gJHtpICsgMX07XFxuYCk7XG5cdFx0XHRkaWZmcy5wdXNoKHtcblx0XHRcdFx0b3JpZ2luYWxVUkksXG5cdFx0XHRcdG1vZGlmaWVkVVJJLFxuXHRcdFx0XHRpZGVudGljYWw6IGZhbHNlLFxuXHRcdFx0XHRhZGRlZDogMTAwLFxuXHRcdFx0XHRyZW1vdmVkOiAxMDAsXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRjb25zdCByZWFkVXJpczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBwZW5kaW5nUmVhZHMgPSBuZXcgTWFwPHN0cmluZywgRGVmZXJyZWQ8eyB2YWx1ZTogc3RyaW5nIH0+PigpO1xuXHRcdGNvbnN0IHRleHRGaWxlU2VydmljZSA9IHtcblx0XHRcdHJlYWQodXJpOiBVUkkpIHtcblx0XHRcdFx0cmVhZFVyaXMucHVzaCh1cmkudG9TdHJpbmcoKSk7XG5cdFx0XHRcdGNvbnN0IHBlbmRpbmcgPSBkZWZlcnJlZDx7IHZhbHVlOiBzdHJpbmcgfT4oKTtcblx0XHRcdFx0cGVuZGluZ1JlYWRzLnNldCh1cmkudG9TdHJpbmcoKSwgcGVuZGluZyk7XG5cdFx0XHRcdHJldHVybiBwZW5kaW5nLnByb21pc2U7XG5cdFx0XHR9XG5cdFx0fSBhcyB1bmtub3duIGFzIElUZXh0RmlsZVNlcnZpY2U7XG5cblx0XHRjb25zdCBmaWxlU2VydmljZSA9IHt9IGFzIElGaWxlU2VydmljZTtcblx0XHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSB7XG5cdFx0XHRndWVzc0xhbmd1YWdlSWRCeUZpbGVwYXRoT3JGaXJzdExpbmUoKTogc3RyaW5nIHtcblx0XHRcdFx0cmV0dXJuICd0eXBlc2NyaXB0Jztcblx0XHRcdH1cblx0XHR9IGFzIHVua25vd24gYXMgSUxhbmd1YWdlU2VydmljZTtcblxuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoY29udGFpbmVyKTtcblx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGNvbnRhaW5lci5yZW1vdmUoKSkpO1xuXG5cdFx0Y29uc3QgdmlldyA9IHN0b3JlLmFkZChuZXcgTW9iaWxlTXVsdGlEaWZmVmlldyhjb250YWluZXIsIHsgZGlmZnMgfSwgdGV4dEZpbGVTZXJ2aWNlLCBmaWxlU2VydmljZSwgbGFuZ3VhZ2VTZXJ2aWNlKSk7XG5cdFx0YXdhaXQgYW5pbWF0aW9uRnJhbWVzKDIpO1xuXG5cdFx0YXNzZXJ0Lm9rKHJlYWRVcmlzLnNvbWUodXJpID0+IHVyaS5pbmNsdWRlcygnZmlsZTAudHMnKSksICdvcGVuaW5nIHRoZSB2aWV3IHNob3VsZCBzdGFydCBsb2FkaW5nIHRoZSBmaXJzdCBmaWxlJyk7XG5cblx0XHRjb25zdCBzY3JvbGxXcmFwcGVyID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5tb2JpbGUtb3ZlcmxheS1zY3JvbGwnKSBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG5cdFx0YXNzZXJ0Lm9rKHNjcm9sbFdyYXBwZXIsICdzY3JvbGwgd3JhcHBlciBzaG91bGQgZXhpc3QnKTtcblx0XHRzY3JvbGxXcmFwcGVyLnNjcm9sbFRvcCA9IHNjcm9sbFdyYXBwZXIuc2Nyb2xsSGVpZ2h0O1xuXHRcdHNjcm9sbFdyYXBwZXIuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ3Njcm9sbCcpKTtcblx0XHRhd2FpdCBhbmltYXRpb25GcmFtZXMoMyk7XG5cblx0XHRhc3NlcnQub2socmVhZFVyaXMuc29tZSh1cmkgPT4gdXJpLmluY2x1ZGVzKGBmaWxlJHtmaWxlQ291bnQgLSAxfS50c2ApKSwgJ3Njcm9sbGluZyBzaG91bGQgc3RhcnQgbG9hZGluZyB0aGUgbmV3bHkgdmlzaWJsZSBmaWxlIGV2ZW4gd2hpbGUgdGhlIGZpcnN0IGZpbGUgaXMgcGVuZGluZycpO1xuXG5cdFx0dmlldy5kaXNwb3NlKCk7XG5cdFx0cmVzb2x2ZVBlbmRpbmdSZWFkcyhwZW5kaW5nUmVhZHMsIGZpbGVzKTtcblx0fSk7XG5cblx0dGVzdCgna2VlcHMgYW4gdW5sb2FkZWQgbGFyZ2UgZmlsZSBib2R5IGNvdmVyZWQgYnkgYSBzdGlja3kgbG9hZGluZyBwbGFjZWhvbGRlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmaWxlQ291bnQgPSAzO1xuXHRcdGNvbnN0IGZpbGVzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0XHRjb25zdCBkaWZmczogSUZpbGVEaWZmVmlld0RhdGFbXSA9IFtdO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBmaWxlQ291bnQ7IGkrKykge1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWxVUkkgPSBVUkkucGFyc2UoYGlubWVtb3J5Oi8vb3JpZ2luYWwvc3JjL2xhcmdlJHtpfS50c2ApO1xuXHRcdFx0Y29uc3QgbW9kaWZpZWRVUkkgPSBVUkkucGFyc2UoYGlubWVtb3J5Oi8vbW9kaWZpZWQvc3JjL2xhcmdlJHtpfS50c2ApO1xuXHRcdFx0ZmlsZXMuc2V0KG9yaWdpbmFsVVJJLnRvU3RyaW5nKCksIGBleHBvcnQgY29uc3QgdmFsdWUke2l9ID0gJHtpfTtcXG5gKTtcblx0XHRcdGZpbGVzLnNldChtb2RpZmllZFVSSS50b1N0cmluZygpLCBgZXhwb3J0IGNvbnN0IHZhbHVlJHtpfSA9ICR7aSArIDF9O1xcbmApO1xuXHRcdFx0ZGlmZnMucHVzaCh7XG5cdFx0XHRcdG9yaWdpbmFsVVJJLFxuXHRcdFx0XHRtb2RpZmllZFVSSSxcblx0XHRcdFx0aWRlbnRpY2FsOiBmYWxzZSxcblx0XHRcdFx0YWRkZWQ6IDEwMDAsXG5cdFx0XHRcdHJlbW92ZWQ6IDEwMDAsXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRjb25zdCBwZW5kaW5nUmVhZHMgPSBuZXcgTWFwPHN0cmluZywgRGVmZXJyZWQ8eyB2YWx1ZTogc3RyaW5nIH0+PigpO1xuXHRcdGNvbnN0IHRleHRGaWxlU2VydmljZSA9IHtcblx0XHRcdHJlYWQodXJpOiBVUkkpIHtcblx0XHRcdFx0Y29uc3QgcGVuZGluZyA9IGRlZmVycmVkPHsgdmFsdWU6IHN0cmluZyB9PigpO1xuXHRcdFx0XHRwZW5kaW5nUmVhZHMuc2V0KHVyaS50b1N0cmluZygpLCBwZW5kaW5nKTtcblx0XHRcdFx0cmV0dXJuIHBlbmRpbmcucHJvbWlzZTtcblx0XHRcdH1cblx0XHR9IGFzIHVua25vd24gYXMgSVRleHRGaWxlU2VydmljZTtcblxuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0ge30gYXMgSUZpbGVTZXJ2aWNlO1xuXHRcdGNvbnN0IGxhbmd1YWdlU2VydmljZSA9IHtcblx0XHRcdGd1ZXNzTGFuZ3VhZ2VJZEJ5RmlsZXBhdGhPckZpcnN0TGluZSgpOiBzdHJpbmcge1xuXHRcdFx0XHRyZXR1cm4gJ3R5cGVzY3JpcHQnO1xuXHRcdFx0fVxuXHRcdH0gYXMgdW5rbm93biBhcyBJTGFuZ3VhZ2VTZXJ2aWNlO1xuXG5cdFx0Y29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChjb250YWluZXIpO1xuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gY29udGFpbmVyLnJlbW92ZSgpKSk7XG5cblx0XHRjb25zdCB2aWV3ID0gc3RvcmUuYWRkKG5ldyBNb2JpbGVNdWx0aURpZmZWaWV3KGNvbnRhaW5lciwgeyBkaWZmcyB9LCB0ZXh0RmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlLCBsYW5ndWFnZVNlcnZpY2UpKTtcblx0XHRhd2FpdCBhbmltYXRpb25GcmFtZXMoMik7XG5cblx0XHRjb25zdCBzY3JvbGxXcmFwcGVyID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5tb2JpbGUtb3ZlcmxheS1zY3JvbGwnKSBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG5cdFx0YXNzZXJ0Lm9rKHNjcm9sbFdyYXBwZXIsICdzY3JvbGwgd3JhcHBlciBzaG91bGQgZXhpc3QnKTtcblx0XHRzY3JvbGxXcmFwcGVyLnNjcm9sbFRvcCA9IHNjcm9sbFdyYXBwZXIuc2Nyb2xsSGVpZ2h0O1xuXHRcdHNjcm9sbFdyYXBwZXIuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ3Njcm9sbCcpKTtcblx0XHRhd2FpdCBhbmltYXRpb25GcmFtZXMoMik7XG5cblx0XHRjb25zdCBwbGFjZWhvbGRlckNvbnRlbnQgPSBBcnJheS5mcm9tKGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCcubW9iaWxlLW11bHRpLWRpZmYtZmlsZS1jb250ZW50LXBsYWNlaG9sZGVyJykpIGFzIEhUTUxFbGVtZW50W107XG5cdFx0Y29uc3QgYm90dG9tRmlsZUNvbnRlbnQgPSBwbGFjZWhvbGRlckNvbnRlbnQuZmluZChjb250ZW50ID0+IE51bWJlcigoY29udGVudC5wYXJlbnRFbGVtZW50IGFzIEhUTUxFbGVtZW50KS5kYXRhc2V0LmluZGV4KSA9PT0gZmlsZUNvdW50IC0gMSk7XG5cdFx0YXNzZXJ0Lm9rKGJvdHRvbUZpbGVDb250ZW50LCAndGhlIHVubG9hZGVkIGZpbGUgYXQgdGhlIG5ldyBzY3JvbGwgcG9zaXRpb24gc2hvdWxkIHJlbmRlciBwbGFjZWhvbGRlciBjb250ZW50Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJvdHRvbUZpbGVDb250ZW50LnN0eWxlLnRyYW5zZm9ybSwgJycsICdsb2FkaW5nIHBsYWNlaG9sZGVycyBzaG91bGQgbm90IHJlbHkgb24gSlMgc2Nyb2xsIHRyYW5zZm9ybXMnKTtcblx0XHRhc3NlcnQub2soYm90dG9tRmlsZUNvbnRlbnQuc3R5bGUuaGVpZ2h0LCAndGhlIHBsYWNlaG9sZGVyIHNob3VsZCByZXNlcnZlIHRoZSBmaWxlIGJvZHkgaGVpZ2h0Jyk7XG5cblx0XHRjb25zdCBlbXB0eVN0YXRlID0gYm90dG9tRmlsZUNvbnRlbnQucXVlcnlTZWxlY3RvcignLm1vYmlsZS1kaWZmLWVtcHR5LXN0YXRlJykgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuXHRcdGFzc2VydC5vayhlbXB0eVN0YXRlLCAndGhlIHBsYWNlaG9sZGVyIHNob3VsZCBjb250YWluIGEgbG9hZGluZyBtZXNzYWdlJyk7XG5cdFx0YXNzZXJ0Lm9rKGVtcHR5U3RhdGUudGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdMb2FkaW5nJyksICd0aGUgcGxhY2Vob2xkZXIgc2hvdWxkIG5vdCBiZSBibGFuaycpO1xuXHRcdGFzc2VydC5vayhlbXB0eVN0YXRlLnN0eWxlLmhlaWdodCwgJ3RoZSBwbGFjZWhvbGRlciBtZXNzYWdlIHNob3VsZCByZXNlcnZlIHZpc2libGUgdmlld3BvcnQgaGVpZ2h0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1haW5XaW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShlbXB0eVN0YXRlKS5wb3NpdGlvbiwgJ3N0aWNreScsICd0aGUgbG9hZGluZyBtZXNzYWdlIHNob3VsZCByZW1haW4gdmlzaWJsZSBkdXJpbmcgbmF0aXZlIHNjcm9sbCcpO1xuXG5cdFx0dmlldy5kaXNwb3NlKCk7XG5cdFx0cmVzb2x2ZVBlbmRpbmdSZWFkcyhwZW5kaW5nUmVhZHMsIGZpbGVzKTtcblx0fSk7XG59KTtcblxuZnVuY3Rpb24gYW5pbWF0aW9uRnJhbWUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdHJldHVybiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IG1haW5XaW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHJlc29sdmUoKSkpO1xufVxuXG5hc3luYyBmdW5jdGlvbiBhbmltYXRpb25GcmFtZXMoY291bnQ6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IGNvdW50OyBpKyspIHtcblx0XHRhd2FpdCBhbmltYXRpb25GcmFtZSgpO1xuXHR9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JDb25kaXRpb24oY29uZGl0aW9uOiAoKSA9PiBib29sZWFuLCBtZXNzYWdlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCA2MDsgaSsrKSB7XG5cdFx0aWYgKGNvbmRpdGlvbigpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGF3YWl0IGFuaW1hdGlvbkZyYW1lKCk7XG5cdH1cblx0YXNzZXJ0LmZhaWwobWVzc2FnZSk7XG59XG5cbmZ1bmN0aW9uIGFzc2VydEVudHJ5T3JkZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRjb25zdCBpbmRleGVzID0gQXJyYXkuZnJvbShjb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnLm1vYmlsZS1tdWx0aS1kaWZmLWJvZHktZW50cnknKSwgZWxlbWVudCA9PiBOdW1iZXIoKGVsZW1lbnQgYXMgSFRNTEVsZW1lbnQpLmRhdGFzZXQuZW50cnlJbmRleCkpO1xuXHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGluZGV4ZXMsIGluZGV4ZXMuc2xpY2UoKS5zb3J0KChhLCBiKSA9PiBhIC0gYiksICdyZW5kZXJlZCBib2R5IGVudHJpZXMgc2hvdWxkIHN0YXkgaW4gZG9jdW1lbnQgb3JkZXInKTtcbn1cblxuaW50ZXJmYWNlIERlZmVycmVkPFQ+IHtcblx0cmVhZG9ubHkgcHJvbWlzZTogUHJvbWlzZTxUPjtcblx0cmVzb2x2ZSh2YWx1ZTogVCk6IHZvaWQ7XG59XG5cbmZ1bmN0aW9uIGRlZmVycmVkPFQ+KCk6IERlZmVycmVkPFQ+IHtcblx0bGV0IHJlc29sdmUhOiAodmFsdWU6IFQpID0+IHZvaWQ7XG5cdGNvbnN0IHByb21pc2UgPSBuZXcgUHJvbWlzZTxUPihyID0+IHtcblx0XHRyZXNvbHZlID0gcjtcblx0fSk7XG5cdHJldHVybiB7IHByb21pc2UsIHJlc29sdmUgfTtcbn1cblxuZnVuY3Rpb24gcmVzb2x2ZVBlbmRpbmdSZWFkcyhwZW5kaW5nUmVhZHM6IE1hcDxzdHJpbmcsIERlZmVycmVkPHsgdmFsdWU6IHN0cmluZyB9Pj4sIGZpbGVzOiBNYXA8c3RyaW5nLCBzdHJpbmc+KTogdm9pZCB7XG5cdGZvciAoY29uc3QgW3VyaSwgcGVuZGluZ10gb2YgcGVuZGluZ1JlYWRzKSB7XG5cdFx0cGVuZGluZy5yZXNvbHZlKHsgdmFsdWU6IGZpbGVzLmdldCh1cmkpID8/ICcnIH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxhQUFhLHNCQUFzQjtBQUM1QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFJeEQsU0FBUywyQkFBMkI7QUFHcEMsTUFBTSx1QkFBdUIsTUFBTTtBQUNsQyxRQUFNLFFBQVEsd0NBQXdDO0FBRXRELE9BQUssOEVBQThFLFlBQVk7QUFDOUYsVUFBTSxZQUFZO0FBQ2xCLFVBQU0sUUFBUSxvQkFBSSxJQUFvQjtBQUN0QyxVQUFNLFFBQTZCLENBQUM7QUFFcEMsYUFBUyxJQUFJLEdBQUcsSUFBSSxXQUFXLEtBQUs7QUFDbkMsWUFBTSxjQUFjLElBQUksTUFBTSwrQkFBK0IsQ0FBQyxLQUFLO0FBQ25FLFlBQU0sY0FBYyxJQUFJLE1BQU0sK0JBQStCLENBQUMsS0FBSztBQUNuRSxZQUFNLElBQUksWUFBWSxTQUFTLEdBQUcscUJBQXFC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
