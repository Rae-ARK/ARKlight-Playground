import assert from "assert";
import { URI } from "../../../../../../base/common/uri.js";
import { Event } from "../../../../../../base/common/event.js";
import { DisposableStore, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { derived, observableValue } from "../../../../../../base/common/observable.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { workbenchInstantiationService } from "../../../../../test/browser/workbenchTestServices.js";
import { AICustomizationListWidget } from "../../../browser/aiCustomization/aiCustomizationListWidget.js";
import { IAICustomizationItemsModel } from "../../../browser/aiCustomization/aiCustomizationItemsModel.js";
import { extractExtensionIdFromPath, getCustomizationSecondaryText, truncateToFirstLine } from "../../../browser/aiCustomization/aiCustomizationListWidgetUtils.js";
import { AICustomizationManagementSection, IAICustomizationWorkspaceService } from "../../../common/aiCustomizationWorkspaceService.js";
import { ICustomizationHarnessService } from "../../../common/customizationHarnessService.js";
import { ContributionEnablementState } from "../../../common/enablement.js";
import { getChatSessionType } from "../../../common/model/chatUri.js";
import { IAgentPluginService } from "../../../common/plugins/agentPluginService.js";
import { IPromptsService } from "../../../common/promptSyntax/service/promptsService.js";
import { PromptsType } from "../../../common/promptSyntax/promptTypes.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { ResourceSet } from "../../../../../../base/common/map.js";
suite("aiCustomizationListWidget", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("truncateToFirstLine", () => {
    test("keeps first line when text has multiple lines", () => {
      assert.strictEqual(
        truncateToFirstLine("First line\nSecond line"),
        "First line"
      );
    });
    test("returns full text when no newline is present", () => {
      assert.strictEqual(
        truncateToFirstLine("No newline here. Even with sentences."),
        "No newline here. Even with sentences."
      );
    });
    test("handles carriage return line endings", () => {
      assert.strictEqual(
        truncateToFirstLine("First line\r\nSecond line"),
        "First line"
      );
    });
  });
  suite("getCustomizationSecondaryText", () => {
    test("keeps hook descriptions intact", () => {
      assert.strictEqual(
        getCustomizationSecondaryText('echo "setup". echo "run".', "hook.json", PromptsType.hook),
        'echo "setup". echo "run".'
      );
    });
    test("truncates non-hook descriptions to the first line", () => {
      assert.strictEqual(
        getCustomizationSecondaryText("Show the first line.\nHide the rest.", "prompt.md", PromptsType.prompt),
        "Show the first line."
      );
    });
    test("falls back to filename when description is missing", () => {
      assert.strictEqual(
        getCustomizationSecondaryText(void 0, "prompt.md", PromptsType.prompt),
        "prompt.md"
      );
    });
  });
  suite("extractExtensionIdFromPath", () => {
    test("extracts extension ID from copilot-chat extension path", () => {
      assert.strictEqual(
        extractExtensionIdFromPath("/Users/josh/.vscode-insiders/extensions/github.copilot-chat-0.43.2026040602/assets/prompts/skills/agent-customization/SKILL.md"),
        "github.copilot-chat"
      );
    });
    test("extracts extension ID from PR extension path", () => {
      assert.strictEqual(
        extractExtensionIdFromPath("/Users/josh/.vscode-insiders/extensions/github.vscode-pull-request-github-0.135.2026040604/src/lm/skills/SKILL.md"),
        "github.vscode-pull-request-github"
      );
    });
    test("extracts extension ID from Code OSS dev path", () => {
      assert.strictEqual(
        extractExtensionIdFromPath("/Users/josh/.vscode-oss-dev/extensions/github.copilot-chat-0.43.2026040602/assets/prompts/skills/troubleshoot/SKILL.md"),
        "github.copilot-chat"
      );
    });
    test("extracts extension ID from Windows-style path", () => {
      assert.strictEqual(
        extractExtensionIdFromPath("C:/Users/dev/.vscode/extensions/ms-python.python-2024.1.1/skills/SKILL.md"),
        "ms-python.python"
      );
    });
    test("returns undefined for workspace paths", () => {
      assert.strictEqual(
        extractExtensionIdFromPath("/Users/josh/git/vscode/.github/skills/accessibility/SKILL.md"),
        void 0
      );
    });
    test("returns undefined for user home paths", () => {
      assert.strictEqual(
        extractExtensionIdFromPath("/Users/josh/.copilot/skills/ios-project-setup/SKILL.md"),
        void 0
      );
    });
    test("returns undefined for plugin paths", () => {
      assert.strictEqual(
        extractExtensionIdFromPath("/Users/josh/.vscode-insiders/agent-plugins/github.com/microsoft/vscode-team-kit/model-council/skills/council-review/SKILL.md"),
        void 0
      );
    });
    test("returns undefined for bare extensions folder without version", () => {
      assert.strictEqual(
        extractExtensionIdFromPath("/workspace/extensions/my-extension/SKILL.md"),
        void 0
      );
    });
    test("extracts extension ID from User/globalStorage path (Copilot Chat ask agent)", () => {
      assert.strictEqual(
        extractExtensionIdFromPath("/Users/josh/.vscode-oss-dev/User/globalStorage/github.copilot-chat/ask-agent/Ask.agent.md"),
        "github.copilot-chat"
      );
    });
    test("extracts extension ID from User/globalStorage path on Insiders", () => {
      assert.strictEqual(
        extractExtensionIdFromPath("/Users/josh/Library/Application Support/Code - Insiders/User/globalStorage/github.copilot-chat/ask-agent/Ask.agent.md"),
        "github.copilot-chat"
      );
    });
    test("returns undefined for non-extension entries in globalStorage", () => {
      assert.strictEqual(
        extractExtensionIdFromPath("/Users/josh/.vscode-oss-dev/User/globalStorage/state.vscdb"),
        void 0
      );
    });
  });
  suite("disposed widget", () => {
    let disposables;
    let instaService;
    const searchBarHeight = 40;
    const headerHeight = 30;
    const setLayoutHeights = (widget, clientHeight) => {
      Object.defineProperty(widget.element, "clientHeight", { configurable: true, value: clientHeight });
      Object.defineProperty(widget.element.querySelector(".list-search-and-button-container"), "offsetHeight", { configurable: true, value: searchBarHeight });
      Object.defineProperty(widget.element.querySelector(".section-title-header"), "offsetHeight", { configurable: true, value: headerHeight });
    };
    const descriptor = {
      id: "test",
      label: "Test",
      icon: Codicon.settingsGear,
      itemProvider: {
        onDidChange: Event.None,
        provideChatSessionCustomizations: (sessionResource, token) => Promise.resolve(void 0)
      }
    };
    setup(() => {
      disposables = new DisposableStore();
      instaService = workbenchInstantiationService({}, disposables);
      instaService.stub(IPromptsService, {
        onDidChangeCustomAgents: Event.None,
        onDidChangeSlashCommands: Event.None,
        onDidChangeSkills: Event.None,
        onDidChangeHooks: Event.None,
        onDidChangeInstructions: Event.None,
        listPromptFiles: async () => [],
        getCustomAgents: async () => [],
        findAgentSkills: async () => [],
        getHooks: async () => void 0,
        getInstructionFiles: async () => [],
        getDisabledPromptFiles: () => new ResourceSet()
      });
      instaService.stub(IAICustomizationWorkspaceService, {
        activeProjectRoot: observableValue("test", void 0),
        getActiveProjectRoot: () => void 0,
        managementSections: [AICustomizationManagementSection.Agents],
        isSessionsWindow: false,
        welcomePageFeatures: { showGettingStartedBanner: false },
        getSkillUIIntegrations: () => /* @__PURE__ */ new Map(),
        hasOverrideProjectRoot: observableValue("test", false),
        commitFiles: async () => {
        },
        deleteFiles: async () => {
        },
        generateCustomization: async () => {
        },
        setOverrideProjectRoot: () => {
        },
        clearOverrideProjectRoot: () => {
        }
      });
      const activeSessionResource = observableValue("test", URI.parse("test:///session"));
      const activeHarness = derived((reader) => getChatSessionType(activeSessionResource.read(reader)));
      instaService.stub(ICustomizationHarnessService, {
        activeSessionResource,
        activeHarness,
        availableHarnesses: observableValue("test", [descriptor]),
        setActiveSession: () => {
        },
        getActiveDescriptor: () => descriptor,
        findHarnessById: (id) => id === descriptor.id ? descriptor : void 0,
        registerExternalHarness: () => ({ dispose() {
        } })
      });
      instaService.stub(IAgentPluginService, {
        plugins: observableValue("test", []),
        enablementModel: {
          readEnabled: () => ContributionEnablementState.EnabledProfile,
          setEnabled: () => {
          },
          remove: () => {
          }
        }
      });
      instaService.stub(ICommandService, {
        executeCommand: async () => void 0,
        onWillExecuteCommand: Event.None,
        onDidExecuteCommand: Event.None
      });
      instaService.stub(IAICustomizationItemsModel, {
        getItems: () => observableValue("test", []),
        getCount: () => observableValue("test", 0),
        getPluginCount: () => observableValue("test", 0),
        getActiveItemSource: () => ({ onDidAICustomizationItemsChange: Event.None, fetchProviderItems: async () => [], fetchAICustomizationItems: async () => [], fetchSourceFolders: async () => [], sessionResource: activeSessionResource.get(), dispose() {
        } })
      });
    });
    teardown(() => disposables.dispose());
    test("generateDebugReport returns empty string when widget is disposed", async () => {
      const widget = disposables.add(instaService.createInstance(AICustomizationListWidget));
      widget.dispose();
      const result = await widget.generateDebugReport();
      assert.strictEqual(result, "");
    });
    test("uses the rendered container height for list layout when available", () => {
      const widget = disposables.add(instaService.createInstance(AICustomizationListWidget));
      document.body.appendChild(widget.element);
      disposables.add(toDisposable(() => widget.element.remove()));
      setLayoutHeights(widget, 500);
      widget.layout(900, 320);
      assert.strictEqual(widget.element.querySelector(".list-container").style.height, "430px");
    });
    test("falls back to supplied layout height when rendered container height is 0", () => {
      const widget = disposables.add(instaService.createInstance(AICustomizationListWidget));
      document.body.appendChild(widget.element);
      disposables.add(toDisposable(() => widget.element.remove()));
      setLayoutHeights(widget, 0);
      widget.layout(900, 320);
      assert.strictEqual(widget.element.querySelector(".list-container").style.height, "830px");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2FpQ3VzdG9taXphdGlvbi9haUN1c3RvbWl6YXRpb25MaXN0V2lkZ2V0LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBkZXJpdmVkLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vdGVzdC9icm93c2VyL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBBSUN1c3RvbWl6YXRpb25MaXN0V2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9haUN1c3RvbWl6YXRpb24vYWlDdXN0b21pemF0aW9uTGlzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBJQUlDdXN0b21pemF0aW9uSXRlbXNNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWlDdXN0b21pemF0aW9uL2FpQ3VzdG9taXphdGlvbkl0ZW1zTW9kZWwuanMnO1xuaW1wb3J0IHsgZXh0cmFjdEV4dGVuc2lvbklkRnJvbVBhdGgsIGdldEN1c3RvbWl6YXRpb25TZWNvbmRhcnlUZXh0LCB0cnVuY2F0ZVRvRmlyc3RMaW5lIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9haUN1c3RvbWl6YXRpb24vYWlDdXN0b21pemF0aW9uTGlzdFdpZGdldFV0aWxzLmpzJztcbmltcG9ydCB7IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLCBJQUlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9haUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UsIElIYXJuZXNzRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VuYWJsZW1lbnQuanMnO1xuaW1wb3J0IHsgZ2V0Q2hhdFNlc3Npb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgSUFnZW50UGx1Z2luU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wbHVnaW5zL2FnZW50UGx1Z2luU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUHJvbXB0c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3NlcnZpY2UvcHJvbXB0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgUHJvbXB0c1R5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdFR5cGVzLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZVNldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5cbnN1aXRlKCdhaUN1c3RvbWl6YXRpb25MaXN0V2lkZ2V0JywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgndHJ1bmNhdGVUb0ZpcnN0TGluZScsICgpID0+IHtcblx0XHR0ZXN0KCdrZWVwcyBmaXJzdCBsaW5lIHdoZW4gdGV4dCBoYXMgbXVsdGlwbGUgbGluZXMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdHRydW5jYXRlVG9GaXJzdExpbmUoJ0ZpcnN0IGxpbmVcXG5TZWNvbmQgbGluZScpLFxuXHRcdFx0XHQnRmlyc3QgbGluZSdcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGZ1bGwgdGV4dCB3aGVuIG5vIG5ld2xpbmUgaXMgcHJlc2VudCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0dHJ1bmNhdGVUb0ZpcnN0TGluZSgnTm8gbmV3bGluZSBoZXJlLiBFdmVuIHdpdGggc2VudGVuY2VzLicpLFxuXHRcdFx0XHQnTm8gbmV3bGluZSBoZXJlLiBFdmVuIHdpdGggc2VudGVuY2VzLidcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVzIGNhcnJpYWdlIHJldHVybiBsaW5lIGVuZGluZ3MnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdHRydW5jYXRlVG9GaXJzdExpbmUoJ0ZpcnN0IGxpbmVcXHJcXG5TZWNvbmQgbGluZScpLFxuXHRcdFx0XHQnRmlyc3QgbGluZSdcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdnZXRDdXN0b21pemF0aW9uU2Vjb25kYXJ5VGV4dCcsICgpID0+IHtcblx0XHR0ZXN0KCdrZWVwcyBob29rIGRlc2NyaXB0aW9ucyBpbnRhY3QnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGdldEN1c3RvbWl6YXRpb25TZWNvbmRhcnlUZXh0KCdlY2hvIFwic2V0dXBcIi4gZWNobyBcInJ1blwiLicsICdob29rLmpzb24nLCBQcm9tcHRzVHlwZS5ob29rKSxcblx0XHRcdFx0J2VjaG8gXCJzZXR1cFwiLiBlY2hvIFwicnVuXCIuJ1xuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RydW5jYXRlcyBub24taG9vayBkZXNjcmlwdGlvbnMgdG8gdGhlIGZpcnN0IGxpbmUnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGdldEN1c3RvbWl6YXRpb25TZWNvbmRhcnlUZXh0KCdTaG93IHRoZSBmaXJzdCBsaW5lLlxcbkhpZGUgdGhlIHJlc3QuJywgJ3Byb21wdC5tZCcsIFByb21wdHNUeXBlLnByb21wdCksXG5cdFx0XHRcdCdTaG93IHRoZSBmaXJzdCBsaW5lLidcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmYWxscyBiYWNrIHRvIGZpbGVuYW1lIHdoZW4gZGVzY3JpcHRpb24gaXMgbWlzc2luZycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0Z2V0Q3VzdG9taXphdGlvblNlY29uZGFyeVRleHQodW5kZWZpbmVkLCAncHJvbXB0Lm1kJywgUHJvbXB0c1R5cGUucHJvbXB0KSxcblx0XHRcdFx0J3Byb21wdC5tZCdcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdleHRyYWN0RXh0ZW5zaW9uSWRGcm9tUGF0aCcsICgpID0+IHtcblx0XHR0ZXN0KCdleHRyYWN0cyBleHRlbnNpb24gSUQgZnJvbSBjb3BpbG90LWNoYXQgZXh0ZW5zaW9uIHBhdGgnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGV4dHJhY3RFeHRlbnNpb25JZEZyb21QYXRoKCcvVXNlcnMvam9zaC8udnNjb2RlLWluc2lkZXJzL2V4dGVuc2lvbnMvZ2l0aHViLmNvcGlsb3QtY2hhdC0wLjQzLjIwMjYwNDA2MDIvYXNzZXRzL3Byb21wdHMvc2tpbGxzL2FnZW50LWN1c3RvbWl6YXRpb24vU0tJTEwubWQnKSxcblx0XHRcdFx0J2dpdGh1Yi5jb3BpbG90LWNoYXQnXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXh0cmFjdHMgZXh0ZW5zaW9uIElEIGZyb20gUFIgZXh0ZW5zaW9uIHBhdGgnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGV4dHJhY3RFeHRlbnNpb25JZEZyb21QYXRoKCcvVXNlcnMvam9zaC8udnNjb2RlLWluc2lkZXJzL2V4dGVuc2lvbnMvZ2l0aHViLnZzY29kZS1wdWxsLXJlcXVlc3QtZ2l0aHViLTAuMTM1LjIwMjYwNDA2MDQvc3JjL2xtL3NraWxscy9TS0lMTC5tZCcpLFxuXHRcdFx0XHQnZ2l0aHViLnZzY29kZS1wdWxsLXJlcXVlc3QtZ2l0aHViJ1xuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4dHJhY3RzIGV4dGVuc2lvbiBJRCBmcm9tIENvZGUgT1NTIGRldiBwYXRoJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRleHRyYWN0RXh0ZW5zaW9uSWRGcm9tUGF0aCgnL1VzZXJzL2pvc2gvLnZzY29kZS1vc3MtZGV2L2V4dGVuc2lvbnMvZ2l0aHViLmNvcGlsb3QtY2hhdC0wLjQzLjIwMjYwNDA2MDIvYXNzZXRzL3Byb21wdHMvc2tpbGxzL3Ryb3VibGVzaG9vdC9TS0lMTC5tZCcpLFxuXHRcdFx0XHQnZ2l0aHViLmNvcGlsb3QtY2hhdCdcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleHRyYWN0cyBleHRlbnNpb24gSUQgZnJvbSBXaW5kb3dzLXN0eWxlIHBhdGgnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGV4dHJhY3RFeHRlbnNpb25JZEZyb21QYXRoKCdDOi9Vc2Vycy9kZXYvLnZzY29kZS9leHRlbnNpb25zL21zLXB5dGhvbi5weXRob24tMjAyNC4xLjEvc2tpbGxzL1NLSUxMLm1kJyksXG5cdFx0XHRcdCdtcy1weXRob24ucHl0aG9uJ1xuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciB3b3Jrc3BhY2UgcGF0aHMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGV4dHJhY3RFeHRlbnNpb25JZEZyb21QYXRoKCcvVXNlcnMvam9zaC9naXQvdnNjb2RlLy5naXRodWIvc2tpbGxzL2FjY2Vzc2liaWxpdHkvU0tJTEwubWQnKSxcblx0XHRcdFx0dW5kZWZpbmVkXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIHVzZXIgaG9tZSBwYXRocycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0ZXh0cmFjdEV4dGVuc2lvbklkRnJvbVBhdGgoJy9Vc2Vycy9qb3NoLy5jb3BpbG90L3NraWxscy9pb3MtcHJvamVjdC1zZXR1cC9TS0lMTC5tZCcpLFxuXHRcdFx0XHR1bmRlZmluZWRcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgcGx1Z2luIHBhdGhzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRleHRyYWN0RXh0ZW5zaW9uSWRGcm9tUGF0aCgnL1VzZXJzL2pvc2gvLnZzY29kZS1pbnNpZGVycy9hZ2VudC1wbHVnaW5zL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS10ZWFtLWtpdC9tb2RlbC1jb3VuY2lsL3NraWxscy9jb3VuY2lsLXJldmlldy9TS0lMTC5tZCcpLFxuXHRcdFx0XHR1bmRlZmluZWRcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgYmFyZSBleHRlbnNpb25zIGZvbGRlciB3aXRob3V0IHZlcnNpb24nLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGV4dHJhY3RFeHRlbnNpb25JZEZyb21QYXRoKCcvd29ya3NwYWNlL2V4dGVuc2lvbnMvbXktZXh0ZW5zaW9uL1NLSUxMLm1kJyksXG5cdFx0XHRcdHVuZGVmaW5lZFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4dHJhY3RzIGV4dGVuc2lvbiBJRCBmcm9tIFVzZXIvZ2xvYmFsU3RvcmFnZSBwYXRoIChDb3BpbG90IENoYXQgYXNrIGFnZW50KScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0ZXh0cmFjdEV4dGVuc2lvbklkRnJvbVBhdGgoJy9Vc2Vycy9qb3NoLy52c2NvZGUtb3NzLWRldi9Vc2VyL2dsb2JhbFN0b3JhZ2UvZ2l0aHViLmNvcGlsb3QtY2hhdC9hc2stYWdlbnQvQXNrLmFnZW50Lm1kJyksXG5cdFx0XHRcdCdnaXRodWIuY29waWxvdC1jaGF0J1xuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4dHJhY3RzIGV4dGVuc2lvbiBJRCBmcm9tIFVzZXIvZ2xvYmFsU3RvcmFnZSBwYXRoIG9uIEluc2lkZXJzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRleHRyYWN0RXh0ZW5zaW9uSWRGcm9tUGF0aCgnL1VzZXJzL2pvc2gvTGlicmFyeS9BcHBsaWNhdGlvbiBTdXBwb3J0L0NvZGUgLSBJbnNpZGVycy9Vc2VyL2dsb2JhbFN0b3JhZ2UvZ2l0aHViLmNvcGlsb3QtY2hhdC9hc2stYWdlbnQvQXNrLmFnZW50Lm1kJyksXG5cdFx0XHRcdCdnaXRodWIuY29waWxvdC1jaGF0J1xuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciBub24tZXh0ZW5zaW9uIGVudHJpZXMgaW4gZ2xvYmFsU3RvcmFnZScsICgpID0+IHtcblx0XHRcdC8vIGUuZy4gYHN0YXRlLnZzY2RiYCBvciBvdGhlciB3b3Jrc3BhY2Ugc3RvcmFnZSB0aGF0IGxhY2tzIGEgcHVibGlzaGVyLm5hbWUgcGF0dGVyblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRleHRyYWN0RXh0ZW5zaW9uSWRGcm9tUGF0aCgnL1VzZXJzL2pvc2gvLnZzY29kZS1vc3MtZGV2L1VzZXIvZ2xvYmFsU3RvcmFnZS9zdGF0ZS52c2NkYicpLFxuXHRcdFx0XHR1bmRlZmluZWRcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdkaXNwb3NlZCB3aWRnZXQnLCAoKSA9PiB7XG5cblx0XHRsZXQgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0XHRsZXQgaW5zdGFTZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdFx0Y29uc3Qgc2VhcmNoQmFySGVpZ2h0ID0gNDA7XG5cdFx0Y29uc3QgaGVhZGVySGVpZ2h0ID0gMzA7XG5cdFx0Y29uc3Qgc2V0TGF5b3V0SGVpZ2h0cyA9ICh3aWRnZXQ6IEFJQ3VzdG9taXphdGlvbkxpc3RXaWRnZXQsIGNsaWVudEhlaWdodDogbnVtYmVyKTogdm9pZCA9PiB7XG5cdFx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkod2lkZ2V0LmVsZW1lbnQsICdjbGllbnRIZWlnaHQnLCB7IGNvbmZpZ3VyYWJsZTogdHJ1ZSwgdmFsdWU6IGNsaWVudEhlaWdodCB9KTtcblx0XHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh3aWRnZXQuZWxlbWVudC5xdWVyeVNlbGVjdG9yKCcubGlzdC1zZWFyY2gtYW5kLWJ1dHRvbi1jb250YWluZXInKSEsICdvZmZzZXRIZWlnaHQnLCB7IGNvbmZpZ3VyYWJsZTogdHJ1ZSwgdmFsdWU6IHNlYXJjaEJhckhlaWdodCB9KTtcblx0XHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh3aWRnZXQuZWxlbWVudC5xdWVyeVNlbGVjdG9yKCcuc2VjdGlvbi10aXRsZS1oZWFkZXInKSEsICdvZmZzZXRIZWlnaHQnLCB7IGNvbmZpZ3VyYWJsZTogdHJ1ZSwgdmFsdWU6IGhlYWRlckhlaWdodCB9KTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgZGVzY3JpcHRvcjogSUhhcm5lc3NEZXNjcmlwdG9yID0ge1xuXHRcdFx0aWQ6ICd0ZXN0Jyxcblx0XHRcdGxhYmVsOiAnVGVzdCcsXG5cdFx0XHRpY29uOiBDb2RpY29uLnNldHRpbmdzR2Vhcixcblx0XHRcdGl0ZW1Qcm92aWRlcjoge1xuXHRcdFx0XHRvbkRpZENoYW5nZTogRXZlbnQuTm9uZSxcblx0XHRcdFx0cHJvdmlkZUNoYXRTZXNzaW9uQ3VzdG9taXphdGlvbnM6IChzZXNzaW9uUmVzb3VyY2U6IFVSSSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKSxcblx0XHRcdH0sXG5cdFx0fTtcblxuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0aW5zdGFTZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2Uoe30sIGRpc3Bvc2FibGVzKTtcblxuXHRcdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSVByb21wdHNTZXJ2aWNlLCB7XG5cdFx0XHRcdG9uRGlkQ2hhbmdlQ3VzdG9tQWdlbnRzOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRvbkRpZENoYW5nZVNsYXNoQ29tbWFuZHM6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdG9uRGlkQ2hhbmdlU2tpbGxzOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRvbkRpZENoYW5nZUhvb2tzOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRvbkRpZENoYW5nZUluc3RydWN0aW9uczogRXZlbnQuTm9uZSxcblx0XHRcdFx0bGlzdFByb21wdEZpbGVzOiBhc3luYyAoKSA9PiBbXSxcblx0XHRcdFx0Z2V0Q3VzdG9tQWdlbnRzOiBhc3luYyAoKSA9PiBbXSxcblx0XHRcdFx0ZmluZEFnZW50U2tpbGxzOiBhc3luYyAoKSA9PiBbXSxcblx0XHRcdFx0Z2V0SG9va3M6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdFx0Z2V0SW5zdHJ1Y3Rpb25GaWxlczogYXN5bmMgKCkgPT4gW10sXG5cdFx0XHRcdGdldERpc2FibGVkUHJvbXB0RmlsZXM6ICgpID0+IG5ldyBSZXNvdXJjZVNldCgpLFxuXHRcdFx0fSk7XG5cblx0XHRcdGluc3RhU2VydmljZS5zdHViKElBSUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlLCB7XG5cdFx0XHRcdGFjdGl2ZVByb2plY3RSb290OiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3QnLCB1bmRlZmluZWQpLFxuXHRcdFx0XHRnZXRBY3RpdmVQcm9qZWN0Um9vdDogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHRtYW5hZ2VtZW50U2VjdGlvbnM6IFtBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5BZ2VudHNdLFxuXHRcdFx0XHRpc1Nlc3Npb25zV2luZG93OiBmYWxzZSxcblx0XHRcdFx0d2VsY29tZVBhZ2VGZWF0dXJlczogeyBzaG93R2V0dGluZ1N0YXJ0ZWRCYW5uZXI6IGZhbHNlIH0sXG5cdFx0XHRcdGdldFNraWxsVUlJbnRlZ3JhdGlvbnM6ICgpID0+IG5ldyBNYXAoKSxcblx0XHRcdFx0aGFzT3ZlcnJpZGVQcm9qZWN0Um9vdDogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0JywgZmFsc2UpLFxuXHRcdFx0XHRjb21taXRGaWxlczogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0XHRkZWxldGVGaWxlczogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0XHRnZW5lcmF0ZUN1c3RvbWl6YXRpb246IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdFx0c2V0T3ZlcnJpZGVQcm9qZWN0Um9vdDogKCkgPT4geyB9LFxuXHRcdFx0XHRjbGVhck92ZXJyaWRlUHJvamVjdFJvb3Q6ICgpID0+IHsgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBhY3RpdmVTZXNzaW9uUmVzb3VyY2UgPSBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3QnLCBVUkkucGFyc2UoJ3Rlc3Q6Ly8vc2Vzc2lvbicpKTtcblx0XHRcdGNvbnN0IGFjdGl2ZUhhcm5lc3MgPSBkZXJpdmVkKHJlYWRlciA9PiBnZXRDaGF0U2Vzc2lvblR5cGUoYWN0aXZlU2Vzc2lvblJlc291cmNlLnJlYWQocmVhZGVyKSkpO1xuXG5cdFx0XHRpbnN0YVNlcnZpY2Uuc3R1YihJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLCB7XG5cdFx0XHRcdGFjdGl2ZVNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0YWN0aXZlSGFybmVzcyxcblx0XHRcdFx0YXZhaWxhYmxlSGFybmVzc2VzOiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3QnLCBbZGVzY3JpcHRvcl0pLFxuXHRcdFx0XHRzZXRBY3RpdmVTZXNzaW9uOiAoKSA9PiB7IH0sXG5cdFx0XHRcdGdldEFjdGl2ZURlc2NyaXB0b3I6ICgpID0+IGRlc2NyaXB0b3IsXG5cdFx0XHRcdGZpbmRIYXJuZXNzQnlJZDogKGlkKSA9PiBpZCA9PT0gZGVzY3JpcHRvci5pZCA/IGRlc2NyaXB0b3IgOiB1bmRlZmluZWQsXG5cdFx0XHRcdHJlZ2lzdGVyRXh0ZXJuYWxIYXJuZXNzOiAoKSA9PiAoeyBkaXNwb3NlKCkgeyB9IH0pLFxuXHRcdFx0fSk7XG5cblx0XHRcdGluc3RhU2VydmljZS5zdHViKElBZ2VudFBsdWdpblNlcnZpY2UsIHtcblx0XHRcdFx0cGx1Z2luczogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0JywgW10pLFxuXHRcdFx0XHRlbmFibGVtZW50TW9kZWw6IHtcblx0XHRcdFx0XHRyZWFkRW5hYmxlZDogKCkgPT4gQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRQcm9maWxlLFxuXHRcdFx0XHRcdHNldEVuYWJsZWQ6ICgpID0+IHsgfSxcblx0XHRcdFx0XHRyZW1vdmU6ICgpID0+IHsgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHRpbnN0YVNlcnZpY2Uuc3R1YihJQ29tbWFuZFNlcnZpY2UsIHtcblx0XHRcdFx0ZXhlY3V0ZUNvbW1hbmQ6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdFx0b25XaWxsRXhlY3V0ZUNvbW1hbmQ6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdG9uRGlkRXhlY3V0ZUNvbW1hbmQ6IEV2ZW50Lk5vbmUsXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gVGhlIHdpZGdldCByZWFkcyBpdGVtcyBmcm9tIHRoZSBpdGVtcyBtb2RlbDsgc3R1YiBpdCB3aXRoIGVtcHR5XG5cdFx0XHQvLyBwZXItc2VjdGlvbiBvYnNlcnZhYmxlcy4gVGhpcyBhdm9pZHMgbmVlZGluZyB0byB3aXJlIHVwIHRoZSBmdWxsXG5cdFx0XHQvLyBQcm92aWRlckN1c3RvbWl6YXRpb25JdGVtU291cmNlIHBpcGVsaW5lIGluIHRlc3RzLlxuXHRcdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSUFJQ3VzdG9taXphdGlvbkl0ZW1zTW9kZWwsIHtcblx0XHRcdFx0Z2V0SXRlbXM6ICgpID0+IG9ic2VydmFibGVWYWx1ZSgndGVzdCcsIFtdIGFzIHJlYWRvbmx5IG5ldmVyW10pLFxuXHRcdFx0XHRnZXRDb3VudDogKCkgPT4gb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0JywgMCksXG5cdFx0XHRcdGdldFBsdWdpbkNvdW50OiAoKSA9PiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3QnLCAwKSxcblx0XHRcdFx0Z2V0QWN0aXZlSXRlbVNvdXJjZTogKCkgPT4gKHsgb25EaWRBSUN1c3RvbWl6YXRpb25JdGVtc0NoYW5nZTogRXZlbnQuTm9uZSwgZmV0Y2hQcm92aWRlckl0ZW1zOiBhc3luYyAoKSA9PiBbXSwgZmV0Y2hBSUN1c3RvbWl6YXRpb25JdGVtczogYXN5bmMgKCkgPT4gW10sIGZldGNoU291cmNlRm9sZGVyczogYXN5bmMgKCkgPT4gW10sIHNlc3Npb25SZXNvdXJjZTogYWN0aXZlU2Vzc2lvblJlc291cmNlLmdldCgpLCBkaXNwb3NlKCkgeyB9IH0pLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZWFyZG93bigoKSA9PiBkaXNwb3NhYmxlcy5kaXNwb3NlKCkpO1xuXG5cdFx0dGVzdCgnZ2VuZXJhdGVEZWJ1Z1JlcG9ydCByZXR1cm5zIGVtcHR5IHN0cmluZyB3aGVuIHdpZGdldCBpcyBkaXNwb3NlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHdpZGdldCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQUlDdXN0b21pemF0aW9uTGlzdFdpZGdldCkpO1xuXHRcdFx0d2lkZ2V0LmRpc3Bvc2UoKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHdpZGdldC5nZW5lcmF0ZURlYnVnUmVwb3J0KCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAnJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1c2VzIHRoZSByZW5kZXJlZCBjb250YWluZXIgaGVpZ2h0IGZvciBsaXN0IGxheW91dCB3aGVuIGF2YWlsYWJsZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHdpZGdldCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQUlDdXN0b21pemF0aW9uTGlzdFdpZGdldCkpO1xuXHRcdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh3aWRnZXQuZWxlbWVudCk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHdpZGdldC5lbGVtZW50LnJlbW92ZSgpKSk7XG5cblx0XHRcdHNldExheW91dEhlaWdodHMod2lkZ2V0LCA1MDApO1xuXG5cdFx0XHR3aWRnZXQubGF5b3V0KDkwMCwgMzIwKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdpZGdldC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcubGlzdC1jb250YWluZXInKSEuc3R5bGUuaGVpZ2h0LCAnNDMwcHgnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gc3VwcGxpZWQgbGF5b3V0IGhlaWdodCB3aGVuIHJlbmRlcmVkIGNvbnRhaW5lciBoZWlnaHQgaXMgMCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHdpZGdldCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQUlDdXN0b21pemF0aW9uTGlzdFdpZGdldCkpO1xuXHRcdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh3aWRnZXQuZWxlbWVudCk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHdpZGdldC5lbGVtZW50LnJlbW92ZSgpKSk7XG5cblx0XHRcdHNldExheW91dEhlaWdodHMod2lkZ2V0LCAwKTtcblxuXHRcdFx0d2lkZ2V0LmxheW91dCg5MDAsIDMyMCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3aWRnZXQuZWxlbWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmxpc3QtY29udGFpbmVyJykhLnN0eWxlLmhlaWdodCwgJzgzMHB4Jyk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxXQUFXO0FBRXBCLFNBQVMsYUFBYTtBQUN0QixTQUFTLGlCQUFpQixvQkFBb0I7QUFDOUMsU0FBUyxTQUFTLHVCQUF1QjtBQUN6QyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLHVCQUF1QjtBQUVoQyxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLDRCQUE0QiwrQkFBK0IsMkJBQTJCO0FBQy9GLFNBQVMsa0NBQWtDLHdDQUF3QztBQUNuRixTQUFTLG9DQUF3RDtBQUNqRSxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxtQkFBbUI7QUFFNUIsTUFBTSw2QkFBNkIsTUFBTTtBQUN4QywwQ0FBd0M7QUFFeEMsUUFBTSx1QkFBdUIsTUFBTTtBQUNsQyxTQUFLLGlEQUFpRCxNQUFNO0FBQzNELGFBQU87QUFBQSxRQUNOLG9CQUFvQix5QkFBeUI7QUFB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
