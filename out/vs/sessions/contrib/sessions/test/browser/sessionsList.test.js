import assert from "assert";
import { Codicon } from "../../../../../base/common/codicons.js";
import { constObservable, observableValue } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { SessionStatus } from "../../../../services/sessions/common/session.js";
import { computeReorderSortChanges, groupByDate, groupByWorkspace, groupSessionsForList, limitSessionsForList, shouldAnimateArchiveAction, sortSessions, SessionsGrouping, SessionsSorting } from "../../browser/views/sessionsList.js";
import { ARCHIVE_SESSION_COMMAND_ID } from "../../../../common/sessionCommands.js";
function createSession(id, opts) {
  const createdAt = opts.createdAt ?? /* @__PURE__ */ new Date();
  const updatedAt = opts.updatedAt ?? createdAt;
  return {
    sessionId: id,
    resource: URI.parse(`session://${id}`),
    providerId: "test",
    sessionType: "test",
    icon: Codicon.account,
    createdAt,
    workspace: observableValue(`workspace-${id}`, opts.workspaceLabel !== void 0 ? {
      uri: URI.parse(`session://workspace/${id}`),
      label: opts.workspaceLabel,
      icon: Codicon.folder,
      folders: [],
      requiresWorkspaceTrust: false,
      isVirtualWorkspace: false
    } : void 0),
    isQuickChat: observableValue(`isQuickChat-${id}`, opts.workspaceLabel === void 0),
    title: observableValue(`title-${id}`, id),
    updatedAt: observableValue(`updatedAt-${id}`, updatedAt),
    status: observableValue(`status-${id}`, SessionStatus.Completed),
    changesets: observableValue(`changesets-${id}`, []),
    changes: observableValue(`changes-${id}`, []),
    modelId: observableValue(`modelId-${id}`, void 0),
    mode: observableValue(`mode-${id}`, void 0),
    loading: observableValue(`loading-${id}`, false),
    isArchived: observableValue(`isArchived-${id}`, opts.isArchived ?? false),
    isRead: observableValue(`isRead-${id}`, true),
    description: observableValue(`description-${id}`, void 0),
    lastTurnEnd: observableValue(`lastTurnEnd-${id}`, void 0),
    chats: observableValue(`chats-${id}`, []),
    mainChat: observableValue(`mainChat-${id}`, void 0),
    capabilities: constObservable({ supportsMultipleChats: false })
  };
}
suite("Sessions - SessionsList Helpers", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("animates only a single-session inline archive action with motion enabled", () => {
    assert.deepStrictEqual({
      singleArchive: shouldAnimateArchiveAction(ARCHIVE_SESSION_COMMAND_ID, 1, false),
      multiArchive: shouldAnimateArchiveAction(ARCHIVE_SESSION_COMMAND_ID, 2, false),
      reducedMotion: shouldAnimateArchiveAction(ARCHIVE_SESSION_COMMAND_ID, 1, true),
      otherAction: shouldAnimateArchiveAction("sessionsViewPane.pinSession", 1, false)
    }, {
      singleArchive: true,
      multiArchive: false,
      reducedMotion: false,
      otherAction: false
    });
  });
  suite("groupByWorkspace", () => {
    test("groups are sorted alphabetically regardless of insertion order", () => {
      const sessions = [
        createSession("1", { workspaceLabel: "Zebra" }),
        createSession("2", { workspaceLabel: "Apple" }),
        createSession("3", { workspaceLabel: "Mango" })
      ];
      const groups = groupByWorkspace(sessions);
      assert.deepStrictEqual(groups.map((g) => g.label), ["Apple", "Mango", "Zebra"]);
    });
    test('sessions without workspace are grouped under "Unknown"', () => {
      const sessions = [
        createSession("1", { workspaceLabel: "Beta" }),
        createSession("2", {}),
        createSession("3", { workspaceLabel: "Alpha" })
      ];
      const groups = groupByWorkspace(sessions);
      assert.deepStrictEqual(groups.map((g) => g.label), ["Alpha", "Beta", "Unknown"]);
    });
    test("multiple sessions in same workspace are grouped together", () => {
      const sessions = [
        createSession("1", { workspaceLabel: "Repo-B" }),
        createSession("2", { workspaceLabel: "Repo-A" }),
        createSession("3", { workspaceLabel: "Repo-B" })
      ];
      const groups = groupByWorkspace(sessions);
      assert.deepStrictEqual(groups.map((g) => g.label), ["Repo-A", "Repo-B"]);
      assert.strictEqual(groups[0].sessions.length, 1);
      assert.strictEqual(groups[1].sessions.length, 2);
    });
    test('"No Workspace" appears after workspaces that sort alphabetically later', () => {
      const sessions = [
        createSession("1", {}),
        createSession("2", { workspaceLabel: "Zulu" }),
        createSession("3", { workspaceLabel: "Alpha" })
      ];
      const groups = groupByWorkspace(sessions);
      assert.deepStrictEqual(groups.map((g) => g.label), ["Alpha", "Zulu", "Unknown"]);
    });
    test('empty workspace label is treated as "Unknown"', () => {
      const sessions = [
        createSession("1", { workspaceLabel: "Zulu" }),
        createSession("2", { workspaceLabel: "" })
      ];
      const groups = groupByWorkspace(sessions);
      assert.deepStrictEqual(groups.map((g) => g.label), ["Zulu", "Unknown"]);
      assert.strictEqual(groups[1].sessions.length, 1);
    });
    test("group ids are prefixed with workspace:", () => {
      const sessions = [
        createSession("1", { workspaceLabel: "MyProject" })
      ];
      const groups = groupByWorkspace(sessions);
      assert.strictEqual(groups[0].id, "workspace:MyProject");
    });
  });
  suite("groupByDate", () => {
    const DAY_MS = 864e5;
    function minutesAgo(minutes) {
      return new Date(Date.now() - minutes * 6e4);
    }
    function daysAgo(days) {
      return new Date(Date.now() - days * DAY_MS);
    }
    test('sessions within the last 7 days go to "Recent", older ones to "Older"', () => {
      const sessions = [
        createSession("recent-1", { createdAt: minutesAgo(5) }),
        createSession("recent-2", { createdAt: daysAgo(3) }),
        createSession("old-1", { createdAt: daysAgo(10) }),
        createSession("old-2", { createdAt: daysAgo(30) })
      ];
      const sections = groupByDate(sessions, SessionsSorting.Created);
      assert.deepStrictEqual(sections.map((s) => ({ id: s.id, sessions: s.sessions.map((session) => session.sessionId) })), [
        { id: "recent", sessions: ["recent-1", "recent-2"] },
        { id: "older", sessions: ["old-1", "old-2"] }
      ]);
    });
    test('"Recent" is capped at 10 sessions; the overflow within 7 days falls into "Older"', () => {
      const sessions = Array.from({ length: 13 }, (_, i) => createSession(`s${i}`, { createdAt: minutesAgo(i + 1) }));
      const sections = groupByDate(sessions, SessionsSorting.Created);
      assert.deepStrictEqual(sections.map((s) => ({ id: s.id, sessions: s.sessions.map((session) => session.sessionId) })), [
        { id: "recent", sessions: ["s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9"] },
        { id: "older", sessions: ["s10", "s11", "s12"] }
      ]);
    });
    test("empty sections are omitted", () => {
      const sessions = [
        createSession("only-old", { createdAt: daysAgo(20) })
      ];
      const sections = groupByDate(sessions, SessionsSorting.Created);
      assert.deepStrictEqual(sections.map((s) => s.id), ["older"]);
    });
  });
  suite("sortSessions", () => {
    test("sorts by createdAt descending when sorting is Created", () => {
      const sessions = [
        createSession("old", { createdAt: /* @__PURE__ */ new Date("2024-01-01") }),
        createSession("new", { createdAt: /* @__PURE__ */ new Date("2024-06-01") }),
        createSession("mid", { createdAt: /* @__PURE__ */ new Date("2024-03-01") })
      ];
      const sorted = sortSessions(sessions, SessionsSorting.Created);
      assert.deepStrictEqual(sorted.map((s) => s.sessionId), ["new", "mid", "old"]);
    });
    test("sorts by updatedAt descending when sorting is Updated", () => {
      const sessions = [
        createSession("a", { createdAt: /* @__PURE__ */ new Date("2024-06-01"), updatedAt: /* @__PURE__ */ new Date("2024-07-01") }),
        createSession("b", { createdAt: /* @__PURE__ */ new Date("2024-01-01"), updatedAt: /* @__PURE__ */ new Date("2024-09-01") }),
        createSession("c", { createdAt: /* @__PURE__ */ new Date("2024-03-01"), updatedAt: /* @__PURE__ */ new Date("2024-08-01") })
      ];
      const sorted = sortSessions(sessions, SessionsSorting.Updated);
      assert.deepStrictEqual(sorted.map((s) => s.sessionId), ["b", "c", "a"]);
    });
  });
  suite("limitSessionsForList", () => {
    test("caps sessions and returns a show more item", () => {
      const sessions = ["1", "2", "3"].map((id) => createSession(id, {}));
      const result = limitSessionsForList(sessions, 2, {
        enabled: true,
        expanded: false,
        sectionId: "group:alpha",
        sectionLabel: "Alpha"
      });
      assert.deepStrictEqual({
        sessions: result.sessions.map((session) => session.sessionId),
        showMore: result.showMore
      }, {
        sessions: ["1", "2"],
        showMore: {
          showMore: true,
          kind: "sessions",
          mode: "more",
          sectionId: "group:alpha",
          sectionLabel: "Alpha",
          remainingCount: 1
        }
      });
    });
    test("returns all sessions and a show less item when expanded", () => {
      const sessions = ["1", "2", "3"].map((id) => createSession(id, {}));
      const result = limitSessionsForList(sessions, 2, {
        enabled: true,
        expanded: true,
        sectionId: "group:alpha",
        sectionLabel: "Alpha"
      });
      assert.deepStrictEqual({
        sessions: result.sessions.map((session) => session.sessionId),
        showMore: result.showMore
      }, {
        sessions: ["1", "2", "3"],
        showMore: {
          showMore: true,
          kind: "sessions",
          mode: "less",
          sectionId: "group:alpha",
          sectionLabel: "Alpha",
          remainingCount: 0
        }
      });
    });
    test("does not cap when disabled", () => {
      const sessions = ["1", "2", "3"].map((id) => createSession(id, {}));
      const result = limitSessionsForList(sessions, 2, {
        enabled: false,
        expanded: false,
        sectionId: "group:alpha",
        sectionLabel: "Alpha"
      });
      assert.deepStrictEqual({
        sessions: result.sessions.map((session) => session.sessionId),
        showMore: result.showMore
      }, {
        sessions: ["1", "2", "3"],
        showMore: void 0
      });
    });
  });
  suite("groupSessionsForList", () => {
    test("shows pinned sessions in a dedicated top section", () => {
      const pinned = createSession("pinned", { workspaceLabel: "Alpha", createdAt: /* @__PURE__ */ new Date("2024-06-01") });
      const regular = createSession("regular", { workspaceLabel: "Beta", createdAt: /* @__PURE__ */ new Date("2024-05-01") });
      const sections = groupSessionsForList(
        [pinned, regular],
        SessionsGrouping.Workspace,
        SessionsSorting.Created,
        (session) => session.sessionId === pinned.sessionId
      );
      assert.deepStrictEqual(sections.map((section) => section.id), ["pinned", "workspace:Beta"]);
      assert.deepStrictEqual(sections[0].sessions.map((session) => session.sessionId), ["pinned"]);
    });
    test("keeps archived sessions in Done even when pinned", () => {
      const archivedPinned = createSession("archived-pinned", { workspaceLabel: "Alpha", isArchived: true, createdAt: /* @__PURE__ */ new Date("2024-06-01") });
      const sections = groupSessionsForList(
        [archivedPinned],
        SessionsGrouping.Workspace,
        SessionsSorting.Created,
        () => true
      );
      assert.deepStrictEqual(sections.map((section) => section.id), ["archived"]);
      assert.deepStrictEqual(sections[0].sessions.map((session) => session.sessionId), ["archived-pinned"]);
    });
    test("sorts pinned sessions using supplied sort keys", () => {
      const first = createSession("first", { createdAt: /* @__PURE__ */ new Date("2024-01-01") });
      const second = createSession("second", { createdAt: /* @__PURE__ */ new Date("2024-06-01") });
      const sections = groupSessionsForList(
        [first, second],
        SessionsGrouping.Workspace,
        SessionsSorting.Created,
        () => true,
        (session) => session.sessionId === first.sessionId ? 200 : 100
      );
      assert.deepStrictEqual(sections.map((section) => ({ id: section.id, sessions: section.sessions.map((session) => session.sessionId) })), [
        { id: "pinned", sessions: ["first", "second"] }
      ]);
    });
    test("workspace-less sessions form a Chats section directly below Pinned (above groups)", () => {
      const pinned = createSession("pinned", { workspaceLabel: "Alpha", createdAt: /* @__PURE__ */ new Date("2024-06-03") });
      const quick = createSession("quick", { createdAt: /* @__PURE__ */ new Date("2024-06-02") });
      const regular = createSession("regular", { workspaceLabel: "Beta", createdAt: /* @__PURE__ */ new Date("2024-06-01") });
      const archived = createSession("archived", { workspaceLabel: "Gamma", isArchived: true, createdAt: /* @__PURE__ */ new Date("2024-05-01") });
      const sections = groupSessionsForList(
        [pinned, quick, regular, archived],
        SessionsGrouping.Workspace,
        SessionsSorting.Created,
        (session) => session.sessionId === pinned.sessionId
      );
      assert.deepStrictEqual(sections.map((section) => ({ id: section.id, sessions: section.sessions.map((s) => s.sessionId) })), [
        { id: "pinned", sessions: ["pinned"] },
        { id: "quickchats", sessions: ["quick"] },
        { id: "workspace:Beta", sessions: ["regular"] },
        { id: "archived", sessions: ["archived"] }
      ]);
    });
    test("pinned quick chat stays in Pinned, not Quick Chats", () => {
      const quick = createSession("quick", { createdAt: /* @__PURE__ */ new Date("2024-06-01") });
      const sections = groupSessionsForList(
        [quick],
        SessionsGrouping.Workspace,
        SessionsSorting.Created,
        () => true
      );
      assert.deepStrictEqual(sections.map((section) => section.id), ["pinned"]);
    });
    test("Chats section sits directly below Pinned when grouping by date", () => {
      const pinned = createSession("pinned", { createdAt: /* @__PURE__ */ new Date("2024-06-03") });
      const quick = createSession("quick", { createdAt: /* @__PURE__ */ new Date("2024-06-02") });
      const regular = createSession("regular", { workspaceLabel: "Beta", createdAt: /* @__PURE__ */ new Date("2024-06-01") });
      const sections = groupSessionsForList(
        [pinned, quick, regular],
        SessionsGrouping.Date,
        SessionsSorting.Created,
        (session) => session.sessionId === pinned.sessionId
      );
      assert.strictEqual(sections[0].id, "pinned");
      assert.strictEqual(sections[1].id, "quickchats");
      assert.deepStrictEqual(sections[1].sessions.map((s) => s.sessionId), ["quick"]);
    });
  });
  suite("computeReorderSortChanges", () => {
    const NOW = 1e6;
    const STEP = 6e4;
    test("single drop between two neighbours uses the midpoint", () => {
      const { set, clear } = computeReorderSortChanges({
        draggedIds: ["x"],
        naturalKeys: [10],
        aboveKey: 100,
        belowKey: 50,
        now: NOW,
        fallbackStep: STEP
      });
      assert.deepStrictEqual([...set], [["x", 75]]);
      assert.deepStrictEqual(clear, []);
    });
    test("drop above the first session uses the current time", () => {
      const { set, clear } = computeReorderSortChanges({
        draggedIds: ["x"],
        naturalKeys: [10],
        aboveKey: void 0,
        belowKey: 200,
        now: NOW,
        fallbackStep: STEP
      });
      assert.deepStrictEqual(clear, []);
      const value = set.get("x");
      assert.ok(value > 200 && value < NOW, `expected ${value} between 200 and ${NOW}`);
    });
    test("drop below the last session steps below the last key", () => {
      const { set, clear } = computeReorderSortChanges({
        draggedIds: ["x"],
        naturalKeys: [500],
        aboveKey: 100,
        belowKey: void 0,
        now: NOW,
        fallbackStep: STEP
      });
      assert.deepStrictEqual(clear, []);
      assert.ok(set.get("x") < 100);
    });
    test("drops the fake value when the natural key already fits the slot", () => {
      const { set, clear } = computeReorderSortChanges({
        draggedIds: ["x"],
        naturalKeys: [75],
        aboveKey: 100,
        belowKey: 50,
        now: NOW,
        fallbackStep: STEP
      });
      assert.deepStrictEqual([...set], []);
      assert.deepStrictEqual(clear, ["x"]);
    });
    test("multi-block gets strictly descending keys inside the gap", () => {
      const { set, clear } = computeReorderSortChanges({
        draggedIds: ["a", "b", "c"],
        naturalKeys: [5, 4, 3],
        aboveKey: 100,
        belowKey: 40,
        now: NOW,
        fallbackStep: STEP
      });
      assert.deepStrictEqual(clear, []);
      const values = ["a", "b", "c"].map((id) => set.get(id));
      assert.deepStrictEqual(values, [85, 70, 55]);
      assert.ok(values.every((v) => v > 40 && v < 100));
    });
    test("multi-block clears overrides when all natural keys already fit in order", () => {
      const { set, clear } = computeReorderSortChanges({
        draggedIds: ["a", "b"],
        naturalKeys: [80, 60],
        aboveKey: 100,
        belowKey: 40,
        now: NOW,
        fallbackStep: STEP
      });
      assert.deepStrictEqual([...set], []);
      assert.deepStrictEqual(clear, ["a", "b"]);
    });
    test("multi-block assigns synthetic keys when natural order does not fit", () => {
      const { set, clear } = computeReorderSortChanges({
        draggedIds: ["a", "b"],
        naturalKeys: [60, 80],
        // ascending: does not match descending display order
        aboveKey: 100,
        belowKey: 40,
        now: NOW,
        fallbackStep: STEP
      });
      assert.deepStrictEqual(clear, []);
      assert.strictEqual(set.size, 2);
      assert.ok(set.get("a") > set.get("b"));
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvc2Vzc2lvbnMvdGVzdC9icm93c2VyL3Nlc3Npb25zTGlzdC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IGNvbnN0T2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJQ2hhdCwgSVNlc3Npb24sIFNlc3Npb25TdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBjb21wdXRlUmVvcmRlclNvcnRDaGFuZ2VzLCBncm91cEJ5RGF0ZSwgZ3JvdXBCeVdvcmtzcGFjZSwgZ3JvdXBTZXNzaW9uc0Zvckxpc3QsIGxpbWl0U2Vzc2lvbnNGb3JMaXN0LCBzaG91bGRBbmltYXRlQXJjaGl2ZUFjdGlvbiwgc29ydFNlc3Npb25zLCBTZXNzaW9uc0dyb3VwaW5nLCBTZXNzaW9uc1NvcnRpbmcgfSBmcm9tICcuLi8uLi9icm93c2VyL3ZpZXdzL3Nlc3Npb25zTGlzdC5qcyc7XG5pbXBvcnQgeyBBUkNISVZFX1NFU1NJT05fQ09NTUFORF9JRCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zZXNzaW9uQ29tbWFuZHMuanMnO1xuXG5mdW5jdGlvbiBjcmVhdGVTZXNzaW9uKGlkOiBzdHJpbmcsIG9wdHM6IHtcblx0d29ya3NwYWNlTGFiZWw/OiBzdHJpbmc7XG5cdGNyZWF0ZWRBdD86IERhdGU7XG5cdHVwZGF0ZWRBdD86IERhdGU7XG5cdGlzQXJjaGl2ZWQ/OiBib29sZWFuO1xufSk6IElTZXNzaW9uIHtcblx0Y29uc3QgY3JlYXRlZEF0ID0gb3B0cy5jcmVhdGVkQXQgPz8gbmV3IERhdGUoKTtcblx0Y29uc3QgdXBkYXRlZEF0ID0gb3B0cy51cGRhdGVkQXQgPz8gY3JlYXRlZEF0O1xuXHRyZXR1cm4ge1xuXHRcdHNlc3Npb25JZDogaWQsXG5cdFx0cmVzb3VyY2U6IFVSSS5wYXJzZShgc2Vzc2lvbjovLyR7aWR9YCksXG5cdFx0cHJvdmlkZXJJZDogJ3Rlc3QnLFxuXHRcdHNlc3Npb25UeXBlOiAndGVzdCcsXG5cdFx0aWNvbjogQ29kaWNvbi5hY2NvdW50LFxuXHRcdGNyZWF0ZWRBdCxcblx0XHR3b3Jrc3BhY2U6IG9ic2VydmFibGVWYWx1ZShgd29ya3NwYWNlLSR7aWR9YCwgb3B0cy53b3Jrc3BhY2VMYWJlbCAhPT0gdW5kZWZpbmVkID8ge1xuXHRcdFx0dXJpOiBVUkkucGFyc2UoYHNlc3Npb246Ly93b3Jrc3BhY2UvJHtpZH1gKSxcblx0XHRcdGxhYmVsOiBvcHRzLndvcmtzcGFjZUxhYmVsLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5mb2xkZXIsXG5cdFx0XHRmb2xkZXJzOiBbXSxcblx0XHRcdHJlcXVpcmVzV29ya3NwYWNlVHJ1c3Q6IGZhbHNlLFxuXHRcdFx0aXNWaXJ0dWFsV29ya3NwYWNlOiBmYWxzZSxcblx0XHR9IDogdW5kZWZpbmVkKSxcblx0XHRpc1F1aWNrQ2hhdDogb2JzZXJ2YWJsZVZhbHVlKGBpc1F1aWNrQ2hhdC0ke2lkfWAsIG9wdHMud29ya3NwYWNlTGFiZWwgPT09IHVuZGVmaW5lZCksXG5cdFx0dGl0bGU6IG9ic2VydmFibGVWYWx1ZShgdGl0bGUtJHtpZH1gLCBpZCksXG5cdFx0dXBkYXRlZEF0OiBvYnNlcnZhYmxlVmFsdWUoYHVwZGF0ZWRBdC0ke2lkfWAsIHVwZGF0ZWRBdCksXG5cdFx0c3RhdHVzOiBvYnNlcnZhYmxlVmFsdWUoYHN0YXR1cy0ke2lkfWAsIFNlc3Npb25TdGF0dXMuQ29tcGxldGVkKSxcblx0XHRjaGFuZ2VzZXRzOiBvYnNlcnZhYmxlVmFsdWUoYGNoYW5nZXNldHMtJHtpZH1gLCBbXSksXG5cdFx0Y2hhbmdlczogb2JzZXJ2YWJsZVZhbHVlKGBjaGFuZ2VzLSR7aWR9YCwgW10pLFxuXHRcdG1vZGVsSWQ6IG9ic2VydmFibGVWYWx1ZShgbW9kZWxJZC0ke2lkfWAsIHVuZGVmaW5lZCksXG5cdFx0bW9kZTogb2JzZXJ2YWJsZVZhbHVlKGBtb2RlLSR7aWR9YCwgdW5kZWZpbmVkKSxcblx0XHRsb2FkaW5nOiBvYnNlcnZhYmxlVmFsdWUoYGxvYWRpbmctJHtpZH1gLCBmYWxzZSksXG5cdFx0aXNBcmNoaXZlZDogb2JzZXJ2YWJsZVZhbHVlKGBpc0FyY2hpdmVkLSR7aWR9YCwgb3B0cy5pc0FyY2hpdmVkID8/IGZhbHNlKSxcblx0XHRpc1JlYWQ6IG9ic2VydmFibGVWYWx1ZShgaXNSZWFkLSR7aWR9YCwgdHJ1ZSksXG5cdFx0ZGVzY3JpcHRpb246IG9ic2VydmFibGVWYWx1ZShgZGVzY3JpcHRpb24tJHtpZH1gLCB1bmRlZmluZWQpLFxuXHRcdGxhc3RUdXJuRW5kOiBvYnNlcnZhYmxlVmFsdWUoYGxhc3RUdXJuRW5kLSR7aWR9YCwgdW5kZWZpbmVkKSxcblx0XHRjaGF0czogb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElDaGF0W10+KGBjaGF0cy0ke2lkfWAsIFtdKSxcblx0XHRtYWluQ2hhdDogb2JzZXJ2YWJsZVZhbHVlPElDaGF0PihgbWFpbkNoYXQtJHtpZH1gLCB1bmRlZmluZWQhKSxcblx0XHRjYXBhYmlsaXRpZXM6IGNvbnN0T2JzZXJ2YWJsZSh7IHN1cHBvcnRzTXVsdGlwbGVDaGF0czogZmFsc2UgfSksXG5cdH07XG59XG5cbnN1aXRlKCdTZXNzaW9ucyAtIFNlc3Npb25zTGlzdCBIZWxwZXJzJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2FuaW1hdGVzIG9ubHkgYSBzaW5nbGUtc2Vzc2lvbiBpbmxpbmUgYXJjaGl2ZSBhY3Rpb24gd2l0aCBtb3Rpb24gZW5hYmxlZCcsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNpbmdsZUFyY2hpdmU6IHNob3VsZEFuaW1hdGVBcmNoaXZlQWN0aW9uKEFSQ0hJVkVfU0VTU0lPTl9DT01NQU5EX0lELCAxLCBmYWxzZSksXG5cdFx0XHRtdWx0aUFyY2hpdmU6IHNob3VsZEFuaW1hdGVBcmNoaXZlQWN0aW9uKEFSQ0hJVkVfU0VTU0lPTl9DT01NQU5EX0lELCAyLCBmYWxzZSksXG5cdFx0XHRyZWR1Y2VkTW90aW9uOiBzaG91bGRBbmltYXRlQXJjaGl2ZUFjdGlvbihBUkNISVZFX1NFU1NJT05fQ09NTUFORF9JRCwgMSwgdHJ1ZSksXG5cdFx0XHRvdGhlckFjdGlvbjogc2hvdWxkQW5pbWF0ZUFyY2hpdmVBY3Rpb24oJ3Nlc3Npb25zVmlld1BhbmUucGluU2Vzc2lvbicsIDEsIGZhbHNlKSxcblx0XHR9LCB7XG5cdFx0XHRzaW5nbGVBcmNoaXZlOiB0cnVlLFxuXHRcdFx0bXVsdGlBcmNoaXZlOiBmYWxzZSxcblx0XHRcdHJlZHVjZWRNb3Rpb246IGZhbHNlLFxuXHRcdFx0b3RoZXJBY3Rpb246IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZ3JvdXBCeVdvcmtzcGFjZScsICgpID0+IHtcblxuXHRcdHRlc3QoJ2dyb3VwcyBhcmUgc29ydGVkIGFscGhhYmV0aWNhbGx5IHJlZ2FyZGxlc3Mgb2YgaW5zZXJ0aW9uIG9yZGVyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBbXG5cdFx0XHRcdGNyZWF0ZVNlc3Npb24oJzEnLCB7IHdvcmtzcGFjZUxhYmVsOiAnWmVicmEnIH0pLFxuXHRcdFx0XHRjcmVhdGVTZXNzaW9uKCcyJywgeyB3b3Jrc3BhY2VMYWJlbDogJ0FwcGxlJyB9KSxcblx0XHRcdFx0Y3JlYXRlU2Vzc2lvbignMycsIHsgd29ya3NwYWNlTGFiZWw6ICdNYW5nbycgfSksXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBncm91cHMgPSBncm91cEJ5V29ya3NwYWNlKHNlc3Npb25zKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncm91cHMubWFwKGcgPT4gZy5sYWJlbCksIFsnQXBwbGUnLCAnTWFuZ28nLCAnWmVicmEnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZXNzaW9ucyB3aXRob3V0IHdvcmtzcGFjZSBhcmUgZ3JvdXBlZCB1bmRlciBcIlVua25vd25cIicsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gW1xuXHRcdFx0XHRjcmVhdGVTZXNzaW9uKCcxJywgeyB3b3Jrc3BhY2VMYWJlbDogJ0JldGEnIH0pLFxuXHRcdFx0XHRjcmVhdGVTZXNzaW9uKCcyJywge30pLFxuXHRcdFx0XHRjcmVhdGVTZXNzaW9uKCczJywgeyB3b3Jrc3BhY2VMYWJlbDogJ0FscGhhJyB9KSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IGdyb3VwcyA9IGdyb3VwQnlXb3Jrc3BhY2Uoc2Vzc2lvbnMpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyb3Vwcy5tYXAoZyA9PiBnLmxhYmVsKSwgWydBbHBoYScsICdCZXRhJywgJ1Vua25vd24nXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtdWx0aXBsZSBzZXNzaW9ucyBpbiBzYW1lIHdvcmtzcGFjZSBhcmUgZ3JvdXBlZCB0b2dldGhlcicsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gW1xuXHRcdFx0XHRjcmVhdGVTZXNzaW9uKCcxJywgeyB3b3Jrc3BhY2VMYWJlbDogJ1JlcG8tQicgfSksXG5cdFx0XHRcdGNyZWF0ZVNlc3Npb24oJzInLCB7IHdvcmtzcGFjZUxhYmVsOiAnUmVwby1BJyB9KSxcblx0XHRcdFx0Y3JlYXRlU2Vzc2lvbignMycsIHsgd29ya3NwYWNlTGFiZWw6ICdSZXBvLUInIH0pLFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgZ3JvdXBzID0gZ3JvdXBCeVdvcmtzcGFjZShzZXNzaW9ucyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JvdXBzLm1hcChnID0+IGcubGFiZWwpLCBbJ1JlcG8tQScsICdSZXBvLUInXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXBzWzBdLnNlc3Npb25zLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXBzWzFdLnNlc3Npb25zLmxlbmd0aCwgMik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdcIk5vIFdvcmtzcGFjZVwiIGFwcGVhcnMgYWZ0ZXIgd29ya3NwYWNlcyB0aGF0IHNvcnQgYWxwaGFiZXRpY2FsbHkgbGF0ZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IFtcblx0XHRcdFx0Y3JlYXRlU2Vzc2lvbignMScsIHt9KSxcblx0XHRcdFx0Y3JlYXRlU2Vzc2lvbignMicsIHsgd29ya3NwYWNlTGFiZWw6ICdadWx1JyB9KSxcblx0XHRcdFx0Y3JlYXRlU2Vzc2lvbignMycsIHsgd29ya3NwYWNlTGFiZWw6ICdBbHBoYScgfSksXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBncm91cHMgPSBncm91cEJ5V29ya3NwYWNlKHNlc3Npb25zKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncm91cHMubWFwKGcgPT4gZy5sYWJlbCksIFsnQWxwaGEnLCAnWnVsdScsICdVbmtub3duJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZW1wdHkgd29ya3NwYWNlIGxhYmVsIGlzIHRyZWF0ZWQgYXMgXCJVbmtub3duXCInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IFtcblx0XHRcdFx0Y3JlYXRlU2Vzc2lvbignMScsIHsgd29ya3NwYWNlTGFiZWw6ICdadWx1JyB9KSxcblx0XHRcdFx0Y3JlYXRlU2Vzc2lvbignMicsIHsgd29ya3NwYWNlTGFiZWw6ICcnIH0pLFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgZ3JvdXBzID0gZ3JvdXBCeVdvcmtzcGFjZShzZXNzaW9ucyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JvdXBzLm1hcChnID0+IGcubGFiZWwpLCBbJ1p1bHUnLCAnVW5rbm93biddKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cHNbMV0uc2Vzc2lvbnMubGVuZ3RoLCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dyb3VwIGlkcyBhcmUgcHJlZml4ZWQgd2l0aCB3b3Jrc3BhY2U6JywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBbXG5cdFx0XHRcdGNyZWF0ZVNlc3Npb24oJzEnLCB7IHdvcmtzcGFjZUxhYmVsOiAnTXlQcm9qZWN0JyB9KSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IGdyb3VwcyA9IGdyb3VwQnlXb3Jrc3BhY2Uoc2Vzc2lvbnMpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXBzWzBdLmlkLCAnd29ya3NwYWNlOk15UHJvamVjdCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZ3JvdXBCeURhdGUnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBEQVlfTVMgPSA4Nl80MDBfMDAwO1xuXG5cdFx0Ly8gYGdyb3VwQnlEYXRlYCBleHBlY3RzIHNlc3Npb25zIHByZS1zb3J0ZWQgbW9zdC1yZWNlbnQtZmlyc3QuXG5cdFx0ZnVuY3Rpb24gbWludXRlc0FnbyhtaW51dGVzOiBudW1iZXIpOiBEYXRlIHtcblx0XHRcdHJldHVybiBuZXcgRGF0ZShEYXRlLm5vdygpIC0gbWludXRlcyAqIDYwXzAwMCk7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gZGF5c0FnbyhkYXlzOiBudW1iZXIpOiBEYXRlIHtcblx0XHRcdHJldHVybiBuZXcgRGF0ZShEYXRlLm5vdygpIC0gZGF5cyAqIERBWV9NUyk7XG5cdFx0fVxuXG5cdFx0dGVzdCgnc2Vzc2lvbnMgd2l0aGluIHRoZSBsYXN0IDcgZGF5cyBnbyB0byBcIlJlY2VudFwiLCBvbGRlciBvbmVzIHRvIFwiT2xkZXJcIicsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gW1xuXHRcdFx0XHRjcmVhdGVTZXNzaW9uKCdyZWNlbnQtMScsIHsgY3JlYXRlZEF0OiBtaW51dGVzQWdvKDUpIH0pLFxuXHRcdFx0XHRjcmVhdGVTZXNzaW9uKCdyZWNlbnQtMicsIHsgY3JlYXRlZEF0OiBkYXlzQWdvKDMpIH0pLFxuXHRcdFx0XHRjcmVhdGVTZXNzaW9uKCdvbGQtMScsIHsgY3JlYXRlZEF0OiBkYXlzQWdvKDEwKSB9KSxcblx0XHRcdFx0Y3JlYXRlU2Vzc2lvbignb2xkLTInLCB7IGNyZWF0ZWRBdDogZGF5c0FnbygzMCkgfSksXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBzZWN0aW9ucyA9IGdyb3VwQnlEYXRlKHNlc3Npb25zLCBTZXNzaW9uc1NvcnRpbmcuQ3JlYXRlZCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VjdGlvbnMubWFwKHMgPT4gKHsgaWQ6IHMuaWQsIHNlc3Npb25zOiBzLnNlc3Npb25zLm1hcChzZXNzaW9uID0+IHNlc3Npb24uc2Vzc2lvbklkKSB9KSksIFtcblx0XHRcdFx0eyBpZDogJ3JlY2VudCcsIHNlc3Npb25zOiBbJ3JlY2VudC0xJywgJ3JlY2VudC0yJ10gfSxcblx0XHRcdFx0eyBpZDogJ29sZGVyJywgc2Vzc2lvbnM6IFsnb2xkLTEnLCAnb2xkLTInXSB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdcIlJlY2VudFwiIGlzIGNhcHBlZCBhdCAxMCBzZXNzaW9uczsgdGhlIG92ZXJmbG93IHdpdGhpbiA3IGRheXMgZmFsbHMgaW50byBcIk9sZGVyXCInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IEFycmF5LmZyb20oeyBsZW5ndGg6IDEzIH0sIChfLCBpKSA9PlxuXHRcdFx0XHRjcmVhdGVTZXNzaW9uKGBzJHtpfWAsIHsgY3JlYXRlZEF0OiBtaW51dGVzQWdvKGkgKyAxKSB9KSk7XG5cblx0XHRcdGNvbnN0IHNlY3Rpb25zID0gZ3JvdXBCeURhdGUoc2Vzc2lvbnMsIFNlc3Npb25zU29ydGluZy5DcmVhdGVkKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZWN0aW9ucy5tYXAocyA9PiAoeyBpZDogcy5pZCwgc2Vzc2lvbnM6IHMuc2Vzc2lvbnMubWFwKHNlc3Npb24gPT4gc2Vzc2lvbi5zZXNzaW9uSWQpIH0pKSwgW1xuXHRcdFx0XHR7IGlkOiAncmVjZW50Jywgc2Vzc2lvbnM6IFsnczAnLCAnczEnLCAnczInLCAnczMnLCAnczQnLCAnczUnLCAnczYnLCAnczcnLCAnczgnLCAnczknXSB9LFxuXHRcdFx0XHR7IGlkOiAnb2xkZXInLCBzZXNzaW9uczogWydzMTAnLCAnczExJywgJ3MxMiddIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2VtcHR5IHNlY3Rpb25zIGFyZSBvbWl0dGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBbXG5cdFx0XHRcdGNyZWF0ZVNlc3Npb24oJ29ubHktb2xkJywgeyBjcmVhdGVkQXQ6IGRheXNBZ28oMjApIH0pLFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3Qgc2VjdGlvbnMgPSBncm91cEJ5RGF0ZShzZXNzaW9ucywgU2Vzc2lvbnNTb3J0aW5nLkNyZWF0ZWQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlY3Rpb25zLm1hcChzID0+IHMuaWQpLCBbJ29sZGVyJ10pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnc29ydFNlc3Npb25zJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnc29ydHMgYnkgY3JlYXRlZEF0IGRlc2NlbmRpbmcgd2hlbiBzb3J0aW5nIGlzIENyZWF0ZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IFtcblx0XHRcdFx0Y3JlYXRlU2Vzc2lvbignb2xkJywgeyBjcmVhdGVkQXQ6IG5ldyBEYXRlKCcyMDI0LTAxLTAxJykgfSksXG5cdFx0XHRcdGNyZWF0ZVNlc3Npb24oJ25ldycsIHsgY3JlYXRlZEF0OiBuZXcgRGF0ZSgnMjAyNC0wNi0wMScpIH0pLFxuXHRcdFx0XHRjcmVhdGVTZXNzaW9uKCdtaWQnLCB7IGNyZWF0ZWRBdDogbmV3IERhdGUoJzIwMjQtMDMtMDEnKSB9KSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IHNvcnRlZCA9IHNvcnRTZXNzaW9ucyhzZXNzaW9ucywgU2Vzc2lvbnNTb3J0aW5nLkNyZWF0ZWQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNvcnRlZC5tYXAocyA9PiBzLnNlc3Npb25JZCksIFsnbmV3JywgJ21pZCcsICdvbGQnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzb3J0cyBieSB1cGRhdGVkQXQgZGVzY2VuZGluZyB3aGVuIHNvcnRpbmcgaXMgVXBkYXRlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gW1xuXHRcdFx0XHRjcmVhdGVTZXNzaW9uKCdhJywgeyBjcmVhdGVkQXQ6IG5ldyBEYXRlKCcyMDI0LTA2LTAxJyksIHVwZGF0ZWRBdDogbmV3IERhdGUoJzIwMjQtMDctMDEnKSB9KSxcblx0XHRcdFx0Y3JlYXRlU2Vzc2lvbignYicsIHsgY3JlYXRlZEF0OiBuZXcgRGF0ZSgnMjAyNC0wMS0wMScpLCB1cGRhdGVkQXQ6IG5ldyBEYXRlKCcyMDI0LTA5LTAxJykgfSksXG5cdFx0XHRcdGNyZWF0ZVNlc3Npb24oJ2MnLCB7IGNyZWF0ZWRBdDogbmV3IERhdGUoJzIwMjQtMDMtMDEnKSwgdXBkYXRlZEF0OiBuZXcgRGF0ZSgnMjAyNC0wOC0wMScpIH0pLFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3Qgc29ydGVkID0gc29ydFNlc3Npb25zKHNlc3Npb25zLCBTZXNzaW9uc1NvcnRpbmcuVXBkYXRlZCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc29ydGVkLm1hcChzID0+IHMuc2Vzc2lvbklkKSwgWydiJywgJ2MnLCAnYSddKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2xpbWl0U2Vzc2lvbnNGb3JMaXN0JywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnY2FwcyBzZXNzaW9ucyBhbmQgcmV0dXJucyBhIHNob3cgbW9yZSBpdGVtJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBbJzEnLCAnMicsICczJ10ubWFwKGlkID0+IGNyZWF0ZVNlc3Npb24oaWQsIHt9KSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBsaW1pdFNlc3Npb25zRm9yTGlzdChzZXNzaW9ucywgMiwge1xuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRleHBhbmRlZDogZmFsc2UsXG5cdFx0XHRcdHNlY3Rpb25JZDogJ2dyb3VwOmFscGhhJyxcblx0XHRcdFx0c2VjdGlvbkxhYmVsOiAnQWxwaGEnLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzZXNzaW9uczogcmVzdWx0LnNlc3Npb25zLm1hcChzZXNzaW9uID0+IHNlc3Npb24uc2Vzc2lvbklkKSxcblx0XHRcdFx0c2hvd01vcmU6IHJlc3VsdC5zaG93TW9yZSxcblx0XHRcdH0sIHtcblx0XHRcdFx0c2Vzc2lvbnM6IFsnMScsICcyJ10sXG5cdFx0XHRcdHNob3dNb3JlOiB7XG5cdFx0XHRcdFx0c2hvd01vcmU6IHRydWUsXG5cdFx0XHRcdFx0a2luZDogJ3Nlc3Npb25zJyxcblx0XHRcdFx0XHRtb2RlOiAnbW9yZScsXG5cdFx0XHRcdFx0c2VjdGlvbklkOiAnZ3JvdXA6YWxwaGEnLFxuXHRcdFx0XHRcdHNlY3Rpb25MYWJlbDogJ0FscGhhJyxcblx0XHRcdFx0XHRyZW1haW5pbmdDb3VudDogMSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBhbGwgc2Vzc2lvbnMgYW5kIGEgc2hvdyBsZXNzIGl0ZW0gd2hlbiBleHBhbmRlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gWycxJywgJzInLCAnMyddLm1hcChpZCA9PiBjcmVhdGVTZXNzaW9uKGlkLCB7fSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gbGltaXRTZXNzaW9uc0Zvckxpc3Qoc2Vzc2lvbnMsIDIsIHtcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0ZXhwYW5kZWQ6IHRydWUsXG5cdFx0XHRcdHNlY3Rpb25JZDogJ2dyb3VwOmFscGhhJyxcblx0XHRcdFx0c2VjdGlvbkxhYmVsOiAnQWxwaGEnLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzZXNzaW9uczogcmVzdWx0LnNlc3Npb25zLm1hcChzZXNzaW9uID0+IHNlc3Npb24uc2Vzc2lvbklkKSxcblx0XHRcdFx0c2hvd01vcmU6IHJlc3VsdC5zaG93TW9yZSxcblx0XHRcdH0sIHtcblx0XHRcdFx0c2Vzc2lvbnM6IFsnMScsICcyJywgJzMnXSxcblx0XHRcdFx0c2hvd01vcmU6IHtcblx0XHRcdFx0XHRzaG93TW9yZTogdHJ1ZSxcblx0XHRcdFx0XHRraW5kOiAnc2Vzc2lvbnMnLFxuXHRcdFx0XHRcdG1vZGU6ICdsZXNzJyxcblx0XHRcdFx0XHRzZWN0aW9uSWQ6ICdncm91cDphbHBoYScsXG5cdFx0XHRcdFx0c2VjdGlvbkxhYmVsOiAnQWxwaGEnLFxuXHRcdFx0XHRcdHJlbWFpbmluZ0NvdW50OiAwLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBjYXAgd2hlbiBkaXNhYmxlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gWycxJywgJzInLCAnMyddLm1hcChpZCA9PiBjcmVhdGVTZXNzaW9uKGlkLCB7fSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gbGltaXRTZXNzaW9uc0Zvckxpc3Qoc2Vzc2lvbnMsIDIsIHtcblx0XHRcdFx0ZW5hYmxlZDogZmFsc2UsXG5cdFx0XHRcdGV4cGFuZGVkOiBmYWxzZSxcblx0XHRcdFx0c2VjdGlvbklkOiAnZ3JvdXA6YWxwaGEnLFxuXHRcdFx0XHRzZWN0aW9uTGFiZWw6ICdBbHBoYScsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHNlc3Npb25zOiByZXN1bHQuc2Vzc2lvbnMubWFwKHNlc3Npb24gPT4gc2Vzc2lvbi5zZXNzaW9uSWQpLFxuXHRcdFx0XHRzaG93TW9yZTogcmVzdWx0LnNob3dNb3JlLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzZXNzaW9uczogWycxJywgJzInLCAnMyddLFxuXHRcdFx0XHRzaG93TW9yZTogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdncm91cFNlc3Npb25zRm9yTGlzdCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ3Nob3dzIHBpbm5lZCBzZXNzaW9ucyBpbiBhIGRlZGljYXRlZCB0b3Agc2VjdGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHBpbm5lZCA9IGNyZWF0ZVNlc3Npb24oJ3Bpbm5lZCcsIHsgd29ya3NwYWNlTGFiZWw6ICdBbHBoYScsIGNyZWF0ZWRBdDogbmV3IERhdGUoJzIwMjQtMDYtMDEnKSB9KTtcblx0XHRcdGNvbnN0IHJlZ3VsYXIgPSBjcmVhdGVTZXNzaW9uKCdyZWd1bGFyJywgeyB3b3Jrc3BhY2VMYWJlbDogJ0JldGEnLCBjcmVhdGVkQXQ6IG5ldyBEYXRlKCcyMDI0LTA1LTAxJykgfSk7XG5cdFx0XHRjb25zdCBzZWN0aW9ucyA9IGdyb3VwU2Vzc2lvbnNGb3JMaXN0KFxuXHRcdFx0XHRbcGlubmVkLCByZWd1bGFyXSxcblx0XHRcdFx0U2Vzc2lvbnNHcm91cGluZy5Xb3Jrc3BhY2UsXG5cdFx0XHRcdFNlc3Npb25zU29ydGluZy5DcmVhdGVkLFxuXHRcdFx0XHRzZXNzaW9uID0+IHNlc3Npb24uc2Vzc2lvbklkID09PSBwaW5uZWQuc2Vzc2lvbklkLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZWN0aW9ucy5tYXAoc2VjdGlvbiA9PiBzZWN0aW9uLmlkKSwgWydwaW5uZWQnLCAnd29ya3NwYWNlOkJldGEnXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlY3Rpb25zWzBdLnNlc3Npb25zLm1hcChzZXNzaW9uID0+IHNlc3Npb24uc2Vzc2lvbklkKSwgWydwaW5uZWQnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdrZWVwcyBhcmNoaXZlZCBzZXNzaW9ucyBpbiBEb25lIGV2ZW4gd2hlbiBwaW5uZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBhcmNoaXZlZFBpbm5lZCA9IGNyZWF0ZVNlc3Npb24oJ2FyY2hpdmVkLXBpbm5lZCcsIHsgd29ya3NwYWNlTGFiZWw6ICdBbHBoYScsIGlzQXJjaGl2ZWQ6IHRydWUsIGNyZWF0ZWRBdDogbmV3IERhdGUoJzIwMjQtMDYtMDEnKSB9KTtcblx0XHRcdGNvbnN0IHNlY3Rpb25zID0gZ3JvdXBTZXNzaW9uc0Zvckxpc3QoXG5cdFx0XHRcdFthcmNoaXZlZFBpbm5lZF0sXG5cdFx0XHRcdFNlc3Npb25zR3JvdXBpbmcuV29ya3NwYWNlLFxuXHRcdFx0XHRTZXNzaW9uc1NvcnRpbmcuQ3JlYXRlZCxcblx0XHRcdFx0KCkgPT4gdHJ1ZSxcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VjdGlvbnMubWFwKHNlY3Rpb24gPT4gc2VjdGlvbi5pZCksIFsnYXJjaGl2ZWQnXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlY3Rpb25zWzBdLnNlc3Npb25zLm1hcChzZXNzaW9uID0+IHNlc3Npb24uc2Vzc2lvbklkKSwgWydhcmNoaXZlZC1waW5uZWQnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzb3J0cyBwaW5uZWQgc2Vzc2lvbnMgdXNpbmcgc3VwcGxpZWQgc29ydCBrZXlzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlyc3QgPSBjcmVhdGVTZXNzaW9uKCdmaXJzdCcsIHsgY3JlYXRlZEF0OiBuZXcgRGF0ZSgnMjAyNC0wMS0wMScpIH0pO1xuXHRcdFx0Y29uc3Qgc2Vjb25kID0gY3JlYXRlU2Vzc2lvbignc2Vjb25kJywgeyBjcmVhdGVkQXQ6IG5ldyBEYXRlKCcyMDI0LTA2LTAxJykgfSk7XG5cdFx0XHRjb25zdCBzZWN0aW9ucyA9IGdyb3VwU2Vzc2lvbnNGb3JMaXN0KFxuXHRcdFx0XHRbZmlyc3QsIHNlY29uZF0sXG5cdFx0XHRcdFNlc3Npb25zR3JvdXBpbmcuV29ya3NwYWNlLFxuXHRcdFx0XHRTZXNzaW9uc1NvcnRpbmcuQ3JlYXRlZCxcblx0XHRcdFx0KCkgPT4gdHJ1ZSxcblx0XHRcdFx0c2Vzc2lvbiA9PiBzZXNzaW9uLnNlc3Npb25JZCA9PT0gZmlyc3Quc2Vzc2lvbklkID8gMjAwIDogMTAwLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZWN0aW9ucy5tYXAoc2VjdGlvbiA9PiAoeyBpZDogc2VjdGlvbi5pZCwgc2Vzc2lvbnM6IHNlY3Rpb24uc2Vzc2lvbnMubWFwKHNlc3Npb24gPT4gc2Vzc2lvbi5zZXNzaW9uSWQpIH0pKSwgW1xuXHRcdFx0XHR7IGlkOiAncGlubmVkJywgc2Vzc2lvbnM6IFsnZmlyc3QnLCAnc2Vjb25kJ10gfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd29ya3NwYWNlLWxlc3Mgc2Vzc2lvbnMgZm9ybSBhIENoYXRzIHNlY3Rpb24gZGlyZWN0bHkgYmVsb3cgUGlubmVkIChhYm92ZSBncm91cHMpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGlubmVkID0gY3JlYXRlU2Vzc2lvbigncGlubmVkJywgeyB3b3Jrc3BhY2VMYWJlbDogJ0FscGhhJywgY3JlYXRlZEF0OiBuZXcgRGF0ZSgnMjAyNC0wNi0wMycpIH0pO1xuXHRcdFx0Y29uc3QgcXVpY2sgPSBjcmVhdGVTZXNzaW9uKCdxdWljaycsIHsgY3JlYXRlZEF0OiBuZXcgRGF0ZSgnMjAyNC0wNi0wMicpIH0pO1xuXHRcdFx0Y29uc3QgcmVndWxhciA9IGNyZWF0ZVNlc3Npb24oJ3JlZ3VsYXInLCB7IHdvcmtzcGFjZUxhYmVsOiAnQmV0YScsIGNyZWF0ZWRBdDogbmV3IERhdGUoJzIwMjQtMDYtMDEnKSB9KTtcblx0XHRcdGNvbnN0IGFyY2hpdmVkID0gY3JlYXRlU2Vzc2lvbignYXJjaGl2ZWQnLCB7IHdvcmtzcGFjZUxhYmVsOiAnR2FtbWEnLCBpc0FyY2hpdmVkOiB0cnVlLCBjcmVhdGVkQXQ6IG5ldyBEYXRlKCcyMDI0LTA1LTAxJykgfSk7XG5cdFx0XHRjb25zdCBzZWN0aW9ucyA9IGdyb3VwU2Vzc2lvbnNGb3JMaXN0KFxuXHRcdFx0XHRbcGlubmVkLCBxdWljaywgcmVndWxhciwgYXJjaGl2ZWRdLFxuXHRcdFx0XHRTZXNzaW9uc0dyb3VwaW5nLldvcmtzcGFjZSxcblx0XHRcdFx0U2Vzc2lvbnNTb3J0aW5nLkNyZWF0ZWQsXG5cdFx0XHRcdHNlc3Npb24gPT4gc2Vzc2lvbi5zZXNzaW9uSWQgPT09IHBpbm5lZC5zZXNzaW9uSWQsXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlY3Rpb25zLm1hcChzZWN0aW9uID0+ICh7IGlkOiBzZWN0aW9uLmlkLCBzZXNzaW9uczogc2VjdGlvbi5zZXNzaW9ucy5tYXAocyA9PiBzLnNlc3Npb25JZCkgfSkpLCBbXG5cdFx0XHRcdHsgaWQ6ICdwaW5uZWQnLCBzZXNzaW9uczogWydwaW5uZWQnXSB9LFxuXHRcdFx0XHR7IGlkOiAncXVpY2tjaGF0cycsIHNlc3Npb25zOiBbJ3F1aWNrJ10gfSxcblx0XHRcdFx0eyBpZDogJ3dvcmtzcGFjZTpCZXRhJywgc2Vzc2lvbnM6IFsncmVndWxhciddIH0sXG5cdFx0XHRcdHsgaWQ6ICdhcmNoaXZlZCcsIHNlc3Npb25zOiBbJ2FyY2hpdmVkJ10gfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGlubmVkIHF1aWNrIGNoYXQgc3RheXMgaW4gUGlubmVkLCBub3QgUXVpY2sgQ2hhdHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBxdWljayA9IGNyZWF0ZVNlc3Npb24oJ3F1aWNrJywgeyBjcmVhdGVkQXQ6IG5ldyBEYXRlKCcyMDI0LTA2LTAxJykgfSk7XG5cdFx0XHRjb25zdCBzZWN0aW9ucyA9IGdyb3VwU2Vzc2lvbnNGb3JMaXN0KFxuXHRcdFx0XHRbcXVpY2tdLFxuXHRcdFx0XHRTZXNzaW9uc0dyb3VwaW5nLldvcmtzcGFjZSxcblx0XHRcdFx0U2Vzc2lvbnNTb3J0aW5nLkNyZWF0ZWQsXG5cdFx0XHRcdCgpID0+IHRydWUsXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlY3Rpb25zLm1hcChzZWN0aW9uID0+IHNlY3Rpb24uaWQpLCBbJ3Bpbm5lZCddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ0NoYXRzIHNlY3Rpb24gc2l0cyBkaXJlY3RseSBiZWxvdyBQaW5uZWQgd2hlbiBncm91cGluZyBieSBkYXRlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGlubmVkID0gY3JlYXRlU2Vzc2lvbigncGlubmVkJywgeyBjcmVhdGVkQXQ6IG5ldyBEYXRlKCcyMDI0LTA2LTAzJykgfSk7XG5cdFx0XHRjb25zdCBxdWljayA9IGNyZWF0ZVNlc3Npb24oJ3F1aWNrJywgeyBjcmVhdGVkQXQ6IG5ldyBEYXRlKCcyMDI0LTA2LTAyJykgfSk7XG5cdFx0XHRjb25zdCByZWd1bGFyID0gY3JlYXRlU2Vzc2lvbigncmVndWxhcicsIHsgd29ya3NwYWNlTGFiZWw6ICdCZXRhJywgY3JlYXRlZEF0OiBuZXcgRGF0ZSgnMjAyNC0wNi0wMScpIH0pO1xuXHRcdFx0Y29uc3Qgc2VjdGlvbnMgPSBncm91cFNlc3Npb25zRm9yTGlzdChcblx0XHRcdFx0W3Bpbm5lZCwgcXVpY2ssIHJlZ3VsYXJdLFxuXHRcdFx0XHRTZXNzaW9uc0dyb3VwaW5nLkRhdGUsXG5cdFx0XHRcdFNlc3Npb25zU29ydGluZy5DcmVhdGVkLFxuXHRcdFx0XHRzZXNzaW9uID0+IHNlc3Npb24uc2Vzc2lvbklkID09PSBwaW5uZWQuc2Vzc2lvbklkLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY3Rpb25zWzBdLmlkLCAncGlubmVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VjdGlvbnNbMV0uaWQsICdxdWlja2NoYXRzJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlY3Rpb25zWzFdLnNlc3Npb25zLm1hcChzID0+IHMuc2Vzc2lvbklkKSwgWydxdWljayddKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2NvbXB1dGVSZW9yZGVyU29ydENoYW5nZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgTk9XID0gMV8wMDBfMDAwO1xuXHRcdGNvbnN0IFNURVAgPSA2MF8wMDA7XG5cblx0XHR0ZXN0KCdzaW5nbGUgZHJvcCBiZXR3ZWVuIHR3byBuZWlnaGJvdXJzIHVzZXMgdGhlIG1pZHBvaW50JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXQsIGNsZWFyIH0gPSBjb21wdXRlUmVvcmRlclNvcnRDaGFuZ2VzKHtcblx0XHRcdFx0ZHJhZ2dlZElkczogWyd4J10sXG5cdFx0XHRcdG5hdHVyYWxLZXlzOiBbMTBdLFxuXHRcdFx0XHRhYm92ZUtleTogMTAwLFxuXHRcdFx0XHRiZWxvd0tleTogNTAsXG5cdFx0XHRcdG5vdzogTk9XLFxuXHRcdFx0XHRmYWxsYmFja1N0ZXA6IFNURVAsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4uc2V0XSwgW1sneCcsIDc1XV0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjbGVhciwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZHJvcCBhYm92ZSB0aGUgZmlyc3Qgc2Vzc2lvbiB1c2VzIHRoZSBjdXJyZW50IHRpbWUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNldCwgY2xlYXIgfSA9IGNvbXB1dGVSZW9yZGVyU29ydENoYW5nZXMoe1xuXHRcdFx0XHRkcmFnZ2VkSWRzOiBbJ3gnXSxcblx0XHRcdFx0bmF0dXJhbEtleXM6IFsxMF0sXG5cdFx0XHRcdGFib3ZlS2V5OiB1bmRlZmluZWQsXG5cdFx0XHRcdGJlbG93S2V5OiAyMDAsXG5cdFx0XHRcdG5vdzogTk9XLFxuXHRcdFx0XHRmYWxsYmFja1N0ZXA6IFNURVAsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjbGVhciwgW10pO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBzZXQuZ2V0KCd4JykhO1xuXHRcdFx0YXNzZXJ0Lm9rKHZhbHVlID4gMjAwICYmIHZhbHVlIDwgTk9XLCBgZXhwZWN0ZWQgJHt2YWx1ZX0gYmV0d2VlbiAyMDAgYW5kICR7Tk9XfWApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZHJvcCBiZWxvdyB0aGUgbGFzdCBzZXNzaW9uIHN0ZXBzIGJlbG93IHRoZSBsYXN0IGtleScsICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2V0LCBjbGVhciB9ID0gY29tcHV0ZVJlb3JkZXJTb3J0Q2hhbmdlcyh7XG5cdFx0XHRcdGRyYWdnZWRJZHM6IFsneCddLFxuXHRcdFx0XHRuYXR1cmFsS2V5czogWzUwMF0sXG5cdFx0XHRcdGFib3ZlS2V5OiAxMDAsXG5cdFx0XHRcdGJlbG93S2V5OiB1bmRlZmluZWQsXG5cdFx0XHRcdG5vdzogTk9XLFxuXHRcdFx0XHRmYWxsYmFja1N0ZXA6IFNURVAsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjbGVhciwgW10pO1xuXHRcdFx0YXNzZXJ0Lm9rKHNldC5nZXQoJ3gnKSEgPCAxMDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZHJvcHMgdGhlIGZha2UgdmFsdWUgd2hlbiB0aGUgbmF0dXJhbCBrZXkgYWxyZWFkeSBmaXRzIHRoZSBzbG90JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXQsIGNsZWFyIH0gPSBjb21wdXRlUmVvcmRlclNvcnRDaGFuZ2VzKHtcblx0XHRcdFx0ZHJhZ2dlZElkczogWyd4J10sXG5cdFx0XHRcdG5hdHVyYWxLZXlzOiBbNzVdLFxuXHRcdFx0XHRhYm92ZUtleTogMTAwLFxuXHRcdFx0XHRiZWxvd0tleTogNTAsXG5cdFx0XHRcdG5vdzogTk9XLFxuXHRcdFx0XHRmYWxsYmFja1N0ZXA6IFNURVAsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4uc2V0XSwgW10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjbGVhciwgWyd4J10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbXVsdGktYmxvY2sgZ2V0cyBzdHJpY3RseSBkZXNjZW5kaW5nIGtleXMgaW5zaWRlIHRoZSBnYXAnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNldCwgY2xlYXIgfSA9IGNvbXB1dGVSZW9yZGVyU29ydENoYW5nZXMoe1xuXHRcdFx0XHRkcmFnZ2VkSWRzOiBbJ2EnLCAnYicsICdjJ10sXG5cdFx0XHRcdG5hdHVyYWxLZXlzOiBbNSwgNCwgM10sXG5cdFx0XHRcdGFib3ZlS2V5OiAxMDAsXG5cdFx0XHRcdGJlbG93S2V5OiA0MCxcblx0XHRcdFx0bm93OiBOT1csXG5cdFx0XHRcdGZhbGxiYWNrU3RlcDogU1RFUCxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNsZWFyLCBbXSk7XG5cdFx0XHRjb25zdCB2YWx1ZXMgPSBbJ2EnLCAnYicsICdjJ10ubWFwKGlkID0+IHNldC5nZXQoaWQpISk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZhbHVlcywgWzg1LCA3MCwgNTVdKTtcblx0XHRcdGFzc2VydC5vayh2YWx1ZXMuZXZlcnkodiA9PiB2ID4gNDAgJiYgdiA8IDEwMCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbXVsdGktYmxvY2sgY2xlYXJzIG92ZXJyaWRlcyB3aGVuIGFsbCBuYXR1cmFsIGtleXMgYWxyZWFkeSBmaXQgaW4gb3JkZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNldCwgY2xlYXIgfSA9IGNvbXB1dGVSZW9yZGVyU29ydENoYW5nZXMoe1xuXHRcdFx0XHRkcmFnZ2VkSWRzOiBbJ2EnLCAnYiddLFxuXHRcdFx0XHRuYXR1cmFsS2V5czogWzgwLCA2MF0sXG5cdFx0XHRcdGFib3ZlS2V5OiAxMDAsXG5cdFx0XHRcdGJlbG93S2V5OiA0MCxcblx0XHRcdFx0bm93OiBOT1csXG5cdFx0XHRcdGZhbGxiYWNrU3RlcDogU1RFUCxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi5zZXRdLCBbXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNsZWFyLCBbJ2EnLCAnYiddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ211bHRpLWJsb2NrIGFzc2lnbnMgc3ludGhldGljIGtleXMgd2hlbiBuYXR1cmFsIG9yZGVyIGRvZXMgbm90IGZpdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2V0LCBjbGVhciB9ID0gY29tcHV0ZVJlb3JkZXJTb3J0Q2hhbmdlcyh7XG5cdFx0XHRcdGRyYWdnZWRJZHM6IFsnYScsICdiJ10sXG5cdFx0XHRcdG5hdHVyYWxLZXlzOiBbNjAsIDgwXSwgLy8gYXNjZW5kaW5nOiBkb2VzIG5vdCBtYXRjaCBkZXNjZW5kaW5nIGRpc3BsYXkgb3JkZXJcblx0XHRcdFx0YWJvdmVLZXk6IDEwMCxcblx0XHRcdFx0YmVsb3dLZXk6IDQwLFxuXHRcdFx0XHRub3c6IE5PVyxcblx0XHRcdFx0ZmFsbGJhY2tTdGVwOiBTVEVQLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2xlYXIsIFtdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXQuc2l6ZSwgMik7XG5cdFx0XHRhc3NlcnQub2soc2V0LmdldCgnYScpISA+IHNldC5nZXQoJ2InKSEpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQix1QkFBdUI7QUFDakQsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQTBCLHFCQUFxQjtBQUMvQyxTQUFTLDJCQUEyQixhQUFhLGtCQUFrQixzQkFBc0Isc0JBQXNCLDRCQUE0QixjQUFjLGtCQUFrQix1QkFBdUI7QUFDbE0sU0FBUyxrQ0FBa0M7QUFFM0MsU0FBUyxjQUFjLElBQVksTUFLdEI7QUFDWixRQUFNLFlBQVksS0FBSyxhQUFhLG9CQUFJLEtBQUs7QUFDN0MsUUFBTSxZQUFZLEtBQUssYUFBYTtBQUNwQyxTQUFPO0FBQUEsSUFDTixXQUFXO0FBQUEsSUFDWCxVQUFVLElBQUksTUFBTSxhQUFhLEVBQUUsRUFBRTtBQUFBLElBQ3JDLFlBQVk7QUFBQSxJQUNaLGFBQWE7QUFBQSxJQUNiLE1BQU0sUUFBUTtBQUFBLElBQ2Q7QUFBQSxJQUNBLFdBQVcsZ0JBQWdCLGFBQWEsRUFBRSxJ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TSxFQUFFLEtBQUssTUFBTSxJQUFJLDBCQUEwQjtBQUFBLFFBQ2hELFlBQVksQ0FBQyxLQUFLLEtBQUssR0FBRztBQUFBLFFBQzFCLGFBQWEsQ0FBQyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQ3JCLFVBQVU7QUFBQSxRQUNWLFVBQVU7QUFBQSxRQUNWLEtBQUs7QUFBQSxRQUNMLGNBQWM7QUFBQSxNQUNmLENBQUM7QUFFRCxhQUFPLGdCQUFnQixPQUFPLENBQUMsQ0FBQztBQUNoQyxZQUFNLFNBQVMsQ0FBQyxLQUFLLEtBQUssR0FBRyxFQUFFLElBQUksUUFBTSxJQUFJLElBQUksRUFBRSxDQUFFO0FBQ3JELGFBQU8sZ0JBQWdCLFFBQVEsQ0FBQyxJQUFJLElBQUksRUFBRSxDQUFDO0FBQzNDLGFBQU8sR0FBRyxPQUFPLE1BQU0sT0FBSyxJQUFJLE1BQU0sSUFBSSxHQUFHLENBQUM7QUFBQSxJQUMvQyxDQUFDO0FBRUQsU0FBSywyRUFBMkUsTUFBTTtBQUNyRixZQUFNLEVBQUUsS0FBSyxNQUFNLElBQUksMEJBQTBCO0FBQUEsUUFDaEQsWUFBWSxDQUFDLEtBQUssR0FBRztBQUFBLFFBQ3JCLGFBQWEsQ0FBQyxJQUFJLEVBQUU7QUFBQSxRQUNwQixVQUFVO0FBQUEsUUFDVixVQUFVO0FBQUEsUUFDVixLQUFLO0FBQUEsUUFDTCxjQUFjO0FBQUEsTUFDZixDQUFDO0FBRUQsYUFBTyxnQkFBZ0IsQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFDbkMsYUFBTyxnQkFBZ0IsT0FBTyxDQUFDLEtBQUssR0FBRyxDQUFDO0FBQUEsSUFDekMsQ0FBQztBQUVELFNBQUssc0VBQXNFLE1BQU07QUFDaEYsWUFBTSxFQUFFLEtBQUssTUFBTSxJQUFJLDBCQUEwQjtBQUFBLFFBQ2hELFlBQVksQ0FBQyxLQUFLLEdBQUc7QUFBQSxRQUNyQixhQUFhLENBQUMsSUFBSSxFQUFFO0FBQUE7QUFBQSxRQUNwQixVQUFVO0FBQUEsUUFDVixVQUFVO0FBQUEsUUFDVixLQUFLO0FBQUEsUUFDTCxjQUFjO0FBQUEsTUFDZixDQUFDO0FBRUQsYUFBTyxnQkFBZ0IsT0FBTyxDQUFDLENBQUM7QUFDaEMsYUFBTyxZQUFZLElBQUksTUFBTSxDQUFDO0FBQzlCLGFBQU8sR0FBRyxJQUFJLElBQUksR0FBRyxJQUFLLElBQUksSUFBSSxHQUFHLENBQUU7QUFBQSxJQUN4QyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
