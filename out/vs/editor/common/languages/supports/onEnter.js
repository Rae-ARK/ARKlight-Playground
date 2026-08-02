import { onUnexpectedError } from "../../../../base/common/errors.js";
import * as strings from "../../../../base/common/strings.js";
import { IndentAction } from "../languageConfiguration.js";
import { EditorAutoIndentStrategy } from "../../config/editorOptions.js";
class OnEnterSupport {
  constructor(opts) {
    opts = opts || {};
    opts.brackets = opts.brackets || [
      ["(", ")"],
      ["{", "}"],
      ["[", "]"]
    ];
    this._brackets = [];
    opts.brackets.forEach((bracket) => {
      const openRegExp = OnEnterSupport._createOpenBracketRegExp(bracket[0]);
      const closeRegExp = OnEnterSupport._createCloseBracketRegExp(bracket[1]);
      if (openRegExp && closeRegExp) {
        this._brackets.push({
          open: bracket[0],
          openRegExp,
          close: bracket[1],
          closeRegExp
        });
      }
    });
    this._regExpRules = opts.onEnterRules || [];
  }
  onEnter(autoIndent, previousLineText, beforeEnterText, afterEnterText) {
    if (autoIndent >= EditorAutoIndentStrategy.Advanced) {
      for (let i = 0, len = this._regExpRules.length; i < len; i++) {
        const rule = this._regExpRules[i];
        const regResult = [{
          reg: rule.beforeText,
          text: beforeEnterText
        }, {
          reg: rule.afterText,
          text: afterEnterText
        }, {
          reg: rule.previousLineText,
          text: previousLineText
        }].every((obj) => {
          if (!obj.reg) {
            return true;
          }
          obj.reg.lastIndex = 0;
          return obj.reg.test(obj.text);
        });
        if (regResult) {
          return rule.action;
        }
      }
    }
    if (autoIndent >= EditorAutoIndentStrategy.Brackets) {
      if (beforeEnterText.length > 0 && afterEnterText.length > 0) {
        for (let i = 0, len = this._brackets.length; i < len; i++) {
          const bracket = this._brackets[i];
          if (bracket.openRegExp.test(beforeEnterText) && bracket.closeRegExp.test(afterEnterText)) {
            return { indentAction: IndentAction.IndentOutdent };
          }
        }
      }
    }
    if (autoIndent >= EditorAutoIndentStrategy.Brackets) {
      if (beforeEnterText.length > 0) {
        for (let i = 0, len = this._brackets.length; i < len; i++) {
          const bracket = this._brackets[i];
          if (bracket.openRegExp.test(beforeEnterText)) {
            return { indentAction: IndentAction.Indent };
          }
        }
      }
    }
    return null;
  }
  static _createOpenBracketRegExp(bracket) {
    let str = strings.escapeRegExpCharacters(bracket);
    if (!/\B/.test(str.charAt(0))) {
      str = "\\b" + str;
    }
    str += "\\s*$";
    return OnEnterSupport._safeRegExp(str);
  }
  static _createCloseBracketRegExp(bracket) {
    let str = strings.escapeRegExpCharacters(bracket);
    if (!/\B/.test(str.charAt(str.length - 1))) {
      str = str + "\\b";
    }
    str = "^\\s*" + str;
    return OnEnterSupport._safeRegExp(str);
  }
  static _safeRegExp(def) {
    try {
      return new RegExp(def);
    } catch (err) {
      onUnexpectedError(err);
      return null;
    }
  }
}
export {
  OnEnterSupport
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL3N1cHBvcnRzL29uRW50ZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgKiBhcyBzdHJpbmdzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgQ2hhcmFjdGVyUGFpciwgRW50ZXJBY3Rpb24sIEluZGVudEFjdGlvbiwgT25FbnRlclJ1bGUgfSBmcm9tICcuLi9sYW5ndWFnZUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRWRpdG9yQXV0b0luZGVudFN0cmF0ZWd5IH0gZnJvbSAnLi4vLi4vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElPbkVudGVyU3VwcG9ydE9wdGlvbnMge1xuXHRicmFja2V0cz86IENoYXJhY3RlclBhaXJbXTtcblx0b25FbnRlclJ1bGVzPzogT25FbnRlclJ1bGVbXTtcbn1cblxuaW50ZXJmYWNlIElQcm9jZXNzZWRCcmFja2V0UGFpciB7XG5cdG9wZW46IHN0cmluZztcblx0Y2xvc2U6IHN0cmluZztcblx0b3BlblJlZ0V4cDogUmVnRXhwO1xuXHRjbG9zZVJlZ0V4cDogUmVnRXhwO1xufVxuXG5leHBvcnQgY2xhc3MgT25FbnRlclN1cHBvcnQge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2JyYWNrZXRzOiBJUHJvY2Vzc2VkQnJhY2tldFBhaXJbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVnRXhwUnVsZXM6IE9uRW50ZXJSdWxlW107XG5cblx0Y29uc3RydWN0b3Iob3B0czogSU9uRW50ZXJTdXBwb3J0T3B0aW9ucykge1xuXHRcdG9wdHMgPSBvcHRzIHx8IHt9O1xuXHRcdG9wdHMuYnJhY2tldHMgPSBvcHRzLmJyYWNrZXRzIHx8IFtcblx0XHRcdFsnKCcsICcpJ10sXG5cdFx0XHRbJ3snLCAnfSddLFxuXHRcdFx0WydbJywgJ10nXVxuXHRcdF07XG5cblx0XHR0aGlzLl9icmFja2V0cyA9IFtdO1xuXHRcdG9wdHMuYnJhY2tldHMuZm9yRWFjaCgoYnJhY2tldCkgPT4ge1xuXHRcdFx0Y29uc3Qgb3BlblJlZ0V4cCA9IE9uRW50ZXJTdXBwb3J0Ll9jcmVhdGVPcGVuQnJhY2tldFJlZ0V4cChicmFja2V0WzBdKTtcblx0XHRcdGNvbnN0IGNsb3NlUmVnRXhwID0gT25FbnRlclN1cHBvcnQuX2NyZWF0ZUNsb3NlQnJhY2tldFJlZ0V4cChicmFja2V0WzFdKTtcblx0XHRcdGlmIChvcGVuUmVnRXhwICYmIGNsb3NlUmVnRXhwKSB7XG5cdFx0XHRcdHRoaXMuX2JyYWNrZXRzLnB1c2goe1xuXHRcdFx0XHRcdG9wZW46IGJyYWNrZXRbMF0sXG5cdFx0XHRcdFx0b3BlblJlZ0V4cDogb3BlblJlZ0V4cCxcblx0XHRcdFx0XHRjbG9zZTogYnJhY2tldFsxXSxcblx0XHRcdFx0XHRjbG9zZVJlZ0V4cDogY2xvc2VSZWdFeHAsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoaXMuX3JlZ0V4cFJ1bGVzID0gb3B0cy5vbkVudGVyUnVsZXMgfHwgW107XG5cdH1cblxuXHRwdWJsaWMgb25FbnRlcihhdXRvSW5kZW50OiBFZGl0b3JBdXRvSW5kZW50U3RyYXRlZ3ksIHByZXZpb3VzTGluZVRleHQ6IHN0cmluZywgYmVmb3JlRW50ZXJUZXh0OiBzdHJpbmcsIGFmdGVyRW50ZXJUZXh0OiBzdHJpbmcpOiBFbnRlckFjdGlvbiB8IG51bGwge1xuXHRcdC8vICgxKTogYHJlZ0V4cFJ1bGVzYFxuXHRcdGlmIChhdXRvSW5kZW50ID49IEVkaXRvckF1dG9JbmRlbnRTdHJhdGVneS5BZHZhbmNlZCkge1xuXHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHRoaXMuX3JlZ0V4cFJ1bGVzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IHJ1bGUgPSB0aGlzLl9yZWdFeHBSdWxlc1tpXTtcblx0XHRcdFx0Y29uc3QgcmVnUmVzdWx0ID0gW3tcblx0XHRcdFx0XHRyZWc6IHJ1bGUuYmVmb3JlVGV4dCxcblx0XHRcdFx0XHR0ZXh0OiBiZWZvcmVFbnRlclRleHRcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdHJlZzogcnVsZS5hZnRlclRleHQsXG5cdFx0XHRcdFx0dGV4dDogYWZ0ZXJFbnRlclRleHRcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdHJlZzogcnVsZS5wcmV2aW91c0xpbmVUZXh0LFxuXHRcdFx0XHRcdHRleHQ6IHByZXZpb3VzTGluZVRleHRcblx0XHRcdFx0fV0uZXZlcnkoKG9iaik6IGJvb2xlYW4gPT4ge1xuXHRcdFx0XHRcdGlmICghb2JqLnJlZykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0b2JqLnJlZy5sYXN0SW5kZXggPSAwOyAvLyBUbyBkaXNhYmxlIHRoZSBlZmZlY3Qgb2YgdGhlIFwiZ1wiIGZsYWcuXG5cdFx0XHRcdFx0cmV0dXJuIG9iai5yZWcudGVzdChvYmoudGV4dCk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGlmIChyZWdSZXN1bHQpIHtcblx0XHRcdFx0XHRyZXR1cm4gcnVsZS5hY3Rpb247XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyAoMik6IFNwZWNpYWwgaW5kZW50LW91dGRlbnRcblx0XHRpZiAoYXV0b0luZGVudCA+PSBFZGl0b3JBdXRvSW5kZW50U3RyYXRlZ3kuQnJhY2tldHMpIHtcblx0XHRcdGlmIChiZWZvcmVFbnRlclRleHQubGVuZ3RoID4gMCAmJiBhZnRlckVudGVyVGV4dC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSB0aGlzLl9icmFja2V0cy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRcdGNvbnN0IGJyYWNrZXQgPSB0aGlzLl9icmFja2V0c1tpXTtcblx0XHRcdFx0XHRpZiAoYnJhY2tldC5vcGVuUmVnRXhwLnRlc3QoYmVmb3JlRW50ZXJUZXh0KSAmJiBicmFja2V0LmNsb3NlUmVnRXhwLnRlc3QoYWZ0ZXJFbnRlclRleHQpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4geyBpbmRlbnRBY3Rpb246IEluZGVudEFjdGlvbi5JbmRlbnRPdXRkZW50IH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cblx0XHQvLyAoNCk6IE9wZW4gYnJhY2tldCBiYXNlZCBsb2dpY1xuXHRcdGlmIChhdXRvSW5kZW50ID49IEVkaXRvckF1dG9JbmRlbnRTdHJhdGVneS5CcmFja2V0cykge1xuXHRcdFx0aWYgKGJlZm9yZUVudGVyVGV4dC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSB0aGlzLl9icmFja2V0cy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRcdGNvbnN0IGJyYWNrZXQgPSB0aGlzLl9icmFja2V0c1tpXTtcblx0XHRcdFx0XHRpZiAoYnJhY2tldC5vcGVuUmVnRXhwLnRlc3QoYmVmb3JlRW50ZXJUZXh0KSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHsgaW5kZW50QWN0aW9uOiBJbmRlbnRBY3Rpb24uSW5kZW50IH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfY3JlYXRlT3BlbkJyYWNrZXRSZWdFeHAoYnJhY2tldDogc3RyaW5nKTogUmVnRXhwIHwgbnVsbCB7XG5cdFx0bGV0IHN0ciA9IHN0cmluZ3MuZXNjYXBlUmVnRXhwQ2hhcmFjdGVycyhicmFja2V0KTtcblx0XHRpZiAoIS9cXEIvLnRlc3Qoc3RyLmNoYXJBdCgwKSkpIHtcblx0XHRcdHN0ciA9ICdcXFxcYicgKyBzdHI7XG5cdFx0fVxuXHRcdHN0ciArPSAnXFxcXHMqJCc7XG5cdFx0cmV0dXJuIE9uRW50ZXJTdXBwb3J0Ll9zYWZlUmVnRXhwKHN0cik7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfY3JlYXRlQ2xvc2VCcmFja2V0UmVnRXhwKGJyYWNrZXQ6IHN0cmluZyk6IFJlZ0V4cCB8IG51bGwge1xuXHRcdGxldCBzdHIgPSBzdHJpbmdzLmVzY2FwZVJlZ0V4cENoYXJhY3RlcnMoYnJhY2tldCk7XG5cdFx0aWYgKCEvXFxCLy50ZXN0KHN0ci5jaGFyQXQoc3RyLmxlbmd0aCAtIDEpKSkge1xuXHRcdFx0c3RyID0gc3RyICsgJ1xcXFxiJztcblx0XHR9XG5cdFx0c3RyID0gJ15cXFxccyonICsgc3RyO1xuXHRcdHJldHVybiBPbkVudGVyU3VwcG9ydC5fc2FmZVJlZ0V4cChzdHIpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3NhZmVSZWdFeHAoZGVmOiBzdHJpbmcpOiBSZWdFeHAgfCBudWxsIHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIG5ldyBSZWdFeHAoZGVmKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycik7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMseUJBQXlCO0FBQ2xDLFlBQVksYUFBYTtBQUN6QixTQUFxQyxvQkFBaUM7QUFDdEUsU0FBUyxnQ0FBZ0M7QUFjbEMsTUFBTSxlQUFlO0FBQUEsRUFLM0IsWUFBWSxNQUE4QjtBQUN6QyxXQUFPLFFBQVEsQ0FBQztBQUNoQixTQUFLLFdBQVcsS0FBSyxZQUFZO0FBQUEsTUFDaEMsQ0FBQyxLQUFLLEdBQUc7QUFBQSxNQUNULENBQUMsS0FBSyxHQUFHO0FBQUEsTUFDVCxDQUFDLEtBQUssR0FBRztBQUFBLElBQ1Y7QUFFQSxTQUFLLFlBQVksQ0FBQztBQUNsQixTQUFLLFNBQVMsUUFBUSxDQUFDLFlBQVk7QUFDbEMsWUFBTSxhQUFhLGVBQWUseUJBQXlCLFFBQVEsQ0FBQyxDQUFDO0FBQ3JFLFlBQU0sY0FBYyxlQUFlLDBCQUEwQixRQUFRLENBQUMsQ0FBQztBQUN2RSxVQUFJLGNBQWMsYUFBYTtBQUM5QixhQUFLLFVBQVUsS0FBSztBQUFBLFVBQ25CLE1BQU0sUUFBUSxDQUFDO0FBQUEsVUFDZjtBQUFBLFVBQ0EsT0FBTyxRQUFRLENBQUM7QUFBQSxVQUNoQjtBQUFBLFFBQ0QsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNELENBQUM7QUFDRCxTQUFLLGVBQWUsS0FBSyxnQkFBZ0IsQ0FBQztBQUFBLEVBQzNDO0FBQUEsRUFFTyxRQUFRLFlBQXNDLGtCQUEwQixpQkFBeUIsZ0JBQTRDO0FBRW5KLFFBQUksY0FBYyx5QkFBeUIsVUFBVTtBQUNwRCxlQUFTLElBQUksR0FBRyxNQUFNLEtBQUssYUFBYSxRQUFRLElBQUksS0FBSyxLQUFLO0FBQzdELGNBQU0sT0FBTyxLQUFLLGFBQWEsQ0FBQztBQUNoQyxjQUFNLFlBQVksQ0FBQztBQUFBLFVBQ2xCLEtBQUssS0FBSztBQUFBLFVBQ1YsTUFBTTtBQUFBLFFBQ1AsR0FBRztBQUFBLFVBQ0YsS0FBSyxLQUFLO0FBQUEsVUFDVixNQUFNO0FBQUEsUUFDUCxHQUFHO0FBQUEsVUFDRixLQUFLLEtBQUs7QUFBQSxVQUNWLE1BQU07QUFBQSxRQUNQLENBQUMsRUFBRSxNQUFNLENBQUMsUUFBaUI7QUFDMUIsY0FBSSxDQUFDLElBQUksS0FBSztBQUNiLG1CQUFPO0FBQUEsVUFDUjtBQUVBLGNBQUksSUFBSSxZQUFZO0FBQ3BCLGlCQUFPLElBQUksSUFBSSxLQUFLLElBQUksSUFBSTtBQUFBLFFBQzdCLENBQUM7QUFFRCxZQUFJLFdBQVc7QUFDZCxpQkFBTyxLQUFLO0FBQUEsUUFDYjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBR0EsUUFBSSxjQUFjLHlCQUF5QixVQUFVO0FBQ3BELFVBQUksZ0JBQWdCLFNBQVMsS0FBSyxlQUFlLFNBQVMsR0FBRztBQUM1RCxpQkFBUyxJQUFJLEdBQUcsTUFBTSxLQUFLLFVBQVUsUUFBUSxJQUFJLEtBQUssS0FBSztBQUMxRCxnQkFBTSxVQUFVLEtBQUssVUFBVSxDQUFDO0FBQ2hDLGNBQUksUUFBUSxXQUFXLEtBQUssZUFBZSxLQUFLLFFBQVEsWUFBWSxLQUFLLGNBQWMsR0FBRztBQUN6RixtQkFBTyxFQUFFLGNBQWMsYUFBYSxjQUFjO0FBQUEsVUFDbkQ7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFJQSxRQUFJLGNBQWMseUJBQXlCLFVBQVU7QUFDcEQsVUFBSSxnQkFBZ0IsU0FBUyxHQUFHO0FBQy9CLGlCQUFTLElBQUksR0FBRyxNQUFNLEtBQUssVUFBVSxRQUFRLElBQUksS0FBSyxLQUFLO0FBQzFELGdCQUFNLFVBQVUsS0FBSyxVQUFVLENBQUM7QUFDaEMsY0FBSSxRQUFRLFdBQVcsS0FBSyxlQUFlLEdBQUc7QUFDN0MsbUJBQU8sRUFBRSxjQUFjLGFBQWEsT0FBTztBQUFBLFVBQzVDO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE9BQWUseUJBQXlCLFNBQWdDO0FBQ3ZFLFFBQUksTUFBTSxRQUFRLHVCQUF1QixPQUFPO0FBQ2hELFFBQUksQ0FBQyxLQUFLLEtBQUssSUFBSSxPQUFPLENBQUMsQ0FBQyxHQUFHO0FBQzlCLFlBQU0sUUFBUTtBQUFBLElBQ2Y7QUFDQSxXQUFPO0FBQ1AsV0FBTyxlQUFlLFlBQVksR0FBRztBQUFBLEVBQ3RDO0FBQUEsRUFFQSxPQUFlLDBCQUEwQixTQUFnQztBQUN4RSxRQUFJLE1BQU0sUUFBUSx1QkFBdUIsT0FBTztBQUNoRCxRQUFJLENBQUMsS0FBSyxLQUFLLElBQUksT0FBTyxJQUFJLFNBQVMsQ0FBQyxDQUFDLEdBQUc7QUFDM0MsWUFBTSxNQUFNO0FBQUEsSUFDYjtBQUNBLFVBQU0sVUFBVTtBQUNoQixXQUFPLGVBQWUsWUFBWSxHQUFHO0FBQUEsRUFDdEM7QUFBQSxFQUVBLE9BQWUsWUFBWSxLQUE0QjtBQUN0RCxRQUFJO0FBQ0gsYUFBTyxJQUFJLE9BQU8sR0FBRztBQUFBLElBQ3RCLFNBQVMsS0FBSztBQUNiLHdCQUFrQixHQUFHO0FBQ3JCLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUNEOyIsCiAgIm5hbWVzIjogW10KfQo=
