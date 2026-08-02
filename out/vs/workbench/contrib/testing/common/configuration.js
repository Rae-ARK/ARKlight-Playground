import { observableFromEvent } from "../../../../base/common/observable.js";
import { localize } from "../../../../nls.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions } from "../../../common/configuration.js";
var TestingConfigKeys = /* @__PURE__ */ ((TestingConfigKeys2) => {
  TestingConfigKeys2["AutoOpenPeekView"] = "testing.automaticallyOpenPeekView";
  TestingConfigKeys2["AutoOpenPeekViewDuringContinuousRun"] = "testing.automaticallyOpenPeekViewDuringAutoRun";
  TestingConfigKeys2["OpenResults"] = "testing.automaticallyOpenTestResults";
  TestingConfigKeys2["FollowRunningTest"] = "testing.followRunningTest";
  TestingConfigKeys2["DefaultGutterClickAction"] = "testing.defaultGutterClickAction";
  TestingConfigKeys2["GutterEnabled"] = "testing.gutterEnabled";
  TestingConfigKeys2["SaveBeforeTest"] = "testing.saveBeforeTest";
  TestingConfigKeys2["AlwaysRevealTestOnStateChange"] = "testing.alwaysRevealTestOnStateChange";
  TestingConfigKeys2["CountBadge"] = "testing.countBadge";
  TestingConfigKeys2["ShowAllMessages"] = "testing.showAllMessages";
  TestingConfigKeys2["CoveragePercent"] = "testing.displayedCoveragePercent";
  TestingConfigKeys2["ShowCoverageInExplorer"] = "testing.showCoverageInExplorer";
  TestingConfigKeys2["CoverageBarThresholds"] = "testing.coverageBarThresholds";
  TestingConfigKeys2["CoverageToolbarEnabled"] = "testing.coverageToolbarEnabled";
  TestingConfigKeys2["CoverageMinimapEnabled"] = "testing.coverageMinimapEnabled";
  TestingConfigKeys2["ResultsViewLayout"] = "testing.resultsView.layout";
  return TestingConfigKeys2;
})(TestingConfigKeys || {});
var AutoOpenTesting = /* @__PURE__ */ ((AutoOpenTesting2) => {
  AutoOpenTesting2["NeverOpen"] = "neverOpen";
  AutoOpenTesting2["OpenOnTestStart"] = "openOnTestStart";
  AutoOpenTesting2["OpenOnTestFailure"] = "openOnTestFailure";
  AutoOpenTesting2["OpenExplorerOnTestStart"] = "openExplorerOnTestStart";
  return AutoOpenTesting2;
})(AutoOpenTesting || {});
var AutoOpenPeekViewWhen = /* @__PURE__ */ ((AutoOpenPeekViewWhen2) => {
  AutoOpenPeekViewWhen2["FailureVisible"] = "failureInVisibleDocument";
  AutoOpenPeekViewWhen2["FailureAnywhere"] = "failureAnywhere";
  AutoOpenPeekViewWhen2["Never"] = "never";
  return AutoOpenPeekViewWhen2;
})(AutoOpenPeekViewWhen || {});
var DefaultGutterClickAction = /* @__PURE__ */ ((DefaultGutterClickAction2) => {
  DefaultGutterClickAction2["Run"] = "run";
  DefaultGutterClickAction2["Debug"] = "debug";
  DefaultGutterClickAction2["Coverage"] = "runWithCoverage";
  DefaultGutterClickAction2["ContextMenu"] = "contextMenu";
  return DefaultGutterClickAction2;
})(DefaultGutterClickAction || {});
var TestingCountBadge = /* @__PURE__ */ ((TestingCountBadge2) => {
  TestingCountBadge2["Failed"] = "failed";
  TestingCountBadge2["Off"] = "off";
  TestingCountBadge2["Passed"] = "passed";
  TestingCountBadge2["Skipped"] = "skipped";
  return TestingCountBadge2;
})(TestingCountBadge || {});
var TestingDisplayedCoveragePercent = /* @__PURE__ */ ((TestingDisplayedCoveragePercent2) => {
  TestingDisplayedCoveragePercent2["TotalCoverage"] = "totalCoverage";
  TestingDisplayedCoveragePercent2["Statement"] = "statement";
  TestingDisplayedCoveragePercent2["Minimum"] = "minimum";
  return TestingDisplayedCoveragePercent2;
})(TestingDisplayedCoveragePercent || {});
var TestingResultsViewLayout = /* @__PURE__ */ ((TestingResultsViewLayout2) => {
  TestingResultsViewLayout2["TreeLeft"] = "treeLeft";
  TestingResultsViewLayout2["TreeRight"] = "treeRight";
  return TestingResultsViewLayout2;
})(TestingResultsViewLayout || {});
const testingConfiguration = {
  id: "testing",
  order: 21,
  title: localize("testConfigurationTitle", "Testing"),
  type: "object",
  properties: {
    ["testing.automaticallyOpenPeekView" /* AutoOpenPeekView */]: {
      description: localize("testing.automaticallyOpenPeekView", "Configures when the error Peek view is automatically opened."),
      enum: [
        "failureAnywhere" /* FailureAnywhere */,
        "failureInVisibleDocument" /* FailureVisible */,
        "never" /* Never */
      ],
      default: "never" /* Never */,
      enumDescriptions: [
        localize("testing.automaticallyOpenPeekView.failureAnywhere", "Open automatically no matter where the failure is."),
        localize("testing.automaticallyOpenPeekView.failureInVisibleDocument", "Open automatically when a test fails in a visible document."),
        localize("testing.automaticallyOpenPeekView.never", "Never automatically open.")
      ]
    },
    ["testing.showAllMessages" /* ShowAllMessages */]: {
      description: localize("testing.showAllMessages", "Controls whether to show messages from all test runs."),
      type: "boolean",
      default: false
    },
    ["testing.automaticallyOpenPeekViewDuringAutoRun" /* AutoOpenPeekViewDuringContinuousRun */]: {
      description: localize("testing.automaticallyOpenPeekViewDuringContinuousRun", "Controls whether to automatically open the Peek view during continuous run mode."),
      type: "boolean",
      default: false
    },
    ["testing.countBadge" /* CountBadge */]: {
      description: localize("testing.countBadge", "Controls the count badge on the Testing icon on the Activity Bar."),
      enum: [
        "failed" /* Failed */,
        "off" /* Off */,
        "passed" /* Passed */,
        "skipped" /* Skipped */
      ],
      enumDescriptions: [
        localize("testing.countBadge.failed", "Show the number of failed tests"),
        localize("testing.countBadge.off", "Disable the testing count badge"),
        localize("testing.countBadge.passed", "Show the number of passed tests"),
        localize("testing.countBadge.skipped", "Show the number of skipped tests")
      ],
      default: "failed" /* Failed */
    },
    ["testing.followRunningTest" /* FollowRunningTest */]: {
      description: localize("testing.followRunningTest", "Controls whether the running test should be followed in the Test Explorer view."),
      type: "boolean",
      default: false
    },
    ["testing.defaultGutterClickAction" /* DefaultGutterClickAction */]: {
      description: localize("testing.defaultGutterClickAction", "Controls the action to take when left-clicking on a test decoration in the gutter."),
      enum: [
        "run" /* Run */,
        "debug" /* Debug */,
        "runWithCoverage" /* Coverage */,
        "contextMenu" /* ContextMenu */
      ],
      enumDescriptions: [
        localize("testing.defaultGutterClickAction.run", "Run the test."),
        localize("testing.defaultGutterClickAction.debug", "Debug the test."),
        localize("testing.defaultGutterClickAction.coverage", "Run the test with coverage."),
        localize("testing.defaultGutterClickAction.contextMenu", "Open the context menu for more options.")
      ],
      default: "run" /* Run */
    },
    ["testing.gutterEnabled" /* GutterEnabled */]: {
      description: localize("testing.gutterEnabled", "Controls whether test decorations are shown in the editor gutter."),
      type: "boolean",
      default: true
    },
    ["testing.saveBeforeTest" /* SaveBeforeTest */]: {
      description: localize("testing.saveBeforeTest", "Control whether save all dirty editors before running a test."),
      type: "boolean",
      default: true
    },
    ["testing.automaticallyOpenTestResults" /* OpenResults */]: {
      enum: [
        "neverOpen" /* NeverOpen */,
        "openOnTestStart" /* OpenOnTestStart */,
        "openOnTestFailure" /* OpenOnTestFailure */,
        "openExplorerOnTestStart" /* OpenExplorerOnTestStart */
      ],
      enumDescriptions: [
        localize("testing.openTesting.neverOpen", "Never automatically open the testing views"),
        localize("testing.openTesting.openOnTestStart", "Open the test results view when tests start"),
        localize("testing.openTesting.openOnTestFailure", "Open the test result view on any test failure"),
        localize("testing.openTesting.openExplorerOnTestStart", "Open the test explorer when tests start")
      ],
      default: "openOnTestStart",
      description: localize("testing.openTesting", "Controls when the testing view should open.")
    },
    ["testing.alwaysRevealTestOnStateChange" /* AlwaysRevealTestOnStateChange */]: {
      markdownDescription: localize("testing.alwaysRevealTestOnStateChange", "Always reveal the executed test when {0} is on. If this setting is turned off, only failed tests will be revealed.", "`#testing.followRunningTest#`"),
      type: "boolean",
      default: false
    },
    ["testing.showCoverageInExplorer" /* ShowCoverageInExplorer */]: {
      description: localize("testing.ShowCoverageInExplorer", "Whether test coverage should be down in the File Explorer view."),
      type: "boolean",
      default: true
    },
    ["testing.displayedCoveragePercent" /* CoveragePercent */]: {
      markdownDescription: localize("testing.displayedCoveragePercent", "Configures what percentage is displayed by default for test coverage."),
      default: "totalCoverage" /* TotalCoverage */,
      enum: [
        "totalCoverage" /* TotalCoverage */,
        "statement" /* Statement */,
        "minimum" /* Minimum */
      ],
      enumDescriptions: [
        localize("testing.displayedCoveragePercent.totalCoverage", "A calculation of the combined statement, function, and branch coverage."),
        localize("testing.displayedCoveragePercent.statement", "The statement coverage."),
        localize("testing.displayedCoveragePercent.minimum", "The minimum of statement, function, and branch coverage.")
      ]
    },
    ["testing.coverageBarThresholds" /* CoverageBarThresholds */]: {
      markdownDescription: localize("testing.coverageBarThresholds", "Configures the colors used for percentages in test coverage bars."),
      default: { red: 0, yellow: 60, green: 90 },
      properties: {
        red: { type: "number", minimum: 0, maximum: 100, default: 0 },
        yellow: { type: "number", minimum: 0, maximum: 100, default: 60 },
        green: { type: "number", minimum: 0, maximum: 100, default: 90 }
      }
    },
    ["testing.coverageToolbarEnabled" /* CoverageToolbarEnabled */]: {
      description: localize("testing.coverageToolbarEnabled", "Controls whether the coverage toolbar is shown in the editor."),
      type: "boolean",
      default: false
      // todo@connor4312: disabled by default until UI sync
    },
    ["testing.coverageMinimapEnabled" /* CoverageMinimapEnabled */]: {
      description: localize("testing.coverageMinimapEnabled", "Controls whether coverage indicators are shown in the minimap."),
      type: "boolean",
      default: true
    },
    ["testing.resultsView.layout" /* ResultsViewLayout */]: {
      description: localize("testing.resultsView.layout", "Controls the layout of the Test Results view."),
      enum: [
        "treeRight" /* TreeRight */,
        "treeLeft" /* TreeLeft */
      ],
      enumDescriptions: [
        localize("testing.resultsView.layout.treeRight", "Show the test run tree on the right side with details on the left."),
        localize("testing.resultsView.layout.treeLeft", "Show the test run tree on the left side with details on the right.")
      ],
      default: "treeRight" /* TreeRight */
    }
  }
};
Registry.as(Extensions.ConfigurationMigration).registerConfigurationMigrations([{
  key: "testing.openTesting",
  migrateFn: (value) => {
    return [["testing.automaticallyOpenTestResults" /* OpenResults */, { value }]];
  }
}]);
const getTestingConfiguration = (config, key) => config.getValue(key);
const observeTestingConfiguration = (config, key) => observableFromEvent(config.onDidChangeConfiguration, () => getTestingConfiguration(config, key));
export {
  AutoOpenPeekViewWhen,
  AutoOpenTesting,
  DefaultGutterClickAction,
  TestingConfigKeys,
  TestingCountBadge,
  TestingDisplayedCoveragePercent,
  TestingResultsViewLayout,
  getTestingConfiguration,
  observeTestingConfiguration,
  testingConfiguration
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlc3RpbmcvY29tbW9uL2NvbmZpZ3VyYXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBvYnNlcnZhYmxlRnJvbUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uTm9kZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uS2V5VmFsdWVQYWlycywgRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25NaWdyYXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcblxuZXhwb3J0IGNvbnN0IGVudW0gVGVzdGluZ0NvbmZpZ0tleXMge1xuXHRBdXRvT3BlblBlZWtWaWV3ID0gJ3Rlc3RpbmcuYXV0b21hdGljYWxseU9wZW5QZWVrVmlldycsXG5cdEF1dG9PcGVuUGVla1ZpZXdEdXJpbmdDb250aW51b3VzUnVuID0gJ3Rlc3RpbmcuYXV0b21hdGljYWxseU9wZW5QZWVrVmlld0R1cmluZ0F1dG9SdW4nLFxuXHRPcGVuUmVzdWx0cyA9ICd0ZXN0aW5nLmF1dG9tYXRpY2FsbHlPcGVuVGVzdFJlc3VsdHMnLFxuXHRGb2xsb3dSdW5uaW5nVGVzdCA9ICd0ZXN0aW5nLmZvbGxvd1J1bm5pbmdUZXN0Jyxcblx0RGVmYXVsdEd1dHRlckNsaWNrQWN0aW9uID0gJ3Rlc3RpbmcuZGVmYXVsdEd1dHRlckNsaWNrQWN0aW9uJyxcblx0R3V0dGVyRW5hYmxlZCA9ICd0ZXN0aW5nLmd1dHRlckVuYWJsZWQnLFxuXHRTYXZlQmVmb3JlVGVzdCA9ICd0ZXN0aW5nLnNhdmVCZWZvcmVUZXN0Jyxcblx0QWx3YXlzUmV2ZWFsVGVzdE9uU3RhdGVDaGFuZ2UgPSAndGVzdGluZy5hbHdheXNSZXZlYWxUZXN0T25TdGF0ZUNoYW5nZScsXG5cdENvdW50QmFkZ2UgPSAndGVzdGluZy5jb3VudEJhZGdlJyxcblx0U2hvd0FsbE1lc3NhZ2VzID0gJ3Rlc3Rpbmcuc2hvd0FsbE1lc3NhZ2VzJyxcblx0Q292ZXJhZ2VQZXJjZW50ID0gJ3Rlc3RpbmcuZGlzcGxheWVkQ292ZXJhZ2VQZXJjZW50Jyxcblx0U2hvd0NvdmVyYWdlSW5FeHBsb3JlciA9ICd0ZXN0aW5nLnNob3dDb3ZlcmFnZUluRXhwbG9yZXInLFxuXHRDb3ZlcmFnZUJhclRocmVzaG9sZHMgPSAndGVzdGluZy5jb3ZlcmFnZUJhclRocmVzaG9sZHMnLFxuXHRDb3ZlcmFnZVRvb2xiYXJFbmFibGVkID0gJ3Rlc3RpbmcuY292ZXJhZ2VUb29sYmFyRW5hYmxlZCcsXG5cdENvdmVyYWdlTWluaW1hcEVuYWJsZWQgPSAndGVzdGluZy5jb3ZlcmFnZU1pbmltYXBFbmFibGVkJyxcblx0UmVzdWx0c1ZpZXdMYXlvdXQgPSAndGVzdGluZy5yZXN1bHRzVmlldy5sYXlvdXQnLFxufVxuXG5leHBvcnQgY29uc3QgZW51bSBBdXRvT3BlblRlc3Rpbmcge1xuXHROZXZlck9wZW4gPSAnbmV2ZXJPcGVuJyxcblx0T3Blbk9uVGVzdFN0YXJ0ID0gJ29wZW5PblRlc3RTdGFydCcsXG5cdE9wZW5PblRlc3RGYWlsdXJlID0gJ29wZW5PblRlc3RGYWlsdXJlJyxcblx0T3BlbkV4cGxvcmVyT25UZXN0U3RhcnQgPSAnb3BlbkV4cGxvcmVyT25UZXN0U3RhcnQnLFxufVxuXG5leHBvcnQgY29uc3QgZW51bSBBdXRvT3BlblBlZWtWaWV3V2hlbiB7XG5cdEZhaWx1cmVWaXNpYmxlID0gJ2ZhaWx1cmVJblZpc2libGVEb2N1bWVudCcsXG5cdEZhaWx1cmVBbnl3aGVyZSA9ICdmYWlsdXJlQW55d2hlcmUnLFxuXHROZXZlciA9ICduZXZlcicsXG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIERlZmF1bHRHdXR0ZXJDbGlja0FjdGlvbiB7XG5cdFJ1biA9ICdydW4nLFxuXHREZWJ1ZyA9ICdkZWJ1ZycsXG5cdENvdmVyYWdlID0gJ3J1bldpdGhDb3ZlcmFnZScsXG5cdENvbnRleHRNZW51ID0gJ2NvbnRleHRNZW51Jyxcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gVGVzdGluZ0NvdW50QmFkZ2Uge1xuXHRGYWlsZWQgPSAnZmFpbGVkJyxcblx0T2ZmID0gJ29mZicsXG5cdFBhc3NlZCA9ICdwYXNzZWQnLFxuXHRTa2lwcGVkID0gJ3NraXBwZWQnLFxufVxuXG5leHBvcnQgY29uc3QgZW51bSBUZXN0aW5nRGlzcGxheWVkQ292ZXJhZ2VQZXJjZW50IHtcblx0VG90YWxDb3ZlcmFnZSA9ICd0b3RhbENvdmVyYWdlJyxcblx0U3RhdGVtZW50ID0gJ3N0YXRlbWVudCcsXG5cdE1pbmltdW0gPSAnbWluaW11bScsXG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIFRlc3RpbmdSZXN1bHRzVmlld0xheW91dCB7XG5cdFRyZWVMZWZ0ID0gJ3RyZWVMZWZ0Jyxcblx0VHJlZVJpZ2h0ID0gJ3RyZWVSaWdodCcsXG59XG5cbmV4cG9ydCBjb25zdCB0ZXN0aW5nQ29uZmlndXJhdGlvbjogSUNvbmZpZ3VyYXRpb25Ob2RlID0ge1xuXHRpZDogJ3Rlc3RpbmcnLFxuXHRvcmRlcjogMjEsXG5cdHRpdGxlOiBsb2NhbGl6ZSgndGVzdENvbmZpZ3VyYXRpb25UaXRsZScsIFwiVGVzdGluZ1wiKSxcblx0dHlwZTogJ29iamVjdCcsXG5cdHByb3BlcnRpZXM6IHtcblx0XHRbVGVzdGluZ0NvbmZpZ0tleXMuQXV0b09wZW5QZWVrVmlld106IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVzdGluZy5hdXRvbWF0aWNhbGx5T3BlblBlZWtWaWV3JywgXCJDb25maWd1cmVzIHdoZW4gdGhlIGVycm9yIFBlZWsgdmlldyBpcyBhdXRvbWF0aWNhbGx5IG9wZW5lZC5cIiksXG5cdFx0XHRlbnVtOiBbXG5cdFx0XHRcdEF1dG9PcGVuUGVla1ZpZXdXaGVuLkZhaWx1cmVBbnl3aGVyZSxcblx0XHRcdFx0QXV0b09wZW5QZWVrVmlld1doZW4uRmFpbHVyZVZpc2libGUsXG5cdFx0XHRcdEF1dG9PcGVuUGVla1ZpZXdXaGVuLk5ldmVyLFxuXHRcdFx0XSxcblx0XHRcdGRlZmF1bHQ6IEF1dG9PcGVuUGVla1ZpZXdXaGVuLk5ldmVyLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRsb2NhbGl6ZSgndGVzdGluZy5hdXRvbWF0aWNhbGx5T3BlblBlZWtWaWV3LmZhaWx1cmVBbnl3aGVyZScsIFwiT3BlbiBhdXRvbWF0aWNhbGx5IG5vIG1hdHRlciB3aGVyZSB0aGUgZmFpbHVyZSBpcy5cIiksXG5cdFx0XHRcdGxvY2FsaXplKCd0ZXN0aW5nLmF1dG9tYXRpY2FsbHlPcGVuUGVla1ZpZXcuZmFpbHVyZUluVmlzaWJsZURvY3VtZW50JywgXCJPcGVuIGF1dG9tYXRpY2FsbHkgd2hlbiBhIHRlc3QgZmFpbHMgaW4gYSB2aXNpYmxlIGRvY3VtZW50LlwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ3Rlc3RpbmcuYXV0b21hdGljYWxseU9wZW5QZWVrVmlldy5uZXZlcicsIFwiTmV2ZXIgYXV0b21hdGljYWxseSBvcGVuLlwiKSxcblx0XHRcdF0sXG5cdFx0fSxcblx0XHRbVGVzdGluZ0NvbmZpZ0tleXMuU2hvd0FsbE1lc3NhZ2VzXToge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXN0aW5nLnNob3dBbGxNZXNzYWdlcycsIFwiQ29udHJvbHMgd2hldGhlciB0byBzaG93IG1lc3NhZ2VzIGZyb20gYWxsIHRlc3QgcnVucy5cIiksXG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHR9LFxuXHRcdFtUZXN0aW5nQ29uZmlnS2V5cy5BdXRvT3BlblBlZWtWaWV3RHVyaW5nQ29udGludW91c1J1bl06IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVzdGluZy5hdXRvbWF0aWNhbGx5T3BlblBlZWtWaWV3RHVyaW5nQ29udGludW91c1J1bicsIFwiQ29udHJvbHMgd2hldGhlciB0byBhdXRvbWF0aWNhbGx5IG9wZW4gdGhlIFBlZWsgdmlldyBkdXJpbmcgY29udGludW91cyBydW4gbW9kZS5cIiksXG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHR9LFxuXHRcdFtUZXN0aW5nQ29uZmlnS2V5cy5Db3VudEJhZGdlXToge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXN0aW5nLmNvdW50QmFkZ2UnLCAnQ29udHJvbHMgdGhlIGNvdW50IGJhZGdlIG9uIHRoZSBUZXN0aW5nIGljb24gb24gdGhlIEFjdGl2aXR5IEJhci4nKSxcblx0XHRcdGVudW06IFtcblx0XHRcdFx0VGVzdGluZ0NvdW50QmFkZ2UuRmFpbGVkLFxuXHRcdFx0XHRUZXN0aW5nQ291bnRCYWRnZS5PZmYsXG5cdFx0XHRcdFRlc3RpbmdDb3VudEJhZGdlLlBhc3NlZCxcblx0XHRcdFx0VGVzdGluZ0NvdW50QmFkZ2UuU2tpcHBlZCxcblx0XHRcdF0sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdGxvY2FsaXplKCd0ZXN0aW5nLmNvdW50QmFkZ2UuZmFpbGVkJywgJ1Nob3cgdGhlIG51bWJlciBvZiBmYWlsZWQgdGVzdHMnKSxcblx0XHRcdFx0bG9jYWxpemUoJ3Rlc3RpbmcuY291bnRCYWRnZS5vZmYnLCAnRGlzYWJsZSB0aGUgdGVzdGluZyBjb3VudCBiYWRnZScpLFxuXHRcdFx0XHRsb2NhbGl6ZSgndGVzdGluZy5jb3VudEJhZGdlLnBhc3NlZCcsICdTaG93IHRoZSBudW1iZXIgb2YgcGFzc2VkIHRlc3RzJyksXG5cdFx0XHRcdGxvY2FsaXplKCd0ZXN0aW5nLmNvdW50QmFkZ2Uuc2tpcHBlZCcsICdTaG93IHRoZSBudW1iZXIgb2Ygc2tpcHBlZCB0ZXN0cycpLFxuXHRcdFx0XSxcblx0XHRcdGRlZmF1bHQ6IFRlc3RpbmdDb3VudEJhZGdlLkZhaWxlZCxcblx0XHR9LFxuXHRcdFtUZXN0aW5nQ29uZmlnS2V5cy5Gb2xsb3dSdW5uaW5nVGVzdF06IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVzdGluZy5mb2xsb3dSdW5uaW5nVGVzdCcsICdDb250cm9scyB3aGV0aGVyIHRoZSBydW5uaW5nIHRlc3Qgc2hvdWxkIGJlIGZvbGxvd2VkIGluIHRoZSBUZXN0IEV4cGxvcmVyIHZpZXcuJyksXG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHR9LFxuXHRcdFtUZXN0aW5nQ29uZmlnS2V5cy5EZWZhdWx0R3V0dGVyQ2xpY2tBY3Rpb25dOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlc3RpbmcuZGVmYXVsdEd1dHRlckNsaWNrQWN0aW9uJywgJ0NvbnRyb2xzIHRoZSBhY3Rpb24gdG8gdGFrZSB3aGVuIGxlZnQtY2xpY2tpbmcgb24gYSB0ZXN0IGRlY29yYXRpb24gaW4gdGhlIGd1dHRlci4nKSxcblx0XHRcdGVudW06IFtcblx0XHRcdFx0RGVmYXVsdEd1dHRlckNsaWNrQWN0aW9uLlJ1bixcblx0XHRcdFx0RGVmYXVsdEd1dHRlckNsaWNrQWN0aW9uLkRlYnVnLFxuXHRcdFx0XHREZWZhdWx0R3V0dGVyQ2xpY2tBY3Rpb24uQ292ZXJhZ2UsXG5cdFx0XHRcdERlZmF1bHRHdXR0ZXJDbGlja0FjdGlvbi5Db250ZXh0TWVudSxcblx0XHRcdF0sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdGxvY2FsaXplKCd0ZXN0aW5nLmRlZmF1bHRHdXR0ZXJDbGlja0FjdGlvbi5ydW4nLCAnUnVuIHRoZSB0ZXN0LicpLFxuXHRcdFx0XHRsb2NhbGl6ZSgndGVzdGluZy5kZWZhdWx0R3V0dGVyQ2xpY2tBY3Rpb24uZGVidWcnLCAnRGVidWcgdGhlIHRlc3QuJyksXG5cdFx0XHRcdGxvY2FsaXplKCd0ZXN0aW5nLmRlZmF1bHRHdXR0ZXJDbGlja0FjdGlvbi5jb3ZlcmFnZScsICdSdW4gdGhlIHRlc3Qgd2l0aCBjb3ZlcmFnZS4nKSxcblx0XHRcdFx0bG9jYWxpemUoJ3Rlc3RpbmcuZGVmYXVsdEd1dHRlckNsaWNrQWN0aW9uLmNvbnRleHRNZW51JywgJ09wZW4gdGhlIGNvbnRleHQgbWVudSBmb3IgbW9yZSBvcHRpb25zLicpLFxuXHRcdFx0XSxcblx0XHRcdGRlZmF1bHQ6IERlZmF1bHRHdXR0ZXJDbGlja0FjdGlvbi5SdW4sXG5cdFx0fSxcblx0XHRbVGVzdGluZ0NvbmZpZ0tleXMuR3V0dGVyRW5hYmxlZF06IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVzdGluZy5ndXR0ZXJFbmFibGVkJywgJ0NvbnRyb2xzIHdoZXRoZXIgdGVzdCBkZWNvcmF0aW9ucyBhcmUgc2hvd24gaW4gdGhlIGVkaXRvciBndXR0ZXIuJyksXG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdH0sXG5cdFx0W1Rlc3RpbmdDb25maWdLZXlzLlNhdmVCZWZvcmVUZXN0XToge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXN0aW5nLnNhdmVCZWZvcmVUZXN0JywgJ0NvbnRyb2wgd2hldGhlciBzYXZlIGFsbCBkaXJ0eSBlZGl0b3JzIGJlZm9yZSBydW5uaW5nIGEgdGVzdC4nKSxcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0fSxcblx0XHRbVGVzdGluZ0NvbmZpZ0tleXMuT3BlblJlc3VsdHNdOiB7XG5cdFx0XHRlbnVtOiBbXG5cdFx0XHRcdEF1dG9PcGVuVGVzdGluZy5OZXZlck9wZW4sXG5cdFx0XHRcdEF1dG9PcGVuVGVzdGluZy5PcGVuT25UZXN0U3RhcnQsXG5cdFx0XHRcdEF1dG9PcGVuVGVzdGluZy5PcGVuT25UZXN0RmFpbHVyZSxcblx0XHRcdFx0QXV0b09wZW5UZXN0aW5nLk9wZW5FeHBsb3Jlck9uVGVzdFN0YXJ0LFxuXHRcdFx0XSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bG9jYWxpemUoJ3Rlc3Rpbmcub3BlblRlc3RpbmcubmV2ZXJPcGVuJywgJ05ldmVyIGF1dG9tYXRpY2FsbHkgb3BlbiB0aGUgdGVzdGluZyB2aWV3cycpLFxuXHRcdFx0XHRsb2NhbGl6ZSgndGVzdGluZy5vcGVuVGVzdGluZy5vcGVuT25UZXN0U3RhcnQnLCAnT3BlbiB0aGUgdGVzdCByZXN1bHRzIHZpZXcgd2hlbiB0ZXN0cyBzdGFydCcpLFxuXHRcdFx0XHRsb2NhbGl6ZSgndGVzdGluZy5vcGVuVGVzdGluZy5vcGVuT25UZXN0RmFpbHVyZScsICdPcGVuIHRoZSB0ZXN0IHJlc3VsdCB2aWV3IG9uIGFueSB0ZXN0IGZhaWx1cmUnKSxcblx0XHRcdFx0bG9jYWxpemUoJ3Rlc3Rpbmcub3BlblRlc3Rpbmcub3BlbkV4cGxvcmVyT25UZXN0U3RhcnQnLCAnT3BlbiB0aGUgdGVzdCBleHBsb3JlciB3aGVuIHRlc3RzIHN0YXJ0JyksXG5cdFx0XHRdLFxuXHRcdFx0ZGVmYXVsdDogJ29wZW5PblRlc3RTdGFydCcsXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlc3Rpbmcub3BlblRlc3RpbmcnLCBcIkNvbnRyb2xzIHdoZW4gdGhlIHRlc3RpbmcgdmlldyBzaG91bGQgb3Blbi5cIilcblx0XHR9LFxuXHRcdFtUZXN0aW5nQ29uZmlnS2V5cy5BbHdheXNSZXZlYWxUZXN0T25TdGF0ZUNoYW5nZV06IHtcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXN0aW5nLmFsd2F5c1JldmVhbFRlc3RPblN0YXRlQ2hhbmdlJywgXCJBbHdheXMgcmV2ZWFsIHRoZSBleGVjdXRlZCB0ZXN0IHdoZW4gezB9IGlzIG9uLiBJZiB0aGlzIHNldHRpbmcgaXMgdHVybmVkIG9mZiwgb25seSBmYWlsZWQgdGVzdHMgd2lsbCBiZSByZXZlYWxlZC5cIiwgJ2AjdGVzdGluZy5mb2xsb3dSdW5uaW5nVGVzdCNgJyksXG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHR9LFxuXHRcdFtUZXN0aW5nQ29uZmlnS2V5cy5TaG93Q292ZXJhZ2VJbkV4cGxvcmVyXToge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXN0aW5nLlNob3dDb3ZlcmFnZUluRXhwbG9yZXInLCBcIldoZXRoZXIgdGVzdCBjb3ZlcmFnZSBzaG91bGQgYmUgZG93biBpbiB0aGUgRmlsZSBFeHBsb3JlciB2aWV3LlwiKSxcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0fSxcblx0XHRbVGVzdGluZ0NvbmZpZ0tleXMuQ292ZXJhZ2VQZXJjZW50XToge1xuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlc3RpbmcuZGlzcGxheWVkQ292ZXJhZ2VQZXJjZW50JywgXCJDb25maWd1cmVzIHdoYXQgcGVyY2VudGFnZSBpcyBkaXNwbGF5ZWQgYnkgZGVmYXVsdCBmb3IgdGVzdCBjb3ZlcmFnZS5cIiksXG5cdFx0XHRkZWZhdWx0OiBUZXN0aW5nRGlzcGxheWVkQ292ZXJhZ2VQZXJjZW50LlRvdGFsQ292ZXJhZ2UsXG5cdFx0XHRlbnVtOiBbXG5cdFx0XHRcdFRlc3RpbmdEaXNwbGF5ZWRDb3ZlcmFnZVBlcmNlbnQuVG90YWxDb3ZlcmFnZSxcblx0XHRcdFx0VGVzdGluZ0Rpc3BsYXllZENvdmVyYWdlUGVyY2VudC5TdGF0ZW1lbnQsXG5cdFx0XHRcdFRlc3RpbmdEaXNwbGF5ZWRDb3ZlcmFnZVBlcmNlbnQuTWluaW11bSxcblx0XHRcdF0sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdGxvY2FsaXplKCd0ZXN0aW5nLmRpc3BsYXllZENvdmVyYWdlUGVyY2VudC50b3RhbENvdmVyYWdlJywgJ0EgY2FsY3VsYXRpb24gb2YgdGhlIGNvbWJpbmVkIHN0YXRlbWVudCwgZnVuY3Rpb24sIGFuZCBicmFuY2ggY292ZXJhZ2UuJyksXG5cdFx0XHRcdGxvY2FsaXplKCd0ZXN0aW5nLmRpc3BsYXllZENvdmVyYWdlUGVyY2VudC5zdGF0ZW1lbnQnLCAnVGhlIHN0YXRlbWVudCBjb3ZlcmFnZS4nKSxcblx0XHRcdFx0bG9jYWxpemUoJ3Rlc3RpbmcuZGlzcGxheWVkQ292ZXJhZ2VQZXJjZW50Lm1pbmltdW0nLCAnVGhlIG1pbmltdW0gb2Ygc3RhdGVtZW50LCBmdW5jdGlvbiwgYW5kIGJyYW5jaCBjb3ZlcmFnZS4nKSxcblx0XHRcdF0sXG5cdFx0fSxcblx0XHRbVGVzdGluZ0NvbmZpZ0tleXMuQ292ZXJhZ2VCYXJUaHJlc2hvbGRzXToge1xuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlc3RpbmcuY292ZXJhZ2VCYXJUaHJlc2hvbGRzJywgXCJDb25maWd1cmVzIHRoZSBjb2xvcnMgdXNlZCBmb3IgcGVyY2VudGFnZXMgaW4gdGVzdCBjb3ZlcmFnZSBiYXJzLlwiKSxcblx0XHRcdGRlZmF1bHQ6IHsgcmVkOiAwLCB5ZWxsb3c6IDYwLCBncmVlbjogOTAgfSxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0cmVkOiB7IHR5cGU6ICdudW1iZXInLCBtaW5pbXVtOiAwLCBtYXhpbXVtOiAxMDAsIGRlZmF1bHQ6IDAgfSxcblx0XHRcdFx0eWVsbG93OiB7IHR5cGU6ICdudW1iZXInLCBtaW5pbXVtOiAwLCBtYXhpbXVtOiAxMDAsIGRlZmF1bHQ6IDYwIH0sXG5cdFx0XHRcdGdyZWVuOiB7IHR5cGU6ICdudW1iZXInLCBtaW5pbXVtOiAwLCBtYXhpbXVtOiAxMDAsIGRlZmF1bHQ6IDkwIH0sXG5cdFx0XHR9LFxuXHRcdH0sXG5cdFx0W1Rlc3RpbmdDb25maWdLZXlzLkNvdmVyYWdlVG9vbGJhckVuYWJsZWRdOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlc3RpbmcuY292ZXJhZ2VUb29sYmFyRW5hYmxlZCcsICdDb250cm9scyB3aGV0aGVyIHRoZSBjb3ZlcmFnZSB0b29sYmFyIGlzIHNob3duIGluIHRoZSBlZGl0b3IuJyksXG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSwgLy8gdG9kb0Bjb25ub3I0MzEyOiBkaXNhYmxlZCBieSBkZWZhdWx0IHVudGlsIFVJIHN5bmNcblx0XHR9LFxuXHRcdFtUZXN0aW5nQ29uZmlnS2V5cy5Db3ZlcmFnZU1pbmltYXBFbmFibGVkXToge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXN0aW5nLmNvdmVyYWdlTWluaW1hcEVuYWJsZWQnLCAnQ29udHJvbHMgd2hldGhlciBjb3ZlcmFnZSBpbmRpY2F0b3JzIGFyZSBzaG93biBpbiB0aGUgbWluaW1hcC4nKSxcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0fSxcblx0XHRbVGVzdGluZ0NvbmZpZ0tleXMuUmVzdWx0c1ZpZXdMYXlvdXRdOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlc3RpbmcucmVzdWx0c1ZpZXcubGF5b3V0JywgJ0NvbnRyb2xzIHRoZSBsYXlvdXQgb2YgdGhlIFRlc3QgUmVzdWx0cyB2aWV3LicpLFxuXHRcdFx0ZW51bTogW1xuXHRcdFx0XHRUZXN0aW5nUmVzdWx0c1ZpZXdMYXlvdXQuVHJlZVJpZ2h0LFxuXHRcdFx0XHRUZXN0aW5nUmVzdWx0c1ZpZXdMYXlvdXQuVHJlZUxlZnQsXG5cdFx0XHRdLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRsb2NhbGl6ZSgndGVzdGluZy5yZXN1bHRzVmlldy5sYXlvdXQudHJlZVJpZ2h0JywgJ1Nob3cgdGhlIHRlc3QgcnVuIHRyZWUgb24gdGhlIHJpZ2h0IHNpZGUgd2l0aCBkZXRhaWxzIG9uIHRoZSBsZWZ0LicpLFxuXHRcdFx0XHRsb2NhbGl6ZSgndGVzdGluZy5yZXN1bHRzVmlldy5sYXlvdXQudHJlZUxlZnQnLCAnU2hvdyB0aGUgdGVzdCBydW4gdHJlZSBvbiB0aGUgbGVmdCBzaWRlIHdpdGggZGV0YWlscyBvbiB0aGUgcmlnaHQuJyksXG5cdFx0XHRdLFxuXHRcdFx0ZGVmYXVsdDogVGVzdGluZ1Jlc3VsdHNWaWV3TGF5b3V0LlRyZWVSaWdodCxcblx0XHR9LFxuXHR9XG59O1xuXG5SZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvbk1pZ3JhdGlvblJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb25NaWdyYXRpb24pXG5cdC5yZWdpc3RlckNvbmZpZ3VyYXRpb25NaWdyYXRpb25zKFt7XG5cdFx0a2V5OiAndGVzdGluZy5vcGVuVGVzdGluZycsXG5cdFx0bWlncmF0ZUZuOiAodmFsdWU6IEF1dG9PcGVuVGVzdGluZyk6IENvbmZpZ3VyYXRpb25LZXlWYWx1ZVBhaXJzID0+IHtcblx0XHRcdHJldHVybiBbW1Rlc3RpbmdDb25maWdLZXlzLk9wZW5SZXN1bHRzLCB7IHZhbHVlIH1dXTtcblx0XHR9XG5cdH1dKTtcblxuZXhwb3J0IGludGVyZmFjZSBJVGVzdGluZ0NvdmVyYWdlQmFyVGhyZXNob2xkcyB7XG5cdHJlZDogbnVtYmVyO1xuXHRncmVlbjogbnVtYmVyO1xuXHR5ZWxsb3c6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGVzdGluZ0NvbmZpZ3VyYXRpb24ge1xuXHRbVGVzdGluZ0NvbmZpZ0tleXMuQXV0b09wZW5QZWVrVmlld106IEF1dG9PcGVuUGVla1ZpZXdXaGVuO1xuXHRbVGVzdGluZ0NvbmZpZ0tleXMuQXV0b09wZW5QZWVrVmlld0R1cmluZ0NvbnRpbnVvdXNSdW5dOiBib29sZWFuO1xuXHRbVGVzdGluZ0NvbmZpZ0tleXMuQ291bnRCYWRnZV06IFRlc3RpbmdDb3VudEJhZGdlO1xuXHRbVGVzdGluZ0NvbmZpZ0tleXMuRm9sbG93UnVubmluZ1Rlc3RdOiBib29sZWFuO1xuXHRbVGVzdGluZ0NvbmZpZ0tleXMuRGVmYXVsdEd1dHRlckNsaWNrQWN0aW9uXTogRGVmYXVsdEd1dHRlckNsaWNrQWN0aW9uO1xuXHRbVGVzdGluZ0NvbmZpZ0tleXMuR3V0dGVyRW5hYmxlZF06IGJvb2xlYW47XG5cdFtUZXN0aW5nQ29uZmlnS2V5cy5TYXZlQmVmb3JlVGVzdF06IGJvb2xlYW47XG5cdFtUZXN0aW5nQ29uZmlnS2V5cy5PcGVuUmVzdWx0c106IEF1dG9PcGVuVGVzdGluZztcblx0W1Rlc3RpbmdDb25maWdLZXlzLkFsd2F5c1JldmVhbFRlc3RPblN0YXRlQ2hhbmdlXTogYm9vbGVhbjtcblx0W1Rlc3RpbmdDb25maWdLZXlzLlNob3dBbGxNZXNzYWdlc106IGJvb2xlYW47XG5cdFtUZXN0aW5nQ29uZmlnS2V5cy5Db3ZlcmFnZVBlcmNlbnRdOiBUZXN0aW5nRGlzcGxheWVkQ292ZXJhZ2VQZXJjZW50O1xuXHRbVGVzdGluZ0NvbmZpZ0tleXMuU2hvd0NvdmVyYWdlSW5FeHBsb3Jlcl06IGJvb2xlYW47XG5cdFtUZXN0aW5nQ29uZmlnS2V5cy5Db3ZlcmFnZUJhclRocmVzaG9sZHNdOiBJVGVzdGluZ0NvdmVyYWdlQmFyVGhyZXNob2xkcztcblx0W1Rlc3RpbmdDb25maWdLZXlzLkNvdmVyYWdlVG9vbGJhckVuYWJsZWRdOiBib29sZWFuO1xuXHRbVGVzdGluZ0NvbmZpZ0tleXMuQ292ZXJhZ2VNaW5pbWFwRW5hYmxlZF06IGJvb2xlYW47XG5cdFtUZXN0aW5nQ29uZmlnS2V5cy5SZXN1bHRzVmlld0xheW91dF06IFRlc3RpbmdSZXN1bHRzVmlld0xheW91dDtcbn1cblxuZXhwb3J0IGNvbnN0IGdldFRlc3RpbmdDb25maWd1cmF0aW9uID0gPEsgZXh0ZW5kcyBUZXN0aW5nQ29uZmlnS2V5cz4oY29uZmlnOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsIGtleTogSykgPT4gY29uZmlnLmdldFZhbHVlPElUZXN0aW5nQ29uZmlndXJhdGlvbltLXT4oa2V5KTtcblxuZXhwb3J0IGNvbnN0IG9ic2VydmVUZXN0aW5nQ29uZmlndXJhdGlvbiA9IDxLIGV4dGVuZHMgVGVzdGluZ0NvbmZpZ0tleXM+KGNvbmZpZzogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBrZXk6IEspID0+IG9ic2VydmFibGVGcm9tRXZlbnQoY29uZmlnLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbiwgKCkgPT5cblx0Z2V0VGVzdGluZ0NvbmZpZ3VyYXRpb24oY29uZmlnLCBrZXkpKTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsZ0JBQWdCO0FBR3pCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQXFDLGtCQUFtRDtBQUVqRixJQUFXLG9CQUFYLGtCQUFXQSx1QkFBWDtBQUNOLEVBQUFBLG1CQUFBLHNCQUFtQjtBQUNuQixF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RTtBQUFBLFFBQzVELFFBQVEsRUFBRSxNQUFNLFVBQVUsU0FBUyxHQUFHLFNBQVMsS0FBSyxTQUFTLEdBQUc7QUFBQSxRQUNoRSxPQUFPLEVBQUUsTUFBTSxVQUFVLFNBQVMsR0FBRyxTQUFTLEtBQUssU0FBUyxHQUFHO0FBQUEsTUFDaEU7QUFBQSxJQUNEO0FBQUEsSUFDQSxDQUFDLDZEQUF3QyxHQUFHO0FBQUEsTUFDM0MsYUFBYSxTQUFTLGtDQUFrQywrREFBK0Q7QUFBQSxNQUN2SCxNQUFNO0FBQUEsTUFDTixTQUFTO0FBQUE7QUFBQSxJQUNWO0FBQUEsSUFDQSxDQUFDLDZEQUF3QyxHQUFHO0FBQUEsTUFDM0MsYUFBYSxTQUFTLGtDQUFrQyxnRUFBZ0U7QUFBQSxNQUN4SCxNQUFNO0FBQUEsTUFDTixTQUFTO0FBQUEsSUFDVjtBQUFBLElBQ0EsQ0FBQyxvREFBbUMsR0FBRztBQUFBLE1BQ3RDLGFBQWEsU0FBUyw4QkFBOEIsK0NBQStDO0FBQUEsTUFDbkcsTUFBTTtBQUFBLFFBQ0w7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0Esa0JBQWtCO0FBQUEsUUFDakIsU0FBUyx3Q0FBd0Msb0VBQW9FO0FBQUEsUUFDckgsU0FBUyx1Q0FBdUMsb0VBQW9FO0FBQUEsTUFDckg7QUFBQSxNQUNBLFNBQVM7QUFBQSxJQUNWO0FBQUEsRUFDRDtBQUNEO0FBRUEsU0FBUyxHQUFvQyxXQUFXLHNCQUFzQixFQUM1RSxnQ0FBZ0MsQ0FBQztBQUFBLEVBQ2pDLEtBQUs7QUFBQSxFQUNMLFdBQVcsQ0FBQyxVQUF1RDtBQUNsRSxXQUFPLENBQUMsQ0FBQywwREFBK0IsRUFBRSxNQUFNLENBQUMsQ0FBQztBQUFBLEVBQ25EO0FBQ0QsQ0FBQyxDQUFDO0FBMkJJLE1BQU0sMEJBQTBCLENBQThCLFFBQStCLFFBQVcsT0FBTyxTQUFtQyxHQUFHO0FBRXJKLE1BQU0sOEJBQThCLENBQThCLFFBQStCLFFBQVcsb0JBQW9CLE9BQU8sMEJBQTBCLE1BQ3ZLLHdCQUF3QixRQUFRLEdBQUcsQ0FBQzsiLAogICJuYW1lcyI6IFsiVGVzdGluZ0NvbmZpZ0tleXMiLCAiQXV0b09wZW5UZXN0aW5nIiwgIkF1dG9PcGVuUGVla1ZpZXdXaGVuIiwgIkRlZmF1bHRHdXR0ZXJDbGlja0FjdGlvbiIsICJUZXN0aW5nQ291bnRCYWRnZSIsICJUZXN0aW5nRGlzcGxheWVkQ292ZXJhZ2VQZXJjZW50IiwgIlRlc3RpbmdSZXN1bHRzVmlld0xheW91dCJdCn0K
