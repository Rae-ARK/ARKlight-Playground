import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { ExtensionIdentifier } from "../../../../../../platform/extensions/common/extensions.js";
import { Separator } from "../../../../../../base/common/actions.js";
import { buildAddModelsDropdownActions, getModelHoverContent } from "../../../browser/chatManagement/chatModelsWidget.js";
import { ChatAgentLocation } from "../../../common/constants.js";
function createModel(overrides = {}) {
  return {
    metadata: {
      extension: new ExtensionIdentifier("github.copilot"),
      id: "gpt-4",
      name: "GPT-4",
      family: "gpt-4",
      version: "1.0",
      vendor: "copilot",
      maxInputTokens: 8192,
      maxOutputTokens: 4096,
      isUserSelectable: true,
      isDefaultForLocation: {
        [ChatAgentLocation.Chat]: false
      },
      ...overrides
    },
    identifier: "copilot-gpt-4",
    provider: {
      vendor: { vendor: "copilot", displayName: "GitHub Copilot", isDefault: true },
      group: { name: "GitHub Copilot" }
    }
  };
}
function createVendor(vendor, displayName, deprecation) {
  return { vendor, displayName, isDefault: false, deprecation };
}
suite("ChatModelsWidget", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("getModelHoverContent", () => {
    test("includes cost fields when all four are present", () => {
      const model = createModel({
        inputCost: 4,
        outputCost: 14,
        cacheCost: 1,
        cacheWriteCost: 2
      });
      const markdown = getModelHoverContent(model);
      const value = markdown.value;
      assert.ok(value.includes("Input Cost"));
      assert.ok(value.includes("4 credits per 1M tokens"));
      assert.ok(value.includes("Output Cost"));
      assert.ok(value.includes("14 credits per 1M tokens"));
      assert.ok(value.includes("Cache Read Cost"));
      assert.ok(value.includes("1 credit per 1M tokens"));
      assert.ok(value.includes("Cache Write Cost"));
      assert.ok(value.includes("2 credits per 1M tokens"));
    });
    test("includes only present cost fields", () => {
      const model = createModel({
        inputCost: 3,
        outputCost: 12
        // cacheCost and cacheWriteCost intentionally omitted
      });
      const markdown = getModelHoverContent(model);
      const value = markdown.value;
      assert.ok(value.includes("Input Cost"));
      assert.ok(value.includes("3 credits per 1M tokens"));
      assert.ok(value.includes("Output Cost"));
      assert.ok(value.includes("12 credits per 1M tokens"));
      assert.ok(!value.includes("Cache Read Cost"));
      assert.ok(!value.includes("Cache Write Cost"));
    });
    test("omits cost section when no cost fields are set", () => {
      const model = createModel({});
      const markdown = getModelHoverContent(model);
      const value = markdown.value;
      assert.ok(!value.includes("Input Cost"));
      assert.ok(!value.includes("Output Cost"));
      assert.ok(!value.includes("Cache Read Cost"));
      assert.ok(!value.includes("Cache Write Cost"));
      assert.ok(!value.includes("credits per 1M tokens"));
      assert.ok(!value.includes("credit per 1M tokens"));
    });
    test("includes pricing text when set", () => {
      const model = createModel({ pricing: "1x" });
      const markdown = getModelHoverContent(model);
      const value = markdown.value;
      assert.ok(value.includes("Pricing"));
      assert.ok(value.includes("1x"));
    });
    test("includes both pricing and cost fields when both are present", () => {
      const model = createModel({
        pricing: "1x",
        inputCost: 4,
        outputCost: 14,
        cacheCost: 1
      });
      const markdown = getModelHoverContent(model);
      const value = markdown.value;
      assert.ok(value.includes("Pricing"));
      assert.ok(value.includes("1x"));
      assert.ok(value.includes("Input Cost"));
      assert.ok(value.includes("4 credits per 1M tokens"));
    });
    test("handles zero cost values", () => {
      const model = createModel({
        inputCost: 0,
        outputCost: 0,
        cacheCost: 0
      });
      const markdown = getModelHoverContent(model);
      const value = markdown.value;
      assert.ok(value.includes("Input Cost"));
      assert.ok(value.includes("0 credits per 1M tokens"));
    });
  });
  suite("buildAddModelsDropdownActions", () => {
    test("returns no actions when adding models is not supported", () => {
      const vendors = [createVendor("acme", "Acme")];
      let vendorRunCount = 0;
      const actions = buildAddModelsDropdownActions(
        vendors,
        false,
        () => {
          vendorRunCount++;
        }
      );
      assert.deepStrictEqual({
        ids: actions.map((a) => a.id),
        vendorRunCount
      }, {
        ids: [],
        vendorRunCount: 0
      });
    });
    test("returns configurable vendor actions sorted with custom vendors pinned at the end", async () => {
      const vendors = [
        createVendor("zebra", "Zebra"),
        createVendor("acme", "Acme"),
        createVendor("customoai", "OpenAI Compatible (Deprecated)"),
        createVendor("customendpoint", "Custom Endpoint")
      ];
      const ran = [];
      const actions = buildAddModelsDropdownActions(
        vendors,
        true,
        (v) => {
          ran.push(v.vendor);
        }
      );
      for (const action of actions) {
        if (!(action instanceof Separator)) {
          await action.run();
        }
      }
      assert.deepStrictEqual({
        shape: actions.map((a) => a instanceof Separator ? "separator" : a.id),
        ran
      }, {
        shape: ["enable-acme", "enable-zebra", "enable-customoai", "separator", "enable-customendpoint"],
        ran: ["acme", "zebra", "customoai", "customendpoint"]
      });
    });
    test("with no configurable vendors: no actions are returned", async () => {
      const actions = buildAddModelsDropdownActions(
        [],
        true,
        () => assert.fail("vendor run should not be called")
      );
      assert.deepStrictEqual(
        actions.map((a) => a instanceof Separator ? "separator" : a.id),
        []
      );
    });
    test("with configurable vendors: vendor actions are separated from the pinned custom endpoint vendor", async () => {
      const vendors = [
        createVendor("acme", "Acme"),
        createVendor("customendpoint", "Custom Endpoint")
      ];
      const ran = [];
      const actions = buildAddModelsDropdownActions(
        vendors,
        true,
        (v) => {
          ran.push(v.vendor);
        }
      );
      for (const action of actions) {
        if (!(action instanceof Separator)) {
          await action.run();
        }
      }
      assert.deepStrictEqual({
        shape: actions.map((a) => a instanceof Separator ? "separator" : a.id),
        ran
      }, {
        shape: ["enable-acme", "separator", "enable-customendpoint"],
        ran: ["acme", "customendpoint"]
      });
    });
    test("sinks deprecated providers to the end of the sorted list", () => {
      const vendors = [
        createVendor("zebra", "Zebra"),
        createVendor("ollama", "Ollama (Deprecated)", { link: "vscode:extension/Ollama.ollama" }),
        createVendor("acme", "Acme"),
        createVendor("customoai", "OpenAI Compatible (Deprecated)"),
        createVendor("customendpoint", "Custom Endpoint")
      ];
      const actions = buildAddModelsDropdownActions(vendors, true, () => {
      });
      assert.deepStrictEqual(
        actions.map((a) => a instanceof Separator ? "separator" : a.id),
        ["enable-acme", "enable-zebra", "enable-ollama", "enable-customoai", "separator", "enable-customendpoint"]
      );
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2NoYXRNYW5hZ2VtZW50L2NoYXRNb2RlbHNXaWRnZXQudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSwgSUxhbmd1YWdlTW9kZWxQcm92aWRlckRlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgYnVpbGRBZGRNb2RlbHNEcm9wZG93bkFjdGlvbnMsIGdldE1vZGVsSG92ZXJDb250ZW50IH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9jaGF0TWFuYWdlbWVudC9jaGF0TW9kZWxzV2lkZ2V0LmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9jaGF0TWFuYWdlbWVudC9jaGF0TW9kZWxzVmlld01vZGVsLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5cbmZ1bmN0aW9uIGNyZWF0ZU1vZGVsKG92ZXJyaWRlczogUGFydGlhbDxJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YT4gPSB7fSk6IElMYW5ndWFnZU1vZGVsIHtcblx0cmV0dXJuIHtcblx0XHRtZXRhZGF0YToge1xuXHRcdFx0ZXh0ZW5zaW9uOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcignZ2l0aHViLmNvcGlsb3QnKSxcblx0XHRcdGlkOiAnZ3B0LTQnLFxuXHRcdFx0bmFtZTogJ0dQVC00Jyxcblx0XHRcdGZhbWlseTogJ2dwdC00Jyxcblx0XHRcdHZlcnNpb246ICcxLjAnLFxuXHRcdFx0dmVuZG9yOiAnY29waWxvdCcsXG5cdFx0XHRtYXhJbnB1dFRva2VuczogODE5Mixcblx0XHRcdG1heE91dHB1dFRva2VuczogNDA5Nixcblx0XHRcdGlzVXNlclNlbGVjdGFibGU6IHRydWUsXG5cdFx0XHRpc0RlZmF1bHRGb3JMb2NhdGlvbjoge1xuXHRcdFx0XHRbQ2hhdEFnZW50TG9jYXRpb24uQ2hhdF06IGZhbHNlXG5cdFx0XHR9LFxuXHRcdFx0Li4ub3ZlcnJpZGVzXG5cdFx0fSxcblx0XHRpZGVudGlmaWVyOiAnY29waWxvdC1ncHQtNCcsXG5cdFx0cHJvdmlkZXI6IHtcblx0XHRcdHZlbmRvcjogeyB2ZW5kb3I6ICdjb3BpbG90JywgZGlzcGxheU5hbWU6ICdHaXRIdWIgQ29waWxvdCcsIGlzRGVmYXVsdDogdHJ1ZSB9LFxuXHRcdFx0Z3JvdXA6IHsgbmFtZTogJ0dpdEh1YiBDb3BpbG90JyB9XG5cdFx0fSxcblx0fSBhcyBJTGFuZ3VhZ2VNb2RlbDtcbn1cblxuZnVuY3Rpb24gY3JlYXRlVmVuZG9yKHZlbmRvcjogc3RyaW5nLCBkaXNwbGF5TmFtZTogc3RyaW5nLCBkZXByZWNhdGlvbj86IHsgbGluaz86IHN0cmluZyB9KTogSUxhbmd1YWdlTW9kZWxQcm92aWRlckRlc2NyaXB0b3Ige1xuXHRyZXR1cm4geyB2ZW5kb3IsIGRpc3BsYXlOYW1lLCBpc0RlZmF1bHQ6IGZhbHNlLCBkZXByZWNhdGlvbiB9IGFzIElMYW5ndWFnZU1vZGVsUHJvdmlkZXJEZXNjcmlwdG9yO1xufVxuXG5zdWl0ZSgnQ2hhdE1vZGVsc1dpZGdldCcsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgnZ2V0TW9kZWxIb3ZlckNvbnRlbnQnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdpbmNsdWRlcyBjb3N0IGZpZWxkcyB3aGVuIGFsbCBmb3VyIGFyZSBwcmVzZW50JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCh7XG5cdFx0XHRcdGlucHV0Q29zdDogNCxcblx0XHRcdFx0b3V0cHV0Q29zdDogMTQsXG5cdFx0XHRcdGNhY2hlQ29zdDogMSxcblx0XHRcdFx0Y2FjaGVXcml0ZUNvc3Q6IDJcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBtYXJrZG93biA9IGdldE1vZGVsSG92ZXJDb250ZW50KG1vZGVsKTtcblx0XHRcdGNvbnN0IHZhbHVlID0gbWFya2Rvd24udmFsdWU7XG5cblx0XHRcdGFzc2VydC5vayh2YWx1ZS5pbmNsdWRlcygnSW5wdXQgQ29zdCcpKTtcblx0XHRcdGFzc2VydC5vayh2YWx1ZS5pbmNsdWRlcygnNCBjcmVkaXRzIHBlciAxTSB0b2tlbnMnKSk7XG5cdFx0XHRhc3NlcnQub2sodmFsdWUuaW5jbHVkZXMoJ091dHB1dCBDb3N0JykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHZhbHVlLmluY2x1ZGVzKCcxNCBjcmVkaXRzIHBlciAxTSB0b2tlbnMnKSk7XG5cdFx0XHRhc3NlcnQub2sodmFsdWUuaW5jbHVkZXMoJ0NhY2hlIFJlYWQgQ29zdCcpKTtcblx0XHRcdGFzc2VydC5vayh2YWx1ZS5pbmNsdWRlcygnMSBjcmVkaXQgcGVyIDFNIHRva2VucycpKTtcblx0XHRcdGFzc2VydC5vayh2YWx1ZS5pbmNsdWRlcygnQ2FjaGUgV3JpdGUgQ29zdCcpKTtcblx0XHRcdGFzc2VydC5vayh2YWx1ZS5pbmNsdWRlcygnMiBjcmVkaXRzIHBlciAxTSB0b2tlbnMnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbmNsdWRlcyBvbmx5IHByZXNlbnQgY29zdCBmaWVsZHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vZGVsKHtcblx0XHRcdFx0aW5wdXRDb3N0OiAzLFxuXHRcdFx0XHRvdXRwdXRDb3N0OiAxMlxuXHRcdFx0XHQvLyBjYWNoZUNvc3QgYW5kIGNhY2hlV3JpdGVDb3N0IGludGVudGlvbmFsbHkgb21pdHRlZFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IG1hcmtkb3duID0gZ2V0TW9kZWxIb3ZlckNvbnRlbnQobW9kZWwpO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBtYXJrZG93bi52YWx1ZTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHZhbHVlLmluY2x1ZGVzKCdJbnB1dCBDb3N0JykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHZhbHVlLmluY2x1ZGVzKCczIGNyZWRpdHMgcGVyIDFNIHRva2VucycpKTtcblx0XHRcdGFzc2VydC5vayh2YWx1ZS5pbmNsdWRlcygnT3V0cHV0IENvc3QnKSk7XG5cdFx0XHRhc3NlcnQub2sodmFsdWUuaW5jbHVkZXMoJzEyIGNyZWRpdHMgcGVyIDFNIHRva2VucycpKTtcblx0XHRcdGFzc2VydC5vayghdmFsdWUuaW5jbHVkZXMoJ0NhY2hlIFJlYWQgQ29zdCcpKTtcblx0XHRcdGFzc2VydC5vayghdmFsdWUuaW5jbHVkZXMoJ0NhY2hlIFdyaXRlIENvc3QnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvbWl0cyBjb3N0IHNlY3Rpb24gd2hlbiBubyBjb3N0IGZpZWxkcyBhcmUgc2V0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCh7fSk7XG5cblx0XHRcdGNvbnN0IG1hcmtkb3duID0gZ2V0TW9kZWxIb3ZlckNvbnRlbnQobW9kZWwpO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBtYXJrZG93bi52YWx1ZTtcblxuXHRcdFx0YXNzZXJ0Lm9rKCF2YWx1ZS5pbmNsdWRlcygnSW5wdXQgQ29zdCcpKTtcblx0XHRcdGFzc2VydC5vayghdmFsdWUuaW5jbHVkZXMoJ091dHB1dCBDb3N0JykpO1xuXHRcdFx0YXNzZXJ0Lm9rKCF2YWx1ZS5pbmNsdWRlcygnQ2FjaGUgUmVhZCBDb3N0JykpO1xuXHRcdFx0YXNzZXJ0Lm9rKCF2YWx1ZS5pbmNsdWRlcygnQ2FjaGUgV3JpdGUgQ29zdCcpKTtcblx0XHRcdGFzc2VydC5vayghdmFsdWUuaW5jbHVkZXMoJ2NyZWRpdHMgcGVyIDFNIHRva2VucycpKTtcblx0XHRcdGFzc2VydC5vayghdmFsdWUuaW5jbHVkZXMoJ2NyZWRpdCBwZXIgMU0gdG9rZW5zJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5jbHVkZXMgcHJpY2luZyB0ZXh0IHdoZW4gc2V0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCh7IHByaWNpbmc6ICcxeCcgfSk7XG5cblx0XHRcdGNvbnN0IG1hcmtkb3duID0gZ2V0TW9kZWxIb3ZlckNvbnRlbnQobW9kZWwpO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBtYXJrZG93bi52YWx1ZTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHZhbHVlLmluY2x1ZGVzKCdQcmljaW5nJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHZhbHVlLmluY2x1ZGVzKCcxeCcpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luY2x1ZGVzIGJvdGggcHJpY2luZyBhbmQgY29zdCBmaWVsZHMgd2hlbiBib3RoIGFyZSBwcmVzZW50JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCh7XG5cdFx0XHRcdHByaWNpbmc6ICcxeCcsXG5cdFx0XHRcdGlucHV0Q29zdDogNCxcblx0XHRcdFx0b3V0cHV0Q29zdDogMTQsXG5cdFx0XHRcdGNhY2hlQ29zdDogMVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IG1hcmtkb3duID0gZ2V0TW9kZWxIb3ZlckNvbnRlbnQobW9kZWwpO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBtYXJrZG93bi52YWx1ZTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHZhbHVlLmluY2x1ZGVzKCdQcmljaW5nJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHZhbHVlLmluY2x1ZGVzKCcxeCcpKTtcblx0XHRcdGFzc2VydC5vayh2YWx1ZS5pbmNsdWRlcygnSW5wdXQgQ29zdCcpKTtcblx0XHRcdGFzc2VydC5vayh2YWx1ZS5pbmNsdWRlcygnNCBjcmVkaXRzIHBlciAxTSB0b2tlbnMnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVzIHplcm8gY29zdCB2YWx1ZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vZGVsKHtcblx0XHRcdFx0aW5wdXRDb3N0OiAwLFxuXHRcdFx0XHRvdXRwdXRDb3N0OiAwLFxuXHRcdFx0XHRjYWNoZUNvc3Q6IDBcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBtYXJrZG93biA9IGdldE1vZGVsSG92ZXJDb250ZW50KG1vZGVsKTtcblx0XHRcdGNvbnN0IHZhbHVlID0gbWFya2Rvd24udmFsdWU7XG5cblx0XHRcdGFzc2VydC5vayh2YWx1ZS5pbmNsdWRlcygnSW5wdXQgQ29zdCcpKTtcblx0XHRcdGFzc2VydC5vayh2YWx1ZS5pbmNsdWRlcygnMCBjcmVkaXRzIHBlciAxTSB0b2tlbnMnKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdidWlsZEFkZE1vZGVsc0Ryb3Bkb3duQWN0aW9ucycsICgpID0+IHtcblxuXHRcdHRlc3QoJ3JldHVybnMgbm8gYWN0aW9ucyB3aGVuIGFkZGluZyBtb2RlbHMgaXMgbm90IHN1cHBvcnRlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHZlbmRvcnMgPSBbY3JlYXRlVmVuZG9yKCdhY21lJywgJ0FjbWUnKV07XG5cdFx0XHRsZXQgdmVuZG9yUnVuQ291bnQgPSAwO1xuXG5cdFx0XHRjb25zdCBhY3Rpb25zID0gYnVpbGRBZGRNb2RlbHNEcm9wZG93bkFjdGlvbnMoXG5cdFx0XHRcdHZlbmRvcnMsXG5cdFx0XHRcdGZhbHNlLFxuXHRcdFx0XHQoKSA9PiB7IHZlbmRvclJ1bkNvdW50Kys7IH0sXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0aWRzOiBhY3Rpb25zLm1hcChhID0+IGEuaWQpLFxuXHRcdFx0XHR2ZW5kb3JSdW5Db3VudCxcblx0XHRcdH0sIHtcblx0XHRcdFx0aWRzOiBbXSxcblx0XHRcdFx0dmVuZG9yUnVuQ291bnQ6IDAsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgY29uZmlndXJhYmxlIHZlbmRvciBhY3Rpb25zIHNvcnRlZCB3aXRoIGN1c3RvbSB2ZW5kb3JzIHBpbm5lZCBhdCB0aGUgZW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdmVuZG9ycyA9IFtcblx0XHRcdFx0Y3JlYXRlVmVuZG9yKCd6ZWJyYScsICdaZWJyYScpLFxuXHRcdFx0XHRjcmVhdGVWZW5kb3IoJ2FjbWUnLCAnQWNtZScpLFxuXHRcdFx0XHRjcmVhdGVWZW5kb3IoJ2N1c3RvbW9haScsICdPcGVuQUkgQ29tcGF0aWJsZSAoRGVwcmVjYXRlZCknKSxcblx0XHRcdFx0Y3JlYXRlVmVuZG9yKCdjdXN0b21lbmRwb2ludCcsICdDdXN0b20gRW5kcG9pbnQnKSxcblx0XHRcdF07XG5cdFx0XHRjb25zdCByYW46IHN0cmluZ1tdID0gW107XG5cblx0XHRcdGNvbnN0IGFjdGlvbnMgPSBidWlsZEFkZE1vZGVsc0Ryb3Bkb3duQWN0aW9ucyhcblx0XHRcdFx0dmVuZG9ycyxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0diA9PiB7IHJhbi5wdXNoKHYudmVuZG9yKTsgfSxcblx0XHRcdCk7XG5cblx0XHRcdC8vIEV4ZWN1dGUgZXZlcnkgbm9uLXNlcGFyYXRvciBhY3Rpb24gdG8gY2FwdHVyZSB3aGljaCBwYXRoIGVhY2ggb25lIHJ1bnMuXG5cdFx0XHRmb3IgKGNvbnN0IGFjdGlvbiBvZiBhY3Rpb25zKSB7XG5cdFx0XHRcdGlmICghKGFjdGlvbiBpbnN0YW5jZW9mIFNlcGFyYXRvcikpIHtcblx0XHRcdFx0XHRhd2FpdCBhY3Rpb24ucnVuKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHNoYXBlOiBhY3Rpb25zLm1hcChhID0+IGEgaW5zdGFuY2VvZiBTZXBhcmF0b3IgPyAnc2VwYXJhdG9yJyA6IGEuaWQpLFxuXHRcdFx0XHRyYW4sXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHNoYXBlOiBbJ2VuYWJsZS1hY21lJywgJ2VuYWJsZS16ZWJyYScsICdlbmFibGUtY3VzdG9tb2FpJywgJ3NlcGFyYXRvcicsICdlbmFibGUtY3VzdG9tZW5kcG9pbnQnXSxcblx0XHRcdFx0cmFuOiBbJ2FjbWUnLCAnemVicmEnLCAnY3VzdG9tb2FpJywgJ2N1c3RvbWVuZHBvaW50J10sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dpdGggbm8gY29uZmlndXJhYmxlIHZlbmRvcnM6IG5vIGFjdGlvbnMgYXJlIHJldHVybmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IGJ1aWxkQWRkTW9kZWxzRHJvcGRvd25BY3Rpb25zKFxuXHRcdFx0XHRbXSxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0KCkgPT4gYXNzZXJ0LmZhaWwoJ3ZlbmRvciBydW4gc2hvdWxkIG5vdCBiZSBjYWxsZWQnKSxcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdGFjdGlvbnMubWFwKGEgPT4gYSBpbnN0YW5jZW9mIFNlcGFyYXRvciA/ICdzZXBhcmF0b3InIDogYS5pZCksXG5cdFx0XHRcdFtdLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dpdGggY29uZmlndXJhYmxlIHZlbmRvcnM6IHZlbmRvciBhY3Rpb25zIGFyZSBzZXBhcmF0ZWQgZnJvbSB0aGUgcGlubmVkIGN1c3RvbSBlbmRwb2ludCB2ZW5kb3InLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB2ZW5kb3JzID0gW1xuXHRcdFx0XHRjcmVhdGVWZW5kb3IoJ2FjbWUnLCAnQWNtZScpLFxuXHRcdFx0XHRjcmVhdGVWZW5kb3IoJ2N1c3RvbWVuZHBvaW50JywgJ0N1c3RvbSBFbmRwb2ludCcpLFxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IHJhbjogc3RyaW5nW10gPSBbXTtcblxuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IGJ1aWxkQWRkTW9kZWxzRHJvcGRvd25BY3Rpb25zKFxuXHRcdFx0XHR2ZW5kb3JzLFxuXHRcdFx0XHR0cnVlLFxuXHRcdFx0XHR2ID0+IHsgcmFuLnB1c2godi52ZW5kb3IpOyB9LFxuXHRcdFx0KTtcblx0XHRcdGZvciAoY29uc3QgYWN0aW9uIG9mIGFjdGlvbnMpIHtcblx0XHRcdFx0aWYgKCEoYWN0aW9uIGluc3RhbmNlb2YgU2VwYXJhdG9yKSkge1xuXHRcdFx0XHRcdGF3YWl0IGFjdGlvbi5ydW4oKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0c2hhcGU6IGFjdGlvbnMubWFwKGEgPT4gYSBpbnN0YW5jZW9mIFNlcGFyYXRvciA/ICdzZXBhcmF0b3InIDogYS5pZCksXG5cdFx0XHRcdHJhbixcblx0XHRcdH0sIHtcblx0XHRcdFx0c2hhcGU6IFsnZW5hYmxlLWFjbWUnLCAnc2VwYXJhdG9yJywgJ2VuYWJsZS1jdXN0b21lbmRwb2ludCddLFxuXHRcdFx0XHRyYW46IFsnYWNtZScsICdjdXN0b21lbmRwb2ludCddLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaW5rcyBkZXByZWNhdGVkIHByb3ZpZGVycyB0byB0aGUgZW5kIG9mIHRoZSBzb3J0ZWQgbGlzdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHZlbmRvcnMgPSBbXG5cdFx0XHRcdGNyZWF0ZVZlbmRvcignemVicmEnLCAnWmVicmEnKSxcblx0XHRcdFx0Y3JlYXRlVmVuZG9yKCdvbGxhbWEnLCAnT2xsYW1hIChEZXByZWNhdGVkKScsIHsgbGluazogJ3ZzY29kZTpleHRlbnNpb24vT2xsYW1hLm9sbGFtYScgfSksXG5cdFx0XHRcdGNyZWF0ZVZlbmRvcignYWNtZScsICdBY21lJyksXG5cdFx0XHRcdGNyZWF0ZVZlbmRvcignY3VzdG9tb2FpJywgJ09wZW5BSSBDb21wYXRpYmxlIChEZXByZWNhdGVkKScpLFxuXHRcdFx0XHRjcmVhdGVWZW5kb3IoJ2N1c3RvbWVuZHBvaW50JywgJ0N1c3RvbSBFbmRwb2ludCcpLFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IGJ1aWxkQWRkTW9kZWxzRHJvcGRvd25BY3Rpb25zKHZlbmRvcnMsIHRydWUsICgpID0+IHsgfSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdGFjdGlvbnMubWFwKGEgPT4gYSBpbnN0YW5jZW9mIFNlcGFyYXRvciA/ICdzZXBhcmF0b3InIDogYS5pZCksXG5cdFx0XHRcdFsnZW5hYmxlLWFjbWUnLCAnZW5hYmxlLXplYnJhJywgJ2VuYWJsZS1vbGxhbWEnLCAnZW5hYmxlLWN1c3RvbW9haScsICdzZXBhcmF0b3InLCAnZW5hYmxlLWN1c3RvbWVuZHBvaW50J10sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxpQkFBaUI7QUFFMUIsU0FBUywrQkFBK0IsNEJBQTRCO0FBRXBFLFNBQVMseUJBQXlCO0FBRWxDLFNBQVMsWUFBWSxZQUFpRCxDQUFDLEdBQW1CO0FBQ3pGLFNBQU87QUFBQSxJQUNOLFVBQVU7QUFBQSxNQUNULFdBQVcsSUFBSSxvQkFBb0IsZ0JBQWdCO0FBQUEsTUFDbkQsSUFBSTtBQUFBLE1BQ0osTUFBTTtBQUFBLE1BQ04sUUFBUTtBQUFBLE1BQ1IsU0FBUztBQUFBLE1BQ1QsUUFBUTtBQUFBLE1BQ1IsZ0JBQWdCO0FBQUEsTUFDaEIsaUJBQWlCO0FBQUEsTUFDakIsa0JBQWtCO0FBQUEsTUFDbEIsc0JBQXNCO0FBQUEsUUFDckIsQ0FBQyxrQkFBa0IsSUFBSSxHQUFHO0FBQUEsTUFDM0I7QUFBQSxNQUNBLEdBQUc7QUFBQSxJQUNKO0FBQUEsSUFDQSxZQUFZO0FBQUEsSUFDWixVQUFVO0FBQUEsTUFDVCxRQUFRLEVBQUUsUUFBUSxXQUFXLGFBQWEsa0JBQWtCLFdBQVcsS0FBSztBQUFBLE1BQzVFLE9BQU8sRUFBRSxNQUFNLGlCQUFpQjtBQUFBLElBQ2pDO0FBQUEsRUFDRDtBQUNEO0FBRUEsU0FBUyxhQUFhLFFBQWdCLGFBQXFCLGFBQW1FO0FBQzdILFNBQU8sRUFBRSxRQUFRLGFBQWEsV0FBVyxPQUFPLFlBQVk7QUFDN0Q7QUFFQSxNQUFNLG9CQUFvQixNQUFNO0FBRS9CLDBDQUF3QztBQUV4QyxRQUFNLHdCQUF3QixNQUFNO0FBRW5DLFNBQUssa0RBQWtELE1BQU07QUFDNUQsWUFBTSxRQUFRLFlBQVk7QUFBQSxRQUN6QixXQUFXO0FBQUEsUUFDWCxZQUFZO0FBQUEsUUFDWixXQUFXO0FBQUEs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
