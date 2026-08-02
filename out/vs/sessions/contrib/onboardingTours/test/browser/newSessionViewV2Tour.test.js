import assert from "assert";
import { observableValue } from "../../../../../base/common/observable.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { IsNewChatSessionContext, SessionHasWorkspaceContext } from "../../../../common/contextkeys.js";
import { createNewSessionViewV2Tour, NEW_SESSION_VIEW_V2_TOUR_ID } from "../../browser/tours/newSessionViewV2Tour.js";
import { NEW_SESSION_ONBOARDING_SEEN_KEY } from "../../browser/tours/newSessionTour.js";
import { createNewSessionViewTour } from "../../browser/tours/newSessionViewTour.js";
suite("NewSessionViewV2Tour", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("defines the interactive workspace, harness, and model flow", () => {
    const trigger = observableValue(disposables, false);
    const scenario = createNewSessionViewV2Tour(trigger);
    const steps = scenario.presentation.payload.steps;
    assert.deepStrictEqual({
      id: scenario.id,
      seenKey: scenario.seenKey,
      priority: scenario.priority,
      experiment: scenario.experiment,
      steps: steps.map((step) => ({
        id: step.id,
        targetId: step.targetId,
        missingTarget: step.missingTarget,
        openTarget: step.openTarget,
        allowTargetInteraction: step.allowTargetInteraction,
        advanceWhenWorkspaceSelected: step.advanceWhen === SessionHasWorkspaceContext
      }))
    }, {
      id: NEW_SESSION_VIEW_V2_TOUR_ID,
      seenKey: NEW_SESSION_ONBOARDING_SEEN_KEY,
      priority: 110,
      experiment: {
        behaviorFlag: "onb.newSessionViewV2.show",
        assignmentContextIdFlag: "onb.newSessionViewV2.id"
      },
      steps: [
        {
          id: "workspacePicker",
          targetId: "sessions.newSession.workspacePicker",
          missingTarget: { kind: "skip" },
          openTarget: true,
          allowTargetInteraction: true,
          advanceWhenWorkspaceSelected: true
        },
        {
          id: "harnessPicker",
          targetId: "sessions.newSession.harnessPicker",
          missingTarget: { kind: "wait", timeoutMs: 5e3 },
          openTarget: false,
          allowTargetInteraction: true,
          advanceWhenWorkspaceSelected: false
        },
        {
          id: "modelPicker",
          targetId: "sessions.newSession.modelPicker",
          missingTarget: { kind: "wait", timeoutMs: 5e3 },
          openTarget: true,
          allowTargetInteraction: true,
          advanceWhenWorkspaceSelected: false
        }
      ]
    });
  });
  test("requires the new-session view for both view tours", () => {
    const trigger = observableValue(disposables, false);
    const scenarios = [createNewSessionViewTour(trigger), createNewSessionViewV2Tour(trigger)];
    assert.deepStrictEqual(
      scenarios.map((scenario) => scenario.when?.keys().includes(IsNewChatSessionContext.key)),
      [true, true]
    );
  });
  test("keeps picker targets interactive in both view tours", () => {
    const trigger = observableValue(disposables, false);
    const scenarios = [createNewSessionViewTour(trigger), createNewSessionViewV2Tour(trigger)];
    assert.deepStrictEqual(
      scenarios.map((scenario) => scenario.presentation.payload.steps.map((step) => step.allowTargetInteraction)),
      [[true, true, true], [true, true, true]]
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvb25ib2FyZGluZ1RvdXJzL3Rlc3QvYnJvd3Nlci9uZXdTZXNzaW9uVmlld1YyVG91ci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElzTmV3Q2hhdFNlc3Npb25Db250ZXh0LCBTZXNzaW9uSGFzV29ya3NwYWNlQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVOZXdTZXNzaW9uVmlld1YyVG91ciwgTkVXX1NFU1NJT05fVklFV19WMl9UT1VSX0lEIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90b3Vycy9uZXdTZXNzaW9uVmlld1YyVG91ci5qcyc7XG5pbXBvcnQgeyBORVdfU0VTU0lPTl9PTkJPQVJESU5HX1NFRU5fS0VZIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90b3Vycy9uZXdTZXNzaW9uVG91ci5qcyc7XG5pbXBvcnQgeyBjcmVhdGVOZXdTZXNzaW9uVmlld1RvdXIgfSBmcm9tICcuLi8uLi9icm93c2VyL3RvdXJzL25ld1Nlc3Npb25WaWV3VG91ci5qcyc7XG5cbnN1aXRlKCdOZXdTZXNzaW9uVmlld1YyVG91cicsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2RlZmluZXMgdGhlIGludGVyYWN0aXZlIHdvcmtzcGFjZSwgaGFybmVzcywgYW5kIG1vZGVsIGZsb3cnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdHJpZ2dlciA9IG9ic2VydmFibGVWYWx1ZTxib29sZWFuPihkaXNwb3NhYmxlcywgZmFsc2UpO1xuXHRcdGNvbnN0IHNjZW5hcmlvID0gY3JlYXRlTmV3U2Vzc2lvblZpZXdWMlRvdXIodHJpZ2dlcik7XG5cdFx0Y29uc3Qgc3RlcHMgPSBzY2VuYXJpby5wcmVzZW50YXRpb24ucGF5bG9hZC5zdGVwcztcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aWQ6IHNjZW5hcmlvLmlkLFxuXHRcdFx0c2VlbktleTogc2NlbmFyaW8uc2VlbktleSxcblx0XHRcdHByaW9yaXR5OiBzY2VuYXJpby5wcmlvcml0eSxcblx0XHRcdGV4cGVyaW1lbnQ6IHNjZW5hcmlvLmV4cGVyaW1lbnQsXG5cdFx0XHRzdGVwczogc3RlcHMubWFwKHN0ZXAgPT4gKHtcblx0XHRcdFx0aWQ6IHN0ZXAuaWQsXG5cdFx0XHRcdHRhcmdldElkOiBzdGVwLnRhcmdldElkLFxuXHRcdFx0XHRtaXNzaW5nVGFyZ2V0OiBzdGVwLm1pc3NpbmdUYXJnZXQsXG5cdFx0XHRcdG9wZW5UYXJnZXQ6IHN0ZXAub3BlblRhcmdldCxcblx0XHRcdFx0YWxsb3dUYXJnZXRJbnRlcmFjdGlvbjogc3RlcC5hbGxvd1RhcmdldEludGVyYWN0aW9uLFxuXHRcdFx0XHRhZHZhbmNlV2hlbldvcmtzcGFjZVNlbGVjdGVkOiBzdGVwLmFkdmFuY2VXaGVuID09PSBTZXNzaW9uSGFzV29ya3NwYWNlQ29udGV4dCxcblx0XHRcdH0pKSxcblx0XHR9LCB7XG5cdFx0XHRpZDogTkVXX1NFU1NJT05fVklFV19WMl9UT1VSX0lELFxuXHRcdFx0c2VlbktleTogTkVXX1NFU1NJT05fT05CT0FSRElOR19TRUVOX0tFWSxcblx0XHRcdHByaW9yaXR5OiAxMTAsXG5cdFx0XHRleHBlcmltZW50OiB7XG5cdFx0XHRcdGJlaGF2aW9yRmxhZzogJ29uYi5uZXdTZXNzaW9uVmlld1YyLnNob3cnLFxuXHRcdFx0XHRhc3NpZ25tZW50Q29udGV4dElkRmxhZzogJ29uYi5uZXdTZXNzaW9uVmlld1YyLmlkJyxcblx0XHRcdH0sXG5cdFx0XHRzdGVwczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICd3b3Jrc3BhY2VQaWNrZXInLFxuXHRcdFx0XHRcdHRhcmdldElkOiAnc2Vzc2lvbnMubmV3U2Vzc2lvbi53b3Jrc3BhY2VQaWNrZXInLFxuXHRcdFx0XHRcdG1pc3NpbmdUYXJnZXQ6IHsga2luZDogJ3NraXAnIH0sXG5cdFx0XHRcdFx0b3BlblRhcmdldDogdHJ1ZSxcblx0XHRcdFx0XHRhbGxvd1RhcmdldEludGVyYWN0aW9uOiB0cnVlLFxuXHRcdFx0XHRcdGFkdmFuY2VXaGVuV29ya3NwYWNlU2VsZWN0ZWQ6IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2hhcm5lc3NQaWNrZXInLFxuXHRcdFx0XHRcdHRhcmdldElkOiAnc2Vzc2lvbnMubmV3U2Vzc2lvbi5oYXJuZXNzUGlja2VyJyxcblx0XHRcdFx0XHRtaXNzaW5nVGFyZ2V0OiB7IGtpbmQ6ICd3YWl0JywgdGltZW91dE1zOiA1XzAwMCB9LFxuXHRcdFx0XHRcdG9wZW5UYXJnZXQ6IGZhbHNlLFxuXHRcdFx0XHRcdGFsbG93VGFyZ2V0SW50ZXJhY3Rpb246IHRydWUsXG5cdFx0XHRcdFx0YWR2YW5jZVdoZW5Xb3Jrc3BhY2VTZWxlY3RlZDogZmFsc2UsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ21vZGVsUGlja2VyJyxcblx0XHRcdFx0XHR0YXJnZXRJZDogJ3Nlc3Npb25zLm5ld1Nlc3Npb24ubW9kZWxQaWNrZXInLFxuXHRcdFx0XHRcdG1pc3NpbmdUYXJnZXQ6IHsga2luZDogJ3dhaXQnLCB0aW1lb3V0TXM6IDVfMDAwIH0sXG5cdFx0XHRcdFx0b3BlblRhcmdldDogdHJ1ZSxcblx0XHRcdFx0XHRhbGxvd1RhcmdldEludGVyYWN0aW9uOiB0cnVlLFxuXHRcdFx0XHRcdGFkdmFuY2VXaGVuV29ya3NwYWNlU2VsZWN0ZWQ6IGZhbHNlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVxdWlyZXMgdGhlIG5ldy1zZXNzaW9uIHZpZXcgZm9yIGJvdGggdmlldyB0b3VycycsICgpID0+IHtcblx0XHRjb25zdCB0cmlnZ2VyID0gb2JzZXJ2YWJsZVZhbHVlPGJvb2xlYW4+KGRpc3Bvc2FibGVzLCBmYWxzZSk7XG5cdFx0Y29uc3Qgc2NlbmFyaW9zID0gW2NyZWF0ZU5ld1Nlc3Npb25WaWV3VG91cih0cmlnZ2VyKSwgY3JlYXRlTmV3U2Vzc2lvblZpZXdWMlRvdXIodHJpZ2dlcildO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHNjZW5hcmlvcy5tYXAoc2NlbmFyaW8gPT4gc2NlbmFyaW8ud2hlbj8ua2V5cygpLmluY2x1ZGVzKElzTmV3Q2hhdFNlc3Npb25Db250ZXh0LmtleSkpLFxuXHRcdFx0W3RydWUsIHRydWVdLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2tlZXBzIHBpY2tlciB0YXJnZXRzIGludGVyYWN0aXZlIGluIGJvdGggdmlldyB0b3VycycsICgpID0+IHtcblx0XHRjb25zdCB0cmlnZ2VyID0gb2JzZXJ2YWJsZVZhbHVlPGJvb2xlYW4+KGRpc3Bvc2FibGVzLCBmYWxzZSk7XG5cdFx0Y29uc3Qgc2NlbmFyaW9zID0gW2NyZWF0ZU5ld1Nlc3Npb25WaWV3VG91cih0cmlnZ2VyKSwgY3JlYXRlTmV3U2Vzc2lvblZpZXdWMlRvdXIodHJpZ2dlcildO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHNjZW5hcmlvcy5tYXAoc2NlbmFyaW8gPT4gc2NlbmFyaW8ucHJlc2VudGF0aW9uLnBheWxvYWQuc3RlcHMubWFwKHN0ZXAgPT4gc3RlcC5hbGxvd1RhcmdldEludGVyYWN0aW9uKSksXG5cdFx0XHRbW3RydWUsIHRydWUsIHRydWVdLCBbdHJ1ZSwgdHJ1ZSwgdHJ1ZV1dLFxuXHRcdCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyx5QkFBeUIsa0NBQWtDO0FBQ3BFLFNBQVMsNEJBQTRCLG1DQUFtQztBQUN4RSxTQUFTLHVDQUF1QztBQUNoRCxTQUFTLGdDQUFnQztBQUV6QyxNQUFNLHdCQUF3QixNQUFNO0FBRW5DLFFBQU0sY0FBYyx3Q0FBd0M7QUFFNUQsT0FBSyw4REFBOEQsTUFBTTtBQUN4RSxVQUFNLFVBQVUsZ0JBQXlCLGFBQWEsS0FBSztBQUMzRCxVQUFNLFdBQVcsMkJBQTJCLE9BQU87QUFDbkQsVUFBTSxRQUFRLFNBQVMsYUFBYSxRQUFRO0FBRTVDLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsSUFBSSxTQUFTO0FBQUEsTUFDYixTQUFTLFNBQVM7QUFBQSxNQUNsQixVQUFVLFNBQVM7QUFBQSxNQUNuQixZQUFZLFNBQVM7QUFBQSxNQUNyQixPQUFPLE1BQU0sSUFBSSxXQUFTO0FBQUEsUUFDekIsSUFBSSxLQUFLO0FBQUEsUUFDVCxVQUFVLEtBQUs7QUFBQSxRQUNmLGVBQWUsS0FBSztBQUFBLFFBQ3BCLFlBQVksS0FBSztBQUFBLFFBQ2pCLHdCQUF3QixLQUFLO0FBQUEsUUFDN0IsOEJBQThCLEtBQUssZ0JBQWdCO0FBQUEsTUFDcEQsRUFBRTtBQUFBLElBQ0gsR0FBRztBQUFBLE1BQ0YsSUFBSTtBQUFBLE1BQ0osU0FBUztBQUFBLE1BQ1QsVUFBVTtBQUFBLE1BQ1YsWUFBWTtBQUFBLFFBQ1gsY0FBYztBQUFBLFFBQ2QseUJBQXlCO0FBQUEsTUFDMUI7QUFBQSxNQUNBLE9BQU87QUFBQSxRQUNOO0FBQUEsVUFDQyxJQUFJO0FBQUEsVUFDSixVQUFVO0FBQUEsVUFDVixlQUFlLEVBQUUsTUFBTSxPQUFPO0FBQUEsVUFDOUIsWUFBWTtBQUFBLFVBQ1osd0JBQXdCO0FBQUEsVUFDeEIsOEJBQThCO0FBQUEsUUFDL0I7QUFBQSxRQUNBO0FBQUEsVUFDQyxJQUFJO0FBQUEsVUFDSixVQUFVO0FBQUEsVUFDVixlQUFlLEVBQUUsTUFBTSxRQUFRLFdBQVcsSUFBTTtBQUFBLFVBQ2hELFlBQVk7QUFBQSxVQUNaLHdCQUF3QjtBQUFBLFVBQ3hCLDhCQUE4QjtBQUFBLFFBQy9CO0FBQUEsUUFDQTtBQUFBLFVBQ0MsSUFBSTtBQUFBLFVBQ0osVUFBVTtBQUFBLFVBQ1YsZUFBZSxFQUFFLE1BQU0sUUFBUSxXQUFXLElBQU07QUFBQSxVQUNoRCxZQUFZO0FBQUEsVUFDWix3QkFBd0I7QUFBQSxVQUN4Qiw4QkFBOEI7QUFBQSxRQUMvQjtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHFEQUFxRCxNQUFNO0FBQy9ELFVBQU0sVUFBVSxnQkFBeUIsYUFBYSxLQUFLO0FBQzNELFVBQU0sWUFBWSxDQUFDLHlCQUF5QixPQUFPLEdBQUcsMkJBQTJCLE9BQU8sQ0FBQztBQUV6RixXQUFPO0FBQUEsTUFDTixVQUFVLElBQUksY0FBWSxTQUFTLE1BQU0sS0FBSyxFQUFFLFNBQVMsd0JBQXdCLEdBQUcsQ0FBQztBQUFBLE1BQ3JGLENBQUMsTUFBTSxJQUFJO0FBQUEsSUFDWjtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssdURBQXVELE1BQU07QUFDakUsVUFBTSxVQUFVLGdCQUF5QixhQUFhLEtBQUs7QUFDM0QsVUFBTSxZQUFZLENBQUMseUJBQXlCLE9BQU8sR0FBRywyQkFBMkIsT0FBTyxDQUFDO0FBRXpGLFdBQU87QUFBQSxNQUNOLFVBQVUsSUFBSSxjQUFZLFNBQVMsYUFBYSxRQUFRLE1BQU0sSUFBSSxVQUFRLEtBQUssc0JBQXNCLENBQUM7QUFBQSxNQUN0RyxDQUFDLENBQUMsTUFBTSxNQUFNLElBQUksR0FBRyxDQUFDLE1BQU0sTUFBTSxJQUFJLENBQUM7QUFBQSxJQUN4QztBQUFBLEVBQ0QsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
