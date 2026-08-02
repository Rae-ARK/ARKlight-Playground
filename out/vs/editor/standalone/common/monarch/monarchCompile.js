import { isString } from "../../../../base/common/types.js";
import * as monarchCommon from "./monarchCommon.js";
function isArrayOf(elemType, obj) {
  if (!obj) {
    return false;
  }
  if (!Array.isArray(obj)) {
    return false;
  }
  for (const el of obj) {
    if (!elemType(el)) {
      return false;
    }
  }
  return true;
}
function bool(prop, defValue) {
  if (typeof prop === "boolean") {
    return prop;
  }
  return defValue;
}
function string(prop, defValue) {
  if (typeof prop === "string") {
    return prop;
  }
  return defValue;
}
function arrayToHash(array) {
  const result = {};
  for (const e of array) {
    result[e] = true;
  }
  return result;
}
function createKeywordMatcher(arr, caseInsensitive = false) {
  if (caseInsensitive) {
    arr = arr.map(function(x) {
      return x.toLowerCase();
    });
  }
  const hash = arrayToHash(arr);
  if (caseInsensitive) {
    return function(word) {
      return hash[word.toLowerCase()] !== void 0 && hash.hasOwnProperty(word.toLowerCase());
    };
  } else {
    return function(word) {
      return hash[word] !== void 0 && hash.hasOwnProperty(word);
    };
  }
}
function compileRegExp(lexer, str, handleSn) {
  str = str.replace(/@@/g, ``);
  let n = 0;
  let hadExpansion;
  do {
    hadExpansion = false;
    str = str.replace(/@(\w+)/g, function(s, attr) {
      hadExpansion = true;
      let sub = "";
      if (typeof lexer[attr] === "string") {
        sub = lexer[attr];
      } else if (lexer[attr] && lexer[attr] instanceof RegExp) {
        sub = lexer[attr].source;
      } else {
        if (lexer[attr] === void 0) {
          throw monarchCommon.createError(lexer, "language definition does not contain attribute '" + attr + "', used at: " + str);
        } else {
          throw monarchCommon.createError(lexer, "attribute reference '" + attr + "' must be a string, used at: " + str);
        }
      }
      return monarchCommon.empty(sub) ? "" : "(?:" + sub + ")";
    });
    n++;
  } while (hadExpansion && n < 5);
  str = str.replace(/\x01/g, "@");
  const flags = (lexer.ignoreCase ? "i" : "") + (lexer.unicode ? "u" : "");
  if (handleSn) {
    const match = str.match(/\$[sS](\d\d?)/g);
    if (match) {
      let lastState = null;
      let lastRegEx = null;
      return (state) => {
        if (lastRegEx && lastState === state) {
          return lastRegEx;
        }
        lastState = state;
        lastRegEx = new RegExp(monarchCommon.substituteMatchesRe(lexer, str, state), flags);
        return lastRegEx;
      };
    }
  }
  return new RegExp(str, flags);
}
function selectScrutinee(id, matches, state, num) {
  if (num < 0) {
    return id;
  }
  if (num < matches.length) {
    return matches[num];
  }
  if (num >= 100) {
    num = num - 100;
    const parts = state.split(".");
    parts.unshift(state);
    if (num < parts.length) {
      return parts[num];
    }
  }
  return null;
}
function createGuard(lexer, ruleName, tkey, val) {
  let scrut = -1;
  let oppat = tkey;
  let matches = tkey.match(/^\$(([sS]?)(\d\d?)|#)(.*)$/);
  if (matches) {
    if (matches[3]) {
      scrut = parseInt(matches[3]);
      if (matches[2]) {
        scrut = scrut + 100;
      }
    }
    oppat = matches[4];
  }
  let op = "~";
  let pat = oppat;
  if (!oppat || oppat.length === 0) {
    op = "!=";
    pat = "";
  } else if (/^\w*$/.test(pat)) {
    op = "==";
  } else {
    matches = oppat.match(/^(@|!@|~|!~|==|!=)(.*)$/);
    if (matches) {
      op = matches[1];
      pat = matches[2];
    }
  }
  let tester;
  if ((op === "~" || op === "!~") && /^(\w|\|)*$/.test(pat)) {
    const inWords = createKeywordMatcher(pat.split("|"), lexer.ignoreCase);
    tester = function(s) {
      return op === "~" ? inWords(s) : !inWords(s);
    };
  } else if (op === "@" || op === "!@") {
    const words = lexer[pat];
    if (!words) {
      throw monarchCommon.createError(lexer, "the @ match target '" + pat + "' is not defined, in rule: " + ruleName);
    }
    if (!isArrayOf(function(elem) {
      return typeof elem === "string";
    }, words)) {
      throw monarchCommon.createError(lexer, "the @ match target '" + pat + "' must be an array of strings, in rule: " + ruleName);
    }
    const inWords = createKeywordMatcher(words, lexer.ignoreCase);
    tester = function(s) {
      return op === "@" ? inWords(s) : !inWords(s);
    };
  } else if (op === "~" || op === "!~") {
    if (pat.indexOf("$") < 0) {
      const re = compileRegExp(lexer, "^" + pat + "$", false);
      tester = function(s) {
        return op === "~" ? re.test(s) : !re.test(s);
      };
    } else {
      tester = function(s, id, matches2, state) {
        const re = compileRegExp(lexer, "^" + monarchCommon.substituteMatches(lexer, pat, id, matches2, state) + "$", false);
        return re.test(s);
      };
    }
  } else {
    if (pat.indexOf("$") < 0) {
      const patx = monarchCommon.fixCase(lexer, pat);
      tester = function(s) {
        return op === "==" ? s === patx : s !== patx;
      };
    } else {
      const patx = monarchCommon.fixCase(lexer, pat);
      tester = function(s, id, matches2, state, eos) {
        const patexp = monarchCommon.substituteMatches(lexer, patx, id, matches2, state);
        return op === "==" ? s === patexp : s !== patexp;
      };
    }
  }
  if (scrut === -1) {
    return {
      name: tkey,
      value: val,
      test: function(id, matches2, state, eos) {
        return tester(id, id, matches2, state, eos);
      }
    };
  } else {
    return {
      name: tkey,
      value: val,
      test: function(id, matches2, state, eos) {
        const scrutinee = selectScrutinee(id, matches2, state, scrut);
        return tester(!scrutinee ? "" : scrutinee, id, matches2, state, eos);
      }
    };
  }
}
function compileAction(lexer, ruleName, action) {
  if (!action) {
    return { token: "" };
  } else if (typeof action === "string") {
    return action;
  } else if (action.token || action.token === "") {
    if (typeof action.token !== "string") {
      throw monarchCommon.createError(lexer, "a 'token' attribute must be of type string, in rule: " + ruleName);
    } else {
      const newAction = { token: action.token };
      if (action.token.indexOf("$") >= 0) {
        newAction.tokenSubst = true;
      }
      if (typeof action.bracket === "string") {
        if (action.bracket === "@open") {
          newAction.bracket = monarchCommon.MonarchBracket.Open;
        } else if (action.bracket === "@close") {
          newAction.bracket = monarchCommon.MonarchBracket.Close;
        } else {
          throw monarchCommon.createError(lexer, "a 'bracket' attribute must be either '@open' or '@close', in rule: " + ruleName);
        }
      }
      if (action.next) {
        if (typeof action.next !== "string") {
          throw monarchCommon.createError(lexer, "the next state must be a string value in rule: " + ruleName);
        } else {
          let next = action.next;
          if (!/^(@pop|@push|@popall)$/.test(next)) {
            if (next[0] === "@") {
              next = next.substr(1);
            }
            if (next.indexOf("$") < 0) {
              if (!monarchCommon.stateExists(lexer, monarchCommon.substituteMatches(lexer, next, "", [], ""))) {
                throw monarchCommon.createError(lexer, "the next state '" + action.next + "' is not defined in rule: " + ruleName);
              }
            }
          }
          newAction.next = next;
        }
      }
      if (typeof action.goBack === "number") {
        newAction.goBack = action.goBack;
      }
      if (typeof action.switchTo === "string") {
        newAction.switchTo = action.switchTo;
      }
      if (typeof action.log === "string") {
        newAction.log = action.log;
      }
      if (typeof action.nextEmbedded === "string") {
        newAction.nextEmbedded = action.nextEmbedded;
        lexer.usesEmbedded = true;
      }
      return newAction;
    }
  } else if (Array.isArray(action)) {
    const results = [];
    for (let i = 0, len = action.length; i < len; i++) {
      results[i] = compileAction(lexer, ruleName, action[i]);
    }
    return { group: results };
  } else if (action.cases) {
    const cases = [];
    let hasEmbeddedEndInCases = false;
    for (const tkey in action.cases) {
      if (action.cases.hasOwnProperty(tkey)) {
        const val = compileAction(lexer, ruleName, action.cases[tkey]);
        if (tkey === "@default" || tkey === "@" || tkey === "") {
          cases.push({ test: void 0, value: val, name: tkey });
        } else if (tkey === "@eos") {
          cases.push({ test: function(id, matches, state, eos) {
            return eos;
          }, value: val, name: tkey });
        } else {
          cases.push(createGuard(lexer, ruleName, tkey, val));
        }
        if (!hasEmbeddedEndInCases) {
          hasEmbeddedEndInCases = !isString(val) && (val.hasEmbeddedEndInCases || ["@pop", "@popall"].includes(val.nextEmbedded || ""));
        }
      }
    }
    const def = lexer.defaultToken;
    return {
      hasEmbeddedEndInCases,
      test: function(id, matches, state, eos) {
        for (const _case of cases) {
          const didmatch = !_case.test || _case.test(id, matches, state, eos);
          if (didmatch) {
            return _case.value;
          }
        }
        return def;
      }
    };
  } else {
    throw monarchCommon.createError(lexer, "an action must be a string, an object with a 'token' or 'cases' attribute, or an array of actions; in rule: " + ruleName);
  }
}
class Rule {
  constructor(name) {
    this.regex = new RegExp("");
    this.action = { token: "" };
    this.matchOnlyAtLineStart = false;
    this.name = "";
    this.name = name;
  }
  setRegex(lexer, re) {
    let sregex;
    if (typeof re === "string") {
      sregex = re;
    } else if (re instanceof RegExp) {
      sregex = re.source;
    } else {
      throw monarchCommon.createError(lexer, "rules must start with a match string or regular expression: " + this.name);
    }
    this.matchOnlyAtLineStart = sregex.length > 0 && sregex[0] === "^";
    this.name = this.name + ": " + sregex;
    this.regex = compileRegExp(lexer, "^(?:" + (this.matchOnlyAtLineStart ? sregex.substr(1) : sregex) + ")", true);
  }
  setAction(lexer, act) {
    this.action = compileAction(lexer, this.name, act);
  }
  resolveRegex(state) {
    if (this.regex instanceof RegExp) {
      return this.regex;
    } else {
      return this.regex(state);
    }
  }
}
function compile(languageId, json) {
  if (!json || typeof json !== "object") {
    throw new Error("Monarch: expecting a language definition object");
  }
  const lexer = {
    languageId,
    includeLF: bool(json.includeLF, false),
    noThrow: false,
    // raise exceptions during compilation
    maxStack: 100,
    start: typeof json.start === "string" ? json.start : null,
    ignoreCase: bool(json.ignoreCase, false),
    unicode: bool(json.unicode, false),
    tokenPostfix: string(json.tokenPostfix, "." + languageId),
    defaultToken: string(json.defaultToken, "source"),
    usesEmbedded: false,
    // becomes true if we find a nextEmbedded action
    stateNames: {},
    tokenizer: {},
    brackets: []
  };
  const lexerMin = json;
  lexerMin.languageId = languageId;
  lexerMin.includeLF = lexer.includeLF;
  lexerMin.ignoreCase = lexer.ignoreCase;
  lexerMin.unicode = lexer.unicode;
  lexerMin.noThrow = lexer.noThrow;
  lexerMin.usesEmbedded = lexer.usesEmbedded;
  lexerMin.stateNames = json.tokenizer;
  lexerMin.defaultToken = lexer.defaultToken;
  function addRules(state, newrules, rules) {
    for (const rule of rules) {
      let include = rule.include;
      if (include) {
        if (typeof include !== "string") {
          throw monarchCommon.createError(lexer, "an 'include' attribute must be a string at: " + state);
        }
        if (include[0] === "@") {
          include = include.substr(1);
        }
        if (!json.tokenizer[include]) {
          throw monarchCommon.createError(lexer, "include target '" + include + "' is not defined at: " + state);
        }
        addRules(state + "." + include, newrules, json.tokenizer[include]);
      } else {
        const newrule = new Rule(state);
        if (Array.isArray(rule) && rule.length >= 1 && rule.length <= 3) {
          newrule.setRegex(lexerMin, rule[0]);
          if (rule.length >= 3) {
            if (typeof rule[1] === "string") {
              newrule.setAction(lexerMin, { token: rule[1], next: rule[2] });
            } else if (typeof rule[1] === "object") {
              const rule1 = rule[1];
              rule1.next = rule[2];
              newrule.setAction(lexerMin, rule1);
            } else {
              throw monarchCommon.createError(lexer, "a next state as the last element of a rule can only be given if the action is either an object or a string, at: " + state);
            }
          } else {
            newrule.setAction(lexerMin, rule[1]);
          }
        } else {
          if (!rule.regex) {
            throw monarchCommon.createError(lexer, "a rule must either be an array, or an object with a 'regex' or 'include' field at: " + state);
          }
          if (rule.name) {
            if (typeof rule.name === "string") {
              newrule.name = rule.name;
            }
          }
          if (rule.matchOnlyAtStart) {
            newrule.matchOnlyAtLineStart = bool(rule.matchOnlyAtLineStart, false);
          }
          newrule.setRegex(lexerMin, rule.regex);
          newrule.setAction(lexerMin, rule.action);
        }
        newrules.push(newrule);
      }
    }
  }
  if (!json.tokenizer || typeof json.tokenizer !== "object") {
    throw monarchCommon.createError(lexer, "a language definition must define the 'tokenizer' attribute as an object");
  }
  lexer.tokenizer = [];
  for (const key in json.tokenizer) {
    if (json.tokenizer.hasOwnProperty(key)) {
      if (!lexer.start) {
        lexer.start = key;
      }
      const rules = json.tokenizer[key];
      lexer.tokenizer[key] = new Array();
      addRules("tokenizer." + key, lexer.tokenizer[key], rules);
    }
  }
  lexer.usesEmbedded = lexerMin.usesEmbedded;
  if (json.brackets) {
    if (!Array.isArray(json.brackets)) {
      throw monarchCommon.createError(lexer, "the 'brackets' attribute must be defined as an array");
    }
  } else {
    json.brackets = [
      { open: "{", close: "}", token: "delimiter.curly" },
      { open: "[", close: "]", token: "delimiter.square" },
      { open: "(", close: ")", token: "delimiter.parenthesis" },
      { open: "<", close: ">", token: "delimiter.angle" }
    ];
  }
  const brackets = [];
  for (const el of json.brackets) {
    let desc = el;
    if (desc && Array.isArray(desc) && desc.length === 3) {
      desc = { token: desc[2], open: desc[0], close: desc[1] };
    }
    if (desc.open === desc.close) {
      throw monarchCommon.createError(lexer, "open and close brackets in a 'brackets' attribute must be different: " + desc.open + "\n hint: use the 'bracket' attribute if matching on equal brackets is required.");
    }
    if (typeof desc.open === "string" && typeof desc.token === "string" && typeof desc.close === "string") {
      brackets.push({
        token: desc.token + lexer.tokenPostfix,
        open: monarchCommon.fixCase(lexer, desc.open),
        close: monarchCommon.fixCase(lexer, desc.close)
      });
    } else {
      throw monarchCommon.createError(lexer, "every element in the 'brackets' array must be a '{open,close,token}' object or array");
    }
  }
  lexer.brackets = brackets;
  lexer.noThrow = true;
  return lexer;
}
export {
  compile
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9zdGFuZGFsb25lL2NvbW1vbi9tb25hcmNoL21vbmFyY2hDb21waWxlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuLypcbiAqIFRoaXMgbW9kdWxlIG9ubHkgZXhwb3J0cyAnY29tcGlsZScgd2hpY2ggY29tcGlsZXMgYSBKU09OIGxhbmd1YWdlIGRlZmluaXRpb25cbiAqIGludG8gYSB0eXBlZCBhbmQgY2hlY2tlZCBJTGV4ZXIgZGVmaW5pdGlvbi5cbiAqL1xuXG5pbXBvcnQgeyBpc1N0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCAqIGFzIG1vbmFyY2hDb21tb24gZnJvbSAnLi9tb25hcmNoQ29tbW9uLmpzJztcbmltcG9ydCB7IElNb25hcmNoTGFuZ3VhZ2UsIElNb25hcmNoTGFuZ3VhZ2VCcmFja2V0IH0gZnJvbSAnLi9tb25hcmNoVHlwZXMuanMnO1xuXG4vKlxuICogVHlwZSBoZWxwZXJzXG4gKlxuICogTm90ZTogdGhpcyBpcyBqdXN0IGZvciBzYW5pdHkgY2hlY2tzIG9uIHRoZSBKU09OIGRlc2NyaXB0aW9uIHdoaWNoIGlzXG4gKiBoZWxwZnVsIGZvciB0aGUgcHJvZ3JhbW1lci4gTm8gY2hlY2tzIGFyZSBkb25lIGFueW1vcmUgb25jZSB0aGUgbGV4ZXIgaXNcbiAqIGFscmVhZHkgJ2NvbXBpbGVkIGFuZCBjaGVja2VkJy5cbiAqXG4gKi9cblxuZnVuY3Rpb24gaXNBcnJheU9mKGVsZW1UeXBlOiAoeDogYW55KSA9PiBib29sZWFuLCBvYmo6IGFueSk6IGJvb2xlYW4ge1xuXHRpZiAoIW9iaikge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRpZiAoIShBcnJheS5pc0FycmF5KG9iaikpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGZvciAoY29uc3QgZWwgb2Ygb2JqKSB7XG5cdFx0aWYgKCEoZWxlbVR5cGUoZWwpKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gYm9vbChwcm9wOiBhbnksIGRlZlZhbHVlOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdGlmICh0eXBlb2YgcHJvcCA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0cmV0dXJuIHByb3A7XG5cdH1cblx0cmV0dXJuIGRlZlZhbHVlO1xufVxuXG5mdW5jdGlvbiBzdHJpbmcocHJvcDogYW55LCBkZWZWYWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcblx0aWYgKHR5cGVvZiAocHJvcCkgPT09ICdzdHJpbmcnKSB7XG5cdFx0cmV0dXJuIHByb3A7XG5cdH1cblx0cmV0dXJuIGRlZlZhbHVlO1xufVxuXG5cbmZ1bmN0aW9uIGFycmF5VG9IYXNoKGFycmF5OiBzdHJpbmdbXSk6IHsgW25hbWU6IHN0cmluZ106IHRydWUgfSB7XG5cdGNvbnN0IHJlc3VsdDogYW55ID0ge307XG5cdGZvciAoY29uc3QgZSBvZiBhcnJheSkge1xuXHRcdHJlc3VsdFtlXSA9IHRydWU7XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuXG5mdW5jdGlvbiBjcmVhdGVLZXl3b3JkTWF0Y2hlcihhcnI6IHN0cmluZ1tdLCBjYXNlSW5zZW5zaXRpdmU6IGJvb2xlYW4gPSBmYWxzZSk6IChzdHI6IHN0cmluZykgPT4gYm9vbGVhbiB7XG5cdGlmIChjYXNlSW5zZW5zaXRpdmUpIHtcblx0XHRhcnIgPSBhcnIubWFwKGZ1bmN0aW9uICh4KSB7IHJldHVybiB4LnRvTG93ZXJDYXNlKCk7IH0pO1xuXHR9XG5cdGNvbnN0IGhhc2ggPSBhcnJheVRvSGFzaChhcnIpO1xuXHRpZiAoY2FzZUluc2Vuc2l0aXZlKSB7XG5cdFx0cmV0dXJuIGZ1bmN0aW9uICh3b3JkKSB7XG5cdFx0XHRyZXR1cm4gaGFzaFt3b3JkLnRvTG93ZXJDYXNlKCldICE9PSB1bmRlZmluZWQgJiYgaGFzaC5oYXNPd25Qcm9wZXJ0eSh3b3JkLnRvTG93ZXJDYXNlKCkpO1xuXHRcdH07XG5cdH0gZWxzZSB7XG5cdFx0cmV0dXJuIGZ1bmN0aW9uICh3b3JkKSB7XG5cdFx0XHRyZXR1cm4gaGFzaFt3b3JkXSAhPT0gdW5kZWZpbmVkICYmIGhhc2guaGFzT3duUHJvcGVydHkod29yZCk7XG5cdFx0fTtcblx0fVxufVxuXG5cbi8vIExleGVyIGhlbHBlcnNcblxuLyoqXG4gKiBDb21waWxlcyBhIHJlZ3VsYXIgZXhwcmVzc2lvbiBzdHJpbmcsIGFkZGluZyB0aGUgJ2knIGZsYWcgaWYgJ2lnbm9yZUNhc2UnIGlzIHNldCwgYW5kIHRoZSAndScgZmxhZyBpZiAndW5pY29kZScgaXMgc2V0LlxuICogQWxzbyByZXBsYWNlcyBAXFx3KyBvciBzZXF1ZW5jZXMgd2l0aCB0aGUgY29udGVudCBvZiB0aGUgc3BlY2lmaWVkIGF0dHJpYnV0ZVxuICogQFxcdysgcmVwbGFjZW1lbnQgY2FuIGJlIGF2b2lkZWQgYnkgZXNjYXBpbmcgYEBgIHNpZ25zIHdpdGggYW5vdGhlciBgQGAgc2lnbi5cbiAqIEBleGFtcGxlIC9AYXR0ci8gd2lsbCBiZSByZXBsYWNlZCB3aXRoIHRoZSB2YWx1ZSBvZiBsZXhlclthdHRyXVxuICogQGV4YW1wbGUgL0BAdGV4dC8gd2lsbCBub3QgYmUgcmVwbGFjZWQgYW5kIHdpbGwgYmVjb21lIC9AdGV4dC8uXG4gKi9cbmZ1bmN0aW9uIGNvbXBpbGVSZWdFeHA8UyBleHRlbmRzIHRydWUgfCBmYWxzZT4obGV4ZXI6IG1vbmFyY2hDb21tb24uSUxleGVyTWluLCBzdHI6IHN0cmluZywgaGFuZGxlU246IFMpOiBTIGV4dGVuZHMgdHJ1ZSA/IFJlZ0V4cCB8IER5bmFtaWNSZWdFeHAgOiBSZWdFeHA7XG5mdW5jdGlvbiBjb21waWxlUmVnRXhwKGxleGVyOiBtb25hcmNoQ29tbW9uLklMZXhlck1pbiwgc3RyOiBzdHJpbmcsIGhhbmRsZVNuOiB0cnVlIHwgZmFsc2UpOiBSZWdFeHAgfCBEeW5hbWljUmVnRXhwIHtcblx0Ly8gQEAgbXVzdCBiZSBpbnRlcnByZXRlZCBhcyBhIGxpdGVyYWwgQCwgc28gd2UgcmVwbGFjZSBhbGwgb2NjdXJlbmNlcyBvZiBAQCB3aXRoIGEgcGxhY2Vob2xkZXIgY2hhcmFjdGVyXG5cdHN0ciA9IHN0ci5yZXBsYWNlKC9AQC9nLCBgXFx4MDFgKTtcblxuXHRsZXQgbiA9IDA7XG5cdGxldCBoYWRFeHBhbnNpb246IGJvb2xlYW47XG5cdGRvIHtcblx0XHRoYWRFeHBhbnNpb24gPSBmYWxzZTtcblx0XHRzdHIgPSBzdHIucmVwbGFjZSgvQChcXHcrKS9nLCBmdW5jdGlvbiAocywgYXR0cj8pIHtcblx0XHRcdGhhZEV4cGFuc2lvbiA9IHRydWU7XG5cdFx0XHRsZXQgc3ViID0gJyc7XG5cdFx0XHRpZiAodHlwZW9mIChsZXhlclthdHRyXSkgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdHN1YiA9IGxleGVyW2F0dHJdO1xuXHRcdFx0fSBlbHNlIGlmIChsZXhlclthdHRyXSAmJiBsZXhlclthdHRyXSBpbnN0YW5jZW9mIFJlZ0V4cCkge1xuXHRcdFx0XHRzdWIgPSBsZXhlclthdHRyXS5zb3VyY2U7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAobGV4ZXJbYXR0cl0gPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHRocm93IG1vbmFyY2hDb21tb24uY3JlYXRlRXJyb3IobGV4ZXIsICdsYW5ndWFnZSBkZWZpbml0aW9uIGRvZXMgbm90IGNvbnRhaW4gYXR0cmlidXRlIFxcJycgKyBhdHRyICsgJ1xcJywgdXNlZCBhdDogJyArIHN0cik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhyb3cgbW9uYXJjaENvbW1vbi5jcmVhdGVFcnJvcihsZXhlciwgJ2F0dHJpYnV0ZSByZWZlcmVuY2UgXFwnJyArIGF0dHIgKyAnXFwnIG11c3QgYmUgYSBzdHJpbmcsIHVzZWQgYXQ6ICcgKyBzdHIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gKG1vbmFyY2hDb21tb24uZW1wdHkoc3ViKSA/ICcnIDogJyg/OicgKyBzdWIgKyAnKScpO1xuXHRcdH0pO1xuXHRcdG4rKztcblx0fSB3aGlsZSAoaGFkRXhwYW5zaW9uICYmIG4gPCA1KTtcblxuXHQvLyBoYW5kbGUgZXNjYXBlZCBAQFxuXHRzdHIgPSBzdHIucmVwbGFjZSgvXFx4MDEvZywgJ0AnKTtcblxuXHRjb25zdCBmbGFncyA9IChsZXhlci5pZ25vcmVDYXNlID8gJ2knIDogJycpICsgKGxleGVyLnVuaWNvZGUgPyAndScgOiAnJyk7XG5cblx0Ly8gaGFuZGxlICRTblxuXHRpZiAoaGFuZGxlU24pIHtcblx0XHRjb25zdCBtYXRjaCA9IHN0ci5tYXRjaCgvXFwkW3NTXShcXGRcXGQ/KS9nKTtcblx0XHRpZiAobWF0Y2gpIHtcblx0XHRcdGxldCBsYXN0U3RhdGU6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXHRcdFx0bGV0IGxhc3RSZWdFeDogUmVnRXhwIHwgbnVsbCA9IG51bGw7XG5cdFx0XHRyZXR1cm4gKHN0YXRlOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0aWYgKGxhc3RSZWdFeCAmJiBsYXN0U3RhdGUgPT09IHN0YXRlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGxhc3RSZWdFeDtcblx0XHRcdFx0fVxuXHRcdFx0XHRsYXN0U3RhdGUgPSBzdGF0ZTtcblx0XHRcdFx0bGFzdFJlZ0V4ID0gbmV3IFJlZ0V4cChtb25hcmNoQ29tbW9uLnN1YnN0aXR1dGVNYXRjaGVzUmUobGV4ZXIsIHN0ciwgc3RhdGUpLCBmbGFncyk7XG5cdFx0XHRcdHJldHVybiBsYXN0UmVnRXg7XG5cdFx0XHR9O1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBuZXcgUmVnRXhwKHN0ciwgZmxhZ3MpO1xufVxuXG4vKipcbiAqIENvbXBpbGVzIGd1YXJkIGZ1bmN0aW9ucyBmb3IgY2FzZSBtYXRjaGVzLlxuICogVGhpcyBjb21waWxlcyAnY2FzZXMnIGF0dHJpYnV0ZXMgaW50byBlZmZpY2llbnQgbWF0Y2ggZnVuY3Rpb25zLlxuICpcbiAqL1xuZnVuY3Rpb24gc2VsZWN0U2NydXRpbmVlKGlkOiBzdHJpbmcsIG1hdGNoZXM6IHN0cmluZ1tdLCBzdGF0ZTogc3RyaW5nLCBudW06IG51bWJlcik6IHN0cmluZyB8IG51bGwge1xuXHRpZiAobnVtIDwgMCkge1xuXHRcdHJldHVybiBpZDtcblx0fVxuXHRpZiAobnVtIDwgbWF0Y2hlcy5sZW5ndGgpIHtcblx0XHRyZXR1cm4gbWF0Y2hlc1tudW1dO1xuXHR9XG5cdGlmIChudW0gPj0gMTAwKSB7XG5cdFx0bnVtID0gbnVtIC0gMTAwO1xuXHRcdGNvbnN0IHBhcnRzID0gc3RhdGUuc3BsaXQoJy4nKTtcblx0XHRwYXJ0cy51bnNoaWZ0KHN0YXRlKTtcblx0XHRpZiAobnVtIDwgcGFydHMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gcGFydHNbbnVtXTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUd1YXJkKGxleGVyOiBtb25hcmNoQ29tbW9uLklMZXhlck1pbiwgcnVsZU5hbWU6IHN0cmluZywgdGtleTogc3RyaW5nLCB2YWw6IG1vbmFyY2hDb21tb24uRnV6enlBY3Rpb24pOiBtb25hcmNoQ29tbW9uLklCcmFuY2gge1xuXHQvLyBnZXQgdGhlIHNjcnV0aW5lZSBhbmQgcGF0dGVyblxuXHRsZXQgc2NydXQgPSAtMTsgLy8gLTE6ICQhLCAwLTk5OiAkbiwgMTAwK246ICRTblxuXHRsZXQgb3BwYXQgPSB0a2V5O1xuXHRsZXQgbWF0Y2hlcyA9IHRrZXkubWF0Y2goL15cXCQoKFtzU10/KShcXGRcXGQ/KXwjKSguKikkLyk7XG5cdGlmIChtYXRjaGVzKSB7XG5cdFx0aWYgKG1hdGNoZXNbM10pIHsgLy8gaWYgZGlnaXRzXG5cdFx0XHRzY3J1dCA9IHBhcnNlSW50KG1hdGNoZXNbM10pO1xuXHRcdFx0aWYgKG1hdGNoZXNbMl0pIHtcblx0XHRcdFx0c2NydXQgPSBzY3J1dCArIDEwMDsgLy8gaWYgW3NTXSBwcmVzZW50XG5cdFx0XHR9XG5cdFx0fVxuXHRcdG9wcGF0ID0gbWF0Y2hlc1s0XTtcblx0fVxuXHQvLyBnZXQgb3BlcmF0b3Jcblx0bGV0IG9wID0gJ34nO1xuXHRsZXQgcGF0ID0gb3BwYXQ7XG5cdGlmICghb3BwYXQgfHwgb3BwYXQubGVuZ3RoID09PSAwKSB7XG5cdFx0b3AgPSAnIT0nO1xuXHRcdHBhdCA9ICcnO1xuXHR9XG5cdGVsc2UgaWYgKC9eXFx3KiQvLnRlc3QocGF0KSkgeyAgLy8ganVzdCBhIHdvcmRcblx0XHRvcCA9ICc9PSc7XG5cdH1cblx0ZWxzZSB7XG5cdFx0bWF0Y2hlcyA9IG9wcGF0Lm1hdGNoKC9eKEB8IUB8fnwhfnw9PXwhPSkoLiopJC8pO1xuXHRcdGlmIChtYXRjaGVzKSB7XG5cdFx0XHRvcCA9IG1hdGNoZXNbMV07XG5cdFx0XHRwYXQgPSBtYXRjaGVzWzJdO1xuXHRcdH1cblx0fVxuXG5cdC8vIHNldCB0aGUgdGVzdGVyIGZ1bmN0aW9uXG5cdGxldCB0ZXN0ZXI6IChzOiBzdHJpbmcsIGlkOiBzdHJpbmcsIG1hdGNoZXM6IHN0cmluZ1tdLCBzdGF0ZTogc3RyaW5nLCBlb3M6IGJvb2xlYW4pID0+IGJvb2xlYW47XG5cblx0Ly8gc3BlY2lhbCBjYXNlIGEgcmVnZXhwIHRoYXQgbWF0Y2hlcyBqdXN0IHdvcmRzXG5cdGlmICgob3AgPT09ICd+JyB8fCBvcCA9PT0gJyF+JykgJiYgL14oXFx3fFxcfCkqJC8udGVzdChwYXQpKSB7XG5cdFx0Y29uc3QgaW5Xb3JkcyA9IGNyZWF0ZUtleXdvcmRNYXRjaGVyKHBhdC5zcGxpdCgnfCcpLCBsZXhlci5pZ25vcmVDYXNlKTtcblx0XHR0ZXN0ZXIgPSBmdW5jdGlvbiAocykgeyByZXR1cm4gKG9wID09PSAnficgPyBpbldvcmRzKHMpIDogIWluV29yZHMocykpOyB9O1xuXHR9XG5cdGVsc2UgaWYgKG9wID09PSAnQCcgfHwgb3AgPT09ICchQCcpIHtcblx0XHRjb25zdCB3b3JkcyA9IGxleGVyW3BhdF07XG5cdFx0aWYgKCF3b3Jkcykge1xuXHRcdFx0dGhyb3cgbW9uYXJjaENvbW1vbi5jcmVhdGVFcnJvcihsZXhlciwgJ3RoZSBAIG1hdGNoIHRhcmdldCBcXCcnICsgcGF0ICsgJ1xcJyBpcyBub3QgZGVmaW5lZCwgaW4gcnVsZTogJyArIHJ1bGVOYW1lKTtcblx0XHR9XG5cdFx0aWYgKCEoaXNBcnJheU9mKGZ1bmN0aW9uIChlbGVtKSB7IHJldHVybiAodHlwZW9mIChlbGVtKSA9PT0gJ3N0cmluZycpOyB9LCB3b3JkcykpKSB7XG5cdFx0XHR0aHJvdyBtb25hcmNoQ29tbW9uLmNyZWF0ZUVycm9yKGxleGVyLCAndGhlIEAgbWF0Y2ggdGFyZ2V0IFxcJycgKyBwYXQgKyAnXFwnIG11c3QgYmUgYW4gYXJyYXkgb2Ygc3RyaW5ncywgaW4gcnVsZTogJyArIHJ1bGVOYW1lKTtcblx0XHR9XG5cdFx0Y29uc3QgaW5Xb3JkcyA9IGNyZWF0ZUtleXdvcmRNYXRjaGVyKHdvcmRzLCBsZXhlci5pZ25vcmVDYXNlKTtcblx0XHR0ZXN0ZXIgPSBmdW5jdGlvbiAocykgeyByZXR1cm4gKG9wID09PSAnQCcgPyBpbldvcmRzKHMpIDogIWluV29yZHMocykpOyB9O1xuXHR9XG5cdGVsc2UgaWYgKG9wID09PSAnficgfHwgb3AgPT09ICchficpIHtcblx0XHRpZiAocGF0LmluZGV4T2YoJyQnKSA8IDApIHtcblx0XHRcdC8vIHByZWNvbXBpbGUgcmVndWxhciBleHByZXNzaW9uXG5cdFx0XHRjb25zdCByZSA9IGNvbXBpbGVSZWdFeHAobGV4ZXIsICdeJyArIHBhdCArICckJywgZmFsc2UpO1xuXHRcdFx0dGVzdGVyID0gZnVuY3Rpb24gKHMpIHsgcmV0dXJuIChvcCA9PT0gJ34nID8gcmUudGVzdChzKSA6ICFyZS50ZXN0KHMpKTsgfTtcblx0XHR9XG5cdFx0ZWxzZSB7XG5cdFx0XHR0ZXN0ZXIgPSBmdW5jdGlvbiAocywgaWQsIG1hdGNoZXMsIHN0YXRlKSB7XG5cdFx0XHRcdGNvbnN0IHJlID0gY29tcGlsZVJlZ0V4cChsZXhlciwgJ14nICsgbW9uYXJjaENvbW1vbi5zdWJzdGl0dXRlTWF0Y2hlcyhsZXhlciwgcGF0LCBpZCwgbWF0Y2hlcywgc3RhdGUpICsgJyQnLCBmYWxzZSk7XG5cdFx0XHRcdHJldHVybiByZS50ZXN0KHMpO1xuXHRcdFx0fTtcblx0XHR9XG5cdH1cblx0ZWxzZSB7IC8vIGlmIChvcD09PSc9PScgfHwgb3A9PT0nIT0nKSB7XG5cdFx0aWYgKHBhdC5pbmRleE9mKCckJykgPCAwKSB7XG5cdFx0XHRjb25zdCBwYXR4ID0gbW9uYXJjaENvbW1vbi5maXhDYXNlKGxleGVyLCBwYXQpO1xuXHRcdFx0dGVzdGVyID0gZnVuY3Rpb24gKHMpIHsgcmV0dXJuIChvcCA9PT0gJz09JyA/IHMgPT09IHBhdHggOiBzICE9PSBwYXR4KTsgfTtcblx0XHR9XG5cdFx0ZWxzZSB7XG5cdFx0XHRjb25zdCBwYXR4ID0gbW9uYXJjaENvbW1vbi5maXhDYXNlKGxleGVyLCBwYXQpO1xuXHRcdFx0dGVzdGVyID0gZnVuY3Rpb24gKHMsIGlkLCBtYXRjaGVzLCBzdGF0ZSwgZW9zKSB7XG5cdFx0XHRcdGNvbnN0IHBhdGV4cCA9IG1vbmFyY2hDb21tb24uc3Vic3RpdHV0ZU1hdGNoZXMobGV4ZXIsIHBhdHgsIGlkLCBtYXRjaGVzLCBzdGF0ZSk7XG5cdFx0XHRcdHJldHVybiAob3AgPT09ICc9PScgPyBzID09PSBwYXRleHAgOiBzICE9PSBwYXRleHApO1xuXHRcdFx0fTtcblx0XHR9XG5cdH1cblxuXHQvLyByZXR1cm4gdGhlIGJyYW5jaCBvYmplY3Rcblx0aWYgKHNjcnV0ID09PSAtMSkge1xuXHRcdHJldHVybiB7XG5cdFx0XHRuYW1lOiB0a2V5LCB2YWx1ZTogdmFsLCB0ZXN0OiBmdW5jdGlvbiAoaWQsIG1hdGNoZXMsIHN0YXRlLCBlb3MpIHtcblx0XHRcdFx0cmV0dXJuIHRlc3RlcihpZCwgaWQsIG1hdGNoZXMsIHN0YXRlLCBlb3MpO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblx0ZWxzZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG5hbWU6IHRrZXksIHZhbHVlOiB2YWwsIHRlc3Q6IGZ1bmN0aW9uIChpZCwgbWF0Y2hlcywgc3RhdGUsIGVvcykge1xuXHRcdFx0XHRjb25zdCBzY3J1dGluZWUgPSBzZWxlY3RTY3J1dGluZWUoaWQsIG1hdGNoZXMsIHN0YXRlLCBzY3J1dCk7XG5cdFx0XHRcdHJldHVybiB0ZXN0ZXIoIXNjcnV0aW5lZSA/ICcnIDogc2NydXRpbmVlLCBpZCwgbWF0Y2hlcywgc3RhdGUsIGVvcyk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxufVxuXG4vKipcbiAqIENvbXBpbGVzIGFuIGFjdGlvbjogaS5lLiBvcHRpbWl6ZSByZWd1bGFyIGV4cHJlc3Npb25zIGFuZCBjYXNlIG1hdGNoZXNcbiAqIGFuZCBkbyBtYW55IHNhbml0eSBjaGVja3MuXG4gKlxuICogVGhpcyBpcyBjYWxsZWQgb25seSBkdXJpbmcgY29tcGlsYXRpb24gYnV0IGlmIHRoZSBsZXhlciBkZWZpbml0aW9uXG4gKiBjb250YWlucyB1c2VyIGZ1bmN0aW9ucyBhcyBhY3Rpb25zICh3aGljaCBpcyB1c3VhbGx5IG5vdCBhbGxvd2VkKSwgdGhlbiB0aGlzXG4gKiBtYXkgYmUgY2FsbGVkIGR1cmluZyBsZXhpbmcuIEl0IGlzIGltcG9ydGFudCB0aGVyZWZvcmUgdG8gY29tcGlsZSBjb21tb24gY2FzZXMgZWZmaWNpZW50bHlcbiAqL1xuZnVuY3Rpb24gY29tcGlsZUFjdGlvbihsZXhlcjogbW9uYXJjaENvbW1vbi5JTGV4ZXJNaW4sIHJ1bGVOYW1lOiBzdHJpbmcsIGFjdGlvbjogYW55KTogbW9uYXJjaENvbW1vbi5GdXp6eUFjdGlvbiB7XG5cdGlmICghYWN0aW9uKSB7XG5cdFx0cmV0dXJuIHsgdG9rZW46ICcnIH07XG5cdH1cblx0ZWxzZSBpZiAodHlwZW9mIChhY3Rpb24pID09PSAnc3RyaW5nJykge1xuXHRcdHJldHVybiBhY3Rpb247IC8vIHsgdG9rZW46IGFjdGlvbiB9O1xuXHR9XG5cdGVsc2UgaWYgKGFjdGlvbi50b2tlbiB8fCBhY3Rpb24udG9rZW4gPT09ICcnKSB7XG5cdFx0aWYgKHR5cGVvZiAoYWN0aW9uLnRva2VuKSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHRocm93IG1vbmFyY2hDb21tb24uY3JlYXRlRXJyb3IobGV4ZXIsICdhIFxcJ3Rva2VuXFwnIGF0dHJpYnV0ZSBtdXN0IGJlIG9mIHR5cGUgc3RyaW5nLCBpbiBydWxlOiAnICsgcnVsZU5hbWUpO1xuXHRcdH1cblx0XHRlbHNlIHtcblx0XHRcdC8vIG9ubHkgY29weSBzcGVjaWZpYyB0eXBlZCBmaWVsZHMgKG9ubHkgaGFwcGVucyBvbmNlIGR1cmluZyBjb21waWxlIExleGVyKVxuXHRcdFx0Y29uc3QgbmV3QWN0aW9uOiBtb25hcmNoQ29tbW9uLklBY3Rpb24gPSB7IHRva2VuOiBhY3Rpb24udG9rZW4gfTtcblx0XHRcdGlmIChhY3Rpb24udG9rZW4uaW5kZXhPZignJCcpID49IDApIHtcblx0XHRcdFx0bmV3QWN0aW9uLnRva2VuU3Vic3QgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHR5cGVvZiAoYWN0aW9uLmJyYWNrZXQpID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRpZiAoYWN0aW9uLmJyYWNrZXQgPT09ICdAb3BlbicpIHtcblx0XHRcdFx0XHRuZXdBY3Rpb24uYnJhY2tldCA9IG1vbmFyY2hDb21tb24uTW9uYXJjaEJyYWNrZXQuT3Blbjtcblx0XHRcdFx0fSBlbHNlIGlmIChhY3Rpb24uYnJhY2tldCA9PT0gJ0BjbG9zZScpIHtcblx0XHRcdFx0XHRuZXdBY3Rpb24uYnJhY2tldCA9IG1vbmFyY2hDb21tb24uTW9uYXJjaEJyYWNrZXQuQ2xvc2U7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhyb3cgbW9uYXJjaENvbW1vbi5jcmVhdGVFcnJvcihsZXhlciwgJ2EgXFwnYnJhY2tldFxcJyBhdHRyaWJ1dGUgbXVzdCBiZSBlaXRoZXIgXFwnQG9wZW5cXCcgb3IgXFwnQGNsb3NlXFwnLCBpbiBydWxlOiAnICsgcnVsZU5hbWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoYWN0aW9uLm5leHQpIHtcblx0XHRcdFx0aWYgKHR5cGVvZiAoYWN0aW9uLm5leHQpICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdHRocm93IG1vbmFyY2hDb21tb24uY3JlYXRlRXJyb3IobGV4ZXIsICd0aGUgbmV4dCBzdGF0ZSBtdXN0IGJlIGEgc3RyaW5nIHZhbHVlIGluIHJ1bGU6ICcgKyBydWxlTmFtZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0bGV0IG5leHQ6IHN0cmluZyA9IGFjdGlvbi5uZXh0O1xuXHRcdFx0XHRcdGlmICghL14oQHBvcHxAcHVzaHxAcG9wYWxsKSQvLnRlc3QobmV4dCkpIHtcblx0XHRcdFx0XHRcdGlmIChuZXh0WzBdID09PSAnQCcpIHtcblx0XHRcdFx0XHRcdFx0bmV4dCA9IG5leHQuc3Vic3RyKDEpOyAvLyBwZWVsIG9mZiBzdGFydGluZyBAIHNpZ25cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChuZXh0LmluZGV4T2YoJyQnKSA8IDApIHsgIC8vIG5vIGRvbGxhciBzdWJzdGl0dXRpb24sIHdlIGNhbiBjaGVjayBpZiB0aGUgc3RhdGUgZXhpc3RzXG5cdFx0XHRcdFx0XHRcdGlmICghbW9uYXJjaENvbW1vbi5zdGF0ZUV4aXN0cyhsZXhlciwgbW9uYXJjaENvbW1vbi5zdWJzdGl0dXRlTWF0Y2hlcyhsZXhlciwgbmV4dCwgJycsIFtdLCAnJykpKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhyb3cgbW9uYXJjaENvbW1vbi5jcmVhdGVFcnJvcihsZXhlciwgJ3RoZSBuZXh0IHN0YXRlIFxcJycgKyBhY3Rpb24ubmV4dCArICdcXCcgaXMgbm90IGRlZmluZWQgaW4gcnVsZTogJyArIHJ1bGVOYW1lKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRuZXdBY3Rpb24ubmV4dCA9IG5leHQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmICh0eXBlb2YgKGFjdGlvbi5nb0JhY2spID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRuZXdBY3Rpb24uZ29CYWNrID0gYWN0aW9uLmdvQmFjaztcblx0XHRcdH1cblx0XHRcdGlmICh0eXBlb2YgKGFjdGlvbi5zd2l0Y2hUbykgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdG5ld0FjdGlvbi5zd2l0Y2hUbyA9IGFjdGlvbi5zd2l0Y2hUbztcblx0XHRcdH1cblx0XHRcdGlmICh0eXBlb2YgKGFjdGlvbi5sb2cpID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRuZXdBY3Rpb24ubG9nID0gYWN0aW9uLmxvZztcblx0XHRcdH1cblx0XHRcdGlmICh0eXBlb2YgKGFjdGlvbi5uZXh0RW1iZWRkZWQpID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRuZXdBY3Rpb24ubmV4dEVtYmVkZGVkID0gYWN0aW9uLm5leHRFbWJlZGRlZDtcblx0XHRcdFx0bGV4ZXIudXNlc0VtYmVkZGVkID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBuZXdBY3Rpb247XG5cdFx0fVxuXHR9XG5cdGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoYWN0aW9uKSkge1xuXHRcdGNvbnN0IHJlc3VsdHM6IG1vbmFyY2hDb21tb24uRnV6enlBY3Rpb25bXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBhY3Rpb24ubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdHJlc3VsdHNbaV0gPSBjb21waWxlQWN0aW9uKGxleGVyLCBydWxlTmFtZSwgYWN0aW9uW2ldKTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgZ3JvdXA6IHJlc3VsdHMgfTtcblx0fVxuXHRlbHNlIGlmIChhY3Rpb24uY2FzZXMpIHtcblx0XHQvLyBidWlsZCBhbiBhcnJheSBvZiB0ZXN0IGNhc2VzXG5cdFx0Y29uc3QgY2FzZXM6IG1vbmFyY2hDb21tb24uSUJyYW5jaFtdID0gW107XG5cblx0XHRsZXQgaGFzRW1iZWRkZWRFbmRJbkNhc2VzID0gZmFsc2U7XG5cdFx0Ly8gZm9yIGVhY2ggY2FzZSwgcHVzaCBhIHRlc3QgZnVuY3Rpb24gYW5kIHJlc3VsdCB2YWx1ZVxuXHRcdGZvciAoY29uc3QgdGtleSBpbiBhY3Rpb24uY2FzZXMpIHtcblx0XHRcdGlmIChhY3Rpb24uY2FzZXMuaGFzT3duUHJvcGVydHkodGtleSkpIHtcblx0XHRcdFx0Y29uc3QgdmFsID0gY29tcGlsZUFjdGlvbihsZXhlciwgcnVsZU5hbWUsIGFjdGlvbi5jYXNlc1t0a2V5XSk7XG5cblx0XHRcdFx0Ly8gd2hhdCBraW5kIG9mIGNhc2Vcblx0XHRcdFx0aWYgKHRrZXkgPT09ICdAZGVmYXVsdCcgfHwgdGtleSA9PT0gJ0AnIHx8IHRrZXkgPT09ICcnKSB7XG5cdFx0XHRcdFx0Y2FzZXMucHVzaCh7IHRlc3Q6IHVuZGVmaW5lZCwgdmFsdWU6IHZhbCwgbmFtZTogdGtleSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRlbHNlIGlmICh0a2V5ID09PSAnQGVvcycpIHtcblx0XHRcdFx0XHRjYXNlcy5wdXNoKHsgdGVzdDogZnVuY3Rpb24gKGlkLCBtYXRjaGVzLCBzdGF0ZSwgZW9zKSB7IHJldHVybiBlb3M7IH0sIHZhbHVlOiB2YWwsIG5hbWU6IHRrZXkgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0Y2FzZXMucHVzaChjcmVhdGVHdWFyZChsZXhlciwgcnVsZU5hbWUsIHRrZXksIHZhbCkpOyAgLy8gY2FsbCBzZXBhcmF0ZSBmdW5jdGlvbiB0byBhdm9pZCBsb2NhbCB2YXJpYWJsZSBjYXB0dXJlXG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIWhhc0VtYmVkZGVkRW5kSW5DYXNlcykge1xuXHRcdFx0XHRcdGhhc0VtYmVkZGVkRW5kSW5DYXNlcyA9ICFpc1N0cmluZyh2YWwpICYmICh2YWwuaGFzRW1iZWRkZWRFbmRJbkNhc2VzIHx8IFsnQHBvcCcsICdAcG9wYWxsJ10uaW5jbHVkZXModmFsLm5leHRFbWJlZGRlZCB8fCAnJykpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gY3JlYXRlIGEgbWF0Y2hpbmcgZnVuY3Rpb25cblx0XHRjb25zdCBkZWYgPSBsZXhlci5kZWZhdWx0VG9rZW47XG5cdFx0cmV0dXJuIHtcblx0XHRcdGhhc0VtYmVkZGVkRW5kSW5DYXNlcyxcblx0XHRcdHRlc3Q6IGZ1bmN0aW9uIChpZCwgbWF0Y2hlcywgc3RhdGUsIGVvcykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IF9jYXNlIG9mIGNhc2VzKSB7XG5cdFx0XHRcdFx0Y29uc3QgZGlkbWF0Y2ggPSAoIV9jYXNlLnRlc3QgfHwgX2Nhc2UudGVzdChpZCwgbWF0Y2hlcywgc3RhdGUsIGVvcykpO1xuXHRcdFx0XHRcdGlmIChkaWRtYXRjaCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIF9jYXNlLnZhbHVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZGVmO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblx0ZWxzZSB7XG5cdFx0dGhyb3cgbW9uYXJjaENvbW1vbi5jcmVhdGVFcnJvcihsZXhlciwgJ2FuIGFjdGlvbiBtdXN0IGJlIGEgc3RyaW5nLCBhbiBvYmplY3Qgd2l0aCBhIFxcJ3Rva2VuXFwnIG9yIFxcJ2Nhc2VzXFwnIGF0dHJpYnV0ZSwgb3IgYW4gYXJyYXkgb2YgYWN0aW9uczsgaW4gcnVsZTogJyArIHJ1bGVOYW1lKTtcblx0fVxufVxuXG50eXBlIER5bmFtaWNSZWdFeHAgPSAoc3RhdGU6IHN0cmluZykgPT4gUmVnRXhwO1xuXG4vKipcbiAqIEhlbHBlciBjbGFzcyBmb3IgY3JlYXRpbmcgbWF0Y2hpbmcgcnVsZXNcbiAqL1xuY2xhc3MgUnVsZSBpbXBsZW1lbnRzIG1vbmFyY2hDb21tb24uSVJ1bGUge1xuXHRwcml2YXRlIHJlZ2V4OiBSZWdFeHAgfCBEeW5hbWljUmVnRXhwID0gbmV3IFJlZ0V4cCgnJyk7XG5cdHB1YmxpYyBhY3Rpb246IG1vbmFyY2hDb21tb24uRnV6enlBY3Rpb24gPSB7IHRva2VuOiAnJyB9O1xuXHRwdWJsaWMgbWF0Y2hPbmx5QXRMaW5lU3RhcnQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHVibGljIG5hbWU6IHN0cmluZyA9ICcnO1xuXG5cdGNvbnN0cnVjdG9yKG5hbWU6IHN0cmluZykge1xuXHRcdHRoaXMubmFtZSA9IG5hbWU7XG5cdH1cblxuXHRwdWJsaWMgc2V0UmVnZXgobGV4ZXI6IG1vbmFyY2hDb21tb24uSUxleGVyTWluLCByZTogc3RyaW5nIHwgUmVnRXhwKTogdm9pZCB7XG5cdFx0bGV0IHNyZWdleDogc3RyaW5nO1xuXHRcdGlmICh0eXBlb2YgKHJlKSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHNyZWdleCA9IHJlO1xuXHRcdH1cblx0XHRlbHNlIGlmIChyZSBpbnN0YW5jZW9mIFJlZ0V4cCkge1xuXHRcdFx0c3JlZ2V4ID0gcmUuc291cmNlO1xuXHRcdH1cblx0XHRlbHNlIHtcblx0XHRcdHRocm93IG1vbmFyY2hDb21tb24uY3JlYXRlRXJyb3IobGV4ZXIsICdydWxlcyBtdXN0IHN0YXJ0IHdpdGggYSBtYXRjaCBzdHJpbmcgb3IgcmVndWxhciBleHByZXNzaW9uOiAnICsgdGhpcy5uYW1lKTtcblx0XHR9XG5cblx0XHR0aGlzLm1hdGNoT25seUF0TGluZVN0YXJ0ID0gKHNyZWdleC5sZW5ndGggPiAwICYmIHNyZWdleFswXSA9PT0gJ14nKTtcblx0XHR0aGlzLm5hbWUgPSB0aGlzLm5hbWUgKyAnOiAnICsgc3JlZ2V4O1xuXHRcdHRoaXMucmVnZXggPSBjb21waWxlUmVnRXhwKGxleGVyLCAnXig/OicgKyAodGhpcy5tYXRjaE9ubHlBdExpbmVTdGFydCA/IHNyZWdleC5zdWJzdHIoMSkgOiBzcmVnZXgpICsgJyknLCB0cnVlKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRBY3Rpb24obGV4ZXI6IG1vbmFyY2hDb21tb24uSUxleGVyTWluLCBhY3Q6IG1vbmFyY2hDb21tb24uSUFjdGlvbikge1xuXHRcdHRoaXMuYWN0aW9uID0gY29tcGlsZUFjdGlvbihsZXhlciwgdGhpcy5uYW1lLCBhY3QpO1xuXHR9XG5cblx0cHVibGljIHJlc29sdmVSZWdleChzdGF0ZTogc3RyaW5nKTogUmVnRXhwIHtcblx0XHRpZiAodGhpcy5yZWdleCBpbnN0YW5jZW9mIFJlZ0V4cCkge1xuXHRcdFx0cmV0dXJuIHRoaXMucmVnZXg7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLnJlZ2V4KHN0YXRlKTtcblx0XHR9XG5cdH1cbn1cblxuLyoqXG4gKiBDb21waWxlcyBhIGpzb24gZGVzY3JpcHRpb24gZnVuY3Rpb24gaW50byBqc29uIHdoZXJlIGFsbCByZWd1bGFyIGV4cHJlc3Npb25zLFxuICogY2FzZSBtYXRjaGVzIGV0YywgYXJlIGNvbXBpbGVkIGFuZCBhbGwgaW5jbHVkZSBydWxlcyBhcmUgZXhwYW5kZWQuXG4gKiBXZSBhbHNvIGNvbXBpbGUgdGhlIGJyYWNrZXQgZGVmaW5pdGlvbnMsIHN1cHBseSBkZWZhdWx0cywgYW5kIGRvIG1hbnkgc2FuaXR5IGNoZWNrcy5cbiAqIElmIHRoZSAnanNvblN0cmljdCcgcGFyYW1ldGVyIGlzICdmYWxzZScsIHdlIGFsbG93IGF0IGNlcnRhaW4gbG9jYXRpb25zXG4gKiByZWd1bGFyIGV4cHJlc3Npb24gb2JqZWN0cyBhbmQgZnVuY3Rpb25zIHRoYXQgZ2V0IGNhbGxlZCBkdXJpbmcgbGV4aW5nLlxuICogKEN1cnJlbnRseSB3ZSBoYXZlIG5vIHNhbXBsZXMgdGhhdCBuZWVkIHRoaXMgc28gcGVyaGFwcyB3ZSBzaG91bGQgYWx3YXlzIGhhdmVcbiAqIGpzb25TdHJpY3QgdG8gdHJ1ZSkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjb21waWxlKGxhbmd1YWdlSWQ6IHN0cmluZywganNvbjogSU1vbmFyY2hMYW5ndWFnZSk6IG1vbmFyY2hDb21tb24uSUxleGVyIHtcblx0aWYgKCFqc29uIHx8IHR5cGVvZiAoanNvbikgIT09ICdvYmplY3QnKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNb25hcmNoOiBleHBlY3RpbmcgYSBsYW5ndWFnZSBkZWZpbml0aW9uIG9iamVjdCcpO1xuXHR9XG5cblx0Ly8gQ3JlYXRlIG91ciBsZXhlclxuXHRjb25zdCBsZXhlcjogbW9uYXJjaENvbW1vbi5JTGV4ZXIgPSB7XG5cdFx0bGFuZ3VhZ2VJZDogbGFuZ3VhZ2VJZCxcblx0XHRpbmNsdWRlTEY6IGJvb2woanNvbi5pbmNsdWRlTEYsIGZhbHNlKSxcblx0XHRub1Rocm93OiBmYWxzZSwgLy8gcmFpc2UgZXhjZXB0aW9ucyBkdXJpbmcgY29tcGlsYXRpb25cblx0XHRtYXhTdGFjazogMTAwLFxuXHRcdHN0YXJ0OiAodHlwZW9mIGpzb24uc3RhcnQgPT09ICdzdHJpbmcnID8ganNvbi5zdGFydCA6IG51bGwpLFxuXHRcdGlnbm9yZUNhc2U6IGJvb2woanNvbi5pZ25vcmVDYXNlLCBmYWxzZSksXG5cdFx0dW5pY29kZTogYm9vbChqc29uLnVuaWNvZGUsIGZhbHNlKSxcblx0XHR0b2tlblBvc3RmaXg6IHN0cmluZyhqc29uLnRva2VuUG9zdGZpeCwgJy4nICsgbGFuZ3VhZ2VJZCksXG5cdFx0ZGVmYXVsdFRva2VuOiBzdHJpbmcoanNvbi5kZWZhdWx0VG9rZW4sICdzb3VyY2UnKSxcblx0XHR1c2VzRW1iZWRkZWQ6IGZhbHNlLCAvLyBiZWNvbWVzIHRydWUgaWYgd2UgZmluZCBhIG5leHRFbWJlZGRlZCBhY3Rpb25cblx0XHRzdGF0ZU5hbWVzOiB7fSxcblx0XHR0b2tlbml6ZXI6IHt9LFxuXHRcdGJyYWNrZXRzOiBbXVxuXHR9O1xuXG5cdC8vIEZvciBjYWxsaW5nIGNvbXBpbGVBY3Rpb24gbGF0ZXIgb25cblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdGNvbnN0IGxleGVyTWluOiBtb25hcmNoQ29tbW9uLklMZXhlck1pbiA9IDxhbnk+anNvbjtcblx0bGV4ZXJNaW4ubGFuZ3VhZ2VJZCA9IGxhbmd1YWdlSWQ7XG5cdGxleGVyTWluLmluY2x1ZGVMRiA9IGxleGVyLmluY2x1ZGVMRjtcblx0bGV4ZXJNaW4uaWdub3JlQ2FzZSA9IGxleGVyLmlnbm9yZUNhc2U7XG5cdGxleGVyTWluLnVuaWNvZGUgPSBsZXhlci51bmljb2RlO1xuXHRsZXhlck1pbi5ub1Rocm93ID0gbGV4ZXIubm9UaHJvdztcblx0bGV4ZXJNaW4udXNlc0VtYmVkZGVkID0gbGV4ZXIudXNlc0VtYmVkZGVkO1xuXHRsZXhlck1pbi5zdGF0ZU5hbWVzID0ganNvbi50b2tlbml6ZXI7XG5cdGxleGVyTWluLmRlZmF1bHRUb2tlbiA9IGxleGVyLmRlZmF1bHRUb2tlbjtcblxuXG5cdC8vIENvbXBpbGUgYW4gYXJyYXkgb2YgcnVsZXMgaW50byBuZXdydWxlcyB3aGVyZSBSZWdFeHAgb2JqZWN0cyBhcmUgY3JlYXRlZC5cblx0ZnVuY3Rpb24gYWRkUnVsZXMoc3RhdGU6IHN0cmluZywgbmV3cnVsZXM6IG1vbmFyY2hDb21tb24uSVJ1bGVbXSwgcnVsZXM6IGFueVtdKSB7XG5cdFx0Zm9yIChjb25zdCBydWxlIG9mIHJ1bGVzKSB7XG5cblx0XHRcdGxldCBpbmNsdWRlID0gcnVsZS5pbmNsdWRlO1xuXHRcdFx0aWYgKGluY2x1ZGUpIHtcblx0XHRcdFx0aWYgKHR5cGVvZiAoaW5jbHVkZSkgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0dGhyb3cgbW9uYXJjaENvbW1vbi5jcmVhdGVFcnJvcihsZXhlciwgJ2FuIFxcJ2luY2x1ZGVcXCcgYXR0cmlidXRlIG11c3QgYmUgYSBzdHJpbmcgYXQ6ICcgKyBzdGF0ZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGluY2x1ZGVbMF0gPT09ICdAJykge1xuXHRcdFx0XHRcdGluY2x1ZGUgPSBpbmNsdWRlLnN1YnN0cigxKTsgLy8gcGVlbCBvZmYgc3RhcnRpbmcgQFxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghanNvbi50b2tlbml6ZXJbaW5jbHVkZV0pIHtcblx0XHRcdFx0XHR0aHJvdyBtb25hcmNoQ29tbW9uLmNyZWF0ZUVycm9yKGxleGVyLCAnaW5jbHVkZSB0YXJnZXQgXFwnJyArIGluY2x1ZGUgKyAnXFwnIGlzIG5vdCBkZWZpbmVkIGF0OiAnICsgc3RhdGUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFkZFJ1bGVzKHN0YXRlICsgJy4nICsgaW5jbHVkZSwgbmV3cnVsZXMsIGpzb24udG9rZW5pemVyW2luY2x1ZGVdKTtcblx0XHRcdH1cblx0XHRcdGVsc2Uge1xuXHRcdFx0XHRjb25zdCBuZXdydWxlID0gbmV3IFJ1bGUoc3RhdGUpO1xuXG5cdFx0XHRcdC8vIFNldCB1cCBuZXcgcnVsZSBhdHRyaWJ1dGVzXG5cdFx0XHRcdGlmIChBcnJheS5pc0FycmF5KHJ1bGUpICYmIHJ1bGUubGVuZ3RoID49IDEgJiYgcnVsZS5sZW5ndGggPD0gMykge1xuXHRcdFx0XHRcdG5ld3J1bGUuc2V0UmVnZXgobGV4ZXJNaW4sIHJ1bGVbMF0pO1xuXHRcdFx0XHRcdGlmIChydWxlLmxlbmd0aCA+PSAzKSB7XG5cdFx0XHRcdFx0XHRpZiAodHlwZW9mIChydWxlWzFdKSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdFx0bmV3cnVsZS5zZXRBY3Rpb24obGV4ZXJNaW4sIHsgdG9rZW46IHJ1bGVbMV0sIG5leHQ6IHJ1bGVbMl0gfSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRlbHNlIGlmICh0eXBlb2YgKHJ1bGVbMV0pID09PSAnb2JqZWN0Jykge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBydWxlMSA9IHJ1bGVbMV07XG5cdFx0XHRcdFx0XHRcdHJ1bGUxLm5leHQgPSBydWxlWzJdO1xuXHRcdFx0XHRcdFx0XHRuZXdydWxlLnNldEFjdGlvbihsZXhlck1pbiwgcnVsZTEpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHRocm93IG1vbmFyY2hDb21tb24uY3JlYXRlRXJyb3IobGV4ZXIsICdhIG5leHQgc3RhdGUgYXMgdGhlIGxhc3QgZWxlbWVudCBvZiBhIHJ1bGUgY2FuIG9ubHkgYmUgZ2l2ZW4gaWYgdGhlIGFjdGlvbiBpcyBlaXRoZXIgYW4gb2JqZWN0IG9yIGEgc3RyaW5nLCBhdDogJyArIHN0YXRlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0XHRuZXdydWxlLnNldEFjdGlvbihsZXhlck1pbiwgcnVsZVsxXSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdGlmICghcnVsZS5yZWdleCkge1xuXHRcdFx0XHRcdFx0dGhyb3cgbW9uYXJjaENvbW1vbi5jcmVhdGVFcnJvcihsZXhlciwgJ2EgcnVsZSBtdXN0IGVpdGhlciBiZSBhbiBhcnJheSwgb3IgYW4gb2JqZWN0IHdpdGggYSBcXCdyZWdleFxcJyBvciBcXCdpbmNsdWRlXFwnIGZpZWxkIGF0OiAnICsgc3RhdGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAocnVsZS5uYW1lKSB7XG5cdFx0XHRcdFx0XHRpZiAodHlwZW9mIHJ1bGUubmFtZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdFx0bmV3cnVsZS5uYW1lID0gcnVsZS5uYW1lO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAocnVsZS5tYXRjaE9ubHlBdFN0YXJ0KSB7XG5cdFx0XHRcdFx0XHRuZXdydWxlLm1hdGNoT25seUF0TGluZVN0YXJ0ID0gYm9vbChydWxlLm1hdGNoT25seUF0TGluZVN0YXJ0LCBmYWxzZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdG5ld3J1bGUuc2V0UmVnZXgobGV4ZXJNaW4sIHJ1bGUucmVnZXgpO1xuXHRcdFx0XHRcdG5ld3J1bGUuc2V0QWN0aW9uKGxleGVyTWluLCBydWxlLmFjdGlvbik7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRuZXdydWxlcy5wdXNoKG5ld3J1bGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8vIGNvbXBpbGUgdGhlIHRva2VuaXplciBydWxlc1xuXHRpZiAoIWpzb24udG9rZW5pemVyIHx8IHR5cGVvZiAoanNvbi50b2tlbml6ZXIpICE9PSAnb2JqZWN0Jykge1xuXHRcdHRocm93IG1vbmFyY2hDb21tb24uY3JlYXRlRXJyb3IobGV4ZXIsICdhIGxhbmd1YWdlIGRlZmluaXRpb24gbXVzdCBkZWZpbmUgdGhlIFxcJ3Rva2VuaXplclxcJyBhdHRyaWJ1dGUgYXMgYW4gb2JqZWN0Jyk7XG5cdH1cblxuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0bGV4ZXIudG9rZW5pemVyID0gPGFueT5bXTtcblx0Zm9yIChjb25zdCBrZXkgaW4ganNvbi50b2tlbml6ZXIpIHtcblx0XHRpZiAoanNvbi50b2tlbml6ZXIuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuXHRcdFx0aWYgKCFsZXhlci5zdGFydCkge1xuXHRcdFx0XHRsZXhlci5zdGFydCA9IGtleTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcnVsZXMgPSBqc29uLnRva2VuaXplcltrZXldO1xuXHRcdFx0bGV4ZXIudG9rZW5pemVyW2tleV0gPSBuZXcgQXJyYXkoKTtcblx0XHRcdGFkZFJ1bGVzKCd0b2tlbml6ZXIuJyArIGtleSwgbGV4ZXIudG9rZW5pemVyW2tleV0sIHJ1bGVzKTtcblx0XHR9XG5cdH1cblx0bGV4ZXIudXNlc0VtYmVkZGVkID0gbGV4ZXJNaW4udXNlc0VtYmVkZGVkOyAgLy8gY2FuIGJlIHNldCBkdXJpbmcgY29tcGlsZUFjdGlvblxuXG5cdC8vIFNldCBzaW1wbGUgYnJhY2tldHNcblx0aWYgKGpzb24uYnJhY2tldHMpIHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRpZiAoIShBcnJheS5pc0FycmF5KDxhbnk+anNvbi5icmFja2V0cykpKSB7XG5cdFx0XHR0aHJvdyBtb25hcmNoQ29tbW9uLmNyZWF0ZUVycm9yKGxleGVyLCAndGhlIFxcJ2JyYWNrZXRzXFwnIGF0dHJpYnV0ZSBtdXN0IGJlIGRlZmluZWQgYXMgYW4gYXJyYXknKTtcblx0XHR9XG5cdH1cblx0ZWxzZSB7XG5cdFx0anNvbi5icmFja2V0cyA9IFtcblx0XHRcdHsgb3BlbjogJ3snLCBjbG9zZTogJ30nLCB0b2tlbjogJ2RlbGltaXRlci5jdXJseScgfSxcblx0XHRcdHsgb3BlbjogJ1snLCBjbG9zZTogJ10nLCB0b2tlbjogJ2RlbGltaXRlci5zcXVhcmUnIH0sXG5cdFx0XHR7IG9wZW46ICcoJywgY2xvc2U6ICcpJywgdG9rZW46ICdkZWxpbWl0ZXIucGFyZW50aGVzaXMnIH0sXG5cdFx0XHR7IG9wZW46ICc8JywgY2xvc2U6ICc+JywgdG9rZW46ICdkZWxpbWl0ZXIuYW5nbGUnIH1dO1xuXHR9XG5cdGNvbnN0IGJyYWNrZXRzOiBJTW9uYXJjaExhbmd1YWdlQnJhY2tldFtdID0gW107XG5cdGZvciAoY29uc3QgZWwgb2YganNvbi5icmFja2V0cykge1xuXHRcdGxldCBkZXNjOiBhbnkgPSBlbDtcblx0XHRpZiAoZGVzYyAmJiBBcnJheS5pc0FycmF5KGRlc2MpICYmIGRlc2MubGVuZ3RoID09PSAzKSB7XG5cdFx0XHRkZXNjID0geyB0b2tlbjogZGVzY1syXSwgb3BlbjogZGVzY1swXSwgY2xvc2U6IGRlc2NbMV0gfTtcblx0XHR9XG5cdFx0aWYgKGRlc2Mub3BlbiA9PT0gZGVzYy5jbG9zZSkge1xuXHRcdFx0dGhyb3cgbW9uYXJjaENvbW1vbi5jcmVhdGVFcnJvcihsZXhlciwgJ29wZW4gYW5kIGNsb3NlIGJyYWNrZXRzIGluIGEgXFwnYnJhY2tldHNcXCcgYXR0cmlidXRlIG11c3QgYmUgZGlmZmVyZW50OiAnICsgZGVzYy5vcGVuICtcblx0XHRcdFx0J1xcbiBoaW50OiB1c2UgdGhlIFxcJ2JyYWNrZXRcXCcgYXR0cmlidXRlIGlmIG1hdGNoaW5nIG9uIGVxdWFsIGJyYWNrZXRzIGlzIHJlcXVpcmVkLicpO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIGRlc2Mub3BlbiA9PT0gJ3N0cmluZycgJiYgdHlwZW9mIGRlc2MudG9rZW4gPT09ICdzdHJpbmcnICYmIHR5cGVvZiBkZXNjLmNsb3NlID09PSAnc3RyaW5nJykge1xuXHRcdFx0YnJhY2tldHMucHVzaCh7XG5cdFx0XHRcdHRva2VuOiBkZXNjLnRva2VuICsgbGV4ZXIudG9rZW5Qb3N0Zml4LFxuXHRcdFx0XHRvcGVuOiBtb25hcmNoQ29tbW9uLmZpeENhc2UobGV4ZXIsIGRlc2Mub3BlbiksXG5cdFx0XHRcdGNsb3NlOiBtb25hcmNoQ29tbW9uLmZpeENhc2UobGV4ZXIsIGRlc2MuY2xvc2UpXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0ZWxzZSB7XG5cdFx0XHR0aHJvdyBtb25hcmNoQ29tbW9uLmNyZWF0ZUVycm9yKGxleGVyLCAnZXZlcnkgZWxlbWVudCBpbiB0aGUgXFwnYnJhY2tldHNcXCcgYXJyYXkgbXVzdCBiZSBhIFxcJ3tvcGVuLGNsb3NlLHRva2VufVxcJyBvYmplY3Qgb3IgYXJyYXknKTtcblx0XHR9XG5cdH1cblx0bGV4ZXIuYnJhY2tldHMgPSBicmFja2V0cztcblxuXHQvLyBEaXNhYmxlIHRocm93IHNvIHRoZSBzeW50YXggaGlnaGxpZ2h0ZXIgZ29lcywgbm8gbWF0dGVyIHdoYXRcblx0bGV4ZXIubm9UaHJvdyA9IHRydWU7XG5c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LEdBQUc7QUFDaEMsWUFBTSxVQUFVLEdBQUcsSUFBSSxJQUFJLE1BQU07QUFDakMsZUFBUyxlQUFlLEtBQUssTUFBTSxVQUFVLEdBQUcsR0FBRyxLQUFLO0FBQUEsSUFDekQ7QUFBQSxFQUNEO0FBQ0EsUUFBTSxlQUFlLFNBQVM7QUFHOUIsTUFBSSxLQUFLLFVBQVU7QUFFbEIsUUFBSSxDQUFFLE1BQU0sUUFBYSxLQUFLLFFBQVEsR0FBSTtBQUN6QyxZQUFNLGNBQWMsWUFBWSxPQUFPLHNEQUF3RDtBQUFBLElBQ2hHO0FBQUEsRUFDRCxPQUNLO0FBQ0osU0FBSyxXQUFXO0FBQUEsTUFDZixFQUFFLE1BQU0sS0FBSyxPQUFPLEtBQUssT0FBTyxrQkFBa0I7QUFBQSxNQUNsRCxFQUFFLE1BQU0sS0FBSyxPQUFPLEtBQUssT0FBTyxtQkFBbUI7QUFBQSxNQUNuRCxFQUFFLE1BQU0sS0FBSyxPQUFPLEtBQUssT0FBTyx3QkFBd0I7QUFBQSxNQUN4RCxFQUFFLE1BQU0sS0FBSyxPQUFPLEtBQUssT0FBTyxrQkFBa0I7QUFBQSxJQUFDO0FBQUEsRUFDckQ7QUFDQSxRQUFNLFdBQXNDLENBQUM7QUFDN0MsYUFBVyxNQUFNLEtBQUssVUFBVTtBQUMvQixRQUFJLE9BQVk7QUFDaEIsUUFBSSxRQUFRLE1BQU0sUUFBUSxJQUFJLEtBQUssS0FBSyxXQUFXLEdBQUc7QUFDckQsYUFBTyxFQUFFLE9BQU8sS0FBSyxDQUFDLEdBQUcsTUFBTSxLQUFLLENBQUMsR0FBRyxPQUFPLEtBQUssQ0FBQyxFQUFFO0FBQUEsSUFDeEQ7QUFDQSxRQUFJLEtBQUssU0FBUyxLQUFLLE9BQU87QUFDN0IsWUFBTSxjQUFjLFlBQVksT0FBTywwRUFBNEUsS0FBSyxPQUN2SCxpRkFBbUY7QUFBQSxJQUNyRjtBQUNBLFFBQUksT0FBTyxLQUFLLFNBQVMsWUFBWSxPQUFPLEtBQUssVUFBVSxZQUFZLE9BQU8sS0FBSyxVQUFVLFVBQVU7QUFDdEcsZUFBUyxLQUFLO0FBQUEsUUFDYixPQUFPLEtBQUssUUFBUSxNQUFNO0FBQUEsUUFDMUIsTUFBTSxjQUFjLFFBQVEsT0FBTyxLQUFLLElBQUk7QUFBQSxRQUM1QyxPQUFPLGNBQWMsUUFBUSxPQUFPLEtBQUssS0FBSztBQUFBLE1BQy9DLENBQUM7QUFBQSxJQUNGLE9BQ0s7QUFDSixZQUFNLGNBQWMsWUFBWSxPQUFPLHNGQUEwRjtBQUFBLElBQ2xJO0FBQUEsRUFDRDtBQUNBLFFBQU0sV0FBVztBQUdqQixRQUFNLFVBQVU7QUFDaEIsU0FBTztBQUNSOyIsCiAgIm5hbWVzIjogWyJtYXRjaGVzIl0KfQo=
