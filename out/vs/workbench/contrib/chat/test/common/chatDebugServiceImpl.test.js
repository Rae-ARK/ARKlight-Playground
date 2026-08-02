import assert from "assert";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { errorHandler } from "../../../../../base/common/errors.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ChatDebugLogLevel } from "../../common/chatDebugService.js";
import { ChatDebugServiceImpl } from "../../common/chatDebugServiceImpl.js";
import { LocalChatSessionUri } from "../../common/model/chatUri.js";
suite("ChatDebugServiceImpl", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let service;
  const session1 = URI.parse("vscode-chat-session://local/session-1");
  const session2 = URI.parse("vscode-chat-session://local/session-2");
  const sessionA = LocalChatSessionUri.forSession("a");
  const sessionB = LocalChatSessionUri.forSession("b");
  const sessionGeneric = URI.parse("vscode-chat-session://local/session");
  const nonLocalSession = URI.parse("some-other-scheme://authority/session-1");
  const copilotCliSession = URI.parse("copilotcli:/test-session-id");
  const claudeCodeSession = URI.parse("claude-code:/test-session-id");
  setup(() => {
    service = disposables.add(new ChatDebugServiceImpl(new TestConfigurationService()));
  });
  suite("addEvent and getEvents", () => {
    test("should add and retrieve events", () => {
      const event = {
        kind: "generic",
        sessionResource: session1,
        created: /* @__PURE__ */ new Date(),
        name: "test-event",
        level: ChatDebugLogLevel.Info
      };
      service.addEvent(event);
      assert.deepStrictEqual(service.getEvents(), [event]);
    });
    test("should filter events by sessionResource", () => {
      const event1 = {
        kind: "generic",
        sessionResource: session1,
        created: /* @__PURE__ */ new Date(),
        name: "event-1",
        level: ChatDebugLogLevel.Info
      };
      const event2 = {
        kind: "generic",
        sessionResource: session2,
        created: /* @__PURE__ */ new Date(),
        name: "event-2",
        level: ChatDebugLogLevel.Warning
      };
      service.addEvent(event1);
      service.addEvent(event2);
      assert.deepStrictEqual(service.getEvents(session1), [event1]);
      assert.deepStrictEqual(service.getEvents(session2), [event2]);
      assert.strictEqual(service.getEvents().length, 2);
    });
    test("should fire onDidAddEvent when event is added", () => {
      const firedEvents = [];
      disposables.add(service.onDidAddEvent((e) => firedEvents.push(e)));
      const event = {
        kind: "generic",
        sessionResource: session1,
        created: /* @__PURE__ */ new Date(),
        name: "test",
        level: ChatDebugLogLevel.Info
      };
      service.addEvent(event);
      assert.deepStrictEqual(firedEvents, [event]);
    });
    test("should handle different event kinds", () => {
      const toolCall = {
        kind: "toolCall",
        sessionResource: session1,
        created: /* @__PURE__ */ new Date(),
        toolName: "readFile",
        toolCallId: "call-1",
        input: '{"path": "/foo.ts"}',
        output: "file contents",
        result: "success",
        durationInMillis: 42
      };
      const modelTurn = {
        kind: "modelTurn",
        sessionResource: session1,
        created: /* @__PURE__ */ new Date(),
        model: "gpt-4",
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        copilotUsageNanoAiu: 5e9,
        durationInMillis: 1200
      };
      service.addEvent(toolCall);
      service.addEvent(modelTurn);
      const events = service.getEvents(session1);
      assert.strictEqual(events.length, 2);
      assert.strictEqual(events[0].kind, "toolCall");
      assert.strictEqual(events[1].kind, "modelTurn");
      assert.strictEqual(events[1].copilotUsageNanoAiu, 5e9);
    });
  });
  suite("log", () => {
    test("should create a generic event with defaults", () => {
      const firedEvents = [];
      disposables.add(service.onDidAddEvent((e) => firedEvents.push(e)));
      service.log(session1, "Some name", "Some details");
      assert.strictEqual(firedEvents.length, 1);
      const event = firedEvents[0];
      assert.strictEqual(event.kind, "generic");
      assert.strictEqual(event.sessionResource.toString(), session1.toString());
      assert.strictEqual(event.name, "Some name");
      assert.strictEqual(event.details, "Some details");
      assert.strictEqual(event.level, ChatDebugLogLevel.Info);
    });
    test("should accept custom level and options", () => {
      const firedEvents = [];
      disposables.add(service.onDidAddEvent((e) => firedEvents.push(e)));
      service.log(session1, "warning-event", "oh no", ChatDebugLogLevel.Warning, {
        id: "my-id",
        category: "testing",
        parentEventId: "parent-1"
      });
      const event = firedEvents[0];
      assert.strictEqual(event.level, ChatDebugLogLevel.Warning);
      assert.strictEqual(event.id, "my-id");
      assert.strictEqual(event.category, "testing");
      assert.strictEqual(event.parentEventId, "parent-1");
    });
    test("should not log events for ineligible session schemes", () => {
      const firedEvents = [];
      disposables.add(service.onDidAddEvent((e) => firedEvents.push(e)));
      service.log(nonLocalSession, "should-be-skipped", "details");
      assert.strictEqual(firedEvents.length, 0);
      assert.strictEqual(service.getEvents(nonLocalSession).length, 0);
    });
    test("should log events for copilotcli sessions", () => {
      const firedEvents = [];
      disposables.add(service.onDidAddEvent((e) => firedEvents.push(e)));
      service.log(copilotCliSession, "cli-event", "details");
      assert.strictEqual(firedEvents.length, 1);
      assert.strictEqual(service.getEvents(copilotCliSession).length, 1);
    });
    test("should log events for claude-code sessions", () => {
      const firedEvents = [];
      disposables.add(service.onDidAddEvent((e) => firedEvents.push(e)));
      service.log(claudeCodeSession, "claude-event", "details");
      assert.strictEqual(firedEvents.length, 1);
      assert.strictEqual(service.getEvents(claudeCodeSession).length, 1);
    });
  });
  suite("getSessionResources", () => {
    test("should return unique session resources", () => {
      service.addEvent({ kind: "generic", sessionResource: sessionA, created: /* @__PURE__ */ new Date(), name: "e1", level: ChatDebugLogLevel.Info });
      service.addEvent({ kind: "generic", sessionResource: sessionB, created: /* @__PURE__ */ new Date(), name: "e2", level: ChatDebugLogLevel.Info });
      service.addEvent({ kind: "generic", sessionResource: sessionA, created: /* @__PURE__ */ new Date(), name: "e3", level: ChatDebugLogLevel.Info });
      const resources = service.getSessionResources();
      assert.strictEqual(resources.length, 2);
    });
    test("should return empty array when no events", () => {
      assert.deepStrictEqual(service.getSessionResources(), []);
    });
  });
  suite("clear", () => {
    test("should clear all events", () => {
      service.addEvent({ kind: "generic", sessionResource: sessionA, created: /* @__PURE__ */ new Date(), name: "e", level: ChatDebugLogLevel.Info });
      service.addEvent({ kind: "generic", sessionResource: sessionB, created: /* @__PURE__ */ new Date(), name: "e", level: ChatDebugLogLevel.Info });
      service.clear();
      assert.strictEqual(service.getEvents().length, 0);
    });
  });
  suite("MAX_EVENTS_PER_SESSION cap", () => {
    test("should evict oldest events when exceeding per-session cap", () => {
      for (let i = 0; i < 10001; i++) {
        service.addEvent({ kind: "generic", sessionResource: sessionGeneric, created: /* @__PURE__ */ new Date(), name: `event-${i}`, level: ChatDebugLogLevel.Info });
      }
      const events = service.getEvents();
      assert.ok(events.length <= 1e4, "Should not exceed MAX_EVENTS_PER_SESSION");
      assert.ok(!events.find((e) => e.name === "event-0"), "Event-0 should have been evicted");
      assert.ok(events.find((e) => e.name === "event-10000"), "Last event should be present");
    });
    test("should evict oldest session when exceeding MAX_SESSIONS", () => {
      const sessions = [];
      for (let i = 0; i < 6; i++) {
        const uri = URI.parse(`vscode-chat-session://local/session-lru-${i}`);
        sessions.push(uri);
        service.addEvent({ kind: "generic", sessionResource: uri, created: /* @__PURE__ */ new Date(), name: `event-${i}`, level: ChatDebugLogLevel.Info });
      }
      const resources = service.getSessionResources();
      assert.strictEqual(resources.length, 5, "Should not exceed MAX_SESSIONS");
      assert.ok(!resources.some((r) => r.toString() === sessions[0].toString()), "Session-0 should have been evicted");
      assert.strictEqual(service.getEvents(sessions[0]).length, 0, "Events from evicted session should be gone");
      assert.ok(resources.some((r) => r.toString() === sessions[5].toString()), "Session-5 should be present");
    });
    test("should use LRU eviction \u2014 recently-used sessions are kept", () => {
      const sessions = [];
      for (let i = 0; i < 5; i++) {
        const uri = URI.parse(`vscode-chat-session://local/session-lru2-${i}`);
        sessions.push(uri);
        service.addEvent({ kind: "generic", sessionResource: uri, created: /* @__PURE__ */ new Date(), name: `init-${i}`, level: ChatDebugLogLevel.Info });
      }
      service.addEvent({ kind: "generic", sessionResource: sessions[0], created: /* @__PURE__ */ new Date(), name: "touch", level: ChatDebugLogLevel.Info });
      const session6 = URI.parse("vscode-chat-session://local/session-lru2-5");
      service.addEvent({ kind: "generic", sessionResource: session6, created: /* @__PURE__ */ new Date(), name: "new", level: ChatDebugLogLevel.Info });
      const resources = service.getSessionResources();
      assert.strictEqual(resources.length, 5);
      assert.ok(resources.some((r) => r.toString() === sessions[0].toString()), "Session-0 should be kept (recently used)");
      assert.ok(!resources.some((r) => r.toString() === sessions[1].toString()), "Session-1 should be evicted (LRU)");
      assert.ok(resources.some((r) => r.toString() === session6.toString()), "Session-5 should be present");
    });
  });
  suite("activeSessionResource", () => {
    test("should default to undefined", () => {
      assert.strictEqual(service.activeSessionResource, void 0);
    });
    test("should be settable", () => {
      service.activeSessionResource = session1;
      assert.strictEqual(service.activeSessionResource, session1);
    });
  });
  suite("registerProvider", () => {
    test("should register and unregister a provider", async () => {
      const extSession = URI.parse("vscode-chat-session://local/ext-session");
      const provider = {
        provideChatDebugLog: async () => [{
          kind: "generic",
          sessionResource: extSession,
          created: /* @__PURE__ */ new Date(),
          name: "from-provider",
          level: ChatDebugLogLevel.Info
        }]
      };
      const reg = service.registerProvider(provider);
      await service.invokeProviders(extSession);
      const events = service.getEvents(extSession);
      assert.ok(events.some((e) => e.kind === "generic" && e.name === "from-provider"));
      reg.dispose();
    });
    test("provider returning undefined should not add events", async () => {
      const emptySession = URI.parse("vscode-chat-session://local/empty-session");
      const provider = {
        provideChatDebugLog: async () => void 0
      };
      disposables.add(service.registerProvider(provider));
      await service.invokeProviders(emptySession);
      assert.strictEqual(service.getEvents(emptySession).length, 0);
    });
    test("provider errors should be handled gracefully", async () => {
      const errorSession = URI.parse("vscode-chat-session://local/error-session");
      const provider = {
        provideChatDebugLog: async () => {
          throw new Error("boom");
        }
      };
      disposables.add(service.registerProvider(provider));
      const origHandler = errorHandler.getUnexpectedErrorHandler();
      errorHandler.setUnexpectedErrorHandler(() => {
      });
      try {
        await service.invokeProviders(errorSession);
      } finally {
        errorHandler.setUnexpectedErrorHandler(origHandler);
      }
      assert.strictEqual(service.getEvents(errorSession).length, 0);
    });
  });
  suite("invokeProviders", () => {
    test("re-invocation that returns undefined should preserve previously loaded events", async () => {
      let succeed = true;
      const provider = {
        provideChatDebugLog: async () => succeed ? [{
          kind: "generic",
          sessionResource: sessionGeneric,
          created: /* @__PURE__ */ new Date(),
          name: "provider-event",
          level: ChatDebugLogLevel.Info
        }] : void 0
      };
      disposables.add(service.registerProvider(provider));
      await service.invokeProviders(sessionGeneric);
      assert.strictEqual(service.getEvents(sessionGeneric).length, 1);
      succeed = false;
      await service.invokeProviders(sessionGeneric);
      assert.strictEqual(service.getEvents(sessionGeneric).length, 1);
    });
    test("should invoke multiple providers and merge events", async () => {
      const providerA = {
        provideChatDebugLog: async () => [{
          kind: "generic",
          sessionResource: sessionGeneric,
          created: /* @__PURE__ */ new Date(),
          name: "from-A",
          level: ChatDebugLogLevel.Info
        }]
      };
      const providerB = {
        provideChatDebugLog: async () => [{
          kind: "generic",
          sessionResource: sessionGeneric,
          created: /* @__PURE__ */ new Date(),
          name: "from-B",
          level: ChatDebugLogLevel.Info
        }]
      };
      disposables.add(service.registerProvider(providerA));
      disposables.add(service.registerProvider(providerB));
      await service.invokeProviders(sessionGeneric);
      const names = service.getEvents(sessionGeneric).map((e) => e.name);
      assert.ok(names.includes("from-A"));
      assert.ok(names.includes("from-B"));
    });
    test("should cancel previous invocation for same session", async () => {
      let cancelledToken;
      const provider = {
        provideChatDebugLog: async (_sessionResource, token) => {
          cancelledToken = token;
          return [];
        }
      };
      disposables.add(service.registerProvider(provider));
      await service.invokeProviders(sessionGeneric);
      const firstToken = cancelledToken;
      await service.invokeProviders(sessionGeneric);
      assert.strictEqual(firstToken.isCancellationRequested, true);
    });
    test("should fire onDidClearProviderEvents when clearing provider events", async () => {
      const clearedSessions = [];
      disposables.add(service.onDidClearProviderEvents((sessionResource) => clearedSessions.push(sessionResource)));
      const provider = {
        provideChatDebugLog: async (sessionResource) => [{
          kind: "generic",
          sessionResource,
          created: /* @__PURE__ */ new Date(),
          name: "provider-event",
          level: ChatDebugLogLevel.Info
        }]
      };
      disposables.add(service.registerProvider(provider));
      await service.invokeProviders(sessionGeneric);
      assert.strictEqual(clearedSessions.length, 1, "Clear event should fire on first invocation");
      await service.invokeProviders(sessionGeneric);
      assert.strictEqual(clearedSessions.length, 2, "Clear event should fire on second invocation");
      assert.strictEqual(clearedSessions[1].toString(), sessionGeneric.toString());
    });
    test("should not cancel invocations for different sessions", async () => {
      const tokens = /* @__PURE__ */ new Map();
      const provider = {
        provideChatDebugLog: async (sessionResource, token) => {
          tokens.set(sessionResource.toString(), token);
          return [];
        }
      };
      disposables.add(service.registerProvider(provider));
      await service.invokeProviders(sessionA);
      await service.invokeProviders(sessionB);
      const tokenA = tokens.get(sessionA.toString());
      assert.strictEqual(tokenA.isCancellationRequested, false, "session-a token should not be cancelled");
    });
    test("should not invoke providers for ineligible session schemes", async () => {
      let providerCalled = false;
      const provider = {
        provideChatDebugLog: async () => {
          providerCalled = true;
          return [{
            kind: "generic",
            sessionResource: nonLocalSession,
            created: /* @__PURE__ */ new Date(),
            name: "should-not-appear",
            level: ChatDebugLogLevel.Info
          }];
        }
      };
      disposables.add(service.registerProvider(provider));
      await service.invokeProviders(nonLocalSession);
      assert.strictEqual(providerCalled, false);
      assert.strictEqual(service.getEvents(nonLocalSession).length, 0);
    });
    test("should invoke providers for copilotcli sessions", async () => {
      let providerCalled = false;
      const provider = {
        provideChatDebugLog: async () => {
          providerCalled = true;
          return [{
            kind: "generic",
            sessionResource: copilotCliSession,
            created: /* @__PURE__ */ new Date(),
            name: "cli-provider-event",
            level: ChatDebugLogLevel.Info
          }];
        }
      };
      disposables.add(service.registerProvider(provider));
      await service.invokeProviders(copilotCliSession);
      assert.strictEqual(providerCalled, true);
      assert.ok(service.getEvents(copilotCliSession).length > 0);
    });
    test("should invoke providers for claude-code sessions", async () => {
      let providerCalled = false;
      const provider = {
        provideChatDebugLog: async () => {
          providerCalled = true;
          return [{
            kind: "generic",
            sessionResource: claudeCodeSession,
            created: /* @__PURE__ */ new Date(),
            name: "claude-provider-event",
            level: ChatDebugLogLevel.Info
          }];
        }
      };
      disposables.add(service.registerProvider(provider));
      await service.invokeProviders(claudeCodeSession);
      assert.strictEqual(providerCalled, true);
      assert.ok(service.getEvents(claudeCodeSession).length > 0);
    });
    test("newly registered provider should be invoked for active sessions", async () => {
      const firstProvider = {
        provideChatDebugLog: async () => []
      };
      disposables.add(service.registerProvider(firstProvider));
      await service.invokeProviders(sessionGeneric);
      const lateEvents = [];
      const lateProvider = {
        provideChatDebugLog: async () => {
          const event = {
            kind: "generic",
            sessionResource: sessionGeneric,
            created: /* @__PURE__ */ new Date(),
            name: "late-provider-event",
            level: ChatDebugLogLevel.Info
          };
          lateEvents.push(event);
          return [event];
        }
      };
      disposables.add(service.registerProvider(lateProvider));
      await new Promise((resolve) => setTimeout(resolve, 10));
      assert.ok(lateEvents.length > 0, "Late provider should have been invoked");
    });
  });
  suite("resolveEvent", () => {
    test("should delegate to provider with resolveChatDebugLogEvent", async () => {
      const resolved = {
        kind: "text",
        value: "resolved detail text"
      };
      const provider = {
        provideChatDebugLog: async () => void 0,
        resolveChatDebugLogEvent: async (eventId) => {
          if (eventId === "my-event") {
            return resolved;
          }
          return void 0;
        }
      };
      disposables.add(service.registerProvider(provider));
      const result = await service.resolveEvent("my-event");
      assert.deepStrictEqual(result, resolved);
    });
    test("should return undefined if no provider resolves the event", async () => {
      const provider = {
        provideChatDebugLog: async () => void 0,
        resolveChatDebugLogEvent: async () => void 0
      };
      disposables.add(service.registerProvider(provider));
      const result = await service.resolveEvent("nonexistent");
      assert.strictEqual(result, void 0);
    });
    test("should return undefined when no providers registered", async () => {
      const result = await service.resolveEvent("any-id");
      assert.strictEqual(result, void 0);
    });
    test("should return first non-undefined resolution from multiple providers", async () => {
      const provider1 = {
        provideChatDebugLog: async () => void 0,
        resolveChatDebugLogEvent: async () => void 0
      };
      const provider2 = {
        provideChatDebugLog: async () => void 0,
        resolveChatDebugLogEvent: async () => ({ kind: "text", value: "from provider 2" })
      };
      disposables.add(service.registerProvider(provider1));
      disposables.add(service.registerProvider(provider2));
      const result = await service.resolveEvent("any");
      assert.deepStrictEqual(result, { kind: "text", value: "from provider 2" });
    });
  });
  suite("endSession", () => {
    test("should cancel and remove the CTS for a session", async () => {
      let capturedToken;
      const provider = {
        provideChatDebugLog: async (_sessionResource, token) => {
          capturedToken = token;
          return [];
        }
      };
      disposables.add(service.registerProvider(provider));
      await service.invokeProviders(sessionGeneric);
      assert.ok(capturedToken);
      assert.strictEqual(capturedToken.isCancellationRequested, false);
      service.endSession(sessionGeneric);
      assert.strictEqual(capturedToken.isCancellationRequested, true);
    });
    test("should be safe to call for unknown session", () => {
      service.endSession(URI.parse("vscode-chat-session://local/nonexistent"));
    });
    test("late provider should not be invoked for ended session", async () => {
      const firstProvider = {
        provideChatDebugLog: async () => []
      };
      disposables.add(service.registerProvider(firstProvider));
      await service.invokeProviders(sessionGeneric);
      service.endSession(sessionGeneric);
      let lateCalled = false;
      const lateProvider = {
        provideChatDebugLog: async () => {
          lateCalled = true;
          return [];
        }
      };
      disposables.add(service.registerProvider(lateProvider));
      await new Promise((resolve) => setTimeout(resolve, 10));
      assert.strictEqual(lateCalled, false, "Late provider should not be invoked for ended session");
    });
  });
  suite("dispose", () => {
    test("should cancel active invocations on dispose", async () => {
      let capturedToken;
      const provider = {
        provideChatDebugLog: async (_sessionResource, token) => {
          capturedToken = token;
          return [];
        }
      };
      disposables.add(service.registerProvider(provider));
      await service.invokeProviders(sessionGeneric);
      const cts = new CancellationTokenSource();
      disposables.add(cts);
      service.dispose();
      assert.ok(capturedToken);
      assert.strictEqual(capturedToken.isCancellationRequested, true);
    });
  });
  suite("event deduplication", () => {
    test("should deduplicate events with the same ID, keeping the richer kind", () => {
      const userMsg = {
        kind: "userMessage",
        id: "shared-id-1",
        sessionResource: session1,
        created: /* @__PURE__ */ new Date("2026-01-01T00:00:00Z"),
        message: "hello",
        sections: []
      };
      const subagent = {
        kind: "subagentInvocation",
        id: "shared-id-1",
        sessionResource: session1,
        created: /* @__PURE__ */ new Date("2026-01-01T00:00:01Z"),
        agentName: "Explore"
      };
      service.addEvent(userMsg);
      service.addEvent(subagent);
      const events = service.getEvents(session1);
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].kind, "subagentInvocation");
    });
    test("should keep richer event when it arrives first", () => {
      const subagent = {
        kind: "subagentInvocation",
        id: "shared-id-2",
        sessionResource: session1,
        created: /* @__PURE__ */ new Date("2026-01-01T00:00:00Z"),
        agentName: "Explore"
      };
      const userMsg = {
        kind: "userMessage",
        id: "shared-id-2",
        sessionResource: session1,
        created: /* @__PURE__ */ new Date("2026-01-01T00:00:01Z"),
        message: "hello",
        sections: []
      };
      service.addEvent(subagent);
      service.addEvent(userMsg);
      const events = service.getEvents(session1);
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].kind, "subagentInvocation");
    });
    test("should not fire onDidAddEvent for skipped duplicates", () => {
      const firedKinds = [];
      disposables.add(service.onDidAddEvent((e) => firedKinds.push(e.kind)));
      const subagent = {
        kind: "subagentInvocation",
        id: "shared-id-3",
        sessionResource: session1,
        created: /* @__PURE__ */ new Date("2026-01-01T00:00:00Z"),
        agentName: "Explore"
      };
      const userMsg = {
        kind: "userMessage",
        id: "shared-id-3",
        sessionResource: session1,
        created: /* @__PURE__ */ new Date("2026-01-01T00:00:01Z"),
        message: "hello",
        sections: []
      };
      service.addEvent(subagent);
      service.addEvent(userMsg);
      assert.deepStrictEqual(firedKinds, ["subagentInvocation"]);
    });
    test("should allow events without IDs to coexist", () => {
      const event1 = {
        kind: "generic",
        sessionResource: session1,
        created: /* @__PURE__ */ new Date("2026-01-01T00:00:00Z"),
        name: "a",
        level: ChatDebugLogLevel.Info
      };
      const event2 = {
        kind: "generic",
        sessionResource: session1,
        created: /* @__PURE__ */ new Date("2026-01-01T00:00:01Z"),
        name: "b",
        level: ChatDebugLogLevel.Info
      };
      service.addEvent(event1);
      service.addEvent(event2);
      const events = service.getEvents(session1);
      assert.strictEqual(events.length, 2);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vY2hhdERlYnVnU2VydmljZUltcGwudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBlcnJvckhhbmRsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdERlYnVnTG9nTGV2ZWwsIElDaGF0RGVidWdFdmVudCwgSUNoYXREZWJ1Z0dlbmVyaWNFdmVudCwgSUNoYXREZWJ1Z0xvZ1Byb3ZpZGVyLCBJQ2hhdERlYnVnTW9kZWxUdXJuRXZlbnQsIElDaGF0RGVidWdSZXNvbHZlZEV2ZW50Q29udGVudCwgSUNoYXREZWJ1Z1Rvb2xDYWxsRXZlbnQgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdERlYnVnU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0RGVidWdTZXJ2aWNlSW1wbCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0RGVidWdTZXJ2aWNlSW1wbC5qcyc7XG5pbXBvcnQgeyBMb2NhbENoYXRTZXNzaW9uVXJpIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL2NoYXRVcmkuanMnO1xuXG5zdWl0ZSgnQ2hhdERlYnVnU2VydmljZUltcGwnLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IHNlcnZpY2U6IENoYXREZWJ1Z1NlcnZpY2VJbXBsO1xuXG5cdGNvbnN0IHNlc3Npb24xID0gVVJJLnBhcnNlKCd2c2NvZGUtY2hhdC1zZXNzaW9uOi8vbG9jYWwvc2Vzc2lvbi0xJyk7XG5cdGNvbnN0IHNlc3Npb24yID0gVVJJLnBhcnNlKCd2c2NvZGUtY2hhdC1zZXNzaW9uOi8vbG9jYWwvc2Vzc2lvbi0yJyk7XG5cdGNvbnN0IHNlc3Npb25BID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCdhJyk7XG5cdGNvbnN0IHNlc3Npb25CID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCdiJyk7XG5cdGNvbnN0IHNlc3Npb25HZW5lcmljID0gVVJJLnBhcnNlKCd2c2NvZGUtY2hhdC1zZXNzaW9uOi8vbG9jYWwvc2Vzc2lvbicpO1xuXHRjb25zdCBub25Mb2NhbFNlc3Npb24gPSBVUkkucGFyc2UoJ3NvbWUtb3RoZXItc2NoZW1lOi8vYXV0aG9yaXR5L3Nlc3Npb24tMScpO1xuXHRjb25zdCBjb3BpbG90Q2xpU2Vzc2lvbiA9IFVSSS5wYXJzZSgnY29waWxvdGNsaTovdGVzdC1zZXNzaW9uLWlkJyk7XG5cdGNvbnN0IGNsYXVkZUNvZGVTZXNzaW9uID0gVVJJLnBhcnNlKCdjbGF1ZGUtY29kZTovdGVzdC1zZXNzaW9uLWlkJyk7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXREZWJ1Z1NlcnZpY2VJbXBsKG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSkpO1xuXHR9KTtcblxuXHRzdWl0ZSgnYWRkRXZlbnQgYW5kIGdldEV2ZW50cycsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgYWRkIGFuZCByZXRyaWV2ZSBldmVudHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBldmVudDogSUNoYXREZWJ1Z0dlbmVyaWNFdmVudCA9IHtcblx0XHRcdFx0a2luZDogJ2dlbmVyaWMnLFxuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHNlc3Npb24xLFxuXHRcdFx0XHRjcmVhdGVkOiBuZXcgRGF0ZSgpLFxuXHRcdFx0XHRuYW1lOiAndGVzdC1ldmVudCcsXG5cdFx0XHRcdGxldmVsOiBDaGF0RGVidWdMb2dMZXZlbC5JbmZvLFxuXHRcdFx0fTtcblxuXHRcdFx0c2VydmljZS5hZGRFdmVudChldmVudCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS5nZXRFdmVudHMoKSwgW2V2ZW50XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZmlsdGVyIGV2ZW50cyBieSBzZXNzaW9uUmVzb3VyY2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBldmVudDE6IElDaGF0RGVidWdHZW5lcmljRXZlbnQgPSB7XG5cdFx0XHRcdGtpbmQ6ICdnZW5lcmljJyxcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBzZXNzaW9uMSxcblx0XHRcdFx0Y3JlYXRlZDogbmV3IERhdGUoKSxcblx0XHRcdFx0bmFtZTogJ2V2ZW50LTEnLFxuXHRcdFx0XHRsZXZlbDogQ2hhdERlYnVnTG9nTGV2ZWwuSW5mbyxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBldmVudDI6IElDaGF0RGVidWdHZW5lcmljRXZlbnQgPSB7XG5cdFx0XHRcdGtpbmQ6ICdnZW5lcmljJyxcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBzZXNzaW9uMixcblx0XHRcdFx0Y3JlYXRlZDogbmV3IERhdGUoKSxcblx0XHRcdFx0bmFtZTogJ2V2ZW50LTInLFxuXHRcdFx0XHRsZXZlbDogQ2hhdERlYnVnTG9nTGV2ZWwuV2FybmluZyxcblx0XHRcdH07XG5cblx0XHRcdHNlcnZpY2UuYWRkRXZlbnQoZXZlbnQxKTtcblx0XHRcdHNlcnZpY2UuYWRkRXZlbnQoZXZlbnQyKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLmdldEV2ZW50cyhzZXNzaW9uMSksIFtldmVudDFdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS5nZXRFdmVudHMoc2Vzc2lvbjIpLCBbZXZlbnQyXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRFdmVudHMoKS5sZW5ndGgsIDIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGZpcmUgb25EaWRBZGRFdmVudCB3aGVuIGV2ZW50IGlzIGFkZGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlyZWRFdmVudHM6IElDaGF0RGVidWdFdmVudFtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZEFkZEV2ZW50KGUgPT4gZmlyZWRFdmVudHMucHVzaChlKSkpO1xuXG5cdFx0XHRjb25zdCBldmVudDogSUNoYXREZWJ1Z0dlbmVyaWNFdmVudCA9IHtcblx0XHRcdFx0a2luZDogJ2dlbmVyaWMnLFxuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHNlc3Npb24xLFxuXHRcdFx0XHRjcmVhdGVkOiBuZXcgRGF0ZSgpLFxuXHRcdFx0XHRuYW1lOiAndGVzdCcsXG5cdFx0XHRcdGxldmVsOiBDaGF0RGVidWdMb2dMZXZlbC5JbmZvLFxuXHRcdFx0fTtcblx0XHRcdHNlcnZpY2UuYWRkRXZlbnQoZXZlbnQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZpcmVkRXZlbnRzLCBbZXZlbnRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgZGlmZmVyZW50IGV2ZW50IGtpbmRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbENhbGw6IElDaGF0RGVidWdUb29sQ2FsbEV2ZW50ID0ge1xuXHRcdFx0XHRraW5kOiAndG9vbENhbGwnLFxuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHNlc3Npb24xLFxuXHRcdFx0XHRjcmVhdGVkOiBuZXcgRGF0ZSgpLFxuXHRcdFx0XHR0b29sTmFtZTogJ3JlYWRGaWxlJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ2NhbGwtMScsXG5cdFx0XHRcdGlucHV0OiAne1wicGF0aFwiOiBcIi9mb28udHNcIn0nLFxuXHRcdFx0XHRvdXRwdXQ6ICdmaWxlIGNvbnRlbnRzJyxcblx0XHRcdFx0cmVzdWx0OiAnc3VjY2VzcycsXG5cdFx0XHRcdGR1cmF0aW9uSW5NaWxsaXM6IDQyLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IG1vZGVsVHVybjogSUNoYXREZWJ1Z01vZGVsVHVybkV2ZW50ID0ge1xuXHRcdFx0XHRraW5kOiAnbW9kZWxUdXJuJyxcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBzZXNzaW9uMSxcblx0XHRcdFx0Y3JlYXRlZDogbmV3IERhdGUoKSxcblx0XHRcdFx0bW9kZWw6ICdncHQtNCcsXG5cdFx0XHRcdGlucHV0VG9rZW5zOiAxMDAsXG5cdFx0XHRcdG91dHB1dFRva2VuczogNTAsXG5cdFx0XHRcdHRvdGFsVG9rZW5zOiAxNTAsXG5cdFx0XHRcdGNvcGlsb3RVc2FnZU5hbm9BaXU6IDVfMDAwXzAwMF8wMDAsXG5cdFx0XHRcdGR1cmF0aW9uSW5NaWxsaXM6IDEyMDAsXG5cdFx0XHR9O1xuXG5cdFx0XHRzZXJ2aWNlLmFkZEV2ZW50KHRvb2xDYWxsKTtcblx0XHRcdHNlcnZpY2UuYWRkRXZlbnQobW9kZWxUdXJuKTtcblxuXHRcdFx0Y29uc3QgZXZlbnRzID0gc2VydmljZS5nZXRFdmVudHMoc2Vzc2lvbjEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50c1swXS5raW5kLCAndG9vbENhbGwnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHNbMV0ua2luZCwgJ21vZGVsVHVybicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChldmVudHNbMV0gYXMgSUNoYXREZWJ1Z01vZGVsVHVybkV2ZW50KS5jb3BpbG90VXNhZ2VOYW5vQWl1LCA1XzAwMF8wMDBfMDAwKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2xvZycsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgY3JlYXRlIGEgZ2VuZXJpYyBldmVudCB3aXRoIGRlZmF1bHRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlyZWRFdmVudHM6IElDaGF0RGVidWdFdmVudFtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZEFkZEV2ZW50KGUgPT4gZmlyZWRFdmVudHMucHVzaChlKSkpO1xuXG5cdFx0XHRzZXJ2aWNlLmxvZyhzZXNzaW9uMSwgJ1NvbWUgbmFtZScsICdTb21lIGRldGFpbHMnKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcmVkRXZlbnRzLmxlbmd0aCwgMSk7XG5cdFx0XHRjb25zdCBldmVudCA9IGZpcmVkRXZlbnRzWzBdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LmtpbmQsICdnZW5lcmljJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQuc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCksIHNlc3Npb24xLnRvU3RyaW5nKCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChldmVudCBhcyBJQ2hhdERlYnVnR2VuZXJpY0V2ZW50KS5uYW1lLCAnU29tZSBuYW1lJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGV2ZW50IGFzIElDaGF0RGVidWdHZW5lcmljRXZlbnQpLmRldGFpbHMsICdTb21lIGRldGFpbHMnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoZXZlbnQgYXMgSUNoYXREZWJ1Z0dlbmVyaWNFdmVudCkubGV2ZWwsIENoYXREZWJ1Z0xvZ0xldmVsLkluZm8pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGFjY2VwdCBjdXN0b20gbGV2ZWwgYW5kIG9wdGlvbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBmaXJlZEV2ZW50czogSUNoYXREZWJ1Z0V2ZW50W10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkQWRkRXZlbnQoZSA9PiBmaXJlZEV2ZW50cy5wdXNoKGUpKSk7XG5cblx0XHRcdHNlcnZpY2UubG9nKHNlc3Npb24xLCAnd2FybmluZy1ldmVudCcsICdvaCBubycsIENoYXREZWJ1Z0xvZ0xldmVsLldhcm5pbmcsIHtcblx0XHRcdFx0aWQ6ICdteS1pZCcsXG5cdFx0XHRcdGNhdGVnb3J5OiAndGVzdGluZycsXG5cdFx0XHRcdHBhcmVudEV2ZW50SWQ6ICdwYXJlbnQtMScsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgZXZlbnQgPSBmaXJlZEV2ZW50c1swXSBhcyBJQ2hhdERlYnVnR2VuZXJpY0V2ZW50O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LmxldmVsLCBDaGF0RGVidWdMb2dMZXZlbC5XYXJuaW5nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5pZCwgJ215LWlkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQuY2F0ZWdvcnksICd0ZXN0aW5nJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQucGFyZW50RXZlbnRJZCwgJ3BhcmVudC0xJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IGxvZyBldmVudHMgZm9yIGluZWxpZ2libGUgc2Vzc2lvbiBzY2hlbWVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlyZWRFdmVudHM6IElDaGF0RGVidWdFdmVudFtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZEFkZEV2ZW50KGUgPT4gZmlyZWRFdmVudHMucHVzaChlKSkpO1xuXG5cdFx0XHRzZXJ2aWNlLmxvZyhub25Mb2NhbFNlc3Npb24sICdzaG91bGQtYmUtc2tpcHBlZCcsICdkZXRhaWxzJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJlZEV2ZW50cy5sZW5ndGgsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0RXZlbnRzKG5vbkxvY2FsU2Vzc2lvbikubGVuZ3RoLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBsb2cgZXZlbnRzIGZvciBjb3BpbG90Y2xpIHNlc3Npb25zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlyZWRFdmVudHM6IElDaGF0RGVidWdFdmVudFtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZEFkZEV2ZW50KGUgPT4gZmlyZWRFdmVudHMucHVzaChlKSkpO1xuXG5cdFx0XHRzZXJ2aWNlLmxvZyhjb3BpbG90Q2xpU2Vzc2lvbiwgJ2NsaS1ldmVudCcsICdkZXRhaWxzJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJlZEV2ZW50cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0RXZlbnRzKGNvcGlsb3RDbGlTZXNzaW9uKS5sZW5ndGgsIDEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGxvZyBldmVudHMgZm9yIGNsYXVkZS1jb2RlIHNlc3Npb25zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlyZWRFdmVudHM6IElDaGF0RGVidWdFdmVudFtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZEFkZEV2ZW50KGUgPT4gZmlyZWRFdmVudHMucHVzaChlKSkpO1xuXG5cdFx0XHRzZXJ2aWNlLmxvZyhjbGF1ZGVDb2RlU2Vzc2lvbiwgJ2NsYXVkZS1ldmVudCcsICdkZXRhaWxzJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJlZEV2ZW50cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0RXZlbnRzKGNsYXVkZUNvZGVTZXNzaW9uKS5sZW5ndGgsIDEpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZ2V0U2Vzc2lvblJlc291cmNlcycsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIHVuaXF1ZSBzZXNzaW9uIHJlc291cmNlcycsICgpID0+IHtcblx0XHRcdHNlcnZpY2UuYWRkRXZlbnQoeyBraW5kOiAnZ2VuZXJpYycsIHNlc3Npb25SZXNvdXJjZTogc2Vzc2lvbkEsIGNyZWF0ZWQ6IG5ldyBEYXRlKCksIG5hbWU6ICdlMScsIGxldmVsOiBDaGF0RGVidWdMb2dMZXZlbC5JbmZvIH0pO1xuXHRcdFx0c2VydmljZS5hZGRFdmVudCh7IGtpbmQ6ICdnZW5lcmljJywgc2Vzc2lvblJlc291cmNlOiBzZXNzaW9uQiwgY3JlYXRlZDogbmV3IERhdGUoKSwgbmFtZTogJ2UyJywgbGV2ZWw6IENoYXREZWJ1Z0xvZ0xldmVsLkluZm8gfSk7XG5cdFx0XHRzZXJ2aWNlLmFkZEV2ZW50KHsga2luZDogJ2dlbmVyaWMnLCBzZXNzaW9uUmVzb3VyY2U6IHNlc3Npb25BLCBjcmVhdGVkOiBuZXcgRGF0ZSgpLCBuYW1lOiAnZTMnLCBsZXZlbDogQ2hhdERlYnVnTG9nTGV2ZWwuSW5mbyB9KTtcblxuXHRcdFx0Y29uc3QgcmVzb3VyY2VzID0gc2VydmljZS5nZXRTZXNzaW9uUmVzb3VyY2VzKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb3VyY2VzLmxlbmd0aCwgMik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIGVtcHR5IGFycmF5IHdoZW4gbm8gZXZlbnRzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLmdldFNlc3Npb25SZXNvdXJjZXMoKSwgW10pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnY2xlYXInLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIGNsZWFyIGFsbCBldmVudHMnLCAoKSA9PiB7XG5cdFx0XHRzZXJ2aWNlLmFkZEV2ZW50KHsga2luZDogJ2dlbmVyaWMnLCBzZXNzaW9uUmVzb3VyY2U6IHNlc3Npb25BLCBjcmVhdGVkOiBuZXcgRGF0ZSgpLCBuYW1lOiAnZScsIGxldmVsOiBDaGF0RGVidWdMb2dMZXZlbC5JbmZvIH0pO1xuXHRcdFx0c2VydmljZS5hZGRFdmVudCh7IGtpbmQ6ICdnZW5lcmljJywgc2Vzc2lvblJlc291cmNlOiBzZXNzaW9uQiwgY3JlYXRlZDogbmV3IERhdGUoKSwgbmFtZTogJ2UnLCBsZXZlbDogQ2hhdERlYnVnTG9nTGV2ZWwuSW5mbyB9KTtcblxuXHRcdFx0c2VydmljZS5jbGVhcigpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRFdmVudHMoKS5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnTUFYX0VWRU5UU19QRVJfU0VTU0lPTiBjYXAnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIGV2aWN0IG9sZGVzdCBldmVudHMgd2hlbiBleGNlZWRpbmcgcGVyLXNlc3Npb24gY2FwJywgKCkgPT4ge1xuXHRcdFx0Ly8gVGhlIG1heCBwZXIgc2Vzc2lvbiBpcyAxMF8wMDAuIEFkZCBtb3JlIHRoYW4gdGhhdCB0byBhIHNpbmdsZSBzZXNzaW9uLlxuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCAxMF8wMDE7IGkrKykge1xuXHRcdFx0XHRzZXJ2aWNlLmFkZEV2ZW50KHsga2luZDogJ2dlbmVyaWMnLCBzZXNzaW9uUmVzb3VyY2U6IHNlc3Npb25HZW5lcmljLCBjcmVhdGVkOiBuZXcgRGF0ZSgpLCBuYW1lOiBgZXZlbnQtJHtpfWAsIGxldmVsOiBDaGF0RGVidWdMb2dMZXZlbC5JbmZvIH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBldmVudHMgPSBzZXJ2aWNlLmdldEV2ZW50cygpO1xuXHRcdFx0YXNzZXJ0Lm9rKGV2ZW50cy5sZW5ndGggPD0gMTBfMDAwLCAnU2hvdWxkIG5vdCBleGNlZWQgTUFYX0VWRU5UU19QRVJfU0VTU0lPTicpO1xuXHRcdFx0Ly8gVGhlIGZpcnN0IGV2ZW50IHNob3VsZCBoYXZlIGJlZW4gZXZpY3RlZFxuXHRcdFx0YXNzZXJ0Lm9rKCEoZXZlbnRzIGFzIElDaGF0RGVidWdHZW5lcmljRXZlbnRbXSkuZmluZChlID0+IGUubmFtZSA9PT0gJ2V2ZW50LTAnKSwgJ0V2ZW50LTAgc2hvdWxkIGhhdmUgYmVlbiBldmljdGVkJyk7XG5cdFx0XHQvLyBUaGUgbGFzdCBldmVudCBzaG91bGQgYmUgcHJlc2VudFxuXHRcdFx0YXNzZXJ0Lm9rKChldmVudHMgYXMgSUNoYXREZWJ1Z0dlbmVyaWNFdmVudFtdKS5maW5kKGUgPT4gZS5uYW1lID09PSAnZXZlbnQtMTAwMDAnKSwgJ0xhc3QgZXZlbnQgc2hvdWxkIGJlIHByZXNlbnQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBldmljdCBvbGRlc3Qgc2Vzc2lvbiB3aGVuIGV4Y2VlZGluZyBNQVhfU0VTU0lPTlMnLCAoKSA9PiB7XG5cdFx0XHQvLyBNQVhfU0VTU0lPTlMgaXMgNSBcdTIwMTQgYWRkIGV2ZW50cyB0byA2IGRpZmZlcmVudCBzZXNzaW9uc1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnM6IFVSSVtdID0gW107XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDY7IGkrKykge1xuXHRcdFx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoYHZzY29kZS1jaGF0LXNlc3Npb246Ly9sb2NhbC9zZXNzaW9uLWxydS0ke2l9YCk7XG5cdFx0XHRcdHNlc3Npb25zLnB1c2godXJpKTtcblx0XHRcdFx0c2VydmljZS5hZGRFdmVudCh7IGtpbmQ6ICdnZW5lcmljJywgc2Vzc2lvblJlc291cmNlOiB1cmksIGNyZWF0ZWQ6IG5ldyBEYXRlKCksIG5hbWU6IGBldmVudC0ke2l9YCwgbGV2ZWw6IENoYXREZWJ1Z0xvZ0xldmVsLkluZm8gfSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJlc291cmNlcyA9IHNlcnZpY2UuZ2V0U2Vzc2lvblJlc291cmNlcygpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc291cmNlcy5sZW5ndGgsIDUsICdTaG91bGQgbm90IGV4Y2VlZCBNQVhfU0VTU0lPTlMnKTtcblx0XHRcdC8vIFRoZSBmaXJzdCBzZXNzaW9uIHNob3VsZCBoYXZlIGJlZW4gZXZpY3RlZFxuXHRcdFx0YXNzZXJ0Lm9rKCFyZXNvdXJjZXMuc29tZShyID0+IHIudG9TdHJpbmcoKSA9PT0gc2Vzc2lvbnNbMF0udG9TdHJpbmcoKSksICdTZXNzaW9uLTAgc2hvdWxkIGhhdmUgYmVlbiBldmljdGVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRFdmVudHMoc2Vzc2lvbnNbMF0pLmxlbmd0aCwgMCwgJ0V2ZW50cyBmcm9tIGV2aWN0ZWQgc2Vzc2lvbiBzaG91bGQgYmUgZ29uZScpO1xuXHRcdFx0Ly8gVGhlIGxhc3Qgc2Vzc2lvbiBzaG91bGQgYmUgcHJlc2VudFxuXHRcdFx0YXNzZXJ0Lm9rKHJlc291cmNlcy5zb21lKHIgPT4gci50b1N0cmluZygpID09PSBzZXNzaW9uc1s1XS50b1N0cmluZygpKSwgJ1Nlc3Npb24tNSBzaG91bGQgYmUgcHJlc2VudCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHVzZSBMUlUgZXZpY3Rpb24gXHUyMDE0IHJlY2VudGx5LXVzZWQgc2Vzc2lvbnMgYXJlIGtlcHQnLCAoKSA9PiB7XG5cdFx0XHQvLyBGaWxsIHRvIE1BWF9TRVNTSU9OUyAoNSlcblx0XHRcdGNvbnN0IHNlc3Npb25zOiBVUklbXSA9IFtdO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCA1OyBpKyspIHtcblx0XHRcdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKGB2c2NvZGUtY2hhdC1zZXNzaW9uOi8vbG9jYWwvc2Vzc2lvbi1scnUyLSR7aX1gKTtcblx0XHRcdFx0c2Vzc2lvbnMucHVzaCh1cmkpO1xuXHRcdFx0XHRzZXJ2aWNlLmFkZEV2ZW50KHsga2luZDogJ2dlbmVyaWMnLCBzZXNzaW9uUmVzb3VyY2U6IHVyaSwgY3JlYXRlZDogbmV3IERhdGUoKSwgbmFtZTogYGluaXQtJHtpfWAsIGxldmVsOiBDaGF0RGVidWdMb2dMZXZlbC5JbmZvIH0pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBUb3VjaCBzZXNzaW9uLTAgc28gaXQgbW92ZXMgdG8gdGhlIGJhY2sgb2YgdGhlIExSVSBvcmRlclxuXHRcdFx0c2VydmljZS5hZGRFdmVudCh7IGtpbmQ6ICdnZW5lcmljJywgc2Vzc2lvblJlc291cmNlOiBzZXNzaW9uc1swXSwgY3JlYXRlZDogbmV3IERhdGUoKSwgbmFtZTogJ3RvdWNoJywgbGV2ZWw6IENoYXREZWJ1Z0xvZ0xldmVsLkluZm8gfSk7XG5cblx0XHRcdC8vIEFkZCBhIDZ0aCBzZXNzaW9uIFx1MjAxNCBzZXNzaW9uLTEgKHRoZSB0cnVlIExSVSkgc2hvdWxkIGJlIGV2aWN0ZWQsIG5vdCBzZXNzaW9uLTBcblx0XHRcdGNvbnN0IHNlc3Npb242ID0gVVJJLnBhcnNlKCd2c2NvZGUtY2hhdC1zZXNzaW9uOi8vbG9jYWwvc2Vzc2lvbi1scnUyLTUnKTtcblx0XHRcdHNlcnZpY2UuYWRkRXZlbnQoeyBraW5kOiAnZ2VuZXJpYycsIHNlc3Npb25SZXNvdXJjZTogc2Vzc2lvbjYsIGNyZWF0ZWQ6IG5ldyBEYXRlKCksIG5hbWU6ICduZXcnLCBsZXZlbDogQ2hhdERlYnVnTG9nTGV2ZWwuSW5mbyB9KTtcblxuXHRcdFx0Y29uc3QgcmVzb3VyY2VzID0gc2VydmljZS5nZXRTZXNzaW9uUmVzb3VyY2VzKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb3VyY2VzLmxlbmd0aCwgNSk7XG5cdFx0XHRhc3NlcnQub2socmVzb3VyY2VzLnNvbWUociA9PiByLnRvU3RyaW5nKCkgPT09IHNlc3Npb25zWzBdLnRvU3RyaW5nKCkpLCAnU2Vzc2lvbi0wIHNob3VsZCBiZSBrZXB0IChyZWNlbnRseSB1c2VkKScpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFyZXNvdXJjZXMuc29tZShyID0+IHIudG9TdHJpbmcoKSA9PT0gc2Vzc2lvbnNbMV0udG9TdHJpbmcoKSksICdTZXNzaW9uLTEgc2hvdWxkIGJlIGV2aWN0ZWQgKExSVSknKTtcblx0XHRcdGFzc2VydC5vayhyZXNvdXJjZXMuc29tZShyID0+IHIudG9TdHJpbmcoKSA9PT0gc2Vzc2lvbjYudG9TdHJpbmcoKSksICdTZXNzaW9uLTUgc2hvdWxkIGJlIHByZXNlbnQnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2FjdGl2ZVNlc3Npb25SZXNvdXJjZScsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgZGVmYXVsdCB0byB1bmRlZmluZWQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5hY3RpdmVTZXNzaW9uUmVzb3VyY2UsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgYmUgc2V0dGFibGUnLCAoKSA9PiB7XG5cdFx0XHRzZXJ2aWNlLmFjdGl2ZVNlc3Npb25SZXNvdXJjZSA9IHNlc3Npb24xO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5hY3RpdmVTZXNzaW9uUmVzb3VyY2UsIHNlc3Npb24xKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3JlZ2lzdGVyUHJvdmlkZXInLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIHJlZ2lzdGVyIGFuZCB1bnJlZ2lzdGVyIGEgcHJvdmlkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBleHRTZXNzaW9uID0gVVJJLnBhcnNlKCd2c2NvZGUtY2hhdC1zZXNzaW9uOi8vbG9jYWwvZXh0LXNlc3Npb24nKTtcblx0XHRcdGNvbnN0IHByb3ZpZGVyOiBJQ2hhdERlYnVnTG9nUHJvdmlkZXIgPSB7XG5cdFx0XHRcdHByb3ZpZGVDaGF0RGVidWdMb2c6IGFzeW5jICgpID0+IFt7XG5cdFx0XHRcdFx0a2luZDogJ2dlbmVyaWMnLFxuXHRcdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogZXh0U2Vzc2lvbixcblx0XHRcdFx0XHRjcmVhdGVkOiBuZXcgRGF0ZSgpLFxuXHRcdFx0XHRcdG5hbWU6ICdmcm9tLXByb3ZpZGVyJyxcblx0XHRcdFx0XHRsZXZlbDogQ2hhdERlYnVnTG9nTGV2ZWwuSW5mbyxcblx0XHRcdFx0fV0sXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZWcgPSBzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIocHJvdmlkZXIpO1xuXHRcdFx0YXdhaXQgc2VydmljZS5pbnZva2VQcm92aWRlcnMoZXh0U2Vzc2lvbik7XG5cblx0XHRcdGNvbnN0IGV2ZW50cyA9IHNlcnZpY2UuZ2V0RXZlbnRzKGV4dFNlc3Npb24pO1xuXHRcdFx0YXNzZXJ0Lm9rKGV2ZW50cy5zb21lKGUgPT4gZS5raW5kID09PSAnZ2VuZXJpYycgJiYgKGUgYXMgSUNoYXREZWJ1Z0dlbmVyaWNFdmVudCkubmFtZSA9PT0gJ2Zyb20tcHJvdmlkZXInKSk7XG5cblx0XHRcdHJlZy5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcm92aWRlciByZXR1cm5pbmcgdW5kZWZpbmVkIHNob3VsZCBub3QgYWRkIGV2ZW50cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGVtcHR5U2Vzc2lvbiA9IFVSSS5wYXJzZSgndnNjb2RlLWNoYXQtc2Vzc2lvbjovL2xvY2FsL2VtcHR5LXNlc3Npb24nKTtcblx0XHRcdGNvbnN0IHByb3ZpZGVyOiBJQ2hhdERlYnVnTG9nUHJvdmlkZXIgPSB7XG5cdFx0XHRcdHByb3ZpZGVDaGF0RGVidWdMb2c6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdH07XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIocHJvdmlkZXIpKTtcblx0XHRcdGF3YWl0IHNlcnZpY2UuaW52b2tlUHJvdmlkZXJzKGVtcHR5U2Vzc2lvbik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldEV2ZW50cyhlbXB0eVNlc3Npb24pLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcm92aWRlciBlcnJvcnMgc2hvdWxkIGJlIGhhbmRsZWQgZ3JhY2VmdWxseScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGVycm9yU2Vzc2lvbiA9IFVSSS5wYXJzZSgndnNjb2RlLWNoYXQtc2Vzc2lvbjovL2xvY2FsL2Vycm9yLXNlc3Npb24nKTtcblx0XHRcdGNvbnN0IHByb3ZpZGVyOiBJQ2hhdERlYnVnTG9nUHJvdmlkZXIgPSB7XG5cdFx0XHRcdHByb3ZpZGVDaGF0RGVidWdMb2c6IGFzeW5jICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdib29tJyk7IH0sXG5cdFx0XHR9O1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5yZWdpc3RlclByb3ZpZGVyKHByb3ZpZGVyKSk7XG5cdFx0XHQvLyBTdXBwcmVzcyB0aGUgZXhwZWN0ZWQgb25VbmV4cGVjdGVkRXJyb3IgZnJvbSBfaW52b2tlUHJvdmlkZXJcblx0XHRcdGNvbnN0IG9yaWdIYW5kbGVyID0gZXJyb3JIYW5kbGVyLmdldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIoKTtcblx0XHRcdGVycm9ySGFuZGxlci5zZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKCgpID0+IHsgfSk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBzZXJ2aWNlLmludm9rZVByb3ZpZGVycyhlcnJvclNlc3Npb24pO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0ZXJyb3JIYW5kbGVyLnNldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIob3JpZ0hhbmRsZXIpO1xuXHRcdFx0fVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0RXZlbnRzKGVycm9yU2Vzc2lvbikubGVuZ3RoLCAwKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2ludm9rZVByb3ZpZGVycycsICgpID0+IHtcblx0XHR0ZXN0KCdyZS1pbnZvY2F0aW9uIHRoYXQgcmV0dXJucyB1bmRlZmluZWQgc2hvdWxkIHByZXNlcnZlIHByZXZpb3VzbHkgbG9hZGVkIGV2ZW50cycsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIEEgcHJvdmlkZXIgdGhhdCBzdWNjZWVkcyBvbmNlIGFuZCB0aGVuIHRyYW5zaWVudGx5IGZhaWxzIChlLmcuIGFuXG5cdFx0XHQvLyBBZ2VudCBIb3N0IHNlc3Npb24ncyBldmVudHMuanNvbmwgaXMgbWlkLXJld3JpdGUgYnkgdGhlIGV4dGVybmFsXG5cdFx0XHQvLyBDTEkpIG11c3Qgbm90IHdpcGUgdGhlIGV2ZW50cyBjdXJyZW50bHkgc2hvd24uXG5cdFx0XHRsZXQgc3VjY2VlZCA9IHRydWU7XG5cdFx0XHRjb25zdCBwcm92aWRlcjogSUNoYXREZWJ1Z0xvZ1Byb3ZpZGVyID0ge1xuXHRcdFx0XHRwcm92aWRlQ2hhdERlYnVnTG9nOiBhc3luYyAoKSA9PiBzdWNjZWVkID8gW3tcblx0XHRcdFx0XHRraW5kOiAnZ2VuZXJpYycsXG5cdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBzZXNzaW9uR2VuZXJpYyxcblx0XHRcdFx0XHRjcmVhdGVkOiBuZXcgRGF0ZSgpLFxuXHRcdFx0XHRcdG5hbWU6ICdwcm92aWRlci1ldmVudCcsXG5cdFx0XHRcdFx0bGV2ZWw6IENoYXREZWJ1Z0xvZ0xldmVsLkluZm8sXG5cdFx0XHRcdH1dIDogdW5kZWZpbmVkLFxuXHRcdFx0fTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihwcm92aWRlcikpO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmludm9rZVByb3ZpZGVycyhzZXNzaW9uR2VuZXJpYyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRFdmVudHMoc2Vzc2lvbkdlbmVyaWMpLmxlbmd0aCwgMSk7XG5cblx0XHRcdC8vIFNlY29uZCBpbnZvY2F0aW9uIGZhaWxzIChyZXR1cm5zIHVuZGVmaW5lZCkgXHUyMDE0IGV2ZW50cyBhcmUga2VwdC5cblx0XHRcdHN1Y2NlZWQgPSBmYWxzZTtcblx0XHRcdGF3YWl0IHNlcnZpY2UuaW52b2tlUHJvdmlkZXJzKHNlc3Npb25HZW5lcmljKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldEV2ZW50cyhzZXNzaW9uR2VuZXJpYykubGVuZ3RoLCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBpbnZva2UgbXVsdGlwbGUgcHJvdmlkZXJzIGFuZCBtZXJnZSBldmVudHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlckE6IElDaGF0RGVidWdMb2dQcm92aWRlciA9IHtcblx0XHRcdFx0cHJvdmlkZUNoYXREZWJ1Z0xvZzogYXN5bmMgKCkgPT4gW3tcblx0XHRcdFx0XHRraW5kOiAnZ2VuZXJpYycsXG5cdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBzZXNzaW9uR2VuZXJpYyxcblx0XHRcdFx0XHRjcmVhdGVkOiBuZXcgRGF0ZSgpLFxuXHRcdFx0XHRcdG5hbWU6ICdmcm9tLUEnLFxuXHRcdFx0XHRcdGxldmVsOiBDaGF0RGVidWdMb2dMZXZlbC5JbmZvLFxuXHRcdFx0XHR9XSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBwcm92aWRlckI6IElDaGF0RGVidWdMb2dQcm92aWRlciA9IHtcblx0XHRcdFx0cHJvdmlkZUNoYXREZWJ1Z0xvZzogYXN5bmMgKCkgPT4gW3tcblx0XHRcdFx0XHRraW5kOiAnZ2VuZXJpYycsXG5cdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBzZXNzaW9uR2VuZXJpYyxcblx0XHRcdFx0XHRjcmVhdGVkOiBuZXcgRGF0ZSgpLFxuXHRcdFx0XHRcdG5hbWU6ICdmcm9tLUInLFxuXHRcdFx0XHRcdGxldmVsOiBDaGF0RGVidWdMb2dMZXZlbC5JbmZvLFxuXHRcdFx0XHR9XSxcblx0XHRcdH07XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIocHJvdmlkZXJBKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5yZWdpc3RlclByb3ZpZGVyKHByb3ZpZGVyQikpO1xuXHRcdFx0YXdhaXQgc2VydmljZS5pbnZva2VQcm92aWRlcnMoc2Vzc2lvbkdlbmVyaWMpO1xuXG5cdFx0XHRjb25zdCBuYW1lcyA9IChzZXJ2aWNlLmdldEV2ZW50cyhzZXNzaW9uR2VuZXJpYykgYXMgSUNoYXREZWJ1Z0dlbmVyaWNFdmVudFtdKS5tYXAoZSA9PiBlLm5hbWUpO1xuXHRcdFx0YXNzZXJ0Lm9rKG5hbWVzLmluY2x1ZGVzKCdmcm9tLUEnKSk7XG5cdFx0XHRhc3NlcnQub2sobmFtZXMuaW5jbHVkZXMoJ2Zyb20tQicpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBjYW5jZWwgcHJldmlvdXMgaW52b2NhdGlvbiBmb3Igc2FtZSBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IGNhbmNlbGxlZFRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiB8IHVuZGVmaW5lZDtcblxuXHRcdFx0Y29uc3QgcHJvdmlkZXI6IElDaGF0RGVidWdMb2dQcm92aWRlciA9IHtcblx0XHRcdFx0cHJvdmlkZUNoYXREZWJ1Z0xvZzogYXN5bmMgKF9zZXNzaW9uUmVzb3VyY2UsIHRva2VuKSA9PiB7XG5cdFx0XHRcdFx0Y2FuY2VsbGVkVG9rZW4gPSB0b2tlbjtcblx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5yZWdpc3RlclByb3ZpZGVyKHByb3ZpZGVyKSk7XG5cblx0XHRcdC8vIEZpcnN0IGludm9jYXRpb25cblx0XHRcdGF3YWl0IHNlcnZpY2UuaW52b2tlUHJvdmlkZXJzKHNlc3Npb25HZW5lcmljKTtcblx0XHRcdGNvbnN0IGZpcnN0VG9rZW4gPSBjYW5jZWxsZWRUb2tlbiE7XG5cblx0XHRcdC8vIFNlY29uZCBpbnZvY2F0aW9uIGZvciBzYW1lIHNlc3Npb24gc2hvdWxkIGNhbmNlbCB0aGUgZmlyc3Rcblx0XHRcdGF3YWl0IHNlcnZpY2UuaW52b2tlUHJvdmlkZXJzKHNlc3Npb25HZW5lcmljKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdFRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBmaXJlIG9uRGlkQ2xlYXJQcm92aWRlckV2ZW50cyB3aGVuIGNsZWFyaW5nIHByb3ZpZGVyIGV2ZW50cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNsZWFyZWRTZXNzaW9uczogVVJJW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkQ2xlYXJQcm92aWRlckV2ZW50cyhzZXNzaW9uUmVzb3VyY2UgPT4gY2xlYXJlZFNlc3Npb25zLnB1c2goc2Vzc2lvblJlc291cmNlKSkpO1xuXG5cdFx0XHRjb25zdCBwcm92aWRlcjogSUNoYXREZWJ1Z0xvZ1Byb3ZpZGVyID0ge1xuXHRcdFx0XHRwcm92aWRlQ2hhdERlYnVnTG9nOiBhc3luYyAoc2Vzc2lvblJlc291cmNlKSA9PiBbe1xuXHRcdFx0XHRcdGtpbmQ6ICdnZW5lcmljJyxcblx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0Y3JlYXRlZDogbmV3IERhdGUoKSxcblx0XHRcdFx0XHRuYW1lOiAncHJvdmlkZXItZXZlbnQnLFxuXHRcdFx0XHRcdGxldmVsOiBDaGF0RGVidWdMb2dMZXZlbC5JbmZvLFxuXHRcdFx0XHR9XSxcblx0XHRcdH07XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIocHJvdmlkZXIpKTtcblxuXHRcdFx0Ly8gRmlyc3QgaW52b2NhdGlvbiBjbGVhcnMgZW1wdHkgc2V0IGFuZCBmaXJlcyBjbGVhciBldmVudFxuXHRcdFx0YXdhaXQgc2VydmljZS5pbnZva2VQcm92aWRlcnMoc2Vzc2lvbkdlbmVyaWMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsZWFyZWRTZXNzaW9ucy5sZW5ndGgsIDEsICdDbGVhciBldmVudCBzaG91bGQgZmlyZSBvbiBmaXJzdCBpbnZvY2F0aW9uJyk7XG5cblx0XHRcdC8vIFNlY29uZCBpbnZvY2F0aW9uIGNsZWFycyBwcm92aWRlciBldmVudHMgZnJvbSBmaXJzdCBpbnZvY2F0aW9uXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmludm9rZVByb3ZpZGVycyhzZXNzaW9uR2VuZXJpYyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xlYXJlZFNlc3Npb25zLmxlbmd0aCwgMiwgJ0NsZWFyIGV2ZW50IHNob3VsZCBmaXJlIG9uIHNlY29uZCBpbnZvY2F0aW9uJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xlYXJlZFNlc3Npb25zWzFdLnRvU3RyaW5nKCksIHNlc3Npb25HZW5lcmljLnRvU3RyaW5nKCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBjYW5jZWwgaW52b2NhdGlvbnMgZm9yIGRpZmZlcmVudCBzZXNzaW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRva2VuczogTWFwPHN0cmluZywgQ2FuY2VsbGF0aW9uVG9rZW4+ID0gbmV3IE1hcCgpO1xuXG5cdFx0XHRjb25zdCBwcm92aWRlcjogSUNoYXREZWJ1Z0xvZ1Byb3ZpZGVyID0ge1xuXHRcdFx0XHRwcm92aWRlQ2hhdERlYnVnTG9nOiBhc3luYyAoc2Vzc2lvblJlc291cmNlLCB0b2tlbikgPT4ge1xuXHRcdFx0XHRcdHRva2Vucy5zZXQoc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCksIHRva2VuKTtcblx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5yZWdpc3RlclByb3ZpZGVyKHByb3ZpZGVyKSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UuaW52b2tlUHJvdmlkZXJzKHNlc3Npb25BKTtcblx0XHRcdGF3YWl0IHNlcnZpY2UuaW52b2tlUHJvdmlkZXJzKHNlc3Npb25CKTtcblxuXHRcdFx0Y29uc3QgdG9rZW5BID0gdG9rZW5zLmdldChzZXNzaW9uQS50b1N0cmluZygpKSE7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9rZW5BLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkLCBmYWxzZSwgJ3Nlc3Npb24tYSB0b2tlbiBzaG91bGQgbm90IGJlIGNhbmNlbGxlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBpbnZva2UgcHJvdmlkZXJzIGZvciBpbmVsaWdpYmxlIHNlc3Npb24gc2NoZW1lcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGxldCBwcm92aWRlckNhbGxlZCA9IGZhbHNlO1xuXG5cdFx0XHRjb25zdCBwcm92aWRlcjogSUNoYXREZWJ1Z0xvZ1Byb3ZpZGVyID0ge1xuXHRcdFx0XHRwcm92aWRlQ2hhdERlYnVnTG9nOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0cHJvdmlkZXJDYWxsZWQgPSB0cnVlO1xuXHRcdFx0XHRcdHJldHVybiBbe1xuXHRcdFx0XHRcdFx0a2luZDogJ2dlbmVyaWMnLFxuXHRcdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBub25Mb2NhbFNlc3Npb24sXG5cdFx0XHRcdFx0XHRjcmVhdGVkOiBuZXcgRGF0ZSgpLFxuXHRcdFx0XHRcdFx0bmFtZTogJ3Nob3VsZC1ub3QtYXBwZWFyJyxcblx0XHRcdFx0XHRcdGxldmVsOiBDaGF0RGVidWdMb2dMZXZlbC5JbmZvLFxuXHRcdFx0XHRcdH1dO1xuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihwcm92aWRlcikpO1xuXHRcdFx0YXdhaXQgc2VydmljZS5pbnZva2VQcm92aWRlcnMobm9uTG9jYWxTZXNzaW9uKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyQ2FsbGVkLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRFdmVudHMobm9uTG9jYWxTZXNzaW9uKS5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGludm9rZSBwcm92aWRlcnMgZm9yIGNvcGlsb3RjbGkgc2Vzc2lvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRsZXQgcHJvdmlkZXJDYWxsZWQgPSBmYWxzZTtcblxuXHRcdFx0Y29uc3QgcHJvdmlkZXI6IElDaGF0RGVidWdMb2dQcm92aWRlciA9IHtcblx0XHRcdFx0cHJvdmlkZUNoYXREZWJ1Z0xvZzogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdHByb3ZpZGVyQ2FsbGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRyZXR1cm4gW3tcblx0XHRcdFx0XHRcdGtpbmQ6ICdnZW5lcmljJyxcblx0XHRcdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogY29waWxvdENsaVNlc3Npb24sXG5cdFx0XHRcdFx0XHRjcmVhdGVkOiBuZXcgRGF0ZSgpLFxuXHRcdFx0XHRcdFx0bmFtZTogJ2NsaS1wcm92aWRlci1ldmVudCcsXG5cdFx0XHRcdFx0XHRsZXZlbDogQ2hhdERlYnVnTG9nTGV2ZWwuSW5mbyxcblx0XHRcdFx0XHR9XTtcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIocHJvdmlkZXIpKTtcblx0XHRcdGF3YWl0IHNlcnZpY2UuaW52b2tlUHJvdmlkZXJzKGNvcGlsb3RDbGlTZXNzaW9uKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyQ2FsbGVkLCB0cnVlKTtcblx0XHRcdGFzc2VydC5vayhzZXJ2aWNlLmdldEV2ZW50cyhjb3BpbG90Q2xpU2Vzc2lvbikubGVuZ3RoID4gMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaW52b2tlIHByb3ZpZGVycyBmb3IgY2xhdWRlLWNvZGUgc2Vzc2lvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRsZXQgcHJvdmlkZXJDYWxsZWQgPSBmYWxzZTtcblxuXHRcdFx0Y29uc3QgcHJvdmlkZXI6IElDaGF0RGVidWdMb2dQcm92aWRlciA9IHtcblx0XHRcdFx0cHJvdmlkZUNoYXREZWJ1Z0xvZzogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdHByb3ZpZGVyQ2FsbGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRyZXR1cm4gW3tcblx0XHRcdFx0XHRcdGtpbmQ6ICdnZW5lcmljJyxcblx0XHRcdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogY2xhdWRlQ29kZVNlc3Npb24sXG5cdFx0XHRcdFx0XHRjcmVhdGVkOiBuZXcgRGF0ZSgpLFxuXHRcdFx0XHRcdFx0bmFtZTogJ2NsYXVkZS1wcm92aWRlci1ldmVudCcsXG5cdFx0XHRcdFx0XHRsZXZlbDogQ2hhdERlYnVnTG9nTGV2ZWwuSW5mbyxcblx0XHRcdFx0XHR9XTtcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIocHJvdmlkZXIpKTtcblx0XHRcdGF3YWl0IHNlcnZpY2UuaW52b2tlUHJvdmlkZXJzKGNsYXVkZUNvZGVTZXNzaW9uKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyQ2FsbGVkLCB0cnVlKTtcblx0XHRcdGFzc2VydC5vayhzZXJ2aWNlLmdldEV2ZW50cyhjbGF1ZGVDb2RlU2Vzc2lvbikubGVuZ3RoID4gMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCduZXdseSByZWdpc3RlcmVkIHByb3ZpZGVyIHNob3VsZCBiZSBpbnZva2VkIGZvciBhY3RpdmUgc2Vzc2lvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBTdGFydCBhbiBpbnZvY2F0aW9uIGJlZm9yZSB0aGUgcHJvdmlkZXIgaXMgcmVnaXN0ZXJlZFxuXHRcdFx0Y29uc3QgZmlyc3RQcm92aWRlcjogSUNoYXREZWJ1Z0xvZ1Byb3ZpZGVyID0ge1xuXHRcdFx0XHRwcm92aWRlQ2hhdERlYnVnTG9nOiBhc3luYyAoKSA9PiBbXSxcblx0XHRcdH07XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5yZWdpc3RlclByb3ZpZGVyKGZpcnN0UHJvdmlkZXIpKTtcblx0XHRcdGF3YWl0IHNlcnZpY2UuaW52b2tlUHJvdmlkZXJzKHNlc3Npb25HZW5lcmljKTtcblxuXHRcdFx0Ly8gTm93IHJlZ2lzdGVyIGEgbmV3IHByb3ZpZGVyIFx1MjAxNCBpdCBzaG91bGQgYmUgaW52b2tlZCBmb3IgdGhlIGFjdGl2ZSBzZXNzaW9uXG5cdFx0XHRjb25zdCBsYXRlRXZlbnRzOiBJQ2hhdERlYnVnRXZlbnRbXSA9IFtdO1xuXHRcdFx0Y29uc3QgbGF0ZVByb3ZpZGVyOiBJQ2hhdERlYnVnTG9nUHJvdmlkZXIgPSB7XG5cdFx0XHRcdHByb3ZpZGVDaGF0RGVidWdMb2c6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRjb25zdCBldmVudDogSUNoYXREZWJ1Z0dlbmVyaWNFdmVudCA9IHtcblx0XHRcdFx0XHRcdGtpbmQ6ICdnZW5lcmljJyxcblx0XHRcdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogc2Vzc2lvbkdlbmVyaWMsXG5cdFx0XHRcdFx0XHRjcmVhdGVkOiBuZXcgRGF0ZSgpLFxuXHRcdFx0XHRcdFx0bmFtZTogJ2xhdGUtcHJvdmlkZXItZXZlbnQnLFxuXHRcdFx0XHRcdFx0bGV2ZWw6IENoYXREZWJ1Z0xvZ0xldmVsLkluZm8sXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRsYXRlRXZlbnRzLnB1c2goZXZlbnQpO1xuXHRcdFx0XHRcdHJldHVybiBbZXZlbnRdO1xuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihsYXRlUHJvdmlkZXIpKTtcblxuXHRcdFx0Ly8gR2l2ZSBpdCBhIHRpY2sgdG8gbGV0IHRoZSBhc3luYyBpbnZvY2F0aW9uIGNvbXBsZXRlXG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTApKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGxhdGVFdmVudHMubGVuZ3RoID4gMCwgJ0xhdGUgcHJvdmlkZXIgc2hvdWxkIGhhdmUgYmVlbiBpbnZva2VkJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdyZXNvbHZlRXZlbnQnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIGRlbGVnYXRlIHRvIHByb3ZpZGVyIHdpdGggcmVzb2x2ZUNoYXREZWJ1Z0xvZ0V2ZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWQ6IElDaGF0RGVidWdSZXNvbHZlZEV2ZW50Q29udGVudCA9IHtcblx0XHRcdFx0a2luZDogJ3RleHQnLFxuXHRcdFx0XHR2YWx1ZTogJ3Jlc29sdmVkIGRldGFpbCB0ZXh0Jyxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHByb3ZpZGVyOiBJQ2hhdERlYnVnTG9nUHJvdmlkZXIgPSB7XG5cdFx0XHRcdHByb3ZpZGVDaGF0RGVidWdMb2c6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdFx0cmVzb2x2ZUNoYXREZWJ1Z0xvZ0V2ZW50OiBhc3luYyAoZXZlbnRJZCkgPT4ge1xuXHRcdFx0XHRcdGlmIChldmVudElkID09PSAnbXktZXZlbnQnKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gcmVzb2x2ZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5yZWdpc3RlclByb3ZpZGVyKHByb3ZpZGVyKSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZUV2ZW50KCdteS1ldmVudCcpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHJlc29sdmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gdW5kZWZpbmVkIGlmIG5vIHByb3ZpZGVyIHJlc29sdmVzIHRoZSBldmVudCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyOiBJQ2hhdERlYnVnTG9nUHJvdmlkZXIgPSB7XG5cdFx0XHRcdHByb3ZpZGVDaGF0RGVidWdMb2c6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdFx0cmVzb2x2ZUNoYXREZWJ1Z0xvZ0V2ZW50OiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5yZWdpc3RlclByb3ZpZGVyKHByb3ZpZGVyKSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZUV2ZW50KCdub25leGlzdGVudCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gdW5kZWZpbmVkIHdoZW4gbm8gcHJvdmlkZXJzIHJlZ2lzdGVyZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmVFdmVudCgnYW55LWlkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiBmaXJzdCBub24tdW5kZWZpbmVkIHJlc29sdXRpb24gZnJvbSBtdWx0aXBsZSBwcm92aWRlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlcjE6IElDaGF0RGVidWdMb2dQcm92aWRlciA9IHtcblx0XHRcdFx0cHJvdmlkZUNoYXREZWJ1Z0xvZzogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHRyZXNvbHZlQ2hhdERlYnVnTG9nRXZlbnQ6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBwcm92aWRlcjI6IElDaGF0RGVidWdMb2dQcm92aWRlciA9IHtcblx0XHRcdFx0cHJvdmlkZUNoYXREZWJ1Z0xvZzogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHRyZXNvbHZlQ2hhdERlYnVnTG9nRXZlbnQ6IGFzeW5jICgpID0+ICh7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6ICdmcm9tIHByb3ZpZGVyIDInIH0pLFxuXHRcdFx0fTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihwcm92aWRlcjEpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIocHJvdmlkZXIyKSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZUV2ZW50KCdhbnknKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6ICdmcm9tIHByb3ZpZGVyIDInIH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZW5kU2Vzc2lvbicsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgY2FuY2VsIGFuZCByZW1vdmUgdGhlIENUUyBmb3IgYSBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IGNhcHR1cmVkVG9rZW46IENhbmNlbGxhdGlvblRva2VuIHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRjb25zdCBwcm92aWRlcjogSUNoYXREZWJ1Z0xvZ1Byb3ZpZGVyID0ge1xuXHRcdFx0XHRwcm92aWRlQ2hhdERlYnVnTG9nOiBhc3luYyAoX3Nlc3Npb25SZXNvdXJjZSwgdG9rZW4pID0+IHtcblx0XHRcdFx0XHRjYXB0dXJlZFRva2VuID0gdG9rZW47XG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihwcm92aWRlcikpO1xuXHRcdFx0YXdhaXQgc2VydmljZS5pbnZva2VQcm92aWRlcnMoc2Vzc2lvbkdlbmVyaWMpO1xuXG5cdFx0XHRhc3NlcnQub2soY2FwdHVyZWRUb2tlbik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FwdHVyZWRUb2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCwgZmFsc2UpO1xuXG5cdFx0XHRzZXJ2aWNlLmVuZFNlc3Npb24oc2Vzc2lvbkdlbmVyaWMpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FwdHVyZWRUb2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgYmUgc2FmZSB0byBjYWxsIGZvciB1bmtub3duIHNlc3Npb24nLCAoKSA9PiB7XG5cdFx0XHQvLyBTaG91bGQgbm90IHRocm93XG5cdFx0XHRzZXJ2aWNlLmVuZFNlc3Npb24oVVJJLnBhcnNlKCd2c2NvZGUtY2hhdC1zZXNzaW9uOi8vbG9jYWwvbm9uZXhpc3RlbnQnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdsYXRlIHByb3ZpZGVyIHNob3VsZCBub3QgYmUgaW52b2tlZCBmb3IgZW5kZWQgc2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZpcnN0UHJvdmlkZXI6IElDaGF0RGVidWdMb2dQcm92aWRlciA9IHtcblx0XHRcdFx0cHJvdmlkZUNoYXREZWJ1Z0xvZzogYXN5bmMgKCkgPT4gW10sXG5cdFx0XHR9O1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihmaXJzdFByb3ZpZGVyKSk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmludm9rZVByb3ZpZGVycyhzZXNzaW9uR2VuZXJpYyk7XG5cblx0XHRcdHNlcnZpY2UuZW5kU2Vzc2lvbihzZXNzaW9uR2VuZXJpYyk7XG5cblx0XHRcdGxldCBsYXRlQ2FsbGVkID0gZmFsc2U7XG5cdFx0XHRjb25zdCBsYXRlUHJvdmlkZXI6IElDaGF0RGVidWdMb2dQcm92aWRlciA9IHtcblx0XHRcdFx0cHJvdmlkZUNoYXREZWJ1Z0xvZzogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGxhdGVDYWxsZWQgPSB0cnVlO1xuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5yZWdpc3RlclByb3ZpZGVyKGxhdGVQcm92aWRlcikpO1xuXG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTApKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXRlQ2FsbGVkLCBmYWxzZSwgJ0xhdGUgcHJvdmlkZXIgc2hvdWxkIG5vdCBiZSBpbnZva2VkIGZvciBlbmRlZCBzZXNzaW9uJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdkaXNwb3NlJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBjYW5jZWwgYWN0aXZlIGludm9jYXRpb25zIG9uIGRpc3Bvc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRsZXQgY2FwdHVyZWRUb2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4gfCB1bmRlZmluZWQ7XG5cblx0XHRcdGNvbnN0IHByb3ZpZGVyOiBJQ2hhdERlYnVnTG9nUHJvdmlkZXIgPSB7XG5cdFx0XHRcdHByb3ZpZGVDaGF0RGVidWdMb2c6IGFzeW5jIChfc2Vzc2lvblJlc291cmNlLCB0b2tlbikgPT4ge1xuXHRcdFx0XHRcdGNhcHR1cmVkVG9rZW4gPSB0b2tlbjtcblx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5yZWdpc3RlclByb3ZpZGVyKHByb3ZpZGVyKSk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmludm9rZVByb3ZpZGVycyhzZXNzaW9uR2VuZXJpYyk7XG5cblx0XHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGN0cyk7XG5cblx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXG5cdFx0XHRhc3NlcnQub2soY2FwdHVyZWRUb2tlbik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FwdHVyZWRUb2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCwgdHJ1ZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdldmVudCBkZWR1cGxpY2F0aW9uJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBkZWR1cGxpY2F0ZSBldmVudHMgd2l0aCB0aGUgc2FtZSBJRCwga2VlcGluZyB0aGUgcmljaGVyIGtpbmQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1c2VyTXNnOiBJQ2hhdERlYnVnRXZlbnQgPSB7XG5cdFx0XHRcdGtpbmQ6ICd1c2VyTWVzc2FnZScsXG5cdFx0XHRcdGlkOiAnc2hhcmVkLWlkLTEnLFxuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHNlc3Npb24xLFxuXHRcdFx0XHRjcmVhdGVkOiBuZXcgRGF0ZSgnMjAyNi0wMS0wMVQwMDowMDowMFonKSxcblx0XHRcdFx0bWVzc2FnZTogJ2hlbGxvJyxcblx0XHRcdFx0c2VjdGlvbnM6IFtdLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHN1YmFnZW50OiBJQ2hhdERlYnVnRXZlbnQgPSB7XG5cdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudEludm9jYXRpb24nLFxuXHRcdFx0XHRpZDogJ3NoYXJlZC1pZC0xJyxcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBzZXNzaW9uMSxcblx0XHRcdFx0Y3JlYXRlZDogbmV3IERhdGUoJzIwMjYtMDEtMDFUMDA6MDA6MDFaJyksXG5cdFx0XHRcdGFnZW50TmFtZTogJ0V4cGxvcmUnLFxuXHRcdFx0fTtcblx0XHRcdHNlcnZpY2UuYWRkRXZlbnQodXNlck1zZyk7XG5cdFx0XHRzZXJ2aWNlLmFkZEV2ZW50KHN1YmFnZW50KTtcblxuXHRcdFx0Y29uc3QgZXZlbnRzID0gc2VydmljZS5nZXRFdmVudHMoc2Vzc2lvbjEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50c1swXS5raW5kLCAnc3ViYWdlbnRJbnZvY2F0aW9uJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQga2VlcCByaWNoZXIgZXZlbnQgd2hlbiBpdCBhcnJpdmVzIGZpcnN0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3ViYWdlbnQ6IElDaGF0RGVidWdFdmVudCA9IHtcblx0XHRcdFx0a2luZDogJ3N1YmFnZW50SW52b2NhdGlvbicsXG5cdFx0XHRcdGlkOiAnc2hhcmVkLWlkLTInLFxuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHNlc3Npb24xLFxuXHRcdFx0XHRjcmVhdGVkOiBuZXcgRGF0ZSgnMjAyNi0wMS0wMVQwMDowMDowMFonKSxcblx0XHRcdFx0YWdlbnROYW1lOiAnRXhwbG9yZScsXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgdXNlck1zZzogSUNoYXREZWJ1Z0V2ZW50ID0ge1xuXHRcdFx0XHRraW5kOiAndXNlck1lc3NhZ2UnLFxuXHRcdFx0XHRpZDogJ3NoYXJlZC1pZC0yJyxcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBzZXNzaW9uMSxcblx0XHRcdFx0Y3JlYXRlZDogbmV3IERhdGUoJzIwMjYtMDEtMDFUMDA6MDA6MDFaJyksXG5cdFx0XHRcdG1lc3NhZ2U6ICdoZWxsbycsXG5cdFx0XHRcdHNlY3Rpb25zOiBbXSxcblx0XHRcdH07XG5cdFx0XHRzZXJ2aWNlLmFkZEV2ZW50KHN1YmFnZW50KTtcblx0XHRcdHNlcnZpY2UuYWRkRXZlbnQodXNlck1zZyk7XG5cblx0XHRcdGNvbnN0IGV2ZW50cyA9IHNlcnZpY2UuZ2V0RXZlbnRzKHNlc3Npb24xKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHNbMF0ua2luZCwgJ3N1YmFnZW50SW52b2NhdGlvbicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBmaXJlIG9uRGlkQWRkRXZlbnQgZm9yIHNraXBwZWQgZHVwbGljYXRlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGZpcmVkS2luZHM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZEFkZEV2ZW50KGUgPT4gZmlyZWRLaW5kcy5wdXNoKGUua2luZCkpKTtcblxuXHRcdFx0Y29uc3Qgc3ViYWdlbnQ6IElDaGF0RGVidWdFdmVudCA9IHtcblx0XHRcdFx0a2luZDogJ3N1YmFnZW50SW52b2NhdGlvbicsXG5cdFx0XHRcdGlkOiAnc2hhcmVkLWlkLTMnLFxuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHNlc3Npb24xLFxuXHRcdFx0XHRjcmVhdGVkOiBuZXcgRGF0ZSgnMjAyNi0wMS0wMVQwMDowMDowMFonKSxcblx0XHRcdFx0YWdlbnROYW1lOiAnRXhwbG9yZScsXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgdXNlck1zZzogSUNoYXREZWJ1Z0V2ZW50ID0ge1xuXHRcdFx0XHRraW5kOiAndXNlck1lc3NhZ2UnLFxuXHRcdFx0XHRpZDogJ3NoYXJlZC1pZC0zJyxcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBzZXNzaW9uMSxcblx0XHRcdFx0Y3JlYXRlZDogbmV3IERhdGUoJzIwMjYtMDEtMDFUMDA6MDA6MDFaJyksXG5cdFx0XHRcdG1lc3NhZ2U6ICdoZWxsbycsXG5cdFx0XHRcdHNlY3Rpb25zOiBbXSxcblx0XHRcdH07XG5cdFx0XHRzZXJ2aWNlLmFkZEV2ZW50KHN1YmFnZW50KTtcblx0XHRcdHNlcnZpY2UuYWRkRXZlbnQodXNlck1zZyk7IC8vIHNob3VsZCBiZSBza2lwcGVkXG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZmlyZWRLaW5kcywgWydzdWJhZ2VudEludm9jYXRpb24nXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgYWxsb3cgZXZlbnRzIHdpdGhvdXQgSURzIHRvIGNvZXhpc3QnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBldmVudDE6IElDaGF0RGVidWdHZW5lcmljRXZlbnQgPSB7XG5cdFx0XHRcdGtpbmQ6ICdnZW5lcmljJyxcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBzZXNzaW9uMSxcblx0XHRcdFx0Y3JlYXRlZDogbmV3IERhdGUoJzIwMjYtMDEtMDFUMDA6MDA6MDBaJyksXG5cdFx0XHRcdG5hbWU6ICdhJyxcblx0XHRcdFx0bGV2ZWw6IENoYXREZWJ1Z0xvZ0xldmVsLkluZm8sXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgZXZlbnQyOiBJQ2hhdERlYnVnR2VuZXJpY0V2ZW50ID0ge1xuXHRcdFx0XHRraW5kOiAnZ2VuZXJpYycsXG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogc2Vzc2lvbjEsXG5cdFx0XHRcdGNyZWF0ZWQ6IG5ldyBEYXRlKCcyMDI2LTAxLTAxVDAwOjAwOjAxWicpLFxuXHRcdFx0XHRuYW1lOiAnYicsXG5cdFx0XHRcdGxldmVsOiBDaGF0RGVidWdMb2dMZXZlbC5JbmZvLFxuXHRcdFx0fTtcblx0XHRcdHNlcnZpY2UuYWRkRXZlbnQoZXZlbnQxKTtcblx0XHRcdHNlcnZpY2UuYWRkRXZlbnQoZXZlbnQyKTtcblxuXHRcdFx0Y29uc3QgZXZlbnRzID0gc2VydmljZS5nZXRFdmVudHMoc2Vzc2lvbjEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5sZW5ndGgsIDIpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQTRCLCtCQUErQjtBQUMzRCxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx5QkFBNEs7QUFDckwsU0FBUyw0QkFBNEI7QUFDckMsU0FBUywyQkFBMkI7QUFFcEMsTUFBTSx3QkFBd0IsTUFBTTtBQUNuQyxRQUFNLGNBQWMsd0NBQXdDO0FBRTVELE1BQUk7QUFFSixRQUFNLFdBQVcsSUFBSSxNQUFNLHVDQUF1QztBQUNsRSxRQUFNLFdBQVcsSUFBSSxNQUFNLHVDQUF1QztBQUNsRSxRQUFNLFdBQVcsb0JBQW9CLFdBQVcsR0FBRztBQUNuRCxRQUFNLFdBQVcsb0JBQW9CLFdBQVcsR0FBRztBQUNuRCxRQUFNLGlCQUFpQixJQUFJLE1BQU0scUNBQXFDO0FBQ3RFLFFBQU0sa0JBQWtCLElBQUksTUFBTSx5Q0FBeUM7QUFDM0UsUUFBTSxvQkFBb0IsSUFBSSxNQUFNLDZCQUE2QjtBQUNqRSxRQUFNLG9CQUFvQixJQUFJLE1BQU0sOEJBQThCO0FBRWxFLFFBQU0sTUFBTTtBQUNYLGNBQVUsWUFBWSxJQUFJLElBQUkscUJBQXFCLElBQUkseUJBQXlCLENBQUMsQ0FBQztBQUFBLEVBQ25GLENBQUM7QUFFRCxRQUFNLDBCQUEwQixNQUFNO0FBQ3JDLFNBQUssa0NBQWtDLE1BQU07QUFDNUMsWUFBTSxRQUFnQztBQUFBLFFBQ3JDLE1BQU07QUFBQSxRQUNOLGlCQUFpQjtBQUFBLFFBQ2pCLFNBQVMsb0JBQUksS0FBSztBQUFB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
