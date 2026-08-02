import assert from "assert";
import { mainWindow } from "../../../../../../../base/browser/window.js";
import { DisposableStore } from "../../../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IConfigurationService } from "../../../../../../../platform/configuration/common/configuration.js";
import { workbenchInstantiationService } from "../../../../../../test/browser/workbenchTestServices.js";
import { BlockAnimation, ANIMATION_DURATION_MS } from "../../../../browser/widget/chatContentParts/chatIncrementalRendering/animations/blockAnimations.js";
import { lastBlockBoundary } from "../../../../browser/widget/chatContentParts/chatIncrementalRendering/buffers/paragraphBuffer.js";
import { WordBuffer } from "../../../../browser/widget/chatContentParts/chatIncrementalRendering/buffers/wordBuffer.js";
import { IncrementalDOMMorpher } from "../../../../browser/widget/chatContentParts/chatIncrementalRendering/chatIncrementalRendering.js";
import { ChatConfiguration } from "../../../../common/constants.js";
suite("lastBlockBoundary", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("returns -1 for empty string", () => {
    assert.strictEqual(lastBlockBoundary(""), -1);
  });
  test("returns -1 for text without any block boundary", () => {
    assert.strictEqual(lastBlockBoundary("hello world"), -1);
  });
  test("returns -1 for single newline", () => {
    assert.strictEqual(lastBlockBoundary("hello\nworld"), -1);
  });
  test("finds a single block boundary", () => {
    const text = "hello\n\nworld";
    assert.strictEqual(lastBlockBoundary(text), 5);
  });
  test("finds the last block boundary among multiple", () => {
    const text = "a\n\nb\n\nc";
    assert.strictEqual(lastBlockBoundary(text), 4);
  });
  test("ignores block boundaries inside a fenced code block", () => {
    const text = "```\ncode\n\nmore code\n```";
    assert.strictEqual(lastBlockBoundary(text), -1);
  });
  test("finds boundary after closing a code fence", () => {
    const text = "```\ncode\n```\n\nafter fence";
    assert.strictEqual(lastBlockBoundary(text), 12);
  });
  test("ignores boundary inside fence but finds one outside", () => {
    const text = "before\n\n```\ninside\n\nfence\n```\n\nafter";
    const result = lastBlockBoundary(text);
    assert.ok(result > 6, `Expected boundary after fence close, got ${result}`);
  });
  test("handles code fence at the very start of the string", () => {
    const text = "```\ncode\n```\n\ntext";
    assert.strictEqual(lastBlockBoundary(text), 12);
  });
  test("handles unclosed code fence (all subsequent boundaries ignored)", () => {
    const text = "```\ncode\n\nmore\n\nstill inside";
    assert.strictEqual(lastBlockBoundary(text), -1);
  });
  test("handles multiple code fences", () => {
    const text = "```\nfirst\n```\n\nbetween\n\n```\nsecond\n```\n\nend";
    const result = lastBlockBoundary(text);
    assert.ok(result > 20, `Expected last boundary near end, got ${result}`);
  });
  test("handles triple backticks mid-line (not a fence)", () => {
    const text = "text ``` not a fence\n\nafter";
    assert.strictEqual(lastBlockBoundary(text), 20);
  });
  test("ignores block boundaries inside a tilde-fenced code block", () => {
    const text = "~~~\ncode\n\nmore code\n~~~";
    assert.strictEqual(lastBlockBoundary(text), -1);
  });
  test("finds boundary after closing a tilde fence", () => {
    const text = "~~~\ncode\n~~~\n\nafter fence";
    assert.strictEqual(lastBlockBoundary(text), 12);
  });
  test("handles unclosed tilde fence", () => {
    const text = "~~~\ncode\n\nmore\n\nstill inside";
    assert.strictEqual(lastBlockBoundary(text), -1);
  });
  test("handles mixed backtick and tilde fences", () => {
    const text = "~~~\ntilde code\n\ninside tilde\n~~~\n\n```\nbacktick code\n\ninside backtick\n```\n\nafter both";
    const result = lastBlockBoundary(text);
    assert.ok(result > 40, `Expected boundary after both fences, got ${result}`);
  });
});
suite("IncrementalDOMMorpher", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let disposables;
  let instantiationService;
  let configService;
  setup(() => {
    disposables = store.add(new DisposableStore());
    instantiationService = workbenchInstantiationService(void 0, disposables);
    configService = new TestConfigurationService();
    configService.setUserConfiguration(ChatConfiguration.IncrementalRenderingStyle, "fade");
    instantiationService.stub(IConfigurationService, configService);
  });
  teardown(() => {
    disposables.dispose();
  });
  function createMorpher(domNode) {
    const node = domNode ?? mainWindow.document.createElement("div");
    return store.add(instantiationService.createInstance(IncrementalDOMMorpher, node));
  }
  suite("tryMorph", () => {
    test("returns false for non-append edit", () => {
      const morpher = createMorpher();
      morpher.seed("hello");
      assert.strictEqual(morpher.tryMorph("goodbye"), false);
    });
    test("returns true when content is identical (no-op)", () => {
      const morpher = createMorpher();
      morpher.seed("hello");
      assert.strictEqual(morpher.tryMorph("hello"), true);
    });
    test("returns true for appended content", () => {
      const morpher = createMorpher();
      morpher.seed("hello");
      assert.strictEqual(morpher.tryMorph("hello world"), true);
    });
    test("returns false when prefix changes", () => {
      const morpher = createMorpher();
      morpher.seed("hello world");
      assert.strictEqual(morpher.tryMorph("Hello world!"), false);
    });
    test("successive appends all succeed", () => {
      const morpher = createMorpher();
      morpher.seed("a");
      assert.strictEqual(morpher.tryMorph("ab"), true);
      assert.strictEqual(morpher.tryMorph("abc"), true);
      assert.strictEqual(morpher.tryMorph("abcd"), true);
    });
    test("fails after a non-append edit even if previous appends succeeded", () => {
      const morpher = createMorpher();
      morpher.seed("hello");
      assert.strictEqual(morpher.tryMorph("hello world"), true);
      assert.strictEqual(morpher.tryMorph("hi world"), false);
    });
    test("invokes render callback on rAF with block-boundary content", () => {
      const rendered = [];
      const morpher = createMorpher();
      morpher.setRenderCallback((md) => rendered.push(md));
      morpher.seed("");
      morpher.tryMorph("paragraph one\n\nparagraph two");
      assert.strictEqual(rendered.length, 0, "Should not render synchronously");
    });
    test("returns true for content without block boundary (buffered)", () => {
      const morpher = createMorpher();
      morpher.seed("");
      assert.strictEqual(morpher.tryMorph("partial paragraph"), true);
    });
    test("schedules render for content without any paragraph breaks", async () => {
      configService.setUserConfiguration(ChatConfiguration.IncrementalRenderingBuffering, "paragraph");
      const morpher = createMorpher();
      const rendered = [];
      morpher.setRenderCallback((md) => rendered.push(md));
      morpher.seed("");
      morpher.tryMorph("single block no paragraph breaks");
      await new Promise((r) => mainWindow.requestAnimationFrame(r));
      assert.strictEqual(rendered.length, 1);
      assert.strictEqual(rendered[0], "single block no paragraph breaks");
      morpher.tryMorph("single block no paragraph breaks \u2014 more words");
      await new Promise((r) => mainWindow.requestAnimationFrame(r));
      assert.strictEqual(rendered.length, 2);
      assert.strictEqual(rendered[1], "single block no paragraph breaks \u2014 more words");
    });
  });
  suite("seed", () => {
    test("sets baseline markdown", () => {
      const morpher = createMorpher();
      morpher.seed("initial content");
      assert.strictEqual(morpher.tryMorph("initial content"), true);
      assert.strictEqual(morpher.tryMorph("initial content more"), true);
    });
    test("with animateInitial=false uses existing child count as watermark", () => {
      const domNode = mainWindow.document.createElement("div");
      domNode.appendChild(mainWindow.document.createElement("p"));
      domNode.appendChild(mainWindow.document.createElement("p"));
      const morpher = createMorpher(domNode);
      morpher.seed("some content", false);
      for (const child of Array.from(domNode.children)) {
        assert.strictEqual(
          child.classList.contains("chat-smooth-animate-fade"),
          false,
          "Existing children should not be animated when animateInitial is false"
        );
      }
    });
    test("with animateInitial=true animates existing children", () => {
      const domNode = mainWindow.document.createElement("div");
      domNode.appendChild(mainWindow.document.createElement("p"));
      domNode.appendChild(mainWindow.document.createElement("p"));
      const morpher = createMorpher(domNode);
      morpher.seed("some content", true);
      for (const child of Array.from(domNode.children)) {
        assert.strictEqual(
          child.classList.contains("chat-smooth-animate-fade"),
          true,
          "Existing children should be animated when animateInitial is true"
        );
      }
    });
  });
  suite("animation style", () => {
    test("defaults to fade for invalid config value", () => {
      configService.setUserConfiguration(ChatConfiguration.IncrementalRenderingStyle, "invalid-style");
      const domNode = mainWindow.document.createElement("div");
      domNode.appendChild(mainWindow.document.createElement("p"));
      const morpher = createMorpher(domNode);
      morpher.seed("content", true);
      const child = domNode.children[0];
      assert.strictEqual(child.classList.contains("chat-smooth-animate-fade"), true, "Should fall back to fade");
    });
    test("uses configured animation style", () => {
      configService.setUserConfiguration(ChatConfiguration.IncrementalRenderingStyle, "rise");
      const domNode = mainWindow.document.createElement("div");
      domNode.appendChild(mainWindow.document.createElement("p"));
      const morpher = createMorpher(domNode);
      morpher.seed("content", true);
      const child = domNode.children[0];
      assert.strictEqual(child.classList.contains("chat-smooth-animate-rise"), true, "Should use rise style");
    });
    for (const style of ["fade", "rise", "blur", "scale", "slide"]) {
      test(`applies ${style} animation class`, () => {
        configService.setUserConfiguration(ChatConfiguration.IncrementalRenderingStyle, style);
        const domNode = mainWindow.document.createElement("div");
        domNode.appendChild(mainWindow.document.createElement("p"));
        const morpher = createMorpher(domNode);
        morpher.seed("content", true);
        const child = domNode.children[0];
        assert.strictEqual(
          child.classList.contains(`chat-smooth-animate-${style}`),
          true,
          `Should have chat-smooth-animate-${style} class`
        );
      });
    }
  });
  suite("dispose", () => {
    test("clears pending state on dispose", () => {
      const morpher = createMorpher();
      morpher.seed("");
      morpher.setRenderCallback(() => {
      });
      morpher.tryMorph("hello\n\nworld");
      morpher.dispose();
    });
  });
  suite("updateStreamRate", () => {
    test("flushes remaining buffered content on completion for paragraph buffer", async () => {
      configService.setUserConfiguration(ChatConfiguration.IncrementalRenderingBuffering, "paragraph");
      const morpher = createMorpher();
      const rendered = [];
      morpher.setRenderCallback((md) => rendered.push(md));
      morpher.seed("");
      const fullContent = "paragraph one\n\nparagraph two trailing";
      morpher.tryMorph(fullContent);
      await new Promise((r) => mainWindow.requestAnimationFrame(r));
      assert.strictEqual(rendered.length, 1);
      assert.strictEqual(rendered[0], "paragraph one\n\n");
      morpher.updateStreamRate(100, true);
      await new Promise((r) => mainWindow.requestAnimationFrame(r));
      assert.strictEqual(rendered.length, 2);
      assert.strictEqual(rendered[1], fullContent);
    });
  });
});
suite("BlockAnimation", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("applies animation class and custom properties to new children", () => {
    const anim = new BlockAnimation("fade");
    const container = mainWindow.document.createElement("div");
    const child = container.appendChild(mainWindow.document.createElement("p"));
    anim.animate(container.children, 0, 1, 0);
    assert.strictEqual(child.classList.contains("chat-smooth-animate-fade"), true);
    assert.strictEqual(child.style.getPropertyValue("--chat-smooth-duration"), `${ANIMATION_DURATION_MS}ms`);
    assert.ok(child.style.getPropertyValue("--chat-smooth-delay") !== "");
  });
  test("does not strip animation class on bubbled animationend from nested element", () => {
    const anim = new BlockAnimation("rise");
    const container = mainWindow.document.createElement("div");
    const parent = container.appendChild(mainWindow.document.createElement("div"));
    const nested = parent.appendChild(mainWindow.document.createElement("span"));
    anim.animate(container.children, 0, 1, 0);
    assert.strictEqual(parent.classList.contains("chat-smooth-animate-rise"), true);
    const bubbledEvent = new AnimationEvent("animationend", { bubbles: true });
    nested.dispatchEvent(bubbledEvent);
    assert.strictEqual(
      parent.classList.contains("chat-smooth-animate-rise"),
      true,
      "Animation class should not be removed by bubbled event"
    );
    assert.strictEqual(
      parent.style.getPropertyValue("--chat-smooth-duration"),
      `${ANIMATION_DURATION_MS}ms`,
      "Custom properties should not be removed by bubbled event"
    );
  });
  test("strips animation class on direct animationend from the animated element", () => {
    const anim = new BlockAnimation("blur");
    const container = mainWindow.document.createElement("div");
    const child = container.appendChild(mainWindow.document.createElement("p"));
    anim.animate(container.children, 0, 1, 0);
    assert.strictEqual(child.classList.contains("chat-smooth-animate-blur"), true);
    const directEvent = new AnimationEvent("animationend", { bubbles: true });
    child.dispatchEvent(directEvent);
    assert.strictEqual(
      child.classList.contains("chat-smooth-animate-blur"),
      false,
      "Animation class should be removed after direct animationend"
    );
    assert.strictEqual(
      child.style.getPropertyValue("--chat-smooth-duration"),
      "",
      "Custom property should be removed after direct animationend"
    );
  });
  test("staggers delay across multiple new children", () => {
    const anim = new BlockAnimation("fade");
    const container = mainWindow.document.createElement("div");
    container.appendChild(mainWindow.document.createElement("p"));
    container.appendChild(mainWindow.document.createElement("p"));
    container.appendChild(mainWindow.document.createElement("p"));
    anim.animate(container.children, 0, 3, 0);
    const delays = Array.from(container.children).map(
      (c) => parseInt(c.style.getPropertyValue("--chat-smooth-delay"))
    );
    assert.ok(delays[1] > delays[0], `Second delay ${delays[1]} should be greater than first ${delays[0]}`);
    assert.ok(delays[2] > delays[1], `Third delay ${delays[2]} should be greater than second ${delays[1]}`);
  });
});
suite("WordBuffer", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("setRate with isComplete uses at least MIN_RATE_AFTER_COMPLETE", () => {
    const buffer = new WordBuffer();
    buffer.setRate(10, true);
    const md = "word1 word2 word3 word4 word5 word6 word7 word8 word9 word10";
    const result1 = buffer.filterFlush(md);
    assert.ok(result1 !== void 0, "First flush should reveal content");
  });
  test("setRate with undefined rate and isComplete defaults to MIN_RATE_AFTER_COMPLETE", () => {
    const buffer = new WordBuffer();
    buffer.setRate(void 0, true);
    const md = "word1 word2 word3";
    const result = buffer.filterFlush(md);
    assert.ok(result !== void 0, "Should reveal content with default complete rate");
  });
  test("setRate during streaming clamps between MIN_RATE and MAX_RATE", () => {
    const buffer = new WordBuffer();
    buffer.setRate(1, false);
    const md = "word1 word2 word3";
    const result = buffer.filterFlush(md);
    assert.ok(result !== void 0, "Should reveal content even with low rate (clamped to MIN_RATE)");
  });
  test("setRate with undefined rate during streaming defaults to DEFAULT_RATE", () => {
    const buffer = new WordBuffer();
    buffer.setRate(void 0, false);
    const md = "word1 word2";
    const result = buffer.filterFlush(md);
    assert.ok(result !== void 0, "Should reveal content with default streaming rate");
  });
  test("needsNextFrame is true when words remain unrevealed", () => {
    const buffer = new WordBuffer();
    buffer.setRate(1, false);
    buffer.filterFlush("word1 word2 word3 word4 word5");
    assert.strictEqual(buffer.needsNextFrame, true, "Should need another frame when words remain");
  });
  test("needsNextFrame is false when all words are revealed", () => {
    const buffer = new WordBuffer();
    buffer.setRate(2e3, false);
    buffer.filterFlush("hello");
    assert.strictEqual(buffer.needsNextFrame, false, "Should not need another frame when all words shown");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRJbmNyZW1lbnRhbFJlbmRlcmluZy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgQmxvY2tBbmltYXRpb24sIEFOSU1BVElPTl9EVVJBVElPTl9NUyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdEluY3JlbWVudGFsUmVuZGVyaW5nL2FuaW1hdGlvbnMvYmxvY2tBbmltYXRpb25zLmpzJztcbmltcG9ydCB7IGxhc3RCbG9ja0JvdW5kYXJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0SW5jcmVtZW50YWxSZW5kZXJpbmcvYnVmZmVycy9wYXJhZ3JhcGhCdWZmZXIuanMnO1xuaW1wb3J0IHsgV29yZEJ1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdEluY3JlbWVudGFsUmVuZGVyaW5nL2J1ZmZlcnMvd29yZEJ1ZmZlci5qcyc7XG5pbXBvcnQgeyBJbmNyZW1lbnRhbERPTU1vcnBoZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRJbmNyZW1lbnRhbFJlbmRlcmluZy9jaGF0SW5jcmVtZW50YWxSZW5kZXJpbmcuanMnO1xuaW1wb3J0IHsgQ2hhdENvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcblxuc3VpdGUoJ2xhc3RCbG9ja0JvdW5kYXJ5JywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3JldHVybnMgLTEgZm9yIGVtcHR5IHN0cmluZycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFzdEJsb2NrQm91bmRhcnkoJycpLCAtMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgLTEgZm9yIHRleHQgd2l0aG91dCBhbnkgYmxvY2sgYm91bmRhcnknLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhc3RCbG9ja0JvdW5kYXJ5KCdoZWxsbyB3b3JsZCcpLCAtMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgLTEgZm9yIHNpbmdsZSBuZXdsaW5lJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXN0QmxvY2tCb3VuZGFyeSgnaGVsbG9cXG53b3JsZCcpLCAtMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbmRzIGEgc2luZ2xlIGJsb2NrIGJvdW5kYXJ5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHRleHQgPSAnaGVsbG9cXG5cXG53b3JsZCc7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhc3RCbG9ja0JvdW5kYXJ5KHRleHQpLCA1KTtcblx0fSk7XG5cblx0dGVzdCgnZmluZHMgdGhlIGxhc3QgYmxvY2sgYm91bmRhcnkgYW1vbmcgbXVsdGlwbGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGV4dCA9ICdhXFxuXFxuYlxcblxcbmMnO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXN0QmxvY2tCb3VuZGFyeSh0ZXh0KSwgNCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lnbm9yZXMgYmxvY2sgYm91bmRhcmllcyBpbnNpZGUgYSBmZW5jZWQgY29kZSBibG9jaycsICgpID0+IHtcblx0XHRjb25zdCB0ZXh0ID0gJ2BgYFxcbmNvZGVcXG5cXG5tb3JlIGNvZGVcXG5gYGAnO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXN0QmxvY2tCb3VuZGFyeSh0ZXh0KSwgLTEpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaW5kcyBib3VuZGFyeSBhZnRlciBjbG9zaW5nIGEgY29kZSBmZW5jZScsICgpID0+IHtcblx0XHRjb25zdCB0ZXh0ID0gJ2BgYFxcbmNvZGVcXG5gYGBcXG5cXG5hZnRlciBmZW5jZSc7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhc3RCbG9ja0JvdW5kYXJ5KHRleHQpLCAxMik7XG5cdH0pO1xuXG5cdHRlc3QoJ2lnbm9yZXMgYm91bmRhcnkgaW5zaWRlIGZlbmNlIGJ1dCBmaW5kcyBvbmUgb3V0c2lkZScsICgpID0+IHtcblx0XHRjb25zdCB0ZXh0ID0gJ2JlZm9yZVxcblxcbmBgYFxcbmluc2lkZVxcblxcbmZlbmNlXFxuYGBgXFxuXFxuYWZ0ZXInO1xuXHRcdC8vIEZpcnN0IFxcblxcbiBhdCBpbmRleCA2IChiZWZvcmUgZmVuY2UpLCBpbnNpZGUgZmVuY2UgYXQgfjE4LCBhZnRlciBmZW5jZSBhdCB+Mjhcblx0XHRjb25zdCByZXN1bHQgPSBsYXN0QmxvY2tCb3VuZGFyeSh0ZXh0KTtcblx0XHQvLyBUaGUgbGFzdCB2YWxpZCBib3VuZGFyeSBzaG91bGQgYmUgdGhlIG9uZSBhZnRlciB0aGUgY2xvc2luZyBgYGBcblx0XHRhc3NlcnQub2socmVzdWx0ID4gNiwgYEV4cGVjdGVkIGJvdW5kYXJ5IGFmdGVyIGZlbmNlIGNsb3NlLCBnb3QgJHtyZXN1bHR9YCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZXMgY29kZSBmZW5jZSBhdCB0aGUgdmVyeSBzdGFydCBvZiB0aGUgc3RyaW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRleHQgPSAnYGBgXFxuY29kZVxcbmBgYFxcblxcbnRleHQnO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXN0QmxvY2tCb3VuZGFyeSh0ZXh0KSwgMTIpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVzIHVuY2xvc2VkIGNvZGUgZmVuY2UgKGFsbCBzdWJzZXF1ZW50IGJvdW5kYXJpZXMgaWdub3JlZCknLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGV4dCA9ICdgYGBcXG5jb2RlXFxuXFxubW9yZVxcblxcbnN0aWxsIGluc2lkZSc7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhc3RCbG9ja0JvdW5kYXJ5KHRleHQpLCAtMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZXMgbXVsdGlwbGUgY29kZSBmZW5jZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGV4dCA9ICdgYGBcXG5maXJzdFxcbmBgYFxcblxcbmJldHdlZW5cXG5cXG5gYGBcXG5zZWNvbmRcXG5gYGBcXG5cXG5lbmQnO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGxhc3RCbG9ja0JvdW5kYXJ5KHRleHQpO1xuXHRcdC8vIExhc3QgdmFsaWQgXFxuXFxuIGlzIGFmdGVyIHRoZSBzZWNvbmQgY2xvc2luZyBmZW5jZVxuXHRcdGFzc2VydC5vayhyZXN1bHQgPiAyMCwgYEV4cGVjdGVkIGxhc3QgYm91bmRhcnkgbmVhciBlbmQsIGdvdCAke3Jlc3VsdH1gKTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlcyB0cmlwbGUgYmFja3RpY2tzIG1pZC1saW5lIChub3QgYSBmZW5jZSknLCAoKSA9PiB7XG5cdFx0Ly8gVHJpcGxlIGJhY2t0aWNrcyBtdXN0IGJlIGF0IHRoZSBzdGFydCBvZiBhIGxpbmUgdG8gY291bnQgYXMgYSBmZW5jZVxuXHRcdGNvbnN0IHRleHQgPSAndGV4dCBgYGAgbm90IGEgZmVuY2VcXG5cXG5hZnRlcic7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhc3RCbG9ja0JvdW5kYXJ5KHRleHQpLCAyMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lnbm9yZXMgYmxvY2sgYm91bmRhcmllcyBpbnNpZGUgYSB0aWxkZS1mZW5jZWQgY29kZSBibG9jaycsICgpID0+IHtcblx0XHRjb25zdCB0ZXh0ID0gJ35+flxcbmNvZGVcXG5cXG5tb3JlIGNvZGVcXG5+fn4nO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXN0QmxvY2tCb3VuZGFyeSh0ZXh0KSwgLTEpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaW5kcyBib3VuZGFyeSBhZnRlciBjbG9zaW5nIGEgdGlsZGUgZmVuY2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGV4dCA9ICd+fn5cXG5jb2RlXFxufn5+XFxuXFxuYWZ0ZXIgZmVuY2UnO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXN0QmxvY2tCb3VuZGFyeSh0ZXh0KSwgMTIpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVzIHVuY2xvc2VkIHRpbGRlIGZlbmNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRleHQgPSAnfn5+XFxuY29kZVxcblxcbm1vcmVcXG5cXG5zdGlsbCBpbnNpZGUnO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXN0QmxvY2tCb3VuZGFyeSh0ZXh0KSwgLTEpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVzIG1peGVkIGJhY2t0aWNrIGFuZCB0aWxkZSBmZW5jZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGV4dCA9ICd+fn5cXG50aWxkZSBjb2RlXFxuXFxuaW5zaWRlIHRpbGRlXFxufn5+XFxuXFxuYGBgXFxuYmFja3RpY2sgY29kZVxcblxcbmluc2lkZSBiYWNrdGlja1xcbmBgYFxcblxcbmFmdGVyIGJvdGgnO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGxhc3RCbG9ja0JvdW5kYXJ5KHRleHQpO1xuXHRcdC8vIFRoZSBsYXN0IHZhbGlkIGJvdW5kYXJ5IHNob3VsZCBiZSBhZnRlciB0aGUgY2xvc2luZyBgYGBcblx0XHRhc3NlcnQub2socmVzdWx0ID4gNDAsIGBFeHBlY3RlZCBib3VuZGFyeSBhZnRlciBib3RoIGZlbmNlcywgZ290ICR7cmVzdWx0fWApO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnSW5jcmVtZW50YWxET01Nb3JwaGVyJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFJldHVyblR5cGU8dHlwZW9mIHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlPjtcblx0bGV0IGNvbmZpZ1NlcnZpY2U6IFRlc3RDb25maWd1cmF0aW9uU2VydmljZTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMgPSBzdG9yZS5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgZGlzcG9zYWJsZXMpO1xuXG5cdFx0Y29uZmlnU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRjb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkluY3JlbWVudGFsUmVuZGVyaW5nU3R5bGUsICdmYWRlJyk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ1NlcnZpY2UpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBjcmVhdGVNb3JwaGVyKGRvbU5vZGU/OiBIVE1MRWxlbWVudCk6IEluY3JlbWVudGFsRE9NTW9ycGhlciB7XG5cdFx0Y29uc3Qgbm9kZSA9IGRvbU5vZGUgPz8gbWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRyZXR1cm4gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEluY3JlbWVudGFsRE9NTW9ycGhlciwgbm9kZSkpO1xuXHR9XG5cblx0c3VpdGUoJ3RyeU1vcnBoJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncmV0dXJucyBmYWxzZSBmb3Igbm9uLWFwcGVuZCBlZGl0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9ycGhlciA9IGNyZWF0ZU1vcnBoZXIoKTtcblx0XHRcdG1vcnBoZXIuc2VlZCgnaGVsbG8nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb3JwaGVyLnRyeU1vcnBoKCdnb29kYnllJyksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdHJ1ZSB3aGVuIGNvbnRlbnQgaXMgaWRlbnRpY2FsIChuby1vcCknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb3JwaGVyID0gY3JlYXRlTW9ycGhlcigpO1xuXHRcdFx0bW9ycGhlci5zZWVkKCdoZWxsbycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vcnBoZXIudHJ5TW9ycGgoJ2hlbGxvJyksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB0cnVlIGZvciBhcHBlbmRlZCBjb250ZW50JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9ycGhlciA9IGNyZWF0ZU1vcnBoZXIoKTtcblx0XHRcdG1vcnBoZXIuc2VlZCgnaGVsbG8nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb3JwaGVyLnRyeU1vcnBoKCdoZWxsbyB3b3JsZCcpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZmFsc2Ugd2hlbiBwcmVmaXggY2hhbmdlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vcnBoZXIgPSBjcmVhdGVNb3JwaGVyKCk7XG5cdFx0XHRtb3JwaGVyLnNlZWQoJ2hlbGxvIHdvcmxkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9ycGhlci50cnlNb3JwaCgnSGVsbG8gd29ybGQhJyksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N1Y2Nlc3NpdmUgYXBwZW5kcyBhbGwgc3VjY2VlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vcnBoZXIgPSBjcmVhdGVNb3JwaGVyKCk7XG5cdFx0XHRtb3JwaGVyLnNlZWQoJ2EnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb3JwaGVyLnRyeU1vcnBoKCdhYicpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb3JwaGVyLnRyeU1vcnBoKCdhYmMnKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9ycGhlci50cnlNb3JwaCgnYWJjZCcpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZhaWxzIGFmdGVyIGEgbm9uLWFwcGVuZCBlZGl0IGV2ZW4gaWYgcHJldmlvdXMgYXBwZW5kcyBzdWNjZWVkZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb3JwaGVyID0gY3JlYXRlTW9ycGhlcigpO1xuXHRcdFx0bW9ycGhlci5zZWVkKCdoZWxsbycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vcnBoZXIudHJ5TW9ycGgoJ2hlbGxvIHdvcmxkJyksIHRydWUpO1xuXHRcdFx0Ly8gTm93IGEgcmV3cml0ZSBvZiBlYXJsaWVyIGNvbnRlbnRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb3JwaGVyLnRyeU1vcnBoKCdoaSB3b3JsZCcpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbnZva2VzIHJlbmRlciBjYWxsYmFjayBvbiByQUYgd2l0aCBibG9jay1ib3VuZGFyeSBjb250ZW50JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVuZGVyZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0XHRjb25zdCBtb3JwaGVyID0gY3JlYXRlTW9ycGhlcigpO1xuXHRcdFx0bW9ycGhlci5zZXRSZW5kZXJDYWxsYmFjayhtZCA9PiByZW5kZXJlZC5wdXNoKG1kKSk7XG5cdFx0XHRtb3JwaGVyLnNlZWQoJycpO1xuXG5cdFx0XHQvLyBBcHBlbmQgY29udGVudCB3aXRoIGEgYmxvY2sgYm91bmRhcnlcblx0XHRcdG1vcnBoZXIudHJ5TW9ycGgoJ3BhcmFncmFwaCBvbmVcXG5cXG5wYXJhZ3JhcGggdHdvJyk7XG5cdFx0XHQvLyBUaGUgY2FsbGJhY2sgZmlyZXMgYXN5bmNocm9ub3VzbHkgdmlhIHJBRiwgbm90IHN5bmNocm9ub3VzbHlcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW5kZXJlZC5sZW5ndGgsIDAsICdTaG91bGQgbm90IHJlbmRlciBzeW5jaHJvbm91c2x5Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHRydWUgZm9yIGNvbnRlbnQgd2l0aG91dCBibG9jayBib3VuZGFyeSAoYnVmZmVyZWQpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9ycGhlciA9IGNyZWF0ZU1vcnBoZXIoKTtcblx0XHRcdG1vcnBoZXIuc2VlZCgnJyk7XG5cdFx0XHQvLyBObyBcXG5cXG4gXHUyMDE0IGNvbnRlbnQgaXMgYnVmZmVyZWRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb3JwaGVyLnRyeU1vcnBoKCdwYXJ0aWFsIHBhcmFncmFwaCcpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NjaGVkdWxlcyByZW5kZXIgZm9yIGNvbnRlbnQgd2l0aG91dCBhbnkgcGFyYWdyYXBoIGJyZWFrcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uSW5jcmVtZW50YWxSZW5kZXJpbmdCdWZmZXJpbmcsICdwYXJhZ3JhcGgnKTtcblx0XHRcdGNvbnN0IG1vcnBoZXIgPSBjcmVhdGVNb3JwaGVyKCk7XG5cdFx0XHRjb25zdCByZW5kZXJlZDogc3RyaW5nW10gPSBbXTtcblx0XHRcdG1vcnBoZXIuc2V0UmVuZGVyQ2FsbGJhY2sobWQgPT4gcmVuZGVyZWQucHVzaChtZCkpO1xuXHRcdFx0bW9ycGhlci5zZWVkKCcnKTtcblxuXHRcdFx0Ly8gQXBwZW5kIGNvbnRlbnQgd2l0aCBubyBcXG5cXG4gYXQgYWxsIFx1MjAxNCBwcmV2aW91c2x5IHRoaXMgd291bGRcblx0XHRcdC8vIG5ldmVyIHJlbmRlciBiZWNhdXNlIGdldFJlbmRlcmFibGUgcmV0dXJuZWQgbGFzdFJlbmRlcmVkIChlbXB0eSBzZWVkKS5cblx0XHRcdG1vcnBoZXIudHJ5TW9ycGgoJ3NpbmdsZSBibG9jayBubyBwYXJhZ3JhcGggYnJlYWtzJyk7XG5cblx0XHRcdC8vIEZsdXNoIHRoZSByQUYgXHUyMDE0IHRoZSBmdWxsIGNvbnRlbnQgc2hvdWxkIHJlbmRlciBzaW5jZVxuXHRcdFx0Ly8gdGhlcmUgYXJlIG5vIHBhcmFncmFwaCBib3VuZGFyaWVzIHRvIGJ1ZmZlciBhdC5cblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gbWFpbldpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUocikpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbmRlcmVkLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVuZGVyZWRbMF0sICdzaW5nbGUgYmxvY2sgbm8gcGFyYWdyYXBoIGJyZWFrcycpO1xuXG5cdFx0XHQvLyBGdXJ0aGVyIGFwcGVuZHMgc2hvdWxkIGFsc28gcmVuZGVyXG5cdFx0XHRtb3JwaGVyLnRyeU1vcnBoKCdzaW5nbGUgYmxvY2sgbm8gcGFyYWdyYXBoIGJyZWFrcyBcdTIwMTQgbW9yZSB3b3JkcycpO1xuXHRcdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBtYWluV2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZShyKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVuZGVyZWQubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW5kZXJlZFsxXSwgJ3NpbmdsZSBibG9jayBubyBwYXJhZ3JhcGggYnJlYWtzIFx1MjAxNCBtb3JlIHdvcmRzJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdzZWVkJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnc2V0cyBiYXNlbGluZSBtYXJrZG93bicsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vcnBoZXIgPSBjcmVhdGVNb3JwaGVyKCk7XG5cdFx0XHRtb3JwaGVyLnNlZWQoJ2luaXRpYWwgY29udGVudCcpO1xuXHRcdFx0Ly8gQWZ0ZXIgc2VlZGluZywgdHJ5TW9ycGggd2l0aCBzYW1lIGNvbnRlbnQgaXMgYSBuby1vcFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vcnBoZXIudHJ5TW9ycGgoJ2luaXRpYWwgY29udGVudCcpLCB0cnVlKTtcblx0XHRcdC8vIEFuZCBhcHBlbmRpbmcgd29ya3Ncblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb3JwaGVyLnRyeU1vcnBoKCdpbml0aWFsIGNvbnRlbnQgbW9yZScpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dpdGggYW5pbWF0ZUluaXRpYWw9ZmFsc2UgdXNlcyBleGlzdGluZyBjaGlsZCBjb3VudCBhcyB3YXRlcm1hcmsnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBkb21Ob2RlID0gbWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdGRvbU5vZGUuYXBwZW5kQ2hpbGQobWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdwJykpO1xuXHRcdFx0ZG9tTm9kZS5hcHBlbmRDaGlsZChtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3AnKSk7XG5cdFx0XHRjb25zdCBtb3JwaGVyID0gY3JlYXRlTW9ycGhlcihkb21Ob2RlKTtcblxuXHRcdFx0bW9ycGhlci5zZWVkKCdzb21lIGNvbnRlbnQnLCBmYWxzZSk7XG5cdFx0XHQvLyBObyBhbmltYXRpb24gY2xhc3NlcyBzaG91bGQgYmUgYXBwbGllZCBzaW5jZSBhbGwgY2hpbGRyZW4gYXJlIFwicmV2ZWFsZWRcIlxuXHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBBcnJheS5mcm9tKGRvbU5vZGUuY2hpbGRyZW4pKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0XHQoY2hpbGQgYXMgSFRNTEVsZW1lbnQpLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC1zbW9vdGgtYW5pbWF0ZS1mYWRlJyksXG5cdFx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRcdFx0J0V4aXN0aW5nIGNoaWxkcmVuIHNob3VsZCBub3QgYmUgYW5pbWF0ZWQgd2hlbiBhbmltYXRlSW5pdGlhbCBpcyBmYWxzZSdcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dpdGggYW5pbWF0ZUluaXRpYWw9dHJ1ZSBhbmltYXRlcyBleGlzdGluZyBjaGlsZHJlbicsICgpID0+IHtcblx0XHRcdGNvbnN0IGRvbU5vZGUgPSBtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0ZG9tTm9kZS5hcHBlbmRDaGlsZChtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3AnKSk7XG5cdFx0XHRkb21Ob2RlLmFwcGVuZENoaWxkKG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncCcpKTtcblx0XHRcdGNvbnN0IG1vcnBoZXIgPSBjcmVhdGVNb3JwaGVyKGRvbU5vZGUpO1xuXG5cdFx0XHRtb3JwaGVyLnNlZWQoJ3NvbWUgY29udGVudCcsIHRydWUpO1xuXHRcdFx0Ly8gQ2hpbGRyZW4gc2hvdWxkIGhhdmUgdGhlIGFuaW1hdGlvbiBjbGFzc1xuXHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBBcnJheS5mcm9tKGRvbU5vZGUuY2hpbGRyZW4pKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0XHQoY2hpbGQgYXMgSFRNTEVsZW1lbnQpLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC1zbW9vdGgtYW5pbWF0ZS1mYWRlJyksXG5cdFx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0XHQnRXhpc3RpbmcgY2hpbGRyZW4gc2hvdWxkIGJlIGFuaW1hdGVkIHdoZW4gYW5pbWF0ZUluaXRpYWwgaXMgdHJ1ZSdcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2FuaW1hdGlvbiBzdHlsZScsICgpID0+IHtcblxuXHRcdHRlc3QoJ2RlZmF1bHRzIHRvIGZhZGUgZm9yIGludmFsaWQgY29uZmlnIHZhbHVlJywgKCkgPT4ge1xuXHRcdFx0Y29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5JbmNyZW1lbnRhbFJlbmRlcmluZ1N0eWxlLCAnaW52YWxpZC1zdHlsZScpO1xuXHRcdFx0Y29uc3QgZG9tTm9kZSA9IG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRkb21Ob2RlLmFwcGVuZENoaWxkKG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncCcpKTtcblx0XHRcdGNvbnN0IG1vcnBoZXIgPSBjcmVhdGVNb3JwaGVyKGRvbU5vZGUpO1xuXHRcdFx0bW9ycGhlci5zZWVkKCdjb250ZW50JywgdHJ1ZSk7XG5cblx0XHRcdGNvbnN0IGNoaWxkID0gZG9tTm9kZS5jaGlsZHJlblswXSBhcyBIVE1MRWxlbWVudDtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGlsZC5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtc21vb3RoLWFuaW1hdGUtZmFkZScpLCB0cnVlLCAnU2hvdWxkIGZhbGwgYmFjayB0byBmYWRlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1c2VzIGNvbmZpZ3VyZWQgYW5pbWF0aW9uIHN0eWxlJywgKCkgPT4ge1xuXHRcdFx0Y29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5JbmNyZW1lbnRhbFJlbmRlcmluZ1N0eWxlLCAncmlzZScpO1xuXHRcdFx0Y29uc3QgZG9tTm9kZSA9IG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRkb21Ob2RlLmFwcGVuZENoaWxkKG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncCcpKTtcblx0XHRcdGNvbnN0IG1vcnBoZXIgPSBjcmVhdGVNb3JwaGVyKGRvbU5vZGUpO1xuXHRcdFx0bW9ycGhlci5zZWVkKCdjb250ZW50JywgdHJ1ZSk7XG5cblx0XHRcdGNvbnN0IGNoaWxkID0gZG9tTm9kZS5jaGlsZHJlblswXSBhcyBIVE1MRWxlbWVudDtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGlsZC5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtc21vb3RoLWFuaW1hdGUtcmlzZScpLCB0cnVlLCAnU2hvdWxkIHVzZSByaXNlIHN0eWxlJyk7XG5cdFx0fSk7XG5cblx0XHRmb3IgKGNvbnN0IHN0eWxlIG9mIFsnZmFkZScsICdyaXNlJywgJ2JsdXInLCAnc2NhbGUnLCAnc2xpZGUnXSBhcyBjb25zdCkge1xuXHRcdFx0dGVzdChgYXBwbGllcyAke3N0eWxlfSBhbmltYXRpb24gY2xhc3NgLCAoKSA9PiB7XG5cdFx0XHRcdGNvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uSW5jcmVtZW50YWxSZW5kZXJpbmdTdHlsZSwgc3R5bGUpO1xuXHRcdFx0XHRjb25zdCBkb21Ob2RlID0gbWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdFx0ZG9tTm9kZS5hcHBlbmRDaGlsZChtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3AnKSk7XG5cdFx0XHRcdGNvbnN0IG1vcnBoZXIgPSBjcmVhdGVNb3JwaGVyKGRvbU5vZGUpO1xuXHRcdFx0XHRtb3JwaGVyLnNlZWQoJ2NvbnRlbnQnLCB0cnVlKTtcblxuXHRcdFx0XHRjb25zdCBjaGlsZCA9IGRvbU5vZGUuY2hpbGRyZW5bMF0gYXMgSFRNTEVsZW1lbnQ7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0XHRjaGlsZC5jbGFzc0xpc3QuY29udGFpbnMoYGNoYXQtc21vb3RoLWFuaW1hdGUtJHtzdHlsZX1gKSxcblx0XHRcdFx0XHR0cnVlLFxuXHRcdFx0XHRcdGBTaG91bGQgaGF2ZSBjaGF0LXNtb290aC1hbmltYXRlLSR7c3R5bGV9IGNsYXNzYFxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9KTtcblxuXHRzdWl0ZSgnZGlzcG9zZScsICgpID0+IHtcblxuXHRcdHRlc3QoJ2NsZWFycyBwZW5kaW5nIHN0YXRlIG9uIGRpc3Bvc2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb3JwaGVyID0gY3JlYXRlTW9ycGhlcigpO1xuXHRcdFx0bW9ycGhlci5zZWVkKCcnKTtcblx0XHRcdG1vcnBoZXIuc2V0UmVuZGVyQ2FsbGJhY2soKCkgPT4geyB9KTtcblx0XHRcdG1vcnBoZXIudHJ5TW9ycGgoJ2hlbGxvXFxuXFxud29ybGQnKTtcblx0XHRcdC8vIERpc3Bvc2UgYmVmb3JlIHJBRiBmaXJlc1xuXHRcdFx0bW9ycGhlci5kaXNwb3NlKCk7XG5cdFx0XHQvLyBObyBlcnJvciBzaG91bGQgb2NjdXIgXHUyMDE0IHJBRiBpcyBjYW5jZWxsZWRcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3VwZGF0ZVN0cmVhbVJhdGUnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdmbHVzaGVzIHJlbWFpbmluZyBidWZmZXJlZCBjb250ZW50IG9uIGNvbXBsZXRpb24gZm9yIHBhcmFncmFwaCBidWZmZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBVc2UgcGFyYWdyYXBoIGJ1ZmZlciAoZGVmYXVsdClcblx0XHRcdGNvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uSW5jcmVtZW50YWxSZW5kZXJpbmdCdWZmZXJpbmcsICdwYXJhZ3JhcGgnKTtcblx0XHRcdGNvbnN0IG1vcnBoZXIgPSBjcmVhdGVNb3JwaGVyKCk7XG5cdFx0XHRjb25zdCByZW5kZXJlZDogc3RyaW5nW10gPSBbXTtcblx0XHRcdG1vcnBoZXIuc2V0UmVuZGVyQ2FsbGJhY2sobWQgPT4gcmVuZGVyZWQucHVzaChtZCkpO1xuXHRcdFx0bW9ycGhlci5zZWVkKCcnKTtcblxuXHRcdFx0Y29uc3QgZnVsbENvbnRlbnQgPSAncGFyYWdyYXBoIG9uZVxcblxcbnBhcmFncmFwaCB0d28gdHJhaWxpbmcnO1xuXHRcdFx0Ly8gQXBwZW5kIGNvbnRlbnQgd2hlcmUgdGhlIHRhaWwgaGFzIG5vIFxcblxcbiBib3VuZGFyeVxuXHRcdFx0bW9ycGhlci50cnlNb3JwaChmdWxsQ29udGVudCk7XG5cblx0XHRcdC8vIEZsdXNoIHRoZSByQUYgc28gdGhlIHBhcmFncmFwaC1ib3VuZGFyeSByZW5kZXIgZmlyZXNcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gbWFpbldpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUocikpO1xuXHRcdFx0Ly8gT25seSBjb250ZW50IHVwIHRvIHRoZSBsYXN0IFxcblxcbiBzaG91bGQgaGF2ZSByZW5kZXJlZFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbmRlcmVkLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVuZGVyZWRbMF0sICdwYXJhZ3JhcGggb25lXFxuXFxuJyk7XG5cblx0XHRcdC8vIFNpZ25hbCBzdHJlYW0gY29tcGxldGlvbiBcdTIwMTQgc2hvdWxkIHNjaGVkdWxlIGEgcmVuZGVyIG9mXG5cdFx0XHQvLyB0aGUgZnVsbCBjb250ZW50IGluY2x1ZGluZyB0aGUgdW5ib3VuZGVkIHRhaWwuXG5cdFx0XHRtb3JwaGVyLnVwZGF0ZVN0cmVhbVJhdGUoMTAwLCB0cnVlKTtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gbWFpbldpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUocikpO1xuXG5cdFx0XHQvLyBUaGUgcmVuZGVyIGNhbGxiYWNrIHNob3VsZCBub3cgaGF2ZSB0aGUgZnVsbCBjb250ZW50XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVuZGVyZWQubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW5kZXJlZFsxXSwgZnVsbENvbnRlbnQpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQmxvY2tBbmltYXRpb24nLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnYXBwbGllcyBhbmltYXRpb24gY2xhc3MgYW5kIGN1c3RvbSBwcm9wZXJ0aWVzIHRvIG5ldyBjaGlsZHJlbicsICgpID0+IHtcblx0XHRjb25zdCBhbmltID0gbmV3IEJsb2NrQW5pbWF0aW9uKCdmYWRlJyk7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gbWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRjb25zdCBjaGlsZCA9IGNvbnRhaW5lci5hcHBlbmRDaGlsZChtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3AnKSk7XG5cblx0XHRhbmltLmFuaW1hdGUoY29udGFpbmVyLmNoaWxkcmVuLCAwLCAxLCAwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGlsZC5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtc21vb3RoLWFuaW1hdGUtZmFkZScpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hpbGQuc3R5bGUuZ2V0UHJvcGVydHlWYWx1ZSgnLS1jaGF0LXNtb290aC1kdXJhdGlvbicpLCBgJHtBTklNQVRJT05fRFVSQVRJT05fTVN9bXNgKTtcblx0XHRhc3NlcnQub2soY2hpbGQuc3R5bGUuZ2V0UHJvcGVydHlWYWx1ZSgnLS1jaGF0LXNtb290aC1kZWxheScpICE9PSAnJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHN0cmlwIGFuaW1hdGlvbiBjbGFzcyBvbiBidWJibGVkIGFuaW1hdGlvbmVuZCBmcm9tIG5lc3RlZCBlbGVtZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IGFuaW0gPSBuZXcgQmxvY2tBbmltYXRpb24oJ3Jpc2UnKTtcblx0XHRjb25zdCBjb250YWluZXIgPSBtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGNvbnN0IHBhcmVudCA9IGNvbnRhaW5lci5hcHBlbmRDaGlsZChtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpKTtcblx0XHRjb25zdCBuZXN0ZWQgPSBwYXJlbnQuYXBwZW5kQ2hpbGQobWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJykpO1xuXG5cdFx0YW5pbS5hbmltYXRlKGNvbnRhaW5lci5jaGlsZHJlbiwgMCwgMSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcmVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtc21vb3RoLWFuaW1hdGUtcmlzZScpLCB0cnVlKTtcblxuXHRcdC8vIFNpbXVsYXRlIGFuaW1hdGlvbmVuZCBidWJibGluZyBmcm9tIG5lc3RlZCBjaGlsZFxuXHRcdGNvbnN0IGJ1YmJsZWRFdmVudCA9IG5ldyBBbmltYXRpb25FdmVudCgnYW5pbWF0aW9uZW5kJywgeyBidWJibGVzOiB0cnVlIH0pO1xuXHRcdG5lc3RlZC5kaXNwYXRjaEV2ZW50KGJ1YmJsZWRFdmVudCk7XG5cblx0XHQvLyBQYXJlbnQgc2hvdWxkIHN0aWxsIGhhdmUgdGhlIGFuaW1hdGlvbiBjbGFzc1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHBhcmVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtc21vb3RoLWFuaW1hdGUtcmlzZScpLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdCdBbmltYXRpb24gY2xhc3Mgc2hvdWxkIG5vdCBiZSByZW1vdmVkIGJ5IGJ1YmJsZWQgZXZlbnQnXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRwYXJlbnQuc3R5bGUuZ2V0UHJvcGVydHlWYWx1ZSgnLS1jaGF0LXNtb290aC1kdXJhdGlvbicpLFxuXHRcdFx0YCR7QU5JTUFUSU9OX0RVUkFUSU9OX01TfW1zYCxcblx0XHRcdCdDdXN0b20gcHJvcGVydGllcyBzaG91bGQgbm90IGJlIHJlbW92ZWQgYnkgYnViYmxlZCBldmVudCdcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdHJpcHMgYW5pbWF0aW9uIGNsYXNzIG9uIGRpcmVjdCBhbmltYXRpb25lbmQgZnJvbSB0aGUgYW5pbWF0ZWQgZWxlbWVudCcsICgpID0+IHtcblx0XHRjb25zdCBhbmltID0gbmV3IEJsb2NrQW5pbWF0aW9uKCdibHVyJyk7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gbWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRjb25zdCBjaGlsZCA9IGNvbnRhaW5lci5hcHBlbmRDaGlsZChtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3AnKSk7XG5cblx0XHRhbmltLmFuaW1hdGUoY29udGFpbmVyLmNoaWxkcmVuLCAwLCAxLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hpbGQuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXNtb290aC1hbmltYXRlLWJsdXInKSwgdHJ1ZSk7XG5cblx0XHQvLyBTaW11bGF0ZSBkaXJlY3QgYW5pbWF0aW9uZW5kIG9uIHRoZSBjaGlsZCBpdHNlbGZcblx0XHRjb25zdCBkaXJlY3RFdmVudCA9IG5ldyBBbmltYXRpb25FdmVudCgnYW5pbWF0aW9uZW5kJywgeyBidWJibGVzOiB0cnVlIH0pO1xuXHRcdGNoaWxkLmRpc3BhdGNoRXZlbnQoZGlyZWN0RXZlbnQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0Y2hpbGQuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXNtb290aC1hbmltYXRlLWJsdXInKSxcblx0XHRcdGZhbHNlLFxuXHRcdFx0J0FuaW1hdGlvbiBjbGFzcyBzaG91bGQgYmUgcmVtb3ZlZCBhZnRlciBkaXJlY3QgYW5pbWF0aW9uZW5kJ1xuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0Y2hpbGQuc3R5bGUuZ2V0UHJvcGVydHlWYWx1ZSgnLS1jaGF0LXNtb290aC1kdXJhdGlvbicpLFxuXHRcdFx0JycsXG5cdFx0XHQnQ3VzdG9tIHByb3BlcnR5IHNob3VsZCBiZSByZW1vdmVkIGFmdGVyIGRpcmVjdCBhbmltYXRpb25lbmQnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnc3RhZ2dlcnMgZGVsYXkgYWNyb3NzIG11bHRpcGxlIG5ldyBjaGlsZHJlbicsICgpID0+IHtcblx0XHRjb25zdCBhbmltID0gbmV3IEJsb2NrQW5pbWF0aW9uKCdmYWRlJyk7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gbWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQobWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdwJykpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3AnKSk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncCcpKTtcblxuXHRcdGFuaW0uYW5pbWF0ZShjb250YWluZXIuY2hpbGRyZW4sIDAsIDMsIDApO1xuXG5cdFx0Y29uc3QgZGVsYXlzID0gQXJyYXkuZnJvbShjb250YWluZXIuY2hpbGRyZW4pLm1hcChcblx0XHRcdGMgPT4gcGFyc2VJbnQoKGMgYXMgSFRNTEVsZW1lbnQpLnN0eWxlLmdldFByb3BlcnR5VmFsdWUoJy0tY2hhdC1zbW9vdGgtZGVsYXknKSlcblx0XHQpO1xuXHRcdC8vIEVhY2ggc3VjY2Vzc2l2ZSBjaGlsZCBzaG91bGQgaGF2ZSBhIGxhcmdlciBkZWxheVxuXHRcdGFzc2VydC5vayhkZWxheXNbMV0gPiBkZWxheXNbMF0sIGBTZWNvbmQgZGVsYXkgJHtkZWxheXNbMV19IHNob3VsZCBiZSBncmVhdGVyIHRoYW4gZmlyc3QgJHtkZWxheXNbMF19YCk7XG5cdFx0YXNzZXJ0Lm9rKGRlbGF5c1syXSA+IGRlbGF5c1sxXSwgYFRoaXJkIGRlbGF5ICR7ZGVsYXlzWzJdfSBzaG91bGQgYmUgZ3JlYXRlciB0aGFuIHNlY29uZCAke2RlbGF5c1sxXX1gKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ1dvcmRCdWZmZXInLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnc2V0UmF0ZSB3aXRoIGlzQ29tcGxldGUgdXNlcyBhdCBsZWFzdCBNSU5fUkFURV9BRlRFUl9DT01QTEVURScsICgpID0+IHtcblx0XHRjb25zdCBidWZmZXIgPSBuZXcgV29yZEJ1ZmZlcigpO1xuXG5cdFx0Ly8gU2V0dGluZyBhIGxvdyByYXRlIHdpdGggaXNDb21wbGV0ZSBzaG91bGQgZmxvb3IgdG8gODBcblx0XHRidWZmZXIuc2V0UmF0ZSgxMCwgdHJ1ZSk7XG5cdFx0Ly8gVmVyaWZ5IGJ5IGNoZWNraW5nIGZpbHRlckZsdXNoIGJlaGF2aW9yOiB3aXRoIHJhdGU9ODAsXG5cdFx0Ly8gYWZ0ZXIgZW5vdWdoIGVsYXBzZWQgdGltZSwgd29yZHMgc2hvdWxkIGJlIHJldmVhbGVkIGZhc3RlclxuXHRcdC8vIHRoYW4gYXQgcmF0ZT0xMC5cblx0XHRjb25zdCBtZCA9ICd3b3JkMSB3b3JkMiB3b3JkMyB3b3JkNCB3b3JkNSB3b3JkNiB3b3JkNyB3b3JkOCB3b3JkOSB3b3JkMTAnO1xuXHRcdGNvbnN0IHJlc3VsdDEgPSBidWZmZXIuZmlsdGVyRmx1c2gobWQpO1xuXHRcdC8vIEZpcnN0IGNhbGwgcmV2ZWFscyAxIHdvcmRcblx0XHRhc3NlcnQub2socmVzdWx0MSAhPT0gdW5kZWZpbmVkLCAnRmlyc3QgZmx1c2ggc2hvdWxkIHJldmVhbCBjb250ZW50Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NldFJhdGUgd2l0aCB1bmRlZmluZWQgcmF0ZSBhbmQgaXNDb21wbGV0ZSBkZWZhdWx0cyB0byBNSU5fUkFURV9BRlRFUl9DT01QTEVURScsICgpID0+IHtcblx0XHRjb25zdCBidWZmZXIgPSBuZXcgV29yZEJ1ZmZlcigpO1xuXHRcdGJ1ZmZlci5zZXRSYXRlKHVuZGVmaW5lZCwgdHJ1ZSk7XG5cblx0XHRjb25zdCBtZCA9ICd3b3JkMSB3b3JkMiB3b3JkMyc7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYnVmZmVyLmZpbHRlckZsdXNoKG1kKTtcblx0XHRhc3NlcnQub2socmVzdWx0ICE9PSB1bmRlZmluZWQsICdTaG91bGQgcmV2ZWFsIGNvbnRlbnQgd2l0aCBkZWZhdWx0IGNvbXBsZXRlIHJhdGUnKTtcblx0fSk7XG5cblx0dGVzdCgnc2V0UmF0ZSBkdXJpbmcgc3RyZWFtaW5nIGNsYW1wcyBiZXR3ZWVuIE1JTl9SQVRFIGFuZCBNQVhfUkFURScsICgpID0+IHtcblx0XHRjb25zdCBidWZmZXIgPSBuZXcgV29yZEJ1ZmZlcigpO1xuXG5cdFx0Ly8gUmF0ZSBiZWxvdyBNSU5fUkFURSBzaG91bGQgYmUgY2xhbXBlZCB1cFxuXHRcdGJ1ZmZlci5zZXRSYXRlKDEsIGZhbHNlKTtcblx0XHRjb25zdCBtZCA9ICd3b3JkMSB3b3JkMiB3b3JkMyc7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYnVmZmVyLmZpbHRlckZsdXNoKG1kKTtcblx0XHRhc3NlcnQub2socmVzdWx0ICE9PSB1bmRlZmluZWQsICdTaG91bGQgcmV2ZWFsIGNvbnRlbnQgZXZlbiB3aXRoIGxvdyByYXRlIChjbGFtcGVkIHRvIE1JTl9SQVRFKScpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXRSYXRlIHdpdGggdW5kZWZpbmVkIHJhdGUgZHVyaW5nIHN0cmVhbWluZyBkZWZhdWx0cyB0byBERUZBVUxUX1JBVEUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYnVmZmVyID0gbmV3IFdvcmRCdWZmZXIoKTtcblx0XHRidWZmZXIuc2V0UmF0ZSh1bmRlZmluZWQsIGZhbHNlKTtcblxuXHRcdGNvbnN0IG1kID0gJ3dvcmQxIHdvcmQyJztcblx0XHRjb25zdCByZXN1bHQgPSBidWZmZXIuZmlsdGVyRmx1c2gobWQpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQgIT09IHVuZGVmaW5lZCwgJ1Nob3VsZCByZXZlYWwgY29udGVudCB3aXRoIGRlZmF1bHQgc3RyZWFtaW5nIHJhdGUnKTtcblx0fSk7XG5cblx0dGVzdCgnbmVlZHNOZXh0RnJhbWUgaXMgdHJ1ZSB3aGVuIHdvcmRzIHJlbWFpbiB1bnJldmVhbGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGJ1ZmZlciA9IG5ldyBXb3JkQnVmZmVyKCk7XG5cdFx0YnVmZmVyLnNldFJhdGUoMSwgZmFsc2UpO1xuXG5cdFx0Ly8gRmlyc3QgZmx1c2ggcmV2ZWFscyAxIHdvcmQsIGJ1dCB0aGVyZSBhcmUgbW9yZVxuXHRcdGJ1ZmZlci5maWx0ZXJGbHVzaCgnd29yZDEgd29yZDIgd29yZDMgd29yZDQgd29yZDUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVmZmVyLm5lZWRzTmV4dEZyYW1lLCB0cnVlLCAnU2hvdWxkIG5lZWQgYW5vdGhlciBmcmFtZSB3aGVuIHdvcmRzIHJlbWFpbicpO1xuXHR9KTtcblxuXHR0ZXN0KCduZWVkc05leHRGcmFtZSBpcyBmYWxzZSB3aGVuIGFsbCB3b3JkcyBhcmUgcmV2ZWFsZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYnVmZmVyID0gbmV3IFdvcmRCdWZmZXIoKTtcblx0XHRidWZmZXIuc2V0UmF0ZSgyMDAwLCBmYWxzZSk7XG5cblx0XHQvLyBXaXRoIGEgdmVyeSBoaWdoIHJhdGUgYW5kIHNpbmdsZSB3b3JkLCBhbGwgY29udGVudCBpcyByZXZlYWxlZFxuXHRcdGJ1ZmZlci5maWx0ZXJGbHVzaCgnaGVsbG8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVmZmVyLm5lZWRzTmV4dEZyYW1lLCBmYWxzZSwgJ1Nob3VsZCBub3QgbmVlZCBhbm90aGVyIGZyYW1lIHdoZW4gYWxsIHdvcmRzIHNob3duJyk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywrQ0FBK0M7QUFDeEQs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
