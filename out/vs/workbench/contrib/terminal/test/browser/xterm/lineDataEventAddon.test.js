import { deepStrictEqual } from "assert";
import { importAMDNodeModule } from "../../../../../../amdX.js";
import { OperatingSystem } from "../../../../../../base/common/platform.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { writeP } from "../../../browser/terminalTestHelpers.js";
import { TestXtermLogger } from "../../../../../../platform/terminal/test/common/terminalTestHelpers.js";
import { LineDataEventAddon } from "../../../browser/xterm/lineDataEventAddon.js";
suite("LineDataEventAddon", () => {
  let xterm;
  let lineDataEventAddon;
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  suite("onLineData", () => {
    let events;
    setup(async () => {
      const TerminalCtor = (await importAMDNodeModule("@xterm/xterm", "lib/xterm.js")).Terminal;
      xterm = store.add(new TerminalCtor({ allowProposedApi: true, cols: 4, logger: TestXtermLogger }));
      lineDataEventAddon = store.add(new LineDataEventAddon());
      xterm.loadAddon(lineDataEventAddon);
      events = [];
      store.add(lineDataEventAddon.onLineData((e) => events.push(e)));
    });
    test("should fire when a non-wrapped line ends with a line feed", async () => {
      await writeP(xterm, "foo");
      deepStrictEqual(events, []);
      await writeP(xterm, "\n\r");
      deepStrictEqual(events, ["foo"]);
      await writeP(xterm, "bar");
      deepStrictEqual(events, ["foo"]);
      await writeP(xterm, "\n");
      deepStrictEqual(events, ["foo", "bar"]);
    });
    test("should not fire soft wrapped lines", async () => {
      await writeP(xterm, "foo.");
      deepStrictEqual(events, []);
      await writeP(xterm, "bar.");
      deepStrictEqual(events, []);
      await writeP(xterm, "baz.");
      deepStrictEqual(events, []);
    });
    test("should fire when a wrapped line ends with a line feed", async () => {
      await writeP(xterm, "foo.bar.baz.");
      deepStrictEqual(events, []);
      await writeP(xterm, "\n\r");
      deepStrictEqual(events, ["foo.bar.baz."]);
    });
    test("should not fire on cursor move when the backing process is not on Windows", async () => {
      await writeP(xterm, "foo.\x1B[H");
      deepStrictEqual(events, []);
    });
    test("should fire on cursor move when the backing process is on Windows", async () => {
      lineDataEventAddon.setOperatingSystem(OperatingSystem.Windows);
      await writeP(xterm, "foo\x1B[H");
      deepStrictEqual(events, ["foo"]);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL3Rlc3QvYnJvd3Nlci94dGVybS9saW5lRGF0YUV2ZW50QWRkb24udGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlIHsgVGVybWluYWwgfSBmcm9tICdAeHRlcm0veHRlcm0nO1xuaW1wb3J0IHsgZGVlcFN0cmljdEVxdWFsIH0gZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGltcG9ydEFNRE5vZGVNb2R1bGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9hbWRYLmpzJztcbmltcG9ydCB7IE9wZXJhdGluZ1N5c3RlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgd3JpdGVQIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci90ZXJtaW5hbFRlc3RIZWxwZXJzLmpzJztcbmltcG9ydCB7IFRlc3RYdGVybUxvZ2dlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL3Rlc3QvY29tbW9uL3Rlcm1pbmFsVGVzdEhlbHBlcnMuanMnO1xuaW1wb3J0IHsgTGluZURhdGFFdmVudEFkZG9uIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci94dGVybS9saW5lRGF0YUV2ZW50QWRkb24uanMnO1xuXG5zdWl0ZSgnTGluZURhdGFFdmVudEFkZG9uJywgKCkgPT4ge1xuXHRsZXQgeHRlcm06IFRlcm1pbmFsO1xuXHRsZXQgbGluZURhdGFFdmVudEFkZG9uOiBMaW5lRGF0YUV2ZW50QWRkb247XG5cblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgnb25MaW5lRGF0YScsICgpID0+IHtcblx0XHRsZXQgZXZlbnRzOiBzdHJpbmdbXTtcblxuXHRcdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IFRlcm1pbmFsQ3RvciA9IChhd2FpdCBpbXBvcnRBTUROb2RlTW9kdWxlPHR5cGVvZiBpbXBvcnQoJ0B4dGVybS94dGVybScpPignQHh0ZXJtL3h0ZXJtJywgJ2xpYi94dGVybS5qcycpKS5UZXJtaW5hbDtcblx0XHRcdHh0ZXJtID0gc3RvcmUuYWRkKG5ldyBUZXJtaW5hbEN0b3IoeyBhbGxvd1Byb3Bvc2VkQXBpOiB0cnVlLCBjb2xzOiA0LCBsb2dnZXI6IFRlc3RYdGVybUxvZ2dlciB9KSk7XG5cdFx0XHRsaW5lRGF0YUV2ZW50QWRkb24gPSBzdG9yZS5hZGQobmV3IExpbmVEYXRhRXZlbnRBZGRvbigpKTtcblx0XHRcdHh0ZXJtLmxvYWRBZGRvbihsaW5lRGF0YUV2ZW50QWRkb24pO1xuXG5cdFx0XHRldmVudHMgPSBbXTtcblx0XHRcdHN0b3JlLmFkZChsaW5lRGF0YUV2ZW50QWRkb24ub25MaW5lRGF0YShlID0+IGV2ZW50cy5wdXNoKGUpKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZmlyZSB3aGVuIGEgbm9uLXdyYXBwZWQgbGluZSBlbmRzIHdpdGggYSBsaW5lIGZlZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB3cml0ZVAoeHRlcm0sICdmb28nKTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChldmVudHMsIFtdKTtcblx0XHRcdGF3YWl0IHdyaXRlUCh4dGVybSwgJ1xcblxccicpO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKGV2ZW50cywgWydmb28nXSk7XG5cdFx0XHRhd2FpdCB3cml0ZVAoeHRlcm0sICdiYXInKTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChldmVudHMsIFsnZm9vJ10pO1xuXHRcdFx0YXdhaXQgd3JpdGVQKHh0ZXJtLCAnXFxuJyk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoZXZlbnRzLCBbJ2ZvbycsICdiYXInXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IGZpcmUgc29mdCB3cmFwcGVkIGxpbmVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgd3JpdGVQKHh0ZXJtLCAnZm9vLicpO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKGV2ZW50cywgW10pO1xuXHRcdFx0YXdhaXQgd3JpdGVQKHh0ZXJtLCAnYmFyLicpO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKGV2ZW50cywgW10pO1xuXHRcdFx0YXdhaXQgd3JpdGVQKHh0ZXJtLCAnYmF6LicpO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKGV2ZW50cywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGZpcmUgd2hlbiBhIHdyYXBwZWQgbGluZSBlbmRzIHdpdGggYSBsaW5lIGZlZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB3cml0ZVAoeHRlcm0sICdmb28uYmFyLmJhei4nKTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChldmVudHMsIFtdKTtcblx0XHRcdGF3YWl0IHdyaXRlUCh4dGVybSwgJ1xcblxccicpO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKGV2ZW50cywgWydmb28uYmFyLmJhei4nXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IGZpcmUgb24gY3Vyc29yIG1vdmUgd2hlbiB0aGUgYmFja2luZyBwcm9jZXNzIGlzIG5vdCBvbiBXaW5kb3dzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgd3JpdGVQKHh0ZXJtLCAnZm9vLlxceDFiW0gnKTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChldmVudHMsIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBmaXJlIG9uIGN1cnNvciBtb3ZlIHdoZW4gdGhlIGJhY2tpbmcgcHJvY2VzcyBpcyBvbiBXaW5kb3dzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGluZURhdGFFdmVudEFkZG9uLnNldE9wZXJhdGluZ1N5c3RlbShPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyk7XG5cdFx0XHRhd2FpdCB3cml0ZVAoeHRlcm0sICdmb29cXHgxYltIJyk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoZXZlbnRzLCBbJ2ZvbyddKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsY0FBYztBQUN2QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDBCQUEwQjtBQUVuQyxNQUFNLHNCQUFzQixNQUFNO0FBQ2pDLE1BQUk7QUFDSixNQUFJO0FBRUosUUFBTSxRQUFRLHdDQUF3QztBQUV0RCxRQUFNLGNBQWMsTUFBTTtBQUN6QixRQUFJO0FBRUosVUFBTSxZQUFZO0FBQ2pCLFlBQU0sZ0JBQWdCLE1BQU0sb0JBQW1ELGdCQUFnQixjQUFjLEdBQUc7QUFDaEgsY0FBUSxNQUFNLElBQUksSUFBSSxhQUFhLEVBQUUsa0JBQWtCLE1BQU0sTUFBTSxHQUFHLFFBQVEsZ0JBQWdCLENBQUMsQ0FBQztBQUNoRywyQkFBcUIsTUFBTSxJQUFJLElBQUksbUJBQW1CLENBQUM7QUFDdkQsWUFBTSxVQUFVLGtCQUFrQjtBQUVsQyxlQUFTLENBQUM7QUFDVixZQUFNLElBQUksbUJBQW1CLFdBQVcsT0FBSyxPQUFPLEtBQUssQ0FBQyxDQUFDLENBQUM7QUFBQSxJQUM3RCxDQUFDO0FBRUQsU0FBSyw2REFBNkQsWUFBWTtBQUM3RSxZQUFNLE9BQU8sT0FBTyxLQUFLO0FBQ3pCLHNCQUFnQixRQUFRLENBQUMsQ0FBQztBQUMxQixZQUFNLE9BQU8sT0FBTyxNQUFNO0FBQzFCLHNCQUFnQixRQUFRLENBQUMsS0FBSyxDQUFDO0FBQy9CLFlBQU0sT0FBTyxPQUFPLEtBQUs7QUFDekIsc0JBQWdCLFFBQVEsQ0FBQyxLQUFLLENBQUM7QUFDL0IsWUFBTSxPQUFPLE9BQU8sSUFBSTtBQUN4QixzQkFBZ0IsUUFBUSxDQUFDLE9BQU8sS0FBSyxDQUFDO0FBQUEsSUFDdkMsQ0FBQztBQUVELFNBQUssc0NBQXNDLFlBQVk7QUFDdEQsWUFBTSxPQUFPLE9BQU8sTUFBTTtBQUMxQixzQkFBZ0IsUUFBUSxDQUFDLENBQUM7QUFDMUIsWUFBTSxPQUFPLE9BQU8sTUFBTTtBQUMxQixzQkFBZ0IsUUFBUSxDQUFDLENBQUM7QUFDMUIsWUFBTSxPQUFPLE9BQU8sTUFBTTtBQUMxQixzQkFBZ0IsUUFBUSxDQUFDLENBQUM7QUFBQSxJQUMzQixDQUFDO0FBRUQsU0FBSyx5REFBeUQsWUFBWTtBQUN6RSxZQUFNLE9BQU8sT0FBTyxjQUFjO0FBQ2xDLHNCQUFnQixRQUFRLENBQUMsQ0FBQztBQUMxQixZQUFNLE9BQU8sT0FBTyxNQUFNO0FBQzFCLHNCQUFnQixRQUFRLENBQUMsY0FBYyxDQUFDO0FBQUEsSUFDekMsQ0FBQztBQUVELFNBQUssNkVBQTZFLFlBQVk7QUFDN0YsWUFBTSxPQUFPLE9BQU8sWUFBWTtBQUNoQyxzQkFBZ0IsUUFBUSxDQUFDLENBQUM7QUFBQSxJQUMzQixDQUFDO0FBRUQsU0FBSyxxRUFBcUUsWUFBWTtBQUNyRix5QkFBbUIsbUJBQW1CLGdCQUFnQixPQUFPO0FBQzdELFlBQU0sT0FBTyxPQUFPLFdBQVc7QUFDL0Isc0JBQWdCLFFBQVEsQ0FBQyxLQUFLLENBQUM7QUFBQSxJQUNoQyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
