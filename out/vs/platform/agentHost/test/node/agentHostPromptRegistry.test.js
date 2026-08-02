import assert from "assert";
import { CopilotCliConfigKey, applyModelFamilyAlias } from "../../common/copilotCliConfig.js";
import { AgentHostPromptRegistry, agentHostPromptRegistry } from "../../node/copilot/prompts/promptRegistry.js";
import { COPILOT_AGENT_HOST_FILE_LINK_INSTRUCTIONS, COPILOT_AGENT_HOST_WORKSPACELESS_INSTRUCTIONS, COPILOT_AGENT_HOST_SYSTEM_MESSAGE } from "../../node/copilot/prompts/systemMessage.js";
import { BrowserChatToolReferenceName } from "../../../browserView/common/browserChatToolReferenceNames.js";
import { CLIENT_TOOL_SEARCH_REFERENCE_NAME } from "../../common/toolSearchConstants.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import "../../node/copilot/prompts/allPrompts.js";
function context(settings = {}, tools = [], workspaceless = false, toolSearchActive = false) {
  const toolNames = new Set(tools);
  return {
    getSetting: (key) => settings[key],
    hasClientTool: (name) => toolNames.has(name),
    workspaceless,
    toolSearchActive
  };
}
suite("AgentHostPromptRegistry", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const withFileLinkInstructions = (config) => ({
    ...config,
    content: config.content ? `${config.content}

${COPILOT_AGENT_HOST_FILE_LINK_INSTRUCTIONS}` : COPILOT_AGENT_HOST_FILE_LINK_INSTRUCTIONS
  });
  test("falls back to the default system message when no model is provided", () => {
    const registry = new AgentHostPromptRegistry();
    assert.deepStrictEqual(registry.resolveSystemMessageConfig(void 0, context()), withFileLinkInstructions(COPILOT_AGENT_HOST_SYSTEM_MESSAGE));
  });
  test("falls back to the default when no contributor matches the model", () => {
    const registry = new AgentHostPromptRegistry();
    assert.deepStrictEqual(registry.resolveSystemMessageConfig({ id: "unknown-model" }, context()), withFileLinkInstructions(COPILOT_AGENT_HOST_SYSTEM_MESSAGE));
  });
  test("a contributor can fully replace the system prompt (replace mode)", () => {
    var _a;
    const registry = new AgentHostPromptRegistry();
    registry.registerPrompt((_a = class {
      resolveFullSystemPrompt() {
        return "FULL PROMPT";
      }
    }, _a.familyPrefixes = ["gpt-5"], _a));
    assert.deepStrictEqual(
      registry.resolveSystemMessageConfig({ id: "gpt-5-mini" }, context()),
      { mode: "replace", content: "FULL PROMPT" }
    );
  });
  test("a contributor can override individual sections (customize mode)", () => {
    var _a;
    const registry = new AgentHostPromptRegistry();
    registry.registerPrompt((_a = class {
      resolveSectionOverrides() {
        return { guidelines: { action: "append", content: "Be concise." } };
      }
    }, _a.familyPrefixes = ["claude"], _a));
    assert.deepStrictEqual(
      registry.resolveSystemMessageConfig({ id: "claude-sonnet" }, context()),
      withFileLinkInstructions({ mode: "customize", sections: { guidelines: { action: "append", content: "Be concise." } } })
    );
  });
  test("treats empty section overrides as no override (falls back to default)", () => {
    var _a;
    const registry = new AgentHostPromptRegistry();
    registry.registerPrompt((_a = class {
      resolveSectionOverrides() {
        return {};
      }
    }, _a.familyPrefixes = ["claude"], _a));
    assert.deepStrictEqual(
      registry.resolveSystemMessageConfig({ id: "claude-sonnet" }, context()),
      withFileLinkInstructions(COPILOT_AGENT_HOST_SYSTEM_MESSAGE)
    );
  });
  test("matchesModel takes precedence over family prefixes", () => {
    var _a;
    const registry = new AgentHostPromptRegistry();
    registry.registerPrompt((_a = class {
      static matchesModel(model) {
        return model.id.includes("codex");
      }
      resolveFullSystemPrompt() {
        return "CODEX";
      }
    }, _a.familyPrefixes = [], _a));
    assert.deepStrictEqual(
      registry.resolveSystemMessageConfig({ id: "gpt-5-codex" }, context()),
      { mode: "replace", content: "CODEX" }
    );
  });
  test("contributors gate on the prompt context", () => {
    var _a;
    const registry = new AgentHostPromptRegistry();
    registry.registerPrompt((_a = class {
      resolveSectionOverrides(_model, ctx) {
        return ctx.getSetting(CopilotCliConfigKey.Opus48Prompt) === true ? { tone: { action: "append", content: "GATED" } } : void 0;
      }
    }, _a.familyPrefixes = ["claude"], _a));
    assert.deepStrictEqual(
      registry.resolveSystemMessageConfig({ id: "claude-x" }, context({ [CopilotCliConfigKey.Opus48Prompt]: true })),
      withFileLinkInstructions({ mode: "customize", sections: { tone: { action: "append", content: "GATED" } } })
    );
    assert.deepStrictEqual(
      registry.resolveSystemMessageConfig({ id: "claude-x" }, context()),
      withFileLinkInstructions(COPILOT_AGENT_HOST_SYSTEM_MESSAGE)
    );
  });
  suite("Opus contributor (registered via allPrompts)", () => {
    const opusModel = { id: "claude-opus-4-8" };
    function resolveOpus(enabled) {
      return agentHostPromptRegistry.resolveSystemMessageConfig(opusModel, context(enabled === void 0 ? {} : { [CopilotCliConfigKey.Opus48Prompt]: enabled }));
    }
    test("applies customize overrides only when enabled", () => {
      assert.deepStrictEqual(resolveOpus(void 0), withFileLinkInstructions(COPILOT_AGENT_HOST_SYSTEM_MESSAGE));
      assert.deepStrictEqual(resolveOpus(false), withFileLinkInstructions(COPILOT_AGENT_HOST_SYSTEM_MESSAGE));
      assert.strictEqual(resolveOpus(true).mode, "customize");
    });
  });
  suite("model capability overrides (family alias)", () => {
    test("an aliased preview model routes to the family contributor", () => {
      const overrides = { "preview-model-x": { family: "claude-opus-4-8" } };
      const result = agentHostPromptRegistry.resolveSystemMessageConfig(
        applyModelFamilyAlias({ id: "preview-model-x" }, overrides),
        context({ [CopilotCliConfigKey.Opus48Prompt]: true })
      );
      assert.strictEqual(result.mode, "customize");
    });
  });
  suite("workspace-less scratch/repoless wiring", () => {
    test("appends the scratch instructions to the default config for a workspace-less chat", () => {
      const registry = new AgentHostPromptRegistry();
      assert.deepStrictEqual(
        registry.resolveSystemMessageConfig(void 0, context({}, [], true)),
        {
          mode: "customize",
          sections: COPILOT_AGENT_HOST_SYSTEM_MESSAGE.sections,
          content: `${COPILOT_AGENT_HOST_WORKSPACELESS_INSTRUCTIONS}

${COPILOT_AGENT_HOST_FILE_LINK_INSTRUCTIONS}`
        }
      );
    });
    test("is a no-op for a workspace-bound session", () => {
      const registry = new AgentHostPromptRegistry();
      assert.deepStrictEqual(
        registry.resolveSystemMessageConfig(void 0, context({}, [], false)),
        withFileLinkInstructions(COPILOT_AGENT_HOST_SYSTEM_MESSAGE)
      );
    });
    test("composes with per-model customize content for a workspace-less chat", () => {
      var _a;
      const registry = new AgentHostPromptRegistry();
      registry.registerPrompt((_a = class {
        resolveSectionOverrides() {
          return { guidelines: { action: "append", content: "Be concise." } };
        }
      }, _a.familyPrefixes = ["claude"], _a));
      assert.deepStrictEqual(
        registry.resolveSystemMessageConfig({ id: "claude-sonnet" }, context({}, [], true)),
        {
          mode: "customize",
          sections: { guidelines: { action: "append", content: "Be concise." } },
          content: `${COPILOT_AGENT_HOST_WORKSPACELESS_INSTRUCTIONS}

${COPILOT_AGENT_HOST_FILE_LINK_INSTRUCTIONS}`
        }
      );
    });
    test("does not append scratch instructions to a full replace prompt", () => {
      var _a;
      const registry = new AgentHostPromptRegistry();
      registry.registerPrompt((_a = class {
        resolveFullSystemPrompt() {
          return "FULL PROMPT";
        }
      }, _a.familyPrefixes = ["gpt-5"], _a));
      assert.deepStrictEqual(
        registry.resolveSystemMessageConfig({ id: "gpt-5-mini" }, context({}, [], true)),
        { mode: "replace", content: "FULL PROMPT" }
      );
    });
  });
  suite("universal tool instructions wiring", () => {
    const BROWSER_LINE = "Use the browser tools (openBrowserPage, readPage, etc.) when beneficial for front-end tasks, such as when visualizing or validating UI changes.";
    const browserTools = [BrowserChatToolReferenceName.OpenBrowserPage, BrowserChatToolReferenceName.ReadPage];
    test("is a no-op when the session exposes no matching tools", () => {
      const registry = new AgentHostPromptRegistry();
      assert.deepStrictEqual(registry.resolveSystemMessageConfig({ id: "m" }, context({}, ["anyTool"])), withFileLinkInstructions(COPILOT_AGENT_HOST_SYSTEM_MESSAGE));
    });
    test("layers the browser tool_instructions onto the default config when browser tools are present", () => {
      const registry = new AgentHostPromptRegistry();
      assert.deepStrictEqual(
        registry.resolveSystemMessageConfig({ id: "m" }, context({}, browserTools)),
        withFileLinkInstructions({
          mode: "customize",
          sections: {
            identity: COPILOT_AGENT_HOST_SYSTEM_MESSAGE.sections.identity,
            tool_instructions: { action: "append", content: `
${BROWSER_LINE}` }
          }
        })
      );
    });
    test("composes the browser line with a per-model tool_instructions override", () => {
      var _a;
      const registry = new AgentHostPromptRegistry();
      registry.registerPrompt((_a = class {
        resolveSectionOverrides() {
          return { tool_instructions: { action: "append", content: "Always prefer ripgrep." } };
        }
      }, _a.familyPrefixes = ["claude"], _a));
      assert.deepStrictEqual(
        registry.resolveSystemMessageConfig({ id: "claude-x" }, context({}, browserTools)),
        withFileLinkInstructions({ mode: "customize", sections: { tool_instructions: { action: "append", content: `
Always prefer ripgrep.
${BROWSER_LINE}` } } })
      );
    });
    test("leaves a per-model tool_instructions override untouched when no browser tools are present", () => {
      var _a;
      const registry = new AgentHostPromptRegistry();
      registry.registerPrompt((_a = class {
        resolveSectionOverrides() {
          return { tool_instructions: { action: "append", content: "Always prefer ripgrep." } };
        }
      }, _a.familyPrefixes = ["claude"], _a));
      assert.deepStrictEqual(
        registry.resolveSystemMessageConfig({ id: "claude-x" }, context({}, ["anyTool"])),
        withFileLinkInstructions({ mode: "customize", sections: { tool_instructions: { action: "append", content: "Always prefer ripgrep." } } })
      );
    });
  });
  suite("tool search instructions wiring", () => {
    const TOOL_SEARCH_LINE = `Most tools are deferred and hidden until you search for them. Before calling a tool that has not already been loaded, ALWAYS use tool search first with a short description of the capability you need, then call the specific tool it returns; tools it returns are immediately available and must not be searched for again.`;
    test("layers the tool-search line onto the default config when active and the tool-search tool is present", () => {
      const registry = new AgentHostPromptRegistry();
      assert.deepStrictEqual(
        registry.resolveSystemMessageConfig({ id: "m" }, context({}, [CLIENT_TOOL_SEARCH_REFERENCE_NAME], false, true)),
        withFileLinkInstructions({
          mode: "customize",
          sections: {
            identity: COPILOT_AGENT_HOST_SYSTEM_MESSAGE.sections.identity,
            tool_instructions: { action: "append", content: `
${TOOL_SEARCH_LINE}` }
          }
        })
      );
    });
    test("is a no-op when tool search is inactive even if the tool-search tool is present", () => {
      const registry = new AgentHostPromptRegistry();
      assert.deepStrictEqual(
        registry.resolveSystemMessageConfig({ id: "m" }, context({}, [CLIENT_TOOL_SEARCH_REFERENCE_NAME], false, false)),
        withFileLinkInstructions(COPILOT_AGENT_HOST_SYSTEM_MESSAGE)
      );
    });
    test("is a no-op when active but the client does not expose the tool-search tool", () => {
      const registry = new AgentHostPromptRegistry();
      assert.deepStrictEqual(
        registry.resolveSystemMessageConfig({ id: "m" }, context({}, ["anyTool"], false, true)),
        withFileLinkInstructions(COPILOT_AGENT_HOST_SYSTEM_MESSAGE)
      );
    });
    test("composes the tool-search line with a per-model tool_instructions override", () => {
      var _a;
      const registry = new AgentHostPromptRegistry();
      registry.registerPrompt((_a = class {
        resolveSectionOverrides() {
          return { tool_instructions: { action: "append", content: "Always prefer ripgrep." } };
        }
      }, _a.familyPrefixes = ["claude"], _a));
      assert.deepStrictEqual(
        registry.resolveSystemMessageConfig({ id: "claude-x" }, context({}, [CLIENT_TOOL_SEARCH_REFERENCE_NAME], false, true)),
        withFileLinkInstructions({ mode: "customize", sections: { tool_instructions: { action: "append", content: `
Always prefer ripgrep.
${TOOL_SEARCH_LINE}` } } })
      );
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvYWdlbnRIb3N0UHJvbXB0UmVnaXN0cnkudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB0eXBlIHsgU2VjdGlvbk92ZXJyaWRlLCBTeXN0ZW1NZXNzYWdlQ29uZmlnLCBTeXN0ZW1NZXNzYWdlU2VjdGlvbiB9IGZyb20gJ0BnaXRodWIvY29waWxvdC1zZGsnO1xuaW1wb3J0IHsgQ29waWxvdENsaUNvbmZpZ0tleSwgYXBwbHlNb2RlbEZhbWlseUFsaWFzLCBjb3BpbG90Q2xpQ29uZmlnU2NoZW1hIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvcGlsb3RDbGlDb25maWcuanMnO1xuaW1wb3J0IHR5cGUgeyBTY2hlbWFWYWx1ZXMgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0U2NoZW1hLmpzJztcbmltcG9ydCB0eXBlIHsgTW9kZWxTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0UHJvbXB0UmVnaXN0cnksIGFnZW50SG9zdFByb21wdFJlZ2lzdHJ5LCB0eXBlIElBZ2VudEhvc3RQcm9tcHRDb250ZXh0IH0gZnJvbSAnLi4vLi4vbm9kZS9jb3BpbG90L3Byb21wdHMvcHJvbXB0UmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQ09QSUxPVF9BR0VOVF9IT1NUX0ZJTEVfTElOS19JTlNUUlVDVElPTlMsIENPUElMT1RfQUdFTlRfSE9TVF9XT1JLU1BBQ0VMRVNTX0lOU1RSVUNUSU9OUywgQ09QSUxPVF9BR0VOVF9IT1NUX1NZU1RFTV9NRVNTQUdFIH0gZnJvbSAnLi4vLi4vbm9kZS9jb3BpbG90L3Byb21wdHMvc3lzdGVtTWVzc2FnZS5qcyc7XG5pbXBvcnQgeyBCcm93c2VyQ2hhdFRvb2xSZWZlcmVuY2VOYW1lIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3NlclZpZXcvY29tbW9uL2Jyb3dzZXJDaGF0VG9vbFJlZmVyZW5jZU5hbWVzLmpzJztcbmltcG9ydCB7IENMSUVOVF9UT09MX1NFQVJDSF9SRUZFUkVOQ0VfTkFNRSB9IGZyb20gJy4uLy4uL2NvbW1vbi90b29sU2VhcmNoQ29uc3RhbnRzLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0ICcuLi8uLi9ub2RlL2NvcGlsb3QvcHJvbXB0cy9hbGxQcm9tcHRzLmpzJztcblxuLyoqXG4gKiBCdWlsZHMgYSBwcm9tcHQgY29udGV4dCBiYWNrZWQgYnkgYW4gaW4tbWVtb3J5IGJhZyBvZiBjdXN0b21pemF0aW9uIHNldHRpbmdzXG4gKiBhbmQgYW4gb3B0aW9uYWwgc2V0IG9mIGF2YWlsYWJsZSB0b29sIG5hbWVzLlxuICovXG5mdW5jdGlvbiBjb250ZXh0KHNldHRpbmdzOiBTY2hlbWFWYWx1ZXM8dHlwZW9mIGNvcGlsb3RDbGlDb25maWdTY2hlbWEuZGVmaW5pdGlvbj4gPSB7fSwgdG9vbHM6IHJlYWRvbmx5IHN0cmluZ1tdID0gW10sIHdvcmtzcGFjZWxlc3MgPSBmYWxzZSwgdG9vbFNlYXJjaEFjdGl2ZSA9IGZhbHNlKTogSUFnZW50SG9zdFByb21wdENvbnRleHQge1xuXHRjb25zdCB0b29sTmFtZXMgPSBuZXcgU2V0KHRvb2xzKTtcblx0cmV0dXJuIHtcblx0XHRnZXRTZXR0aW5nOiBrZXkgPT4gc2V0dGluZ3Nba2V5XSxcblx0XHRoYXNDbGllbnRUb29sOiBuYW1lID0+IHRvb2xOYW1lcy5oYXMobmFtZSksXG5cdFx0d29ya3NwYWNlbGVzcyxcblx0XHR0b29sU2VhcmNoQWN0aXZlLFxuXHR9O1xufVxuXG5zdWl0ZSgnQWdlbnRIb3N0UHJvbXB0UmVnaXN0cnknLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3Qgd2l0aEZpbGVMaW5rSW5zdHJ1Y3Rpb25zID0gKGNvbmZpZzogU3lzdGVtTWVzc2FnZUNvbmZpZyk6IFN5c3RlbU1lc3NhZ2VDb25maWcgPT4gKHtcblx0XHQuLi5jb25maWcsXG5cdFx0Y29udGVudDogY29uZmlnLmNvbnRlbnQgPyBgJHtjb25maWcuY29udGVudH1cXG5cXG4ke0NPUElMT1RfQUdFTlRfSE9TVF9GSUxFX0xJTktfSU5TVFJVQ1RJT05TfWAgOiBDT1BJTE9UX0FHRU5UX0hPU1RfRklMRV9MSU5LX0lOU1RSVUNUSU9OUyxcblx0fSk7XG5cblx0dGVzdCgnZmFsbHMgYmFjayB0byB0aGUgZGVmYXVsdCBzeXN0ZW0gbWVzc2FnZSB3aGVuIG5vIG1vZGVsIGlzIHByb3ZpZGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IEFnZW50SG9zdFByb21wdFJlZ2lzdHJ5KCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWdpc3RyeS5yZXNvbHZlU3lzdGVtTWVzc2FnZUNvbmZpZyh1bmRlZmluZWQsIGNvbnRleHQoKSksIHdpdGhGaWxlTGlua0luc3RydWN0aW9ucyhDT1BJTE9UX0FHRU5UX0hPU1RfU1lTVEVNX01FU1NBR0UpKTtcblx0fSk7XG5cblx0dGVzdCgnZmFsbHMgYmFjayB0byB0aGUgZGVmYXVsdCB3aGVuIG5vIGNvbnRyaWJ1dG9yIG1hdGNoZXMgdGhlIG1vZGVsJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IEFnZW50SG9zdFByb21wdFJlZ2lzdHJ5KCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWdpc3RyeS5yZXNvbHZlU3lzdGVtTWVzc2FnZUNvbmZpZyh7IGlkOiAndW5rbm93bi1tb2RlbCcgfSwgY29udGV4dCgpKSwgd2l0aEZpbGVMaW5rSW5zdHJ1Y3Rpb25zKENPUElMT1RfQUdFTlRfSE9TVF9TWVNURU1fTUVTU0FHRSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdhIGNvbnRyaWJ1dG9yIGNhbiBmdWxseSByZXBsYWNlIHRoZSBzeXN0ZW0gcHJvbXB0IChyZXBsYWNlIG1vZGUpJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IEFnZW50SG9zdFByb21wdFJlZ2lzdHJ5KCk7XG5cdFx0cmVnaXN0cnkucmVnaXN0ZXJQcm9tcHQoY2xhc3Mge1xuXHRcdFx0c3RhdGljIHJlYWRvbmx5IGZhbWlseVByZWZpeGVzID0gWydncHQtNSddO1xuXHRcdFx0cmVzb2x2ZUZ1bGxTeXN0ZW1Qcm9tcHQoKTogc3RyaW5nIHtcblx0XHRcdFx0cmV0dXJuICdGVUxMIFBST01QVCc7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHJlZ2lzdHJ5LnJlc29sdmVTeXN0ZW1NZXNzYWdlQ29uZmlnKHsgaWQ6ICdncHQtNS1taW5pJyB9LCBjb250ZXh0KCkpLFxuXHRcdFx0eyBtb2RlOiAncmVwbGFjZScsIGNvbnRlbnQ6ICdGVUxMIFBST01QVCcgfVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2EgY29udHJpYnV0b3IgY2FuIG92ZXJyaWRlIGluZGl2aWR1YWwgc2VjdGlvbnMgKGN1c3RvbWl6ZSBtb2RlKScsICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBBZ2VudEhvc3RQcm9tcHRSZWdpc3RyeSgpO1xuXHRcdHJlZ2lzdHJ5LnJlZ2lzdGVyUHJvbXB0KGNsYXNzIHtcblx0XHRcdHN0YXRpYyByZWFkb25seSBmYW1pbHlQcmVmaXhlcyA9IFsnY2xhdWRlJ107XG5cdFx0XHRyZXNvbHZlU2VjdGlvbk92ZXJyaWRlcygpOiBQYXJ0aWFsPFJlY29yZDxTeXN0ZW1NZXNzYWdlU2VjdGlvbiwgU2VjdGlvbk92ZXJyaWRlPj4ge1xuXHRcdFx0XHRyZXR1cm4geyBndWlkZWxpbmVzOiB7IGFjdGlvbjogJ2FwcGVuZCcsIGNvbnRlbnQ6ICdCZSBjb25jaXNlLicgfSB9O1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRyZWdpc3RyeS5yZXNvbHZlU3lzdGVtTWVzc2FnZUNvbmZpZyh7IGlkOiAnY2xhdWRlLXNvbm5ldCcgfSwgY29udGV4dCgpKSxcblx0XHRcdHdpdGhGaWxlTGlua0luc3RydWN0aW9ucyh7IG1vZGU6ICdjdXN0b21pemUnLCBzZWN0aW9uczogeyBndWlkZWxpbmVzOiB7IGFjdGlvbjogJ2FwcGVuZCcsIGNvbnRlbnQ6ICdCZSBjb25jaXNlLicgfSB9IH0pXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgndHJlYXRzIGVtcHR5IHNlY3Rpb24gb3ZlcnJpZGVzIGFzIG5vIG92ZXJyaWRlIChmYWxscyBiYWNrIHRvIGRlZmF1bHQpJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IEFnZW50SG9zdFByb21wdFJlZ2lzdHJ5KCk7XG5cdFx0cmVnaXN0cnkucmVnaXN0ZXJQcm9tcHQoY2xhc3Mge1xuXHRcdFx0c3RhdGljIHJlYWRvbmx5IGZhbWlseVByZWZpeGVzID0gWydjbGF1ZGUnXTtcblx0XHRcdHJlc29sdmVTZWN0aW9uT3ZlcnJpZGVzKCk6IFBhcnRpYWw8UmVjb3JkPFN5c3RlbU1lc3NhZ2VTZWN0aW9uLCBTZWN0aW9uT3ZlcnJpZGU+PiB7XG5cdFx0XHRcdHJldHVybiB7fTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0cmVnaXN0cnkucmVzb2x2ZVN5c3RlbU1lc3NhZ2VDb25maWcoeyBpZDogJ2NsYXVkZS1zb25uZXQnIH0sIGNvbnRleHQoKSksXG5cdFx0XHR3aXRoRmlsZUxpbmtJbnN0cnVjdGlvbnMoQ09QSUxPVF9BR0VOVF9IT1NUX1NZU1RFTV9NRVNTQUdFKVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hdGNoZXNNb2RlbCB0YWtlcyBwcmVjZWRlbmNlIG92ZXIgZmFtaWx5IHByZWZpeGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IEFnZW50SG9zdFByb21wdFJlZ2lzdHJ5KCk7XG5cdFx0cmVnaXN0cnkucmVnaXN0ZXJQcm9tcHQoY2xhc3Mge1xuXHRcdFx0c3RhdGljIHJlYWRvbmx5IGZhbWlseVByZWZpeGVzOiByZWFkb25seSBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0c3RhdGljIG1hdGNoZXNNb2RlbChtb2RlbDogTW9kZWxTZWxlY3Rpb24pOiBib29sZWFuIHtcblx0XHRcdFx0cmV0dXJuIG1vZGVsLmlkLmluY2x1ZGVzKCdjb2RleCcpO1xuXHRcdFx0fVxuXHRcdFx0cmVzb2x2ZUZ1bGxTeXN0ZW1Qcm9tcHQoKTogc3RyaW5nIHtcblx0XHRcdFx0cmV0dXJuICdDT0RFWCc7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHJlZ2lzdHJ5LnJlc29sdmVTeXN0ZW1NZXNzYWdlQ29uZmlnKHsgaWQ6ICdncHQtNS1jb2RleCcgfSwgY29udGV4dCgpKSxcblx0XHRcdHsgbW9kZTogJ3JlcGxhY2UnLCBjb250ZW50OiAnQ09ERVgnIH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb250cmlidXRvcnMgZ2F0ZSBvbiB0aGUgcHJvbXB0IGNvbnRleHQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSBuZXcgQWdlbnRIb3N0UHJvbXB0UmVnaXN0cnkoKTtcblx0XHRyZWdpc3RyeS5yZWdpc3RlclByb21wdChjbGFzcyB7XG5cdFx0XHRzdGF0aWMgcmVhZG9ubHkgZmFtaWx5UHJlZml4ZXMgPSBbJ2NsYXVkZSddO1xuXHRcdFx0cmVzb2x2ZVNlY3Rpb25PdmVycmlkZXMoX21vZGVsOiBNb2RlbFNlbGVjdGlvbiwgY3R4OiBJQWdlbnRIb3N0UHJvbXB0Q29udGV4dCk6IFBhcnRpYWw8UmVjb3JkPFN5c3RlbU1lc3NhZ2VTZWN0aW9uLCBTZWN0aW9uT3ZlcnJpZGU+PiB8IHVuZGVmaW5lZCB7XG5cdFx0XHRcdHJldHVybiBjdHguZ2V0U2V0dGluZyhDb3BpbG90Q2xpQ29uZmlnS2V5Lk9wdXM0OFByb21wdCkgPT09IHRydWUgPyB7IHRvbmU6IHsgYWN0aW9uOiAnYXBwZW5kJywgY29udGVudDogJ0dBVEVEJyB9IH0gOiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHJlZ2lzdHJ5LnJlc29sdmVTeXN0ZW1NZXNzYWdlQ29uZmlnKHsgaWQ6ICdjbGF1ZGUteCcgfSwgY29udGV4dCh7IFtDb3BpbG90Q2xpQ29uZmlnS2V5Lk9wdXM0OFByb21wdF06IHRydWUgfSkpLFxuXHRcdFx0d2l0aEZpbGVMaW5rSW5zdHJ1Y3Rpb25zKHsgbW9kZTogJ2N1c3RvbWl6ZScsIHNlY3Rpb25zOiB7IHRvbmU6IHsgYWN0aW9uOiAnYXBwZW5kJywgY29udGVudDogJ0dBVEVEJyB9IH0gfSlcblx0XHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRyZWdpc3RyeS5yZXNvbHZlU3lzdGVtTWVzc2FnZUNvbmZpZyh7IGlkOiAnY2xhdWRlLXgnIH0sIGNvbnRleHQoKSksXG5cdFx0XHR3aXRoRmlsZUxpbmtJbnN0cnVjdGlvbnMoQ09QSUxPVF9BR0VOVF9IT1NUX1NZU1RFTV9NRVNTQUdFKVxuXHRcdCk7XG5cdH0pO1xuXG5cdHN1aXRlKCdPcHVzIGNvbnRyaWJ1dG9yIChyZWdpc3RlcmVkIHZpYSBhbGxQcm9tcHRzKScsICgpID0+IHtcblx0XHRjb25zdCBvcHVzTW9kZWw6IE1vZGVsU2VsZWN0aW9uID0geyBpZDogJ2NsYXVkZS1vcHVzLTQtOCcgfTtcblxuXHRcdGZ1bmN0aW9uIHJlc29sdmVPcHVzKGVuYWJsZWQ6IGJvb2xlYW4gfCB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiBhZ2VudEhvc3RQcm9tcHRSZWdpc3RyeS5yZXNvbHZlU3lzdGVtTWVzc2FnZUNvbmZpZyhvcHVzTW9kZWwsIGNvbnRleHQoZW5hYmxlZCA9PT0gdW5kZWZpbmVkID8ge30gOiB7IFtDb3BpbG90Q2xpQ29uZmlnS2V5Lk9wdXM0OFByb21wdF06IGVuYWJsZWQgfSkpO1xuXHRcdH1cblxuXHRcdHRlc3QoJ2FwcGxpZXMgY3VzdG9taXplIG92ZXJyaWRlcyBvbmx5IHdoZW4gZW5hYmxlZCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzb2x2ZU9wdXModW5kZWZpbmVkKSwgd2l0aEZpbGVMaW5rSW5zdHJ1Y3Rpb25zKENPUElMT1RfQUdFTlRfSE9TVF9TWVNURU1fTUVTU0FHRSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXNvbHZlT3B1cyhmYWxzZSksIHdpdGhGaWxlTGlua0luc3RydWN0aW9ucyhDT1BJTE9UX0FHRU5UX0hPU1RfU1lTVEVNX01FU1NBR0UpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlT3B1cyh0cnVlKS5tb2RlLCAnY3VzdG9taXplJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdtb2RlbCBjYXBhYmlsaXR5IG92ZXJyaWRlcyAoZmFtaWx5IGFsaWFzKScsICgpID0+IHtcblx0XHQvLyBUaGUgbGF1bmNoZXIgY29tcG9zZXMgYGFwcGx5TW9kZWxGYW1pbHlBbGlhc2Agd2l0aCB0aGUgcmVnaXN0cnkgKHNlZVxuXHRcdC8vIGBfYnVpbGRTZXNzaW9uQ29uZmlnYCk7IHRoaXMgZ3VhcmRzIHRoYXQgY29tcG9zaXRpb24gZW5kLXRvLWVuZCB1c2luZ1xuXHRcdC8vIHRoZSByZWFsIE9wdXMgY29udHJpYnV0b3IsIHdob3NlIGN1c3RvbSBgbWF0Y2hlc01vZGVsYCBjaGVja3MgdGhlIGlkLlxuXHRcdC8vIFRoZSBhbGlhcyBoZWxwZXIncyBvd24gYmVoYXZpb3IgaXMgY292ZXJlZCBpbiBjb3BpbG90Q2xpQ29uZmlnLnRlc3QudHMuXG5cdFx0dGVzdCgnYW4gYWxpYXNlZCBwcmV2aWV3IG1vZGVsIHJvdXRlcyB0byB0aGUgZmFtaWx5IGNvbnRyaWJ1dG9yJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgb3ZlcnJpZGVzID0geyAncHJldmlldy1tb2RlbC14JzogeyBmYW1pbHk6ICdjbGF1ZGUtb3B1cy00LTgnIH0gfTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFnZW50SG9zdFByb21wdFJlZ2lzdHJ5LnJlc29sdmVTeXN0ZW1NZXNzYWdlQ29uZmlnKFxuXHRcdFx0XHRhcHBseU1vZGVsRmFtaWx5QWxpYXMoeyBpZDogJ3ByZXZpZXctbW9kZWwteCcgfSwgb3ZlcnJpZGVzKSxcblx0XHRcdFx0Y29udGV4dCh7IFtDb3BpbG90Q2xpQ29uZmlnS2V5Lk9wdXM0OFByb21wdF06IHRydWUgfSlcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1vZGUsICdjdXN0b21pemUnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3dvcmtzcGFjZS1sZXNzIHNjcmF0Y2gvcmVwb2xlc3Mgd2lyaW5nJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2FwcGVuZHMgdGhlIHNjcmF0Y2ggaW5zdHJ1Y3Rpb25zIHRvIHRoZSBkZWZhdWx0IGNvbmZpZyBmb3IgYSB3b3Jrc3BhY2UtbGVzcyBjaGF0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVnaXN0cnkgPSBuZXcgQWdlbnRIb3N0UHJvbXB0UmVnaXN0cnkoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHJlZ2lzdHJ5LnJlc29sdmVTeXN0ZW1NZXNzYWdlQ29uZmlnKHVuZGVmaW5lZCwgY29udGV4dCh7fSwgW10sIHRydWUpKSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG1vZGU6ICdjdXN0b21pemUnLFxuXHRcdFx0XHRcdHNlY3Rpb25zOiBDT1BJTE9UX0FHRU5UX0hPU1RfU1lTVEVNX01FU1NBR0Uuc2VjdGlvbnMsXG5cdFx0XHRcdFx0Y29udGVudDogYCR7Q09QSUxPVF9BR0VOVF9IT1NUX1dPUktTUEFDRUxFU1NfSU5TVFJVQ1RJT05TfVxcblxcbiR7Q09QSUxPVF9BR0VOVF9IT1NUX0ZJTEVfTElOS19JTlNUUlVDVElPTlN9YCxcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2lzIGEgbm8tb3AgZm9yIGEgd29ya3NwYWNlLWJvdW5kIHNlc3Npb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBBZ2VudEhvc3RQcm9tcHRSZWdpc3RyeSgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0cmVnaXN0cnkucmVzb2x2ZVN5c3RlbU1lc3NhZ2VDb25maWcodW5kZWZpbmVkLCBjb250ZXh0KHt9LCBbXSwgZmFsc2UpKSxcblx0XHRcdFx0d2l0aEZpbGVMaW5rSW5zdHJ1Y3Rpb25zKENPUElMT1RfQUdFTlRfSE9TVF9TWVNURU1fTUVTU0FHRSlcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb21wb3NlcyB3aXRoIHBlci1tb2RlbCBjdXN0b21pemUgY29udGVudCBmb3IgYSB3b3Jrc3BhY2UtbGVzcyBjaGF0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVnaXN0cnkgPSBuZXcgQWdlbnRIb3N0UHJvbXB0UmVnaXN0cnkoKTtcblx0XHRcdHJlZ2lzdHJ5LnJlZ2lzdGVyUHJvbXB0KGNsYXNzIHtcblx0XHRcdFx0c3RhdGljIHJlYWRvbmx5IGZhbWlseVByZWZpeGVzID0gWydjbGF1ZGUnXTtcblx0XHRcdFx0cmVzb2x2ZVNlY3Rpb25PdmVycmlkZXMoKTogUGFydGlhbDxSZWNvcmQ8U3lzdGVtTWVzc2FnZVNlY3Rpb24sIFNlY3Rpb25PdmVycmlkZT4+IHtcblx0XHRcdFx0XHRyZXR1cm4geyBndWlkZWxpbmVzOiB7IGFjdGlvbjogJ2FwcGVuZCcsIGNvbnRlbnQ6ICdCZSBjb25jaXNlLicgfSB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHJlZ2lzdHJ5LnJlc29sdmVTeXN0ZW1NZXNzYWdlQ29uZmlnKHsgaWQ6ICdjbGF1ZGUtc29ubmV0JyB9LCBjb250ZXh0KHt9LCBbXSwgdHJ1ZSkpLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bW9kZTogJ2N1c3RvbWl6ZScsXG5cdFx0XHRcdFx0c2VjdGlvbnM6IHsgZ3VpZGVsaW5lczogeyBhY3Rpb246ICdhcHBlbmQnLCBjb250ZW50OiAnQmUgY29uY2lzZS4nIH0gfSxcblx0XHRcdFx0XHRjb250ZW50OiBgJHtDT1BJTE9UX0FHRU5UX0hPU1RfV09SS1NQQUNFTEVTU19JTlNUUlVDVElPTlN9XFxuXFxuJHtDT1BJTE9UX0FHRU5UX0hPU1RfRklMRV9MSU5LX0lOU1RSVUNUSU9OU31gLFxuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgYXBwZW5kIHNjcmF0Y2ggaW5zdHJ1Y3Rpb25zIHRvIGEgZnVsbCByZXBsYWNlIHByb21wdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IEFnZW50SG9zdFByb21wdFJlZ2lzdHJ5KCk7XG5cdFx0XHRyZWdpc3RyeS5yZWdpc3RlclByb21wdChjbGFzcyB7XG5cdFx0XHRcdHN0YXRpYyByZWFkb25seSBmYW1pbHlQcmVmaXhlcyA9IFsnZ3B0LTUnXTtcblx0XHRcdFx0cmVzb2x2ZUZ1bGxTeXN0ZW1Qcm9tcHQoKTogc3RyaW5nIHtcblx0XHRcdFx0XHRyZXR1cm4gJ0ZVTEwgUFJPTVBUJztcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRyZWdpc3RyeS5yZXNvbHZlU3lzdGVtTWVzc2FnZUNvbmZpZyh7IGlkOiAnZ3B0LTUtbWluaScgfSwgY29udGV4dCh7fSwgW10sIHRydWUpKSxcblx0XHRcdFx0eyBtb2RlOiAncmVwbGFjZScsIGNvbnRlbnQ6ICdGVUxMIFBST01QVCcgfVxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3VuaXZlcnNhbCB0b29sIGluc3RydWN0aW9ucyB3aXJpbmcnLCAoKSA9PiB7XG5cdFx0Ly8gVGhlIGJyb3dzZXIgbGluZSBpcyB0aGUgcmVnaXN0ZXJlZCB1bml2ZXJzYWwgdG9vbC1pbnN0cnVjdGlvbiAoc2VlXG5cdFx0Ly8gdG9vbEluc3RydWN0aW9ucy50cykuIFRoZXNlIGd1YXJkIHRoYXQgdGhlIHJlZ2lzdHJ5IGxheWVycyBpdCBlbmQtdG8tZW5kO1xuXHRcdC8vIHRoZSBjb21wb3NpdGlvbi9nYXRpbmcgaXRzZWxmIGlzIGNvdmVyZWQgaW4gdG9vbEluc3RydWN0aW9ucy50ZXN0LnRzLlxuXHRcdGNvbnN0IEJST1dTRVJfTElORSA9ICdVc2UgdGhlIGJyb3dzZXIgdG9vbHMgKG9wZW5Ccm93c2VyUGFnZSwgcmVhZFBhZ2UsIGV0Yy4pIHdoZW4gYmVuZWZpY2lhbCBmb3IgZnJvbnQtZW5kIHRhc2tzLCBzdWNoIGFzIHdoZW4gdmlzdWFsaXppbmcgb3IgdmFsaWRhdGluZyBVSSBjaGFuZ2VzLic7XG5cdFx0Y29uc3QgYnJvd3NlclRvb2xzID0gW0Jyb3dzZXJDaGF0VG9vbFJlZmVyZW5jZU5hbWUuT3BlbkJyb3dzZXJQYWdlLCBCcm93c2VyQ2hhdFRvb2xSZWZlcmVuY2VOYW1lLlJlYWRQYWdlXTtcblxuXHRcdHRlc3QoJ2lzIGEgbm8tb3Agd2hlbiB0aGUgc2Vzc2lvbiBleHBvc2VzIG5vIG1hdGNoaW5nIHRvb2xzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVnaXN0cnkgPSBuZXcgQWdlbnRIb3N0UHJvbXB0UmVnaXN0cnkoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVnaXN0cnkucmVzb2x2ZVN5c3RlbU1lc3NhZ2VDb25maWcoeyBpZDogJ20nIH0sIGNvbnRleHQoe30sIFsnYW55VG9vbCddKSksIHdpdGhGaWxlTGlua0luc3RydWN0aW9ucyhDT1BJTE9UX0FHRU5UX0hPU1RfU1lTVEVNX01FU1NBR0UpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2xheWVycyB0aGUgYnJvd3NlciB0b29sX2luc3RydWN0aW9ucyBvbnRvIHRoZSBkZWZhdWx0IGNvbmZpZyB3aGVuIGJyb3dzZXIgdG9vbHMgYXJlIHByZXNlbnQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBBZ2VudEhvc3RQcm9tcHRSZWdpc3RyeSgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0cmVnaXN0cnkucmVzb2x2ZVN5c3RlbU1lc3NhZ2VDb25maWcoeyBpZDogJ20nIH0sIGNvbnRleHQoe30sIGJyb3dzZXJUb29scykpLFxuXHRcdFx0XHR3aXRoRmlsZUxpbmtJbnN0cnVjdGlvbnMoe1xuXHRcdFx0XHRcdG1vZGU6ICdjdXN0b21pemUnLFxuXHRcdFx0XHRcdHNlY3Rpb25zOiB7XG5cdFx0XHRcdFx0XHRpZGVudGl0eTogQ09QSUxPVF9BR0VOVF9IT1NUX1NZU1RFTV9NRVNTQUdFLnNlY3Rpb25zLmlkZW50aXR5LFxuXHRcdFx0XHRcdFx0dG9vbF9pbnN0cnVjdGlvbnM6IHsgYWN0aW9uOiAnYXBwZW5kJywgY29udGVudDogYFxcbiR7QlJPV1NFUl9MSU5FfWAgfSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbXBvc2VzIHRoZSBicm93c2VyIGxpbmUgd2l0aCBhIHBlci1tb2RlbCB0b29sX2luc3RydWN0aW9ucyBvdmVycmlkZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IEFnZW50SG9zdFByb21wdFJlZ2lzdHJ5KCk7XG5cdFx0XHRyZWdpc3RyeS5yZWdpc3RlclByb21wdChjbGFzcyB7XG5cdFx0XHRcdHN0YXRpYyByZWFkb25seSBmYW1pbHlQcmVmaXhlcyA9IFsnY2xhdWRlJ107XG5cdFx0XHRcdHJlc29sdmVTZWN0aW9uT3ZlcnJpZGVzKCk6IFBhcnRpYWw8UmVjb3JkPFN5c3RlbU1lc3NhZ2VTZWN0aW9uLCBTZWN0aW9uT3ZlcnJpZGU+PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgdG9vbF9pbnN0cnVjdGlvbnM6IHsgYWN0aW9uOiAnYXBwZW5kJywgY29udGVudDogJ0Fsd2F5cyBwcmVmZXIgcmlwZ3JlcC4nIH0gfTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRyZWdpc3RyeS5yZXNvbHZlU3lzdGVtTWVzc2FnZUNvbmZpZyh7IGlkOiAnY2xhdWRlLXgnIH0sIGNvbnRleHQoe30sIGJyb3dzZXJUb29scykpLFxuXHRcdFx0XHR3aXRoRmlsZUxpbmtJbnN0cnVjdGlvbnMoeyBtb2RlOiAnY3VzdG9taXplJywgc2VjdGlvbnM6IHsgdG9vbF9pbnN0cnVjdGlvbnM6IHsgYWN0aW9uOiAnYXBwZW5kJywgY29udGVudDogYFxcbkFsd2F5cyBwcmVmZXIgcmlwZ3JlcC5cXG4ke0JST1dTRVJfTElORX1gIH0gfSB9KVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2xlYXZlcyBhIHBlci1tb2RlbCB0b29sX2luc3RydWN0aW9ucyBvdmVycmlkZSB1bnRvdWNoZWQgd2hlbiBubyBicm93c2VyIHRvb2xzIGFyZSBwcmVzZW50JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVnaXN0cnkgPSBuZXcgQWdlbnRIb3N0UHJvbXB0UmVnaXN0cnkoKTtcblx0XHRcdHJlZ2lzdHJ5LnJlZ2lzdGVyUHJvbXB0KGNsYXNzIHtcblx0XHRcdFx0c3RhdGljIHJlYWRvbmx5IGZhbWlseVByZWZpeGVzID0gWydjbGF1ZGUnXTtcblx0XHRcdFx0cmVzb2x2ZVNlY3Rpb25PdmVycmlkZXMoKTogUGFydGlhbDxSZWNvcmQ8U3lzdGVtTWVzc2FnZVNlY3Rpb24sIFNlY3Rpb25PdmVycmlkZT4+IHtcblx0XHRcdFx0XHRyZXR1cm4geyB0b29sX2luc3RydWN0aW9uczogeyBhY3Rpb246ICdhcHBlbmQnLCBjb250ZW50OiAnQWx3YXlzIHByZWZlciByaXBncmVwLicgfSB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHJlZ2lzdHJ5LnJlc29sdmVTeXN0ZW1NZXNzYWdlQ29uZmlnKHsgaWQ6ICdjbGF1ZGUteCcgfSwgY29udGV4dCh7fSwgWydhbnlUb29sJ10pKSxcblx0XHRcdFx0d2l0aEZpbGVMaW5rSW5zdHJ1Y3Rpb25zKHsgbW9kZTogJ2N1c3RvbWl6ZScsIHNlY3Rpb25zOiB7IHRvb2xfaW5zdHJ1Y3Rpb25zOiB7IGFjdGlvbjogJ2FwcGVuZCcsIGNvbnRlbnQ6ICdBbHdheXMgcHJlZmVyIHJpcGdyZXAuJyB9IH0gfSlcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCd0b29sIHNlYXJjaCBpbnN0cnVjdGlvbnMgd2lyaW5nJywgKCkgPT4ge1xuXHRcdC8vIEVuZC10by1lbmQgZ3VhcmQgdGhhdCB0aGUgcmVnaXN0cnkgbGF5ZXJzIHRoZSB0b29sLXNlYXJjaCBsaW5lIG9ubHlcblx0XHQvLyB3aGVuIGB0b29sU2VhcmNoQWN0aXZlYCBBTkQgdGhlIGNsaWVudCB0b29sLXNlYXJjaCB0b29sIGFyZSBib3RoXG5cdFx0Ly8gcHJlc2VudDsgdGhlIGNvbXBvc2l0aW9uL2dhdGluZyBpdHNlbGYgaXMgY292ZXJlZCBpblxuXHRcdC8vIHRvb2xJbnN0cnVjdGlvbnMudGVzdC50cy5cblx0XHRjb25zdCBUT09MX1NFQVJDSF9MSU5FID0gYE1vc3QgdG9vbHMgYXJlIGRlZmVycmVkIGFuZCBoaWRkZW4gdW50aWwgeW91IHNlYXJjaCBmb3IgdGhlbS4gQmVmb3JlIGNhbGxpbmcgYSB0b29sIHRoYXQgaGFzIG5vdCBhbHJlYWR5IGJlZW4gbG9hZGVkLCBBTFdBWVMgdXNlIHRvb2wgc2VhcmNoIGZpcnN0IHdpdGggYSBzaG9ydCBkZXNjcmlwdGlvbiBvZiB0aGUgY2FwYWJpbGl0eSB5b3UgbmVlZCwgdGhlbiBjYWxsIHRoZSBzcGVjaWZpYyB0b29sIGl0IHJldHVybnM7IHRvb2xzIGl0IHJldHVybnMgYXJlIGltbWVkaWF0ZWx5IGF2YWlsYWJsZSBhbmQgbXVzdCBub3QgYmUgc2VhcmNoZWQgZm9yIGFnYWluLmA7XG5cblx0XHR0ZXN0KCdsYXllcnMgdGhlIHRvb2wtc2VhcmNoIGxpbmUgb250byB0aGUgZGVmYXVsdCBjb25maWcgd2hlbiBhY3RpdmUgYW5kIHRoZSB0b29sLXNlYXJjaCB0b29sIGlzIHByZXNlbnQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBBZ2VudEhvc3RQcm9tcHRSZWdpc3RyeSgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0cmVnaXN0cnkucmVzb2x2ZVN5c3RlbU1lc3NhZ2VDb25maWcoeyBpZDogJ20nIH0sIGNvbnRleHQoe30sIFtDTElFTlRfVE9PTF9TRUFSQ0hfUkVGRVJFTkNFX05BTUVdLCBmYWxzZSwgdHJ1ZSkpLFxuXHRcdFx0XHR3aXRoRmlsZUxpbmtJbnN0cnVjdGlvbnMoe1xuXHRcdFx0XHRcdG1vZGU6ICdjdXN0b21pemUnLFxuXHRcdFx0XHRcdHNlY3Rpb25zOiB7XG5cdFx0XHRcdFx0XHRpZGVudGl0eTogQ09QSUxPVF9BR0VOVF9IT1NUX1NZU1RFTV9NRVNTQUdFLnNlY3Rpb25zLmlkZW50aXR5LFxuXHRcdFx0XHRcdFx0dG9vbF9pbnN0cnVjdGlvbnM6IHsgYWN0aW9uOiAnYXBwZW5kJywgY29udGVudDogYFxcbiR7VE9PTF9TRUFSQ0hfTElORX1gIH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSlcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpcyBhIG5vLW9wIHdoZW4gdG9vbCBzZWFyY2ggaXMgaW5hY3RpdmUgZXZlbiBpZiB0aGUgdG9vbC1zZWFyY2ggdG9vbCBpcyBwcmVzZW50JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVnaXN0cnkgPSBuZXcgQWdlbnRIb3N0UHJvbXB0UmVnaXN0cnkoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHJlZ2lzdHJ5LnJlc29sdmVTeXN0ZW1NZXNzYWdlQ29uZmlnKHsgaWQ6ICdtJyB9LCBjb250ZXh0KHt9LCBbQ0xJRU5UX1RPT0xfU0VBUkNIX1JFRkVSRU5DRV9OQU1FXSwgZmFsc2UsIGZhbHNlKSksXG5cdFx0XHRcdHdpdGhGaWxlTGlua0luc3RydWN0aW9ucyhDT1BJTE9UX0FHRU5UX0hPU1RfU1lTVEVNX01FU1NBR0UpXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaXMgYSBuby1vcCB3aGVuIGFjdGl2ZSBidXQgdGhlIGNsaWVudCBkb2VzIG5vdCBleHBvc2UgdGhlIHRvb2wtc2VhcmNoIHRvb2wnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBBZ2VudEhvc3RQcm9tcHRSZWdpc3RyeSgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0cmVnaXN0cnkucmVzb2x2ZVN5c3RlbU1lc3NhZ2VDb25maWcoeyBpZDogJ20nIH0sIGNvbnRleHQoe30sIFsnYW55VG9vbCddLCBmYWxzZSwgdHJ1ZSkpLFxuXHRcdFx0XHR3aXRoRmlsZUxpbmtJbnN0cnVjdGlvbnMoQ09QSUxPVF9BR0VOVF9IT1NUX1NZU1RFTV9NRVNTQUdFKVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbXBvc2VzIHRoZSB0b29sLXNlYXJjaCBsaW5lIHdpdGggYSBwZXItbW9kZWwgdG9vbF9pbnN0cnVjdGlvbnMgb3ZlcnJpZGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBBZ2VudEhvc3RQcm9tcHRSZWdpc3RyeSgpO1xuXHRcdFx0cmVnaXN0cnkucmVnaXN0ZXJQcm9tcHQoY2xhc3Mge1xuXHRcdFx0XHRzdGF0aWMgcmVhZG9ubHkgZmFtaWx5UHJlZml4ZXMgPSBbJ2NsYXVkZSddO1xuXHRcdFx0XHRyZXNvbHZlU2VjdGlvbk92ZXJyaWRlcygpOiBQYXJ0aWFsPFJlY29yZDxTeXN0ZW1NZXNzYWdlU2VjdGlvbiwgU2VjdGlvbk92ZXJyaWRlPj4ge1xuXHRcdFx0XHRcdHJldHVybiB7IHRvb2xfaW5zdHJ1Y3Rpb25zOiB7IGFjdGlvbjogJ2FwcGVuZCcsIGNvbnRlbnQ6ICdBbHdheXMgcHJlZmVyIHJpcGdyZXAuJyB9IH07XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0cmVnaXN0cnkucmVzb2x2ZVN5c3RlbU1lc3NhZ2VDb25maWcoeyBpZDogJ2NsYXVkZS14JyB9LCBjb250ZXh0KHt9LCBbQ0xJRU5UX1RPT0xfU0VBUkNIX1JFRkVSRU5DRV9OQU1FXSwgZmFsc2UsIHRydWUpKSxcblx0XHRcdFx0d2l0aEZpbGVMaW5rSW5zdHJ1Y3Rpb25zKHsgbW9kZTogJ2N1c3RvbWl6ZScsIHNlY3Rpb25zOiB7IHRvb2xfaW5zdHJ1Y3Rpb25zOiB7IGFjdGlvbjogJ2FwcGVuZCcsIGNvbnRlbnQ6IGBcXG5BbHdheXMgcHJlZmVyIHJpcGdyZXAuXFxuJHtUT09MX1NFQVJDSF9MSU5FfWAgfSB9IH0pXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBRW5CLFNBQVMscUJBQXFCLDZCQUFxRDtBQUduRixTQUFTLHlCQUF5QiwrQkFBNkQ7QUFDL0YsU0FBUywyQ0FBMkMsK0NBQStDLHlDQUF5QztBQUM1SSxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLHlDQUF5QztBQUNsRCxTQUFTLCtDQUErQztBQUN4RCxPQUFPO0FBTVAsU0FBUyxRQUFRLFdBQW1FLENBQUMsR0FBRyxRQUEyQixDQUFDLEdBQUcsZ0JBQWdCLE9BQU8sbUJBQW1CLE9BQWdDO0FBQ2hNLFFBQU0sWUFBWSxJQUFJLElBQUksS0FBSztBQUMvQixTQUFPO0FBQUEsSUFDTixZQUFZLFNBQU8sU0FBUyxHQUFHO0FBQUEsSUFDL0IsZUFBZSxVQUFRLFVBQVUsSUFBSSxJQUFJO0FBQUEsSUFDekM7QUFBQSxJQUNBO0FBQUEsRUFDRDtBQUNEO0FBRUEsTUFBTSwyQkFBMkIsTUFBTTtBQUV0QywwQ0FBd0M7QUFFeEMsUUFBTSwyQkFBMkIsQ0FBQyxZQUFzRDtBQUFBLElBQ3ZGLEdBQUc7QUFBQSxJQUNILFNBQVMsT0FBTyxVQUFVLEdBQUcsT0FBTyxPQUFPO0FBQUE7QUFBQSxFQUFPLHlDQUF5QyxLQUFLO0FBQUEsRUFDakc7QUFFQSxPQUFLLHNFQUFzRSxNQUFNO0FBQ2hGLFVBQU0sV0FBVyxJQUFJLHdCQUF3QjtBQUM3QyxXQUFPLGdCQUFnQixTQUFTLDJCQUEyQixRQUFXLFFBQVEsQ0FBQyxHQUFHLHlCQUF5QixpQ0FBaUMsQ0FBQztBQUFBLEVBQzlJLENBQUM7QUFFRCxPQUFLLG1FQUFtRSxNQUFNO0FBQzdFLFVBQU0sV0FBVyxJQUFJLHdCQUF3QjtBQUM3QyxXQUFPLGdCQUFnQixTQUFTLDJCQUEyQixFQUFFLElBQUksZ0JBQWdCLEdBQUcsUUFBUSxDQUFDLEdBQUcseUJBQXlCLGlDQUFpQyxDQUFDO0FBQUEsRUFDNUosQ0FBQztBQUVELE9BQUssb0VBQW9FLE1BQU07QUFsRGhGO0FBbURFLFVBQU0sV0FBVyxJQUFJLHdCQUF3QjtBQUM3QyxhQUFTLGdCQUFlLFdBQU07QUFBQSxNQUU3QiwwQkFBa0M7QUFDakMsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNELEdBTHdCLEdBQ1AsaUJBQWlCLENBQUMsT0FBTyxHQURsQixHQUt2QjtBQUNELFdBQU87QUFBQSxNQUNOLFNBQVMsMkJBQTJCLEVBQUUsSUFBSSxhQUFhLEdBQUcsUUFBUSxDQUFDO0FBQUEsTUFDbkUsRUFBRSxNQUFNLFdBQVcsU0FBUyxjQUFjO0FBQUEsSUFDM0M7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLG1FQUFtRSxNQUFNO0FBaEUvRTtBQWlFRSxVQUFNLFdBQVcsSUFBSSx3QkFBd0I7QUFDN0MsYUFBUyxnQkFBZSxXQUFNO0FBQUEsTUFFN0IsMEJBQWtGO0FBQ2pGLGVBQU8sRUFBRSxZQUFZLEVBQUUsUUFBUSxVQUFVLFNBQVMsY0FBYyxFQUFFO0FBQUEsTUFDbkU7QUFBQSxJQUNELEdBTHdCLEdBQ1AsaUJBQWlCLENBQUMsUUFBUSxHQURuQixHQUt2QjtBQUNELFdBQU87QUFBQSxNQUNOLFNBQVMsMkJBQTJCLEVBQUUsSUFBSSxnQkFBZ0IsR0FBRyxRQUFRLENBQUM7QUFBQSxNQUN0RSx5QkFBeUIsRUFBRSxNQUFNLGFBQWEsVUFBVSxFQUFFLFlBQVksRUFBRSxRQUFRLFVBQVUsU0FBUyxjQUFjLEVBQUUsRUFBRSxDQUFDO0FBQUEsSUFDdkg7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLHlFQUF5RSxNQUFNO0FBOUVyRjtBQStFRSxVQUFNLFdBQVcsSUFBSSx3QkFBd0I7QUFDN0MsYUFBUyxnQkFBZSxXQUFNO0FBQUEsTUFFN0IsMEJBQWtGO0FBQ2pGLGVBQU8sQ0FBQztBQUFBLE1BQ1Q7QUFBQSxJQUNELEdBTHdCLEdBQ1AsaUJBQWlCLENBQUMsUUFBUSxHQURuQixHQUt2QjtBQUNELFdBQU87QUFBQSxNQUNOLFNBQVMsMkJBQTJCLEVBQUUsSUFBSSxnQkFBZ0IsR0FBRyxRQUFRLENBQUM7QUFBQSxNQUN0RSx5QkFBeUIsaUNBQWlDO0FBQUEsSUFDM0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLHNEQUFzRCxNQUFNO0FBNUZsRTtBQTZGRSxVQUFNLFdBQVcsSUFBSSx3QkFBd0I7QUFDN0MsYUFBUyxnQkFBZSxXQUFNO0FBQUEsTUFFN0IsT0FBTyxhQUFhLE9BQWdDO0FBQ25ELGVBQU8sTUFBTSxHQUFHLFNBQVMsT0FBTztBQUFBLE1BQ2pDO0FBQUEsTUFDQSwwQkFBa0M7QUFDakMsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNELEdBUndCLEdBQ1AsaUJBQW9DLENBQUMsR0FEOUIsR0FRdkI7QUFDRCxXQUFPO0FBQUEsTUFDTixTQUFTLDJCQUEyQixFQUFFLElBQUksY0FBYyxHQUFHLFFBQVEsQ0FBQztBQUFBLE1BQ3BFLEVBQUUsTUFBTSxXQUFXLFNBQVMsUUFBUTtBQUFBLElBQ3JDO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSywyQ0FBMkMsTUFBTTtBQTdHdkQ7QUE4R0UsVUFBTSxXQUFXLElBQUksd0JBQXdCO0FBQzdDLGFBQVMsZ0JBQWUsV0FBTTtBQUFBLE1BRTdCLHdCQUF3QixRQUF3QixLQUFrRztBQUNqSixlQUFPLElBQUksV0FBVyxvQkFBb0IsWUFBWSxNQUFNLE9BQU8sRUFBRSxNQUFNLEVBQUUsUUFBUSxVQUFVLFNBQVMsUUFBUSxFQUFFLElBQUk7QUFBQSxNQUN2SDtBQUFBLElBQ0QsR0FMd0IsR0FDUCxpQkFBaUIsQ0FBQyxRQUFRLEdBRG5CLEdBS3ZCO0FBQ0QsV0FBTztBQUFBLE1BQ04sU0FBUywyQkFBMkIsRUFBRSxJQUFJLFdBQVcsR0FBRyxRQUFRLEVBQUUsQ0FBQyxvQkFBb0IsWUFBWSxHQUFHLEtBQUssQ0FBQyxDQUFDO0FBQUEsTUFDN0cseUJBQXlCLEVBQUUsTUFBTSxhQUFhLFVBQVUsRUFBRSxNQUFNLEVBQUUsUUFBUSxVQUFVLFNBQVMsUUFBUSxFQUFFLEVBQUUsQ0FBQztBQUFBLElBQzNHO0FBQ0EsV0FBTztBQUFBLE1BQ04sU0FBUywyQkFBMkIsRUFBRSxJQUFJLFdBQVcsR0FBRyxRQUFRLENBQUM7QUFBQSxNQUNqRSx5QkFBeUIsaUNBQWlDO0FBQUEsSUFDM0Q7QUFBQSxFQUNELENBQUM7QUFFRCxRQUFNLGdEQUFnRCxNQUFNO0FBQzNELFVBQU0sWUFBNEIsRUFBRSxJQUFJLGtCQUFrQjtBQUUxRCxhQUFTLFlBQVksU0FBOEI7QUFDbEQsYUFBTyx3QkFBd0IsMkJBQTJCLFdBQVcsUUFBUSxZQUFZLFNBQVksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxvQkFBb0IsWUFBWSxHQUFHLFFBQVEsQ0FBQyxDQUFDO0FBQUEsSUFDM0o7QUFFQSxTQUFLLGlEQUFpRCxNQUFNO0FBQzNELGFBQU8sZ0JBQWdCLFlBQVksTUFBUyxHQUFHLHlCQUF5QixpQ0FBaUMsQ0FBQztBQUMxRyxhQUFPLGdCQUFnQixZQUFZLEtBQUssR0FBRyx5QkFBeUIsaUNBQWlDLENBQUM7QUFDdEcsYUFBTyxZQUFZLFlBQVksSUFBSSxFQUFFLE1BQU0sV0FBVztBQUFBLElBQ3ZELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLDZDQUE2QyxNQUFNO0FBS3hELFNBQUssNkRBQTZELE1BQU07QUFDdkUsWUFBTSxZQUFZLEVBQUUsbUJBQW1CLEVBQUUsUUFBUSxrQkFBa0IsRUFBRTtBQUNyRSxZQUFNLFNBQVMsd0JBQXdCO0FBQUEsUUFDdEMsc0JBQXNCLEVBQUUsSUFBSSxrQkFBa0IsR0FBRyxTQUFTO0FBQUEsUUFDMUQsUUFBUSxFQUFFLENBQUMsb0JBQW9CLFlBQVksR0FBRyxLQUFLLENBQUM7QUFBQSxNQUNyRDtBQUNBLGFBQU8sWUFBWSxPQUFPLE1BQU0sV0FBVztBQUFBLElBQzVDLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLDBDQUEwQyxNQUFNO0FBQ3JELFNBQUssb0ZBQW9GLE1BQU07QUFDOUYsWUFBTSxXQUFXLElBQUksd0JBQXdCO0FBQzdDLGFBQU87QUFBQSxRQUNOLFNBQVMsMkJBQTJCLFFBQVcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxHQUFHLElBQUksQ0FBQztBQUFBLFFBQ3BFO0FBQUEsVUFDQyxNQUFNO0FBQUEsVUFDTixVQUFVLGtDQUFrQztBQUFBLFVBQzVDLFNBQVMsR0FBRyw2Q0FBNkM7QUFBQTtBQUFBLEVBQU8seUNBQXlDO0FBQUEsUUFDMUc7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyw0Q0FBNEMsTUFBTTtBQUN0RCxZQUFNLFdBQVcsSUFBSSx3QkFBd0I7QUFDN0MsYUFBTztBQUFBLFFBQ04sU0FBUywyQkFBMkIsUUFBVyxRQUFRLENBQUMsR0FBRyxDQUFDLEdBQUcsS0FBSyxDQUFDO0FBQUEsUUFDckUseUJBQXlCLGlDQUFpQztBQUFBLE1BQzNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyx1RUFBdUUsTUFBTTtBQWpMcEY7QUFrTEcsWUFBTSxXQUFXLElBQUksd0JBQXdCO0FBQzdDLGVBQVMsZ0JBQWUsV0FBTTtBQUFBLFFBRTdCLDBCQUFrRjtBQUNqRixpQkFBTyxFQUFFLFlBQVksRUFBRSxRQUFRLFVBQVUsU0FBUyxjQUFjLEVBQUU7QUFBQSxRQUNuRTtBQUFBLE1BQ0QsR0FMd0IsR0FDUCxpQkFBaUIsQ0FBQyxRQUFRLEdBRG5CLEdBS3ZCO0FBQ0QsYUFBTztBQUFBLFFBQ04sU0FBUywyQkFBMkIsRUFBRSxJQUFJLGdCQUFnQixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUM7QUFBQSxRQUNsRjtBQUFBLFVBQ0MsTUFBTTtBQUFBLFVBQ04sVUFBVSxFQUFFLFlBQVksRUFBRSxRQUFRLFVBQVUsU0FBUyxjQUFjLEVBQUU7QUFBQSxVQUNyRSxTQUFTLEdBQUcsNkNBQTZDO0FBQUE7QUFBQSxFQUFPLHlDQUF5QztBQUFBLFFBQzFHO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssaUVBQWlFLE1BQU07QUFuTTlFO0FBb01HLFlBQU0sV0FBVyxJQUFJLHdCQUF3QjtBQUM3QyxlQUFTLGdCQUFlLFdBQU07QUFBQSxRQUU3QiwwQkFBa0M7QUFDakMsaUJBQU87QUFBQSxRQUNSO0FBQUEsTUFDRCxHQUx3QixHQUNQLGlCQUFpQixDQUFDLE9BQU8sR0FEbEIsR0FLdkI7QUFDRCxhQUFPO0FBQUEsUUFDTixTQUFTLDJCQUEyQixFQUFFLElBQUksYUFBYSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUM7QUFBQSxRQUMvRSxFQUFFLE1BQU0sV0FBVyxTQUFTLGNBQWM7QUFBQSxNQUMzQztBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sc0NBQXNDLE1BQU07QUFJakQsVUFBTSxlQUFlO0FBQ3JCLFVBQU0sZUFBZSxDQUFDLDZCQUE2QixpQkFBaUIsNkJBQTZCLFFBQVE7QUFFekcsU0FBSyx5REFBeUQsTUFBTTtBQUNuRSxZQUFNLFdBQVcsSUFBSSx3QkFBd0I7QUFDN0MsYUFBTyxnQkFBZ0IsU0FBUywyQkFBMkIsRUFBRSxJQUFJLElBQUksR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEdBQUcseUJBQXlCLGlDQUFpQyxDQUFDO0FBQUEsSUFDL0osQ0FBQztBQUVELFNBQUssK0ZBQStGLE1BQU07QUFDekcsWUFBTSxXQUFXLElBQUksd0JBQXdCO0FBQzdDLGFBQU87QUFBQSxRQUNOLFNBQVMsMkJBQTJCLEVBQUUsSUFBSSxJQUFJLEdBQUcsUUFBUSxDQUFDLEdBQUcsWUFBWSxDQUFDO0FBQUEsUUFDMUUseUJBQXlCO0FBQUEsVUFDeEIsTUFBTTtBQUFBLFVBQ04sVUFBVTtBQUFBLFlBQ1QsVUFBVSxrQ0FBa0MsU0FBUztBQUFBLFlBQ3JELG1CQUFtQixFQUFFLFFBQVEsVUFBVSxTQUFTO0FBQUEsRUFBSyxZQUFZLEdBQUc7QUFBQSxVQUNyRTtBQUFBLFFBQ0QsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLHlFQUF5RSxNQUFNO0FBNU90RjtBQTZPRyxZQUFNLFdBQVcsSUFBSSx3QkFBd0I7QUFDN0MsZUFBUyxnQkFBZSxXQUFNO0FBQUEsUUFFN0IsMEJBQWtGO0FBQ2pGLGlCQUFPLEVBQUUsbUJBQW1CLEVBQUUsUUFBUSxVQUFVLFNBQVMseUJBQXlCLEVBQUU7QUFBQSxRQUNyRjtBQUFBLE1BQ0QsR0FMd0IsR0FDUCxpQkFBaUIsQ0FBQyxRQUFRLEdBRG5CLEdBS3ZCO0FBQ0QsYUFBTztBQUFBLFFBQ04sU0FBUywyQkFBMkIsRUFBRSxJQUFJLFdBQVcsR0FBRyxRQUFRLENBQUMsR0FBRyxZQUFZLENBQUM7QUFBQSxRQUNqRix5QkFBeUIsRUFBRSxNQUFNLGFBQWEsVUFBVSxFQUFFLG1CQUFtQixFQUFFLFFBQVEsVUFBVSxTQUFTO0FBQUE7QUFBQSxFQUE2QixZQUFZLEdBQUcsRUFBRSxFQUFFLENBQUM7QUFBQSxNQUM1SjtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssNkZBQTZGLE1BQU07QUExUDFHO0FBMlBHLFlBQU0sV0FBVyxJQUFJLHdCQUF3QjtBQUM3QyxlQUFTLGdCQUFlLFdBQU07QUFBQSxRQUU3QiwwQkFBa0Y7QUFDakYsaUJBQU8sRUFBRSxtQkFBbUIsRUFBRSxRQUFRLFVBQVUsU0FBUyx5QkFBeUIsRUFBRTtBQUFBLFFBQ3JGO0FBQUEsTUFDRCxHQUx3QixHQUNQLGlCQUFpQixDQUFDLFFBQVEsR0FEbkIsR0FLdkI7QUFDRCxhQUFPO0FBQUEsUUFDTixTQUFTLDJCQUEyQixFQUFFLElBQUksV0FBVyxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUM7QUFBQSxRQUNoRix5QkFBeUIsRUFBRSxNQUFNLGFBQWEsVUFBVSxFQUFFLG1CQUFtQixFQUFFLFFBQVEsVUFBVSxTQUFTLHlCQUF5QixFQUFFLEVBQUUsQ0FBQztBQUFBLE1BQ3pJO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSxtQ0FBbUMsTUFBTTtBQUs5QyxVQUFNLG1CQUFtQjtBQUV6QixTQUFLLHVHQUF1RyxNQUFNO0FBQ2pILFlBQU0sV0FBVyxJQUFJLHdCQUF3QjtBQUM3QyxhQUFPO0FBQUEsUUFDTixTQUFTLDJCQUEyQixFQUFFLElBQUksSUFBSSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsaUNBQWlDLEdBQUcsT0FBTyxJQUFJLENBQUM7QUFBQSxRQUM5Ryx5QkFBeUI7QUFBQSxVQUN4QixNQUFNO0FBQUEsVUFDTixVQUFVO0FBQUEsWUFDVCxVQUFVLGtDQUFrQyxTQUFTO0FBQUEsWUFDckQsbUJBQW1CLEVBQUUsUUFBUSxVQUFVLFNBQVM7QUFBQSxFQUFLLGdCQUFnQixHQUFHO0FBQUEsVUFDekU7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyxtRkFBbUYsTUFBTTtBQUM3RixZQUFNLFdBQVcsSUFBSSx3QkFBd0I7QUFDN0MsYUFBTztBQUFBLFFBQ04sU0FBUywyQkFBMkIsRUFBRSxJQUFJLElBQUksR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGlDQUFpQyxHQUFHLE9BQU8sS0FBSyxDQUFDO0FBQUEsUUFDL0cseUJBQXlCLGlDQUFpQztBQUFBLE1BQzNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyw4RUFBOEUsTUFBTTtBQUN4RixZQUFNLFdBQVcsSUFBSSx3QkFBd0I7QUFDN0MsYUFBTztBQUFBLFFBQ04sU0FBUywyQkFBMkIsRUFBRSxJQUFJLElBQUksR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLFNBQVMsR0FBRyxPQUFPLElBQUksQ0FBQztBQUFBLFFBQ3RGLHlCQUF5QixpQ0FBaUM7QUFBQSxNQUMzRDtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssNkVBQTZFLE1BQU07QUE5UzFGO0FBK1NHLFlBQU0sV0FBVyxJQUFJLHdCQUF3QjtBQUM3QyxlQUFTLGdCQUFlLFdBQU07QUFBQSxRQUU3QiwwQkFBa0Y7QUFDakYsaUJBQU8sRUFBRSxtQkFBbUIsRUFBRSxRQUFRLFVBQVUsU0FBUyx5QkFBeUIsRUFBRTtBQUFBLFFBQ3JGO0FBQUEsTUFDRCxHQUx3QixHQUNQLGlCQUFpQixDQUFDLFFBQVEsR0FEbkIsR0FLdkI7QUFDRCxhQUFPO0FBQUEsUUFDTixTQUFTLDJCQUEyQixFQUFFLElBQUksV0FBVyxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsaUNBQWlDLEdBQUcsT0FBTyxJQUFJLENBQUM7QUFBQSxRQUNySCx5QkFBeUIsRUFBRSxNQUFNLGFBQWEsVUFBVSxFQUFFLG1CQUFtQixFQUFFLFFBQVEsVUFBVSxTQUFTO0FBQUE7QUFBQSxFQUE2QixnQkFBZ0IsR0FBRyxFQUFFLEVBQUUsQ0FBQztBQUFBLE1BQ2hLO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
