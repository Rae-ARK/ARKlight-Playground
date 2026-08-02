import { isWindows, isLinux } from "../../../../base/common/platform.js";
import { getKeyboardLayoutId } from "../../../../platform/keyboardLayout/common/keyboardLayout.js";
function deserializeMapping(serializedMapping) {
  const mapping = serializedMapping;
  const ret = {};
  for (const key in mapping) {
    const result = mapping[key];
    if (result.length) {
      const value = result[0];
      const withShift = result[1];
      const withAltGr = result[2];
      const withShiftAltGr = result[3];
      const mask = Number(result[4]);
      const vkey = result.length === 6 ? result[5] : void 0;
      ret[key] = {
        "value": value,
        "vkey": vkey,
        "withShift": withShift,
        "withAltGr": withAltGr,
        "withShiftAltGr": withShiftAltGr,
        "valueIsDeadKey": (mask & 1) > 0,
        "withShiftIsDeadKey": (mask & 2) > 0,
        "withAltGrIsDeadKey": (mask & 4) > 0,
        "withShiftAltGrIsDeadKey": (mask & 8) > 0
      };
    } else {
      ret[key] = {
        "value": "",
        "valueIsDeadKey": false,
        "withShift": "",
        "withShiftIsDeadKey": false,
        "withAltGr": "",
        "withAltGrIsDeadKey": false,
        "withShiftAltGr": "",
        "withShiftAltGrIsDeadKey": false
      };
    }
  }
  return ret;
}
class KeymapInfo {
  constructor(layout, secondaryLayouts, keyboardMapping, isUserKeyboardLayout) {
    this.layout = layout;
    this.secondaryLayouts = secondaryLayouts;
    this.mapping = deserializeMapping(keyboardMapping);
    this.isUserKeyboardLayout = !!isUserKeyboardLayout;
    this.layout.isUserKeyboardLayout = !!isUserKeyboardLayout;
  }
  static createKeyboardLayoutFromDebugInfo(layout, value, isUserKeyboardLayout) {
    const keyboardLayoutInfo = new KeymapInfo(layout, [], {}, true);
    keyboardLayoutInfo.mapping = value;
    return keyboardLayoutInfo;
  }
  update(other) {
    this.layout = other.layout;
    this.secondaryLayouts = other.secondaryLayouts;
    this.mapping = other.mapping;
    this.isUserKeyboardLayout = other.isUserKeyboardLayout;
    this.layout.isUserKeyboardLayout = other.isUserKeyboardLayout;
  }
  getScore(other) {
    let score = 0;
    for (const key in other) {
      if (isWindows && (key === "Backslash" || key === "KeyQ")) {
        continue;
      }
      if (isLinux && (key === "Backspace" || key === "Escape")) {
        continue;
      }
      const currentMapping = this.mapping[key];
      if (currentMapping === void 0) {
        score -= 1;
      }
      const otherMapping = other[key];
      if (currentMapping && otherMapping && currentMapping.value !== otherMapping.value) {
        score -= 1;
      }
    }
    return score;
  }
  equal(other) {
    if (this.isUserKeyboardLayout !== other.isUserKeyboardLayout) {
      return false;
    }
    if (getKeyboardLayoutId(this.layout) !== getKeyboardLayoutId(other.layout)) {
      return false;
    }
    return this.fuzzyEqual(other.mapping);
  }
  fuzzyEqual(other) {
    for (const key in other) {
      if (isWindows && (key === "Backslash" || key === "KeyQ")) {
        continue;
      }
      if (this.mapping[key] === void 0) {
        return false;
      }
      const currentMapping = this.mapping[key];
      const otherMapping = other[key];
      if (currentMapping.value !== otherMapping.value) {
        return false;
      }
    }
    return true;
  }
}
export {
  KeymapInfo
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9rZXliaW5kaW5nL2NvbW1vbi9rZXltYXBJbmZvLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgaXNXaW5kb3dzLCBpc0xpbnV4IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgZ2V0S2V5Ym9hcmRMYXlvdXRJZCwgSUtleWJvYXJkTGF5b3V0SW5mbyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJvYXJkTGF5b3V0L2NvbW1vbi9rZXlib2FyZExheW91dC5qcyc7XG5cbmZ1bmN0aW9uIGRlc2VyaWFsaXplTWFwcGluZyhzZXJpYWxpemVkTWFwcGluZzogSVNlcmlhbGl6ZWRNYXBwaW5nKSB7XG5cdGNvbnN0IG1hcHBpbmcgPSBzZXJpYWxpemVkTWFwcGluZztcblxuXHRjb25zdCByZXQ6IHsgW2tleTogc3RyaW5nXTogYW55IH0gPSB7fTtcblx0Zm9yIChjb25zdCBrZXkgaW4gbWFwcGluZykge1xuXHRcdGNvbnN0IHJlc3VsdDogKHN0cmluZyB8IG51bWJlcilbXSA9IG1hcHBpbmdba2V5XTtcblx0XHRpZiAocmVzdWx0Lmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSByZXN1bHRbMF07XG5cdFx0XHRjb25zdCB3aXRoU2hpZnQgPSByZXN1bHRbMV07XG5cdFx0XHRjb25zdCB3aXRoQWx0R3IgPSByZXN1bHRbMl07XG5cdFx0XHRjb25zdCB3aXRoU2hpZnRBbHRHciA9IHJlc3VsdFszXTtcblx0XHRcdGNvbnN0IG1hc2sgPSBOdW1iZXIocmVzdWx0WzRdKTtcblx0XHRcdGNvbnN0IHZrZXkgPSByZXN1bHQubGVuZ3RoID09PSA2ID8gcmVzdWx0WzVdIDogdW5kZWZpbmVkO1xuXHRcdFx0cmV0W2tleV0gPSB7XG5cdFx0XHRcdCd2YWx1ZSc6IHZhbHVlLFxuXHRcdFx0XHQndmtleSc6IHZrZXksXG5cdFx0XHRcdCd3aXRoU2hpZnQnOiB3aXRoU2hpZnQsXG5cdFx0XHRcdCd3aXRoQWx0R3InOiB3aXRoQWx0R3IsXG5cdFx0XHRcdCd3aXRoU2hpZnRBbHRHcic6IHdpdGhTaGlmdEFsdEdyLFxuXHRcdFx0XHQndmFsdWVJc0RlYWRLZXknOiAobWFzayAmIDEpID4gMCxcblx0XHRcdFx0J3dpdGhTaGlmdElzRGVhZEtleSc6IChtYXNrICYgMikgPiAwLFxuXHRcdFx0XHQnd2l0aEFsdEdySXNEZWFkS2V5JzogKG1hc2sgJiA0KSA+IDAsXG5cdFx0XHRcdCd3aXRoU2hpZnRBbHRHcklzRGVhZEtleSc6IChtYXNrICYgOCkgPiAwXG5cdFx0XHR9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXRba2V5XSA9IHtcblx0XHRcdFx0J3ZhbHVlJzogJycsXG5cdFx0XHRcdCd2YWx1ZUlzRGVhZEtleSc6IGZhbHNlLFxuXHRcdFx0XHQnd2l0aFNoaWZ0JzogJycsXG5cdFx0XHRcdCd3aXRoU2hpZnRJc0RlYWRLZXknOiBmYWxzZSxcblx0XHRcdFx0J3dpdGhBbHRHcic6ICcnLFxuXHRcdFx0XHQnd2l0aEFsdEdySXNEZWFkS2V5JzogZmFsc2UsXG5cdFx0XHRcdCd3aXRoU2hpZnRBbHRHcic6ICcnLFxuXHRcdFx0XHQnd2l0aFNoaWZ0QWx0R3JJc0RlYWRLZXknOiBmYWxzZVxuXHRcdFx0fTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gcmV0O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElSYXdNaXhlZEtleWJvYXJkTWFwcGluZyB7XG5cdFtrZXk6IHN0cmluZ106IHtcblx0XHR2YWx1ZTogc3RyaW5nO1xuXHRcdHdpdGhTaGlmdDogc3RyaW5nO1xuXHRcdHdpdGhBbHRHcjogc3RyaW5nO1xuXHRcdHdpdGhTaGlmdEFsdEdyOiBzdHJpbmc7XG5cdFx0dmFsdWVJc0RlYWRLZXk/OiBib29sZWFuO1xuXHRcdHdpdGhTaGlmdElzRGVhZEtleT86IGJvb2xlYW47XG5cdFx0d2l0aEFsdEdySXNEZWFkS2V5PzogYm9vbGVhbjtcblx0XHR3aXRoU2hpZnRBbHRHcklzRGVhZEtleT86IGJvb2xlYW47XG5cblx0fTtcbn1cblxuaW50ZXJmYWNlIElTZXJpYWxpemVkTWFwcGluZyB7XG5cdFtrZXk6IHN0cmluZ106IChzdHJpbmcgfCBudW1iZXIpW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUtleW1hcEluZm8ge1xuXHRsYXlvdXQ6IElLZXlib2FyZExheW91dEluZm87XG5cdHNlY29uZGFyeUxheW91dHM6IElLZXlib2FyZExheW91dEluZm9bXTtcblx0bWFwcGluZzogSVNlcmlhbGl6ZWRNYXBwaW5nO1xuXHRpc1VzZXJLZXlib2FyZExheW91dD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBLZXltYXBJbmZvIHtcblx0bWFwcGluZzogSVJhd01peGVkS2V5Ym9hcmRNYXBwaW5nO1xuXHRpc1VzZXJLZXlib2FyZExheW91dDogYm9vbGVhbjtcblxuXHRjb25zdHJ1Y3RvcihwdWJsaWMgbGF5b3V0OiBJS2V5Ym9hcmRMYXlvdXRJbmZvLCBwdWJsaWMgc2Vjb25kYXJ5TGF5b3V0czogSUtleWJvYXJkTGF5b3V0SW5mb1tdLCBrZXlib2FyZE1hcHBpbmc6IElTZXJpYWxpemVkTWFwcGluZywgaXNVc2VyS2V5Ym9hcmRMYXlvdXQ/OiBib29sZWFuKSB7XG5cdFx0dGhpcy5tYXBwaW5nID0gZGVzZXJpYWxpemVNYXBwaW5nKGtleWJvYXJkTWFwcGluZyk7XG5cdFx0dGhpcy5pc1VzZXJLZXlib2FyZExheW91dCA9ICEhaXNVc2VyS2V5Ym9hcmRMYXlvdXQ7XG5cdFx0dGhpcy5sYXlvdXQuaXNVc2VyS2V5Ym9hcmRMYXlvdXQgPSAhIWlzVXNlcktleWJvYXJkTGF5b3V0O1xuXHR9XG5cblx0c3RhdGljIGNyZWF0ZUtleWJvYXJkTGF5b3V0RnJvbURlYnVnSW5mbyhsYXlvdXQ6IElLZXlib2FyZExheW91dEluZm8sIHZhbHVlOiBJUmF3TWl4ZWRLZXlib2FyZE1hcHBpbmcsIGlzVXNlcktleWJvYXJkTGF5b3V0PzogYm9vbGVhbik6IEtleW1hcEluZm8ge1xuXHRcdGNvbnN0IGtleWJvYXJkTGF5b3V0SW5mbyA9IG5ldyBLZXltYXBJbmZvKGxheW91dCwgW10sIHt9LCB0cnVlKTtcblx0XHRrZXlib2FyZExheW91dEluZm8ubWFwcGluZyA9IHZhbHVlO1xuXHRcdHJldHVybiBrZXlib2FyZExheW91dEluZm87XG5cdH1cblxuXHR1cGRhdGUob3RoZXI6IEtleW1hcEluZm8pIHtcblx0XHR0aGlzLmxheW91dCA9IG90aGVyLmxheW91dDtcblx0XHR0aGlzLnNlY29uZGFyeUxheW91dHMgPSBvdGhlci5zZWNvbmRhcnlMYXlvdXRzO1xuXHRcdHRoaXMubWFwcGluZyA9IG90aGVyLm1hcHBpbmc7XG5cdFx0dGhpcy5pc1VzZXJLZXlib2FyZExheW91dCA9IG90aGVyLmlzVXNlcktleWJvYXJkTGF5b3V0O1xuXHRcdHRoaXMubGF5b3V0LmlzVXNlcktleWJvYXJkTGF5b3V0ID0gb3RoZXIuaXNVc2VyS2V5Ym9hcmRMYXlvdXQ7XG5cdH1cblxuXHRnZXRTY29yZShvdGhlcjogSVJhd01peGVkS2V5Ym9hcmRNYXBwaW5nKTogbnVtYmVyIHtcblx0XHRsZXQgc2NvcmUgPSAwO1xuXHRcdGZvciAoY29uc3Qga2V5IGluIG90aGVyKSB7XG5cdFx0XHRpZiAoaXNXaW5kb3dzICYmIChrZXkgPT09ICdCYWNrc2xhc2gnIHx8IGtleSA9PT0gJ0tleVEnKSkge1xuXHRcdFx0XHQvLyBrZXltYXAgZnJvbSBDaHJvbWl1bSBpcyBwcm9iYWJseSB3cm9uZy5cblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpc0xpbnV4ICYmIChrZXkgPT09ICdCYWNrc3BhY2UnIHx8IGtleSA9PT0gJ0VzY2FwZScpKSB7XG5cdFx0XHRcdC8vIG5hdGl2ZSBrZXltYXAgZG9lc24ndCBhbGlnbiB3aXRoIGtleWJvYXJkIGV2ZW50XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjdXJyZW50TWFwcGluZyA9IHRoaXMubWFwcGluZ1trZXldO1xuXG5cdFx0XHRpZiAoY3VycmVudE1hcHBpbmcgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRzY29yZSAtPSAxO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBvdGhlck1hcHBpbmcgPSBvdGhlcltrZXldO1xuXG5cdFx0XHRpZiAoY3VycmVudE1hcHBpbmcgJiYgb3RoZXJNYXBwaW5nICYmIGN1cnJlbnRNYXBwaW5nLnZhbHVlICE9PSBvdGhlck1hcHBpbmcudmFsdWUpIHtcblx0XHRcdFx0c2NvcmUgLT0gMTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gc2NvcmU7XG5cdH1cblxuXHRlcXVhbChvdGhlcjogS2V5bWFwSW5mbyk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLmlzVXNlcktleWJvYXJkTGF5b3V0ICE9PSBvdGhlci5pc1VzZXJLZXlib2FyZExheW91dCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmIChnZXRLZXlib2FyZExheW91dElkKHRoaXMubGF5b3V0KSAhPT0gZ2V0S2V5Ym9hcmRMYXlvdXRJZChvdGhlci5sYXlvdXQpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZnV6enlFcXVhbChvdGhlci5tYXBwaW5nKTtcblx0fVxuXG5cdGZ1enp5RXF1YWwob3RoZXI6IElSYXdNaXhlZEtleWJvYXJkTWFwcGluZyk6IGJvb2xlYW4ge1xuXHRcdGZvciAoY29uc3Qga2V5IGluIG90aGVyKSB7XG5cdFx0XHRpZiAoaXNXaW5kb3dzICYmIChrZXkgPT09ICdCYWNrc2xhc2gnIHx8IGtleSA9PT0gJ0tleVEnKSkge1xuXHRcdFx0XHQvLyBrZXltYXAgZnJvbSBDaHJvbWl1bSBpcyBwcm9iYWJseSB3cm9uZy5cblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5tYXBwaW5nW2tleV0gPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGN1cnJlbnRNYXBwaW5nID0gdGhpcy5tYXBwaW5nW2tleV07XG5cdFx0XHRjb25zdCBvdGhlck1hcHBpbmcgPSBvdGhlcltrZXldO1xuXG5cdFx0XHRpZiAoY3VycmVudE1hcHBpbmcudmFsdWUgIT09IG90aGVyTWFwcGluZy52YWx1ZSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsV0FBVyxlQUFlO0FBQ25DLFNBQVMsMkJBQWdEO0FBRXpELFNBQVMsbUJBQW1CLG1CQUF1QztBQUNsRSxRQUFNLFVBQVU7QUFFaEIsUUFBTSxNQUE4QixDQUFDO0FBQ3JDLGFBQVcsT0FBTyxTQUFTO0FBQzFCLFVBQU0sU0FBOEIsUUFBUSxHQUFHO0FBQy9DLFFBQUksT0FBTyxRQUFRO0FBQ2xCLFlBQU0sUUFBUSxPQUFPLENBQUM7QUFDdEIsWUFBTSxZ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
