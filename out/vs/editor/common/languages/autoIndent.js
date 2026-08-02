import * as strings from "../../../base/common/strings.js";
import { IndentAction } from "./languageConfiguration.js";
import { IndentConsts } from "./supports/indentRules.js";
import { EditorAutoIndentStrategy } from "../config/editorOptions.js";
import { IndentationContextProcessor, isLanguageDifferentFromLineStart, ProcessedIndentRulesSupport } from "./supports/indentationLineProcessor.js";
function getPrecedingValidLine(model, lineNumber, processedIndentRulesSupport) {
  const languageId = model.tokenization.getLanguageIdAtPosition(lineNumber, 0);
  if (lineNumber > 1) {
    let lastLineNumber;
    let resultLineNumber = -1;
    for (lastLineNumber = lineNumber - 1; lastLineNumber >= 1; lastLineNumber--) {
      if (model.tokenization.getLanguageIdAtPosition(lastLineNumber, 0) !== languageId) {
        return resultLineNumber;
      }
      const text = model.getLineContent(lastLineNumber);
      if (processedIndentRulesSupport.shouldIgnore(lastLineNumber) || /^\s+$/.test(text) || text === "") {
        resultLineNumber = lastLineNumber;
        continue;
      }
      return lastLineNumber;
    }
  }
  return -1;
}
function getInheritIndentForLine(autoIndent, model, lineNumber, honorIntentialIndent = true, languageConfigurationService) {
  if (autoIndent < EditorAutoIndentStrategy.Full) {
    return null;
  }
  const indentRulesSupport = languageConfigurationService.getLanguageConfiguration(model.tokenization.getLanguageId()).indentRulesSupport;
  if (!indentRulesSupport) {
    return null;
  }
  const processedIndentRulesSupport = new ProcessedIndentRulesSupport(model, indentRulesSupport, languageConfigurationService);
  if (lineNumber <= 1) {
    return {
      indentation: "",
      action: null
    };
  }
  for (let priorLineNumber = lineNumber - 1; priorLineNumber > 0; priorLineNumber--) {
    if (model.getLineContent(priorLineNumber) !== "") {
      break;
    }
    if (priorLineNumber === 1) {
      return {
        indentation: "",
        action: null
      };
    }
  }
  const precedingUnIgnoredLine = getPrecedingValidLine(model, lineNumber, processedIndentRulesSupport);
  if (precedingUnIgnoredLine < 0) {
    return null;
  } else if (precedingUnIgnoredLine < 1) {
    return {
      indentation: "",
      action: null
    };
  }
  if (processedIndentRulesSupport.shouldIncrease(precedingUnIgnoredLine) || processedIndentRulesSupport.shouldIndentNextLine(precedingUnIgnoredLine)) {
    const precedingUnIgnoredLineContent = model.getLineContent(precedingUnIgnoredLine);
    return {
      indentation: strings.getLeadingWhitespace(precedingUnIgnoredLineContent),
      action: IndentAction.Indent,
      line: precedingUnIgnoredLine
    };
  } else if (processedIndentRulesSupport.shouldDecrease(precedingUnIgnoredLine)) {
    const precedingUnIgnoredLineContent = model.getLineContent(precedingUnIgnoredLine);
    return {
      indentation: strings.getLeadingWhitespace(precedingUnIgnoredLineContent),
      action: null,
      line: precedingUnIgnoredLine
    };
  } else {
    if (precedingUnIgnoredLine === 1) {
      return {
        indentation: strings.getLeadingWhitespace(model.getLineContent(precedingUnIgnoredLine)),
        action: null,
        line: precedingUnIgnoredLine
      };
    }
    const previousLine = precedingUnIgnoredLine - 1;
    const previousLineIndentMetadata = indentRulesSupport.getIndentMetadata(model.getLineContent(previousLine));
    if (!(previousLineIndentMetadata & (IndentConsts.INCREASE_MASK | IndentConsts.DECREASE_MASK)) && previousLineIndentMetadata & IndentConsts.INDENT_NEXTLINE_MASK) {
      let stopLine = 0;
      for (let i = previousLine - 1; i > 0; i--) {
        if (processedIndentRulesSupport.shouldIndentNextLine(i)) {
          continue;
        }
        stopLine = i;
        break;
      }
      return {
        indentation: strings.getLeadingWhitespace(model.getLineContent(stopLine + 1)),
        action: null,
        line: stopLine + 1
      };
    }
    if (honorIntentialIndent) {
      return {
        indentation: strings.getLeadingWhitespace(model.getLineContent(precedingUnIgnoredLine)),
        action: null,
        line: precedingUnIgnoredLine
      };
    } else {
      for (let i = precedingUnIgnoredLine; i > 0; i--) {
        if (processedIndentRulesSupport.shouldIncrease(i)) {
          return {
            indentation: strings.getLeadingWhitespace(model.getLineContent(i)),
            action: IndentAction.Indent,
            line: i
          };
        } else if (processedIndentRulesSupport.shouldIndentNextLine(i)) {
          let stopLine = 0;
          for (let j = i - 1; j > 0; j--) {
            if (processedIndentRulesSupport.shouldIndentNextLine(i)) {
              continue;
            }
            stopLine = j;
            break;
          }
          return {
            indentation: strings.getLeadingWhitespace(model.getLineContent(stopLine + 1)),
            action: null,
            line: stopLine + 1
          };
        } else if (processedIndentRulesSupport.shouldDecrease(i)) {
          return {
            indentation: strings.getLeadingWhitespace(model.getLineContent(i)),
            action: null,
            line: i
          };
        }
      }
      return {
        indentation: strings.getLeadingWhitespace(model.getLineContent(1)),
        action: null,
        line: 1
      };
    }
  }
}
function getGoodIndentForLine(autoIndent, virtualModel, languageId, lineNumber, indentConverter, languageConfigurationService) {
  if (autoIndent < EditorAutoIndentStrategy.Full) {
    return null;
  }
  const richEditSupport = languageConfigurationService.getLanguageConfiguration(languageId);
  if (!richEditSupport) {
    return null;
  }
  const indentRulesSupport = languageConfigurationService.getLanguageConfiguration(languageId).indentRulesSupport;
  if (!indentRulesSupport) {
    return null;
  }
  const processedIndentRulesSupport = new ProcessedIndentRulesSupport(virtualModel, indentRulesSupport, languageConfigurationService);
  const indent = getInheritIndentForLine(autoIndent, virtualModel, lineNumber, void 0, languageConfigurationService);
  if (indent) {
    const inheritLine = indent.line;
    if (inheritLine !== void 0) {
      let shouldApplyEnterRules = true;
      for (let inBetweenLine = inheritLine; inBetweenLine < lineNumber - 1; inBetweenLine++) {
        if (!/^\s*$/.test(virtualModel.getLineContent(inBetweenLine))) {
          shouldApplyEnterRules = false;
          break;
        }
      }
      if (shouldApplyEnterRules) {
        const enterResult = richEditSupport.onEnter(autoIndent, "", virtualModel.getLineContent(inheritLine), "");
        if (enterResult) {
          let indentation = strings.getLeadingWhitespace(virtualModel.getLineContent(inheritLine));
          if (enterResult.removeText) {
            indentation = indentation.substring(0, indentation.length - enterResult.removeText);
          }
          if (enterResult.indentAction === IndentAction.Indent || enterResult.indentAction === IndentAction.IndentOutdent) {
            indentation = indentConverter.shiftIndent(indentation);
          } else if (enterResult.indentAction === IndentAction.Outdent) {
            indentation = indentConverter.unshiftIndent(indentation);
          }
          if (processedIndentRulesSupport.shouldDecrease(lineNumber)) {
            indentation = indentConverter.unshiftIndent(indentation);
          }
          if (enterResult.appendText) {
            indentation += enterResult.appendText;
          }
          return strings.getLeadingWhitespace(indentation);
        }
      }
    }
    if (processedIndentRulesSupport.shouldDecrease(lineNumber)) {
      if (indent.action === IndentAction.Indent) {
        return indent.indentation;
      } else {
        return indentConverter.unshiftIndent(indent.indentation);
      }
    } else {
      if (indent.action === IndentAction.Indent) {
        return indentConverter.shiftIndent(indent.indentation);
      } else {
        return indent.indentation;
      }
    }
  }
  return null;
}
function getIndentForEnter(autoIndent, model, range, indentConverter, languageConfigurationService) {
  if (autoIndent < EditorAutoIndentStrategy.Full) {
    return null;
  }
  const languageId = model.getLanguageIdAtPosition(range.startLineNumber, range.startColumn);
  const indentRulesSupport = languageConfigurationService.getLanguageConfiguration(languageId).indentRulesSupport;
  if (!indentRulesSupport) {
    return null;
  }
  model.tokenization.forceTokenization(range.startLineNumber);
  const indentationContextProcessor = new IndentationContextProcessor(model, languageConfigurationService);
  const processedContextTokens = indentationContextProcessor.getProcessedTokenContextAroundRange(range);
  const afterEnterProcessedTokens = processedContextTokens.afterRangeProcessedTokens;
  const beforeEnterProcessedTokens = processedContextTokens.beforeRangeProcessedTokens;
  const beforeEnterIndent = strings.getLeadingWhitespace(beforeEnterProcessedTokens.getLineContent());
  const virtualModel = createVirtualModelWithModifiedTokensAtLine(model, range.startLineNumber, beforeEnterProcessedTokens);
  const languageIsDifferentFromLineStart = isLanguageDifferentFromLineStart(model, range.getStartPosition());
  const currentLine = model.getLineContent(range.startLineNumber);
  const currentLineIndent = strings.getLeadingWhitespace(currentLine);
  const afterEnterAction = getInheritIndentForLine(autoIndent, virtualModel, range.startLineNumber + 1, void 0, languageConfigurationService);
  if (!afterEnterAction) {
    const beforeEnter = languageIsDifferentFromLineStart ? currentLineIndent : beforeEnterIndent;
    return {
      beforeEnter,
      afterEnter: beforeEnter
    };
  }
  let afterEnterIndent = languageIsDifferentFromLineStart ? currentLineIndent : afterEnterAction.indentation;
  if (afterEnterAction.action === IndentAction.Indent) {
    afterEnterIndent = indentConverter.shiftIndent(afterEnterIndent);
  }
  if (indentRulesSupport.shouldDecrease(afterEnterProcessedTokens.getLineContent())) {
    afterEnterIndent = indentConverter.unshiftIndent(afterEnterIndent);
  }
  return {
    beforeEnter: languageIsDifferentFromLineStart ? currentLineIndent : beforeEnterIndent,
    afterEnter: afterEnterIndent
  };
}
function getIndentActionForType(cursorConfig, model, range, ch, indentConverter, languageConfigurationService) {
  const autoIndent = cursorConfig.autoIndent;
  if (autoIndent < EditorAutoIndentStrategy.Full) {
    return null;
  }
  const languageIsDifferentFromLineStart = isLanguageDifferentFromLineStart(model, range.getStartPosition());
  if (languageIsDifferentFromLineStart) {
    return null;
  }
  const languageId = model.getLanguageIdAtPosition(range.startLineNumber, range.startColumn);
  const indentRulesSupport = languageConfigurationService.getLanguageConfiguration(languageId).indentRulesSupport;
  if (!indentRulesSupport) {
    return null;
  }
  const indentationContextProcessor = new IndentationContextProcessor(model, languageConfigurationService);
  const processedContextTokens = indentationContextProcessor.getProcessedTokenContextAroundRange(range);
  const beforeRangeText = processedContextTokens.beforeRangeProcessedTokens.getLineContent();
  const afterRangeText = processedContextTokens.afterRangeProcessedTokens.getLineContent();
  const textAroundRange = beforeRangeText + afterRangeText;
  const textAroundRangeWithCharacter = beforeRangeText + ch + afterRangeText;
  if (!indentRulesSupport.shouldDecrease(textAroundRange) && indentRulesSupport.shouldDecrease(textAroundRangeWithCharacter)) {
    const r = getInheritIndentForLine(autoIndent, model, range.startLineNumber, false, languageConfigurationService);
    if (!r) {
      return null;
    }
    let indentation = r.indentation;
    if (r.action !== IndentAction.Indent) {
      indentation = indentConverter.unshiftIndent(indentation);
    }
    return indentation;
  }
  const previousLineNumber = range.startLineNumber - 1;
  if (previousLineNumber > 0) {
    const previousLine = model.getLineContent(previousLineNumber);
    if (indentRulesSupport.shouldIndentNextLine(previousLine) && indentRulesSupport.shouldIncrease(textAroundRangeWithCharacter)) {
      const inheritedIndentationData = getInheritIndentForLine(autoIndent, model, range.startLineNumber, false, languageConfigurationService);
      const inheritedIndentation = inheritedIndentationData?.indentation;
      if (inheritedIndentation !== void 0) {
        const currentLine = model.getLineContent(range.startLineNumber);
        const actualCurrentIndentation = strings.getLeadingWhitespace(currentLine);
        const inferredCurrentIndentation = indentConverter.shiftIndent(inheritedIndentation);
        const inferredIndentationEqualsActual = inferredCurrentIndentation === actualCurrentIndentation;
        const textAroundRangeContainsOnlyWhitespace = /^\s*$/.test(textAroundRange);
        const autoClosingPairs = cursorConfig.autoClosingPairs.autoClosingPairsOpenByEnd.get(ch);
        const autoClosingPairExists = autoClosingPairs && autoClosingPairs.length > 0;
        const isChFirstNonWhitespaceCharacterAndInAutoClosingPair = autoClosingPairExists && textAroundRangeContainsOnlyWhitespace;
        if (inferredIndentationEqualsActual && isChFirstNonWhitespaceCharacterAndInAutoClosingPair) {
          return inheritedIndentation;
        }
      }
    }
  }
  return null;
}
function getIndentMetadata(model, lineNumber, languageConfigurationService) {
  const indentRulesSupport = languageConfigurationService.getLanguageConfiguration(model.getLanguageId()).indentRulesSupport;
  if (!indentRulesSupport) {
    return null;
  }
  if (lineNumber < 1 || lineNumber > model.getLineCount()) {
    return null;
  }
  return indentRulesSupport.getIndentMetadata(model.getLineContent(lineNumber));
}
function createVirtualModelWithModifiedTokensAtLine(model, modifiedLineNumber, modifiedTokens) {
  const virtualModel = {
    tokenization: {
      getLineTokens: (lineNumber) => {
        if (lineNumber === modifiedLineNumber) {
          return modifiedTokens;
        } else {
          return model.tokenization.getLineTokens(lineNumber);
        }
      },
      getLanguageId: () => {
        return model.getLanguageId();
      },
      getLanguageIdAtPosition: (lineNumber, column) => {
        return model.getLanguageIdAtPosition(lineNumber, column);
      }
    },
    getLineContent: (lineNumber) => {
      if (lineNumber === modifiedLineNumber) {
        return modifiedTokens.getLineContent();
      } else {
        return model.getLineContent(lineNumber);
      }
    }
  };
  return virtualModel;
}
export {
  getGoodIndentForLine,
  getIndentActionForType,
  getIndentForEnter,
  getIndentMetadata,
  getInheritIndentForLine
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2F1dG9JbmRlbnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBzdHJpbmdzIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJbmRlbnRBY3Rpb24gfSBmcm9tICcuL2xhbmd1YWdlQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJbmRlbnRDb25zdHMgfSBmcm9tICcuL3N1cHBvcnRzL2luZGVudFJ1bGVzLmpzJztcbmltcG9ydCB7IEVkaXRvckF1dG9JbmRlbnRTdHJhdGVneSB9IGZyb20gJy4uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi9sYW5ndWFnZUNvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJVmlld0xpbmVUb2tlbnMgfSBmcm9tICcuLi90b2tlbnMvbGluZVRva2Vucy5qcyc7XG5pbXBvcnQgeyBJbmRlbnRhdGlvbkNvbnRleHRQcm9jZXNzb3IsIGlzTGFuZ3VhZ2VEaWZmZXJlbnRGcm9tTGluZVN0YXJ0LCBQcm9jZXNzZWRJbmRlbnRSdWxlc1N1cHBvcnQgfSBmcm9tICcuL3N1cHBvcnRzL2luZGVudGF0aW9uTGluZVByb2Nlc3Nvci5qcyc7XG5pbXBvcnQgeyBDdXJzb3JDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vY3Vyc29yQ29tbW9uLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJVmlydHVhbE1vZGVsIHtcblx0dG9rZW5pemF0aW9uOiB7XG5cdFx0Z2V0TGluZVRva2VucyhsaW5lTnVtYmVyOiBudW1iZXIpOiBJVmlld0xpbmVUb2tlbnM7XG5cdFx0Z2V0TGFuZ3VhZ2VJZCgpOiBzdHJpbmc7XG5cdFx0Z2V0TGFuZ3VhZ2VJZEF0UG9zaXRpb24obGluZU51bWJlcjogbnVtYmVyLCBjb2x1bW46IG51bWJlcik6IHN0cmluZztcblx0XHRmb3JjZVRva2VuaXphdGlvbj8obGluZU51bWJlcjogbnVtYmVyKTogdm9pZDtcblx0fTtcblx0Z2V0TGluZUNvbnRlbnQobGluZU51bWJlcjogbnVtYmVyKTogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElJbmRlbnRDb252ZXJ0ZXIge1xuXHRzaGlmdEluZGVudChpbmRlbnRhdGlvbjogc3RyaW5nKTogc3RyaW5nO1xuXHR1bnNoaWZ0SW5kZW50KGluZGVudGF0aW9uOiBzdHJpbmcpOiBzdHJpbmc7XG5cdG5vcm1hbGl6ZUluZGVudGF0aW9uPyhpbmRlbnRhdGlvbjogc3RyaW5nKTogc3RyaW5nO1xufVxuXG4vKipcbiAqIEdldCBuZWFyZXN0IHByZWNlZGluZyBsaW5lIHdoaWNoIGRvZXNuJ3QgbWF0Y2ggdW5JbmRlbnRQYXR0ZXJuIG9yIGNvbnRhaW5zIGFsbCB3aGl0ZXNwYWNlLlxuICogUmVzdWx0OlxuICogLTE6IHJ1biBpbnRvIHRoZSBib3VuZGFyeSBvZiBlbWJlZGRlZCBsYW5ndWFnZXNcbiAqIDA6IGV2ZXJ5IGxpbmUgYWJvdmUgYXJlIGludmFsaWRcbiAqIGVsc2U6IG5lYXJlc3QgcHJlY2VkaW5nIGxpbmUgb2YgdGhlIHNhbWUgbGFuZ3VhZ2VcbiAqL1xuZnVuY3Rpb24gZ2V0UHJlY2VkaW5nVmFsaWRMaW5lKG1vZGVsOiBJVmlydHVhbE1vZGVsLCBsaW5lTnVtYmVyOiBudW1iZXIsIHByb2Nlc3NlZEluZGVudFJ1bGVzU3VwcG9ydDogUHJvY2Vzc2VkSW5kZW50UnVsZXNTdXBwb3J0KSB7XG5cdGNvbnN0IGxhbmd1YWdlSWQgPSBtb2RlbC50b2tlbml6YXRpb24uZ2V0TGFuZ3VhZ2VJZEF0UG9zaXRpb24obGluZU51bWJlciwgMCk7XG5cdGlmIChsaW5lTnVtYmVyID4gMSkge1xuXHRcdGxldCBsYXN0TGluZU51bWJlcjogbnVtYmVyO1xuXHRcdGxldCByZXN1bHRMaW5lTnVtYmVyID0gLTE7XG5cblx0XHRmb3IgKGxhc3RMaW5lTnVtYmVyID0gbGluZU51bWJlciAtIDE7IGxhc3RMaW5lTnVtYmVyID49IDE7IGxhc3RMaW5lTnVtYmVyLS0pIHtcblx0XHRcdGlmIChtb2RlbC50b2tlbml6YXRpb24uZ2V0TGFuZ3VhZ2VJZEF0UG9zaXRpb24obGFzdExpbmVOdW1iZXIsIDApICE9PSBsYW5ndWFnZUlkKSB7XG5cdFx0XHRcdHJldHVybiByZXN1bHRMaW5lTnVtYmVyO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdGV4dCA9IG1vZGVsLmdldExpbmVDb250ZW50KGxhc3RMaW5lTnVtYmVyKTtcblx0XHRcdGlmIChwcm9jZXNzZWRJbmRlbnRSdWxlc1N1cHBvcnQuc2hvdWxkSWdub3JlKGxhc3RMaW5lTnVtYmVyKSB8fCAvXlxccyskLy50ZXN0KHRleHQpIHx8IHRleHQgPT09ICcnKSB7XG5cdFx0XHRcdHJlc3VsdExpbmVOdW1iZXIgPSBsYXN0TGluZU51bWJlcjtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBsYXN0TGluZU51bWJlcjtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gLTE7XG59XG5cbi8qKlxuICogR2V0IGluaGVyaXRlZCBpbmRlbnRhdGlvbiBmcm9tIGFib3ZlIGxpbmVzLlxuICogMS4gRmluZCB0aGUgbmVhcmVzdCBwcmVjZWRpbmcgbGluZSB3aGljaCBkb2Vzbid0IG1hdGNoIHVuSW5kZW50ZWRMaW5lUGF0dGVybi5cbiAqIDIuIElmIHRoaXMgbGluZSBtYXRjaGVzIGluZGVudE5leHRMaW5lUGF0dGVybiBvciBpbmNyZWFzZUluZGVudFBhdHRlcm4sIGl0IG1lYW5zIHRoYXQgdGhlIGluZGVudCBsZXZlbCBvZiBgbGluZU51bWJlcmAgc2hvdWxkIGJlIDEgZ3JlYXRlciB0aGFuIHRoaXMgbGluZS5cbiAqIDMuIElmIHRoaXMgbGluZSBkb2Vzbid0IG1hdGNoIGFueSBpbmRlbnQgcnVsZXNcbiAqICAgYS4gY2hlY2sgd2hldGhlciB0aGUgbGluZSBhYm92ZSBpdCBtYXRjaGVzIGluZGVudE5leHRMaW5lUGF0dGVyblxuICogICBiLiBJZiBub3QsIHRoZSBpbmRlbnQgbGV2ZWwgb2YgdGhpcyBsaW5lIGlzIHRoZSByZXN1bHRcbiAqICAgYy4gSWYgc28sIGl0IG1lYW5zIHRoZSBpbmRlbnQgb2YgdGhpcyBsaW5lIGlzICp0ZW1wb3JhcnkqLCBnbyB1cHdhcmQgdXRpbGwgd2UgZmluZCBhIGxpbmUgd2hvc2UgaW5kZW50IGlzIG5vdCB0ZW1wb3JhcnkgKHRoZSBzYW1lIHdvcmtmbG93IGEgLT4gYiAtPiBjKS5cbiAqIDQuIE90aGVyd2lzZSwgd2UgZmFpbCB0byBnZXQgYW4gaW5oZXJpdGVkIGluZGVudCBmcm9tIGFib3Zlcy4gUmV0dXJuIG51bGwgYW5kIHdlIHNob3VsZCBub3QgdG91Y2ggdGhlIGluZGVudCBvZiBgbGluZU51bWJlcmBcbiAqXG4gKiBUaGlzIGZ1bmN0aW9uIG9ubHkgcmV0dXJuIHRoZSBpbmhlcml0ZWQgaW5kZW50IGJhc2VkIG9uIGFib3ZlIGxpbmVzLCBpdCBkb2Vzbid0IGNoZWNrIHdoZXRoZXIgY3VycmVudCBsaW5lIHNob3VsZCBkZWNyZWFzZSBvciBub3QuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRJbmhlcml0SW5kZW50Rm9yTGluZShcblx0YXV0b0luZGVudDogRWRpdG9yQXV0b0luZGVudFN0cmF0ZWd5LFxuXHRtb2RlbDogSVZpcnR1YWxNb2RlbCxcblx0bGluZU51bWJlcjogbnVtYmVyLFxuXHRob25vckludGVudGlhbEluZGVudDogYm9vbGVhbiA9IHRydWUsXG5cdGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2U6IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG4pOiB7IGluZGVudGF0aW9uOiBzdHJpbmc7IGFjdGlvbjogSW5kZW50QWN0aW9uIHwgbnVsbDsgbGluZT86IG51bWJlciB9IHwgbnVsbCB7XG5cdGlmIChhdXRvSW5kZW50IDwgRWRpdG9yQXV0b0luZGVudFN0cmF0ZWd5LkZ1bGwpIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGNvbnN0IGluZGVudFJ1bGVzU3VwcG9ydCA9IGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0TGFuZ3VhZ2VDb25maWd1cmF0aW9uKG1vZGVsLnRva2VuaXphdGlvbi5nZXRMYW5ndWFnZUlkKCkpLmluZGVudFJ1bGVzU3VwcG9ydDtcblx0aWYgKCFpbmRlbnRSdWxlc1N1cHBvcnQpIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXHRjb25zdCBwcm9jZXNzZWRJbmRlbnRSdWxlc1N1cHBvcnQgPSBuZXcgUHJvY2Vzc2VkSW5kZW50UnVsZXNTdXBwb3J0KG1vZGVsLCBpbmRlbnRSdWxlc1N1cHBvcnQsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdGlmIChsaW5lTnVtYmVyIDw9IDEpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aW5kZW50YXRpb246ICcnLFxuXHRcdFx0YWN0aW9uOiBudWxsXG5cdFx0fTtcblx0fVxuXG5cdC8vIFVzZSBubyBpbmRlbnQgaWYgdGhpcyBpcyB0aGUgZmlyc3Qgbm9uLWJsYW5rIGxpbmVcblx0Zm9yIChsZXQgcHJpb3JMaW5lTnVtYmVyID0gbGluZU51bWJlciAtIDE7IHByaW9yTGluZU51bWJlciA+IDA7IHByaW9yTGluZU51bWJlci0tKSB7XG5cdFx0aWYgKG1vZGVsLmdldExpbmVDb250ZW50KHByaW9yTGluZU51bWJlcikgIT09ICcnKSB7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdFx0aWYgKHByaW9yTGluZU51bWJlciA9PT0gMSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aW5kZW50YXRpb246ICcnLFxuXHRcdFx0XHRhY3Rpb246IG51bGxcblx0XHRcdH07XG5cdFx0fVxuXHR9XG5cblx0Y29uc3QgcHJlY2VkaW5nVW5JZ25vcmVkTGluZSA9IGdldFByZWNlZGluZ1ZhbGlkTGluZShtb2RlbCwgbGluZU51bWJlciwgcHJvY2Vzc2VkSW5kZW50UnVsZXNTdXBwb3J0KTtcblx0aWYgKHByZWNlZGluZ1VuSWdub3JlZExpbmUgPCAwKSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH0gZWxzZSBpZiAocHJlY2VkaW5nVW5JZ25vcmVkTGluZSA8IDEpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aW5kZW50YXRpb246ICcnLFxuXHRcdFx0YWN0aW9uOiBudWxsXG5cdFx0fTtcblx0fVxuXG5cdGlmIChwcm9jZXNzZWRJbmRlbnRSdWxlc1N1cHBvcnQuc2hvdWxkSW5jcmVhc2UocHJlY2VkaW5nVW5JZ25vcmVkTGluZSkgfHwgcHJvY2Vzc2VkSW5kZW50UnVsZXNTdXBwb3J0LnNob3VsZEluZGVudE5leHRMaW5lKHByZWNlZGluZ1VuSWdub3JlZExpbmUpKSB7XG5cdFx0Y29uc3QgcHJlY2VkaW5nVW5JZ25vcmVkTGluZUNvbnRlbnQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChwcmVjZWRpbmdVbklnbm9yZWRMaW5lKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aW5kZW50YXRpb246IHN0cmluZ3MuZ2V0TGVhZGluZ1doaXRlc3BhY2UocHJlY2VkaW5nVW5JZ25vcmVkTGluZUNvbnRlbnQpLFxuXHRcdFx0YWN0aW9uOiBJbmRlbnRBY3Rpb24uSW5kZW50LFxuXHRcdFx0bGluZTogcHJlY2VkaW5nVW5JZ25vcmVkTGluZVxuXHRcdH07XG5cdH0gZWxzZSBpZiAocHJvY2Vzc2VkSW5kZW50UnVsZXNTdXBwb3J0LnNob3VsZERlY3JlYXNlKHByZWNlZGluZ1VuSWdub3JlZExpbmUpKSB7XG5cdFx0Y29uc3QgcHJlY2VkaW5nVW5JZ25vcmVkTGluZUNvbnRlbnQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChwcmVjZWRpbmdVbklnbm9yZWRMaW5lKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aW5kZW50YXRpb246IHN0cmluZ3MuZ2V0TGVhZGluZ1doaXRlc3BhY2UocHJlY2VkaW5nVW5JZ25vcmVkTGluZUNvbnRlbnQpLFxuXHRcdFx0YWN0aW9uOiBudWxsLFxuXHRcdFx0bGluZTogcHJlY2VkaW5nVW5JZ25vcmVkTGluZVxuXHRcdH07XG5cdH0gZWxzZSB7XG5cdFx0Ly8gcHJlY2VkaW5nVW5JZ25vcmVkTGluZSBjYW4gbm90IGJlIGlnbm9yZWQuXG5cdFx0Ly8gaXQgZG9lc24ndCBpbmNyZWFzZSBpbmRlbnQgb2YgZm9sbG93aW5nIGxpbmVzXG5cdFx0Ly8gaXQgZG9lc24ndCBpbmNyZWFzZSBqdXN0IG5leHQgbGluZVxuXHRcdC8vIHNvIGN1cnJlbnQgbGluZSBpcyBub3QgYWZmZWN0IGJ5IHByZWNlZGluZ1VuSWdub3JlZExpbmVcblx0XHQvLyBhbmQgdGhlbiB3ZSBzaG91bGQgZ2V0IGEgY29ycmVjdCBpbmhlcml0dGVkIGluZGVudGF0aW9uIGZyb20gYWJvdmUgbGluZXNcblx0XHRpZiAocHJlY2VkaW5nVW5JZ25vcmVkTGluZSA9PT0gMSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aW5kZW50YXRpb246IHN0cmluZ3MuZ2V0TGVhZGluZ1doaXRlc3BhY2UobW9kZWwuZ2V0TGluZUNvbnRlbnQocHJlY2VkaW5nVW5JZ25vcmVkTGluZSkpLFxuXHRcdFx0XHRhY3Rpb246IG51bGwsXG5cdFx0XHRcdGxpbmU6IHByZWNlZGluZ1VuSWdub3JlZExpbmVcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJldmlvdXNMaW5lID0gcHJlY2VkaW5nVW5JZ25vcmVkTGluZSAtIDE7XG5cblx0XHRjb25zdCBwcmV2aW91c0xpbmVJbmRlbnRNZXRhZGF0YSA9IGluZGVudFJ1bGVzU3VwcG9ydC5nZXRJbmRlbnRNZXRhZGF0YShtb2RlbC5nZXRMaW5lQ29udGVudChwcmV2aW91c0xpbmUpKTtcblx0XHRpZiAoIShwcmV2aW91c0xpbmVJbmRlbnRNZXRhZGF0YSAmIChJbmRlbnRDb25zdHMuSU5DUkVBU0VfTUFTSyB8IEluZGVudENvbnN0cy5ERUNSRUFTRV9NQVNLKSkgJiZcblx0XHRcdChwcmV2aW91c0xpbmVJbmRlbnRNZXRhZGF0YSAmIEluZGVudENvbnN0cy5JTkRFTlRfTkVYVExJTkVfTUFTSykpIHtcblx0XHRcdGxldCBzdG9wTGluZSA9IDA7XG5cdFx0XHRmb3IgKGxldCBpID0gcHJldmlvdXNMaW5lIC0gMTsgaSA+IDA7IGktLSkge1xuXHRcdFx0XHRpZiAocHJvY2Vzc2VkSW5kZW50UnVsZXNTdXBwb3J0LnNob3VsZEluZGVudE5leHRMaW5lKGkpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0c3RvcExpbmUgPSBpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aW5kZW50YXRpb246IHN0cmluZ3MuZ2V0TGVhZGluZ1doaXRlc3BhY2UobW9kZWwuZ2V0TGluZUNvbnRlbnQoc3RvcExpbmUgKyAxKSksXG5cdFx0XHRcdGFjdGlvbjogbnVsbCxcblx0XHRcdFx0bGluZTogc3RvcExpbmUgKyAxXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmIChob25vckludGVudGlhbEluZGVudCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aW5kZW50YXRpb246IHN0cmluZ3MuZ2V0TGVhZGluZ1doaXRlc3BhY2UobW9kZWwuZ2V0TGluZUNvbnRlbnQocHJlY2VkaW5nVW5JZ25vcmVkTGluZSkpLFxuXHRcdFx0XHRhY3Rpb246IG51bGwsXG5cdFx0XHRcdGxpbmU6IHByZWNlZGluZ1VuSWdub3JlZExpbmVcblx0XHRcdH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIHNlYXJjaCBmcm9tIHByZWNlZGluZ1VuSWdub3JlZExpbmUgdW50aWwgd2UgZmluZCBvbmUgd2hvc2UgaW5kZW50IGlzIG5vdCB0ZW1wb3Jhcnlcblx0XHRcdGZvciAobGV0IGkgPSBwcmVjZWRpbmdVbklnbm9yZWRMaW5lOyBpID4gMDsgaS0tKSB7XG5cdFx0XHRcdGlmIChwcm9jZXNzZWRJbmRlbnRSdWxlc1N1cHBvcnQuc2hvdWxkSW5jcmVhc2UoaSkpIHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0aW5kZW50YXRpb246IHN0cmluZ3MuZ2V0TGVhZGluZ1doaXRlc3BhY2UobW9kZWwuZ2V0TGluZUNvbnRlbnQoaSkpLFxuXHRcdFx0XHRcdFx0YWN0aW9uOiBJbmRlbnRBY3Rpb24uSW5kZW50LFxuXHRcdFx0XHRcdFx0bGluZTogaVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0gZWxzZSBpZiAocHJvY2Vzc2VkSW5kZW50UnVsZXNTdXBwb3J0LnNob3VsZEluZGVudE5leHRMaW5lKGkpKSB7XG5cdFx0XHRcdFx0bGV0IHN0b3BMaW5lID0gMDtcblx0XHRcdFx0XHRmb3IgKGxldCBqID0gaSAtIDE7IGogPiAwOyBqLS0pIHtcblx0XHRcdFx0XHRcdGlmIChwcm9jZXNzZWRJbmRlbnRSdWxlc1N1cHBvcnQuc2hvdWxkSW5kZW50TmV4dExpbmUoaSkpIHtcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRzdG9wTGluZSA9IGo7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0aW5kZW50YXRpb246IHN0cmluZ3MuZ2V0TGVhZGluZ1doaXRlc3BhY2UobW9kZWwuZ2V0TGluZUNvbnRlbnQoc3RvcExpbmUgKyAxKSksXG5cdFx0XHRcdFx0XHRhY3Rpb246IG51bGwsXG5cdFx0XHRcdFx0XHRsaW5lOiBzdG9wTGluZSArIDFcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9IGVsc2UgaWYgKHByb2Nlc3NlZEluZGVudFJ1bGVzU3VwcG9ydC5zaG91bGREZWNyZWFzZShpKSkge1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRpbmRlbnRhdGlvbjogc3RyaW5ncy5nZXRMZWFkaW5nV2hpdGVzcGFjZShtb2RlbC5nZXRMaW5lQ29udGVudChpKSksXG5cdFx0XHRcdFx0XHRhY3Rpb246IG51bGwsXG5cdFx0XHRcdFx0XHRsaW5lOiBpXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpbmRlbnRhdGlvbjogc3RyaW5ncy5nZXRMZWFkaW5nV2hpdGVzcGFjZShtb2RlbC5nZXRMaW5lQ29udGVudCgxKSksXG5cdFx0XHRcdGFjdGlvbjogbnVsbCxcblx0XHRcdFx0bGluZTogMVxuXHRcdFx0fTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEdvb2RJbmRlbnRGb3JMaW5lKFxuXHRhdXRvSW5kZW50OiBFZGl0b3JBdXRvSW5kZW50U3RyYXRlZ3ksXG5cdHZpcnR1YWxNb2RlbDogSVZpcnR1YWxNb2RlbCxcblx0bGFuZ3VhZ2VJZDogc3RyaW5nLFxuXHRsaW5lTnVtYmVyOiBudW1iZXIsXG5cdGluZGVudENvbnZlcnRlcjogSUluZGVudENvbnZlcnRlcixcblx0bGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZTogSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2Vcbik6IHN0cmluZyB8IG51bGwge1xuXHRpZiAoYXV0b0luZGVudCA8IEVkaXRvckF1dG9JbmRlbnRTdHJhdGVneS5GdWxsKSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRjb25zdCByaWNoRWRpdFN1cHBvcnQgPSBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldExhbmd1YWdlQ29uZmlndXJhdGlvbihsYW5ndWFnZUlkKTtcblx0aWYgKCFyaWNoRWRpdFN1cHBvcnQpIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGNvbnN0IGluZGVudFJ1bGVzU3VwcG9ydCA9IGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0TGFuZ3VhZ2VDb25maWd1cmF0aW9uKGxhbmd1YWdlSWQpLmluZGVudFJ1bGVzU3VwcG9ydDtcblx0aWYgKCFpbmRlbnRSdWxlc1N1cHBvcnQpIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGNvbnN0IHByb2Nlc3NlZEluZGVudFJ1bGVzU3VwcG9ydCA9IG5ldyBQcm9jZXNzZWRJbmRlbnRSdWxlc1N1cHBvcnQodmlydHVhbE1vZGVsLCBpbmRlbnRSdWxlc1N1cHBvcnQsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRjb25zdCBpbmRlbnQgPSBnZXRJbmhlcml0SW5kZW50Rm9yTGluZShhdXRvSW5kZW50LCB2aXJ0dWFsTW9kZWwsIGxpbmVOdW1iZXIsIHVuZGVmaW5lZCwgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0aWYgKGluZGVudCkge1xuXHRcdGNvbnN0IGluaGVyaXRMaW5lID0gaW5kZW50LmxpbmU7XG5cdFx0aWYgKGluaGVyaXRMaW5lICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdC8vIEFwcGx5IGVudGVyIGFjdGlvbiBhcyBsb25nIGFzIHRoZXJlIGFyZSBvbmx5IHdoaXRlc3BhY2UgbGluZXMgYmV0d2VlbiBpbmhlcml0ZWQgbGluZSBhbmQgdGhpcyBsaW5lLlxuXHRcdFx0bGV0IHNob3VsZEFwcGx5RW50ZXJSdWxlcyA9IHRydWU7XG5cdFx0XHRmb3IgKGxldCBpbkJldHdlZW5MaW5lID0gaW5oZXJpdExpbmU7IGluQmV0d2VlbkxpbmUgPCBsaW5lTnVtYmVyIC0gMTsgaW5CZXR3ZWVuTGluZSsrKSB7XG5cdFx0XHRcdGlmICghL15cXHMqJC8udGVzdCh2aXJ0dWFsTW9kZWwuZ2V0TGluZUNvbnRlbnQoaW5CZXR3ZWVuTGluZSkpKSB7XG5cdFx0XHRcdFx0c2hvdWxkQXBwbHlFbnRlclJ1bGVzID0gZmFsc2U7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChzaG91bGRBcHBseUVudGVyUnVsZXMpIHtcblx0XHRcdFx0Y29uc3QgZW50ZXJSZXN1bHQgPSByaWNoRWRpdFN1cHBvcnQub25FbnRlcihhdXRvSW5kZW50LCAnJywgdmlydHVhbE1vZGVsLmdldExpbmVDb250ZW50KGluaGVyaXRMaW5lKSwgJycpO1xuXG5cdFx0XHRcdGlmIChlbnRlclJlc3VsdCkge1xuXHRcdFx0XHRcdGxldCBpbmRlbnRhdGlvbiA9IHN0cmluZ3MuZ2V0TGVhZGluZ1doaXRlc3BhY2UodmlydHVhbE1vZGVsLmdldExpbmVDb250ZW50KGluaGVyaXRMaW5lKSk7XG5cblx0XHRcdFx0XHRpZiAoZW50ZXJSZXN1bHQucmVtb3ZlVGV4dCkge1xuXHRcdFx0XHRcdFx0aW5kZW50YXRpb24gPSBpbmRlbnRhdGlvbi5zdWJzdHJpbmcoMCwgaW5kZW50YXRpb24ubGVuZ3RoIC0gZW50ZXJSZXN1bHQucmVtb3ZlVGV4dCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKFxuXHRcdFx0XHRcdFx0KGVudGVyUmVzdWx0LmluZGVudEFjdGlvbiA9PT0gSW5kZW50QWN0aW9uLkluZGVudCkgfHxcblx0XHRcdFx0XHRcdChlbnRlclJlc3VsdC5pbmRlbnRBY3Rpb24gPT09IEluZGVudEFjdGlvbi5JbmRlbnRPdXRkZW50KVxuXHRcdFx0XHRcdCkge1xuXHRcdFx0XHRcdFx0aW5kZW50YXRpb24gPSBpbmRlbnRDb252ZXJ0ZXIuc2hpZnRJbmRlbnQoaW5kZW50YXRpb24pO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoZW50ZXJSZXN1bHQuaW5kZW50QWN0aW9uID09PSBJbmRlbnRBY3Rpb24uT3V0ZGVudCkge1xuXHRcdFx0XHRcdFx0aW5kZW50YXRpb24gPSBpbmRlbnRDb252ZXJ0ZXIudW5zaGlmdEluZGVudChpbmRlbnRhdGlvbik7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKHByb2Nlc3NlZEluZGVudFJ1bGVzU3VwcG9ydC5zaG91bGREZWNyZWFzZShsaW5lTnVtYmVyKSkge1xuXHRcdFx0XHRcdFx0aW5kZW50YXRpb24gPSBpbmRlbnRDb252ZXJ0ZXIudW5zaGlmdEluZGVudChpbmRlbnRhdGlvbik7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKGVudGVyUmVzdWx0LmFwcGVuZFRleHQpIHtcblx0XHRcdFx0XHRcdGluZGVudGF0aW9uICs9IGVudGVyUmVzdWx0LmFwcGVuZFRleHQ7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIHN0cmluZ3MuZ2V0TGVhZGluZ1doaXRlc3BhY2UoaW5kZW50YXRpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHByb2Nlc3NlZEluZGVudFJ1bGVzU3VwcG9ydC5zaG91bGREZWNyZWFzZShsaW5lTnVtYmVyKSkge1xuXHRcdFx0aWYgKGluZGVudC5hY3Rpb24gPT09IEluZGVudEFjdGlvbi5JbmRlbnQpIHtcblx0XHRcdFx0cmV0dXJuIGluZGVudC5pbmRlbnRhdGlvbjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBpbmRlbnRDb252ZXJ0ZXIudW5zaGlmdEluZGVudChpbmRlbnQuaW5kZW50YXRpb24pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoaW5kZW50LmFjdGlvbiA9PT0gSW5kZW50QWN0aW9uLkluZGVudCkge1xuXHRcdFx0XHRyZXR1cm4gaW5kZW50Q29udmVydGVyLnNoaWZ0SW5kZW50KGluZGVudC5pbmRlbnRhdGlvbik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gaW5kZW50LmluZGVudGF0aW9uO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRyZXR1cm4gbnVsbDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEluZGVudEZvckVudGVyKFxuXHRhdXRvSW5kZW50OiBFZGl0b3JBdXRvSW5kZW50U3RyYXRlZ3ksXG5cdG1vZGVsOiBJVGV4dE1vZGVsLFxuXHRyYW5nZTogUmFuZ2UsXG5cdGluZGVudENvbnZlcnRlcjogSUluZGVudENvbnZlcnRlcixcblx0bGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZTogSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2Vcbik6IHsgYmVmb3JlRW50ZXI6IHN0cmluZzsgYWZ0ZXJFbnRlcjogc3RyaW5nIH0gfCBudWxsIHtcblx0aWYgKGF1dG9JbmRlbnQgPCBFZGl0b3JBdXRvSW5kZW50U3RyYXRlZ3kuRnVsbCkge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cdGNvbnN0IGxhbmd1YWdlSWQgPSBtb2RlbC5nZXRMYW5ndWFnZUlkQXRQb3NpdGlvbihyYW5nZS5zdGFydExpbmVOdW1iZXIsIHJhbmdlLnN0YXJ0Q29sdW1uKTtcblx0Y29uc3QgaW5kZW50UnVsZXNTdXBwb3J0ID0gbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5nZXRMYW5ndWFnZUNvbmZpZ3VyYXRpb24obGFuZ3VhZ2VJZCkuaW5kZW50UnVsZXNTdXBwb3J0O1xuXHRpZiAoIWluZGVudFJ1bGVzU3VwcG9ydCkge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0bW9kZWwudG9rZW5pemF0aW9uLmZvcmNlVG9rZW5pemF0aW9uKHJhbmdlLnN0YXJ0TGluZU51bWJlcik7XG5cdGNvbnN0IGluZGVudGF0aW9uQ29udGV4dFByb2Nlc3NvciA9IG5ldyBJbmRlbnRhdGlvbkNvbnRleHRQcm9jZXNzb3IobW9kZWwsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRjb25zdCBwcm9jZXNzZWRDb250ZXh0VG9rZW5zID0gaW5kZW50YXRpb25Db250ZXh0UHJvY2Vzc29yLmdldFByb2Nlc3NlZFRva2VuQ29udGV4dEFyb3VuZFJhbmdlKHJhbmdlKTtcblx0Y29uc3QgYWZ0ZXJFbnRlclByb2Nlc3NlZFRva2VucyA9IHByb2Nlc3NlZENvbnRleHRUb2tlbnMuYWZ0ZXJSYW5nZVByb2Nlc3NlZFRva2Vucztcblx0Y29uc3QgYmVmb3JlRW50ZXJQcm9jZXNzZWRUb2tlbnMgPSBwcm9jZXNzZWRDb250ZXh0VG9rZW5zLmJlZm9yZVJhbmdlUHJvY2Vzc2VkVG9rZW5zO1xuXHRjb25zdCBiZWZvcmVFbnRlckluZGVudCA9IHN0cmluZ3MuZ2V0TGVhZGluZ1doaXRlc3BhY2UoYmVmb3JlRW50ZXJQcm9jZXNzZWRUb2tlbnMuZ2V0TGluZUNvbnRlbnQoKSk7XG5cblx0Y29uc3QgdmlydHVhbE1vZGVsID0gY3JlYXRlVmlydHVhbE1vZGVsV2l0aE1vZGlmaWVkVG9rZW5zQXRMaW5lKG1vZGVsLCByYW5nZS5zdGFydExpbmVOdW1iZXIsIGJlZm9yZUVudGVyUHJvY2Vzc2VkVG9rZW5zKTtcblx0Y29uc3QgbGFuZ3VhZ2VJc0RpZmZlcmVudEZyb21MaW5lU3RhcnQgPSBpc0xhbmd1YWdlRGlmZmVyZW50RnJvbUxpbmVTdGFydChtb2RlbCwgcmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpKTtcblx0Y29uc3QgY3VycmVudExpbmUgPSBtb2RlbC5nZXRMaW5lQ29udGVudChyYW5nZS5zdGFydExpbmVOdW1iZXIpO1xuXHRjb25zdCBjdXJyZW50TGluZUluZGVudCA9IHN0cmluZ3MuZ2V0TGVhZGluZ1doaXRlc3BhY2UoY3VycmVudExpbmUpO1xuXHRjb25zdCBhZnRlckVudGVyQWN0aW9uID0gZ2V0SW5oZXJpdEluZGVudEZvckxpbmUoYXV0b0luZGVudCwgdmlydHVhbE1vZGVsLCByYW5nZS5zdGFydExpbmVOdW1iZXIgKyAxLCB1bmRlZmluZWQsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRpZiAoIWFmdGVyRW50ZXJBY3Rpb24pIHtcblx0XHRjb25zdCBiZWZvcmVFbnRlciA9IGxhbmd1YWdlSXNEaWZmZXJlbnRGcm9tTGluZVN0YXJ0ID8gY3VycmVudExpbmVJbmRlbnQgOiBiZWZvcmVFbnRlckluZGVudDtcblx0XHRyZXR1cm4ge1xuXHRcdFx0YmVmb3JlRW50ZXI6IGJlZm9yZUVudGVyLFxuXHRcdFx0YWZ0ZXJFbnRlcjogYmVmb3JlRW50ZXJcblx0XHR9O1xuXHR9XG5cblx0bGV0IGFmdGVyRW50ZXJJbmRlbnQgPSBsYW5ndWFnZUlzRGlmZmVyZW50RnJvbUxpbmVTdGFydCA/IGN1cnJlbnRMaW5lSW5kZW50IDogYWZ0ZXJFbnRlckFjdGlvbi5pbmRlbnRhdGlvbjtcblxuXHRpZiAoYWZ0ZXJFbnRlckFjdGlvbi5hY3Rpb24gPT09IEluZGVudEFjdGlvbi5JbmRlbnQpIHtcblx0XHRhZnRlckVudGVySW5kZW50ID0gaW5kZW50Q29udmVydGVyLnNoaWZ0SW5kZW50KGFmdGVyRW50ZXJJbmRlbnQpO1xuXHR9XG5cblx0aWYgKGluZGVudFJ1bGVzU3VwcG9ydC5zaG91bGREZWNyZWFzZShhZnRlckVudGVyUHJvY2Vzc2VkVG9rZW5zLmdldExpbmVDb250ZW50KCkpKSB7XG5cdFx0YWZ0ZXJFbnRlckluZGVudCA9IGluZGVudENvbnZlcnRlci51bnNoaWZ0SW5kZW50KGFmdGVyRW50ZXJJbmRlbnQpO1xuXHR9XG5cblx0cmV0dXJuIHtcblx0XHRiZWZvcmVFbnRlcjogbGFuZ3VhZ2VJc0RpZmZlcmVudEZyb21MaW5lU3RhcnQgPyBjdXJyZW50TGluZUluZGVudCA6IGJlZm9yZUVudGVySW5kZW50LFxuXHRcdGFmdGVyRW50ZXI6IGFmdGVyRW50ZXJJbmRlbnRcblx0fTtcbn1cblxuLyoqXG4gKiBXZSBzaG91bGQgYWx3YXlzIGFsbG93IGludGVudGlvbmFsIGluZGVudGF0aW9uLiBJdCBtZWFucywgaWYgdXNlcnMgY2hhbmdlIHRoZSBpbmRlbnRhdGlvbiBvZiBgbGluZU51bWJlcmAgYW5kIHRoZSBjb250ZW50IG9mXG4gKiB0aGlzIGxpbmUgZG9lc24ndCBtYXRjaCBkZWNyZWFzZUluZGVudFBhdHRlcm4sIHdlIHNob3VsZCBub3QgYWRqdXN0IHRoZSBpbmRlbnRhdGlvbi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldEluZGVudEFjdGlvbkZvclR5cGUoXG5cdGN1cnNvckNvbmZpZzogQ3Vyc29yQ29uZmlndXJhdGlvbixcblx0bW9kZWw6IElUZXh0TW9kZWwsXG5cdHJhbmdlOiBSYW5nZSxcblx0Y2g6IHN0cmluZyxcblx0aW5kZW50Q29udmVydGVyOiBJSW5kZW50Q29udmVydGVyLFxuXHRsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZVxuKTogc3RyaW5nIHwgbnVsbCB7XG5cdGNvbnN0IGF1dG9JbmRlbnQgPSBjdXJzb3JDb25maWcuYXV0b0luZGVudDtcblx0aWYgKGF1dG9JbmRlbnQgPCBFZGl0b3JBdXRvSW5kZW50U3RyYXRlZ3kuRnVsbCkge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cdGNvbnN0IGxhbmd1YWdlSXNEaWZmZXJlbnRGcm9tTGluZVN0YXJ0ID0gaXNMYW5ndWFnZURpZmZlcmVudEZyb21MaW5lU3RhcnQobW9kZWwsIHJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKSk7XG5cdGlmIChsYW5ndWFnZUlzRGlmZmVyZW50RnJvbUxpbmVTdGFydCkge1xuXHRcdC8vIHRoaXMgbGluZSBoYXMgbWl4ZWQgbGFuZ3VhZ2VzIGFuZCBpbmRlbnRhdGlvbiBydWxlcyB3aWxsIG5vdCB3b3JrXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRjb25zdCBsYW5ndWFnZUlkID0gbW9kZWwuZ2V0TGFuZ3VhZ2VJZEF0UG9zaXRpb24ocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCByYW5nZS5zdGFydENvbHVtbik7XG5cdGNvbnN0IGluZGVudFJ1bGVzU3VwcG9ydCA9IGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0TGFuZ3VhZ2VDb25maWd1cmF0aW9uKGxhbmd1YWdlSWQpLmluZGVudFJ1bGVzU3VwcG9ydDtcblx0aWYgKCFpbmRlbnRSdWxlc1N1cHBvcnQpIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGNvbnN0IGluZGVudGF0aW9uQ29udGV4dFByb2Nlc3NvciA9IG5ldyBJbmRlbnRhdGlvbkNvbnRleHRQcm9jZXNzb3IobW9kZWwsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRjb25zdCBwcm9jZXNzZWRDb250ZXh0VG9rZW5zID0gaW5kZW50YXRpb25Db250ZXh0UHJvY2Vzc29yLmdldFByb2Nlc3NlZFRva2VuQ29udGV4dEFyb3VuZFJhbmdlKHJhbmdlKTtcblx0Y29uc3QgYmVmb3JlUmFuZ2VUZXh0ID0gcHJvY2Vzc2VkQ29udGV4dFRva2Vucy5iZWZvcmVSYW5nZVByb2Nlc3NlZFRva2Vucy5nZXRMaW5lQ29udGVudCgpO1xuXHRjb25zdCBhZnRlclJhbmdlVGV4dCA9IHByb2Nlc3NlZENvbnRleHRUb2tlbnMuYWZ0ZXJSYW5nZVByb2Nlc3NlZFRva2Vucy5nZXRMaW5lQ29udGVudCgpO1xuXHRjb25zdCB0ZXh0QXJvdW5kUmFuZ2UgPSBiZWZvcmVSYW5nZVRleHQgKyBhZnRlclJhbmdlVGV4dDtcblx0Y29uc3QgdGV4dEFyb3VuZFJhbmdlV2l0aENoYXJhY3RlciA9IGJlZm9yZVJhbmdlVGV4dCArIGNoICsgYWZ0ZXJSYW5nZVRleHQ7XG5cblx0Ly8gSWYgcHJldmlvdXMgY29udGVudCBhbHJlYWR5IG1hdGNoZXMgZGVjcmVhc2VJbmRlbnRQYXR0ZXJuLCBpdCBtZWFucyBpbmRlbnRhdGlvbiBvZiB0aGlzIGxpbmUgc2hvdWxkIGFscmVhZHkgYmUgYWRqdXN0ZWRcblx0Ly8gVXNlcnMgbWlnaHQgY2hhbmdlIHRoZSBpbmRlbnRhdGlvbiBieSBwdXJwb3NlIGFuZCB3ZSBzaG91bGQgaG9ub3IgdGhhdCBpbnN0ZWFkIG9mIHJlYWRqdXN0aW5nLlxuXHRpZiAoIWluZGVudFJ1bGVzU3VwcG9ydC5zaG91bGREZWNyZWFzZSh0ZXh0QXJvdW5kUmFuZ2UpICYmIGluZGVudFJ1bGVzU3VwcG9ydC5zaG91bGREZWNyZWFzZSh0ZXh0QXJvdW5kUmFuZ2VXaXRoQ2hhcmFjdGVyKSkge1xuXHRcdC8vIGFmdGVyIHR5cGluZyBgY2hgLCB0aGUgY29udGVudCBtYXRjaGVzIGRlY3JlYXNlSW5kZW50UGF0dGVybiwgd2Ugc2hvdWxkIGFkanVzdCB0aGUgaW5kZW50IHRvIGEgZ29vZCBtYW5uZXIuXG5cdFx0Ly8gMS4gR2V0IGluaGVyaXRlZCBpbmRlbnQgYWN0aW9uXG5cdFx0Y29uc3QgciA9IGdldEluaGVyaXRJbmRlbnRGb3JMaW5lKGF1dG9JbmRlbnQsIG1vZGVsLCByYW5nZS5zdGFydExpbmVOdW1iZXIsIGZhbHNlLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRpZiAoIXIpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGxldCBpbmRlbnRhdGlvbiA9IHIuaW5kZW50YXRpb247XG5cdFx0aWYgKHIuYWN0aW9uICE9PSBJbmRlbnRBY3Rpb24uSW5kZW50KSB7XG5cdFx0XHRpbmRlbnRhdGlvbiA9IGluZGVudENvbnZlcnRlci51bnNoaWZ0SW5kZW50KGluZGVudGF0aW9uKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gaW5kZW50YXRpb247XG5cdH1cblxuXHRjb25zdCBwcmV2aW91c0xpbmVOdW1iZXIgPSByYW5nZS5zdGFydExpbmVOdW1iZXIgLSAxO1xuXHRpZiAocHJldmlvdXNMaW5lTnVtYmVyID4gMCkge1xuXHRcdGNvbnN0IHByZXZpb3VzTGluZSA9IG1vZGVsLmdldExpbmVDb250ZW50KHByZXZpb3VzTGluZU51bWJlcik7XG5cdFx0aWYgKGluZGVudFJ1bGVzU3VwcG9ydC5zaG91bGRJbmRlbnROZXh0TGluZShwcmV2aW91c0xpbmUpICYmIGluZGVudFJ1bGVzU3VwcG9ydC5zaG91bGRJbmNyZWFzZSh0ZXh0QXJvdW5kUmFuZ2VXaXRoQ2hhcmFjdGVyKSkge1xuXHRcdFx0Y29uc3QgaW5oZXJpdGVkSW5kZW50YXRpb25EYXRhID0gZ2V0SW5oZXJpdEluZGVudEZvckxpbmUoYXV0b0luZGVudCwgbW9kZWwsIHJhbmdlLnN0YXJ0TGluZU51bWJlciwgZmFsc2UsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgaW5oZXJpdGVkSW5kZW50YXRpb24gPSBpbmhlcml0ZWRJbmRlbnRhdGlvbkRhdGE/LmluZGVudGF0aW9uO1xuXHRcdFx0aWYgKGluaGVyaXRlZEluZGVudGF0aW9uICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y29uc3QgY3VycmVudExpbmUgPSBtb2RlbC5nZXRMaW5lQ29udGVudChyYW5nZS5zdGFydExpbmVOdW1iZXIpO1xuXHRcdFx0XHRjb25zdCBhY3R1YWxDdXJyZW50SW5kZW50YXRpb24gPSBzdHJpbmdzLmdldExlYWRpbmdXaGl0ZXNwYWNlKGN1cnJlbnRMaW5lKTtcblx0XHRcdFx0Y29uc3QgaW5mZXJyZWRDdXJyZW50SW5kZW50YXRpb24gPSBpbmRlbnRDb252ZXJ0ZXIuc2hpZnRJbmRlbnQoaW5oZXJpdGVkSW5kZW50YXRpb24pO1xuXHRcdFx0XHQvLyBJZiB0aGUgaW5mZXJyZWQgY3VycmVudCBpbmRlbnRhdGlvbiBpcyBub3QgZXF1YWwgdG8gdGhlIGFjdHVhbCBjdXJyZW50IGluZGVudGF0aW9uLCB0aGVuIHRoZSBpbmRlbnRhdGlvbiBoYXMgYmVlbiBpbnRlbnRpb25hbGx5IGNoYW5nZWQsIGluIHRoYXQgY2FzZSBrZWVwIGl0XG5cdFx0XHRcdGNvbnN0IGluZmVycmVkSW5kZW50YXRpb25FcXVhbHNBY3R1YWwgPSBpbmZlcnJlZEN1cnJlbnRJbmRlbnRhdGlvbiA9PT0gYWN0dWFsQ3VycmVudEluZGVudGF0aW9uO1xuXHRcdFx0XHRjb25zdCB0ZXh0QXJvdW5kUmFuZ2VDb250YWluc09ubHlXaGl0ZXNwYWNlID0gL15cXHMqJC8udGVzdCh0ZXh0QXJvdW5kUmFuZ2UpO1xuXHRcdFx0XHRjb25zdCBhdXRvQ2xvc2luZ1BhaXJzID0gY3Vyc29yQ29uZmlnLmF1dG9DbG9zaW5nUGFpcnMuYXV0b0Nsb3NpbmdQYWlyc09wZW5CeUVuZC5nZXQoY2gpO1xuXHRcdFx0XHRjb25zdCBhdXRvQ2xvc2luZ1BhaXJFeGlzdHMgPSBhdXRvQ2xvc2luZ1BhaXJzICYmIGF1dG9DbG9zaW5nUGFpcnMubGVuZ3RoID4gMDtcblx0XHRcdFx0Y29uc3QgaXNDaEZpcnN0Tm9uV2hpdGVzcGFjZUNoYXJhY3RlckFuZEluQXV0b0Nsb3NpbmdQYWlyID0gYXV0b0Nsb3NpbmdQYWlyRXhpc3RzICYmIHRleHRBcm91bmRSYW5nZUNvbnRhaW5zT25seVdoaXRlc3BhY2U7XG5cdFx0XHRcdGlmIChpbmZlcnJlZEluZGVudGF0aW9uRXF1YWxzQWN0dWFsICYmIGlzQ2hGaXJzdE5vbldoaXRlc3BhY2VDaGFyYWN0ZXJBbmRJbkF1dG9DbG9zaW5nUGFpcikge1xuXHRcdFx0XHRcdHJldHVybiBpbmhlcml0ZWRJbmRlbnRhdGlvbjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJldHVybiBudWxsO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0SW5kZW50TWV0YWRhdGEoXG5cdG1vZGVsOiBJVGV4dE1vZGVsLFxuXHRsaW5lTnVtYmVyOiBudW1iZXIsXG5cdGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2U6IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG4pOiBudW1iZXIgfCBudWxsIHtcblx0Y29uc3QgaW5kZW50UnVsZXNTdXBwb3J0ID0gbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5nZXRMYW5ndWFnZUNvbmZpZ3VyYXRpb24obW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpKS5pbmRlbnRSdWxlc1N1cHBvcnQ7XG5cdGlmICghaW5kZW50UnVsZXNTdXBwb3J0KSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblx0aWYgKGxpbmVOdW1iZXIgPCAxIHx8IGxpbmVOdW1iZXIgPiBtb2RlbC5nZXRMaW5lQ291bnQoKSkge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cdHJldHVybiBpbmRlbnRSdWxlc1N1cHBvcnQuZ2V0SW5kZW50TWV0YWRhdGEobW9kZWwuZ2V0TGluZUNvbnRlbnQobGluZU51bWJlcikpO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVWaXJ0dWFsTW9kZWxXaXRoTW9kaWZpZWRUb2tlbnNBdExpbmUobW9kZWw6IElUZXh0TW9kZWwsIG1vZGlmaWVkTGluZU51bWJlcjogbnVtYmVyLCBtb2RpZmllZFRva2VuczogSVZpZXdMaW5lVG9rZW5zKTogSVZpcnR1YWxNb2RlbCB7XG5cdGNvbnN0IHZpcnR1YWxNb2RlbDogSVZpcnR1YWxNb2RlbCA9IHtcblx0XHR0b2tlbml6YXRpb246IHtcblx0XHRcdGdldExpbmVUb2tlbnM6IChsaW5lTnVtYmVyOiBudW1iZXIpOiBJVmlld0xpbmVUb2tlbnMgPT4ge1xuXHRcdFx0XHRpZiAobGluZU51bWJlciA9PT0gbW9kaWZpZWRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG1vZGlmaWVkVG9rZW5zO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJldHVybiBtb2RlbC50b2tlbml6YXRpb24uZ2V0TGluZVRva2VucyhsaW5lTnVtYmVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGdldExhbmd1YWdlSWQ6ICgpOiBzdHJpbmcgPT4ge1xuXHRcdFx0XHRyZXR1cm4gbW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpO1xuXHRcdFx0fSxcblx0XHRcdGdldExhbmd1YWdlSWRBdFBvc2l0aW9uOiAobGluZU51bWJlcjogbnVtYmVyLCBjb2x1bW46IG51bWJlcik6IHN0cmluZyA9PiB7XG5cdFx0XHRcdHJldHVybiBtb2RlbC5nZXRMYW5ndWFnZUlkQXRQb3NpdGlvbihsaW5lTnVtYmVyLCBjb2x1bW4pO1xuXHRcdFx0fSxcblx0XHR9LFxuXHRcdGdldExpbmVDb250ZW50OiAobGluZU51bWJlcjogbnVtYmVyKTogc3RyaW5nID0+IHtcblx0XHRcdGlmIChsaW5lTnVtYmVyID09PSBtb2RpZmllZExpbmVOdW1iZXIpIHtcblx0XHRcdFx0cmV0dXJuIG1vZGlmaWVkVG9rZW5zLmdldExpbmVDb250ZW50KCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gbW9kZWwuZ2V0TGluZUNvbnRlbnQobGluZU51bWJlcik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9O1xuXHRyZXR1cm4gdmlydHVhbE1vZGVsO1xufVxuXG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLGFBQWE7QUFHekIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxnQ0FBZ0M7QUFHekMsU0FBUyw2QkFBNkIsa0NBQWtDLG1DQUFtQztBQTBCM0csU0FBUyxzQkFBc0IsT0FBc0IsWUFBb0IsNkJBQTBEO0FBQ2xJLFFBQU0sYUFBYSxNQUFNLGFBQWEsd0JBQXdCLFlBQVksQ0FBQztBQUMzRSxNQUFJLGFBQWEsR0FBRztBQUNuQixRQUFJO0FBQ0osUUFBSSxtQkFBbUI7QUFFdkIsU0FBSyxpQkFBaUIsYUFBYSxHQUFHLGtCQUFrQixHQUFHLGtCQUFrQjtBQUM1RSxVQUFJLE1BQU0sYUFBYSx3QkFBd0IsZ0JBQWdCLENBQUMsTUFBTSxZQUFZO0FBQ2pGLGVBQU87QUFBQSxNQUNSO0FBQ0EsWUFBTSxPQUFPLE1BQU0sZUFBZSxjQUFjO0FBQ2hELFVBQUksNEJBQTRCLGFBQWEsY0FBYyxLQUFLLFFBQVEsS0FBSyxJQUFJLEtBQUssU0FBUyxJQUFJO0FBQ2xHLDJCQUFtQjtBQUNuQjtBQUFBLE1BQ0Q7QUFFQSxhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0Q7QUFFQSxTQUFPO0FBQ1I7QUFjTyxTQUFTLHdCQUNmLFlBQ0EsT0FDQSxZQUNBLHVCQUFnQyxNQUNoQyw4QkFDNkU7QUFDN0UsTUFBSSxhQUFhLHlCQUF5QixNQUFNO0FBQy9D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
