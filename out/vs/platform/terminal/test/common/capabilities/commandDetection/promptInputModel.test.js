import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { NullLogService } from "../../../../../log/common/log.js";
import { PromptInputModel } from "../../../../common/capabilities/commandDetection/promptInputModel.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { ok, notDeepStrictEqual, strictEqual } from "assert";
import { timeout } from "../../../../../../base/common/async.js";
import { importAMDNodeModule } from "../../../../../../amdX.js";
import { GeneralShellType, PosixShellType } from "../../../../common/terminal.js";
import { runWithFakedTimers } from "../../../../../../base/test/common/timeTravelScheduler.js";
import { TestXtermLogger } from "../../terminalTestHelpers.js";
suite("PromptInputModel", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let promptInputModel;
  let xterm;
  let onCommandStart;
  let onCommandStartChanged;
  let onCommandExecuted;
  let onCommandFinished;
  async function writePromise(data) {
    await new Promise((r) => xterm.write(data, r));
  }
  function fireCommandStart() {
    onCommandStart.fire({ marker: xterm.registerMarker() });
  }
  function fireCommandExecuted() {
    onCommandExecuted.fire(null);
  }
  function fireCommandFinished() {
    onCommandFinished.fire(null);
  }
  function setContinuationPrompt(prompt) {
    promptInputModel.setContinuationPrompt(prompt);
  }
  async function assertPromptInput(valueWithCursor) {
    await timeout(0);
    if (promptInputModel.cursorIndex !== -1 && !valueWithCursor.includes("|")) {
      throw new Error("assertPromptInput must contain | character");
    }
    const actualValueWithCursor = promptInputModel.getCombinedString();
    strictEqual(
      actualValueWithCursor,
      valueWithCursor.replaceAll("\n", "\u23CE")
    );
    const value = valueWithCursor.replace(/[\|\[\]]/g, "");
    const cursorIndex = valueWithCursor.indexOf("|");
    strictEqual(promptInputModel.value, value);
    strictEqual(promptInputModel.cursorIndex, cursorIndex, `value=${promptInputModel.value}`);
    ok(promptInputModel.ghostTextIndex === -1 || cursorIndex <= promptInputModel.ghostTextIndex, `cursorIndex (${cursorIndex}) must be before ghostTextIndex (${promptInputModel.ghostTextIndex})`);
  }
  setup(async () => {
    const TerminalCtor = (await importAMDNodeModule("@xterm/xterm", "lib/xterm.js")).Terminal;
    xterm = store.add(new TerminalCtor({ allowProposedApi: true, logger: TestXtermLogger }));
    onCommandStart = store.add(new Emitter());
    onCommandStartChanged = store.add(new Emitter());
    onCommandExecuted = store.add(new Emitter());
    onCommandFinished = store.add(new Emitter());
    promptInputModel = store.add(new PromptInputModel(xterm, onCommandStart.event, onCommandStartChanged.event, onCommandExecuted.event, onCommandFinished.event, new NullLogService()));
  });
  test("basic input and execute", async () => {
    await writePromise("$ ");
    fireCommandStart();
    await assertPromptInput("|");
    await writePromise("foo bar");
    await assertPromptInput("foo bar|");
    await writePromise("\r\n");
    fireCommandExecuted();
    await assertPromptInput("foo bar");
    await writePromise("(command output)\r\n$ ");
    fireCommandStart();
    await assertPromptInput("|");
  });
  test("should not fire onDidChangeInput events when nothing changes", async () => {
    const events = [];
    store.add(promptInputModel.onDidChangeInput((e) => events.push(e)));
    await writePromise("$ ");
    fireCommandStart();
    await assertPromptInput("|");
    await writePromise("foo");
    await assertPromptInput("foo|");
    await writePromise(" bar");
    await assertPromptInput("foo bar|");
    await writePromise("\r\n");
    fireCommandExecuted();
    await assertPromptInput("foo bar");
    await writePromise("$ ");
    fireCommandStart();
    await assertPromptInput("|");
    await writePromise("foo bar");
    await assertPromptInput("foo bar|");
    for (let i = 0; i < events.length - 1; i++) {
      notDeepStrictEqual(events[i], events[i + 1], "not adjacent events should fire with the same value");
    }
  });
  test("should fire onDidInterrupt followed by onDidFinish when ctrl+c is pressed", async () => {
    await writePromise("$ ");
    fireCommandStart();
    await assertPromptInput("|");
    await writePromise("foo");
    await assertPromptInput("foo|");
    await new Promise((r) => {
      store.add(promptInputModel.onDidInterrupt(() => {
        store.add(promptInputModel.onDidFinishInput(() => {
          r();
        }));
      }));
      xterm.input("");
      writePromise("^C").then(() => fireCommandExecuted());
    });
  });
  test("should clear value when command finishes", async () => {
    await writePromise("$ ");
    fireCommandStart();
    await assertPromptInput("|");
    await writePromise("echo hello");
    await assertPromptInput("echo hello|");
    fireCommandExecuted();
    strictEqual(promptInputModel.value, "echo hello");
    fireCommandFinished();
    strictEqual(promptInputModel.value, "");
  });
  test("cursor navigation", async () => {
    await writePromise("$ ");
    fireCommandStart();
    await assertPromptInput("|");
    await writePromise("foo bar");
    await assertPromptInput("foo bar|");
    await writePromise("\x1B[3D");
    await assertPromptInput("foo |bar");
    await writePromise("\x1B[4D");
    await assertPromptInput("|foo bar");
    await writePromise("\x1B[3C");
    await assertPromptInput("foo| bar");
    await writePromise("\x1B[4C");
    await assertPromptInput("foo bar|");
    await writePromise("\x1B[D");
    await assertPromptInput("foo ba|r");
    await writePromise("\x1B[C");
    await assertPromptInput("foo bar|");
  });
  suite("ghost text", () => {
    test("basic ghost text", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise("foo\x1B[2m bar\x1B[0m\x1B[4D");
      await assertPromptInput("foo|[ bar]");
      await writePromise("\x1B[2D");
      await assertPromptInput("f|oo[ bar]");
    });
    test("trailing whitespace", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise("foo    ");
      await writePromise("\x1B[4D");
      await assertPromptInput("foo|    ");
    });
    test("basic ghost text one word", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise("pw\x1B[2md\x1B[1D");
      await assertPromptInput("pw|[d]");
    });
    test("ghost text with cursor navigation", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise("foo\x1B[2m bar\x1B[0m\x1B[4D");
      await assertPromptInput("foo|[ bar]");
      await writePromise("\x1B[2D");
      await assertPromptInput("f|oo[ bar]");
      await writePromise("\x1B[C");
      await assertPromptInput("fo|o[ bar]");
      await writePromise("\x1B[C");
      await assertPromptInput("foo|[ bar]");
    });
    test("ghost text with different foreground colors only", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise("foo\x1B[38;2;255;0;0m bar\x1B[0m\x1B[4D");
      await assertPromptInput("foo|[ bar]");
      await writePromise("\x1B[2D");
      await assertPromptInput("f|oo[ bar]");
    });
    test("no ghost text when foreground color matches earlier text", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise(
        "\x1B[38;2;255;0;0mred1\x1B[0m \x1B[38;2;0;255;0mgreen\x1B[0m \x1B[38;2;255;0;0mred2\x1B[0m"
        // Red "red2" (same as red1)
      );
      await assertPromptInput("red1 green red2|");
    });
    test("ghost text detected when foreground color is unique at the end", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise(
        "\x1B[38;2;255;0;0mcmd\x1B[0m \x1B[38;2;0;255;0marg\x1B[0m \x1B[38;2;0;0;255mfinal\x1B[5D"
        // Blue "final" (ghost text)
      );
      await assertPromptInput("cmd arg |[final]");
    });
    test("no ghost text when background color matches earlier text", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise(
        "\x1B[48;2;255;0;0mred_bg1\x1B[0m \x1B[48;2;0;255;0mgreen_bg\x1B[0m \x1B[48;2;255;0;0mred_bg2\x1B[0m"
        // Red background again
      );
      await assertPromptInput("red_bg1 green_bg red_bg2|");
    });
    test("ghost text detected when background color is unique at the end", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise(
        "\x1B[48;2;255;0;0mred_bg\x1B[0m \x1B[48;2;0;255;0mgreen_bg\x1B[0m \x1B[48;2;0;0;255mblue_bg\x1B[7D"
        // Blue background (ghost text)
      );
      await assertPromptInput("red_bg green_bg |[blue_bg]");
    });
    test("ghost text detected when bold style is unique at the end", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise(
        "text \x1B[1mBOLD\x1B[4D"
        // Bold "BOLD" (ghost text)
      );
      await assertPromptInput("text |[BOLD]");
    });
    test("no ghost text when earlier text has the same bold style", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise(
        "\x1B[1mBOLD1\x1B[0m normal \x1B[1mBOLD2\x1B[0m"
        // Bold "BOLD2" (same style as "BOLD1")
      );
      await assertPromptInput("BOLD1 normal BOLD2|");
    });
    test("ghost text detected when italic style is unique at the end", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise(
        "text \x1B[3mITALIC\x1B[6D"
        // Italic "ITALIC" (ghost text)
      );
      await assertPromptInput("text |[ITALIC]");
    });
    test("no ghost text when earlier text has the same italic style", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise(
        "\x1B[3mITALIC1\x1B[0m normal \x1B[3mITALIC2\x1B[0m"
        // Italic "ITALIC2" (same style as "ITALIC1")
      );
      await assertPromptInput("ITALIC1 normal ITALIC2|");
    });
    test("ghost text detected when underline style is unique at the end", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise(
        "text \x1B[4mUNDERLINE\x1B[9D"
        // Underlined "UNDERLINE" (ghost text)
      );
      await assertPromptInput("text |[UNDERLINE]");
    });
    test("no ghost text when earlier text has the same underline style", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise(
        "\x1B[4mUNDERLINE1\x1B[0m normal \x1B[4mUNDERLINE2\x1B[0m"
        // Underlined "UNDERLINE2" (same style as "UNDERLINE1")
      );
      await assertPromptInput("UNDERLINE1 normal UNDERLINE2|");
    });
    test("ghost text detected when strikethrough style is unique at the end", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise(
        "text \x1B[9mSTRIKE\x1B[6D"
        // Strikethrough "STRIKE" (ghost text)
      );
      await assertPromptInput("text |[STRIKE]");
    });
    test("no ghost text when earlier text has the same strikethrough style", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise(
        "\x1B[9mSTRIKE1\x1B[0m normal \x1B[9mSTRIKE2\x1B[0m"
        // Strikethrough "STRIKE2" (same style as "STRIKE1")
      );
      await assertPromptInput("STRIKE1 normal STRIKE2|");
    });
    suite("With wrapping", () => {
      test("Fish ghost text in long line with wrapped content", async () => {
        promptInputModel.setShellType(PosixShellType.Fish);
        await writePromise("$ ");
        fireCommandStart();
        await assertPromptInput("|");
        await writePromise("find . -name");
        await assertPromptInput(`find . -name|`);
        await writePromise("\x1B[2m test\x1B[0m\x1B[4D");
        await assertPromptInput(`find . -name |[test]`);
        await writePromise("\x1B[C");
        await assertPromptInput(`find . -name t|[est]`);
        await writePromise("\x1B[C\x1B[C\x1B[C\x1B[C\x1B[C");
        await assertPromptInput(`find . -name test|`);
      });
      test("Pwsh ghost text in long line with wrapped content", async () => {
        promptInputModel.setShellType(GeneralShellType.PowerShell);
        await writePromise("$ ");
        fireCommandStart();
        await assertPromptInput("|");
        await writePromise("find . -name");
        await assertPromptInput(`find . -name|`);
        await writePromise("\x1B[2m test\x1B[0m\x1B[4D");
        await assertPromptInput(`find . -name |[test]`);
        await writePromise("\x1B[C");
        await assertPromptInput(`find . -name t|[est]`);
        await writePromise("\x1B[C\x1B[C\x1B[C\x1B[C\x1B[C");
        await assertPromptInput(`find . -name test|`);
      });
    });
    test("Does not detect right prompt as ghost text", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise("cmd" + " ".repeat(6) + "\x1B[38;2;255;0;0mRP\x1B[0m\x1B[8D");
      await assertPromptInput("cmd|" + " ".repeat(6) + "RP");
    });
  });
  test("wide input (Korean)", async () => {
    await writePromise("$ ");
    fireCommandStart();
    await assertPromptInput("|");
    await writePromise("\uC548\uC601");
    await assertPromptInput("\uC548\uC601|");
    await writePromise("\r\n\uCEF4\uD4E8\uD130");
    await assertPromptInput("\uC548\uC601\n\uCEF4\uD4E8\uD130|");
    await writePromise("\r\n\uC0AC\uB78C");
    await assertPromptInput("\uC548\uC601\n\uCEF4\uD4E8\uD130\n\uC0AC\uB78C|");
    await writePromise("\x1B[G");
    await assertPromptInput("\uC548\uC601\n\uCEF4\uD4E8\uD130\n|\uC0AC\uB78C");
    await writePromise("\x1B[A");
    await assertPromptInput("\uC548\uC601\n|\uCEF4\uD4E8\uD130\n\uC0AC\uB78C");
    await writePromise("\x1B[4C");
    await assertPromptInput("\uC548\uC601\n\uCEF4\uD4E8|\uD130\n\uC0AC\uB78C");
    await writePromise("\x1B[1;4H");
    await assertPromptInput("\uC548|\uC601\n\uCEF4\uD4E8\uD130\n\uC0AC\uB78C");
    await writePromise("\x1B[D");
    await assertPromptInput("|\uC548\uC601\n\uCEF4\uD4E8\uD130\n\uC0AC\uB78C");
  });
  test("emoji input", async () => {
    await writePromise("$ ");
    fireCommandStart();
    await assertPromptInput("|");
    await writePromise("\u270C\uFE0F\u{1F44D}");
    await assertPromptInput("\u270C\uFE0F\u{1F44D}|");
    await writePromise("\r\n\u{1F60E}\u{1F615}\u{1F605}");
    await assertPromptInput("\u270C\uFE0F\u{1F44D}\n\u{1F60E}\u{1F615}\u{1F605}|");
    await writePromise("\r\n\u{1F914}\u{1F937}\u{1F629}");
    await assertPromptInput("\u270C\uFE0F\u{1F44D}\n\u{1F60E}\u{1F615}\u{1F605}\n\u{1F914}\u{1F937}\u{1F629}|");
    await writePromise("\x1B[G");
    await assertPromptInput("\u270C\uFE0F\u{1F44D}\n\u{1F60E}\u{1F615}\u{1F605}\n|\u{1F914}\u{1F937}\u{1F629}");
    await writePromise("\x1B[A");
    await assertPromptInput("\u270C\uFE0F\u{1F44D}\n|\u{1F60E}\u{1F615}\u{1F605}\n\u{1F914}\u{1F937}\u{1F629}");
    await writePromise("\x1B[2C");
    await assertPromptInput("\u270C\uFE0F\u{1F44D}\n\u{1F60E}\u{1F615}|\u{1F605}\n\u{1F914}\u{1F937}\u{1F629}");
    await writePromise("\x1B[1;4H");
    await assertPromptInput("\u270C\uFE0F|\u{1F44D}\n\u{1F60E}\u{1F615}\u{1F605}\n\u{1F914}\u{1F937}\u{1F629}");
    await writePromise("\x1B[D");
    await assertPromptInput("|\u270C\uFE0F\u{1F44D}\n\u{1F60E}\u{1F615}\u{1F605}\n\u{1F914}\u{1F937}\u{1F629}");
  });
  suite("trailing whitespace", () => {
    test("cursor index calculation with whitespace", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise("echo   ");
      await assertPromptInput("echo   |");
      await writePromise("\x1B[3D");
      await assertPromptInput("echo|   ");
      await writePromise("\x1B[C");
      await assertPromptInput("echo |  ");
      await writePromise("\x1B[C");
      await assertPromptInput("echo  | ");
      await writePromise("\x1B[C");
      await assertPromptInput("echo   |");
    });
    test("cursor index should not exceed command line length", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise("cmd");
      await assertPromptInput("cmd|");
      await writePromise("\x1B[10C");
      await assertPromptInput("cmd|");
    });
    test("whitespace preservation in cursor calculation", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise("ls   -la");
      await assertPromptInput("ls   -la|");
      await writePromise("\x1B[3D");
      await assertPromptInput("ls   |-la");
      await writePromise("\x1B[3D");
      await assertPromptInput("ls|   -la");
      await writePromise("\x1B[2C");
      await assertPromptInput("ls  | -la");
    });
    test("delete whitespace with backspace", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise(" ");
      await assertPromptInput(` |`);
      xterm.input("\x7F", true);
      await writePromise("\x1B[D");
      await assertPromptInput("|");
      xterm.input(" ".repeat(4), true);
      await writePromise(" ".repeat(4));
      await assertPromptInput(`    |`);
      xterm.input("\x1B[D".repeat(2), true);
      await writePromise("\x1B[2D");
      await assertPromptInput(`  |  `);
      xterm.input("\x7F", true);
      await writePromise("\x1B[D");
      await assertPromptInput(` |  `);
      xterm.input("\x7F", true);
      await writePromise("\x1B[D");
      await assertPromptInput(`|  `);
      xterm.input(" ", true);
      await writePromise(" ");
      await assertPromptInput(` |  `);
      xterm.input(" ", true);
      await writePromise(" ");
      await assertPromptInput(`  |  `);
      xterm.input("\x1B[C", true);
      await writePromise("\x1B[C");
      await assertPromptInput(`   | `);
      xterm.input("a", true);
      await writePromise("a");
      await assertPromptInput(`   a| `);
      xterm.input("\x7F", true);
      await writePromise("\x1B[D\x1B[K");
      await assertPromptInput(`   | `);
      xterm.input("\x1B[D".repeat(2), true);
      await writePromise("\x1B[2D");
      await assertPromptInput(` |   `);
      xterm.input("\x1B[3~", true);
      await writePromise("");
      await assertPromptInput(` |  `);
    });
    test.skip("track whitespace when ConPTY deletes whitespace unexpectedly", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      xterm.input("ls", true);
      await writePromise("ls");
      await assertPromptInput(`ls|`);
      xterm.input(" ".repeat(4), true);
      await writePromise(" ".repeat(4));
      await assertPromptInput(`ls    |`);
      xterm.input(" ", true);
      await writePromise("\x1B[4D\x1B[5X\x1B[5C");
      await assertPromptInput(`ls     |`);
    });
    test("track whitespace beyond cursor", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise(" ".repeat(8));
      await assertPromptInput(`${" ".repeat(8)}|`);
      await writePromise("\x1B[4D");
      await assertPromptInput(`${" ".repeat(4)}|${" ".repeat(4)}`);
    });
  });
  suite("multi-line", () => {
    test("basic 2 line", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise('echo "a');
      await assertPromptInput(`echo "a|`);
      await writePromise("\n\r\u2219 ");
      setContinuationPrompt("\u2219 ");
      await assertPromptInput(`echo "a
|`);
      await writePromise("b");
      await assertPromptInput(`echo "a
b|`);
    });
    test("basic 3 line", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise('echo "a');
      await assertPromptInput(`echo "a|`);
      await writePromise("\n\r\u2219 ");
      setContinuationPrompt("\u2219 ");
      await assertPromptInput(`echo "a
|`);
      await writePromise("b");
      await assertPromptInput(`echo "a
b|`);
      await writePromise("\n\r\u2219 ");
      setContinuationPrompt("\u2219 ");
      await assertPromptInput(`echo "a
b
|`);
      await writePromise("c");
      await assertPromptInput(`echo "a
b
c|`);
    });
    test("navigate left in multi-line", async () => {
      return runWithFakedTimers({}, async () => {
        await writePromise("$ ");
        fireCommandStart();
        await assertPromptInput("|");
        await writePromise('echo "a');
        await assertPromptInput(`echo "a|`);
        await writePromise("\n\r\u2219 ");
        setContinuationPrompt("\u2219 ");
        await assertPromptInput(`echo "a
|`);
        await writePromise("b");
        await assertPromptInput(`echo "a
b|`);
        await writePromise("\x1B[D");
        await assertPromptInput(`echo "a
|b`);
        await writePromise("\x1B[@c");
        await assertPromptInput(`echo "a
c|b`);
        await writePromise("\x1B[K\n\r\u2219 ");
        await assertPromptInput(`echo "a
c
|`);
        await writePromise("b");
        await assertPromptInput(`echo "a
c
b|`);
        await writePromise(" foo");
        await assertPromptInput(`echo "a
c
b foo|`);
        await writePromise("\x1B[3D");
        await assertPromptInput(`echo "a
c
b |foo`);
      });
    });
    test("navigate up in multi-line", async () => {
      return runWithFakedTimers({}, async () => {
        await writePromise("$ ");
        fireCommandStart();
        await assertPromptInput("|");
        await writePromise('echo "foo');
        await assertPromptInput(`echo "foo|`);
        await writePromise("\n\r\u2219 ");
        setContinuationPrompt("\u2219 ");
        await assertPromptInput(`echo "foo
|`);
        await writePromise("bar");
        await assertPromptInput(`echo "foo
bar|`);
        await writePromise("\n\r\u2219 ");
        setContinuationPrompt("\u2219 ");
        await assertPromptInput(`echo "foo
bar
|`);
        await writePromise("baz");
        await assertPromptInput(`echo "foo
bar
baz|`);
        await writePromise("\x1B[A");
        await assertPromptInput(`echo "foo
bar|
baz`);
        await writePromise("\x1B[D");
        await assertPromptInput(`echo "foo
ba|r
baz`);
        await writePromise("\x1B[D");
        await assertPromptInput(`echo "foo
b|ar
baz`);
        await writePromise("\x1B[D");
        await assertPromptInput(`echo "foo
|bar
baz`);
        await writePromise("\x1B[1;9H");
        await assertPromptInput(`echo "|foo
bar
baz`);
        await writePromise("\x1B[C");
        await assertPromptInput(`echo "f|oo
bar
baz`);
        await writePromise("\x1B[C");
        await assertPromptInput(`echo "fo|o
bar
baz`);
        await writePromise("\x1B[C");
        await assertPromptInput(`echo "foo|
bar
baz`);
      });
    });
    test("navigating up when first line contains invalid/stale trailing whitespace", async () => {
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise('echo "foo      \x1B[6D');
      await assertPromptInput(`echo "foo|`);
      await writePromise("\n\r\u2219 ");
      setContinuationPrompt("\u2219 ");
      await assertPromptInput(`echo "foo
|`);
      await writePromise("bar");
      await assertPromptInput(`echo "foo
bar|`);
      await writePromise("\x1B[D");
      await assertPromptInput(`echo "foo
ba|r`);
      await writePromise("\x1B[D");
      await assertPromptInput(`echo "foo
b|ar`);
      await writePromise("\x1B[D");
      await assertPromptInput(`echo "foo
|bar`);
    });
  });
  suite("multi-line wrapped (no continuation prompt)", () => {
    test("basic wrapped line", async () => {
      return runWithFakedTimers({}, async () => {
        xterm.resize(5, 10);
        await writePromise("$ ");
        fireCommandStart();
        await assertPromptInput("|");
        await writePromise("ech");
        await assertPromptInput(`ech|`);
        await writePromise("o ");
        await assertPromptInput(`echo |`);
        await writePromise('"a"');
        await assertPromptInput(`echo "a"| `);
        await writePromise("\n\r b");
        await assertPromptInput(`echo "a"
 b|`);
        await writePromise("\n\r c");
        await assertPromptInput(`echo "a"
 b
 c|`);
      });
    });
  });
  suite("multi-line wrapped (continuation prompt)", () => {
    test("basic wrapped line", async () => {
      xterm.resize(5, 10);
      promptInputModel.setContinuationPrompt("\u2219 ");
      await writePromise("$ ");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise("ech");
      await assertPromptInput(`ech|`);
      await writePromise("o ");
      await assertPromptInput(`echo |`);
      await writePromise('"a"');
      await assertPromptInput(`echo "a"| `);
      await writePromise("\n\r\u2219 ");
      await assertPromptInput(`echo "a"
|`);
      await writePromise("b");
      await assertPromptInput(`echo "a"
b|`);
      await writePromise("\n\r\u2219 ");
      await assertPromptInput(`echo "a"
b
|`);
      await writePromise("c");
      await assertPromptInput(`echo "a"
b
c|`);
      await writePromise("\n\r\u2219 ");
      await assertPromptInput(`echo "a"
b
c
|`);
    });
  });
  suite("multi-line wrapped fish", () => {
    test("forward slash continuation", async () => {
      promptInputModel.setShellType(PosixShellType.Fish);
      await writePromise("$ ");
      await assertPromptInput("|");
      await writePromise("[I] meganrogge@Megans-MacBook-Pro ~ (main|BISECTING)>");
      fireCommandStart();
      await writePromise("ech\\");
      await assertPromptInput(`ech\\|`);
      await writePromise("\no bye");
      await assertPromptInput(`echo bye|`);
    });
    test("newline with no continuation", async () => {
      promptInputModel.setShellType(PosixShellType.Fish);
      await writePromise("$ ");
      await assertPromptInput("|");
      await writePromise("[I] meganrogge@Megans-MacBook-Pro ~ (main|BISECTING)>");
      fireCommandStart();
      await assertPromptInput("|");
      await writePromise('echo "hi');
      await assertPromptInput(`echo "hi|`);
      await writePromise('\nand bye\nwhy"');
      await assertPromptInput(`echo "hi
and bye
why"|`);
    });
  });
  suite("recorded sessions", () => {
    async function replayEvents(events) {
      for (const data of events) {
        await writePromise(data);
      }
    }
    suite("Windows 11 (10.0.22621.3447), pwsh 7.4.2, starship prompt 1.10.2", () => {
      test("input with ignored ghost text", async () => {
        return runWithFakedTimers({}, async () => {
          await replayEvents([
            "\x1B[?25l\x1B[2J\x1B[m\x1B[H\x1B]0;C:\\Program Files\\WindowsApps\\Microsoft.PowerShell_7.4.2.0_x64__8wekyb3d8bbwe\\pwsh.exe\x07\x1B[?25h",
            "\x1B[?25l\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\x1B[H\x1B[?25h",
            "\x1B]633;P;IsWindows=True\x07",
            "\x1B]633;P;ContinuationPrompt=\x1B[38;5;8m\u2219\x1B[0m \x07",
            "\x1B]633;A\x07\x1B]633;P;Cwd=C:\\Github\\microsoft\\vscode\x07\x1B]633;B\x07",
            "\x1B[34m\r\n\uE0B6\x1B[38;2;17;17;17m\x1B[44m03:13:47 \x1B[34m\x1B[41m\uE0B0 \x1B[38;2;17;17;17mvscode \x1B[31m\x1B[43m\uE0B0 \x1B[38;2;17;17;17m\uE0A0 tyriar/prompt_input_model \x1B[33m\x1B[46m\uE0B0 \x1B[38;2;17;17;17m$\u21E1 \x1B[36m\x1B[49m\uE0B0 \x1B[mvia \x1B[32m\x1B[1m\uE718 v18.18.2 \r\n\u276F\x1B[m "
          ]);
          fireCommandStart();
          await assertPromptInput("|");
          await replayEvents([
            "\x1B[?25l\x1B[93mf\x1B[97m\x1B[2m\x1B[3makecommand\x1B[3;4H\x1B[?25h",
            "\x1B[m",
            "\x1B[93m\bfo\x1B[9X",
            "\x1B[m",
            "\x1B[?25l\x1B[93m\x1B[3;3Hfoo\x1B[?25h",
            "\x1B[m"
          ]);
          await assertPromptInput("foo|");
        });
      });
      test("input with accepted and run ghost text", async () => {
        return runWithFakedTimers({}, async () => {
          await replayEvents([
            "\x1B[?25l\x1B[2J\x1B[m\x1B[H\x1B]0;C:\\Program Files\\WindowsApps\\Microsoft.PowerShell_7.4.2.0_x64__8wekyb3d8bbwe\\pwsh.exe\x07\x1B[?25h",
            "\x1B[?25l\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\x1B[H\x1B[?25h",
            "\x1B]633;P;IsWindows=True\x07",
            "\x1B]633;P;ContinuationPrompt=\x1B[38;5;8m\u2219\x1B[0m \x07",
            "\x1B]633;A\x07\x1B]633;P;Cwd=C:\\Github\\microsoft\\vscode\x07\x1B]633;B\x07",
            "\x1B[34m\r\n\uE0B6\x1B[38;2;17;17;17m\x1B[44m03:41:36 \x1B[34m\x1B[41m\uE0B0 \x1B[38;2;17;17;17mvscode \x1B[31m\x1B[43m\uE0B0 \x1B[38;2;17;17;17m\uE0A0 tyriar/prompt_input_model \x1B[33m\x1B[46m\uE0B0 \x1B[38;2;17;17;17m$ \x1B[36m\x1B[49m\uE0B0 \x1B[mvia \x1B[32m\x1B[1m\uE718 v18.18.2 \r\n\u276F\x1B[m "
          ]);
          promptInputModel.setContinuationPrompt("\u2219 ");
          fireCommandStart();
          await assertPromptInput("|");
          await replayEvents([
            '\x1B[?25l\x1B[93me\x1B[97m\x1B[2m\x1B[3mcho "hello world"\x1B[3;4H\x1B[?25h',
            "\x1B[m"
          ]);
          await assertPromptInput('e|[cho "hello world"]');
          await replayEvents([
            '\x1B[?25l\x1B[93m\bec\x1B[97m\x1B[2m\x1B[3mho "hello world"\x1B[3;5H\x1B[?25h',
            "\x1B[m"
          ]);
          await assertPromptInput('ec|[ho "hello world"]');
          await replayEvents([
            '\x1B[?25l\x1B[93m\x1B[3;3Hech\x1B[97m\x1B[2m\x1B[3mo "hello world"\x1B[3;6H\x1B[?25h',
            "\x1B[m"
          ]);
          await assertPromptInput('ech|[o "hello world"]');
          await replayEvents([
            '\x1B[?25l\x1B[93m\x1B[3;3Hecho\x1B[97m\x1B[2m\x1B[3m "hello world"\x1B[3;7H\x1B[?25h',
            "\x1B[m"
          ]);
          await assertPromptInput('echo|[ "hello world"]');
          await replayEvents([
            '\x1B[?25l\x1B[93m\x1B[3;3Hecho \x1B[97m\x1B[2m\x1B[3m"hello world"\x1B[3;8H\x1B[?25h',
            "\x1B[m"
          ]);
          await assertPromptInput('echo |["hello world"]');
          await replayEvents([
            '\x1B[?25l\x1B[93m\x1B[3;3Hecho \x1B[36m"hello world"\x1B[?25h',
            "\x1B[m"
          ]);
          await assertPromptInput('echo "hello world"|');
          await replayEvents([
            '\x1B]633;E;echo "hello world";ff464d39-bc80-4bae-9ead-b1cafc4adf6f\x07\x1B]633;C\x07'
          ]);
          fireCommandExecuted();
          await assertPromptInput('echo "hello world"');
          await replayEvents([
            "\r\n",
            "hello world\r\n"
          ]);
          await assertPromptInput('echo "hello world"');
          await replayEvents([
            "\x1B]633;D;0\x07\x1B]633;A\x07\x1B]633;P;Cwd=C:\\Github\\microsoft\\vscode\x07\x1B]633;B\x07",
            "\x1B[34m\r\n\uE0B6\x1B[38;2;17;17;17m\x1B[44m03:41:42 \x1B[34m\x1B[41m\uE0B0 \x1B[38;2;17;17;17mvscode \x1B[31m\x1B[43m\uE0B0 \x1B[38;2;17;17;17m\uE0A0 tyriar/prompt_input_model \x1B[33m\x1B[46m\uE0B0 \x1B[38;2;17;17;17m$ \x1B[36m\x1B[49m\uE0B0 \x1B[mvia \x1B[32m\x1B[1m\uE718 v18.18.2 \r\n\u276F\x1B[m "
          ]);
          fireCommandStart();
          await assertPromptInput("|");
        });
      });
      test("input, go to start (ctrl+home), delete word in front (ctrl+delete)", async () => {
        return runWithFakedTimers({}, async () => {
          await replayEvents([
            "\x1B[?25l\x1B[2J\x1B[m\x1B[H\x1B]0;C:Program FilesWindowsAppsMicrosoft.PowerShell_7.4.2.0_x64__8wekyb3d8bbwepwsh.exe\x07\x1B[?25h",
            "\x1B[?25l\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\r\n\x1B[K\x1B[H\x1B[?25h",
            "\x1B]633;P;IsWindows=True\x07",
            "\x1B]633;P;ContinuationPrompt=\x1B[38;5;8m\u2219\x1B[0m \x07",
            "\x1B]633;A\x07\x1B]633;P;Cwd=C:\\Github\\microsoft\\vscode\x07\x1B]633;B\x07",
            "\x1B[34m\r\n\uE0B6\x1B[38;2;17;17;17m\x1B[44m16:07:06 \x1B[34m\x1B[41m\uE0B0 \x1B[38;2;17;17;17mvscode \x1B[31m\x1B[43m\uE0B0 \x1B[38;2;17;17;17m\uE0A0 tyriar/210662 \x1B[33m\x1B[46m\uE0B0 \x1B[38;2;17;17;17m$! \x1B[36m\x1B[49m\uE0B0 \x1B[mvia \x1B[32m\x1B[1m\uE718 v18.18.2 \r\n\u276F\x1B[m "
          ]);
          fireCommandStart();
          await assertPromptInput("|");
          await replayEvents([
            "\x1B[?25l\x1B[93mG\x1B[97m\x1B[2m\x1B[3mit push\x1B[3;4H\x1B[?25h",
            "\x1B[m",
            "\x1B[?25l\x1B[93m\bGe\x1B[97m\x1B[2m\x1B[3mt-ChildItem -Path a\x1B[3;5H\x1B[?25h",
            "\x1B[m",
            "\x1B[?25l\x1B[93m\x1B[3;3HGet\x1B[97m\x1B[2m\x1B[3m-ChildItem -Path a\x1B[3;6H\x1B[?25h"
          ]);
          await assertPromptInput("Get|[-ChildItem -Path a]");
          await replayEvents([
            "\x1B[m",
            "\x1B[?25l\x1B[3;3H\x1B[?25h",
            "\x1B[21X"
          ]);
          await timeout(0);
          const actualValueWithCursor = promptInputModel.getCombinedString();
          strictEqual(
            actualValueWithCursor,
            "|".replaceAll("\n", "\u23CE")
          );
        });
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3Rlcm1pbmFsL3Rlc3QvY29tbW9uL2NhcGFiaWxpdGllcy9jb21tYW5kRGV0ZWN0aW9uL3Byb21wdElucHV0TW9kZWwudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlIHsgVGVybWluYWwgfSBmcm9tICdAeHRlcm0vaGVhZGxlc3MnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IFByb21wdElucHV0TW9kZWwsIHR5cGUgSVByb21wdElucHV0TW9kZWxTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jYXBhYmlsaXRpZXMvY29tbWFuZERldGVjdGlvbi9wcm9tcHRJbnB1dE1vZGVsLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgdHlwZSB7IElUZXJtaW5hbENvbW1hbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY2FwYWJpbGl0aWVzL2NhcGFiaWxpdGllcy5qcyc7XG5pbXBvcnQgeyBvaywgbm90RGVlcFN0cmljdEVxdWFsLCBzdHJpY3RFcXVhbCB9IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgaW1wb3J0QU1ETm9kZU1vZHVsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2FtZFguanMnO1xuaW1wb3J0IHsgR2VuZXJhbFNoZWxsVHlwZSwgUG9zaXhTaGVsbFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgcnVuV2l0aEZha2VkVGltZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi90aW1lVHJhdmVsU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IFRlc3RYdGVybUxvZ2dlciB9IGZyb20gJy4uLy4uL3Rlcm1pbmFsVGVzdEhlbHBlcnMuanMnO1xuXG5zdWl0ZSgnUHJvbXB0SW5wdXRNb2RlbCcsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgcHJvbXB0SW5wdXRNb2RlbDogUHJvbXB0SW5wdXRNb2RlbDtcblx0bGV0IHh0ZXJtOiBUZXJtaW5hbDtcblx0bGV0IG9uQ29tbWFuZFN0YXJ0OiBFbWl0dGVyPElUZXJtaW5hbENvbW1hbmQ+O1xuXHRsZXQgb25Db21tYW5kU3RhcnRDaGFuZ2VkOiBFbWl0dGVyPHZvaWQ+O1xuXHRsZXQgb25Db21tYW5kRXhlY3V0ZWQ6IEVtaXR0ZXI8SVRlcm1pbmFsQ29tbWFuZD47XG5cdGxldCBvbkNvbW1hbmRGaW5pc2hlZDogRW1pdHRlcjxJVGVybWluYWxDb21tYW5kPjtcblxuXHRhc3luYyBmdW5jdGlvbiB3cml0ZVByb21pc2UoZGF0YTogc3RyaW5nKSB7XG5cdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ociA9PiB4dGVybS53cml0ZShkYXRhLCByKSk7XG5cdH1cblxuXHRmdW5jdGlvbiBmaXJlQ29tbWFuZFN0YXJ0KCkge1xuXHRcdG9uQ29tbWFuZFN0YXJ0LmZpcmUoeyBtYXJrZXI6IHh0ZXJtLnJlZ2lzdGVyTWFya2VyKCkgfSBhcyBJVGVybWluYWxDb21tYW5kKTtcblx0fVxuXG5cdGZ1bmN0aW9uIGZpcmVDb21tYW5kRXhlY3V0ZWQoKSB7XG5cdFx0b25Db21tYW5kRXhlY3V0ZWQuZmlyZShudWxsISk7XG5cdH1cblxuXHRmdW5jdGlvbiBmaXJlQ29tbWFuZEZpbmlzaGVkKCkge1xuXHRcdG9uQ29tbWFuZEZpbmlzaGVkLmZpcmUobnVsbCEpO1xuXHR9XG5cblx0ZnVuY3Rpb24gc2V0Q29udGludWF0aW9uUHJvbXB0KHByb21wdDogc3RyaW5nKSB7XG5cdFx0cHJvbXB0SW5wdXRNb2RlbC5zZXRDb250aW51YXRpb25Qcm9tcHQocHJvbXB0KTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIGFzc2VydFByb21wdElucHV0KHZhbHVlV2l0aEN1cnNvcjogc3RyaW5nKSB7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGlmIChwcm9tcHRJbnB1dE1vZGVsLmN1cnNvckluZGV4ICE9PSAtMSAmJiAhdmFsdWVXaXRoQ3Vyc29yLmluY2x1ZGVzKCd8JykpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignYXNzZXJ0UHJvbXB0SW5wdXQgbXVzdCBjb250YWluIHwgY2hhcmFjdGVyJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWN0dWFsVmFsdWVXaXRoQ3Vyc29yID0gcHJvbXB0SW5wdXRNb2RlbC5nZXRDb21iaW5lZFN0cmluZygpO1xuXHRcdHN0cmljdEVxdWFsKFxuXHRcdFx0YWN0dWFsVmFsdWVXaXRoQ3Vyc29yLFxuXHRcdFx0dmFsdWVXaXRoQ3Vyc29yLnJlcGxhY2VBbGwoJ1xcbicsICdcXHUyM0NFJylcblx0XHQpO1xuXG5cdFx0Ly8gVGhpcyBpcyByZXF1aXJlZCB0byBlbnN1cmUgdGhlIGN1cnNvciBpbmRleCBpcyBjb3JyZWN0bHkgcmVzb2x2ZWQgZm9yIG5vbi1hc2NpaSBjaGFyYWN0ZXJzXG5cdFx0Y29uc3QgdmFsdWUgPSB2YWx1ZVdpdGhDdXJzb3IucmVwbGFjZSgvW1xcfFxcW1xcXV0vZywgJycpO1xuXHRcdGNvbnN0IGN1cnNvckluZGV4ID0gdmFsdWVXaXRoQ3Vyc29yLmluZGV4T2YoJ3wnKTtcblx0XHRzdHJpY3RFcXVhbChwcm9tcHRJbnB1dE1vZGVsLnZhbHVlLCB2YWx1ZSk7XG5cdFx0c3RyaWN0RXF1YWwocHJvbXB0SW5wdXRNb2RlbC5jdXJzb3JJbmRleCwgY3Vyc29ySW5kZXgsIGB2YWx1ZT0ke3Byb21wdElucHV0TW9kZWwudmFsdWV9YCk7XG5cdFx0b2socHJvbXB0SW5wdXRNb2RlbC5naG9zdFRleHRJbmRleCA9PT0gLTEgfHwgY3Vyc29ySW5kZXggPD0gcHJvbXB0SW5wdXRNb2RlbC5naG9zdFRleHRJbmRleCwgYGN1cnNvckluZGV4ICgke2N1cnNvckluZGV4fSkgbXVzdCBiZSBiZWZvcmUgZ2hvc3RUZXh0SW5kZXggKCR7cHJvbXB0SW5wdXRNb2RlbC5naG9zdFRleHRJbmRleH0pYCk7XG5cdH1cblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgVGVybWluYWxDdG9yID0gKGF3YWl0IGltcG9ydEFNRE5vZGVNb2R1bGU8dHlwZW9mIGltcG9ydCgnQHh0ZXJtL3h0ZXJtJyk+KCdAeHRlcm0veHRlcm0nLCAnbGliL3h0ZXJtLmpzJykpLlRlcm1pbmFsO1xuXHRcdHh0ZXJtID0gc3RvcmUuYWRkKG5ldyBUZXJtaW5hbEN0b3IoeyBhbGxvd1Byb3Bvc2VkQXBpOiB0cnVlLCBsb2dnZXI6IFRlc3RYdGVybUxvZ2dlciB9KSk7XG5cdFx0b25Db21tYW5kU3RhcnQgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXIoKSk7XG5cdFx0b25Db21tYW5kU3RhcnRDaGFuZ2VkID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyKCkpO1xuXHRcdG9uQ29tbWFuZEV4ZWN1dGVkID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyKCkpO1xuXHRcdG9uQ29tbWFuZEZpbmlzaGVkID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyKCkpO1xuXHRcdHByb21wdElucHV0TW9kZWwgPSBzdG9yZS5hZGQobmV3IFByb21wdElucHV0TW9kZWwoeHRlcm0sIG9uQ29tbWFuZFN0YXJ0LmV2ZW50LCBvbkNvbW1hbmRTdGFydENoYW5nZWQuZXZlbnQsIG9uQ29tbWFuZEV4ZWN1dGVkLmV2ZW50LCBvbkNvbW1hbmRGaW5pc2hlZC5ldmVudCwgbmV3IE51bGxMb2dTZXJ2aWNlKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Jhc2ljIGlucHV0IGFuZCBleGVjdXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnJCAnKTtcblx0XHRmaXJlQ29tbWFuZFN0YXJ0KCk7XG5cdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3wnKTtcblxuXHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnZm9vIGJhcicpO1xuXHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCdmb28gYmFyfCcpO1xuXG5cdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHJcXG4nKTtcblx0XHRmaXJlQ29tbWFuZEV4ZWN1dGVkKCk7XG5cdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ2ZvbyBiYXInKTtcblxuXHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnKGNvbW1hbmQgb3V0cHV0KVxcclxcbiQgJyk7XG5cdFx0ZmlyZUNvbW1hbmRTdGFydCgpO1xuXHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCd8Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBub3QgZmlyZSBvbkRpZENoYW5nZUlucHV0IGV2ZW50cyB3aGVuIG5vdGhpbmcgY2hhbmdlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBldmVudHM6IElQcm9tcHRJbnB1dE1vZGVsU3RhdGVbXSA9IFtdO1xuXHRcdHN0b3JlLmFkZChwcm9tcHRJbnB1dE1vZGVsLm9uRGlkQ2hhbmdlSW5wdXQoZSA9PiBldmVudHMucHVzaChlKSkpO1xuXG5cdFx0YXdhaXQgd3JpdGVQcm9taXNlKCckICcpO1xuXHRcdGZpcmVDb21tYW5kU3RhcnQoKTtcblx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnfCcpO1xuXG5cdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdmb28nKTtcblx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnZm9vfCcpO1xuXG5cdFx0YXdhaXQgd3JpdGVQcm9taXNlKCcgYmFyJyk7XG5cdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ2ZvbyBiYXJ8Jyk7XG5cblx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xcclxcbicpO1xuXHRcdGZpcmVDb21tYW5kRXhlY3V0ZWQoKTtcblx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnZm9vIGJhcicpO1xuXG5cdFx0YXdhaXQgd3JpdGVQcm9taXNlKCckICcpO1xuXHRcdGZpcmVDb21tYW5kU3RhcnQoKTtcblx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnfCcpO1xuXG5cdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdmb28gYmFyJyk7XG5cdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ2ZvbyBiYXJ8Jyk7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGV2ZW50cy5sZW5ndGggLSAxOyBpKyspIHtcblx0XHRcdG5vdERlZXBTdHJpY3RFcXVhbChldmVudHNbaV0sIGV2ZW50c1tpICsgMV0sICdub3QgYWRqYWNlbnQgZXZlbnRzIHNob3VsZCBmaXJlIHdpdGggdGhlIHNhbWUgdmFsdWUnKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBmaXJlIG9uRGlkSW50ZXJydXB0IGZvbGxvd2VkIGJ5IG9uRGlkRmluaXNoIHdoZW4gY3RybCtjIGlzIHByZXNzZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd3JpdGVQcm9taXNlKCckICcpO1xuXHRcdGZpcmVDb21tYW5kU3RhcnQoKTtcblx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnfCcpO1xuXG5cdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdmb28nKTtcblx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnZm9vfCcpO1xuXG5cdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ociA9PiB7XG5cdFx0XHRzdG9yZS5hZGQocHJvbXB0SW5wdXRNb2RlbC5vbkRpZEludGVycnVwdCgoKSA9PiB7XG5cdFx0XHRcdC8vIEZpcmUgb25EaWRGaW5pc2hJbnB1dCBpbW1lZGlhdGVseSBhZnRlciBvbkRpZEludGVycnVwdFxuXHRcdFx0XHRzdG9yZS5hZGQocHJvbXB0SW5wdXRNb2RlbC5vbkRpZEZpbmlzaElucHV0KCgpID0+IHtcblx0XHRcdFx0XHRyKCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH0pKTtcblx0XHRcdHh0ZXJtLmlucHV0KCdcXHgwMycpO1xuXHRcdFx0d3JpdGVQcm9taXNlKCdeQycpLnRoZW4oKCkgPT4gZmlyZUNvbW1hbmRFeGVjdXRlZCgpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGNsZWFyIHZhbHVlIHdoZW4gY29tbWFuZCBmaW5pc2hlcycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3cml0ZVByb21pc2UoJyQgJyk7XG5cdFx0ZmlyZUNvbW1hbmRTdGFydCgpO1xuXHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCd8Jyk7XG5cblx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ2VjaG8gaGVsbG8nKTtcblx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnZWNobyBoZWxsb3wnKTtcblxuXHRcdGZpcmVDb21tYW5kRXhlY3V0ZWQoKTtcblx0XHRzdHJpY3RFcXVhbChwcm9tcHRJbnB1dE1vZGVsLnZhbHVlLCAnZWNobyBoZWxsbycpO1xuXG5cdFx0ZmlyZUNvbW1hbmRGaW5pc2hlZCgpO1xuXHRcdHN0cmljdEVxdWFsKHByb21wdElucHV0TW9kZWwudmFsdWUsICcnKTtcblx0fSk7XG5cblx0dGVzdCgnY3Vyc29yIG5hdmlnYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd3JpdGVQcm9taXNlKCckICcpO1xuXHRcdGZpcmVDb21tYW5kU3RhcnQoKTtcblx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnfCcpO1xuXG5cdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdmb28gYmFyJyk7XG5cdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ2ZvbyBiYXJ8Jyk7XG5cblx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xceDFiWzNEJyk7XG5cdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ2ZvbyB8YmFyJyk7XG5cblx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xceDFiWzREJyk7XG5cdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3xmb28gYmFyJyk7XG5cblx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xceDFiWzNDJyk7XG5cdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ2Zvb3wgYmFyJyk7XG5cblx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xceDFiWzRDJyk7XG5cdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ2ZvbyBiYXJ8Jyk7XG5cblx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xceDFiW0QnKTtcblx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnZm9vIGJhfHInKTtcblxuXHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFx4MWJbQycpO1xuXHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCdmb28gYmFyfCcpO1xuXHR9KTtcblxuXHRzdWl0ZSgnZ2hvc3QgdGV4dCcsICgpID0+IHtcblx0XHR0ZXN0KCdiYXNpYyBnaG9zdCB0ZXh0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCckICcpO1xuXHRcdFx0ZmlyZUNvbW1hbmRTdGFydCgpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3wnKTtcblxuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdmb29cXHgxYlsybSBiYXJcXHgxYlswbVxceDFiWzREJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnZm9vfFsgYmFyXScpO1xuXG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xceDFiWzJEJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnZnxvb1sgYmFyXScpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3RyYWlsaW5nIHdoaXRlc3BhY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJyQgJyk7XG5cdFx0XHRmaXJlQ29tbWFuZFN0YXJ0KCk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnfCcpO1xuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdmb28gICAgJyk7XG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xceDFiWzREJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnZm9vfCAgICAnKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdiYXNpYyBnaG9zdCB0ZXh0IG9uZSB3b3JkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCckICcpO1xuXHRcdFx0ZmlyZUNvbW1hbmRTdGFydCgpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3wnKTtcblxuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdwd1xceDFiWzJtZFxceDFiWzFEJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgncHd8W2RdJyk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnZ2hvc3QgdGV4dCB3aXRoIGN1cnNvciBuYXZpZ2F0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCckICcpO1xuXHRcdFx0ZmlyZUNvbW1hbmRTdGFydCgpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3wnKTtcblxuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdmb29cXHgxYlsybSBiYXJcXHgxYlswbVxceDFiWzREJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnZm9vfFsgYmFyXScpO1xuXG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xceDFiWzJEJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnZnxvb1sgYmFyXScpO1xuXG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xceDFiW0MnKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCdmb3xvWyBiYXJdJyk7XG5cblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFx4MWJbQycpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ2Zvb3xbIGJhcl0nKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdnaG9zdCB0ZXh0IHdpdGggZGlmZmVyZW50IGZvcmVncm91bmQgY29sb3JzIG9ubHknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJyQgJyk7XG5cdFx0XHRmaXJlQ29tbWFuZFN0YXJ0KCk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnfCcpO1xuXG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ2Zvb1xceDFiWzM4OzI7MjU1OzA7MG0gYmFyXFx4MWJbMG1cXHgxYls0RCcpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ2Zvb3xbIGJhcl0nKTtcblxuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHgxYlsyRCcpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ2Z8b29bIGJhcl0nKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdubyBnaG9zdCB0ZXh0IHdoZW4gZm9yZWdyb3VuZCBjb2xvciBtYXRjaGVzIGVhcmxpZXIgdGV4dCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnJCAnKTtcblx0XHRcdGZpcmVDb21tYW5kU3RhcnQoKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCd8Jyk7XG5cblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZShcblx0XHRcdFx0J1xceDFiWzM4OzI7MjU1OzA7MG1yZWQxXFx4MWJbMG0gJyArICAvLyBSZWQgXCJyZWQxXCJcblx0XHRcdFx0J1xceDFiWzM4OzI7MDsyNTU7MG1ncmVlblxceDFiWzBtICcgKyAvLyBHcmVlbiBcImdyZWVuXCJcblx0XHRcdFx0J1xceDFiWzM4OzI7MjU1OzA7MG1yZWQyXFx4MWJbMG0nICAgICAvLyBSZWQgXCJyZWQyXCIgKHNhbWUgYXMgcmVkMSlcblx0XHRcdCk7XG5cblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCdyZWQxIGdyZWVuIHJlZDJ8Jyk7IC8vIE5vIGdob3N0IHRleHQgZXhwZWN0ZWRcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dob3N0IHRleHQgZGV0ZWN0ZWQgd2hlbiBmb3JlZ3JvdW5kIGNvbG9yIGlzIHVuaXF1ZSBhdCB0aGUgZW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCckICcpO1xuXHRcdFx0ZmlyZUNvbW1hbmRTdGFydCgpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3wnKTtcblxuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKFxuXHRcdFx0XHQnXFx4MWJbMzg7MjsyNTU7MDswbWNtZFxceDFiWzBtICcgKyAgIC8vIFJlZCBcImNtZFwiXG5cdFx0XHRcdCdcXHgxYlszODsyOzA7MjU1OzBtYXJnXFx4MWJbMG0gJyArICAgLy8gR3JlZW4gXCJhcmdcIlxuXHRcdFx0XHQnXFx4MWJbMzg7MjswOzA7MjU1bWZpbmFsXFx4MWJbNUQnICAgIC8vIEJsdWUgXCJmaW5hbFwiIChnaG9zdCB0ZXh0KVxuXHRcdFx0KTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ2NtZCBhcmcgfFtmaW5hbF0nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25vIGdob3N0IHRleHQgd2hlbiBiYWNrZ3JvdW5kIGNvbG9yIG1hdGNoZXMgZWFybGllciB0ZXh0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCckICcpO1xuXHRcdFx0ZmlyZUNvbW1hbmRTdGFydCgpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3wnKTtcblxuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKFxuXHRcdFx0XHQnXFx4MWJbNDg7MjsyNTU7MDswbXJlZF9iZzFcXHgxYlswbSAnICsgIC8vIFJlZCBiYWNrZ3JvdW5kXG5cdFx0XHRcdCdcXHgxYls0ODsyOzA7MjU1OzBtZ3JlZW5fYmdcXHgxYlswbSAnICsgLy8gR3JlZW4gYmFja2dyb3VuZFxuXHRcdFx0XHQnXFx4MWJbNDg7MjsyNTU7MDswbXJlZF9iZzJcXHgxYlswbScgICAgIC8vIFJlZCBiYWNrZ3JvdW5kIGFnYWluXG5cdFx0XHQpO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgncmVkX2JnMSBncmVlbl9iZyByZWRfYmcyfCcpOyAvLyBObyBnaG9zdCB0ZXh0IGV4cGVjdGVkXG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnaG9zdCB0ZXh0IGRldGVjdGVkIHdoZW4gYmFja2dyb3VuZCBjb2xvciBpcyB1bmlxdWUgYXQgdGhlIGVuZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnJCAnKTtcblx0XHRcdGZpcmVDb21tYW5kU3RhcnQoKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCd8Jyk7XG5cblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZShcblx0XHRcdFx0J1xceDFiWzQ4OzI7MjU1OzA7MG1yZWRfYmdcXHgxYlswbSAnICsgIC8vIFJlZCBiYWNrZ3JvdW5kXG5cdFx0XHRcdCdcXHgxYls0ODsyOzA7MjU1OzBtZ3JlZW5fYmdcXHgxYlswbSAnICsgLy8gR3JlZW4gYmFja2dyb3VuZFxuXHRcdFx0XHQnXFx4MWJbNDg7MjswOzA7MjU1bWJsdWVfYmdcXHgxYls3RCcgICAgIC8vIEJsdWUgYmFja2dyb3VuZCAoZ2hvc3QgdGV4dClcblx0XHRcdCk7XG5cblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCdyZWRfYmcgZ3JlZW5fYmcgfFtibHVlX2JnXScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2hvc3QgdGV4dCBkZXRlY3RlZCB3aGVuIGJvbGQgc3R5bGUgaXMgdW5pcXVlIGF0IHRoZSBlbmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJyQgJyk7XG5cdFx0XHRmaXJlQ29tbWFuZFN0YXJ0KCk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnfCcpO1xuXG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoXG5cdFx0XHRcdCd0ZXh0ICcgK1xuXHRcdFx0XHQnXFx4MWJbMW1CT0xEXFx4MWJbNEQnIC8vIEJvbGQgXCJCT0xEXCIgKGdob3N0IHRleHQpXG5cdFx0XHQpO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgndGV4dCB8W0JPTERdJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdubyBnaG9zdCB0ZXh0IHdoZW4gZWFybGllciB0ZXh0IGhhcyB0aGUgc2FtZSBib2xkIHN0eWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCckICcpO1xuXHRcdFx0ZmlyZUNvbW1hbmRTdGFydCgpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3wnKTtcblxuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKFxuXHRcdFx0XHQnXFx4MWJbMW1CT0xEMVxceDFiWzBtICcgKyAvLyBCb2xkIFwiQk9MRDFcIlxuXHRcdFx0XHQnbm9ybWFsICcgK1xuXHRcdFx0XHQnXFx4MWJbMW1CT0xEMlxceDFiWzBtJyAgICAvLyBCb2xkIFwiQk9MRDJcIiAoc2FtZSBzdHlsZSBhcyBcIkJPTEQxXCIpXG5cdFx0XHQpO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnQk9MRDEgbm9ybWFsIEJPTEQyfCcpOyAvLyBObyBnaG9zdCB0ZXh0IGV4cGVjdGVkXG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnaG9zdCB0ZXh0IGRldGVjdGVkIHdoZW4gaXRhbGljIHN0eWxlIGlzIHVuaXF1ZSBhdCB0aGUgZW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCckICcpO1xuXHRcdFx0ZmlyZUNvbW1hbmRTdGFydCgpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3wnKTtcblxuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKFxuXHRcdFx0XHQndGV4dCAnICtcblx0XHRcdFx0J1xceDFiWzNtSVRBTElDXFx4MWJbNkQnIC8vIEl0YWxpYyBcIklUQUxJQ1wiIChnaG9zdCB0ZXh0KVxuXHRcdFx0KTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3RleHQgfFtJVEFMSUNdJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdubyBnaG9zdCB0ZXh0IHdoZW4gZWFybGllciB0ZXh0IGhhcyB0aGUgc2FtZSBpdGFsaWMgc3R5bGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJyQgJyk7XG5cdFx0XHRmaXJlQ29tbWFuZFN0YXJ0KCk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnfCcpO1xuXG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoXG5cdFx0XHRcdCdcXHgxYlszbUlUQUxJQzFcXHgxYlswbSAnICsgLy8gSXRhbGljIFwiSVRBTElDMVwiXG5cdFx0XHRcdCdub3JtYWwgJyArXG5cdFx0XHRcdCdcXHgxYlszbUlUQUxJQzJcXHgxYlswbScgICAgLy8gSXRhbGljIFwiSVRBTElDMlwiIChzYW1lIHN0eWxlIGFzIFwiSVRBTElDMVwiKVxuXHRcdFx0KTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ0lUQUxJQzEgbm9ybWFsIElUQUxJQzJ8Jyk7IC8vIE5vIGdob3N0IHRleHQgZXhwZWN0ZWRcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dob3N0IHRleHQgZGV0ZWN0ZWQgd2hlbiB1bmRlcmxpbmUgc3R5bGUgaXMgdW5pcXVlIGF0IHRoZSBlbmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJyQgJyk7XG5cdFx0XHRmaXJlQ29tbWFuZFN0YXJ0KCk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnfCcpO1xuXG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoXG5cdFx0XHRcdCd0ZXh0ICcgK1xuXHRcdFx0XHQnXFx4MWJbNG1VTkRFUkxJTkVcXHgxYls5RCcgLy8gVW5kZXJsaW5lZCBcIlVOREVSTElORVwiIChnaG9zdCB0ZXh0KVxuXHRcdFx0KTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3RleHQgfFtVTkRFUkxJTkVdJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdubyBnaG9zdCB0ZXh0IHdoZW4gZWFybGllciB0ZXh0IGhhcyB0aGUgc2FtZSB1bmRlcmxpbmUgc3R5bGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJyQgJyk7XG5cdFx0XHRmaXJlQ29tbWFuZFN0YXJ0KCk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnfCcpO1xuXG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoXG5cdFx0XHRcdCdcXHgxYls0bVVOREVSTElORTFcXHgxYlswbSAnICsgLy8gVW5kZXJsaW5lZCBcIlVOREVSTElORTFcIlxuXHRcdFx0XHQnbm9ybWFsICcgK1xuXHRcdFx0XHQnXFx4MWJbNG1VTkRFUkxJTkUyXFx4MWJbMG0nICAgIC8vIFVuZGVybGluZWQgXCJVTkRFUkxJTkUyXCIgKHNhbWUgc3R5bGUgYXMgXCJVTkRFUkxJTkUxXCIpXG5cdFx0XHQpO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnVU5ERVJMSU5FMSBub3JtYWwgVU5ERVJMSU5FMnwnKTsgLy8gTm8gZ2hvc3QgdGV4dCBleHBlY3RlZFxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2hvc3QgdGV4dCBkZXRlY3RlZCB3aGVuIHN0cmlrZXRocm91Z2ggc3R5bGUgaXMgdW5pcXVlIGF0IHRoZSBlbmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJyQgJyk7XG5cdFx0XHRmaXJlQ29tbWFuZFN0YXJ0KCk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnfCcpO1xuXG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoXG5cdFx0XHRcdCd0ZXh0ICcgK1xuXHRcdFx0XHQnXFx4MWJbOW1TVFJJS0VcXHgxYls2RCcgLy8gU3RyaWtldGhyb3VnaCBcIlNUUklLRVwiIChnaG9zdCB0ZXh0KVxuXHRcdFx0KTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3RleHQgfFtTVFJJS0VdJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdubyBnaG9zdCB0ZXh0IHdoZW4gZWFybGllciB0ZXh0IGhhcyB0aGUgc2FtZSBzdHJpa2V0aHJvdWdoIHN0eWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCckICcpO1xuXHRcdFx0ZmlyZUNvbW1hbmRTdGFydCgpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3wnKTtcblxuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKFxuXHRcdFx0XHQnXFx4MWJbOW1TVFJJS0UxXFx4MWJbMG0gJyArIC8vIFN0cmlrZXRocm91Z2ggXCJTVFJJS0UxXCJcblx0XHRcdFx0J25vcm1hbCAnICtcblx0XHRcdFx0J1xceDFiWzltU1RSSUtFMlxceDFiWzBtJyAgICAvLyBTdHJpa2V0aHJvdWdoIFwiU1RSSUtFMlwiIChzYW1lIHN0eWxlIGFzIFwiU1RSSUtFMVwiKVxuXHRcdFx0KTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ1NUUklLRTEgbm9ybWFsIFNUUklLRTJ8Jyk7IC8vIE5vIGdob3N0IHRleHQgZXhwZWN0ZWRcblx0XHR9KTtcblx0XHRzdWl0ZSgnV2l0aCB3cmFwcGluZycsICgpID0+IHtcblx0XHRcdHRlc3QoJ0Zpc2ggZ2hvc3QgdGV4dCBpbiBsb25nIGxpbmUgd2l0aCB3cmFwcGVkIGNvbnRlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHByb21wdElucHV0TW9kZWwuc2V0U2hlbGxUeXBlKFBvc2l4U2hlbGxUeXBlLkZpc2gpO1xuXHRcdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJyQgJyk7XG5cdFx0XHRcdGZpcmVDb21tYW5kU3RhcnQoKTtcblx0XHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3wnKTtcblxuXHRcdFx0XHQvLyBXcml0ZSBhIGNvbW1hbmQgd2l0aCBnaG9zdCB0ZXh0IHRoYXQgd2lsbCB3cmFwXG5cdFx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnZmluZCAuIC1uYW1lJyk7XG5cdFx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGBmaW5kIC4gLW5hbWV8YCk7XG5cblx0XHRcdFx0Ly8gQWRkIGdob3N0IHRleHQgd2l0aCBkaW0gc3R5bGVcblx0XHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHgxYlsybSB0ZXN0XFx4MWJbMG1cXHgxYls0RCcpO1xuXHRcdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZmluZCAuIC1uYW1lIHxbdGVzdF1gKTtcblxuXHRcdFx0XHQvLyBNb3ZlIGN1cnNvciB3aXRoaW4gdGhlIGdob3N0IHRleHRcblx0XHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHgxYltDJyk7XG5cdFx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGBmaW5kIC4gLW5hbWUgdHxbZXN0XWApO1xuXG5cdFx0XHRcdC8vIEFjY2VwdCBnaG9zdCB0ZXh0XG5cdFx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFx4MWJbQ1xceDFiW0NcXHgxYltDXFx4MWJbQ1xceDFiW0MnKTtcblx0XHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYGZpbmQgLiAtbmFtZSB0ZXN0fGApO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdQd3NoIGdob3N0IHRleHQgaW4gbG9uZyBsaW5lIHdpdGggd3JhcHBlZCBjb250ZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRwcm9tcHRJbnB1dE1vZGVsLnNldFNoZWxsVHlwZShHZW5lcmFsU2hlbGxUeXBlLlBvd2VyU2hlbGwpO1xuXHRcdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJyQgJyk7XG5cdFx0XHRcdGZpcmVDb21tYW5kU3RhcnQoKTtcblx0XHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3wnKTtcblxuXHRcdFx0XHQvLyBXcml0ZSBhIGNvbW1hbmQgd2l0aCBnaG9zdCB0ZXh0IHRoYXQgd2lsbCB3cmFwXG5cdFx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnZmluZCAuIC1uYW1lJyk7XG5cdFx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGBmaW5kIC4gLW5hbWV8YCk7XG5cblx0XHRcdFx0Ly8gQWRkIGdob3N0IHRleHQgd2l0aCBkaW0gc3R5bGVcblx0XHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHgxYlsybSB0ZXN0XFx4MWJbMG1cXHgxYls0RCcpO1xuXHRcdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZmluZCAuIC1uYW1lIHxbdGVzdF1gKTtcblxuXHRcdFx0XHQvLyBNb3ZlIGN1cnNvciB3aXRoaW4gdGhlIGdob3N0IHRleHRcblx0XHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHgxYltDJyk7XG5cdFx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGBmaW5kIC4gLW5hbWUgdHxbZXN0XWApO1xuXG5cdFx0XHRcdC8vIEFjY2VwdCBnaG9zdCB0ZXh0XG5cdFx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFx4MWJbQ1xceDFiW0NcXHgxYltDXFx4MWJbQ1xceDFiW0MnKTtcblx0XHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYGZpbmQgLiAtbmFtZSB0ZXN0fGApO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnRG9lcyBub3QgZGV0ZWN0IHJpZ2h0IHByb21wdCBhcyBnaG9zdCB0ZXh0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCckICcpO1xuXHRcdFx0ZmlyZUNvbW1hbmRTdGFydCgpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3wnKTtcblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnY21kJyArICcgJy5yZXBlYXQoNikgKyAnXFx4MWJbMzg7MjsyNTU7MDswbVJQXFx4MWJbMG1cXHgxYls4RCcpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ2NtZHwnICsgJyAnLnJlcGVhdCg2KSArICdSUCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3aWRlIGlucHV0IChLb3JlYW4pJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnJCAnKTtcblx0XHRmaXJlQ29tbWFuZFN0YXJ0KCk7XG5cdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3wnKTtcblxuXHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXHVDNTQ4XHVDNjAxJyk7XG5cdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ1x1QzU0OFx1QzYwMXwnKTtcblxuXHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFxyXFxuXHVDRUY0XHVENEU4XHVEMTMwJyk7XG5cdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ1x1QzU0OFx1QzYwMVxcblx1Q0VGNFx1RDRFOFx1RDEzMHwnKTtcblxuXHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFxyXFxuXHVDMEFDXHVCNzhDJyk7XG5cdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ1x1QzU0OFx1QzYwMVxcblx1Q0VGNFx1RDRFOFx1RDEzMFxcblx1QzBBQ1x1Qjc4Q3wnKTtcblxuXHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFx4MWJbRycpO1xuXHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCdcdUM1NDhcdUM2MDFcXG5cdUNFRjRcdUQ0RThcdUQxMzBcXG58XHVDMEFDXHVCNzhDJyk7XG5cblx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xceDFiW0EnKTtcblx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnXHVDNTQ4XHVDNjAxXFxufFx1Q0VGNFx1RDRFOFx1RDEzMFxcblx1QzBBQ1x1Qjc4QycpO1xuXG5cdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHgxYls0QycpO1xuXHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCdcdUM1NDhcdUM2MDFcXG5cdUNFRjRcdUQ0RTh8XHVEMTMwXFxuXHVDMEFDXHVCNzhDJyk7XG5cblx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xceDFiWzE7NEgnKTtcblx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnXHVDNTQ4fFx1QzYwMVxcblx1Q0VGNFx1RDRFOFx1RDEzMFxcblx1QzBBQ1x1Qjc4QycpO1xuXG5cdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHgxYltEJyk7XG5cdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3xcdUM1NDhcdUM2MDFcXG5cdUNFRjRcdUQ0RThcdUQxMzBcXG5cdUMwQUNcdUI3OEMnKTtcblx0fSk7XG5cblx0dGVzdCgnZW1vamkgaW5wdXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd3JpdGVQcm9taXNlKCckICcpO1xuXHRcdGZpcmVDb21tYW5kU3RhcnQoKTtcblx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnfCcpO1xuXG5cdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcdTI3MENcdUZFMEZcdUQ4M0RcdURDNEQnKTtcblx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnXHUyNzBDXHVGRTBGXHVEODNEXHVEQzREfCcpO1xuXG5cdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHJcXG5cdUQ4M0RcdURFMEVcdUQ4M0RcdURFMTVcdUQ4M0RcdURFMDUnKTtcblx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnXHUyNzBDXHVGRTBGXHVEODNEXHVEQzREXFxuXHVEODNEXHVERTBFXHVEODNEXHVERTE1XHVEODNEXHVERTA1fCcpO1xuXG5cdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHJcXG5cdUQ4M0VcdUREMTRcdUQ4M0VcdUREMzdcdUQ4M0RcdURFMjknKTtcblx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnXHUyNzBDXHVGRTBGXHVEODNEXHVEQzREXFxuXHVEODNEXHVERTBFXHVEODNEXHVERTE1XHVEODNEXHVERTA1XFxuXHVEODNFXHVERDE0XHVEODNFXHVERDM3XHVEODNEXHVERTI5fCcpO1xuXG5cdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHgxYltHJyk7XG5cdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ1x1MjcwQ1x1RkUwRlx1RDgzRFx1REM0RFxcblx1RDgzRFx1REUwRVx1RDgzRFx1REUxNVx1RDgzRFx1REUwNVxcbnxcdUQ4M0VcdUREMTRcdUQ4M0VcdUREMzdcdUQ4M0RcdURFMjknKTtcblxuXHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFx4MWJbQScpO1xuXHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCdcdTI3MENcdUZFMEZcdUQ4M0RcdURDNERcXG58XHVEODNEXHVERTBFXHVEODNEXHVERTE1XHVEODNEXHVERTA1XFxuXHVEODNFXHVERDE0XHVEODNFXHVERDM3XHVEODNEXHVERTI5Jyk7XG5cblx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xceDFiWzJDJyk7XG5cdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ1x1MjcwQ1x1RkUwRlx1RDgzRFx1REM0RFxcblx1RDgzRFx1REUwRVx1RDgzRFx1REUxNXxcdUQ4M0RcdURFMDVcXG5cdUQ4M0VcdUREMTRcdUQ4M0VcdUREMzdcdUQ4M0RcdURFMjknKTtcblxuXHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFx4MWJbMTs0SCcpO1xuXHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCdcdTI3MENcdUZFMEZ8XHVEODNEXHVEQzREXFxuXHVEODNEXHVERTBFXHVEODNEXHVERTE1XHVEODNEXHVERTA1XFxuXHVEODNFXHVERDE0XHVEODNFXHVERDM3XHVEODNEXHVERTI5Jyk7XG5cblx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xceDFiW0QnKTtcblx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnfFx1MjcwQ1x1RkUwRlx1RDgzRFx1REM0RFxcblx1RDgzRFx1REUwRVx1RDgzRFx1REUxNVx1RDgzRFx1REUwNVxcblx1RDgzRVx1REQxNFx1RDgzRVx1REQzN1x1RDgzRFx1REUyOScpO1xuXHR9KTtcblxuXHRzdWl0ZSgndHJhaWxpbmcgd2hpdGVzcGFjZScsICgpID0+IHtcblx0XHR0ZXN0KCdjdXJzb3IgaW5kZXggY2FsY3VsYXRpb24gd2l0aCB3aGl0ZXNwYWNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCckICcpO1xuXHRcdFx0ZmlyZUNvbW1hbmRTdGFydCgpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3wnKTtcblxuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdlY2hvICAgJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnZWNobyAgIHwnKTtcblxuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHgxYlszRCcpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ2VjaG98ICAgJyk7XG5cblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFx4MWJbQycpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ2VjaG8gfCAgJyk7XG5cblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFx4MWJbQycpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ2VjaG8gIHwgJyk7XG5cblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFx4MWJbQycpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ2VjaG8gICB8Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjdXJzb3IgaW5kZXggc2hvdWxkIG5vdCBleGNlZWQgY29tbWFuZCBsaW5lIGxlbmd0aCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnJCAnKTtcblx0XHRcdGZpcmVDb21tYW5kU3RhcnQoKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCd8Jyk7XG5cblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnY21kJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnY21kfCcpO1xuXG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xceDFiWzEwQycpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ2NtZHwnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3doaXRlc3BhY2UgcHJlc2VydmF0aW9uIGluIGN1cnNvciBjYWxjdWxhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnJCAnKTtcblx0XHRcdGZpcmVDb21tYW5kU3RhcnQoKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCd8Jyk7XG5cblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnbHMgICAtbGEnKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCdscyAgIC1sYXwnKTtcblxuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHgxYlszRCcpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ2xzICAgfC1sYScpO1xuXG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xceDFiWzNEJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnbHN8ICAgLWxhJyk7XG5cblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFx4MWJbMkMnKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCdscyAgfCAtbGEnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RlbGV0ZSB3aGl0ZXNwYWNlIHdpdGggYmFja3NwYWNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCckICcpO1xuXHRcdFx0ZmlyZUNvbW1hbmRTdGFydCgpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3wnKTtcblxuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCcgJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgIHxgKTtcblxuXHRcdFx0eHRlcm0uaW5wdXQoJ1xceDdGJywgdHJ1ZSk7IC8vIEJhY2tzcGFjZVxuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHgxYltEJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnfCcpO1xuXG5cdFx0XHR4dGVybS5pbnB1dCgnICcucmVwZWF0KDQpLCB0cnVlKTtcblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnICcucmVwZWF0KDQpKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGAgICAgfGApO1xuXG5cdFx0XHR4dGVybS5pbnB1dCgnXFx4MWJbRCcucmVwZWF0KDIpLCB0cnVlKTsgLy8gTGVmdFxuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHgxYlsyRCcpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYCAgfCAgYCk7XG5cblx0XHRcdHh0ZXJtLmlucHV0KCdcXHg3RicsIHRydWUpOyAvLyBCYWNrc3BhY2Vcblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFx4MWJbRCcpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYCB8ICBgKTtcblxuXHRcdFx0eHRlcm0uaW5wdXQoJ1xceDdGJywgdHJ1ZSk7IC8vIEJhY2tzcGFjZVxuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHgxYltEJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgfCAgYCk7XG5cblx0XHRcdHh0ZXJtLmlucHV0KCcgJywgdHJ1ZSk7XG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJyAnKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGAgfCAgYCk7XG5cblx0XHRcdHh0ZXJtLmlucHV0KCcgJywgdHJ1ZSk7XG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJyAnKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGAgIHwgIGApO1xuXG5cdFx0XHR4dGVybS5pbnB1dCgnXFx4MWJbQycsIHRydWUpOyAvLyBSaWdodFxuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHgxYltDJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgICAgfCBgKTtcblxuXHRcdFx0eHRlcm0uaW5wdXQoJ2EnLCB0cnVlKTtcblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnYScpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYCAgIGF8IGApO1xuXG5cdFx0XHR4dGVybS5pbnB1dCgnXFx4N0YnLCB0cnVlKTsgLy8gQmFja3NwYWNlXG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xceDFiW0RcXHgxYltLJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgICAgfCBgKTtcblxuXHRcdFx0eHRlcm0uaW5wdXQoJ1xceDFiW0QnLnJlcGVhdCgyKSwgdHJ1ZSk7IC8vIExlZnRcblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFx4MWJbMkQnKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGAgfCAgIGApO1xuXG5cdFx0XHR4dGVybS5pbnB1dCgnXFx4MWJbM34nLCB0cnVlKTsgLy8gRGVsZXRlXG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJycpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYCB8ICBgKTtcblx0XHR9KTtcblxuXHRcdC8vIFRPRE86IFRoaXMgZG9lc24ndCB3b3JrIGNvcnJlY3RseSBidXQgaXQgZG9lc24ndCBtYXR0ZXIgdG9vIG11Y2ggYXMgaXQgb25seSBoYXBwZW5zIHdoZW5cblx0XHQvLyB0aGVyZSBpcyBhIGxvdCBvZiB3aGl0ZXNwYWNlIGF0IHRoZSBlbmQgb2YgYSBwcm9tcHQgaW5wdXRcblx0XHR0ZXN0LnNraXAoJ3RyYWNrIHdoaXRlc3BhY2Ugd2hlbiBDb25QVFkgZGVsZXRlcyB3aGl0ZXNwYWNlIHVuZXhwZWN0ZWRseScsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnJCAnKTtcblx0XHRcdGZpcmVDb21tYW5kU3RhcnQoKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCd8Jyk7XG5cblx0XHRcdHh0ZXJtLmlucHV0KCdscycsIHRydWUpO1xuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdscycpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYGxzfGApO1xuXG5cdFx0XHR4dGVybS5pbnB1dCgnICcucmVwZWF0KDQpLCB0cnVlKTtcblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnICcucmVwZWF0KDQpKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGBscyAgICB8YCk7XG5cblx0XHRcdHh0ZXJtLmlucHV0KCcgJywgdHJ1ZSk7XG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xceDFiWzREXFx4MWJbNVhcXHgxYls1QycpOyAvLyBDdXJzb3IgbGVmdCB4KE4tMSksIGRlbGV0ZSB4TiwgY3Vyc29yIHJpZ2h0IHhOXG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgbHMgICAgIHxgKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RyYWNrIHdoaXRlc3BhY2UgYmV5b25kIGN1cnNvcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnJCAnKTtcblx0XHRcdGZpcmVDb21tYW5kU3RhcnQoKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCd8Jyk7XG5cblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnICcucmVwZWF0KDgpKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGAkeycgJy5yZXBlYXQoOCl9fGApO1xuXG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xceDFiWzREJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgJHsnICcucmVwZWF0KDQpfXwkeycgJy5yZXBlYXQoNCl9YCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdtdWx0aS1saW5lJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2Jhc2ljIDIgbGluZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnJCAnKTtcblx0XHRcdGZpcmVDb21tYW5kU3RhcnQoKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCd8Jyk7XG5cblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnZWNobyBcImEnKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGBlY2hvIFwiYXxgKTtcblxuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXG5cXHJcXFx1MjIxOSAnKTtcblx0XHRcdHNldENvbnRpbnVhdGlvblByb21wdCgnXHUyMjE5ICcpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYGVjaG8gXCJhXFxufGApO1xuXG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ2InKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGBlY2hvIFwiYVxcbmJ8YCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdiYXNpYyAzIGxpbmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJyQgJyk7XG5cdFx0XHRmaXJlQ29tbWFuZFN0YXJ0KCk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnfCcpO1xuXG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ2VjaG8gXCJhJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZWNobyBcImF8YCk7XG5cblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFxuXFxyXFxcdTIyMTkgJyk7XG5cdFx0XHRzZXRDb250aW51YXRpb25Qcm9tcHQoJ1x1MjIxOSAnKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGBlY2hvIFwiYVxcbnxgKTtcblxuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdiJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZWNobyBcImFcXG5ifGApO1xuXG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xcblxcclxcXHUyMjE5ICcpO1xuXHRcdFx0c2V0Q29udGludWF0aW9uUHJvbXB0KCdcdTIyMTkgJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZWNobyBcImFcXG5iXFxufGApO1xuXG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ2MnKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGBlY2hvIFwiYVxcbmJcXG5jfGApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbmF2aWdhdGUgbGVmdCBpbiBtdWx0aS1saW5lJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJyQgJyk7XG5cdFx0XHRcdGZpcmVDb21tYW5kU3RhcnQoKTtcblx0XHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3wnKTtcblxuXHRcdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ2VjaG8gXCJhJyk7XG5cdFx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGBlY2hvIFwiYXxgKTtcblxuXHRcdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xcblxcclxcXHUyMjE5ICcpO1xuXHRcdFx0XHRzZXRDb250aW51YXRpb25Qcm9tcHQoJ1x1MjIxOSAnKTtcblx0XHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYGVjaG8gXCJhXFxufGApO1xuXG5cdFx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnYicpO1xuXHRcdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZWNobyBcImFcXG5ifGApO1xuXG5cdFx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFx4MWJbRCcpO1xuXHRcdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZWNobyBcImFcXG58YmApO1xuXG5cdFx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFx4MWJbQGMnKTtcblx0XHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYGVjaG8gXCJhXFxuY3xiYCk7XG5cblx0XHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHgxYltLXFxuXFxyXFxcdTIyMTkgJyk7XG5cdFx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGBlY2hvIFwiYVxcbmNcXG58YCk7XG5cblx0XHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdiJyk7XG5cdFx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGBlY2hvIFwiYVxcbmNcXG5ifGApO1xuXG5cdFx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnIGZvbycpO1xuXHRcdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZWNobyBcImFcXG5jXFxuYiBmb298YCk7XG5cblx0XHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHgxYlszRCcpO1xuXHRcdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZWNobyBcImFcXG5jXFxuYiB8Zm9vYCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25hdmlnYXRlIHVwIGluIG11bHRpLWxpbmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnJCAnKTtcblx0XHRcdFx0ZmlyZUNvbW1hbmRTdGFydCgpO1xuXHRcdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnfCcpO1xuXG5cdFx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnZWNobyBcImZvbycpO1xuXHRcdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZWNobyBcImZvb3xgKTtcblxuXHRcdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xcblxcclxcXHUyMjE5ICcpO1xuXHRcdFx0XHRzZXRDb250aW51YXRpb25Qcm9tcHQoJ1x1MjIxOSAnKTtcblx0XHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYGVjaG8gXCJmb29cXG58YCk7XG5cblx0XHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdiYXInKTtcblx0XHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYGVjaG8gXCJmb29cXG5iYXJ8YCk7XG5cblx0XHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXG5cXHJcXFx1MjIxOSAnKTtcblx0XHRcdFx0c2V0Q29udGludWF0aW9uUHJvbXB0KCdcdTIyMTkgJyk7XG5cdFx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGBlY2hvIFwiZm9vXFxuYmFyXFxufGApO1xuXG5cdFx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnYmF6Jyk7XG5cdFx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGBlY2hvIFwiZm9vXFxuYmFyXFxuYmF6fGApO1xuXG5cdFx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFx4MWJbQScpO1xuXHRcdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZWNobyBcImZvb1xcbmJhcnxcXG5iYXpgKTtcblxuXHRcdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xceDFiW0QnKTtcblx0XHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYGVjaG8gXCJmb29cXG5iYXxyXFxuYmF6YCk7XG5cblx0XHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHgxYltEJyk7XG5cdFx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGBlY2hvIFwiZm9vXFxuYnxhclxcbmJhemApO1xuXG5cdFx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFx4MWJbRCcpO1xuXHRcdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZWNobyBcImZvb1xcbnxiYXJcXG5iYXpgKTtcblxuXHRcdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xceDFiWzE7OUgnKTtcblx0XHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYGVjaG8gXCJ8Zm9vXFxuYmFyXFxuYmF6YCk7XG5cblx0XHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHgxYltDJyk7XG5cdFx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGBlY2hvIFwiZnxvb1xcbmJhclxcbmJhemApO1xuXG5cdFx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFx4MWJbQycpO1xuXHRcdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZWNobyBcImZvfG9cXG5iYXJcXG5iYXpgKTtcblxuXHRcdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xceDFiW0MnKTtcblx0XHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYGVjaG8gXCJmb298XFxuYmFyXFxuYmF6YCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25hdmlnYXRpbmcgdXAgd2hlbiBmaXJzdCBsaW5lIGNvbnRhaW5zIGludmFsaWQvc3RhbGUgdHJhaWxpbmcgd2hpdGVzcGFjZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnJCAnKTtcblx0XHRcdGZpcmVDb21tYW5kU3RhcnQoKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCd8Jyk7XG5cblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnZWNobyBcImZvbyAgICAgIFxceDFiWzZEJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZWNobyBcImZvb3xgKTtcblxuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXG5cXHJcXFx1MjIxOSAnKTtcblx0XHRcdHNldENvbnRpbnVhdGlvblByb21wdCgnXHUyMjE5ICcpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYGVjaG8gXCJmb29cXG58YCk7XG5cblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnYmFyJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZWNobyBcImZvb1xcbmJhcnxgKTtcblxuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHgxYltEJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZWNobyBcImZvb1xcbmJhfHJgKTtcblxuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHgxYltEJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZWNobyBcImZvb1xcbmJ8YXJgKTtcblxuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXHgxYltEJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZWNobyBcImZvb1xcbnxiYXJgKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ211bHRpLWxpbmUgd3JhcHBlZCAobm8gY29udGludWF0aW9uIHByb21wdCknLCAoKSA9PiB7XG5cdFx0dGVzdCgnYmFzaWMgd3JhcHBlZCBsaW5lJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR4dGVybS5yZXNpemUoNSwgMTApO1xuXG5cdFx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnJCAnKTtcblx0XHRcdFx0ZmlyZUNvbW1hbmRTdGFydCgpO1xuXHRcdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnfCcpO1xuXG5cdFx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnZWNoJyk7XG5cdFx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGBlY2h8YCk7XG5cblx0XHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdvICcpO1xuXHRcdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZWNobyB8YCk7XG5cblx0XHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcImFcIicpO1xuXHRcdFx0XHQvLyBIQUNLOiBUcmFpbGluZyB3aGl0ZXNwYWNlIGlzIGR1ZSB0byBmbGFreSBkZXRlY3Rpb24gaW4gd3JhcHBlZCBsaW5lcyAoYnV0IGl0IGRvZXNuJ3QgbWF0dGVyIG11Y2gpXG5cdFx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGBlY2hvIFwiYVwifCBgKTtcblx0XHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXG5cXHJcXCBiJyk7XG5cdFx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGBlY2hvIFwiYVwiXFxuIGJ8YCk7XG5cdFx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnXFxuXFxyXFwgYycpO1xuXHRcdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZWNobyBcImFcIlxcbiBiXFxuIGN8YCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cdHN1aXRlKCdtdWx0aS1saW5lIHdyYXBwZWQgKGNvbnRpbnVhdGlvbiBwcm9tcHQpJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2Jhc2ljIHdyYXBwZWQgbGluZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHh0ZXJtLnJlc2l6ZSg1LCAxMCk7XG5cdFx0XHRwcm9tcHRJbnB1dE1vZGVsLnNldENvbnRpbnVhdGlvblByb21wdCgnXHUyMjE5ICcpO1xuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCckICcpO1xuXHRcdFx0ZmlyZUNvbW1hbmRTdGFydCgpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3wnKTtcblxuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdlY2gnKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGBlY2h8YCk7XG5cblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnbyAnKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGBlY2hvIHxgKTtcblxuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcImFcIicpO1xuXHRcdFx0Ly8gSEFDSzogVHJhaWxpbmcgd2hpdGVzcGFjZSBpcyBkdWUgdG8gZmxha3kgZGV0ZWN0aW9uIGluIHdyYXBwZWQgbGluZXMgKGJ1dCBpdCBkb2Vzbid0IG1hdHRlciBtdWNoKVxuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYGVjaG8gXCJhXCJ8IGApO1xuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXG5cXHJcXFx1MjIxOSAnKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGBlY2hvIFwiYVwiXFxufGApO1xuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdiJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZWNobyBcImFcIlxcbmJ8YCk7XG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xcblxcclxcXHUyMjE5ICcpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYGVjaG8gXCJhXCJcXG5iXFxufGApO1xuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdjJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZWNobyBcImFcIlxcbmJcXG5jfGApO1xuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXG5cXHJcXFx1MjIxOSAnKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGBlY2hvIFwiYVwiXFxuYlxcbmNcXG58YCk7XG5cdFx0fSk7XG5cdH0pO1xuXHRzdWl0ZSgnbXVsdGktbGluZSB3cmFwcGVkIGZpc2gnLCAoKSA9PiB7XG5cdFx0dGVzdCgnZm9yd2FyZCBzbGFzaCBjb250aW51YXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRwcm9tcHRJbnB1dE1vZGVsLnNldFNoZWxsVHlwZShQb3NpeFNoZWxsVHlwZS5GaXNoKTtcblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnJCAnKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCd8Jyk7XG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1tJXSBtZWdhbnJvZ2dlQE1lZ2Fucy1NYWNCb29rLVBybyB+IChtYWlufEJJU0VDVElORyk+Jyk7XG5cdFx0XHRmaXJlQ29tbWFuZFN0YXJ0KCk7XG5cblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnZWNoXFxcXCcpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoYGVjaFxcXFx8YCk7XG5cdFx0XHRhd2FpdCB3cml0ZVByb21pc2UoJ1xcbm8gYnllJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZWNobyBieWV8YCk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnbmV3bGluZSB3aXRoIG5vIGNvbnRpbnVhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdHByb21wdElucHV0TW9kZWwuc2V0U2hlbGxUeXBlKFBvc2l4U2hlbGxUeXBlLkZpc2gpO1xuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCckICcpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ3wnKTtcblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnW0ldIG1lZ2Fucm9nZ2VATWVnYW5zLU1hY0Jvb2stUHJvIH4gKG1haW58QklTRUNUSU5HKT4nKTtcblx0XHRcdGZpcmVDb21tYW5kU3RhcnQoKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCd8Jyk7XG5cblx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZSgnZWNobyBcImhpJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dChgZWNobyBcImhpfGApO1xuXHRcdFx0YXdhaXQgd3JpdGVQcm9taXNlKCdcXG5hbmQgYnllXFxud2h5XCInKTtcblx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KGBlY2hvIFwiaGlcXG5hbmQgYnllXFxud2h5XCJ8YCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIFRvIFwicmVjb3JkIGEgc2Vzc2lvblwiIGZvciB0aGVzZSB0ZXN0czpcblx0Ly8gLSBFbmFibGUgZGVidWcgbG9nZ2luZ1xuXHQvLyAtIE9wZW4gYW5kIGNsZWFyIFRlcm1pbmFsIG91dHB1dCBjaGFubmVsXG5cdC8vIC0gT3BlbiB0ZXJtaW5hbCBhbmQgcGVyZm9ybSB0aGUgdGVzdFxuXHQvLyAtIEV4dHJhY3QgYWxsIFwicGFyc2luZyBkYXRhXCIgbGluZXMgZnJvbSB0aGUgdGVybWluYWxcblx0c3VpdGUoJ3JlY29yZGVkIHNlc3Npb25zJywgKCkgPT4ge1xuXHRcdGFzeW5jIGZ1bmN0aW9uIHJlcGxheUV2ZW50cyhldmVudHM6IHN0cmluZ1tdKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGRhdGEgb2YgZXZlbnRzKSB7XG5cdFx0XHRcdGF3YWl0IHdyaXRlUHJvbWlzZShkYXRhKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRzdWl0ZSgnV2luZG93cyAxMSAoMTAuMC4yMjYyMS4zNDQ3KSwgcHdzaCA3LjQuMiwgc3RhcnNoaXAgcHJvbXB0IDEuMTAuMicsICgpID0+IHtcblx0XHRcdHRlc3QoJ2lucHV0IHdpdGggaWdub3JlZCBnaG9zdCB0ZXh0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0YXdhaXQgcmVwbGF5RXZlbnRzKFtcblx0XHRcdFx0XHRcdCdcdTAwMUJbPzI1bFx1MDAxQlsySlx1MDAxQlttXHUwMDFCW0hcdTAwMUJdMDtDOlxcXFxQcm9ncmFtIEZpbGVzXFxcXFdpbmRvd3NBcHBzXFxcXE1pY3Jvc29mdC5Qb3dlclNoZWxsXzcuNC4yLjBfeDY0X184d2VreWIzZDhiYndlXFxcXHB3c2guZXhlXHUwMDA3XHUwMDFCWz8yNWgnLFxuXHRcdFx0XHRcdFx0J1x1MDAxQls/MjVsXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1x1MDAxQltIXHUwMDFCWz8yNWgnLFxuXHRcdFx0XHRcdFx0J1x1MDAxQl02MzM7UDtJc1dpbmRvd3M9VHJ1ZVx1MDAwNycsXG5cdFx0XHRcdFx0XHQnXHUwMDFCXTYzMztQO0NvbnRpbnVhdGlvblByb21wdD1cXHgxYlszOFxceDNiNVxceDNiOG1cdTIyMTlcXHgxYlswbSBcdTAwMDcnLFxuXHRcdFx0XHRcdFx0J1x1MDAxQl02MzM7QVx1MDAwN1x1MDAxQl02MzM7UDtDd2Q9QzpcXHg1Y0dpdGh1YlxceDVjbWljcm9zb2Z0XFx4NWN2c2NvZGVcdTAwMDdcdTAwMUJdNjMzO0JcdTAwMDcnLFxuXHRcdFx0XHRcdFx0J1x1MDAxQlszNG1cXHJcXG5cdUUwQjZcdTAwMUJbMzg7MjsxNzsxNzsxN21cdTAwMUJbNDRtMDM6MTM6NDcgXHUwMDFCWzM0bVx1MDAxQls0MW1cdUUwQjAgXHUwMDFCWzM4OzI7MTc7MTc7MTdtdnNjb2RlIFx1MDAxQlszMW1cdTAwMUJbNDNtXHVFMEIwIFx1MDAxQlszODsyOzE3OzE3OzE3bVx1RTBBMCB0eXJpYXIvcHJvbXB0X2lucHV0X21vZGVsIFx1MDAxQlszM21cdTAwMUJbNDZtXHVFMEIwIFx1MDAxQlszODsyOzE3OzE3OzE3bSRcdTIxRTEgXHUwMDFCWzM2bVx1MDAxQls0OW1cdUUwQjAgXHUwMDFCW212aWEgXHUwMDFCWzMybVx1MDAxQlsxbVx1RTcxOCB2MTguMTguMiBcXHJcXG5cdTI3NkZcdTAwMUJbbSAnLFxuXHRcdFx0XHRcdF0pO1xuXHRcdFx0XHRcdGZpcmVDb21tYW5kU3RhcnQoKTtcblx0XHRcdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnfCcpO1xuXG5cdFx0XHRcdFx0YXdhaXQgcmVwbGF5RXZlbnRzKFtcblx0XHRcdFx0XHRcdCdcdTAwMUJbPzI1bFx1MDAxQls5M21mXHUwMDFCWzk3bVx1MDAxQlsybVx1MDAxQlszbWFrZWNvbW1hbmRcdTAwMUJbMzs0SFx1MDAxQls/MjVoJyxcblx0XHRcdFx0XHRcdCdcdTAwMUJbbScsXG5cdFx0XHRcdFx0XHQnXHUwMDFCWzkzbVxiZm9cdTAwMUJbOVgnLFxuXHRcdFx0XHRcdFx0J1x1MDAxQlttJyxcblx0XHRcdFx0XHRcdCdcdTAwMUJbPzI1bFx1MDAxQls5M21cdTAwMUJbMzszSGZvb1x1MDAxQls/MjVoJyxcblx0XHRcdFx0XHRcdCdcdTAwMUJbbScsXG5cdFx0XHRcdFx0XSk7XG5cdFx0XHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ2Zvb3wnKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2lucHV0IHdpdGggYWNjZXB0ZWQgYW5kIHJ1biBnaG9zdCB0ZXh0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0YXdhaXQgcmVwbGF5RXZlbnRzKFtcblx0XHRcdFx0XHRcdCdcdTAwMUJbPzI1bFx1MDAxQlsySlx1MDAxQlttXHUwMDFCW0hcdTAwMUJdMDtDOlxcXFxQcm9ncmFtIEZpbGVzXFxcXFdpbmRvd3NBcHBzXFxcXE1pY3Jvc29mdC5Qb3dlclNoZWxsXzcuNC4yLjBfeDY0X184d2VreWIzZDhiYndlXFxcXHB3c2guZXhlXHUwMDA3XHUwMDFCWz8yNWgnLFxuXHRcdFx0XHRcdFx0J1x1MDAxQls/MjVsXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1x1MDAxQltIXHUwMDFCWz8yNWgnLFxuXHRcdFx0XHRcdFx0J1x1MDAxQl02MzM7UDtJc1dpbmRvd3M9VHJ1ZVx1MDAwNycsXG5cdFx0XHRcdFx0XHQnXHUwMDFCXTYzMztQO0NvbnRpbnVhdGlvblByb21wdD1cXHgxYlszOFxceDNiNVxceDNiOG1cdTIyMTlcXHgxYlswbSBcdTAwMDcnLFxuXHRcdFx0XHRcdFx0J1x1MDAxQl02MzM7QVx1MDAwN1x1MDAxQl02MzM7UDtDd2Q9QzpcXHg1Y0dpdGh1YlxceDVjbWljcm9zb2Z0XFx4NWN2c2NvZGVcdTAwMDdcdTAwMUJdNjMzO0JcdTAwMDcnLFxuXHRcdFx0XHRcdFx0J1x1MDAxQlszNG1cXHJcXG5cdUUwQjZcdTAwMUJbMzg7MjsxNzsxNzsxN21cdTAwMUJbNDRtMDM6NDE6MzYgXHUwMDFCWzM0bVx1MDAxQls0MW1cdUUwQjAgXHUwMDFCWzM4OzI7MTc7MTc7MTdtdnNjb2RlIFx1MDAxQlszMW1cdTAwMUJbNDNtXHVFMEIwIFx1MDAxQlszODsyOzE3OzE3OzE3bVx1RTBBMCB0eXJpYXIvcHJvbXB0X2lucHV0X21vZGVsIFx1MDAxQlszM21cdTAwMUJbNDZtXHVFMEIwIFx1MDAxQlszODsyOzE3OzE3OzE3bSQgXHUwMDFCWzM2bVx1MDAxQls0OW1cdUUwQjAgXHUwMDFCW212aWEgXHUwMDFCWzMybVx1MDAxQlsxbVx1RTcxOCB2MTguMTguMiBcXHJcXG5cdTI3NkZcdTAwMUJbbSAnLFxuXHRcdFx0XHRcdF0pO1xuXHRcdFx0XHRcdHByb21wdElucHV0TW9kZWwuc2V0Q29udGludWF0aW9uUHJvbXB0KCdcdTIyMTkgJyk7XG5cdFx0XHRcdFx0ZmlyZUNvbW1hbmRTdGFydCgpO1xuXHRcdFx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCd8Jyk7XG5cblx0XHRcdFx0XHRhd2FpdCByZXBsYXlFdmVudHMoW1xuXHRcdFx0XHRcdFx0J1x1MDAxQls/MjVsXHUwMDFCWzkzbWVcdTAwMUJbOTdtXHUwMDFCWzJtXHUwMDFCWzNtY2hvIFwiaGVsbG8gd29ybGRcIlx1MDAxQlszOzRIXHUwMDFCWz8yNWgnLFxuXHRcdFx0XHRcdFx0J1x1MDAxQlttJyxcblx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnZXxbY2hvIFwiaGVsbG8gd29ybGRcIl0nKTtcblxuXHRcdFx0XHRcdGF3YWl0IHJlcGxheUV2ZW50cyhbXG5cdFx0XHRcdFx0XHQnXHUwMDFCWz8yNWxcdTAwMUJbOTNtXGJlY1x1MDAxQls5N21cdTAwMUJbMm1cdTAwMUJbM21obyBcImhlbGxvIHdvcmxkXCJcdTAwMUJbMzs1SFx1MDAxQls/MjVoJyxcblx0XHRcdFx0XHRcdCdcdTAwMUJbbScsXG5cdFx0XHRcdFx0XSk7XG5cdFx0XHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ2VjfFtobyBcImhlbGxvIHdvcmxkXCJdJyk7XG5cblx0XHRcdFx0XHRhd2FpdCByZXBsYXlFdmVudHMoW1xuXHRcdFx0XHRcdFx0J1x1MDAxQls/MjVsXHUwMDFCWzkzbVx1MDAxQlszOzNIZWNoXHUwMDFCWzk3bVx1MDAxQlsybVx1MDAxQlszbW8gXCJoZWxsbyB3b3JsZFwiXHUwMDFCWzM7NkhcdTAwMUJbPzI1aCcsXG5cdFx0XHRcdFx0XHQnXHUwMDFCW20nLFxuXHRcdFx0XHRcdF0pO1xuXHRcdFx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCdlY2h8W28gXCJoZWxsbyB3b3JsZFwiXScpO1xuXG5cdFx0XHRcdFx0YXdhaXQgcmVwbGF5RXZlbnRzKFtcblx0XHRcdFx0XHRcdCdcdTAwMUJbPzI1bFx1MDAxQls5M21cdTAwMUJbMzszSGVjaG9cdTAwMUJbOTdtXHUwMDFCWzJtXHUwMDFCWzNtIFwiaGVsbG8gd29ybGRcIlx1MDAxQlszOzdIXHUwMDFCWz8yNWgnLFxuXHRcdFx0XHRcdFx0J1x1MDAxQlttJyxcblx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnZWNob3xbIFwiaGVsbG8gd29ybGRcIl0nKTtcblxuXHRcdFx0XHRcdGF3YWl0IHJlcGxheUV2ZW50cyhbXG5cdFx0XHRcdFx0XHQnXHUwMDFCWz8yNWxcdTAwMUJbOTNtXHUwMDFCWzM7M0hlY2hvIFx1MDAxQls5N21cdTAwMUJbMm1cdTAwMUJbM21cImhlbGxvIHdvcmxkXCJcdTAwMUJbMzs4SFx1MDAxQls/MjVoJyxcblx0XHRcdFx0XHRcdCdcdTAwMUJbbScsXG5cdFx0XHRcdFx0XSk7XG5cdFx0XHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ2VjaG8gfFtcImhlbGxvIHdvcmxkXCJdJyk7XG5cblx0XHRcdFx0XHRhd2FpdCByZXBsYXlFdmVudHMoW1xuXHRcdFx0XHRcdFx0J1x1MDAxQls/MjVsXHUwMDFCWzkzbVx1MDAxQlszOzNIZWNobyBcdTAwMUJbMzZtXCJoZWxsbyB3b3JsZFwiXHUwMDFCWz8yNWgnLFxuXHRcdFx0XHRcdFx0J1x1MDAxQlttJyxcblx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnZWNobyBcImhlbGxvIHdvcmxkXCJ8Jyk7XG5cblx0XHRcdFx0XHRhd2FpdCByZXBsYXlFdmVudHMoW1xuXHRcdFx0XHRcdFx0J1x1MDAxQl02MzM7RTtlY2hvIFwiaGVsbG8gd29ybGRcIjtmZjQ2NGQzOS1iYzgwLTRiYWUtOWVhZC1iMWNhZmM0YWRmNmZcdTAwMDdcdTAwMUJdNjMzO0NcdTAwMDcnLFxuXHRcdFx0XHRcdF0pO1xuXHRcdFx0XHRcdGZpcmVDb21tYW5kRXhlY3V0ZWQoKTtcblx0XHRcdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnZWNobyBcImhlbGxvIHdvcmxkXCInKTtcblxuXHRcdFx0XHRcdGF3YWl0IHJlcGxheUV2ZW50cyhbXG5cdFx0XHRcdFx0XHQnXFxyXFxuJyxcblx0XHRcdFx0XHRcdCdoZWxsbyB3b3JsZFxcclxcbicsXG5cdFx0XHRcdFx0XSk7XG5cdFx0XHRcdFx0YXdhaXQgYXNzZXJ0UHJvbXB0SW5wdXQoJ2VjaG8gXCJoZWxsbyB3b3JsZFwiJyk7XG5cblx0XHRcdFx0XHRhd2FpdCByZXBsYXlFdmVudHMoW1xuXHRcdFx0XHRcdFx0J1x1MDAxQl02MzM7RDswXHUwMDA3XHUwMDFCXTYzMztBXHUwMDA3XHUwMDFCXTYzMztQO0N3ZD1DOlxceDVjR2l0aHViXFx4NWNtaWNyb3NvZnRcXHg1Y3ZzY29kZVx1MDAwN1x1MDAxQl02MzM7Qlx1MDAwNycsXG5cdFx0XHRcdFx0XHQnXHUwMDFCWzM0bVxcclxcblx1RTBCNlx1MDAxQlszODsyOzE3OzE3OzE3bVx1MDAxQls0NG0wMzo0MTo0MiBcdTAwMUJbMzRtXHUwMDFCWzQxbVx1RTBCMCBcdTAwMUJbMzg7MjsxNzsxNzsxN212c2NvZGUgXHUwMDFCWzMxbVx1MDAxQls0M21cdUUwQjAgXHUwMDFCWzM4OzI7MTc7MTc7MTdtXHVFMEEwIHR5cmlhci9wcm9tcHRfaW5wdXRfbW9kZWwgXHUwMDFCWzMzbVx1MDAxQls0Nm1cdUUwQjAgXHUwMDFCWzM4OzI7MTc7MTc7MTdtJCBcdTAwMUJbMzZtXHUwMDFCWzQ5bVx1RTBCMCBcdTAwMUJbbXZpYSBcdTAwMUJbMzJtXHUwMDFCWzFtXHVFNzE4IHYxOC4xOC4yIFxcclxcblx1Mjc2Rlx1MDAxQlttICcsXG5cdFx0XHRcdFx0XSk7XG5cdFx0XHRcdFx0ZmlyZUNvbW1hbmRTdGFydCgpO1xuXHRcdFx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCd8Jyk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2lucHV0LCBnbyB0byBzdGFydCAoY3RybCtob21lKSwgZGVsZXRlIHdvcmQgaW4gZnJvbnQgKGN0cmwrZGVsZXRlKScsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGF3YWl0IHJlcGxheUV2ZW50cyhbXG5cdFx0XHRcdFx0XHQnXHUwMDFCWz8yNWxcdTAwMUJbMkpcdTAwMUJbbVx1MDAxQltIXHUwMDFCXTA7QzpcXFByb2dyYW0gRmlsZXNcXFdpbmRvd3NBcHBzXFxNaWNyb3NvZnQuUG93ZXJTaGVsbF83LjQuMi4wX3g2NF9fOHdla3liM2Q4YmJ3ZVxccHdzaC5leGVcdTAwMDdcdTAwMUJbPzI1aCcsXG5cdFx0XHRcdFx0XHQnXHUwMDFCWz8yNWxcdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXFxyXFxuXHUwMDFCW0tcXHJcXG5cdTAwMUJbS1xcclxcblx1MDAxQltLXHUwMDFCW0hcdTAwMUJbPzI1aCcsXG5cdFx0XHRcdFx0XHQnXHUwMDFCXTYzMztQO0lzV2luZG93cz1UcnVlXHUwMDA3Jyxcblx0XHRcdFx0XHRcdCdcdTAwMUJdNjMzO1A7Q29udGludWF0aW9uUHJvbXB0PVxceDFiWzM4XFx4M2I1XFx4M2I4bVx1MjIxOVxceDFiWzBtIFx1MDAwNycsXG5cdFx0XHRcdFx0XHQnXHUwMDFCXTYzMztBXHUwMDA3XHUwMDFCXTYzMztQO0N3ZD1DOlxceDVjR2l0aHViXFx4NWNtaWNyb3NvZnRcXHg1Y3ZzY29kZVx1MDAwN1x1MDAxQl02MzM7Qlx1MDAwNycsXG5cdFx0XHRcdFx0XHQnXHUwMDFCWzM0bVxcclxcblx1RTBCNlx1MDAxQlszODsyOzE3OzE3OzE3bVx1MDAxQls0NG0xNjowNzowNiBcdTAwMUJbMzRtXHUwMDFCWzQxbVx1RTBCMCBcdTAwMUJbMzg7MjsxNzsxNzsxN212c2NvZGUgXHUwMDFCWzMxbVx1MDAxQls0M21cdUUwQjAgXHUwMDFCWzM4OzI7MTc7MTc7MTdtXHVFMEEwIHR5cmlhci8yMTA2NjIgXHUwMDFCWzMzbVx1MDAxQls0Nm1cdUUwQjAgXHUwMDFCWzM4OzI7MTc7MTc7MTdtJCEgXHUwMDFCWzM2bVx1MDAxQls0OW1cdUUwQjAgXHUwMDFCW212aWEgXHUwMDFCWzMybVx1MDAxQlsxbVx1RTcxOCB2MTguMTguMiBcXHJcXG5cdTI3NkZcdTAwMUJbbSAnLFxuXHRcdFx0XHRcdF0pO1xuXHRcdFx0XHRcdGZpcmVDb21tYW5kU3RhcnQoKTtcblx0XHRcdFx0XHRhd2FpdCBhc3NlcnRQcm9tcHRJbnB1dCgnfCcpO1xuXG5cdFx0XHRcdFx0YXdhaXQgcmVwbGF5RXZlbnRzKFtcblx0XHRcdFx0XHRcdCdcdTAwMUJbPzI1bFx1MDAxQls5M21HXHUwMDFCWzk3bVx1MDAxQlsybVx1MDAxQlszbWl0IHB1c2hcdTAwMUJbMzs0SFx1MDAxQls/MjVoJyxcblx0XHRcdFx0XHRcdCdcdTAwMUJbbScsXG5cdFx0XHRcdFx0XHQnXHUwMDFCWz8yNWxcdTAwMUJbOTNtXGJHZVx1MDAxQls5N21cdTAwMUJbMm1cdTAwMUJbM210LUNoaWxkSXRlbSAtUGF0aCBhXHUwMDFCWzM7NUhcdTAwMUJbPzI1aCcsXG5cdFx0XHRcdFx0XHQnXHUwMDFCW20nLFxuXHRcdFx0XHRcdFx0J1x1MDAxQls/MjVsXHUwMDFCWzkzbVx1MDAxQlszOzNIR2V0XHUwMDFCWzk3bVx1MDAxQlsybVx1MDAxQlszbS1DaGlsZEl0ZW0gLVBhdGggYVx1MDAxQlszOzZIXHUwMDFCWz8yNWgnLFxuXHRcdFx0XHRcdF0pO1xuXHRcdFx0XHRcdGF3YWl0IGFzc2VydFByb21wdElucHV0KCdHZXR8Wy1DaGlsZEl0ZW0gLVBhdGggYV0nKTtcblxuXHRcdFx0XHRcdGF3YWl0IHJlcGxheUV2ZW50cyhbXG5cdFx0XHRcdFx0XHQnXHUwMDFCW20nLFxuXHRcdFx0XHRcdFx0J1x1MDAxQls/MjVsXHUwMDFCWzM7M0hcdTAwMUJbPzI1aCcsXG5cdFx0XHRcdFx0XHQnXHUwMDFCWzIxWCcsXG5cdFx0XHRcdFx0XSk7XG5cblx0XHRcdFx0XHQvLyBEb24ndCBmb3JjZSBhIHN5bmMsIHRoZSBwcm9tcHQgaW5wdXQgbW9kZWwgc2hvdWxkIHVwZGF0ZSBieSBpdHNlbGZcblx0XHRcdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0XHRcdGNvbnN0IGFjdHVhbFZhbHVlV2l0aEN1cnNvciA9IHByb21wdElucHV0TW9kZWwuZ2V0Q29tYmluZWRTdHJpbmcoKTtcblx0XHRcdFx0XHRzdHJpY3RFcXVhbChcblx0XHRcdFx0XHRcdGFjdHVhbFZhbHVlV2l0aEN1cnNvcixcblx0XHRcdFx0XHRcdCd8Jy5yZXBsYWNlQWxsKCdcXG4nLCAnXFx1MjNDRScpXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsd0JBQXFEO0FBQzlELFNBQVMsZUFBZTtBQUV4QixTQUFT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a0JBQWtCLHVCQUF1QjtBQUUvQyxnQkFBTSxhQUFhO0FBQUEsWUFDbEI7QUFBQSxZQUNBO0FBQUEsVUFDRCxDQUFDO0FBQ0QsZ0JBQU0sa0JBQWtCLHVCQUF1QjtBQUUvQyxnQkFBTSxhQUFhO0FBQUEsWUFDbEI7QUFBQSxZQUNBO0FBQUEsVUFDRCxDQUFDO0FBQ0QsZ0JBQU0sa0JBQWtCLHVCQUF1QjtBQUUvQyxnQkFBTSxhQUFhO0FBQUEsWUFDbEI7QUFBQSxZQUNBO0FBQUEsVUFDRCxDQUFDO0FBQ0QsZ0JBQU0sa0JBQWtCLHFCQUFxQjtBQUU3QyxnQkFBTSxhQUFhO0FBQUEsWUFDbEI7QUFBQSxVQUNELENBQUM7QUFDRCw4QkFBb0I7QUFDcEIsZ0JBQU0sa0JBQWtCLG9CQUFvQjtBQUU1QyxnQkFBTSxhQUFhO0FBQUEsWUFDbEI7QUFBQSxZQUNBO0FBQUEsVUFDRCxDQUFDO0FBQ0QsZ0JBQU0sa0JBQWtCLG9CQUFvQjtBQUU1QyxnQkFBTSxhQUFhO0FBQUEsWUFDbEI7QUFBQSxZQUNBO0FBQUEsVUFDRCxDQUFDO0FBQ0QsMkJBQWlCO0FBQ2pCLGdCQUFNLGtCQUFrQixHQUFHO0FBQUEsUUFDNUIsQ0FBQztBQUFBLE1BQ0YsQ0FBQztBQUVELFdBQUssc0VBQXNFLFlBQVk7QUFDdEYsZUFBTyxtQkFBbUIsQ0FBQyxHQUFHLFlBQVk7QUFDekMsZ0JBQU0sYUFBYTtBQUFBLFlBQ2xCO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNELENBQUM7QUFDRCwyQkFBaUI7QUFDakIsZ0JBQU0sa0JBQWtCLEdBQUc7QUFFM0IsZ0JBQU0sYUFBYTtBQUFBLFlBQ2xCO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0QsQ0FBQztBQUNELGdCQUFNLGtCQUFrQiwwQkFBMEI7QUFFbEQsZ0JBQU0sYUFBYTtBQUFBLFlBQ2xCO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNELENBQUM7QUFHRCxnQkFBTSxRQUFRLENBQUM7QUFDZixnQkFBTSx3QkFBd0IsaUJBQWlCLGtCQUFrQjtBQUNqRTtBQUFBLFlBQ0M7QUFBQSxZQUNBLElBQUksV0FBVyxNQUFNLFFBQVE7QUFBQSxVQUM5QjtBQUFBLFFBQ0QsQ0FBQztBQUFBLE1BQ0YsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
