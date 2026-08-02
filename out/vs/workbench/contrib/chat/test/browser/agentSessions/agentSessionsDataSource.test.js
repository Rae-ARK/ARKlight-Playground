import assert from "assert";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { AgentSessionsDataSource, sessionDateFromNow, getRepositoryName, AgentSessionsSorter, groupAgentSessionsByDate, getAgentSessionStatusIcon } from "../../../browser/agentSessions/agentSessionsViewer.js";
import { AgentSessionSection, isAgentSession, isAgentSessionSection, isAgentSessionShowLess, isAgentSessionShowMore } from "../../../browser/agentSessions/agentSessionsModel.js";
import { ChatSessionStatus } from "../../../common/chatSessionsService.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Event } from "../../../../../../base/common/event.js";
import { AgentSessionsGrouping, AgentSessionsSorting } from "../../../browser/agentSessions/agentSessionsFilter.js";
import { shouldShowSessionInPicker } from "../../../browser/agentSessions/agentSessionsPicker.js";
import { themeColorFromId } from "../../../../../../base/common/themables.js";
suite("sessionDateFromNow", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const ONE_DAY = 24 * 60 * 60 * 1e3;
  test('returns "1 day" for yesterday', () => {
    const now = Date.now();
    const startOfToday = new Date(now).setHours(0, 0, 0, 0);
    const yesterday = startOfToday - ONE_DAY / 2;
    assert.strictEqual(sessionDateFromNow(yesterday), "1 day");
  });
  test('returns "2 days" for two days ago', () => {
    const now = Date.now();
    const startOfToday = new Date(now).setHours(0, 0, 0, 0);
    const startOfYesterday = startOfToday - ONE_DAY;
    const twoDaysAgo = startOfYesterday - ONE_DAY / 2;
    assert.strictEqual(sessionDateFromNow(twoDaysAgo), "2 days");
  });
  test("returns fromNow result for today", () => {
    const now = Date.now();
    const startOfToday = new Date(now).setHours(0, 0, 0, 0);
    const fiveMinutesAfterMidnight = startOfToday + 5 * 60 * 1e3;
    const result = sessionDateFromNow(fiveMinutesAfterMidnight);
    assert.ok(result.includes("min") || result.includes("sec") || result.includes("hr") || result === "now", `Expected minutes/seconds/hours ago or now, got: ${result}`);
  });
  test("returns fromNow result for three or more days ago", () => {
    const now = Date.now();
    const startOfToday = new Date(now).setHours(0, 0, 0, 0);
    const fiveDaysAgo = startOfToday - 5 * ONE_DAY;
    const result = sessionDateFromNow(fiveDaysAgo);
    assert.ok(result.includes("day"), `Expected days ago, got: ${result}`);
    assert.ok(!result.includes("1 day") && !result.includes("2 days"), `Should not be 1 or 2 days ago, got: ${result}`);
  });
  test('appends "ago" when appendAgoLabel is true', () => {
    const now = Date.now();
    const startOfToday = new Date(now).setHours(0, 0, 0, 0);
    const yesterday = startOfToday - ONE_DAY / 2;
    assert.strictEqual(sessionDateFromNow(yesterday, true), "1 day ago");
    const startOfYesterday = startOfToday - ONE_DAY;
    const twoDaysAgo = startOfYesterday - ONE_DAY / 2;
    assert.strictEqual(sessionDateFromNow(twoDaysAgo, true), "2 days ago");
    const fiveDaysAgo = startOfToday - 5 * ONE_DAY;
    const result = sessionDateFromNow(fiveDaysAgo, true);
    assert.ok(result.includes("ago"), `Expected "ago" in result, got: ${result}`);
  });
});
suite("AgentSessionsDataSource", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  const ONE_DAY = 24 * 60 * 60 * 1e3;
  const WEEK_THRESHOLD = 7 * ONE_DAY;
  function createMockSession(overrides = {}) {
    const now = Date.now();
    return {
      providerType: "test",
      providerLabel: "Test",
      resource: URI.parse(`test://session/${overrides.id ?? "default"}`),
      status: overrides.status ?? ChatSessionStatus.Completed,
      label: `Session ${overrides.id ?? "default"}`,
      icon: Codicon.terminal,
      timing: {
        created: overrides.startTime ?? now,
        lastRequestEnded: void 0,
        lastRequestStarted: void 0
      },
      changes: overrides.hasChanges ? { files: 1, insertions: 10, deletions: 5 } : void 0,
      metadata: overrides.metadata,
      badge: overrides.badge,
      isArchived: () => overrides.isArchived ?? false,
      setArchived: () => {
      },
      isPinned: () => overrides.isPinned ?? false,
      setPinned: () => {
      },
      isRead: () => overrides.isRead ?? true,
      isMarkedUnread: () => false,
      setRead: () => {
      }
    };
  }
  suite("getAgentSessionStatusIcon", () => {
    test("matches sessions window state icons", () => {
      const cases = [
        ["read", createMockSession({ id: "read" })],
        ["unread", createMockSession({ id: "unread", isRead: false })],
        ["archived", createMockSession({ id: "archived", isArchived: true, isRead: false })],
        ["in-progress", createMockSession({ id: "in-progress", status: ChatSessionStatus.InProgress })],
        ["needs-input", createMockSession({ id: "needs-input", status: ChatSessionStatus.NeedsInput })],
        ["failed", createMockSession({ id: "failed", status: ChatSessionStatus.Failed })]
      ];
      assert.deepStrictEqual(cases.map(([name, session]) => [name, getAgentSessionStatusIcon(session)]), [
        ["read", { ...Codicon.circleSmallFilled, color: themeColorFromId("agentSessionReadIndicator.foreground") }],
        ["unread", { ...Codicon.circleFilled, color: themeColorFromId("textLink.foreground") }],
        ["archived", { ...Codicon.passFilled, color: themeColorFromId("agentSessionReadIndicator.foreground") }],
        ["in-progress", { ...Codicon.sessionInProgress, color: themeColorFromId("textLink.foreground") }],
        ["needs-input", { ...Codicon.circleFilled, color: themeColorFromId("list.warningForeground") }],
        ["failed", { ...Codicon.error, color: themeColorFromId("errorForeground") }]
      ]);
    });
  });
  function createMockModel(sessions) {
    return {
      sessions,
      resolved: true,
      getSession: () => void 0,
      observeSession: () => {
        throw new Error("Not implemented");
      },
      onWillResolve: Event.None,
      onDidResolve: Event.None,
      onDidChangeSessions: Event.None,
      onDidChangeSessionArchivedState: Event.None,
      resolve: async () => {
      }
    };
  }
  function createMockFilter(options) {
    return {
      onDidChange: Event.None,
      groupResults: () => options.groupBy,
      exclude: options.exclude ?? (() => false),
      getExcludes: () => ({ providers: [], states: [], archived: false, read: options.excludeRead ?? false, repositoryGroupCapped: options.repositoryGroupCapped ?? true }),
      isDefault: () => true,
      reset: () => {
      }
    };
  }
  function createMockSorter() {
    return {
      compare: (a, b) => {
        const aTime = a.timing.created;
        const bTime = b.timing.created;
        return bTime - aTime;
      }
    };
  }
  function getSectionsFromResult(result) {
    return Array.from(result).filter((item) => isAgentSessionSection(item));
  }
  suite("groupSessionsIntoSections", () => {
    test("returns flat list when groupResults is false", () => {
      const now = Date.now();
      const sessions = [
        createMockSession({ id: "1", startTime: now, endTime: now }),
        createMockSession({ id: "2", startTime: now - ONE_DAY, endTime: now - ONE_DAY })
      ];
      const filter = createMockFilter({ groupBy: void 0 });
      const sorter = createMockSorter();
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
      const mockModel = createMockModel(sessions);
      const result = Array.from(dataSource.getChildren(mockModel));
      assert.strictEqual(result.length, 2);
      assert.strictEqual(getSectionsFromResult(result).length, 0);
    });
    test("in-progress sessions are placed in their date-based section", () => {
      const now = Date.now();
      const sessions = [
        createMockSession({ id: "1", status: ChatSessionStatus.Completed, startTime: now, endTime: now }),
        createMockSession({ id: "2", status: ChatSessionStatus.InProgress, startTime: now - ONE_DAY }),
        createMockSession({ id: "3", status: ChatSessionStatus.NeedsInput, startTime: now })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
      const sorter = createMockSorter();
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
      const mockModel = createMockModel(sessions);
      const result = Array.from(dataSource.getChildren(mockModel));
      const sections = getSectionsFromResult(result);
      const todaySection = sections.find((s) => s.section === AgentSessionSection.Today);
      assert.ok(todaySection);
      assert.strictEqual(todaySection.sessions.length, 2);
    });
    test("in-progress sessions appear in Today section alongside completed", () => {
      const now = Date.now();
      const sessions = [
        createMockSession({ id: "1", status: ChatSessionStatus.Completed, startTime: now, endTime: now }),
        createMockSession({ id: "2", status: ChatSessionStatus.InProgress, startTime: now })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
      const sorter = createMockSorter();
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
      const mockModel = createMockModel(sessions);
      const result = Array.from(dataSource.getChildren(mockModel));
      const sections = getSectionsFromResult(result);
      assert.strictEqual(sections.length, 1);
      assert.strictEqual(sections[0].section, AgentSessionSection.Today);
      assert.strictEqual(sections[0].sessions.length, 2);
    });
    test("adds Today header when there are no active sessions", () => {
      const now = Date.now();
      const sessions = [
        createMockSession({ id: "1", status: ChatSessionStatus.Completed, startTime: now, endTime: now }),
        createMockSession({ id: "2", status: ChatSessionStatus.Completed, startTime: now - ONE_DAY, endTime: now - ONE_DAY })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
      const sorter = createMockSorter();
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
      const mockModel = createMockModel(sessions);
      const result = Array.from(dataSource.getChildren(mockModel));
      const sections = getSectionsFromResult(result);
      assert.strictEqual(sections.filter((s) => s.section === AgentSessionSection.Today).length, 1);
    });
    test("adds Older header for sessions older than week threshold", () => {
      const now = Date.now();
      const sessions = [
        createMockSession({ id: "1", status: ChatSessionStatus.Completed, startTime: now, endTime: now }),
        createMockSession({ id: "2", status: ChatSessionStatus.Completed, startTime: now - WEEK_THRESHOLD - ONE_DAY, endTime: now - WEEK_THRESHOLD - ONE_DAY })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
      const sorter = createMockSorter();
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
      const mockModel = createMockModel(sessions);
      const result = Array.from(dataSource.getChildren(mockModel));
      const sections = getSectionsFromResult(result);
      assert.strictEqual(sections.filter((s) => s.section === AgentSessionSection.Older).length, 1);
    });
    test("adds Archived header for archived sessions", () => {
      const now = Date.now();
      const sessions = [
        createMockSession({ id: "1", status: ChatSessionStatus.Completed, startTime: now, endTime: now }),
        createMockSession({ id: "2", status: ChatSessionStatus.Completed, isArchived: true, startTime: now - ONE_DAY, endTime: now - ONE_DAY })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
      const sorter = createMockSorter();
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
      const mockModel = createMockModel(sessions);
      const result = Array.from(dataSource.getChildren(mockModel));
      const sections = getSectionsFromResult(result);
      assert.strictEqual(sections.filter((s) => s.section === AgentSessionSection.Archived).length, 1);
    });
    test("archived sessions come after older sessions", () => {
      const now = Date.now();
      const sessions = [
        createMockSession({ id: "1", status: ChatSessionStatus.Completed, isArchived: true, startTime: now, endTime: now }),
        createMockSession({ id: "2", status: ChatSessionStatus.Completed, startTime: now - WEEK_THRESHOLD - ONE_DAY, endTime: now - WEEK_THRESHOLD - ONE_DAY })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
      const sorter = createMockSorter();
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
      const mockModel = createMockModel(sessions);
      const result = Array.from(dataSource.getChildren(mockModel));
      const olderIndex = result.findIndex((item) => isAgentSessionSection(item) && item.section === AgentSessionSection.Older);
      const archivedIndex = result.findIndex((item) => isAgentSessionSection(item) && item.section === AgentSessionSection.Archived);
      assert.ok(olderIndex < archivedIndex, "Older section should come before Archived section");
    });
    test("archived in-progress sessions appear in Archived section", () => {
      const now = Date.now();
      const sessions = [
        createMockSession({ id: "archived-active", status: ChatSessionStatus.InProgress, isArchived: true, startTime: now }),
        createMockSession({ id: "active", status: ChatSessionStatus.InProgress, startTime: now })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
      const sorter = createMockSorter();
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
      const mockModel = createMockModel(sessions);
      const result = Array.from(dataSource.getChildren(mockModel));
      const sections = getSectionsFromResult(result);
      const todaySection = sections.find((s) => s.section === AgentSessionSection.Today);
      const archivedSection = sections.find((s) => s.section === AgentSessionSection.Archived);
      assert.ok(todaySection, "Today section should exist");
      assert.ok(archivedSection, "Archived section should exist");
      assert.strictEqual(todaySection.sessions.length, 1);
      assert.strictEqual(todaySection.sessions[0].label, "Session active");
      assert.strictEqual(archivedSection.sessions.length, 1);
      assert.strictEqual(archivedSection.sessions[0].label, "Session archived-active");
    });
    test("correct order: today, week, older, archived", () => {
      const now = Date.now();
      const sessions = [
        createMockSession({ id: "archived", status: ChatSessionStatus.Completed, isArchived: true, startTime: now, endTime: now }),
        createMockSession({ id: "today", status: ChatSessionStatus.Completed, startTime: now, endTime: now }),
        createMockSession({ id: "week", status: ChatSessionStatus.Completed, startTime: now - 3 * ONE_DAY, endTime: now - 3 * ONE_DAY }),
        createMockSession({ id: "old", status: ChatSessionStatus.Completed, startTime: now - WEEK_THRESHOLD - ONE_DAY, endTime: now - WEEK_THRESHOLD - ONE_DAY }),
        createMockSession({ id: "active", status: ChatSessionStatus.InProgress, startTime: now })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
      const sorter = createMockSorter();
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
      const mockModel = createMockModel(sessions);
      const result = Array.from(dataSource.getChildren(mockModel));
      assert.ok(isAgentSessionSection(result[0]));
      assert.strictEqual(result[0].section, AgentSessionSection.Today);
      assert.strictEqual(result[0].sessions.length, 2);
      assert.ok(isAgentSessionSection(result[1]));
      assert.strictEqual(result[1].section, AgentSessionSection.Week);
      assert.strictEqual(result[1].sessions[0].label, "Session week");
      assert.ok(isAgentSessionSection(result[2]));
      assert.strictEqual(result[2].section, AgentSessionSection.Older);
      assert.strictEqual(result[2].sessions[0].label, "Session old");
      assert.ok(isAgentSessionSection(result[3]));
      assert.strictEqual(result[3].section, AgentSessionSection.Archived);
      assert.strictEqual(result[3].sessions[0].label, "Session archived");
    });
    test("empty sessions returns empty result", () => {
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
      const sorter = createMockSorter();
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
      const mockModel = createMockModel([]);
      const result = Array.from(dataSource.getChildren(mockModel));
      assert.strictEqual(result.length, 0);
    });
    test("only today sessions produces a Today section header", () => {
      const now = Date.now();
      const sessions = [
        createMockSession({ id: "1", status: ChatSessionStatus.Completed, startTime: now, endTime: now }),
        createMockSession({ id: "2", status: ChatSessionStatus.Completed, startTime: now - 1e3, endTime: now - 1e3 })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
      const sorter = createMockSorter();
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
      const mockModel = createMockModel(sessions);
      const result = Array.from(dataSource.getChildren(mockModel));
      const sections = getSectionsFromResult(result);
      assert.strictEqual(sections.length, 1);
      assert.strictEqual(sections[0].section, AgentSessionSection.Today);
      assert.strictEqual(sections[0].sessions.length, 2);
    });
    test("sessions are sorted within each group", () => {
      const now = Date.now();
      const sessions = [
        createMockSession({ id: "old1", status: ChatSessionStatus.Completed, startTime: now - WEEK_THRESHOLD - 2 * ONE_DAY, endTime: now - WEEK_THRESHOLD - 2 * ONE_DAY }),
        createMockSession({ id: "old2", status: ChatSessionStatus.Completed, startTime: now - WEEK_THRESHOLD - ONE_DAY, endTime: now - WEEK_THRESHOLD - ONE_DAY }),
        createMockSession({ id: "week1", status: ChatSessionStatus.Completed, startTime: now - 3 * ONE_DAY, endTime: now - 3 * ONE_DAY }),
        createMockSession({ id: "week2", status: ChatSessionStatus.Completed, startTime: now - 2 * ONE_DAY, endTime: now - 2 * ONE_DAY })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
      const sorter = createMockSorter();
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
      const mockModel = createMockModel(sessions);
      const result = Array.from(dataSource.getChildren(mockModel));
      const weekSection = result.find((item) => isAgentSessionSection(item) && item.section === AgentSessionSection.Week);
      assert.ok(weekSection);
      assert.strictEqual(weekSection.sessions[0].label, "Session week2");
      assert.strictEqual(weekSection.sessions[1].label, "Session week1");
      const olderSection = result.find((item) => isAgentSessionSection(item) && item.section === AgentSessionSection.Older);
      assert.ok(olderSection);
      assert.strictEqual(olderSection.sessions[0].label, "Session old2");
      assert.strictEqual(olderSection.sessions[1].label, "Session old1");
    });
    test("capped grouping with unread filter returns flat list without More section", () => {
      const now = Date.now();
      const sessions = [
        createMockSession({ id: "1", startTime: now, isRead: false }),
        createMockSession({ id: "2", startTime: now - ONE_DAY, isRead: false }),
        createMockSession({ id: "3", startTime: now - 2 * ONE_DAY, isRead: false }),
        createMockSession({ id: "4", startTime: now - 3 * ONE_DAY, isRead: false }),
        createMockSession({ id: "5", startTime: now - 4 * ONE_DAY, isRead: false })
      ];
      const filter = createMockFilter({
        groupBy: AgentSessionsGrouping.Capped,
        excludeRead: true
        // Filtering to show only unread sessions
      });
      const sorter = createMockSorter();
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
      const mockModel = createMockModel(sessions);
      const result = Array.from(dataSource.getChildren(mockModel));
      assert.strictEqual(result.length, 5);
      assert.strictEqual(getSectionsFromResult(result).length, 0);
    });
    test("capped grouping without unread filter includes More section", () => {
      const now = Date.now();
      const sessions = [
        createMockSession({ id: "1", startTime: now }),
        createMockSession({ id: "2", startTime: now - ONE_DAY }),
        createMockSession({ id: "3", startTime: now - 2 * ONE_DAY }),
        createMockSession({ id: "4", startTime: now - 3 * ONE_DAY }),
        createMockSession({ id: "5", startTime: now - 4 * ONE_DAY })
      ];
      const filter = createMockFilter({
        groupBy: AgentSessionsGrouping.Capped,
        excludeRead: false
        // Not filtering to unread only
      });
      const sorter = createMockSorter();
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
      const mockModel = createMockModel(sessions);
      const result = Array.from(dataSource.getChildren(mockModel));
      assert.strictEqual(result.length, 4);
      const sections = getSectionsFromResult(result);
      assert.strictEqual(sections.length, 1);
      assert.strictEqual(sections[0].section, AgentSessionSection.More);
      assert.strictEqual(sections[0].sessions.length, 2);
    });
    test("pinned sessions appear in Pinned section at the top with date grouping", () => {
      const now = Date.now();
      const sessions = [
        createMockSession({ id: "pinned1", isPinned: true, startTime: now - WEEK_THRESHOLD - ONE_DAY }),
        createMockSession({ id: "today", startTime: now }),
        createMockSession({ id: "pinned2", isPinned: true, startTime: now })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
      const sorter = createMockSorter();
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
      const mockModel = createMockModel(sessions);
      const result = Array.from(dataSource.getChildren(mockModel));
      const sections = getSectionsFromResult(result);
      assert.strictEqual(sections[0].section, AgentSessionSection.Pinned);
      assert.strictEqual(sections[0].sessions.length, 2);
      assert.strictEqual(sections[1].section, AgentSessionSection.Today);
      assert.strictEqual(sections[1].sessions.length, 1);
    });
    test("archived pinned sessions go to Archived, not Pinned", () => {
      const now = Date.now();
      const sessions = [
        createMockSession({ id: "archived-pinned", isPinned: true, isArchived: true, startTime: now }),
        createMockSession({ id: "pinned", isPinned: true, startTime: now }),
        createMockSession({ id: "today", startTime: now })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
      const sorter = createMockSorter();
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
      const mockModel = createMockModel(sessions);
      const result = Array.from(dataSource.getChildren(mockModel));
      const sections = getSectionsFromResult(result);
      const pinnedSection = sections.find((s) => s.section === AgentSessionSection.Pinned);
      const archivedSection = sections.find((s) => s.section === AgentSessionSection.Archived);
      assert.ok(pinnedSection);
      assert.strictEqual(pinnedSection.sessions.length, 1);
      assert.strictEqual(pinnedSection.sessions[0].label, "Session pinned");
      assert.ok(archivedSection);
      assert.strictEqual(archivedSection.sessions.length, 1);
      assert.strictEqual(archivedSection.sessions[0].label, "Session archived-pinned");
    });
    test("pinned sessions are always shown above the cap with capped grouping", () => {
      const now = Date.now();
      const sessions = [
        // Recent unpinned sessions fill the top 3 by time
        createMockSession({ id: "s1", startTime: now }),
        createMockSession({ id: "s2", startTime: now - ONE_DAY }),
        createMockSession({ id: "s3", startTime: now - 2 * ONE_DAY }),
        // Unpinned overflow
        createMockSession({ id: "s4", startTime: now - 3 * ONE_DAY }),
        // Two pinned sessions with old timestamps — would fall outside top 3 by time alone
        createMockSession({ id: "pinned1", isPinned: true, startTime: now - 4 * ONE_DAY }),
        createMockSession({ id: "pinned2", isPinned: true, startTime: now - 5 * ONE_DAY })
      ];
      const filter = createMockFilter({
        groupBy: AgentSessionsGrouping.Capped,
        excludeRead: false
      });
      const sorter = createMockSorter();
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
      const mockModel = createMockModel(sessions);
      const result = Array.from(dataSource.getChildren(mockModel));
      const sections = getSectionsFromResult(result);
      const topSessions = result.filter((r) => !isAgentSessionSection(r));
      assert.deepStrictEqual(topSessions.map((s) => s.label), [
        "Session pinned1",
        "Session pinned2",
        "Session s1",
        "Session s2",
        "Session s3"
      ]);
      const moreSection = sections.find((s) => s.section === AgentSessionSection.More);
      assert.ok(moreSection);
      assert.deepStrictEqual(moreSection.sessions.map((s) => s.label), [
        "Session s4"
      ]);
    });
    test("more pinned sessions than cap limit are all shown", () => {
      const now = Date.now();
      const sessions = [
        createMockSession({ id: "pinned1", isPinned: true, startTime: now }),
        createMockSession({ id: "pinned2", isPinned: true, startTime: now - ONE_DAY }),
        createMockSession({ id: "pinned3", isPinned: true, startTime: now - 2 * ONE_DAY }),
        createMockSession({ id: "pinned4", isPinned: true, startTime: now - 3 * ONE_DAY }),
        // Unpinned session — still fits within the cap of 3 non-pinned
        createMockSession({ id: "unpinned1", startTime: now - 4 * ONE_DAY })
      ];
      const filter = createMockFilter({
        groupBy: AgentSessionsGrouping.Capped,
        excludeRead: false
      });
      const sorter = createMockSorter();
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
      const mockModel = createMockModel(sessions);
      const result = Array.from(dataSource.getChildren(mockModel));
      const sections = getSectionsFromResult(result);
      const topSessions = result.filter((r) => !isAgentSessionSection(r));
      assert.deepStrictEqual(topSessions.map((s) => s.label), [
        "Session pinned1",
        "Session pinned2",
        "Session pinned3",
        "Session pinned4",
        "Session unpinned1"
      ]);
      const moreSection = sections.find((s) => s.section === AgentSessionSection.More);
      assert.strictEqual(moreSection, void 0);
    });
    test("unpinned NeedsInput session appears in the non-pinned section below pinned", () => {
      const now = Date.now();
      const sessions = [
        createMockSession({ id: "needs-input", status: ChatSessionStatus.NeedsInput, startTime: now }),
        createMockSession({ id: "pinned1", isPinned: true, startTime: now }),
        createMockSession({ id: "pinned2", isPinned: true, startTime: now - ONE_DAY }),
        createMockSession({ id: "pinned3", isPinned: true, startTime: now - 2 * ONE_DAY }),
        createMockSession({ id: "s1", startTime: now })
      ];
      const filter = createMockFilter({
        groupBy: AgentSessionsGrouping.Capped,
        excludeRead: false
      });
      const sorter = new AgentSessionsSorter();
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, sorter));
      const mockModel = createMockModel(sessions);
      const result = Array.from(dataSource.getChildren(mockModel));
      const sections = getSectionsFromResult(result);
      const topSessions = result.filter((r) => !isAgentSessionSection(r));
      assert.deepStrictEqual(topSessions.map((s) => s.label), [
        "Session pinned1",
        "Session pinned2",
        "Session pinned3",
        "Session needs-input",
        "Session s1"
      ]);
      const moreSection = sections.find((s) => s.section === AgentSessionSection.More);
      assert.strictEqual(moreSection, void 0);
    });
  });
  suite("groupSessionsByRepository", () => {
    function sortedGroups(result) {
      return result.map((s) => ({ label: s.label, count: s.sessions.length })).sort((a, b) => a.label.localeCompare(b.label));
    }
    test("groups sessions by metadata.owner + metadata.name (cloud sessions)", () => {
      const now = Date.now();
      const sessions = [
        createMockSession({ id: "1", startTime: now, metadata: { owner: "microsoft", name: "vscode" } }),
        createMockSession({ id: "2", startTime: now - 1, metadata: { owner: "microsoft", name: "vscode" } }),
        createMockSession({ id: "3", startTime: now - 2, metadata: { owner: "microsoft", name: "typescript" } })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));
      assert.deepStrictEqual(sortedGroups(result), [
        { label: "typescript", count: 1 },
        { label: "vscode", count: 2 }
      ]);
    });
    test("groups sessions by metadata.repositoryNwo", () => {
      const sessions = [
        createMockSession({ id: "1", metadata: { repositoryNwo: "microsoft/vscode" } }),
        createMockSession({ id: "2", metadata: { repositoryNwo: "microsoft/vscode" } })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));
      assert.deepStrictEqual(sortedGroups(result), [
        { label: "vscode", count: 2 }
      ]);
    });
    test("groups sessions by metadata.repository (nwo format)", () => {
      const sessions = [
        createMockSession({ id: "1", metadata: { repository: "microsoft/vscode" } }),
        createMockSession({ id: "2", metadata: { repository: "microsoft/vscode" } })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));
      assert.deepStrictEqual(sortedGroups(result), [
        { label: "vscode", count: 2 }
      ]);
    });
    test("groups sessions by metadata.repository (URL format)", () => {
      const sessions = [
        createMockSession({ id: "1", metadata: { repository: "https://github.com/microsoft/vscode" } })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));
      assert.deepStrictEqual(sortedGroups(result), [
        { label: "vscode", count: 1 }
      ]);
    });
    test("strips .git suffix from repository URLs", () => {
      const sessions = [
        createMockSession({ id: "1", metadata: { repository: "https://github.com/microsoft/vscode.git" } }),
        createMockSession({ id: "2", metadata: { repositoryUrl: "https://github.com/microsoft/vscode.git" } })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));
      assert.deepStrictEqual(sortedGroups(result), [
        { label: "vscode", count: 2 }
      ]);
    });
    test("handles git@ SSH URLs", () => {
      const sessions = [
        createMockSession({ id: "1", metadata: { repository: "git@github.com:microsoft/vscode.git" } })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));
      assert.deepStrictEqual(sortedGroups(result), [
        { label: "vscode", count: 1 }
      ]);
    });
    test("groups sessions by metadata.repositoryUrl", () => {
      const sessions = [
        createMockSession({ id: "1", metadata: { repositoryUrl: "https://github.com/microsoft/vscode" } })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));
      assert.deepStrictEqual(sortedGroups(result), [
        { label: "vscode", count: 1 }
      ]);
    });
    test("groups sessions by metadata.repositoryPath (basename)", () => {
      const sessions = [
        createMockSession({ id: "1", metadata: { repositoryPath: "/Users/user/Projects/vscode" } })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));
      assert.deepStrictEqual(sortedGroups(result), [
        { label: "vscode", count: 1 }
      ]);
    });
    test("groups sessions by metadata.worktreePath", () => {
      const sessions = [
        createMockSession({ id: "1", metadata: { worktreePath: "/Users/user/Projects/vscode.worktrees/my-branch" } })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));
      assert.deepStrictEqual(sortedGroups(result), [
        { label: "vscode", count: 1 }
      ]);
    });
    test("groups sessions by metadata.workingDirectoryPath", () => {
      const sessions = [
        createMockSession({ id: "1", metadata: { workingDirectoryPath: "/Users/user/Projects/vscode" } })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));
      assert.deepStrictEqual(sortedGroups(result), [
        { label: "vscode", count: 1 }
      ]);
    });
    test("resolves worktree paths to parent repo name", () => {
      const sessions = [
        createMockSession({ id: "1", metadata: { workingDirectoryPath: "/Users/user/Projects/vscode.worktrees/copilot-branch" } })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));
      assert.deepStrictEqual(sortedGroups(result), [
        { label: "vscode", count: 1 }
      ]);
    });
    test("groups sessions by badge with $(repo) prefix", () => {
      const sessions = [
        createMockSession({ id: "1", badge: "$(repo) vscode" }),
        createMockSession({ id: "2", badge: "$(repo) vscode" })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));
      assert.deepStrictEqual(sortedGroups(result), [
        { label: "vscode", count: 2 }
      ]);
    });
    test("groups sessions by badge with $(folder) prefix", () => {
      const sessions = [
        createMockSession({ id: "1", badge: "$(folder) my-project" })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));
      assert.deepStrictEqual(sortedGroups(result), [
        { label: "my-project", count: 1 }
      ]);
    });
    test("cloud and local sessions for same repo merge into one group", () => {
      const sessions = [
        createMockSession({ id: "1", metadata: { owner: "microsoft", name: "vscode" } }),
        createMockSession({ id: "2", metadata: { repositoryPath: "/Users/user/Projects/vscode" } }),
        createMockSession({ id: "3", badge: "$(repo) vscode" })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));
      assert.deepStrictEqual(sortedGroups(result), [
        { label: "vscode", count: 3 }
      ]);
    });
    test("sessions without any repo info go to Other", () => {
      const sessions = [
        createMockSession({ id: "1", metadata: { isolationMode: "workspace" } }),
        createMockSession({ id: "2" })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));
      assert.deepStrictEqual(sortedGroups(result), [
        { label: "Other", count: 2 }
      ]);
    });
    test('repo named "other" does not collide with the Other fallback group', () => {
      const now = Date.now();
      const sessions = [
        createMockSession({ id: "1", startTime: now, metadata: { repositoryPath: "/path/other" } }),
        createMockSession({ id: "2", startTime: now - 1 })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));
      assert.strictEqual(result.length, 2, "should have 2 separate groups");
      const labels = result.map((s) => s.label);
      assert.ok(labels.includes("other"), 'should have a group for repo named "other"');
      assert.ok(labels.includes("Other"), 'should have the fallback "Other" group');
      assert.strictEqual(result.find((s) => s.label === "other").sessions.length, 1);
      assert.strictEqual(result.find((s) => s.label === "Other").sessions.length, 1);
    });
    test("archived sessions go to Archived section", () => {
      const sessions = [
        createMockSession({ id: "1", metadata: { repositoryPath: "/path/vscode" } }),
        createMockSession({ id: "2", isArchived: true, metadata: { repositoryPath: "/path/vscode" } })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));
      assert.deepStrictEqual(result.map((s) => ({ label: s.label, section: s.section, count: s.sessions.length })), [
        { label: "vscode", section: AgentSessionSection.Repository, count: 1 },
        { label: "Archived", section: AgentSessionSection.Archived, count: 1 }
      ]);
    });
    test("metadata extraction priority: owner+name > repositoryNwo > repository > repositoryUrl > repositoryPath > workingDirectoryPath > badge", () => {
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const ds1 = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      assert.strictEqual(getSectionsFromResult(ds1.getChildren(createMockModel([
        createMockSession({ id: "1", metadata: { owner: "org", name: "fromOwner", repositoryNwo: "org/fromNwo" } })
      ])))[0].label, "fromOwner");
      const ds2 = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      assert.strictEqual(getSectionsFromResult(ds2.getChildren(createMockModel([
        createMockSession({ id: "2", metadata: { repositoryNwo: "org/fromNwo", repository: "org/fromRepo" } })
      ])))[0].label, "fromNwo");
      const ds3 = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      assert.strictEqual(getSectionsFromResult(ds3.getChildren(createMockModel([
        createMockSession({ id: "3", metadata: { isolationMode: "workspace" }, badge: "$(repo) fromBadge" })
      ])))[0].label, "fromBadge");
    });
    test("empty string metadata values are treated as missing", () => {
      const sessions = [
        createMockSession({ id: "1", metadata: { repositoryNwo: "", repositoryPath: "/path/vscode" } })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));
      assert.deepStrictEqual(result.map((s) => s.label), ["vscode"]);
    });
    test("Other group appears after named repos and before Archived", () => {
      const now = Date.now();
      const sessions = [
        createMockSession({ id: "no-repo", startTime: now }),
        createMockSession({ id: "repo-a", startTime: now - 1, metadata: { repositoryPath: "/path/alpha" } }),
        createMockSession({ id: "archived", startTime: now - 2, isArchived: true }),
        createMockSession({ id: "repo-b", startTime: now - 3, metadata: { repositoryPath: "/path/beta" } }),
        createMockSession({ id: "no-repo-2", startTime: now - 4 })
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      const result = getSectionsFromResult(dataSource.getChildren(createMockModel(sessions)));
      const labels = result.map((s) => s.label);
      const otherIndex = labels.indexOf("Other");
      const archivedIndex = labels.indexOf("Archived");
      assert.ok(otherIndex !== -1, "Other section should be present");
      assert.strictEqual(result[otherIndex].sessions.length, 2);
      for (let i = 0; i < otherIndex; i++) {
        assert.strictEqual(result[i].section, AgentSessionSection.Repository, `section at index ${i} should be a named repository group`);
      }
      assert.ok(archivedIndex > otherIndex, "Archived section should come after Other");
    });
    test("pinned sessions are top-level items before alphabetized repository sections", () => {
      const now = Date.now();
      const pinnedSession = createMockSession({ id: "pinned", isPinned: true, startTime: now + 10, metadata: { repositoryPath: "/path/zebra" } });
      const sessions = [
        createMockSession({ id: "other", startTime: now + 9 }),
        createMockSession({ id: "zebra", startTime: now + 8, metadata: { repositoryPath: "/path/zebra" } }),
        createMockSession({ id: "alpha", startTime: now + 7, metadata: { repositoryPath: "/path/Alpha" } }),
        createMockSession({ id: "archived", isArchived: true, startTime: now + 6, metadata: { repositoryPath: "/path/middle" } }),
        pinnedSession
      ];
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      const result = Array.from(dataSource.getChildren(createMockModel(sessions)));
      assert.ok(isAgentSession(result[0]), "first item should be the pinned session");
      assert.strictEqual(result[0].resource.toString(), pinnedSession.resource.toString());
      const sections = result.filter((item) => isAgentSessionSection(item));
      assert.deepStrictEqual(sections.map((section) => ({ label: section.label, section: section.section, count: section.sessions.length })), [
        { label: "Alpha", section: AgentSessionSection.Repository, count: 1 },
        { label: "zebra", section: AgentSessionSection.Repository, count: 1 },
        { label: "Other", section: AgentSessionSection.Repository, count: 1 },
        { label: "Archived", section: AgentSessionSection.Archived, count: 1 }
      ]);
    });
  });
  suite("repositoryGroupLimit", () => {
    test("caps repo group children at limit and appends show-more item", () => {
      const now = Date.now();
      const sessions = Array.from(
        { length: 8 },
        (_, i) => createMockSession({ id: `s${i}`, metadata: { repositoryNwo: "owner/vscode" }, startTime: now - i * 1e3 })
      );
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter(), 5));
      const model = createMockModel(sessions);
      const topLevel = Array.from(dataSource.getChildren(model));
      const section = topLevel.find((item) => isAgentSessionSection(item) && item.section === AgentSessionSection.Repository);
      assert.ok(section);
      const children = Array.from(dataSource.getChildren(section));
      assert.strictEqual(children.length, 6);
      const showMore = children[5];
      assert.ok(isAgentSessionShowMore(showMore));
      assert.strictEqual(showMore.remainingCount, 3);
      assert.strictEqual(showMore.sectionLabel, "vscode");
    });
    test("does not cap when group has fewer items than limit", () => {
      const now = Date.now();
      const sessions = Array.from(
        { length: 3 },
        (_, i) => createMockSession({ id: `s${i}`, metadata: { repositoryNwo: "owner/vscode" }, startTime: now - i * 1e3 })
      );
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter(), 5));
      const model = createMockModel(sessions);
      const topLevel = Array.from(dataSource.getChildren(model));
      const section = topLevel.find((item) => isAgentSessionSection(item) && item.section === AgentSessionSection.Repository);
      const children = Array.from(dataSource.getChildren(section));
      assert.strictEqual(children.length, 3);
      assert.ok(!children.some(isAgentSessionShowMore));
    });
    test("expanding a group removes the cap and appends show-less item", () => {
      const now = Date.now();
      const sessions = Array.from(
        { length: 8 },
        (_, i) => createMockSession({ id: `s${i}`, metadata: { repositoryNwo: "owner/vscode" }, startTime: now - i * 1e3 })
      );
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter(), 5));
      const model = createMockModel(sessions);
      const topLevel = Array.from(dataSource.getChildren(model));
      const section = topLevel.find((item) => isAgentSessionSection(item) && item.section === AgentSessionSection.Repository);
      dataSource.expandRepositoryGroup("vscode");
      const children = Array.from(dataSource.getChildren(section));
      assert.strictEqual(children.length, 9);
      assert.ok(!children.some(isAgentSessionShowMore));
      const showLess = children[8];
      assert.ok(isAgentSessionShowLess(showLess));
      assert.strictEqual(showLess.sectionLabel, "vscode");
    });
    test("does not cap non-repository sections", () => {
      const now = Date.now();
      const sessions = Array.from(
        { length: 8 },
        (_, i) => createMockSession({ id: `s${i}`, startTime: now - i * 1e3 })
      );
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Date });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter(), 5));
      const model = createMockModel(sessions);
      const topLevel = Array.from(dataSource.getChildren(model));
      const todaySection = topLevel.find((item) => isAgentSessionSection(item) && item.section === AgentSessionSection.Today);
      const children = Array.from(dataSource.getChildren(todaySection));
      assert.strictEqual(children.length, 8);
      assert.ok(!children.some(isAgentSessionShowMore));
    });
    test("does not cap when repositoryGroupLimit is not set", () => {
      const now = Date.now();
      const sessions = Array.from(
        { length: 8 },
        (_, i) => createMockSession({ id: `s${i}`, metadata: { repositoryNwo: "owner/vscode" }, startTime: now - i * 1e3 })
      );
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter()));
      const model = createMockModel(sessions);
      const topLevel = Array.from(dataSource.getChildren(model));
      const section = topLevel.find((item) => isAgentSessionSection(item) && item.section === AgentSessionSection.Repository);
      const children = Array.from(dataSource.getChildren(section));
      assert.strictEqual(children.length, 8);
      assert.ok(!children.some(isAgentSessionShowMore));
    });
    test("does not cap when repositoryGroupCapped filter is disabled", () => {
      const now = Date.now();
      const sessions = Array.from(
        { length: 8 },
        (_, i) => createMockSession({ id: `s${i}`, metadata: { repositoryNwo: "owner/vscode" }, startTime: now - i * 1e3 })
      );
      const filter = createMockFilter({ groupBy: AgentSessionsGrouping.Repository, repositoryGroupCapped: false });
      const dataSource = disposables.add(new AgentSessionsDataSource(filter, createMockSorter(), 5));
      const model = createMockModel(sessions);
      const topLevel = Array.from(dataSource.getChildren(model));
      const section = topLevel.find((item) => isAgentSessionSection(item) && item.section === AgentSessionSection.Repository);
      const children = Array.from(dataSource.getChildren(section));
      assert.strictEqual(children.length, 8);
      assert.ok(!children.some(isAgentSessionShowMore));
    });
  });
  suite("getRepositoryName", () => {
    test("returns metadata.name when owner and name are present", () => {
      const session = createMockSession({ id: "1", metadata: { owner: "microsoft", name: "vscode" } });
      assert.strictEqual(getRepositoryName(session), "vscode");
    });
    test("returns repo from repositoryNwo", () => {
      const session = createMockSession({ id: "1", metadata: { repositoryNwo: "microsoft/vscode" } });
      assert.strictEqual(getRepositoryName(session), "vscode");
    });
    test("returns repo from repository URL", () => {
      const session = createMockSession({ id: "1", metadata: { repository: "https://github.com/microsoft/vscode" } });
      assert.strictEqual(getRepositoryName(session), "vscode");
    });
    test("returns repo from repositoryPath basename", () => {
      const session = createMockSession({ id: "1", metadata: { repositoryPath: "/Users/user/Projects/vscode" } });
      assert.strictEqual(getRepositoryName(session), "vscode");
    });
    test("returns parent repo name from worktree path", () => {
      const session = createMockSession({ id: "1", metadata: { worktreePath: "/Users/user/Projects/vscode.worktrees/my-branch" } });
      assert.strictEqual(getRepositoryName(session), "vscode");
    });
    test("returns name from badge with $(repo) prefix", () => {
      const session = createMockSession({ id: "1", badge: "$(repo) vscode" });
      assert.strictEqual(getRepositoryName(session), "vscode");
    });
    test("returns name from badge with $(folder) prefix", () => {
      const session = createMockSession({ id: "1", badge: "$(folder) my-project" });
      assert.strictEqual(getRepositoryName(session), "my-project");
    });
    test("metadata repo name takes priority over badge name", () => {
      const session = createMockSession({ id: "1", metadata: { owner: "microsoft", name: "vscode" }, badge: "$(folder) copilot-worktree-branch" });
      assert.strictEqual(getRepositoryName(session), "vscode");
    });
    test("returns undefined when no repo info is available", () => {
      const session = createMockSession({ id: "1" });
      assert.strictEqual(getRepositoryName(session), void 0);
    });
    test("badge name can differ from metadata repo name (worktree scenario)", () => {
      const session = createMockSession({
        id: "1",
        metadata: { repositoryPath: "/Users/user/Projects/vscode" },
        badge: "$(folder) copilot-worktree-2026-03-13T00-27-32"
      });
      assert.strictEqual(getRepositoryName(session), "vscode");
    });
    test("archived session still returns repo name from metadata", () => {
      const session = createMockSession({
        id: "1",
        isArchived: true,
        metadata: { repositoryPath: "/Users/user/Projects/vscode" },
        badge: "$(repo) vscode"
      });
      assert.strictEqual(getRepositoryName(session), "vscode");
    });
  });
});
suite("AgentSessionsSorter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function createSession(overrides) {
    const now = Date.now();
    return {
      providerType: "test",
      providerLabel: "Test",
      resource: URI.parse(`test://session/${overrides.id ?? "default"}`),
      status: overrides.status ?? ChatSessionStatus.Completed,
      label: `Session ${overrides.id ?? "default"}`,
      icon: Codicon.terminal,
      timing: {
        created: overrides.created ?? now,
        lastRequestEnded: overrides.lastRequestEnded,
        lastRequestStarted: overrides.lastRequestStarted
      },
      changes: void 0,
      metadata: void 0,
      isArchived: () => overrides.isArchived ?? false,
      setArchived: () => {
      },
      isPinned: () => overrides.isPinned ?? false,
      setPinned: () => {
      },
      isRead: () => true,
      isMarkedUnread: () => false,
      setRead: () => {
      }
    };
  }
  test("default: sorts by creation time (most recent first)", () => {
    const sorter = new AgentSessionsSorter();
    const old = createSession({ id: "old", created: 1e3 });
    const recent = createSession({ id: "recent", created: 2e3 });
    const sorted = [old, recent].sort((a, b) => sorter.compare(a, b));
    assert.deepStrictEqual(sorted.map((s) => s.label), ["Session recent", "Session old"]);
  });
  test("default: archived sessions come last", () => {
    const sorter = new AgentSessionsSorter();
    const archived = createSession({ id: "archived", isArchived: true, created: 3e3 });
    const active = createSession({ id: "active", created: 1e3 });
    const sorted = [archived, active].sort((a, b) => sorter.compare(a, b));
    assert.deepStrictEqual(sorted.map((s) => s.label), ["Session active", "Session archived"]);
  });
  test("default: does NOT prioritize needs-input sessions", () => {
    const sorter = new AgentSessionsSorter();
    const needsInput = createSession({ id: "needs", status: ChatSessionStatus.NeedsInput, created: 1e3 });
    const completed = createSession({ id: "done", status: ChatSessionStatus.Completed, created: 2e3 });
    const sorted = [needsInput, completed].sort((a, b) => sorter.compare(a, b));
    assert.deepStrictEqual(sorted.map((s) => s.label), ["Session done", "Session needs"]);
  });
  test("prioritizeActive: needs-input sessions come first", () => {
    const sorter = new AgentSessionsSorter();
    const needsInput = createSession({ id: "needs", status: ChatSessionStatus.NeedsInput, created: 1e3 });
    const completed = createSession({ id: "done", status: ChatSessionStatus.Completed, created: 2e3 });
    const sorted = [completed, needsInput].sort((a, b) => sorter.compare(a, b, true));
    assert.deepStrictEqual(sorted.map((s) => s.label), ["Session needs", "Session done"]);
  });
  test("prioritizeActive: archived still come last when not active", () => {
    const sorter = new AgentSessionsSorter();
    const archived = createSession({ id: "archived", isArchived: true, created: 3e3 });
    const active = createSession({ id: "active", created: 1e3 });
    const sorted = [archived, active].sort((a, b) => sorter.compare(a, b, true));
    assert.deepStrictEqual(sorted.map((s) => s.label), ["Session active", "Session archived"]);
  });
  test("prioritizeActive: uses lastRequestStarted for time sorting when sorted by updated", () => {
    const sorter = new AgentSessionsSorter(() => AgentSessionsSorting.Updated);
    const recentlyActive = createSession({ id: "recent-active", created: 1e3, lastRequestStarted: 5e3 });
    const recentlyCreated = createSession({ id: "recent-created", created: 3e3 });
    const sorted = [recentlyCreated, recentlyActive].sort((a, b) => sorter.compare(a, b, true));
    assert.deepStrictEqual(sorted.map((s) => s.label), ["Session recent-active", "Session recent-created"]);
  });
  test("prioritizeActive: uses created time when sorted by created", () => {
    const sorter = new AgentSessionsSorter(() => AgentSessionsSorting.Created);
    const recentlyActive = createSession({ id: "recent-active", created: 1e3, lastRequestStarted: 5e3 });
    const recentlyCreated = createSession({ id: "recent-created", created: 3e3 });
    const sorted = [recentlyCreated, recentlyActive].sort((a, b) => sorter.compare(a, b, true));
    assert.deepStrictEqual(sorted.map((s) => s.label), ["Session recent-created", "Session recent-active"]);
  });
  test("pinned sessions come before non-pinned sessions", () => {
    const sorter = new AgentSessionsSorter();
    const pinned = createSession({ id: "pinned", isPinned: true, created: 1e3 });
    const regular = createSession({ id: "regular", created: 2e3 });
    const sorted = [regular, pinned].sort((a, b) => sorter.compare(a, b));
    assert.deepStrictEqual(sorted.map((s) => s.label), ["Session pinned", "Session regular"]);
  });
  test("archived pinned sessions do not sort before non-archived", () => {
    const sorter = new AgentSessionsSorter();
    const archivedPinned = createSession({ id: "archived-pinned", isPinned: true, isArchived: true, created: 3e3 });
    const regular = createSession({ id: "regular", created: 1e3 });
    const sorted = [archivedPinned, regular].sort((a, b) => sorter.compare(a, b));
    assert.deepStrictEqual(sorted.map((s) => s.label), ["Session regular", "Session archived-pinned"]);
  });
  test("sortBy Created: sorts by creation time regardless of lastRequestEnded", () => {
    const sorter = new AgentSessionsSorter(() => AgentSessionsSorting.Created);
    const olderCreated = createSession({ id: "older", created: 1e3, lastRequestEnded: 5e3 });
    const newerCreated = createSession({ id: "newer", created: 3e3, lastRequestEnded: 2e3 });
    const sorted = [olderCreated, newerCreated].sort((a, b) => sorter.compare(a, b));
    assert.deepStrictEqual(sorted.map((s) => s.label), ["Session newer", "Session older"]);
  });
  test("sortBy Updated: sorts by lastRequestEnded", () => {
    const sorter = new AgentSessionsSorter(() => AgentSessionsSorting.Updated);
    const recentlyUpdated = createSession({ id: "updated", created: 1e3, lastRequestEnded: 5e3 });
    const recentlyCreated = createSession({ id: "created", created: 3e3, lastRequestEnded: 2e3 });
    const sorted = [recentlyCreated, recentlyUpdated].sort((a, b) => sorter.compare(a, b));
    assert.deepStrictEqual(sorted.map((s) => s.label), ["Session updated", "Session created"]);
  });
  test("sortBy Updated: falls back to created when lastRequestEnded is undefined", () => {
    const sorter = new AgentSessionsSorter(() => AgentSessionsSorting.Updated);
    const withRequest = createSession({ id: "with-request", created: 1e3, lastRequestEnded: 3e3 });
    const withoutRequest = createSession({ id: "no-request", created: 4e3 });
    const sorted = [withRequest, withoutRequest].sort((a, b) => sorter.compare(a, b));
    assert.deepStrictEqual(sorted.map((s) => s.label), ["Session no-request", "Session with-request"]);
  });
});
suite("AgentSessionsPicker", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function createSession(overrides) {
    return {
      providerType: "test",
      providerLabel: "Test",
      resource: URI.parse(`test://session/${overrides.id ?? "default"}`),
      status: overrides.status ?? ChatSessionStatus.Completed,
      label: `Session ${overrides.id ?? "default"}`,
      icon: Codicon.terminal,
      timing: {
        created: Date.now(),
        lastRequestStarted: void 0,
        lastRequestEnded: void 0
      },
      changes: void 0,
      metadata: void 0,
      isArchived: () => overrides.isArchived ?? false,
      setArchived: () => {
      },
      isPinned: () => false,
      setPinned: () => {
      },
      isRead: () => true,
      isMarkedUnread: () => false,
      setRead: () => {
      }
    };
  }
  const filter = {
    onDidChange: Event.None,
    exclude: () => false,
    getExcludes: () => ({ providers: [], states: [], archived: true, read: false, repositoryGroupCapped: true }),
    isDefault: () => true,
    limitResults: () => void 0,
    notifyResults: () => {
    },
    reset: () => {
    },
    sortResults: () => void 0
  };
  test("keeps completed sessions but excludes archived sessions", () => {
    const completed = createSession({ id: "completed", status: ChatSessionStatus.Completed });
    const inProgress = createSession({ id: "in-progress", status: ChatSessionStatus.InProgress });
    const archived = createSession({ id: "archived", status: ChatSessionStatus.Completed, isArchived: true });
    assert.deepStrictEqual(
      [completed, inProgress, archived].filter((session) => shouldShowSessionInPicker(session, filter)).map((session) => session.label),
      ["Session completed", "Session in-progress"]
    );
  });
});
suite("groupAgentSessionsByDate with sortBy", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function createSession(overrides) {
    return {
      providerType: "test",
      providerLabel: "Test",
      resource: URI.parse(`test://session/${overrides.id ?? "default"}`),
      status: ChatSessionStatus.Completed,
      label: `Session ${overrides.id ?? "default"}`,
      icon: Codicon.terminal,
      timing: {
        created: overrides.created ?? Date.now(),
        lastRequestEnded: overrides.lastRequestEnded,
        lastRequestStarted: void 0
      },
      changes: void 0,
      metadata: void 0,
      isArchived: () => overrides.isArchived ?? false,
      setArchived: () => {
      },
      isPinned: () => overrides.isPinned ?? false,
      setPinned: () => {
      },
      isRead: () => true,
      isMarkedUnread: () => false,
      setRead: () => {
      }
    };
  }
  test("default (Created): buckets by created time", () => {
    const now = Date.now();
    const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1e3;
    const oldSession = createSession({ id: "old", created: tenDaysAgo, lastRequestEnded: now });
    const grouped = groupAgentSessionsByDate([oldSession]);
    const todaySessions = grouped.get(AgentSessionSection.Today).sessions;
    const olderSessions = grouped.get(AgentSessionSection.Older).sessions;
    assert.deepStrictEqual(todaySessions.length, 0);
    assert.deepStrictEqual(olderSessions.length, 1);
  });
  test("Updated: session created long ago but recently updated goes into Today", () => {
    const now = Date.now();
    const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1e3;
    const oldButUpdated = createSession({ id: "old-updated", created: tenDaysAgo, lastRequestEnded: now });
    const grouped = groupAgentSessionsByDate([oldButUpdated], AgentSessionsSorting.Updated);
    const todaySessions = grouped.get(AgentSessionSection.Today).sessions;
    const olderSessions = grouped.get(AgentSessionSection.Older).sessions;
    assert.deepStrictEqual(todaySessions.length, 1);
    assert.deepStrictEqual(olderSessions.length, 0);
  });
  test("Updated: falls back to created when lastRequestEnded is undefined", () => {
    const now = Date.now();
    const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1e3;
    const oldNoUpdate = createSession({ id: "old-no-update", created: tenDaysAgo });
    const grouped = groupAgentSessionsByDate([oldNoUpdate], AgentSessionsSorting.Updated);
    const todaySessions = grouped.get(AgentSessionSection.Today).sessions;
    const olderSessions = grouped.get(AgentSessionSection.Older).sessions;
    assert.deepStrictEqual(todaySessions.length, 0);
    assert.deepStrictEqual(olderSessions.length, 1);
  });
  test("Updated: pinned and archived sessions are not affected by sortBy", () => {
    const now = Date.now();
    const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1e3;
    const pinnedOld = createSession({ id: "pinned", created: tenDaysAgo, lastRequestEnded: now, isPinned: true });
    const archivedOld = createSession({ id: "archived", created: tenDaysAgo, lastRequestEnded: now, isArchived: true });
    const grouped = groupAgentSessionsByDate([pinnedOld, archivedOld], AgentSessionsSorting.Updated);
    const pinnedSessions = grouped.get(AgentSessionSection.Pinned).sessions;
    const archivedSessions = grouped.get(AgentSessionSection.Archived).sessions;
    const todaySessions = grouped.get(AgentSessionSection.Today).sessions;
    assert.deepStrictEqual(pinnedSessions.length, 1);
    assert.deepStrictEqual(archivedSessions.length, 1);
    assert.deepStrictEqual(todaySessions.length, 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uc0RhdGFTb3VyY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvbnNEYXRhU291cmNlLCBBZ2VudFNlc3Npb25MaXN0SXRlbSwgSUFnZW50U2Vzc2lvbnNGaWx0ZXIsIHNlc3Npb25EYXRlRnJvbU5vdywgZ2V0UmVwb3NpdG9yeU5hbWUsIEFnZW50U2Vzc2lvbnNTb3J0ZXIsIGdyb3VwQWdlbnRTZXNzaW9uc0J5RGF0ZSwgZ2V0QWdlbnRTZXNzaW9uU3RhdHVzSWNvbiB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zVmlld2VyLmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvblNlY3Rpb24sIElBZ2VudFNlc3Npb24sIElBZ2VudFNlc3Npb25TZWN0aW9uLCBJQWdlbnRTZXNzaW9uc01vZGVsLCBpc0FnZW50U2Vzc2lvbiwgaXNBZ2VudFNlc3Npb25TZWN0aW9uLCBpc0FnZW50U2Vzc2lvblNob3dMZXNzLCBpc0FnZW50U2Vzc2lvblNob3dNb3JlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnNNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0U2Vzc2lvblN0YXR1cyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUcmVlU29ydGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvdHJlZS5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb25zR3JvdXBpbmcsIEFnZW50U2Vzc2lvbnNTb3J0aW5nIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnNGaWx0ZXIuanMnO1xuaW1wb3J0IHsgc2hvdWxkU2hvd1Nlc3Npb25JblBpY2tlciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zUGlja2VyLmpzJztcbmltcG9ydCB7IHRoZW1lQ29sb3JGcm9tSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuXG5zdWl0ZSgnc2Vzc2lvbkRhdGVGcm9tTm93JywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IE9ORV9EQVkgPSAyNCAqIDYwICogNjAgKiAxMDAwO1xuXG5cdHRlc3QoJ3JldHVybnMgXCIxIGRheVwiIGZvciB5ZXN0ZXJkYXknLCAoKSA9PiB7XG5cdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRjb25zdCBzdGFydE9mVG9kYXkgPSBuZXcgRGF0ZShub3cpLnNldEhvdXJzKDAsIDAsIDAsIDApO1xuXHRcdC8vIFRpbWUgaW4gdGhlIG1pZGRsZSBvZiB5ZXN0ZXJkYXlcblx0XHRjb25zdCB5ZXN0ZXJkYXkgPSBzdGFydE9mVG9kYXkgLSBPTkVfREFZIC8gMjtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbkRhdGVGcm9tTm93KHllc3RlcmRheSksICcxIGRheScpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIFwiMiBkYXlzXCIgZm9yIHR3byBkYXlzIGFnbycsICgpID0+IHtcblx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdGNvbnN0IHN0YXJ0T2ZUb2RheSA9IG5ldyBEYXRlKG5vdykuc2V0SG91cnMoMCwgMCwgMCwgMCk7XG5cdFx0Y29uc3Qgc3RhcnRPZlllc3RlcmRheSA9IHN0YXJ0T2ZUb2RheSAtIE9ORV9EQVk7XG5cdFx0Ly8gVGltZSBpbiB0aGUgbWlkZGxlIG9mIHR3byBkYXlzIGFnb1xuXHRcdGNvbnN0IHR3b0RheXNBZ28gPSBzdGFydE9mWWVzdGVyZGF5IC0gT05FX0RBWSAvIDI7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25EYXRlRnJvbU5vdyh0d29EYXlzQWdvKSwgJzIgZGF5cycpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIGZyb21Ob3cgcmVzdWx0IGZvciB0b2RheScsICgpID0+IHtcblx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdGNvbnN0IHN0YXJ0T2ZUb2RheSA9IG5ldyBEYXRlKG5vdykuc2V0SG91cnMoMCwgMCwgMCwgMCk7XG5cdFx0Ly8gQSB0aW1lIGZyb20gdG9kYXkgLSBndWFyYW50ZWVkIHRvIGJlIGFmdGVyIHN0YXJ0T2ZUb2RheVxuXHRcdGNvbnN0IGZpdmVNaW51dGVzQWZ0ZXJNaWRuaWdodCA9IHN0YXJ0T2ZUb2RheSArIDUgKiA2MCAqIDEwMDA7XG5cdFx0Y29uc3QgcmVzdWx0ID0gc2Vzc2lvbkRhdGVGcm9tTm93KGZpdmVNaW51dGVzQWZ0ZXJNaWRuaWdodCk7XG5cdFx0Ly8gU2hvdWxkIHJldHVybiBhIHRpbWUgYWdvIHN0cmluZywgbm90IFwiMSBkYXkgYWdvXCIgb3IgXCIyIGRheXMgYWdvXCJcblx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCdtaW4nKSB8fCByZXN1bHQuaW5jbHVkZXMoJ3NlYycpIHx8IHJlc3VsdC5pbmNsdWRlcygnaHInKSB8fCByZXN1bHQgPT09ICdub3cnLCBgRXhwZWN0ZWQgbWludXRlcy9zZWNvbmRzL2hvdXJzIGFnbyBvciBub3csIGdvdDogJHtyZXN1bHR9YCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgZnJvbU5vdyByZXN1bHQgZm9yIHRocmVlIG9yIG1vcmUgZGF5cyBhZ28nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRjb25zdCBzdGFydE9mVG9kYXkgPSBuZXcgRGF0ZShub3cpLnNldEhvdXJzKDAsIDAsIDAsIDApO1xuXHRcdC8vIFRpbWUgNSBkYXlzIGFnb1xuXHRcdGNvbnN0IGZpdmVEYXlzQWdvID0gc3RhcnRPZlRvZGF5IC0gNSAqIE9ORV9EQVk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gc2Vzc2lvbkRhdGVGcm9tTm93KGZpdmVEYXlzQWdvKTtcblx0XHQvLyBTaG91bGQgcmV0dXJuIFwiNSBkYXlzIGFnb1wiIGZyb20gZnJvbU5vdywgbm90IG91ciBzcGVjaWFsIGhhbmRsaW5nXG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygnZGF5JyksIGBFeHBlY3RlZCBkYXlzIGFnbywgZ290OiAke3Jlc3VsdH1gKTtcblx0XHRhc3NlcnQub2soIXJlc3VsdC5pbmNsdWRlcygnMSBkYXknKSAmJiAhcmVzdWx0LmluY2x1ZGVzKCcyIGRheXMnKSwgYFNob3VsZCBub3QgYmUgMSBvciAyIGRheXMgYWdvLCBnb3Q6ICR7cmVzdWx0fWApO1xuXHR9KTtcblxuXHR0ZXN0KCdhcHBlbmRzIFwiYWdvXCIgd2hlbiBhcHBlbmRBZ29MYWJlbCBpcyB0cnVlJywgKCkgPT4ge1xuXHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0Y29uc3Qgc3RhcnRPZlRvZGF5ID0gbmV3IERhdGUobm93KS5zZXRIb3VycygwLCAwLCAwLCAwKTtcblxuXHRcdGNvbnN0IHllc3RlcmRheSA9IHN0YXJ0T2ZUb2RheSAtIE9ORV9EQVkgLyAyO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uRGF0ZUZyb21Ob3coeWVzdGVyZGF5LCB0cnVlKSwgJzEgZGF5IGFnbycpO1xuXG5cdFx0Y29uc3Qgc3RhcnRPZlllc3RlcmRheSA9IHN0YXJ0T2ZUb2RheSAtIE9ORV9EQVk7XG5cdFx0Y29uc3QgdHdvRGF5c0FnbyA9IHN0YXJ0T2ZZZXN0ZXJkYXkgLSBPTkVfREFZIC8gMjtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbkRhdGVGcm9tTm93KHR3b0RheXNBZ28sIHRydWUpLCAnMiBkYXlzIGFnbycpO1xuXG5cdFx0Y29uc3QgZml2ZURheXNBZ28gPSBzdGFydE9mVG9kYXkgLSA1ICogT05FX0RBWTtcblx0XHRjb25zdCByZXN1bHQgPSBzZXNzaW9uRGF0ZUZyb21Ob3coZml2ZURheXNBZ28sIHRydWUpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJ2FnbycpLCBgRXhwZWN0ZWQgXCJhZ29cIiBpbiByZXN1bHQsIGdvdDogJHtyZXN1bHR9YCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdBZ2VudFNlc3Npb25zRGF0YVNvdXJjZScsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IE9ORV9EQVkgPSAyNCAqIDYwICogNjAgKiAxMDAwO1xuXHRjb25zdCBXRUVLX1RIUkVTSE9MRCA9IDcgKiBPTkVfREFZOyAvLyA3IGRheXNcblxuXHRmdW5jdGlvbiBjcmVhdGVNb2NrU2Vzc2lvbihvdmVycmlkZXM6IFBhcnRpYWw8e1xuXHRcdGlkOiBzdHJpbmc7XG5cdFx0c3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cztcblx0XHRpc0FyY2hpdmVkOiBib29sZWFuO1xuXHRcdGlzUGlubmVkOiBib29sZWFuO1xuXHRcdGlzUmVhZDogYm9vbGVhbjtcblx0XHRoYXNDaGFuZ2VzOiBib29sZWFuO1xuXHRcdHN0YXJ0VGltZTogbnVtYmVyO1xuXHRcdGVuZFRpbWU6IG51bWJlcjtcblx0XHRtZXRhZGF0YTogeyBba2V5OiBzdHJpbmddOiB1bmtub3duIH07XG5cdFx0YmFkZ2U6IHN0cmluZztcblx0fT4gPSB7fSk6IElBZ2VudFNlc3Npb24ge1xuXHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHByb3ZpZGVyVHlwZTogJ3Rlc3QnLFxuXHRcdFx0cHJvdmlkZXJMYWJlbDogJ1Rlc3QnLFxuXHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZShgdGVzdDovL3Nlc3Npb24vJHtvdmVycmlkZXMuaWQgPz8gJ2RlZmF1bHQnfWApLFxuXHRcdFx0c3RhdHVzOiBvdmVycmlkZXMuc3RhdHVzID8/IENoYXRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCxcblx0XHRcdGxhYmVsOiBgU2Vzc2lvbiAke292ZXJyaWRlcy5pZCA/PyAnZGVmYXVsdCd9YCxcblx0XHRcdGljb246IENvZGljb24udGVybWluYWwsXG5cdFx0XHR0aW1pbmc6IHtcblx0XHRcdFx0Y3JlYXRlZDogb3ZlcnJpZGVzLnN0YXJ0VGltZSA/PyBub3csXG5cdFx0XHRcdGxhc3RSZXF1ZXN0RW5kZWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0bGFzdFJlcXVlc3RTdGFydGVkOiB1bmRlZmluZWQsXG5cdFx0XHR9LFxuXHRcdFx0Y2hhbmdlczogb3ZlcnJpZGVzLmhhc0NoYW5nZXMgPyB7IGZpbGVzOiAxLCBpbnNlcnRpb25zOiAxMCwgZGVsZXRpb25zOiA1IH0gOiB1bmRlZmluZWQsXG5cdFx0XHRtZXRhZGF0YTogb3ZlcnJpZGVzLm1ldGFkYXRhLFxuXHRcdFx0YmFkZ2U6IG92ZXJyaWRlcy5iYWRnZSxcblx0XHRcdGlzQXJjaGl2ZWQ6ICgpID0+IG92ZXJyaWRlcy5pc0FyY2hpdmVkID8/IGZhbHNlLFxuXHRcdFx0c2V0QXJjaGl2ZWQ6ICgpID0+IHsgfSxcblx0XHRcdGlzUGlubmVkOiAoKSA9PiBvdmVycmlkZXMuaXNQaW5uZWQgPz8gZmFsc2UsXG5cdFx0XHRzZXRQaW5uZWQ6ICgpID0+IHsgfSxcblx0XHRcdGlzUmVhZDogKCkgPT4gb3ZlcnJpZGVzLmlzUmVhZCA/PyB0cnVlLFxuXHRcdFx0aXNNYXJrZWRVbnJlYWQ6ICgpID0+IGZhbHNlLFxuXHRcdFx0c2V0UmVhZDogKCkgPT4geyB9LFxuXHRcdH07XG5cdH1cblxuXHRzdWl0ZSgnZ2V0QWdlbnRTZXNzaW9uU3RhdHVzSWNvbicsICgpID0+IHtcblxuXHRcdHRlc3QoJ21hdGNoZXMgc2Vzc2lvbnMgd2luZG93IHN0YXRlIGljb25zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2FzZXMgPSBbXG5cdFx0XHRcdFsncmVhZCcsIGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICdyZWFkJyB9KV0sXG5cdFx0XHRcdFsndW5yZWFkJywgY3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJ3VucmVhZCcsIGlzUmVhZDogZmFsc2UgfSldLFxuXHRcdFx0XHRbJ2FyY2hpdmVkJywgY3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJ2FyY2hpdmVkJywgaXNBcmNoaXZlZDogdHJ1ZSwgaXNSZWFkOiBmYWxzZSB9KV0sXG5cdFx0XHRcdFsnaW4tcHJvZ3Jlc3MnLCBjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnaW4tcHJvZ3Jlc3MnLCBzdGF0dXM6IENoYXRTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MgfSldLFxuXHRcdFx0XHRbJ25lZWRzLWlucHV0JywgY3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJ25lZWRzLWlucHV0Jywgc3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cy5OZWVkc0lucHV0IH0pXSxcblx0XHRcdFx0WydmYWlsZWQnLCBjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnZmFpbGVkJywgc3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cy5GYWlsZWQgfSldLFxuXHRcdFx0XSBhcyBjb25zdDtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYXNlcy5tYXAoKFtuYW1lLCBzZXNzaW9uXSkgPT4gW25hbWUsIGdldEFnZW50U2Vzc2lvblN0YXR1c0ljb24oc2Vzc2lvbildKSwgW1xuXHRcdFx0XHRbJ3JlYWQnLCB7IC4uLkNvZGljb24uY2lyY2xlU21hbGxGaWxsZWQsIGNvbG9yOiB0aGVtZUNvbG9yRnJvbUlkKCdhZ2VudFNlc3Npb25SZWFkSW5kaWNhdG9yLmZvcmVncm91bmQnKSB9XSxcblx0XHRcdFx0Wyd1bnJlYWQnLCB7IC4uLkNvZGljb24uY2lyY2xlRmlsbGVkLCBjb2xvcjogdGhlbWVDb2xvckZyb21JZCgndGV4dExpbmsuZm9yZWdyb3VuZCcpIH1dLFxuXHRcdFx0XHRbJ2FyY2hpdmVkJywgeyAuLi5Db2RpY29uLnBhc3NGaWxsZWQsIGNvbG9yOiB0aGVtZUNvbG9yRnJvbUlkKCdhZ2VudFNlc3Npb25SZWFkSW5kaWNhdG9yLmZvcmVncm91bmQnKSB9XSxcblx0XHRcdFx0Wydpbi1wcm9ncmVzcycsIHsgLi4uQ29kaWNvbi5zZXNzaW9uSW5Qcm9ncmVzcywgY29sb3I6IHRoZW1lQ29sb3JGcm9tSWQoJ3RleHRMaW5rLmZvcmVncm91bmQnKSB9XSxcblx0XHRcdFx0WyduZWVkcy1pbnB1dCcsIHsgLi4uQ29kaWNvbi5jaXJjbGVGaWxsZWQsIGNvbG9yOiB0aGVtZUNvbG9yRnJvbUlkKCdsaXN0Lndhcm5pbmdGb3JlZ3JvdW5kJykgfV0sXG5cdFx0XHRcdFsnZmFpbGVkJywgeyAuLi5Db2RpY29uLmVycm9yLCBjb2xvcjogdGhlbWVDb2xvckZyb21JZCgnZXJyb3JGb3JlZ3JvdW5kJykgfV0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gY3JlYXRlTW9ja01vZGVsKHNlc3Npb25zOiBJQWdlbnRTZXNzaW9uW10pOiBJQWdlbnRTZXNzaW9uc01vZGVsIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0c2Vzc2lvbnMsXG5cdFx0XHRyZXNvbHZlZDogdHJ1ZSxcblx0XHRcdGdldFNlc3Npb246ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdG9ic2VydmVTZXNzaW9uOiAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignTm90IGltcGxlbWVudGVkJyk7IH0sXG5cdFx0XHRvbldpbGxSZXNvbHZlOiBFdmVudC5Ob25lIGFzIEV2ZW50PHN0cmluZz4sXG5cdFx0XHRvbkRpZFJlc29sdmU6IEV2ZW50Lk5vbmUgYXMgRXZlbnQ8c3RyaW5nPixcblx0XHRcdG9uRGlkQ2hhbmdlU2Vzc2lvbnM6IEV2ZW50Lk5vbmUsXG5cdFx0XHRvbkRpZENoYW5nZVNlc3Npb25BcmNoaXZlZFN0YXRlOiBFdmVudC5Ob25lLFxuXHRcdFx0cmVzb2x2ZTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdH0gc2F0aXNmaWVzIElBZ2VudFNlc3Npb25zTW9kZWw7XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVNb2NrRmlsdGVyKG9wdGlvbnM6IHtcblx0XHRncm91cEJ5PzogQWdlbnRTZXNzaW9uc0dyb3VwaW5nO1xuXHRcdGV4Y2x1ZGU/OiAoc2Vzc2lvbjogSUFnZW50U2Vzc2lvbikgPT4gYm9vbGVhbjtcblx0XHRleGNsdWRlUmVhZD86IGJvb2xlYW47XG5cdFx0cmVwb3NpdG9yeUdyb3VwQ2FwcGVkPzogYm9vbGVhbjtcblx0fSk6IElBZ2VudFNlc3Npb25zRmlsdGVyIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0b25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRncm91cFJlc3VsdHM6ICgpID0+IG9wdGlvbnMuZ3JvdXBCeSxcblx0XHRcdGV4Y2x1ZGU6IG9wdGlvbnMuZXhjbHVkZSA/PyAoKCkgPT4gZmFsc2UpLFxuXHRcdFx0Z2V0RXhjbHVkZXM6ICgpID0+ICh7IHByb3ZpZGVyczogW10sIHN0YXRlczogW10sIGFyY2hpdmVkOiBmYWxzZSwgcmVhZDogb3B0aW9ucy5leGNsdWRlUmVhZCA/PyBmYWxzZSwgcmVwb3NpdG9yeUdyb3VwQ2FwcGVkOiBvcHRpb25zLnJlcG9zaXRvcnlHcm91cENhcHBlZCA/PyB0cnVlIH0pLFxuXHRcdFx0aXNEZWZhdWx0OiAoKSA9PiB0cnVlLFxuXHRcdFx0cmVzZXQ6ICgpID0+IHsgfSxcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlTW9ja1NvcnRlcigpOiBJVHJlZVNvcnRlcjxJQWdlbnRTZXNzaW9uPiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbXBhcmU6IChhLCBiKSA9PiB7XG5cdFx0XHRcdC8vIFNvcnQgYnkgY3JlYXRpb24gdGltZSwgbW9zdCByZWNlbnQgZmlyc3Rcblx0XHRcdFx0Y29uc3QgYVRpbWUgPSBhLnRpbWluZy5jcmVhdGVkO1xuXHRcdFx0XHRjb25zdCBiVGltZSA9IGIudGltaW5nLmNyZWF0ZWQ7XG5cdFx0XHRcdHJldHVybiBiVGltZSAtIGFUaW1lO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBnZXRTZWN0aW9uc0Zyb21SZXN1bHQocmVzdWx0OiBJdGVyYWJsZTxBZ2VudFNlc3Npb25MaXN0SXRlbT4pOiBJQWdlbnRTZXNzaW9uU2VjdGlvbltdIHtcblx0XHRyZXR1cm4gQXJyYXkuZnJvbShyZXN1bHQpLmZpbHRlcigoaXRlbSk6IGl0ZW0gaXMgSUFnZW50U2Vzc2lvblNlY3Rpb24gPT4gaXNBZ2VudFNlc3Npb25TZWN0aW9uKGl0ZW0pKTtcblx0fVxuXG5cdHN1aXRlKCdncm91cFNlc3Npb25zSW50b1NlY3Rpb25zJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncmV0dXJucyBmbGF0IGxpc3Qgd2hlbiBncm91cFJlc3VsdHMgaXMgZmFsc2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBbXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICcxJywgc3RhcnRUaW1lOiBub3csIGVuZFRpbWU6IG5vdyB9KSxcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzInLCBzdGFydFRpbWU6IG5vdyAtIE9ORV9EQVksIGVuZFRpbWU6IG5vdyAtIE9ORV9EQVkgfSksXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBjcmVhdGVNb2NrRmlsdGVyKHsgZ3JvdXBCeTogdW5kZWZpbmVkIH0pO1xuXHRcdFx0Y29uc3Qgc29ydGVyID0gY3JlYXRlTW9ja1NvcnRlcigpO1xuXHRcdFx0Y29uc3QgZGF0YVNvdXJjZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXNzaW9uc0RhdGFTb3VyY2UoZmlsdGVyLCBzb3J0ZXIpKTtcblxuXHRcdFx0Y29uc3QgbW9ja01vZGVsID0gY3JlYXRlTW9ja01vZGVsKHNlc3Npb25zKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IEFycmF5LmZyb20oZGF0YVNvdXJjZS5nZXRDaGlsZHJlbihtb2NrTW9kZWwpKTtcblxuXHRcdFx0Ly8gU2hvdWxkIGJlIGEgZmxhdCBsaXN0IHdpdGhvdXQgc2VjdGlvbnNcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRTZWN0aW9uc0Zyb21SZXN1bHQocmVzdWx0KS5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW4tcHJvZ3Jlc3Mgc2Vzc2lvbnMgYXJlIHBsYWNlZCBpbiB0aGVpciBkYXRlLWJhc2VkIHNlY3Rpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBbXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICcxJywgc3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsIHN0YXJ0VGltZTogbm93LCBlbmRUaW1lOiBub3cgfSksXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICcyJywgc3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cy5JblByb2dyZXNzLCBzdGFydFRpbWU6IG5vdyAtIE9ORV9EQVkgfSksXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICczJywgc3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cy5OZWVkc0lucHV0LCBzdGFydFRpbWU6IG5vdyB9KSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IGZpbHRlciA9IGNyZWF0ZU1vY2tGaWx0ZXIoeyBncm91cEJ5OiBBZ2VudFNlc3Npb25zR3JvdXBpbmcuRGF0ZSB9KTtcblx0XHRcdGNvbnN0IHNvcnRlciA9IGNyZWF0ZU1vY2tTb3J0ZXIoKTtcblx0XHRcdGNvbnN0IGRhdGFTb3VyY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2Vzc2lvbnNEYXRhU291cmNlKGZpbHRlciwgc29ydGVyKSk7XG5cblx0XHRcdGNvbnN0IG1vY2tNb2RlbCA9IGNyZWF0ZU1vY2tNb2RlbChzZXNzaW9ucyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBBcnJheS5mcm9tKGRhdGFTb3VyY2UuZ2V0Q2hpbGRyZW4obW9ja01vZGVsKSk7XG5cdFx0XHRjb25zdCBzZWN0aW9ucyA9IGdldFNlY3Rpb25zRnJvbVJlc3VsdChyZXN1bHQpO1xuXG5cdFx0XHQvLyBObyBJblByb2dyZXNzIHNlY3Rpb24gLSBzZXNzaW9ucyBnbyBpbnRvIGRhdGUtYmFzZWQgc2VjdGlvbnNcblx0XHRcdGNvbnN0IHRvZGF5U2VjdGlvbiA9IHNlY3Rpb25zLmZpbmQocyA9PiBzLnNlY3Rpb24gPT09IEFnZW50U2Vzc2lvblNlY3Rpb24uVG9kYXkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHRvZGF5U2VjdGlvbik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9kYXlTZWN0aW9uLnNlc3Npb25zLmxlbmd0aCwgMik7IC8vIGNvbXBsZXRlZCArIG5lZWRzLWlucHV0XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbi1wcm9ncmVzcyBzZXNzaW9ucyBhcHBlYXIgaW4gVG9kYXkgc2VjdGlvbiBhbG9uZ3NpZGUgY29tcGxldGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gW1xuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnMScsIHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLCBzdGFydFRpbWU6IG5vdywgZW5kVGltZTogbm93IH0pLFxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnMicsIHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcywgc3RhcnRUaW1lOiBub3cgfSksXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBjcmVhdGVNb2NrRmlsdGVyKHsgZ3JvdXBCeTogQWdlbnRTZXNzaW9uc0dyb3VwaW5nLkRhdGUgfSk7XG5cdFx0XHRjb25zdCBzb3J0ZXIgPSBjcmVhdGVNb2NrU29ydGVyKCk7XG5cdFx0XHRjb25zdCBkYXRhU291cmNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlc3Npb25zRGF0YVNvdXJjZShmaWx0ZXIsIHNvcnRlcikpO1xuXG5cdFx0XHRjb25zdCBtb2NrTW9kZWwgPSBjcmVhdGVNb2NrTW9kZWwoc2Vzc2lvbnMpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gQXJyYXkuZnJvbShkYXRhU291cmNlLmdldENoaWxkcmVuKG1vY2tNb2RlbCkpO1xuXHRcdFx0Y29uc3Qgc2VjdGlvbnMgPSBnZXRTZWN0aW9uc0Zyb21SZXN1bHQocmVzdWx0KTtcblxuXHRcdFx0Ly8gT25seSBhIFRvZGF5IHNlY3Rpb24sIG5vIEluUHJvZ3Jlc3Mgc2VjdGlvblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VjdGlvbnNbMF0uc2VjdGlvbiwgQWdlbnRTZXNzaW9uU2VjdGlvbi5Ub2RheSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VjdGlvbnNbMF0uc2Vzc2lvbnMubGVuZ3RoLCAyKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FkZHMgVG9kYXkgaGVhZGVyIHdoZW4gdGhlcmUgYXJlIG5vIGFjdGl2ZSBzZXNzaW9ucycsICgpID0+IHtcblx0XHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IFtcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzEnLCBzdGF0dXM6IENoYXRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgc3RhcnRUaW1lOiBub3csIGVuZFRpbWU6IG5vdyB9KSxcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzInLCBzdGF0dXM6IENoYXRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgc3RhcnRUaW1lOiBub3cgLSBPTkVfREFZLCBlbmRUaW1lOiBub3cgLSBPTkVfREFZIH0pLFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgZmlsdGVyID0gY3JlYXRlTW9ja0ZpbHRlcih7IGdyb3VwQnk6IEFnZW50U2Vzc2lvbnNHcm91cGluZy5EYXRlIH0pO1xuXHRcdFx0Y29uc3Qgc29ydGVyID0gY3JlYXRlTW9ja1NvcnRlcigpO1xuXHRcdFx0Y29uc3QgZGF0YVNvdXJjZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXNzaW9uc0RhdGFTb3VyY2UoZmlsdGVyLCBzb3J0ZXIpKTtcblxuXHRcdFx0Y29uc3QgbW9ja01vZGVsID0gY3JlYXRlTW9ja01vZGVsKHNlc3Npb25zKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IEFycmF5LmZyb20oZGF0YVNvdXJjZS5nZXRDaGlsZHJlbihtb2NrTW9kZWwpKTtcblx0XHRcdGNvbnN0IHNlY3Rpb25zID0gZ2V0U2VjdGlvbnNGcm9tUmVzdWx0KHJlc3VsdCk7XG5cblx0XHRcdC8vIE5vdyBhbGwgc2VjdGlvbnMgaGF2ZSBoZWFkZXJzLCBzbyBUb2RheSBzZWN0aW9uIHNob3VsZCBiZSBwcmVzZW50XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VjdGlvbnMuZmlsdGVyKHMgPT4gcy5zZWN0aW9uID09PSBBZ2VudFNlc3Npb25TZWN0aW9uLlRvZGF5KS5sZW5ndGgsIDEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWRkcyBPbGRlciBoZWFkZXIgZm9yIHNlc3Npb25zIG9sZGVyIHRoYW4gd2VlayB0aHJlc2hvbGQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBbXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICcxJywgc3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsIHN0YXJ0VGltZTogbm93LCBlbmRUaW1lOiBub3cgfSksXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICcyJywgc3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsIHN0YXJ0VGltZTogbm93IC0gV0VFS19USFJFU0hPTEQgLSBPTkVfREFZLCBlbmRUaW1lOiBub3cgLSBXRUVLX1RIUkVTSE9MRCAtIE9ORV9EQVkgfSksXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBjcmVhdGVNb2NrRmlsdGVyKHsgZ3JvdXBCeTogQWdlbnRTZXNzaW9uc0dyb3VwaW5nLkRhdGUgfSk7XG5cdFx0XHRjb25zdCBzb3J0ZXIgPSBjcmVhdGVNb2NrU29ydGVyKCk7XG5cdFx0XHRjb25zdCBkYXRhU291cmNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlc3Npb25zRGF0YVNvdXJjZShmaWx0ZXIsIHNvcnRlcikpO1xuXG5cdFx0XHRjb25zdCBtb2NrTW9kZWwgPSBjcmVhdGVNb2NrTW9kZWwoc2Vzc2lvbnMpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gQXJyYXkuZnJvbShkYXRhU291cmNlLmdldENoaWxkcmVuKG1vY2tNb2RlbCkpO1xuXHRcdFx0Y29uc3Qgc2VjdGlvbnMgPSBnZXRTZWN0aW9uc0Zyb21SZXN1bHQocmVzdWx0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY3Rpb25zLmZpbHRlcihzID0+IHMuc2VjdGlvbiA9PT0gQWdlbnRTZXNzaW9uU2VjdGlvbi5PbGRlcikubGVuZ3RoLCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FkZHMgQXJjaGl2ZWQgaGVhZGVyIGZvciBhcmNoaXZlZCBzZXNzaW9ucycsICgpID0+IHtcblx0XHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IFtcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzEnLCBzdGF0dXM6IENoYXRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgc3RhcnRUaW1lOiBub3csIGVuZFRpbWU6IG5vdyB9KSxcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzInLCBzdGF0dXM6IENoYXRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgaXNBcmNoaXZlZDogdHJ1ZSwgc3RhcnRUaW1lOiBub3cgLSBPTkVfREFZLCBlbmRUaW1lOiBub3cgLSBPTkVfREFZIH0pLFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgZmlsdGVyID0gY3JlYXRlTW9ja0ZpbHRlcih7IGdyb3VwQnk6IEFnZW50U2Vzc2lvbnNHcm91cGluZy5EYXRlIH0pO1xuXHRcdFx0Y29uc3Qgc29ydGVyID0gY3JlYXRlTW9ja1NvcnRlcigpO1xuXHRcdFx0Y29uc3QgZGF0YVNvdXJjZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXNzaW9uc0RhdGFTb3VyY2UoZmlsdGVyLCBzb3J0ZXIpKTtcblxuXHRcdFx0Y29uc3QgbW9ja01vZGVsID0gY3JlYXRlTW9ja01vZGVsKHNlc3Npb25zKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IEFycmF5LmZyb20oZGF0YVNvdXJjZS5nZXRDaGlsZHJlbihtb2NrTW9kZWwpKTtcblx0XHRcdGNvbnN0IHNlY3Rpb25zID0gZ2V0U2VjdGlvbnNGcm9tUmVzdWx0KHJlc3VsdCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWN0aW9ucy5maWx0ZXIocyA9PiBzLnNlY3Rpb24gPT09IEFnZW50U2Vzc2lvblNlY3Rpb24uQXJjaGl2ZWQpLmxlbmd0aCwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhcmNoaXZlZCBzZXNzaW9ucyBjb21lIGFmdGVyIG9sZGVyIHNlc3Npb25zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gW1xuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnMScsIHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLCBpc0FyY2hpdmVkOiB0cnVlLCBzdGFydFRpbWU6IG5vdywgZW5kVGltZTogbm93IH0pLFxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnMicsIHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLCBzdGFydFRpbWU6IG5vdyAtIFdFRUtfVEhSRVNIT0xEIC0gT05FX0RBWSwgZW5kVGltZTogbm93IC0gV0VFS19USFJFU0hPTEQgLSBPTkVfREFZIH0pLFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgZmlsdGVyID0gY3JlYXRlTW9ja0ZpbHRlcih7IGdyb3VwQnk6IEFnZW50U2Vzc2lvbnNHcm91cGluZy5EYXRlIH0pO1xuXHRcdFx0Y29uc3Qgc29ydGVyID0gY3JlYXRlTW9ja1NvcnRlcigpO1xuXHRcdFx0Y29uc3QgZGF0YVNvdXJjZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXNzaW9uc0RhdGFTb3VyY2UoZmlsdGVyLCBzb3J0ZXIpKTtcblxuXHRcdFx0Y29uc3QgbW9ja01vZGVsID0gY3JlYXRlTW9ja01vZGVsKHNlc3Npb25zKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IEFycmF5LmZyb20oZGF0YVNvdXJjZS5nZXRDaGlsZHJlbihtb2NrTW9kZWwpKTtcblxuXHRcdFx0Y29uc3Qgb2xkZXJJbmRleCA9IHJlc3VsdC5maW5kSW5kZXgoaXRlbSA9PiBpc0FnZW50U2Vzc2lvblNlY3Rpb24oaXRlbSkgJiYgaXRlbS5zZWN0aW9uID09PSBBZ2VudFNlc3Npb25TZWN0aW9uLk9sZGVyKTtcblx0XHRcdGNvbnN0IGFyY2hpdmVkSW5kZXggPSByZXN1bHQuZmluZEluZGV4KGl0ZW0gPT4gaXNBZ2VudFNlc3Npb25TZWN0aW9uKGl0ZW0pICYmIGl0ZW0uc2VjdGlvbiA9PT0gQWdlbnRTZXNzaW9uU2VjdGlvbi5BcmNoaXZlZCk7XG5cblx0XHRcdGFzc2VydC5vayhvbGRlckluZGV4IDwgYXJjaGl2ZWRJbmRleCwgJ09sZGVyIHNlY3Rpb24gc2hvdWxkIGNvbWUgYmVmb3JlIEFyY2hpdmVkIHNlY3Rpb24nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FyY2hpdmVkIGluLXByb2dyZXNzIHNlc3Npb25zIGFwcGVhciBpbiBBcmNoaXZlZCBzZWN0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gW1xuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnYXJjaGl2ZWQtYWN0aXZlJywgc3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cy5JblByb2dyZXNzLCBpc0FyY2hpdmVkOiB0cnVlLCBzdGFydFRpbWU6IG5vdyB9KSxcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJ2FjdGl2ZScsIHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcywgc3RhcnRUaW1lOiBub3cgfSksXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBjcmVhdGVNb2NrRmlsdGVyKHsgZ3JvdXBCeTogQWdlbnRTZXNzaW9uc0dyb3VwaW5nLkRhdGUgfSk7XG5cdFx0XHRjb25zdCBzb3J0ZXIgPSBjcmVhdGVNb2NrU29ydGVyKCk7XG5cdFx0XHRjb25zdCBkYXRhU291cmNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlc3Npb25zRGF0YVNvdXJjZShmaWx0ZXIsIHNvcnRlcikpO1xuXG5cdFx0XHRjb25zdCBtb2NrTW9kZWwgPSBjcmVhdGVNb2NrTW9kZWwoc2Vzc2lvbnMpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gQXJyYXkuZnJvbShkYXRhU291cmNlLmdldENoaWxkcmVuKG1vY2tNb2RlbCkpO1xuXHRcdFx0Y29uc3Qgc2VjdGlvbnMgPSBnZXRTZWN0aW9uc0Zyb21SZXN1bHQocmVzdWx0KTtcblxuXHRcdFx0Ly8gVmVyaWZ5IHRoZXJlIGlzIGJvdGggYSBUb2RheSBhbmQgQXJjaGl2ZWQgc2VjdGlvbiAobm8gSW5Qcm9ncmVzcyBzZWN0aW9uKVxuXHRcdFx0Y29uc3QgdG9kYXlTZWN0aW9uID0gc2VjdGlvbnMuZmluZChzID0+IHMuc2VjdGlvbiA9PT0gQWdlbnRTZXNzaW9uU2VjdGlvbi5Ub2RheSk7XG5cdFx0XHRjb25zdCBhcmNoaXZlZFNlY3Rpb24gPSBzZWN0aW9ucy5maW5kKHMgPT4gcy5zZWN0aW9uID09PSBBZ2VudFNlc3Npb25TZWN0aW9uLkFyY2hpdmVkKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHRvZGF5U2VjdGlvbiwgJ1RvZGF5IHNlY3Rpb24gc2hvdWxkIGV4aXN0Jyk7XG5cdFx0XHRhc3NlcnQub2soYXJjaGl2ZWRTZWN0aW9uLCAnQXJjaGl2ZWQgc2VjdGlvbiBzaG91bGQgZXhpc3QnKTtcblxuXHRcdFx0Ly8gVGhlIGFjdGl2ZSBzZXNzaW9uIHNob3VsZCBiZSBpbiBUb2RheVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRvZGF5U2VjdGlvbi5zZXNzaW9ucy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRvZGF5U2VjdGlvbi5zZXNzaW9uc1swXS5sYWJlbCwgJ1Nlc3Npb24gYWN0aXZlJyk7XG5cblx0XHRcdC8vIFRoZSBhcmNoaXZlZCBzZXNzaW9uIHNob3VsZCBhcHBlYXIgaW4gQXJjaGl2ZWRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcmNoaXZlZFNlY3Rpb24uc2Vzc2lvbnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcmNoaXZlZFNlY3Rpb24uc2Vzc2lvbnNbMF0ubGFiZWwsICdTZXNzaW9uIGFyY2hpdmVkLWFjdGl2ZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29ycmVjdCBvcmRlcjogdG9kYXksIHdlZWssIG9sZGVyLCBhcmNoaXZlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IFtcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJ2FyY2hpdmVkJywgc3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsIGlzQXJjaGl2ZWQ6IHRydWUsIHN0YXJ0VGltZTogbm93LCBlbmRUaW1lOiBub3cgfSksXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICd0b2RheScsIHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLCBzdGFydFRpbWU6IG5vdywgZW5kVGltZTogbm93IH0pLFxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnd2VlaycsIHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLCBzdGFydFRpbWU6IG5vdyAtIDMgKiBPTkVfREFZLCBlbmRUaW1lOiBub3cgLSAzICogT05FX0RBWSB9KSxcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJ29sZCcsIHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLCBzdGFydFRpbWU6IG5vdyAtIFdFRUtfVEhSRVNIT0xEIC0gT05FX0RBWSwgZW5kVGltZTogbm93IC0gV0VFS19USFJFU0hPTEQgLSBPTkVfREFZIH0pLFxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnYWN0aXZlJywgc3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cy5JblByb2dyZXNzLCBzdGFydFRpbWU6IG5vdyB9KSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IGZpbHRlciA9IGNyZWF0ZU1vY2tGaWx0ZXIoeyBncm91cEJ5OiBBZ2VudFNlc3Npb25zR3JvdXBpbmcuRGF0ZSB9KTtcblx0XHRcdGNvbnN0IHNvcnRlciA9IGNyZWF0ZU1vY2tTb3J0ZXIoKTtcblx0XHRcdGNvbnN0IGRhdGFTb3VyY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2Vzc2lvbnNEYXRhU291cmNlKGZpbHRlciwgc29ydGVyKSk7XG5cblx0XHRcdGNvbnN0IG1vY2tNb2RlbCA9IGNyZWF0ZU1vY2tNb2RlbChzZXNzaW9ucyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBBcnJheS5mcm9tKGRhdGFTb3VyY2UuZ2V0Q2hpbGRyZW4obW9ja01vZGVsKSk7XG5cblx0XHRcdC8vIFRvZGF5IHNlY3Rpb24gKGluY2x1ZGVzIGluLXByb2dyZXNzIHNlc3Npb24pXG5cdFx0XHRhc3NlcnQub2soaXNBZ2VudFNlc3Npb25TZWN0aW9uKHJlc3VsdFswXSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChyZXN1bHRbMF0gYXMgSUFnZW50U2Vzc2lvblNlY3Rpb24pLnNlY3Rpb24sIEFnZW50U2Vzc2lvblNlY3Rpb24uVG9kYXkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChyZXN1bHRbMF0gYXMgSUFnZW50U2Vzc2lvblNlY3Rpb24pLnNlc3Npb25zLmxlbmd0aCwgMik7XG5cblx0XHRcdC8vIFdlZWsgc2VjdGlvblxuXHRcdFx0YXNzZXJ0Lm9rKGlzQWdlbnRTZXNzaW9uU2VjdGlvbihyZXN1bHRbMV0pKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgocmVzdWx0WzFdIGFzIElBZ2VudFNlc3Npb25TZWN0aW9uKS5zZWN0aW9uLCBBZ2VudFNlc3Npb25TZWN0aW9uLldlZWspO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChyZXN1bHRbMV0gYXMgSUFnZW50U2Vzc2lvblNlY3Rpb24pLnNlc3Npb25zWzBdLmxhYmVsLCAnU2Vzc2lvbiB3ZWVrJyk7XG5cblx0XHRcdC8vIE9sZGVyIHNlY3Rpb25cblx0XHRcdGFzc2VydC5vayhpc0FnZW50U2Vzc2lvblNlY3Rpb24ocmVzdWx0WzJdKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHJlc3VsdFsyXSBhcyBJQWdlbnRTZXNzaW9uU2VjdGlvbikuc2VjdGlvbiwgQWdlbnRTZXNzaW9uU2VjdGlvbi5PbGRlcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHJlc3VsdFsyXSBhcyBJQWdlbnRTZXNzaW9uU2VjdGlvbikuc2Vzc2lvbnNbMF0ubGFiZWwsICdTZXNzaW9uIG9sZCcpO1xuXG5cdFx0XHQvLyBBcmNoaXZlZCBzZWN0aW9uXG5cdFx0XHRhc3NlcnQub2soaXNBZ2VudFNlc3Npb25TZWN0aW9uKHJlc3VsdFszXSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChyZXN1bHRbM10gYXMgSUFnZW50U2Vzc2lvblNlY3Rpb24pLnNlY3Rpb24sIEFnZW50U2Vzc2lvblNlY3Rpb24uQXJjaGl2ZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChyZXN1bHRbM10gYXMgSUFnZW50U2Vzc2lvblNlY3Rpb24pLnNlc3Npb25zWzBdLmxhYmVsLCAnU2Vzc2lvbiBhcmNoaXZlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZW1wdHkgc2Vzc2lvbnMgcmV0dXJucyBlbXB0eSByZXN1bHQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBjcmVhdGVNb2NrRmlsdGVyKHsgZ3JvdXBCeTogQWdlbnRTZXNzaW9uc0dyb3VwaW5nLkRhdGUgfSk7XG5cdFx0XHRjb25zdCBzb3J0ZXIgPSBjcmVhdGVNb2NrU29ydGVyKCk7XG5cdFx0XHRjb25zdCBkYXRhU291cmNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlc3Npb25zRGF0YVNvdXJjZShmaWx0ZXIsIHNvcnRlcikpO1xuXG5cdFx0XHRjb25zdCBtb2NrTW9kZWwgPSBjcmVhdGVNb2NrTW9kZWwoW10pO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gQXJyYXkuZnJvbShkYXRhU291cmNlLmdldENoaWxkcmVuKG1vY2tNb2RlbCkpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvbmx5IHRvZGF5IHNlc3Npb25zIHByb2R1Y2VzIGEgVG9kYXkgc2VjdGlvbiBoZWFkZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBbXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICcxJywgc3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsIHN0YXJ0VGltZTogbm93LCBlbmRUaW1lOiBub3cgfSksXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICcyJywgc3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsIHN0YXJ0VGltZTogbm93IC0gMTAwMCwgZW5kVGltZTogbm93IC0gMTAwMCB9KSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IGZpbHRlciA9IGNyZWF0ZU1vY2tGaWx0ZXIoeyBncm91cEJ5OiBBZ2VudFNlc3Npb25zR3JvdXBpbmcuRGF0ZSB9KTtcblx0XHRcdGNvbnN0IHNvcnRlciA9IGNyZWF0ZU1vY2tTb3J0ZXIoKTtcblx0XHRcdGNvbnN0IGRhdGFTb3VyY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2Vzc2lvbnNEYXRhU291cmNlKGZpbHRlciwgc29ydGVyKSk7XG5cblx0XHRcdGNvbnN0IG1vY2tNb2RlbCA9IGNyZWF0ZU1vY2tNb2RlbChzZXNzaW9ucyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBBcnJheS5mcm9tKGRhdGFTb3VyY2UuZ2V0Q2hpbGRyZW4obW9ja01vZGVsKSk7XG5cdFx0XHRjb25zdCBzZWN0aW9ucyA9IGdldFNlY3Rpb25zRnJvbVJlc3VsdChyZXN1bHQpO1xuXG5cdFx0XHQvLyBBbGwgc2VjdGlvbnMgbm93IGhhdmUgaGVhZGVycywgc28gYSBUb2RheSBzZWN0aW9uIHNob3VsZCBiZSBwcmVzZW50XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VjdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWN0aW9uc1swXS5zZWN0aW9uLCBBZ2VudFNlc3Npb25TZWN0aW9uLlRvZGF5KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWN0aW9uc1swXS5zZXNzaW9ucy5sZW5ndGgsIDIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2Vzc2lvbnMgYXJlIHNvcnRlZCB3aXRoaW4gZWFjaCBncm91cCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IFtcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJ29sZDEnLCBzdGF0dXM6IENoYXRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgc3RhcnRUaW1lOiBub3cgLSBXRUVLX1RIUkVTSE9MRCAtIDIgKiBPTkVfREFZLCBlbmRUaW1lOiBub3cgLSBXRUVLX1RIUkVTSE9MRCAtIDIgKiBPTkVfREFZIH0pLFxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnb2xkMicsIHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLCBzdGFydFRpbWU6IG5vdyAtIFdFRUtfVEhSRVNIT0xEIC0gT05FX0RBWSwgZW5kVGltZTogbm93IC0gV0VFS19USFJFU0hPTEQgLSBPTkVfREFZIH0pLFxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnd2VlazEnLCBzdGF0dXM6IENoYXRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgc3RhcnRUaW1lOiBub3cgLSAzICogT05FX0RBWSwgZW5kVGltZTogbm93IC0gMyAqIE9ORV9EQVkgfSksXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICd3ZWVrMicsIHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLCBzdGFydFRpbWU6IG5vdyAtIDIgKiBPTkVfREFZLCBlbmRUaW1lOiBub3cgLSAyICogT05FX0RBWSB9KSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IGZpbHRlciA9IGNyZWF0ZU1vY2tGaWx0ZXIoeyBncm91cEJ5OiBBZ2VudFNlc3Npb25zR3JvdXBpbmcuRGF0ZSB9KTtcblx0XHRcdGNvbnN0IHNvcnRlciA9IGNyZWF0ZU1vY2tTb3J0ZXIoKTtcblx0XHRcdGNvbnN0IGRhdGFTb3VyY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2Vzc2lvbnNEYXRhU291cmNlKGZpbHRlciwgc29ydGVyKSk7XG5cblx0XHRcdGNvbnN0IG1vY2tNb2RlbCA9IGNyZWF0ZU1vY2tNb2RlbChzZXNzaW9ucyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBBcnJheS5mcm9tKGRhdGFTb3VyY2UuZ2V0Q2hpbGRyZW4obW9ja01vZGVsKSk7XG5cblx0XHRcdC8vIEFsbCBzZWN0aW9ucyBub3cgaGF2ZSBoZWFkZXJzXG5cdFx0XHQvLyBXZWVrIHNlY3Rpb24gc2hvdWxkIGJlIGZpcnN0IGFuZCBjb250YWluIHNvcnRlZCBzZXNzaW9uc1xuXHRcdFx0Y29uc3Qgd2Vla1NlY3Rpb24gPSByZXN1bHQuZmluZCgoaXRlbSk6IGl0ZW0gaXMgSUFnZW50U2Vzc2lvblNlY3Rpb24gPT4gaXNBZ2VudFNlc3Npb25TZWN0aW9uKGl0ZW0pICYmIGl0ZW0uc2VjdGlvbiA9PT0gQWdlbnRTZXNzaW9uU2VjdGlvbi5XZWVrKTtcblx0XHRcdGFzc2VydC5vayh3ZWVrU2VjdGlvbik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2Vla1NlY3Rpb24uc2Vzc2lvbnNbMF0ubGFiZWwsICdTZXNzaW9uIHdlZWsyJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2Vla1NlY3Rpb24uc2Vzc2lvbnNbMV0ubGFiZWwsICdTZXNzaW9uIHdlZWsxJyk7XG5cblx0XHRcdC8vIE9sZGVyIHNlY3Rpb24gd2l0aCBzb3J0ZWQgc2Vzc2lvbnNcblx0XHRcdGNvbnN0IG9sZGVyU2VjdGlvbiA9IHJlc3VsdC5maW5kKChpdGVtKTogaXRlbSBpcyBJQWdlbnRTZXNzaW9uU2VjdGlvbiA9PiBpc0FnZW50U2Vzc2lvblNlY3Rpb24oaXRlbSkgJiYgaXRlbS5zZWN0aW9uID09PSBBZ2VudFNlc3Npb25TZWN0aW9uLk9sZGVyKTtcblx0XHRcdGFzc2VydC5vayhvbGRlclNlY3Rpb24pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9sZGVyU2VjdGlvbi5zZXNzaW9uc1swXS5sYWJlbCwgJ1Nlc3Npb24gb2xkMicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9sZGVyU2VjdGlvbi5zZXNzaW9uc1sxXS5sYWJlbCwgJ1Nlc3Npb24gb2xkMScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2FwcGVkIGdyb3VwaW5nIHdpdGggdW5yZWFkIGZpbHRlciByZXR1cm5zIGZsYXQgbGlzdCB3aXRob3V0IE1vcmUgc2VjdGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IFtcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzEnLCBzdGFydFRpbWU6IG5vdywgaXNSZWFkOiBmYWxzZSB9KSxcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzInLCBzdGFydFRpbWU6IG5vdyAtIE9ORV9EQVksIGlzUmVhZDogZmFsc2UgfSksXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICczJywgc3RhcnRUaW1lOiBub3cgLSAyICogT05FX0RBWSwgaXNSZWFkOiBmYWxzZSB9KSxcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzQnLCBzdGFydFRpbWU6IG5vdyAtIDMgKiBPTkVfREFZLCBpc1JlYWQ6IGZhbHNlIH0pLFxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnNScsIHN0YXJ0VGltZTogbm93IC0gNCAqIE9ORV9EQVksIGlzUmVhZDogZmFsc2UgfSksXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBjcmVhdGVNb2NrRmlsdGVyKHtcblx0XHRcdFx0Z3JvdXBCeTogQWdlbnRTZXNzaW9uc0dyb3VwaW5nLkNhcHBlZCxcblx0XHRcdFx0ZXhjbHVkZVJlYWQ6IHRydWUgIC8vIEZpbHRlcmluZyB0byBzaG93IG9ubHkgdW5yZWFkIHNlc3Npb25zXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHNvcnRlciA9IGNyZWF0ZU1vY2tTb3J0ZXIoKTtcblx0XHRcdGNvbnN0IGRhdGFTb3VyY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2Vzc2lvbnNEYXRhU291cmNlKGZpbHRlciwgc29ydGVyKSk7XG5cblx0XHRcdGNvbnN0IG1vY2tNb2RlbCA9IGNyZWF0ZU1vY2tNb2RlbChzZXNzaW9ucyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBBcnJheS5mcm9tKGRhdGFTb3VyY2UuZ2V0Q2hpbGRyZW4obW9ja01vZGVsKSk7XG5cblx0XHRcdC8vIFNob3VsZCBiZSBhIGZsYXQgbGlzdCB3aXRob3V0IHNlY3Rpb25zIChubyBNb3JlIHNlY3Rpb24pXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgNSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U2VjdGlvbnNGcm9tUmVzdWx0KHJlc3VsdCkubGVuZ3RoLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NhcHBlZCBncm91cGluZyB3aXRob3V0IHVucmVhZCBmaWx0ZXIgaW5jbHVkZXMgTW9yZSBzZWN0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gW1xuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnMScsIHN0YXJ0VGltZTogbm93IH0pLFxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnMicsIHN0YXJ0VGltZTogbm93IC0gT05FX0RBWSB9KSxcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzMnLCBzdGFydFRpbWU6IG5vdyAtIDIgKiBPTkVfREFZIH0pLFxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnNCcsIHN0YXJ0VGltZTogbm93IC0gMyAqIE9ORV9EQVkgfSksXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICc1Jywgc3RhcnRUaW1lOiBub3cgLSA0ICogT05FX0RBWSB9KSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IGZpbHRlciA9IGNyZWF0ZU1vY2tGaWx0ZXIoe1xuXHRcdFx0XHRncm91cEJ5OiBBZ2VudFNlc3Npb25zR3JvdXBpbmcuQ2FwcGVkLFxuXHRcdFx0XHRleGNsdWRlUmVhZDogZmFsc2UgIC8vIE5vdCBmaWx0ZXJpbmcgdG8gdW5yZWFkIG9ubHlcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3Qgc29ydGVyID0gY3JlYXRlTW9ja1NvcnRlcigpO1xuXHRcdFx0Y29uc3QgZGF0YVNvdXJjZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXNzaW9uc0RhdGFTb3VyY2UoZmlsdGVyLCBzb3J0ZXIpKTtcblxuXHRcdFx0Y29uc3QgbW9ja01vZGVsID0gY3JlYXRlTW9ja01vZGVsKHNlc3Npb25zKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IEFycmF5LmZyb20oZGF0YVNvdXJjZS5nZXRDaGlsZHJlbihtb2NrTW9kZWwpKTtcblxuXHRcdFx0Ly8gU2hvdWxkIGhhdmUgMyB0b3Agc2Vzc2lvbnMgKyAxIE1vcmUgc2VjdGlvblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDQpO1xuXHRcdFx0Y29uc3Qgc2VjdGlvbnMgPSBnZXRTZWN0aW9uc0Zyb21SZXN1bHQocmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWN0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY3Rpb25zWzBdLnNlY3Rpb24sIEFnZW50U2Vzc2lvblNlY3Rpb24uTW9yZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VjdGlvbnNbMF0uc2Vzc2lvbnMubGVuZ3RoLCAyKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Bpbm5lZCBzZXNzaW9ucyBhcHBlYXIgaW4gUGlubmVkIHNlY3Rpb24gYXQgdGhlIHRvcCB3aXRoIGRhdGUgZ3JvdXBpbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBbXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICdwaW5uZWQxJywgaXNQaW5uZWQ6IHRydWUsIHN0YXJ0VGltZTogbm93IC0gV0VFS19USFJFU0hPTEQgLSBPTkVfREFZIH0pLFxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAndG9kYXknLCBzdGFydFRpbWU6IG5vdyB9KSxcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJ3Bpbm5lZDInLCBpc1Bpbm5lZDogdHJ1ZSwgc3RhcnRUaW1lOiBub3cgfSksXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBjcmVhdGVNb2NrRmlsdGVyKHsgZ3JvdXBCeTogQWdlbnRTZXNzaW9uc0dyb3VwaW5nLkRhdGUgfSk7XG5cdFx0XHRjb25zdCBzb3J0ZXIgPSBjcmVhdGVNb2NrU29ydGVyKCk7XG5cdFx0XHRjb25zdCBkYXRhU291cmNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlc3Npb25zRGF0YVNvdXJjZShmaWx0ZXIsIHNvcnRlcikpO1xuXG5cdFx0XHRjb25zdCBtb2NrTW9kZWwgPSBjcmVhdGVNb2NrTW9kZWwoc2Vzc2lvbnMpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gQXJyYXkuZnJvbShkYXRhU291cmNlLmdldENoaWxkcmVuKG1vY2tNb2RlbCkpO1xuXHRcdFx0Y29uc3Qgc2VjdGlvbnMgPSBnZXRTZWN0aW9uc0Zyb21SZXN1bHQocmVzdWx0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY3Rpb25zWzBdLnNlY3Rpb24sIEFnZW50U2Vzc2lvblNlY3Rpb24uUGlubmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWN0aW9uc1swXS5zZXNzaW9ucy5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY3Rpb25zWzFdLnNlY3Rpb24sIEFnZW50U2Vzc2lvblNlY3Rpb24uVG9kYXkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY3Rpb25zWzFdLnNlc3Npb25zLmxlbmd0aCwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhcmNoaXZlZCBwaW5uZWQgc2Vzc2lvbnMgZ28gdG8gQXJjaGl2ZWQsIG5vdCBQaW5uZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBbXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICdhcmNoaXZlZC1waW5uZWQnLCBpc1Bpbm5lZDogdHJ1ZSwgaXNBcmNoaXZlZDogdHJ1ZSwgc3RhcnRUaW1lOiBub3cgfSksXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICdwaW5uZWQnLCBpc1Bpbm5lZDogdHJ1ZSwgc3RhcnRUaW1lOiBub3cgfSksXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICd0b2RheScsIHN0YXJ0VGltZTogbm93IH0pLFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgZmlsdGVyID0gY3JlYXRlTW9ja0ZpbHRlcih7IGdyb3VwQnk6IEFnZW50U2Vzc2lvbnNHcm91cGluZy5EYXRlIH0pO1xuXHRcdFx0Y29uc3Qgc29ydGVyID0gY3JlYXRlTW9ja1NvcnRlcigpO1xuXHRcdFx0Y29uc3QgZGF0YVNvdXJjZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXNzaW9uc0RhdGFTb3VyY2UoZmlsdGVyLCBzb3J0ZXIpKTtcblxuXHRcdFx0Y29uc3QgbW9ja01vZGVsID0gY3JlYXRlTW9ja01vZGVsKHNlc3Npb25zKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IEFycmF5LmZyb20oZGF0YVNvdXJjZS5nZXRDaGlsZHJlbihtb2NrTW9kZWwpKTtcblx0XHRcdGNvbnN0IHNlY3Rpb25zID0gZ2V0U2VjdGlvbnNGcm9tUmVzdWx0KHJlc3VsdCk7XG5cblx0XHRcdGNvbnN0IHBpbm5lZFNlY3Rpb24gPSBzZWN0aW9ucy5maW5kKHMgPT4gcy5zZWN0aW9uID09PSBBZ2VudFNlc3Npb25TZWN0aW9uLlBpbm5lZCk7XG5cdFx0XHRjb25zdCBhcmNoaXZlZFNlY3Rpb24gPSBzZWN0aW9ucy5maW5kKHMgPT4gcy5zZWN0aW9uID09PSBBZ2VudFNlc3Npb25TZWN0aW9uLkFyY2hpdmVkKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHBpbm5lZFNlY3Rpb24pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpbm5lZFNlY3Rpb24uc2Vzc2lvbnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaW5uZWRTZWN0aW9uLnNlc3Npb25zWzBdLmxhYmVsLCAnU2Vzc2lvbiBwaW5uZWQnKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGFyY2hpdmVkU2VjdGlvbik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXJjaGl2ZWRTZWN0aW9uLnNlc3Npb25zLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXJjaGl2ZWRTZWN0aW9uLnNlc3Npb25zWzBdLmxhYmVsLCAnU2Vzc2lvbiBhcmNoaXZlZC1waW5uZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Bpbm5lZCBzZXNzaW9ucyBhcmUgYWx3YXlzIHNob3duIGFib3ZlIHRoZSBjYXAgd2l0aCBjYXBwZWQgZ3JvdXBpbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBbXG5cdFx0XHRcdC8vIFJlY2VudCB1bnBpbm5lZCBzZXNzaW9ucyBmaWxsIHRoZSB0b3AgMyBieSB0aW1lXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICdzMScsIHN0YXJ0VGltZTogbm93IH0pLFxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnczInLCBzdGFydFRpbWU6IG5vdyAtIE9ORV9EQVkgfSksXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICdzMycsIHN0YXJ0VGltZTogbm93IC0gMiAqIE9ORV9EQVkgfSksXG5cdFx0XHRcdC8vIFVucGlubmVkIG92ZXJmbG93XG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICdzNCcsIHN0YXJ0VGltZTogbm93IC0gMyAqIE9ORV9EQVkgfSksXG5cdFx0XHRcdC8vIFR3byBwaW5uZWQgc2Vzc2lvbnMgd2l0aCBvbGQgdGltZXN0YW1wcyBcdTIwMTQgd291bGQgZmFsbCBvdXRzaWRlIHRvcCAzIGJ5IHRpbWUgYWxvbmVcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJ3Bpbm5lZDEnLCBpc1Bpbm5lZDogdHJ1ZSwgc3RhcnRUaW1lOiBub3cgLSA0ICogT05FX0RBWSB9KSxcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJ3Bpbm5lZDInLCBpc1Bpbm5lZDogdHJ1ZSwgc3RhcnRUaW1lOiBub3cgLSA1ICogT05FX0RBWSB9KSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IGZpbHRlciA9IGNyZWF0ZU1vY2tGaWx0ZXIoe1xuXHRcdFx0XHRncm91cEJ5OiBBZ2VudFNlc3Npb25zR3JvdXBpbmcuQ2FwcGVkLFxuXHRcdFx0XHRleGNsdWRlUmVhZDogZmFsc2Vcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3Qgc29ydGVyID0gY3JlYXRlTW9ja1NvcnRlcigpO1xuXHRcdFx0Y29uc3QgZGF0YVNvdXJjZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXNzaW9uc0RhdGFTb3VyY2UoZmlsdGVyLCBzb3J0ZXIpKTtcblxuXHRcdFx0Y29uc3QgbW9ja01vZGVsID0gY3JlYXRlTW9ja01vZGVsKHNlc3Npb25zKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IEFycmF5LmZyb20oZGF0YVNvdXJjZS5nZXRDaGlsZHJlbihtb2NrTW9kZWwpKTtcblx0XHRcdGNvbnN0IHNlY3Rpb25zID0gZ2V0U2VjdGlvbnNGcm9tUmVzdWx0KHJlc3VsdCk7XG5cdFx0XHRjb25zdCB0b3BTZXNzaW9ucyA9IHJlc3VsdC5maWx0ZXIoKHIpOiByIGlzIElBZ2VudFNlc3Npb24gPT4gIWlzQWdlbnRTZXNzaW9uU2VjdGlvbihyKSk7XG5cblx0XHRcdC8vIFBpbm5lZCBzZXNzaW9ucyBmaXJzdCwgdGhlbiB1cCB0byAzIG5vbi1waW5uZWQgc2Vzc2lvbnNcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9wU2Vzc2lvbnMubWFwKHMgPT4gcy5sYWJlbCksIFtcblx0XHRcdFx0J1Nlc3Npb24gcGlubmVkMScsXG5cdFx0XHRcdCdTZXNzaW9uIHBpbm5lZDInLFxuXHRcdFx0XHQnU2Vzc2lvbiBzMScsXG5cdFx0XHRcdCdTZXNzaW9uIHMyJyxcblx0XHRcdFx0J1Nlc3Npb24gczMnLFxuXHRcdFx0XSk7XG5cblx0XHRcdC8vIE9ubHkgdW5waW5uZWQgb3ZlcmZsb3cgZ29lcyB0byBNb3JlXG5cdFx0XHRjb25zdCBtb3JlU2VjdGlvbiA9IHNlY3Rpb25zLmZpbmQocyA9PiBzLnNlY3Rpb24gPT09IEFnZW50U2Vzc2lvblNlY3Rpb24uTW9yZSk7XG5cdFx0XHRhc3NlcnQub2sobW9yZVNlY3Rpb24pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb3JlU2VjdGlvbi5zZXNzaW9ucy5tYXAocyA9PiBzLmxhYmVsKSwgW1xuXHRcdFx0XHQnU2Vzc2lvbiBzNCcsXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21vcmUgcGlubmVkIHNlc3Npb25zIHRoYW4gY2FwIGxpbWl0IGFyZSBhbGwgc2hvd24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBbXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICdwaW5uZWQxJywgaXNQaW5uZWQ6IHRydWUsIHN0YXJ0VGltZTogbm93IH0pLFxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAncGlubmVkMicsIGlzUGlubmVkOiB0cnVlLCBzdGFydFRpbWU6IG5vdyAtIE9ORV9EQVkgfSksXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICdwaW5uZWQzJywgaXNQaW5uZWQ6IHRydWUsIHN0YXJ0VGltZTogbm93IC0gMiAqIE9ORV9EQVkgfSksXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICdwaW5uZWQ0JywgaXNQaW5uZWQ6IHRydWUsIHN0YXJ0VGltZTogbm93IC0gMyAqIE9ORV9EQVkgfSksXG5cdFx0XHRcdC8vIFVucGlubmVkIHNlc3Npb24gXHUyMDE0IHN0aWxsIGZpdHMgd2l0aGluIHRoZSBjYXAgb2YgMyBub24tcGlubmVkXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICd1bnBpbm5lZDEnLCBzdGFydFRpbWU6IG5vdyAtIDQgKiBPTkVfREFZIH0pLFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgZmlsdGVyID0gY3JlYXRlTW9ja0ZpbHRlcih7XG5cdFx0XHRcdGdyb3VwQnk6IEFnZW50U2Vzc2lvbnNHcm91cGluZy5DYXBwZWQsXG5cdFx0XHRcdGV4Y2x1ZGVSZWFkOiBmYWxzZVxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBzb3J0ZXIgPSBjcmVhdGVNb2NrU29ydGVyKCk7XG5cdFx0XHRjb25zdCBkYXRhU291cmNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlc3Npb25zRGF0YVNvdXJjZShmaWx0ZXIsIHNvcnRlcikpO1xuXG5cdFx0XHRjb25zdCBtb2NrTW9kZWwgPSBjcmVhdGVNb2NrTW9kZWwoc2Vzc2lvbnMpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gQXJyYXkuZnJvbShkYXRhU291cmNlLmdldENoaWxkcmVuKG1vY2tNb2RlbCkpO1xuXHRcdFx0Y29uc3Qgc2VjdGlvbnMgPSBnZXRTZWN0aW9uc0Zyb21SZXN1bHQocmVzdWx0KTtcblx0XHRcdGNvbnN0IHRvcFNlc3Npb25zID0gcmVzdWx0LmZpbHRlcigocik6IHIgaXMgSUFnZW50U2Vzc2lvbiA9PiAhaXNBZ2VudFNlc3Npb25TZWN0aW9uKHIpKTtcblxuXHRcdFx0Ly8gQWxsIDQgcGlubmVkICsgMSB1bnBpbm5lZCAoZml0cyB3aXRoaW4gY2FwIG9mIDMgbm9uLXBpbm5lZClcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9wU2Vzc2lvbnMubWFwKHMgPT4gcy5sYWJlbCksIFtcblx0XHRcdFx0J1Nlc3Npb24gcGlubmVkMScsXG5cdFx0XHRcdCdTZXNzaW9uIHBpbm5lZDInLFxuXHRcdFx0XHQnU2Vzc2lvbiBwaW5uZWQzJyxcblx0XHRcdFx0J1Nlc3Npb24gcGlubmVkNCcsXG5cdFx0XHRcdCdTZXNzaW9uIHVucGlubmVkMScsXG5cdFx0XHRdKTtcblxuXHRcdFx0Ly8gTm8gTW9yZSBzZWN0aW9uIG5lZWRlZCBzaW5jZSB1bnBpbm5lZCBjb3VudCAoMSkgaXMgd2l0aGluIGNhcCAoMylcblx0XHRcdGNvbnN0IG1vcmVTZWN0aW9uID0gc2VjdGlvbnMuZmluZChzID0+IHMuc2VjdGlvbiA9PT0gQWdlbnRTZXNzaW9uU2VjdGlvbi5Nb3JlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb3JlU2VjdGlvbiwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VucGlubmVkIE5lZWRzSW5wdXQgc2Vzc2lvbiBhcHBlYXJzIGluIHRoZSBub24tcGlubmVkIHNlY3Rpb24gYmVsb3cgcGlubmVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gW1xuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnbmVlZHMtaW5wdXQnLCBzdGF0dXM6IENoYXRTZXNzaW9uU3RhdHVzLk5lZWRzSW5wdXQsIHN0YXJ0VGltZTogbm93IH0pLFxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAncGlubmVkMScsIGlzUGlubmVkOiB0cnVlLCBzdGFydFRpbWU6IG5vdyB9KSxcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJ3Bpbm5lZDInLCBpc1Bpbm5lZDogdHJ1ZSwgc3RhcnRUaW1lOiBub3cgLSBPTkVfREFZIH0pLFxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAncGlubmVkMycsIGlzUGlubmVkOiB0cnVlLCBzdGFydFRpbWU6IG5vdyAtIDIgKiBPTkVfREFZIH0pLFxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnczEnLCBzdGFydFRpbWU6IG5vdyB9KSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IGZpbHRlciA9IGNyZWF0ZU1vY2tGaWx0ZXIoe1xuXHRcdFx0XHRncm91cEJ5OiBBZ2VudFNlc3Npb25zR3JvdXBpbmcuQ2FwcGVkLFxuXHRcdFx0XHRleGNsdWRlUmVhZDogZmFsc2Vcblx0XHRcdH0pO1xuXHRcdFx0Ly8gVXNlIHJlYWwgc29ydGVyIHRvIGV4ZXJjaXNlIE5lZWRzSW5wdXQgcHJpb3JpdGl6YXRpb24gaW4gY2FwcGVkIG1vZGVcblx0XHRcdGNvbnN0IHNvcnRlciA9IG5ldyBBZ2VudFNlc3Npb25zU29ydGVyKCk7XG5cdFx0XHRjb25zdCBkYXRhU291cmNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlc3Npb25zRGF0YVNvdXJjZShmaWx0ZXIsIHNvcnRlcikpO1xuXG5cdFx0XHRjb25zdCBtb2NrTW9kZWwgPSBjcmVhdGVNb2NrTW9kZWwoc2Vzc2lvbnMpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gQXJyYXkuZnJvbShkYXRhU291cmNlLmdldENoaWxkcmVuKG1vY2tNb2RlbCkpO1xuXHRcdFx0Y29uc3Qgc2VjdGlvbnMgPSBnZXRTZWN0aW9uc0Zyb21SZXN1bHQocmVzdWx0KTtcblx0XHRcdGNvbnN0IHRvcFNlc3Npb25zID0gcmVzdWx0LmZpbHRlcigocik6IHIgaXMgSUFnZW50U2Vzc2lvbiA9PiAhaXNBZ2VudFNlc3Npb25TZWN0aW9uKHIpKTtcblxuXHRcdFx0Ly8gUGlubmVkIHNlc3Npb25zIGNvbWUgZmlyc3QsIHRoZW4gdXAgdG8gMyBub24tcGlubmVkIChOZWVkc0lucHV0ICsgczEgYm90aCBmaXQgaW4gY2FwKVxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b3BTZXNzaW9ucy5tYXAocyA9PiBzLmxhYmVsKSwgW1xuXHRcdFx0XHQnU2Vzc2lvbiBwaW5uZWQxJyxcblx0XHRcdFx0J1Nlc3Npb24gcGlubmVkMicsXG5cdFx0XHRcdCdTZXNzaW9uIHBpbm5lZDMnLFxuXHRcdFx0XHQnU2Vzc2lvbiBuZWVkcy1pbnB1dCcsXG5cdFx0XHRcdCdTZXNzaW9uIHMxJyxcblx0XHRcdF0pO1xuXG5cdFx0XHQvLyBBbGwgbm9uLXBpbm5lZCBmaXQgd2l0aGluIGNhcCBvZiAzLCBzbyBubyBNb3JlIHNlY3Rpb25cblx0XHRcdGNvbnN0IG1vcmVTZWN0aW9uID0gc2VjdGlvbnMuZmluZChzID0+IHMuc2VjdGlvbiA9PT0gQWdlbnRTZXNzaW9uU2VjdGlvbi5Nb3JlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb3JlU2VjdGlvbiwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2dyb3VwU2Vzc2lvbnNCeVJlcG9zaXRvcnknLCAoKSA9PiB7XG5cblx0XHRmdW5jdGlvbiBzb3J0ZWRHcm91cHMocmVzdWx0OiBJQWdlbnRTZXNzaW9uU2VjdGlvbltdKSB7XG5cdFx0XHRyZXR1cm4gcmVzdWx0XG5cdFx0XHRcdC5tYXAocyA9PiAoeyBsYWJlbDogcy5sYWJlbCwgY291bnQ6IHMuc2Vzc2lvbnMubGVuZ3RoIH0pKVxuXHRcdFx0XHQuc29ydCgoYSwgYikgPT4gYS5sYWJlbC5sb2NhbGVDb21wYXJlKGIubGFiZWwpKTtcblx0XHR9XG5cblx0XHR0ZXN0KCdncm91cHMgc2Vzc2lvbnMgYnkgbWV0YWRhdGEub3duZXIgKyBtZXRhZGF0YS5uYW1lIChjbG91ZCBzZXNzaW9ucyknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBbXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICcxJywgc3RhcnRUaW1lOiBub3csIG1ldGFkYXRhOiB7IG93bmVyOiAnbWljcm9zb2Z0JywgbmFtZTogJ3ZzY29kZScgfSB9KSxcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzInLCBzdGFydFRpbWU6IG5vdyAtIDEsIG1ldGFkYXRhOiB7IG93bmVyOiAnbWljcm9zb2Z0JywgbmFtZTogJ3ZzY29kZScgfSB9KSxcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzMnLCBzdGFydFRpbWU6IG5vdyAtIDIsIG1ldGFkYXRhOiB7IG93bmVyOiAnbWljcm9zb2Z0JywgbmFtZTogJ3R5cGVzY3JpcHQnIH0gfSksXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBjcmVhdGVNb2NrRmlsdGVyKHsgZ3JvdXBCeTogQWdlbnRTZXNzaW9uc0dyb3VwaW5nLlJlcG9zaXRvcnkgfSk7XG5cdFx0XHRjb25zdCBkYXRhU291cmNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlc3Npb25zRGF0YVNvdXJjZShmaWx0ZXIsIGNyZWF0ZU1vY2tTb3J0ZXIoKSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0U2VjdGlvbnNGcm9tUmVzdWx0KGRhdGFTb3VyY2UuZ2V0Q2hpbGRyZW4oY3JlYXRlTW9ja01vZGVsKHNlc3Npb25zKSkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNvcnRlZEdyb3VwcyhyZXN1bHQpLCBbXG5cdFx0XHRcdHsgbGFiZWw6ICd0eXBlc2NyaXB0JywgY291bnQ6IDEgfSxcblx0XHRcdFx0eyBsYWJlbDogJ3ZzY29kZScsIGNvdW50OiAyIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dyb3VwcyBzZXNzaW9ucyBieSBtZXRhZGF0YS5yZXBvc2l0b3J5TndvJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBbXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICcxJywgbWV0YWRhdGE6IHsgcmVwb3NpdG9yeU53bzogJ21pY3Jvc29mdC92c2NvZGUnIH0gfSksXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICcyJywgbWV0YWRhdGE6IHsgcmVwb3NpdG9yeU53bzogJ21pY3Jvc29mdC92c2NvZGUnIH0gfSksXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBjcmVhdGVNb2NrRmlsdGVyKHsgZ3JvdXBCeTogQWdlbnRTZXNzaW9uc0dyb3VwaW5nLlJlcG9zaXRvcnkgfSk7XG5cdFx0XHRjb25zdCBkYXRhU291cmNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlc3Npb25zRGF0YVNvdXJjZShmaWx0ZXIsIGNyZWF0ZU1vY2tTb3J0ZXIoKSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0U2VjdGlvbnNGcm9tUmVzdWx0KGRhdGFTb3VyY2UuZ2V0Q2hpbGRyZW4oY3JlYXRlTW9ja01vZGVsKHNlc3Npb25zKSkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNvcnRlZEdyb3VwcyhyZXN1bHQpLCBbXG5cdFx0XHRcdHsgbGFiZWw6ICd2c2NvZGUnLCBjb3VudDogMiB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdncm91cHMgc2Vzc2lvbnMgYnkgbWV0YWRhdGEucmVwb3NpdG9yeSAobndvIGZvcm1hdCknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IFtcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzEnLCBtZXRhZGF0YTogeyByZXBvc2l0b3J5OiAnbWljcm9zb2Z0L3ZzY29kZScgfSB9KSxcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzInLCBtZXRhZGF0YTogeyByZXBvc2l0b3J5OiAnbWljcm9zb2Z0L3ZzY29kZScgfSB9KSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IGZpbHRlciA9IGNyZWF0ZU1vY2tGaWx0ZXIoeyBncm91cEJ5OiBBZ2VudFNlc3Npb25zR3JvdXBpbmcuUmVwb3NpdG9yeSB9KTtcblx0XHRcdGNvbnN0IGRhdGFTb3VyY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2Vzc2lvbnNEYXRhU291cmNlKGZpbHRlciwgY3JlYXRlTW9ja1NvcnRlcigpKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBnZXRTZWN0aW9uc0Zyb21SZXN1bHQoZGF0YVNvdXJjZS5nZXRDaGlsZHJlbihjcmVhdGVNb2NrTW9kZWwoc2Vzc2lvbnMpKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc29ydGVkR3JvdXBzKHJlc3VsdCksIFtcblx0XHRcdFx0eyBsYWJlbDogJ3ZzY29kZScsIGNvdW50OiAyIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dyb3VwcyBzZXNzaW9ucyBieSBtZXRhZGF0YS5yZXBvc2l0b3J5IChVUkwgZm9ybWF0KScsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gW1xuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnMScsIG1ldGFkYXRhOiB7IHJlcG9zaXRvcnk6ICdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZScgfSB9KSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IGZpbHRlciA9IGNyZWF0ZU1vY2tGaWx0ZXIoeyBncm91cEJ5OiBBZ2VudFNlc3Npb25zR3JvdXBpbmcuUmVwb3NpdG9yeSB9KTtcblx0XHRcdGNvbnN0IGRhdGFTb3VyY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2Vzc2lvbnNEYXRhU291cmNlKGZpbHRlciwgY3JlYXRlTW9ja1NvcnRlcigpKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBnZXRTZWN0aW9uc0Zyb21SZXN1bHQoZGF0YVNvdXJjZS5nZXRDaGlsZHJlbihjcmVhdGVNb2NrTW9kZWwoc2Vzc2lvbnMpKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc29ydGVkR3JvdXBzKHJlc3VsdCksIFtcblx0XHRcdFx0eyBsYWJlbDogJ3ZzY29kZScsIGNvdW50OiAxIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N0cmlwcyAuZ2l0IHN1ZmZpeCBmcm9tIHJlcG9zaXRvcnkgVVJMcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gW1xuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnMScsIG1ldGFkYXRhOiB7IHJlcG9zaXRvcnk6ICdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS5naXQnIH0gfSksXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICcyJywgbWV0YWRhdGE6IHsgcmVwb3NpdG9yeVVybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlLmdpdCcgfSB9KSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IGZpbHRlciA9IGNyZWF0ZU1vY2tGaWx0ZXIoeyBncm91cEJ5OiBBZ2VudFNlc3Npb25zR3JvdXBpbmcuUmVwb3NpdG9yeSB9KTtcblx0XHRcdGNvbnN0IGRhdGFTb3VyY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2Vzc2lvbnNEYXRhU291cmNlKGZpbHRlciwgY3JlYXRlTW9ja1NvcnRlcigpKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBnZXRTZWN0aW9uc0Zyb21SZXN1bHQoZGF0YVNvdXJjZS5nZXRDaGlsZHJlbihjcmVhdGVNb2NrTW9kZWwoc2Vzc2lvbnMpKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc29ydGVkR3JvdXBzKHJlc3VsdCksIFtcblx0XHRcdFx0eyBsYWJlbDogJ3ZzY29kZScsIGNvdW50OiAyIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgZ2l0QCBTU0ggVVJMcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gW1xuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnMScsIG1ldGFkYXRhOiB7IHJlcG9zaXRvcnk6ICdnaXRAZ2l0aHViLmNvbTptaWNyb3NvZnQvdnNjb2RlLmdpdCcgfSB9KSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IGZpbHRlciA9IGNyZWF0ZU1vY2tGaWx0ZXIoeyBncm91cEJ5OiBBZ2VudFNlc3Npb25zR3JvdXBpbmcuUmVwb3NpdG9yeSB9KTtcblx0XHRcdGNvbnN0IGRhdGFTb3VyY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2Vzc2lvbnNEYXRhU291cmNlKGZpbHRlciwgY3JlYXRlTW9ja1NvcnRlcigpKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBnZXRTZWN0aW9uc0Zyb21SZXN1bHQoZGF0YVNvdXJjZS5nZXRDaGlsZHJlbihjcmVhdGVNb2NrTW9kZWwoc2Vzc2lvbnMpKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc29ydGVkR3JvdXBzKHJlc3VsdCksIFtcblx0XHRcdFx0eyBsYWJlbDogJ3ZzY29kZScsIGNvdW50OiAxIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dyb3VwcyBzZXNzaW9ucyBieSBtZXRhZGF0YS5yZXBvc2l0b3J5VXJsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBbXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICcxJywgbWV0YWRhdGE6IHsgcmVwb3NpdG9yeVVybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlJyB9IH0pLFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgZmlsdGVyID0gY3JlYXRlTW9ja0ZpbHRlcih7IGdyb3VwQnk6IEFnZW50U2Vzc2lvbnNHcm91cGluZy5SZXBvc2l0b3J5IH0pO1xuXHRcdFx0Y29uc3QgZGF0YVNvdXJjZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXNzaW9uc0RhdGFTb3VyY2UoZmlsdGVyLCBjcmVhdGVNb2NrU29ydGVyKCkpKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGdldFNlY3Rpb25zRnJvbVJlc3VsdChkYXRhU291cmNlLmdldENoaWxkcmVuKGNyZWF0ZU1vY2tNb2RlbChzZXNzaW9ucykpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzb3J0ZWRHcm91cHMocmVzdWx0KSwgW1xuXHRcdFx0XHR7IGxhYmVsOiAndnNjb2RlJywgY291bnQ6IDEgfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ3JvdXBzIHNlc3Npb25zIGJ5IG1ldGFkYXRhLnJlcG9zaXRvcnlQYXRoIChiYXNlbmFtZSknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IFtcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzEnLCBtZXRhZGF0YTogeyByZXBvc2l0b3J5UGF0aDogJy9Vc2Vycy91c2VyL1Byb2plY3RzL3ZzY29kZScgfSB9KSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IGZpbHRlciA9IGNyZWF0ZU1vY2tGaWx0ZXIoeyBncm91cEJ5OiBBZ2VudFNlc3Npb25zR3JvdXBpbmcuUmVwb3NpdG9yeSB9KTtcblx0XHRcdGNvbnN0IGRhdGFTb3VyY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2Vzc2lvbnNEYXRhU291cmNlKGZpbHRlciwgY3JlYXRlTW9ja1NvcnRlcigpKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBnZXRTZWN0aW9uc0Zyb21SZXN1bHQoZGF0YVNvdXJjZS5nZXRDaGlsZHJlbihjcmVhdGVNb2NrTW9kZWwoc2Vzc2lvbnMpKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc29ydGVkR3JvdXBzKHJlc3VsdCksIFtcblx0XHRcdFx0eyBsYWJlbDogJ3ZzY29kZScsIGNvdW50OiAxIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dyb3VwcyBzZXNzaW9ucyBieSBtZXRhZGF0YS53b3JrdHJlZVBhdGgnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IFtcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzEnLCBtZXRhZGF0YTogeyB3b3JrdHJlZVBhdGg6ICcvVXNlcnMvdXNlci9Qcm9qZWN0cy92c2NvZGUud29ya3RyZWVzL215LWJyYW5jaCcgfSB9KSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IGZpbHRlciA9IGNyZWF0ZU1vY2tGaWx0ZXIoeyBncm91cEJ5OiBBZ2VudFNlc3Npb25zR3JvdXBpbmcuUmVwb3NpdG9yeSB9KTtcblx0XHRcdGNvbnN0IGRhdGFTb3VyY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2Vzc2lvbnNEYXRhU291cmNlKGZpbHRlciwgY3JlYXRlTW9ja1NvcnRlcigpKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBnZXRTZWN0aW9uc0Zyb21SZXN1bHQoZGF0YVNvdXJjZS5nZXRDaGlsZHJlbihjcmVhdGVNb2NrTW9kZWwoc2Vzc2lvbnMpKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc29ydGVkR3JvdXBzKHJlc3VsdCksIFtcblx0XHRcdFx0eyBsYWJlbDogJ3ZzY29kZScsIGNvdW50OiAxIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dyb3VwcyBzZXNzaW9ucyBieSBtZXRhZGF0YS53b3JraW5nRGlyZWN0b3J5UGF0aCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gW1xuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnMScsIG1ldGFkYXRhOiB7IHdvcmtpbmdEaXJlY3RvcnlQYXRoOiAnL1VzZXJzL3VzZXIvUHJvamVjdHMvdnNjb2RlJyB9IH0pLFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgZmlsdGVyID0gY3JlYXRlTW9ja0ZpbHRlcih7IGdyb3VwQnk6IEFnZW50U2Vzc2lvbnNHcm91cGluZy5SZXBvc2l0b3J5IH0pO1xuXHRcdFx0Y29uc3QgZGF0YVNvdXJjZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXNzaW9uc0RhdGFTb3VyY2UoZmlsdGVyLCBjcmVhdGVNb2NrU29ydGVyKCkpKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGdldFNlY3Rpb25zRnJvbVJlc3VsdChkYXRhU291cmNlLmdldENoaWxkcmVuKGNyZWF0ZU1vY2tNb2RlbChzZXNzaW9ucykpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzb3J0ZWRHcm91cHMocmVzdWx0KSwgW1xuXHRcdFx0XHR7IGxhYmVsOiAndnNjb2RlJywgY291bnQ6IDEgfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVzb2x2ZXMgd29ya3RyZWUgcGF0aHMgdG8gcGFyZW50IHJlcG8gbmFtZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gW1xuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnMScsIG1ldGFkYXRhOiB7IHdvcmtpbmdEaXJlY3RvcnlQYXRoOiAnL1VzZXJzL3VzZXIvUHJvamVjdHMvdnNjb2RlLndvcmt0cmVlcy9jb3BpbG90LWJyYW5jaCcgfSB9KSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IGZpbHRlciA9IGNyZWF0ZU1vY2tGaWx0ZXIoeyBncm91cEJ5OiBBZ2VudFNlc3Npb25zR3JvdXBpbmcuUmVwb3NpdG9yeSB9KTtcblx0XHRcdGNvbnN0IGRhdGFTb3VyY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2Vzc2lvbnNEYXRhU291cmNlKGZpbHRlciwgY3JlYXRlTW9ja1NvcnRlcigpKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBnZXRTZWN0aW9uc0Zyb21SZXN1bHQoZGF0YVNvdXJjZS5nZXRDaGlsZHJlbihjcmVhdGVNb2NrTW9kZWwoc2Vzc2lvbnMpKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc29ydGVkR3JvdXBzKHJlc3VsdCksIFtcblx0XHRcdFx0eyBsYWJlbDogJ3ZzY29kZScsIGNvdW50OiAxIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dyb3VwcyBzZXNzaW9ucyBieSBiYWRnZSB3aXRoICQocmVwbykgcHJlZml4JywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBbXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICcxJywgYmFkZ2U6ICckKHJlcG8pIHZzY29kZScgfSksXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICcyJywgYmFkZ2U6ICckKHJlcG8pIHZzY29kZScgfSksXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBjcmVhdGVNb2NrRmlsdGVyKHsgZ3JvdXBCeTogQWdlbnRTZXNzaW9uc0dyb3VwaW5nLlJlcG9zaXRvcnkgfSk7XG5cdFx0XHRjb25zdCBkYXRhU291cmNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlc3Npb25zRGF0YVNvdXJjZShmaWx0ZXIsIGNyZWF0ZU1vY2tTb3J0ZXIoKSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0U2VjdGlvbnNGcm9tUmVzdWx0KGRhdGFTb3VyY2UuZ2V0Q2hpbGRyZW4oY3JlYXRlTW9ja01vZGVsKHNlc3Npb25zKSkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNvcnRlZEdyb3VwcyhyZXN1bHQpLCBbXG5cdFx0XHRcdHsgbGFiZWw6ICd2c2NvZGUnLCBjb3VudDogMiB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdncm91cHMgc2Vzc2lvbnMgYnkgYmFkZ2Ugd2l0aCAkKGZvbGRlcikgcHJlZml4JywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBbXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICcxJywgYmFkZ2U6ICckKGZvbGRlcikgbXktcHJvamVjdCcgfSksXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBjcmVhdGVNb2NrRmlsdGVyKHsgZ3JvdXBCeTogQWdlbnRTZXNzaW9uc0dyb3VwaW5nLlJlcG9zaXRvcnkgfSk7XG5cdFx0XHRjb25zdCBkYXRhU291cmNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlc3Npb25zRGF0YVNvdXJjZShmaWx0ZXIsIGNyZWF0ZU1vY2tTb3J0ZXIoKSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0U2VjdGlvbnNGcm9tUmVzdWx0KGRhdGFTb3VyY2UuZ2V0Q2hpbGRyZW4oY3JlYXRlTW9ja01vZGVsKHNlc3Npb25zKSkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNvcnRlZEdyb3VwcyhyZXN1bHQpLCBbXG5cdFx0XHRcdHsgbGFiZWw6ICdteS1wcm9qZWN0JywgY291bnQ6IDEgfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2xvdWQgYW5kIGxvY2FsIHNlc3Npb25zIGZvciBzYW1lIHJlcG8gbWVyZ2UgaW50byBvbmUgZ3JvdXAnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IFtcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzEnLCBtZXRhZGF0YTogeyBvd25lcjogJ21pY3Jvc29mdCcsIG5hbWU6ICd2c2NvZGUnIH0gfSksXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICcyJywgbWV0YWRhdGE6IHsgcmVwb3NpdG9yeVBhdGg6ICcvVXNlcnMvdXNlci9Qcm9qZWN0cy92c2NvZGUnIH0gfSksXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICczJywgYmFkZ2U6ICckKHJlcG8pIHZzY29kZScgfSksXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBjcmVhdGVNb2NrRmlsdGVyKHsgZ3JvdXBCeTogQWdlbnRTZXNzaW9uc0dyb3VwaW5nLlJlcG9zaXRvcnkgfSk7XG5cdFx0XHRjb25zdCBkYXRhU291cmNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlc3Npb25zRGF0YVNvdXJjZShmaWx0ZXIsIGNyZWF0ZU1vY2tTb3J0ZXIoKSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0U2VjdGlvbnNGcm9tUmVzdWx0KGRhdGFTb3VyY2UuZ2V0Q2hpbGRyZW4oY3JlYXRlTW9ja01vZGVsKHNlc3Npb25zKSkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNvcnRlZEdyb3VwcyhyZXN1bHQpLCBbXG5cdFx0XHRcdHsgbGFiZWw6ICd2c2NvZGUnLCBjb3VudDogMyB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZXNzaW9ucyB3aXRob3V0IGFueSByZXBvIGluZm8gZ28gdG8gT3RoZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IFtcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzEnLCBtZXRhZGF0YTogeyBpc29sYXRpb25Nb2RlOiAnd29ya3NwYWNlJyB9IH0pLFxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnMicgfSksXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBjcmVhdGVNb2NrRmlsdGVyKHsgZ3JvdXBCeTogQWdlbnRTZXNzaW9uc0dyb3VwaW5nLlJlcG9zaXRvcnkgfSk7XG5cdFx0XHRjb25zdCBkYXRhU291cmNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlc3Npb25zRGF0YVNvdXJjZShmaWx0ZXIsIGNyZWF0ZU1vY2tTb3J0ZXIoKSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0U2VjdGlvbnNGcm9tUmVzdWx0KGRhdGFTb3VyY2UuZ2V0Q2hpbGRyZW4oY3JlYXRlTW9ja01vZGVsKHNlc3Npb25zKSkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNvcnRlZEdyb3VwcyhyZXN1bHQpLCBbXG5cdFx0XHRcdHsgbGFiZWw6ICdPdGhlcicsIGNvdW50OiAyIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlcG8gbmFtZWQgXCJvdGhlclwiIGRvZXMgbm90IGNvbGxpZGUgd2l0aCB0aGUgT3RoZXIgZmFsbGJhY2sgZ3JvdXAnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBbXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICcxJywgc3RhcnRUaW1lOiBub3csIG1ldGFkYXRhOiB7IHJlcG9zaXRvcnlQYXRoOiAnL3BhdGgvb3RoZXInIH0gfSksXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICcyJywgc3RhcnRUaW1lOiBub3cgLSAxIH0pLFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgZmlsdGVyID0gY3JlYXRlTW9ja0ZpbHRlcih7IGdyb3VwQnk6IEFnZW50U2Vzc2lvbnNHcm91cGluZy5SZXBvc2l0b3J5IH0pO1xuXHRcdFx0Y29uc3QgZGF0YVNvdXJjZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXNzaW9uc0RhdGFTb3VyY2UoZmlsdGVyLCBjcmVhdGVNb2NrU29ydGVyKCkpKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGdldFNlY3Rpb25zRnJvbVJlc3VsdChkYXRhU291cmNlLmdldENoaWxkcmVuKGNyZWF0ZU1vY2tNb2RlbChzZXNzaW9ucykpKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDIsICdzaG91bGQgaGF2ZSAyIHNlcGFyYXRlIGdyb3VwcycpO1xuXHRcdFx0Y29uc3QgbGFiZWxzID0gcmVzdWx0Lm1hcChzID0+IHMubGFiZWwpO1xuXHRcdFx0YXNzZXJ0Lm9rKGxhYmVscy5pbmNsdWRlcygnb3RoZXInKSwgJ3Nob3VsZCBoYXZlIGEgZ3JvdXAgZm9yIHJlcG8gbmFtZWQgXCJvdGhlclwiJyk7XG5cdFx0XHRhc3NlcnQub2sobGFiZWxzLmluY2x1ZGVzKCdPdGhlcicpLCAnc2hvdWxkIGhhdmUgdGhlIGZhbGxiYWNrIFwiT3RoZXJcIiBncm91cCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5maW5kKHMgPT4gcy5sYWJlbCA9PT0gJ290aGVyJykhLnNlc3Npb25zLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmZpbmQocyA9PiBzLmxhYmVsID09PSAnT3RoZXInKSEuc2Vzc2lvbnMubGVuZ3RoLCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FyY2hpdmVkIHNlc3Npb25zIGdvIHRvIEFyY2hpdmVkIHNlY3Rpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IFtcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzEnLCBtZXRhZGF0YTogeyByZXBvc2l0b3J5UGF0aDogJy9wYXRoL3ZzY29kZScgfSB9KSxcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzInLCBpc0FyY2hpdmVkOiB0cnVlLCBtZXRhZGF0YTogeyByZXBvc2l0b3J5UGF0aDogJy9wYXRoL3ZzY29kZScgfSB9KSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IGZpbHRlciA9IGNyZWF0ZU1vY2tGaWx0ZXIoeyBncm91cEJ5OiBBZ2VudFNlc3Npb25zR3JvdXBpbmcuUmVwb3NpdG9yeSB9KTtcblx0XHRcdGNvbnN0IGRhdGFTb3VyY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2Vzc2lvbnNEYXRhU291cmNlKGZpbHRlciwgY3JlYXRlTW9ja1NvcnRlcigpKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBnZXRTZWN0aW9uc0Zyb21SZXN1bHQoZGF0YVNvdXJjZS5nZXRDaGlsZHJlbihjcmVhdGVNb2NrTW9kZWwoc2Vzc2lvbnMpKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1hcChzID0+ICh7IGxhYmVsOiBzLmxhYmVsLCBzZWN0aW9uOiBzLnNlY3Rpb24sIGNvdW50OiBzLnNlc3Npb25zLmxlbmd0aCB9KSksIFtcblx0XHRcdFx0eyBsYWJlbDogJ3ZzY29kZScsIHNlY3Rpb246IEFnZW50U2Vzc2lvblNlY3Rpb24uUmVwb3NpdG9yeSwgY291bnQ6IDEgfSxcblx0XHRcdFx0eyBsYWJlbDogJ0FyY2hpdmVkJywgc2VjdGlvbjogQWdlbnRTZXNzaW9uU2VjdGlvbi5BcmNoaXZlZCwgY291bnQ6IDEgfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWV0YWRhdGEgZXh0cmFjdGlvbiBwcmlvcml0eTogb3duZXIrbmFtZSA+IHJlcG9zaXRvcnlOd28gPiByZXBvc2l0b3J5ID4gcmVwb3NpdG9yeVVybCA+IHJlcG9zaXRvcnlQYXRoID4gd29ya2luZ0RpcmVjdG9yeVBhdGggPiBiYWRnZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGZpbHRlciA9IGNyZWF0ZU1vY2tGaWx0ZXIoeyBncm91cEJ5OiBBZ2VudFNlc3Npb25zR3JvdXBpbmcuUmVwb3NpdG9yeSB9KTtcblxuXHRcdFx0Ly8gb3duZXIrbmFtZSB0YWtlcyBwcmlvcml0eSBvdmVyIHJlcG9zaXRvcnlOd29cblx0XHRcdGNvbnN0IGRzMSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXNzaW9uc0RhdGFTb3VyY2UoZmlsdGVyLCBjcmVhdGVNb2NrU29ydGVyKCkpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRTZWN0aW9uc0Zyb21SZXN1bHQoZHMxLmdldENoaWxkcmVuKGNyZWF0ZU1vY2tNb2RlbChbXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICcxJywgbWV0YWRhdGE6IHsgb3duZXI6ICdvcmcnLCBuYW1lOiAnZnJvbU93bmVyJywgcmVwb3NpdG9yeU53bzogJ29yZy9mcm9tTndvJyB9IH0pLFxuXHRcdFx0XSkpKVswXS5sYWJlbCwgJ2Zyb21Pd25lcicpO1xuXG5cdFx0XHQvLyByZXBvc2l0b3J5TndvIHRha2VzIHByaW9yaXR5IG92ZXIgcmVwb3NpdG9yeVxuXHRcdFx0Y29uc3QgZHMyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlc3Npb25zRGF0YVNvdXJjZShmaWx0ZXIsIGNyZWF0ZU1vY2tTb3J0ZXIoKSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFNlY3Rpb25zRnJvbVJlc3VsdChkczIuZ2V0Q2hpbGRyZW4oY3JlYXRlTW9ja01vZGVsKFtcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzInLCBtZXRhZGF0YTogeyByZXBvc2l0b3J5TndvOiAnb3JnL2Zyb21Od28nLCByZXBvc2l0b3J5OiAnb3JnL2Zyb21SZXBvJyB9IH0pLFxuXHRcdFx0XSkpKVswXS5sYWJlbCwgJ2Zyb21Od28nKTtcblxuXHRcdFx0Ly8gYmFkZ2UgaXMgdXNlZCB3aGVuIG5vIG1ldGFkYXRhIGZpZWxkcyBtYXRjaFxuXHRcdFx0Y29uc3QgZHMzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlc3Npb25zRGF0YVNvdXJjZShmaWx0ZXIsIGNyZWF0ZU1vY2tTb3J0ZXIoKSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFNlY3Rpb25zRnJvbVJlc3VsdChkczMuZ2V0Q2hpbGRyZW4oY3JlYXRlTW9ja01vZGVsKFtcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzMnLCBtZXRhZGF0YTogeyBpc29sYXRpb25Nb2RlOiAnd29ya3NwYWNlJyB9LCBiYWRnZTogJyQocmVwbykgZnJvbUJhZGdlJyB9KSxcblx0XHRcdF0pKSlbMF0ubGFiZWwsICdmcm9tQmFkZ2UnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2VtcHR5IHN0cmluZyBtZXRhZGF0YSB2YWx1ZXMgYXJlIHRyZWF0ZWQgYXMgbWlzc2luZycsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gW1xuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnMScsIG1ldGFkYXRhOiB7IHJlcG9zaXRvcnlOd286ICcnLCByZXBvc2l0b3J5UGF0aDogJy9wYXRoL3ZzY29kZScgfSB9KSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IGZpbHRlciA9IGNyZWF0ZU1vY2tGaWx0ZXIoeyBncm91cEJ5OiBBZ2VudFNlc3Npb25zR3JvdXBpbmcuUmVwb3NpdG9yeSB9KTtcblx0XHRcdGNvbnN0IGRhdGFTb3VyY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2Vzc2lvbnNEYXRhU291cmNlKGZpbHRlciwgY3JlYXRlTW9ja1NvcnRlcigpKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBnZXRTZWN0aW9uc0Zyb21SZXN1bHQoZGF0YVNvdXJjZS5nZXRDaGlsZHJlbihjcmVhdGVNb2NrTW9kZWwoc2Vzc2lvbnMpKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1hcChzID0+IHMubGFiZWwpLCBbJ3ZzY29kZSddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ090aGVyIGdyb3VwIGFwcGVhcnMgYWZ0ZXIgbmFtZWQgcmVwb3MgYW5kIGJlZm9yZSBBcmNoaXZlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IFtcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJ25vLXJlcG8nLCBzdGFydFRpbWU6IG5vdyB9KSxcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJ3JlcG8tYScsIHN0YXJ0VGltZTogbm93IC0gMSwgbWV0YWRhdGE6IHsgcmVwb3NpdG9yeVBhdGg6ICcvcGF0aC9hbHBoYScgfSB9KSxcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJ2FyY2hpdmVkJywgc3RhcnRUaW1lOiBub3cgLSAyLCBpc0FyY2hpdmVkOiB0cnVlIH0pLFxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAncmVwby1iJywgc3RhcnRUaW1lOiBub3cgLSAzLCBtZXRhZGF0YTogeyByZXBvc2l0b3J5UGF0aDogJy9wYXRoL2JldGEnIH0gfSksXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICduby1yZXBvLTInLCBzdGFydFRpbWU6IG5vdyAtIDQgfSksXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBjcmVhdGVNb2NrRmlsdGVyKHsgZ3JvdXBCeTogQWdlbnRTZXNzaW9uc0dyb3VwaW5nLlJlcG9zaXRvcnkgfSk7XG5cdFx0XHRjb25zdCBkYXRhU291cmNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlc3Npb25zRGF0YVNvdXJjZShmaWx0ZXIsIGNyZWF0ZU1vY2tTb3J0ZXIoKSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0U2VjdGlvbnNGcm9tUmVzdWx0KGRhdGFTb3VyY2UuZ2V0Q2hpbGRyZW4oY3JlYXRlTW9ja01vZGVsKHNlc3Npb25zKSkpO1xuXG5cdFx0XHRjb25zdCBsYWJlbHMgPSByZXN1bHQubWFwKHMgPT4gcy5sYWJlbCk7XG5cdFx0XHRjb25zdCBvdGhlckluZGV4ID0gbGFiZWxzLmluZGV4T2YoJ090aGVyJyk7XG5cdFx0XHRjb25zdCBhcmNoaXZlZEluZGV4ID0gbGFiZWxzLmluZGV4T2YoJ0FyY2hpdmVkJyk7XG5cblx0XHRcdC8vIE90aGVyIG11c3QgZXhpc3QgYW5kIGNvbnRhaW4gdGhlIDIgc2Vzc2lvbnMgd2l0aG91dCByZXBvIGluZm9cblx0XHRcdGFzc2VydC5vayhvdGhlckluZGV4ICE9PSAtMSwgJ090aGVyIHNlY3Rpb24gc2hvdWxkIGJlIHByZXNlbnQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbb3RoZXJJbmRleF0uc2Vzc2lvbnMubGVuZ3RoLCAyKTtcblxuXHRcdFx0Ly8gT3RoZXIgbXVzdCBjb21lIGFmdGVyIGFsbCBuYW1lZCByZXBvIGdyb3Vwc1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBvdGhlckluZGV4OyBpKyspIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFtpXS5zZWN0aW9uLCBBZ2VudFNlc3Npb25TZWN0aW9uLlJlcG9zaXRvcnksIGBzZWN0aW9uIGF0IGluZGV4ICR7aX0gc2hvdWxkIGJlIGEgbmFtZWQgcmVwb3NpdG9yeSBncm91cGApO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBBcmNoaXZlZCBtdXN0IGNvbWUgYWZ0ZXIgT3RoZXJcblx0XHRcdGFzc2VydC5vayhhcmNoaXZlZEluZGV4ID4gb3RoZXJJbmRleCwgJ0FyY2hpdmVkIHNlY3Rpb24gc2hvdWxkIGNvbWUgYWZ0ZXIgT3RoZXInKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Bpbm5lZCBzZXNzaW9ucyBhcmUgdG9wLWxldmVsIGl0ZW1zIGJlZm9yZSBhbHBoYWJldGl6ZWQgcmVwb3NpdG9yeSBzZWN0aW9ucycsICgpID0+IHtcblx0XHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0XHRjb25zdCBwaW5uZWRTZXNzaW9uID0gY3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJ3Bpbm5lZCcsIGlzUGlubmVkOiB0cnVlLCBzdGFydFRpbWU6IG5vdyArIDEwLCBtZXRhZGF0YTogeyByZXBvc2l0b3J5UGF0aDogJy9wYXRoL3plYnJhJyB9IH0pO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBbXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICdvdGhlcicsIHN0YXJ0VGltZTogbm93ICsgOSB9KSxcblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJ3plYnJhJywgc3RhcnRUaW1lOiBub3cgKyA4LCBtZXRhZGF0YTogeyByZXBvc2l0b3J5UGF0aDogJy9wYXRoL3plYnJhJyB9IH0pLFxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnYWxwaGEnLCBzdGFydFRpbWU6IG5vdyArIDcsIG1ldGFkYXRhOiB7IHJlcG9zaXRvcnlQYXRoOiAnL3BhdGgvQWxwaGEnIH0gfSksXG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICdhcmNoaXZlZCcsIGlzQXJjaGl2ZWQ6IHRydWUsIHN0YXJ0VGltZTogbm93ICsgNiwgbWV0YWRhdGE6IHsgcmVwb3NpdG9yeVBhdGg6ICcvcGF0aC9taWRkbGUnIH0gfSksXG5cdFx0XHRcdHBpbm5lZFNlc3Npb24sXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBjcmVhdGVNb2NrRmlsdGVyKHsgZ3JvdXBCeTogQWdlbnRTZXNzaW9uc0dyb3VwaW5nLlJlcG9zaXRvcnkgfSk7XG5cdFx0XHRjb25zdCBkYXRhU291cmNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlc3Npb25zRGF0YVNvdXJjZShmaWx0ZXIsIGNyZWF0ZU1vY2tTb3J0ZXIoKSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gQXJyYXkuZnJvbShkYXRhU291cmNlLmdldENoaWxkcmVuKGNyZWF0ZU1vY2tNb2RlbChzZXNzaW9ucykpKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGlzQWdlbnRTZXNzaW9uKHJlc3VsdFswXSksICdmaXJzdCBpdGVtIHNob3VsZCBiZSB0aGUgcGlubmVkIHNlc3Npb24nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0ucmVzb3VyY2UudG9TdHJpbmcoKSwgcGlubmVkU2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpKTtcblxuXHRcdFx0Y29uc3Qgc2VjdGlvbnMgPSByZXN1bHQuZmlsdGVyKChpdGVtKTogaXRlbSBpcyBJQWdlbnRTZXNzaW9uU2VjdGlvbiA9PiBpc0FnZW50U2Vzc2lvblNlY3Rpb24oaXRlbSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZWN0aW9ucy5tYXAoc2VjdGlvbiA9PiAoeyBsYWJlbDogc2VjdGlvbi5sYWJlbCwgc2VjdGlvbjogc2VjdGlvbi5zZWN0aW9uLCBjb3VudDogc2VjdGlvbi5zZXNzaW9ucy5sZW5ndGggfSkpLCBbXG5cdFx0XHRcdHsgbGFiZWw6ICdBbHBoYScsIHNlY3Rpb246IEFnZW50U2Vzc2lvblNlY3Rpb24uUmVwb3NpdG9yeSwgY291bnQ6IDEgfSxcblx0XHRcdFx0eyBsYWJlbDogJ3plYnJhJywgc2VjdGlvbjogQWdlbnRTZXNzaW9uU2VjdGlvbi5SZXBvc2l0b3J5LCBjb3VudDogMSB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnT3RoZXInLCBzZWN0aW9uOiBBZ2VudFNlc3Npb25TZWN0aW9uLlJlcG9zaXRvcnksIGNvdW50OiAxIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICdBcmNoaXZlZCcsIHNlY3Rpb246IEFnZW50U2Vzc2lvblNlY3Rpb24uQXJjaGl2ZWQsIGNvdW50OiAxIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3JlcG9zaXRvcnlHcm91cExpbWl0JywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnY2FwcyByZXBvIGdyb3VwIGNoaWxkcmVuIGF0IGxpbWl0IGFuZCBhcHBlbmRzIHNob3ctbW9yZSBpdGVtJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogOCB9LCAoXywgaSkgPT5cblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogYHMke2l9YCwgbWV0YWRhdGE6IHsgcmVwb3NpdG9yeU53bzogJ293bmVyL3ZzY29kZScgfSwgc3RhcnRUaW1lOiBub3cgLSBpICogMTAwMCB9KVxuXHRcdFx0KTtcblxuXHRcdFx0Y29uc3QgZmlsdGVyID0gY3JlYXRlTW9ja0ZpbHRlcih7IGdyb3VwQnk6IEFnZW50U2Vzc2lvbnNHcm91cGluZy5SZXBvc2l0b3J5IH0pO1xuXHRcdFx0Y29uc3QgZGF0YVNvdXJjZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXNzaW9uc0RhdGFTb3VyY2UoZmlsdGVyLCBjcmVhdGVNb2NrU29ydGVyKCksIDUpKTtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9ja01vZGVsKHNlc3Npb25zKTtcblx0XHRcdGNvbnN0IHRvcExldmVsID0gQXJyYXkuZnJvbShkYXRhU291cmNlLmdldENoaWxkcmVuKG1vZGVsKSk7XG5cdFx0XHRjb25zdCBzZWN0aW9uID0gdG9wTGV2ZWwuZmluZChpdGVtID0+IGlzQWdlbnRTZXNzaW9uU2VjdGlvbihpdGVtKSAmJiBpdGVtLnNlY3Rpb24gPT09IEFnZW50U2Vzc2lvblNlY3Rpb24uUmVwb3NpdG9yeSkgYXMgSUFnZW50U2Vzc2lvblNlY3Rpb247XG5cdFx0XHRhc3NlcnQub2soc2VjdGlvbik7XG5cblx0XHRcdGNvbnN0IGNoaWxkcmVuID0gQXJyYXkuZnJvbShkYXRhU291cmNlLmdldENoaWxkcmVuKHNlY3Rpb24pKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGlsZHJlbi5sZW5ndGgsIDYpOyAvLyA1IHNlc3Npb25zICsgMSBzaG93LW1vcmVcblx0XHRcdGNvbnN0IHNob3dNb3JlID0gY2hpbGRyZW5bNV07XG5cdFx0XHRhc3NlcnQub2soaXNBZ2VudFNlc3Npb25TaG93TW9yZShzaG93TW9yZSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3dNb3JlLnJlbWFpbmluZ0NvdW50LCAzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG93TW9yZS5zZWN0aW9uTGFiZWwsICd2c2NvZGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IGNhcCB3aGVuIGdyb3VwIGhhcyBmZXdlciBpdGVtcyB0aGFuIGxpbWl0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogMyB9LCAoXywgaSkgPT5cblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogYHMke2l9YCwgbWV0YWRhdGE6IHsgcmVwb3NpdG9yeU53bzogJ293bmVyL3ZzY29kZScgfSwgc3RhcnRUaW1lOiBub3cgLSBpICogMTAwMCB9KVxuXHRcdFx0KTtcblxuXHRcdFx0Y29uc3QgZmlsdGVyID0gY3JlYXRlTW9ja0ZpbHRlcih7IGdyb3VwQnk6IEFnZW50U2Vzc2lvbnNHcm91cGluZy5SZXBvc2l0b3J5IH0pO1xuXHRcdFx0Y29uc3QgZGF0YVNvdXJjZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXNzaW9uc0RhdGFTb3VyY2UoZmlsdGVyLCBjcmVhdGVNb2NrU29ydGVyKCksIDUpKTtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9ja01vZGVsKHNlc3Npb25zKTtcblx0XHRcdGNvbnN0IHRvcExldmVsID0gQXJyYXkuZnJvbShkYXRhU291cmNlLmdldENoaWxkcmVuKG1vZGVsKSk7XG5cdFx0XHRjb25zdCBzZWN0aW9uID0gdG9wTGV2ZWwuZmluZChpdGVtID0+IGlzQWdlbnRTZXNzaW9uU2VjdGlvbihpdGVtKSAmJiBpdGVtLnNlY3Rpb24gPT09IEFnZW50U2Vzc2lvblNlY3Rpb24uUmVwb3NpdG9yeSkgYXMgSUFnZW50U2Vzc2lvblNlY3Rpb247XG5cblx0XHRcdGNvbnN0IGNoaWxkcmVuID0gQXJyYXkuZnJvbShkYXRhU291cmNlLmdldENoaWxkcmVuKHNlY3Rpb24pKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGlsZHJlbi5sZW5ndGgsIDMpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFjaGlsZHJlbi5zb21lKGlzQWdlbnRTZXNzaW9uU2hvd01vcmUpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4cGFuZGluZyBhIGdyb3VwIHJlbW92ZXMgdGhlIGNhcCBhbmQgYXBwZW5kcyBzaG93LWxlc3MgaXRlbScsICgpID0+IHtcblx0XHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IEFycmF5LmZyb20oeyBsZW5ndGg6IDggfSwgKF8sIGkpID0+XG5cdFx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6IGBzJHtpfWAsIG1ldGFkYXRhOiB7IHJlcG9zaXRvcnlOd286ICdvd25lci92c2NvZGUnIH0sIHN0YXJ0VGltZTogbm93IC0gaSAqIDEwMDAgfSlcblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IGZpbHRlciA9IGNyZWF0ZU1vY2tGaWx0ZXIoeyBncm91cEJ5OiBBZ2VudFNlc3Npb25zR3JvdXBpbmcuUmVwb3NpdG9yeSB9KTtcblx0XHRcdGNvbnN0IGRhdGFTb3VyY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2Vzc2lvbnNEYXRhU291cmNlKGZpbHRlciwgY3JlYXRlTW9ja1NvcnRlcigpLCA1KSk7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vY2tNb2RlbChzZXNzaW9ucyk7XG5cdFx0XHRjb25zdCB0b3BMZXZlbCA9IEFycmF5LmZyb20oZGF0YVNvdXJjZS5nZXRDaGlsZHJlbihtb2RlbCkpO1xuXHRcdFx0Y29uc3Qgc2VjdGlvbiA9IHRvcExldmVsLmZpbmQoaXRlbSA9PiBpc0FnZW50U2Vzc2lvblNlY3Rpb24oaXRlbSkgJiYgaXRlbS5zZWN0aW9uID09PSBBZ2VudFNlc3Npb25TZWN0aW9uLlJlcG9zaXRvcnkpIGFzIElBZ2VudFNlc3Npb25TZWN0aW9uO1xuXG5cdFx0XHRkYXRhU291cmNlLmV4cGFuZFJlcG9zaXRvcnlHcm91cCgndnNjb2RlJyk7XG5cdFx0XHRjb25zdCBjaGlsZHJlbiA9IEFycmF5LmZyb20oZGF0YVNvdXJjZS5nZXRDaGlsZHJlbihzZWN0aW9uKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hpbGRyZW4ubGVuZ3RoLCA5KTsgLy8gOCBzZXNzaW9ucyArIDEgc2hvdy1sZXNzXG5cdFx0XHRhc3NlcnQub2soIWNoaWxkcmVuLnNvbWUoaXNBZ2VudFNlc3Npb25TaG93TW9yZSkpO1xuXHRcdFx0Y29uc3Qgc2hvd0xlc3MgPSBjaGlsZHJlbls4XTtcblx0XHRcdGFzc2VydC5vayhpc0FnZW50U2Vzc2lvblNob3dMZXNzKHNob3dMZXNzKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvd0xlc3Muc2VjdGlvbkxhYmVsLCAndnNjb2RlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBjYXAgbm9uLXJlcG9zaXRvcnkgc2VjdGlvbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiA4IH0sIChfLCBpKSA9PlxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiBgcyR7aX1gLCBzdGFydFRpbWU6IG5vdyAtIGkgKiAxMDAwIH0pXG5cdFx0XHQpO1xuXG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBjcmVhdGVNb2NrRmlsdGVyKHsgZ3JvdXBCeTogQWdlbnRTZXNzaW9uc0dyb3VwaW5nLkRhdGUgfSk7XG5cdFx0XHRjb25zdCBkYXRhU291cmNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlc3Npb25zRGF0YVNvdXJjZShmaWx0ZXIsIGNyZWF0ZU1vY2tTb3J0ZXIoKSwgNSkpO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2NrTW9kZWwoc2Vzc2lvbnMpO1xuXHRcdFx0Y29uc3QgdG9wTGV2ZWwgPSBBcnJheS5mcm9tKGRhdGFTb3VyY2UuZ2V0Q2hpbGRyZW4obW9kZWwpKTtcblx0XHRcdGNvbnN0IHRvZGF5U2VjdGlvbiA9IHRvcExldmVsLmZpbmQoaXRlbSA9PiBpc0FnZW50U2Vzc2lvblNlY3Rpb24oaXRlbSkgJiYgaXRlbS5zZWN0aW9uID09PSBBZ2VudFNlc3Npb25TZWN0aW9uLlRvZGF5KSBhcyBJQWdlbnRTZXNzaW9uU2VjdGlvbjtcblxuXHRcdFx0Y29uc3QgY2hpbGRyZW4gPSBBcnJheS5mcm9tKGRhdGFTb3VyY2UuZ2V0Q2hpbGRyZW4odG9kYXlTZWN0aW9uKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hpbGRyZW4ubGVuZ3RoLCA4KTtcblx0XHRcdGFzc2VydC5vayghY2hpbGRyZW4uc29tZShpc0FnZW50U2Vzc2lvblNob3dNb3JlKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBjYXAgd2hlbiByZXBvc2l0b3J5R3JvdXBMaW1pdCBpcyBub3Qgc2V0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogOCB9LCAoXywgaSkgPT5cblx0XHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogYHMke2l9YCwgbWV0YWRhdGE6IHsgcmVwb3NpdG9yeU53bzogJ293bmVyL3ZzY29kZScgfSwgc3RhcnRUaW1lOiBub3cgLSBpICogMTAwMCB9KVxuXHRcdFx0KTtcblxuXHRcdFx0Y29uc3QgZmlsdGVyID0gY3JlYXRlTW9ja0ZpbHRlcih7IGdyb3VwQnk6IEFnZW50U2Vzc2lvbnNHcm91cGluZy5SZXBvc2l0b3J5IH0pO1xuXHRcdFx0Y29uc3QgZGF0YVNvdXJjZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXNzaW9uc0RhdGFTb3VyY2UoZmlsdGVyLCBjcmVhdGVNb2NrU29ydGVyKCkpKTtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9ja01vZGVsKHNlc3Npb25zKTtcblx0XHRcdGNvbnN0IHRvcExldmVsID0gQXJyYXkuZnJvbShkYXRhU291cmNlLmdldENoaWxkcmVuKG1vZGVsKSk7XG5cdFx0XHRjb25zdCBzZWN0aW9uID0gdG9wTGV2ZWwuZmluZChpdGVtID0+IGlzQWdlbnRTZXNzaW9uU2VjdGlvbihpdGVtKSAmJiBpdGVtLnNlY3Rpb24gPT09IEFnZW50U2Vzc2lvblNlY3Rpb24uUmVwb3NpdG9yeSkgYXMgSUFnZW50U2Vzc2lvblNlY3Rpb247XG5cblx0XHRcdGNvbnN0IGNoaWxkcmVuID0gQXJyYXkuZnJvbShkYXRhU291cmNlLmdldENoaWxkcmVuKHNlY3Rpb24pKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGlsZHJlbi5sZW5ndGgsIDgpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFjaGlsZHJlbi5zb21lKGlzQWdlbnRTZXNzaW9uU2hvd01vcmUpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IGNhcCB3aGVuIHJlcG9zaXRvcnlHcm91cENhcHBlZCBmaWx0ZXIgaXMgZGlzYWJsZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiA4IH0sIChfLCBpKSA9PlxuXHRcdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiBgcyR7aX1gLCBtZXRhZGF0YTogeyByZXBvc2l0b3J5TndvOiAnb3duZXIvdnNjb2RlJyB9LCBzdGFydFRpbWU6IG5vdyAtIGkgKiAxMDAwIH0pXG5cdFx0XHQpO1xuXG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBjcmVhdGVNb2NrRmlsdGVyKHsgZ3JvdXBCeTogQWdlbnRTZXNzaW9uc0dyb3VwaW5nLlJlcG9zaXRvcnksIHJlcG9zaXRvcnlHcm91cENhcHBlZDogZmFsc2UgfSk7XG5cdFx0XHRjb25zdCBkYXRhU291cmNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlc3Npb25zRGF0YVNvdXJjZShmaWx0ZXIsIGNyZWF0ZU1vY2tTb3J0ZXIoKSwgNSkpO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2NrTW9kZWwoc2Vzc2lvbnMpO1xuXHRcdFx0Y29uc3QgdG9wTGV2ZWwgPSBBcnJheS5mcm9tKGRhdGFTb3VyY2UuZ2V0Q2hpbGRyZW4obW9kZWwpKTtcblx0XHRcdGNvbnN0IHNlY3Rpb24gPSB0b3BMZXZlbC5maW5kKGl0ZW0gPT4gaXNBZ2VudFNlc3Npb25TZWN0aW9uKGl0ZW0pICYmIGl0ZW0uc2VjdGlvbiA9PT0gQWdlbnRTZXNzaW9uU2VjdGlvbi5SZXBvc2l0b3J5KSBhcyBJQWdlbnRTZXNzaW9uU2VjdGlvbjtcblxuXHRcdFx0Y29uc3QgY2hpbGRyZW4gPSBBcnJheS5mcm9tKGRhdGFTb3VyY2UuZ2V0Q2hpbGRyZW4oc2VjdGlvbikpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoaWxkcmVuLmxlbmd0aCwgOCk7XG5cdFx0XHRhc3NlcnQub2soIWNoaWxkcmVuLnNvbWUoaXNBZ2VudFNlc3Npb25TaG93TW9yZSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZ2V0UmVwb3NpdG9yeU5hbWUnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIG1ldGFkYXRhLm5hbWUgd2hlbiBvd25lciBhbmQgbmFtZSBhcmUgcHJlc2VudCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnMScsIG1ldGFkYXRhOiB7IG93bmVyOiAnbWljcm9zb2Z0JywgbmFtZTogJ3ZzY29kZScgfSB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRSZXBvc2l0b3J5TmFtZShzZXNzaW9uKSwgJ3ZzY29kZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyByZXBvIGZyb20gcmVwb3NpdG9yeU53bycsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnMScsIG1ldGFkYXRhOiB7IHJlcG9zaXRvcnlOd286ICdtaWNyb3NvZnQvdnNjb2RlJyB9IH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFJlcG9zaXRvcnlOYW1lKHNlc3Npb24pLCAndnNjb2RlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHJlcG8gZnJvbSByZXBvc2l0b3J5IFVSTCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnMScsIG1ldGFkYXRhOiB7IHJlcG9zaXRvcnk6ICdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZScgfSB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRSZXBvc2l0b3J5TmFtZShzZXNzaW9uKSwgJ3ZzY29kZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyByZXBvIGZyb20gcmVwb3NpdG9yeVBhdGggYmFzZW5hbWUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzEnLCBtZXRhZGF0YTogeyByZXBvc2l0b3J5UGF0aDogJy9Vc2Vycy91c2VyL1Byb2plY3RzL3ZzY29kZScgfSB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRSZXBvc2l0b3J5TmFtZShzZXNzaW9uKSwgJ3ZzY29kZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBwYXJlbnQgcmVwbyBuYW1lIGZyb20gd29ya3RyZWUgcGF0aCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnMScsIG1ldGFkYXRhOiB7IHdvcmt0cmVlUGF0aDogJy9Vc2Vycy91c2VyL1Byb2plY3RzL3ZzY29kZS53b3JrdHJlZXMvbXktYnJhbmNoJyB9IH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFJlcG9zaXRvcnlOYW1lKHNlc3Npb24pLCAndnNjb2RlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIG5hbWUgZnJvbSBiYWRnZSB3aXRoICQocmVwbykgcHJlZml4JywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGNyZWF0ZU1vY2tTZXNzaW9uKHsgaWQ6ICcxJywgYmFkZ2U6ICckKHJlcG8pIHZzY29kZScgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UmVwb3NpdG9yeU5hbWUoc2Vzc2lvbiksICd2c2NvZGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgbmFtZSBmcm9tIGJhZGdlIHdpdGggJChmb2xkZXIpIHByZWZpeCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnMScsIGJhZGdlOiAnJChmb2xkZXIpIG15LXByb2plY3QnIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFJlcG9zaXRvcnlOYW1lKHNlc3Npb24pLCAnbXktcHJvamVjdCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWV0YWRhdGEgcmVwbyBuYW1lIHRha2VzIHByaW9yaXR5IG92ZXIgYmFkZ2UgbmFtZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVNb2NrU2Vzc2lvbih7IGlkOiAnMScsIG1ldGFkYXRhOiB7IG93bmVyOiAnbWljcm9zb2Z0JywgbmFtZTogJ3ZzY29kZScgfSwgYmFkZ2U6ICckKGZvbGRlcikgY29waWxvdC13b3JrdHJlZS1icmFuY2gnIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFJlcG9zaXRvcnlOYW1lKHNlc3Npb24pLCAndnNjb2RlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIG5vIHJlcG8gaW5mbyBpcyBhdmFpbGFibGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlTW9ja1Nlc3Npb24oeyBpZDogJzEnIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFJlcG9zaXRvcnlOYW1lKHNlc3Npb24pLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYmFkZ2UgbmFtZSBjYW4gZGlmZmVyIGZyb20gbWV0YWRhdGEgcmVwbyBuYW1lICh3b3JrdHJlZSBzY2VuYXJpbyknLCAoKSA9PiB7XG5cdFx0XHQvLyBUaGlzIGlzIHRoZSBrZXkgc2NlbmFyaW86IGEgc2Vzc2lvbiBpbiBhIHdvcmt0cmVlIHdoZXJlIHRoZSBiYWRnZSBzaG93c1xuXHRcdFx0Ly8gdGhlIHdvcmt0cmVlIGZvbGRlciBuYW1lIGJ1dCB0aGUgcmVwbyBuYW1lIChmcm9tIG1ldGFkYXRhKSBpcyBkaWZmZXJlbnQuXG5cdFx0XHQvLyBUaGUgcmVuZGVyZXIgdXNlcyB0aGlzIHRvIGRlY2lkZSB3aGV0aGVyIHRvIGhpZGUgdGhlIGJhZGdlIHdoZW4gZ3JvdXBlZCBieSByZXBvLlxuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGNyZWF0ZU1vY2tTZXNzaW9uKHtcblx0XHRcdFx0aWQ6ICcxJyxcblx0XHRcdFx0bWV0YWRhdGE6IHsgcmVwb3NpdG9yeVBhdGg6ICcvVXNlcnMvdXNlci9Qcm9qZWN0cy92c2NvZGUnIH0sXG5cdFx0XHRcdGJhZGdlOiAnJChmb2xkZXIpIGNvcGlsb3Qtd29ya3RyZWUtMjAyNi0wMy0xM1QwMC0yNy0zMicsXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRSZXBvc2l0b3J5TmFtZShzZXNzaW9uKSwgJ3ZzY29kZScpO1xuXHRcdFx0Ly8gQmFkZ2UgdGV4dCBzaG93cyBhIGRpZmZlcmVudCBuYW1lIHRoYW4gdGhlIHJlcG8gXHUyMDE0IHJlbmRlcmVyIHNob3VsZCBOT1QgaGlkZSBpdFxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYXJjaGl2ZWQgc2Vzc2lvbiBzdGlsbCByZXR1cm5zIHJlcG8gbmFtZSBmcm9tIG1ldGFkYXRhJywgKCkgPT4ge1xuXHRcdFx0Ly8gQXJjaGl2ZWQgc2Vzc2lvbnMgYXJlIGdyb3VwZWQgdW5kZXIgXCJBcmNoaXZlZFwiLCBub3QgdW5kZXIgYSByZXBvIHNlY3Rpb24sXG5cdFx0XHQvLyBzbyB0aGUgcmVuZGVyZXIgbXVzdCBrZWVwIHRoZWlyIGJhZGdlIHZpc2libGUgZXZlbiB3aGVuIHRoZSBiYWRnZSBuYW1lXG5cdFx0XHQvLyBtYXRjaGVzIHRoZSByZXBvIG5hbWUuIGdldFJlcG9zaXRvcnlOYW1lIHN0aWxsIHJlc29sdmVzIG5vcm1hbGx5LlxuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGNyZWF0ZU1vY2tTZXNzaW9uKHtcblx0XHRcdFx0aWQ6ICcxJyxcblx0XHRcdFx0aXNBcmNoaXZlZDogdHJ1ZSxcblx0XHRcdFx0bWV0YWRhdGE6IHsgcmVwb3NpdG9yeVBhdGg6ICcvVXNlcnMvdXNlci9Qcm9qZWN0cy92c2NvZGUnIH0sXG5cdFx0XHRcdGJhZGdlOiAnJChyZXBvKSB2c2NvZGUnLFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UmVwb3NpdG9yeU5hbWUoc2Vzc2lvbiksICd2c2NvZGUnKTtcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0FnZW50U2Vzc2lvbnNTb3J0ZXInLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gY3JlYXRlU2Vzc2lvbihvdmVycmlkZXM6IFBhcnRpYWw8e1xuXHRcdGlkOiBzdHJpbmc7XG5cdFx0c3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cztcblx0XHRpc0FyY2hpdmVkOiBib29sZWFuO1xuXHRcdGlzUGlubmVkOiBib29sZWFuO1xuXHRcdGNyZWF0ZWQ6IG51bWJlcjtcblx0XHRsYXN0UmVxdWVzdFN0YXJ0ZWQ6IG51bWJlcjtcblx0XHRsYXN0UmVxdWVzdEVuZGVkOiBudW1iZXI7XG5cdH0+KTogSUFnZW50U2Vzc2lvbiB7XG5cdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cHJvdmlkZXJUeXBlOiAndGVzdCcsXG5cdFx0XHRwcm92aWRlckxhYmVsOiAnVGVzdCcsXG5cdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKGB0ZXN0Oi8vc2Vzc2lvbi8ke292ZXJyaWRlcy5pZCA/PyAnZGVmYXVsdCd9YCksXG5cdFx0XHRzdGF0dXM6IG92ZXJyaWRlcy5zdGF0dXMgPz8gQ2hhdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0bGFiZWw6IGBTZXNzaW9uICR7b3ZlcnJpZGVzLmlkID8/ICdkZWZhdWx0J31gLFxuXHRcdFx0aWNvbjogQ29kaWNvbi50ZXJtaW5hbCxcblx0XHRcdHRpbWluZzoge1xuXHRcdFx0XHRjcmVhdGVkOiBvdmVycmlkZXMuY3JlYXRlZCA/PyBub3csXG5cdFx0XHRcdGxhc3RSZXF1ZXN0RW5kZWQ6IG92ZXJyaWRlcy5sYXN0UmVxdWVzdEVuZGVkLFxuXHRcdFx0XHRsYXN0UmVxdWVzdFN0YXJ0ZWQ6IG92ZXJyaWRlcy5sYXN0UmVxdWVzdFN0YXJ0ZWQsXG5cdFx0XHR9LFxuXHRcdFx0Y2hhbmdlczogdW5kZWZpbmVkLFxuXHRcdFx0bWV0YWRhdGE6IHVuZGVmaW5lZCxcblx0XHRcdGlzQXJjaGl2ZWQ6ICgpID0+IG92ZXJyaWRlcy5pc0FyY2hpdmVkID8/IGZhbHNlLFxuXHRcdFx0c2V0QXJjaGl2ZWQ6ICgpID0+IHsgfSxcblx0XHRcdGlzUGlubmVkOiAoKSA9PiBvdmVycmlkZXMuaXNQaW5uZWQgPz8gZmFsc2UsXG5cdFx0XHRzZXRQaW5uZWQ6ICgpID0+IHsgfSxcblx0XHRcdGlzUmVhZDogKCkgPT4gdHJ1ZSxcblx0XHRcdGlzTWFya2VkVW5yZWFkOiAoKSA9PiBmYWxzZSxcblx0XHRcdHNldFJlYWQ6ICgpID0+IHsgfSxcblx0XHR9O1xuXHR9XG5cblx0dGVzdCgnZGVmYXVsdDogc29ydHMgYnkgY3JlYXRpb24gdGltZSAobW9zdCByZWNlbnQgZmlyc3QpJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNvcnRlciA9IG5ldyBBZ2VudFNlc3Npb25zU29ydGVyKCk7XG5cdFx0Y29uc3Qgb2xkID0gY3JlYXRlU2Vzc2lvbih7IGlkOiAnb2xkJywgY3JlYXRlZDogMTAwMCB9KTtcblx0XHRjb25zdCByZWNlbnQgPSBjcmVhdGVTZXNzaW9uKHsgaWQ6ICdyZWNlbnQnLCBjcmVhdGVkOiAyMDAwIH0pO1xuXG5cdFx0Y29uc3Qgc29ydGVkID0gW29sZCwgcmVjZW50XS5zb3J0KChhLCBiKSA9PiBzb3J0ZXIuY29tcGFyZShhLCBiKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzb3J0ZWQubWFwKHMgPT4gcy5sYWJlbCksIFsnU2Vzc2lvbiByZWNlbnQnLCAnU2Vzc2lvbiBvbGQnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlZmF1bHQ6IGFyY2hpdmVkIHNlc3Npb25zIGNvbWUgbGFzdCcsICgpID0+IHtcblx0XHRjb25zdCBzb3J0ZXIgPSBuZXcgQWdlbnRTZXNzaW9uc1NvcnRlcigpO1xuXHRcdGNvbnN0IGFyY2hpdmVkID0gY3JlYXRlU2Vzc2lvbih7IGlkOiAnYXJjaGl2ZWQnLCBpc0FyY2hpdmVkOiB0cnVlLCBjcmVhdGVkOiAzMDAwIH0pO1xuXHRcdGNvbnN0IGFjdGl2ZSA9IGNyZWF0ZVNlc3Npb24oeyBpZDogJ2FjdGl2ZScsIGNyZWF0ZWQ6IDEwMDAgfSk7XG5cblx0XHRjb25zdCBzb3J0ZWQgPSBbYXJjaGl2ZWQsIGFjdGl2ZV0uc29ydCgoYSwgYikgPT4gc29ydGVyLmNvbXBhcmUoYSwgYikpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc29ydGVkLm1hcChzID0+IHMubGFiZWwpLCBbJ1Nlc3Npb24gYWN0aXZlJywgJ1Nlc3Npb24gYXJjaGl2ZWQnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlZmF1bHQ6IGRvZXMgTk9UIHByaW9yaXRpemUgbmVlZHMtaW5wdXQgc2Vzc2lvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc29ydGVyID0gbmV3IEFnZW50U2Vzc2lvbnNTb3J0ZXIoKTtcblx0XHRjb25zdCBuZWVkc0lucHV0ID0gY3JlYXRlU2Vzc2lvbih7IGlkOiAnbmVlZHMnLCBzdGF0dXM6IENoYXRTZXNzaW9uU3RhdHVzLk5lZWRzSW5wdXQsIGNyZWF0ZWQ6IDEwMDAgfSk7XG5cdFx0Y29uc3QgY29tcGxldGVkID0gY3JlYXRlU2Vzc2lvbih7IGlkOiAnZG9uZScsIHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLCBjcmVhdGVkOiAyMDAwIH0pO1xuXG5cdFx0Y29uc3Qgc29ydGVkID0gW25lZWRzSW5wdXQsIGNvbXBsZXRlZF0uc29ydCgoYSwgYikgPT4gc29ydGVyLmNvbXBhcmUoYSwgYikpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc29ydGVkLm1hcChzID0+IHMubGFiZWwpLCBbJ1Nlc3Npb24gZG9uZScsICdTZXNzaW9uIG5lZWRzJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmlvcml0aXplQWN0aXZlOiBuZWVkcy1pbnB1dCBzZXNzaW9ucyBjb21lIGZpcnN0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHNvcnRlciA9IG5ldyBBZ2VudFNlc3Npb25zU29ydGVyKCk7XG5cdFx0Y29uc3QgbmVlZHNJbnB1dCA9IGNyZWF0ZVNlc3Npb24oeyBpZDogJ25lZWRzJywgc3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cy5OZWVkc0lucHV0LCBjcmVhdGVkOiAxMDAwIH0pO1xuXHRcdGNvbnN0IGNvbXBsZXRlZCA9IGNyZWF0ZVNlc3Npb24oeyBpZDogJ2RvbmUnLCBzdGF0dXM6IENoYXRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgY3JlYXRlZDogMjAwMCB9KTtcblxuXHRcdGNvbnN0IHNvcnRlZCA9IFtjb21wbGV0ZWQsIG5lZWRzSW5wdXRdLnNvcnQoKGEsIGIpID0+IHNvcnRlci5jb21wYXJlKGEsIGIsIHRydWUpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNvcnRlZC5tYXAocyA9PiBzLmxhYmVsKSwgWydTZXNzaW9uIG5lZWRzJywgJ1Nlc3Npb24gZG9uZSddKTtcblx0fSk7XG5cblx0dGVzdCgncHJpb3JpdGl6ZUFjdGl2ZTogYXJjaGl2ZWQgc3RpbGwgY29tZSBsYXN0IHdoZW4gbm90IGFjdGl2ZScsICgpID0+IHtcblx0XHRjb25zdCBzb3J0ZXIgPSBuZXcgQWdlbnRTZXNzaW9uc1NvcnRlcigpO1xuXHRcdGNvbnN0IGFyY2hpdmVkID0gY3JlYXRlU2Vzc2lvbih7IGlkOiAnYXJjaGl2ZWQnLCBpc0FyY2hpdmVkOiB0cnVlLCBjcmVhdGVkOiAzMDAwIH0pO1xuXHRcdGNvbnN0IGFjdGl2ZSA9IGNyZWF0ZVNlc3Npb24oeyBpZDogJ2FjdGl2ZScsIGNyZWF0ZWQ6IDEwMDAgfSk7XG5cblx0XHRjb25zdCBzb3J0ZWQgPSBbYXJjaGl2ZWQsIGFjdGl2ZV0uc29ydCgoYSwgYikgPT4gc29ydGVyLmNvbXBhcmUoYSwgYiwgdHJ1ZSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc29ydGVkLm1hcChzID0+IHMubGFiZWwpLCBbJ1Nlc3Npb24gYWN0aXZlJywgJ1Nlc3Npb24gYXJjaGl2ZWQnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByaW9yaXRpemVBY3RpdmU6IHVzZXMgbGFzdFJlcXVlc3RTdGFydGVkIGZvciB0aW1lIHNvcnRpbmcgd2hlbiBzb3J0ZWQgYnkgdXBkYXRlZCcsICgpID0+IHtcblx0XHRjb25zdCBzb3J0ZXIgPSBuZXcgQWdlbnRTZXNzaW9uc1NvcnRlcigoKSA9PiBBZ2VudFNlc3Npb25zU29ydGluZy5VcGRhdGVkKTtcblx0XHRjb25zdCByZWNlbnRseUFjdGl2ZSA9IGNyZWF0ZVNlc3Npb24oeyBpZDogJ3JlY2VudC1hY3RpdmUnLCBjcmVhdGVkOiAxMDAwLCBsYXN0UmVxdWVzdFN0YXJ0ZWQ6IDUwMDAgfSk7XG5cdFx0Y29uc3QgcmVjZW50bHlDcmVhdGVkID0gY3JlYXRlU2Vzc2lvbih7IGlkOiAncmVjZW50LWNyZWF0ZWQnLCBjcmVhdGVkOiAzMDAwIH0pO1xuXG5cdFx0Y29uc3Qgc29ydGVkID0gW3JlY2VudGx5Q3JlYXRlZCwgcmVjZW50bHlBY3RpdmVdLnNvcnQoKGEsIGIpID0+IHNvcnRlci5jb21wYXJlKGEsIGIsIHRydWUpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNvcnRlZC5tYXAocyA9PiBzLmxhYmVsKSwgWydTZXNzaW9uIHJlY2VudC1hY3RpdmUnLCAnU2Vzc2lvbiByZWNlbnQtY3JlYXRlZCddKTtcblx0fSk7XG5cblx0dGVzdCgncHJpb3JpdGl6ZUFjdGl2ZTogdXNlcyBjcmVhdGVkIHRpbWUgd2hlbiBzb3J0ZWQgYnkgY3JlYXRlZCcsICgpID0+IHtcblx0XHRjb25zdCBzb3J0ZXIgPSBuZXcgQWdlbnRTZXNzaW9uc1NvcnRlcigoKSA9PiBBZ2VudFNlc3Npb25zU29ydGluZy5DcmVhdGVkKTtcblx0XHRjb25zdCByZWNlbnRseUFjdGl2ZSA9IGNyZWF0ZVNlc3Npb24oeyBpZDogJ3JlY2VudC1hY3RpdmUnLCBjcmVhdGVkOiAxMDAwLCBsYXN0UmVxdWVzdFN0YXJ0ZWQ6IDUwMDAgfSk7XG5cdFx0Y29uc3QgcmVjZW50bHlDcmVhdGVkID0gY3JlYXRlU2Vzc2lvbih7IGlkOiAncmVjZW50LWNyZWF0ZWQnLCBjcmVhdGVkOiAzMDAwIH0pO1xuXG5cdFx0Y29uc3Qgc29ydGVkID0gW3JlY2VudGx5Q3JlYXRlZCwgcmVjZW50bHlBY3RpdmVdLnNvcnQoKGEsIGIpID0+IHNvcnRlci5jb21wYXJlKGEsIGIsIHRydWUpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNvcnRlZC5tYXAocyA9PiBzLmxhYmVsKSwgWydTZXNzaW9uIHJlY2VudC1jcmVhdGVkJywgJ1Nlc3Npb24gcmVjZW50LWFjdGl2ZSddKTtcblx0fSk7XG5cblx0dGVzdCgncGlubmVkIHNlc3Npb25zIGNvbWUgYmVmb3JlIG5vbi1waW5uZWQgc2Vzc2lvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc29ydGVyID0gbmV3IEFnZW50U2Vzc2lvbnNTb3J0ZXIoKTtcblx0XHRjb25zdCBwaW5uZWQgPSBjcmVhdGVTZXNzaW9uKHsgaWQ6ICdwaW5uZWQnLCBpc1Bpbm5lZDogdHJ1ZSwgY3JlYXRlZDogMTAwMCB9KTtcblx0XHRjb25zdCByZWd1bGFyID0gY3JlYXRlU2Vzc2lvbih7IGlkOiAncmVndWxhcicsIGNyZWF0ZWQ6IDIwMDAgfSk7XG5cblx0XHRjb25zdCBzb3J0ZWQgPSBbcmVndWxhciwgcGlubmVkXS5zb3J0KChhLCBiKSA9PiBzb3J0ZXIuY29tcGFyZShhLCBiKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzb3J0ZWQubWFwKHMgPT4gcy5sYWJlbCksIFsnU2Vzc2lvbiBwaW5uZWQnLCAnU2Vzc2lvbiByZWd1bGFyJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdhcmNoaXZlZCBwaW5uZWQgc2Vzc2lvbnMgZG8gbm90IHNvcnQgYmVmb3JlIG5vbi1hcmNoaXZlZCcsICgpID0+IHtcblx0XHRjb25zdCBzb3J0ZXIgPSBuZXcgQWdlbnRTZXNzaW9uc1NvcnRlcigpO1xuXHRcdGNvbnN0IGFyY2hpdmVkUGlubmVkID0gY3JlYXRlU2Vzc2lvbih7IGlkOiAnYXJjaGl2ZWQtcGlubmVkJywgaXNQaW5uZWQ6IHRydWUsIGlzQXJjaGl2ZWQ6IHRydWUsIGNyZWF0ZWQ6IDMwMDAgfSk7XG5cdFx0Y29uc3QgcmVndWxhciA9IGNyZWF0ZVNlc3Npb24oeyBpZDogJ3JlZ3VsYXInLCBjcmVhdGVkOiAxMDAwIH0pO1xuXG5cdFx0Y29uc3Qgc29ydGVkID0gW2FyY2hpdmVkUGlubmVkLCByZWd1bGFyXS5zb3J0KChhLCBiKSA9PiBzb3J0ZXIuY29tcGFyZShhLCBiKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzb3J0ZWQubWFwKHMgPT4gcy5sYWJlbCksIFsnU2Vzc2lvbiByZWd1bGFyJywgJ1Nlc3Npb24gYXJjaGl2ZWQtcGlubmVkJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdzb3J0QnkgQ3JlYXRlZDogc29ydHMgYnkgY3JlYXRpb24gdGltZSByZWdhcmRsZXNzIG9mIGxhc3RSZXF1ZXN0RW5kZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc29ydGVyID0gbmV3IEFnZW50U2Vzc2lvbnNTb3J0ZXIoKCkgPT4gQWdlbnRTZXNzaW9uc1NvcnRpbmcuQ3JlYXRlZCk7XG5cdFx0Y29uc3Qgb2xkZXJDcmVhdGVkID0gY3JlYXRlU2Vzc2lvbih7IGlkOiAnb2xkZXInLCBjcmVhdGVkOiAxMDAwLCBsYXN0UmVxdWVzdEVuZGVkOiA1MDAwIH0pO1xuXHRcdGNvbnN0IG5ld2VyQ3JlYXRlZCA9IGNyZWF0ZVNlc3Npb24oeyBpZDogJ25ld2VyJywgY3JlYXRlZDogMzAwMCwgbGFzdFJlcXVlc3RFbmRlZDogMjAwMCB9KTtcblxuXHRcdGNvbnN0IHNvcnRlZCA9IFtvbGRlckNyZWF0ZWQsIG5ld2VyQ3JlYXRlZF0uc29ydCgoYSwgYikgPT4gc29ydGVyLmNvbXBhcmUoYSwgYikpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc29ydGVkLm1hcChzID0+IHMubGFiZWwpLCBbJ1Nlc3Npb24gbmV3ZXInLCAnU2Vzc2lvbiBvbGRlciddKTtcblx0fSk7XG5cblx0dGVzdCgnc29ydEJ5IFVwZGF0ZWQ6IHNvcnRzIGJ5IGxhc3RSZXF1ZXN0RW5kZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc29ydGVyID0gbmV3IEFnZW50U2Vzc2lvbnNTb3J0ZXIoKCkgPT4gQWdlbnRTZXNzaW9uc1NvcnRpbmcuVXBkYXRlZCk7XG5cdFx0Y29uc3QgcmVjZW50bHlVcGRhdGVkID0gY3JlYXRlU2Vzc2lvbih7IGlkOiAndXBkYXRlZCcsIGNyZWF0ZWQ6IDEwMDAsIGxhc3RSZXF1ZXN0RW5kZWQ6IDUwMDAgfSk7XG5cdFx0Y29uc3QgcmVjZW50bHlDcmVhdGVkID0gY3JlYXRlU2Vzc2lvbih7IGlkOiAnY3JlYXRlZCcsIGNyZWF0ZWQ6IDMwMDAsIGxhc3RSZXF1ZXN0RW5kZWQ6IDIwMDAgfSk7XG5cblx0XHRjb25zdCBzb3J0ZWQgPSBbcmVjZW50bHlDcmVhdGVkLCByZWNlbnRseVVwZGF0ZWRdLnNvcnQoKGEsIGIpID0+IHNvcnRlci5jb21wYXJlKGEsIGIpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNvcnRlZC5tYXAocyA9PiBzLmxhYmVsKSwgWydTZXNzaW9uIHVwZGF0ZWQnLCAnU2Vzc2lvbiBjcmVhdGVkJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdzb3J0QnkgVXBkYXRlZDogZmFsbHMgYmFjayB0byBjcmVhdGVkIHdoZW4gbGFzdFJlcXVlc3RFbmRlZCBpcyB1bmRlZmluZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc29ydGVyID0gbmV3IEFnZW50U2Vzc2lvbnNTb3J0ZXIoKCkgPT4gQWdlbnRTZXNzaW9uc1NvcnRpbmcuVXBkYXRlZCk7XG5cdFx0Y29uc3Qgd2l0aFJlcXVlc3QgPSBjcmVhdGVTZXNzaW9uKHsgaWQ6ICd3aXRoLXJlcXVlc3QnLCBjcmVhdGVkOiAxMDAwLCBsYXN0UmVxdWVzdEVuZGVkOiAzMDAwIH0pO1xuXHRcdGNvbnN0IHdpdGhvdXRSZXF1ZXN0ID0gY3JlYXRlU2Vzc2lvbih7IGlkOiAnbm8tcmVxdWVzdCcsIGNyZWF0ZWQ6IDQwMDAgfSk7XG5cblx0XHRjb25zdCBzb3J0ZWQgPSBbd2l0aFJlcXVlc3QsIHdpdGhvdXRSZXF1ZXN0XS5zb3J0KChhLCBiKSA9PiBzb3J0ZXIuY29tcGFyZShhLCBiKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzb3J0ZWQubWFwKHMgPT4gcy5sYWJlbCksIFsnU2Vzc2lvbiBuby1yZXF1ZXN0JywgJ1Nlc3Npb24gd2l0aC1yZXF1ZXN0J10pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQWdlbnRTZXNzaW9uc1BpY2tlcicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBjcmVhdGVTZXNzaW9uKG92ZXJyaWRlczogUGFydGlhbDx7XG5cdFx0aWQ6IHN0cmluZztcblx0XHRzdGF0dXM6IENoYXRTZXNzaW9uU3RhdHVzO1xuXHRcdGlzQXJjaGl2ZWQ6IGJvb2xlYW47XG5cdH0+KTogSUFnZW50U2Vzc2lvbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHByb3ZpZGVyVHlwZTogJ3Rlc3QnLFxuXHRcdFx0cHJvdmlkZXJMYWJlbDogJ1Rlc3QnLFxuXHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZShgdGVzdDovL3Nlc3Npb24vJHtvdmVycmlkZXMuaWQgPz8gJ2RlZmF1bHQnfWApLFxuXHRcdFx0c3RhdHVzOiBvdmVycmlkZXMuc3RhdHVzID8/IENoYXRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCxcblx0XHRcdGxhYmVsOiBgU2Vzc2lvbiAke292ZXJyaWRlcy5pZCA/PyAnZGVmYXVsdCd9YCxcblx0XHRcdGljb246IENvZGljb24udGVybWluYWwsXG5cdFx0XHR0aW1pbmc6IHtcblx0XHRcdFx0Y3JlYXRlZDogRGF0ZS5ub3coKSxcblx0XHRcdFx0bGFzdFJlcXVlc3RTdGFydGVkOiB1bmRlZmluZWQsXG5cdFx0XHRcdGxhc3RSZXF1ZXN0RW5kZWQ6IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0XHRjaGFuZ2VzOiB1bmRlZmluZWQsXG5cdFx0XHRtZXRhZGF0YTogdW5kZWZpbmVkLFxuXHRcdFx0aXNBcmNoaXZlZDogKCkgPT4gb3ZlcnJpZGVzLmlzQXJjaGl2ZWQgPz8gZmFsc2UsXG5cdFx0XHRzZXRBcmNoaXZlZDogKCkgPT4geyB9LFxuXHRcdFx0aXNQaW5uZWQ6ICgpID0+IGZhbHNlLFxuXHRcdFx0c2V0UGlubmVkOiAoKSA9PiB7IH0sXG5cdFx0XHRpc1JlYWQ6ICgpID0+IHRydWUsXG5cdFx0XHRpc01hcmtlZFVucmVhZDogKCkgPT4gZmFsc2UsXG5cdFx0XHRzZXRSZWFkOiAoKSA9PiB7IH0sXG5cdFx0fTtcblx0fVxuXG5cdGNvbnN0IGZpbHRlcjogSUFnZW50U2Vzc2lvbnNGaWx0ZXIgPSB7XG5cdFx0b25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsXG5cdFx0ZXhjbHVkZTogKCkgPT4gZmFsc2UsXG5cdFx0Z2V0RXhjbHVkZXM6ICgpID0+ICh7IHByb3ZpZGVyczogW10sIHN0YXRlczogW10sIGFyY2hpdmVkOiB0cnVlLCByZWFkOiBmYWxzZSwgcmVwb3NpdG9yeUdyb3VwQ2FwcGVkOiB0cnVlIH0pLFxuXHRcdGlzRGVmYXVsdDogKCkgPT4gdHJ1ZSxcblx0XHRsaW1pdFJlc3VsdHM6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRub3RpZnlSZXN1bHRzOiAoKSA9PiB7IH0sXG5cdFx0cmVzZXQ6ICgpID0+IHsgfSxcblx0XHRzb3J0UmVzdWx0czogKCkgPT4gdW5kZWZpbmVkLFxuXHR9O1xuXG5cdHRlc3QoJ2tlZXBzIGNvbXBsZXRlZCBzZXNzaW9ucyBidXQgZXhjbHVkZXMgYXJjaGl2ZWQgc2Vzc2lvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29tcGxldGVkID0gY3JlYXRlU2Vzc2lvbih7IGlkOiAnY29tcGxldGVkJywgc3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQgfSk7XG5cdFx0Y29uc3QgaW5Qcm9ncmVzcyA9IGNyZWF0ZVNlc3Npb24oeyBpZDogJ2luLXByb2dyZXNzJywgc3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cy5JblByb2dyZXNzIH0pO1xuXHRcdGNvbnN0IGFyY2hpdmVkID0gY3JlYXRlU2Vzc2lvbih7IGlkOiAnYXJjaGl2ZWQnLCBzdGF0dXM6IENoYXRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgaXNBcmNoaXZlZDogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRbY29tcGxldGVkLCBpblByb2dyZXNzLCBhcmNoaXZlZF0uZmlsdGVyKHNlc3Npb24gPT4gc2hvdWxkU2hvd1Nlc3Npb25JblBpY2tlcihzZXNzaW9uLCBmaWx0ZXIpKS5tYXAoc2Vzc2lvbiA9PiBzZXNzaW9uLmxhYmVsKSxcblx0XHRcdFsnU2Vzc2lvbiBjb21wbGV0ZWQnLCAnU2Vzc2lvbiBpbi1wcm9ncmVzcyddXG5cdFx0KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2dyb3VwQWdlbnRTZXNzaW9uc0J5RGF0ZSB3aXRoIHNvcnRCeScsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBjcmVhdGVTZXNzaW9uKG92ZXJyaWRlczogUGFydGlhbDx7XG5cdFx0aWQ6IHN0cmluZztcblx0XHRpc0FyY2hpdmVkOiBib29sZWFuO1xuXHRcdGlzUGlubmVkOiBib29sZWFuO1xuXHRcdGNyZWF0ZWQ6IG51bWJlcjtcblx0XHRsYXN0UmVxdWVzdEVuZGVkOiBudW1iZXI7XG5cdH0+KTogSUFnZW50U2Vzc2lvbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHByb3ZpZGVyVHlwZTogJ3Rlc3QnLFxuXHRcdFx0cHJvdmlkZXJMYWJlbDogJ1Rlc3QnLFxuXHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZShgdGVzdDovL3Nlc3Npb24vJHtvdmVycmlkZXMuaWQgPz8gJ2RlZmF1bHQnfWApLFxuXHRcdFx0c3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsXG5cdFx0XHRsYWJlbDogYFNlc3Npb24gJHtvdmVycmlkZXMuaWQgPz8gJ2RlZmF1bHQnfWAsXG5cdFx0XHRpY29uOiBDb2RpY29uLnRlcm1pbmFsLFxuXHRcdFx0dGltaW5nOiB7XG5cdFx0XHRcdGNyZWF0ZWQ6IG92ZXJyaWRlcy5jcmVhdGVkID8/IERhdGUubm93KCksXG5cdFx0XHRcdGxhc3RSZXF1ZXN0RW5kZWQ6IG92ZXJyaWRlcy5sYXN0UmVxdWVzdEVuZGVkLFxuXHRcdFx0XHRsYXN0UmVxdWVzdFN0YXJ0ZWQ6IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0XHRjaGFuZ2VzOiB1bmRlZmluZWQsXG5cdFx0XHRtZXRhZGF0YTogdW5kZWZpbmVkLFxuXHRcdFx0aXNBcmNoaXZlZDogKCkgPT4gb3ZlcnJpZGVzLmlzQXJjaGl2ZWQgPz8gZmFsc2UsXG5cdFx0XHRzZXRBcmNoaXZlZDogKCkgPT4geyB9LFxuXHRcdFx0aXNQaW5uZWQ6ICgpID0+IG92ZXJyaWRlcy5pc1Bpbm5lZCA/PyBmYWxzZSxcblx0XHRcdHNldFBpbm5lZDogKCkgPT4geyB9LFxuXHRcdFx0aXNSZWFkOiAoKSA9PiB0cnVlLFxuXHRcdFx0aXNNYXJrZWRVbnJlYWQ6ICgpID0+IGZhbHNlLFxuXHRcdFx0c2V0UmVhZDogKCkgPT4geyB9LFxuXHRcdH07XG5cdH1cblxuXHR0ZXN0KCdkZWZhdWx0IChDcmVhdGVkKTogYnVja2V0cyBieSBjcmVhdGVkIHRpbWUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRjb25zdCB0ZW5EYXlzQWdvID0gbm93IC0gMTAgKiAyNCAqIDYwICogNjAgKiAxMDAwO1xuXG5cdFx0Y29uc3Qgb2xkU2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oeyBpZDogJ29sZCcsIGNyZWF0ZWQ6IHRlbkRheXNBZ28sIGxhc3RSZXF1ZXN0RW5kZWQ6IG5vdyB9KTtcblxuXHRcdGNvbnN0IGdyb3VwZWQgPSBncm91cEFnZW50U2Vzc2lvbnNCeURhdGUoW29sZFNlc3Npb25dKTtcblx0XHRjb25zdCB0b2RheVNlc3Npb25zID0gZ3JvdXBlZC5nZXQoQWdlbnRTZXNzaW9uU2VjdGlvbi5Ub2RheSkhLnNlc3Npb25zO1xuXHRcdGNvbnN0IG9sZGVyU2Vzc2lvbnMgPSBncm91cGVkLmdldChBZ2VudFNlc3Npb25TZWN0aW9uLk9sZGVyKSEuc2Vzc2lvbnM7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvZGF5U2Vzc2lvbnMubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG9sZGVyU2Vzc2lvbnMubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnVXBkYXRlZDogc2Vzc2lvbiBjcmVhdGVkIGxvbmcgYWdvIGJ1dCByZWNlbnRseSB1cGRhdGVkIGdvZXMgaW50byBUb2RheScsICgpID0+IHtcblx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdGNvbnN0IHRlbkRheXNBZ28gPSBub3cgLSAxMCAqIDI0ICogNjAgKiA2MCAqIDEwMDA7XG5cblx0XHRjb25zdCBvbGRCdXRVcGRhdGVkID0gY3JlYXRlU2Vzc2lvbih7IGlkOiAnb2xkLXVwZGF0ZWQnLCBjcmVhdGVkOiB0ZW5EYXlzQWdvLCBsYXN0UmVxdWVzdEVuZGVkOiBub3cgfSk7XG5cblx0XHRjb25zdCBncm91cGVkID0gZ3JvdXBBZ2VudFNlc3Npb25zQnlEYXRlKFtvbGRCdXRVcGRhdGVkXSwgQWdlbnRTZXNzaW9uc1NvcnRpbmcuVXBkYXRlZCk7XG5cdFx0Y29uc3QgdG9kYXlTZXNzaW9ucyA9IGdyb3VwZWQuZ2V0KEFnZW50U2Vzc2lvblNlY3Rpb24uVG9kYXkpIS5zZXNzaW9ucztcblx0XHRjb25zdCBvbGRlclNlc3Npb25zID0gZ3JvdXBlZC5nZXQoQWdlbnRTZXNzaW9uU2VjdGlvbi5PbGRlcikhLnNlc3Npb25zO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b2RheVNlc3Npb25zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvbGRlclNlc3Npb25zLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1VwZGF0ZWQ6IGZhbGxzIGJhY2sgdG8gY3JlYXRlZCB3aGVuIGxhc3RSZXF1ZXN0RW5kZWQgaXMgdW5kZWZpbmVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0Y29uc3QgdGVuRGF5c0FnbyA9IG5vdyAtIDEwICogMjQgKiA2MCAqIDYwICogMTAwMDtcblxuXHRcdGNvbnN0IG9sZE5vVXBkYXRlID0gY3JlYXRlU2Vzc2lvbih7IGlkOiAnb2xkLW5vLXVwZGF0ZScsIGNyZWF0ZWQ6IHRlbkRheXNBZ28gfSk7XG5cblx0XHRjb25zdCBncm91cGVkID0gZ3JvdXBBZ2VudFNlc3Npb25zQnlEYXRlKFtvbGROb1VwZGF0ZV0sIEFnZW50U2Vzc2lvbnNTb3J0aW5nLlVwZGF0ZWQpO1xuXHRcdGNvbnN0IHRvZGF5U2Vzc2lvbnMgPSBncm91cGVkLmdldChBZ2VudFNlc3Npb25TZWN0aW9uLlRvZGF5KSEuc2Vzc2lvbnM7XG5cdFx0Y29uc3Qgb2xkZXJTZXNzaW9ucyA9IGdyb3VwZWQuZ2V0KEFnZW50U2Vzc2lvblNlY3Rpb24uT2xkZXIpIS5zZXNzaW9ucztcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9kYXlTZXNzaW9ucy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob2xkZXJTZXNzaW9ucy5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdVcGRhdGVkOiBwaW5uZWQgYW5kIGFyY2hpdmVkIHNlc3Npb25zIGFyZSBub3QgYWZmZWN0ZWQgYnkgc29ydEJ5JywgKCkgPT4ge1xuXHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0Y29uc3QgdGVuRGF5c0FnbyA9IG5vdyAtIDEwICogMjQgKiA2MCAqIDYwICogMTAwMDtcblxuXHRcdGNvbnN0IHBpbm5lZE9sZCA9IGNyZWF0ZVNlc3Npb24oeyBpZDogJ3Bpbm5lZCcsIGNyZWF0ZWQ6IHRlbkRheXNBZ28sIGxhc3RSZXF1ZXN0RW5kZWQ6IG5vdywgaXNQaW5uZWQ6IHRydWUgfSk7XG5cdFx0Y29uc3QgYXJjaGl2ZWRPbGQgPSBjcmVhdGVTZXNzaW9uKHsgaWQ6ICdhcmNoaXZlZCcsIGNyZWF0ZWQ6IHRlbkRheXNBZ28sIGxhc3RSZXF1ZXN0RW5kZWQ6IG5vdywgaXNBcmNoaXZlZDogdHJ1ZSB9KTtcblxuXHRcdGNvbnN0IGdyb3VwZWQgPSBncm91cEFnZW50U2Vzc2lvbnNCeURhdGUoW3Bpbm5lZE9sZCwgYXJjaGl2ZWRPbGRdLCBBZ2VudFNlc3Npb25zU29ydGluZy5VcGRhdGVkKTtcblx0XHRjb25zdCBwaW5uZWRTZXNzaW9ucyA9IGdyb3VwZWQuZ2V0KEFnZW50U2Vzc2lvblNlY3Rpb24uUGlubmVkKSEuc2Vzc2lvbnM7XG5cdFx0Y29uc3QgYXJjaGl2ZWRTZXNzaW9ucyA9IGdyb3VwZWQuZ2V0KEFnZW50U2Vzc2lvblNlY3Rpb24uQXJjaGl2ZWQpIS5zZXNzaW9ucztcblx0XHRjb25zdCB0b2RheVNlc3Npb25zID0gZ3JvdXBlZC5nZXQoQWdlbnRTZXNzaW9uU2VjdGlvbi5Ub2RheSkhLnNlc3Npb25zO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwaW5uZWRTZXNzaW9ucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXJjaGl2ZWRTZXNzaW9ucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9kYXlTZXNzaW9ucy5sZW5ndGgsIDApO1xuXHR9KTtc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
