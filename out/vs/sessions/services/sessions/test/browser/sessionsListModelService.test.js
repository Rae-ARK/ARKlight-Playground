import assert from "assert";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../base/common/event.js";
import { constObservable, observableValue } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { IStorageService, InMemoryStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { SessionStatus } from "../../common/session.js";
import { ISessionsManagementService } from "../../common/sessionsManagement.js";
import { SessionListModelChangeKind, SessionsListModelService } from "../../browser/sessionsListModelService.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { mock } from "../../../../../base/test/common/mock.js";
function createSession(id, status = SessionStatus.Completed, opts) {
  return {
    sessionId: id,
    resource: URI.parse(`session://${id}`),
    providerId: "test",
    sessionType: "test",
    icon: Codicon.account,
    createdAt: opts?.createdAt ?? /* @__PURE__ */ new Date(),
    workspace: observableValue(`workspace-${id}`, void 0),
    title: observableValue(`title-${id}`, id),
    updatedAt: observableValue(`updatedAt-${id}`, opts?.updatedAt ?? /* @__PURE__ */ new Date()),
    status: observableValue(`status-${id}`, status),
    changesets: observableValue(`changesets-${id}`, []),
    changes: observableValue(`changes-${id}`, []),
    modelId: observableValue(`modelId-${id}`, void 0),
    mode: observableValue(`mode-${id}`, void 0),
    loading: observableValue(`loading-${id}`, false),
    isArchived: observableValue(`isArchived-${id}`, false),
    isRead: observableValue(`isRead-${id}`, true),
    description: observableValue(`description-${id}`, void 0),
    lastTurnEnd: observableValue(`lastTurnEnd-${id}`, void 0),
    chats: observableValue(`chats-${id}`, []),
    mainChat: constObservable(void 0),
    capabilities: constObservable({ supportsMultipleChats: false })
  };
}
suite("SessionsListModelService", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let service;
  let sessionsChangedEmitter;
  let sessionDeletedEmitter;
  setup(() => {
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
    sessionsChangedEmitter = disposables.add(new Emitter());
    sessionDeletedEmitter = disposables.add(new Emitter());
    instantiationService.stub(ISessionsManagementService, {
      ...mock(),
      onDidChangeSessions: sessionsChangedEmitter.event,
      onDidDeleteSession: sessionDeletedEmitter.event
    });
    service = disposables.add(instantiationService.createInstance(SessionsListModelService));
  });
  test("pinSession marks session as pinned", () => {
    const session = createSession("s1");
    assert.strictEqual(service.isSessionPinned(session), false);
    service.pinSession(session);
    assert.strictEqual(service.isSessionPinned(session), true);
  });
  test("unpinSession marks session as not pinned", () => {
    const session = createSession("s1");
    service.pinSession(session);
    service.unpinSession(session);
    assert.strictEqual(service.isSessionPinned(session), false);
  });
  test("pinSession is idempotent and fires onDidChange only once", () => {
    const session = createSession("s1");
    let changeCount = 0;
    disposables.add(service.onDidChange(() => changeCount++));
    service.pinSession(session);
    service.pinSession(session);
    assert.strictEqual(changeCount, 1);
  });
  test("unpinSession does not fire when not pinned", () => {
    const session = createSession("s1");
    let changeCount = 0;
    disposables.add(service.onDidChange(() => changeCount++));
    service.unpinSession(session);
    assert.strictEqual(changeCount, 0);
  });
  test("pinning one session does not affect another", () => {
    const s1 = createSession("s1");
    const s2 = createSession("s2");
    service.pinSession(s1);
    assert.strictEqual(service.isSessionPinned(s1), true);
    assert.strictEqual(service.isSessionPinned(s2), false);
  });
  test("unpinSessions unpins multiple sessions and fires once", () => {
    const s1 = createSession("s1");
    const s2 = createSession("s2");
    const s3 = createSession("s3");
    service.pinSession(s1);
    service.pinSession(s2);
    let changeCount = 0;
    disposables.add(service.onDidChange(() => changeCount++));
    service.unpinSessions([s1, s2, s3]);
    assert.deepStrictEqual(
      [service.isSessionPinned(s1), service.isSessionPinned(s2), changeCount],
      [false, false, 1]
    );
  });
  test("unpinSessions does not fire when none are pinned", () => {
    const s1 = createSession("s1");
    const s2 = createSession("s2");
    let changeCount = 0;
    disposables.add(service.onDidChange(() => changeCount++));
    service.unpinSessions([s1, s2]);
    assert.strictEqual(changeCount, 0);
  });
  test("onDidChange includes changes array with sessionId and kind", () => {
    const session = createSession("s1");
    const events = [];
    disposables.add(service.onDidChange((e) => events.push(e)));
    service.pinSession(session);
    service.unpinSession(session);
    assert.deepStrictEqual(events, [
      { changes: [{ sessionId: "s1", kind: SessionListModelChangeKind.Pinned }] },
      { changes: [{ sessionId: "s1", kind: SessionListModelChangeKind.Pinned }] }
    ]);
  });
  test("cleans up state when session is deleted", () => {
    const session = createSession("s1");
    service.pinSession(session);
    const events = [];
    disposables.add(service.onDidChange((e) => events.push(e)));
    sessionDeletedEmitter.fire(session);
    assert.strictEqual(service.isSessionPinned(session), false);
    assert.deepStrictEqual(events, [
      { changes: [{ sessionId: "s1", kind: SessionListModelChangeKind.Pinned }] }
    ]);
  });
  test("pin survives a session being evicted from the provider list", () => {
    const session = createSession("s1");
    service.pinSession(session);
    let changeCount = 0;
    disposables.add(service.onDidChange(() => changeCount++));
    sessionsChangedEmitter.fire({ added: [], removed: [session], changed: [] });
    assert.strictEqual(service.isSessionPinned(session), true);
    assert.strictEqual(changeCount, 0);
  });
  test("deletion does not fire when session has no state", () => {
    const session = createSession("s1");
    let changeCount = 0;
    disposables.add(service.onDidChange(() => changeCount++));
    sessionDeletedEmitter.fire(session);
    assert.strictEqual(changeCount, 0);
  });
  test("deletion does not affect other sessions", () => {
    const s1 = createSession("s1");
    const s2 = createSession("s2");
    service.pinSession(s1);
    service.pinSession(s2);
    sessionDeletedEmitter.fire(s1);
    assert.strictEqual(service.isSessionPinned(s1), false);
    assert.strictEqual(service.isSessionPinned(s2), true);
  });
  test("state is loaded from storage on construction", () => {
    const storageService = disposables.add(new InMemoryStorageService());
    storageService.store("sessionsListControl.pinnedSessions", JSON.stringify(["s1"]), StorageScope.PROFILE, StorageTarget.USER);
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IStorageService, storageService);
    instantiationService.stub(ISessionsManagementService, { ...mock(), onDidDeleteSession: disposables.add(new Emitter()).event });
    const loadedService = disposables.add(instantiationService.createInstance(SessionsListModelService));
    assert.strictEqual(loadedService.isSessionPinned(createSession("s1")), true);
    assert.strictEqual(loadedService.isSessionPinned(createSession("s2")), false);
  });
  test("corrupt storage data is handled gracefully", () => {
    const storageService = disposables.add(new InMemoryStorageService());
    storageService.store("sessionsListControl.pinnedSessions", "not-valid-json{", StorageScope.PROFILE, StorageTarget.USER);
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IStorageService, storageService);
    instantiationService.stub(ISessionsManagementService, { ...mock(), onDidDeleteSession: disposables.add(new Emitter()).event });
    const loadedService = disposables.add(instantiationService.createInstance(SessionsListModelService));
    assert.strictEqual(loadedService.isSessionPinned(createSession("s1")), false);
  });
  suite("migrateLegacyReadState", () => {
    const LEGACY_KEY = "sessionsListControl.readSessions";
    const PRE_CUTOFF = /* @__PURE__ */ new Date("2026-01-01T00:00:00.000Z");
    const POST_CUTOFF = /* @__PURE__ */ new Date("2026-06-01T00:00:00.000Z");
    function createServiceWithLegacyRead(ids) {
      const storage = disposables.add(new InMemoryStorageService());
      if (ids !== void 0) {
        storage.store(LEGACY_KEY, JSON.stringify(ids), StorageScope.PROFILE, StorageTarget.USER);
      }
      const readMarks = [];
      const unreadMarks = [];
      const instantiationService = disposables.add(new TestInstantiationService());
      instantiationService.stub(IStorageService, storage);
      instantiationService.stub(ISessionsManagementService, {
        ...mock(),
        onDidDeleteSession: disposables.add(new Emitter()).event,
        markRead: async (session) => {
          readMarks.push(session.sessionId);
        },
        markUnread: async (session) => {
          unreadMarks.push(session.sessionId);
        }
      });
      const service2 = disposables.add(instantiationService.createInstance(SessionsListModelService));
      return { service: service2, storage, readMarks, unreadMarks };
    }
    test("marks a session with a legacy read entry read", () => {
      const { readMarks, unreadMarks, service: service2 } = createServiceWithLegacyRead(["s1"]);
      service2.migrateLegacyReadState(createSession("s1", SessionStatus.Completed, { updatedAt: POST_CUTOFF }));
      assert.deepStrictEqual({ readMarks, unreadMarks }, { readMarks: ["s1"], unreadMarks: [] });
    });
    test("marks a pre-cutoff session read even without a legacy read entry", () => {
      const { readMarks, unreadMarks, service: service2 } = createServiceWithLegacyRead(void 0);
      service2.migrateLegacyReadState(createSession("old", SessionStatus.Completed, { updatedAt: PRE_CUTOFF }));
      assert.deepStrictEqual({ readMarks, unreadMarks }, { readMarks: ["old"], unreadMarks: [] });
    });
    test("never marks a session unread (recent session without a legacy read entry is left alone)", () => {
      const { readMarks, unreadMarks, service: service2 } = createServiceWithLegacyRead(["other"]);
      service2.migrateLegacyReadState(createSession("s1", SessionStatus.Completed, { updatedAt: POST_CUTOFF }));
      assert.deepStrictEqual({ readMarks, unreadMarks }, { readMarks: [], unreadMarks: [] });
    });
    test("is a no-op when there is no legacy read state and the session is recent", () => {
      const { readMarks, unreadMarks, service: service2 } = createServiceWithLegacyRead(void 0);
      service2.migrateLegacyReadState(createSession("s1", SessionStatus.Completed, { updatedAt: POST_CUTOFF }));
      assert.deepStrictEqual({ readMarks, unreadMarks }, { readMarks: [], unreadMarks: [] });
    });
    test("migrating the same read session twice marks it once", () => {
      const { readMarks, unreadMarks, service: service2 } = createServiceWithLegacyRead(["s1"]);
      const session = createSession("s1", SessionStatus.Completed, { updatedAt: POST_CUTOFF });
      service2.migrateLegacyReadState(session);
      service2.migrateLegacyReadState(session);
      assert.deepStrictEqual({ readMarks, unreadMarks }, { readMarks: ["s1"], unreadMarks: [] });
    });
    test("persists migrated read sessions so a fresh service does not re-mark them", () => {
      const storage = disposables.add(new InMemoryStorageService());
      storage.store(LEGACY_KEY, JSON.stringify(["s1"]), StorageScope.PROFILE, StorageTarget.USER);
      const readMarks = [];
      const unreadMarks = [];
      const makeService = () => {
        const instantiationService = disposables.add(new TestInstantiationService());
        instantiationService.stub(IStorageService, storage);
        instantiationService.stub(ISessionsManagementService, {
          ...mock(),
          onDidDeleteSession: disposables.add(new Emitter()).event,
          markRead: async (session2) => {
            readMarks.push(session2.sessionId);
          },
          markUnread: async (session2) => {
            unreadMarks.push(session2.sessionId);
          }
        });
        return disposables.add(instantiationService.createInstance(SessionsListModelService));
      };
      const session = createSession("s1", SessionStatus.Completed, { updatedAt: POST_CUTOFF });
      makeService().migrateLegacyReadState(session);
      makeService().migrateLegacyReadState(session);
      assert.deepStrictEqual({ readMarks, unreadMarks }, { readMarks: ["s1"], unreadMarks: [] });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL3NlcnZpY2VzL3Nlc3Npb25zL3Rlc3QvYnJvd3Nlci9zZXNzaW9uc0xpc3RNb2RlbFNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgSW5NZW1vcnlTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdCwgSVNlc3Npb24sIFNlc3Npb25TdGF0dXMgfSBmcm9tICcuLi8uLi9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNDaGFuZ2VFdmVudCwgSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vc2Vzc2lvbnNNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElTZXNzaW9uTGlzdE1vZGVsQ2hhbmdlRXZlbnQsIFNlc3Npb25MaXN0TW9kZWxDaGFuZ2VLaW5kLCBTZXNzaW9uc0xpc3RNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL3Nlc3Npb25zTGlzdE1vZGVsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcblxuZnVuY3Rpb24gY3JlYXRlU2Vzc2lvbihpZDogc3RyaW5nLCBzdGF0dXM6IFNlc3Npb25TdGF0dXMgPSBTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgb3B0cz86IHsgY3JlYXRlZEF0PzogRGF0ZTsgdXBkYXRlZEF0PzogRGF0ZSB9KTogSVNlc3Npb24ge1xuXHRyZXR1cm4ge1xuXHRcdHNlc3Npb25JZDogaWQsXG5cdFx0cmVzb3VyY2U6IFVSSS5wYXJzZShgc2Vzc2lvbjovLyR7aWR9YCksXG5cdFx0cHJvdmlkZXJJZDogJ3Rlc3QnLFxuXHRcdHNlc3Npb25UeXBlOiAndGVzdCcsXG5cdFx0aWNvbjogQ29kaWNvbi5hY2NvdW50LFxuXHRcdGNyZWF0ZWRBdDogb3B0cz8uY3JlYXRlZEF0ID8/IG5ldyBEYXRlKCksXG5cdFx0d29ya3NwYWNlOiBvYnNlcnZhYmxlVmFsdWUoYHdvcmtzcGFjZS0ke2lkfWAsIHVuZGVmaW5lZCksXG5cdFx0dGl0bGU6IG9ic2VydmFibGVWYWx1ZShgdGl0bGUtJHtpZH1gLCBpZCksXG5cdFx0dXBkYXRlZEF0OiBvYnNlcnZhYmxlVmFsdWUoYHVwZGF0ZWRBdC0ke2lkfWAsIG9wdHM/LnVwZGF0ZWRBdCA/PyBuZXcgRGF0ZSgpKSxcblx0XHRzdGF0dXM6IG9ic2VydmFibGVWYWx1ZShgc3RhdHVzLSR7aWR9YCwgc3RhdHVzKSxcblx0XHRjaGFuZ2VzZXRzOiBvYnNlcnZhYmxlVmFsdWUoYGNoYW5nZXNldHMtJHtpZH1gLCBbXSksXG5cdFx0Y2hhbmdlczogb2JzZXJ2YWJsZVZhbHVlKGBjaGFuZ2VzLSR7aWR9YCwgW10pLFxuXHRcdG1vZGVsSWQ6IG9ic2VydmFibGVWYWx1ZShgbW9kZWxJZC0ke2lkfWAsIHVuZGVmaW5lZCksXG5cdFx0bW9kZTogb2JzZXJ2YWJsZVZhbHVlKGBtb2RlLSR7aWR9YCwgdW5kZWZpbmVkKSxcblx0XHRsb2FkaW5nOiBvYnNlcnZhYmxlVmFsdWUoYGxvYWRpbmctJHtpZH1gLCBmYWxzZSksXG5cdFx0aXNBcmNoaXZlZDogb2JzZXJ2YWJsZVZhbHVlKGBpc0FyY2hpdmVkLSR7aWR9YCwgZmFsc2UpLFxuXHRcdGlzUmVhZDogb2JzZXJ2YWJsZVZhbHVlKGBpc1JlYWQtJHtpZH1gLCB0cnVlKSxcblx0XHRkZXNjcmlwdGlvbjogb2JzZXJ2YWJsZVZhbHVlKGBkZXNjcmlwdGlvbi0ke2lkfWAsIHVuZGVmaW5lZCksXG5cdFx0bGFzdFR1cm5FbmQ6IG9ic2VydmFibGVWYWx1ZShgbGFzdFR1cm5FbmQtJHtpZH1gLCB1bmRlZmluZWQpLFxuXHRcdGNoYXRzOiBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUNoYXRbXT4oYGNoYXRzLSR7aWR9YCwgW10pLFxuXHRcdG1haW5DaGF0OiBjb25zdE9ic2VydmFibGU8SUNoYXQ+KHVuZGVmaW5lZCEpLFxuXHRcdGNhcGFiaWxpdGllczogY29uc3RPYnNlcnZhYmxlKHsgc3VwcG9ydHNNdWx0aXBsZUNoYXRzOiBmYWxzZSB9KSxcblx0fTtcbn1cblxuc3VpdGUoJ1Nlc3Npb25zTGlzdE1vZGVsU2VydmljZScsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHRsZXQgc2VydmljZTogU2Vzc2lvbnNMaXN0TW9kZWxTZXJ2aWNlO1xuXHRsZXQgc2Vzc2lvbnNDaGFuZ2VkRW1pdHRlcjogRW1pdHRlcjxJU2Vzc2lvbnNDaGFuZ2VFdmVudD47XG5cdGxldCBzZXNzaW9uRGVsZXRlZEVtaXR0ZXI6IEVtaXR0ZXI8SVNlc3Npb24+O1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSkpO1xuXHRcdHNlc3Npb25zQ2hhbmdlZEVtaXR0ZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8SVNlc3Npb25zQ2hhbmdlRXZlbnQ+KCkpO1xuXHRcdHNlc3Npb25EZWxldGVkRW1pdHRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxJU2Vzc2lvbj4oKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSwge1xuXHRcdFx0Li4ubW9jazxJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZT4oKSxcblx0XHRcdG9uRGlkQ2hhbmdlU2Vzc2lvbnM6IHNlc3Npb25zQ2hhbmdlZEVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRvbkRpZERlbGV0ZVNlc3Npb246IHNlc3Npb25EZWxldGVkRW1pdHRlci5ldmVudCxcblx0XHR9KTtcblx0XHRzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25zTGlzdE1vZGVsU2VydmljZSkpO1xuXHR9KTtcblxuXHQvLyAtLSBQaW5uaW5nIC0tXG5cblx0dGVzdCgncGluU2Vzc2lvbiBtYXJrcyBzZXNzaW9uIGFzIHBpbm5lZCcsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlU2Vzc2lvbignczEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5pc1Nlc3Npb25QaW5uZWQoc2Vzc2lvbiksIGZhbHNlKTtcblxuXHRcdHNlcnZpY2UucGluU2Vzc2lvbihzZXNzaW9uKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmlzU2Vzc2lvblBpbm5lZChzZXNzaW9uKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VucGluU2Vzc2lvbiBtYXJrcyBzZXNzaW9uIGFzIG5vdCBwaW5uZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ3MxJyk7XG5cdFx0c2VydmljZS5waW5TZXNzaW9uKHNlc3Npb24pO1xuXG5cdFx0c2VydmljZS51bnBpblNlc3Npb24oc2Vzc2lvbik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5pc1Nlc3Npb25QaW5uZWQoc2Vzc2lvbiksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgncGluU2Vzc2lvbiBpcyBpZGVtcG90ZW50IGFuZCBmaXJlcyBvbkRpZENoYW5nZSBvbmx5IG9uY2UnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ3MxJyk7XG5cdFx0bGV0IGNoYW5nZUNvdW50ID0gMDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZENoYW5nZSgoKSA9PiBjaGFuZ2VDb3VudCsrKSk7XG5cblx0XHRzZXJ2aWNlLnBpblNlc3Npb24oc2Vzc2lvbik7XG5cdFx0c2VydmljZS5waW5TZXNzaW9uKHNlc3Npb24pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZUNvdW50LCAxKTtcblx0fSk7XG5cblx0dGVzdCgndW5waW5TZXNzaW9uIGRvZXMgbm90IGZpcmUgd2hlbiBub3QgcGlubmVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKCdzMScpO1xuXHRcdGxldCBjaGFuZ2VDb3VudCA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRDaGFuZ2UoKCkgPT4gY2hhbmdlQ291bnQrKykpO1xuXG5cdFx0c2VydmljZS51bnBpblNlc3Npb24oc2Vzc2lvbik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlQ291bnQsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdwaW5uaW5nIG9uZSBzZXNzaW9uIGRvZXMgbm90IGFmZmVjdCBhbm90aGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHMxID0gY3JlYXRlU2Vzc2lvbignczEnKTtcblx0XHRjb25zdCBzMiA9IGNyZWF0ZVNlc3Npb24oJ3MyJyk7XG5cblx0XHRzZXJ2aWNlLnBpblNlc3Npb24oczEpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuaXNTZXNzaW9uUGlubmVkKHMxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuaXNTZXNzaW9uUGlubmVkKHMyKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCd1bnBpblNlc3Npb25zIHVucGlucyBtdWx0aXBsZSBzZXNzaW9ucyBhbmQgZmlyZXMgb25jZScsICgpID0+IHtcblx0XHRjb25zdCBzMSA9IGNyZWF0ZVNlc3Npb24oJ3MxJyk7XG5cdFx0Y29uc3QgczIgPSBjcmVhdGVTZXNzaW9uKCdzMicpO1xuXHRcdGNvbnN0IHMzID0gY3JlYXRlU2Vzc2lvbignczMnKTtcblx0XHRzZXJ2aWNlLnBpblNlc3Npb24oczEpO1xuXHRcdHNlcnZpY2UucGluU2Vzc2lvbihzMik7XG5cdFx0bGV0IGNoYW5nZUNvdW50ID0gMDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZENoYW5nZSgoKSA9PiBjaGFuZ2VDb3VudCsrKSk7XG5cblx0XHRzZXJ2aWNlLnVucGluU2Vzc2lvbnMoW3MxLCBzMiwgczNdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRbc2VydmljZS5pc1Nlc3Npb25QaW5uZWQoczEpLCBzZXJ2aWNlLmlzU2Vzc2lvblBpbm5lZChzMiksIGNoYW5nZUNvdW50XSxcblx0XHRcdFtmYWxzZSwgZmFsc2UsIDFdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgndW5waW5TZXNzaW9ucyBkb2VzIG5vdCBmaXJlIHdoZW4gbm9uZSBhcmUgcGlubmVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHMxID0gY3JlYXRlU2Vzc2lvbignczEnKTtcblx0XHRjb25zdCBzMiA9IGNyZWF0ZVNlc3Npb24oJ3MyJyk7XG5cdFx0bGV0IGNoYW5nZUNvdW50ID0gMDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZENoYW5nZSgoKSA9PiBjaGFuZ2VDb3VudCsrKSk7XG5cblx0XHRzZXJ2aWNlLnVucGluU2Vzc2lvbnMoW3MxLCBzMl0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZUNvdW50LCAwKTtcblx0fSk7XG5cblx0Ly8gLS0gb25EaWRDaGFuZ2UgLS1cblxuXHR0ZXN0KCdvbkRpZENoYW5nZSBpbmNsdWRlcyBjaGFuZ2VzIGFycmF5IHdpdGggc2Vzc2lvbklkIGFuZCBraW5kJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKCdzMScpO1xuXHRcdGNvbnN0IGV2ZW50czogSVNlc3Npb25MaXN0TW9kZWxDaGFuZ2VFdmVudFtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRDaGFuZ2UoZSA9PiBldmVudHMucHVzaChlKSkpO1xuXG5cdFx0c2VydmljZS5waW5TZXNzaW9uKHNlc3Npb24pO1xuXHRcdHNlcnZpY2UudW5waW5TZXNzaW9uKHNlc3Npb24pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChldmVudHMsIFtcblx0XHRcdHsgY2hhbmdlczogW3sgc2Vzc2lvbklkOiAnczEnLCBraW5kOiBTZXNzaW9uTGlzdE1vZGVsQ2hhbmdlS2luZC5QaW5uZWQgfV0gfSxcblx0XHRcdHsgY2hhbmdlczogW3sgc2Vzc2lvbklkOiAnczEnLCBraW5kOiBTZXNzaW9uTGlzdE1vZGVsQ2hhbmdlS2luZC5QaW5uZWQgfV0gfSxcblx0XHRdKTtcblx0fSk7XG5cblx0Ly8gLS0gQ2xlYW51cCAtLVxuXG5cdHRlc3QoJ2NsZWFucyB1cCBzdGF0ZSB3aGVuIHNlc3Npb24gaXMgZGVsZXRlZCcsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlU2Vzc2lvbignczEnKTtcblx0XHRzZXJ2aWNlLnBpblNlc3Npb24oc2Vzc2lvbik7XG5cblx0XHRjb25zdCBldmVudHM6IElTZXNzaW9uTGlzdE1vZGVsQ2hhbmdlRXZlbnRbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkQ2hhbmdlKGUgPT4gZXZlbnRzLnB1c2goZSkpKTtcblxuXHRcdHNlc3Npb25EZWxldGVkRW1pdHRlci5maXJlKHNlc3Npb24pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuaXNTZXNzaW9uUGlubmVkKHNlc3Npb24pLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChldmVudHMsIFtcblx0XHRcdHsgY2hhbmdlczogW3sgc2Vzc2lvbklkOiAnczEnLCBraW5kOiBTZXNzaW9uTGlzdE1vZGVsQ2hhbmdlS2luZC5QaW5uZWQgfV0gfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgncGluIHN1cnZpdmVzIGEgc2Vzc2lvbiBiZWluZyBldmljdGVkIGZyb20gdGhlIHByb3ZpZGVyIGxpc3QnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ3MxJyk7XG5cdFx0c2VydmljZS5waW5TZXNzaW9uKHNlc3Npb24pO1xuXG5cdFx0bGV0IGNoYW5nZUNvdW50ID0gMDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZENoYW5nZSgoKSA9PiBjaGFuZ2VDb3VudCsrKSk7XG5cblx0XHQvLyBBbiBhZ2VudCB0aGF0IGNhbm5vdCBhbnN3ZXIgYGxpc3RTZXNzaW9uc2AgeWV0IHJlcG9ydHMgbm8gc2Vzc2lvbnMsXG5cdFx0Ly8gc28gdGhlIGxpc3QgZXZpY3RzIHRoZW0gdW50aWwgdGhlIG5leHQgcmVmcmVzaC4gVGhhdCBtdXN0IG5vdCB1bnBpbi5cblx0XHRzZXNzaW9uc0NoYW5nZWRFbWl0dGVyLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtzZXNzaW9uXSwgY2hhbmdlZDogW10gfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5pc1Nlc3Npb25QaW5uZWQoc2Vzc2lvbiksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VDb3VudCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0aW9uIGRvZXMgbm90IGZpcmUgd2hlbiBzZXNzaW9uIGhhcyBubyBzdGF0ZScsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlU2Vzc2lvbignczEnKTtcblx0XHRsZXQgY2hhbmdlQ291bnQgPSAwO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkQ2hhbmdlKCgpID0+IGNoYW5nZUNvdW50KyspKTtcblxuXHRcdHNlc3Npb25EZWxldGVkRW1pdHRlci5maXJlKHNlc3Npb24pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZUNvdW50LCAwKTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRpb24gZG9lcyBub3QgYWZmZWN0IG90aGVyIHNlc3Npb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IHMxID0gY3JlYXRlU2Vzc2lvbignczEnKTtcblx0XHRjb25zdCBzMiA9IGNyZWF0ZVNlc3Npb24oJ3MyJyk7XG5cdFx0c2VydmljZS5waW5TZXNzaW9uKHMxKTtcblx0XHRzZXJ2aWNlLnBpblNlc3Npb24oczIpO1xuXG5cdFx0c2Vzc2lvbkRlbGV0ZWRFbWl0dGVyLmZpcmUoczEpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuaXNTZXNzaW9uUGlubmVkKHMxKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmlzU2Vzc2lvblBpbm5lZChzMiksIHRydWUpO1xuXHR9KTtcblxuXHQvLyAtLSBTdG9yYWdlIHBlcnNpc3RlbmNlIC0tXG5cblx0dGVzdCgnc3RhdGUgaXMgbG9hZGVkIGZyb20gc3RvcmFnZSBvbiBjb25zdHJ1Y3Rpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cblx0XHQvLyBQcmUtcG9wdWxhdGUgc3RvcmFnZVxuXHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKCdzZXNzaW9uc0xpc3RDb250cm9sLnBpbm5lZFNlc3Npb25zJywgSlNPTi5zdHJpbmdpZnkoWydzMSddKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSwgeyAuLi5tb2NrPElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlPigpLCBvbkRpZERlbGV0ZVNlc3Npb246IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxJU2Vzc2lvbj4oKSkuZXZlbnQgfSk7XG5cdFx0Y29uc3QgbG9hZGVkU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uc0xpc3RNb2RlbFNlcnZpY2UpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsb2FkZWRTZXJ2aWNlLmlzU2Vzc2lvblBpbm5lZChjcmVhdGVTZXNzaW9uKCdzMScpKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxvYWRlZFNlcnZpY2UuaXNTZXNzaW9uUGlubmVkKGNyZWF0ZVNlc3Npb24oJ3MyJykpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvcnJ1cHQgc3RvcmFnZSBkYXRhIGlzIGhhbmRsZWQgZ3JhY2VmdWxseScsICgpID0+IHtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRzdG9yYWdlU2VydmljZS5zdG9yZSgnc2Vzc2lvbnNMaXN0Q29udHJvbC5waW5uZWRTZXNzaW9ucycsICdub3QtdmFsaWQtanNvbnsnLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblxuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLCB7IC4uLm1vY2s8SVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U+KCksIG9uRGlkRGVsZXRlU2Vzc2lvbjogZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPElTZXNzaW9uPigpKS5ldmVudCB9KTtcblx0XHRjb25zdCBsb2FkZWRTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25zTGlzdE1vZGVsU2VydmljZSkpO1xuXG5cdFx0Ly8gU2hvdWxkIG5vdCB0aHJvdyBhbmQgc2hvdWxkIHJldHVybiBlbXB0eSBzdGF0ZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsb2FkZWRTZXJ2aWNlLmlzU2Vzc2lvblBpbm5lZChjcmVhdGVTZXNzaW9uKCdzMScpKSwgZmFsc2UpO1xuXHR9KTtcblxuXHQvLyAtLSBMZWdhY3kgcmVhZC1zdGF0ZSBtaWdyYXRpb24gLS1cblxuXHRzdWl0ZSgnbWlncmF0ZUxlZ2FjeVJlYWRTdGF0ZScsICgpID0+IHtcblxuXHRcdGNvbnN0IExFR0FDWV9LRVkgPSAnc2Vzc2lvbnNMaXN0Q29udHJvbC5yZWFkU2Vzc2lvbnMnO1xuXHRcdC8vIEZpeGVkIHJlZmVyZW5jZSBwb2ludHMgcmVsYXRpdmUgdG8gdGhlIG1pZ3JhdGlvbidzIDIwMjYtMDUtMTIgY3V0b2ZmLlxuXHRcdGNvbnN0IFBSRV9DVVRPRkYgPSBuZXcgRGF0ZSgnMjAyNi0wMS0wMVQwMDowMDowMC4wMDBaJyk7XG5cdFx0Y29uc3QgUE9TVF9DVVRPRkYgPSBuZXcgRGF0ZSgnMjAyNi0wNi0wMVQwMDowMDowMC4wMDBaJyk7XG5cblx0XHRmdW5jdGlvbiBjcmVhdGVTZXJ2aWNlV2l0aExlZ2FjeVJlYWQoaWRzOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCk6IHsgc2VydmljZTogU2Vzc2lvbnNMaXN0TW9kZWxTZXJ2aWNlOyBzdG9yYWdlOiBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlOyByZWFkTWFya3M6IHN0cmluZ1tdOyB1bnJlYWRNYXJrczogc3RyaW5nW10gfSB7XG5cdFx0XHRjb25zdCBzdG9yYWdlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdFx0aWYgKGlkcyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHN0b3JhZ2Uuc3RvcmUoTEVHQUNZX0tFWSwgSlNPTi5zdHJpbmdpZnkoaWRzKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZWFkTWFya3M6IHN0cmluZ1tdID0gW107XG5cdFx0XHRjb25zdCB1bnJlYWRNYXJrczogc3RyaW5nW10gPSBbXTtcblx0XHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgc3RvcmFnZSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLCB7XG5cdFx0XHRcdC4uLm1vY2s8SVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U+KCksXG5cdFx0XHRcdG9uRGlkRGVsZXRlU2Vzc2lvbjogZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPElTZXNzaW9uPigpKS5ldmVudCxcblx0XHRcdFx0bWFya1JlYWQ6IGFzeW5jIChzZXNzaW9uOiBJU2Vzc2lvbikgPT4geyByZWFkTWFya3MucHVzaChzZXNzaW9uLnNlc3Npb25JZCk7IH0sXG5cdFx0XHRcdG1hcmtVbnJlYWQ6IGFzeW5jIChzZXNzaW9uOiBJU2Vzc2lvbikgPT4geyB1bnJlYWRNYXJrcy5wdXNoKHNlc3Npb24uc2Vzc2lvbklkKTsgfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uc0xpc3RNb2RlbFNlcnZpY2UpKTtcblx0XHRcdHJldHVybiB7IHNlcnZpY2UsIHN0b3JhZ2UsIHJlYWRNYXJrcywgdW5yZWFkTWFya3MgfTtcblx0XHR9XG5cblx0XHR0ZXN0KCdtYXJrcyBhIHNlc3Npb24gd2l0aCBhIGxlZ2FjeSByZWFkIGVudHJ5IHJlYWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHJlYWRNYXJrcywgdW5yZWFkTWFya3MsIHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2VXaXRoTGVnYWN5UmVhZChbJ3MxJ10pO1xuXHRcdFx0c2VydmljZS5taWdyYXRlTGVnYWN5UmVhZFN0YXRlKGNyZWF0ZVNlc3Npb24oJ3MxJywgU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsIHsgdXBkYXRlZEF0OiBQT1NUX0NVVE9GRiB9KSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyByZWFkTWFya3MsIHVucmVhZE1hcmtzIH0sIHsgcmVhZE1hcmtzOiBbJ3MxJ10sIHVucmVhZE1hcmtzOiBbXSB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hcmtzIGEgcHJlLWN1dG9mZiBzZXNzaW9uIHJlYWQgZXZlbiB3aXRob3V0IGEgbGVnYWN5IHJlYWQgZW50cnknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHJlYWRNYXJrcywgdW5yZWFkTWFya3MsIHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2VXaXRoTGVnYWN5UmVhZCh1bmRlZmluZWQpO1xuXHRcdFx0c2VydmljZS5taWdyYXRlTGVnYWN5UmVhZFN0YXRlKGNyZWF0ZVNlc3Npb24oJ29sZCcsIFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLCB7IHVwZGF0ZWRBdDogUFJFX0NVVE9GRiB9KSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyByZWFkTWFya3MsIHVucmVhZE1hcmtzIH0sIHsgcmVhZE1hcmtzOiBbJ29sZCddLCB1bnJlYWRNYXJrczogW10gfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCduZXZlciBtYXJrcyBhIHNlc3Npb24gdW5yZWFkIChyZWNlbnQgc2Vzc2lvbiB3aXRob3V0IGEgbGVnYWN5IHJlYWQgZW50cnkgaXMgbGVmdCBhbG9uZSknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHJlYWRNYXJrcywgdW5yZWFkTWFya3MsIHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2VXaXRoTGVnYWN5UmVhZChbJ290aGVyJ10pO1xuXHRcdFx0c2VydmljZS5taWdyYXRlTGVnYWN5UmVhZFN0YXRlKGNyZWF0ZVNlc3Npb24oJ3MxJywgU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsIHsgdXBkYXRlZEF0OiBQT1NUX0NVVE9GRiB9KSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyByZWFkTWFya3MsIHVucmVhZE1hcmtzIH0sIHsgcmVhZE1hcmtzOiBbXSwgdW5yZWFkTWFya3M6IFtdIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaXMgYSBuby1vcCB3aGVuIHRoZXJlIGlzIG5vIGxlZ2FjeSByZWFkIHN0YXRlIGFuZCB0aGUgc2Vzc2lvbiBpcyByZWNlbnQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHJlYWRNYXJrcywgdW5yZWFkTWFya3MsIHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2VXaXRoTGVnYWN5UmVhZCh1bmRlZmluZWQpO1xuXHRcdFx0c2VydmljZS5taWdyYXRlTGVnYWN5UmVhZFN0YXRlKGNyZWF0ZVNlc3Npb24oJ3MxJywgU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsIHsgdXBkYXRlZEF0OiBQT1NUX0NVVE9GRiB9KSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyByZWFkTWFya3MsIHVucmVhZE1hcmtzIH0sIHsgcmVhZE1hcmtzOiBbXSwgdW5yZWFkTWFya3M6IFtdIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWlncmF0aW5nIHRoZSBzYW1lIHJlYWQgc2Vzc2lvbiB0d2ljZSBtYXJrcyBpdCBvbmNlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyByZWFkTWFya3MsIHVucmVhZE1hcmtzLCBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlV2l0aExlZ2FjeVJlYWQoWydzMSddKTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKCdzMScsIFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLCB7IHVwZGF0ZWRBdDogUE9TVF9DVVRPRkYgfSk7XG5cdFx0XHRzZXJ2aWNlLm1pZ3JhdGVMZWdhY3lSZWFkU3RhdGUoc2Vzc2lvbik7XG5cdFx0XHRzZXJ2aWNlLm1pZ3JhdGVMZWdhY3lSZWFkU3RhdGUoc2Vzc2lvbik7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyByZWFkTWFya3MsIHVucmVhZE1hcmtzIH0sIHsgcmVhZE1hcmtzOiBbJ3MxJ10sIHVucmVhZE1hcmtzOiBbXSB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BlcnNpc3RzIG1pZ3JhdGVkIHJlYWQgc2Vzc2lvbnMgc28gYSBmcmVzaCBzZXJ2aWNlIGRvZXMgbm90IHJlLW1hcmsgdGhlbScsICgpID0+IHtcblx0XHRcdGNvbnN0IHN0b3JhZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0XHRzdG9yYWdlLnN0b3JlKExFR0FDWV9LRVksIEpTT04uc3RyaW5naWZ5KFsnczEnXSksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRcdFx0Y29uc3QgcmVhZE1hcmtzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Y29uc3QgdW5yZWFkTWFya3M6IHN0cmluZ1tdID0gW107XG5cdFx0XHRjb25zdCBtYWtlU2VydmljZSA9ICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIHN0b3JhZ2UpO1xuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLCB7XG5cdFx0XHRcdFx0Li4ubW9jazxJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZT4oKSxcblx0XHRcdFx0XHRvbkRpZERlbGV0ZVNlc3Npb246IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxJU2Vzc2lvbj4oKSkuZXZlbnQsXG5cdFx0XHRcdFx0bWFya1JlYWQ6IGFzeW5jIChzZXNzaW9uOiBJU2Vzc2lvbikgPT4geyByZWFkTWFya3MucHVzaChzZXNzaW9uLnNlc3Npb25JZCk7IH0sXG5cdFx0XHRcdFx0bWFya1VucmVhZDogYXN5bmMgKHNlc3Npb246IElTZXNzaW9uKSA9PiB7IHVucmVhZE1hcmtzLnB1c2goc2Vzc2lvbi5zZXNzaW9uSWQpOyB9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0cmV0dXJuIGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uc0xpc3RNb2RlbFNlcnZpY2UpKTtcblx0XHRcdH07XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlU2Vzc2lvbignczEnLCBTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgeyB1cGRhdGVkQXQ6IFBPU1RfQ1VUT0ZGIH0pO1xuXG5cdFx0XHRtYWtlU2VydmljZSgpLm1pZ3JhdGVMZWdhY3lSZWFkU3RhdGUoc2Vzc2lvbik7XG5cdFx0XHQvLyBBIGxhdGVyIGxhdW5jaCByZWxvYWRzIHRoZSBwZXJzaXN0ZWQgXCJkb25lXCIgc2V0IGFuZCBtdXN0IHNraXAgaXQsXG5cdFx0XHQvLyBzbyBhIHN1YnNlcXVlbnQgdW5yZWFkIChlLmcuIGEgbmV3IHR1cm4pIGlzIG5vdCByZS1mbGlwcGVkIHRvIHJlYWQuXG5cdFx0XHRtYWtlU2VydmljZSgpLm1pZ3JhdGVMZWdhY3lSZWFkU3RhdGUoc2Vzc2lvbik7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyByZWFkTWFya3MsIHVucmVhZE1hcmtzIH0sIHsgcmVhZE1hcmtzOiBbJ3MxJ10sIHVucmVhZE1hcmtzOiBbXSB9KTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsaUJBQWlCLHVCQUF1QjtBQUNqRCxTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxpQkFBaUIsd0JBQXdCLGNBQWMscUJBQXFCO0FBQ3JGLFNBQTBCLHFCQUFxQjtBQUMvQyxTQUErQixrQ0FBa0M7QUFDakUsU0FBdUMsNEJBQTRCLGdDQUFnQztBQUNuRyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLFlBQVk7QUFFckIsU0FBUyxjQUFjLElBQVksU0FBd0IsY0FBYyxXQUFXLE1BQXlEO0FBQzVJLFNBQU87QUFBQSxJQUNOLFdBQVc7QUFBQSxJQUNYLFVBQVUsSUFBSSxNQUFNLGFBQWEsRUFBRSxFQUFFO0FBQUEsSUFDckMsWUFBWTtBQUFBLElBQ1osYUFBYTtBQUFBLElBQ2IsTUFBTSxRQUFRO0FBQUEsSUFDZCxXQUFXLE1BQU0sYUFBYSxvQkFBSSxLQUFLO0FBQUEsSUFDdkMsV0FBVyxnQkFBZ0IsYUFBYSxFQUFFLElBQUksTUFBUztBQUFBLElBQ3ZELE9BQU8sZ0JBQWdCLFNBQVMsRUFBRSxJQUFJLEVBQUU7QUFBQSxJQUN4QyxXQUFXLGdCQUFnQixhQUFhLEVBQUUsSUFBSSxNQUFNLGFBQWEsb0JBQUksS0FBSyxDQUFDO0FBQUEsSUFDM0UsUUFBUSxnQkFBZ0IsVUFBVSxFQUFFLElBQUksTUFBTTtBQUFBLElBQzlDLFlBQVksZ0JBQWdCLGNBQWMsRUFBRSxJQUFJLENBQUMsQ0FBQztBQUFBLElBQ2xELFNBQVMsZ0JBQWdCLFdBQVcs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R0FBRyxFQUFFLFdBQVcsQ0FBQyxHQUFHLGFBQWEsQ0FBQyxFQUFFLENBQUM7QUFBQSxJQUN0RixDQUFDO0FBRUQsU0FBSyx1REFBdUQsTUFBTTtBQUNqRSxZQUFNLEVBQUUsV0FBVyxhQUFhLFNBQUFBLFNBQVEsSUFBSSw0QkFBNEIsQ0FBQyxJQUFJLENBQUM7QUFDOUUsWUFBTSxVQUFVLGNBQWMsTUFBTSxjQUFjLFdBQVcsRUFBRSxXQUFXLFlBQVksQ0FBQztBQUN2RixNQUFBQSxTQUFRLHVCQUF1QixPQUFPO0FBQ3RDLE1BQUFBLFNBQVEsdUJBQXVCLE9BQU87QUFFdEMsYUFBTyxnQkFBZ0IsRUFBRSxXQUFXLFlBQVksR0FBRyxFQUFFLFdBQVcsQ0FBQyxJQUFJLEdBQUcsYUFBYSxDQUFDLEVBQUUsQ0FBQztBQUFBLElBQzFGLENBQUM7QUFFRCxTQUFLLDRFQUE0RSxNQUFNO0FBQ3RGLFlBQU0sVUFBVSxZQUFZLElBQUksSUFBSSx1QkFBdUIsQ0FBQztBQUM1RCxjQUFRLE1BQU0sWUFBWSxLQUFLLFVBQVUsQ0FBQyxJQUFJLENBQUMsR0FBRyxhQUFhLFNBQVMsY0FBYyxJQUFJO0FBQzFGLFlBQU0sWUFBc0IsQ0FBQztBQUM3QixZQUFNLGNBQXdCLENBQUM7QUFDL0IsWUFBTSxjQUFjLE1BQU07QUFDekIsY0FBTSx1QkFBdUIsWUFBWSxJQUFJLElBQUkseUJBQXlCLENBQUM7QUFDM0UsNkJBQXFCLEtBQUssaUJBQWlCLE9BQU87QUFDbEQsNkJBQXFCLEtBQUssNEJBQTRCO0FBQUEsVUFDckQsR0FBRyxLQUFpQztBQUFBLFVBQ3BDLG9CQUFvQixZQUFZLElBQUksSUFBSSxRQUFrQixDQUFDLEVBQUU7QUFBQSxVQUM3RCxVQUFVLE9BQU9DLGFBQXNCO0FBQUUsc0JBQVUsS0FBS0EsU0FBUSxTQUFTO0FBQUEsVUFBRztBQUFBLFVBQzVFLFlBQVksT0FBT0EsYUFBc0I7QUFBRSx3QkFBWSxLQUFLQSxTQUFRLFNBQVM7QUFBQSxVQUFHO0FBQUEsUUFDakYsQ0FBQztBQUNELGVBQU8sWUFBWSxJQUFJLHFCQUFxQixlQUFlLHdCQUF3QixDQUFDO0FBQUEsTUFDckY7QUFDQSxZQUFNLFVBQVUsY0FBYyxNQUFNLGNBQWMsV0FBVyxFQUFFLFdBQVcsWUFBWSxDQUFDO0FBRXZGLGtCQUFZLEVBQUUsdUJBQXVCLE9BQU87QUFHNUMsa0JBQVksRUFBRSx1QkFBdUIsT0FBTztBQUU1QyxhQUFPLGdCQUFnQixFQUFFLFdBQVcsWUFBWSxHQUFHLEVBQUUsV0FBVyxDQUFDLElBQUksR0FBRyxhQUFhLENBQUMsRUFBRSxDQUFDO0FBQUEsSUFDMUYsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbInNlcnZpY2UiLCAic2Vzc2lvbiJdCn0K
