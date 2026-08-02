import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { formatQuestionPrompt } from "../../../common/voiceClient/voicePendingNarration.js";
suite("formatQuestionPrompt", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const single = {
    id: "q_single",
    type: "singleSelect",
    title: "Which region?",
    allow_freeform: false,
    options: [
      { label: "West US", value: "westus" },
      { label: "East US", value: "eastus" }
    ]
  };
  const multi = {
    id: "q_multi",
    type: "multiSelect",
    title: "Which features?",
    allow_freeform: true,
    options: [
      { label: "Auth", value: "auth" },
      { label: "Search", value: "search" },
      { label: "Billing", value: "billing" }
    ]
  };
  const text = {
    id: "q_text",
    type: "text",
    title: "Anything else?",
    allow_freeform: true,
    options: []
  };
  test("single select", () => {
    assert.strictEqual(
      formatQuestionPrompt(single, false),
      "Which region? Options: 1, West US. 2, East US."
    );
  });
  test("appends the skip hint when the form allows skipping", () => {
    assert.strictEqual(
      formatQuestionPrompt(single, true),
      "Which region? Options: 1, West US. 2, East US. Or say skip."
    );
  });
  test("mentions freeform when the question allows it", () => {
    assert.strictEqual(
      formatQuestionPrompt(multi, false),
      "Which features? Options: 1, Auth. 2, Search. 3, Billing. You can also give your own answer."
    );
  });
  test("a text question is just its title", () => {
    assert.strictEqual(formatQuestionPrompt(text, false), "Anything else?");
  });
  test("a text question with skip", () => {
    assert.strictEqual(formatQuestionPrompt(text, true), "Anything else? Or say skip.");
  });
  test("tolerates an empty title", () => {
    assert.strictEqual(
      formatQuestionPrompt({ ...single, title: "" }, false),
      "Options: 1, West US. 2, East US."
    );
  });
  test("reads the ordinals it was given rather than renumbering", () => {
    assert.strictEqual(
      formatQuestionPrompt(
        {
          ...single,
          options: [
            { label: "East US", value: "eastus" },
            { label: "West US", value: "westus" }
          ]
        },
        false
      ),
      "Which region? Options: 1, East US. 2, West US."
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vdm9pY2VDbGllbnQvdm9pY2VQZW5kaW5nTmFycmF0aW9uLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElWb2ljZVBlbmRpbmdRdWVzdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92b2ljZUNsaWVudC92b2ljZUNsaWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZm9ybWF0UXVlc3Rpb25Qcm9tcHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdm9pY2VDbGllbnQvdm9pY2VQZW5kaW5nTmFycmF0aW9uLmpzJztcblxuc3VpdGUoJ2Zvcm1hdFF1ZXN0aW9uUHJvbXB0JywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHQvLyBFdmVyeSBleHBlY3RhdGlvbiBiZWxvdyBpcyBieXRlLWlkZW50aWNhbCB0byB0aGUgUHl0aG9uIGZpeHR1cmVzIGluXG5cdC8vIGFwcHMvdm9pY2VfY29kZS90ZXN0cy90ZXN0X3Nlc3Npb25fcGVuZGluZy5weTo6dGVzdF9mb3JtYXRfKi4gVGhlIGNsaWVudFxuXHQvLyBzcGVha3MgcXVlc3Rpb24gMSBvZiBhIGZvcm0gYW5kIHRoZSBiYWNrZW5kIHNwZWFrcyAyLi5OIGFzIGl0IHJlcGxpZXMgdG9cblx0Ly8gZWFjaCBhbnN3ZXIsIHNvIGEgZGl2ZXJnZW5jZSBpcyBhdWRpYmxlIGFzIHRoZSBhc3Npc3RhbnQgY2hhbmdpbmcgcmVnaXN0ZXJcblx0Ly8gcGFydHdheSB0aHJvdWdoIG9uZSBmb3JtLlxuXG5cdGNvbnN0IHNpbmdsZTogSVZvaWNlUGVuZGluZ1F1ZXN0aW9uID0ge1xuXHRcdGlkOiAncV9zaW5nbGUnLFxuXHRcdHR5cGU6ICdzaW5nbGVTZWxlY3QnLFxuXHRcdHRpdGxlOiAnV2hpY2ggcmVnaW9uPycsXG5cdFx0YWxsb3dfZnJlZWZvcm06IGZhbHNlLFxuXHRcdG9wdGlvbnM6IFtcblx0XHRcdHsgbGFiZWw6ICdXZXN0IFVTJywgdmFsdWU6ICd3ZXN0dXMnIH0sXG5cdFx0XHR7IGxhYmVsOiAnRWFzdCBVUycsIHZhbHVlOiAnZWFzdHVzJyB9LFxuXHRcdF0sXG5cdH07XG5cblx0Y29uc3QgbXVsdGk6IElWb2ljZVBlbmRpbmdRdWVzdGlvbiA9IHtcblx0XHRpZDogJ3FfbXVsdGknLFxuXHRcdHR5cGU6ICdtdWx0aVNlbGVjdCcsXG5cdFx0dGl0bGU6ICdXaGljaCBmZWF0dXJlcz8nLFxuXHRcdGFsbG93X2ZyZWVmb3JtOiB0cnVlLFxuXHRcdG9wdGlvbnM6IFtcblx0XHRcdHsgbGFiZWw6ICdBdXRoJywgdmFsdWU6ICdhdXRoJyB9LFxuXHRcdFx0eyBsYWJlbDogJ1NlYXJjaCcsIHZhbHVlOiAnc2VhcmNoJyB9LFxuXHRcdFx0eyBsYWJlbDogJ0JpbGxpbmcnLCB2YWx1ZTogJ2JpbGxpbmcnIH0sXG5cdFx0XSxcblx0fTtcblxuXHRjb25zdCB0ZXh0OiBJVm9pY2VQZW5kaW5nUXVlc3Rpb24gPSB7XG5cdFx0aWQ6ICdxX3RleHQnLFxuXHRcdHR5cGU6ICd0ZXh0Jyxcblx0XHR0aXRsZTogJ0FueXRoaW5nIGVsc2U/Jyxcblx0XHRhbGxvd19mcmVlZm9ybTogdHJ1ZSxcblx0XHRvcHRpb25zOiBbXSxcblx0fTtcblxuXHR0ZXN0KCdzaW5nbGUgc2VsZWN0JywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGZvcm1hdFF1ZXN0aW9uUHJvbXB0KHNpbmdsZSwgZmFsc2UpLFxuXHRcdFx0J1doaWNoIHJlZ2lvbj8gT3B0aW9uczogMSwgV2VzdCBVUy4gMiwgRWFzdCBVUy4nLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FwcGVuZHMgdGhlIHNraXAgaGludCB3aGVuIHRoZSBmb3JtIGFsbG93cyBza2lwcGluZycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRmb3JtYXRRdWVzdGlvblByb21wdChzaW5nbGUsIHRydWUpLFxuXHRcdFx0J1doaWNoIHJlZ2lvbj8gT3B0aW9uczogMSwgV2VzdCBVUy4gMiwgRWFzdCBVUy4gT3Igc2F5IHNraXAuJyxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZW50aW9ucyBmcmVlZm9ybSB3aGVuIHRoZSBxdWVzdGlvbiBhbGxvd3MgaXQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0Zm9ybWF0UXVlc3Rpb25Qcm9tcHQobXVsdGksIGZhbHNlKSxcblx0XHRcdCdXaGljaCBmZWF0dXJlcz8gT3B0aW9uczogMSwgQXV0aC4gMiwgU2VhcmNoLiAzLCBCaWxsaW5nLiBZb3UgY2FuIGFsc28gZ2l2ZSB5b3VyIG93biBhbnN3ZXIuJyxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhIHRleHQgcXVlc3Rpb24gaXMganVzdCBpdHMgdGl0bGUnLCAoKSA9PiB7XG5cdFx0Ly8gRnJlZWZvcm0tY2FwYWJsZSwgYnV0IHRoZSBoaW50IGlzIHN1cHByZXNzZWQ6IGl0IG9ubHkgbWVhbnMgc29tZXRoaW5nXG5cdFx0Ly8gd2hlbiB0aGVyZSBpcyBhIGxpc3Qgb2Ygb3B0aW9ucyB0byBhbnN3ZXIgKmluc3RlYWQgb2YqLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3JtYXRRdWVzdGlvblByb21wdCh0ZXh0LCBmYWxzZSksICdBbnl0aGluZyBlbHNlPycpO1xuXHR9KTtcblxuXHR0ZXN0KCdhIHRleHQgcXVlc3Rpb24gd2l0aCBza2lwJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3JtYXRRdWVzdGlvblByb21wdCh0ZXh0LCB0cnVlKSwgJ0FueXRoaW5nIGVsc2U/IE9yIHNheSBza2lwLicpO1xuXHR9KTtcblxuXHR0ZXN0KCd0b2xlcmF0ZXMgYW4gZW1wdHkgdGl0bGUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0Zm9ybWF0UXVlc3Rpb25Qcm9tcHQoeyAuLi5zaW5nbGUsIHRpdGxlOiAnJyB9LCBmYWxzZSksXG5cdFx0XHQnT3B0aW9uczogMSwgV2VzdCBVUy4gMiwgRWFzdCBVUy4nLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRzIHRoZSBvcmRpbmFscyBpdCB3YXMgZ2l2ZW4gcmF0aGVyIHRoYW4gcmVudW1iZXJpbmcnLCAoKSA9PiB7XG5cdFx0Ly8gVGhlIG9yZGluYWxzIGNvbWUgZnJvbSBgX2J1aWxkUGVuZGluZ1BheWxvYWRgLCB3aGljaCBhc3NpZ25zIHRoZW0gZnJvbVxuXHRcdC8vIHRoZSB3aWRnZXQncyBkaXNwbGF5ZWQgb3JkZXIuIFJlbnVtYmVyaW5nIGhlcmUgd291bGQgYmUgYSBzZWNvbmQsXG5cdFx0Ly8gaW5kZXBlbmRlbnQgc291cmNlIG9mIHRydXRoIGZvciB0aGUgbnVtYmVyIHRoZSB1c2VyIHNheXMgYmFjay5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRmb3JtYXRRdWVzdGlvblByb21wdChcblx0XHRcdFx0e1xuXHRcdFx0XHRcdC4uLnNpbmdsZSxcblx0XHRcdFx0XHRvcHRpb25zOiBbXG5cdFx0XHRcdFx0XHR7IGxhYmVsOiAnRWFzdCBVUycsIHZhbHVlOiAnZWFzdHVzJyB9LFxuXHRcdFx0XHRcdFx0eyBsYWJlbDogJ1dlc3QgVVMnLCB2YWx1ZTogJ3dlc3R1cycgfSxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRmYWxzZSxcblx0XHRcdCksXG5cdFx0XHQnV2hpY2ggcmVnaW9uPyBPcHRpb25zOiAxLCBFYXN0IFVTLiAyLCBXZXN0IFVTLicsXG5cdFx0KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUV4RCxTQUFTLDRCQUE0QjtBQUVyQyxNQUFNLHdCQUF3QixNQUFNO0FBQ25DLDBDQUF3QztBQVF4QyxRQUFNLFNBQWdDO0FBQUEsSUFDckMsSUFBSTtBQUFBLElBQ0osTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLElBQ1AsZ0JBQWdCO0FBQUEsSUFDaEIsU0FBUztBQUFBLE1BQ1IsRUFBRSxPQUFPLFdBQVcsT0FBTyxTQUFTO0FBQUEsTUFDcEMsRUFBRSxPQUFPLFdBQVcsT0FBTyxTQUFTO0FBQUEsSUFDckM7QUFBQSxFQUNEO0FBRUEsUUFBTSxRQUErQjtBQUFBLElBQ3BDLElBQUk7QUFBQSxJQUNKLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxJQUNQLGdCQUFnQjtBQUFBLElBQ2hCLFNBQVM7QUFBQSxNQUNSLEVBQUUsT0FBTyxRQUFRLE9BQU8sT0FBTztBQUFBLE1BQy9CLEVBQUUsT0FBTyxVQUFVLE9BQU8sU0FBUztBQUFBLE1BQ25DLEVBQUUsT0FBTyxXQUFXLE9BQU8sVUFBVTtBQUFBLElBQ3RDO0FBQUEsRUFDRDtBQUVBLFFBQU0sT0FBOEI7QUFBQSxJQUNuQyxJQUFJO0FBQUEsSUFDSixNQUFNO0FBQUEsSUFDTixPQUFPO0FBQUEsSUFDUCxnQkFBZ0I7QUFBQSxJQUNoQixTQUFTLENBQUM7QUFBQSxFQUNYO0FBRUEsT0FBSyxpQkFBaUIsTUFBTTtBQUMzQixXQUFPO0FBQUEsTUFDTixxQkFBcUIsUUFBUSxLQUFLO0FBQUEsTUFDbEM7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyx1REFBdUQsTUFBTTtBQUNqRSxXQUFPO0FBQUEsTUFDTixxQkFBcUIsUUFBUSxJQUFJO0FBQUEsTUFDakM7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxpREFBaUQsTUFBTTtBQUMzRCxXQUFPO0FBQUEsTUFDTixxQkFBcUIsT0FBTyxLQUFLO0FBQUEsTUFDakM7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxxQ0FBcUMsTUFBTTtBQUcvQyxXQUFPLFlBQVkscUJBQXFCLE1BQU0sS0FBSyxHQUFHLGdCQUFnQjtBQUFBLEVBQ3ZFLENBQUM7QUFFRCxPQUFLLDZCQUE2QixNQUFNO0FBQ3ZDLFdBQU8sWUFBWSxxQkFBcUIsTUFBTSxJQUFJLEdBQUcsNkJBQTZCO0FBQUEsRUFDbkYsQ0FBQztBQUVELE9BQUssNEJBQTRCLE1BQU07QUFDdEMsV0FBTztBQUFBLE1BQ04scUJBQXFCLEVBQUUsR0FBRyxRQUFRLE9BQU8sR0FBRyxHQUFHLEtBQUs7QUFBQSxNQUNwRDtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLDJEQUEyRCxNQUFNO0FBSXJFLFdBQU87QUFBQSxNQUNOO0FBQUEsUUFDQztBQUFBLFVBQ0MsR0FBRztBQUFBLFVBQ0gsU0FBUztBQUFBLFlBQ1IsRUFBRSxPQUFPLFdBQVcsT0FBTyxTQUFTO0FBQUEsWUFDcEMsRUFBRSxPQUFPLFdBQVcsT0FBTyxTQUFTO0FBQUEsVUFDckM7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
