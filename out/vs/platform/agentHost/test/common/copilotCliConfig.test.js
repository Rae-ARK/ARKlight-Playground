import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { applyModelFamilyAlias, normalizeToolSearchDeferThreshold } from "../../common/copilotCliConfig.js";
suite("copilotCliConfig", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("applyModelFamilyAlias substitutes a usable alias and ignores everything else", () => {
    const model = { id: "preview-model-x", config: { thinkingLevel: "high" } };
    assert.deepStrictEqual(
      [
        // usable alias: id substituted, picker config preserved
        applyModelFamilyAlias(model, { "preview-model-x": { family: "claude-opus-4-8" } }),
        // no overrides / override for another id / no usable family → unchanged
        applyModelFamilyAlias(model, void 0),
        applyModelFamilyAlias(model, { "other-model": { family: "claude-opus-4-8" } }),
        applyModelFamilyAlias(model, { "preview-model-x": {} }),
        applyModelFamilyAlias(model, { "preview-model-x": { family: "" } }),
        // no model → undefined
        applyModelFamilyAlias(void 0, { "preview-model-x": { family: "claude-opus-4-8" } })
      ],
      [
        { id: "claude-opus-4-8", config: { thinkingLevel: "high" } },
        model,
        model,
        model,
        model,
        void 0
      ]
    );
  });
  test("normalizeToolSearchDeferThreshold floors valid values and defaults invalid values", () => {
    assert.deepStrictEqual(
      [5.9, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, void 0].map(normalizeToolSearchDeferThreshold),
      [5, 0, 1, 1, 1, 1]
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L2NvbW1vbi9jb3BpbG90Q2xpQ29uZmlnLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IGFwcGx5TW9kZWxGYW1pbHlBbGlhcywgbm9ybWFsaXplVG9vbFNlYXJjaERlZmVyVGhyZXNob2xkIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvcGlsb3RDbGlDb25maWcuanMnO1xuaW1wb3J0IHR5cGUgeyBNb2RlbFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5cbnN1aXRlKCdjb3BpbG90Q2xpQ29uZmlnJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2FwcGx5TW9kZWxGYW1pbHlBbGlhcyBzdWJzdGl0dXRlcyBhIHVzYWJsZSBhbGlhcyBhbmQgaWdub3JlcyBldmVyeXRoaW5nIGVsc2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWw6IE1vZGVsU2VsZWN0aW9uID0geyBpZDogJ3ByZXZpZXctbW9kZWwteCcsIGNvbmZpZzogeyB0aGlua2luZ0xldmVsOiAnaGlnaCcgfSB9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRbXG5cdFx0XHRcdC8vIHVzYWJsZSBhbGlhczogaWQgc3Vic3RpdHV0ZWQsIHBpY2tlciBjb25maWcgcHJlc2VydmVkXG5cdFx0XHRcdGFwcGx5TW9kZWxGYW1pbHlBbGlhcyhtb2RlbCwgeyAncHJldmlldy1tb2RlbC14JzogeyBmYW1pbHk6ICdjbGF1ZGUtb3B1cy00LTgnIH0gfSksXG5cdFx0XHRcdC8vIG5vIG92ZXJyaWRlcyAvIG92ZXJyaWRlIGZvciBhbm90aGVyIGlkIC8gbm8gdXNhYmxlIGZhbWlseSBcdTIxOTIgdW5jaGFuZ2VkXG5cdFx0XHRcdGFwcGx5TW9kZWxGYW1pbHlBbGlhcyhtb2RlbCwgdW5kZWZpbmVkKSxcblx0XHRcdFx0YXBwbHlNb2RlbEZhbWlseUFsaWFzKG1vZGVsLCB7ICdvdGhlci1tb2RlbCc6IHsgZmFtaWx5OiAnY2xhdWRlLW9wdXMtNC04JyB9IH0pLFxuXHRcdFx0XHRhcHBseU1vZGVsRmFtaWx5QWxpYXMobW9kZWwsIHsgJ3ByZXZpZXctbW9kZWwteCc6IHt9IH0pLFxuXHRcdFx0XHRhcHBseU1vZGVsRmFtaWx5QWxpYXMobW9kZWwsIHsgJ3ByZXZpZXctbW9kZWwteCc6IHsgZmFtaWx5OiAnJyB9IH0pLFxuXHRcdFx0XHQvLyBubyBtb2RlbCBcdTIxOTIgdW5kZWZpbmVkXG5cdFx0XHRcdGFwcGx5TW9kZWxGYW1pbHlBbGlhcyh1bmRlZmluZWQsIHsgJ3ByZXZpZXctbW9kZWwteCc6IHsgZmFtaWx5OiAnY2xhdWRlLW9wdXMtNC04JyB9IH0pLFxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0eyBpZDogJ2NsYXVkZS1vcHVzLTQtOCcsIGNvbmZpZzogeyB0aGlua2luZ0xldmVsOiAnaGlnaCcgfSB9LFxuXHRcdFx0XHRtb2RlbCxcblx0XHRcdFx0bW9kZWwsXG5cdFx0XHRcdG1vZGVsLFxuXHRcdFx0XHRtb2RlbCxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vcm1hbGl6ZVRvb2xTZWFyY2hEZWZlclRocmVzaG9sZCBmbG9vcnMgdmFsaWQgdmFsdWVzIGFuZCBkZWZhdWx0cyBpbnZhbGlkIHZhbHVlcycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0WzUuOSwgMCwgLTEsIE51bWJlci5OYU4sIE51bWJlci5QT1NJVElWRV9JTkZJTklUWSwgdW5kZWZpbmVkXS5tYXAobm9ybWFsaXplVG9vbFNlYXJjaERlZmVyVGhyZXNob2xkKSxcblx0XHRcdFs1LCAwLCAxLCAxLCAxLCAxXVxuXHRcdCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyx1QkFBdUIseUNBQXlDO0FBR3pFLE1BQU0sb0JBQW9CLE1BQU07QUFFL0IsMENBQXdDO0FBRXhDLE9BQUssZ0ZBQWdGLE1BQU07QUFDMUYsVUFBTSxRQUF3QixFQUFFLElBQUksbUJBQW1CLFFBQVEsRUFBRSxlQUFlLE9BQU8sRUFBRTtBQUN6RixXQUFPO0FBQUEsTUFDTjtBQUFBO0FBQUEsUUFFQyxzQkFBc0IsT0FBTyxFQUFFLG1CQUFtQixFQUFFLFFBQVEsa0JBQWtCLEVBQUUsQ0FBQztBQUFBO0FBQUEsUUFFakYsc0JBQXNCLE9BQU8sTUFBUztBQUFBLFFBQ3RDLHNCQUFzQixPQUFPLEVBQUUsZUFBZSxFQUFFLFFBQVEsa0JBQWtCLEVBQUUsQ0FBQztBQUFBLFFBQzdFLHNCQUFzQixPQUFPLEVBQUUsbUJBQW1CLENBQUMsRUFBRSxDQUFDO0FBQUEsUUFDdEQsc0JBQXNCLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxRQUFRLEdBQUcsRUFBRSxDQUFDO0FBQUE7QUFBQSxRQUVsRSxzQkFBc0IsUUFBVyxFQUFFLG1CQUFtQixFQUFFLFFBQVEsa0JBQWtCLEVBQUUsQ0FBQztBQUFBLE1BQ3RGO0FBQUEsTUFDQTtBQUFBLFFBQ0MsRUFBRSxJQUFJLG1CQUFtQixRQUFRLEVBQUUsZUFBZSxPQUFPLEVBQUU7QUFBQSxRQUMzRDtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUsscUZBQXFGLE1BQU07QUFDL0YsV0FBTztBQUFBLE1BQ04sQ0FBQyxLQUFLLEdBQUcsSUFBSSxPQUFPLEtBQUssT0FBTyxtQkFBbUIsTUFBUyxFQUFFLElBQUksaUNBQWlDO0FBQUEsTUFDbkcsQ0FBQyxHQUFHLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLElBQ2xCO0FBQUEsRUFDRCxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
