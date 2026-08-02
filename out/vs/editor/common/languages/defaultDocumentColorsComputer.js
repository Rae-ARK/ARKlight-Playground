import { Color, HSLA } from "../../../base/common/color.js";
function _parseCaptureGroups(captureGroups) {
  const values = [];
  for (const captureGroup of captureGroups) {
    const parsedNumber = Number(captureGroup);
    if (parsedNumber || parsedNumber === 0 && captureGroup.replace(/\s/g, "") !== "") {
      values.push(parsedNumber);
    }
  }
  return values;
}
function _toIColor(r, g, b, a) {
  return {
    red: r / 255,
    blue: b / 255,
    green: g / 255,
    alpha: a
  };
}
function _findRange(model, match) {
  const index = match.index;
  const length = match[0].length;
  if (index === void 0) {
    return;
  }
  const startPosition = model.positionAt(index);
  const range = {
    startLineNumber: startPosition.lineNumber,
    startColumn: startPosition.column,
    endLineNumber: startPosition.lineNumber,
    endColumn: startPosition.column + length
  };
  return range;
}
function _findHexColorInformation(range, hexValue) {
  if (!range) {
    return;
  }
  const parsedHexColor = Color.Format.CSS.parseHex(hexValue);
  if (!parsedHexColor) {
    return;
  }
  return {
    range,
    color: _toIColor(parsedHexColor.rgba.r, parsedHexColor.rgba.g, parsedHexColor.rgba.b, parsedHexColor.rgba.a)
  };
}
function _findRGBColorInformation(range, matches, isAlpha) {
  if (!range || matches.length !== 1) {
    return;
  }
  const match = matches[0];
  const captureGroups = match.values();
  const parsedRegex = _parseCaptureGroups(captureGroups);
  return {
    range,
    color: _toIColor(parsedRegex[0], parsedRegex[1], parsedRegex[2], isAlpha ? parsedRegex[3] : 1)
  };
}
function _findHSLColorInformation(range, matches, isAlpha) {
  if (!range || matches.length !== 1) {
    return;
  }
  const match = matches[0];
  const captureGroups = match.values();
  const parsedRegex = _parseCaptureGroups(captureGroups);
  const colorEquivalent = new Color(new HSLA(parsedRegex[0], parsedRegex[1] / 100, parsedRegex[2] / 100, isAlpha ? parsedRegex[3] : 1));
  return {
    range,
    color: _toIColor(colorEquivalent.rgba.r, colorEquivalent.rgba.g, colorEquivalent.rgba.b, colorEquivalent.rgba.a)
  };
}
function _findMatches(model, regex) {
  if (typeof model === "string") {
    return [...model.matchAll(regex)];
  } else {
    return model.findMatches(regex);
  }
}
function computeColors(model) {
  const result = [];
  const initialValidationRegex = /\b(rgb|rgba|hsl|hsla)(\([0-9\s,.\%\/]*\))|^(#)([A-Fa-f0-9]{3})\b|^(#)([A-Fa-f0-9]{4})\b|^(#)([A-Fa-f0-9]{6})\b|^(#)([A-Fa-f0-9]{8})\b|(?<=['"\s])(#)([A-Fa-f0-9]{3})\b|(?<=['"\s])(#)([A-Fa-f0-9]{4})\b|(?<=['"\s])(#)([A-Fa-f0-9]{6})\b|(?<=['"\s])(#)([A-Fa-f0-9]{8})\b/gm;
  const initialValidationMatches = _findMatches(model, initialValidationRegex);
  if (initialValidationMatches.length > 0) {
    for (const initialMatch of initialValidationMatches) {
      const initialCaptureGroups = initialMatch.filter((captureGroup) => captureGroup !== void 0);
      const colorScheme = initialCaptureGroups[1];
      const colorParameters = initialCaptureGroups[2];
      if (!colorParameters) {
        continue;
      }
      let colorInformation;
      if (colorScheme === "rgb") {
        const regexParameters = /^\(\s*(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\s*[\s,]\s*(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\s*[\s,]\s*(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\s*\)$/gm;
        colorInformation = _findRGBColorInformation(_findRange(model, initialMatch), _findMatches(colorParameters, regexParameters), false);
      } else if (colorScheme === "rgba") {
        const regexParameters = /^\(\s*(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\s*[\s,]\s*(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\s*[\s,]\s*(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\s*(?:[\s,]|[\s]*\/)\s*(0[.][0-9]+|[.][0-9]+|[01][.]|[01])\s*\)$/gm;
        colorInformation = _findRGBColorInformation(_findRange(model, initialMatch), _findMatches(colorParameters, regexParameters), true);
      } else if (colorScheme === "hsl") {
        const regexParameters = /^\(\s*((?:360(?:\.0+)?|(?:36[0]|3[0-5][0-9]|[12][0-9][0-9]|[1-9]?[0-9])(?:\.\d+)?))\s*[\s,]\s*(100(?:\.0+)?|\d{1,2}[.]\d*|\d{1,2})%\s*[\s,]\s*(100(?:\.0+)?|\d{1,2}[.]\d*|\d{1,2})%\s*\)$/gm;
        colorInformation = _findHSLColorInformation(_findRange(model, initialMatch), _findMatches(colorParameters, regexParameters), false);
      } else if (colorScheme === "hsla") {
        const regexParameters = /^\(\s*((?:360(?:\.0+)?|(?:36[0]|3[0-5][0-9]|[12][0-9][0-9]|[1-9]?[0-9])(?:\.\d+)?))\s*[\s,]\s*(100(?:\.0+)?|\d{1,2}[.]\d*|\d{1,2})%\s*[\s,]\s*(100(?:\.0+)?|\d{1,2}[.]\d*|\d{1,2})%\s*(?:[\s,]|[\s]*\/)\s*(0[.][0-9]+|[.][0-9]+|[01][.]0*|[01])\s*\)$/gm;
        colorInformation = _findHSLColorInformation(_findRange(model, initialMatch), _findMatches(colorParameters, regexParameters), true);
      } else if (colorScheme === "#") {
        colorInformation = _findHexColorInformation(_findRange(model, initialMatch), colorScheme + colorParameters);
      }
      if (colorInformation) {
        result.push(colorInformation);
      }
    }
  }
  return result;
}
function computeDefaultDocumentColors(model) {
  if (!model || typeof model.getValue !== "function" || typeof model.positionAt !== "function") {
    return [];
  }
  return computeColors(model);
}
export {
  computeDefaultDocumentColors
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2RlZmF1bHREb2N1bWVudENvbG9yc0NvbXB1dGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCB7IENvbG9yLCBIU0xBIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgSVBvc2l0aW9uIH0gZnJvbSAnLi4vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UgfSBmcm9tICcuLi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElDb2xvciwgSUNvbG9ySW5mb3JtYXRpb24gfSBmcm9tICcuLi9sYW5ndWFnZXMuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElEb2N1bWVudENvbG9yQ29tcHV0ZXJUYXJnZXQge1xuXHRnZXRWYWx1ZSgpOiBzdHJpbmc7XG5cdHBvc2l0aW9uQXQob2Zmc2V0OiBudW1iZXIpOiBJUG9zaXRpb247XG5cdGZpbmRNYXRjaGVzKHJlZ2V4OiBSZWdFeHApOiBSZWdFeHBNYXRjaEFycmF5W107XG59XG5cbmZ1bmN0aW9uIF9wYXJzZUNhcHR1cmVHcm91cHMoY2FwdHVyZUdyb3VwczogSXRlcmFibGVJdGVyYXRvcjxzdHJpbmc+KSB7XG5cdGNvbnN0IHZhbHVlcyA9IFtdO1xuXHRmb3IgKGNvbnN0IGNhcHR1cmVHcm91cCBvZiBjYXB0dXJlR3JvdXBzKSB7XG5cdFx0Y29uc3QgcGFyc2VkTnVtYmVyID0gTnVtYmVyKGNhcHR1cmVHcm91cCk7XG5cdFx0aWYgKHBhcnNlZE51bWJlciB8fCBwYXJzZWROdW1iZXIgPT09IDAgJiYgY2FwdHVyZUdyb3VwLnJlcGxhY2UoL1xccy9nLCAnJykgIT09ICcnKSB7XG5cdFx0XHR2YWx1ZXMucHVzaChwYXJzZWROdW1iZXIpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gdmFsdWVzO1xufVxuXG5mdW5jdGlvbiBfdG9JQ29sb3IocjogbnVtYmVyLCBnOiBudW1iZXIsIGI6IG51bWJlciwgYTogbnVtYmVyKTogSUNvbG9yIHtcblx0cmV0dXJuIHtcblx0XHRyZWQ6IHIgLyAyNTUsXG5cdFx0Ymx1ZTogYiAvIDI1NSxcblx0XHRncmVlbjogZyAvIDI1NSxcblx0XHRhbHBoYTogYVxuXHR9O1xufVxuXG5mdW5jdGlvbiBfZmluZFJhbmdlKG1vZGVsOiBJRG9jdW1lbnRDb2xvckNvbXB1dGVyVGFyZ2V0LCBtYXRjaDogUmVnRXhwTWF0Y2hBcnJheSk6IElSYW5nZSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGluZGV4ID0gbWF0Y2guaW5kZXg7XG5cdGNvbnN0IGxlbmd0aCA9IG1hdGNoWzBdLmxlbmd0aDtcblx0aWYgKGluZGV4ID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm47XG5cdH1cblx0Y29uc3Qgc3RhcnRQb3NpdGlvbiA9IG1vZGVsLnBvc2l0aW9uQXQoaW5kZXgpO1xuXHRjb25zdCByYW5nZTogSVJhbmdlID0ge1xuXHRcdHN0YXJ0TGluZU51bWJlcjogc3RhcnRQb3NpdGlvbi5saW5lTnVtYmVyLFxuXHRcdHN0YXJ0Q29sdW1uOiBzdGFydFBvc2l0aW9uLmNvbHVtbixcblx0XHRlbmRMaW5lTnVtYmVyOiBzdGFydFBvc2l0aW9uLmxpbmVOdW1iZXIsXG5cdFx0ZW5kQ29sdW1uOiBzdGFydFBvc2l0aW9uLmNvbHVtbiArIGxlbmd0aFxuXHR9O1xuXHRyZXR1cm4gcmFuZ2U7XG59XG5cbmZ1bmN0aW9uIF9maW5kSGV4Q29sb3JJbmZvcm1hdGlvbihyYW5nZTogSVJhbmdlIHwgdW5kZWZpbmVkLCBoZXhWYWx1ZTogc3RyaW5nKSB7XG5cdGlmICghcmFuZ2UpIHtcblx0XHRyZXR1cm47XG5cdH1cblx0Y29uc3QgcGFyc2VkSGV4Q29sb3IgPSBDb2xvci5Gb3JtYXQuQ1NTLnBhcnNlSGV4KGhleFZhbHVlKTtcblx0aWYgKCFwYXJzZWRIZXhDb2xvcikge1xuXHRcdHJldHVybjtcblx0fVxuXHRyZXR1cm4ge1xuXHRcdHJhbmdlOiByYW5nZSxcblx0XHRjb2xvcjogX3RvSUNvbG9yKHBhcnNlZEhleENvbG9yLnJnYmEuciwgcGFyc2VkSGV4Q29sb3IucmdiYS5nLCBwYXJzZWRIZXhDb2xvci5yZ2JhLmIsIHBhcnNlZEhleENvbG9yLnJnYmEuYSlcblx0fTtcbn1cblxuZnVuY3Rpb24gX2ZpbmRSR0JDb2xvckluZm9ybWF0aW9uKHJhbmdlOiBJUmFuZ2UgfCB1bmRlZmluZWQsIG1hdGNoZXM6IFJlZ0V4cE1hdGNoQXJyYXlbXSwgaXNBbHBoYTogYm9vbGVhbikge1xuXHRpZiAoIXJhbmdlIHx8IG1hdGNoZXMubGVuZ3RoICE9PSAxKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGNvbnN0IG1hdGNoID0gbWF0Y2hlc1swXTtcblx0Y29uc3QgY2FwdHVyZUdyb3VwcyA9IG1hdGNoLnZhbHVlcygpO1xuXHRjb25zdCBwYXJzZWRSZWdleCA9IF9wYXJzZUNhcHR1cmVHcm91cHMoY2FwdHVyZUdyb3Vwcyk7XG5cdHJldHVybiB7XG5cdFx0cmFuZ2U6IHJhbmdlLFxuXHRcdGNvbG9yOiBfdG9JQ29sb3IocGFyc2VkUmVnZXhbMF0sIHBhcnNlZFJlZ2V4WzFdLCBwYXJzZWRSZWdleFsyXSwgaXNBbHBoYSA/IHBhcnNlZFJlZ2V4WzNdIDogMSlcblx0fTtcbn1cblxuZnVuY3Rpb24gX2ZpbmRIU0xDb2xvckluZm9ybWF0aW9uKHJhbmdlOiBJUmFuZ2UgfCB1bmRlZmluZWQsIG1hdGNoZXM6IFJlZ0V4cE1hdGNoQXJyYXlbXSwgaXNBbHBoYTogYm9vbGVhbikge1xuXHRpZiAoIXJhbmdlIHx8IG1hdGNoZXMubGVuZ3RoICE9PSAxKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGNvbnN0IG1hdGNoID0gbWF0Y2hlc1swXTtcblx0Y29uc3QgY2FwdHVyZUdyb3VwcyA9IG1hdGNoLnZhbHVlcygpO1xuXHRjb25zdCBwYXJzZWRSZWdleCA9IF9wYXJzZUNhcHR1cmVHcm91cHMoY2FwdHVyZUdyb3Vwcyk7XG5cdGNvbnN0IGNvbG9yRXF1aXZhbGVudCA9IG5ldyBDb2xvcihuZXcgSFNMQShwYXJzZWRSZWdleFswXSwgcGFyc2VkUmVnZXhbMV0gLyAxMDAsIHBhcnNlZFJlZ2V4WzJdIC8gMTAwLCBpc0FscGhhID8gcGFyc2VkUmVnZXhbM10gOiAxKSk7XG5cdHJldHVybiB7XG5cdFx0cmFuZ2U6IHJhbmdlLFxuXHRcdGNvbG9yOiBfdG9JQ29sb3IoY29sb3JFcXVpdmFsZW50LnJnYmEuciwgY29sb3JFcXVpdmFsZW50LnJnYmEuZywgY29sb3JFcXVpdmFsZW50LnJnYmEuYiwgY29sb3JFcXVpdmFsZW50LnJnYmEuYSlcblx0fTtcbn1cblxuZnVuY3Rpb24gX2ZpbmRNYXRjaGVzKG1vZGVsOiBJRG9jdW1lbnRDb2xvckNvbXB1dGVyVGFyZ2V0IHwgc3RyaW5nLCByZWdleDogUmVnRXhwKTogUmVnRXhwTWF0Y2hBcnJheVtdIHtcblx0aWYgKHR5cGVvZiBtb2RlbCA9PT0gJ3N0cmluZycpIHtcblx0XHRyZXR1cm4gWy4uLm1vZGVsLm1hdGNoQWxsKHJlZ2V4KV07XG5cdH0gZWxzZSB7XG5cdFx0cmV0dXJuIG1vZGVsLmZpbmRNYXRjaGVzKHJlZ2V4KTtcblx0fVxufVxuXG5mdW5jdGlvbiBjb21wdXRlQ29sb3JzKG1vZGVsOiBJRG9jdW1lbnRDb2xvckNvbXB1dGVyVGFyZ2V0KTogSUNvbG9ySW5mb3JtYXRpb25bXSB7XG5cdGNvbnN0IHJlc3VsdDogSUNvbG9ySW5mb3JtYXRpb25bXSA9IFtdO1xuXHQvLyBFYXJseSB2YWxpZGF0aW9uIGZvciBSR0IgYW5kIEhTTCAoaW5jbHVkaW5nIENTUyBMZXZlbCA0IHN5bnRheCB3aXRoIC8gc2VwYXJhdG9yKVxuXHRjb25zdCBpbml0aWFsVmFsaWRhdGlvblJlZ2V4ID0gL1xcYihyZ2J8cmdiYXxoc2x8aHNsYSkoXFwoWzAtOVxccywuXFwlXFwvXSpcXCkpfF4oIykoW0EtRmEtZjAtOV17M30pXFxifF4oIykoW0EtRmEtZjAtOV17NH0pXFxifF4oIykoW0EtRmEtZjAtOV17Nn0pXFxifF4oIykoW0EtRmEtZjAtOV17OH0pXFxifCg/PD1bJ1wiXFxzXSkoIykoW0EtRmEtZjAtOV17M30pXFxifCg/PD1bJ1wiXFxzXSkoIykoW0EtRmEtZjAtOV17NH0pXFxifCg/PD1bJ1wiXFxzXSkoIykoW0EtRmEtZjAtOV17Nn0pXFxifCg/PD1bJ1wiXFxzXSkoIykoW0EtRmEtZjAtOV17OH0pXFxiL2dtO1xuXHRjb25zdCBpbml0aWFsVmFsaWRhdGlvbk1hdGNoZXMgPSBfZmluZE1hdGNoZXMobW9kZWwsIGluaXRpYWxWYWxpZGF0aW9uUmVnZXgpO1xuXG5cdC8vIFBvdGVudGlhbCBjb2xvcnMgaGF2ZSBiZWVuIGZvdW5kLCB2YWxpZGF0ZSB0aGUgcGFyYW1ldGVyc1xuXHRpZiAoaW5pdGlhbFZhbGlkYXRpb25NYXRjaGVzLmxlbmd0aCA+IDApIHtcblx0XHRmb3IgKGNvbnN0IGluaXRpYWxNYXRjaCBvZiBpbml0aWFsVmFsaWRhdGlvbk1hdGNoZXMpIHtcblx0XHRcdGNvbnN0IGluaXRpYWxDYXB0dXJlR3JvdXBzID0gaW5pdGlhbE1hdGNoLmZpbHRlcihjYXB0dXJlR3JvdXAgPT4gY2FwdHVyZUdyb3VwICE9PSB1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3QgY29sb3JTY2hlbWUgPSBpbml0aWFsQ2FwdHVyZUdyb3Vwc1sxXTtcblx0XHRcdGNvbnN0IGNvbG9yUGFyYW1ldGVycyA9IGluaXRpYWxDYXB0dXJlR3JvdXBzWzJdO1xuXHRcdFx0aWYgKCFjb2xvclBhcmFtZXRlcnMpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRsZXQgY29sb3JJbmZvcm1hdGlvbjtcblx0XHRcdGlmIChjb2xvclNjaGVtZSA9PT0gJ3JnYicpIHtcblx0XHRcdFx0Ly8gU3VwcG9ydHMgYm90aCBjb21tYS1zZXBhcmF0ZWQgKHJnYigyNTUsIDAsIDApKSBhbmQgQ1NTIExldmVsIDQgc3BhY2Utc2VwYXJhdGVkIHN5bnRheCAocmdiKDI1NSAwIDApKVxuXHRcdFx0XHRjb25zdCByZWdleFBhcmFtZXRlcnMgPSAvXlxcKFxccyooMjVbMC01XXwyWzAtNF1bMC05XXwxWzAtOV17Mn18WzEtOV1bMC05XXxbMC05XSlcXHMqW1xccyxdXFxzKigyNVswLTVdfDJbMC00XVswLTldfDFbMC05XXsyfXxbMS05XVswLTldfFswLTldKVxccypbXFxzLF1cXHMqKDI1WzAtNV18MlswLTRdWzAtOV18MVswLTldezJ9fFsxLTldWzAtOV18WzAtOV0pXFxzKlxcKSQvZ207XG5cdFx0XHRcdGNvbG9ySW5mb3JtYXRpb24gPSBfZmluZFJHQkNvbG9ySW5mb3JtYXRpb24oX2ZpbmRSYW5nZShtb2RlbCwgaW5pdGlhbE1hdGNoKSwgX2ZpbmRNYXRjaGVzKGNvbG9yUGFyYW1ldGVycywgcmVnZXhQYXJhbWV0ZXJzKSwgZmFsc2UpO1xuXHRcdFx0fSBlbHNlIGlmIChjb2xvclNjaGVtZSA9PT0gJ3JnYmEnKSB7XG5cdFx0XHRcdC8vIFN1cHBvcnRzIGJvdGggY29tbWEtc2VwYXJhdGVkIChyZ2JhKDI1NSwgMCwgMCwgMC41KSkgYW5kIENTUyBMZXZlbCA0IHN5bnRheCAocmdiYSgyNTUgMCAwIC8gMC41KSlcblx0XHRcdFx0Y29uc3QgcmVnZXhQYXJhbWV0ZXJzID0gL15cXChcXHMqKDI1WzAtNV18MlswLTRdWzAtOV18MVswLTldezJ9fFsxLTldWzAtOV18WzAtOV0pXFxzKltcXHMsXVxccyooMjVbMC01XXwyWzAtNF1bMC05XXwxWzAtOV17Mn18WzEtOV1bMC05XXxbMC05XSlcXHMqW1xccyxdXFxzKigyNVswLTVdfDJbMC00XVswLTldfDFbMC05XXsyfXxbMS05XVswLTldfFswLTldKVxccyooPzpbXFxzLF18W1xcc10qXFwvKVxccyooMFsuXVswLTldK3xbLl1bMC05XSt8WzAxXVsuXXxbMDFdKVxccypcXCkkL2dtO1xuXHRcdFx0XHRjb2xvckluZm9ybWF0aW9uID0gX2ZpbmRSR0JDb2xvckluZm9ybWF0aW9uKF9maW5kUmFuZ2UobW9kZWwsIGluaXRpYWxNYXRjaCksIF9maW5kTWF0Y2hlcyhjb2xvclBhcmFtZXRlcnMsIHJlZ2V4UGFyYW1ldGVycyksIHRydWUpO1xuXHRcdFx0fSBlbHNlIGlmIChjb2xvclNjaGVtZSA9PT0gJ2hzbCcpIHtcblx0XHRcdFx0Y29uc3QgcmVnZXhQYXJhbWV0ZXJzID0gL15cXChcXHMqKCg/OjM2MCg/OlxcLjArKT98KD86MzZbMF18M1swLTVdWzAtOV18WzEyXVswLTldWzAtOV18WzEtOV0/WzAtOV0pKD86XFwuXFxkKyk/KSlcXHMqW1xccyxdXFxzKigxMDAoPzpcXC4wKyk/fFxcZHsxLDJ9Wy5dXFxkKnxcXGR7MSwyfSklXFxzKltcXHMsXVxccyooMTAwKD86XFwuMCspP3xcXGR7MSwyfVsuXVxcZCp8XFxkezEsMn0pJVxccypcXCkkL2dtO1xuXHRcdFx0XHRjb2xvckluZm9ybWF0aW9uID0gX2ZpbmRIU0xDb2xvckluZm9ybWF0aW9uKF9maW5kUmFuZ2UobW9kZWwsIGluaXRpYWxNYXRjaCksIF9maW5kTWF0Y2hlcyhjb2xvclBhcmFtZXRlcnMsIHJlZ2V4UGFyYW1ldGVycyksIGZhbHNlKTtcblx0XHRcdH0gZWxzZSBpZiAoY29sb3JTY2hlbWUgPT09ICdoc2xhJykge1xuXHRcdFx0XHQvLyBTdXBwb3J0cyBib3RoIGNvbW1hLXNlcGFyYXRlZCAoaHNsYSgyNTMsIDEwMCUsIDUwJSwgMC41KSkgYW5kIENTUyBMZXZlbCA0IHN5bnRheCAoaHNsYSgyNTMgMTAwJSA1MCUgLyAwLjUpKVxuXHRcdFx0XHRjb25zdCByZWdleFBhcmFtZXRlcnMgPSAvXlxcKFxccyooKD86MzYwKD86XFwuMCspP3woPzozNlswXXwzWzAtNV1bMC05XXxbMTJdWzAtOV1bMC05XXxbMS05XT9bMC05XSkoPzpcXC5cXGQrKT8pKVxccypbXFxzLF1cXHMqKDEwMCg/OlxcLjArKT98XFxkezEsMn1bLl1cXGQqfFxcZHsxLDJ9KSVcXHMqW1xccyxdXFxzKigxMDAoPzpcXC4wKyk/fFxcZHsxLDJ9Wy5dXFxkKnxcXGR7MSwyfSklXFxzKig/OltcXHMsXXxbXFxzXSpcXC8pXFxzKigwWy5dWzAtOV0rfFsuXVswLTldK3xbMDFdWy5dMCp8WzAxXSlcXHMqXFwpJC9nbTtcblx0XHRcdFx0Y29sb3JJbmZvcm1hdGlvbiA9IF9maW5kSFNMQ29sb3JJbmZvcm1hdGlvbihfZmluZFJhbmdlKG1vZGVsLCBpbml0aWFsTWF0Y2gpLCBfZmluZE1hdGNoZXMoY29sb3JQYXJhbWV0ZXJzLCByZWdleFBhcmFtZXRlcnMpLCB0cnVlKTtcblx0XHRcdH0gZWxzZSBpZiAoY29sb3JTY2hlbWUgPT09ICcjJykge1xuXHRcdFx0XHRjb2xvckluZm9ybWF0aW9uID0gX2ZpbmRIZXhDb2xvckluZm9ybWF0aW9uKF9maW5kUmFuZ2UobW9kZWwsIGluaXRpYWxNYXRjaCksIGNvbG9yU2NoZW1lICsgY29sb3JQYXJhbWV0ZXJzKTtcblx0XHRcdH1cblx0XHRcdGlmIChjb2xvckluZm9ybWF0aW9uKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKGNvbG9ySW5mb3JtYXRpb24pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIFJldHVybnMgYW4gYXJyYXkgb2YgYWxsIGRlZmF1bHQgZG9jdW1lbnQgY29sb3JzIGluIHRoZSBwcm92aWRlZCBkb2N1bWVudFxuICovXG5leHBvcnQgZnVuY3Rpb24gY29tcHV0ZURlZmF1bHREb2N1bWVudENvbG9ycyhtb2RlbDogSURvY3VtZW50Q29sb3JDb21wdXRlclRhcmdldCk6IElDb2xvckluZm9ybWF0aW9uW10ge1xuXHRpZiAoIW1vZGVsIHx8IHR5cGVvZiBtb2RlbC5nZXRWYWx1ZSAhPT0gJ2Z1bmN0aW9uJyB8fCB0eXBlb2YgbW9kZWwucG9zaXRpb25BdCAhPT0gJ2Z1bmN0aW9uJykge1xuXHRcdC8vIFVua25vd24gY2FsbGVyIVxuXHRcdHJldHVybiBbXTtcblx0fVxuXHRyZXR1cm4gY29tcHV0ZUNvbG9ycyhtb2RlbCk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFJQSxTQUFTLE9BQU8sWUFBWTtBQVc1QixTQUFTLG9CQUFvQixlQUF5QztBQUNyRSxRQUFNLFNBQVMsQ0FBQztBQUNoQixhQUFXLGdCQUFnQixlQUFlO0FBQ3pDLFVBQU0sZUFBZSxPQUFPLFlBQVk7QUFDeEMsUUFBSSxnQkFBZ0IsaUJBQWlCLEtBQUssYUFBYSxRQUFRLE9BQU8sRUFBRSxNQUFNLElBQUk7QUFDakYsYUFBTyxLQUFLLFlBQVk7QUFBQSxJQUN6QjtBQUFBLEVBQ0Q7QUFDQSxTQUFPO0FBQ1I7QUFFQSxTQUFTLFVBQVUsR0FBVyxHQUFXLEdBQVcsR0FBbUI7QUFDdEUsU0FBTztBQUFBLElBQ04sS0FBSyxJQUFJO0FBQUEsSUFDVCxNQUFNLElBQUk7QUFBQSxJQUNWLE9BQU8sSUFBSTtBQUFBLElBQ1gsT0FBTztBQUFBLEVBQ1I7QUFDRDtBQUVBLFNBQVMsV0FBVyxPQUFxQyxPQUE2QztBQUNyRyxRQUFNLFFBQVEsTUFBTTtBQUNwQixRQUFNLFNBQVMsTUFBTSxDQUFDLEVBQUU7QUFDeEIsTUFBSSxVQUFVLFFBQVc7QUFDeEI7QUFBQSxFQUNEO0FBQ0EsUUFBTSxnQkFBZ0IsTUFBTSxXQUFXLEtBQUs7QUFDNUMsUUFBTSxRQUFnQjtBQUFBLElBQ3JCLGlCQUFpQixj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
