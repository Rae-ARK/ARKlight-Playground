import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { AgentHostInternalTelemetrySender } from "../../node/agentHostMicrosoftTelemetry.js";
class TestAppender {
  constructor() {
    this.events = [];
    this.flushCount = 0;
  }
  log(eventName, data) {
    this.events.push({ eventName, data });
  }
  async flush() {
    this.flushCount++;
  }
}
suite("AgentHostInternalTelemetrySender", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("creates and sends only for internal users with identity enrichment", () => {
    const appenders = [];
    const requestService = { _serviceBrand: void 0 };
    const commonProperties = { version: "1.130.0", "common.machineId": "machine-id" };
    const sender = disposables.add(new AgentHostInternalTelemetrySender({
      requestService,
      commonProperties,
      extensionVersion: "0.58.0",
      createAppender: (actualRequestService, actualCommonProperties, eventPrefix) => {
        assert.deepStrictEqual({
          actualRequestService,
          eventPrefix,
          commonProperties: {
            version: actualCommonProperties?.["version"],
            extensionName: actualCommonProperties?.["common.extname"],
            extensionVersion: actualCommonProperties?.["common.extversion"],
            vscodeMachineId: actualCommonProperties?.["common.vscodemachineid"],
            vscodeVersion: actualCommonProperties?.["common.vscodeversion"]
          }
        }, {
          actualRequestService: requestService,
          eventPrefix: "GitHub.copilot-chat",
          commonProperties: {
            version: "1.130.0",
            extensionName: "GitHub.copilot-chat",
            extensionVersion: "0.58.0",
            vscodeMachineId: "machine-id",
            vscodeVersion: "1.130.0"
          }
        });
        const appender = new TestAppender();
        appenders.push(appender);
        return appender;
      }
    }));
    sender.send("ignored");
    sender.setContext({ isInternal: false, trackingId: "external-tid", userName: "external", isVscodeTeamMember: false });
    sender.send("ignoredExternal");
    sender.setContext({ isInternal: true, trackingId: "internal-tid", userName: "octocat", isVscodeTeamMember: true });
    sender.send("engine.messages.length", { value: "property" }, { count: 3 });
    assert.deepStrictEqual(appenders.map((appender) => appender.events), [[{
      eventName: "engine.messages.length",
      data: {
        value: "property",
        "common.tid": "internal-tid",
        "common.userName": "octocat",
        count: 3,
        "common.isVscodeTeamMember": 1
      }
    }]]);
  });
  test("flushes and disables the appender when internal identity is cleared or changed", () => {
    const appenders = [];
    const sender = disposables.add(new AgentHostInternalTelemetrySender({
      createAppender: () => {
        const appender = new TestAppender();
        appenders.push(appender);
        return appender;
      }
    }));
    sender.setContext({ isInternal: true, trackingId: "tid-1", userName: "first", isVscodeTeamMember: false });
    sender.setContext(void 0);
    sender.send("ignoredAfterClear");
    sender.setContext({ isInternal: true, trackingId: "tid-2", userName: "second", isVscodeTeamMember: false });
    assert.deepStrictEqual({
      appenderCount: appenders.length,
      firstFlushCount: appenders[0].flushCount,
      firstEvents: appenders[0].events
    }, {
      appenderCount: 2,
      firstFlushCount: 1,
      firstEvents: []
    });
  });
  test("context-scoped events use the supplied identity without mutable sender state", () => {
    const appenders = [];
    const sender = disposables.add(new AgentHostInternalTelemetrySender({
      createAppender: () => {
        const appender = new TestAppender();
        appenders.push(appender);
        return appender;
      }
    }));
    sender.sendForContext({ isInternal: false, trackingId: "external", userName: "external", isVscodeTeamMember: false }, "ignored");
    sender.sendForContext(
      { isInternal: true, trackingId: "session-tid", userName: "session-user", isVscodeTeamMember: true },
      "model.message.added",
      { "common.tid": "payload-tid", "common.userName": "payload-user" },
      { "common.isVscodeTeamMember": 0 }
    );
    assert.deepStrictEqual(appenders.map((appender) => appender.events), [[{
      eventName: "model.message.added",
      data: {
        "common.tid": "session-tid",
        "common.userName": "session-user",
        "common.isVscodeTeamMember": 1
      }
    }]]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvYWdlbnRIb3N0SW50ZXJuYWxUZWxlbWV0cnkudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHR5cGUgeyBJUmVxdWVzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9yZXF1ZXN0L2NvbW1vbi9yZXF1ZXN0LmpzJztcbmltcG9ydCB0eXBlIHsgSUNvbW1vblByb3BlcnRpZXMgfSBmcm9tICcuLi8uLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RJbnRlcm5hbFRlbGVtZXRyeVNlbmRlciB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0TWljcm9zb2Z0VGVsZW1ldHJ5LmpzJztcblxuY2xhc3MgVGVzdEFwcGVuZGVyIHtcblx0cmVhZG9ubHkgZXZlbnRzOiB7IGV2ZW50TmFtZTogc3RyaW5nOyBkYXRhOiBvYmplY3QgfCB1bmRlZmluZWQgfVtdID0gW107XG5cdGZsdXNoQ291bnQgPSAwO1xuXG5cdGxvZyhldmVudE5hbWU6IHN0cmluZywgZGF0YT86IG9iamVjdCk6IHZvaWQge1xuXHRcdHRoaXMuZXZlbnRzLnB1c2goeyBldmVudE5hbWUsIGRhdGEgfSk7XG5cdH1cblx0YXN5bmMgZmx1c2goKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5mbHVzaENvdW50Kys7XG5cdH1cbn1cblxuc3VpdGUoJ0FnZW50SG9zdEludGVybmFsVGVsZW1ldHJ5U2VuZGVyJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2NyZWF0ZXMgYW5kIHNlbmRzIG9ubHkgZm9yIGludGVybmFsIHVzZXJzIHdpdGggaWRlbnRpdHkgZW5yaWNobWVudCcsICgpID0+IHtcblx0XHRjb25zdCBhcHBlbmRlcnM6IFRlc3RBcHBlbmRlcltdID0gW107XG5cdFx0Y29uc3QgcmVxdWVzdFNlcnZpY2UgPSB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCB9IGFzIElSZXF1ZXN0U2VydmljZTtcblx0XHRjb25zdCBjb21tb25Qcm9wZXJ0aWVzID0geyB2ZXJzaW9uOiAnMS4xMzAuMCcsICdjb21tb24ubWFjaGluZUlkJzogJ21hY2hpbmUtaWQnIH0gYXMgSUNvbW1vblByb3BlcnRpZXM7XG5cdFx0Y29uc3Qgc2VuZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RJbnRlcm5hbFRlbGVtZXRyeVNlbmRlcih7XG5cdFx0XHRyZXF1ZXN0U2VydmljZSwgY29tbW9uUHJvcGVydGllcywgZXh0ZW5zaW9uVmVyc2lvbjogJzAuNTguMCcsIGNyZWF0ZUFwcGVuZGVyOiAoYWN0dWFsUmVxdWVzdFNlcnZpY2UsIGFjdHVhbENvbW1vblByb3BlcnRpZXMsIGV2ZW50UHJlZml4KSA9PiB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRcdGFjdHVhbFJlcXVlc3RTZXJ2aWNlLFxuXHRcdFx0XHRcdGV2ZW50UHJlZml4LFxuXHRcdFx0XHRcdGNvbW1vblByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdHZlcnNpb246IGFjdHVhbENvbW1vblByb3BlcnRpZXM/LlsndmVyc2lvbiddLFxuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uTmFtZTogYWN0dWFsQ29tbW9uUHJvcGVydGllcz8uWydjb21tb24uZXh0bmFtZSddLFxuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uVmVyc2lvbjogYWN0dWFsQ29tbW9uUHJvcGVydGllcz8uWydjb21tb24uZXh0dmVyc2lvbiddLFxuXHRcdFx0XHRcdFx0dnNjb2RlTWFjaGluZUlkOiBhY3R1YWxDb21tb25Qcm9wZXJ0aWVzPy5bJ2NvbW1vbi52c2NvZGVtYWNoaW5laWQnXSxcblx0XHRcdFx0XHRcdHZzY29kZVZlcnNpb246IGFjdHVhbENvbW1vblByb3BlcnRpZXM/LlsnY29tbW9uLnZzY29kZXZlcnNpb24nXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0YWN0dWFsUmVxdWVzdFNlcnZpY2U6IHJlcXVlc3RTZXJ2aWNlLFxuXHRcdFx0XHRcdGV2ZW50UHJlZml4OiAnR2l0SHViLmNvcGlsb3QtY2hhdCcsXG5cdFx0XHRcdFx0Y29tbW9uUHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0dmVyc2lvbjogJzEuMTMwLjAnLFxuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uTmFtZTogJ0dpdEh1Yi5jb3BpbG90LWNoYXQnLFxuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uVmVyc2lvbjogJzAuNTguMCcsXG5cdFx0XHRcdFx0XHR2c2NvZGVNYWNoaW5lSWQ6ICdtYWNoaW5lLWlkJyxcblx0XHRcdFx0XHRcdHZzY29kZVZlcnNpb246ICcxLjEzMC4wJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29uc3QgYXBwZW5kZXIgPSBuZXcgVGVzdEFwcGVuZGVyKCk7XG5cdFx0XHRcdGFwcGVuZGVycy5wdXNoKGFwcGVuZGVyKTtcblx0XHRcdFx0cmV0dXJuIGFwcGVuZGVyO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHNlbmRlci5zZW5kKCdpZ25vcmVkJyk7XG5cdFx0c2VuZGVyLnNldENvbnRleHQoeyBpc0ludGVybmFsOiBmYWxzZSwgdHJhY2tpbmdJZDogJ2V4dGVybmFsLXRpZCcsIHVzZXJOYW1lOiAnZXh0ZXJuYWwnLCBpc1ZzY29kZVRlYW1NZW1iZXI6IGZhbHNlIH0pO1xuXHRcdHNlbmRlci5zZW5kKCdpZ25vcmVkRXh0ZXJuYWwnKTtcblx0XHRzZW5kZXIuc2V0Q29udGV4dCh7IGlzSW50ZXJuYWw6IHRydWUsIHRyYWNraW5nSWQ6ICdpbnRlcm5hbC10aWQnLCB1c2VyTmFtZTogJ29jdG9jYXQnLCBpc1ZzY29kZVRlYW1NZW1iZXI6IHRydWUgfSk7XG5cdFx0c2VuZGVyLnNlbmQoJ2VuZ2luZS5tZXNzYWdlcy5sZW5ndGgnLCB7IHZhbHVlOiAncHJvcGVydHknIH0sIHsgY291bnQ6IDMgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFwcGVuZGVycy5tYXAoYXBwZW5kZXIgPT4gYXBwZW5kZXIuZXZlbnRzKSwgW1t7XG5cdFx0XHRldmVudE5hbWU6ICdlbmdpbmUubWVzc2FnZXMubGVuZ3RoJyxcblx0XHRcdGRhdGE6IHtcblx0XHRcdFx0dmFsdWU6ICdwcm9wZXJ0eScsXG5cdFx0XHRcdCdjb21tb24udGlkJzogJ2ludGVybmFsLXRpZCcsXG5cdFx0XHRcdCdjb21tb24udXNlck5hbWUnOiAnb2N0b2NhdCcsXG5cdFx0XHRcdGNvdW50OiAzLFxuXHRcdFx0XHQnY29tbW9uLmlzVnNjb2RlVGVhbU1lbWJlcic6IDEsXG5cdFx0XHR9LFxuXHRcdH1dXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZsdXNoZXMgYW5kIGRpc2FibGVzIHRoZSBhcHBlbmRlciB3aGVuIGludGVybmFsIGlkZW50aXR5IGlzIGNsZWFyZWQgb3IgY2hhbmdlZCcsICgpID0+IHtcblx0XHRjb25zdCBhcHBlbmRlcnM6IFRlc3RBcHBlbmRlcltdID0gW107XG5cdFx0Y29uc3Qgc2VuZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RJbnRlcm5hbFRlbGVtZXRyeVNlbmRlcih7XG5cdFx0XHRjcmVhdGVBcHBlbmRlcjogKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBhcHBlbmRlciA9IG5ldyBUZXN0QXBwZW5kZXIoKTtcblx0XHRcdFx0YXBwZW5kZXJzLnB1c2goYXBwZW5kZXIpO1xuXHRcdFx0XHRyZXR1cm4gYXBwZW5kZXI7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0c2VuZGVyLnNldENvbnRleHQoeyBpc0ludGVybmFsOiB0cnVlLCB0cmFja2luZ0lkOiAndGlkLTEnLCB1c2VyTmFtZTogJ2ZpcnN0JywgaXNWc2NvZGVUZWFtTWVtYmVyOiBmYWxzZSB9KTtcblx0XHRzZW5kZXIuc2V0Q29udGV4dCh1bmRlZmluZWQpO1xuXHRcdHNlbmRlci5zZW5kKCdpZ25vcmVkQWZ0ZXJDbGVhcicpO1xuXHRcdHNlbmRlci5zZXRDb250ZXh0KHsgaXNJbnRlcm5hbDogdHJ1ZSwgdHJhY2tpbmdJZDogJ3RpZC0yJywgdXNlck5hbWU6ICdzZWNvbmQnLCBpc1ZzY29kZVRlYW1NZW1iZXI6IGZhbHNlIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhcHBlbmRlckNvdW50OiBhcHBlbmRlcnMubGVuZ3RoLFxuXHRcdFx0Zmlyc3RGbHVzaENvdW50OiBhcHBlbmRlcnNbMF0uZmx1c2hDb3VudCxcblx0XHRcdGZpcnN0RXZlbnRzOiBhcHBlbmRlcnNbMF0uZXZlbnRzLFxuXHRcdH0sIHtcblx0XHRcdGFwcGVuZGVyQ291bnQ6IDIsXG5cdFx0XHRmaXJzdEZsdXNoQ291bnQ6IDEsXG5cdFx0XHRmaXJzdEV2ZW50czogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbnRleHQtc2NvcGVkIGV2ZW50cyB1c2UgdGhlIHN1cHBsaWVkIGlkZW50aXR5IHdpdGhvdXQgbXV0YWJsZSBzZW5kZXIgc3RhdGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXBwZW5kZXJzOiBUZXN0QXBwZW5kZXJbXSA9IFtdO1xuXHRcdGNvbnN0IHNlbmRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0SW50ZXJuYWxUZWxlbWV0cnlTZW5kZXIoe1xuXHRcdFx0Y3JlYXRlQXBwZW5kZXI6ICgpID0+IHtcblx0XHRcdFx0Y29uc3QgYXBwZW5kZXIgPSBuZXcgVGVzdEFwcGVuZGVyKCk7XG5cdFx0XHRcdGFwcGVuZGVycy5wdXNoKGFwcGVuZGVyKTtcblx0XHRcdFx0cmV0dXJuIGFwcGVuZGVyO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHNlbmRlci5zZW5kRm9yQ29udGV4dCh7IGlzSW50ZXJuYWw6IGZhbHNlLCB0cmFja2luZ0lkOiAnZXh0ZXJuYWwnLCB1c2VyTmFtZTogJ2V4dGVybmFsJywgaXNWc2NvZGVUZWFtTWVtYmVyOiBmYWxzZSB9LCAnaWdub3JlZCcpO1xuXHRcdHNlbmRlci5zZW5kRm9yQ29udGV4dChcblx0XHRcdHsgaXNJbnRlcm5hbDogdHJ1ZSwgdHJhY2tpbmdJZDogJ3Nlc3Npb24tdGlkJywgdXNlck5hbWU6ICdzZXNzaW9uLXVzZXInLCBpc1ZzY29kZVRlYW1NZW1iZXI6IHRydWUgfSxcblx0XHRcdCdtb2RlbC5tZXNzYWdlLmFkZGVkJyxcblx0XHRcdHsgJ2NvbW1vbi50aWQnOiAncGF5bG9hZC10aWQnLCAnY29tbW9uLnVzZXJOYW1lJzogJ3BheWxvYWQtdXNlcicgfSxcblx0XHRcdHsgJ2NvbW1vbi5pc1ZzY29kZVRlYW1NZW1iZXInOiAwIH0sXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXBwZW5kZXJzLm1hcChhcHBlbmRlciA9PiBhcHBlbmRlci5ldmVudHMpLCBbW3tcblx0XHRcdGV2ZW50TmFtZTogJ21vZGVsLm1lc3NhZ2UuYWRkZWQnLFxuXHRcdFx0ZGF0YToge1xuXHRcdFx0XHQnY29tbW9uLnRpZCc6ICdzZXNzaW9uLXRpZCcsXG5cdFx0XHRcdCdjb21tb24udXNlck5hbWUnOiAnc2Vzc2lvbi11c2VyJyxcblx0XHRcdFx0J2NvbW1vbi5pc1ZzY29kZVRlYW1NZW1iZXInOiAxLFxuXHRcdFx0fSxcblx0XHR9XV0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBR3hELFNBQVMsd0NBQXdDO0FBRWpELE1BQU0sYUFBYTtBQUFBLEVBQW5CO0FBQ0MsU0FBUyxTQUE0RCxDQUFDO0FBQ3RFLHNCQUFhO0FBQUE7QUFBQSxFQUViLElBQUksV0FBbUIsTUFBcUI7QUFDM0MsU0FBSyxPQUFPLEtBQUssRUFBRSxXQUFXLEtBQUssQ0FBQztBQUFBLEVBQ3JDO0FBQUEsRUFDQSxNQUFNLFFBQXVCO0FBQzVCLFNBQUs7QUFBQSxFQUNOO0FBQ0Q7QUFFQSxNQUFNLG9DQUFvQyxNQUFNO0FBQy9DLFFBQU0sY0FBYyx3Q0FBd0M7QUFFNUQsT0FBSyxzRUFBc0UsTUFBTTtBQUNoRixVQUFNLFlBQTRCLENBQUM7QUFDbkMsVUFBTSxpQkFBaUIsRUFBRSxlQUFlLE9BQVU7QUFDbEQsVUFBTSxtQkFBbUIsRUFBRSxTQUFTLFdBQVcsb0JBQW9CLGFBQWE7QUFDaEYsVUFBTSxTQUFTLFlBQVksSUFBSSxJQUFJLGlDQUFpQztBQUFBLE1BQ25FO0FBQUEsTUFBZ0I7QUFBQSxNQUFrQixrQkFBa0I7QUFBQSxNQUFVLGdCQUFnQixDQUFDLHNCQUFzQix3QkFBd0IsZ0JBQWdCO0FBQzVJLGVBQU8sZ0JBQWdCO0FBQUEsVUFDdEI7QUFBQSxVQUNBO0FBQUEsVUFDQSxrQkFBa0I7QUFBQSxZQUNqQixTQUFTLHlCQUF5QixTQUFTO0FB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
