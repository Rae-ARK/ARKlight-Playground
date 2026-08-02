import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { replayThreadToTurns } from "../../../node/codex/codexReplayMapper.js";
import { ResponsePartKind, TurnState } from "../../../common/state/sessionState.js";
suite("codexReplayMapper", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("empty thread \u2192 no turns", () => {
    const turns = replayThreadToTurns({ id: "thr", turns: [] });
    assert.deepStrictEqual(turns, []);
  });
  test("thread with one user/agent exchange \u2192 one Turn", () => {
    const turns = replayThreadToTurns({
      id: "thr",
      turns: [{
        id: "turn_a",
        items: [
          { type: "userMessage", id: "u1", content: [{ type: "text", text: "hi", text_elements: [] }] },
          { type: "agentMessage", id: "a1", text: "hello back", phase: null, memoryCitation: null }
        ],
        itemsView: { type: "full" },
        status: "completed",
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: null
      }]
    });
    assert.strictEqual(turns.length, 1);
    assert.strictEqual(turns[0].id, "turn_a");
    assert.strictEqual(turns[0].message.text, "hi");
    assert.strictEqual(turns[0].state, TurnState.Complete);
    assert.strictEqual(turns[0].responseParts.length, 1);
    const part = turns[0].responseParts[0];
    assert.strictEqual(part.kind, ResponsePartKind.Markdown);
    assert.strictEqual(part.content, "hello back");
  });
  test("restores turn timing from the persisted codex thread", () => {
    const turns = replayThreadToTurns({
      id: "thr",
      turns: [{
        id: "turn_a",
        items: [{ type: "userMessage", id: "u1", content: [{ type: "text", text: "hi", text_elements: [] }] }],
        itemsView: { type: "full" },
        status: "completed",
        error: null,
        startedAt: 178506e4,
        completedAt: null,
        durationMs: 4200
      }, {
        id: "turn_b",
        items: [{ type: "userMessage", id: "u2", content: [{ type: "text", text: "again", text_elements: [] }] }],
        itemsView: { type: "full" },
        status: "completed",
        error: null,
        startedAt: 1785060100,
        completedAt: 1785060103,
        durationMs: null
      }, {
        id: "turn_c",
        items: [{ type: "userMessage", id: "u3", content: [{ type: "text", text: "legacy", text_elements: [] }] }],
        itemsView: { type: "full" },
        status: "completed",
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: null
      }]
    });
    assert.deepStrictEqual(turns.map((turn) => ({ id: turn.id, startedAt: turn.startedAt, duration: turn.duration })), [
      { id: "turn_a", startedAt: "2026-07-26T10:00:00.000Z", duration: 4200 },
      { id: "turn_b", startedAt: "2026-07-26T10:01:40.000Z", duration: 3e3 },
      { id: "turn_c", startedAt: void 0, duration: void 0 }
    ]);
  });
  test("failed turn maps to TurnState.Error", () => {
    const turns = replayThreadToTurns({
      id: "thr",
      turns: [{
        id: "turn_a",
        items: [
          { type: "userMessage", id: "u1", content: [{ type: "text", text: "q", text_elements: [] }] }
        ],
        itemsView: { type: "full" },
        status: "failed",
        error: { message: "oops" },
        startedAt: null,
        completedAt: null,
        durationMs: null
      }]
    });
    assert.strictEqual(turns.length, 1);
    assert.strictEqual(turns[0].state, TurnState.Error);
  });
  test("turn with no recognizable items is dropped", () => {
    const turns = replayThreadToTurns({
      id: "thr",
      turns: [{
        id: "turn_a",
        items: [
          { type: "plan", id: "p", text: "planning" }
        ],
        itemsView: { type: "full" },
        status: "completed",
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: null
      }]
    });
    assert.deepStrictEqual(turns, []);
  });
  test("multi-turn thread preserves order", () => {
    const turns = replayThreadToTurns({
      id: "thr",
      turns: [
        {
          id: "t1",
          items: [
            { type: "userMessage", id: "u", content: [{ type: "text", text: "first", text_elements: [] }] },
            { type: "agentMessage", id: "a", text: "one", phase: null, memoryCitation: null }
          ],
          itemsView: { type: "full" },
          status: "completed",
          error: null,
          startedAt: null,
          completedAt: null,
          durationMs: null
        },
        {
          id: "t2",
          items: [
            { type: "userMessage", id: "u2", content: [{ type: "text", text: "second", text_elements: [] }] },
            { type: "agentMessage", id: "a2", text: "two", phase: null, memoryCitation: null }
          ],
          itemsView: { type: "full" },
          status: "completed",
          error: null,
          startedAt: null,
          completedAt: null,
          durationMs: null
        }
      ]
    });
    assert.deepStrictEqual(turns.map((t) => t.id), ["t1", "t2"]);
  });
  test("adjacent agentMessages in a turn are separated so a heading keeps its own line", () => {
    const turns = replayThreadToTurns({
      id: "thr",
      turns: [{
        id: "turn_a",
        items: [
          { type: "userMessage", id: "u", content: [{ type: "text", text: "go on", text_elements: [] }] },
          { type: "agentMessage", id: "m1", text: "Consolidating the recommendation and tradeoffs.", phase: null, memoryCitation: null },
          { type: "agentMessage", id: "m2", text: "## Conclusion\n\nDone.", phase: null, memoryCitation: null }
        ],
        itemsView: { type: "full" },
        status: "completed",
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: null
      }]
    });
    const joined = turns[0].responseParts.map((part) => part.kind === ResponsePartKind.Markdown ? part.content : "").join("");
    assert.strictEqual(joined, "Consolidating the recommendation and tradeoffs.\n\n## Conclusion\n\nDone.");
  });
  test("commandExecution renders a completed terminal tool call", () => {
    const turns = replayThreadToTurns({
      id: "thr",
      turns: [{
        id: "turn_a",
        items: [
          { type: "userMessage", id: "u", content: [{ type: "text", text: "run it", text_elements: [] }] },
          {
            type: "commandExecution",
            id: "c1",
            command: "/bin/zsh -lc 'ls -la'",
            cwd: "/tmp",
            processId: null,
            source: "agent",
            status: "completed",
            commandActions: [],
            aggregatedOutput: "total 0",
            exitCode: 0,
            durationMs: 5
          }
        ],
        itemsView: { type: "full" },
        status: "completed",
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: null
      }]
    });
    assert.strictEqual(turns.length, 1);
    assert.strictEqual(turns[0].responseParts.length, 1);
    const part = turns[0].responseParts[0];
    assert.deepStrictEqual({
      kind: part.kind,
      toolName: part.toolCall.toolName,
      invocationMessage: part.toolCall.invocationMessage,
      pastTenseMessage: part.toolCall.pastTenseMessage,
      success: part.toolCall.success,
      output: part.toolCall.content?.[0].text
    }, {
      kind: ResponsePartKind.ToolCall,
      toolName: "shell",
      invocationMessage: "ls -la",
      pastTenseMessage: "Ran `ls -la`",
      success: true,
      output: "total 0"
    });
  });
  test("commandExecution coalesces a sandbox pre-flight with its re-run into one box", () => {
    const turns = replayThreadToTurns({
      id: "thr",
      turns: [{
        id: "turn_a",
        items: [
          { type: "userMessage", id: "u", content: [{ type: "text", text: "curl it", text_elements: [] }] },
          // Pre-flight: same command, no output, success → deferred.
          {
            type: "commandExecution",
            id: "pre",
            command: "curl -s https://example.com",
            cwd: "/tmp",
            processId: null,
            source: "agent",
            status: "completed",
            commandActions: [],
            aggregatedOutput: "",
            exitCode: 0,
            durationMs: 3
          },
          // Escalated re-run: same command, real output.
          {
            type: "commandExecution",
            id: "esc",
            command: "curl -s https://example.com",
            cwd: "/tmp",
            processId: null,
            source: "agent",
            status: "completed",
            commandActions: [],
            aggregatedOutput: "Example Domain",
            exitCode: 0,
            durationMs: 30
          }
        ],
        itemsView: { type: "full" },
        status: "completed",
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: null
      }]
    });
    assert.strictEqual(turns.length, 1);
    assert.strictEqual(turns[0].responseParts.length, 1);
    const part = turns[0].responseParts[0];
    assert.strictEqual(part.toolCall.content?.[0].text, "Example Domain");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvY29kZXgvY29kZXhSZXBsYXlNYXBwZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgcmVwbGF5VGhyZWFkVG9UdXJucyB9IGZyb20gJy4uLy4uLy4uL25vZGUvY29kZXgvY29kZXhSZXBsYXlNYXBwZXIuanMnO1xuaW1wb3J0IHsgUmVzcG9uc2VQYXJ0S2luZCwgVHVyblN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5cbnN1aXRlKCdjb2RleFJlcGxheU1hcHBlcicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdlbXB0eSB0aHJlYWQgXHUyMTkyIG5vIHR1cm5zJywgKCkgPT4ge1xuXHRcdGNvbnN0IHR1cm5zID0gcmVwbGF5VGhyZWFkVG9UdXJucyh7IGlkOiAndGhyJywgdHVybnM6IFtdIH0gYXMgbmV2ZXIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodHVybnMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgndGhyZWFkIHdpdGggb25lIHVzZXIvYWdlbnQgZXhjaGFuZ2UgXHUyMTkyIG9uZSBUdXJuJywgKCkgPT4ge1xuXHRcdGNvbnN0IHR1cm5zID0gcmVwbGF5VGhyZWFkVG9UdXJucyh7XG5cdFx0XHRpZDogJ3RocicsXG5cdFx0XHR0dXJuczogW3tcblx0XHRcdFx0aWQ6ICd0dXJuX2EnLFxuXHRcdFx0XHRpdGVtczogW1xuXHRcdFx0XHRcdHsgdHlwZTogJ3VzZXJNZXNzYWdlJywgaWQ6ICd1MScsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ2hpJywgdGV4dF9lbGVtZW50czogW10gfV0gfSxcblx0XHRcdFx0XHR7IHR5cGU6ICdhZ2VudE1lc3NhZ2UnLCBpZDogJ2ExJywgdGV4dDogJ2hlbGxvIGJhY2snLCBwaGFzZTogbnVsbCwgbWVtb3J5Q2l0YXRpb246IG51bGwgfSxcblx0XHRcdFx0XSxcblx0XHRcdFx0aXRlbXNWaWV3OiB7IHR5cGU6ICdmdWxsJyB9IGFzIG5ldmVyLFxuXHRcdFx0XHRzdGF0dXM6ICdjb21wbGV0ZWQnIGFzIG5ldmVyLFxuXHRcdFx0XHRlcnJvcjogbnVsbCxcblx0XHRcdFx0c3RhcnRlZEF0OiBudWxsLCBjb21wbGV0ZWRBdDogbnVsbCwgZHVyYXRpb25NczogbnVsbCxcblx0XHRcdH1dLFxuXHRcdH0gYXMgbmV2ZXIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dXJucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dXJuc1swXS5pZCwgJ3R1cm5fYScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dXJuc1swXS5tZXNzYWdlLnRleHQsICdoaScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dXJuc1swXS5zdGF0ZSwgVHVyblN0YXRlLkNvbXBsZXRlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHVybnNbMF0ucmVzcG9uc2VQYXJ0cy5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IHBhcnQgPSB0dXJuc1swXS5yZXNwb25zZVBhcnRzWzBdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmtpbmQsIFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgocGFydCBhcyB7IGNvbnRlbnQ6IHN0cmluZyB9KS5jb250ZW50LCAnaGVsbG8gYmFjaycpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN0b3JlcyB0dXJuIHRpbWluZyBmcm9tIHRoZSBwZXJzaXN0ZWQgY29kZXggdGhyZWFkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHR1cm5zID0gcmVwbGF5VGhyZWFkVG9UdXJucyh7XG5cdFx0XHRpZDogJ3RocicsXG5cdFx0XHR0dXJuczogW3tcblx0XHRcdFx0aWQ6ICd0dXJuX2EnLFxuXHRcdFx0XHRpdGVtczogW3sgdHlwZTogJ3VzZXJNZXNzYWdlJywgaWQ6ICd1MScsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ2hpJywgdGV4dF9lbGVtZW50czogW10gfV0gfV0sXG5cdFx0XHRcdGl0ZW1zVmlldzogeyB0eXBlOiAnZnVsbCcgfSBhcyBuZXZlcixcblx0XHRcdFx0c3RhdHVzOiAnY29tcGxldGVkJyBhcyBuZXZlcixcblx0XHRcdFx0ZXJyb3I6IG51bGwsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogMTc4NTA2MDAwMCwgY29tcGxldGVkQXQ6IG51bGwsIGR1cmF0aW9uTXM6IDQyMDAsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiAndHVybl9iJyxcblx0XHRcdFx0aXRlbXM6IFt7IHR5cGU6ICd1c2VyTWVzc2FnZScsIGlkOiAndTInLCBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdhZ2FpbicsIHRleHRfZWxlbWVudHM6IFtdIH1dIH1dLFxuXHRcdFx0XHRpdGVtc1ZpZXc6IHsgdHlwZTogJ2Z1bGwnIH0gYXMgbmV2ZXIsXG5cdFx0XHRcdHN0YXR1czogJ2NvbXBsZXRlZCcgYXMgbmV2ZXIsXG5cdFx0XHRcdGVycm9yOiBudWxsLFxuXHRcdFx0XHRzdGFydGVkQXQ6IDE3ODUwNjAxMDAsIGNvbXBsZXRlZEF0OiAxNzg1MDYwMTAzLCBkdXJhdGlvbk1zOiBudWxsLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogJ3R1cm5fYycsXG5cdFx0XHRcdGl0ZW1zOiBbeyB0eXBlOiAndXNlck1lc3NhZ2UnLCBpZDogJ3UzJywgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAnbGVnYWN5JywgdGV4dF9lbGVtZW50czogW10gfV0gfV0sXG5cdFx0XHRcdGl0ZW1zVmlldzogeyB0eXBlOiAnZnVsbCcgfSBhcyBuZXZlcixcblx0XHRcdFx0c3RhdHVzOiAnY29tcGxldGVkJyBhcyBuZXZlcixcblx0XHRcdFx0ZXJyb3I6IG51bGwsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogbnVsbCwgY29tcGxldGVkQXQ6IG51bGwsIGR1cmF0aW9uTXM6IG51bGwsXG5cdFx0XHR9XSxcblx0XHR9IGFzIG5ldmVyKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodHVybnMubWFwKHR1cm4gPT4gKHsgaWQ6IHR1cm4uaWQsIHN0YXJ0ZWRBdDogdHVybi5zdGFydGVkQXQsIGR1cmF0aW9uOiB0dXJuLmR1cmF0aW9uIH0pKSwgW1xuXHRcdFx0eyBpZDogJ3R1cm5fYScsIHN0YXJ0ZWRBdDogJzIwMjYtMDctMjZUMTA6MDA6MDAuMDAwWicsIGR1cmF0aW9uOiA0MjAwIH0sXG5cdFx0XHR7IGlkOiAndHVybl9iJywgc3RhcnRlZEF0OiAnMjAyNi0wNy0yNlQxMDowMTo0MC4wMDBaJywgZHVyYXRpb246IDMwMDAgfSxcblx0XHRcdHsgaWQ6ICd0dXJuX2MnLCBzdGFydGVkQXQ6IHVuZGVmaW5lZCwgZHVyYXRpb246IHVuZGVmaW5lZCB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmYWlsZWQgdHVybiBtYXBzIHRvIFR1cm5TdGF0ZS5FcnJvcicsICgpID0+IHtcblx0XHRjb25zdCB0dXJucyA9IHJlcGxheVRocmVhZFRvVHVybnMoe1xuXHRcdFx0aWQ6ICd0aHInLFxuXHRcdFx0dHVybnM6IFt7XG5cdFx0XHRcdGlkOiAndHVybl9hJyxcblx0XHRcdFx0aXRlbXM6IFtcblx0XHRcdFx0XHR7IHR5cGU6ICd1c2VyTWVzc2FnZScsIGlkOiAndTEnLCBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdxJywgdGV4dF9lbGVtZW50czogW10gfV0gfSxcblx0XHRcdFx0XSxcblx0XHRcdFx0aXRlbXNWaWV3OiB7IHR5cGU6ICdmdWxsJyB9IGFzIG5ldmVyLFxuXHRcdFx0XHRzdGF0dXM6ICdmYWlsZWQnIGFzIG5ldmVyLFxuXHRcdFx0XHRlcnJvcjogeyBtZXNzYWdlOiAnb29wcycgfSBhcyBuZXZlcixcblx0XHRcdFx0c3RhcnRlZEF0OiBudWxsLCBjb21wbGV0ZWRBdDogbnVsbCwgZHVyYXRpb25NczogbnVsbCxcblx0XHRcdH1dLFxuXHRcdH0gYXMgbmV2ZXIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dXJucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dXJuc1swXS5zdGF0ZSwgVHVyblN0YXRlLkVycm9yKTtcblx0fSk7XG5cblx0dGVzdCgndHVybiB3aXRoIG5vIHJlY29nbml6YWJsZSBpdGVtcyBpcyBkcm9wcGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHR1cm5zID0gcmVwbGF5VGhyZWFkVG9UdXJucyh7XG5cdFx0XHRpZDogJ3RocicsXG5cdFx0XHR0dXJuczogW3tcblx0XHRcdFx0aWQ6ICd0dXJuX2EnLFxuXHRcdFx0XHRpdGVtczogW1xuXHRcdFx0XHRcdHsgdHlwZTogJ3BsYW4nLCBpZDogJ3AnLCB0ZXh0OiAncGxhbm5pbmcnIH0gYXMgbmV2ZXIsXG5cdFx0XHRcdF0sXG5cdFx0XHRcdGl0ZW1zVmlldzogeyB0eXBlOiAnZnVsbCcgfSBhcyBuZXZlcixcblx0XHRcdFx0c3RhdHVzOiAnY29tcGxldGVkJyBhcyBuZXZlcixcblx0XHRcdFx0ZXJyb3I6IG51bGwsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogbnVsbCwgY29tcGxldGVkQXQ6IG51bGwsIGR1cmF0aW9uTXM6IG51bGwsXG5cdFx0XHR9XSxcblx0XHR9IGFzIG5ldmVyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHR1cm5zLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpLXR1cm4gdGhyZWFkIHByZXNlcnZlcyBvcmRlcicsICgpID0+IHtcblx0XHRjb25zdCB0dXJucyA9IHJlcGxheVRocmVhZFRvVHVybnMoe1xuXHRcdFx0aWQ6ICd0aHInLFxuXHRcdFx0dHVybnM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAndDEnLFxuXHRcdFx0XHRcdGl0ZW1zOiBbXG5cdFx0XHRcdFx0XHR7IHR5cGU6ICd1c2VyTWVzc2FnZScsIGlkOiAndScsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ2ZpcnN0JywgdGV4dF9lbGVtZW50czogW10gfV0gfSxcblx0XHRcdFx0XHRcdHsgdHlwZTogJ2FnZW50TWVzc2FnZScsIGlkOiAnYScsIHRleHQ6ICdvbmUnLCBwaGFzZTogbnVsbCwgbWVtb3J5Q2l0YXRpb246IG51bGwgfSxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdGl0ZW1zVmlldzogeyB0eXBlOiAnZnVsbCcgfSBhcyBuZXZlcixcblx0XHRcdFx0XHRzdGF0dXM6ICdjb21wbGV0ZWQnIGFzIG5ldmVyLFxuXHRcdFx0XHRcdGVycm9yOiBudWxsLCBzdGFydGVkQXQ6IG51bGwsIGNvbXBsZXRlZEF0OiBudWxsLCBkdXJhdGlvbk1zOiBudWxsLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICd0MicsXG5cdFx0XHRcdFx0aXRlbXM6IFtcblx0XHRcdFx0XHRcdHsgdHlwZTogJ3VzZXJNZXNzYWdlJywgaWQ6ICd1MicsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ3NlY29uZCcsIHRleHRfZWxlbWVudHM6IFtdIH1dIH0sXG5cdFx0XHRcdFx0XHR7IHR5cGU6ICdhZ2VudE1lc3NhZ2UnLCBpZDogJ2EyJywgdGV4dDogJ3R3bycsIHBoYXNlOiBudWxsLCBtZW1vcnlDaXRhdGlvbjogbnVsbCB9LFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0aXRlbXNWaWV3OiB7IHR5cGU6ICdmdWxsJyB9IGFzIG5ldmVyLFxuXHRcdFx0XHRcdHN0YXR1czogJ2NvbXBsZXRlZCcgYXMgbmV2ZXIsXG5cdFx0XHRcdFx0ZXJyb3I6IG51bGwsIHN0YXJ0ZWRBdDogbnVsbCwgY29tcGxldGVkQXQ6IG51bGwsIGR1cmF0aW9uTXM6IG51bGwsXG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdH0gYXMgbmV2ZXIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodHVybnMubWFwKHQgPT4gdC5pZCksIFsndDEnLCAndDInXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FkamFjZW50IGFnZW50TWVzc2FnZXMgaW4gYSB0dXJuIGFyZSBzZXBhcmF0ZWQgc28gYSBoZWFkaW5nIGtlZXBzIGl0cyBvd24gbGluZScsICgpID0+IHtcblx0XHRjb25zdCB0dXJucyA9IHJlcGxheVRocmVhZFRvVHVybnMoe1xuXHRcdFx0aWQ6ICd0aHInLFxuXHRcdFx0dHVybnM6IFt7XG5cdFx0XHRcdGlkOiAndHVybl9hJyxcblx0XHRcdFx0aXRlbXM6IFtcblx0XHRcdFx0XHR7IHR5cGU6ICd1c2VyTWVzc2FnZScsIGlkOiAndScsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ2dvIG9uJywgdGV4dF9lbGVtZW50czogW10gfV0gfSxcblx0XHRcdFx0XHR7IHR5cGU6ICdhZ2VudE1lc3NhZ2UnLCBpZDogJ20xJywgdGV4dDogJ0NvbnNvbGlkYXRpbmcgdGhlIHJlY29tbWVuZGF0aW9uIGFuZCB0cmFkZW9mZnMuJywgcGhhc2U6IG51bGwsIG1lbW9yeUNpdGF0aW9uOiBudWxsIH0sXG5cdFx0XHRcdFx0eyB0eXBlOiAnYWdlbnRNZXNzYWdlJywgaWQ6ICdtMicsIHRleHQ6ICcjIyBDb25jbHVzaW9uXFxuXFxuRG9uZS4nLCBwaGFzZTogbnVsbCwgbWVtb3J5Q2l0YXRpb246IG51bGwgfSxcblx0XHRcdFx0XSxcblx0XHRcdFx0aXRlbXNWaWV3OiB7IHR5cGU6ICdmdWxsJyB9IGFzIG5ldmVyLFxuXHRcdFx0XHRzdGF0dXM6ICdjb21wbGV0ZWQnIGFzIG5ldmVyLFxuXHRcdFx0XHRlcnJvcjogbnVsbCwgc3RhcnRlZEF0OiBudWxsLCBjb21wbGV0ZWRBdDogbnVsbCwgZHVyYXRpb25NczogbnVsbCxcblx0XHRcdH1dLFxuXHRcdH0gYXMgbmV2ZXIpO1xuXHRcdC8vIEhpc3RvcnkgcmVwbGF5IGVtaXRzIG9uZSBtYXJrZG93bkNvbnRlbnQgcGVyIE1hcmtkb3duIHBhcnQ7IHRoZSBjaGF0XG5cdFx0Ly8gbW9kZWwgY29hbGVzY2VzIGFkamFjZW50IG9uZXMgYnkgcGxhaW4gY29uY2F0ZW5hdGlvbiwgc28gdGhlIGpvaW5lZFxuXHRcdC8vIHRleHQgbXVzdCBrZWVwIGAjIyBDb25jbHVzaW9uYCBhdCB0aGUgc3RhcnQgb2YgYSBsaW5lLlxuXHRcdGNvbnN0IGpvaW5lZCA9IHR1cm5zWzBdLnJlc3BvbnNlUGFydHNcblx0XHRcdC5tYXAocGFydCA9PiBwYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24gPyAocGFydCBhcyB7IGNvbnRlbnQ6IHN0cmluZyB9KS5jb250ZW50IDogJycpXG5cdFx0XHQuam9pbignJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGpvaW5lZCwgJ0NvbnNvbGlkYXRpbmcgdGhlIHJlY29tbWVuZGF0aW9uIGFuZCB0cmFkZW9mZnMuXFxuXFxuIyMgQ29uY2x1c2lvblxcblxcbkRvbmUuJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbW1hbmRFeGVjdXRpb24gcmVuZGVycyBhIGNvbXBsZXRlZCB0ZXJtaW5hbCB0b29sIGNhbGwnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdHVybnMgPSByZXBsYXlUaHJlYWRUb1R1cm5zKHtcblx0XHRcdGlkOiAndGhyJyxcblx0XHRcdHR1cm5zOiBbe1xuXHRcdFx0XHRpZDogJ3R1cm5fYScsXG5cdFx0XHRcdGl0ZW1zOiBbXG5cdFx0XHRcdFx0eyB0eXBlOiAndXNlck1lc3NhZ2UnLCBpZDogJ3UnLCBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdydW4gaXQnLCB0ZXh0X2VsZW1lbnRzOiBbXSB9XSB9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHR5cGU6ICdjb21tYW5kRXhlY3V0aW9uJywgaWQ6ICdjMScsXG5cdFx0XHRcdFx0XHRjb21tYW5kOiAnL2Jpbi96c2ggLWxjIFxcJ2xzIC1sYVxcJycsIGN3ZDogJy90bXAnLCBwcm9jZXNzSWQ6IG51bGwsXG5cdFx0XHRcdFx0XHRzb3VyY2U6ICdhZ2VudCcsIHN0YXR1czogJ2NvbXBsZXRlZCcsXG5cdFx0XHRcdFx0XHRjb21tYW5kQWN0aW9uczogW10sIGFnZ3JlZ2F0ZWRPdXRwdXQ6ICd0b3RhbCAwJywgZXhpdENvZGU6IDAsIGR1cmF0aW9uTXM6IDUsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XSxcblx0XHRcdFx0aXRlbXNWaWV3OiB7IHR5cGU6ICdmdWxsJyB9IGFzIG5ldmVyLFxuXHRcdFx0XHRzdGF0dXM6ICdjb21wbGV0ZWQnIGFzIG5ldmVyLFxuXHRcdFx0XHRlcnJvcjogbnVsbCwgc3RhcnRlZEF0OiBudWxsLCBjb21wbGV0ZWRBdDogbnVsbCwgZHVyYXRpb25NczogbnVsbCxcblx0XHRcdH1dLFxuXHRcdH0gYXMgbmV2ZXIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dXJucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dXJuc1swXS5yZXNwb25zZVBhcnRzLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgcGFydCA9IHR1cm5zWzBdLnJlc3BvbnNlUGFydHNbMF0gYXMgeyBraW5kOiBSZXNwb25zZVBhcnRLaW5kOyB0b29sQ2FsbDogeyB0b29sTmFtZTogc3RyaW5nOyBpbnZvY2F0aW9uTWVzc2FnZTogc3RyaW5nOyBwYXN0VGVuc2VNZXNzYWdlOiBzdHJpbmc7IHN1Y2Nlc3M6IGJvb2xlYW47IGNvbnRlbnQ/OiB7IHRleHQ6IHN0cmluZyB9W10gfSB9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0a2luZDogcGFydC5raW5kLFxuXHRcdFx0dG9vbE5hbWU6IHBhcnQudG9vbENhbGwudG9vbE5hbWUsXG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogcGFydC50b29sQ2FsbC5pbnZvY2F0aW9uTWVzc2FnZSxcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IHBhcnQudG9vbENhbGwucGFzdFRlbnNlTWVzc2FnZSxcblx0XHRcdHN1Y2Nlc3M6IHBhcnQudG9vbENhbGwuc3VjY2Vzcyxcblx0XHRcdG91dHB1dDogcGFydC50b29sQ2FsbC5jb250ZW50Py5bMF0udGV4dCxcblx0XHR9LCB7XG5cdFx0XHRraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsLFxuXHRcdFx0dG9vbE5hbWU6ICdzaGVsbCcsXG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ2xzIC1sYScsXG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiAnUmFuIGBscyAtbGFgJyxcblx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRvdXRwdXQ6ICd0b3RhbCAwJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29tbWFuZEV4ZWN1dGlvbiBjb2FsZXNjZXMgYSBzYW5kYm94IHByZS1mbGlnaHQgd2l0aCBpdHMgcmUtcnVuIGludG8gb25lIGJveCcsICgpID0+IHtcblx0XHRjb25zdCB0dXJucyA9IHJlcGxheVRocmVhZFRvVHVybnMoe1xuXHRcdFx0aWQ6ICd0aHInLFxuXHRcdFx0dHVybnM6IFt7XG5cdFx0XHRcdGlkOiAndHVybl9hJyxcblx0XHRcdFx0aXRlbXM6IFtcblx0XHRcdFx0XHR7IHR5cGU6ICd1c2VyTWVzc2FnZScsIGlkOiAndScsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ2N1cmwgaXQnLCB0ZXh0X2VsZW1lbnRzOiBbXSB9XSB9LFxuXHRcdFx0XHRcdC8vIFByZS1mbGlnaHQ6IHNhbWUgY29tbWFuZCwgbm8gb3V0cHV0LCBzdWNjZXNzIFx1MjE5MiBkZWZlcnJlZC5cblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZEV4ZWN1dGlvbicsIGlkOiAncHJlJyxcblx0XHRcdFx0XHRcdGNvbW1hbmQ6ICdjdXJsIC1zIGh0dHBzOi8vZXhhbXBsZS5jb20nLCBjd2Q6ICcvdG1wJywgcHJvY2Vzc0lkOiBudWxsLFxuXHRcdFx0XHRcdFx0c291cmNlOiAnYWdlbnQnLCBzdGF0dXM6ICdjb21wbGV0ZWQnLFxuXHRcdFx0XHRcdFx0Y29tbWFuZEFjdGlvbnM6IFtdLCBhZ2dyZWdhdGVkT3V0cHV0OiAnJywgZXhpdENvZGU6IDAsIGR1cmF0aW9uTXM6IDMsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHQvLyBFc2NhbGF0ZWQgcmUtcnVuOiBzYW1lIGNvbW1hbmQsIHJlYWwgb3V0cHV0LlxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHR5cGU6ICdjb21tYW5kRXhlY3V0aW9uJywgaWQ6ICdlc2MnLFxuXHRcdFx0XHRcdFx0Y29tbWFuZDogJ2N1cmwgLXMgaHR0cHM6Ly9leGFtcGxlLmNvbScsIGN3ZDogJy90bXAnLCBwcm9jZXNzSWQ6IG51bGwsXG5cdFx0XHRcdFx0XHRzb3VyY2U6ICdhZ2VudCcsIHN0YXR1czogJ2NvbXBsZXRlZCcsXG5cdFx0XHRcdFx0XHRjb21tYW5kQWN0aW9uczogW10sIGFnZ3JlZ2F0ZWRPdXRwdXQ6ICdFeGFtcGxlIERvbWFpbicsIGV4aXRDb2RlOiAwLCBkdXJhdGlvbk1zOiAzMCxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRpdGVtc1ZpZXc6IHsgdHlwZTogJ2Z1bGwnIH0gYXMgbmV2ZXIsXG5cdFx0XHRcdHN0YXR1czogJ2NvbXBsZXRlZCcgYXMgbmV2ZXIsXG5cdFx0XHRcdGVycm9yOiBudWxsLCBzdGFydGVkQXQ6IG51bGwsIGNvbXBsZXRlZEF0OiBudWxsLCBkdXJhdGlvbk1zOiBudWxsLFxuXHRcdFx0fV0sXG5cdFx0fSBhcyBuZXZlcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR1cm5zLmxlbmd0aCwgMSk7XG5cdFx0Ly8gRXhhY3RseSBvbmUgYm94IFx1MjAxNCB0aGUgcHJlLWZsaWdodCBpcyBjb2FsZXNjZWQgYXdheS5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHVybnNbMF0ucmVzcG9uc2VQYXJ0cy5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IHBhcnQgPSB0dXJuc1swXS5yZXNwb25zZVBhcnRzWzBdIGFzIHsgdG9vbENhbGw6IHsgY29udGVudD86IHsgdGV4dDogc3RyaW5nIH1bXSB9IH07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQudG9vbENhbGwuY29udGVudD8uWzBdLnRleHQsICdFeGFtcGxlIERvbWFpbicpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsa0JBQWtCLGlCQUFpQjtBQUU1QyxNQUFNLHFCQUFxQixNQUFNO0FBRWhDLDBDQUF3QztBQUV4QyxPQUFLLGdDQUEyQixNQUFNO0FBQ3JDLFVBQU0sUUFBUSxvQkFBb0IsRUFBRSxJQUFJLE9BQU8sT0FBTyxDQUFDLEVBQUUsQ0FBVTtBQUNuRSxXQUFPLGdCQUFnQixPQUFPLENBQUMsQ0FBQztBQUFBLEVBQ2pDLENBQUM7QUFFRCxPQUFLLHVEQUFrRCxNQUFNO0FBQzVELFVBQU0sUUFBUSxvQkFB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
