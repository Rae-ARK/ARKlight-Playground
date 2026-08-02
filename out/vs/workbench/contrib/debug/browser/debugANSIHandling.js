import { Color, RGBA } from "../../../../base/common/color.js";
import { isDefined } from "../../../../base/common/types.js";
import { editorHoverBackground, listActiveSelectionBackground, listFocusBackground, listInactiveFocusBackground, listInactiveSelectionBackground } from "../../../../platform/theme/common/colorRegistry.js";
import { registerThemingParticipant } from "../../../../platform/theme/common/themeService.js";
import { PANEL_BACKGROUND, SIDE_BAR_BACKGROUND } from "../../../common/theme.js";
import { ansiColorIdentifiers } from "../../terminal/common/terminalColorRegistry.js";
function handleANSIOutput(text, linkDetector, workspaceFolder, highlights, hoverBehavior) {
  const root = document.createElement("span");
  const textLength = text.length;
  let styleNames = [];
  let customFgColor;
  let customBgColor;
  let customUnderlineColor;
  let colorsInverted = false;
  let currentPos = 0;
  let unprintedChars = 0;
  let buffer = "";
  while (currentPos < textLength) {
    let sequenceFound = false;
    if (text.charCodeAt(currentPos) === 27 && text.charAt(currentPos + 1) === "[") {
      const startPos = currentPos;
      currentPos += 2;
      let ansiSequence = "";
      while (currentPos < textLength) {
        const char = text.charAt(currentPos);
        ansiSequence += char;
        currentPos++;
        if (char.match(/^[ABCDHIJKfhmpsu]$/)) {
          sequenceFound = true;
          break;
        }
      }
      if (sequenceFound) {
        unprintedChars += 2 + ansiSequence.length;
        appendStylizedStringToContainer(root, buffer, styleNames, linkDetector, workspaceFolder, customFgColor, customBgColor, customUnderlineColor, highlights, currentPos - buffer.length - unprintedChars, hoverBehavior);
        buffer = "";
        if (ansiSequence.match(/^(?:[34][0-8]|9[0-7]|10[0-7]|[0-9]|2[1-5,7-9]|[34]9|5[8,9]|1[0-9])(?:;[349][0-7]|10[0-7]|[013]|[245]|[34]9)?(?:;[012]?[0-9]?[0-9])*;?m$/)) {
          const styleCodes = ansiSequence.slice(0, -1).split(";").filter((elem) => elem !== "").map((elem) => parseInt(elem, 10));
          if (styleCodes[0] === 38 || styleCodes[0] === 48 || styleCodes[0] === 58) {
            const colorType = styleCodes[0] === 38 ? "foreground" : styleCodes[0] === 48 ? "background" : "underline";
            if (styleCodes[1] === 5) {
              set8BitColor(styleCodes, colorType);
            } else if (styleCodes[1] === 2) {
              set24BitColor(styleCodes, colorType);
            }
          } else {
            setBasicFormatters(styleCodes);
          }
        } else {
        }
      } else {
        currentPos = startPos;
      }
    }
    if (sequenceFound === false) {
      buffer += text.charAt(currentPos);
      currentPos++;
    }
  }
  if (buffer) {
    appendStylizedStringToContainer(root, buffer, styleNames, linkDetector, workspaceFolder, customFgColor, customBgColor, customUnderlineColor, highlights, currentPos - buffer.length, hoverBehavior);
  }
  return root;
  function changeColor(colorType, color) {
    if (colorType === "foreground") {
      customFgColor = color;
    } else if (colorType === "background") {
      customBgColor = color;
    } else if (colorType === "underline") {
      customUnderlineColor = color;
    }
    styleNames = styleNames.filter((style) => style !== `code-${colorType}-colored`);
    if (color !== void 0) {
      styleNames.push(`code-${colorType}-colored`);
    }
  }
  function reverseForegroundAndBackgroundColors() {
    const oldFgColor = customFgColor;
    changeColor("foreground", customBgColor);
    changeColor("background", oldFgColor);
  }
  function setBasicFormatters(styleCodes) {
    for (const code of styleCodes) {
      switch (code) {
        case 0: {
          styleNames = [];
          customFgColor = void 0;
          customBgColor = void 0;
          break;
        }
        case 1: {
          styleNames = styleNames.filter((style) => style !== `code-bold`);
          styleNames.push("code-bold");
          break;
        }
        case 2: {
          styleNames = styleNames.filter((style) => style !== `code-dim`);
          styleNames.push("code-dim");
          break;
        }
        case 3: {
          styleNames = styleNames.filter((style) => style !== `code-italic`);
          styleNames.push("code-italic");
          break;
        }
        case 4: {
          styleNames = styleNames.filter((style) => style !== `code-underline` && style !== `code-double-underline`);
          styleNames.push("code-underline");
          break;
        }
        case 5: {
          styleNames = styleNames.filter((style) => style !== `code-blink`);
          styleNames.push("code-blink");
          break;
        }
        case 6: {
          styleNames = styleNames.filter((style) => style !== `code-rapid-blink`);
          styleNames.push("code-rapid-blink");
          break;
        }
        case 7: {
          if (!colorsInverted) {
            colorsInverted = true;
            reverseForegroundAndBackgroundColors();
          }
          break;
        }
        case 8: {
          styleNames = styleNames.filter((style) => style !== `code-hidden`);
          styleNames.push("code-hidden");
          break;
        }
        case 9: {
          styleNames = styleNames.filter((style) => style !== `code-strike-through`);
          styleNames.push("code-strike-through");
          break;
        }
        case 10: {
          styleNames = styleNames.filter((style) => !style.startsWith("code-font"));
          break;
        }
        case 11:
        case 12:
        case 13:
        case 14:
        case 15:
        case 16:
        case 17:
        case 18:
        case 19:
        case 20: {
          styleNames = styleNames.filter((style) => !style.startsWith("code-font"));
          styleNames.push(`code-font-${code - 10}`);
          break;
        }
        case 21: {
          styleNames = styleNames.filter((style) => style !== `code-underline` && style !== `code-double-underline`);
          styleNames.push("code-double-underline");
          break;
        }
        case 22: {
          styleNames = styleNames.filter((style) => style !== `code-bold` && style !== `code-dim`);
          break;
        }
        case 23: {
          styleNames = styleNames.filter((style) => style !== `code-italic` && style !== `code-font-10`);
          break;
        }
        case 24: {
          styleNames = styleNames.filter((style) => style !== `code-underline` && style !== `code-double-underline`);
          break;
        }
        case 25: {
          styleNames = styleNames.filter((style) => style !== `code-blink` && style !== `code-rapid-blink`);
          break;
        }
        case 27: {
          if (colorsInverted) {
            colorsInverted = false;
            reverseForegroundAndBackgroundColors();
          }
          break;
        }
        case 28: {
          styleNames = styleNames.filter((style) => style !== `code-hidden`);
          break;
        }
        case 29: {
          styleNames = styleNames.filter((style) => style !== `code-strike-through`);
          break;
        }
        case 53: {
          styleNames = styleNames.filter((style) => style !== `code-overline`);
          styleNames.push("code-overline");
          break;
        }
        case 55: {
          styleNames = styleNames.filter((style) => style !== `code-overline`);
          break;
        }
        case 39: {
          changeColor("foreground", void 0);
          break;
        }
        case 49: {
          changeColor("background", void 0);
          break;
        }
        case 59: {
          changeColor("underline", void 0);
          break;
        }
        case 73: {
          styleNames = styleNames.filter((style) => style !== `code-superscript` && style !== `code-subscript`);
          styleNames.push("code-superscript");
          break;
        }
        case 74: {
          styleNames = styleNames.filter((style) => style !== `code-superscript` && style !== `code-subscript`);
          styleNames.push("code-subscript");
          break;
        }
        case 75: {
          styleNames = styleNames.filter((style) => style !== `code-superscript` && style !== `code-subscript`);
          break;
        }
        default: {
          setBasicColor(code);
          break;
        }
      }
    }
  }
  function set24BitColor(styleCodes, colorType) {
    if (styleCodes.length >= 5 && styleCodes[2] >= 0 && styleCodes[2] <= 255 && styleCodes[3] >= 0 && styleCodes[3] <= 255 && styleCodes[4] >= 0 && styleCodes[4] <= 255) {
      const customColor = new RGBA(styleCodes[2], styleCodes[3], styleCodes[4]);
      changeColor(colorType, customColor);
    }
  }
  function set8BitColor(styleCodes, colorType) {
    let colorNumber = styleCodes[2];
    const color = calcANSI8bitColor(colorNumber);
    if (color) {
      changeColor(colorType, color);
    } else if (colorNumber >= 0 && colorNumber <= 15) {
      if (colorType === "underline") {
        const colorName = ansiColorIdentifiers[colorNumber];
        changeColor(colorType, `--vscode-debug-ansi-${colorName}`);
        return;
      }
      colorNumber += 30;
      if (colorNumber >= 38) {
        colorNumber += 52;
      }
      if (colorType === "background") {
        colorNumber += 10;
      }
      setBasicColor(colorNumber);
    }
  }
  function setBasicColor(styleCode) {
    let colorType;
    let colorIndex;
    if (styleCode >= 30 && styleCode <= 37) {
      colorIndex = styleCode - 30;
      colorType = "foreground";
    } else if (styleCode >= 90 && styleCode <= 97) {
      colorIndex = styleCode - 90 + 8;
      colorType = "foreground";
    } else if (styleCode >= 40 && styleCode <= 47) {
      colorIndex = styleCode - 40;
      colorType = "background";
    } else if (styleCode >= 100 && styleCode <= 107) {
      colorIndex = styleCode - 100 + 8;
      colorType = "background";
    }
    if (colorIndex !== void 0 && colorType) {
      const colorName = ansiColorIdentifiers[colorIndex];
      changeColor(colorType, `--vscode-debug-ansi-${colorName.replaceAll(".", "-")}`);
    }
  }
}
function appendStylizedStringToContainer(root, stringContent, cssClasses, linkDetector, workspaceFolder, customTextColor, customBackgroundColor, customUnderlineColor, highlights, offset, hoverBehavior) {
  if (!root || !stringContent) {
    return;
  }
  const container = linkDetector.linkify(
    stringContent,
    hoverBehavior,
    true,
    workspaceFolder,
    void 0,
    highlights?.map((h) => ({ start: h.start - offset, end: h.end - offset, extraClasses: h.extraClasses }))
  );
  container.className = cssClasses.join(" ");
  if (customTextColor) {
    container.style.color = typeof customTextColor === "string" ? `var(${customTextColor})` : Color.Format.CSS.formatRGB(new Color(customTextColor));
  }
  if (customBackgroundColor) {
    container.style.backgroundColor = typeof customBackgroundColor === "string" ? `var(${customBackgroundColor})` : Color.Format.CSS.formatRGB(new Color(customBackgroundColor));
  }
  if (customUnderlineColor) {
    container.style.textDecorationColor = typeof customUnderlineColor === "string" ? `var(${customUnderlineColor})` : Color.Format.CSS.formatRGB(new Color(customUnderlineColor));
  }
  root.appendChild(container);
}
function calcANSI8bitColor(colorNumber) {
  if (colorNumber % 1 !== 0) {
    return;
  }
  if (colorNumber >= 16 && colorNumber <= 231) {
    colorNumber -= 16;
    let blue = colorNumber % 6;
    colorNumber = (colorNumber - blue) / 6;
    let green = colorNumber % 6;
    colorNumber = (colorNumber - green) / 6;
    let red = colorNumber;
    const convFactor = 255 / 5;
    blue = Math.round(blue * convFactor);
    green = Math.round(green * convFactor);
    red = Math.round(red * convFactor);
    return new RGBA(red, green, blue);
  } else if (colorNumber >= 232 && colorNumber <= 255) {
    colorNumber -= 232;
    const colorLevel = Math.round(colorNumber / 23 * 255);
    return new RGBA(colorLevel, colorLevel, colorLevel);
  } else {
    return;
  }
}
registerThemingParticipant((theme, collector) => {
  const areas = [
    { selector: ".monaco-workbench .sidebar, .monaco-workbench .auxiliarybar", bg: theme.getColor(SIDE_BAR_BACKGROUND) },
    { selector: ".monaco-workbench .panel", bg: theme.getColor(PANEL_BACKGROUND) },
    { selector: ".monaco-workbench .monaco-list-row.selected", bg: theme.getColor(listInactiveSelectionBackground) },
    { selector: ".monaco-workbench .monaco-list-row.focused", bg: theme.getColor(listInactiveFocusBackground) },
    { selector: ".monaco-workbench .monaco-list:focus .monaco-list-row.focused", bg: theme.getColor(listFocusBackground) },
    { selector: ".monaco-workbench .monaco-list:focus .monaco-list-row.selected", bg: theme.getColor(listActiveSelectionBackground) },
    { selector: ".debug-hover-widget", bg: theme.getColor(editorHoverBackground) }
  ];
  for (const { selector, bg } of areas) {
    const content = ansiColorIdentifiers.map((color) => {
      const actual = theme.getColor(color);
      if (!actual) {
        return void 0;
      }
      return `--vscode-debug-ansi-${color.replaceAll(".", "-")}:${bg ? bg.ensureConstrast(actual, 4) : actual}`;
    }).filter(isDefined);
    collector.addRule(`${selector} { ${content.join(";")} }`);
  }
});
export {
  appendStylizedStringToContainer,
  calcANSI8bitColor,
  handleANSIOutput
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvZGVidWdBTlNJSGFuZGxpbmcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJSGlnaGxpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hpZ2hsaWdodGVkbGFiZWwvaGlnaGxpZ2h0ZWRMYWJlbC5qcyc7XG5pbXBvcnQgeyBDb2xvciwgUkdCQSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IGlzRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IGVkaXRvckhvdmVyQmFja2dyb3VuZCwgbGlzdEFjdGl2ZVNlbGVjdGlvbkJhY2tncm91bmQsIGxpc3RGb2N1c0JhY2tncm91bmQsIGxpc3RJbmFjdGl2ZUZvY3VzQmFja2dyb3VuZCwgbGlzdEluYWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyVGhlbWluZ1BhcnRpY2lwYW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlRm9sZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgUEFORUxfQkFDS0dST1VORCwgU0lERV9CQVJfQkFDS0dST1VORCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBhbnNpQ29sb3JJZGVudGlmaWVycyB9IGZyb20gJy4uLy4uL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbENvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgRGVidWdMaW5rSG92ZXJCZWhhdmlvclR5cGVEYXRhLCBJTGlua0RldGVjdG9yIH0gZnJvbSAnLi9saW5rRGV0ZWN0b3IuanMnO1xuXG4vKipcbiAqIEBwYXJhbSB0ZXh0IFRoZSBjb250ZW50IHRvIHN0eWxpemUuXG4gKiBAcmV0dXJucyBBbiB7QGxpbmsgSFRNTFNwYW5FbGVtZW50fSB0aGF0IGNvbnRhaW5zIHRoZSBwb3RlbnRpYWxseSBzdHlsaXplZCB0ZXh0LlxuICovXG5leHBvcnQgZnVuY3Rpb24gaGFuZGxlQU5TSU91dHB1dCh0ZXh0OiBzdHJpbmcsIGxpbmtEZXRlY3RvcjogSUxpbmtEZXRlY3Rvciwgd29ya3NwYWNlRm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyIHwgdW5kZWZpbmVkLCBoaWdobGlnaHRzOiBJSGlnaGxpZ2h0W10gfCB1bmRlZmluZWQsIGhvdmVyQmVoYXZpb3I6IERlYnVnTGlua0hvdmVyQmVoYXZpb3JUeXBlRGF0YSk6IEhUTUxTcGFuRWxlbWVudCB7XG5cblx0Y29uc3Qgcm9vdDogSFRNTFNwYW5FbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuXHRjb25zdCB0ZXh0TGVuZ3RoOiBudW1iZXIgPSB0ZXh0Lmxlbmd0aDtcblxuXHRsZXQgc3R5bGVOYW1lczogc3RyaW5nW10gPSBbXTtcblx0bGV0IGN1c3RvbUZnQ29sb3I6IFJHQkEgfCBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGxldCBjdXN0b21CZ0NvbG9yOiBSR0JBIHwgc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRsZXQgY3VzdG9tVW5kZXJsaW5lQ29sb3I6IFJHQkEgfCBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGxldCBjb2xvcnNJbnZlcnRlZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRsZXQgY3VycmVudFBvczogbnVtYmVyID0gMDtcblx0bGV0IHVucHJpbnRlZENoYXJzID0gMDtcblx0bGV0IGJ1ZmZlcjogc3RyaW5nID0gJyc7XG5cblx0d2hpbGUgKGN1cnJlbnRQb3MgPCB0ZXh0TGVuZ3RoKSB7XG5cblx0XHRsZXQgc2VxdWVuY2VGb3VuZDogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdFx0Ly8gUG90ZW50aWFsbHkgYW4gQU5TSSBlc2NhcGUgc2VxdWVuY2UuXG5cdFx0Ly8gU2VlIGh0dHA6Ly9hc2NpaS10YWJsZS5jb20vYW5zaS1lc2NhcGUtc2VxdWVuY2VzLnBocCAmIGh0dHBzOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL0FOU0lfZXNjYXBlX2NvZGVcblx0XHRpZiAodGV4dC5jaGFyQ29kZUF0KGN1cnJlbnRQb3MpID09PSAyNyAmJiB0ZXh0LmNoYXJBdChjdXJyZW50UG9zICsgMSkgPT09ICdbJykge1xuXG5cdFx0XHRjb25zdCBzdGFydFBvczogbnVtYmVyID0gY3VycmVudFBvcztcblx0XHRcdGN1cnJlbnRQb3MgKz0gMjsgLy8gSWdub3JlICdFc2NbJyBhcyBpdCdzIGluIGV2ZXJ5IHNlcXVlbmNlLlxuXG5cdFx0XHRsZXQgYW5zaVNlcXVlbmNlOiBzdHJpbmcgPSAnJztcblxuXHRcdFx0d2hpbGUgKGN1cnJlbnRQb3MgPCB0ZXh0TGVuZ3RoKSB7XG5cdFx0XHRcdGNvbnN0IGNoYXI6IHN0cmluZyA9IHRleHQuY2hhckF0KGN1cnJlbnRQb3MpO1xuXHRcdFx0XHRhbnNpU2VxdWVuY2UgKz0gY2hhcjtcblxuXHRcdFx0XHRjdXJyZW50UG9zKys7XG5cblx0XHRcdFx0Ly8gTG9vayBmb3IgYSBrbm93biBzZXF1ZW5jZSB0ZXJtaW5hdGluZyBjaGFyYWN0ZXIuXG5cdFx0XHRcdGlmIChjaGFyLm1hdGNoKC9eW0FCQ0RISUpLZmhtcHN1XSQvKSkge1xuXHRcdFx0XHRcdHNlcXVlbmNlRm91bmQgPSB0cnVlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdH1cblxuXHRcdFx0aWYgKHNlcXVlbmNlRm91bmQpIHtcblxuXHRcdFx0XHR1bnByaW50ZWRDaGFycyArPSAyICsgYW5zaVNlcXVlbmNlLmxlbmd0aDtcblxuXHRcdFx0XHQvLyBGbHVzaCBidWZmZXIgd2l0aCBwcmV2aW91cyBzdHlsZXMuXG5cdFx0XHRcdGFwcGVuZFN0eWxpemVkU3RyaW5nVG9Db250YWluZXIocm9vdCwgYnVmZmVyLCBzdHlsZU5hbWVzLCBsaW5rRGV0ZWN0b3IsIHdvcmtzcGFjZUZvbGRlciwgY3VzdG9tRmdDb2xvciwgY3VzdG9tQmdDb2xvciwgY3VzdG9tVW5kZXJsaW5lQ29sb3IsIGhpZ2hsaWdodHMsIGN1cnJlbnRQb3MgLSBidWZmZXIubGVuZ3RoIC0gdW5wcmludGVkQ2hhcnMsIGhvdmVyQmVoYXZpb3IpO1xuXHRcdFx0XHRidWZmZXIgPSAnJztcblxuXHRcdFx0XHQvKlxuXHRcdFx0XHQgKiBDZXJ0YWluIHJhbmdlcyB0aGF0IGFyZSBtYXRjaGVkIGhlcmUgZG8gbm90IGNvbnRhaW4gcmVhbCBncmFwaGljcyByZW5kaXRpb24gc2VxdWVuY2VzLiBGb3Jcblx0XHRcdFx0ICogdGhlIHNha2Ugb2YgaGF2aW5nIGEgc2ltcGxlciBleHByZXNzaW9uLCB0aGV5IGhhdmUgYmVlbiBpbmNsdWRlZCBhbnl3YXkuXG5cdFx0XHRcdCAqL1xuXHRcdFx0XHRpZiAoYW5zaVNlcXVlbmNlLm1hdGNoKC9eKD86WzM0XVswLThdfDlbMC03XXwxMFswLTddfFswLTldfDJbMS01LDctOV18WzM0XTl8NVs4LDldfDFbMC05XSkoPzo7WzM0OV1bMC03XXwxMFswLTddfFswMTNdfFsyNDVdfFszNF05KT8oPzo7WzAxMl0/WzAtOV0/WzAtOV0pKjs/bSQvKSkge1xuXG5cdFx0XHRcdFx0Y29uc3Qgc3R5bGVDb2RlczogbnVtYmVyW10gPSBhbnNpU2VxdWVuY2Uuc2xpY2UoMCwgLTEpIC8vIFJlbW92ZSBmaW5hbCAnbScgY2hhcmFjdGVyLlxuXHRcdFx0XHRcdFx0LnNwbGl0KCc7JylcdFx0XHRcdFx0XHRcdFx0XHRcdCAgIC8vIFNlcGFyYXRlIHN0eWxlIGNvZGVzLlxuXHRcdFx0XHRcdFx0LmZpbHRlcihlbGVtID0+IGVsZW0gIT09ICcnKVx0XHRcdCAgICAgICAgICAgLy8gRmlsdGVyIGVtcHR5IGVsZW1zIGFzICczNDttJyAtPiBbJzM0JywgJyddLlxuXHRcdFx0XHRcdFx0Lm1hcChlbGVtID0+IHBhcnNlSW50KGVsZW0sIDEwKSk7XHRcdCAgICAgICAgICAgLy8gQ29udmVydCB0byBudW1iZXJzLlxuXG5cdFx0XHRcdFx0aWYgKHN0eWxlQ29kZXNbMF0gPT09IDM4IHx8IHN0eWxlQ29kZXNbMF0gPT09IDQ4IHx8IHN0eWxlQ29kZXNbMF0gPT09IDU4KSB7XG5cdFx0XHRcdFx0XHQvLyBBZHZhbmNlZCBjb2xvciBjb2RlIC0gY2FuJ3QgYmUgY29tYmluZWQgd2l0aCBmb3JtYXR0aW5nIGNvZGVzIGxpa2Ugc2ltcGxlIGNvbG9ycyBjYW5cblx0XHRcdFx0XHRcdC8vIElnbm9yZXMgaW52YWxpZCBjb2xvcnMgYW5kIGFkZGl0aW9uYWwgaW5mbyBiZXlvbmQgd2hhdCBpcyBuZWNlc3Nhcnlcblx0XHRcdFx0XHRcdGNvbnN0IGNvbG9yVHlwZSA9IChzdHlsZUNvZGVzWzBdID09PSAzOCkgPyAnZm9yZWdyb3VuZCcgOiAoKHN0eWxlQ29kZXNbMF0gPT09IDQ4KSA/ICdiYWNrZ3JvdW5kJyA6ICd1bmRlcmxpbmUnKTtcblxuXHRcdFx0XHRcdFx0aWYgKHN0eWxlQ29kZXNbMV0gPT09IDUpIHtcblx0XHRcdFx0XHRcdFx0c2V0OEJpdENvbG9yKHN0eWxlQ29kZXMsIGNvbG9yVHlwZSk7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKHN0eWxlQ29kZXNbMV0gPT09IDIpIHtcblx0XHRcdFx0XHRcdFx0c2V0MjRCaXRDb2xvcihzdHlsZUNvZGVzLCBjb2xvclR5cGUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRzZXRCYXNpY0Zvcm1hdHRlcnMoc3R5bGVDb2Rlcyk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gVW5zdXBwb3J0ZWQgc2VxdWVuY2Ugc28gc2ltcGx5IGhpZGUgaXQuXG5cdFx0XHRcdH1cblxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y3VycmVudFBvcyA9IHN0YXJ0UG9zO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChzZXF1ZW5jZUZvdW5kID09PSBmYWxzZSkge1xuXHRcdFx0YnVmZmVyICs9IHRleHQuY2hhckF0KGN1cnJlbnRQb3MpO1xuXHRcdFx0Y3VycmVudFBvcysrO1xuXHRcdH1cblx0fVxuXG5cdC8vIEZsdXNoIHJlbWFpbmluZyB0ZXh0IGJ1ZmZlciBpZiBub3QgZW1wdHkuXG5cdGlmIChidWZmZXIpIHtcblx0XHRhcHBlbmRTdHlsaXplZFN0cmluZ1RvQ29udGFpbmVyKHJvb3QsIGJ1ZmZlciwgc3R5bGVOYW1lcywgbGlua0RldGVjdG9yLCB3b3Jrc3BhY2VGb2xkZXIsIGN1c3RvbUZnQ29sb3IsIGN1c3RvbUJnQ29sb3IsIGN1c3RvbVVuZGVybGluZUNvbG9yLCBoaWdobGlnaHRzLCBjdXJyZW50UG9zIC0gYnVmZmVyLmxlbmd0aCwgaG92ZXJCZWhhdmlvcik7XG5cdH1cblxuXHRyZXR1cm4gcm9vdDtcblxuXHQvKipcblx0ICogQ2hhbmdlIHRoZSBmb3JlZ3JvdW5kIG9yIGJhY2tncm91bmQgY29sb3IgYnkgY2xlYXJpbmcgdGhlIGN1cnJlbnQgY29sb3Jcblx0ICogYW5kIGFkZGluZyB0aGUgbmV3IG9uZS5cblx0ICogQHBhcmFtIGNvbG9yVHlwZSBJZiBgJ2ZvcmVncm91bmQnYCwgd2lsbCBjaGFuZ2UgdGhlIGZvcmVncm91bmQgY29sb3IsIGlmXG5cdCAqIFx0YCdiYWNrZ3JvdW5kJ2AsIHdpbGwgY2hhbmdlIHRoZSBiYWNrZ3JvdW5kIGNvbG9yLCBhbmQgaWYgYCd1bmRlcmxpbmUnYFxuXHQgKiB3aWxsIHNldCB0aGUgdW5kZXJsaW5lIGNvbG9yLlxuXHQgKiBAcGFyYW0gY29sb3IgQ29sb3IgdG8gY2hhbmdlIHRvLiBJZiBgdW5kZWZpbmVkYCBvciBub3QgcHJvdmlkZWQsXG5cdCAqIHdpbGwgY2xlYXIgY3VycmVudCBjb2xvciB3aXRob3V0IGFkZGluZyBhIG5ldyBvbmUuXG5cdCAqL1xuXHRmdW5jdGlvbiBjaGFuZ2VDb2xvcihjb2xvclR5cGU6ICdmb3JlZ3JvdW5kJyB8ICdiYWNrZ3JvdW5kJyB8ICd1bmRlcmxpbmUnLCBjb2xvcj86IFJHQkEgfCBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAoY29sb3JUeXBlID09PSAnZm9yZWdyb3VuZCcpIHtcblx0XHRcdGN1c3RvbUZnQ29sb3IgPSBjb2xvcjtcblx0XHR9IGVsc2UgaWYgKGNvbG9yVHlwZSA9PT0gJ2JhY2tncm91bmQnKSB7XG5cdFx0XHRjdXN0b21CZ0NvbG9yID0gY29sb3I7XG5cdFx0fSBlbHNlIGlmIChjb2xvclR5cGUgPT09ICd1bmRlcmxpbmUnKSB7XG5cdFx0XHRjdXN0b21VbmRlcmxpbmVDb2xvciA9IGNvbG9yO1xuXHRcdH1cblx0XHRzdHlsZU5hbWVzID0gc3R5bGVOYW1lcy5maWx0ZXIoc3R5bGUgPT4gc3R5bGUgIT09IGBjb2RlLSR7Y29sb3JUeXBlfS1jb2xvcmVkYCk7XG5cdFx0aWYgKGNvbG9yICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHN0eWxlTmFtZXMucHVzaChgY29kZS0ke2NvbG9yVHlwZX0tY29sb3JlZGApO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBTd2FwIGZvcmVncm91bmQgYW5kIGJhY2tncm91bmQgY29sb3JzLiAgVXNlZCBmb3IgY29sb3IgaW52ZXJzaW9uLiAgQ2FsbGVyIHNob3VsZCBjaGVja1xuXHQgKiBbXSBmbGFnIHRvIG1ha2Ugc3VyZSBpdCBpcyBhcHByb3ByaWF0ZSB0byB0dXJuIE9OIG9yIE9GRiAoaWYgaXQgaXMgYWxyZWFkeSBpbnZlcnRlZCBkb24ndCBjYWxsXG5cdCAqL1xuXHRmdW5jdGlvbiByZXZlcnNlRm9yZWdyb3VuZEFuZEJhY2tncm91bmRDb2xvcnMoKTogdm9pZCB7XG5cdFx0Y29uc3Qgb2xkRmdDb2xvciA9IGN1c3RvbUZnQ29sb3I7XG5cdFx0Y2hhbmdlQ29sb3IoJ2ZvcmVncm91bmQnLCBjdXN0b21CZ0NvbG9yKTtcblx0XHRjaGFuZ2VDb2xvcignYmFja2dyb3VuZCcsIG9sZEZnQ29sb3IpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENhbGN1bGF0ZSBhbmQgc2V0IGJhc2ljIEFOU0kgZm9ybWF0dGluZy4gU3VwcG9ydHMgT04vT0ZGIG9mIGJvbGQsIGl0YWxpYywgdW5kZXJsaW5lLFxuXHQgKiBkb3VibGUgdW5kZXJsaW5lLCAgY3Jvc3NlZC1vdXQvc3RyaWtldGhyb3VnaCwgb3ZlcmxpbmUsIGRpbSwgYmxpbmssIHJhcGlkIGJsaW5rLFxuXHQgKiByZXZlcnNlL2ludmVydCB2aWRlbywgaGlkZGVuLCBzdXBlcnNjcmlwdCwgc3Vic2NyaXB0IGFuZCBhbHRlcm5hdGUgZm9udCBjb2Rlcyxcblx0ICogY2xlYXJpbmcvcmVzZXR0aW5nIG9mIGZvcmVncm91bmQsIGJhY2tncm91bmQgYW5kIHVuZGVybGluZSBjb2xvcnMsXG5cdCAqIHNldHRpbmcgbm9ybWFsIGZvcmVncm91bmQgYW5kIGJhY2tncm91bmQgY29sb3JzLCBhbmQgYnJpZ2h0IGZvcmVncm91bmQgYW5kXG5cdCAqIGJhY2tncm91bmQgY29sb3JzLiBOb3QgdG8gYmUgdXNlZCBmb3IgY29kZXMgY29udGFpbmluZyBhZHZhbmNlZCBjb2xvcnMuXG5cdCAqIFdpbGwgaWdub3JlIGludmFsaWQgY29kZXMuXG5cdCAqIEBwYXJhbSBzdHlsZUNvZGVzIEFycmF5IG9mIEFOU0kgYmFzaWMgc3R5bGluZyBudW1iZXJzLCB3aGljaCB3aWxsIGJlXG5cdCAqIGFwcGxpZWQgaW4gb3JkZXIuIE5ldyBjb2xvcnMgYW5kIGJhY2tncm91bmRzIGNsZWFyIG9sZCBvbmVzOyBuZXcgZm9ybWF0dGluZ1xuXHQgKiBkb2VzIG5vdC5cblx0ICogQHNlZSB7QGxpbmsgaHR0cHM6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvQU5TSV9lc2NhcGVfY29kZSNTR1IgfVxuXHQgKi9cblx0ZnVuY3Rpb24gc2V0QmFzaWNGb3JtYXR0ZXJzKHN0eWxlQ29kZXM6IG51bWJlcltdKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBjb2RlIG9mIHN0eWxlQ29kZXMpIHtcblx0XHRcdHN3aXRjaCAoY29kZSkge1xuXHRcdFx0XHRjYXNlIDA6IHsgIC8vIHJlc2V0IChldmVyeXRoaW5nKVxuXHRcdFx0XHRcdHN0eWxlTmFtZXMgPSBbXTtcblx0XHRcdFx0XHRjdXN0b21GZ0NvbG9yID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGN1c3RvbUJnQ29sb3IgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAxOiB7IC8vIGJvbGRcblx0XHRcdFx0XHRzdHlsZU5hbWVzID0gc3R5bGVOYW1lcy5maWx0ZXIoc3R5bGUgPT4gc3R5bGUgIT09IGBjb2RlLWJvbGRgKTtcblx0XHRcdFx0XHRzdHlsZU5hbWVzLnB1c2goJ2NvZGUtYm9sZCcpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgMjogeyAvLyBkaW1cblx0XHRcdFx0XHRzdHlsZU5hbWVzID0gc3R5bGVOYW1lcy5maWx0ZXIoc3R5bGUgPT4gc3R5bGUgIT09IGBjb2RlLWRpbWApO1xuXHRcdFx0XHRcdHN0eWxlTmFtZXMucHVzaCgnY29kZS1kaW0nKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlIDM6IHsgLy8gaXRhbGljXG5cdFx0XHRcdFx0c3R5bGVOYW1lcyA9IHN0eWxlTmFtZXMuZmlsdGVyKHN0eWxlID0+IHN0eWxlICE9PSBgY29kZS1pdGFsaWNgKTtcblx0XHRcdFx0XHRzdHlsZU5hbWVzLnB1c2goJ2NvZGUtaXRhbGljJyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSA0OiB7IC8vIHVuZGVybGluZVxuXHRcdFx0XHRcdHN0eWxlTmFtZXMgPSBzdHlsZU5hbWVzLmZpbHRlcihzdHlsZSA9PiAoc3R5bGUgIT09IGBjb2RlLXVuZGVybGluZWAgJiYgc3R5bGUgIT09IGBjb2RlLWRvdWJsZS11bmRlcmxpbmVgKSk7XG5cdFx0XHRcdFx0c3R5bGVOYW1lcy5wdXNoKCdjb2RlLXVuZGVybGluZScpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgNTogeyAvLyBibGlua1xuXHRcdFx0XHRcdHN0eWxlTmFtZXMgPSBzdHlsZU5hbWVzLmZpbHRlcihzdHlsZSA9PiBzdHlsZSAhPT0gYGNvZGUtYmxpbmtgKTtcblx0XHRcdFx0XHRzdHlsZU5hbWVzLnB1c2goJ2NvZGUtYmxpbmsnKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlIDY6IHsgLy8gcmFwaWQgYmxpbmtcblx0XHRcdFx0XHRzdHlsZU5hbWVzID0gc3R5bGVOYW1lcy5maWx0ZXIoc3R5bGUgPT4gc3R5bGUgIT09IGBjb2RlLXJhcGlkLWJsaW5rYCk7XG5cdFx0XHRcdFx0c3R5bGVOYW1lcy5wdXNoKCdjb2RlLXJhcGlkLWJsaW5rJyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSA3OiB7IC8vIGludmVydCBmb3JlZ3JvdW5kIGFuZCBiYWNrZ3JvdW5kXG5cdFx0XHRcdFx0aWYgKCFjb2xvcnNJbnZlcnRlZCkge1xuXHRcdFx0XHRcdFx0Y29sb3JzSW52ZXJ0ZWQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0cmV2ZXJzZUZvcmVncm91bmRBbmRCYWNrZ3JvdW5kQ29sb3JzKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgODogeyAvLyBoaWRkZW5cblx0XHRcdFx0XHRzdHlsZU5hbWVzID0gc3R5bGVOYW1lcy5maWx0ZXIoc3R5bGUgPT4gc3R5bGUgIT09IGBjb2RlLWhpZGRlbmApO1xuXHRcdFx0XHRcdHN0eWxlTmFtZXMucHVzaCgnY29kZS1oaWRkZW4nKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlIDk6IHsgLy8gc3RyaWtlLXRocm91Z2gvY3Jvc3NlZC1vdXRcblx0XHRcdFx0XHRzdHlsZU5hbWVzID0gc3R5bGVOYW1lcy5maWx0ZXIoc3R5bGUgPT4gc3R5bGUgIT09IGBjb2RlLXN0cmlrZS10aHJvdWdoYCk7XG5cdFx0XHRcdFx0c3R5bGVOYW1lcy5wdXNoKCdjb2RlLXN0cmlrZS10aHJvdWdoJyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAxMDogeyAvLyBub3JtYWwgZGVmYXVsdCBmb250XG5cdFx0XHRcdFx0c3R5bGVOYW1lcyA9IHN0eWxlTmFtZXMuZmlsdGVyKHN0eWxlID0+ICFzdHlsZS5zdGFydHNXaXRoKCdjb2RlLWZvbnQnKSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAxMTogY2FzZSAxMjogY2FzZSAxMzogY2FzZSAxNDogY2FzZSAxNTogY2FzZSAxNjogY2FzZSAxNzogY2FzZSAxODogY2FzZSAxOTogY2FzZSAyMDogeyAvLyBmb250IGNvZGVzIChhbmQgMjAgaXMgJ2JsYWNrbGV0dGVyJyBmb250IGNvZGUpXG5cdFx0XHRcdFx0c3R5bGVOYW1lcyA9IHN0eWxlTmFtZXMuZmlsdGVyKHN0eWxlID0+ICFzdHlsZS5zdGFydHNXaXRoKCdjb2RlLWZvbnQnKSk7XG5cdFx0XHRcdFx0c3R5bGVOYW1lcy5wdXNoKGBjb2RlLWZvbnQtJHtjb2RlIC0gMTB9YCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAyMTogeyAvLyBkb3VibGUgdW5kZXJsaW5lXG5cdFx0XHRcdFx0c3R5bGVOYW1lcyA9IHN0eWxlTmFtZXMuZmlsdGVyKHN0eWxlID0+IChzdHlsZSAhPT0gYGNvZGUtdW5kZXJsaW5lYCAmJiBzdHlsZSAhPT0gYGNvZGUtZG91YmxlLXVuZGVybGluZWApKTtcblx0XHRcdFx0XHRzdHlsZU5hbWVzLnB1c2goJ2NvZGUtZG91YmxlLXVuZGVybGluZScpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgMjI6IHsgLy8gbm9ybWFsIGludGVuc2l0eSAoYm9sZCBvZmYgYW5kIGRpbSBvZmYpXG5cdFx0XHRcdFx0c3R5bGVOYW1lcyA9IHN0eWxlTmFtZXMuZmlsdGVyKHN0eWxlID0+IChzdHlsZSAhPT0gYGNvZGUtYm9sZGAgJiYgc3R5bGUgIT09IGBjb2RlLWRpbWApKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlIDIzOiB7IC8vIE5laXRoZXIgaXRhbGljIG9yIGJsYWNrbGV0dGVyIChmb250IDEwKVxuXHRcdFx0XHRcdHN0eWxlTmFtZXMgPSBzdHlsZU5hbWVzLmZpbHRlcihzdHlsZSA9PiAoc3R5bGUgIT09IGBjb2RlLWl0YWxpY2AgJiYgc3R5bGUgIT09IGBjb2RlLWZvbnQtMTBgKSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAyNDogeyAvLyBub3QgdW5kZXJsaW5lZCAoTmVpdGhlciBzaW5nbHkgbm9yIGRvdWJseSB1bmRlcmxpbmVkKVxuXHRcdFx0XHRcdHN0eWxlTmFtZXMgPSBzdHlsZU5hbWVzLmZpbHRlcihzdHlsZSA9PiAoc3R5bGUgIT09IGBjb2RlLXVuZGVybGluZWAgJiYgc3R5bGUgIT09IGBjb2RlLWRvdWJsZS11bmRlcmxpbmVgKSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAyNTogeyAvLyBub3QgYmxpbmtpbmdcblx0XHRcdFx0XHRzdHlsZU5hbWVzID0gc3R5bGVOYW1lcy5maWx0ZXIoc3R5bGUgPT4gKHN0eWxlICE9PSBgY29kZS1ibGlua2AgJiYgc3R5bGUgIT09IGBjb2RlLXJhcGlkLWJsaW5rYCkpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgMjc6IHsgLy8gbm90IHJldmVyc2VkL2ludmVydGVkXG5cdFx0XHRcdFx0aWYgKGNvbG9yc0ludmVydGVkKSB7XG5cdFx0XHRcdFx0XHRjb2xvcnNJbnZlcnRlZCA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0cmV2ZXJzZUZvcmVncm91bmRBbmRCYWNrZ3JvdW5kQ29sb3JzKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgMjg6IHsgLy8gbm90IGhpZGRlbiAocmV2ZWFsKVxuXHRcdFx0XHRcdHN0eWxlTmFtZXMgPSBzdHlsZU5hbWVzLmZpbHRlcihzdHlsZSA9PiBzdHlsZSAhPT0gYGNvZGUtaGlkZGVuYCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAyOTogeyAvLyBub3QgY3Jvc3NlZC1vdXRcblx0XHRcdFx0XHRzdHlsZU5hbWVzID0gc3R5bGVOYW1lcy5maWx0ZXIoc3R5bGUgPT4gc3R5bGUgIT09IGBjb2RlLXN0cmlrZS10aHJvdWdoYCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSA1MzogeyAvLyBvdmVybGluZWRcblx0XHRcdFx0XHRzdHlsZU5hbWVzID0gc3R5bGVOYW1lcy5maWx0ZXIoc3R5bGUgPT4gc3R5bGUgIT09IGBjb2RlLW92ZXJsaW5lYCk7XG5cdFx0XHRcdFx0c3R5bGVOYW1lcy5wdXNoKCdjb2RlLW92ZXJsaW5lJyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSA1NTogeyAvLyBub3Qgb3ZlcmxpbmVkXG5cdFx0XHRcdFx0c3R5bGVOYW1lcyA9IHN0eWxlTmFtZXMuZmlsdGVyKHN0eWxlID0+IHN0eWxlICE9PSBgY29kZS1vdmVybGluZWApO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgMzk6IHsgIC8vIGRlZmF1bHQgZm9yZWdyb3VuZCBjb2xvclxuXHRcdFx0XHRcdGNoYW5nZUNvbG9yKCdmb3JlZ3JvdW5kJywgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlIDQ5OiB7ICAvLyBkZWZhdWx0IGJhY2tncm91bmQgY29sb3Jcblx0XHRcdFx0XHRjaGFuZ2VDb2xvcignYmFja2dyb3VuZCcsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSA1OTogeyAgLy8gZGVmYXVsdCB1bmRlcmxpbmUgY29sb3Jcblx0XHRcdFx0XHRjaGFuZ2VDb2xvcigndW5kZXJsaW5lJywgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlIDczOiB7IC8vIHN1cGVyc2NyaXB0XG5cdFx0XHRcdFx0c3R5bGVOYW1lcyA9IHN0eWxlTmFtZXMuZmlsdGVyKHN0eWxlID0+IChzdHlsZSAhPT0gYGNvZGUtc3VwZXJzY3JpcHRgICYmIHN0eWxlICE9PSBgY29kZS1zdWJzY3JpcHRgKSk7XG5cdFx0XHRcdFx0c3R5bGVOYW1lcy5wdXNoKCdjb2RlLXN1cGVyc2NyaXB0Jyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSA3NDogeyAvLyBzdWJzY3JpcHRcblx0XHRcdFx0XHRzdHlsZU5hbWVzID0gc3R5bGVOYW1lcy5maWx0ZXIoc3R5bGUgPT4gKHN0eWxlICE9PSBgY29kZS1zdXBlcnNjcmlwdGAgJiYgc3R5bGUgIT09IGBjb2RlLXN1YnNjcmlwdGApKTtcblx0XHRcdFx0XHRzdHlsZU5hbWVzLnB1c2goJ2NvZGUtc3Vic2NyaXB0Jyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSA3NTogeyAvLyBuZWl0aGVyIHN1cGVyc2NyaXB0IG9yIHN1YnNjcmlwdFxuXHRcdFx0XHRcdHN0eWxlTmFtZXMgPSBzdHlsZU5hbWVzLmZpbHRlcihzdHlsZSA9PiAoc3R5bGUgIT09IGBjb2RlLXN1cGVyc2NyaXB0YCAmJiBzdHlsZSAhPT0gYGNvZGUtc3Vic2NyaXB0YCkpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0XHRzZXRCYXNpY0NvbG9yKGNvZGUpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIENhbGN1bGF0ZSBhbmQgc2V0IHN0eWxpbmcgZm9yIGNvbXBsaWNhdGVkIDI0LWJpdCBBTlNJIGNvbG9yIGNvZGVzLlxuXHQgKiBAcGFyYW0gc3R5bGVDb2RlcyBGdWxsIGxpc3Qgb2YgaW50ZWdlciBjb2RlcyB0aGF0IG1ha2UgdXAgdGhlIGZ1bGwgQU5TSVxuXHQgKiBzZXF1ZW5jZSwgaW5jbHVkaW5nIHRoZSB0d28gZGVmaW5pbmcgY29kZXMgYW5kIHRoZSB0aHJlZSBSR0IgY29kZXMuXG5cdCAqIEBwYXJhbSBjb2xvclR5cGUgSWYgYCdmb3JlZ3JvdW5kJ2AsIHdpbGwgc2V0IGZvcmVncm91bmQgY29sb3IsIGlmXG5cdCAqIGAnYmFja2dyb3VuZCdgLCB3aWxsIHNldCBiYWNrZ3JvdW5kIGNvbG9yLCBhbmQgaWYgaXQgaXMgYCd1bmRlcmxpbmUnYFxuXHQgKiB3aWxsIHNldCB0aGUgdW5kZXJsaW5lIGNvbG9yLlxuXHQgKiBAc2VlIHtAbGluayBodHRwczovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9BTlNJX2VzY2FwZV9jb2RlIzI0LWJpdCB9XG5cdCAqL1xuXHRmdW5jdGlvbiBzZXQyNEJpdENvbG9yKHN0eWxlQ29kZXM6IG51bWJlcltdLCBjb2xvclR5cGU6ICdmb3JlZ3JvdW5kJyB8ICdiYWNrZ3JvdW5kJyB8ICd1bmRlcmxpbmUnKTogdm9pZCB7XG5cdFx0aWYgKHN0eWxlQ29kZXMubGVuZ3RoID49IDUgJiZcblx0XHRcdHN0eWxlQ29kZXNbMl0gPj0gMCAmJiBzdHlsZUNvZGVzWzJdIDw9IDI1NSAmJlxuXHRcdFx0c3R5bGVDb2Rlc1szXSA+PSAwICYmIHN0eWxlQ29kZXNbM10gPD0gMjU1ICYmXG5cdFx0XHRzdHlsZUNvZGVzWzRdID49IDAgJiYgc3R5bGVDb2Rlc1s0XSA8PSAyNTUpIHtcblx0XHRcdGNvbnN0IGN1c3RvbUNvbG9yID0gbmV3IFJHQkEoc3R5bGVDb2Rlc1syXSwgc3R5bGVDb2Rlc1szXSwgc3R5bGVDb2Rlc1s0XSk7XG5cdFx0XHRjaGFuZ2VDb2xvcihjb2xvclR5cGUsIGN1c3RvbUNvbG9yKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQ2FsY3VsYXRlIGFuZCBzZXQgc3R5bGluZyBmb3IgYWR2YW5jZWQgOC1iaXQgQU5TSSBjb2xvciBjb2Rlcy5cblx0ICogQHBhcmFtIHN0eWxlQ29kZXMgRnVsbCBsaXN0IG9mIGludGVnZXIgY29kZXMgdGhhdCBtYWtlIHVwIHRoZSBBTlNJXG5cdCAqIHNlcXVlbmNlLCBpbmNsdWRpbmcgdGhlIHR3byBkZWZpbmluZyBjb2RlcyBhbmQgdGhlIG9uZSBjb2xvciBjb2RlLlxuXHQgKiBAcGFyYW0gY29sb3JUeXBlIElmIGAnZm9yZWdyb3VuZCdgLCB3aWxsIHNldCBmb3JlZ3JvdW5kIGNvbG9yLCBpZlxuXHQgKiBgJ2JhY2tncm91bmQnYCwgd2lsbCBzZXQgYmFja2dyb3VuZCBjb2xvciBhbmQgaWYgaXQgaXMgYCd1bmRlcmxpbmUnYFxuXHQgKiB3aWxsIHNldCB0aGUgdW5kZXJsaW5lIGNvbG9yLlxuXHQgKiBAc2VlIHtAbGluayBodHRwczovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9BTlNJX2VzY2FwZV9jb2RlIzgtYml0IH1cblx0ICovXG5cdGZ1bmN0aW9uIHNldDhCaXRDb2xvcihzdHlsZUNvZGVzOiBudW1iZXJbXSwgY29sb3JUeXBlOiAnZm9yZWdyb3VuZCcgfCAnYmFja2dyb3VuZCcgfCAndW5kZXJsaW5lJyk6IHZvaWQge1xuXHRcdGxldCBjb2xvck51bWJlciA9IHN0eWxlQ29kZXNbMl07XG5cdFx0Y29uc3QgY29sb3IgPSBjYWxjQU5TSThiaXRDb2xvcihjb2xvck51bWJlcik7XG5cblx0XHRpZiAoY29sb3IpIHtcblx0XHRcdGNoYW5nZUNvbG9yKGNvbG9yVHlwZSwgY29sb3IpO1xuXHRcdH0gZWxzZSBpZiAoY29sb3JOdW1iZXIgPj0gMCAmJiBjb2xvck51bWJlciA8PSAxNSkge1xuXHRcdFx0aWYgKGNvbG9yVHlwZSA9PT0gJ3VuZGVybGluZScpIHtcblx0XHRcdFx0Ly8gZm9yIHVuZGVybGluZSBjb2xvcnMgd2UganVzdCBkZWNvZGUgdGhlIDAtMTUgY29sb3IgbnVtYmVyIHRvIHRoZW1lIGNvbG9yLCBzZXQgYW5kIHJldHVyblxuXHRcdFx0XHRjb25zdCBjb2xvck5hbWUgPSBhbnNpQ29sb3JJZGVudGlmaWVyc1tjb2xvck51bWJlcl07XG5cdFx0XHRcdGNoYW5nZUNvbG9yKGNvbG9yVHlwZSwgYC0tdnNjb2RlLWRlYnVnLWFuc2ktJHtjb2xvck5hbWV9YCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdC8vIE5lZWQgdG8gbWFwIHRvIG9uZSBvZiB0aGUgZm91ciBiYXNpYyBjb2xvciByYW5nZXMgKDMwLTM3LCA5MC05NywgNDAtNDcsIDEwMC0xMDcpXG5cdFx0XHRjb2xvck51bWJlciArPSAzMDtcblx0XHRcdGlmIChjb2xvck51bWJlciA+PSAzOCkge1xuXHRcdFx0XHQvLyBCcmlnaHQgY29sb3JzXG5cdFx0XHRcdGNvbG9yTnVtYmVyICs9IDUyO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNvbG9yVHlwZSA9PT0gJ2JhY2tncm91bmQnKSB7XG5cdFx0XHRcdGNvbG9yTnVtYmVyICs9IDEwO1xuXHRcdFx0fVxuXHRcdFx0c2V0QmFzaWNDb2xvcihjb2xvck51bWJlcik7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIENhbGN1bGF0ZSBhbmQgc2V0IHN0eWxpbmcgZm9yIGJhc2ljIGJyaWdodCBhbmQgZGFyayBBTlNJIGNvbG9yIGNvZGVzLiBVc2VzXG5cdCAqIHRoZW1lIGNvbG9ycyBpZiBhdmFpbGFibGUuIEF1dG9tYXRpY2FsbHkgZGlzdGluZ3Vpc2hlcyBiZXR3ZWVuIGZvcmVncm91bmRcblx0ICogYW5kIGJhY2tncm91bmQgY29sb3JzOyBkb2VzIG5vdCBzdXBwb3J0IGNvbG9yLWNsZWFyaW5nIGNvZGVzIDM5IGFuZCA0OS5cblx0ICogQHBhcmFtIHN0eWxlQ29kZSBJbnRlZ2VyIGNvbG9yIGNvZGUgb24gb25lIG9mIHRoZSBmb2xsb3dpbmcgcmFuZ2VzOlxuXHQgKiBbMzAtMzcsIDkwLTk3LCA0MC00NywgMTAwLTEwN10uIElmIG5vdCBvbiBvbmUgb2YgdGhlc2UgcmFuZ2VzLCB3aWxsIGRvXG5cdCAqIG5vdGhpbmcuXG5cdCAqL1xuXHRmdW5jdGlvbiBzZXRCYXNpY0NvbG9yKHN0eWxlQ29kZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0bGV0IGNvbG9yVHlwZTogJ2ZvcmVncm91bmQnIHwgJ2JhY2tncm91bmQnIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBjb2xvckluZGV4OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cblx0XHRpZiAoc3R5bGVDb2RlID49IDMwICYmIHN0eWxlQ29kZSA8PSAzNykge1xuXHRcdFx0Y29sb3JJbmRleCA9IHN0eWxlQ29kZSAtIDMwO1xuXHRcdFx0Y29sb3JUeXBlID0gJ2ZvcmVncm91bmQnO1xuXHRcdH0gZWxzZSBpZiAoc3R5bGVDb2RlID49IDkwICYmIHN0eWxlQ29kZSA8PSA5Nykge1xuXHRcdFx0Y29sb3JJbmRleCA9IChzdHlsZUNvZGUgLSA5MCkgKyA4OyAvLyBIaWdoLWludGVuc2l0eSAoYnJpZ2h0KVxuXHRcdFx0Y29sb3JUeXBlID0gJ2ZvcmVncm91bmQnO1xuXHRcdH0gZWxzZSBpZiAoc3R5bGVDb2RlID49IDQwICYmIHN0eWxlQ29kZSA8PSA0Nykge1xuXHRcdFx0Y29sb3JJbmRleCA9IHN0eWxlQ29kZSAtIDQwO1xuXHRcdFx0Y29sb3JUeXBlID0gJ2JhY2tncm91bmQnO1xuXHRcdH0gZWxzZSBpZiAoc3R5bGVDb2RlID49IDEwMCAmJiBzdHlsZUNvZGUgPD0gMTA3KSB7XG5cdFx0XHRjb2xvckluZGV4ID0gKHN0eWxlQ29kZSAtIDEwMCkgKyA4OyAvLyBIaWdoLWludGVuc2l0eSAoYnJpZ2h0KVxuXHRcdFx0Y29sb3JUeXBlID0gJ2JhY2tncm91bmQnO1xuXHRcdH1cblxuXHRcdGlmIChjb2xvckluZGV4ICE9PSB1bmRlZmluZWQgJiYgY29sb3JUeXBlKSB7XG5cdFx0XHRjb25zdCBjb2xvck5hbWUgPSBhbnNpQ29sb3JJZGVudGlmaWVyc1tjb2xvckluZGV4XTtcblx0XHRcdGNoYW5nZUNvbG9yKGNvbG9yVHlwZSwgYC0tdnNjb2RlLWRlYnVnLWFuc2ktJHtjb2xvck5hbWUucmVwbGFjZUFsbCgnLicsICctJyl9YCk7XG5cdFx0fVxuXHR9XG59XG5cbi8qKlxuICogQHBhcmFtIHJvb3QgVGhlIHtAbGluayBIVE1MRWxlbWVudH0gdG8gYXBwZW5kIHRoZSBjb250ZW50IHRvLlxuICogQHBhcmFtIHN0cmluZ0NvbnRlbnQgVGhlIHRleHQgY29udGVudCB0byBiZSBhcHBlbmRlZC5cbiAqIEBwYXJhbSBjc3NDbGFzc2VzIFRoZSBsaXN0IG9mIENTUyBzdHlsZXMgdG8gYXBwbHkgdG8gdGhlIHRleHQgY29udGVudC5cbiAqIEBwYXJhbSBsaW5rRGV0ZWN0b3IgVGhlIHtAbGluayBJTGlua0RldGVjdG9yfSByZXNwb25zaWJsZSBmb3IgZ2VuZXJhdGluZyBsaW5rcyBmcm9tIHtAcGFyYW0gc3RyaW5nQ29udGVudH0uXG4gKiBAcGFyYW0gY3VzdG9tVGV4dENvbG9yIElmIHByb3ZpZGVkLCB3aWxsIGFwcGx5IGN1c3RvbSBjb2xvciB3aXRoIGlubGluZSBzdHlsZS5cbiAqIEBwYXJhbSBjdXN0b21CYWNrZ3JvdW5kQ29sb3IgSWYgcHJvdmlkZWQsIHdpbGwgYXBwbHkgY3VzdG9tIGJhY2tncm91bmRDb2xvciB3aXRoIGlubGluZSBzdHlsZS5cbiAqIEBwYXJhbSBjdXN0b21VbmRlcmxpbmVDb2xvciBJZiBwcm92aWRlZCwgd2lsbCBhcHBseSBjdXN0b20gdGV4dERlY29yYXRpb25Db2xvciB3aXRoIGlubGluZSBzdHlsZS5cbiAqIEBwYXJhbSBoaWdobGlnaHRzIFRoZSByYW5nZXMgdG8gaGlnaGxpZ2h0LlxuICogQHBhcmFtIG9mZnNldCBUaGUgc3RhcnRpbmcgaW5kZXggb2YgdGhlIHN0cmluZ0NvbnRlbnQgaW4gdGhlIG9yaWdpbmFsIHRleHQuXG4gKiBAcGFyYW0gaG92ZXJCZWhhdmlvciBob3ZlciBiZWhhdmlvciB3aXRoIGRpc3Bvc2FibGUgc3RvcmUgZm9yIG1hbmFnaW5nIGV2ZW50IGxpc3RlbmVycy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFwcGVuZFN0eWxpemVkU3RyaW5nVG9Db250YWluZXIoXG5cdHJvb3Q6IEhUTUxFbGVtZW50LFxuXHRzdHJpbmdDb250ZW50OiBzdHJpbmcsXG5cdGNzc0NsYXNzZXM6IHN0cmluZ1tdLFxuXHRsaW5rRGV0ZWN0b3I6IElMaW5rRGV0ZWN0b3IsXG5cdHdvcmtzcGFjZUZvbGRlcjogSVdvcmtzcGFjZUZvbGRlciB8IHVuZGVmaW5lZCxcblx0Y3VzdG9tVGV4dENvbG9yOiBSR0JBIHwgc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRjdXN0b21CYWNrZ3JvdW5kQ29sb3I6IFJHQkEgfCBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdGN1c3RvbVVuZGVybGluZUNvbG9yOiBSR0JBIHwgc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRoaWdobGlnaHRzOiBJSGlnaGxpZ2h0W10gfCB1bmRlZmluZWQsXG5cdG9mZnNldDogbnVtYmVyLFxuXHRob3ZlckJlaGF2aW9yOiBEZWJ1Z0xpbmtIb3ZlckJlaGF2aW9yVHlwZURhdGEsXG4pOiB2b2lkIHtcblx0aWYgKCFyb290IHx8ICFzdHJpbmdDb250ZW50KSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Y29uc3QgY29udGFpbmVyID0gbGlua0RldGVjdG9yLmxpbmtpZnkoXG5cdFx0c3RyaW5nQ29udGVudCxcblx0XHRob3ZlckJlaGF2aW9yLFxuXHRcdHRydWUsXG5cdFx0d29ya3NwYWNlRm9sZGVyLFxuXHRcdHVuZGVmaW5lZCxcblx0XHRoaWdobGlnaHRzPy5tYXAoaCA9PiAoeyBzdGFydDogaC5zdGFydCAtIG9mZnNldCwgZW5kOiBoLmVuZCAtIG9mZnNldCwgZXh0cmFDbGFzc2VzOiBoLmV4dHJhQ2xhc3NlcyB9KSksXG5cdCk7XG5cblx0Y29udGFpbmVyLmNsYXNzTmFtZSA9IGNzc0NsYXNzZXMuam9pbignICcpO1xuXHRpZiAoY3VzdG9tVGV4dENvbG9yKSB7XG5cdFx0Y29udGFpbmVyLnN0eWxlLmNvbG9yID1cblx0XHRcdHR5cGVvZiBjdXN0b21UZXh0Q29sb3IgPT09ICdzdHJpbmcnID8gYHZhcigke2N1c3RvbVRleHRDb2xvcn0pYCA6IENvbG9yLkZvcm1hdC5DU1MuZm9ybWF0UkdCKG5ldyBDb2xvcihjdXN0b21UZXh0Q29sb3IpKTtcblx0fVxuXHRpZiAoY3VzdG9tQmFja2dyb3VuZENvbG9yKSB7XG5cdFx0Y29udGFpbmVyLnN0eWxlLmJhY2tncm91bmRDb2xvciA9XG5cdFx0XHR0eXBlb2YgY3VzdG9tQmFja2dyb3VuZENvbG9yID09PSAnc3RyaW5nJyA/IGB2YXIoJHtjdXN0b21CYWNrZ3JvdW5kQ29sb3J9KWAgOiBDb2xvci5Gb3JtYXQuQ1NTLmZvcm1hdFJHQihuZXcgQ29sb3IoY3VzdG9tQmFja2dyb3VuZENvbG9yKSk7XG5cdH1cblx0aWYgKGN1c3RvbVVuZGVybGluZUNvbG9yKSB7XG5cdFx0Y29udGFpbmVyLnN0eWxlLnRleHREZWNvcmF0aW9uQ29sb3IgPVxuXHRcdFx0dHlwZW9mIGN1c3RvbVVuZGVybGluZUNvbG9yID09PSAnc3RyaW5nJyA/IGB2YXIoJHtjdXN0b21VbmRlcmxpbmVDb2xvcn0pYCA6IENvbG9yLkZvcm1hdC5DU1MuZm9ybWF0UkdCKG5ldyBDb2xvcihjdXN0b21VbmRlcmxpbmVDb2xvcikpO1xuXHR9XG5cblx0cm9vdC5hcHBlbmRDaGlsZChjb250YWluZXIpO1xufVxuXG4vKipcbiAqIENhbGN1bGF0ZSB0aGUgY29sb3IgZnJvbSB0aGUgY29sb3Igc2V0IGRlZmluZWQgaW4gdGhlIEFOU0kgOC1iaXQgc3RhbmRhcmQuXG4gKiBTdGFuZGFyZCBhbmQgaGlnaCBpbnRlbnNpdHkgY29sb3JzIGFyZSBub3QgZGVmaW5lZCBpbiB0aGUgc3RhbmRhcmQgYXMgc3BlY2lmaWNcbiAqIGNvbG9ycywgc28gdGhlc2UgYW5kIGludmFsaWQgY29sb3JzIHJldHVybiBgdW5kZWZpbmVkYC5cbiAqIEBzZWUge0BsaW5rIGh0dHBzOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL0FOU0lfZXNjYXBlX2NvZGUjOC1iaXQgfSBmb3IgaW5mby5cbiAqIEBwYXJhbSBjb2xvck51bWJlciBUaGUgbnVtYmVyIChyYW5naW5nIGZyb20gMTYgdG8gMjU1KSByZWZlcnJpbmcgdG8gdGhlIGNvbG9yXG4gKiBkZXNpcmVkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY2FsY0FOU0k4Yml0Q29sb3IoY29sb3JOdW1iZXI6IG51bWJlcik6IFJHQkEgfCB1bmRlZmluZWQge1xuXHRpZiAoY29sb3JOdW1iZXIgJSAxICE9PSAwKSB7XG5cdFx0Ly8gU2hvdWxkIGJlIGludGVnZXJcblx0XHRyZXR1cm47XG5cdH0gaWYgKGNvbG9yTnVtYmVyID49IDE2ICYmIGNvbG9yTnVtYmVyIDw9IDIzMSkge1xuXHRcdC8vIENvbnZlcnRzIHRvIG9uZSBvZiAyMTYgUkdCIGNvbG9yc1xuXHRcdGNvbG9yTnVtYmVyIC09IDE2O1xuXG5cdFx0bGV0IGJsdWU6IG51bWJlciA9IGNvbG9yTnVtYmVyICUgNjtcblx0XHRjb2xvck51bWJlciA9IChjb2xvck51bWJlciAtIGJsdWUpIC8gNjtcblx0XHRsZXQgZ3JlZW46IG51bWJlciA9IGNvbG9yTnVtYmVyICUgNjtcblx0XHRjb2xvck51bWJlciA9IChjb2xvck51bWJlciAtIGdyZWVuKSAvIDY7XG5cdFx0bGV0IHJlZDogbnVtYmVyID0gY29sb3JOdW1iZXI7XG5cblx0XHQvLyByZWQsIGdyZWVuLCBibHVlIG5vdyByYW5nZSBvbiBbMCwgNV0sIG5lZWQgdG8gbWFwIHRvIFswLDI1NV1cblx0XHRjb25zdCBjb252RmFjdG9yOiBudW1iZXIgPSAyNTUgLyA1O1xuXHRcdGJsdWUgPSBNYXRoLnJvdW5kKGJsdWUgKiBjb252RmFjdG9yKTtcblx0XHRncmVlbiA9IE1hdGgucm91bmQoZ3JlZW4gKiBjb252RmFjdG9yKTtcblx0XHRyZWQgPSBNYXRoLnJvdW5kKHJlZCAqIGNvbnZGYWN0b3IpO1xuXG5cdFx0cmV0dXJuIG5ldyBSR0JBKHJlZCwgZ3JlZW4sIGJsdWUpO1xuXHR9IGVsc2UgaWYgKGNvbG9yTnVtYmVyID49IDIzMiAmJiBjb2xvck51bWJlciA8PSAyNTUpIHtcblx0XHQvLyBDb252ZXJ0cyB0byBhIGdyYXlzY2FsZSB2YWx1ZVxuXHRcdGNvbG9yTnVtYmVyIC09IDIzMjtcblx0XHRjb25zdCBjb2xvckxldmVsOiBudW1iZXIgPSBNYXRoLnJvdW5kKGNvbG9yTnVtYmVyIC8gMjMgKiAyNTUpO1xuXHRcdHJldHVybiBuZXcgUkdCQShjb2xvckxldmVsLCBjb2xvckxldmVsLCBjb2xvckxldmVsKTtcblx0fSBlbHNlIHtcblx0XHRyZXR1cm47XG5cdH1cbn1cblxucmVnaXN0ZXJUaGVtaW5nUGFydGljaXBhbnQoKHRoZW1lLCBjb2xsZWN0b3IpID0+IHtcblx0Y29uc3QgYXJlYXMgPSBbXG5cdFx0eyBzZWxlY3RvcjogJy5tb25hY28td29ya2JlbmNoIC5zaWRlYmFyLCAubW9uYWNvLXdvcmtiZW5jaCAuYXV4aWxpYXJ5YmFyJywgYmc6IHRoZW1lLmdldENvbG9yKFNJREVfQkFSX0JBQ0tHUk9VTkQpIH0sXG5cdFx0eyBzZWxlY3RvcjogJy5tb25hY28td29ya2JlbmNoIC5wYW5lbCcsIGJnOiB0aGVtZS5nZXRDb2xvcihQQU5FTF9CQUNLR1JPVU5EKSB9LFxuXHRcdHsgc2VsZWN0b3I6ICcubW9uYWNvLXdvcmtiZW5jaCAubW9uYWNvLWxpc3Qtcm93LnNlbGVjdGVkJywgYmc6IHRoZW1lLmdldENvbG9yKGxpc3RJbmFjdGl2ZVNlbGVjdGlvbkJhY2tncm91bmQpIH0sXG5cdFx0eyBzZWxlY3RvcjogJy5tb25hY28td29ya2JlbmNoIC5tb25hY28tbGlzdC1yb3cuZm9jdXNlZCcsIGJnOiB0aGVtZS5nZXRDb2xvcihsaXN0SW5hY3RpdmVGb2N1c0JhY2tncm91bmQpIH0sXG5cdFx0eyBzZWxlY3RvcjogJy5tb25hY28td29ya2JlbmNoIC5tb25hY28tbGlzdDpmb2N1cyAubW9uYWNvLWxpc3Qtcm93LmZvY3VzZWQnLCBiZzogdGhlbWUuZ2V0Q29sb3IobGlzdEZvY3VzQmFja2dyb3VuZCkgfSxcblx0XHR7IHNlbGVjdG9yOiAnLm1vbmFjby13b3JrYmVuY2ggLm1vbmFjby1saXN0OmZvY3VzIC5tb25hY28tbGlzdC1yb3cuc2VsZWN0ZWQnLCBiZzogdGhlbWUuZ2V0Q29sb3IobGlzdEFjdGl2ZVNlbGVjdGlvbkJhY2tncm91bmQpIH0sXG5cdFx0eyBzZWxlY3RvcjogJy5kZWJ1Zy1ob3Zlci13aWRnZXQnLCBiZzogdGhlbWUuZ2V0Q29sb3IoZWRpdG9ySG92ZXJCYWNrZ3JvdW5kKSB9LFxuXHRdO1xuXG5cdGZvciAoY29uc3QgeyBzZWxlY3RvciwgYmcgfSBvZiBhcmVhcykge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBhbnNpQ29sb3JJZGVudGlmaWVyc1xuXHRcdFx0Lm1hcChjb2xvciA9PiB7XG5cdFx0XHRcdGNvbnN0IGFjdHVhbCA9IHRoZW1lLmdldENvbG9yKGNvbG9yKTtcblx0XHRcdFx0aWYgKCFhY3R1YWwpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdFx0XHQvLyB0aGlzIHVzZXMgdGhlIGRlZmF1bHQgY29udHJhc3QgcmF0aW8gb2YgNCAoZnJvbSB0aGUgdGVybWluYWwpLFxuXHRcdFx0XHQvLyB3ZSBtYXkgd2FudCB0byBtYWtlIHRoaXMgY29uZmlndXJhYmxlIGluIHRoZSBmdXR1cmUsIGJ1dCB0aGlzIGlzXG5cdFx0XHRcdC8vIGdvb2QgdG8ga2VlcCB0aGluZ3Mgc2FuZSB0byBzdGFydCB3aXRoLlxuXHRcdFx0XHRyZXR1cm4gYC0tdnNjb2RlLWRlYnVnLWFuc2ktJHtjb2xvci5yZXBsYWNlQWxsKCcuJywgJy0nKX06JHtiZyA/IGJnLmVuc3VyZUNvbnN0cmFzdChhY3R1YWwsIDQpIDogYWN0dWFsfWA7XG5cdFx0XHR9KVxuXHRcdFx0LmZpbHRlcihpc0RlZmluZWQpO1xuXG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYCR7c2VsZWN0b3J9IHsgJHtjb250ZW50LmpvaW4oJzsnKX0gfWApO1xuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFNBQVMsT0FBTyxZQUFZO0FBQzVCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsdUJBQXVCLCtCQUErQixxQkFBcUIsNkJBQTZCLHVDQUF1QztBQUN4SixTQUFTLGtDQUFrQztBQUUzQyxTQUFTLGtCQUFrQiwyQkFBMkI7QUFDdEQsU0FBUyw0QkFBNEI7QUFPOUIsU0FBUyxpQkFBaUIsTUFBYyxjQUE2QixpQkFBK0MsWUFBc0MsZUFBZ0U7QUFFaE8sUUFBTSxPQUF3QixTQUFTLGNBQWMsTUFBTTtBQUMzRCxRQUFNLGFBQXFCLEtBQUs7QUFFaEMsTUFBSSxhQUF1QixDQUFDO0FBQzVCLE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUksaUJBQTBCO0FBQzlCLE1BQUksYUFBcUI7QUFDekIsTUFBSSxpQkFBaUI7QUFDckIsTUFBSSxTQUFpQjtBQUVyQixTQUFPLGFBQWEsWUFBWTtBQUUvQixRQUFJLGdC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QUFNO0FBQ2pDLFdBQU8sS0FBSyxNQUFNLE9BQU8sVUFBVTtBQUNuQyxZQUFRLEtBQUssTUFBTSxRQUFRLFVBQVU7QUFDckMsVUFBTSxLQUFLLE1BQU0sTUFBTSxVQUFVO0FBRWpDLFdBQU8sSUFBSSxLQUFLLEtBQUssT0FBTyxJQUFJO0FBQUEsRUFDakMsV0FBVyxlQUFlLE9BQU8sZUFBZSxLQUFLO0FBRXBELG1CQUFlO0FBQ2YsVUFBTSxhQUFxQixLQUFLLE1BQU0sY0FBYyxLQUFLLEdBQUc7QUFDNUQsV0FBTyxJQUFJLEtBQUssWUFBWSxZQUFZLFVBQVU7QUFBQSxFQUNuRCxPQUFPO0FBQ047QUFBQSxFQUNEO0FBQ0Q7QUFFQSwyQkFBMkIsQ0FBQyxPQUFPLGNBQWM7QUFDaEQsUUFBTSxRQUFRO0FBQUEsSUFDYixFQUFFLFVBQVUsK0RBQStELElBQUksTUFBTSxTQUFTLG1CQUFtQixFQUFFO0FBQUEsSUFDbkgsRUFBRSxVQUFVLDRCQUE0QixJQUFJLE1BQU0sU0FBUyxnQkFBZ0IsRUFBRTtBQUFBLElBQzdFLEVBQUUsVUFBVSwrQ0FBK0MsSUFBSSxNQUFNLFNBQVMsK0JBQStCLEVBQUU7QUFBQSxJQUMvRyxFQUFFLFVBQVUsOENBQThDLElBQUksTUFBTSxTQUFTLDJCQUEyQixFQUFFO0FBQUEsSUFDMUcsRUFBRSxVQUFVLGlFQUFpRSxJQUFJLE1BQU0sU0FBUyxtQkFBbUIsRUFBRTtBQUFBLElBQ3JILEVBQUUsVUFBVSxrRUFBa0UsSUFBSSxNQUFNLFNBQVMsNkJBQTZCLEVBQUU7QUFBQSxJQUNoSSxFQUFFLFVBQVUsdUJBQXVCLElBQUksTUFBTSxTQUFTLHFCQUFxQixFQUFFO0FBQUEsRUFDOUU7QUFFQSxhQUFXLEVBQUUsVUFBVSxHQUFHLEtBQUssT0FBTztBQUNyQyxVQUFNLFVBQVUscUJBQ2QsSUFBSSxXQUFTO0FBQ2IsWUFBTSxTQUFTLE1BQU0sU0FBUyxLQUFLO0FBQ25DLFVBQUksQ0FBQyxRQUFRO0FBQUUsZUFBTztBQUFBLE1BQVc7QUFJakMsYUFBTyx1QkFBdUIsTUFBTSxXQUFXLEtBQUssR0FBRyxDQUFDLElBQUksS0FBSyxHQUFHLGdCQUFnQixRQUFRLENBQUMsSUFBSSxNQUFNO0FBQUEsSUFDeEcsQ0FBQyxFQUNBLE9BQU8sU0FBUztBQUVsQixjQUFVLFFBQVEsR0FBRyxRQUFRLE1BQU0sUUFBUSxLQUFLLEdBQUcsQ0FBQyxJQUFJO0FBQUEsRUFDekQ7QUFDRCxDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
