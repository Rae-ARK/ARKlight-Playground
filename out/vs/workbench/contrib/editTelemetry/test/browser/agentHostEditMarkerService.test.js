import assert from "assert";
import { timeout } from "../../../../../base/common/async.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { Schemas } from "../../../../../base/common/network.js";
import { extUri } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { runWithFakedTimers } from "../../../../../base/test/common/timeTravelScheduler.js";
import { IAgentHostService } from "../../../../../platform/agentHost/common/agentService.js";
import { IAgentHostConnectionsService } from "../../../../../platform/agentHost/common/agentHostConnectionsService.js";
import { toAgentHostUri } from "../../../../../platform/agentHost/common/agentHostUri.js";
import { createFileEditContentDigest, FILE_EDIT_ATTRIBUTION_PROPERTY, parseEditAttributionResource } from "../../../../../platform/agentHost/common/fileEditAttribution.js";
import { ActionType } from "../../../../../platform/agentHost/common/state/protocol/common/actions.js";
import { ContentEncoding } from "../../../../../platform/agentHost/common/state/protocol/commands.js";
import { ToolResultContentType } from "../../../../../platform/agentHost/common/state/sessionState.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IUriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentity.js";
import { AgentHostEditAttributionDeferredError, AgentHostEditMarkerService } from "../../browser/telemetry/agentHostEditMarkerService.js";
suite("Agent Host Edit Marker Service", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("suppresses marker-first and reload-first observations", () => {
    const context = createContext();
    const correlation = context.service.createCorrelation(context.resource);
    context.fireMarker(marker(1, "a", "ab"));
    const markerFirst = correlation.register("a", "ab");
    const reloadFirst = correlation.register("ab", "abc");
    context.fireMarker(marker(2, "ab", "abc"));
    assert.deepStrictEqual({
      markerFirst: correlation.isSuppressed(markerFirst),
      reloadFirst: correlation.isSuppressed(reloadFirst),
      suppressedIds: context.suppressedIds
    }, {
      markerFirst: true,
      reloadFirst: true,
      suppressedIds: [markerFirst, reloadFirst]
    });
  });
  test("records oversized Agent edits as coverage gaps without suppressing reloads", () => {
    const context = createContext();
    const correlation = context.service.createCorrelation(context.resource);
    context.fireMarker({
      version: 1,
      editId: "edit-skipped",
      sequence: 1,
      status: "skipped",
      reason: "fileTooLarge",
      insertedCount: 42
    });
    const observation = correlation.register("a", "ab");
    assert.deepStrictEqual({
      suppressed: correlation.isSuppressed(observation),
      coverageGap: context.service.takeCoverageGap(context.resource)
    }, {
      suppressed: false,
      coverageGap: {
        editCount: 1,
        insertedCount: 42
      }
    });
  });
  test("does not report expired coverage gaps", () => runWithFakedTimers({}, async () => {
    const context = createContext();
    context.fireMarker({
      version: 1,
      editId: "edit-skipped",
      sequence: 1,
      status: "skipped",
      reason: "fileTooLarge",
      insertedCount: 42
    });
    await timeout(10 * 60 * 60 * 1e3 + 1);
    assert.strictEqual(context.service.takeCoverageGap(context.resource), void 0);
  }));
  test("matches a connected Agent marker chain to one reload", () => {
    const context = createContext();
    const correlation = context.service.createCorrelation(context.resource);
    context.fireMarker(marker(1, "a", "ab"));
    context.fireMarker(marker(2, "ab", "abc"));
    const observation = correlation.register("a", "abc");
    assert.deepStrictEqual({
      suppressed: correlation.isSuppressed(observation),
      suppressedIds: context.suppressedIds
    }, {
      suppressed: true,
      suppressedIds: [observation]
    });
  });
  test("does not reuse a completed Agent content cycle", () => {
    const context = createContext();
    const correlation = context.service.createCorrelation(context.resource);
    context.fireMarker(marker(1, "a", "ab"));
    context.fireMarker(marker(2, "ab", "a"));
    const unrelatedObservation = correlation.register("a", "ab");
    assert.deepStrictEqual({
      suppressed: correlation.isSuppressed(unrelatedObservation),
      suppressedIds: context.suppressedIds
    }, {
      suppressed: false,
      suppressedIds: []
    });
  });
  test("invalidates old suppressions when the Agent Host sequence restarts", () => {
    const context = createContext();
    const correlation = context.service.createCorrelation(context.resource);
    context.fireMarker(marker(5, "a", "ab"));
    const oldObservation = correlation.register("a", "ab");
    context.fireMarker(marker(1, "ab", "abc"));
    const newObservation = correlation.register("ab", "abc");
    assert.deepStrictEqual({
      oldSuppressed: correlation.isSuppressed(oldObservation),
      newSuppressed: correlation.isSuppressed(newObservation),
      invalidatedIds: context.invalidatedIds
    }, {
      oldSuppressed: false,
      newSuppressed: true,
      invalidatedIds: [oldObservation]
    });
  });
  test("does not suppress with an expired marker", () => runWithFakedTimers({}, async () => {
    const context = createContext();
    const correlation = context.service.createCorrelation(context.resource);
    context.fireMarker(marker(1, "a", "ab"));
    await timeout(5 * 60 * 1e3 + 1);
    const observation = correlation.register("a", "ab");
    assert.strictEqual(correlation.isSuppressed(observation), false);
  }));
  test("does not coordinate with an expired route", () => runWithFakedTimers({}, async () => {
    const context = createContext();
    const correlation = context.service.createCorrelation(context.resource);
    context.fireMarker(marker(1, "a", "ab"));
    const observation = correlation.register("a", "ab");
    await timeout(10 * 60 * 60 * 1e3 + 1);
    const prepared = await context.service.prepareFlush(context.resource, "hashChange", "stats-1", false);
    assert.deepStrictEqual({
      prepared,
      suppressed: correlation.isSuppressed(observation),
      invalidatedIds: context.invalidatedIds,
      resourceReads: context.resourceReads
    }, {
      prepared: void 0,
      suppressed: false,
      invalidatedIds: [observation],
      resourceReads: []
    });
  }));
  test("matches ambient remote model URIs to Agent Host file markers", () => {
    const context = createContext();
    const remoteResource = URI.from({
      scheme: Schemas.vscodeRemote,
      authority: "ssh-remote+example",
      path: context.resource.path
    });
    const correlation = context.service.createCorrelation(remoteResource);
    context.fireMarker(marker(1, "a", "ab"));
    const observation = correlation.register("a", "ab");
    assert.strictEqual(correlation.isSuppressed(observation), true);
  });
  test("coordinates flushes through a non-ambient remote connection", async () => {
    const context = createContext({ isAmbient: false, authority: "remote-one" });
    const remoteResource = toAgentHostUri(context.resource, "remote-one");
    context.service.createCorrelation(remoteResource);
    context.fireMarker(marker(1, "a", "ab"));
    const prepared = await context.service.prepareFlush(remoteResource, "hashChange", "stats-1", false);
    await prepared?.commit(5);
    assert.deepStrictEqual({
      prepared: prepared && {
        flushTokenLength: prepared.flushToken.length,
        agentModifiedCount: prepared.agentModifiedCount
      },
      resourceReads: context.resourceReads
    }, {
      prepared: {
        flushTokenLength: 36,
        agentModifiedCount: 2
      },
      resourceReads: ["/prepare", "/commit"]
    });
  });
  test("waits for the prepared Agent marker before coordinating", async () => {
    const context = createContext({ isAmbient: false, authority: "remote-one", prepareSequence: 2 });
    const remoteResource = toAgentHostUri(context.resource, "remote-one");
    context.service.createCorrelation(remoteResource);
    context.fireMarker(marker(1, "a", "ab"));
    const prepare = context.service.prepareFlush(remoteResource, "hashChange", "stats-1", false);
    await timeout(0);
    context.fireMarker(marker(2, "ab", "abc"));
    const prepared = await prepare;
    assert.deepStrictEqual({
      agentModifiedCount: prepared?.agentModifiedCount,
      resourceReads: context.resourceReads
    }, {
      agentModifiedCount: 2,
      resourceReads: ["/prepare"]
    });
  });
  test("cancels a prepared flush when the commit transport fails", async () => {
    const context = createContext({ isAmbient: false, authority: "remote-one", failCommit: true });
    const remoteResource = toAgentHostUri(context.resource, "remote-one");
    context.service.createCorrelation(remoteResource);
    context.fireMarker(marker(1, "a", "ab"));
    const prepared = await context.service.prepareFlush(remoteResource, "hashChange", "stats-1", false);
    await assert.rejects(() => prepared.commit(5), (error) => error instanceof AgentHostEditAttributionDeferredError);
    assert.deepStrictEqual(context.resourceReads, ["/prepare", "/commit", "/cancel"]);
  });
  test("times out a stalled prepare request", () => runWithFakedTimers({}, async () => {
    const context = createContext({ isAmbient: false, authority: "remote-one", stalledResources: ["/prepare"] });
    const remoteResource = toAgentHostUri(context.resource, "remote-one");
    context.service.createCorrelation(remoteResource);
    context.fireMarker(marker(1, "a", "ab"));
    const result = context.service.prepareFlush(remoteResource, "hashChange", "stats-1", false);
    await timeout(15001);
    await assert.rejects(result, (error) => error instanceof AgentHostEditAttributionDeferredError);
    assert.deepStrictEqual(context.resourceReads, ["/prepare", "/cancel"]);
  }));
  test("uses a committed cancellation result after prepare fails", async () => {
    const context = createContext({
      isAmbient: false,
      authority: "remote-one",
      failPrepare: true,
      cancelOutcome: "committed"
    });
    const remoteResource = toAgentHostUri(context.resource, "remote-one");
    context.service.createCorrelation(remoteResource);
    context.fireMarker(marker(1, "a", "ab"));
    const prepared = await context.service.prepareFlush(remoteResource, "hashChange", "stats-1", false);
    await prepared.commit(5);
    assert.deepStrictEqual({
      agentModifiedCount: prepared?.agentModifiedCount,
      resourceReads: context.resourceReads
    }, {
      agentModifiedCount: 2,
      resourceReads: ["/prepare", "/cancel"]
    });
  });
  test("cancels a malformed prepared response", async () => {
    const context = createContext({
      isAmbient: false,
      authority: "remote-one",
      prepareResponse: "{"
    });
    const remoteResource = toAgentHostUri(context.resource, "remote-one");
    context.service.createCorrelation(remoteResource);
    context.fireMarker(marker(1, "a", "ab"));
    const result = context.service.prepareFlush(remoteResource, "hashChange", "stats-1", false);
    await assert.rejects(result, (error) => error instanceof AgentHostEditAttributionDeferredError);
    assert.deepStrictEqual(context.resourceReads, ["/prepare", "/cancel"]);
  });
  test("cancels a prepared response with an unexpected token", async () => {
    const context = createContext({
      isAmbient: false,
      authority: "remote-one",
      prepareResponse: JSON.stringify({ flushToken: "unexpected", agentModifiedCount: 2 })
    });
    const remoteResource = toAgentHostUri(context.resource, "remote-one");
    context.service.createCorrelation(remoteResource);
    context.fireMarker(marker(1, "a", "ab"));
    const result = context.service.prepareFlush(remoteResource, "hashChange", "stats-1", false);
    await assert.rejects(result, (error) => error instanceof AgentHostEditAttributionDeferredError);
    assert.deepStrictEqual(context.resourceReads, ["/prepare", "/cancel"]);
  });
  test("times out a stalled commit request and cancels the flush", () => runWithFakedTimers({}, async () => {
    const context = createContext({ isAmbient: false, authority: "remote-one", stalledResources: ["/commit"] });
    const remoteResource = toAgentHostUri(context.resource, "remote-one");
    context.service.createCorrelation(remoteResource);
    context.fireMarker(marker(1, "a", "ab"));
    const prepared = await context.service.prepareFlush(remoteResource, "hashChange", "stats-1", false);
    const result = prepared.commit(5);
    await timeout(15001);
    await assert.rejects(result, (error) => error instanceof AgentHostEditAttributionDeferredError);
    assert.deepStrictEqual(context.resourceReads, ["/prepare", "/commit", "/cancel"]);
  }));
  test("accepts a commit that completed before cancellation", async () => {
    const context = createContext({ isAmbient: false, authority: "remote-one", failCommit: true, cancelOutcome: "committed" });
    const remoteResource = toAgentHostUri(context.resource, "remote-one");
    context.service.createCorrelation(remoteResource);
    context.fireMarker(marker(1, "a", "ab"));
    const prepared = await context.service.prepareFlush(remoteResource, "hashChange", "stats-1", false);
    await prepared.commit(5);
    assert.deepStrictEqual(context.resourceReads, ["/prepare", "/commit", "/cancel"]);
  });
  test("does not fall back when commit and cancellation outcomes are unknown", () => runWithFakedTimers({}, async () => {
    const context = createContext({
      isAmbient: false,
      authority: "remote-one",
      stalledResources: ["/commit", "/cancel"]
    });
    const remoteResource = toAgentHostUri(context.resource, "remote-one");
    context.service.createCorrelation(remoteResource);
    context.fireMarker(marker(1, "a", "ab"));
    const prepared = await context.service.prepareFlush(remoteResource, "hashChange", "stats-1", false);
    const result = prepared.commit(5);
    await timeout(15001);
    await timeout(15001);
    await assert.rejects(result, /outcome is unknown/);
  }));
  function createContext(options = {}) {
    const {
      isAmbient = true,
      authority = "local",
      failPrepare = false,
      failCommit = false,
      stalledResources = [],
      cancelOutcome = "cancelled",
      prepareResponse,
      prepareSequence
    } = options;
    const actionEmitter = disposables.add(new Emitter());
    const resourceReads = [];
    const instantiationService = disposables.add(new TestInstantiationService());
    const connection = instantiationService.stub(IAgentHostService, {
      onDidAction: actionEmitter.event,
      async resourceRead(resource2) {
        resourceReads.push(resource2.path);
        if (stalledResources.includes(resource2.path)) {
          return new Promise(() => {
          });
        }
        if (failPrepare && resource2.path === "/prepare") {
          throw new Error("Prepare failed");
        }
        if (failCommit && resource2.path === "/commit") {
          throw new Error("Commit failed");
        }
        const request = parseEditAttributionResource(resource2);
        return {
          data: resource2.path === "/prepare" ? prepareResponse ?? JSON.stringify({
            flushToken: request?.kind === "prepare" ? request.params.flushToken : "",
            agentModifiedCount: 2,
            lastSequence: prepareSequence
          }) : JSON.stringify({
            outcome: resource2.path === "/commit" ? "committed" : cancelOutcome,
            agentModifiedCount: resource2.path === "/commit" || cancelOutcome === "committed" ? 2 : 0
          }),
          encoding: ContentEncoding.Utf8
        };
      }
    });
    instantiationService.stub(IAgentHostConnectionsService, {
      onDidChangeConnections: Event.None,
      connections: [{
        authority,
        address: isAmbient ? void 0 : "remote",
        name: isAmbient ? "Local" : "Remote",
        isAmbient,
        connection
      }]
    });
    instantiationService.stub(IUriIdentityService, { extUri, asCanonicalUri: (resource2) => resource2 });
    const service = disposables.add(instantiationService.createInstance(AgentHostEditMarkerService));
    const resource = URI.file("C:\\repo\\file.ts");
    const suppressedIds = [];
    const invalidatedIds = [];
    const correlation = service.createCorrelation(resource);
    disposables.add(correlation.onDidSuppress((id) => suppressedIds.push(id)));
    disposables.add(correlation.onDidInvalidate((id) => invalidatedIds.push(id)));
    return {
      resource,
      service,
      suppressedIds,
      invalidatedIds,
      resourceReads,
      fireMarker(attribution) {
        const content = {
          type: ToolResultContentType.FileEdit,
          before: {
            uri: resource.toString(),
            content: { uri: "session-db:/before" }
          },
          after: {
            uri: resource.toString(),
            content: { uri: "session-db:/after" }
          },
          [FILE_EDIT_ATTRIBUTION_PROPERTY]: attribution
        };
        actionEmitter.fire({
          channel: "ahp-chat:copilot%3A%2Fsession",
          serverSeq: attribution.sequence,
          origin: void 0,
          action: {
            type: ActionType.ChatToolCallComplete,
            turnId: "turn-1",
            toolCallId: `tool-${attribution.sequence}`,
            result: {
              success: true,
              pastTenseMessage: "",
              content: [content]
            }
          }
        });
      }
    };
  }
});
function marker(sequence, before, after) {
  return {
    version: 1,
    editId: `edit-${sequence}`,
    sequence,
    beforeDigest: createFileEditContentDigest(before),
    afterDigest: createFileEditContentDigest(after)
  };
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2VkaXRUZWxlbWV0cnkvdGVzdC9icm93c2VyL2FnZW50SG9zdEVkaXRNYXJrZXJTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBleHRVcmkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgcnVuV2l0aEZha2VkVGltZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi90aW1lVHJhdmVsU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdENvbm5lY3Rpb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0Q29ubmVjdGlvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHRvQWdlbnRIb3N0VXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RVcmkuanMnO1xuaW1wb3J0IHsgQXR0cmlidXRlZFRvb2xSZXN1bHRGaWxlRWRpdENvbnRlbnQsIGNyZWF0ZUZpbGVFZGl0Q29udGVudERpZ2VzdCwgRWRpdEF0dHJpYnV0aW9uRmx1c2hPdXRjb21lLCBGSUxFX0VESVRfQVRUUklCVVRJT05fUFJPUEVSVFksIElGaWxlRWRpdEF0dHJpYnV0aW9uTWFya2VyLCBwYXJzZUVkaXRBdHRyaWJ1dGlvblJlc291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9maWxlRWRpdEF0dHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbnRlbnRFbmNvZGluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uRW52ZWxvcGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IFRvb2xSZXN1bHRDb250ZW50VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0RWRpdEF0dHJpYnV0aW9uRGVmZXJyZWRFcnJvciwgQWdlbnRIb3N0RWRpdE1hcmtlclNlcnZpY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL3RlbGVtZXRyeS9hZ2VudEhvc3RFZGl0TWFya2VyU2VydmljZS5qcyc7XG5cbnN1aXRlKCdBZ2VudCBIb3N0IEVkaXQgTWFya2VyIFNlcnZpY2UnLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnc3VwcHJlc3NlcyBtYXJrZXItZmlyc3QgYW5kIHJlbG9hZC1maXJzdCBvYnNlcnZhdGlvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZUNvbnRleHQoKTtcblx0XHRjb25zdCBjb3JyZWxhdGlvbiA9IGNvbnRleHQuc2VydmljZS5jcmVhdGVDb3JyZWxhdGlvbihjb250ZXh0LnJlc291cmNlKTtcblxuXHRcdGNvbnRleHQuZmlyZU1hcmtlcihtYXJrZXIoMSwgJ2EnLCAnYWInKSk7XG5cdFx0Y29uc3QgbWFya2VyRmlyc3QgPSBjb3JyZWxhdGlvbi5yZWdpc3RlcignYScsICdhYicpO1xuXHRcdGNvbnN0IHJlbG9hZEZpcnN0ID0gY29ycmVsYXRpb24ucmVnaXN0ZXIoJ2FiJywgJ2FiYycpO1xuXHRcdGNvbnRleHQuZmlyZU1hcmtlcihtYXJrZXIoMiwgJ2FiJywgJ2FiYycpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bWFya2VyRmlyc3Q6IGNvcnJlbGF0aW9uLmlzU3VwcHJlc3NlZChtYXJrZXJGaXJzdCksXG5cdFx0XHRyZWxvYWRGaXJzdDogY29ycmVsYXRpb24uaXNTdXBwcmVzc2VkKHJlbG9hZEZpcnN0KSxcblx0XHRcdHN1cHByZXNzZWRJZHM6IGNvbnRleHQuc3VwcHJlc3NlZElkcyxcblx0XHR9LCB7XG5cdFx0XHRtYXJrZXJGaXJzdDogdHJ1ZSxcblx0XHRcdHJlbG9hZEZpcnN0OiB0cnVlLFxuXHRcdFx0c3VwcHJlc3NlZElkczogW21hcmtlckZpcnN0LCByZWxvYWRGaXJzdF0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlY29yZHMgb3ZlcnNpemVkIEFnZW50IGVkaXRzIGFzIGNvdmVyYWdlIGdhcHMgd2l0aG91dCBzdXBwcmVzc2luZyByZWxvYWRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVDb250ZXh0KCk7XG5cdFx0Y29uc3QgY29ycmVsYXRpb24gPSBjb250ZXh0LnNlcnZpY2UuY3JlYXRlQ29ycmVsYXRpb24oY29udGV4dC5yZXNvdXJjZSk7XG5cdFx0Y29udGV4dC5maXJlTWFya2VyKHtcblx0XHRcdHZlcnNpb246IDEsXG5cdFx0XHRlZGl0SWQ6ICdlZGl0LXNraXBwZWQnLFxuXHRcdFx0c2VxdWVuY2U6IDEsXG5cdFx0XHRzdGF0dXM6ICdza2lwcGVkJyxcblx0XHRcdHJlYXNvbjogJ2ZpbGVUb29MYXJnZScsXG5cdFx0XHRpbnNlcnRlZENvdW50OiA0Mixcblx0XHR9KTtcblxuXHRcdGNvbnN0IG9ic2VydmF0aW9uID0gY29ycmVsYXRpb24ucmVnaXN0ZXIoJ2EnLCAnYWInKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c3VwcHJlc3NlZDogY29ycmVsYXRpb24uaXNTdXBwcmVzc2VkKG9ic2VydmF0aW9uKSxcblx0XHRcdGNvdmVyYWdlR2FwOiBjb250ZXh0LnNlcnZpY2UudGFrZUNvdmVyYWdlR2FwKGNvbnRleHQucmVzb3VyY2UpLFxuXHRcdH0sIHtcblx0XHRcdHN1cHByZXNzZWQ6IGZhbHNlLFxuXHRcdFx0Y292ZXJhZ2VHYXA6IHtcblx0XHRcdFx0ZWRpdENvdW50OiAxLFxuXHRcdFx0XHRpbnNlcnRlZENvdW50OiA0Mixcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHJlcG9ydCBleHBpcmVkIGNvdmVyYWdlIGdhcHMnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlQ29udGV4dCgpO1xuXHRcdGNvbnRleHQuZmlyZU1hcmtlcih7XG5cdFx0XHR2ZXJzaW9uOiAxLFxuXHRcdFx0ZWRpdElkOiAnZWRpdC1za2lwcGVkJyxcblx0XHRcdHNlcXVlbmNlOiAxLFxuXHRcdFx0c3RhdHVzOiAnc2tpcHBlZCcsXG5cdFx0XHRyZWFzb246ICdmaWxlVG9vTGFyZ2UnLFxuXHRcdFx0aW5zZXJ0ZWRDb3VudDogNDIsXG5cdFx0fSk7XG5cdFx0YXdhaXQgdGltZW91dCgxMCAqIDYwICogNjAgKiAxMDAwICsgMSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGV4dC5zZXJ2aWNlLnRha2VDb3ZlcmFnZUdhcChjb250ZXh0LnJlc291cmNlKSwgdW5kZWZpbmVkKTtcblx0fSkpO1xuXG5cdHRlc3QoJ21hdGNoZXMgYSBjb25uZWN0ZWQgQWdlbnQgbWFya2VyIGNoYWluIHRvIG9uZSByZWxvYWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZUNvbnRleHQoKTtcblx0XHRjb25zdCBjb3JyZWxhdGlvbiA9IGNvbnRleHQuc2VydmljZS5jcmVhdGVDb3JyZWxhdGlvbihjb250ZXh0LnJlc291cmNlKTtcblx0XHRjb250ZXh0LmZpcmVNYXJrZXIobWFya2VyKDEsICdhJywgJ2FiJykpO1xuXHRcdGNvbnRleHQuZmlyZU1hcmtlcihtYXJrZXIoMiwgJ2FiJywgJ2FiYycpKTtcblxuXHRcdGNvbnN0IG9ic2VydmF0aW9uID0gY29ycmVsYXRpb24ucmVnaXN0ZXIoJ2EnLCAnYWJjJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN1cHByZXNzZWQ6IGNvcnJlbGF0aW9uLmlzU3VwcHJlc3NlZChvYnNlcnZhdGlvbiksXG5cdFx0XHRzdXBwcmVzc2VkSWRzOiBjb250ZXh0LnN1cHByZXNzZWRJZHMsXG5cdFx0fSwge1xuXHRcdFx0c3VwcHJlc3NlZDogdHJ1ZSxcblx0XHRcdHN1cHByZXNzZWRJZHM6IFtvYnNlcnZhdGlvbl0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHJldXNlIGEgY29tcGxldGVkIEFnZW50IGNvbnRlbnQgY3ljbGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZUNvbnRleHQoKTtcblx0XHRjb25zdCBjb3JyZWxhdGlvbiA9IGNvbnRleHQuc2VydmljZS5jcmVhdGVDb3JyZWxhdGlvbihjb250ZXh0LnJlc291cmNlKTtcblx0XHRjb250ZXh0LmZpcmVNYXJrZXIobWFya2VyKDEsICdhJywgJ2FiJykpO1xuXHRcdGNvbnRleHQuZmlyZU1hcmtlcihtYXJrZXIoMiwgJ2FiJywgJ2EnKSk7XG5cblx0XHRjb25zdCB1bnJlbGF0ZWRPYnNlcnZhdGlvbiA9IGNvcnJlbGF0aW9uLnJlZ2lzdGVyKCdhJywgJ2FiJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN1cHByZXNzZWQ6IGNvcnJlbGF0aW9uLmlzU3VwcHJlc3NlZCh1bnJlbGF0ZWRPYnNlcnZhdGlvbiksXG5cdFx0XHRzdXBwcmVzc2VkSWRzOiBjb250ZXh0LnN1cHByZXNzZWRJZHMsXG5cdFx0fSwge1xuXHRcdFx0c3VwcHJlc3NlZDogZmFsc2UsXG5cdFx0XHRzdXBwcmVzc2VkSWRzOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaW52YWxpZGF0ZXMgb2xkIHN1cHByZXNzaW9ucyB3aGVuIHRoZSBBZ2VudCBIb3N0IHNlcXVlbmNlIHJlc3RhcnRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVDb250ZXh0KCk7XG5cdFx0Y29uc3QgY29ycmVsYXRpb24gPSBjb250ZXh0LnNlcnZpY2UuY3JlYXRlQ29ycmVsYXRpb24oY29udGV4dC5yZXNvdXJjZSk7XG5cdFx0Y29udGV4dC5maXJlTWFya2VyKG1hcmtlcig1LCAnYScsICdhYicpKTtcblx0XHRjb25zdCBvbGRPYnNlcnZhdGlvbiA9IGNvcnJlbGF0aW9uLnJlZ2lzdGVyKCdhJywgJ2FiJyk7XG5cblx0XHRjb250ZXh0LmZpcmVNYXJrZXIobWFya2VyKDEsICdhYicsICdhYmMnKSk7XG5cdFx0Y29uc3QgbmV3T2JzZXJ2YXRpb24gPSBjb3JyZWxhdGlvbi5yZWdpc3RlcignYWInLCAnYWJjJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG9sZFN1cHByZXNzZWQ6IGNvcnJlbGF0aW9uLmlzU3VwcHJlc3NlZChvbGRPYnNlcnZhdGlvbiksXG5cdFx0XHRuZXdTdXBwcmVzc2VkOiBjb3JyZWxhdGlvbi5pc1N1cHByZXNzZWQobmV3T2JzZXJ2YXRpb24pLFxuXHRcdFx0aW52YWxpZGF0ZWRJZHM6IGNvbnRleHQuaW52YWxpZGF0ZWRJZHMsXG5cdFx0fSwge1xuXHRcdFx0b2xkU3VwcHJlc3NlZDogZmFsc2UsXG5cdFx0XHRuZXdTdXBwcmVzc2VkOiB0cnVlLFxuXHRcdFx0aW52YWxpZGF0ZWRJZHM6IFtvbGRPYnNlcnZhdGlvbl0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHN1cHByZXNzIHdpdGggYW4gZXhwaXJlZCBtYXJrZXInLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlQ29udGV4dCgpO1xuXHRcdGNvbnN0IGNvcnJlbGF0aW9uID0gY29udGV4dC5zZXJ2aWNlLmNyZWF0ZUNvcnJlbGF0aW9uKGNvbnRleHQucmVzb3VyY2UpO1xuXHRcdGNvbnRleHQuZmlyZU1hcmtlcihtYXJrZXIoMSwgJ2EnLCAnYWInKSk7XG5cdFx0YXdhaXQgdGltZW91dCg1ICogNjAgKiAxMDAwICsgMSk7XG5cblx0XHRjb25zdCBvYnNlcnZhdGlvbiA9IGNvcnJlbGF0aW9uLnJlZ2lzdGVyKCdhJywgJ2FiJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29ycmVsYXRpb24uaXNTdXBwcmVzc2VkKG9ic2VydmF0aW9uKSwgZmFsc2UpO1xuXHR9KSk7XG5cblx0dGVzdCgnZG9lcyBub3QgY29vcmRpbmF0ZSB3aXRoIGFuIGV4cGlyZWQgcm91dGUnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlQ29udGV4dCgpO1xuXHRcdGNvbnN0IGNvcnJlbGF0aW9uID0gY29udGV4dC5zZXJ2aWNlLmNyZWF0ZUNvcnJlbGF0aW9uKGNvbnRleHQucmVzb3VyY2UpO1xuXHRcdGNvbnRleHQuZmlyZU1hcmtlcihtYXJrZXIoMSwgJ2EnLCAnYWInKSk7XG5cdFx0Y29uc3Qgb2JzZXJ2YXRpb24gPSBjb3JyZWxhdGlvbi5yZWdpc3RlcignYScsICdhYicpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTAgKiA2MCAqIDYwICogMTAwMCArIDEpO1xuXG5cdFx0Y29uc3QgcHJlcGFyZWQgPSBhd2FpdCBjb250ZXh0LnNlcnZpY2UucHJlcGFyZUZsdXNoKGNvbnRleHQucmVzb3VyY2UsICdoYXNoQ2hhbmdlJywgJ3N0YXRzLTEnLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHByZXBhcmVkLFxuXHRcdFx0c3VwcHJlc3NlZDogY29ycmVsYXRpb24uaXNTdXBwcmVzc2VkKG9ic2VydmF0aW9uKSxcblx0XHRcdGludmFsaWRhdGVkSWRzOiBjb250ZXh0LmludmFsaWRhdGVkSWRzLFxuXHRcdFx0cmVzb3VyY2VSZWFkczogY29udGV4dC5yZXNvdXJjZVJlYWRzLFxuXHRcdH0sIHtcblx0XHRcdHByZXBhcmVkOiB1bmRlZmluZWQsXG5cdFx0XHRzdXBwcmVzc2VkOiBmYWxzZSxcblx0XHRcdGludmFsaWRhdGVkSWRzOiBbb2JzZXJ2YXRpb25dLFxuXHRcdFx0cmVzb3VyY2VSZWFkczogW10sXG5cdFx0fSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdtYXRjaGVzIGFtYmllbnQgcmVtb3RlIG1vZGVsIFVSSXMgdG8gQWdlbnQgSG9zdCBmaWxlIG1hcmtlcnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZUNvbnRleHQoKTtcblx0XHRjb25zdCByZW1vdGVSZXNvdXJjZSA9IFVSSS5mcm9tKHtcblx0XHRcdHNjaGVtZTogU2NoZW1hcy52c2NvZGVSZW1vdGUsXG5cdFx0XHRhdXRob3JpdHk6ICdzc2gtcmVtb3RlK2V4YW1wbGUnLFxuXHRcdFx0cGF0aDogY29udGV4dC5yZXNvdXJjZS5wYXRoLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGNvcnJlbGF0aW9uID0gY29udGV4dC5zZXJ2aWNlLmNyZWF0ZUNvcnJlbGF0aW9uKHJlbW90ZVJlc291cmNlKTtcblx0XHRjb250ZXh0LmZpcmVNYXJrZXIobWFya2VyKDEsICdhJywgJ2FiJykpO1xuXG5cdFx0Y29uc3Qgb2JzZXJ2YXRpb24gPSBjb3JyZWxhdGlvbi5yZWdpc3RlcignYScsICdhYicpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvcnJlbGF0aW9uLmlzU3VwcHJlc3NlZChvYnNlcnZhdGlvbiksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb29yZGluYXRlcyBmbHVzaGVzIHRocm91Z2ggYSBub24tYW1iaWVudCByZW1vdGUgY29ubmVjdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlQ29udGV4dCh7IGlzQW1iaWVudDogZmFsc2UsIGF1dGhvcml0eTogJ3JlbW90ZS1vbmUnIH0pO1xuXHRcdGNvbnN0IHJlbW90ZVJlc291cmNlID0gdG9BZ2VudEhvc3RVcmkoY29udGV4dC5yZXNvdXJjZSwgJ3JlbW90ZS1vbmUnKTtcblx0XHRjb250ZXh0LnNlcnZpY2UuY3JlYXRlQ29ycmVsYXRpb24ocmVtb3RlUmVzb3VyY2UpO1xuXHRcdGNvbnRleHQuZmlyZU1hcmtlcihtYXJrZXIoMSwgJ2EnLCAnYWInKSk7XG5cblx0XHRjb25zdCBwcmVwYXJlZCA9IGF3YWl0IGNvbnRleHQuc2VydmljZS5wcmVwYXJlRmx1c2gocmVtb3RlUmVzb3VyY2UsICdoYXNoQ2hhbmdlJywgJ3N0YXRzLTEnLCBmYWxzZSk7XG5cdFx0YXdhaXQgcHJlcGFyZWQ/LmNvbW1pdCg1KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cHJlcGFyZWQ6IHByZXBhcmVkICYmIHtcblx0XHRcdFx0Zmx1c2hUb2tlbkxlbmd0aDogcHJlcGFyZWQuZmx1c2hUb2tlbi5sZW5ndGgsXG5cdFx0XHRcdGFnZW50TW9kaWZpZWRDb3VudDogcHJlcGFyZWQuYWdlbnRNb2RpZmllZENvdW50LFxuXHRcdFx0fSxcblx0XHRcdHJlc291cmNlUmVhZHM6IGNvbnRleHQucmVzb3VyY2VSZWFkcyxcblx0XHR9LCB7XG5cdFx0XHRwcmVwYXJlZDoge1xuXHRcdFx0XHRmbHVzaFRva2VuTGVuZ3RoOiAzNixcblx0XHRcdFx0YWdlbnRNb2RpZmllZENvdW50OiAyLFxuXHRcdFx0fSxcblx0XHRcdHJlc291cmNlUmVhZHM6IFsnL3ByZXBhcmUnLCAnL2NvbW1pdCddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3YWl0cyBmb3IgdGhlIHByZXBhcmVkIEFnZW50IG1hcmtlciBiZWZvcmUgY29vcmRpbmF0aW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVDb250ZXh0KHsgaXNBbWJpZW50OiBmYWxzZSwgYXV0aG9yaXR5OiAncmVtb3RlLW9uZScsIHByZXBhcmVTZXF1ZW5jZTogMiB9KTtcblx0XHRjb25zdCByZW1vdGVSZXNvdXJjZSA9IHRvQWdlbnRIb3N0VXJpKGNvbnRleHQucmVzb3VyY2UsICdyZW1vdGUtb25lJyk7XG5cdFx0Y29udGV4dC5zZXJ2aWNlLmNyZWF0ZUNvcnJlbGF0aW9uKHJlbW90ZVJlc291cmNlKTtcblx0XHRjb250ZXh0LmZpcmVNYXJrZXIobWFya2VyKDEsICdhJywgJ2FiJykpO1xuXG5cdFx0Y29uc3QgcHJlcGFyZSA9IGNvbnRleHQuc2VydmljZS5wcmVwYXJlRmx1c2gocmVtb3RlUmVzb3VyY2UsICdoYXNoQ2hhbmdlJywgJ3N0YXRzLTEnLCBmYWxzZSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRjb250ZXh0LmZpcmVNYXJrZXIobWFya2VyKDIsICdhYicsICdhYmMnKSk7XG5cdFx0Y29uc3QgcHJlcGFyZWQgPSBhd2FpdCBwcmVwYXJlO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhZ2VudE1vZGlmaWVkQ291bnQ6IHByZXBhcmVkPy5hZ2VudE1vZGlmaWVkQ291bnQsXG5cdFx0XHRyZXNvdXJjZVJlYWRzOiBjb250ZXh0LnJlc291cmNlUmVhZHMsXG5cdFx0fSwge1xuXHRcdFx0YWdlbnRNb2RpZmllZENvdW50OiAyLFxuXHRcdFx0cmVzb3VyY2VSZWFkczogWycvcHJlcGFyZSddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW5jZWxzIGEgcHJlcGFyZWQgZmx1c2ggd2hlbiB0aGUgY29tbWl0IHRyYW5zcG9ydCBmYWlscycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlQ29udGV4dCh7IGlzQW1iaWVudDogZmFsc2UsIGF1dGhvcml0eTogJ3JlbW90ZS1vbmUnLCBmYWlsQ29tbWl0OiB0cnVlIH0pO1xuXHRcdGNvbnN0IHJlbW90ZVJlc291cmNlID0gdG9BZ2VudEhvc3RVcmkoY29udGV4dC5yZXNvdXJjZSwgJ3JlbW90ZS1vbmUnKTtcblx0XHRjb250ZXh0LnNlcnZpY2UuY3JlYXRlQ29ycmVsYXRpb24ocmVtb3RlUmVzb3VyY2UpO1xuXHRcdGNvbnRleHQuZmlyZU1hcmtlcihtYXJrZXIoMSwgJ2EnLCAnYWInKSk7XG5cblx0XHRjb25zdCBwcmVwYXJlZCA9IGF3YWl0IGNvbnRleHQuc2VydmljZS5wcmVwYXJlRmx1c2gocmVtb3RlUmVzb3VyY2UsICdoYXNoQ2hhbmdlJywgJ3N0YXRzLTEnLCBmYWxzZSk7XG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoKCkgPT4gcHJlcGFyZWQhLmNvbW1pdCg1KSwgZXJyb3IgPT4gZXJyb3IgaW5zdGFuY2VvZiBBZ2VudEhvc3RFZGl0QXR0cmlidXRpb25EZWZlcnJlZEVycm9yKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29udGV4dC5yZXNvdXJjZVJlYWRzLCBbJy9wcmVwYXJlJywgJy9jb21taXQnLCAnL2NhbmNlbCddKTtcblx0fSk7XG5cblx0dGVzdCgndGltZXMgb3V0IGEgc3RhbGxlZCBwcmVwYXJlIHJlcXVlc3QnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlQ29udGV4dCh7IGlzQW1iaWVudDogZmFsc2UsIGF1dGhvcml0eTogJ3JlbW90ZS1vbmUnLCBzdGFsbGVkUmVzb3VyY2VzOiBbJy9wcmVwYXJlJ10gfSk7XG5cdFx0Y29uc3QgcmVtb3RlUmVzb3VyY2UgPSB0b0FnZW50SG9zdFVyaShjb250ZXh0LnJlc291cmNlLCAncmVtb3RlLW9uZScpO1xuXHRcdGNvbnRleHQuc2VydmljZS5jcmVhdGVDb3JyZWxhdGlvbihyZW1vdGVSZXNvdXJjZSk7XG5cdFx0Y29udGV4dC5maXJlTWFya2VyKG1hcmtlcigxLCAnYScsICdhYicpKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGNvbnRleHQuc2VydmljZS5wcmVwYXJlRmx1c2gocmVtb3RlUmVzb3VyY2UsICdoYXNoQ2hhbmdlJywgJ3N0YXRzLTEnLCBmYWxzZSk7XG5cdFx0YXdhaXQgdGltZW91dCgxNV8wMDEpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMocmVzdWx0LCBlcnJvciA9PiBlcnJvciBpbnN0YW5jZW9mIEFnZW50SG9zdEVkaXRBdHRyaWJ1dGlvbkRlZmVycmVkRXJyb3IpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29udGV4dC5yZXNvdXJjZVJlYWRzLCBbJy9wcmVwYXJlJywgJy9jYW5jZWwnXSk7XG5cdH0pKTtcblxuXHR0ZXN0KCd1c2VzIGEgY29tbWl0dGVkIGNhbmNlbGxhdGlvbiByZXN1bHQgYWZ0ZXIgcHJlcGFyZSBmYWlscycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlQ29udGV4dCh7XG5cdFx0XHRpc0FtYmllbnQ6IGZhbHNlLFxuXHRcdFx0YXV0aG9yaXR5OiAncmVtb3RlLW9uZScsXG5cdFx0XHRmYWlsUHJlcGFyZTogdHJ1ZSxcblx0XHRcdGNhbmNlbE91dGNvbWU6ICdjb21taXR0ZWQnLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHJlbW90ZVJlc291cmNlID0gdG9BZ2VudEhvc3RVcmkoY29udGV4dC5yZXNvdXJjZSwgJ3JlbW90ZS1vbmUnKTtcblx0XHRjb250ZXh0LnNlcnZpY2UuY3JlYXRlQ29ycmVsYXRpb24ocmVtb3RlUmVzb3VyY2UpO1xuXHRcdGNvbnRleHQuZmlyZU1hcmtlcihtYXJrZXIoMSwgJ2EnLCAnYWInKSk7XG5cblx0XHRjb25zdCBwcmVwYXJlZCA9IGF3YWl0IGNvbnRleHQuc2VydmljZS5wcmVwYXJlRmx1c2gocmVtb3RlUmVzb3VyY2UsICdoYXNoQ2hhbmdlJywgJ3N0YXRzLTEnLCBmYWxzZSk7XG5cdFx0YXdhaXQgcHJlcGFyZWQhLmNvbW1pdCg1KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YWdlbnRNb2RpZmllZENvdW50OiBwcmVwYXJlZD8uYWdlbnRNb2RpZmllZENvdW50LFxuXHRcdFx0cmVzb3VyY2VSZWFkczogY29udGV4dC5yZXNvdXJjZVJlYWRzLFxuXHRcdH0sIHtcblx0XHRcdGFnZW50TW9kaWZpZWRDb3VudDogMixcblx0XHRcdHJlc291cmNlUmVhZHM6IFsnL3ByZXBhcmUnLCAnL2NhbmNlbCddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW5jZWxzIGEgbWFsZm9ybWVkIHByZXBhcmVkIHJlc3BvbnNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVDb250ZXh0KHtcblx0XHRcdGlzQW1iaWVudDogZmFsc2UsXG5cdFx0XHRhdXRob3JpdHk6ICdyZW1vdGUtb25lJyxcblx0XHRcdHByZXBhcmVSZXNwb25zZTogJ3snLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHJlbW90ZVJlc291cmNlID0gdG9BZ2VudEhvc3RVcmkoY29udGV4dC5yZXNvdXJjZSwgJ3JlbW90ZS1vbmUnKTtcblx0XHRjb250ZXh0LnNlcnZpY2UuY3JlYXRlQ29ycmVsYXRpb24ocmVtb3RlUmVzb3VyY2UpO1xuXHRcdGNvbnRleHQuZmlyZU1hcmtlcihtYXJrZXIoMSwgJ2EnLCAnYWInKSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBjb250ZXh0LnNlcnZpY2UucHJlcGFyZUZsdXNoKHJlbW90ZVJlc291cmNlLCAnaGFzaENoYW5nZScsICdzdGF0cy0xJywgZmFsc2UpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMocmVzdWx0LCBlcnJvciA9PiBlcnJvciBpbnN0YW5jZW9mIEFnZW50SG9zdEVkaXRBdHRyaWJ1dGlvbkRlZmVycmVkRXJyb3IpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29udGV4dC5yZXNvdXJjZVJlYWRzLCBbJy9wcmVwYXJlJywgJy9jYW5jZWwnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbmNlbHMgYSBwcmVwYXJlZCByZXNwb25zZSB3aXRoIGFuIHVuZXhwZWN0ZWQgdG9rZW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZUNvbnRleHQoe1xuXHRcdFx0aXNBbWJpZW50OiBmYWxzZSxcblx0XHRcdGF1dGhvcml0eTogJ3JlbW90ZS1vbmUnLFxuXHRcdFx0cHJlcGFyZVJlc3BvbnNlOiBKU09OLnN0cmluZ2lmeSh7IGZsdXNoVG9rZW46ICd1bmV4cGVjdGVkJywgYWdlbnRNb2RpZmllZENvdW50OiAyIH0pLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHJlbW90ZVJlc291cmNlID0gdG9BZ2VudEhvc3RVcmkoY29udGV4dC5yZXNvdXJjZSwgJ3JlbW90ZS1vbmUnKTtcblx0XHRjb250ZXh0LnNlcnZpY2UuY3JlYXRlQ29ycmVsYXRpb24ocmVtb3RlUmVzb3VyY2UpO1xuXHRcdGNvbnRleHQuZmlyZU1hcmtlcihtYXJrZXIoMSwgJ2EnLCAnYWInKSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBjb250ZXh0LnNlcnZpY2UucHJlcGFyZUZsdXNoKHJlbW90ZVJlc291cmNlLCAnaGFzaENoYW5nZScsICdzdGF0cy0xJywgZmFsc2UpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMocmVzdWx0LCBlcnJvciA9PiBlcnJvciBpbnN0YW5jZW9mIEFnZW50SG9zdEVkaXRBdHRyaWJ1dGlvbkRlZmVycmVkRXJyb3IpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29udGV4dC5yZXNvdXJjZVJlYWRzLCBbJy9wcmVwYXJlJywgJy9jYW5jZWwnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RpbWVzIG91dCBhIHN0YWxsZWQgY29tbWl0IHJlcXVlc3QgYW5kIGNhbmNlbHMgdGhlIGZsdXNoJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZUNvbnRleHQoeyBpc0FtYmllbnQ6IGZhbHNlLCBhdXRob3JpdHk6ICdyZW1vdGUtb25lJywgc3RhbGxlZFJlc291cmNlczogWycvY29tbWl0J10gfSk7XG5cdFx0Y29uc3QgcmVtb3RlUmVzb3VyY2UgPSB0b0FnZW50SG9zdFVyaShjb250ZXh0LnJlc291cmNlLCAncmVtb3RlLW9uZScpO1xuXHRcdGNvbnRleHQuc2VydmljZS5jcmVhdGVDb3JyZWxhdGlvbihyZW1vdGVSZXNvdXJjZSk7XG5cdFx0Y29udGV4dC5maXJlTWFya2VyKG1hcmtlcigxLCAnYScsICdhYicpKTtcblx0XHRjb25zdCBwcmVwYXJlZCA9IGF3YWl0IGNvbnRleHQuc2VydmljZS5wcmVwYXJlRmx1c2gocmVtb3RlUmVzb3VyY2UsICdoYXNoQ2hhbmdlJywgJ3N0YXRzLTEnLCBmYWxzZSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBwcmVwYXJlZCEuY29tbWl0KDUpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTVfMDAxKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKHJlc3VsdCwgZXJyb3IgPT4gZXJyb3IgaW5zdGFuY2VvZiBBZ2VudEhvc3RFZGl0QXR0cmlidXRpb25EZWZlcnJlZEVycm9yKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbnRleHQucmVzb3VyY2VSZWFkcywgWycvcHJlcGFyZScsICcvY29tbWl0JywgJy9jYW5jZWwnXSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdhY2NlcHRzIGEgY29tbWl0IHRoYXQgY29tcGxldGVkIGJlZm9yZSBjYW5jZWxsYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZUNvbnRleHQoeyBpc0FtYmllbnQ6IGZhbHNlLCBhdXRob3JpdHk6ICdyZW1vdGUtb25lJywgZmFpbENvbW1pdDogdHJ1ZSwgY2FuY2VsT3V0Y29tZTogJ2NvbW1pdHRlZCcgfSk7XG5cdFx0Y29uc3QgcmVtb3RlUmVzb3VyY2UgPSB0b0FnZW50SG9zdFVyaShjb250ZXh0LnJlc291cmNlLCAncmVtb3RlLW9uZScpO1xuXHRcdGNvbnRleHQuc2VydmljZS5jcmVhdGVDb3JyZWxhdGlvbihyZW1vdGVSZXNvdXJjZSk7XG5cdFx0Y29udGV4dC5maXJlTWFya2VyKG1hcmtlcigxLCAnYScsICdhYicpKTtcblx0XHRjb25zdCBwcmVwYXJlZCA9IGF3YWl0IGNvbnRleHQuc2VydmljZS5wcmVwYXJlRmx1c2gocmVtb3RlUmVzb3VyY2UsICdoYXNoQ2hhbmdlJywgJ3N0YXRzLTEnLCBmYWxzZSk7XG5cblx0XHRhd2FpdCBwcmVwYXJlZCEuY29tbWl0KDUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250ZXh0LnJlc291cmNlUmVhZHMsIFsnL3ByZXBhcmUnLCAnL2NvbW1pdCcsICcvY2FuY2VsJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBmYWxsIGJhY2sgd2hlbiBjb21taXQgYW5kIGNhbmNlbGxhdGlvbiBvdXRjb21lcyBhcmUgdW5rbm93bicsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVDb250ZXh0KHtcblx0XHRcdGlzQW1iaWVudDogZmFsc2UsXG5cdFx0XHRhdXRob3JpdHk6ICdyZW1vdGUtb25lJyxcblx0XHRcdHN0YWxsZWRSZXNvdXJjZXM6IFsnL2NvbW1pdCcsICcvY2FuY2VsJ10sXG5cdFx0fSk7XG5cdFx0Y29uc3QgcmVtb3RlUmVzb3VyY2UgPSB0b0FnZW50SG9zdFVyaShjb250ZXh0LnJlc291cmNlLCAncmVtb3RlLW9uZScpO1xuXHRcdGNvbnRleHQuc2VydmljZS5jcmVhdGVDb3JyZWxhdGlvbihyZW1vdGVSZXNvdXJjZSk7XG5cdFx0Y29udGV4dC5maXJlTWFya2VyKG1hcmtlcigxLCAnYScsICdhYicpKTtcblx0XHRjb25zdCBwcmVwYXJlZCA9IGF3YWl0IGNvbnRleHQuc2VydmljZS5wcmVwYXJlRmx1c2gocmVtb3RlUmVzb3VyY2UsICdoYXNoQ2hhbmdlJywgJ3N0YXRzLTEnLCBmYWxzZSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBwcmVwYXJlZCEuY29tbWl0KDUpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTVfMDAxKTtcblx0XHRhd2FpdCB0aW1lb3V0KDE1XzAwMSk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhyZXN1bHQsIC9vdXRjb21lIGlzIHVua25vd24vKTtcblx0fSkpO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZUNvbnRleHQob3B0aW9uczoge1xuXHRcdHJlYWRvbmx5IGlzQW1iaWVudD86IGJvb2xlYW47XG5cdFx0cmVhZG9ubHkgYXV0aG9yaXR5Pzogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IGZhaWxQcmVwYXJlPzogYm9vbGVhbjtcblx0XHRyZWFkb25seSBmYWlsQ29tbWl0PzogYm9vbGVhbjtcblx0XHRyZWFkb25seSBzdGFsbGVkUmVzb3VyY2VzPzogcmVhZG9ubHkgc3RyaW5nW107XG5cdFx0cmVhZG9ubHkgY2FuY2VsT3V0Y29tZT86IEVkaXRBdHRyaWJ1dGlvbkZsdXNoT3V0Y29tZTtcblx0XHRyZWFkb25seSBwcmVwYXJlUmVzcG9uc2U/OiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgcHJlcGFyZVNlcXVlbmNlPzogbnVtYmVyO1xuXHR9ID0ge30pIHtcblx0XHRjb25zdCB7XG5cdFx0XHRpc0FtYmllbnQgPSB0cnVlLFxuXHRcdFx0YXV0aG9yaXR5ID0gJ2xvY2FsJyxcblx0XHRcdGZhaWxQcmVwYXJlID0gZmFsc2UsXG5cdFx0XHRmYWlsQ29tbWl0ID0gZmFsc2UsXG5cdFx0XHRzdGFsbGVkUmVzb3VyY2VzID0gW10sXG5cdFx0XHRjYW5jZWxPdXRjb21lID0gJ2NhbmNlbGxlZCcsXG5cdFx0XHRwcmVwYXJlUmVzcG9uc2UsXG5cdFx0XHRwcmVwYXJlU2VxdWVuY2UsXG5cdFx0fSA9IG9wdGlvbnM7XG5cdFx0Y29uc3QgYWN0aW9uRW1pdHRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxBY3Rpb25FbnZlbG9wZT4oKSk7XG5cdFx0Y29uc3QgcmVzb3VyY2VSZWFkczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBZ2VudEhvc3RTZXJ2aWNlLCB7XG5cdFx0XHRvbkRpZEFjdGlvbjogYWN0aW9uRW1pdHRlci5ldmVudCxcblx0XHRcdGFzeW5jIHJlc291cmNlUmVhZChyZXNvdXJjZTogVVJJKSB7XG5cdFx0XHRcdHJlc291cmNlUmVhZHMucHVzaChyZXNvdXJjZS5wYXRoKTtcblx0XHRcdFx0aWYgKHN0YWxsZWRSZXNvdXJjZXMuaW5jbHVkZXMocmVzb3VyY2UucGF0aCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IFByb21pc2U8bmV2ZXI+KCgpID0+IHsgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGZhaWxQcmVwYXJlICYmIHJlc291cmNlLnBhdGggPT09ICcvcHJlcGFyZScpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1ByZXBhcmUgZmFpbGVkJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGZhaWxDb21taXQgJiYgcmVzb3VyY2UucGF0aCA9PT0gJy9jb21taXQnKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDb21taXQgZmFpbGVkJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgcmVxdWVzdCA9IHBhcnNlRWRpdEF0dHJpYnV0aW9uUmVzb3VyY2UocmVzb3VyY2UpO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGRhdGE6IHJlc291cmNlLnBhdGggPT09ICcvcHJlcGFyZSdcblx0XHRcdFx0XHRcdD8gcHJlcGFyZVJlc3BvbnNlID8/IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0XHRcdFx0Zmx1c2hUb2tlbjogcmVxdWVzdD8ua2luZCA9PT0gJ3ByZXBhcmUnID8gcmVxdWVzdC5wYXJhbXMuZmx1c2hUb2tlbiA6ICcnLFxuXHRcdFx0XHRcdFx0XHRhZ2VudE1vZGlmaWVkQ291bnQ6IDIsXG5cdFx0XHRcdFx0XHRcdGxhc3RTZXF1ZW5jZTogcHJlcGFyZVNlcXVlbmNlLFxuXHRcdFx0XHRcdFx0fSlcblx0XHRcdFx0XHRcdDogSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHRcdFx0XHRvdXRjb21lOiByZXNvdXJjZS5wYXRoID09PSAnL2NvbW1pdCcgPyAnY29tbWl0dGVkJyA6IGNhbmNlbE91dGNvbWUsXG5cdFx0XHRcdFx0XHRcdGFnZW50TW9kaWZpZWRDb3VudDogcmVzb3VyY2UucGF0aCA9PT0gJy9jb21taXQnIHx8IGNhbmNlbE91dGNvbWUgPT09ICdjb21taXR0ZWQnID8gMiA6IDAsXG5cdFx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XHRlbmNvZGluZzogQ29udGVudEVuY29kaW5nLlV0ZjgsXG5cdFx0XHRcdH07XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50SG9zdENvbm5lY3Rpb25zU2VydmljZSwge1xuXHRcdFx0b25EaWRDaGFuZ2VDb25uZWN0aW9uczogRXZlbnQuTm9uZSxcblx0XHRcdGNvbm5lY3Rpb25zOiBbe1xuXHRcdFx0XHRhdXRob3JpdHksXG5cdFx0XHRcdGFkZHJlc3M6IGlzQW1iaWVudCA/IHVuZGVmaW5lZCA6ICdyZW1vdGUnLFxuXHRcdFx0XHRuYW1lOiBpc0FtYmllbnQgPyAnTG9jYWwnIDogJ1JlbW90ZScsXG5cdFx0XHRcdGlzQW1iaWVudCxcblx0XHRcdFx0Y29ubmVjdGlvbixcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVVyaUlkZW50aXR5U2VydmljZSwgeyBleHRVcmksIGFzQ2Fub25pY2FsVXJpOiByZXNvdXJjZSA9PiByZXNvdXJjZSB9KTtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdEVkaXRNYXJrZXJTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnQzpcXFxccmVwb1xcXFxmaWxlLnRzJyk7XG5cdFx0Y29uc3Qgc3VwcHJlc3NlZElkczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBpbnZhbGlkYXRlZElkczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBjb3JyZWxhdGlvbiA9IHNlcnZpY2UuY3JlYXRlQ29ycmVsYXRpb24ocmVzb3VyY2UpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChjb3JyZWxhdGlvbi5vbkRpZFN1cHByZXNzKGlkID0+IHN1cHByZXNzZWRJZHMucHVzaChpZCkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoY29ycmVsYXRpb24ub25EaWRJbnZhbGlkYXRlKGlkID0+IGludmFsaWRhdGVkSWRzLnB1c2goaWQpKSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0c2VydmljZSxcblx0XHRcdHN1cHByZXNzZWRJZHMsXG5cdFx0XHRpbnZhbGlkYXRlZElkcyxcblx0XHRcdHJlc291cmNlUmVhZHMsXG5cdFx0XHRmaXJlTWFya2VyKGF0dHJpYnV0aW9uOiBJRmlsZUVkaXRBdHRyaWJ1dGlvbk1hcmtlcikge1xuXHRcdFx0XHRjb25zdCBjb250ZW50OiBBdHRyaWJ1dGVkVG9vbFJlc3VsdEZpbGVFZGl0Q29udGVudCA9IHtcblx0XHRcdFx0XHR0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuRmlsZUVkaXQsXG5cdFx0XHRcdFx0YmVmb3JlOiB7XG5cdFx0XHRcdFx0XHR1cmk6IHJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0XHRjb250ZW50OiB7IHVyaTogJ3Nlc3Npb24tZGI6L2JlZm9yZScgfSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGFmdGVyOiB7XG5cdFx0XHRcdFx0XHR1cmk6IHJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0XHRjb250ZW50OiB7IHVyaTogJ3Nlc3Npb24tZGI6L2FmdGVyJyB9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0W0ZJTEVfRURJVF9BVFRSSUJVVElPTl9QUk9QRVJUWV06IGF0dHJpYnV0aW9uLFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRhY3Rpb25FbWl0dGVyLmZpcmUoe1xuXHRcdFx0XHRcdGNoYW5uZWw6ICdhaHAtY2hhdDpjb3BpbG90JTNBJTJGc2Vzc2lvbicsXG5cdFx0XHRcdFx0c2VydmVyU2VxOiBhdHRyaWJ1dGlvbi5zZXF1ZW5jZSxcblx0XHRcdFx0XHRvcmlnaW46IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUsXG5cdFx0XHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdFx0dG9vbENhbGxJZDogYHRvb2wtJHthdHRyaWJ1dGlvbi5zZXF1ZW5jZX1gLFxuXHRcdFx0XHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRcdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICcnLFxuXHRcdFx0XHRcdFx0XHRjb250ZW50OiBbY29udGVudF0sXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG59KTtcblxuZnVuY3Rpb24gbWFya2VyKHNlcXVlbmNlOiBudW1iZXIsIGJlZm9yZTogc3RyaW5nLCBhZnRlcjogc3RyaW5nKTogSUZpbGVFZGl0QXR0cmlidXRpb25NYXJrZXIge1xuXHRyZXR1cm4ge1xuXHRcdHZlcnNpb246IDEsXG5cdFx0ZWRpdElkOiBgZWRpdC0ke3NlcXVlbmNlfWAsXG5cdFx0c2VxdWVuY2UsXG5cdFx0YmVmb3JlRGlnZXN0OiBjcmVhdGVGaWxlRWRpdENvbnRlbnREaWdlc3QoYmVmb3JlKSxcblx0XHRhZnRlckRpZ2VzdDogY3JlYXRlRmlsZUVkaXRDb250ZW50RGlnZXN0KGFmdGVyKSxcblx0fTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsY0FBYztBQUN2QixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxzQkFBc0I7QUFDL0IsU0FBOEMsNkJBQTBELGdDQUE0RCxvQ0FBb0M7QUFDeE0sU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyx1QkFBdUI7QUFFaEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx1Q0FBdUMsa0NBQWtDO0FBRWxGLE1BQU0sa0NBQWtDLE1BQU07QUFDN0MsUUFBTSxjQUFjLHdDQUF3QztBQUU1RCxPQUFLLHlEQUF5RCxNQUFNO0FBQ25FLFVBQU0sVUFBVSxjQUFjO0FBQzlCLFVBQU0sY0FBYyxRQUFRLFFBQVEsa0JBQWtCLFFBQVEsUUFBUTtBQUV0RSxZQUFRLFdBQVcsT0FBTyxHQUFHLEtBQUssSUFBSSxDQUFDO0FBQ3ZDLFVBQU0sY0FBYyxZQUFZLFNBQVMsS0FBSyxJQUFJO0FBQ2xELFVBQU0sY0FBYyxZQUFZLFNBQVMsTUFBTSxLQUFLO0FBQ3BELFlBQVEsV0FBVyxPQUFPLEdBQUcsTUFBTSxLQUFLLENBQUM7QUFFekMsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0Qixh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
