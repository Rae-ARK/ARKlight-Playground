import assert from "assert";
import { Color } from "../../../../../../base/common/color.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { ColorScheme } from "../../../../../../platform/theme/common/theme.js";
import { chatDictationActiveMicGlow, chatVoiceGlowBaseColor, chatVoiceSpeakingGlow } from "../../../common/widget/chatColors.js";
import { resolveDictationMicAccent } from "../../../browser/speechToText/dictationMicGlow.js";
import { isGlowingVoiceState, resolveVoiceGlowColors, resolveVoiceRimAccent, VOICE_GLOW_SPEAKING_HUE_SHIFT } from "../../../browser/voiceClient/voiceGlow.js";
suite("VoiceGlow", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("only the talking states glow", () => {
    const states = ["idle", "listening", "speaking", "processing", "error"];
    assert.deepStrictEqual(
      states.filter(isGlowingVoiceState),
      ["listening", "speaking"]
    );
  });
  test("derives the speaking accent from the theme base color", () => {
    const base = Color.fromHex("#58A6FF");
    const colors = resolveVoiceGlowColors({ getColor: (id) => id === chatVoiceGlowBaseColor ? base : void 0 });
    assert.deepStrictEqual(
      {
        listening: colors.listening.toString(),
        speakingHue: Math.round(colors.speaking.hsla.h)
      },
      {
        listening: base.toString(),
        speakingHue: Math.round((base.hsla.h + VOICE_GLOW_SPEAKING_HUE_SHIFT + 360) % 360)
      }
    );
  });
  test("an explicitly themed state wins over the derived hue", () => {
    const pinned = Color.fromHex("#FF00AA");
    const colors = resolveVoiceGlowColors({
      getColor: (id) => id === chatVoiceGlowBaseColor ? Color.fromHex("#58A6FF") : id === chatVoiceSpeakingGlow ? pinned : void 0
    });
    assert.strictEqual(colors.speaking.toString(), pinned.toString());
  });
  test("the dictation microphone paints the listening rim color", () => {
    const base = Color.fromHex("#58A6FF");
    const washedOut = Color.fromHex("#7A8B99");
    const theme = (type, accent) => ({
      type,
      getColor: (id) => id === chatVoiceGlowBaseColor || id === chatDictationActiveMicGlow ? accent : void 0
    });
    const resolve = (type, kind, accent) => {
      const scheme = theme(type, accent);
      const format = (color) => {
        const rim = resolveVoiceRimAccent(color, "cool", kind);
        return `${rim.hue.toFixed(1)} ${rim.saturation}% ${rim.lightness}%`;
      };
      return {
        mic: format(resolveDictationMicAccent(scheme)),
        voiceMode: format(resolveVoiceGlowColors(scheme).listening)
      };
    };
    assert.deepStrictEqual(
      {
        dark: resolve(ColorScheme.DARK, "dark", base),
        light: resolve(ColorScheme.LIGHT, "light", base),
        washedOut: resolve(ColorScheme.DARK, "dark", washedOut)
      },
      {
        dark: { mic: "202.0 96% 56%", voiceMode: "202.0 96% 56%" },
        light: { mic: "202.0 96% 72%", voiceMode: "202.0 96% 72%" },
        washedOut: { mic: "197.0 70% 56%", voiceMode: "197.0 70% 56%" }
      }
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3ZvaWNlQ2xpZW50L3ZvaWNlR2xvdy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ29sb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xvci5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IENvbG9yU2NoZW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IElDb2xvclRoZW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBjaGF0RGljdGF0aW9uQWN0aXZlTWljR2xvdywgY2hhdFZvaWNlR2xvd0Jhc2VDb2xvciwgY2hhdFZvaWNlU3BlYWtpbmdHbG93IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3dpZGdldC9jaGF0Q29sb3JzLmpzJztcbmltcG9ydCB7IHJlc29sdmVEaWN0YXRpb25NaWNBY2NlbnQgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3NwZWVjaFRvVGV4dC9kaWN0YXRpb25NaWNHbG93LmpzJztcbmltcG9ydCB7IGlzR2xvd2luZ1ZvaWNlU3RhdGUsIEdsb3dUaGVtZUtpbmQsIHJlc29sdmVWb2ljZUdsb3dDb2xvcnMsIHJlc29sdmVWb2ljZVJpbUFjY2VudCwgVk9JQ0VfR0xPV19TUEVBS0lOR19IVUVfU0hJRlQgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3ZvaWNlQ2xpZW50L3ZvaWNlR2xvdy5qcyc7XG5cbnN1aXRlKCdWb2ljZUdsb3cnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ29ubHkgdGhlIHRhbGtpbmcgc3RhdGVzIGdsb3cnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGVzID0gWydpZGxlJywgJ2xpc3RlbmluZycsICdzcGVha2luZycsICdwcm9jZXNzaW5nJywgJ2Vycm9yJ10gYXMgY29uc3Q7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHN0YXRlcy5maWx0ZXIoaXNHbG93aW5nVm9pY2VTdGF0ZSksXG5cdFx0XHRbJ2xpc3RlbmluZycsICdzcGVha2luZyddXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZGVyaXZlcyB0aGUgc3BlYWtpbmcgYWNjZW50IGZyb20gdGhlIHRoZW1lIGJhc2UgY29sb3InLCAoKSA9PiB7XG5cdFx0Y29uc3QgYmFzZSA9IENvbG9yLmZyb21IZXgoJyM1OEE2RkYnKTtcblx0XHRjb25zdCBjb2xvcnMgPSByZXNvbHZlVm9pY2VHbG93Q29sb3JzKHsgZ2V0Q29sb3I6IGlkID0+IGlkID09PSBjaGF0Vm9pY2VHbG93QmFzZUNvbG9yID8gYmFzZSA6IHVuZGVmaW5lZCB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0e1xuXHRcdFx0XHRsaXN0ZW5pbmc6IGNvbG9ycy5saXN0ZW5pbmcudG9TdHJpbmcoKSxcblx0XHRcdFx0c3BlYWtpbmdIdWU6IE1hdGgucm91bmQoY29sb3JzLnNwZWFraW5nLmhzbGEuaCksXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRsaXN0ZW5pbmc6IGJhc2UudG9TdHJpbmcoKSxcblx0XHRcdFx0c3BlYWtpbmdIdWU6IE1hdGgucm91bmQoKGJhc2UuaHNsYS5oICsgVk9JQ0VfR0xPV19TUEVBS0lOR19IVUVfU0hJRlQgKyAzNjApICUgMzYwKSxcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhbiBleHBsaWNpdGx5IHRoZW1lZCBzdGF0ZSB3aW5zIG92ZXIgdGhlIGRlcml2ZWQgaHVlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBpbm5lZCA9IENvbG9yLmZyb21IZXgoJyNGRjAwQUEnKTtcblx0XHRjb25zdCBjb2xvcnMgPSByZXNvbHZlVm9pY2VHbG93Q29sb3JzKHtcblx0XHRcdGdldENvbG9yOiBpZCA9PiBpZCA9PT0gY2hhdFZvaWNlR2xvd0Jhc2VDb2xvciA/IENvbG9yLmZyb21IZXgoJyM1OEE2RkYnKSA6IGlkID09PSBjaGF0Vm9pY2VTcGVha2luZ0dsb3cgPyBwaW5uZWQgOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbG9ycy5zcGVha2luZy50b1N0cmluZygpLCBwaW5uZWQudG9TdHJpbmcoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RoZSBkaWN0YXRpb24gbWljcm9waG9uZSBwYWludHMgdGhlIGxpc3RlbmluZyByaW0gY29sb3InLCAoKSA9PiB7XG5cdFx0Ly8gVHdvIHRoaW5ncyBtdXN0IGhvbGQ6IHRoZSB0dW5pbmcgaXRzZWxmIChodWUgbnVkZ2UsIHNhdHVyYXRpb24gZmxvb3IsXG5cdFx0Ly8gcGVyLXRoZW1lIGxpZ2h0bmVzcykgYW5kIHRoZSBmYWN0IHRoYXQgZGljdGF0aW9uIGFuZCBWb2ljZSBNb2RlIGFycml2ZVxuXHRcdC8vIGF0IGl0IGZyb20gdGhlaXIgb3duIHRva2Vucy4gU25hcHNob3R0aW5nIHRoZSByZXNvbHZlZCB2YWx1ZXMgcGlucyB0aGVcblx0XHQvLyBmb3JtZXIgXHUyMDE0IGNvbXBhcmluZyB0aGUgdHdvIHBhdGhzIGFsb25lIHdvdWxkIGNhbmNlbCBpdCBvdXQuXG5cdFx0Y29uc3QgYmFzZSA9IENvbG9yLmZyb21IZXgoJyM1OEE2RkYnKTtcblx0XHQvLyBEZWxpYmVyYXRlbHkgdW5kZXIgdGhlIHNhdHVyYXRpb24gZmxvb3IsIHNvIHRoZSBjbGFtcCBpcyBleGVyY2lzZWQuXG5cdFx0Y29uc3Qgd2FzaGVkT3V0ID0gQ29sb3IuZnJvbUhleCgnIzdBOEI5OScpO1xuXHRcdGNvbnN0IHRoZW1lID0gKHR5cGU6IENvbG9yU2NoZW1lLCBhY2NlbnQ6IENvbG9yKSA9PiAoe1xuXHRcdFx0dHlwZSxcblx0XHRcdGdldENvbG9yOiAoaWQ6IHN0cmluZykgPT4gaWQgPT09IGNoYXRWb2ljZUdsb3dCYXNlQ29sb3IgfHwgaWQgPT09IGNoYXREaWN0YXRpb25BY3RpdmVNaWNHbG93ID8gYWNjZW50IDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHJlc29sdmUgPSAodHlwZTogQ29sb3JTY2hlbWUsIGtpbmQ6IEdsb3dUaGVtZUtpbmQsIGFjY2VudDogQ29sb3IpID0+IHtcblx0XHRcdGNvbnN0IHNjaGVtZSA9IHRoZW1lKHR5cGUsIGFjY2VudCk7XG5cdFx0XHRjb25zdCBmb3JtYXQgPSAoY29sb3I6IENvbG9yKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJpbSA9IHJlc29sdmVWb2ljZVJpbUFjY2VudChjb2xvciwgJ2Nvb2wnLCBraW5kKTtcblx0XHRcdFx0cmV0dXJuIGAke3JpbS5odWUudG9GaXhlZCgxKX0gJHtyaW0uc2F0dXJhdGlvbn0lICR7cmltLmxpZ2h0bmVzc30lYDtcblx0XHRcdH07XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRtaWM6IGZvcm1hdChyZXNvbHZlRGljdGF0aW9uTWljQWNjZW50KHNjaGVtZSBhcyBJQ29sb3JUaGVtZSkhKSxcblx0XHRcdFx0dm9pY2VNb2RlOiBmb3JtYXQocmVzb2x2ZVZvaWNlR2xvd0NvbG9ycyhzY2hlbWUpLmxpc3RlbmluZyksXG5cdFx0XHR9O1xuXHRcdH07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0e1xuXHRcdFx0XHRkYXJrOiByZXNvbHZlKENvbG9yU2NoZW1lLkRBUkssICdkYXJrJywgYmFzZSksXG5cdFx0XHRcdGxpZ2h0OiByZXNvbHZlKENvbG9yU2NoZW1lLkxJR0hULCAnbGlnaHQnLCBiYXNlKSxcblx0XHRcdFx0d2FzaGVkT3V0OiByZXNvbHZlKENvbG9yU2NoZW1lLkRBUkssICdkYXJrJywgd2FzaGVkT3V0KSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGRhcms6IHsgbWljOiAnMjAyLjAgOTYlIDU2JScsIHZvaWNlTW9kZTogJzIwMi4wIDk2JSA1NiUnIH0sXG5cdFx0XHRcdGxpZ2h0OiB7IG1pYzogJzIwMi4wIDk2JSA3MiUnLCB2b2ljZU1vZGU6ICcyMDIuMCA5NiUgNzIlJyB9LFxuXHRcdFx0XHR3YXNoZWRPdXQ6IHsgbWljOiAnMTk3LjAgNzAlIDU2JScsIHZvaWNlTW9kZTogJzE5Ny4wIDcwJSA1NiUnIH0sXG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGFBQWE7QUFDdEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxtQkFBbUI7QUFFNUIsU0FBUyw0QkFBNEIsd0JBQXdCLDZCQUE2QjtBQUMxRixTQUFTLGlDQUFpQztBQUMxQyxTQUFTLHFC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
