import assert from "assert";
import { $, h, trackAttributes, copyAttributes, disposableWindowInterval, getWindows, getWindowsCount, getWindowId, getWindowById, hasWindow, getWindow, getDocument, isHTMLElement, SafeTriangle, AnimationFrameScheduler, DisposableResizeObserver, getRecentDisposableResizeObserverContextForLoopError, findParentWithClass, hasParentWithClass } from "../../browser/dom.js";
import { asCssValueWithDefault } from "../../../base/browser/cssValue.js";
import { ensureCodeWindow, isAuxiliaryWindow, mainWindow } from "../../browser/window.js";
import { DeferredPromise, timeout } from "../../common/async.js";
import { errorHandler, setUnexpectedErrorHandler } from "../../common/errors.js";
import { runWithFakedTimers } from "../common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../common/utils.js";
suite("dom", () => {
  test("hasClass", () => {
    const element = document.createElement("div");
    element.className = "foobar boo far";
    assert(element.classList.contains("foobar"));
    assert(element.classList.contains("boo"));
    assert(element.classList.contains("far"));
    assert(!element.classList.contains("bar"));
    assert(!element.classList.contains("foo"));
    assert(!element.classList.contains(""));
  });
  test("findParentWithClass supports multiple required classes", () => {
    const root = $("div.modern-ui.motion-enabled");
    const intermediate = $("div.modern-ui");
    const child = $("div");
    root.appendChild(intermediate).appendChild(child);
    assert.deepStrictEqual({
      multipleClasses: findParentWithClass(child, ["modern-ui", "motion-enabled"]) === root,
      singleClass: findParentWithClass(child, "modern-ui") === intermediate,
      missingClass: hasParentWithClass(child, ["modern-ui", "missing"]),
      stoppedBeforeMatch: hasParentWithClass(child, ["modern-ui", "motion-enabled"], intermediate)
    }, {
      multipleClasses: true,
      singleClass: true,
      missingClass: false,
      stoppedBeforeMatch: false
    });
  });
  test("removeClass", () => {
    let element = document.createElement("div");
    element.className = "foobar boo far";
    element.classList.remove("boo");
    assert(element.classList.contains("far"));
    assert(!element.classList.contains("boo"));
    assert(element.classList.contains("foobar"));
    assert.strictEqual(element.className, "foobar far");
    element = document.createElement("div");
    element.className = "foobar boo far";
    element.classList.remove("far");
    assert(!element.classList.contains("far"));
    assert(element.classList.contains("boo"));
    assert(element.classList.contains("foobar"));
    assert.strictEqual(element.className, "foobar boo");
    element.classList.remove("boo");
    assert(!element.classList.contains("far"));
    assert(!element.classList.contains("boo"));
    assert(element.classList.contains("foobar"));
    assert.strictEqual(element.className, "foobar");
    element.classList.remove("foobar");
    assert(!element.classList.contains("far"));
    assert(!element.classList.contains("boo"));
    assert(!element.classList.contains("foobar"));
    assert.strictEqual(element.className, "");
  });
  test("removeClass should consider hyphens", function() {
    const element = document.createElement("div");
    element.classList.add("foo-bar");
    element.classList.add("bar");
    assert(element.classList.contains("foo-bar"));
    assert(element.classList.contains("bar"));
    element.classList.remove("bar");
    assert(element.classList.contains("foo-bar"));
    assert(!element.classList.contains("bar"));
    element.classList.remove("foo-bar");
    assert(!element.classList.contains("foo-bar"));
    assert(!element.classList.contains("bar"));
  });
  suite("$", () => {
    test("should build simple nodes", () => {
      const div = $("div");
      assert(div);
      assert(isHTMLElement(div));
      assert.strictEqual(div.tagName, "DIV");
      assert(!div.firstChild);
    });
    test("should build nodes with id", () => {
      const div = $("div#foo");
      assert(div);
      assert(isHTMLElement(div));
      assert.strictEqual(div.tagName, "DIV");
      assert.strictEqual(div.id, "foo");
    });
    test("should build nodes with class-name", () => {
      const div = $("div.foo");
      assert(div);
      assert(isHTMLElement(div));
      assert.strictEqual(div.tagName, "DIV");
      assert.strictEqual(div.className, "foo");
    });
    test("should build nodes with attributes", () => {
      let div = $("div", { class: "test" });
      assert.strictEqual(div.className, "test");
      div = $("div", void 0);
      assert.strictEqual(div.className, "");
    });
    test("should build nodes with children", () => {
      let div = $("div", void 0, $("span", { id: "demospan" }));
      const firstChild = div.firstChild;
      assert.strictEqual(firstChild.tagName, "SPAN");
      assert.strictEqual(firstChild.id, "demospan");
      div = $("div", void 0, "hello");
      assert.strictEqual(div.firstChild && div.firstChild.textContent, "hello");
    });
    test("should build nodes with text children", () => {
      const div = $("div", void 0, "foobar");
      const firstChild = div.firstChild;
      assert.strictEqual(firstChild.tagName, void 0);
      assert.strictEqual(firstChild.textContent, "foobar");
    });
  });
  suite("h", () => {
    test("should build simple nodes", () => {
      const div = h("div");
      assert(isHTMLElement(div.root));
      assert.strictEqual(div.root.tagName, "DIV");
      const span = h("span");
      assert(isHTMLElement(span.root));
      assert.strictEqual(span.root.tagName, "SPAN");
      const img = h("img");
      assert(isHTMLElement(img.root));
      assert.strictEqual(img.root.tagName, "IMG");
    });
    test("should handle ids and classes", () => {
      const divId = h("div#myid");
      assert.strictEqual(divId.root.tagName, "DIV");
      assert.strictEqual(divId.root.id, "myid");
      const divClass = h("div.a");
      assert.strictEqual(divClass.root.tagName, "DIV");
      assert.strictEqual(divClass.root.classList.length, 1);
      assert(divClass.root.classList.contains("a"));
      const divClasses = h("div.a.b.c");
      assert.strictEqual(divClasses.root.tagName, "DIV");
      assert.strictEqual(divClasses.root.classList.length, 3);
      assert(divClasses.root.classList.contains("a"));
      assert(divClasses.root.classList.contains("b"));
      assert(divClasses.root.classList.contains("c"));
      const divAll = h("div#myid.a.b.c");
      assert.strictEqual(divAll.root.tagName, "DIV");
      assert.strictEqual(divAll.root.id, "myid");
      assert.strictEqual(divAll.root.classList.length, 3);
      assert(divAll.root.classList.contains("a"));
      assert(divAll.root.classList.contains("b"));
      assert(divAll.root.classList.contains("c"));
      const spanId = h("span#myid");
      assert.strictEqual(spanId.root.tagName, "SPAN");
      assert.strictEqual(spanId.root.id, "myid");
      const spanClass = h("span.a");
      assert.strictEqual(spanClass.root.tagName, "SPAN");
      assert.strictEqual(spanClass.root.classList.length, 1);
      assert(spanClass.root.classList.contains("a"));
      const spanClasses = h("span.a.b.c");
      assert.strictEqual(spanClasses.root.tagName, "SPAN");
      assert.strictEqual(spanClasses.root.classList.length, 3);
      assert(spanClasses.root.classList.contains("a"));
      assert(spanClasses.root.classList.contains("b"));
      assert(spanClasses.root.classList.contains("c"));
      const spanAll = h("span#myid.a.b.c");
      assert.strictEqual(spanAll.root.tagName, "SPAN");
      assert.strictEqual(spanAll.root.id, "myid");
      assert.strictEqual(spanAll.root.classList.length, 3);
      assert(spanAll.root.classList.contains("a"));
      assert(spanAll.root.classList.contains("b"));
      assert(spanAll.root.classList.contains("c"));
    });
    test("should implicitly handle ids and classes", () => {
      const divId = h("#myid");
      assert.strictEqual(divId.root.tagName, "DIV");
      assert.strictEqual(divId.root.id, "myid");
      const divClass = h(".a");
      assert.strictEqual(divClass.root.tagName, "DIV");
      assert.strictEqual(divClass.root.classList.length, 1);
      assert(divClass.root.classList.contains("a"));
      const divClasses = h(".a.b.c");
      assert.strictEqual(divClasses.root.tagName, "DIV");
      assert.strictEqual(divClasses.root.classList.length, 3);
      assert(divClasses.root.classList.contains("a"));
      assert(divClasses.root.classList.contains("b"));
      assert(divClasses.root.classList.contains("c"));
      const divAll = h("#myid.a.b.c");
      assert.strictEqual(divAll.root.tagName, "DIV");
      assert.strictEqual(divAll.root.id, "myid");
      assert.strictEqual(divAll.root.classList.length, 3);
      assert(divAll.root.classList.contains("a"));
      assert(divAll.root.classList.contains("b"));
      assert(divAll.root.classList.contains("c"));
    });
    test("should handle @ identifiers", () => {
      const implicit = h("@el");
      assert.strictEqual(implicit.root, implicit.el);
      assert.strictEqual(implicit.el.tagName, "DIV");
      const explicit = h("div@el");
      assert.strictEqual(explicit.root, explicit.el);
      assert.strictEqual(explicit.el.tagName, "DIV");
      const implicitId = h("#myid@el");
      assert.strictEqual(implicitId.root, implicitId.el);
      assert.strictEqual(implicitId.el.tagName, "DIV");
      assert.strictEqual(implicitId.root.id, "myid");
      const explicitId = h("div#myid@el");
      assert.strictEqual(explicitId.root, explicitId.el);
      assert.strictEqual(explicitId.el.tagName, "DIV");
      assert.strictEqual(explicitId.root.id, "myid");
      const implicitClass = h(".a@el");
      assert.strictEqual(implicitClass.root, implicitClass.el);
      assert.strictEqual(implicitClass.el.tagName, "DIV");
      assert.strictEqual(implicitClass.root.classList.length, 1);
      assert(implicitClass.root.classList.contains("a"));
      const explicitClass = h("div.a@el");
      assert.strictEqual(explicitClass.root, explicitClass.el);
      assert.strictEqual(explicitClass.el.tagName, "DIV");
      assert.strictEqual(explicitClass.root.classList.length, 1);
      assert(explicitClass.root.classList.contains("a"));
    });
  });
  test("should recurse", () => {
    const result = h("div.code-view", [
      h("div.title@title"),
      h("div.container", [
        h("div.gutter@gutterDiv"),
        h("span@editor")
      ])
    ]);
    assert.strictEqual(result.root.tagName, "DIV");
    assert.strictEqual(result.root.className, "code-view");
    assert.strictEqual(result.root.childElementCount, 2);
    assert.strictEqual(result.root.firstElementChild, result.title);
    assert.strictEqual(result.title.tagName, "DIV");
    assert.strictEqual(result.title.className, "title");
    assert.strictEqual(result.title.childElementCount, 0);
    assert.strictEqual(result.gutterDiv.tagName, "DIV");
    assert.strictEqual(result.gutterDiv.className, "gutter");
    assert.strictEqual(result.gutterDiv.childElementCount, 0);
    assert.strictEqual(result.editor.tagName, "SPAN");
    assert.strictEqual(result.editor.className, "");
    assert.strictEqual(result.editor.childElementCount, 0);
  });
  test("cssValueWithDefault", () => {
    assert.strictEqual(asCssValueWithDefault("red", "blue"), "red");
    assert.strictEqual(asCssValueWithDefault(void 0, "blue"), "blue");
    assert.strictEqual(asCssValueWithDefault("var(--my-var)", "blue"), "var(--my-var, blue)");
    assert.strictEqual(asCssValueWithDefault("var(--my-var, red)", "blue"), "var(--my-var, red)");
    assert.strictEqual(asCssValueWithDefault("var(--my-var, var(--my-var2))", "blue"), "var(--my-var, var(--my-var2, blue))");
  });
  test("copyAttributes", () => {
    const elementSource = document.createElement("div");
    elementSource.setAttribute("foo", "bar");
    elementSource.setAttribute("bar", "foo");
    const elementTarget = document.createElement("div");
    copyAttributes(elementSource, elementTarget);
    assert.strictEqual(elementTarget.getAttribute("foo"), "bar");
    assert.strictEqual(elementTarget.getAttribute("bar"), "foo");
  });
  test("trackAttributes (unfiltered)", async () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      const elementSource = document.createElement("div");
      const elementTarget = document.createElement("div");
      const disposable = trackAttributes(elementSource, elementTarget);
      elementSource.setAttribute("foo", "bar");
      elementSource.setAttribute("bar", "foo");
      await timeout(1);
      assert.strictEqual(elementTarget.getAttribute("foo"), "bar");
      assert.strictEqual(elementTarget.getAttribute("bar"), "foo");
      disposable.dispose();
    });
  });
  test("trackAttributes (filtered)", async () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      const elementSource = document.createElement("div");
      const elementTarget = document.createElement("div");
      const disposable = trackAttributes(elementSource, elementTarget, ["foo"]);
      elementSource.setAttribute("foo", "bar");
      elementSource.setAttribute("bar", "foo");
      await timeout(1);
      assert.strictEqual(elementTarget.getAttribute("foo"), "bar");
      assert.strictEqual(elementTarget.getAttribute("bar"), null);
      disposable.dispose();
    });
  });
  test("window utilities", () => {
    const windows = Array.from(getWindows());
    assert.strictEqual(windows.length, 1);
    assert.strictEqual(getWindowsCount(), 1);
    const windowId = getWindowId(mainWindow);
    assert.ok(typeof windowId === "number");
    assert.strictEqual(getWindowById(windowId)?.window, mainWindow);
    assert.strictEqual(getWindowById(void 0, true).window, mainWindow);
    assert.strictEqual(hasWindow(windowId), true);
    assert.strictEqual(isAuxiliaryWindow(mainWindow), false);
    ensureCodeWindow(mainWindow, 1);
    assert.ok(typeof mainWindow.vscodeWindowId === "number");
    const div = document.createElement("div");
    assert.strictEqual(getWindow(div), mainWindow);
    assert.strictEqual(getDocument(div), mainWindow.document);
    const event = document.createEvent("MouseEvent");
    assert.strictEqual(getWindow(event), mainWindow);
    assert.strictEqual(getDocument(event), mainWindow.document);
  });
  suite("disposableWindowInterval", () => {
    test("basics", async () => {
      let count = 0;
      const promise = new DeferredPromise();
      const interval = disposableWindowInterval(mainWindow, () => {
        count++;
        if (count === 3) {
          promise.complete(void 0);
          return true;
        } else {
          return false;
        }
      }, 0, 10);
      await promise.p;
      assert.strictEqual(count, 3);
      interval.dispose();
    });
    test("iterations", async () => {
      let count = 0;
      const interval = disposableWindowInterval(mainWindow, () => {
        count++;
        return false;
      }, 0, 0);
      await timeout(5);
      assert.strictEqual(count, 0);
      interval.dispose();
    });
    test("dispose", async () => {
      let count = 0;
      const interval = disposableWindowInterval(mainWindow, () => {
        count++;
        return false;
      }, 0, 10);
      interval.dispose();
      await timeout(5);
      assert.strictEqual(count, 0);
    });
  });
  suite("SafeTriangle", () => {
    const fakeElement = (left, right, top, bottom) => {
      return { getBoundingClientRect: () => ({ left, right, top, bottom }) };
    };
    test("works", () => {
      const safeTriangle = new SafeTriangle(0, 0, fakeElement(10, 20, 10, 20));
      assert.strictEqual(safeTriangle.contains(5, 5), true);
      assert.strictEqual(safeTriangle.contains(15, 5), false);
      assert.strictEqual(safeTriangle.contains(25, 5), false);
      assert.strictEqual(safeTriangle.contains(5, 15), false);
      assert.strictEqual(safeTriangle.contains(15, 15), true);
      assert.strictEqual(safeTriangle.contains(25, 15), false);
      assert.strictEqual(safeTriangle.contains(5, 25), false);
      assert.strictEqual(safeTriangle.contains(15, 25), false);
      assert.strictEqual(safeTriangle.contains(25, 25), false);
    });
    test("other dirations", () => {
      const a = new SafeTriangle(30, 30, fakeElement(10, 20, 10, 20));
      assert.strictEqual(a.contains(25, 25), true);
      const b = new SafeTriangle(0, 30, fakeElement(10, 20, 10, 20));
      assert.strictEqual(b.contains(5, 25), true);
      const c = new SafeTriangle(30, 0, fakeElement(10, 20, 10, 20));
      assert.strictEqual(c.contains(25, 5), true);
    });
  });
  suite("AnimationFrameScheduler", () => {
    const waitForAnimationFrame = () => new Promise((resolve) => mainWindow.requestAnimationFrame(() => resolve()));
    test("schedules and runs the callback", async () => {
      const node = document.createElement("div");
      let callCount = 0;
      const scheduler = new AnimationFrameScheduler(node, () => {
        callCount++;
      });
      assert.strictEqual(scheduler.isScheduled(), false);
      scheduler.schedule();
      assert.strictEqual(scheduler.isScheduled(), true);
      await waitForAnimationFrame();
      assert.strictEqual(callCount, 1);
      assert.strictEqual(scheduler.isScheduled(), false);
      scheduler.dispose();
    });
    test("coalesces multiple schedule calls", async () => {
      const node = document.createElement("div");
      let callCount = 0;
      const scheduler = new AnimationFrameScheduler(node, () => {
        callCount++;
      });
      scheduler.schedule();
      scheduler.schedule();
      scheduler.schedule();
      assert.strictEqual(scheduler.isScheduled(), true);
      await waitForAnimationFrame();
      assert.strictEqual(callCount, 1);
      scheduler.dispose();
    });
    test("cancel prevents execution", async () => {
      const node = document.createElement("div");
      let callCount = 0;
      const scheduler = new AnimationFrameScheduler(node, () => {
        callCount++;
      });
      scheduler.schedule();
      assert.strictEqual(scheduler.isScheduled(), true);
      scheduler.cancel();
      assert.strictEqual(scheduler.isScheduled(), false);
      await waitForAnimationFrame();
      assert.strictEqual(callCount, 0);
      scheduler.dispose();
    });
    test("dispose prevents execution", async () => {
      const node = document.createElement("div");
      let callCount = 0;
      const scheduler = new AnimationFrameScheduler(node, () => {
        callCount++;
      });
      scheduler.schedule();
      scheduler.dispose();
      await waitForAnimationFrame();
      assert.strictEqual(callCount, 0);
    });
    test("can schedule again after execution", async () => {
      const node = document.createElement("div");
      let callCount = 0;
      const scheduler = new AnimationFrameScheduler(node, () => {
        callCount++;
      });
      scheduler.schedule();
      await waitForAnimationFrame();
      assert.strictEqual(callCount, 1);
      scheduler.schedule();
      await waitForAnimationFrame();
      assert.strictEqual(callCount, 2);
      scheduler.dispose();
    });
  });
  suite("DisposableResizeObserver", () => {
    teardown(() => new Promise((resolve) => mainWindow.requestAnimationFrame(() => resolve())));
    function createFakeResizeObserverCtor() {
      const handle = {
        ctor: void 0,
        fire: () => {
          throw new Error("observer not constructed");
        },
        disconnects: 0
      };
      class FakeResizeObserver {
        constructor(callback) {
          handle.fire = (entries) => callback(entries, this);
        }
        observe(_target, _options) {
        }
        unobserve(_target) {
        }
        disconnect() {
          handle.disconnects++;
        }
      }
      handle.ctor = FakeResizeObserver;
      return handle;
    }
    function fakeEntry(target = document.createElement("div")) {
      const size = { blockSize: 0, inlineSize: 0 };
      return {
        target,
        contentRect: target.getBoundingClientRect(),
        borderBoxSize: [size],
        contentBoxSize: [size],
        devicePixelContentBoxSize: [size]
      };
    }
    test("callback runs synchronously with the entries the browser delivered", () => {
      const fake = createFakeResizeObserverCtor();
      let calls = 0;
      let received;
      const observer = new DisposableResizeObserver("test.sync", (entries) => {
        calls++;
        received = entries;
      }, mainWindow, { resizeObserverCtor: fake.ctor });
      const a = fakeEntry();
      const b = fakeEntry();
      fake.fire([a, b]);
      assert.strictEqual(calls, 1, "callback runs synchronously inside the resize-observation phase");
      assert.deepStrictEqual(received, [a, b], "entries are forwarded as-is");
      observer.dispose();
    });
    test("each native delivery invokes the callback once (no batching)", () => {
      const fake = createFakeResizeObserverCtor();
      let calls = 0;
      const observer = new DisposableResizeObserver("test.noBatch", () => {
        calls++;
      }, mainWindow, { resizeObserverCtor: fake.ctor });
      fake.fire([fakeEntry()]);
      fake.fire([fakeEntry()]);
      assert.strictEqual(calls, 2, "wrapper does not coalesce deliveries");
      observer.dispose();
    });
    test("dispose disconnects the underlying observer", () => {
      const fake = createFakeResizeObserverCtor();
      const observer = new DisposableResizeObserver("test.dispose", () => {
      }, mainWindow, { resizeObserverCtor: fake.ctor });
      observer.dispose();
      assert.strictEqual(fake.disconnects, 1);
    });
    test("exceptions in the user callback do not propagate", () => {
      const fake = createFakeResizeObserverCtor();
      const observer = new DisposableResizeObserver("test.throw", () => {
        throw new Error("boom");
      }, mainWindow, { resizeObserverCtor: fake.ctor });
      const originalErrorHandler = errorHandler.getUnexpectedErrorHandler();
      setUnexpectedErrorHandler(() => {
      });
      try {
        assert.doesNotThrow(() => fake.fire([fakeEntry()]));
      } finally {
        setUnexpectedErrorHandler(originalErrorHandler);
      }
      observer.dispose();
    });
    test("exposes the configured name for loop-warning context", () => {
      const fake = createFakeResizeObserverCtor();
      const observer = new DisposableResizeObserver(
        "my-observer",
        () => {
        },
        mainWindow,
        { resizeObserverCtor: fake.ctor }
      );
      assert.strictEqual(observer.name, "my-observer");
      observer.dispose();
    });
    test("getRecentDisposableResizeObserverContextForLoopError returns undefined for unrelated messages", () => {
      assert.strictEqual(getRecentDisposableResizeObserverContextForLoopError(void 0), void 0);
      assert.strictEqual(getRecentDisposableResizeObserverContextForLoopError("Uncaught TypeError: foo"), void 0);
    });
    test("getRecentDisposableResizeObserverContextForLoopError returns sorted unique wrapped observers from the current frame", () => {
      const fake = createFakeResizeObserverCtor();
      const a = new DisposableResizeObserver("a", () => {
      }, mainWindow, { resizeObserverCtor: fake.ctor });
      fake.fire([fakeEntry()]);
      const fakeB = createFakeResizeObserverCtor();
      const b = new DisposableResizeObserver("b", () => {
      }, mainWindow, { resizeObserverCtor: fakeB.ctor });
      fakeB.fire([fakeEntry()]);
      fake.fire([fakeEntry()]);
      const context = getRecentDisposableResizeObserverContextForLoopError(
        "ResizeObserver loop completed with undelivered notifications."
      );
      assert.strictEqual(
        context,
        "[ResizeObserverLoopContext(a,b)] ResizeObserver loop completed with undelivered notifications."
      );
      a.dispose();
      b.dispose();
    });
    test("getRecentDisposableResizeObserverContextForLoopError marks bounded participant overflow", () => {
      const observers = [];
      for (let i = 8; i >= 0; i--) {
        const fake = createFakeResizeObserverCtor();
        observers.push(new DisposableResizeObserver(`observer-${i}`, () => {
        }, mainWindow, { resizeObserverCtor: fake.ctor }));
        fake.fire([fakeEntry()]);
      }
      assert.strictEqual(
        getRecentDisposableResizeObserverContextForLoopError("ResizeObserver loop completed with undelivered notifications."),
        "[ResizeObserverLoopContext(observer-0,observer-1,observer-2,observer-3,observer-4,observer-5,observer-6,observer-7,<overflow>)] ResizeObserver loop completed with undelivered notifications."
      );
      observers.forEach((observer) => observer.dispose());
    });
    test("getRecentDisposableResizeObserverContextForLoopError is scoped to the observer window", async () => {
      const iframe = document.createElement("iframe");
      document.body.appendChild(iframe);
      const auxiliaryWindow = iframe.contentWindow;
      ensureCodeWindow(auxiliaryWindow, 999);
      const fake = createFakeResizeObserverCtor();
      const observer = new DisposableResizeObserver("auxiliary", () => {
      }, auxiliaryWindow, { resizeObserverCtor: fake.ctor });
      fake.fire([fakeEntry()]);
      assert.strictEqual(
        getRecentDisposableResizeObserverContextForLoopError("ResizeObserver loop completed with undelivered notifications.", mainWindow),
        void 0
      );
      assert.strictEqual(
        getRecentDisposableResizeObserverContextForLoopError("ResizeObserver loop completed with undelivered notifications.", auxiliaryWindow),
        "[ResizeObserverLoopContext(auxiliary)] ResizeObserver loop completed with undelivered notifications."
      );
      observer.dispose();
      await new Promise((resolve) => auxiliaryWindow.requestAnimationFrame(() => resolve()));
      iframe.remove();
    });
    test("getRecentDisposableResizeObserverContextForLoopError clears at the next animation frame", async () => {
      const fake = createFakeResizeObserverCtor();
      const observer = new DisposableResizeObserver("scoped", () => {
      }, mainWindow, { resizeObserverCtor: fake.ctor });
      fake.fire([fakeEntry()]);
      await Promise.resolve();
      assert.ok(getRecentDisposableResizeObserverContextForLoopError("ResizeObserver loop completed with undelivered notifications."));
      await new Promise((resolve) => mainWindow.requestAnimationFrame(() => resolve()));
      assert.strictEqual(
        getRecentDisposableResizeObserverContextForLoopError("ResizeObserver loop completed with undelivered notifications."),
        void 0,
        "context must be cleared at the next frame so a later rendering update does not inherit stale observers"
      );
      observer.dispose();
    });
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9icm93c2VyL2RvbS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgJCwgaCwgdHJhY2tBdHRyaWJ1dGVzLCBjb3B5QXR0cmlidXRlcywgZGlzcG9zYWJsZVdpbmRvd0ludGVydmFsLCBnZXRXaW5kb3dzLCBnZXRXaW5kb3dzQ291bnQsIGdldFdpbmRvd0lkLCBnZXRXaW5kb3dCeUlkLCBoYXNXaW5kb3csIGdldFdpbmRvdywgZ2V0RG9jdW1lbnQsIGlzSFRNTEVsZW1lbnQsIFNhZmVUcmlhbmdsZSwgQW5pbWF0aW9uRnJhbWVTY2hlZHVsZXIsIERpc3Bvc2FibGVSZXNpemVPYnNlcnZlciwgZ2V0UmVjZW50RGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyQ29udGV4dEZvckxvb3BFcnJvciwgZmluZFBhcmVudFdpdGhDbGFzcywgaGFzUGFyZW50V2l0aENsYXNzIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgYXNDc3NWYWx1ZVdpdGhEZWZhdWx0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2Nzc1ZhbHVlLmpzJztcbmltcG9ydCB7IGVuc3VyZUNvZGVXaW5kb3csIGlzQXV4aWxpYXJ5V2luZG93LCBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlLCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGVycm9ySGFuZGxlciwgc2V0VW5leHBlY3RlZEVycm9ySGFuZGxlciB9IGZyb20gJy4uLy4uL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgcnVuV2l0aEZha2VkVGltZXJzIH0gZnJvbSAnLi4vY29tbW9uL3RpbWVUcmF2ZWxTY2hlZHVsZXIuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vY29tbW9uL3V0aWxzLmpzJztcblxuc3VpdGUoJ2RvbScsICgpID0+IHtcblx0dGVzdCgnaGFzQ2xhc3MnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBlbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0ZWxlbWVudC5jbGFzc05hbWUgPSAnZm9vYmFyIGJvbyBmYXInO1xuXG5cdFx0YXNzZXJ0KGVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdmb29iYXInKSk7XG5cdFx0YXNzZXJ0KGVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdib28nKSk7XG5cdFx0YXNzZXJ0KGVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdmYXInKSk7XG5cdFx0YXNzZXJ0KCFlbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnYmFyJykpO1xuXHRcdGFzc2VydCghZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2ZvbycpKTtcblx0XHRhc3NlcnQoIWVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCcnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbmRQYXJlbnRXaXRoQ2xhc3Mgc3VwcG9ydHMgbXVsdGlwbGUgcmVxdWlyZWQgY2xhc3NlcycsICgpID0+IHtcblx0XHRjb25zdCByb290ID0gJCgnZGl2Lm1vZGVybi11aS5tb3Rpb24tZW5hYmxlZCcpO1xuXHRcdGNvbnN0IGludGVybWVkaWF0ZSA9ICQoJ2Rpdi5tb2Rlcm4tdWknKTtcblx0XHRjb25zdCBjaGlsZCA9ICQoJ2RpdicpO1xuXHRcdHJvb3QuYXBwZW5kQ2hpbGQoaW50ZXJtZWRpYXRlKS5hcHBlbmRDaGlsZChjaGlsZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG11bHRpcGxlQ2xhc3NlczogZmluZFBhcmVudFdpdGhDbGFzcyhjaGlsZCwgWydtb2Rlcm4tdWknLCAnbW90aW9uLWVuYWJsZWQnXSkgPT09IHJvb3QsXG5cdFx0XHRzaW5nbGVDbGFzczogZmluZFBhcmVudFdpdGhDbGFzcyhjaGlsZCwgJ21vZGVybi11aScpID09PSBpbnRlcm1lZGlhdGUsXG5cdFx0XHRtaXNzaW5nQ2xhc3M6IGhhc1BhcmVudFdpdGhDbGFzcyhjaGlsZCwgWydtb2Rlcm4tdWknLCAnbWlzc2luZyddKSxcblx0XHRcdHN0b3BwZWRCZWZvcmVNYXRjaDogaGFzUGFyZW50V2l0aENsYXNzKGNoaWxkLCBbJ21vZGVybi11aScsICdtb3Rpb24tZW5hYmxlZCddLCBpbnRlcm1lZGlhdGUpLFxuXHRcdH0sIHtcblx0XHRcdG11bHRpcGxlQ2xhc3NlczogdHJ1ZSxcblx0XHRcdHNpbmdsZUNsYXNzOiB0cnVlLFxuXHRcdFx0bWlzc2luZ0NsYXNzOiBmYWxzZSxcblx0XHRcdHN0b3BwZWRCZWZvcmVNYXRjaDogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92ZUNsYXNzJywgKCkgPT4ge1xuXG5cdFx0bGV0IGVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRlbGVtZW50LmNsYXNzTmFtZSA9ICdmb29iYXIgYm9vIGZhcic7XG5cblx0XHRlbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2JvbycpO1xuXHRcdGFzc2VydChlbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnZmFyJykpO1xuXHRcdGFzc2VydCghZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2JvbycpKTtcblx0XHRhc3NlcnQoZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2Zvb2JhcicpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWxlbWVudC5jbGFzc05hbWUsICdmb29iYXIgZmFyJyk7XG5cblx0XHRlbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0ZWxlbWVudC5jbGFzc05hbWUgPSAnZm9vYmFyIGJvbyBmYXInO1xuXG5cdFx0ZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdmYXInKTtcblx0XHRhc3NlcnQoIWVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdmYXInKSk7XG5cdFx0YXNzZXJ0KGVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdib28nKSk7XG5cdFx0YXNzZXJ0KGVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdmb29iYXInKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVsZW1lbnQuY2xhc3NOYW1lLCAnZm9vYmFyIGJvbycpO1xuXG5cdFx0ZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdib28nKTtcblx0XHRhc3NlcnQoIWVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdmYXInKSk7XG5cdFx0YXNzZXJ0KCFlbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnYm9vJykpO1xuXHRcdGFzc2VydChlbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnZm9vYmFyJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbGVtZW50LmNsYXNzTmFtZSwgJ2Zvb2JhcicpO1xuXG5cdFx0ZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdmb29iYXInKTtcblx0XHRhc3NlcnQoIWVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdmYXInKSk7XG5cdFx0YXNzZXJ0KCFlbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnYm9vJykpO1xuXHRcdGFzc2VydCghZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2Zvb2JhcicpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWxlbWVudC5jbGFzc05hbWUsICcnKTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlQ2xhc3Mgc2hvdWxkIGNvbnNpZGVyIGh5cGhlbnMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXG5cdFx0ZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdmb28tYmFyJyk7XG5cdFx0ZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdiYXInKTtcblxuXHRcdGFzc2VydChlbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnZm9vLWJhcicpKTtcblx0XHRhc3NlcnQoZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2JhcicpKTtcblxuXHRcdGVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnYmFyJyk7XG5cdFx0YXNzZXJ0KGVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdmb28tYmFyJykpO1xuXHRcdGFzc2VydCghZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2JhcicpKTtcblxuXHRcdGVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnZm9vLWJhcicpO1xuXHRcdGFzc2VydCghZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2Zvby1iYXInKSk7XG5cdFx0YXNzZXJ0KCFlbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnYmFyJykpO1xuXHR9KTtcblxuXHRzdWl0ZSgnJCcsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgYnVpbGQgc2ltcGxlIG5vZGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGl2ID0gJCgnZGl2Jyk7XG5cdFx0XHRhc3NlcnQoZGl2KTtcblx0XHRcdGFzc2VydChpc0hUTUxFbGVtZW50KGRpdikpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpdi50YWdOYW1lLCAnRElWJyk7XG5cdFx0XHRhc3NlcnQoIWRpdi5maXJzdENoaWxkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBidWlsZCBub2RlcyB3aXRoIGlkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGl2ID0gJCgnZGl2I2ZvbycpO1xuXHRcdFx0YXNzZXJ0KGRpdik7XG5cdFx0XHRhc3NlcnQoaXNIVE1MRWxlbWVudChkaXYpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXYudGFnTmFtZSwgJ0RJVicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpdi5pZCwgJ2ZvbycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGJ1aWxkIG5vZGVzIHdpdGggY2xhc3MtbmFtZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGRpdiA9ICQoJ2Rpdi5mb28nKTtcblx0XHRcdGFzc2VydChkaXYpO1xuXHRcdFx0YXNzZXJ0KGlzSFRNTEVsZW1lbnQoZGl2KSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGl2LnRhZ05hbWUsICdESVYnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXYuY2xhc3NOYW1lLCAnZm9vJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgYnVpbGQgbm9kZXMgd2l0aCBhdHRyaWJ1dGVzJywgKCkgPT4ge1xuXHRcdFx0bGV0IGRpdiA9ICQoJ2RpdicsIHsgY2xhc3M6ICd0ZXN0JyB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXYuY2xhc3NOYW1lLCAndGVzdCcpO1xuXG5cdFx0XHRkaXYgPSAkKCdkaXYnLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpdi5jbGFzc05hbWUsICcnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBidWlsZCBub2RlcyB3aXRoIGNoaWxkcmVuJywgKCkgPT4ge1xuXHRcdFx0bGV0IGRpdiA9ICQoJ2RpdicsIHVuZGVmaW5lZCwgJCgnc3BhbicsIHsgaWQ6ICdkZW1vc3BhbicgfSkpO1xuXHRcdFx0Y29uc3QgZmlyc3RDaGlsZCA9IGRpdi5maXJzdENoaWxkIGFzIEhUTUxFbGVtZW50O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0Q2hpbGQudGFnTmFtZSwgJ1NQQU4nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdENoaWxkLmlkLCAnZGVtb3NwYW4nKTtcblxuXHRcdFx0ZGl2ID0gJCgnZGl2JywgdW5kZWZpbmVkLCAnaGVsbG8nKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpdi5maXJzdENoaWxkICYmIGRpdi5maXJzdENoaWxkLnRleHRDb250ZW50LCAnaGVsbG8nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBidWlsZCBub2RlcyB3aXRoIHRleHQgY2hpbGRyZW4nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBkaXYgPSAkKCdkaXYnLCB1bmRlZmluZWQsICdmb29iYXInKTtcblx0XHRcdGNvbnN0IGZpcnN0Q2hpbGQgPSBkaXYuZmlyc3RDaGlsZCBhcyBIVE1MRWxlbWVudDtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdENoaWxkLnRhZ05hbWUsIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3RDaGlsZC50ZXh0Q29udGVudCwgJ2Zvb2JhcicpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnaCcsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgYnVpbGQgc2ltcGxlIG5vZGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGl2ID0gaCgnZGl2Jyk7XG5cdFx0XHRhc3NlcnQoaXNIVE1MRWxlbWVudChkaXYucm9vdCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpdi5yb290LnRhZ05hbWUsICdESVYnKTtcblxuXHRcdFx0Y29uc3Qgc3BhbiA9IGgoJ3NwYW4nKTtcblx0XHRcdGFzc2VydChpc0hUTUxFbGVtZW50KHNwYW4ucm9vdCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNwYW4ucm9vdC50YWdOYW1lLCAnU1BBTicpO1xuXG5cdFx0XHRjb25zdCBpbWcgPSBoKCdpbWcnKTtcblx0XHRcdGFzc2VydChpc0hUTUxFbGVtZW50KGltZy5yb290KSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW1nLnJvb3QudGFnTmFtZSwgJ0lNRycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBpZHMgYW5kIGNsYXNzZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBkaXZJZCA9IGgoJ2RpdiNteWlkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGl2SWQucm9vdC50YWdOYW1lLCAnRElWJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGl2SWQucm9vdC5pZCwgJ215aWQnKTtcblxuXHRcdFx0Y29uc3QgZGl2Q2xhc3MgPSBoKCdkaXYuYScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpdkNsYXNzLnJvb3QudGFnTmFtZSwgJ0RJVicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpdkNsYXNzLnJvb3QuY2xhc3NMaXN0Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQoZGl2Q2xhc3Mucm9vdC5jbGFzc0xpc3QuY29udGFpbnMoJ2EnKSk7XG5cblx0XHRcdGNvbnN0IGRpdkNsYXNzZXMgPSBoKCdkaXYuYS5iLmMnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXZDbGFzc2VzLnJvb3QudGFnTmFtZSwgJ0RJVicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpdkNsYXNzZXMucm9vdC5jbGFzc0xpc3QubGVuZ3RoLCAzKTtcblx0XHRcdGFzc2VydChkaXZDbGFzc2VzLnJvb3QuY2xhc3NMaXN0LmNvbnRhaW5zKCdhJykpO1xuXHRcdFx0YXNzZXJ0KGRpdkNsYXNzZXMucm9vdC5jbGFzc0xpc3QuY29udGFpbnMoJ2InKSk7XG5cdFx0XHRhc3NlcnQoZGl2Q2xhc3Nlcy5yb290LmNsYXNzTGlzdC5jb250YWlucygnYycpKTtcblxuXHRcdFx0Y29uc3QgZGl2QWxsID0gaCgnZGl2I215aWQuYS5iLmMnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXZBbGwucm9vdC50YWdOYW1lLCAnRElWJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGl2QWxsLnJvb3QuaWQsICdteWlkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGl2QWxsLnJvb3QuY2xhc3NMaXN0Lmxlbmd0aCwgMyk7XG5cdFx0XHRhc3NlcnQoZGl2QWxsLnJvb3QuY2xhc3NMaXN0LmNvbnRhaW5zKCdhJykpO1xuXHRcdFx0YXNzZXJ0KGRpdkFsbC5yb290LmNsYXNzTGlzdC5jb250YWlucygnYicpKTtcblx0XHRcdGFzc2VydChkaXZBbGwucm9vdC5jbGFzc0xpc3QuY29udGFpbnMoJ2MnKSk7XG5cblx0XHRcdGNvbnN0IHNwYW5JZCA9IGgoJ3NwYW4jbXlpZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNwYW5JZC5yb290LnRhZ05hbWUsICdTUEFOJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3BhbklkLnJvb3QuaWQsICdteWlkJyk7XG5cblx0XHRcdGNvbnN0IHNwYW5DbGFzcyA9IGgoJ3NwYW4uYScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNwYW5DbGFzcy5yb290LnRhZ05hbWUsICdTUEFOJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3BhbkNsYXNzLnJvb3QuY2xhc3NMaXN0Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQoc3BhbkNsYXNzLnJvb3QuY2xhc3NMaXN0LmNvbnRhaW5zKCdhJykpO1xuXG5cdFx0XHRjb25zdCBzcGFuQ2xhc3NlcyA9IGgoJ3NwYW4uYS5iLmMnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzcGFuQ2xhc3Nlcy5yb290LnRhZ05hbWUsICdTUEFOJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3BhbkNsYXNzZXMucm9vdC5jbGFzc0xpc3QubGVuZ3RoLCAzKTtcblx0XHRcdGFzc2VydChzcGFuQ2xhc3Nlcy5yb290LmNsYXNzTGlzdC5jb250YWlucygnYScpKTtcblx0XHRcdGFzc2VydChzcGFuQ2xhc3Nlcy5yb290LmNsYXNzTGlzdC5jb250YWlucygnYicpKTtcblx0XHRcdGFzc2VydChzcGFuQ2xhc3Nlcy5yb290LmNsYXNzTGlzdC5jb250YWlucygnYycpKTtcblxuXHRcdFx0Y29uc3Qgc3BhbkFsbCA9IGgoJ3NwYW4jbXlpZC5hLmIuYycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNwYW5BbGwucm9vdC50YWdOYW1lLCAnU1BBTicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNwYW5BbGwucm9vdC5pZCwgJ215aWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzcGFuQWxsLnJvb3QuY2xhc3NMaXN0Lmxlbmd0aCwgMyk7XG5cdFx0XHRhc3NlcnQoc3BhbkFsbC5yb290LmNsYXNzTGlzdC5jb250YWlucygnYScpKTtcblx0XHRcdGFzc2VydChzcGFuQWxsLnJvb3QuY2xhc3NMaXN0LmNvbnRhaW5zKCdiJykpO1xuXHRcdFx0YXNzZXJ0KHNwYW5BbGwucm9vdC5jbGFzc0xpc3QuY29udGFpbnMoJ2MnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaW1wbGljaXRseSBoYW5kbGUgaWRzIGFuZCBjbGFzc2VzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGl2SWQgPSBoKCcjbXlpZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpdklkLnJvb3QudGFnTmFtZSwgJ0RJVicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpdklkLnJvb3QuaWQsICdteWlkJyk7XG5cblx0XHRcdGNvbnN0IGRpdkNsYXNzID0gaCgnLmEnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXZDbGFzcy5yb290LnRhZ05hbWUsICdESVYnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXZDbGFzcy5yb290LmNsYXNzTGlzdC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0KGRpdkNsYXNzLnJvb3QuY2xhc3NMaXN0LmNvbnRhaW5zKCdhJykpO1xuXG5cdFx0XHRjb25zdCBkaXZDbGFzc2VzID0gaCgnLmEuYi5jJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGl2Q2xhc3Nlcy5yb290LnRhZ05hbWUsICdESVYnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXZDbGFzc2VzLnJvb3QuY2xhc3NMaXN0Lmxlbmd0aCwgMyk7XG5cdFx0XHRhc3NlcnQoZGl2Q2xhc3Nlcy5yb290LmNsYXNzTGlzdC5jb250YWlucygnYScpKTtcblx0XHRcdGFzc2VydChkaXZDbGFzc2VzLnJvb3QuY2xhc3NMaXN0LmNvbnRhaW5zKCdiJykpO1xuXHRcdFx0YXNzZXJ0KGRpdkNsYXNzZXMucm9vdC5jbGFzc0xpc3QuY29udGFpbnMoJ2MnKSk7XG5cblx0XHRcdGNvbnN0IGRpdkFsbCA9IGgoJyNteWlkLmEuYi5jJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGl2QWxsLnJvb3QudGFnTmFtZSwgJ0RJVicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpdkFsbC5yb290LmlkLCAnbXlpZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpdkFsbC5yb290LmNsYXNzTGlzdC5sZW5ndGgsIDMpO1xuXHRcdFx0YXNzZXJ0KGRpdkFsbC5yb290LmNsYXNzTGlzdC5jb250YWlucygnYScpKTtcblx0XHRcdGFzc2VydChkaXZBbGwucm9vdC5jbGFzc0xpc3QuY29udGFpbnMoJ2InKSk7XG5cdFx0XHRhc3NlcnQoZGl2QWxsLnJvb3QuY2xhc3NMaXN0LmNvbnRhaW5zKCdjJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBAIGlkZW50aWZpZXJzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW1wbGljaXQgPSBoKCdAZWwnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbXBsaWNpdC5yb290LCBpbXBsaWNpdC5lbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW1wbGljaXQuZWwudGFnTmFtZSwgJ0RJVicpO1xuXG5cdFx0XHRjb25zdCBleHBsaWNpdCA9IGgoJ2RpdkBlbCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4cGxpY2l0LnJvb3QsIGV4cGxpY2l0LmVsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHBsaWNpdC5lbC50YWdOYW1lLCAnRElWJyk7XG5cblx0XHRcdGNvbnN0IGltcGxpY2l0SWQgPSBoKCcjbXlpZEBlbCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGltcGxpY2l0SWQucm9vdCwgaW1wbGljaXRJZC5lbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW1wbGljaXRJZC5lbC50YWdOYW1lLCAnRElWJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW1wbGljaXRJZC5yb290LmlkLCAnbXlpZCcpO1xuXG5cdFx0XHRjb25zdCBleHBsaWNpdElkID0gaCgnZGl2I215aWRAZWwnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHBsaWNpdElkLnJvb3QsIGV4cGxpY2l0SWQuZWwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4cGxpY2l0SWQuZWwudGFnTmFtZSwgJ0RJVicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4cGxpY2l0SWQucm9vdC5pZCwgJ215aWQnKTtcblxuXHRcdFx0Y29uc3QgaW1wbGljaXRDbGFzcyA9IGgoJy5hQGVsJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW1wbGljaXRDbGFzcy5yb290LCBpbXBsaWNpdENsYXNzLmVsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbXBsaWNpdENsYXNzLmVsLnRhZ05hbWUsICdESVYnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbXBsaWNpdENsYXNzLnJvb3QuY2xhc3NMaXN0Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQoaW1wbGljaXRDbGFzcy5yb290LmNsYXNzTGlzdC5jb250YWlucygnYScpKTtcblxuXHRcdFx0Y29uc3QgZXhwbGljaXRDbGFzcyA9IGgoJ2Rpdi5hQGVsJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhwbGljaXRDbGFzcy5yb290LCBleHBsaWNpdENsYXNzLmVsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHBsaWNpdENsYXNzLmVsLnRhZ05hbWUsICdESVYnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHBsaWNpdENsYXNzLnJvb3QuY2xhc3NMaXN0Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQoZXhwbGljaXRDbGFzcy5yb290LmNsYXNzTGlzdC5jb250YWlucygnYScpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHJlY3Vyc2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gaCgnZGl2LmNvZGUtdmlldycsIFtcblx0XHRcdGgoJ2Rpdi50aXRsZUB0aXRsZScpLFxuXHRcdFx0aCgnZGl2LmNvbnRhaW5lcicsIFtcblx0XHRcdFx0aCgnZGl2Lmd1dHRlckBndXR0ZXJEaXYnKSxcblx0XHRcdFx0aCgnc3BhbkBlZGl0b3InKSxcblx0XHRcdF0pLFxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5yb290LnRhZ05hbWUsICdESVYnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnJvb3QuY2xhc3NOYW1lLCAnY29kZS12aWV3Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5yb290LmNoaWxkRWxlbWVudENvdW50LCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnJvb3QuZmlyc3RFbGVtZW50Q2hpbGQsIHJlc3VsdC50aXRsZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC50aXRsZS50YWdOYW1lLCAnRElWJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC50aXRsZS5jbGFzc05hbWUsICd0aXRsZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudGl0bGUuY2hpbGRFbGVtZW50Q291bnQsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZ3V0dGVyRGl2LnRhZ05hbWUsICdESVYnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmd1dHRlckRpdi5jbGFzc05hbWUsICdndXR0ZXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmd1dHRlckRpdi5jaGlsZEVsZW1lbnRDb3VudCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0b3IudGFnTmFtZSwgJ1NQQU4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVkaXRvci5jbGFzc05hbWUsICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVkaXRvci5jaGlsZEVsZW1lbnRDb3VudCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Nzc1ZhbHVlV2l0aERlZmF1bHQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFzQ3NzVmFsdWVXaXRoRGVmYXVsdCgncmVkJywgJ2JsdWUnKSwgJ3JlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhc0Nzc1ZhbHVlV2l0aERlZmF1bHQodW5kZWZpbmVkLCAnYmx1ZScpLCAnYmx1ZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhc0Nzc1ZhbHVlV2l0aERlZmF1bHQoJ3ZhcigtLW15LXZhciknLCAnYmx1ZScpLCAndmFyKC0tbXktdmFyLCBibHVlKScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhc0Nzc1ZhbHVlV2l0aERlZmF1bHQoJ3ZhcigtLW15LXZhciwgcmVkKScsICdibHVlJyksICd2YXIoLS1teS12YXIsIHJlZCknKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXNDc3NWYWx1ZVdpdGhEZWZhdWx0KCd2YXIoLS1teS12YXIsIHZhcigtLW15LXZhcjIpKScsICdibHVlJyksICd2YXIoLS1teS12YXIsIHZhcigtLW15LXZhcjIsIGJsdWUpKScpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb3B5QXR0cmlidXRlcycsICgpID0+IHtcblx0XHRjb25zdCBlbGVtZW50U291cmNlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0ZWxlbWVudFNvdXJjZS5zZXRBdHRyaWJ1dGUoJ2ZvbycsICdiYXInKTtcblx0XHRlbGVtZW50U291cmNlLnNldEF0dHJpYnV0ZSgnYmFyJywgJ2ZvbycpO1xuXG5cdFx0Y29uc3QgZWxlbWVudFRhcmdldCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGNvcHlBdHRyaWJ1dGVzKGVsZW1lbnRTb3VyY2UsIGVsZW1lbnRUYXJnZXQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVsZW1lbnRUYXJnZXQuZ2V0QXR0cmlidXRlKCdmb28nKSwgJ2JhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbGVtZW50VGFyZ2V0LmdldEF0dHJpYnV0ZSgnYmFyJyksICdmb28nKTtcblx0fSk7XG5cblx0dGVzdCgndHJhY2tBdHRyaWJ1dGVzICh1bmZpbHRlcmVkKScsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBlbGVtZW50U291cmNlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRjb25zdCBlbGVtZW50VGFyZ2V0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cblx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSB0cmFja0F0dHJpYnV0ZXMoZWxlbWVudFNvdXJjZSwgZWxlbWVudFRhcmdldCk7XG5cblx0XHRcdGVsZW1lbnRTb3VyY2Uuc2V0QXR0cmlidXRlKCdmb28nLCAnYmFyJyk7XG5cdFx0XHRlbGVtZW50U291cmNlLnNldEF0dHJpYnV0ZSgnYmFyJywgJ2ZvbycpO1xuXG5cdFx0XHRhd2FpdCB0aW1lb3V0KDEpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWxlbWVudFRhcmdldC5nZXRBdHRyaWJ1dGUoJ2ZvbycpLCAnYmFyJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWxlbWVudFRhcmdldC5nZXRBdHRyaWJ1dGUoJ2JhcicpLCAnZm9vJyk7XG5cblx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0cmFja0F0dHJpYnV0ZXMgKGZpbHRlcmVkKScsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBlbGVtZW50U291cmNlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRjb25zdCBlbGVtZW50VGFyZ2V0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cblx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSB0cmFja0F0dHJpYnV0ZXMoZWxlbWVudFNvdXJjZSwgZWxlbWVudFRhcmdldCwgWydmb28nXSk7XG5cblx0XHRcdGVsZW1lbnRTb3VyY2Uuc2V0QXR0cmlidXRlKCdmb28nLCAnYmFyJyk7XG5cdFx0XHRlbGVtZW50U291cmNlLnNldEF0dHJpYnV0ZSgnYmFyJywgJ2ZvbycpO1xuXG5cdFx0XHRhd2FpdCB0aW1lb3V0KDEpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWxlbWVudFRhcmdldC5nZXRBdHRyaWJ1dGUoJ2ZvbycpLCAnYmFyJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWxlbWVudFRhcmdldC5nZXRBdHRyaWJ1dGUoJ2JhcicpLCBudWxsKTtcblxuXHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dpbmRvdyB1dGlsaXRpZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgd2luZG93cyA9IEFycmF5LmZyb20oZ2V0V2luZG93cygpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2luZG93cy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRXaW5kb3dzQ291bnQoKSwgMSk7XG5cdFx0Y29uc3Qgd2luZG93SWQgPSBnZXRXaW5kb3dJZChtYWluV2luZG93KTtcblx0XHRhc3NlcnQub2sodHlwZW9mIHdpbmRvd0lkID09PSAnbnVtYmVyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFdpbmRvd0J5SWQod2luZG93SWQpPy53aW5kb3csIG1haW5XaW5kb3cpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRXaW5kb3dCeUlkKHVuZGVmaW5lZCwgdHJ1ZSkud2luZG93LCBtYWluV2luZG93KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFzV2luZG93KHdpbmRvd0lkKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQXV4aWxpYXJ5V2luZG93KG1haW5XaW5kb3cpLCBmYWxzZSk7XG5cdFx0ZW5zdXJlQ29kZVdpbmRvdyhtYWluV2luZG93LCAxKTtcblx0XHRhc3NlcnQub2sodHlwZW9mIG1haW5XaW5kb3cudnNjb2RlV2luZG93SWQgPT09ICdudW1iZXInKTtcblxuXHRcdGNvbnN0IGRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRXaW5kb3coZGl2KSwgbWFpbldpbmRvdyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldERvY3VtZW50KGRpdiksIG1haW5XaW5kb3cuZG9jdW1lbnQpO1xuXG5cdFx0Y29uc3QgZXZlbnQgPSBkb2N1bWVudC5jcmVhdGVFdmVudCgnTW91c2VFdmVudCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRXaW5kb3coZXZlbnQpLCBtYWluV2luZG93KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0RG9jdW1lbnQoZXZlbnQpLCBtYWluV2luZG93LmRvY3VtZW50KTtcblx0fSk7XG5cblx0c3VpdGUoJ2Rpc3Bvc2FibGVXaW5kb3dJbnRlcnZhbCcsICgpID0+IHtcblx0XHR0ZXN0KCdiYXNpY3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRsZXQgY291bnQgPSAwO1xuXHRcdFx0Y29uc3QgcHJvbWlzZSA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRcdGNvbnN0IGludGVydmFsID0gZGlzcG9zYWJsZVdpbmRvd0ludGVydmFsKG1haW5XaW5kb3csICgpID0+IHtcblx0XHRcdFx0Y291bnQrKztcblx0XHRcdFx0aWYgKGNvdW50ID09PSAzKSB7XG5cdFx0XHRcdFx0cHJvbWlzZS5jb21wbGV0ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgMCwgMTApO1xuXG5cdFx0XHRhd2FpdCBwcm9taXNlLnA7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnQsIDMpO1xuXHRcdFx0aW50ZXJ2YWwuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaXRlcmF0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRcdGxldCBjb3VudCA9IDA7XG5cdFx0XHRjb25zdCBpbnRlcnZhbCA9IGRpc3Bvc2FibGVXaW5kb3dJbnRlcnZhbChtYWluV2luZG93LCAoKSA9PiB7XG5cdFx0XHRcdGNvdW50Kys7XG5cblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fSwgMCwgMCk7XG5cblx0XHRcdGF3YWl0IHRpbWVvdXQoNSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnQsIDApO1xuXHRcdFx0aW50ZXJ2YWwuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGlzcG9zZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGxldCBjb3VudCA9IDA7XG5cdFx0XHRjb25zdCBpbnRlcnZhbCA9IGRpc3Bvc2FibGVXaW5kb3dJbnRlcnZhbChtYWluV2luZG93LCAoKSA9PiB7XG5cdFx0XHRcdGNvdW50Kys7XG5cblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fSwgMCwgMTApO1xuXG5cdFx0XHRpbnRlcnZhbC5kaXNwb3NlKCk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50LCAwKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ1NhZmVUcmlhbmdsZScsICgpID0+IHtcblx0XHRjb25zdCBmYWtlRWxlbWVudCA9IChsZWZ0OiBudW1iZXIsIHJpZ2h0OiBudW1iZXIsIHRvcDogbnVtYmVyLCBib3R0b206IG51bWJlcik6IEhUTUxFbGVtZW50ID0+IHtcblx0XHRcdHJldHVybiB7IGdldEJvdW5kaW5nQ2xpZW50UmVjdDogKCkgPT4gKHsgbGVmdCwgcmlnaHQsIHRvcCwgYm90dG9tIH0pIH0gYXMgSFRNTEVsZW1lbnQ7XG5cdFx0fTtcblxuXHRcdHRlc3QoJ3dvcmtzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2FmZVRyaWFuZ2xlID0gbmV3IFNhZmVUcmlhbmdsZSgwLCAwLCBmYWtlRWxlbWVudCgxMCwgMjAsIDEwLCAyMCkpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2FmZVRyaWFuZ2xlLmNvbnRhaW5zKDUsIDUpLCB0cnVlKTsgLy8gaW4gdHJpYW5nbGUgcmVnaW9uXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2FmZVRyaWFuZ2xlLmNvbnRhaW5zKDE1LCA1KSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNhZmVUcmlhbmdsZS5jb250YWlucygyNSwgNSksIGZhbHNlKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNhZmVUcmlhbmdsZS5jb250YWlucyg1LCAxNSksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzYWZlVHJpYW5nbGUuY29udGFpbnMoMTUsIDE1KSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2FmZVRyaWFuZ2xlLmNvbnRhaW5zKDI1LCAxNSksIGZhbHNlKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNhZmVUcmlhbmdsZS5jb250YWlucyg1LCAyNSksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzYWZlVHJpYW5nbGUuY29udGFpbnMoMTUsIDI1KSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNhZmVUcmlhbmdsZS5jb250YWlucygyNSwgMjUpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvdGhlciBkaXJhdGlvbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBhID0gbmV3IFNhZmVUcmlhbmdsZSgzMCwgMzAsIGZha2VFbGVtZW50KDEwLCAyMCwgMTAsIDIwKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYS5jb250YWlucygyNSwgMjUpLCB0cnVlKTtcblxuXHRcdFx0Y29uc3QgYiA9IG5ldyBTYWZlVHJpYW5nbGUoMCwgMzAsIGZha2VFbGVtZW50KDEwLCAyMCwgMTAsIDIwKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYi5jb250YWlucyg1LCAyNSksIHRydWUpO1xuXG5cdFx0XHRjb25zdCBjID0gbmV3IFNhZmVUcmlhbmdsZSgzMCwgMCwgZmFrZUVsZW1lbnQoMTAsIDIwLCAxMCwgMjApKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjLmNvbnRhaW5zKDI1LCA1KSwgdHJ1ZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdBbmltYXRpb25GcmFtZVNjaGVkdWxlcicsICgpID0+IHtcblx0XHQvLyBIZWxwZXIgdG8gd2FpdCBmb3IgYW4gYW5pbWF0aW9uIGZyYW1lXG5cdFx0Y29uc3Qgd2FpdEZvckFuaW1hdGlvbkZyYW1lID0gKCkgPT4gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiBtYWluV2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiByZXNvbHZlKCkpKTtcblxuXHRcdHRlc3QoJ3NjaGVkdWxlcyBhbmQgcnVucyB0aGUgY2FsbGJhY2snLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBub2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRsZXQgY2FsbENvdW50ID0gMDtcblx0XHRcdGNvbnN0IHNjaGVkdWxlciA9IG5ldyBBbmltYXRpb25GcmFtZVNjaGVkdWxlcihub2RlLCAoKSA9PiB7XG5cdFx0XHRcdGNhbGxDb3VudCsrO1xuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY2hlZHVsZXIuaXNTY2hlZHVsZWQoKSwgZmFsc2UpO1xuXHRcdFx0c2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NoZWR1bGVyLmlzU2NoZWR1bGVkKCksIHRydWUpO1xuXG5cdFx0XHQvLyBXYWl0IGZvciB0aGUgYW5pbWF0aW9uIGZyYW1lXG5cdFx0XHRhd2FpdCB3YWl0Rm9yQW5pbWF0aW9uRnJhbWUoKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxDb3VudCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NoZWR1bGVyLmlzU2NoZWR1bGVkKCksIGZhbHNlKTtcblx0XHRcdHNjaGVkdWxlci5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb2FsZXNjZXMgbXVsdGlwbGUgc2NoZWR1bGUgY2FsbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBub2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRsZXQgY2FsbENvdW50ID0gMDtcblx0XHRcdGNvbnN0IHNjaGVkdWxlciA9IG5ldyBBbmltYXRpb25GcmFtZVNjaGVkdWxlcihub2RlLCAoKSA9PiB7XG5cdFx0XHRcdGNhbGxDb3VudCsrO1xuXHRcdFx0fSk7XG5cblx0XHRcdHNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdFx0c2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0XHRzY2hlZHVsZXIuc2NoZWR1bGUoKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjaGVkdWxlci5pc1NjaGVkdWxlZCgpLCB0cnVlKTtcblxuXHRcdFx0Ly8gV2FpdCBmb3IgdGhlIGFuaW1hdGlvbiBmcmFtZVxuXHRcdFx0YXdhaXQgd2FpdEZvckFuaW1hdGlvbkZyYW1lKCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWxsQ291bnQsIDEpO1xuXHRcdFx0c2NoZWR1bGVyLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NhbmNlbCBwcmV2ZW50cyBleGVjdXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBub2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRsZXQgY2FsbENvdW50ID0gMDtcblx0XHRcdGNvbnN0IHNjaGVkdWxlciA9IG5ldyBBbmltYXRpb25GcmFtZVNjaGVkdWxlcihub2RlLCAoKSA9PiB7XG5cdFx0XHRcdGNhbGxDb3VudCsrO1xuXHRcdFx0fSk7XG5cblx0XHRcdHNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjaGVkdWxlci5pc1NjaGVkdWxlZCgpLCB0cnVlKTtcblx0XHRcdHNjaGVkdWxlci5jYW5jZWwoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY2hlZHVsZXIuaXNTY2hlZHVsZWQoKSwgZmFsc2UpO1xuXG5cdFx0XHQvLyBXYWl0IGZvciB0aGUgYW5pbWF0aW9uIGZyYW1lXG5cdFx0XHRhd2FpdCB3YWl0Rm9yQW5pbWF0aW9uRnJhbWUoKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxDb3VudCwgMCk7XG5cdFx0XHRzY2hlZHVsZXIuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGlzcG9zZSBwcmV2ZW50cyBleGVjdXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBub2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRsZXQgY2FsbENvdW50ID0gMDtcblx0XHRcdGNvbnN0IHNjaGVkdWxlciA9IG5ldyBBbmltYXRpb25GcmFtZVNjaGVkdWxlcihub2RlLCAoKSA9PiB7XG5cdFx0XHRcdGNhbGxDb3VudCsrO1xuXHRcdFx0fSk7XG5cblx0XHRcdHNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdFx0c2NoZWR1bGVyLmRpc3Bvc2UoKTtcblxuXHRcdFx0Ly8gV2FpdCBmb3IgdGhlIGFuaW1hdGlvbiBmcmFtZVxuXHRcdFx0YXdhaXQgd2FpdEZvckFuaW1hdGlvbkZyYW1lKCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWxsQ291bnQsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2FuIHNjaGVkdWxlIGFnYWluIGFmdGVyIGV4ZWN1dGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdGxldCBjYWxsQ291bnQgPSAwO1xuXHRcdFx0Y29uc3Qgc2NoZWR1bGVyID0gbmV3IEFuaW1hdGlvbkZyYW1lU2NoZWR1bGVyKG5vZGUsICgpID0+IHtcblx0XHRcdFx0Y2FsbENvdW50Kys7XG5cdFx0XHR9KTtcblxuXHRcdFx0c2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0XHRhd2FpdCB3YWl0Rm9yQW5pbWF0aW9uRnJhbWUoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWxsQ291bnQsIDEpO1xuXG5cdFx0XHRzY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHRcdGF3YWl0IHdhaXRGb3JBbmltYXRpb25GcmFtZSgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxDb3VudCwgMik7XG5cblx0XHRcdHNjaGVkdWxlci5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdEaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXInLCAoKSA9PiB7XG5cdFx0dGVhcmRvd24oKCkgPT4gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiBtYWluV2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiByZXNvbHZlKCkpKSk7XG5cblx0XHQvLyBDYXB0dXJlcyB0aGUgY2FsbGJhY2sgaGFuZGVkIHRvIGEgYFJlc2l6ZU9ic2VydmVyYCBzbyB0ZXN0cyBjYW4gZmlyZVxuXHRcdC8vIGRlbGl2ZXJpZXMgc3ludGhldGljYWxseS4gUmV0dXJuZWQgdmlhIGRlcGVuZGVuY3kgaW5qZWN0aW9uIFx1MjAxNCBub1xuXHRcdC8vIGdsb2JhbCBtdXRhdGlvbiwgbm8gYGFueWAgY2FzdHMuXG5cdFx0aW50ZXJmYWNlIEZha2VSZXNpemVPYnNlcnZlckhhbmRsZSB7XG5cdFx0XHRjdG9yOiB0eXBlb2YgUmVzaXplT2JzZXJ2ZXI7XG5cdFx0XHRmaXJlOiAoZW50cmllczogUmVzaXplT2JzZXJ2ZXJFbnRyeVtdKSA9PiB2b2lkO1xuXHRcdFx0ZGlzY29ubmVjdHM6IG51bWJlcjtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBjcmVhdGVGYWtlUmVzaXplT2JzZXJ2ZXJDdG9yKCk6IEZha2VSZXNpemVPYnNlcnZlckhhbmRsZSB7XG5cdFx0XHRjb25zdCBoYW5kbGU6IEZha2VSZXNpemVPYnNlcnZlckhhbmRsZSA9IHtcblx0XHRcdFx0Y3RvcjogdW5kZWZpbmVkISxcblx0XHRcdFx0ZmlyZTogKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ29ic2VydmVyIG5vdCBjb25zdHJ1Y3RlZCcpOyB9LFxuXHRcdFx0XHRkaXNjb25uZWN0czogMCxcblx0XHRcdH07XG5cdFx0XHRjbGFzcyBGYWtlUmVzaXplT2JzZXJ2ZXIgaW1wbGVtZW50cyBSZXNpemVPYnNlcnZlciB7XG5cdFx0XHRcdGNvbnN0cnVjdG9yKGNhbGxiYWNrOiBSZXNpemVPYnNlcnZlckNhbGxiYWNrKSB7XG5cdFx0XHRcdFx0aGFuZGxlLmZpcmUgPSBlbnRyaWVzID0+IGNhbGxiYWNrKGVudHJpZXMsIHRoaXMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG9ic2VydmUoX3RhcmdldDogRWxlbWVudCwgX29wdGlvbnM/OiBSZXNpemVPYnNlcnZlck9wdGlvbnMpOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxuXHRcdFx0XHR1bm9ic2VydmUoX3RhcmdldDogRWxlbWVudCk6IHZvaWQgeyAvKiBuby1vcCAqLyB9XG5cdFx0XHRcdGRpc2Nvbm5lY3QoKTogdm9pZCB7IGhhbmRsZS5kaXNjb25uZWN0cysrOyB9XG5cdFx0XHR9XG5cdFx0XHRoYW5kbGUuY3RvciA9IEZha2VSZXNpemVPYnNlcnZlcjtcblx0XHRcdHJldHVybiBoYW5kbGU7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gZmFrZUVudHJ5KHRhcmdldDogRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpKTogUmVzaXplT2JzZXJ2ZXJFbnRyeSB7XG5cdFx0XHRjb25zdCBzaXplOiBSZXNpemVPYnNlcnZlclNpemUgPSB7IGJsb2NrU2l6ZTogMCwgaW5saW5lU2l6ZTogMCB9O1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dGFyZ2V0LFxuXHRcdFx0XHRjb250ZW50UmVjdDogdGFyZ2V0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLFxuXHRcdFx0XHRib3JkZXJCb3hTaXplOiBbc2l6ZV0sXG5cdFx0XHRcdGNvbnRlbnRCb3hTaXplOiBbc2l6ZV0sXG5cdFx0XHRcdGRldmljZVBpeGVsQ29udGVudEJveFNpemU6IFtzaXplXSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0dGVzdCgnY2FsbGJhY2sgcnVucyBzeW5jaHJvbm91c2x5IHdpdGggdGhlIGVudHJpZXMgdGhlIGJyb3dzZXIgZGVsaXZlcmVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmFrZSA9IGNyZWF0ZUZha2VSZXNpemVPYnNlcnZlckN0b3IoKTtcblx0XHRcdGxldCBjYWxscyA9IDA7XG5cdFx0XHRsZXQgcmVjZWl2ZWQ6IFJlc2l6ZU9ic2VydmVyRW50cnlbXSB8IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IG9ic2VydmVyID0gbmV3IERpc3Bvc2FibGVSZXNpemVPYnNlcnZlcigndGVzdC5zeW5jJywgKGVudHJpZXMpID0+IHtcblx0XHRcdFx0Y2FsbHMrKztcblx0XHRcdFx0cmVjZWl2ZWQgPSBlbnRyaWVzO1xuXHRcdFx0fSwgbWFpbldpbmRvdywgeyByZXNpemVPYnNlcnZlckN0b3I6IGZha2UuY3RvciB9KTtcblx0XHRcdGNvbnN0IGEgPSBmYWtlRW50cnkoKTtcblx0XHRcdGNvbnN0IGIgPSBmYWtlRW50cnkoKTtcblx0XHRcdGZha2UuZmlyZShbYSwgYl0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxzLCAxLCAnY2FsbGJhY2sgcnVucyBzeW5jaHJvbm91c2x5IGluc2lkZSB0aGUgcmVzaXplLW9ic2VydmF0aW9uIHBoYXNlJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlY2VpdmVkLCBbYSwgYl0sICdlbnRyaWVzIGFyZSBmb3J3YXJkZWQgYXMtaXMnKTtcblx0XHRcdG9ic2VydmVyLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2VhY2ggbmF0aXZlIGRlbGl2ZXJ5IGludm9rZXMgdGhlIGNhbGxiYWNrIG9uY2UgKG5vIGJhdGNoaW5nKScsICgpID0+IHtcblx0XHRcdGNvbnN0IGZha2UgPSBjcmVhdGVGYWtlUmVzaXplT2JzZXJ2ZXJDdG9yKCk7XG5cdFx0XHRsZXQgY2FsbHMgPSAwO1xuXHRcdFx0Y29uc3Qgb2JzZXJ2ZXIgPSBuZXcgRGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyKCd0ZXN0Lm5vQmF0Y2gnLCAoKSA9PiB7IGNhbGxzKys7IH0sIG1haW5XaW5kb3csIHsgcmVzaXplT2JzZXJ2ZXJDdG9yOiBmYWtlLmN0b3IgfSk7XG5cdFx0XHRmYWtlLmZpcmUoW2Zha2VFbnRyeSgpXSk7XG5cdFx0XHRmYWtlLmZpcmUoW2Zha2VFbnRyeSgpXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbHMsIDIsICd3cmFwcGVyIGRvZXMgbm90IGNvYWxlc2NlIGRlbGl2ZXJpZXMnKTtcblx0XHRcdG9ic2VydmVyLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Rpc3Bvc2UgZGlzY29ubmVjdHMgdGhlIHVuZGVybHlpbmcgb2JzZXJ2ZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBmYWtlID0gY3JlYXRlRmFrZVJlc2l6ZU9ic2VydmVyQ3RvcigpO1xuXHRcdFx0Y29uc3Qgb2JzZXJ2ZXIgPSBuZXcgRGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyKCd0ZXN0LmRpc3Bvc2UnLCAoKSA9PiB7IC8qIG5vb3AgKi8gfSwgbWFpbldpbmRvdywgeyByZXNpemVPYnNlcnZlckN0b3I6IGZha2UuY3RvciB9KTtcblx0XHRcdG9ic2VydmVyLmRpc3Bvc2UoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmYWtlLmRpc2Nvbm5lY3RzLCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4Y2VwdGlvbnMgaW4gdGhlIHVzZXIgY2FsbGJhY2sgZG8gbm90IHByb3BhZ2F0ZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGZha2UgPSBjcmVhdGVGYWtlUmVzaXplT2JzZXJ2ZXJDdG9yKCk7XG5cdFx0XHRjb25zdCBvYnNlcnZlciA9IG5ldyBEaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXIoJ3Rlc3QudGhyb3cnLCAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignYm9vbScpOyB9LCBtYWluV2luZG93LCB7IHJlc2l6ZU9ic2VydmVyQ3RvcjogZmFrZS5jdG9yIH0pO1xuXHRcdFx0Ly8gQnJvd3NlciB3b3VsZCBub3QgY2F0Y2ggYSB0aHJvdyBvdXQgb2YgdGhlIG5hdGl2ZSBjYWxsYmFjazsgd2Vcblx0XHRcdC8vIG11c3QgZ3VhcmQgc28gYSBzaW5nbGUgYmFkIGNvbnN1bWVyIGRvZXMgbm90IGJyZWFrIGRlbGl2ZXJ5IGZvclxuXHRcdFx0Ly8gZXZlcnkgb3RoZXIgb2JzZXJ2ZXIgaW4gdGhlIHJlYWxtLiBUaGUgd3JhcHBlciByb3V0ZXMgdGhlIHRocm93XG5cdFx0XHQvLyB0byBvblVuZXhwZWN0ZWRFcnJvciwgc28gc3dhcCB0aGUgaGFuZGxlciBmb3IgdGhlIGR1cmF0aW9uIG9mXG5cdFx0XHQvLyB0aGlzIHRlc3Qgc28gdGhlIHRlc3QgcnVubmVyIGRvZXMgbm90IGZsYWcgaXQgYXMgYSBmYWlsdXJlLlxuXHRcdFx0Y29uc3Qgb3JpZ2luYWxFcnJvckhhbmRsZXIgPSBlcnJvckhhbmRsZXIuZ2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcigpO1xuXHRcdFx0c2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcigoKSA9PiB7IC8qIHN3YWxsb3cgZXhwZWN0ZWQgKi8gfSk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhc3NlcnQuZG9lc05vdFRocm93KCgpID0+IGZha2UuZmlyZShbZmFrZUVudHJ5KCldKSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRzZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKG9yaWdpbmFsRXJyb3JIYW5kbGVyKTtcblx0XHRcdH1cblx0XHRcdG9ic2VydmVyLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4cG9zZXMgdGhlIGNvbmZpZ3VyZWQgbmFtZSBmb3IgbG9vcC13YXJuaW5nIGNvbnRleHQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBmYWtlID0gY3JlYXRlRmFrZVJlc2l6ZU9ic2VydmVyQ3RvcigpO1xuXHRcdFx0Y29uc3Qgb2JzZXJ2ZXIgPSBuZXcgRGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyKFxuXHRcdFx0XHQnbXktb2JzZXJ2ZXInLFxuXHRcdFx0XHQoKSA9PiB7IC8qIG5vb3AgKi8gfSxcblx0XHRcdFx0bWFpbldpbmRvdyxcblx0XHRcdFx0eyByZXNpemVPYnNlcnZlckN0b3I6IGZha2UuY3RvciB9LFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvYnNlcnZlci5uYW1lLCAnbXktb2JzZXJ2ZXInKTtcblx0XHRcdG9ic2VydmVyLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dldFJlY2VudERpc3Bvc2FibGVSZXNpemVPYnNlcnZlckNvbnRleHRGb3JMb29wRXJyb3IgcmV0dXJucyB1bmRlZmluZWQgZm9yIHVucmVsYXRlZCBtZXNzYWdlcycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRSZWNlbnREaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXJDb250ZXh0Rm9yTG9vcEVycm9yKHVuZGVmaW5lZCksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UmVjZW50RGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyQ29udGV4dEZvckxvb3BFcnJvcignVW5jYXVnaHQgVHlwZUVycm9yOiBmb28nKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dldFJlY2VudERpc3Bvc2FibGVSZXNpemVPYnNlcnZlckNvbnRleHRGb3JMb29wRXJyb3IgcmV0dXJucyBzb3J0ZWQgdW5pcXVlIHdyYXBwZWQgb2JzZXJ2ZXJzIGZyb20gdGhlIGN1cnJlbnQgZnJhbWUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBmYWtlID0gY3JlYXRlRmFrZVJlc2l6ZU9ic2VydmVyQ3RvcigpO1xuXHRcdFx0Y29uc3QgYSA9IG5ldyBEaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXIoJ2EnLCAoKSA9PiB7IC8qIG5vb3AgKi8gfSwgbWFpbldpbmRvdywgeyByZXNpemVPYnNlcnZlckN0b3I6IGZha2UuY3RvciB9KTtcblx0XHRcdGZha2UuZmlyZShbZmFrZUVudHJ5KCldKTtcblx0XHRcdGNvbnN0IGZha2VCID0gY3JlYXRlRmFrZVJlc2l6ZU9ic2VydmVyQ3RvcigpO1xuXHRcdFx0Y29uc3QgYiA9IG5ldyBEaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXIoJ2InLCAoKSA9PiB7IC8qIG5vb3AgKi8gfSwgbWFpbldpbmRvdywgeyByZXNpemVPYnNlcnZlckN0b3I6IGZha2VCLmN0b3IgfSk7XG5cdFx0XHRmYWtlQi5maXJlKFtmYWtlRW50cnkoKV0pO1xuXHRcdFx0ZmFrZS5maXJlKFtmYWtlRW50cnkoKV0pO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGdldFJlY2VudERpc3Bvc2FibGVSZXNpemVPYnNlcnZlckNvbnRleHRGb3JMb29wRXJyb3IoXG5cdFx0XHRcdCdSZXNpemVPYnNlcnZlciBsb29wIGNvbXBsZXRlZCB3aXRoIHVuZGVsaXZlcmVkIG5vdGlmaWNhdGlvbnMuJyxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGNvbnRleHQsXG5cdFx0XHRcdCdbUmVzaXplT2JzZXJ2ZXJMb29wQ29udGV4dChhLGIpXSBSZXNpemVPYnNlcnZlciBsb29wIGNvbXBsZXRlZCB3aXRoIHVuZGVsaXZlcmVkIG5vdGlmaWNhdGlvbnMuJyxcblx0XHRcdCk7XG5cdFx0XHRhLmRpc3Bvc2UoKTtcblx0XHRcdGIuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2V0UmVjZW50RGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyQ29udGV4dEZvckxvb3BFcnJvciBtYXJrcyBib3VuZGVkIHBhcnRpY2lwYW50IG92ZXJmbG93JywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgb2JzZXJ2ZXJzOiBEaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXJbXSA9IFtdO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDg7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRcdGNvbnN0IGZha2UgPSBjcmVhdGVGYWtlUmVzaXplT2JzZXJ2ZXJDdG9yKCk7XG5cdFx0XHRcdG9ic2VydmVycy5wdXNoKG5ldyBEaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXIoYG9ic2VydmVyLSR7aX1gLCAoKSA9PiB7IC8qIG5vb3AgKi8gfSwgbWFpbldpbmRvdywgeyByZXNpemVPYnNlcnZlckN0b3I6IGZha2UuY3RvciB9KSk7XG5cdFx0XHRcdGZha2UuZmlyZShbZmFrZUVudHJ5KCldKTtcblx0XHRcdH1cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0Z2V0UmVjZW50RGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyQ29udGV4dEZvckxvb3BFcnJvcignUmVzaXplT2JzZXJ2ZXIgbG9vcCBjb21wbGV0ZWQgd2l0aCB1bmRlbGl2ZXJlZCBub3RpZmljYXRpb25zLicpLFxuXHRcdFx0XHQnW1Jlc2l6ZU9ic2VydmVyTG9vcENvbnRleHQob2JzZXJ2ZXItMCxvYnNlcnZlci0xLG9ic2VydmVyLTIsb2JzZXJ2ZXItMyxvYnNlcnZlci00LG9ic2VydmVyLTUsb2JzZXJ2ZXItNixvYnNlcnZlci03LDxvdmVyZmxvdz4pXSBSZXNpemVPYnNlcnZlciBsb29wIGNvbXBsZXRlZCB3aXRoIHVuZGVsaXZlcmVkIG5vdGlmaWNhdGlvbnMuJyxcblx0XHRcdCk7XG5cdFx0XHRvYnNlcnZlcnMuZm9yRWFjaChvYnNlcnZlciA9PiBvYnNlcnZlci5kaXNwb3NlKCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2V0UmVjZW50RGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyQ29udGV4dEZvckxvb3BFcnJvciBpcyBzY29wZWQgdG8gdGhlIG9ic2VydmVyIHdpbmRvdycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGlmcmFtZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2lmcmFtZScpO1xuXHRcdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChpZnJhbWUpO1xuXHRcdFx0Y29uc3QgYXV4aWxpYXJ5V2luZG93ID0gaWZyYW1lLmNvbnRlbnRXaW5kb3chO1xuXHRcdFx0ZW5zdXJlQ29kZVdpbmRvdyhhdXhpbGlhcnlXaW5kb3csIDk5OSk7XG5cblx0XHRcdGNvbnN0IGZha2UgPSBjcmVhdGVGYWtlUmVzaXplT2JzZXJ2ZXJDdG9yKCk7XG5cdFx0XHRjb25zdCBvYnNlcnZlciA9IG5ldyBEaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXIoJ2F1eGlsaWFyeScsICgpID0+IHsgLyogbm9vcCAqLyB9LCBhdXhpbGlhcnlXaW5kb3csIHsgcmVzaXplT2JzZXJ2ZXJDdG9yOiBmYWtlLmN0b3IgfSk7XG5cdFx0XHRmYWtlLmZpcmUoW2Zha2VFbnRyeSgpXSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0Z2V0UmVjZW50RGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyQ29udGV4dEZvckxvb3BFcnJvcignUmVzaXplT2JzZXJ2ZXIgbG9vcCBjb21wbGV0ZWQgd2l0aCB1bmRlbGl2ZXJlZCBub3RpZmljYXRpb25zLicsIG1haW5XaW5kb3cpLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRnZXRSZWNlbnREaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXJDb250ZXh0Rm9yTG9vcEVycm9yKCdSZXNpemVPYnNlcnZlciBsb29wIGNvbXBsZXRlZCB3aXRoIHVuZGVsaXZlcmVkIG5vdGlmaWNhdGlvbnMuJywgYXV4aWxpYXJ5V2luZG93KSxcblx0XHRcdFx0J1tSZXNpemVPYnNlcnZlckxvb3BDb250ZXh0KGF1eGlsaWFyeSldIFJlc2l6ZU9ic2VydmVyIGxvb3AgY29tcGxldGVkIHdpdGggdW5kZWxpdmVyZWQgbm90aWZpY2F0aW9ucy4nLFxuXHRcdFx0KTtcblxuXHRcdFx0b2JzZXJ2ZXIuZGlzcG9zZSgpO1xuXHRcdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiBhdXhpbGlhcnlXaW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHJlc29sdmUoKSkpO1xuXHRcdFx0aWZyYW1lLnJlbW92ZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2V0UmVjZW50RGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyQ29udGV4dEZvckxvb3BFcnJvciBjbGVhcnMgYXQgdGhlIG5leHQgYW5pbWF0aW9uIGZyYW1lJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmFrZSA9IGNyZWF0ZUZha2VSZXNpemVPYnNlcnZlckN0b3IoKTtcblx0XHRcdGNvbnN0IG9ic2VydmVyID0gbmV3IERpc3Bvc2FibGVSZXNpemVPYnNlcnZlcignc2NvcGVkJywgKCkgPT4geyAvKiBub29wICovIH0sIG1haW5XaW5kb3csIHsgcmVzaXplT2JzZXJ2ZXJDdG9yOiBmYWtlLmN0b3IgfSk7XG5cdFx0XHRmYWtlLmZpcmUoW2Zha2VFbnRyeSgpXSk7XG5cdFx0XHQvLyBDb250ZXh0IGlzIHJlY29yZGVkIHN5bmNocm9ub3VzbHkgYW5kIHN1cnZpdmVzIG1pY3JvdGFza3MgKHNvIGl0IGlzXG5cdFx0XHQvLyBzdGlsbCBzZXQgd2hlbiBDaHJvbWl1bSBkaXNwYXRjaGVzIHRoZSBsb29wIHdhcm5pbmcgYXQgdGhlIGVuZFxuXHRcdFx0Ly8gb2YgdGhlIHJlc2l6ZS1vYnNlcnZhdGlvbiBwaGFzZSkuXG5cdFx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdGFzc2VydC5vayhnZXRSZWNlbnREaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXJDb250ZXh0Rm9yTG9vcEVycm9yKCdSZXNpemVPYnNlcnZlciBsb29wIGNvbXBsZXRlZCB3aXRoIHVuZGVsaXZlcmVkIG5vdGlmaWNhdGlvbnMuJykpO1xuXHRcdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiBtYWluV2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiByZXNvbHZlKCkpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0Z2V0UmVjZW50RGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyQ29udGV4dEZvckxvb3BFcnJvcignUmVzaXplT2JzZXJ2ZXIgbG9vcCBjb21wbGV0ZWQgd2l0aCB1bmRlbGl2ZXJlZCBub3RpZmljYXRpb25zLicpLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdCdjb250ZXh0IG11c3QgYmUgY2xlYXJlZCBhdCB0aGUgbmV4dCBmcmFtZSBzbyBhIGxhdGVyIHJlbmRlcmluZyB1cGRhdGUgZG9lcyBub3QgaW5oZXJpdCBzdGFsZSBvYnNlcnZlcnMnLFxuXHRcdFx0KTtcblx0XHRcdG9ic2VydmVyLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLEdBQUcsR0FBRyxpQkFBaUIsZ0JBQWdCLDBCQUEwQixZQUFZLGlCQUFpQixhQUFhLGVBQWUsV0FBVyxXQUFXLGFBQWEsZUFBZSxjQUFjLHlCQUF5QiwwQkFBMEIsc0RBQXNELHFCQUFxQiwwQkFBMEI7QUFDM1YsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxrQkFBa0IsbUJBQW1CLGtCQUFrQjtBQUNoRSxTQUFTLGlCQUFpQixlQUFlO0FBQ3pDLFNBQVMsY0FBYyxpQ0FBaUM7QUFDeEQsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywrQ0FBK0M7QUFFeEQsTUFBTSxPQUFPLE1BQU07QUFDbEIsT0FBSyxZQUFZLE1BQU07QUFFdEIsVUFBTSxVQUFVLFNBQVMsY0FBYyxLQUFLO0FBQzVDLFlBQVEsWUFBWTtBQUVwQixXQUFPLFFBQVEsVUFBVSxTQUFTLFFBQVEsQ0FBQztBQUMzQyxXQUFPLFFBQVEsVUFBVSxTQUFTLEtBQUssQ0FBQztBQUN4QyxXQUFPLFFBQVEsVUFBVSxTQUFTLEtBQUssQ0FBQztBQUN4QyxXQUFPLENBQUMsUUFBUSxVQUFVLFNBQVMsS0FBSyxDQUFDO0FBQ3pDLFdBQU8sQ0FBQyxRQUFRLFVBQVUsU0FBUyxLQUFLLENBQUM7QUFDekMsV0FBTyxDQUFDLFFBQVEsVUFBVSxTQUFTLEVBQUUsQ0FBQztBQUFBLEVBQ3ZDLENBQUM7QUFFRCxPQUFLLDBEQUEw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
