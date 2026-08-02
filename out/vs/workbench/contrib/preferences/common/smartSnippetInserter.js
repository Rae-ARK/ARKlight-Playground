import { createScanner as createJSONScanner, SyntaxKind as JSONSyntaxKind } from "../../../../base/common/json.js";
import { Position } from "../../../../editor/common/core/position.js";
import { Range } from "../../../../editor/common/core/range.js";
class SmartSnippetInserter {
  static hasOpenBrace(scanner) {
    while (scanner.scan() !== JSONSyntaxKind.EOF) {
      const kind = scanner.getToken();
      if (kind === JSONSyntaxKind.OpenBraceToken) {
        return true;
      }
    }
    return false;
  }
  static offsetToPosition(model, offset) {
    let offsetBeforeLine = 0;
    const eolLength = model.getEOL().length;
    const lineCount = model.getLineCount();
    for (let lineNumber = 1; lineNumber <= lineCount; lineNumber++) {
      const lineTotalLength = model.getLineLength(lineNumber) + eolLength;
      const offsetAfterLine = offsetBeforeLine + lineTotalLength;
      if (offsetAfterLine > offset) {
        return new Position(
          lineNumber,
          offset - offsetBeforeLine + 1
        );
      }
      offsetBeforeLine = offsetAfterLine;
    }
    return new Position(
      lineCount,
      model.getLineMaxColumn(lineCount)
    );
  }
  static insertSnippet(model, _position) {
    const desiredPosition = model.getValueLengthInRange(new Range(1, 1, _position.lineNumber, _position.column));
    let State;
    ((State2) => {
      State2[State2["INVALID"] = 0] = "INVALID";
      State2[State2["AFTER_OBJECT"] = 1] = "AFTER_OBJECT";
      State2[State2["BEFORE_OBJECT"] = 2] = "BEFORE_OBJECT";
    })(State || (State = {}));
    let currentState = 0 /* INVALID */;
    let lastValidPos = -1;
    let lastValidState = 0 /* INVALID */;
    const scanner = createJSONScanner(model.getValue());
    let arrayLevel = 0;
    let objLevel = 0;
    const checkRangeStatus = (pos, state) => {
      if (state !== 0 /* INVALID */ && arrayLevel === 1 && objLevel === 0) {
        currentState = state;
        lastValidPos = pos;
        lastValidState = state;
      } else {
        if (currentState !== 0 /* INVALID */) {
          currentState = 0 /* INVALID */;
          lastValidPos = scanner.getTokenOffset();
        }
      }
    };
    while (scanner.scan() !== JSONSyntaxKind.EOF) {
      const currentPos = scanner.getPosition();
      const kind = scanner.getToken();
      let goodKind = false;
      switch (kind) {
        case JSONSyntaxKind.OpenBracketToken:
          goodKind = true;
          arrayLevel++;
          checkRangeStatus(currentPos, 2 /* BEFORE_OBJECT */);
          break;
        case JSONSyntaxKind.CloseBracketToken:
          goodKind = true;
          arrayLevel--;
          checkRangeStatus(currentPos, 0 /* INVALID */);
          break;
        case JSONSyntaxKind.CommaToken:
          goodKind = true;
          checkRangeStatus(currentPos, 2 /* BEFORE_OBJECT */);
          break;
        case JSONSyntaxKind.OpenBraceToken:
          goodKind = true;
          objLevel++;
          checkRangeStatus(currentPos, 0 /* INVALID */);
          break;
        case JSONSyntaxKind.CloseBraceToken:
          goodKind = true;
          objLevel--;
          checkRangeStatus(currentPos, 1 /* AFTER_OBJECT */);
          break;
        case JSONSyntaxKind.Trivia:
        case JSONSyntaxKind.LineBreakTrivia:
          goodKind = true;
      }
      if (currentPos >= desiredPosition && (currentState !== 0 /* INVALID */ || lastValidPos !== -1)) {
        let acceptPosition;
        let acceptState;
        if (currentState !== 0 /* INVALID */) {
          acceptPosition = goodKind ? currentPos : scanner.getTokenOffset();
          acceptState = currentState;
        } else {
          acceptPosition = lastValidPos;
          acceptState = lastValidState;
        }
        if (acceptState === 1 /* AFTER_OBJECT */) {
          return {
            position: this.offsetToPosition(model, acceptPosition),
            prepend: ",",
            append: ""
          };
        } else {
          scanner.setPosition(acceptPosition);
          return {
            position: this.offsetToPosition(model, acceptPosition),
            prepend: "",
            append: this.hasOpenBrace(scanner) ? "," : ""
          };
        }
      }
    }
    const modelLineCount = model.getLineCount();
    return {
      position: new Position(modelLineCount, model.getLineMaxColumn(modelLineCount)),
      prepend: "\n[",
      append: "]"
    };
  }
}
export {
  SmartSnippetInserter
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3ByZWZlcmVuY2VzL2NvbW1vbi9zbWFydFNuaXBwZXRJbnNlcnRlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEpTT05TY2FubmVyLCBjcmVhdGVTY2FubmVyIGFzIGNyZWF0ZUpTT05TY2FubmVyLCBTeW50YXhLaW5kIGFzIEpTT05TeW50YXhLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbi5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSW5zZXJ0U25pcHBldFJlc3VsdCB7XG5cdHBvc2l0aW9uOiBQb3NpdGlvbjtcblx0cHJlcGVuZDogc3RyaW5nO1xuXHRhcHBlbmQ6IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIFNtYXJ0U25pcHBldEluc2VydGVyIHtcblxuXHRwcml2YXRlIHN0YXRpYyBoYXNPcGVuQnJhY2Uoc2Nhbm5lcjogSlNPTlNjYW5uZXIpOiBib29sZWFuIHtcblxuXHRcdHdoaWxlIChzY2FubmVyLnNjYW4oKSAhPT0gSlNPTlN5bnRheEtpbmQuRU9GKSB7XG5cdFx0XHRjb25zdCBraW5kID0gc2Nhbm5lci5nZXRUb2tlbigpO1xuXG5cdFx0XHRpZiAoa2luZCA9PT0gSlNPTlN5bnRheEtpbmQuT3BlbkJyYWNlVG9rZW4pIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgb2Zmc2V0VG9Qb3NpdGlvbihtb2RlbDogSVRleHRNb2RlbCwgb2Zmc2V0OiBudW1iZXIpOiBQb3NpdGlvbiB7XG5cdFx0bGV0IG9mZnNldEJlZm9yZUxpbmUgPSAwO1xuXHRcdGNvbnN0IGVvbExlbmd0aCA9IG1vZGVsLmdldEVPTCgpLmxlbmd0aDtcblx0XHRjb25zdCBsaW5lQ291bnQgPSBtb2RlbC5nZXRMaW5lQ291bnQoKTtcblx0XHRmb3IgKGxldCBsaW5lTnVtYmVyID0gMTsgbGluZU51bWJlciA8PSBsaW5lQ291bnQ7IGxpbmVOdW1iZXIrKykge1xuXHRcdFx0Y29uc3QgbGluZVRvdGFsTGVuZ3RoID0gbW9kZWwuZ2V0TGluZUxlbmd0aChsaW5lTnVtYmVyKSArIGVvbExlbmd0aDtcblx0XHRcdGNvbnN0IG9mZnNldEFmdGVyTGluZSA9IG9mZnNldEJlZm9yZUxpbmUgKyBsaW5lVG90YWxMZW5ndGg7XG5cblx0XHRcdGlmIChvZmZzZXRBZnRlckxpbmUgPiBvZmZzZXQpIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBQb3NpdGlvbihcblx0XHRcdFx0XHRsaW5lTnVtYmVyLFxuXHRcdFx0XHRcdG9mZnNldCAtIG9mZnNldEJlZm9yZUxpbmUgKyAxXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0XHRvZmZzZXRCZWZvcmVMaW5lID0gb2Zmc2V0QWZ0ZXJMaW5lO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IFBvc2l0aW9uKFxuXHRcdFx0bGluZUNvdW50LFxuXHRcdFx0bW9kZWwuZ2V0TGluZU1heENvbHVtbihsaW5lQ291bnQpXG5cdFx0KTtcblx0fVxuXG5cdHN0YXRpYyBpbnNlcnRTbmlwcGV0KG1vZGVsOiBJVGV4dE1vZGVsLCBfcG9zaXRpb246IFBvc2l0aW9uKTogSW5zZXJ0U25pcHBldFJlc3VsdCB7XG5cblx0XHRjb25zdCBkZXNpcmVkUG9zaXRpb24gPSBtb2RlbC5nZXRWYWx1ZUxlbmd0aEluUmFuZ2UobmV3IFJhbmdlKDEsIDEsIF9wb3NpdGlvbi5saW5lTnVtYmVyLCBfcG9zaXRpb24uY29sdW1uKSk7XG5cblx0XHQvLyA8SU5WQUxJRD4gWyA8QkVGT1JFX09CSkVDVD4geyA8SU5WQUxJRD4gfSA8QUZURVJfT0JKRUNUPiwgPEJFRk9SRV9PQkpFQ1Q+IHsgPElOVkFMSUQ+IH0gPEFGVEVSX09CSkVDVD4gXSA8SU5WQUxJRD5cblx0XHRlbnVtIFN0YXRlIHtcblx0XHRcdElOVkFMSUQgPSAwLFxuXHRcdFx0QUZURVJfT0JKRUNUID0gMSxcblx0XHRcdEJFRk9SRV9PQkpFQ1QgPSAyLFxuXHRcdH1cblx0XHRsZXQgY3VycmVudFN0YXRlID0gU3RhdGUuSU5WQUxJRDtcblx0XHRsZXQgbGFzdFZhbGlkUG9zID0gLTE7XG5cdFx0bGV0IGxhc3RWYWxpZFN0YXRlID0gU3RhdGUuSU5WQUxJRDtcblxuXHRcdGNvbnN0IHNjYW5uZXIgPSBjcmVhdGVKU09OU2Nhbm5lcihtb2RlbC5nZXRWYWx1ZSgpKTtcblx0XHRsZXQgYXJyYXlMZXZlbCA9IDA7XG5cdFx0bGV0IG9iakxldmVsID0gMDtcblxuXHRcdGNvbnN0IGNoZWNrUmFuZ2VTdGF0dXMgPSAocG9zOiBudW1iZXIsIHN0YXRlOiBTdGF0ZSkgPT4ge1xuXHRcdFx0aWYgKHN0YXRlICE9PSBTdGF0ZS5JTlZBTElEICYmIGFycmF5TGV2ZWwgPT09IDEgJiYgb2JqTGV2ZWwgPT09IDApIHtcblx0XHRcdFx0Y3VycmVudFN0YXRlID0gc3RhdGU7XG5cdFx0XHRcdGxhc3RWYWxpZFBvcyA9IHBvcztcblx0XHRcdFx0bGFzdFZhbGlkU3RhdGUgPSBzdGF0ZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChjdXJyZW50U3RhdGUgIT09IFN0YXRlLklOVkFMSUQpIHtcblx0XHRcdFx0XHRjdXJyZW50U3RhdGUgPSBTdGF0ZS5JTlZBTElEO1xuXHRcdFx0XHRcdGxhc3RWYWxpZFBvcyA9IHNjYW5uZXIuZ2V0VG9rZW5PZmZzZXQoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHR3aGlsZSAoc2Nhbm5lci5zY2FuKCkgIT09IEpTT05TeW50YXhLaW5kLkVPRikge1xuXHRcdFx0Y29uc3QgY3VycmVudFBvcyA9IHNjYW5uZXIuZ2V0UG9zaXRpb24oKTtcblx0XHRcdGNvbnN0IGtpbmQgPSBzY2FubmVyLmdldFRva2VuKCk7XG5cblx0XHRcdGxldCBnb29kS2luZCA9IGZhbHNlO1xuXHRcdFx0c3dpdGNoIChraW5kKSB7XG5cdFx0XHRcdGNhc2UgSlNPTlN5bnRheEtpbmQuT3BlbkJyYWNrZXRUb2tlbjpcblx0XHRcdFx0XHRnb29kS2luZCA9IHRydWU7XG5cdFx0XHRcdFx0YXJyYXlMZXZlbCsrO1xuXHRcdFx0XHRcdGNoZWNrUmFuZ2VTdGF0dXMoY3VycmVudFBvcywgU3RhdGUuQkVGT1JFX09CSkVDVCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgSlNPTlN5bnRheEtpbmQuQ2xvc2VCcmFja2V0VG9rZW46XG5cdFx0XHRcdFx0Z29vZEtpbmQgPSB0cnVlO1xuXHRcdFx0XHRcdGFycmF5TGV2ZWwtLTtcblx0XHRcdFx0XHRjaGVja1JhbmdlU3RhdHVzKGN1cnJlbnRQb3MsIFN0YXRlLklOVkFMSUQpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIEpTT05TeW50YXhLaW5kLkNvbW1hVG9rZW46XG5cdFx0XHRcdFx0Z29vZEtpbmQgPSB0cnVlO1xuXHRcdFx0XHRcdGNoZWNrUmFuZ2VTdGF0dXMoY3VycmVudFBvcywgU3RhdGUuQkVGT1JFX09CSkVDVCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgSlNPTlN5bnRheEtpbmQuT3BlbkJyYWNlVG9rZW46XG5cdFx0XHRcdFx0Z29vZEtpbmQgPSB0cnVlO1xuXHRcdFx0XHRcdG9iakxldmVsKys7XG5cdFx0XHRcdFx0Y2hlY2tSYW5nZVN0YXR1cyhjdXJyZW50UG9zLCBTdGF0ZS5JTlZBTElEKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBKU09OU3ludGF4S2luZC5DbG9zZUJyYWNlVG9rZW46XG5cdFx0XHRcdFx0Z29vZEtpbmQgPSB0cnVlO1xuXHRcdFx0XHRcdG9iakxldmVsLS07XG5cdFx0XHRcdFx0Y2hlY2tSYW5nZVN0YXR1cyhjdXJyZW50UG9zLCBTdGF0ZS5BRlRFUl9PQkpFQ1QpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIEpTT05TeW50YXhLaW5kLlRyaXZpYTpcblx0XHRcdFx0Y2FzZSBKU09OU3ludGF4S2luZC5MaW5lQnJlYWtUcml2aWE6XG5cdFx0XHRcdFx0Z29vZEtpbmQgPSB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY3VycmVudFBvcyA+PSBkZXNpcmVkUG9zaXRpb24gJiYgKGN1cnJlbnRTdGF0ZSAhPT0gU3RhdGUuSU5WQUxJRCB8fCBsYXN0VmFsaWRQb3MgIT09IC0xKSkge1xuXHRcdFx0XHRsZXQgYWNjZXB0UG9zaXRpb246IG51bWJlcjtcblx0XHRcdFx0bGV0IGFjY2VwdFN0YXRlOiBTdGF0ZTtcblxuXHRcdFx0XHRpZiAoY3VycmVudFN0YXRlICE9PSBTdGF0ZS5JTlZBTElEKSB7XG5cdFx0XHRcdFx0YWNjZXB0UG9zaXRpb24gPSAoZ29vZEtpbmQgPyBjdXJyZW50UG9zIDogc2Nhbm5lci5nZXRUb2tlbk9mZnNldCgpKTtcblx0XHRcdFx0XHRhY2NlcHRTdGF0ZSA9IGN1cnJlbnRTdGF0ZTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRhY2NlcHRQb3NpdGlvbiA9IGxhc3RWYWxpZFBvcztcblx0XHRcdFx0XHRhY2NlcHRTdGF0ZSA9IGxhc3RWYWxpZFN0YXRlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGFjY2VwdFN0YXRlIGFzIFN0YXRlID09PSBTdGF0ZS5BRlRFUl9PQkpFQ1QpIHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0cG9zaXRpb246IHRoaXMub2Zmc2V0VG9Qb3NpdGlvbihtb2RlbCwgYWNjZXB0UG9zaXRpb24pLFxuXHRcdFx0XHRcdFx0cHJlcGVuZDogJywnLFxuXHRcdFx0XHRcdFx0YXBwZW5kOiAnJ1xuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0c2Nhbm5lci5zZXRQb3NpdGlvbihhY2NlcHRQb3NpdGlvbik7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdHBvc2l0aW9uOiB0aGlzLm9mZnNldFRvUG9zaXRpb24obW9kZWwsIGFjY2VwdFBvc2l0aW9uKSxcblx0XHRcdFx0XHRcdHByZXBlbmQ6ICcnLFxuXHRcdFx0XHRcdFx0YXBwZW5kOiB0aGlzLmhhc09wZW5CcmFjZShzY2FubmVyKSA/ICcsJyA6ICcnXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIG5vIHZhbGlkIHBvc2l0aW9uIGZvdW5kIVxuXHRcdGNvbnN0IG1vZGVsTGluZUNvdW50ID0gbW9kZWwuZ2V0TGluZUNvdW50KCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHBvc2l0aW9uOiBuZXcgUG9zaXRpb24obW9kZWxMaW5lQ291bnQsIG1vZGVsLmdldExpbmVNYXhDb2x1bW4obW9kZWxMaW5lQ291bnQpKSxcblx0XHRcdHByZXBlbmQ6ICdcXG5bJyxcblx0XHRcdGFwcGVuZDogJ10nXG5cdFx0fTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBc0IsaUJBQWlCLG1CQUFtQixjQUFjLHNCQUFzQjtBQUM5RixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFTZixNQUFNLHFCQUFxQjtBQUFBLEVBRWpDLE9BQWUsYUFBYSxTQUErQjtBQUUxRCxXQUFPLFFBQVEsS0FBSyxNQUFNLGVBQWUsS0FBSztBQUM3QyxZQUFNLE9BQU8sUUFBUSxTQUFTO0FBRTlCLFVBQUksU0FBUyxlQUFlLGdCQUFnQjtBQUMzQyxlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsT0FBZSxpQkFBaUIsT0FBbUIsUUFBMEI7QUFDNUUsUUFBSSxtQkFBbUI7QUFDdkIsVUFBTSxZQUFZLE1BQU0sT0FBTyxFQUFFO0FBQ2pDLFVBQU0sWUFBWSxNQUFNLGFBQWE7QUFDckMsYUFBUyxhQUFhLEdBQUcsY0FBYyxXQUFXLGNBQWM7QUFDL0QsWUFBTSxrQkFBa0IsTUFBTSxjQUFjLFVBQVUsSUFBSTtBQUMxRCxZQUFNLGtCQUFrQixtQkFBbUI7QUFFM0MsVUFBSSxrQkFBa0IsUUFBUTtBQUM3QixlQUFPLElBQUk7QUFBQSxVQUNWO0FBQUEsVUFDQSxTQUFTLG1CQUFtQjtBQUFBLFFBQzdCO0FBQUEsTUFDRDtBQUNBLHlCQUFtQjtBQUFBLElBQ3BCO0FBQ0EsV0FBTyxJQUFJO0FBQUEsTUFDVjtBQUFBLE1BQ0EsTUFBTSxpQkFBaUIsU0FBUztBQUFBLElBQ2pDO0FBQUEsRUFDRDtBQUFBLEVBRUEsT0FBTyxjQUFjLE9BQW1CLFdBQTBDO0FBRWpGLFVBQU0sa0JBQWtCLE1BQU0sc0JBQXNCLElBQUksTUFBTSxHQUFHLEdBQUcsVUFBVSxZQUFZLFVBQVUsTUFBTSxDQUFDO0FBRzNHLFFBQUs7QUFBTCxNQUFLQSxXQUFMO0FBQ0MsTUFBQUEsY0FBQSxh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
