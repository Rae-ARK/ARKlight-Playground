import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { combineVoiceInput } from "../../../browser/voiceClient/voiceInputUtils.js";
suite("combineVoiceInput", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("keeps typed input and appends the transcript", () => {
    assert.deepStrictEqual(
      [
        combineVoiceInput("", "hello world"),
        combineVoiceInput("please", "run the tests"),
        combineVoiceInput("please ", "run the tests"),
        combineVoiceInput("please\n", "run the tests"),
        combineVoiceInput("draft", "")
      ],
      [
        "hello world",
        "please run the tests",
        "please run the tests",
        "please\nrun the tests",
        "draft"
      ]
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3ZvaWNlQ2xpZW50L3ZvaWNlSW5wdXRVdGlscy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBjb21iaW5lVm9pY2VJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvdm9pY2VDbGllbnQvdm9pY2VJbnB1dFV0aWxzLmpzJztcblxuc3VpdGUoJ2NvbWJpbmVWb2ljZUlucHV0JywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdrZWVwcyB0eXBlZCBpbnB1dCBhbmQgYXBwZW5kcyB0aGUgdHJhbnNjcmlwdCcsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0W1xuXHRcdFx0XHRjb21iaW5lVm9pY2VJbnB1dCgnJywgJ2hlbGxvIHdvcmxkJyksXG5cdFx0XHRcdGNvbWJpbmVWb2ljZUlucHV0KCdwbGVhc2UnLCAncnVuIHRoZSB0ZXN0cycpLFxuXHRcdFx0XHRjb21iaW5lVm9pY2VJbnB1dCgncGxlYXNlICcsICdydW4gdGhlIHRlc3RzJyksXG5cdFx0XHRcdGNvbWJpbmVWb2ljZUlucHV0KCdwbGVhc2VcXG4nLCAncnVuIHRoZSB0ZXN0cycpLFxuXHRcdFx0XHRjb21iaW5lVm9pY2VJbnB1dCgnZHJhZnQnLCAnJyksXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHQnaGVsbG8gd29ybGQnLFxuXHRcdFx0XHQncGxlYXNlIHJ1biB0aGUgdGVzdHMnLFxuXHRcdFx0XHQncGxlYXNlIHJ1biB0aGUgdGVzdHMnLFxuXHRcdFx0XHQncGxlYXNlXFxucnVuIHRoZSB0ZXN0cycsXG5cdFx0XHRcdCdkcmFmdCcsXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHlCQUF5QjtBQUVsQyxNQUFNLHFCQUFxQixNQUFNO0FBQ2hDLDBDQUF3QztBQUV4QyxPQUFLLGdEQUFnRCxNQUFNO0FBQzFELFdBQU87QUFBQSxNQUNOO0FBQUEsUUFDQyxrQkFBa0IsSUFBSSxhQUFhO0FBQUEsUUFDbkMsa0JBQWtCLFVBQVUsZUFBZTtBQUFBLFFBQzNDLGtCQUFrQixXQUFXLGVBQWU7QUFBQSxRQUM1QyxrQkFBa0IsWUFBWSxlQUFlO0FBQUEsUUFDN0Msa0JBQWtCLFNBQVMsRUFBRTtBQUFBLE1BQzlCO0FBQUEsTUFDQTtBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
