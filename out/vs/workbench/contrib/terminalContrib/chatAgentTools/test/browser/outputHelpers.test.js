import { ok, strictEqual } from "assert";
import { getOutput, MAX_OUTPUT_LENGTH, truncateLargeOutput } from "../../browser/outputHelpers.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
suite("outputHelpers", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function createMockInstance(lines) {
    const buffer = {
      length: lines.length,
      getLine: (index) => {
        const line = lines[index];
        if (!line) {
          return void 0;
        }
        return {
          isWrapped: !!line.isWrapped,
          translateToString: (trimRight) => trimRight ? line.text.replace(/\s+$/g, "") : line.text
        };
      }
    };
    return {
      xterm: {
        raw: {
          buffer: {
            active: buffer
          }
        }
      }
    };
  }
  test("preserves explicit newline after an 80-column soft wrap", () => {
    const line80 = "A".repeat(80);
    const instance = createMockInstance([
      { text: line80 },
      { text: "X", isWrapped: true },
      { text: "after" }
    ]);
    const output = getOutput(instance);
    strictEqual(output, `${line80}X
after`);
  });
  test("rewinds marker when it starts on a wrapped continuation line", () => {
    const line80 = "A".repeat(80);
    const instance = createMockInstance([
      { text: line80 },
      { text: "X", isWrapped: true },
      { text: "after" }
    ]);
    const marker = { line: 1 };
    const output = getOutput(instance, marker);
    strictEqual(output, `${line80}X
after`);
  });
  test("returns raw JSON without formatting (formatting only in file writer)", () => {
    const instance = createMockInstance([
      { text: '{"items":[1,2],"nested":{"value":true}}' }
    ]);
    const output = getOutput(instance);
    strictEqual(output, '{"items":[1,2],"nested":{"value":true}}');
  });
  test("does not truncate output (callers handle truncation)", () => {
    const line = "a".repeat(1e3);
    const instance = createMockInstance(
      Array.from({ length: 100 }, () => ({ text: line }))
    );
    const output = getOutput(instance);
    strictEqual(output.length, 100 * 1e3 + 99);
  });
  suite("truncateLargeOutput", () => {
    test("truncates with preview header and tail", () => {
      const largeOutput = "a".repeat(3e4);
      const result = truncateLargeOutput(largeOutput);
      strictEqual(result.length, MAX_OUTPUT_LENGTH);
      ok(result.includes("[Output too large"));
      ok(result.includes("[... middle of output truncated ...]"));
    });
    test("includes both head preview and tail", () => {
      const head = "HEAD_CONTENT_" + "x".repeat(487);
      const middle = "m".repeat(29e3);
      const tail = "TAIL_CONTENT_" + "z".repeat(487);
      const largeOutput = head + middle + tail;
      const result = truncateLargeOutput(largeOutput);
      ok(result.includes("HEAD_CONTENT_"), "should include head preview");
      ok(result.includes("TAIL_CONTENT_"), "should include tail");
      ok(result.length <= MAX_OUTPUT_LENGTH);
    });
    test("includes file path when provided", () => {
      const largeOutput = "x".repeat(3e4);
      const result = truncateLargeOutput(largeOutput, "/tmp/copilot-terminal-output-abc.txt");
      ok(result.includes("/tmp/copilot-terminal-output-abc.txt"));
      ok(result.includes("readFile"));
      ok(result.includes("grep"));
      ok(result.length <= MAX_OUTPUT_LENGTH);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy90ZXN0L2Jyb3dzZXIvb3V0cHV0SGVscGVycy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgb2ssIHN0cmljdEVxdWFsIH0gZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB0eXBlIHsgSU1hcmtlciBhcyBJWHRlcm1NYXJrZXIgfSBmcm9tICdAeHRlcm0veHRlcm0nO1xuaW1wb3J0IHR5cGUgeyBJVGVybWluYWxJbnN0YW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWwuanMnO1xuaW1wb3J0IHsgZ2V0T3V0cHV0LCBNQVhfT1VUUFVUX0xFTkdUSCwgdHJ1bmNhdGVMYXJnZU91dHB1dCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvb3V0cHV0SGVscGVycy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcblxuc3VpdGUoJ291dHB1dEhlbHBlcnMnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHRmdW5jdGlvbiBjcmVhdGVNb2NrSW5zdGFuY2UobGluZXM6IHsgdGV4dDogc3RyaW5nOyBpc1dyYXBwZWQ/OiBib29sZWFuIH1bXSk6IElUZXJtaW5hbEluc3RhbmNlIHtcblx0XHRjb25zdCBidWZmZXIgPSB7XG5cdFx0XHRsZW5ndGg6IGxpbmVzLmxlbmd0aCxcblx0XHRcdGdldExpbmU6IChpbmRleDogbnVtYmVyKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGxpbmUgPSBsaW5lc1tpbmRleF07XG5cdFx0XHRcdGlmICghbGluZSkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRpc1dyYXBwZWQ6ICEhbGluZS5pc1dyYXBwZWQsXG5cdFx0XHRcdFx0dHJhbnNsYXRlVG9TdHJpbmc6ICh0cmltUmlnaHQ/OiBib29sZWFuKSA9PiB0cmltUmlnaHQgPyBsaW5lLnRleHQucmVwbGFjZSgvXFxzKyQvZywgJycpIDogbGluZS50ZXh0XG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0eHRlcm06IHtcblx0XHRcdFx0cmF3OiB7XG5cdFx0XHRcdFx0YnVmZmVyOiB7XG5cdFx0XHRcdFx0XHRhY3RpdmU6IGJ1ZmZlclxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gYXMgdW5rbm93biBhcyBJVGVybWluYWxJbnN0YW5jZTtcblx0fVxuXG5cdHRlc3QoJ3ByZXNlcnZlcyBleHBsaWNpdCBuZXdsaW5lIGFmdGVyIGFuIDgwLWNvbHVtbiBzb2Z0IHdyYXAnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGluZTgwID0gJ0EnLnJlcGVhdCg4MCk7XG5cdFx0Y29uc3QgaW5zdGFuY2UgPSBjcmVhdGVNb2NrSW5zdGFuY2UoW1xuXHRcdFx0eyB0ZXh0OiBsaW5lODAgfSxcblx0XHRcdHsgdGV4dDogJ1gnLCBpc1dyYXBwZWQ6IHRydWUgfSxcblx0XHRcdHsgdGV4dDogJ2FmdGVyJyB9XG5cdFx0XSk7XG5cblx0XHRjb25zdCBvdXRwdXQgPSBnZXRPdXRwdXQoaW5zdGFuY2UpO1xuXHRcdHN0cmljdEVxdWFsKG91dHB1dCwgYCR7bGluZTgwfVhcXG5hZnRlcmApO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXdpbmRzIG1hcmtlciB3aGVuIGl0IHN0YXJ0cyBvbiBhIHdyYXBwZWQgY29udGludWF0aW9uIGxpbmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGluZTgwID0gJ0EnLnJlcGVhdCg4MCk7XG5cdFx0Y29uc3QgaW5zdGFuY2UgPSBjcmVhdGVNb2NrSW5zdGFuY2UoW1xuXHRcdFx0eyB0ZXh0OiBsaW5lODAgfSxcblx0XHRcdHsgdGV4dDogJ1gnLCBpc1dyYXBwZWQ6IHRydWUgfSxcblx0XHRcdHsgdGV4dDogJ2FmdGVyJyB9XG5cdFx0XSk7XG5cblx0XHRjb25zdCBtYXJrZXIgPSB7IGxpbmU6IDEgfSBhcyBJWHRlcm1NYXJrZXI7XG5cdFx0Y29uc3Qgb3V0cHV0ID0gZ2V0T3V0cHV0KGluc3RhbmNlLCBtYXJrZXIpO1xuXHRcdHN0cmljdEVxdWFsKG91dHB1dCwgYCR7bGluZTgwfVhcXG5hZnRlcmApO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIHJhdyBKU09OIHdpdGhvdXQgZm9ybWF0dGluZyAoZm9ybWF0dGluZyBvbmx5IGluIGZpbGUgd3JpdGVyKScsICgpID0+IHtcblx0XHRjb25zdCBpbnN0YW5jZSA9IGNyZWF0ZU1vY2tJbnN0YW5jZShbXG5cdFx0XHR7IHRleHQ6ICd7XCJpdGVtc1wiOlsxLDJdLFwibmVzdGVkXCI6e1widmFsdWVcIjp0cnVlfX0nIH1cblx0XHRdKTtcblxuXHRcdGNvbnN0IG91dHB1dCA9IGdldE91dHB1dChpbnN0YW5jZSk7XG5cdFx0c3RyaWN0RXF1YWwob3V0cHV0LCAne1wiaXRlbXNcIjpbMSwyXSxcIm5lc3RlZFwiOntcInZhbHVlXCI6dHJ1ZX19Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHRydW5jYXRlIG91dHB1dCAoY2FsbGVycyBoYW5kbGUgdHJ1bmNhdGlvbiknLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGluZSA9ICdhJy5yZXBlYXQoMTAwMCk7XG5cdFx0Y29uc3QgaW5zdGFuY2UgPSBjcmVhdGVNb2NrSW5zdGFuY2UoXG5cdFx0XHRBcnJheS5mcm9tKHsgbGVuZ3RoOiAxMDAgfSwgKCkgPT4gKHsgdGV4dDogbGluZSB9KSlcblx0XHQpO1xuXG5cdFx0Y29uc3Qgb3V0cHV0ID0gZ2V0T3V0cHV0KGluc3RhbmNlKTtcblx0XHQvLyBnZXRPdXRwdXQgbm8gbG9uZ2VyIHRydW5jYXRlcyAtIGl0IHJldHVybnMgZnVsbCBvdXRwdXRcblx0XHRzdHJpY3RFcXVhbChvdXRwdXQubGVuZ3RoLCAxMDAgKiAxMDAwICsgOTkpOyAvLyAxMDAgbGluZXMgb2YgMTAwMCBjaGFycyArIDk5IG5ld2xpbmVzXG5cdH0pO1xuXG5cdHN1aXRlKCd0cnVuY2F0ZUxhcmdlT3V0cHV0JywgKCkgPT4ge1xuXHRcdHRlc3QoJ3RydW5jYXRlcyB3aXRoIHByZXZpZXcgaGVhZGVyIGFuZCB0YWlsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbGFyZ2VPdXRwdXQgPSAnYScucmVwZWF0KDMwMDAwKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRydW5jYXRlTGFyZ2VPdXRwdXQobGFyZ2VPdXRwdXQpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgTUFYX09VVFBVVF9MRU5HVEgpO1xuXHRcdFx0b2socmVzdWx0LmluY2x1ZGVzKCdbT3V0cHV0IHRvbyBsYXJnZScpKTtcblx0XHRcdG9rKHJlc3VsdC5pbmNsdWRlcygnWy4uLiBtaWRkbGUgb2Ygb3V0cHV0IHRydW5jYXRlZCAuLi5dJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5jbHVkZXMgYm90aCBoZWFkIHByZXZpZXcgYW5kIHRhaWwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBoZWFkID0gJ0hFQURfQ09OVEVOVF8nICsgJ3gnLnJlcGVhdCg0ODcpO1xuXHRcdFx0Y29uc3QgbWlkZGxlID0gJ20nLnJlcGVhdCgyOTAwMCk7XG5cdFx0XHRjb25zdCB0YWlsID0gJ1RBSUxfQ09OVEVOVF8nICsgJ3onLnJlcGVhdCg0ODcpO1xuXHRcdFx0Y29uc3QgbGFyZ2VPdXRwdXQgPSBoZWFkICsgbWlkZGxlICsgdGFpbDtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gdHJ1bmNhdGVMYXJnZU91dHB1dChsYXJnZU91dHB1dCk7XG5cdFx0XHRvayhyZXN1bHQuaW5jbHVkZXMoJ0hFQURfQ09OVEVOVF8nKSwgJ3Nob3VsZCBpbmNsdWRlIGhlYWQgcHJldmlldycpO1xuXHRcdFx0b2socmVzdWx0LmluY2x1ZGVzKCdUQUlMX0NPTlRFTlRfJyksICdzaG91bGQgaW5jbHVkZSB0YWlsJyk7XG5cdFx0XHRvayhyZXN1bHQubGVuZ3RoIDw9IE1BWF9PVVRQVVRfTEVOR1RIKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luY2x1ZGVzIGZpbGUgcGF0aCB3aGVuIHByb3ZpZGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbGFyZ2VPdXRwdXQgPSAneCcucmVwZWF0KDMwMDAwKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRydW5jYXRlTGFyZ2VPdXRwdXQobGFyZ2VPdXRwdXQsICcvdG1wL2NvcGlsb3QtdGVybWluYWwtb3V0cHV0LWFiYy50eHQnKTtcblx0XHRcdG9rKHJlc3VsdC5pbmNsdWRlcygnL3RtcC9jb3BpbG90LXRlcm1pbmFsLW91dHB1dC1hYmMudHh0JykpO1xuXHRcdFx0b2socmVzdWx0LmluY2x1ZGVzKCdyZWFkRmlsZScpKTtcblx0XHRcdG9rKHJlc3VsdC5pbmNsdWRlcygnZ3JlcCcpKTtcblx0XHRcdG9rKHJlc3VsdC5sZW5ndGggPD0gTUFYX09VVFBVVF9MRU5HVEgpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxJQUFJLG1CQUFtQjtBQUdoQyxTQUFTLFdBQVcsbUJBQW1CLDJCQUEyQjtBQUNsRSxTQUFTLCtDQUErQztBQUV4RCxNQUFNLGlCQUFpQixNQUFNO0FBQzVCLDBDQUF3QztBQUN4QyxXQUFTLG1CQUFtQixPQUFtRTtBQUM5RixVQUFNLFNBQVM7QUFBQSxNQUNkLFFBQVEsTUFBTTtBQUFBLE1BQ2QsU0FBUyxDQUFDLFVBQWtCO0FBQzNCLGNBQU0sT0FBTyxNQUFNLEtBQUs7QUFDeEIsWUFBSSxDQUFDLE1BQU07QUFDVixpQkFBTztBQUFBLFFBQ1I7QUFDQSxlQUFPO0FBQUEsVUFDTixXQUFXLENBQUMsQ0FBQyxLQUFLO0FBQUEsVUFDbEIsbUJBQW1CLENBQUMsY0FBd0IsWUFBWSxLQUFLLEtBQUssUUFBUSxTQUFTLEVBQUUsSUFBSSxLQUFLO0FBQUEsUUFDL0Y7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxNQUNOLE9BQU87QUFBQSxRQUNOLEtBQUs7QUFBQSxVQUNKLFFBQVE7QUFBQSxZQUNQLFFBQVE7QUFBQSxVQUNUO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUVBLE9BQUssMkRBQTJELE1BQU07QUFDckUsVUFBTSxTQUFTLElBQUksT0FBTyxFQUFFO0FBQzVCLFVBQU0sV0FBVyxtQkFBbUI7QUFBQSxNQUNuQyxFQUFFLE1BQU0sT0FBTztBQUFBLE1BQ2YsRUFBRSxNQUFNLEtBQUssV0FBVyxLQUFLO0FBQUEsTUFDN0IsRUFBRSxNQUFNLFFBQVE7QUFBQSxJQUNqQixDQUFDO0FBRUQsVUFBTSxTQUFTLFVBQVUsUUFBUTtBQUNqQyxnQkFBWSxRQUFRLEdBQUcsTUFBTTtBQUFBLE1BQVU7QUFBQSxFQUN4QyxDQUFDO0FBRUQsT0FBSyxnRUFBZ0UsTUFBTTtBQUMxRSxVQUFNLFNBQVMsSUFBSSxPQUFPLEVBQUU7QUFDNUIsVUFBTSxXQUFXLG1CQUFtQjtBQUFBLE1BQ25DLEVBQUUsTUFBTSxPQUFPO0FBQUEsTUFDZixFQUFFLE1BQU0sS0FBSyxXQUFXLEtBQUs7QUFBQSxNQUM3QixFQUFFLE1BQU0sUUFBUTtBQUFBLElBQ2pCLENBQUM7QUFFRCxVQUFNLFNBQVMsRUFBRSxNQUFNLEVBQUU7QUFDekIsVUFBTSxTQUFTLFVBQVUsVUFBVSxNQUFNO0FBQ3pDLGdCQUFZLFFBQVEsR0FBRyxNQUFNO0FBQUEsTUFBVTtBQUFBLEVBQ3hDLENBQUM7QUFFRCxPQUFLLHdFQUF3RSxNQUFNO0FBQ2xGLFVBQU0sV0FBVyxtQkFBbUI7QUFBQSxNQUNuQyxFQUFFLE1BQU0sMENBQTBDO0FBQUEsSUFDbkQsQ0FBQztBQUVELFVBQU0sU0FBUyxVQUFVLFFBQVE7QUFDakMsZ0JBQVksUUFBUSx5Q0FBeUM7QUFBQSxFQUM5RCxDQUFDO0FBRUQsT0FBSyx3REFBd0QsTUFBTTtBQUNsRSxVQUFNLE9BQU8sSUFBSSxPQUFPLEdBQUk7QUFDNUIsVUFBTSxXQUFXO0FBQUEsTUFDaEIsTUFBTSxLQUFLLEVBQUUsUUFBUSxJQUFJLEdBQUcsT0FBTyxFQUFFLE1BQU0sS0FBSyxFQUFFO0FBQUEsSUFDbkQ7QUFFQSxVQUFNLFNBQVMsVUFBVSxRQUFRO0FBRWpDLGdCQUFZLE9BQU8sUUFBUSxNQUFNLE1BQU8sRUFBRTtBQUFBLEVBQzNDLENBQUM7QUFFRCxRQUFNLHVCQUF1QixNQUFNO0FBQ2xDLFNBQUssMENBQTBDLE1BQU07QUFDcEQsWUFBTSxjQUFjLElBQUksT0FBTyxHQUFLO0FBQ3BDLFlBQU0sU0FBUyxvQkFBb0IsV0FBVztBQUM5QyxrQkFBWSxPQUFPLFFBQVEsaUJBQWlCO0FBQzVDLFNBQUcsT0FBTyxTQUFTLG1CQUFtQixDQUFDO0FBQ3ZDLFNBQUcsT0FBTyxTQUFTLHNDQUFzQyxDQUFDO0FBQUEsSUFDM0QsQ0FBQztBQUVELFNBQUssdUNBQXVDLE1BQU07QUFDakQsWUFBTSxPQUFPLGtCQUFrQixJQUFJLE9BQU8sR0FBRztBQUM3QyxZQUFNLFNBQVMsSUFBSSxPQUFPLElBQUs7QUFDL0IsWUFBTSxPQUFPLGtCQUFrQixJQUFJLE9BQU8sR0FBRztBQUM3QyxZQUFNLGNBQWMsT0FBTyxTQUFTO0FBRXBDLFlBQU0sU0FBUyxvQkFBb0IsV0FBVztBQUM5QyxTQUFHLE9BQU8sU0FBUyxlQUFlLEdBQUcsNkJBQTZCO0FBQ2xFLFNBQUcsT0FBTyxTQUFTLGVBQWUsR0FBRyxxQkFBcUI7QUFDMUQsU0FBRyxPQUFPLFVBQVUsaUJBQWlCO0FBQUEsSUFDdEMsQ0FBQztBQUVELFNBQUssb0NBQW9DLE1BQU07QUFDOUMsWUFBTSxjQUFjLElBQUksT0FBTyxHQUFLO0FBQ3BDLFlBQU0sU0FBUyxvQkFBb0IsYUFBYSxzQ0FBc0M7QUFDdEYsU0FBRyxPQUFPLFNBQVMsc0NBQXNDLENBQUM7QUFDMUQsU0FBRyxPQUFPLFNBQVMsVUFBVSxDQUFDO0FBQzlCLFNBQUcsT0FBTyxTQUFTLE1BQU0sQ0FBQztBQUMxQixTQUFHLE9BQU8sVUFBVSxpQkFBaUI7QUFBQSxJQUN0QyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
