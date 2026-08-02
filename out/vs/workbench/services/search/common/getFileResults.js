import { Range } from "../../../../editor/common/core/range.js";
const getFileResults = (bytes, pattern, options) => {
  let text;
  if (bytes[0] === 255 && bytes[1] === 254) {
    text = new TextDecoder("utf-16le").decode(bytes);
  } else if (bytes[0] === 254 && bytes[1] === 255) {
    text = new TextDecoder("utf-16be").decode(bytes);
  } else {
    text = new TextDecoder("utf8").decode(bytes);
    if (text.slice(0, 1e3).includes("\uFFFD") && bytes.includes(0)) {
      return [];
    }
  }
  const results = [];
  const patternIndices = [];
  let patternMatch = null;
  let remainingResultQuota = options.remainingResultQuota;
  while (remainingResultQuota >= 0 && (patternMatch = pattern.exec(text))) {
    patternIndices.push({ matchStartIndex: patternMatch.index, matchedText: patternMatch[0] });
    remainingResultQuota--;
  }
  if (patternIndices.length) {
    const contextLinesNeeded = /* @__PURE__ */ new Set();
    const resultLines = /* @__PURE__ */ new Set();
    const lineRanges = [];
    const readLine = (lineNumber) => text.slice(lineRanges[lineNumber].start, lineRanges[lineNumber].end);
    let prevLineEnd = 0;
    let lineEndingMatch = null;
    const lineEndRegex = /\r?\n/g;
    while (lineEndingMatch = lineEndRegex.exec(text)) {
      lineRanges.push({ start: prevLineEnd, end: lineEndingMatch.index });
      prevLineEnd = lineEndingMatch.index + lineEndingMatch[0].length;
    }
    if (prevLineEnd < text.length) {
      lineRanges.push({ start: prevLineEnd, end: text.length });
    }
    let startLine = 0;
    for (const { matchStartIndex, matchedText } of patternIndices) {
      if (remainingResultQuota < 0) {
        break;
      }
      while (Boolean(lineRanges[startLine + 1]) && matchStartIndex > lineRanges[startLine].end) {
        startLine++;
      }
      let endLine = startLine;
      while (Boolean(lineRanges[endLine + 1]) && matchStartIndex + matchedText.length > lineRanges[endLine].end) {
        endLine++;
      }
      if (options.surroundingContext) {
        for (let contextLine = Math.max(0, startLine - options.surroundingContext); contextLine < startLine; contextLine++) {
          contextLinesNeeded.add(contextLine);
        }
      }
      let previewText = "";
      let offset = 0;
      for (let matchLine = startLine; matchLine <= endLine; matchLine++) {
        let previewLine = readLine(matchLine);
        if (options.previewOptions?.charsPerLine && previewLine.length > options.previewOptions.charsPerLine) {
          offset = Math.max(matchStartIndex - lineRanges[startLine].start - 20, 0);
          previewLine = previewLine.substr(offset, options.previewOptions.charsPerLine);
        }
        previewText += `${previewLine}
`;
        resultLines.add(matchLine);
      }
      const fileRange = new Range(
        startLine,
        matchStartIndex - lineRanges[startLine].start,
        endLine,
        matchStartIndex + matchedText.length - lineRanges[endLine].start
      );
      const previewRange = new Range(
        0,
        matchStartIndex - lineRanges[startLine].start - offset,
        endLine - startLine,
        matchStartIndex + matchedText.length - lineRanges[endLine].start - (endLine === startLine ? offset : 0)
      );
      const match = {
        rangeLocations: [{
          source: fileRange,
          preview: previewRange
        }],
        previewText
      };
      results.push(match);
      if (options.surroundingContext) {
        for (let contextLine = endLine + 1; contextLine <= Math.min(endLine + options.surroundingContext, lineRanges.length - 1); contextLine++) {
          contextLinesNeeded.add(contextLine);
        }
      }
    }
    for (const contextLine of contextLinesNeeded) {
      if (!resultLines.has(contextLine)) {
        results.push({
          text: readLine(contextLine),
          lineNumber: contextLine + 1
        });
      }
    }
  }
  return results;
};
export {
  getFileResults
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL2dldEZpbGVSZXN1bHRzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSVRleHRTZWFyY2hNYXRjaCwgSVRleHRTZWFyY2hQcmV2aWV3T3B0aW9ucywgSVRleHRTZWFyY2hSZXN1bHQgfSBmcm9tICcuL3NlYXJjaC5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5cbmV4cG9ydCBjb25zdCBnZXRGaWxlUmVzdWx0cyA9IChcblx0Ynl0ZXM6IFVpbnQ4QXJyYXksXG5cdHBhdHRlcm46IFJlZ0V4cCxcblx0b3B0aW9uczoge1xuXHRcdHN1cnJvdW5kaW5nQ29udGV4dDogbnVtYmVyO1xuXHRcdHByZXZpZXdPcHRpb25zOiBJVGV4dFNlYXJjaFByZXZpZXdPcHRpb25zIHwgdW5kZWZpbmVkO1xuXHRcdHJlbWFpbmluZ1Jlc3VsdFF1b3RhOiBudW1iZXI7XG5cdH1cbik6IElUZXh0U2VhcmNoUmVzdWx0W10gPT4ge1xuXG5cdGxldCB0ZXh0OiBzdHJpbmc7XG5cdGlmIChieXRlc1swXSA9PT0gMHhmZiAmJiBieXRlc1sxXSA9PT0gMHhmZSkge1xuXHRcdHRleHQgPSBuZXcgVGV4dERlY29kZXIoJ3V0Zi0xNmxlJykuZGVjb2RlKGJ5dGVzKTtcblx0fSBlbHNlIGlmIChieXRlc1swXSA9PT0gMHhmZSAmJiBieXRlc1sxXSA9PT0gMHhmZikge1xuXHRcdHRleHQgPSBuZXcgVGV4dERlY29kZXIoJ3V0Zi0xNmJlJykuZGVjb2RlKGJ5dGVzKTtcblx0fSBlbHNlIHtcblx0XHR0ZXh0ID0gbmV3IFRleHREZWNvZGVyKCd1dGY4JykuZGVjb2RlKGJ5dGVzKTtcblx0XHRpZiAodGV4dC5zbGljZSgwLCAxMDAwKS5pbmNsdWRlcygnXFx1RkZGRCcpICYmIGJ5dGVzLmluY2x1ZGVzKDApKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHR9XG5cblx0Y29uc3QgcmVzdWx0czogSVRleHRTZWFyY2hSZXN1bHRbXSA9IFtdO1xuXG5cdGNvbnN0IHBhdHRlcm5JbmRpY2VzOiB7IG1hdGNoU3RhcnRJbmRleDogbnVtYmVyOyBtYXRjaGVkVGV4dDogc3RyaW5nIH1bXSA9IFtdO1xuXG5cdGxldCBwYXR0ZXJuTWF0Y2g6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGwgPSBudWxsO1xuXHRsZXQgcmVtYWluaW5nUmVzdWx0UXVvdGEgPSBvcHRpb25zLnJlbWFpbmluZ1Jlc3VsdFF1b3RhO1xuXHR3aGlsZSAocmVtYWluaW5nUmVzdWx0UXVvdGEgPj0gMCAmJiAocGF0dGVybk1hdGNoID0gcGF0dGVybi5leGVjKHRleHQpKSkge1xuXHRcdHBhdHRlcm5JbmRpY2VzLnB1c2goeyBtYXRjaFN0YXJ0SW5kZXg6IHBhdHRlcm5NYXRjaC5pbmRleCwgbWF0Y2hlZFRleHQ6IHBhdHRlcm5NYXRjaFswXSB9KTtcblx0XHRyZW1haW5pbmdSZXN1bHRRdW90YS0tO1xuXHR9XG5cblx0aWYgKHBhdHRlcm5JbmRpY2VzLmxlbmd0aCkge1xuXHRcdGNvbnN0IGNvbnRleHRMaW5lc05lZWRlZCA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuXHRcdGNvbnN0IHJlc3VsdExpbmVzID0gbmV3IFNldDxudW1iZXI+KCk7XG5cblx0XHRjb25zdCBsaW5lUmFuZ2VzOiB7IHN0YXJ0OiBudW1iZXI7IGVuZDogbnVtYmVyIH1bXSA9IFtdO1xuXHRcdGNvbnN0IHJlYWRMaW5lID0gKGxpbmVOdW1iZXI6IG51bWJlcikgPT4gdGV4dC5zbGljZShsaW5lUmFuZ2VzW2xpbmVOdW1iZXJdLnN0YXJ0LCBsaW5lUmFuZ2VzW2xpbmVOdW1iZXJdLmVuZCk7XG5cblx0XHRsZXQgcHJldkxpbmVFbmQgPSAwO1xuXHRcdGxldCBsaW5lRW5kaW5nTWF0Y2g6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGwgPSBudWxsO1xuXHRcdGNvbnN0IGxpbmVFbmRSZWdleCA9IC9cXHI/XFxuL2c7XG5cdFx0d2hpbGUgKChsaW5lRW5kaW5nTWF0Y2ggPSBsaW5lRW5kUmVnZXguZXhlYyh0ZXh0KSkpIHtcblx0XHRcdGxpbmVSYW5nZXMucHVzaCh7IHN0YXJ0OiBwcmV2TGluZUVuZCwgZW5kOiBsaW5lRW5kaW5nTWF0Y2guaW5kZXggfSk7XG5cdFx0XHRwcmV2TGluZUVuZCA9IGxpbmVFbmRpbmdNYXRjaC5pbmRleCArIGxpbmVFbmRpbmdNYXRjaFswXS5sZW5ndGg7XG5cdFx0fVxuXHRcdGlmIChwcmV2TGluZUVuZCA8IHRleHQubGVuZ3RoKSB7IGxpbmVSYW5nZXMucHVzaCh7IHN0YXJ0OiBwcmV2TGluZUVuZCwgZW5kOiB0ZXh0Lmxlbmd0aCB9KTsgfVxuXG5cdFx0bGV0IHN0YXJ0TGluZSA9IDA7XG5cdFx0Zm9yIChjb25zdCB7IG1hdGNoU3RhcnRJbmRleCwgbWF0Y2hlZFRleHQgfSBvZiBwYXR0ZXJuSW5kaWNlcykge1xuXHRcdFx0aWYgKHJlbWFpbmluZ1Jlc3VsdFF1b3RhIDwgMCkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0d2hpbGUgKEJvb2xlYW4obGluZVJhbmdlc1tzdGFydExpbmUgKyAxXSkgJiYgbWF0Y2hTdGFydEluZGV4ID4gbGluZVJhbmdlc1tzdGFydExpbmVdLmVuZCkge1xuXHRcdFx0XHRzdGFydExpbmUrKztcblx0XHRcdH1cblx0XHRcdGxldCBlbmRMaW5lID0gc3RhcnRMaW5lO1xuXHRcdFx0d2hpbGUgKEJvb2xlYW4obGluZVJhbmdlc1tlbmRMaW5lICsgMV0pICYmIG1hdGNoU3RhcnRJbmRleCArIG1hdGNoZWRUZXh0Lmxlbmd0aCA+IGxpbmVSYW5nZXNbZW5kTGluZV0uZW5kKSB7XG5cdFx0XHRcdGVuZExpbmUrKztcblx0XHRcdH1cblxuXHRcdFx0aWYgKG9wdGlvbnMuc3Vycm91bmRpbmdDb250ZXh0KSB7XG5cdFx0XHRcdGZvciAobGV0IGNvbnRleHRMaW5lID0gTWF0aC5tYXgoMCwgc3RhcnRMaW5lIC0gb3B0aW9ucy5zdXJyb3VuZGluZ0NvbnRleHQpOyBjb250ZXh0TGluZSA8IHN0YXJ0TGluZTsgY29udGV4dExpbmUrKykge1xuXHRcdFx0XHRcdGNvbnRleHRMaW5lc05lZWRlZC5hZGQoY29udGV4dExpbmUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGxldCBwcmV2aWV3VGV4dCA9ICcnO1xuXHRcdFx0bGV0IG9mZnNldCA9IDA7XG5cdFx0XHRmb3IgKGxldCBtYXRjaExpbmUgPSBzdGFydExpbmU7IG1hdGNoTGluZSA8PSBlbmRMaW5lOyBtYXRjaExpbmUrKykge1xuXHRcdFx0XHRsZXQgcHJldmlld0xpbmUgPSByZWFkTGluZShtYXRjaExpbmUpO1xuXHRcdFx0XHRpZiAob3B0aW9ucy5wcmV2aWV3T3B0aW9ucz8uY2hhcnNQZXJMaW5lICYmIHByZXZpZXdMaW5lLmxlbmd0aCA+IG9wdGlvbnMucHJldmlld09wdGlvbnMuY2hhcnNQZXJMaW5lKSB7XG5cdFx0XHRcdFx0b2Zmc2V0ID0gTWF0aC5tYXgobWF0Y2hTdGFydEluZGV4IC0gbGluZVJhbmdlc1tzdGFydExpbmVdLnN0YXJ0IC0gMjAsIDApO1xuXHRcdFx0XHRcdHByZXZpZXdMaW5lID0gcHJldmlld0xpbmUuc3Vic3RyKG9mZnNldCwgb3B0aW9ucy5wcmV2aWV3T3B0aW9ucy5jaGFyc1BlckxpbmUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHByZXZpZXdUZXh0ICs9IGAke3ByZXZpZXdMaW5lfVxcbmA7XG5cdFx0XHRcdHJlc3VsdExpbmVzLmFkZChtYXRjaExpbmUpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBmaWxlUmFuZ2UgPSBuZXcgUmFuZ2UoXG5cdFx0XHRcdHN0YXJ0TGluZSxcblx0XHRcdFx0bWF0Y2hTdGFydEluZGV4IC0gbGluZVJhbmdlc1tzdGFydExpbmVdLnN0YXJ0LFxuXHRcdFx0XHRlbmRMaW5lLFxuXHRcdFx0XHRtYXRjaFN0YXJ0SW5kZXggKyBtYXRjaGVkVGV4dC5sZW5ndGggLSBsaW5lUmFuZ2VzW2VuZExpbmVdLnN0YXJ0XG5cdFx0XHQpO1xuXHRcdFx0Y29uc3QgcHJldmlld1JhbmdlID0gbmV3IFJhbmdlKFxuXHRcdFx0XHQwLFxuXHRcdFx0XHRtYXRjaFN0YXJ0SW5kZXggLSBsaW5lUmFuZ2VzW3N0YXJ0TGluZV0uc3RhcnQgLSBvZmZzZXQsXG5cdFx0XHRcdGVuZExpbmUgLSBzdGFydExpbmUsXG5cdFx0XHRcdG1hdGNoU3RhcnRJbmRleCArIG1hdGNoZWRUZXh0Lmxlbmd0aCAtIGxpbmVSYW5nZXNbZW5kTGluZV0uc3RhcnQgLSAoZW5kTGluZSA9PT0gc3RhcnRMaW5lID8gb2Zmc2V0IDogMClcblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IG1hdGNoOiBJVGV4dFNlYXJjaE1hdGNoID0ge1xuXHRcdFx0XHRyYW5nZUxvY2F0aW9uczogW3tcblx0XHRcdFx0XHRzb3VyY2U6IGZpbGVSYW5nZSxcblx0XHRcdFx0XHRwcmV2aWV3OiBwcmV2aWV3UmFuZ2UsXG5cdFx0XHRcdH1dLFxuXHRcdFx0XHRwcmV2aWV3VGV4dDogcHJldmlld1RleHRcblx0XHRcdH07XG5cblx0XHRcdHJlc3VsdHMucHVzaChtYXRjaCk7XG5cblx0XHRcdGlmIChvcHRpb25zLnN1cnJvdW5kaW5nQ29udGV4dCkge1xuXHRcdFx0XHRmb3IgKGxldCBjb250ZXh0TGluZSA9IGVuZExpbmUgKyAxOyBjb250ZXh0TGluZSA8PSBNYXRoLm1pbihlbmRMaW5lICsgb3B0aW9ucy5zdXJyb3VuZGluZ0NvbnRleHQsIGxpbmVSYW5nZXMubGVuZ3RoIC0gMSk7IGNvbnRleHRMaW5lKyspIHtcblx0XHRcdFx0XHRjb250ZXh0TGluZXNOZWVkZWQuYWRkKGNvbnRleHRMaW5lKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGNvbnRleHRMaW5lIG9mIGNvbnRleHRMaW5lc05lZWRlZCkge1xuXHRcdFx0aWYgKCFyZXN1bHRMaW5lcy5oYXMoY29udGV4dExpbmUpKSB7XG5cblx0XHRcdFx0cmVzdWx0cy5wdXNoKHtcblx0XHRcdFx0XHR0ZXh0OiByZWFkTGluZShjb250ZXh0TGluZSksXG5cdFx0XHRcdFx0bGluZU51bWJlcjogY29udGV4dExpbmUgKyAxLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIHJlc3VsdHM7XG59O1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEsU0FBUyxhQUFhO0FBRWYsTUFBTSxpQkFBaUIsQ0FDN0IsT0FDQSxTQUNBLFlBS3lCO0FBRXpCLE1BQUk7QUFDSixNQUFJLE1BQU0sQ0FBQyxNQUFNLE9BQVEsTUFBTSxDQUFDLE1BQU0sS0FBTTtBQUMzQyxXQUFPLElBQUksWUFBWSxVQUFVLEVBQUUsT0FBTyxLQUFLO0FBQUEsRUFDaEQsV0FBVyxNQUFNLENBQUMsTUFBTSxPQUFRLE1BQU0sQ0FBQyxNQUFNLEtBQU07QUFDbEQsV0FBTyxJQUFJLFlBQVksVUFBVSxFQUFFLE9BQU8sS0FBSztBQUFBLEVBQ2hELE9BQU87QUFDTixXQUFPLElBQUksWUFBWSxNQUFNLEVBQUUs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
