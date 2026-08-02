import assert from "assert";
import { stub, useFakeTimers } from "sinon";
import { Emitter } from "../../../../../../base/common/event.js";
import { CharPredictState, PredictionStats, TypeAheadAddon } from "../../browser/terminalTypeAheadAddon.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { DEFAULT_LOCAL_ECHO_EXCLUDE } from "../../common/terminalTypeAheadConfiguration.js";
import { isString } from "../../../../../../base/common/types.js";
const CSI = `\x1B[`;
var CursorMoveDirection = /* @__PURE__ */ ((CursorMoveDirection2) => {
  CursorMoveDirection2["Back"] = "D";
  CursorMoveDirection2["Forwards"] = "C";
  return CursorMoveDirection2;
})(CursorMoveDirection || {});
suite("Workbench - Terminal Typeahead", () => {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  suite("PredictionStats", () => {
    let stats;
    let add;
    let succeed;
    let fail;
    setup(() => {
      add = ds.add(new Emitter());
      succeed = ds.add(new Emitter());
      fail = ds.add(new Emitter());
      stats = ds.add(new PredictionStats({
        onPredictionAdded: add.event,
        onPredictionSucceeded: succeed.event,
        onPredictionFailed: fail.event
      }));
    });
    test("creates sane data", () => {
      const stubs = createPredictionStubs(5);
      const clock = useFakeTimers();
      try {
        for (const s of stubs) {
          add.fire(s);
        }
        for (let i = 0; i < stubs.length; i++) {
          clock.tick(100);
          (i % 2 ? fail : succeed).fire(stubs[i]);
        }
        assert.strictEqual(stats.accuracy, 3 / 5);
        assert.strictEqual(stats.sampleSize, 5);
        assert.deepStrictEqual(stats.latency, {
          count: 3,
          min: 100,
          max: 500,
          median: 300
        });
      } finally {
        clock.restore();
      }
    });
    test("circular buffer", () => {
      const bufferSize = 24;
      const stubs = createPredictionStubs(bufferSize * 2);
      for (const s of stubs.slice(0, bufferSize)) {
        add.fire(s);
        succeed.fire(s);
      }
      assert.strictEqual(stats.accuracy, 1);
      for (const s of stubs.slice(bufferSize, bufferSize * 3 / 2)) {
        add.fire(s);
        fail.fire(s);
      }
      assert.strictEqual(stats.accuracy, 0.5);
      for (const s of stubs.slice(bufferSize * 3 / 2)) {
        add.fire(s);
        fail.fire(s);
      }
      assert.strictEqual(stats.accuracy, 0);
    });
  });
  suite("timeline", () => {
    let onBeforeProcessData;
    let publicLog;
    let config;
    let addon;
    const predictedHelloo = [
      `${CSI}?25l`,
      // hide cursor
      `${CSI}2;7H`,
      // move cursor
      "o",
      // new character
      `${CSI}2;8H`,
      // place cursor back at end of line
      `${CSI}?25h`
      // show cursor
    ].join("");
    const expectProcessed = (input, output) => {
      const evt = { data: input };
      onBeforeProcessData.fire(evt);
      assert.strictEqual(JSON.stringify(evt.data), JSON.stringify(output));
    };
    setup(() => {
      onBeforeProcessData = ds.add(new Emitter());
      config = upcastPartial({
        localEchoStyle: "italic",
        localEchoLatencyThreshold: 0,
        localEchoExcludePrograms: DEFAULT_LOCAL_ECHO_EXCLUDE
      });
      publicLog = stub();
      addon = new TestTypeAheadAddon(
        upcastPartial({ onBeforeProcessData: onBeforeProcessData.event }),
        new TestConfigurationService({ terminal: { integrated: { ...config } } }),
        upcastPartial({ publicLog })
      );
      addon.unlockMakingPredictions();
    });
    teardown(() => {
      addon.dispose();
    });
    test("predicts a single character", () => {
      const t = ds.add(createMockTerminal({ lines: ["hello|"] }));
      addon.activate(t.terminal);
      t.onData("o");
      t.expectWritten(`${CSI}3mo${CSI}23m`);
    });
    test("validates character prediction", () => {
      const t = ds.add(createMockTerminal({ lines: ["hello|"] }));
      addon.activate(t.terminal);
      t.onData("o");
      expectProcessed("o", predictedHelloo);
      assert.strictEqual(addon.stats?.accuracy, 1);
    });
    test("validates zsh prediction (#112842)", () => {
      const t = ds.add(createMockTerminal({ lines: ["hello|"] }));
      addon.activate(t.terminal);
      t.onData("o");
      expectProcessed("o", predictedHelloo);
      t.onData("x");
      expectProcessed("\box", [
        `${CSI}?25l`,
        // hide cursor
        `${CSI}2;8H`,
        // move cursor
        "\box",
        // new data
        `${CSI}2;9H`,
        // place cursor back at end of line
        `${CSI}?25h`
        // show cursor
      ].join(""));
      assert.strictEqual(addon.stats?.accuracy, 1);
    });
    test("does not validate zsh prediction on differing lookbehindn (#112842)", () => {
      const t = ds.add(createMockTerminal({ lines: ["hello|"] }));
      addon.activate(t.terminal);
      t.onData("o");
      expectProcessed("o", predictedHelloo);
      t.onData("x");
      expectProcessed("\bqx", [
        `${CSI}?25l`,
        // hide cursor
        `${CSI}2;8H`,
        // move cursor cursor
        `${CSI}X`,
        // delete character
        `${CSI}0m`,
        // reset style
        "\bqx",
        // new data
        `${CSI}?25h`
        // show cursor
      ].join(""));
      assert.strictEqual(addon.stats?.accuracy, 0.5);
    });
    test("rolls back character prediction", () => {
      const t = ds.add(createMockTerminal({ lines: ["hello|"] }));
      addon.activate(t.terminal);
      t.onData("o");
      expectProcessed("q", [
        `${CSI}?25l`,
        // hide cursor
        `${CSI}2;7H`,
        // move cursor cursor
        `${CSI}X`,
        // delete character
        `${CSI}0m`,
        // reset style
        "q",
        // new character
        `${CSI}?25h`
        // show cursor
      ].join(""));
      assert.strictEqual(addon.stats?.accuracy, 0);
    });
    test("handles left arrow when we hit the boundary", () => {
      const t = ds.add(createMockTerminal({ lines: ["|"] }));
      addon.activate(t.terminal);
      addon.unlockNavigating();
      const cursorXBefore = addon.physicalCursor(t.terminal.buffer.active)?.x;
      t.onData(`${CSI}${"D" /* Back */}`);
      t.expectWritten("");
      onBeforeProcessData.fire({ data: "xy" });
      assert.strictEqual(
        addon.physicalCursor(t.terminal.buffer.active)?.x,
        // The cursor should not have changed because we've hit the
        // boundary (start of prompt)
        cursorXBefore
      );
    });
    test("handles right arrow when we hit the boundary", () => {
      const t = ds.add(createMockTerminal({ lines: ["|"] }));
      addon.activate(t.terminal);
      addon.unlockNavigating();
      const cursorXBefore = addon.physicalCursor(t.terminal.buffer.active)?.x;
      t.onData(`${CSI}${"C" /* Forwards */}`);
      t.expectWritten("");
      onBeforeProcessData.fire({ data: "xy" });
      assert.strictEqual(
        addon.physicalCursor(t.terminal.buffer.active)?.x,
        // The cursor should not have changed because we've hit the
        // boundary (end of prompt)
        cursorXBefore
      );
    });
    test("internal cursor state is reset when all predictions are undone", () => {
      const t = ds.add(createMockTerminal({ lines: ["|"] }));
      addon.activate(t.terminal);
      addon.unlockNavigating();
      const cursorXBefore = addon.physicalCursor(t.terminal.buffer.active)?.x;
      t.onData(`${CSI}${"D" /* Back */}`);
      t.expectWritten("");
      addon.undoAllPredictions();
      assert.strictEqual(
        addon.physicalCursor(t.terminal.buffer.active)?.x,
        // The cursor should not have changed because we've hit the
        // boundary (start of prompt)
        cursorXBefore
      );
    });
    test("restores cursor graphics mode", () => {
      const t = ds.add(createMockTerminal({
        lines: ["hello|"],
        cursorAttrs: { isAttributeDefault: false, isBold: true, isFgPalette: true, getFgColor: 1 }
      }));
      addon.activate(t.terminal);
      t.onData("o");
      expectProcessed("q", [
        `${CSI}?25l`,
        // hide cursor
        `${CSI}2;7H`,
        // move cursor cursor
        `${CSI}X`,
        // delete character
        `${CSI}1;38;5;1m`,
        // reset style
        "q",
        // new character
        `${CSI}?25h`
        // show cursor
      ].join(""));
      assert.strictEqual(addon.stats?.accuracy, 0);
    });
    test("validates against and applies graphics mode on predicted", () => {
      const t = ds.add(createMockTerminal({ lines: ["hello|"] }));
      addon.activate(t.terminal);
      t.onData("o");
      expectProcessed(`${CSI}4mo`, [
        `${CSI}?25l`,
        // hide cursor
        `${CSI}2;7H`,
        // move cursor
        `${CSI}4m`,
        // new PTY's style
        "o",
        // new character
        `${CSI}2;8H`,
        // place cursor back at end of line
        `${CSI}?25h`
        // show cursor
      ].join(""));
      assert.strictEqual(addon.stats?.accuracy, 1);
    });
    test("ignores cursor hides or shows", () => {
      const t = ds.add(createMockTerminal({ lines: ["hello|"] }));
      addon.activate(t.terminal);
      t.onData("o");
      expectProcessed(`${CSI}?25lo${CSI}?25h`, [
        `${CSI}?25l`,
        // hide cursor from PTY
        `${CSI}?25l`,
        // hide cursor
        `${CSI}2;7H`,
        // move cursor
        "o",
        // new character
        `${CSI}?25h`,
        // show cursor from PTY
        `${CSI}2;8H`,
        // place cursor back at end of line
        `${CSI}?25h`
        // show cursor
      ].join(""));
      assert.strictEqual(addon.stats?.accuracy, 1);
    });
    test("matches backspace at EOL (bash style)", () => {
      const t = ds.add(createMockTerminal({ lines: ["hello|"] }));
      addon.activate(t.terminal);
      t.onData("\x7F");
      expectProcessed(`\b${CSI}K`, `\b${CSI}K`);
      assert.strictEqual(addon.stats?.accuracy, 1);
    });
    test("matches backspace at EOL (zsh style)", () => {
      const t = ds.add(createMockTerminal({ lines: ["hello|"] }));
      addon.activate(t.terminal);
      t.onData("\x7F");
      expectProcessed("\b \b", "\b \b");
      assert.strictEqual(addon.stats?.accuracy, 1);
    });
    test("gradually matches backspace", () => {
      const t = ds.add(createMockTerminal({ lines: ["hello|"] }));
      addon.activate(t.terminal);
      t.onData("\x7F");
      expectProcessed("\b", "");
      expectProcessed(" \b", "\b \b");
      assert.strictEqual(addon.stats?.accuracy, 1);
    });
    test("restores old character after invalid backspace", () => {
      const t = ds.add(createMockTerminal({ lines: ["hel|lo"] }));
      addon.activate(t.terminal);
      addon.unlockNavigating();
      t.onData("\x7F");
      t.expectWritten(`${CSI}2;4H${CSI}X`);
      expectProcessed("x", `${CSI}?25l${CSI}0ml${CSI}2;5H${CSI}0mx${CSI}?25h`);
      assert.strictEqual(addon.stats?.accuracy, 0);
    });
    test("waits for validation before deleting to left of cursor", () => {
      const t = ds.add(createMockTerminal({ lines: ["hello|"] }));
      addon.activate(t.terminal);
      t.onData("\x7F");
      t.expectWritten("");
      expectProcessed("\b \b", "\b \b");
      t.cursor.x--;
      t.onData("o");
      onBeforeProcessData.fire({ data: "o" });
      t.cursor.x++;
      t.clearWritten();
      t.onData("\x7F");
      t.expectWritten(`${CSI}2;6H${CSI}X`);
    });
    test("waits for first valid prediction on a line", () => {
      const t = ds.add(createMockTerminal({ lines: ["hello|"] }));
      addon.lockMakingPredictions();
      addon.activate(t.terminal);
      t.onData("o");
      t.expectWritten("");
      expectProcessed("o", "o");
      t.onData("o");
      t.expectWritten(`${CSI}3mo${CSI}23m`);
    });
    test("disables on title change", () => {
      const t = ds.add(createMockTerminal({ lines: ["hello|"] }));
      addon.activate(t.terminal);
      addon.reevaluateNow();
      assert.strictEqual(addon.isShowing, true, "expected to show initially");
      t.onTitleChange.fire("foo - VIM.exe");
      addon.reevaluateNow();
      assert.strictEqual(addon.isShowing, false, "expected to hide when vim is open");
      t.onTitleChange.fire("foo - git.exe");
      addon.reevaluateNow();
      assert.strictEqual(addon.isShowing, true, "expected to show again after vim closed");
    });
    test("adds line wrap prediction even if behind a boundary", () => {
      const t = ds.add(createMockTerminal({ lines: ["hello|"] }));
      addon.lockMakingPredictions();
      addon.activate(t.terminal);
      t.onData("hi".repeat(50));
      t.expectWritten("");
      expectProcessed("hi", [
        `${CSI}?25l`,
        // hide cursor
        "hi",
        // this greeting characters
        ...new Array(36).fill(`${CSI}3mh${CSI}23m${CSI}3mi${CSI}23m`),
        // rest of the greetings that fit on this line
        `${CSI}2;81H`,
        // move to end of line
        `${CSI}?25h`
      ].join(""));
    });
  });
});
class TestTypeAheadAddon extends TypeAheadAddon {
  unlockMakingPredictions() {
    this._lastRow = { y: 1, startingX: 100, endingX: 100, charState: CharPredictState.Validated };
  }
  lockMakingPredictions() {
    this._lastRow = void 0;
  }
  unlockNavigating() {
    this._lastRow = { y: 1, startingX: 1, endingX: 1, charState: CharPredictState.Validated };
  }
  reevaluateNow() {
    this._reevaluatePredictorStateNow(this.stats, this._timeline);
  }
  get isShowing() {
    return !!this._timeline?.isShowingPredictions;
  }
  undoAllPredictions() {
    this._timeline?.undoAllPredictions();
  }
  physicalCursor(buffer) {
    return this._timeline?.physicalCursor(buffer);
  }
  tentativeCursor(buffer) {
    return this._timeline?.tentativeCursor(buffer);
  }
}
function upcastPartial(v) {
  return v;
}
function createPredictionStubs(n) {
  return new Array(n).fill(0).map(stubPrediction);
}
function stubPrediction() {
  return {
    apply: () => "",
    rollback: () => "",
    matches: () => 0,
    rollForwards: () => ""
  };
}
function createMockTerminal({ lines, cursorAttrs }) {
  const ds = new DisposableStore();
  const written = [];
  const cursor = { y: 1, x: 1 };
  const onTitleChange = ds.add(new Emitter());
  const onData = ds.add(new Emitter());
  const csiEmitter = ds.add(new Emitter());
  for (let y = 0; y < lines.length; y++) {
    const line = lines[y];
    if (line.includes("|")) {
      cursor.y = y + 1;
      cursor.x = line.indexOf("|") + 1;
      lines[y] = line.replace("|", "");
      break;
    }
  }
  return {
    written,
    cursor,
    expectWritten: (s) => {
      assert.strictEqual(JSON.stringify(written.join("")), JSON.stringify(s));
      written.splice(0, written.length);
    },
    clearWritten: () => written.splice(0, written.length),
    onData: (s) => onData.fire(s),
    csiEmitter,
    onTitleChange,
    dispose: () => ds.dispose(),
    terminal: {
      cols: 80,
      rows: 5,
      onResize: new Emitter().event,
      onData: onData.event,
      onTitleChange: onTitleChange.event,
      parser: {
        registerCsiHandler(_, callback) {
          ds.add(csiEmitter.event(callback));
        }
      },
      write(line) {
        written.push(line);
      },
      _core: {
        _inputHandler: {
          _curAttrData: mockCell("", cursorAttrs)
        },
        writeSync() {
        }
      },
      buffer: {
        active: {
          type: "normal",
          baseY: 0,
          get cursorY() {
            return cursor.y;
          },
          get cursorX() {
            return cursor.x;
          },
          getLine(y) {
            const s = lines[y - 1] || "";
            return {
              length: s.length,
              getCell: (x) => mockCell(s[x - 1] || ""),
              translateToString: (trim, start = 0, end = s.length) => {
                const out = s.slice(start, end);
                return trim ? out.trimRight() : out;
              }
            };
          }
        }
      }
    }
  };
}
function mockCell(char, attrs = {}) {
  return new Proxy({}, {
    get(_, prop) {
      if (isString(prop) && attrs.hasOwnProperty(prop)) {
        return () => attrs[prop];
      }
      switch (prop) {
        case "getWidth":
          return () => 1;
        case "getChars":
          return () => char;
        case "getCode":
          return () => char.charCodeAt(0) || 0;
        case "isAttributeDefault":
          return () => true;
        default:
          return String(prop).startsWith("is") ? (() => false) : (() => 0);
      }
    }
  });
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi90eXBlQWhlYWQvdGVzdC9icm93c2VyL3Rlcm1pbmFsVHlwZUFoZWFkLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgdHlwZSB7IElCdWZmZXIsIFRlcm1pbmFsIH0gZnJvbSAnQHh0ZXJtL3h0ZXJtJztcbmltcG9ydCB7IFNpbm9uU3R1Yiwgc3R1YiwgdXNlRmFrZVRpbWVycyB9IGZyb20gJ3Npbm9uJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBDaGFyUHJlZGljdFN0YXRlLCBJUHJlZGljdGlvbiwgUHJlZGljdGlvblN0YXRzLCBUeXBlQWhlYWRBZGRvbiB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdGVybWluYWxUeXBlQWhlYWRBZGRvbi5qcyc7XG5pbXBvcnQgeyBJQmVmb3JlUHJvY2Vzc0RhdGFFdmVudCwgSVRlcm1pbmFsUHJvY2Vzc01hbmFnZXIgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX0xPQ0FMX0VDSE9fRVhDTFVERSwgdHlwZSBJVGVybWluYWxUeXBlQWhlYWRDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rlcm1pbmFsVHlwZUFoZWFkQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBpc1N0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcblxuY29uc3QgQ1NJID0gYFxceDFiW2A7XG5cbmNvbnN0IGVudW0gQ3Vyc29yTW92ZURpcmVjdGlvbiB7XG5cdEJhY2sgPSAnRCcsXG5cdEZvcndhcmRzID0gJ0MnLFxufVxuXG5zdWl0ZSgnV29ya2JlbmNoIC0gVGVybWluYWwgVHlwZWFoZWFkJywgKCkgPT4ge1xuXHRjb25zdCBkcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdQcmVkaWN0aW9uU3RhdHMnLCAoKSA9PiB7XG5cdFx0bGV0IHN0YXRzOiBQcmVkaWN0aW9uU3RhdHM7XG5cdFx0bGV0IGFkZDogRW1pdHRlcjxJUHJlZGljdGlvbj47XG5cdFx0bGV0IHN1Y2NlZWQ6IEVtaXR0ZXI8SVByZWRpY3Rpb24+O1xuXHRcdGxldCBmYWlsOiBFbWl0dGVyPElQcmVkaWN0aW9uPjtcblxuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdGFkZCA9IGRzLmFkZChuZXcgRW1pdHRlcjxJUHJlZGljdGlvbj4oKSk7XG5cdFx0XHRzdWNjZWVkID0gZHMuYWRkKG5ldyBFbWl0dGVyPElQcmVkaWN0aW9uPigpKTtcblx0XHRcdGZhaWwgPSBkcy5hZGQobmV3IEVtaXR0ZXI8SVByZWRpY3Rpb24+KCkpO1xuXG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdHN0YXRzID0gZHMuYWRkKG5ldyBQcmVkaWN0aW9uU3RhdHMoe1xuXHRcdFx0XHRvblByZWRpY3Rpb25BZGRlZDogYWRkLmV2ZW50LFxuXHRcdFx0XHRvblByZWRpY3Rpb25TdWNjZWVkZWQ6IHN1Y2NlZWQuZXZlbnQsXG5cdFx0XHRcdG9uUHJlZGljdGlvbkZhaWxlZDogZmFpbC5ldmVudCxcblx0XHRcdH0gYXMgYW55KSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjcmVhdGVzIHNhbmUgZGF0YScsICgpID0+IHtcblx0XHRcdGNvbnN0IHN0dWJzID0gY3JlYXRlUHJlZGljdGlvblN0dWJzKDUpO1xuXHRcdFx0Y29uc3QgY2xvY2sgPSB1c2VGYWtlVGltZXJzKCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHMgb2Ygc3R1YnMpIHsgYWRkLmZpcmUocyk7IH1cblxuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHN0dWJzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0Y2xvY2sudGljaygxMDApO1xuXHRcdFx0XHRcdChpICUgMiA/IGZhaWwgOiBzdWNjZWVkKS5maXJlKHN0dWJzW2ldKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0cy5hY2N1cmFjeSwgMyAvIDUpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdHMuc2FtcGxlU2l6ZSwgNSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdHMubGF0ZW5jeSwge1xuXHRcdFx0XHRcdGNvdW50OiAzLFxuXHRcdFx0XHRcdG1pbjogMTAwLFxuXHRcdFx0XHRcdG1heDogNTAwLFxuXHRcdFx0XHRcdG1lZGlhbjogMzAwXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0Y2xvY2sucmVzdG9yZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2lyY3VsYXIgYnVmZmVyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYnVmZmVyU2l6ZSA9IDI0O1xuXHRcdFx0Y29uc3Qgc3R1YnMgPSBjcmVhdGVQcmVkaWN0aW9uU3R1YnMoYnVmZmVyU2l6ZSAqIDIpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHMgb2Ygc3R1YnMuc2xpY2UoMCwgYnVmZmVyU2l6ZSkpIHsgYWRkLmZpcmUocyk7IHN1Y2NlZWQuZmlyZShzKTsgfVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRzLmFjY3VyYWN5LCAxKTtcblxuXHRcdFx0Zm9yIChjb25zdCBzIG9mIHN0dWJzLnNsaWNlKGJ1ZmZlclNpemUsIGJ1ZmZlclNpemUgKiAzIC8gMikpIHsgYWRkLmZpcmUocyk7IGZhaWwuZmlyZShzKTsgfVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRzLmFjY3VyYWN5LCAwLjUpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHMgb2Ygc3R1YnMuc2xpY2UoYnVmZmVyU2l6ZSAqIDMgLyAyKSkgeyBhZGQuZmlyZShzKTsgZmFpbC5maXJlKHMpOyB9XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdHMuYWNjdXJhY3ksIDApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgndGltZWxpbmUnLCAoKSA9PiB7XG5cdFx0bGV0IG9uQmVmb3JlUHJvY2Vzc0RhdGE6IEVtaXR0ZXI8SUJlZm9yZVByb2Nlc3NEYXRhRXZlbnQ+O1xuXHRcdGxldCBwdWJsaWNMb2c6IFNpbm9uU3R1Yjtcblx0XHRsZXQgY29uZmlnOiBJVGVybWluYWxUeXBlQWhlYWRDb25maWd1cmF0aW9uO1xuXHRcdGxldCBhZGRvbjogVGVzdFR5cGVBaGVhZEFkZG9uO1xuXG5cdFx0Y29uc3QgcHJlZGljdGVkSGVsbG9vID0gW1xuXHRcdFx0YCR7Q1NJfT8yNWxgLCAvLyBoaWRlIGN1cnNvclxuXHRcdFx0YCR7Q1NJfTI7N0hgLCAvLyBtb3ZlIGN1cnNvclxuXHRcdFx0J28nLCAvLyBuZXcgY2hhcmFjdGVyXG5cdFx0XHRgJHtDU0l9Mjs4SGAsIC8vIHBsYWNlIGN1cnNvciBiYWNrIGF0IGVuZCBvZiBsaW5lXG5cdFx0XHRgJHtDU0l9PzI1aGAsIC8vIHNob3cgY3Vyc29yXG5cdFx0XS5qb2luKCcnKTtcblxuXHRcdGNvbnN0IGV4cGVjdFByb2Nlc3NlZCA9IChpbnB1dDogc3RyaW5nLCBvdXRwdXQ6IHN0cmluZykgPT4ge1xuXHRcdFx0Y29uc3QgZXZ0ID0geyBkYXRhOiBpbnB1dCB9O1xuXHRcdFx0b25CZWZvcmVQcm9jZXNzRGF0YS5maXJlKGV2dCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoSlNPTi5zdHJpbmdpZnkoZXZ0LmRhdGEpLCBKU09OLnN0cmluZ2lmeShvdXRwdXQpKTtcblx0XHR9O1xuXG5cdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0b25CZWZvcmVQcm9jZXNzRGF0YSA9IGRzLmFkZChuZXcgRW1pdHRlcjxJQmVmb3JlUHJvY2Vzc0RhdGFFdmVudD4oKSk7XG5cdFx0XHRjb25maWcgPSB1cGNhc3RQYXJ0aWFsPElUZXJtaW5hbFR5cGVBaGVhZENvbmZpZ3VyYXRpb24+KHtcblx0XHRcdFx0bG9jYWxFY2hvU3R5bGU6ICdpdGFsaWMnLFxuXHRcdFx0XHRsb2NhbEVjaG9MYXRlbmN5VGhyZXNob2xkOiAwLFxuXHRcdFx0XHRsb2NhbEVjaG9FeGNsdWRlUHJvZ3JhbXM6IERFRkFVTFRfTE9DQUxfRUNIT19FWENMVURFLFxuXHRcdFx0fSk7XG5cdFx0XHRwdWJsaWNMb2cgPSBzdHViKCk7XG5cdFx0XHRhZGRvbiA9IG5ldyBUZXN0VHlwZUFoZWFkQWRkb24oXG5cdFx0XHRcdHVwY2FzdFBhcnRpYWw8SVRlcm1pbmFsUHJvY2Vzc01hbmFnZXI+KHsgb25CZWZvcmVQcm9jZXNzRGF0YTogb25CZWZvcmVQcm9jZXNzRGF0YS5ldmVudCB9KSxcblx0XHRcdFx0bmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7IHRlcm1pbmFsOiB7IGludGVncmF0ZWQ6IHsgLi4uY29uZmlnIH0gfSB9KSxcblx0XHRcdFx0dXBjYXN0UGFydGlhbDxJVGVsZW1ldHJ5U2VydmljZT4oeyBwdWJsaWNMb2cgfSlcblx0XHRcdCk7XG5cdFx0XHRhZGRvbi51bmxvY2tNYWtpbmdQcmVkaWN0aW9ucygpO1xuXHRcdH0pO1xuXG5cdFx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdFx0YWRkb24uZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJlZGljdHMgYSBzaW5nbGUgY2hhcmFjdGVyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdCA9IGRzLmFkZChjcmVhdGVNb2NrVGVybWluYWwoeyBsaW5lczogWydoZWxsb3wnXSB9KSk7XG5cdFx0XHRhZGRvbi5hY3RpdmF0ZSh0LnRlcm1pbmFsKTtcblx0XHRcdHQub25EYXRhKCdvJyk7XG5cdFx0XHR0LmV4cGVjdFdyaXR0ZW4oYCR7Q1NJfTNtbyR7Q1NJfTIzbWApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndmFsaWRhdGVzIGNoYXJhY3RlciBwcmVkaWN0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdCA9IGRzLmFkZChjcmVhdGVNb2NrVGVybWluYWwoeyBsaW5lczogWydoZWxsb3wnXSB9KSk7XG5cdFx0XHRhZGRvbi5hY3RpdmF0ZSh0LnRlcm1pbmFsKTtcblx0XHRcdHQub25EYXRhKCdvJyk7XG5cdFx0XHRleHBlY3RQcm9jZXNzZWQoJ28nLCBwcmVkaWN0ZWRIZWxsb28pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFkZG9uLnN0YXRzPy5hY2N1cmFjeSwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd2YWxpZGF0ZXMgenNoIHByZWRpY3Rpb24gKCMxMTI4NDIpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdCA9IGRzLmFkZChjcmVhdGVNb2NrVGVybWluYWwoeyBsaW5lczogWydoZWxsb3wnXSB9KSk7XG5cdFx0XHRhZGRvbi5hY3RpdmF0ZSh0LnRlcm1pbmFsKTtcblx0XHRcdHQub25EYXRhKCdvJyk7XG5cdFx0XHRleHBlY3RQcm9jZXNzZWQoJ28nLCBwcmVkaWN0ZWRIZWxsb28pO1xuXG5cdFx0XHR0Lm9uRGF0YSgneCcpO1xuXHRcdFx0ZXhwZWN0UHJvY2Vzc2VkKCdcXGJveCcsIFtcblx0XHRcdFx0YCR7Q1NJfT8yNWxgLCAvLyBoaWRlIGN1cnNvclxuXHRcdFx0XHRgJHtDU0l9Mjs4SGAsIC8vIG1vdmUgY3Vyc29yXG5cdFx0XHRcdCdcXGJveCcsIC8vIG5ldyBkYXRhXG5cdFx0XHRcdGAke0NTSX0yOzlIYCwgLy8gcGxhY2UgY3Vyc29yIGJhY2sgYXQgZW5kIG9mIGxpbmVcblx0XHRcdFx0YCR7Q1NJfT8yNWhgLCAvLyBzaG93IGN1cnNvclxuXHRcdFx0XS5qb2luKCcnKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWRkb24uc3RhdHM/LmFjY3VyYWN5LCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IHZhbGlkYXRlIHpzaCBwcmVkaWN0aW9uIG9uIGRpZmZlcmluZyBsb29rYmVoaW5kbiAoIzExMjg0MiknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ID0gZHMuYWRkKGNyZWF0ZU1vY2tUZXJtaW5hbCh7IGxpbmVzOiBbJ2hlbGxvfCddIH0pKTtcblx0XHRcdGFkZG9uLmFjdGl2YXRlKHQudGVybWluYWwpO1xuXHRcdFx0dC5vbkRhdGEoJ28nKTtcblx0XHRcdGV4cGVjdFByb2Nlc3NlZCgnbycsIHByZWRpY3RlZEhlbGxvbyk7XG5cblx0XHRcdHQub25EYXRhKCd4Jyk7XG5cdFx0XHRleHBlY3RQcm9jZXNzZWQoJ1xcYnF4JywgW1xuXHRcdFx0XHRgJHtDU0l9PzI1bGAsIC8vIGhpZGUgY3Vyc29yXG5cdFx0XHRcdGAke0NTSX0yOzhIYCwgLy8gbW92ZSBjdXJzb3IgY3Vyc29yXG5cdFx0XHRcdGAke0NTSX1YYCwgLy8gZGVsZXRlIGNoYXJhY3RlclxuXHRcdFx0XHRgJHtDU0l9MG1gLCAvLyByZXNldCBzdHlsZVxuXHRcdFx0XHQnXFxicXgnLCAvLyBuZXcgZGF0YVxuXHRcdFx0XHRgJHtDU0l9PzI1aGAsIC8vIHNob3cgY3Vyc29yXG5cdFx0XHRdLmpvaW4oJycpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZGRvbi5zdGF0cz8uYWNjdXJhY3ksIDAuNSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyb2xscyBiYWNrIGNoYXJhY3RlciBwcmVkaWN0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdCA9IGRzLmFkZChjcmVhdGVNb2NrVGVybWluYWwoeyBsaW5lczogWydoZWxsb3wnXSB9KSk7XG5cdFx0XHRhZGRvbi5hY3RpdmF0ZSh0LnRlcm1pbmFsKTtcblx0XHRcdHQub25EYXRhKCdvJyk7XG5cblx0XHRcdGV4cGVjdFByb2Nlc3NlZCgncScsIFtcblx0XHRcdFx0YCR7Q1NJfT8yNWxgLCAvLyBoaWRlIGN1cnNvclxuXHRcdFx0XHRgJHtDU0l9Mjs3SGAsIC8vIG1vdmUgY3Vyc29yIGN1cnNvclxuXHRcdFx0XHRgJHtDU0l9WGAsIC8vIGRlbGV0ZSBjaGFyYWN0ZXJcblx0XHRcdFx0YCR7Q1NJfTBtYCwgLy8gcmVzZXQgc3R5bGVcblx0XHRcdFx0J3EnLCAvLyBuZXcgY2hhcmFjdGVyXG5cdFx0XHRcdGAke0NTSX0/MjVoYCwgLy8gc2hvdyBjdXJzb3Jcblx0XHRcdF0uam9pbignJykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFkZG9uLnN0YXRzPy5hY2N1cmFjeSwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVzIGxlZnQgYXJyb3cgd2hlbiB3ZSBoaXQgdGhlIGJvdW5kYXJ5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdCA9IGRzLmFkZChjcmVhdGVNb2NrVGVybWluYWwoeyBsaW5lczogWyd8J10gfSkpO1xuXHRcdFx0YWRkb24uYWN0aXZhdGUodC50ZXJtaW5hbCk7XG5cdFx0XHRhZGRvbi51bmxvY2tOYXZpZ2F0aW5nKCk7XG5cblx0XHRcdGNvbnN0IGN1cnNvclhCZWZvcmUgPSBhZGRvbi5waHlzaWNhbEN1cnNvcih0LnRlcm1pbmFsLmJ1ZmZlci5hY3RpdmUpPy54ITtcblx0XHRcdHQub25EYXRhKGAke0NTSX0ke0N1cnNvck1vdmVEaXJlY3Rpb24uQmFja31gKTtcblx0XHRcdHQuZXhwZWN0V3JpdHRlbignJyk7XG5cblx0XHRcdC8vIFRyaWdnZXIgcm9sbGJhY2sgYmVjYXVzZSB3ZSBkb24ndCBleHBlY3QgdGhpcyBkYXRhXG5cdFx0XHRvbkJlZm9yZVByb2Nlc3NEYXRhLmZpcmUoeyBkYXRhOiAneHknIH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGFkZG9uLnBoeXNpY2FsQ3Vyc29yKHQudGVybWluYWwuYnVmZmVyLmFjdGl2ZSk/LngsXG5cdFx0XHRcdC8vIFRoZSBjdXJzb3Igc2hvdWxkIG5vdCBoYXZlIGNoYW5nZWQgYmVjYXVzZSB3ZSd2ZSBoaXQgdGhlXG5cdFx0XHRcdC8vIGJvdW5kYXJ5IChzdGFydCBvZiBwcm9tcHQpXG5cdFx0XHRcdGN1cnNvclhCZWZvcmUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyByaWdodCBhcnJvdyB3aGVuIHdlIGhpdCB0aGUgYm91bmRhcnknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ID0gZHMuYWRkKGNyZWF0ZU1vY2tUZXJtaW5hbCh7IGxpbmVzOiBbJ3wnXSB9KSk7XG5cdFx0XHRhZGRvbi5hY3RpdmF0ZSh0LnRlcm1pbmFsKTtcblx0XHRcdGFkZG9uLnVubG9ja05hdmlnYXRpbmcoKTtcblxuXHRcdFx0Y29uc3QgY3Vyc29yWEJlZm9yZSA9IGFkZG9uLnBoeXNpY2FsQ3Vyc29yKHQudGVybWluYWwuYnVmZmVyLmFjdGl2ZSk/LnghO1xuXHRcdFx0dC5vbkRhdGEoYCR7Q1NJfSR7Q3Vyc29yTW92ZURpcmVjdGlvbi5Gb3J3YXJkc31gKTtcblx0XHRcdHQuZXhwZWN0V3JpdHRlbignJyk7XG5cblx0XHRcdC8vIFRyaWdnZXIgcm9sbGJhY2sgYmVjYXVzZSB3ZSBkb24ndCBleHBlY3QgdGhpcyBkYXRhXG5cdFx0XHRvbkJlZm9yZVByb2Nlc3NEYXRhLmZpcmUoeyBkYXRhOiAneHknIH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGFkZG9uLnBoeXNpY2FsQ3Vyc29yKHQudGVybWluYWwuYnVmZmVyLmFjdGl2ZSk/LngsXG5cdFx0XHRcdC8vIFRoZSBjdXJzb3Igc2hvdWxkIG5vdCBoYXZlIGNoYW5nZWQgYmVjYXVzZSB3ZSd2ZSBoaXQgdGhlXG5cdFx0XHRcdC8vIGJvdW5kYXJ5IChlbmQgb2YgcHJvbXB0KVxuXHRcdFx0XHRjdXJzb3JYQmVmb3JlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ludGVybmFsIGN1cnNvciBzdGF0ZSBpcyByZXNldCB3aGVuIGFsbCBwcmVkaWN0aW9ucyBhcmUgdW5kb25lJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdCA9IGRzLmFkZChjcmVhdGVNb2NrVGVybWluYWwoeyBsaW5lczogWyd8J10gfSkpO1xuXHRcdFx0YWRkb24uYWN0aXZhdGUodC50ZXJtaW5hbCk7XG5cdFx0XHRhZGRvbi51bmxvY2tOYXZpZ2F0aW5nKCk7XG5cblx0XHRcdGNvbnN0IGN1cnNvclhCZWZvcmUgPSBhZGRvbi5waHlzaWNhbEN1cnNvcih0LnRlcm1pbmFsLmJ1ZmZlci5hY3RpdmUpPy54ITtcblx0XHRcdHQub25EYXRhKGAke0NTSX0ke0N1cnNvck1vdmVEaXJlY3Rpb24uQmFja31gKTtcblx0XHRcdHQuZXhwZWN0V3JpdHRlbignJyk7XG5cdFx0XHRhZGRvbi51bmRvQWxsUHJlZGljdGlvbnMoKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRhZGRvbi5waHlzaWNhbEN1cnNvcih0LnRlcm1pbmFsLmJ1ZmZlci5hY3RpdmUpPy54LFxuXHRcdFx0XHQvLyBUaGUgY3Vyc29yIHNob3VsZCBub3QgaGF2ZSBjaGFuZ2VkIGJlY2F1c2Ugd2UndmUgaGl0IHRoZVxuXHRcdFx0XHQvLyBib3VuZGFyeSAoc3RhcnQgb2YgcHJvbXB0KVxuXHRcdFx0XHRjdXJzb3JYQmVmb3JlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Jlc3RvcmVzIGN1cnNvciBncmFwaGljcyBtb2RlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdCA9IGRzLmFkZChjcmVhdGVNb2NrVGVybWluYWwoe1xuXHRcdFx0XHRsaW5lczogWydoZWxsb3wnXSxcblx0XHRcdFx0Y3Vyc29yQXR0cnM6IHsgaXNBdHRyaWJ1dGVEZWZhdWx0OiBmYWxzZSwgaXNCb2xkOiB0cnVlLCBpc0ZnUGFsZXR0ZTogdHJ1ZSwgZ2V0RmdDb2xvcjogMSB9LFxuXHRcdFx0fSkpO1xuXHRcdFx0YWRkb24uYWN0aXZhdGUodC50ZXJtaW5hbCk7XG5cdFx0XHR0Lm9uRGF0YSgnbycpO1xuXG5cdFx0XHRleHBlY3RQcm9jZXNzZWQoJ3EnLCBbXG5cdFx0XHRcdGAke0NTSX0/MjVsYCwgLy8gaGlkZSBjdXJzb3Jcblx0XHRcdFx0YCR7Q1NJfTI7N0hgLCAvLyBtb3ZlIGN1cnNvciBjdXJzb3Jcblx0XHRcdFx0YCR7Q1NJfVhgLCAvLyBkZWxldGUgY2hhcmFjdGVyXG5cdFx0XHRcdGAke0NTSX0xOzM4OzU7MW1gLCAvLyByZXNldCBzdHlsZVxuXHRcdFx0XHQncScsIC8vIG5ldyBjaGFyYWN0ZXJcblx0XHRcdFx0YCR7Q1NJfT8yNWhgLCAvLyBzaG93IGN1cnNvclxuXHRcdFx0XS5qb2luKCcnKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWRkb24uc3RhdHM/LmFjY3VyYWN5LCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ZhbGlkYXRlcyBhZ2FpbnN0IGFuZCBhcHBsaWVzIGdyYXBoaWNzIG1vZGUgb24gcHJlZGljdGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdCA9IGRzLmFkZChjcmVhdGVNb2NrVGVybWluYWwoeyBsaW5lczogWydoZWxsb3wnXSB9KSk7XG5cdFx0XHRhZGRvbi5hY3RpdmF0ZSh0LnRlcm1pbmFsKTtcblx0XHRcdHQub25EYXRhKCdvJyk7XG5cdFx0XHRleHBlY3RQcm9jZXNzZWQoYCR7Q1NJfTRtb2AsIFtcblx0XHRcdFx0YCR7Q1NJfT8yNWxgLCAvLyBoaWRlIGN1cnNvclxuXHRcdFx0XHRgJHtDU0l9Mjs3SGAsIC8vIG1vdmUgY3Vyc29yXG5cdFx0XHRcdGAke0NTSX00bWAsIC8vIG5ldyBQVFkncyBzdHlsZVxuXHRcdFx0XHQnbycsIC8vIG5ldyBjaGFyYWN0ZXJcblx0XHRcdFx0YCR7Q1NJfTI7OEhgLCAvLyBwbGFjZSBjdXJzb3IgYmFjayBhdCBlbmQgb2YgbGluZVxuXHRcdFx0XHRgJHtDU0l9PzI1aGAsIC8vIHNob3cgY3Vyc29yXG5cdFx0XHRdLmpvaW4oJycpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZGRvbi5zdGF0cz8uYWNjdXJhY3ksIDEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaWdub3JlcyBjdXJzb3IgaGlkZXMgb3Igc2hvd3MnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ID0gZHMuYWRkKGNyZWF0ZU1vY2tUZXJtaW5hbCh7IGxpbmVzOiBbJ2hlbGxvfCddIH0pKTtcblx0XHRcdGFkZG9uLmFjdGl2YXRlKHQudGVybWluYWwpO1xuXHRcdFx0dC5vbkRhdGEoJ28nKTtcblx0XHRcdGV4cGVjdFByb2Nlc3NlZChgJHtDU0l9PzI1bG8ke0NTSX0/MjVoYCwgW1xuXHRcdFx0XHRgJHtDU0l9PzI1bGAsIC8vIGhpZGUgY3Vyc29yIGZyb20gUFRZXG5cdFx0XHRcdGAke0NTSX0/MjVsYCwgLy8gaGlkZSBjdXJzb3Jcblx0XHRcdFx0YCR7Q1NJfTI7N0hgLCAvLyBtb3ZlIGN1cnNvclxuXHRcdFx0XHQnbycsIC8vIG5ldyBjaGFyYWN0ZXJcblx0XHRcdFx0YCR7Q1NJfT8yNWhgLCAvLyBzaG93IGN1cnNvciBmcm9tIFBUWVxuXHRcdFx0XHRgJHtDU0l9Mjs4SGAsIC8vIHBsYWNlIGN1cnNvciBiYWNrIGF0IGVuZCBvZiBsaW5lXG5cdFx0XHRcdGAke0NTSX0/MjVoYCwgLy8gc2hvdyBjdXJzb3Jcblx0XHRcdF0uam9pbignJykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFkZG9uLnN0YXRzPy5hY2N1cmFjeSwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXRjaGVzIGJhY2tzcGFjZSBhdCBFT0wgKGJhc2ggc3R5bGUpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdCA9IGRzLmFkZChjcmVhdGVNb2NrVGVybWluYWwoeyBsaW5lczogWydoZWxsb3wnXSB9KSk7XG5cdFx0XHRhZGRvbi5hY3RpdmF0ZSh0LnRlcm1pbmFsKTtcblx0XHRcdHQub25EYXRhKCdcXHg3RicpO1xuXHRcdFx0ZXhwZWN0UHJvY2Vzc2VkKGBcXGIke0NTSX1LYCwgYFxcYiR7Q1NJfUtgKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZGRvbi5zdGF0cz8uYWNjdXJhY3ksIDEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWF0Y2hlcyBiYWNrc3BhY2UgYXQgRU9MICh6c2ggc3R5bGUpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdCA9IGRzLmFkZChjcmVhdGVNb2NrVGVybWluYWwoeyBsaW5lczogWydoZWxsb3wnXSB9KSk7XG5cdFx0XHRhZGRvbi5hY3RpdmF0ZSh0LnRlcm1pbmFsKTtcblx0XHRcdHQub25EYXRhKCdcXHg3RicpO1xuXHRcdFx0ZXhwZWN0UHJvY2Vzc2VkKCdcXGIgXFxiJywgJ1xcYiBcXGInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZGRvbi5zdGF0cz8uYWNjdXJhY3ksIDEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ3JhZHVhbGx5IG1hdGNoZXMgYmFja3NwYWNlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdCA9IGRzLmFkZChjcmVhdGVNb2NrVGVybWluYWwoeyBsaW5lczogWydoZWxsb3wnXSB9KSk7XG5cdFx0XHRhZGRvbi5hY3RpdmF0ZSh0LnRlcm1pbmFsKTtcblx0XHRcdHQub25EYXRhKCdcXHg3RicpO1xuXHRcdFx0ZXhwZWN0UHJvY2Vzc2VkKCdcXGInLCAnJyk7XG5cdFx0XHRleHBlY3RQcm9jZXNzZWQoJyBcXGInLCAnXFxiIFxcYicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFkZG9uLnN0YXRzPy5hY2N1cmFjeSwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXN0b3JlcyBvbGQgY2hhcmFjdGVyIGFmdGVyIGludmFsaWQgYmFja3NwYWNlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdCA9IGRzLmFkZChjcmVhdGVNb2NrVGVybWluYWwoeyBsaW5lczogWydoZWx8bG8nXSB9KSk7XG5cdFx0XHRhZGRvbi5hY3RpdmF0ZSh0LnRlcm1pbmFsKTtcblx0XHRcdGFkZG9uLnVubG9ja05hdmlnYXRpbmcoKTtcblx0XHRcdHQub25EYXRhKCdcXHg3RicpO1xuXHRcdFx0dC5leHBlY3RXcml0dGVuKGAke0NTSX0yOzRIJHtDU0l9WGApO1xuXHRcdFx0ZXhwZWN0UHJvY2Vzc2VkKCd4JywgYCR7Q1NJfT8yNWwke0NTSX0wbWwke0NTSX0yOzVIJHtDU0l9MG14JHtDU0l9PzI1aGApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFkZG9uLnN0YXRzPy5hY2N1cmFjeSwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3YWl0cyBmb3IgdmFsaWRhdGlvbiBiZWZvcmUgZGVsZXRpbmcgdG8gbGVmdCBvZiBjdXJzb3InLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ID0gZHMuYWRkKGNyZWF0ZU1vY2tUZXJtaW5hbCh7IGxpbmVzOiBbJ2hlbGxvfCddIH0pKTtcblx0XHRcdGFkZG9uLmFjdGl2YXRlKHQudGVybWluYWwpO1xuXG5cdFx0XHQvLyBpbml0aWFsbHkgc2hvdWxkIG5vdCBiYWNrc3BhY2UgKHVudGlsIHRoZSBzZXJ2ZXIgY29uZmlybXMgaXQpXG5cdFx0XHR0Lm9uRGF0YSgnXFx4N0YnKTtcblx0XHRcdHQuZXhwZWN0V3JpdHRlbignJyk7XG5cdFx0XHRleHBlY3RQcm9jZXNzZWQoJ1xcYiBcXGInLCAnXFxiIFxcYicpO1xuXHRcdFx0dC5jdXJzb3IueC0tO1xuXG5cdFx0XHQvLyBlbnRlciBpbnB1dCBvbiB0aGUgY29sdW1uLi4uXG5cdFx0XHR0Lm9uRGF0YSgnbycpO1xuXHRcdFx0b25CZWZvcmVQcm9jZXNzRGF0YS5maXJlKHsgZGF0YTogJ28nIH0pO1xuXHRcdFx0dC5jdXJzb3IueCsrO1xuXHRcdFx0dC5jbGVhcldyaXR0ZW4oKTtcblxuXHRcdFx0Ly8gbm93IHRoYXQgdGhlIGNvbHVtbiBpcyAndW5sb2NrZWQnLCB3ZSBzaG91bGQgYmUgYWJsZSB0byBwcmVkaWN0IGJhY2tzcGFjZSBvbiBpdFxuXHRcdFx0dC5vbkRhdGEoJ1xceDdGJyk7XG5cdFx0XHR0LmV4cGVjdFdyaXR0ZW4oYCR7Q1NJfTI7Nkgke0NTSX1YYCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3YWl0cyBmb3IgZmlyc3QgdmFsaWQgcHJlZGljdGlvbiBvbiBhIGxpbmUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ID0gZHMuYWRkKGNyZWF0ZU1vY2tUZXJtaW5hbCh7IGxpbmVzOiBbJ2hlbGxvfCddIH0pKTtcblx0XHRcdGFkZG9uLmxvY2tNYWtpbmdQcmVkaWN0aW9ucygpO1xuXHRcdFx0YWRkb24uYWN0aXZhdGUodC50ZXJtaW5hbCk7XG5cblx0XHRcdHQub25EYXRhKCdvJyk7XG5cdFx0XHR0LmV4cGVjdFdyaXR0ZW4oJycpO1xuXHRcdFx0ZXhwZWN0UHJvY2Vzc2VkKCdvJywgJ28nKTtcblxuXHRcdFx0dC5vbkRhdGEoJ28nKTtcblx0XHRcdHQuZXhwZWN0V3JpdHRlbihgJHtDU0l9M21vJHtDU0l9MjNtYCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkaXNhYmxlcyBvbiB0aXRsZSBjaGFuZ2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ID0gZHMuYWRkKGNyZWF0ZU1vY2tUZXJtaW5hbCh7IGxpbmVzOiBbJ2hlbGxvfCddIH0pKTtcblx0XHRcdGFkZG9uLmFjdGl2YXRlKHQudGVybWluYWwpO1xuXG5cdFx0XHRhZGRvbi5yZWV2YWx1YXRlTm93KCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWRkb24uaXNTaG93aW5nLCB0cnVlLCAnZXhwZWN0ZWQgdG8gc2hvdyBpbml0aWFsbHknKTtcblxuXHRcdFx0dC5vblRpdGxlQ2hhbmdlLmZpcmUoJ2ZvbyAtIFZJTS5leGUnKTtcblx0XHRcdGFkZG9uLnJlZXZhbHVhdGVOb3coKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZGRvbi5pc1Nob3dpbmcsIGZhbHNlLCAnZXhwZWN0ZWQgdG8gaGlkZSB3aGVuIHZpbSBpcyBvcGVuJyk7XG5cblx0XHRcdHQub25UaXRsZUNoYW5nZS5maXJlKCdmb28gLSBnaXQuZXhlJyk7XG5cdFx0XHRhZGRvbi5yZWV2YWx1YXRlTm93KCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWRkb24uaXNTaG93aW5nLCB0cnVlLCAnZXhwZWN0ZWQgdG8gc2hvdyBhZ2FpbiBhZnRlciB2aW0gY2xvc2VkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhZGRzIGxpbmUgd3JhcCBwcmVkaWN0aW9uIGV2ZW4gaWYgYmVoaW5kIGEgYm91bmRhcnknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ID0gZHMuYWRkKGNyZWF0ZU1vY2tUZXJtaW5hbCh7IGxpbmVzOiBbJ2hlbGxvfCddIH0pKTtcblx0XHRcdGFkZG9uLmxvY2tNYWtpbmdQcmVkaWN0aW9ucygpO1xuXHRcdFx0YWRkb24uYWN0aXZhdGUodC50ZXJtaW5hbCk7XG5cblx0XHRcdHQub25EYXRhKCdoaScucmVwZWF0KDUwKSk7XG5cdFx0XHR0LmV4cGVjdFdyaXR0ZW4oJycpO1xuXHRcdFx0ZXhwZWN0UHJvY2Vzc2VkKCdoaScsIFtcblx0XHRcdFx0YCR7Q1NJfT8yNWxgLCAvLyBoaWRlIGN1cnNvclxuXHRcdFx0XHQnaGknLCAvLyB0aGlzIGdyZWV0aW5nIGNoYXJhY3RlcnNcblx0XHRcdFx0Li4ubmV3IEFycmF5KDM2KS5maWxsKGAke0NTSX0zbWgke0NTSX0yM20ke0NTSX0zbWkke0NTSX0yM21gKSwgLy8gcmVzdCBvZiB0aGUgZ3JlZXRpbmdzIHRoYXQgZml0IG9uIHRoaXMgbGluZVxuXHRcdFx0XHRgJHtDU0l9Mjs4MUhgLCAvLyBtb3ZlIHRvIGVuZCBvZiBsaW5lXG5cdFx0XHRcdGAke0NTSX0/MjVoYFxuXHRcdFx0XS5qb2luKCcnKSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbmNsYXNzIFRlc3RUeXBlQWhlYWRBZGRvbiBleHRlbmRzIFR5cGVBaGVhZEFkZG9uIHtcblx0dW5sb2NrTWFraW5nUHJlZGljdGlvbnMoKSB7XG5cdFx0dGhpcy5fbGFzdFJvdyA9IHsgeTogMSwgc3RhcnRpbmdYOiAxMDAsIGVuZGluZ1g6IDEwMCwgY2hhclN0YXRlOiBDaGFyUHJlZGljdFN0YXRlLlZhbGlkYXRlZCB9O1xuXHR9XG5cblx0bG9ja01ha2luZ1ByZWRpY3Rpb25zKCkge1xuXHRcdHRoaXMuX2xhc3RSb3cgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHR1bmxvY2tOYXZpZ2F0aW5nKCkge1xuXHRcdHRoaXMuX2xhc3RSb3cgPSB7IHk6IDEsIHN0YXJ0aW5nWDogMSwgZW5kaW5nWDogMSwgY2hhclN0YXRlOiBDaGFyUHJlZGljdFN0YXRlLlZhbGlkYXRlZCB9O1xuXHR9XG5cblx0cmVldmFsdWF0ZU5vdygpIHtcblx0XHR0aGlzLl9yZWV2YWx1YXRlUHJlZGljdG9yU3RhdGVOb3codGhpcy5zdGF0cyEsIHRoaXMuX3RpbWVsaW5lISk7XG5cdH1cblxuXHRnZXQgaXNTaG93aW5nKCkge1xuXHRcdHJldHVybiAhIXRoaXMuX3RpbWVsaW5lPy5pc1Nob3dpbmdQcmVkaWN0aW9ucztcblx0fVxuXG5cdHVuZG9BbGxQcmVkaWN0aW9ucygpIHtcblx0XHR0aGlzLl90aW1lbGluZT8udW5kb0FsbFByZWRpY3Rpb25zKCk7XG5cdH1cblxuXHRwaHlzaWNhbEN1cnNvcihidWZmZXI6IElCdWZmZXIpIHtcblx0XHRyZXR1cm4gdGhpcy5fdGltZWxpbmU/LnBoeXNpY2FsQ3Vyc29yKGJ1ZmZlcik7XG5cdH1cblxuXHR0ZW50YXRpdmVDdXJzb3IoYnVmZmVyOiBJQnVmZmVyKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3RpbWVsaW5lPy50ZW50YXRpdmVDdXJzb3IoYnVmZmVyKTtcblx0fVxufVxuXG5mdW5jdGlvbiB1cGNhc3RQYXJ0aWFsPFQ+KHY6IFBhcnRpYWw8VD4pOiBUIHtcblx0cmV0dXJuIHYgYXMgVDtcbn1cblxuZnVuY3Rpb24gY3JlYXRlUHJlZGljdGlvblN0dWJzKG46IG51bWJlcikge1xuXHRyZXR1cm4gbmV3IEFycmF5KG4pLmZpbGwoMCkubWFwKHN0dWJQcmVkaWN0aW9uKTtcbn1cblxuZnVuY3Rpb24gc3R1YlByZWRpY3Rpb24oKTogSVByZWRpY3Rpb24ge1xuXHRyZXR1cm4ge1xuXHRcdGFwcGx5OiAoKSA9PiAnJyxcblx0XHRyb2xsYmFjazogKCkgPT4gJycsXG5cdFx0bWF0Y2hlczogKCkgPT4gMCxcblx0XHRyb2xsRm9yd2FyZHM6ICgpID0+ICcnLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVNb2NrVGVybWluYWwoeyBsaW5lcywgY3Vyc29yQXR0cnMgfToge1xuXHRsaW5lczogc3RyaW5nW107XG5cdGN1cnNvckF0dHJzPzogYW55O1xufSkge1xuXHRjb25zdCBkcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0Y29uc3Qgd3JpdHRlbjogc3RyaW5nW10gPSBbXTtcblx0Y29uc3QgY3Vyc29yID0geyB5OiAxLCB4OiAxIH07XG5cdGNvbnN0IG9uVGl0bGVDaGFuZ2UgPSBkcy5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0Y29uc3Qgb25EYXRhID0gZHMuYWRkKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdGNvbnN0IGNzaUVtaXR0ZXIgPSBkcy5hZGQobmV3IEVtaXR0ZXI8bnVtYmVyW10+KCkpO1xuXG5cdGZvciAobGV0IHkgPSAwOyB5IDwgbGluZXMubGVuZ3RoOyB5KyspIHtcblx0XHRjb25zdCBsaW5lID0gbGluZXNbeV07XG5cdFx0aWYgKGxpbmUuaW5jbHVkZXMoJ3wnKSkge1xuXHRcdFx0Y3Vyc29yLnkgPSB5ICsgMTtcblx0XHRcdGN1cnNvci54ID0gbGluZS5pbmRleE9mKCd8JykgKyAxO1xuXHRcdFx0bGluZXNbeV0gPSBsaW5lLnJlcGxhY2UoJ3wnLCAnJyk7IC8vIENvZGVRTCBbU00wMjM4M10gcmVwbGFjaW5nIHRoZSBmaXJzdCBvY2N1cnJlbmNlIGlzIGludGVuZGVkXG5cdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4ge1xuXHRcdHdyaXR0ZW4sXG5cdFx0Y3Vyc29yLFxuXHRcdGV4cGVjdFdyaXR0ZW46IChzOiBzdHJpbmcpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChKU09OLnN0cmluZ2lmeSh3cml0dGVuLmpvaW4oJycpKSwgSlNPTi5zdHJpbmdpZnkocykpO1xuXHRcdFx0d3JpdHRlbi5zcGxpY2UoMCwgd3JpdHRlbi5sZW5ndGgpO1xuXHRcdH0sXG5cdFx0Y2xlYXJXcml0dGVuOiAoKSA9PiB3cml0dGVuLnNwbGljZSgwLCB3cml0dGVuLmxlbmd0aCksXG5cdFx0b25EYXRhOiAoczogc3RyaW5nKSA9PiBvbkRhdGEuZmlyZShzKSxcblx0XHRjc2lFbWl0dGVyLFxuXHRcdG9uVGl0bGVDaGFuZ2UsXG5cdFx0ZGlzcG9zZTogKCkgPT4gZHMuZGlzcG9zZSgpLFxuXHRcdHRlcm1pbmFsOiB7XG5cdFx0XHRjb2xzOiA4MCxcblx0XHRcdHJvd3M6IDUsXG5cdFx0XHRvblJlc2l6ZTogbmV3IEVtaXR0ZXI8dm9pZD4oKS5ldmVudCxcblx0XHRcdG9uRGF0YTogb25EYXRhLmV2ZW50LFxuXHRcdFx0b25UaXRsZUNoYW5nZTogb25UaXRsZUNoYW5nZS5ldmVudCxcblx0XHRcdHBhcnNlcjoge1xuXHRcdFx0XHRyZWdpc3RlckNzaUhhbmRsZXIoXzogdW5rbm93biwgY2FsbGJhY2s6ICgpID0+IHZvaWQpIHtcblx0XHRcdFx0XHRkcy5hZGQoY3NpRW1pdHRlci5ldmVudChjYWxsYmFjaykpO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHdyaXRlKGxpbmU6IHN0cmluZykge1xuXHRcdFx0XHR3cml0dGVuLnB1c2gobGluZSk7XG5cdFx0XHR9LFxuXHRcdFx0X2NvcmU6IHtcblx0XHRcdFx0X2lucHV0SGFuZGxlcjoge1xuXHRcdFx0XHRcdF9jdXJBdHRyRGF0YTogbW9ja0NlbGwoJycsIGN1cnNvckF0dHJzKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR3cml0ZVN5bmMoKSB7XG5cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGJ1ZmZlcjoge1xuXHRcdFx0XHRhY3RpdmU6IHtcblx0XHRcdFx0XHR0eXBlOiAnbm9ybWFsJyxcblx0XHRcdFx0XHRiYXNlWTogMCxcblx0XHRcdFx0XHRnZXQgY3Vyc29yWSgpIHsgcmV0dXJuIGN1cnNvci55OyB9LFxuXHRcdFx0XHRcdGdldCBjdXJzb3JYKCkgeyByZXR1cm4gY3Vyc29yLng7IH0sXG5cdFx0XHRcdFx0Z2V0TGluZSh5OiBudW1iZXIpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHMgPSBsaW5lc1t5IC0gMV0gfHwgJyc7XG5cdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRsZW5ndGg6IHMubGVuZ3RoLFxuXHRcdFx0XHRcdFx0XHRnZXRDZWxsOiAoeDogbnVtYmVyKSA9PiBtb2NrQ2VsbChzW3ggLSAxXSB8fCAnJyksXG5cdFx0XHRcdFx0XHRcdHRyYW5zbGF0ZVRvU3RyaW5nOiAodHJpbTogYm9vbGVhbiwgc3RhcnQgPSAwLCBlbmQgPSBzLmxlbmd0aCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IG91dCA9IHMuc2xpY2Uoc3RhcnQsIGVuZCk7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHRyaW0gPyBvdXQudHJpbVJpZ2h0KCkgOiBvdXQ7XG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGFzIHVua25vd24gYXMgVGVybWluYWxcblx0fTtcbn1cblxuZnVuY3Rpb24gbW9ja0NlbGwoY2hhcjogc3RyaW5nLCBhdHRyczogeyBba2V5OiBzdHJpbmddOiB1bmtub3duIH0gPSB7fSkge1xuXHRyZXR1cm4gbmV3IFByb3h5KHt9LCB7XG5cdFx0Z2V0KF8sIHByb3ApIHtcblx0XHRcdGlmIChpc1N0cmluZyhwcm9wKSAmJiBhdHRycy5oYXNPd25Qcm9wZXJ0eShwcm9wKSkge1xuXHRcdFx0XHRyZXR1cm4gKCkgPT4gYXR0cnNbcHJvcF07XG5cdFx0XHR9XG5cblx0XHRcdHN3aXRjaCAocHJvcCkge1xuXHRcdFx0XHRjYXNlICdnZXRXaWR0aCc6XG5cdFx0XHRcdFx0cmV0dXJuICgpID0+IDE7XG5cdFx0XHRcdGNhc2UgJ2dldENoYXJzJzpcblx0XHRcdFx0XHRyZXR1cm4gKCkgPT4gY2hhcjtcblx0XHRcdFx0Y2FzZSAnZ2V0Q29kZSc6XG5cdFx0XHRcdFx0cmV0dXJuICgpID0+IGNoYXIuY2hhckNvZGVBdCgwKSB8fCAwO1xuXHRcdFx0XHRjYXNlICdpc0F0dHJpYnV0ZURlZmF1bHQnOlxuXHRcdFx0XHRcdHJldHVybiAoKSA9PiB0cnVlO1xuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdHJldHVybiBTdHJpbmcocHJvcCkuc3RhcnRzV2l0aCgnaXMnKSA/ICgoKSA9PiBmYWxzZSkgOiAoKCkgPT4gMCk7XG5cdFx0XHR9XG5cdFx0fSxcblx0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
