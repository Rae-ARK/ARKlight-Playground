import { CharCode } from "../../../base/common/charCode.js";
import { isChrome, isEdge, isFirefox, isLinux, isMacintosh, isSafari, isWeb, isWindows } from "../../../base/common/platform.js";
import { isFalsyOrWhitespace } from "../../../base/common/strings.js";
import { Scanner, TokenType } from "./scanner.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
import { localize } from "../../../nls.js";
import { illegalArgument } from "../../../base/common/errors.js";
const CONSTANT_VALUES = /* @__PURE__ */ new Map();
CONSTANT_VALUES.set("false", false);
CONSTANT_VALUES.set("true", true);
CONSTANT_VALUES.set("isMac", isMacintosh);
CONSTANT_VALUES.set("isLinux", isLinux);
CONSTANT_VALUES.set("isWindows", isWindows);
CONSTANT_VALUES.set("isWeb", isWeb);
CONSTANT_VALUES.set("isMacNative", isMacintosh && !isWeb);
CONSTANT_VALUES.set("isEdge", isEdge);
CONSTANT_VALUES.set("isFirefox", isFirefox);
CONSTANT_VALUES.set("isChrome", isChrome);
CONSTANT_VALUES.set("isSafari", isSafari);
function setConstant(key, value) {
  if (CONSTANT_VALUES.get(key) !== void 0) {
    throw illegalArgument("contextkey.setConstant(k, v) invoked with already set constant `k`");
  }
  CONSTANT_VALUES.set(key, value);
}
const hasOwnProperty = Object.prototype.hasOwnProperty;
var ContextKeyExprType = /* @__PURE__ */ ((ContextKeyExprType2) => {
  ContextKeyExprType2[ContextKeyExprType2["False"] = 0] = "False";
  ContextKeyExprType2[ContextKeyExprType2["True"] = 1] = "True";
  ContextKeyExprType2[ContextKeyExprType2["Defined"] = 2] = "Defined";
  ContextKeyExprType2[ContextKeyExprType2["Not"] = 3] = "Not";
  ContextKeyExprType2[ContextKeyExprType2["Equals"] = 4] = "Equals";
  ContextKeyExprType2[ContextKeyExprType2["NotEquals"] = 5] = "NotEquals";
  ContextKeyExprType2[ContextKeyExprType2["And"] = 6] = "And";
  ContextKeyExprType2[ContextKeyExprType2["Regex"] = 7] = "Regex";
  ContextKeyExprType2[ContextKeyExprType2["NotRegex"] = 8] = "NotRegex";
  ContextKeyExprType2[ContextKeyExprType2["Or"] = 9] = "Or";
  ContextKeyExprType2[ContextKeyExprType2["In"] = 10] = "In";
  ContextKeyExprType2[ContextKeyExprType2["NotIn"] = 11] = "NotIn";
  ContextKeyExprType2[ContextKeyExprType2["Greater"] = 12] = "Greater";
  ContextKeyExprType2[ContextKeyExprType2["GreaterEquals"] = 13] = "GreaterEquals";
  ContextKeyExprType2[ContextKeyExprType2["Smaller"] = 14] = "Smaller";
  ContextKeyExprType2[ContextKeyExprType2["SmallerEquals"] = 15] = "SmallerEquals";
  return ContextKeyExprType2;
})(ContextKeyExprType || {});
const defaultConfig = {
  regexParsingWithErrorRecovery: true
};
const errorEmptyString = localize("contextkey.parser.error.emptyString", "Empty context key expression");
const hintEmptyString = localize("contextkey.parser.error.emptyString.hint", "Did you forget to write an expression? You can also put 'false' or 'true' to always evaluate to false or true, respectively.");
const errorNoInAfterNot = localize("contextkey.parser.error.noInAfterNot", "'in' after 'not'.");
const errorClosingParenthesis = localize("contextkey.parser.error.closingParenthesis", "closing parenthesis ')'");
const errorUnexpectedToken = localize("contextkey.parser.error.unexpectedToken", "Unexpected token");
const hintUnexpectedToken = localize("contextkey.parser.error.unexpectedToken.hint", "Did you forget to put && or || before the token?");
const errorUnexpectedEOF = localize("contextkey.parser.error.unexpectedEOF", "Unexpected end of expression");
const hintUnexpectedEOF = localize("contextkey.parser.error.unexpectedEOF.hint", "Did you forget to put a context key?");
const _Parser = class _Parser {
  constructor(_config = defaultConfig) {
    this._config = _config;
    // lifetime note: `_scanner` lives as long as the parser does, i.e., is not reset between calls to `parse`
    this._scanner = new Scanner();
    // lifetime note: `_tokens`, `_current`, and `_parsingErrors` must be reset between calls to `parse`
    this._tokens = [];
    this._current = 0;
    // invariant: 0 <= this._current < this._tokens.length ; any incrementation of this value must first call `_isAtEnd`
    this._parsingErrors = [];
    this._flagsGYRe = /g|y/g;
  }
  get lexingErrors() {
    return this._scanner.errors;
  }
  get parsingErrors() {
    return this._parsingErrors;
  }
  /**
   * Parse a context key expression.
   *
   * @param input the expression to parse
   * @returns the parsed expression or `undefined` if there's an error - call `lexingErrors` and `parsingErrors` to see the errors
   */
  parse(input) {
    if (input === "") {
      this._parsingErrors.push({ message: errorEmptyString, offset: 0, lexeme: "", additionalInfo: hintEmptyString });
      return void 0;
    }
    this._tokens = this._scanner.reset(input).scan();
    this._current = 0;
    this._parsingErrors = [];
    try {
      const expr = this._expr();
      if (!this._isAtEnd()) {
        const peek = this._peek();
        const additionalInfo = peek.type === TokenType.Str ? hintUnexpectedToken : void 0;
        this._parsingErrors.push({ message: errorUnexpectedToken, offset: peek.offset, lexeme: Scanner.getLexeme(peek), additionalInfo });
        throw _Parser._parseError;
      }
      return expr;
    } catch (e) {
      if (!(e === _Parser._parseError)) {
        throw e;
      }
      return void 0;
    }
  }
  _expr() {
    return this._or();
  }
  _or() {
    const expr = [this._and()];
    while (this._matchOne(TokenType.Or)) {
      const right = this._and();
      expr.push(right);
    }
    return expr.length === 1 ? expr[0] : ContextKeyExpr.or(...expr);
  }
  _and() {
    const expr = [this._term()];
    while (this._matchOne(TokenType.And)) {
      const right = this._term();
      expr.push(right);
    }
    return expr.length === 1 ? expr[0] : ContextKeyExpr.and(...expr);
  }
  _term() {
    if (this._matchOne(TokenType.Neg)) {
      const peek = this._peek();
      switch (peek.type) {
        case TokenType.True:
          this._advance();
          return ContextKeyFalseExpr.INSTANCE;
        case TokenType.False:
          this._advance();
          return ContextKeyTrueExpr.INSTANCE;
        case TokenType.LParen: {
          this._advance();
          const expr = this._expr();
          this._consume(TokenType.RParen, errorClosingParenthesis);
          return expr?.negate();
        }
        case TokenType.Str:
          this._advance();
          return ContextKeyNotExpr.create(peek.lexeme);
        default:
          throw this._errExpectedButGot(`KEY | true | false | '(' expression ')'`, peek);
      }
    }
    return this._primary();
  }
  _primary() {
    const peek = this._peek();
    switch (peek.type) {
      case TokenType.True:
        this._advance();
        return ContextKeyExpr.true();
      case TokenType.False:
        this._advance();
        return ContextKeyExpr.false();
      case TokenType.LParen: {
        this._advance();
        const expr = this._expr();
        this._consume(TokenType.RParen, errorClosingParenthesis);
        return expr;
      }
      case TokenType.Str: {
        const key = peek.lexeme;
        this._advance();
        if (this._matchOne(TokenType.RegexOp)) {
          const expr = this._peek();
          if (!this._config.regexParsingWithErrorRecovery) {
            this._advance();
            if (expr.type !== TokenType.RegexStr) {
              throw this._errExpectedButGot(`REGEX`, expr);
            }
            const regexLexeme = expr.lexeme;
            const closingSlashIndex = regexLexeme.lastIndexOf("/");
            const flags = closingSlashIndex === regexLexeme.length - 1 ? void 0 : this._removeFlagsGY(regexLexeme.substring(closingSlashIndex + 1));
            let regexp;
            try {
              regexp = new RegExp(regexLexeme.substring(1, closingSlashIndex), flags);
            } catch (e) {
              throw this._errExpectedButGot(`REGEX`, expr);
            }
            return ContextKeyRegexExpr.create(key, regexp);
          }
          switch (expr.type) {
            case TokenType.RegexStr:
            case TokenType.Error: {
              const lexemeReconstruction = [expr.lexeme];
              this._advance();
              let followingToken = this._peek();
              let parenBalance = 0;
              for (let i = 0; i < expr.lexeme.length; i++) {
                if (expr.lexeme.charCodeAt(i) === CharCode.OpenParen) {
                  parenBalance++;
                } else if (expr.lexeme.charCodeAt(i) === CharCode.CloseParen) {
                  parenBalance--;
                }
              }
              while (!this._isAtEnd() && followingToken.type !== TokenType.And && followingToken.type !== TokenType.Or) {
                switch (followingToken.type) {
                  case TokenType.LParen:
                    parenBalance++;
                    break;
                  case TokenType.RParen:
                    parenBalance--;
                    break;
                  case TokenType.RegexStr:
                  case TokenType.QuotedStr:
                    for (let i = 0; i < followingToken.lexeme.length; i++) {
                      if (followingToken.lexeme.charCodeAt(i) === CharCode.OpenParen) {
                        parenBalance++;
                      } else if (expr.lexeme.charCodeAt(i) === CharCode.CloseParen) {
                        parenBalance--;
                      }
                    }
                }
                if (parenBalance < 0) {
                  break;
                }
                lexemeReconstruction.push(Scanner.getLexeme(followingToken));
                this._advance();
                followingToken = this._peek();
              }
              const regexLexeme = lexemeReconstruction.join("");
              const closingSlashIndex = regexLexeme.lastIndexOf("/");
              const flags = closingSlashIndex === regexLexeme.length - 1 ? void 0 : this._removeFlagsGY(regexLexeme.substring(closingSlashIndex + 1));
              let regexp;
              try {
                regexp = new RegExp(regexLexeme.substring(1, closingSlashIndex), flags);
              } catch (e) {
                throw this._errExpectedButGot(`REGEX`, expr);
              }
              return ContextKeyExpr.regex(key, regexp);
            }
            case TokenType.QuotedStr: {
              const serializedValue = expr.lexeme;
              this._advance();
              let regex = null;
              if (!isFalsyOrWhitespace(serializedValue)) {
                const start = serializedValue.indexOf("/");
                const end = serializedValue.lastIndexOf("/");
                if (start !== end && start >= 0) {
                  const value = serializedValue.slice(start + 1, end);
                  const caseIgnoreFlag = serializedValue[end + 1] === "i" ? "i" : "";
                  try {
                    regex = new RegExp(value, caseIgnoreFlag);
                  } catch (_e) {
                    throw this._errExpectedButGot(`REGEX`, expr);
                  }
                }
              }
              if (regex === null) {
                throw this._errExpectedButGot("REGEX", expr);
              }
              return ContextKeyRegexExpr.create(key, regex);
            }
            default:
              throw this._errExpectedButGot("REGEX", this._peek());
          }
        }
        if (this._matchOne(TokenType.Not)) {
          this._consume(TokenType.In, errorNoInAfterNot);
          const right = this._value();
          return ContextKeyExpr.notIn(key, right);
        }
        const maybeOp = this._peek().type;
        switch (maybeOp) {
          case TokenType.Eq: {
            this._advance();
            const right = this._value();
            if (this._previous().type === TokenType.QuotedStr) {
              return ContextKeyExpr.equals(key, right);
            }
            switch (right) {
              case "true":
                return ContextKeyExpr.has(key);
              case "false":
                return ContextKeyExpr.not(key);
              default:
                return ContextKeyExpr.equals(key, right);
            }
          }
          case TokenType.NotEq: {
            this._advance();
            const right = this._value();
            if (this._previous().type === TokenType.QuotedStr) {
              return ContextKeyExpr.notEquals(key, right);
            }
            switch (right) {
              case "true":
                return ContextKeyExpr.not(key);
              case "false":
                return ContextKeyExpr.has(key);
              default:
                return ContextKeyExpr.notEquals(key, right);
            }
          }
          // TODO: ContextKeyExpr.smaller(key, right) accepts only `number` as `right` AND during eval of this node, we just eval to `false` if `right` is not a number
          // consequently, package.json linter should _warn_ the user if they're passing undesired things to ops
          case TokenType.Lt:
            this._advance();
            return ContextKeySmallerExpr.create(key, this._value());
          case TokenType.LtEq:
            this._advance();
            return ContextKeySmallerEqualsExpr.create(key, this._value());
          case TokenType.Gt:
            this._advance();
            return ContextKeyGreaterExpr.create(key, this._value());
          case TokenType.GtEq:
            this._advance();
            return ContextKeyGreaterEqualsExpr.create(key, this._value());
          case TokenType.In:
            this._advance();
            return ContextKeyExpr.in(key, this._value());
          default:
            return ContextKeyExpr.has(key);
        }
      }
      case TokenType.EOF:
        this._parsingErrors.push({ message: errorUnexpectedEOF, offset: peek.offset, lexeme: "", additionalInfo: hintUnexpectedEOF });
        throw _Parser._parseError;
      default:
        throw this._errExpectedButGot(`true | false | KEY 
	| KEY '=~' REGEX 
	| KEY ('==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'not' 'in') value`, this._peek());
    }
  }
  _value() {
    const token = this._peek();
    switch (token.type) {
      case TokenType.Str:
      case TokenType.QuotedStr:
        this._advance();
        return token.lexeme;
      case TokenType.True:
        this._advance();
        return "true";
      case TokenType.False:
        this._advance();
        return "false";
      case TokenType.In:
        this._advance();
        return "in";
      default:
        return "";
    }
  }
  _removeFlagsGY(flags) {
    return flags.replaceAll(this._flagsGYRe, "");
  }
  // careful: this can throw if current token is the initial one (ie index = 0)
  _previous() {
    return this._tokens[this._current - 1];
  }
  _matchOne(token) {
    if (this._check(token)) {
      this._advance();
      return true;
    }
    return false;
  }
  _advance() {
    if (!this._isAtEnd()) {
      this._current++;
    }
    return this._previous();
  }
  _consume(type, message) {
    if (this._check(type)) {
      return this._advance();
    }
    throw this._errExpectedButGot(message, this._peek());
  }
  _errExpectedButGot(expected, got, additionalInfo) {
    const message = localize("contextkey.parser.error.expectedButGot", "Expected: {0}\nReceived: '{1}'.", expected, Scanner.getLexeme(got));
    const offset = got.offset;
    const lexeme = Scanner.getLexeme(got);
    this._parsingErrors.push({ message, offset, lexeme, additionalInfo });
    return _Parser._parseError;
  }
  _check(type) {
    return this._peek().type === type;
  }
  _peek() {
    return this._tokens[this._current];
  }
  _isAtEnd() {
    return this._peek().type === TokenType.EOF;
  }
};
// Note: this doesn't produce an exact syntax tree but a normalized one
// ContextKeyExpression's that we use as AST nodes do not expose constructors that do not normalize
_Parser._parseError = new Error();
let Parser = _Parser;
class ContextKeyExpr {
  static false() {
    return ContextKeyFalseExpr.INSTANCE;
  }
  static true() {
    return ContextKeyTrueExpr.INSTANCE;
  }
  static has(key) {
    return ContextKeyDefinedExpr.create(key);
  }
  static equals(key, value) {
    return ContextKeyEqualsExpr.create(key, value);
  }
  static notEquals(key, value) {
    return ContextKeyNotEqualsExpr.create(key, value);
  }
  static regex(key, value) {
    return ContextKeyRegexExpr.create(key, value);
  }
  static in(key, value) {
    return ContextKeyInExpr.create(key, value);
  }
  static notIn(key, value) {
    return ContextKeyNotInExpr.create(key, value);
  }
  static not(key) {
    return ContextKeyNotExpr.create(key);
  }
  static and(...expr) {
    return ContextKeyAndExpr.create(expr, null, true);
  }
  static or(...expr) {
    return ContextKeyOrExpr.create(expr, null, true);
  }
  static greater(key, value) {
    return ContextKeyGreaterExpr.create(key, value);
  }
  static greaterEquals(key, value) {
    return ContextKeyGreaterEqualsExpr.create(key, value);
  }
  static smaller(key, value) {
    return ContextKeySmallerExpr.create(key, value);
  }
  static smallerEquals(key, value) {
    return ContextKeySmallerEqualsExpr.create(key, value);
  }
  static deserialize(serialized) {
    if (serialized === void 0 || serialized === null) {
      return void 0;
    }
    const expr = this._parser.parse(serialized);
    return expr;
  }
}
ContextKeyExpr._parser = new Parser({ regexParsingWithErrorRecovery: false });
function validateWhenClauses(whenClauses) {
  const parser = new Parser({ regexParsingWithErrorRecovery: false });
  return whenClauses.map((whenClause) => {
    parser.parse(whenClause);
    if (parser.lexingErrors.length > 0) {
      return parser.lexingErrors.map((se) => ({
        errorMessage: se.additionalInfo ? localize("contextkey.scanner.errorForLinterWithHint", "Unexpected token. Hint: {0}", se.additionalInfo) : localize("contextkey.scanner.errorForLinter", "Unexpected token."),
        offset: se.offset,
        length: se.lexeme.length
      }));
    } else if (parser.parsingErrors.length > 0) {
      return parser.parsingErrors.map((pe) => ({
        errorMessage: pe.additionalInfo ? `${pe.message}. ${pe.additionalInfo}` : pe.message,
        offset: pe.offset,
        length: pe.lexeme.length
      }));
    } else {
      return [];
    }
  });
}
function expressionsAreEqualWithConstantSubstitution(a, b) {
  const aExpr = a ? a.substituteConstants() : void 0;
  const bExpr = b ? b.substituteConstants() : void 0;
  if (!aExpr && !bExpr) {
    return true;
  }
  if (!aExpr || !bExpr) {
    return false;
  }
  return aExpr.equals(bExpr);
}
function cmp(a, b) {
  return a.cmp(b);
}
const _ContextKeyFalseExpr = class _ContextKeyFalseExpr {
  constructor() {
    this.type = 0 /* False */;
  }
  cmp(other) {
    return this.type - other.type;
  }
  equals(other) {
    return other.type === this.type;
  }
  substituteConstants() {
    return this;
  }
  evaluate(context) {
    return false;
  }
  serialize() {
    return "false";
  }
  keys() {
    return [];
  }
  map(mapFnc) {
    return this;
  }
  negate() {
    return ContextKeyTrueExpr.INSTANCE;
  }
};
_ContextKeyFalseExpr.INSTANCE = new _ContextKeyFalseExpr();
let ContextKeyFalseExpr = _ContextKeyFalseExpr;
const _ContextKeyTrueExpr = class _ContextKeyTrueExpr {
  constructor() {
    this.type = 1 /* True */;
  }
  cmp(other) {
    return this.type - other.type;
  }
  equals(other) {
    return other.type === this.type;
  }
  substituteConstants() {
    return this;
  }
  evaluate(context) {
    return true;
  }
  serialize() {
    return "true";
  }
  keys() {
    return [];
  }
  map(mapFnc) {
    return this;
  }
  negate() {
    return ContextKeyFalseExpr.INSTANCE;
  }
};
_ContextKeyTrueExpr.INSTANCE = new _ContextKeyTrueExpr();
let ContextKeyTrueExpr = _ContextKeyTrueExpr;
class ContextKeyDefinedExpr {
  constructor(key, negated) {
    this.key = key;
    this.negated = negated;
    this.type = 2 /* Defined */;
  }
  static create(key, negated = null) {
    const constantValue = CONSTANT_VALUES.get(key);
    if (typeof constantValue === "boolean") {
      return constantValue ? ContextKeyTrueExpr.INSTANCE : ContextKeyFalseExpr.INSTANCE;
    }
    return new ContextKeyDefinedExpr(key, negated);
  }
  cmp(other) {
    if (other.type !== this.type) {
      return this.type - other.type;
    }
    return cmp1(this.key, other.key);
  }
  equals(other) {
    if (other.type === this.type) {
      return this.key === other.key;
    }
    return false;
  }
  substituteConstants() {
    const constantValue = CONSTANT_VALUES.get(this.key);
    if (typeof constantValue === "boolean") {
      return constantValue ? ContextKeyTrueExpr.INSTANCE : ContextKeyFalseExpr.INSTANCE;
    }
    return this;
  }
  evaluate(context) {
    return !!context.getValue(this.key);
  }
  serialize() {
    return this.key;
  }
  keys() {
    return [this.key];
  }
  map(mapFnc) {
    return mapFnc.mapDefined(this.key);
  }
  negate() {
    if (!this.negated) {
      this.negated = ContextKeyNotExpr.create(this.key, this);
    }
    return this.negated;
  }
}
class ContextKeyEqualsExpr {
  constructor(key, value, negated) {
    this.key = key;
    this.value = value;
    this.negated = negated;
    this.type = 4 /* Equals */;
  }
  static create(key, value, negated = null) {
    if (typeof value === "boolean") {
      return value ? ContextKeyDefinedExpr.create(key, negated) : ContextKeyNotExpr.create(key, negated);
    }
    const constantValue = CONSTANT_VALUES.get(key);
    if (typeof constantValue === "boolean") {
      const trueValue = constantValue ? "true" : "false";
      return value === trueValue ? ContextKeyTrueExpr.INSTANCE : ContextKeyFalseExpr.INSTANCE;
    }
    return new ContextKeyEqualsExpr(key, value, negated);
  }
  cmp(other) {
    if (other.type !== this.type) {
      return this.type - other.type;
    }
    return cmp2(this.key, this.value, other.key, other.value);
  }
  equals(other) {
    if (other.type === this.type) {
      return this.key === other.key && this.value === other.value;
    }
    return false;
  }
  substituteConstants() {
    const constantValue = CONSTANT_VALUES.get(this.key);
    if (typeof constantValue === "boolean") {
      const trueValue = constantValue ? "true" : "false";
      return this.value === trueValue ? ContextKeyTrueExpr.INSTANCE : ContextKeyFalseExpr.INSTANCE;
    }
    return this;
  }
  evaluate(context) {
    return context.getValue(this.key) == this.value;
  }
  serialize() {
    return `${this.key} == '${this.value}'`;
  }
  keys() {
    return [this.key];
  }
  map(mapFnc) {
    return mapFnc.mapEquals(this.key, this.value);
  }
  negate() {
    if (!this.negated) {
      this.negated = ContextKeyNotEqualsExpr.create(this.key, this.value, this);
    }
    return this.negated;
  }
}
class ContextKeyInExpr {
  constructor(key, valueKey) {
    this.key = key;
    this.valueKey = valueKey;
    this.type = 10 /* In */;
    this.negated = null;
  }
  static create(key, valueKey) {
    return new ContextKeyInExpr(key, valueKey);
  }
  cmp(other) {
    if (other.type !== this.type) {
      return this.type - other.type;
    }
    return cmp2(this.key, this.valueKey, other.key, other.valueKey);
  }
  equals(other) {
    if (other.type === this.type) {
      return this.key === other.key && this.valueKey === other.valueKey;
    }
    return false;
  }
  substituteConstants() {
    return this;
  }
  evaluate(context) {
    const source = context.getValue(this.valueKey);
    const item = context.getValue(this.key);
    if (Array.isArray(source)) {
      if (source.includes(item)) {
        return true;
      }
      if (isWindows && typeof item === "string" && item.startsWith("file:///")) {
        const itemLower = item.toLowerCase();
        return source.some((s) => typeof s === "string" && s.toLowerCase() === itemLower);
      }
      return false;
    }
    if (typeof item === "string" && typeof source === "object" && source !== null) {
      if (hasOwnProperty.call(source, item)) {
        return true;
      }
      if (isWindows && item.startsWith("file:///")) {
        const itemLower = item.toLowerCase();
        return Object.keys(source).some((key) => key.toLowerCase() === itemLower);
      }
      return false;
    }
    return false;
  }
  serialize() {
    return `${this.key} in '${this.valueKey}'`;
  }
  keys() {
    return [this.key, this.valueKey];
  }
  map(mapFnc) {
    return mapFnc.mapIn(this.key, this.valueKey);
  }
  negate() {
    if (!this.negated) {
      this.negated = ContextKeyNotInExpr.create(this.key, this.valueKey);
    }
    return this.negated;
  }
}
class ContextKeyNotInExpr {
  constructor(key, valueKey) {
    this.key = key;
    this.valueKey = valueKey;
    this.type = 11 /* NotIn */;
    this._negated = ContextKeyInExpr.create(key, valueKey);
  }
  static create(key, valueKey) {
    return new ContextKeyNotInExpr(key, valueKey);
  }
  cmp(other) {
    if (other.type !== this.type) {
      return this.type - other.type;
    }
    return this._negated.cmp(other._negated);
  }
  equals(other) {
    if (other.type === this.type) {
      return this._negated.equals(other._negated);
    }
    return false;
  }
  substituteConstants() {
    return this;
  }
  evaluate(context) {
    return !this._negated.evaluate(context);
  }
  serialize() {
    return `${this.key} not in '${this.valueKey}'`;
  }
  keys() {
    return this._negated.keys();
  }
  map(mapFnc) {
    return mapFnc.mapNotIn(this.key, this.valueKey);
  }
  negate() {
    return this._negated;
  }
}
class ContextKeyNotEqualsExpr {
  constructor(key, value, negated) {
    this.key = key;
    this.value = value;
    this.negated = negated;
    this.type = 5 /* NotEquals */;
  }
  static create(key, value, negated = null) {
    if (typeof value === "boolean") {
      if (value) {
        return ContextKeyNotExpr.create(key, negated);
      }
      return ContextKeyDefinedExpr.create(key, negated);
    }
    const constantValue = CONSTANT_VALUES.get(key);
    if (typeof constantValue === "boolean") {
      const falseValue = constantValue ? "true" : "false";
      return value === falseValue ? ContextKeyFalseExpr.INSTANCE : ContextKeyTrueExpr.INSTANCE;
    }
    return new ContextKeyNotEqualsExpr(key, value, negated);
  }
  cmp(other) {
    if (other.type !== this.type) {
      return this.type - other.type;
    }
    return cmp2(this.key, this.value, other.key, other.value);
  }
  equals(other) {
    if (other.type === this.type) {
      return this.key === other.key && this.value === other.value;
    }
    return false;
  }
  substituteConstants() {
    const constantValue = CONSTANT_VALUES.get(this.key);
    if (typeof constantValue === "boolean") {
      const falseValue = constantValue ? "true" : "false";
      return this.value === falseValue ? ContextKeyFalseExpr.INSTANCE : ContextKeyTrueExpr.INSTANCE;
    }
    return this;
  }
  evaluate(context) {
    return context.getValue(this.key) != this.value;
  }
  serialize() {
    return `${this.key} != '${this.value}'`;
  }
  keys() {
    return [this.key];
  }
  map(mapFnc) {
    return mapFnc.mapNotEquals(this.key, this.value);
  }
  negate() {
    if (!this.negated) {
      this.negated = ContextKeyEqualsExpr.create(this.key, this.value, this);
    }
    return this.negated;
  }
}
class ContextKeyNotExpr {
  constructor(key, negated) {
    this.key = key;
    this.negated = negated;
    this.type = 3 /* Not */;
  }
  static create(key, negated = null) {
    const constantValue = CONSTANT_VALUES.get(key);
    if (typeof constantValue === "boolean") {
      return constantValue ? ContextKeyFalseExpr.INSTANCE : ContextKeyTrueExpr.INSTANCE;
    }
    return new ContextKeyNotExpr(key, negated);
  }
  cmp(other) {
    if (other.type !== this.type) {
      return this.type - other.type;
    }
    return cmp1(this.key, other.key);
  }
  equals(other) {
    if (other.type === this.type) {
      return this.key === other.key;
    }
    return false;
  }
  substituteConstants() {
    const constantValue = CONSTANT_VALUES.get(this.key);
    if (typeof constantValue === "boolean") {
      return constantValue ? ContextKeyFalseExpr.INSTANCE : ContextKeyTrueExpr.INSTANCE;
    }
    return this;
  }
  evaluate(context) {
    return !context.getValue(this.key);
  }
  serialize() {
    return `!${this.key}`;
  }
  keys() {
    return [this.key];
  }
  map(mapFnc) {
    return mapFnc.mapNot(this.key);
  }
  negate() {
    if (!this.negated) {
      this.negated = ContextKeyDefinedExpr.create(this.key, this);
    }
    return this.negated;
  }
}
function withFloatOrStr(value, callback) {
  if (typeof value === "string") {
    const n = parseFloat(value);
    if (!isNaN(n)) {
      value = n;
    }
  }
  if (typeof value === "string" || typeof value === "number") {
    return callback(value);
  }
  return ContextKeyFalseExpr.INSTANCE;
}
class ContextKeyGreaterExpr {
  constructor(key, value, negated) {
    this.key = key;
    this.value = value;
    this.negated = negated;
    this.type = 12 /* Greater */;
  }
  static create(key, _value, negated = null) {
    return withFloatOrStr(_value, (value) => new ContextKeyGreaterExpr(key, value, negated));
  }
  cmp(other) {
    if (other.type !== this.type) {
      return this.type - other.type;
    }
    return cmp2(this.key, this.value, other.key, other.value);
  }
  equals(other) {
    if (other.type === this.type) {
      return this.key === other.key && this.value === other.value;
    }
    return false;
  }
  substituteConstants() {
    return this;
  }
  evaluate(context) {
    if (typeof this.value === "string") {
      return false;
    }
    return parseFloat(context.getValue(this.key)) > this.value;
  }
  serialize() {
    return `${this.key} > ${this.value}`;
  }
  keys() {
    return [this.key];
  }
  map(mapFnc) {
    return mapFnc.mapGreater(this.key, this.value);
  }
  negate() {
    if (!this.negated) {
      this.negated = ContextKeySmallerEqualsExpr.create(this.key, this.value, this);
    }
    return this.negated;
  }
}
class ContextKeyGreaterEqualsExpr {
  constructor(key, value, negated) {
    this.key = key;
    this.value = value;
    this.negated = negated;
    this.type = 13 /* GreaterEquals */;
  }
  static create(key, _value, negated = null) {
    return withFloatOrStr(_value, (value) => new ContextKeyGreaterEqualsExpr(key, value, negated));
  }
  cmp(other) {
    if (other.type !== this.type) {
      return this.type - other.type;
    }
    return cmp2(this.key, this.value, other.key, other.value);
  }
  equals(other) {
    if (other.type === this.type) {
      return this.key === other.key && this.value === other.value;
    }
    return false;
  }
  substituteConstants() {
    return this;
  }
  evaluate(context) {
    if (typeof this.value === "string") {
      return false;
    }
    return parseFloat(context.getValue(this.key)) >= this.value;
  }
  serialize() {
    return `${this.key} >= ${this.value}`;
  }
  keys() {
    return [this.key];
  }
  map(mapFnc) {
    return mapFnc.mapGreaterEquals(this.key, this.value);
  }
  negate() {
    if (!this.negated) {
      this.negated = ContextKeySmallerExpr.create(this.key, this.value, this);
    }
    return this.negated;
  }
}
class ContextKeySmallerExpr {
  constructor(key, value, negated) {
    this.key = key;
    this.value = value;
    this.negated = negated;
    this.type = 14 /* Smaller */;
  }
  static create(key, _value, negated = null) {
    return withFloatOrStr(_value, (value) => new ContextKeySmallerExpr(key, value, negated));
  }
  cmp(other) {
    if (other.type !== this.type) {
      return this.type - other.type;
    }
    return cmp2(this.key, this.value, other.key, other.value);
  }
  equals(other) {
    if (other.type === this.type) {
      return this.key === other.key && this.value === other.value;
    }
    return false;
  }
  substituteConstants() {
    return this;
  }
  evaluate(context) {
    if (typeof this.value === "string") {
      return false;
    }
    return parseFloat(context.getValue(this.key)) < this.value;
  }
  serialize() {
    return `${this.key} < ${this.value}`;
  }
  keys() {
    return [this.key];
  }
  map(mapFnc) {
    return mapFnc.mapSmaller(this.key, this.value);
  }
  negate() {
    if (!this.negated) {
      this.negated = ContextKeyGreaterEqualsExpr.create(this.key, this.value, this);
    }
    return this.negated;
  }
}
class ContextKeySmallerEqualsExpr {
  constructor(key, value, negated) {
    this.key = key;
    this.value = value;
    this.negated = negated;
    this.type = 15 /* SmallerEquals */;
  }
  static create(key, _value, negated = null) {
    return withFloatOrStr(_value, (value) => new ContextKeySmallerEqualsExpr(key, value, negated));
  }
  cmp(other) {
    if (other.type !== this.type) {
      return this.type - other.type;
    }
    return cmp2(this.key, this.value, other.key, other.value);
  }
  equals(other) {
    if (other.type === this.type) {
      return this.key === other.key && this.value === other.value;
    }
    return false;
  }
  substituteConstants() {
    return this;
  }
  evaluate(context) {
    if (typeof this.value === "string") {
      return false;
    }
    return parseFloat(context.getValue(this.key)) <= this.value;
  }
  serialize() {
    return `${this.key} <= ${this.value}`;
  }
  keys() {
    return [this.key];
  }
  map(mapFnc) {
    return mapFnc.mapSmallerEquals(this.key, this.value);
  }
  negate() {
    if (!this.negated) {
      this.negated = ContextKeyGreaterExpr.create(this.key, this.value, this);
    }
    return this.negated;
  }
}
class ContextKeyRegexExpr {
  constructor(key, regexp) {
    this.key = key;
    this.regexp = regexp;
    this.type = 7 /* Regex */;
    this.negated = null;
  }
  static create(key, regexp) {
    return new ContextKeyRegexExpr(key, regexp);
  }
  cmp(other) {
    if (other.type !== this.type) {
      return this.type - other.type;
    }
    if (this.key < other.key) {
      return -1;
    }
    if (this.key > other.key) {
      return 1;
    }
    const thisSource = this.regexp ? this.regexp.source : "";
    const otherSource = other.regexp ? other.regexp.source : "";
    if (thisSource < otherSource) {
      return -1;
    }
    if (thisSource > otherSource) {
      return 1;
    }
    return 0;
  }
  equals(other) {
    if (other.type === this.type) {
      const thisSource = this.regexp ? this.regexp.source : "";
      const otherSource = other.regexp ? other.regexp.source : "";
      return this.key === other.key && thisSource === otherSource;
    }
    return false;
  }
  substituteConstants() {
    return this;
  }
  evaluate(context) {
    const value = context.getValue(this.key);
    return this.regexp ? this.regexp.test(value) : false;
  }
  serialize() {
    const value = this.regexp ? `/${this.regexp.source}/${this.regexp.flags}` : "/invalid/";
    return `${this.key} =~ ${value}`;
  }
  keys() {
    return [this.key];
  }
  map(mapFnc) {
    return mapFnc.mapRegex(this.key, this.regexp);
  }
  negate() {
    if (!this.negated) {
      this.negated = ContextKeyNotRegexExpr.create(this);
    }
    return this.negated;
  }
}
class ContextKeyNotRegexExpr {
  constructor(_actual) {
    this._actual = _actual;
    this.type = 8 /* NotRegex */;
  }
  static create(actual) {
    return new ContextKeyNotRegexExpr(actual);
  }
  cmp(other) {
    if (other.type !== this.type) {
      return this.type - other.type;
    }
    return this._actual.cmp(other._actual);
  }
  equals(other) {
    if (other.type === this.type) {
      return this._actual.equals(other._actual);
    }
    return false;
  }
  substituteConstants() {
    return this;
  }
  evaluate(context) {
    return !this._actual.evaluate(context);
  }
  serialize() {
    return `!(${this._actual.serialize()})`;
  }
  keys() {
    return this._actual.keys();
  }
  map(mapFnc) {
    return new ContextKeyNotRegexExpr(this._actual.map(mapFnc));
  }
  negate() {
    return this._actual;
  }
}
function eliminateConstantsInArray(arr) {
  let newArr = null;
  for (let i = 0, len = arr.length; i < len; i++) {
    const newExpr = arr[i].substituteConstants();
    if (arr[i] !== newExpr) {
      if (newArr === null) {
        newArr = [];
        for (let j = 0; j < i; j++) {
          newArr[j] = arr[j];
        }
      }
    }
    if (newArr !== null) {
      newArr[i] = newExpr;
    }
  }
  if (newArr === null) {
    return arr;
  }
  return newArr;
}
class ContextKeyAndExpr {
  constructor(expr, negated) {
    this.expr = expr;
    this.negated = negated;
    this.type = 6 /* And */;
  }
  static create(_expr, negated, extraRedundantCheck) {
    return ContextKeyAndExpr._normalizeArr(_expr, negated, extraRedundantCheck);
  }
  cmp(other) {
    if (other.type !== this.type) {
      return this.type - other.type;
    }
    if (this.expr.length < other.expr.length) {
      return -1;
    }
    if (this.expr.length > other.expr.length) {
      return 1;
    }
    for (let i = 0, len = this.expr.length; i < len; i++) {
      const r = cmp(this.expr[i], other.expr[i]);
      if (r !== 0) {
        return r;
      }
    }
    return 0;
  }
  equals(other) {
    if (other.type === this.type) {
      if (this.expr.length !== other.expr.length) {
        return false;
      }
      for (let i = 0, len = this.expr.length; i < len; i++) {
        if (!this.expr[i].equals(other.expr[i])) {
          return false;
        }
      }
      return true;
    }
    return false;
  }
  substituteConstants() {
    const exprArr = eliminateConstantsInArray(this.expr);
    if (exprArr === this.expr) {
      return this;
    }
    return ContextKeyAndExpr.create(exprArr, this.negated, false);
  }
  evaluate(context) {
    for (let i = 0, len = this.expr.length; i < len; i++) {
      if (!this.expr[i].evaluate(context)) {
        return false;
      }
    }
    return true;
  }
  static _normalizeArr(arr, negated, extraRedundantCheck) {
    const expr = [];
    let hasTrue = false;
    for (const e of arr) {
      if (!e) {
        continue;
      }
      if (e.type === 1 /* True */) {
        hasTrue = true;
        continue;
      }
      if (e.type === 0 /* False */) {
        return ContextKeyFalseExpr.INSTANCE;
      }
      if (e.type === 6 /* And */) {
        expr.push(...e.expr);
        continue;
      }
      expr.push(e);
    }
    if (expr.length === 0 && hasTrue) {
      return ContextKeyTrueExpr.INSTANCE;
    }
    if (expr.length === 0) {
      return void 0;
    }
    if (expr.length === 1) {
      return expr[0];
    }
    expr.sort(cmp);
    for (let i = 1; i < expr.length; i++) {
      if (expr[i - 1].equals(expr[i])) {
        expr.splice(i, 1);
        i--;
      }
    }
    if (expr.length === 1) {
      return expr[0];
    }
    while (expr.length > 1) {
      const lastElement = expr[expr.length - 1];
      if (lastElement.type !== 9 /* Or */) {
        break;
      }
      expr.pop();
      const secondToLastElement = expr.pop();
      const isFinished = expr.length === 0;
      const resultElement = ContextKeyOrExpr.create(
        lastElement.expr.map((el) => ContextKeyAndExpr.create([el, secondToLastElement], null, extraRedundantCheck)),
        null,
        isFinished
      );
      if (resultElement) {
        expr.push(resultElement);
        expr.sort(cmp);
      }
    }
    if (expr.length === 1) {
      return expr[0];
    }
    if (extraRedundantCheck) {
      for (let i = 0; i < expr.length; i++) {
        for (let j = i + 1; j < expr.length; j++) {
          if (expr[i].negate().equals(expr[j])) {
            return ContextKeyFalseExpr.INSTANCE;
          }
        }
      }
      if (expr.length === 1) {
        return expr[0];
      }
    }
    return new ContextKeyAndExpr(expr, negated);
  }
  serialize() {
    return this.expr.map((e) => e.serialize()).join(" && ");
  }
  keys() {
    const result = [];
    for (const expr of this.expr) {
      result.push(...expr.keys());
    }
    return result;
  }
  map(mapFnc) {
    return new ContextKeyAndExpr(this.expr.map((expr) => expr.map(mapFnc)), null);
  }
  negate() {
    if (!this.negated) {
      const result = [];
      for (const expr of this.expr) {
        result.push(expr.negate());
      }
      this.negated = ContextKeyOrExpr.create(result, this, true);
    }
    return this.negated;
  }
}
class ContextKeyOrExpr {
  constructor(expr, negated) {
    this.expr = expr;
    this.negated = negated;
    this.type = 9 /* Or */;
  }
  static create(_expr, negated, extraRedundantCheck) {
    return ContextKeyOrExpr._normalizeArr(_expr, negated, extraRedundantCheck);
  }
  cmp(other) {
    if (other.type !== this.type) {
      return this.type - other.type;
    }
    if (this.expr.length < other.expr.length) {
      return -1;
    }
    if (this.expr.length > other.expr.length) {
      return 1;
    }
    for (let i = 0, len = this.expr.length; i < len; i++) {
      const r = cmp(this.expr[i], other.expr[i]);
      if (r !== 0) {
        return r;
      }
    }
    return 0;
  }
  equals(other) {
    if (other.type === this.type) {
      if (this.expr.length !== other.expr.length) {
        return false;
      }
      for (let i = 0, len = this.expr.length; i < len; i++) {
        if (!this.expr[i].equals(other.expr[i])) {
          return false;
        }
      }
      return true;
    }
    return false;
  }
  substituteConstants() {
    const exprArr = eliminateConstantsInArray(this.expr);
    if (exprArr === this.expr) {
      return this;
    }
    return ContextKeyOrExpr.create(exprArr, this.negated, false);
  }
  evaluate(context) {
    for (let i = 0, len = this.expr.length; i < len; i++) {
      if (this.expr[i].evaluate(context)) {
        return true;
      }
    }
    return false;
  }
  static _normalizeArr(arr, negated, extraRedundantCheck) {
    let expr = [];
    let hasFalse = false;
    if (arr) {
      for (let i = 0, len = arr.length; i < len; i++) {
        const e = arr[i];
        if (!e) {
          continue;
        }
        if (e.type === 0 /* False */) {
          hasFalse = true;
          continue;
        }
        if (e.type === 1 /* True */) {
          return ContextKeyTrueExpr.INSTANCE;
        }
        if (e.type === 9 /* Or */) {
          expr = expr.concat(e.expr);
          continue;
        }
        expr.push(e);
      }
      if (expr.length === 0 && hasFalse) {
        return ContextKeyFalseExpr.INSTANCE;
      }
      expr.sort(cmp);
    }
    if (expr.length === 0) {
      return void 0;
    }
    if (expr.length === 1) {
      return expr[0];
    }
    for (let i = 1; i < expr.length; i++) {
      if (expr[i - 1].equals(expr[i])) {
        expr.splice(i, 1);
        i--;
      }
    }
    if (expr.length === 1) {
      return expr[0];
    }
    if (extraRedundantCheck) {
      for (let i = 0; i < expr.length; i++) {
        for (let j = i + 1; j < expr.length; j++) {
          if (expr[i].negate().equals(expr[j])) {
            return ContextKeyTrueExpr.INSTANCE;
          }
        }
      }
      if (expr.length === 1) {
        return expr[0];
      }
    }
    return new ContextKeyOrExpr(expr, negated);
  }
  serialize() {
    return this.expr.map((e) => e.serialize()).join(" || ");
  }
  keys() {
    const result = [];
    for (const expr of this.expr) {
      result.push(...expr.keys());
    }
    return result;
  }
  map(mapFnc) {
    return new ContextKeyOrExpr(this.expr.map((expr) => expr.map(mapFnc)), null);
  }
  negate() {
    if (!this.negated) {
      const result = [];
      for (const expr of this.expr) {
        result.push(expr.negate());
      }
      while (result.length > 1) {
        const LEFT = result.shift();
        const RIGHT = result.shift();
        const all = [];
        for (const left of getTerminals(LEFT)) {
          for (const right of getTerminals(RIGHT)) {
            all.push(ContextKeyAndExpr.create([left, right], null, false));
          }
        }
        result.unshift(ContextKeyOrExpr.create(all, null, false));
      }
      this.negated = ContextKeyOrExpr.create(result, this, true);
    }
    return this.negated;
  }
}
const _RawContextKey = class _RawContextKey extends ContextKeyDefinedExpr {
  static all() {
    return _RawContextKey._info.values();
  }
  constructor(key, defaultValue, metaOrHide) {
    super(key, null);
    this._defaultValue = defaultValue;
    if (typeof metaOrHide === "object") {
      _RawContextKey._info.push({ ...metaOrHide, key });
    } else if (metaOrHide !== true) {
      _RawContextKey._info.push({ key, description: metaOrHide, type: defaultValue !== null && defaultValue !== void 0 ? typeof defaultValue : void 0 });
    }
  }
  bindTo(target) {
    return target.createKey(this.key, this._defaultValue);
  }
  getValue(target) {
    return target.getContextKeyValue(this.key);
  }
  toNegated() {
    return this.negate();
  }
  isEqualTo(value) {
    return ContextKeyEqualsExpr.create(this.key, value);
  }
  notEqualsTo(value) {
    return ContextKeyNotEqualsExpr.create(this.key, value);
  }
  greater(value) {
    return ContextKeyGreaterExpr.create(this.key, value);
  }
};
_RawContextKey._info = [];
let RawContextKey = _RawContextKey;
const IContextKeyService = createDecorator("contextKeyService");
function cmp1(key1, key2) {
  if (key1 < key2) {
    return -1;
  }
  if (key1 > key2) {
    return 1;
  }
  return 0;
}
function cmp2(key1, value1, key2, value2) {
  if (key1 < key2) {
    return -1;
  }
  if (key1 > key2) {
    return 1;
  }
  if (value1 < value2) {
    return -1;
  }
  if (value1 > value2) {
    return 1;
  }
  return 0;
}
function implies(p, q) {
  if (p.type === 0 /* False */ || q.type === 1 /* True */) {
    return true;
  }
  if (p.type === 9 /* Or */) {
    if (q.type === 9 /* Or */) {
      return allElementsIncluded(p.expr, q.expr);
    }
    return false;
  }
  if (q.type === 9 /* Or */) {
    for (const element of q.expr) {
      if (implies(p, element)) {
        return true;
      }
    }
    return false;
  }
  if (p.type === 6 /* And */) {
    if (q.type === 6 /* And */) {
      return allElementsIncluded(q.expr, p.expr);
    }
    for (const element of p.expr) {
      if (implies(element, q)) {
        return true;
      }
    }
    return false;
  }
  return p.equals(q);
}
function allElementsIncluded(p, q) {
  let pIndex = 0;
  let qIndex = 0;
  while (pIndex < p.length && qIndex < q.length) {
    const cmp3 = p[pIndex].cmp(q[qIndex]);
    if (cmp3 < 0) {
      return false;
    } else if (cmp3 === 0) {
      pIndex++;
      qIndex++;
    } else {
      qIndex++;
    }
  }
  return pIndex === p.length;
}
function getTerminals(node) {
  if (node.type === 9 /* Or */) {
    return node.expr;
  }
  return [node];
}
export {
  ContextKeyAndExpr,
  ContextKeyDefinedExpr,
  ContextKeyEqualsExpr,
  ContextKeyExpr,
  ContextKeyExprType,
  ContextKeyFalseExpr,
  ContextKeyGreaterEqualsExpr,
  ContextKeyGreaterExpr,
  ContextKeyInExpr,
  ContextKeyNotEqualsExpr,
  ContextKeyNotExpr,
  ContextKeyNotInExpr,
  ContextKeyNotRegexExpr,
  ContextKeyOrExpr,
  ContextKeyRegexExpr,
  ContextKeySmallerEqualsExpr,
  ContextKeySmallerExpr,
  ContextKeyTrueExpr,
  IContextKeyService,
  Parser,
  RawContextKey,
  expressionsAreEqualWithConstantSubstitution,
  implies,
  setConstant,
  validateWhenClauses
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDaGFyQ29kZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NoYXJDb2RlLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgaXNDaHJvbWUsIGlzRWRnZSwgaXNGaXJlZm94LCBpc0xpbnV4LCBpc01hY2ludG9zaCwgaXNTYWZhcmksIGlzV2ViLCBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBpc0ZhbHN5T3JXaGl0ZXNwYWNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBTY2FubmVyLCBMZXhpbmdFcnJvciwgVG9rZW4sIFRva2VuVHlwZSB9IGZyb20gJy4vc2Nhbm5lci5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlsbGVnYWxBcmd1bWVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5cbmNvbnN0IENPTlNUQU5UX1ZBTFVFUyA9IG5ldyBNYXA8c3RyaW5nLCBib29sZWFuPigpO1xuQ09OU1RBTlRfVkFMVUVTLnNldCgnZmFsc2UnLCBmYWxzZSk7XG5DT05TVEFOVF9WQUxVRVMuc2V0KCd0cnVlJywgdHJ1ZSk7XG5DT05TVEFOVF9WQUxVRVMuc2V0KCdpc01hYycsIGlzTWFjaW50b3NoKTtcbkNPTlNUQU5UX1ZBTFVFUy5zZXQoJ2lzTGludXgnLCBpc0xpbnV4KTtcbkNPTlNUQU5UX1ZBTFVFUy5zZXQoJ2lzV2luZG93cycsIGlzV2luZG93cyk7XG5DT05TVEFOVF9WQUxVRVMuc2V0KCdpc1dlYicsIGlzV2ViKTtcbkNPTlNUQU5UX1ZBTFVFUy5zZXQoJ2lzTWFjTmF0aXZlJywgaXNNYWNpbnRvc2ggJiYgIWlzV2ViKTtcbkNPTlNUQU5UX1ZBTFVFUy5zZXQoJ2lzRWRnZScsIGlzRWRnZSk7XG5DT05TVEFOVF9WQUxVRVMuc2V0KCdpc0ZpcmVmb3gnLCBpc0ZpcmVmb3gpO1xuQ09OU1RBTlRfVkFMVUVTLnNldCgnaXNDaHJvbWUnLCBpc0Nocm9tZSk7XG5DT05TVEFOVF9WQUxVRVMuc2V0KCdpc1NhZmFyaScsIGlzU2FmYXJpKTtcblxuLyoqIGFsbG93IHJlZ2lzdGVyIGNvbnN0YW50IGNvbnRleHQga2V5cyB0aGF0IGFyZSBrbm93biBvbmx5IGFmdGVyIHN0YXJ0dXA7IHJlcXVpcmVzIHJ1bm5pbmcgYHN1YnN0aXR1dGVDb25zdGFudHNgIG9uIHRoZSBjb250ZXh0IGtleSAtIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xNzQyMTgjaXNzdWVjb21tZW50LTE0Mzc5NzIxMjcgKi9cbmV4cG9ydCBmdW5jdGlvbiBzZXRDb25zdGFudChrZXk6IHN0cmluZywgdmFsdWU6IGJvb2xlYW4pIHtcblx0aWYgKENPTlNUQU5UX1ZBTFVFUy5nZXQoa2V5KSAhPT0gdW5kZWZpbmVkKSB7IHRocm93IGlsbGVnYWxBcmd1bWVudCgnY29udGV4dGtleS5zZXRDb25zdGFudChrLCB2KSBpbnZva2VkIHdpdGggYWxyZWFkeSBzZXQgY29uc3RhbnQgYGtgJyk7IH1cblxuXHRDT05TVEFOVF9WQUxVRVMuc2V0KGtleSwgdmFsdWUpO1xufVxuXG5jb25zdCBoYXNPd25Qcm9wZXJ0eSA9IE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHk7XG5cbmV4cG9ydCBjb25zdCBlbnVtIENvbnRleHRLZXlFeHByVHlwZSB7XG5cdEZhbHNlID0gMCxcblx0VHJ1ZSA9IDEsXG5cdERlZmluZWQgPSAyLFxuXHROb3QgPSAzLFxuXHRFcXVhbHMgPSA0LFxuXHROb3RFcXVhbHMgPSA1LFxuXHRBbmQgPSA2LFxuXHRSZWdleCA9IDcsXG5cdE5vdFJlZ2V4ID0gOCxcblx0T3IgPSA5LFxuXHRJbiA9IDEwLFxuXHROb3RJbiA9IDExLFxuXHRHcmVhdGVyID0gMTIsXG5cdEdyZWF0ZXJFcXVhbHMgPSAxMyxcblx0U21hbGxlciA9IDE0LFxuXHRTbWFsbGVyRXF1YWxzID0gMTUsXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbnRleHRLZXlFeHByTWFwcGVyIHtcblx0bWFwRGVmaW5lZChrZXk6IHN0cmluZyk6IENvbnRleHRLZXlFeHByZXNzaW9uO1xuXHRtYXBOb3Qoa2V5OiBzdHJpbmcpOiBDb250ZXh0S2V5RXhwcmVzc2lvbjtcblx0bWFwRXF1YWxzKGtleTogc3RyaW5nLCB2YWx1ZTogYW55KTogQ29udGV4dEtleUV4cHJlc3Npb247XG5cdG1hcE5vdEVxdWFscyhrZXk6IHN0cmluZywgdmFsdWU6IGFueSk6IENvbnRleHRLZXlFeHByZXNzaW9uO1xuXHRtYXBHcmVhdGVyKGtleTogc3RyaW5nLCB2YWx1ZTogYW55KTogQ29udGV4dEtleUV4cHJlc3Npb247XG5cdG1hcEdyZWF0ZXJFcXVhbHMoa2V5OiBzdHJpbmcsIHZhbHVlOiBhbnkpOiBDb250ZXh0S2V5RXhwcmVzc2lvbjtcblx0bWFwU21hbGxlcihrZXk6IHN0cmluZywgdmFsdWU6IGFueSk6IENvbnRleHRLZXlFeHByZXNzaW9uO1xuXHRtYXBTbWFsbGVyRXF1YWxzKGtleTogc3RyaW5nLCB2YWx1ZTogYW55KTogQ29udGV4dEtleUV4cHJlc3Npb247XG5cdG1hcFJlZ2V4KGtleTogc3RyaW5nLCByZWdleHA6IFJlZ0V4cCB8IG51bGwpOiBDb250ZXh0S2V5UmVnZXhFeHByO1xuXHRtYXBJbihrZXk6IHN0cmluZywgdmFsdWVLZXk6IHN0cmluZyk6IENvbnRleHRLZXlJbkV4cHI7XG5cdG1hcE5vdEluKGtleTogc3RyaW5nLCB2YWx1ZUtleTogc3RyaW5nKTogQ29udGV4dEtleU5vdEluRXhwcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXHRjbXAob3RoZXI6IENvbnRleHRLZXlFeHByZXNzaW9uKTogbnVtYmVyO1xuXHRlcXVhbHMob3RoZXI6IENvbnRleHRLZXlFeHByZXNzaW9uKTogYm9vbGVhbjtcblx0c3Vic3RpdHV0ZUNvbnN0YW50cygpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IHVuZGVmaW5lZDtcblx0ZXZhbHVhdGUoY29udGV4dDogSUNvbnRleHQpOiBib29sZWFuO1xuXHRzZXJpYWxpemUoKTogc3RyaW5nO1xuXHRrZXlzKCk6IHN0cmluZ1tdO1xuXHRtYXAobWFwRm5jOiBJQ29udGV4dEtleUV4cHJNYXBwZXIpOiBDb250ZXh0S2V5RXhwcmVzc2lvbjtcblx0bmVnYXRlKCk6IENvbnRleHRLZXlFeHByZXNzaW9uO1xuXG59XG5cbmV4cG9ydCB0eXBlIENvbnRleHRLZXlFeHByZXNzaW9uID0gKFxuXHRDb250ZXh0S2V5RmFsc2VFeHByIHwgQ29udGV4dEtleVRydWVFeHByIHwgQ29udGV4dEtleURlZmluZWRFeHByIHwgQ29udGV4dEtleU5vdEV4cHJcblx0fCBDb250ZXh0S2V5RXF1YWxzRXhwciB8IENvbnRleHRLZXlOb3RFcXVhbHNFeHByIHwgQ29udGV4dEtleVJlZ2V4RXhwclxuXHR8IENvbnRleHRLZXlOb3RSZWdleEV4cHIgfCBDb250ZXh0S2V5QW5kRXhwciB8IENvbnRleHRLZXlPckV4cHIgfCBDb250ZXh0S2V5SW5FeHByXG5cdHwgQ29udGV4dEtleU5vdEluRXhwciB8IENvbnRleHRLZXlHcmVhdGVyRXhwciB8IENvbnRleHRLZXlHcmVhdGVyRXF1YWxzRXhwclxuXHR8IENvbnRleHRLZXlTbWFsbGVyRXhwciB8IENvbnRleHRLZXlTbWFsbGVyRXF1YWxzRXhwclxuKTtcblxuXG4vKlxuXG5TeW50YXggZ3JhbW1hcjpcblxuYGBgZWJuZlxuXG5leHByZXNzaW9uIDo6PSBvclxuXG5vciA6Oj0gYW5kIHsgJ3x8JyBhbmQgfSpcblxuYW5kIDo6PSB0ZXJtIHsgJyYmJyB0ZXJtIH0qXG5cbnRlcm0gOjo9XG5cdHwgJyEnIChLRVkgfCB0cnVlIHwgZmFsc2UgfCBwYXJlbnRoZXNpemVkKVxuXHR8IHByaW1hcnlcblxucHJpbWFyeSA6Oj1cblx0fCAndHJ1ZSdcblx0fCAnZmFsc2UnXG5cdHwgcGFyZW50aGVzaXplZFxuXHR8IEtFWSAnPX4nIFJFR0VYXG5cdHwgS0VZIFsgKCc9PScgfCAnIT0nIHwgJzwnIHwgJzw9JyB8ICc+JyB8ICc+PScgfCAnbm90JyAnaW4nIHwgJ2luJykgdmFsdWUgXVxuXG5wYXJlbnRoZXNpemVkIDo6PVxuXHR8ICcoJyBleHByZXNzaW9uICcpJ1xuXG52YWx1ZSA6Oj1cblx0fCAndHJ1ZSdcblx0fCAnZmFsc2UnXG5cdHwgJ2luJyAgICAgIFx0Ly8gd2Ugc3VwcG9ydCBgaW5gIGFzIGEgdmFsdWUgYmVjYXVzZSB0aGVyZSdzIGFuIGV4dGVuc2lvbiB0aGF0IHVzZXMgaXQsIGllIFwid2hlblwiOiBcImxhbmd1YWdlSWQgPT0gaW5cIlxuXHR8IFZBTFVFIFx0XHQvLyBtYXRjaGVkIGJ5IHRoZSBzYW1lIHJlZ2V4IGFzIEtFWTsgY29uc2lkZXIgcHV0dGluZyB0aGUgdmFsdWUgaW4gc2luZ2xlIHF1b3RlcyBpZiBpdCdzIGEgc3RyaW5nIChlLmcuLCB3aXRoIHNwYWNlcylcblx0fCBTSU5HTEVfUVVPVEVEX1NUUlxuXHR8IEVNUFRZX1NUUiAgXHQvLyB0aGlzIGFsbG93cyBcIndoZW5cIjogXCJmb28gPT0gXCIgd2hpY2gncyB1c2VkIGJ5IGV4aXN0aW5nIGV4dGVuc2lvbnNcblxuYGBgXG4qL1xuXG5leHBvcnQgdHlwZSBQYXJzZXJDb25maWcgPSB7XG5cdC8qKlxuXHQgKiB3aXRoIHRoaXMgb3B0aW9uIGVuYWJsZWQsIHRoZSBwYXJzZXIgY2FuIHJlY292ZXIgZnJvbSByZWdleCBwYXJzaW5nIGVycm9ycywgZS5nLiwgdW5lc2NhcGVkIHNsYXNoZXM6IGAvc3JjLy9gIGlzIGFjY2VwdGVkIGFzIGAvc3JjXFwvL2Agd291bGQgYmVcblx0ICovXG5cdHJlZ2V4UGFyc2luZ1dpdGhFcnJvclJlY292ZXJ5OiBib29sZWFuO1xufTtcblxuY29uc3QgZGVmYXVsdENvbmZpZzogUGFyc2VyQ29uZmlnID0ge1xuXHRyZWdleFBhcnNpbmdXaXRoRXJyb3JSZWNvdmVyeTogdHJ1ZVxufTtcblxuZXhwb3J0IHR5cGUgUGFyc2luZ0Vycm9yID0ge1xuXHRtZXNzYWdlOiBzdHJpbmc7XG5cdG9mZnNldDogbnVtYmVyO1xuXHRsZXhlbWU6IHN0cmluZztcblx0YWRkaXRpb25hbEluZm8/OiBzdHJpbmc7XG59O1xuXG5jb25zdCBlcnJvckVtcHR5U3RyaW5nID0gbG9jYWxpemUoJ2NvbnRleHRrZXkucGFyc2VyLmVycm9yLmVtcHR5U3RyaW5nJywgXCJFbXB0eSBjb250ZXh0IGtleSBleHByZXNzaW9uXCIpO1xuY29uc3QgaGludEVtcHR5U3RyaW5nID0gbG9jYWxpemUoJ2NvbnRleHRrZXkucGFyc2VyLmVycm9yLmVtcHR5U3RyaW5nLmhpbnQnLCBcIkRpZCB5b3UgZm9yZ2V0IHRvIHdyaXRlIGFuIGV4cHJlc3Npb24/IFlvdSBjYW4gYWxzbyBwdXQgJ2ZhbHNlJyBvciAndHJ1ZScgdG8gYWx3YXlzIGV2YWx1YXRlIHRvIGZhbHNlIG9yIHRydWUsIHJlc3BlY3RpdmVseS5cIik7XG5jb25zdCBlcnJvck5vSW5BZnRlck5vdCA9IGxvY2FsaXplKCdjb250ZXh0a2V5LnBhcnNlci5lcnJvci5ub0luQWZ0ZXJOb3QnLCBcIidpbicgYWZ0ZXIgJ25vdCcuXCIpO1xuY29uc3QgZXJyb3JDbG9zaW5nUGFyZW50aGVzaXMgPSBsb2NhbGl6ZSgnY29udGV4dGtleS5wYXJzZXIuZXJyb3IuY2xvc2luZ1BhcmVudGhlc2lzJywgXCJjbG9zaW5nIHBhcmVudGhlc2lzICcpJ1wiKTtcbmNvbnN0IGVycm9yVW5leHBlY3RlZFRva2VuID0gbG9jYWxpemUoJ2NvbnRleHRrZXkucGFyc2VyLmVycm9yLnVuZXhwZWN0ZWRUb2tlbicsIFwiVW5leHBlY3RlZCB0b2tlblwiKTtcbmNvbnN0IGhpbnRVbmV4cGVjdGVkVG9rZW4gPSBsb2NhbGl6ZSgnY29udGV4dGtleS5wYXJzZXIuZXJyb3IudW5leHBlY3RlZFRva2VuLmhpbnQnLCBcIkRpZCB5b3UgZm9yZ2V0IHRvIHB1dCAmJiBvciB8fCBiZWZvcmUgdGhlIHRva2VuP1wiKTtcbmNvbnN0IGVycm9yVW5leHBlY3RlZEVPRiA9IGxvY2FsaXplKCdjb250ZXh0a2V5LnBhcnNlci5lcnJvci51bmV4cGVjdGVkRU9GJywgXCJVbmV4cGVjdGVkIGVuZCBvZiBleHByZXNzaW9uXCIpO1xuY29uc3QgaGludFVuZXhwZWN0ZWRFT0YgPSBsb2NhbGl6ZSgnY29udGV4dGtleS5wYXJzZXIuZXJyb3IudW5leHBlY3RlZEVPRi5oaW50JywgXCJEaWQgeW91IGZvcmdldCB0byBwdXQgYSBjb250ZXh0IGtleT9cIik7XG5cbi8qKlxuICogQSBwYXJzZXIgZm9yIGNvbnRleHQga2V5IGV4cHJlc3Npb25zLlxuICpcbiAqIEV4YW1wbGU6XG4gKiBgYGB0c1xuICogY29uc3QgcGFyc2VyID0gbmV3IFBhcnNlcigpO1xuICogY29uc3QgZXhwciA9IHBhcnNlci5wYXJzZSgnZm9vID09IFwiYmFyXCIgJiYgYmF6ID09IHRydWUnKTtcbiAqXG4gKiBpZiAoZXhwciA9PT0gdW5kZWZpbmVkKSB7XG4gKiBcdC8vIHRoZXJlIHdlcmUgbGV4aW5nIG9yIHBhcnNpbmcgZXJyb3JzXG4gKiBcdC8vIHByb2Nlc3MgbGV4aW5nIGVycm9ycyB3aXRoIGBwYXJzZXIubGV4aW5nRXJyb3JzYFxuICogIC8vIHByb2Nlc3MgcGFyc2luZyBlcnJvcnMgd2l0aCBgcGFyc2VyLnBhcnNpbmdFcnJvcnNgXG4gKiB9IGVsc2Uge1xuICogXHQvLyBleHByIGlzIGEgdmFsaWQgZXhwcmVzc2lvblxuICogfVxuICogYGBgXG4gKi9cbmV4cG9ydCBjbGFzcyBQYXJzZXIge1xuXHQvLyBOb3RlOiB0aGlzIGRvZXNuJ3QgcHJvZHVjZSBhbiBleGFjdCBzeW50YXggdHJlZSBidXQgYSBub3JtYWxpemVkIG9uZVxuXHQvLyBDb250ZXh0S2V5RXhwcmVzc2lvbidzIHRoYXQgd2UgdXNlIGFzIEFTVCBub2RlcyBkbyBub3QgZXhwb3NlIGNvbnN0cnVjdG9ycyB0aGF0IGRvIG5vdCBub3JtYWxpemVcblxuXHRwcml2YXRlIHN0YXRpYyBfcGFyc2VFcnJvciA9IG5ldyBFcnJvcigpO1xuXG5cdC8vIGxpZmV0aW1lIG5vdGU6IGBfc2Nhbm5lcmAgbGl2ZXMgYXMgbG9uZyBhcyB0aGUgcGFyc2VyIGRvZXMsIGkuZS4sIGlzIG5vdCByZXNldCBiZXR3ZWVuIGNhbGxzIHRvIGBwYXJzZWBcblx0cHJpdmF0ZSByZWFkb25seSBfc2Nhbm5lciA9IG5ldyBTY2FubmVyKCk7XG5cblx0Ly8gbGlmZXRpbWUgbm90ZTogYF90b2tlbnNgLCBgX2N1cnJlbnRgLCBhbmQgYF9wYXJzaW5nRXJyb3JzYCBtdXN0IGJlIHJlc2V0IGJldHdlZW4gY2FsbHMgdG8gYHBhcnNlYFxuXHRwcml2YXRlIF90b2tlbnM6IFRva2VuW10gPSBbXTtcblx0cHJpdmF0ZSBfY3VycmVudCA9IDA7IFx0XHRcdFx0XHQvLyBpbnZhcmlhbnQ6IDAgPD0gdGhpcy5fY3VycmVudCA8IHRoaXMuX3Rva2Vucy5sZW5ndGggOyBhbnkgaW5jcmVtZW50YXRpb24gb2YgdGhpcyB2YWx1ZSBtdXN0IGZpcnN0IGNhbGwgYF9pc0F0RW5kYFxuXHRwcml2YXRlIF9wYXJzaW5nRXJyb3JzOiBQYXJzaW5nRXJyb3JbXSA9IFtdO1xuXG5cdGdldCBsZXhpbmdFcnJvcnMoKTogUmVhZG9ubHk8TGV4aW5nRXJyb3JbXT4ge1xuXHRcdHJldHVybiB0aGlzLl9zY2FubmVyLmVycm9ycztcblx0fVxuXG5cdGdldCBwYXJzaW5nRXJyb3JzKCk6IFJlYWRvbmx5PFBhcnNpbmdFcnJvcltdPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3BhcnNpbmdFcnJvcnM7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IF9jb25maWc6IFBhcnNlckNvbmZpZyA9IGRlZmF1bHRDb25maWcpIHtcblx0fVxuXG5cdC8qKlxuXHQgKiBQYXJzZSBhIGNvbnRleHQga2V5IGV4cHJlc3Npb24uXG5cdCAqXG5cdCAqIEBwYXJhbSBpbnB1dCB0aGUgZXhwcmVzc2lvbiB0byBwYXJzZVxuXHQgKiBAcmV0dXJucyB0aGUgcGFyc2VkIGV4cHJlc3Npb24gb3IgYHVuZGVmaW5lZGAgaWYgdGhlcmUncyBhbiBlcnJvciAtIGNhbGwgYGxleGluZ0Vycm9yc2AgYW5kIGBwYXJzaW5nRXJyb3JzYCB0byBzZWUgdGhlIGVycm9yc1xuXHQgKi9cblx0cGFyc2UoaW5wdXQ6IHN0cmluZyk6IENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkIHtcblxuXHRcdGlmIChpbnB1dCA9PT0gJycpIHtcblx0XHRcdHRoaXMuX3BhcnNpbmdFcnJvcnMucHVzaCh7IG1lc3NhZ2U6IGVycm9yRW1wdHlTdHJpbmcsIG9mZnNldDogMCwgbGV4ZW1lOiAnJywgYWRkaXRpb25hbEluZm86IGhpbnRFbXB0eVN0cmluZyB9KTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5fdG9rZW5zID0gdGhpcy5fc2Nhbm5lci5yZXNldChpbnB1dCkuc2NhbigpO1xuXHRcdC8vIEB1bHVnYmVrbmE6IHdlIGRvIG5vdCBzdG9wIHBhcnNpbmcgaWYgdGhlcmUgYXJlIGxleGluZyBlcnJvcnMgdG8gYmUgYWJsZSB0byByZWNvbnN0cnVjdCByZWdleGVzIHdpdGggdW5lc2NhcGVkIHNsYXNoZXM7IFRPRE9AdWx1Z2Jla25hOiBtYWtlIHRoaXMgcmVzcGVjdCBjb25maWcgb3B0aW9uIGZvciByZWNvdmVyeVxuXG5cdFx0dGhpcy5fY3VycmVudCA9IDA7XG5cdFx0dGhpcy5fcGFyc2luZ0Vycm9ycyA9IFtdO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGV4cHIgPSB0aGlzLl9leHByKCk7XG5cdFx0XHRpZiAoIXRoaXMuX2lzQXRFbmQoKSkge1xuXHRcdFx0XHRjb25zdCBwZWVrID0gdGhpcy5fcGVlaygpO1xuXHRcdFx0XHRjb25zdCBhZGRpdGlvbmFsSW5mbyA9IHBlZWsudHlwZSA9PT0gVG9rZW5UeXBlLlN0ciA/IGhpbnRVbmV4cGVjdGVkVG9rZW4gOiB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuX3BhcnNpbmdFcnJvcnMucHVzaCh7IG1lc3NhZ2U6IGVycm9yVW5leHBlY3RlZFRva2VuLCBvZmZzZXQ6IHBlZWsub2Zmc2V0LCBsZXhlbWU6IFNjYW5uZXIuZ2V0TGV4ZW1lKHBlZWspLCBhZGRpdGlvbmFsSW5mbyB9KTtcblx0XHRcdFx0dGhyb3cgUGFyc2VyLl9wYXJzZUVycm9yO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGV4cHI7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0aWYgKCEoZSA9PT0gUGFyc2VyLl9wYXJzZUVycm9yKSkge1xuXHRcdFx0XHR0aHJvdyBlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9leHByKCk6IENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fb3IoKTtcblx0fVxuXG5cdHByaXZhdGUgX29yKCk6IENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBleHByID0gW3RoaXMuX2FuZCgpXTtcblxuXHRcdHdoaWxlICh0aGlzLl9tYXRjaE9uZShUb2tlblR5cGUuT3IpKSB7XG5cdFx0XHRjb25zdCByaWdodCA9IHRoaXMuX2FuZCgpO1xuXHRcdFx0ZXhwci5wdXNoKHJpZ2h0KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZXhwci5sZW5ndGggPT09IDEgPyBleHByWzBdIDogQ29udGV4dEtleUV4cHIub3IoLi4uZXhwcik7XG5cdH1cblxuXHRwcml2YXRlIF9hbmQoKTogQ29udGV4dEtleUV4cHJlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGV4cHIgPSBbdGhpcy5fdGVybSgpXTtcblxuXHRcdHdoaWxlICh0aGlzLl9tYXRjaE9uZShUb2tlblR5cGUuQW5kKSkge1xuXHRcdFx0Y29uc3QgcmlnaHQgPSB0aGlzLl90ZXJtKCk7XG5cdFx0XHRleHByLnB1c2gocmlnaHQpO1xuXHRcdH1cblxuXHRcdHJldHVybiBleHByLmxlbmd0aCA9PT0gMSA/IGV4cHJbMF0gOiBDb250ZXh0S2V5RXhwci5hbmQoLi4uZXhwcik7XG5cdH1cblxuXHRwcml2YXRlIF90ZXJtKCk6IENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5fbWF0Y2hPbmUoVG9rZW5UeXBlLk5lZykpIHtcblx0XHRcdGNvbnN0IHBlZWsgPSB0aGlzLl9wZWVrKCk7XG5cdFx0XHRzd2l0Y2ggKHBlZWsudHlwZSkge1xuXHRcdFx0XHRjYXNlIFRva2VuVHlwZS5UcnVlOlxuXHRcdFx0XHRcdHRoaXMuX2FkdmFuY2UoKTtcblx0XHRcdFx0XHRyZXR1cm4gQ29udGV4dEtleUZhbHNlRXhwci5JTlNUQU5DRTtcblx0XHRcdFx0Y2FzZSBUb2tlblR5cGUuRmFsc2U6XG5cdFx0XHRcdFx0dGhpcy5fYWR2YW5jZSgpO1xuXHRcdFx0XHRcdHJldHVybiBDb250ZXh0S2V5VHJ1ZUV4cHIuSU5TVEFOQ0U7XG5cdFx0XHRcdGNhc2UgVG9rZW5UeXBlLkxQYXJlbjoge1xuXHRcdFx0XHRcdHRoaXMuX2FkdmFuY2UoKTtcblx0XHRcdFx0XHRjb25zdCBleHByID0gdGhpcy5fZXhwcigpO1xuXHRcdFx0XHRcdHRoaXMuX2NvbnN1bWUoVG9rZW5UeXBlLlJQYXJlbiwgZXJyb3JDbG9zaW5nUGFyZW50aGVzaXMpO1xuXHRcdFx0XHRcdHJldHVybiBleHByPy5uZWdhdGUoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlIFRva2VuVHlwZS5TdHI6XG5cdFx0XHRcdFx0dGhpcy5fYWR2YW5jZSgpO1xuXHRcdFx0XHRcdHJldHVybiBDb250ZXh0S2V5Tm90RXhwci5jcmVhdGUocGVlay5sZXhlbWUpO1xuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdHRocm93IHRoaXMuX2VyckV4cGVjdGVkQnV0R290KGBLRVkgfCB0cnVlIHwgZmFsc2UgfCAnKCcgZXhwcmVzc2lvbiAnKSdgLCBwZWVrKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3ByaW1hcnkoKTtcblx0fVxuXG5cdHByaXZhdGUgX3ByaW1hcnkoKTogQ29udGV4dEtleUV4cHJlc3Npb24gfCB1bmRlZmluZWQge1xuXG5cdFx0Y29uc3QgcGVlayA9IHRoaXMuX3BlZWsoKTtcblx0XHRzd2l0Y2ggKHBlZWsudHlwZSkge1xuXHRcdFx0Y2FzZSBUb2tlblR5cGUuVHJ1ZTpcblx0XHRcdFx0dGhpcy5fYWR2YW5jZSgpO1xuXHRcdFx0XHRyZXR1cm4gQ29udGV4dEtleUV4cHIudHJ1ZSgpO1xuXG5cdFx0XHRjYXNlIFRva2VuVHlwZS5GYWxzZTpcblx0XHRcdFx0dGhpcy5fYWR2YW5jZSgpO1xuXHRcdFx0XHRyZXR1cm4gQ29udGV4dEtleUV4cHIuZmFsc2UoKTtcblxuXHRcdFx0Y2FzZSBUb2tlblR5cGUuTFBhcmVuOiB7XG5cdFx0XHRcdHRoaXMuX2FkdmFuY2UoKTtcblx0XHRcdFx0Y29uc3QgZXhwciA9IHRoaXMuX2V4cHIoKTtcblx0XHRcdFx0dGhpcy5fY29uc3VtZShUb2tlblR5cGUuUlBhcmVuLCBlcnJvckNsb3NpbmdQYXJlbnRoZXNpcyk7XG5cdFx0XHRcdHJldHVybiBleHByO1xuXHRcdFx0fVxuXG5cdFx0XHRjYXNlIFRva2VuVHlwZS5TdHI6IHtcblx0XHRcdFx0Ly8gS0VZXG5cdFx0XHRcdGNvbnN0IGtleSA9IHBlZWsubGV4ZW1lO1xuXHRcdFx0XHR0aGlzLl9hZHZhbmNlKCk7XG5cblx0XHRcdFx0Ly8gPX4gcmVnZXhcblx0XHRcdFx0aWYgKHRoaXMuX21hdGNoT25lKFRva2VuVHlwZS5SZWdleE9wKSkge1xuXG5cdFx0XHRcdFx0Ly8gQHVsdWdiZWtuYTogd2UgbmVlZCB0byByZWNvbnN0cnVjdCB0aGUgcmVnZXggZnJvbSB0aGUgdG9rZW5zIGJlY2F1c2Ugc29tZSBleHRlbnNpb25zIHVzZSB1bmVzY2FwZWQgc2xhc2hlcyBpbiByZWdleGVzXG5cdFx0XHRcdFx0Y29uc3QgZXhwciA9IHRoaXMuX3BlZWsoKTtcblxuXHRcdFx0XHRcdGlmICghdGhpcy5fY29uZmlnLnJlZ2V4UGFyc2luZ1dpdGhFcnJvclJlY292ZXJ5KSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9hZHZhbmNlKCk7XG5cdFx0XHRcdFx0XHRpZiAoZXhwci50eXBlICE9PSBUb2tlblR5cGUuUmVnZXhTdHIpIHtcblx0XHRcdFx0XHRcdFx0dGhyb3cgdGhpcy5fZXJyRXhwZWN0ZWRCdXRHb3QoYFJFR0VYYCwgZXhwcik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjb25zdCByZWdleExleGVtZSA9IGV4cHIubGV4ZW1lO1xuXHRcdFx0XHRcdFx0Y29uc3QgY2xvc2luZ1NsYXNoSW5kZXggPSByZWdleExleGVtZS5sYXN0SW5kZXhPZignLycpO1xuXHRcdFx0XHRcdFx0Y29uc3QgZmxhZ3MgPSBjbG9zaW5nU2xhc2hJbmRleCA9PT0gcmVnZXhMZXhlbWUubGVuZ3RoIC0gMSA/IHVuZGVmaW5lZCA6IHRoaXMuX3JlbW92ZUZsYWdzR1kocmVnZXhMZXhlbWUuc3Vic3RyaW5nKGNsb3NpbmdTbGFzaEluZGV4ICsgMSkpO1xuXHRcdFx0XHRcdFx0bGV0IHJlZ2V4cDogUmVnRXhwIHwgbnVsbDtcblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdHJlZ2V4cCA9IG5ldyBSZWdFeHAocmVnZXhMZXhlbWUuc3Vic3RyaW5nKDEsIGNsb3NpbmdTbGFzaEluZGV4KSwgZmxhZ3MpO1xuXHRcdFx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdFx0XHR0aHJvdyB0aGlzLl9lcnJFeHBlY3RlZEJ1dEdvdChgUkVHRVhgLCBleHByKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiBDb250ZXh0S2V5UmVnZXhFeHByLmNyZWF0ZShrZXksIHJlZ2V4cCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0c3dpdGNoIChleHByLnR5cGUpIHtcblx0XHRcdFx0XHRcdGNhc2UgVG9rZW5UeXBlLlJlZ2V4U3RyOlxuXHRcdFx0XHRcdFx0Y2FzZSBUb2tlblR5cGUuRXJyb3I6IHsgLy8gYWxzbyBoYW5kbGUgYW4gRXJyb3JUb2tlbiBpbiBjYXNlIG9mIHNtdGggc3VjaCBhcyAvKC9maWxlKS9cblx0XHRcdFx0XHRcdFx0Y29uc3QgbGV4ZW1lUmVjb25zdHJ1Y3Rpb24gPSBbZXhwci5sZXhlbWVdOyAvLyAvUkVHRVgvIG9yIC9SRUdFWC9GTEFHU1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9hZHZhbmNlKCk7XG5cblx0XHRcdFx0XHRcdFx0bGV0IGZvbGxvd2luZ1Rva2VuID0gdGhpcy5fcGVlaygpO1xuXHRcdFx0XHRcdFx0XHRsZXQgcGFyZW5CYWxhbmNlID0gMDtcblx0XHRcdFx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBleHByLmxleGVtZS5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdFx0XHRcdGlmIChleHByLmxleGVtZS5jaGFyQ29kZUF0KGkpID09PSBDaGFyQ29kZS5PcGVuUGFyZW4pIHtcblx0XHRcdFx0XHRcdFx0XHRcdHBhcmVuQmFsYW5jZSsrO1xuXHRcdFx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoZXhwci5sZXhlbWUuY2hhckNvZGVBdChpKSA9PT0gQ2hhckNvZGUuQ2xvc2VQYXJlbikge1xuXHRcdFx0XHRcdFx0XHRcdFx0cGFyZW5CYWxhbmNlLS07XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0d2hpbGUgKCF0aGlzLl9pc0F0RW5kKCkgJiYgZm9sbG93aW5nVG9rZW4udHlwZSAhPT0gVG9rZW5UeXBlLkFuZCAmJiBmb2xsb3dpbmdUb2tlbi50eXBlICE9PSBUb2tlblR5cGUuT3IpIHtcblx0XHRcdFx0XHRcdFx0XHRzd2l0Y2ggKGZvbGxvd2luZ1Rva2VuLnR5cGUpIHtcblx0XHRcdFx0XHRcdFx0XHRcdGNhc2UgVG9rZW5UeXBlLkxQYXJlbjpcblx0XHRcdFx0XHRcdFx0XHRcdFx0cGFyZW5CYWxhbmNlKys7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHRcdFx0Y2FzZSBUb2tlblR5cGUuUlBhcmVuOlxuXHRcdFx0XHRcdFx0XHRcdFx0XHRwYXJlbkJhbGFuY2UtLTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRcdFx0XHRjYXNlIFRva2VuVHlwZS5SZWdleFN0cjpcblx0XHRcdFx0XHRcdFx0XHRcdGNhc2UgVG9rZW5UeXBlLlF1b3RlZFN0cjpcblx0XHRcdFx0XHRcdFx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBmb2xsb3dpbmdUb2tlbi5sZXhlbWUubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRpZiAoZm9sbG93aW5nVG9rZW4ubGV4ZW1lLmNoYXJDb2RlQXQoaSkgPT09IENoYXJDb2RlLk9wZW5QYXJlbikge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0cGFyZW5CYWxhbmNlKys7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0fSBlbHNlIGlmIChleHByLmxleGVtZS5jaGFyQ29kZUF0KGkpID09PSBDaGFyQ29kZS5DbG9zZVBhcmVuKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRwYXJlbkJhbGFuY2UtLTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0aWYgKHBhcmVuQmFsYW5jZSA8IDApIHtcblx0XHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRsZXhlbWVSZWNvbnN0cnVjdGlvbi5wdXNoKFNjYW5uZXIuZ2V0TGV4ZW1lKGZvbGxvd2luZ1Rva2VuKSk7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fYWR2YW5jZSgpO1xuXHRcdFx0XHRcdFx0XHRcdGZvbGxvd2luZ1Rva2VuID0gdGhpcy5fcGVlaygpO1xuXHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0Y29uc3QgcmVnZXhMZXhlbWUgPSBsZXhlbWVSZWNvbnN0cnVjdGlvbi5qb2luKCcnKTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgY2xvc2luZ1NsYXNoSW5kZXggPSByZWdleExleGVtZS5sYXN0SW5kZXhPZignLycpO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBmbGFncyA9IGNsb3NpbmdTbGFzaEluZGV4ID09PSByZWdleExleGVtZS5sZW5ndGggLSAxID8gdW5kZWZpbmVkIDogdGhpcy5fcmVtb3ZlRmxhZ3NHWShyZWdleExleGVtZS5zdWJzdHJpbmcoY2xvc2luZ1NsYXNoSW5kZXggKyAxKSk7XG5cdFx0XHRcdFx0XHRcdGxldCByZWdleHA6IFJlZ0V4cCB8IG51bGw7XG5cdFx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdFx0cmVnZXhwID0gbmV3IFJlZ0V4cChyZWdleExleGVtZS5zdWJzdHJpbmcoMSwgY2xvc2luZ1NsYXNoSW5kZXgpLCBmbGFncyk7XG5cdFx0XHRcdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRcdFx0XHR0aHJvdyB0aGlzLl9lcnJFeHBlY3RlZEJ1dEdvdChgUkVHRVhgLCBleHByKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gQ29udGV4dEtleUV4cHIucmVnZXgoa2V5LCByZWdleHApO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRjYXNlIFRva2VuVHlwZS5RdW90ZWRTdHI6IHtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgc2VyaWFsaXplZFZhbHVlID0gZXhwci5sZXhlbWU7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2FkdmFuY2UoKTtcblx0XHRcdFx0XHRcdFx0Ly8gcmVwbGljYXRlIG9sZCByZWdleCBwYXJzaW5nIGJlaGF2aW9yXG5cblx0XHRcdFx0XHRcdFx0bGV0IHJlZ2V4OiBSZWdFeHAgfCBudWxsID0gbnVsbDtcblxuXHRcdFx0XHRcdFx0XHRpZiAoIWlzRmFsc3lPcldoaXRlc3BhY2Uoc2VyaWFsaXplZFZhbHVlKSkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IHN0YXJ0ID0gc2VyaWFsaXplZFZhbHVlLmluZGV4T2YoJy8nKTtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBlbmQgPSBzZXJpYWxpemVkVmFsdWUubGFzdEluZGV4T2YoJy8nKTtcblx0XHRcdFx0XHRcdFx0XHRpZiAoc3RhcnQgIT09IGVuZCAmJiBzdGFydCA+PSAwKSB7XG5cblx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IHZhbHVlID0gc2VyaWFsaXplZFZhbHVlLnNsaWNlKHN0YXJ0ICsgMSwgZW5kKTtcblx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IGNhc2VJZ25vcmVGbGFnID0gc2VyaWFsaXplZFZhbHVlW2VuZCArIDFdID09PSAnaScgPyAnaScgOiAnJztcblx0XHRcdFx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHJlZ2V4ID0gbmV3IFJlZ0V4cCh2YWx1ZSwgY2FzZUlnbm9yZUZsYWcpO1xuXHRcdFx0XHRcdFx0XHRcdFx0fSBjYXRjaCAoX2UpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0dGhyb3cgdGhpcy5fZXJyRXhwZWN0ZWRCdXRHb3QoYFJFR0VYYCwgZXhwcik7XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0aWYgKHJlZ2V4ID09PSBudWxsKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhyb3cgdGhpcy5fZXJyRXhwZWN0ZWRCdXRHb3QoJ1JFR0VYJywgZXhwcik7XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gQ29udGV4dEtleVJlZ2V4RXhwci5jcmVhdGUoa2V5LCByZWdleCk7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHRcdHRocm93IHRoaXMuX2VyckV4cGVjdGVkQnV0R290KCdSRUdFWCcsIHRoaXMuX3BlZWsoKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gWyAnbm90JyAnaW4nIHZhbHVlIF1cblx0XHRcdFx0aWYgKHRoaXMuX21hdGNoT25lKFRva2VuVHlwZS5Ob3QpKSB7XG5cdFx0XHRcdFx0dGhpcy5fY29uc3VtZShUb2tlblR5cGUuSW4sIGVycm9yTm9JbkFmdGVyTm90KTtcblx0XHRcdFx0XHRjb25zdCByaWdodCA9IHRoaXMuX3ZhbHVlKCk7XG5cdFx0XHRcdFx0cmV0dXJuIENvbnRleHRLZXlFeHByLm5vdEluKGtleSwgcmlnaHQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gWyAoJz09JyB8ICchPScgfCAnPCcgfCAnPD0nIHwgJz4nIHwgJz49JyB8ICdpbicpIHZhbHVlIF1cblx0XHRcdFx0Y29uc3QgbWF5YmVPcCA9IHRoaXMuX3BlZWsoKS50eXBlO1xuXHRcdFx0XHRzd2l0Y2ggKG1heWJlT3ApIHtcblx0XHRcdFx0XHRjYXNlIFRva2VuVHlwZS5FcToge1xuXHRcdFx0XHRcdFx0dGhpcy5fYWR2YW5jZSgpO1xuXG5cdFx0XHRcdFx0XHRjb25zdCByaWdodCA9IHRoaXMuX3ZhbHVlKCk7XG5cdFx0XHRcdFx0XHRpZiAodGhpcy5fcHJldmlvdXMoKS50eXBlID09PSBUb2tlblR5cGUuUXVvdGVkU3RyKSB7IC8vIHRvIHByZXNlcnZlIG9sZCBwYXJzZXIgYmVoYXZpb3I6IFwiZm9vID09ICd0cnVlJ1wiIGlzIHByZXNlcnZlZCBhcyBcImZvbyA9PSAndHJ1ZSdcIiwgYnV0IFwiZm9vID09IHRydWVcIiBpcyBvcHRpbWl6ZWQgYXMgXCJmb29cIlxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gQ29udGV4dEtleUV4cHIuZXF1YWxzKGtleSwgcmlnaHQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0c3dpdGNoIChyaWdodCkge1xuXHRcdFx0XHRcdFx0XHRjYXNlICd0cnVlJzpcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gQ29udGV4dEtleUV4cHIuaGFzKGtleSk7XG5cdFx0XHRcdFx0XHRcdGNhc2UgJ2ZhbHNlJzpcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gQ29udGV4dEtleUV4cHIubm90KGtleSk7XG5cdFx0XHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIENvbnRleHRLZXlFeHByLmVxdWFscyhrZXksIHJpZ2h0KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjYXNlIFRva2VuVHlwZS5Ob3RFcToge1xuXHRcdFx0XHRcdFx0dGhpcy5fYWR2YW5jZSgpO1xuXG5cdFx0XHRcdFx0XHRjb25zdCByaWdodCA9IHRoaXMuX3ZhbHVlKCk7XG5cdFx0XHRcdFx0XHRpZiAodGhpcy5fcHJldmlvdXMoKS50eXBlID09PSBUb2tlblR5cGUuUXVvdGVkU3RyKSB7IC8vIHNhbWUgYXMgYWJvdmUgd2l0aCBcImZvbyAhPSAndHJ1ZSdcIlxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gQ29udGV4dEtleUV4cHIubm90RXF1YWxzKGtleSwgcmlnaHQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0c3dpdGNoIChyaWdodCkge1xuXHRcdFx0XHRcdFx0XHRjYXNlICd0cnVlJzpcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gQ29udGV4dEtleUV4cHIubm90KGtleSk7XG5cdFx0XHRcdFx0XHRcdGNhc2UgJ2ZhbHNlJzpcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gQ29udGV4dEtleUV4cHIuaGFzKGtleSk7XG5cdFx0XHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIENvbnRleHRLZXlFeHByLm5vdEVxdWFscyhrZXksIHJpZ2h0KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly8gVE9ETzogQ29udGV4dEtleUV4cHIuc21hbGxlcihrZXksIHJpZ2h0KSBhY2NlcHRzIG9ubHkgYG51bWJlcmAgYXMgYHJpZ2h0YCBBTkQgZHVyaW5nIGV2YWwgb2YgdGhpcyBub2RlLCB3ZSBqdXN0IGV2YWwgdG8gYGZhbHNlYCBpZiBgcmlnaHRgIGlzIG5vdCBhIG51bWJlclxuXHRcdFx0XHRcdC8vIGNvbnNlcXVlbnRseSwgcGFja2FnZS5qc29uIGxpbnRlciBzaG91bGQgX3dhcm5fIHRoZSB1c2VyIGlmIHRoZXkncmUgcGFzc2luZyB1bmRlc2lyZWQgdGhpbmdzIHRvIG9wc1xuXHRcdFx0XHRcdGNhc2UgVG9rZW5UeXBlLkx0OlxuXHRcdFx0XHRcdFx0dGhpcy5fYWR2YW5jZSgpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIENvbnRleHRLZXlTbWFsbGVyRXhwci5jcmVhdGUoa2V5LCB0aGlzLl92YWx1ZSgpKTtcblxuXHRcdFx0XHRcdGNhc2UgVG9rZW5UeXBlLkx0RXE6XG5cdFx0XHRcdFx0XHR0aGlzLl9hZHZhbmNlKCk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gQ29udGV4dEtleVNtYWxsZXJFcXVhbHNFeHByLmNyZWF0ZShrZXksIHRoaXMuX3ZhbHVlKCkpO1xuXG5cdFx0XHRcdFx0Y2FzZSBUb2tlblR5cGUuR3Q6XG5cdFx0XHRcdFx0XHR0aGlzLl9hZHZhbmNlKCk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gQ29udGV4dEtleUdyZWF0ZXJFeHByLmNyZWF0ZShrZXksIHRoaXMuX3ZhbHVlKCkpO1xuXG5cdFx0XHRcdFx0Y2FzZSBUb2tlblR5cGUuR3RFcTpcblx0XHRcdFx0XHRcdHRoaXMuX2FkdmFuY2UoKTtcblx0XHRcdFx0XHRcdHJldHVybiBDb250ZXh0S2V5R3JlYXRlckVxdWFsc0V4cHIuY3JlYXRlKGtleSwgdGhpcy5fdmFsdWUoKSk7XG5cblx0XHRcdFx0XHRjYXNlIFRva2VuVHlwZS5Jbjpcblx0XHRcdFx0XHRcdHRoaXMuX2FkdmFuY2UoKTtcblx0XHRcdFx0XHRcdHJldHVybiBDb250ZXh0S2V5RXhwci5pbihrZXksIHRoaXMuX3ZhbHVlKCkpO1xuXG5cdFx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRcdHJldHVybiBDb250ZXh0S2V5RXhwci5oYXMoa2V5KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjYXNlIFRva2VuVHlwZS5FT0Y6XG5cdFx0XHRcdHRoaXMuX3BhcnNpbmdFcnJvcnMucHVzaCh7IG1lc3NhZ2U6IGVycm9yVW5leHBlY3RlZEVPRiwgb2Zmc2V0OiBwZWVrLm9mZnNldCwgbGV4ZW1lOiAnJywgYWRkaXRpb25hbEluZm86IGhpbnRVbmV4cGVjdGVkRU9GIH0pO1xuXHRcdFx0XHR0aHJvdyBQYXJzZXIuX3BhcnNlRXJyb3I7XG5cblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHRocm93IHRoaXMuX2VyckV4cGVjdGVkQnV0R290KGB0cnVlIHwgZmFsc2UgfCBLRVkgXFxuXFx0fCBLRVkgJz1+JyBSRUdFWCBcXG5cXHR8IEtFWSAoJz09JyB8ICchPScgfCAnPCcgfCAnPD0nIHwgJz4nIHwgJz49JyB8ICdpbicgfCAnbm90JyAnaW4nKSB2YWx1ZWAsIHRoaXMuX3BlZWsoKSk7XG5cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF92YWx1ZSgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHRva2VuID0gdGhpcy5fcGVlaygpO1xuXHRcdHN3aXRjaCAodG9rZW4udHlwZSkge1xuXHRcdFx0Y2FzZSBUb2tlblR5cGUuU3RyOlxuXHRcdFx0Y2FzZSBUb2tlblR5cGUuUXVvdGVkU3RyOlxuXHRcdFx0XHR0aGlzLl9hZHZhbmNlKCk7XG5cdFx0XHRcdHJldHVybiB0b2tlbi5sZXhlbWU7XG5cdFx0XHRjYXNlIFRva2VuVHlwZS5UcnVlOlxuXHRcdFx0XHR0aGlzLl9hZHZhbmNlKCk7XG5cdFx0XHRcdHJldHVybiAndHJ1ZSc7XG5cdFx0XHRjYXNlIFRva2VuVHlwZS5GYWxzZTpcblx0XHRcdFx0dGhpcy5fYWR2YW5jZSgpO1xuXHRcdFx0XHRyZXR1cm4gJ2ZhbHNlJztcblx0XHRcdGNhc2UgVG9rZW5UeXBlLkluOiAvLyB3ZSBzdXBwb3J0IGBpbmAgYXMgYSB2YWx1ZSwgZS5nLiwgXCJ3aGVuXCI6IFwibGFuZ3VhZ2VJZCA9PSBpblwiIC0gZXhpc3RzIGluIGV4aXN0aW5nIGV4dGVuc2lvbnNcblx0XHRcdFx0dGhpcy5fYWR2YW5jZSgpO1xuXHRcdFx0XHRyZXR1cm4gJ2luJztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdC8vIHRoaXMgYWxsb3dzIFwid2hlblwiOiBcImZvbyA9PSBcIiB3aGljaCdzIHVzZWQgYnkgZXhpc3RpbmcgZXh0ZW5zaW9uc1xuXHRcdFx0XHQvLyB3ZSBkbyBub3QgY2FsbCBgX2FkdmFuY2VgIG9uIHB1cnBvc2UgLSB3ZSBkb24ndCB3YW50IHRvIGVhdCB1bmludGVuZGVkIHRva2Vuc1xuXHRcdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZmxhZ3NHWVJlID0gL2d8eS9nO1xuXHRwcml2YXRlIF9yZW1vdmVGbGFnc0dZKGZsYWdzOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiBmbGFncy5yZXBsYWNlQWxsKHRoaXMuX2ZsYWdzR1lSZSwgJycpO1xuXHR9XG5cblx0Ly8gY2FyZWZ1bDogdGhpcyBjYW4gdGhyb3cgaWYgY3VycmVudCB0b2tlbiBpcyB0aGUgaW5pdGlhbCBvbmUgKGllIGluZGV4ID0gMClcblx0cHJpdmF0ZSBfcHJldmlvdXMoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3Rva2Vuc1t0aGlzLl9jdXJyZW50IC0gMV07XG5cdH1cblxuXHRwcml2YXRlIF9tYXRjaE9uZSh0b2tlbjogVG9rZW5UeXBlKSB7XG5cdFx0aWYgKHRoaXMuX2NoZWNrKHRva2VuKSkge1xuXHRcdFx0dGhpcy5fYWR2YW5jZSgpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfYWR2YW5jZSgpIHtcblx0XHRpZiAoIXRoaXMuX2lzQXRFbmQoKSkge1xuXHRcdFx0dGhpcy5fY3VycmVudCsrO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcHJldmlvdXMoKTtcblx0fVxuXG5cdHByaXZhdGUgX2NvbnN1bWUodHlwZTogVG9rZW5UeXBlLCBtZXNzYWdlOiBzdHJpbmcpIHtcblx0XHRpZiAodGhpcy5fY2hlY2sodHlwZSkpIHtcblx0XHRcdHJldHVybiB0aGlzLl9hZHZhbmNlKCk7XG5cdFx0fVxuXG5cdFx0dGhyb3cgdGhpcy5fZXJyRXhwZWN0ZWRCdXRHb3QobWVzc2FnZSwgdGhpcy5fcGVlaygpKTtcblx0fVxuXG5cdHByaXZhdGUgX2VyckV4cGVjdGVkQnV0R290KGV4cGVjdGVkOiBzdHJpbmcsIGdvdDogVG9rZW4sIGFkZGl0aW9uYWxJbmZvPzogc3RyaW5nKSB7XG5cdFx0Y29uc3QgbWVzc2FnZSA9IGxvY2FsaXplKCdjb250ZXh0a2V5LnBhcnNlci5lcnJvci5leHBlY3RlZEJ1dEdvdCcsIFwiRXhwZWN0ZWQ6IHswfVxcblJlY2VpdmVkOiAnezF9Jy5cIiwgZXhwZWN0ZWQsIFNjYW5uZXIuZ2V0TGV4ZW1lKGdvdCkpO1xuXHRcdGNvbnN0IG9mZnNldCA9IGdvdC5vZmZzZXQ7XG5cdFx0Y29uc3QgbGV4ZW1lID0gU2Nhbm5lci5nZXRMZXhlbWUoZ290KTtcblx0XHR0aGlzLl9wYXJzaW5nRXJyb3JzLnB1c2goeyBtZXNzYWdlLCBvZmZzZXQsIGxleGVtZSwgYWRkaXRpb25hbEluZm8gfSk7XG5cdFx0cmV0dXJuIFBhcnNlci5fcGFyc2VFcnJvcjtcblx0fVxuXG5cdHByaXZhdGUgX2NoZWNrKHR5cGU6IFRva2VuVHlwZSkge1xuXHRcdHJldHVybiB0aGlzLl9wZWVrKCkudHlwZSA9PT0gdHlwZTtcblx0fVxuXG5cdHByaXZhdGUgX3BlZWsoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3Rva2Vuc1t0aGlzLl9jdXJyZW50XTtcblx0fVxuXG5cdHByaXZhdGUgX2lzQXRFbmQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3BlZWsoKS50eXBlID09PSBUb2tlblR5cGUuRU9GO1xuXHR9XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBDb250ZXh0S2V5RXhwciB7XG5cblx0cHVibGljIHN0YXRpYyBmYWxzZSgpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdFx0cmV0dXJuIENvbnRleHRLZXlGYWxzZUV4cHIuSU5TVEFOQ0U7XG5cdH1cblx0cHVibGljIHN0YXRpYyB0cnVlKCk6IENvbnRleHRLZXlFeHByZXNzaW9uIHtcblx0XHRyZXR1cm4gQ29udGV4dEtleVRydWVFeHByLklOU1RBTkNFO1xuXHR9XG5cdHB1YmxpYyBzdGF0aWMgaGFzKGtleTogc3RyaW5nKTogQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXHRcdHJldHVybiBDb250ZXh0S2V5RGVmaW5lZEV4cHIuY3JlYXRlKGtleSk7XG5cdH1cblx0cHVibGljIHN0YXRpYyBlcXVhbHMoa2V5OiBzdHJpbmcsIHZhbHVlOiBhbnkpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdFx0cmV0dXJuIENvbnRleHRLZXlFcXVhbHNFeHByLmNyZWF0ZShrZXksIHZhbHVlKTtcblx0fVxuXHRwdWJsaWMgc3RhdGljIG5vdEVxdWFscyhrZXk6IHN0cmluZywgdmFsdWU6IGFueSk6IENvbnRleHRLZXlFeHByZXNzaW9uIHtcblx0XHRyZXR1cm4gQ29udGV4dEtleU5vdEVxdWFsc0V4cHIuY3JlYXRlKGtleSwgdmFsdWUpO1xuXHR9XG5cdHB1YmxpYyBzdGF0aWMgcmVnZXgoa2V5OiBzdHJpbmcsIHZhbHVlOiBSZWdFeHApOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdFx0cmV0dXJuIENvbnRleHRLZXlSZWdleEV4cHIuY3JlYXRlKGtleSwgdmFsdWUpO1xuXHR9XG5cdHB1YmxpYyBzdGF0aWMgaW4oa2V5OiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdFx0cmV0dXJuIENvbnRleHRLZXlJbkV4cHIuY3JlYXRlKGtleSwgdmFsdWUpO1xuXHR9XG5cdHB1YmxpYyBzdGF0aWMgbm90SW4oa2V5OiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdFx0cmV0dXJuIENvbnRleHRLZXlOb3RJbkV4cHIuY3JlYXRlKGtleSwgdmFsdWUpO1xuXHR9XG5cdHB1YmxpYyBzdGF0aWMgbm90KGtleTogc3RyaW5nKTogQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXHRcdHJldHVybiBDb250ZXh0S2V5Tm90RXhwci5jcmVhdGUoa2V5KTtcblx0fVxuXHRwdWJsaWMgc3RhdGljIGFuZCguLi5leHByOiBBcnJheTxDb250ZXh0S2V5RXhwcmVzc2lvbiB8IHVuZGVmaW5lZCB8IG51bGw+KTogQ29udGV4dEtleUV4cHJlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBDb250ZXh0S2V5QW5kRXhwci5jcmVhdGUoZXhwciwgbnVsbCwgdHJ1ZSk7XG5cdH1cblx0cHVibGljIHN0YXRpYyBvciguLi5leHByOiBBcnJheTxDb250ZXh0S2V5RXhwcmVzc2lvbiB8IHVuZGVmaW5lZCB8IG51bGw+KTogQ29udGV4dEtleUV4cHJlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBDb250ZXh0S2V5T3JFeHByLmNyZWF0ZShleHByLCBudWxsLCB0cnVlKTtcblx0fVxuXHRwdWJsaWMgc3RhdGljIGdyZWF0ZXIoa2V5OiBzdHJpbmcsIHZhbHVlOiBudW1iZXIpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdFx0cmV0dXJuIENvbnRleHRLZXlHcmVhdGVyRXhwci5jcmVhdGUoa2V5LCB2YWx1ZSk7XG5cdH1cblx0cHVibGljIHN0YXRpYyBncmVhdGVyRXF1YWxzKGtleTogc3RyaW5nLCB2YWx1ZTogbnVtYmVyKTogQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXHRcdHJldHVybiBDb250ZXh0S2V5R3JlYXRlckVxdWFsc0V4cHIuY3JlYXRlKGtleSwgdmFsdWUpO1xuXHR9XG5cdHB1YmxpYyBzdGF0aWMgc21hbGxlcihrZXk6IHN0cmluZywgdmFsdWU6IG51bWJlcik6IENvbnRleHRLZXlFeHByZXNzaW9uIHtcblx0XHRyZXR1cm4gQ29udGV4dEtleVNtYWxsZXJFeHByLmNyZWF0ZShrZXksIHZhbHVlKTtcblx0fVxuXHRwdWJsaWMgc3RhdGljIHNtYWxsZXJFcXVhbHMoa2V5OiBzdHJpbmcsIHZhbHVlOiBudW1iZXIpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdFx0cmV0dXJuIENvbnRleHRLZXlTbWFsbGVyRXF1YWxzRXhwci5jcmVhdGUoa2V5LCB2YWx1ZSk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfcGFyc2VyID0gbmV3IFBhcnNlcih7IHJlZ2V4UGFyc2luZ1dpdGhFcnJvclJlY292ZXJ5OiBmYWxzZSB9KTtcblx0cHVibGljIHN0YXRpYyBkZXNlcmlhbGl6ZShzZXJpYWxpemVkOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKTogQ29udGV4dEtleUV4cHJlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdGlmIChzZXJpYWxpemVkID09PSB1bmRlZmluZWQgfHwgc2VyaWFsaXplZCA9PT0gbnVsbCkgeyAvLyBhbiBlbXB0eSBzdHJpbmcgbmVlZHMgdG8gYmUgaGFuZGxlZCBieSB0aGUgcGFyc2VyIHRvIGdldCBhIGNvcnJlc3BvbmRpbmcgcGFyc2luZyBlcnJvciByZXBvcnRlZFxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBleHByID0gdGhpcy5fcGFyc2VyLnBhcnNlKHNlcmlhbGl6ZWQpO1xuXHRcdHJldHVybiBleHByO1xuXHR9XG5cbn1cblxuXG5leHBvcnQgZnVuY3Rpb24gdmFsaWRhdGVXaGVuQ2xhdXNlcyh3aGVuQ2xhdXNlczogc3RyaW5nW10pOiBhbnkge1xuXG5cdGNvbnN0IHBhcnNlciA9IG5ldyBQYXJzZXIoeyByZWdleFBhcnNpbmdXaXRoRXJyb3JSZWNvdmVyeTogZmFsc2UgfSk7IC8vIHdlIHJ1biB3aXRoIG5vIHJlY292ZXJ5IHRvIGd1aWRlIHVzZXJzIHRvIHVzZSBjb3JyZWN0IHJlZ2V4ZXNcblxuXHRyZXR1cm4gd2hlbkNsYXVzZXMubWFwKHdoZW5DbGF1c2UgPT4ge1xuXHRcdHBhcnNlci5wYXJzZSh3aGVuQ2xhdXNlKTtcblxuXHRcdGlmIChwYXJzZXIubGV4aW5nRXJyb3JzLmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybiBwYXJzZXIubGV4aW5nRXJyb3JzLm1hcCgoc2U6IExleGluZ0Vycm9yKSA9PiAoe1xuXHRcdFx0XHRlcnJvck1lc3NhZ2U6IHNlLmFkZGl0aW9uYWxJbmZvID9cblx0XHRcdFx0XHRsb2NhbGl6ZSgnY29udGV4dGtleS5zY2FubmVyLmVycm9yRm9yTGludGVyV2l0aEhpbnQnLCBcIlVuZXhwZWN0ZWQgdG9rZW4uIEhpbnQ6IHswfVwiLCBzZS5hZGRpdGlvbmFsSW5mbykgOlxuXHRcdFx0XHRcdGxvY2FsaXplKCdjb250ZXh0a2V5LnNjYW5uZXIuZXJyb3JGb3JMaW50ZXInLCBcIlVuZXhwZWN0ZWQgdG9rZW4uXCIpLFxuXHRcdFx0XHRvZmZzZXQ6IHNlLm9mZnNldCxcblx0XHRcdFx0bGVuZ3RoOiBzZS5sZXhlbWUubGVuZ3RoLFxuXHRcdFx0fSkpO1xuXHRcdH0gZWxzZSBpZiAocGFyc2VyLnBhcnNpbmdFcnJvcnMubGVuZ3RoID4gMCkge1xuXHRcdFx0cmV0dXJuIHBhcnNlci5wYXJzaW5nRXJyb3JzLm1hcCgocGU6IFBhcnNpbmdFcnJvcikgPT4gKHtcblx0XHRcdFx0ZXJyb3JNZXNzYWdlOiBwZS5hZGRpdGlvbmFsSW5mbyA/IGAke3BlLm1lc3NhZ2V9LiAke3BlLmFkZGl0aW9uYWxJbmZvfWAgOiBwZS5tZXNzYWdlLFxuXHRcdFx0XHRvZmZzZXQ6IHBlLm9mZnNldCxcblx0XHRcdFx0bGVuZ3RoOiBwZS5sZXhlbWUubGVuZ3RoLFxuXHRcdFx0fSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHR9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4cHJlc3Npb25zQXJlRXF1YWxXaXRoQ29uc3RhbnRTdWJzdGl0dXRpb24oYTogQ29udGV4dEtleUV4cHJlc3Npb24gfCBudWxsIHwgdW5kZWZpbmVkLCBiOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IG51bGwgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0Y29uc3QgYUV4cHIgPSBhID8gYS5zdWJzdGl0dXRlQ29uc3RhbnRzKCkgOiB1bmRlZmluZWQ7XG5cdGNvbnN0IGJFeHByID0gYiA/IGIuc3Vic3RpdHV0ZUNvbnN0YW50cygpIDogdW5kZWZpbmVkO1xuXHRpZiAoIWFFeHByICYmICFiRXhwcikge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdGlmICghYUV4cHIgfHwgIWJFeHByKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdHJldHVybiBhRXhwci5lcXVhbHMoYkV4cHIpO1xufVxuXG5mdW5jdGlvbiBjbXAoYTogQ29udGV4dEtleUV4cHJlc3Npb24sIGI6IENvbnRleHRLZXlFeHByZXNzaW9uKTogbnVtYmVyIHtcblx0cmV0dXJuIGEuY21wKGIpO1xufVxuXG5leHBvcnQgY2xhc3MgQ29udGV4dEtleUZhbHNlRXhwciBpbXBsZW1lbnRzIElDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdHB1YmxpYyBzdGF0aWMgSU5TVEFOQ0UgPSBuZXcgQ29udGV4dEtleUZhbHNlRXhwcigpO1xuXG5cdHB1YmxpYyByZWFkb25seSB0eXBlID0gQ29udGV4dEtleUV4cHJUeXBlLkZhbHNlO1xuXG5cdHByb3RlY3RlZCBjb25zdHJ1Y3RvcigpIHtcblx0fVxuXG5cdHB1YmxpYyBjbXAob3RoZXI6IENvbnRleHRLZXlFeHByZXNzaW9uKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy50eXBlIC0gb3RoZXIudHlwZTtcblx0fVxuXG5cdHB1YmxpYyBlcXVhbHMob3RoZXI6IENvbnRleHRLZXlFeHByZXNzaW9uKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIChvdGhlci50eXBlID09PSB0aGlzLnR5cGUpO1xuXHR9XG5cblx0cHVibGljIHN1YnN0aXR1dGVDb25zdGFudHMoKTogQ29udGV4dEtleUV4cHJlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0cHVibGljIGV2YWx1YXRlKGNvbnRleHQ6IElDb250ZXh0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHVibGljIHNlcmlhbGl6ZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiAnZmFsc2UnO1xuXHR9XG5cblx0cHVibGljIGtleXMoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdHB1YmxpYyBtYXAobWFwRm5jOiBJQ29udGV4dEtleUV4cHJNYXBwZXIpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRwdWJsaWMgbmVnYXRlKCk6IENvbnRleHRLZXlFeHByZXNzaW9uIHtcblx0XHRyZXR1cm4gQ29udGV4dEtleVRydWVFeHByLklOU1RBTkNFO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDb250ZXh0S2V5VHJ1ZUV4cHIgaW1wbGVtZW50cyBJQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXHRwdWJsaWMgc3RhdGljIElOU1RBTkNFID0gbmV3IENvbnRleHRLZXlUcnVlRXhwcigpO1xuXG5cdHB1YmxpYyByZWFkb25seSB0eXBlID0gQ29udGV4dEtleUV4cHJUeXBlLlRydWU7XG5cblx0cHJvdGVjdGVkIGNvbnN0cnVjdG9yKCkge1xuXHR9XG5cblx0cHVibGljIGNtcChvdGhlcjogQ29udGV4dEtleUV4cHJlc3Npb24pOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLnR5cGUgLSBvdGhlci50eXBlO1xuXHR9XG5cblx0cHVibGljIGVxdWFscyhvdGhlcjogQ29udGV4dEtleUV4cHJlc3Npb24pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKG90aGVyLnR5cGUgPT09IHRoaXMudHlwZSk7XG5cdH1cblxuXHRwdWJsaWMgc3Vic3RpdHV0ZUNvbnN0YW50cygpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRwdWJsaWMgZXZhbHVhdGUoY29udGV4dDogSUNvbnRleHQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBzZXJpYWxpemUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gJ3RydWUnO1xuXHR9XG5cblx0cHVibGljIGtleXMoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdHB1YmxpYyBtYXAobWFwRm5jOiBJQ29udGV4dEtleUV4cHJNYXBwZXIpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRwdWJsaWMgbmVnYXRlKCk6IENvbnRleHRLZXlFeHByZXNzaW9uIHtcblx0XHRyZXR1cm4gQ29udGV4dEtleUZhbHNlRXhwci5JTlNUQU5DRTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ29udGV4dEtleURlZmluZWRFeHByIGltcGxlbWVudHMgSUNvbnRleHRLZXlFeHByZXNzaW9uIHtcblx0cHVibGljIHN0YXRpYyBjcmVhdGUoa2V5OiBzdHJpbmcsIG5lZ2F0ZWQ6IENvbnRleHRLZXlFeHByZXNzaW9uIHwgbnVsbCA9IG51bGwpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdFx0Y29uc3QgY29uc3RhbnRWYWx1ZSA9IENPTlNUQU5UX1ZBTFVFUy5nZXQoa2V5KTtcblx0XHRpZiAodHlwZW9mIGNvbnN0YW50VmFsdWUgPT09ICdib29sZWFuJykge1xuXHRcdFx0cmV0dXJuIGNvbnN0YW50VmFsdWUgPyBDb250ZXh0S2V5VHJ1ZUV4cHIuSU5TVEFOQ0UgOiBDb250ZXh0S2V5RmFsc2VFeHByLklOU1RBTkNFO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IENvbnRleHRLZXlEZWZpbmVkRXhwcihrZXksIG5lZ2F0ZWQpO1xuXHR9XG5cblx0cHVibGljIHJlYWRvbmx5IHR5cGUgPSBDb250ZXh0S2V5RXhwclR5cGUuRGVmaW5lZDtcblxuXHRwcm90ZWN0ZWQgY29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkga2V5OiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSBuZWdhdGVkOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IG51bGxcblx0KSB7XG5cdH1cblxuXHRwdWJsaWMgY21wKG90aGVyOiBDb250ZXh0S2V5RXhwcmVzc2lvbik6IG51bWJlciB7XG5cdFx0aWYgKG90aGVyLnR5cGUgIT09IHRoaXMudHlwZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMudHlwZSAtIG90aGVyLnR5cGU7XG5cdFx0fVxuXHRcdHJldHVybiBjbXAxKHRoaXMua2V5LCBvdGhlci5rZXkpO1xuXHR9XG5cblx0cHVibGljIGVxdWFscyhvdGhlcjogQ29udGV4dEtleUV4cHJlc3Npb24pOiBib29sZWFuIHtcblx0XHRpZiAob3RoZXIudHlwZSA9PT0gdGhpcy50eXBlKSB7XG5cdFx0XHRyZXR1cm4gKHRoaXMua2V5ID09PSBvdGhlci5rZXkpO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgc3Vic3RpdHV0ZUNvbnN0YW50cygpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgY29uc3RhbnRWYWx1ZSA9IENPTlNUQU5UX1ZBTFVFUy5nZXQodGhpcy5rZXkpO1xuXHRcdGlmICh0eXBlb2YgY29uc3RhbnRWYWx1ZSA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRyZXR1cm4gY29uc3RhbnRWYWx1ZSA/IENvbnRleHRLZXlUcnVlRXhwci5JTlNUQU5DRSA6IENvbnRleHRLZXlGYWxzZUV4cHIuSU5TVEFOQ0U7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0cHVibGljIGV2YWx1YXRlKGNvbnRleHQ6IElDb250ZXh0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICghIWNvbnRleHQuZ2V0VmFsdWUodGhpcy5rZXkpKTtcblx0fVxuXG5cdHB1YmxpYyBzZXJpYWxpemUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5rZXk7XG5cdH1cblxuXHRwdWJsaWMga2V5cygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIFt0aGlzLmtleV07XG5cdH1cblxuXHRwdWJsaWMgbWFwKG1hcEZuYzogSUNvbnRleHRLZXlFeHByTWFwcGVyKTogQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXHRcdHJldHVybiBtYXBGbmMubWFwRGVmaW5lZCh0aGlzLmtleSk7XG5cdH1cblxuXHRwdWJsaWMgbmVnYXRlKCk6IENvbnRleHRLZXlFeHByZXNzaW9uIHtcblx0XHRpZiAoIXRoaXMubmVnYXRlZCkge1xuXHRcdFx0dGhpcy5uZWdhdGVkID0gQ29udGV4dEtleU5vdEV4cHIuY3JlYXRlKHRoaXMua2V5LCB0aGlzKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMubmVnYXRlZDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ29udGV4dEtleUVxdWFsc0V4cHIgaW1wbGVtZW50cyBJQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXG5cdHB1YmxpYyBzdGF0aWMgY3JlYXRlKGtleTogc3RyaW5nLCB2YWx1ZTogYW55LCBuZWdhdGVkOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IG51bGwgPSBudWxsKTogQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXHRcdGlmICh0eXBlb2YgdmFsdWUgPT09ICdib29sZWFuJykge1xuXHRcdFx0cmV0dXJuICh2YWx1ZSA/IENvbnRleHRLZXlEZWZpbmVkRXhwci5jcmVhdGUoa2V5LCBuZWdhdGVkKSA6IENvbnRleHRLZXlOb3RFeHByLmNyZWF0ZShrZXksIG5lZ2F0ZWQpKTtcblx0XHR9XG5cdFx0Y29uc3QgY29uc3RhbnRWYWx1ZSA9IENPTlNUQU5UX1ZBTFVFUy5nZXQoa2V5KTtcblx0XHRpZiAodHlwZW9mIGNvbnN0YW50VmFsdWUgPT09ICdib29sZWFuJykge1xuXHRcdFx0Y29uc3QgdHJ1ZVZhbHVlID0gY29uc3RhbnRWYWx1ZSA/ICd0cnVlJyA6ICdmYWxzZSc7XG5cdFx0XHRyZXR1cm4gKHZhbHVlID09PSB0cnVlVmFsdWUgPyBDb250ZXh0S2V5VHJ1ZUV4cHIuSU5TVEFOQ0UgOiBDb250ZXh0S2V5RmFsc2VFeHByLklOU1RBTkNFKTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBDb250ZXh0S2V5RXF1YWxzRXhwcihrZXksIHZhbHVlLCBuZWdhdGVkKTtcblx0fVxuXG5cdHB1YmxpYyByZWFkb25seSB0eXBlID0gQ29udGV4dEtleUV4cHJUeXBlLkVxdWFscztcblxuXHRwcml2YXRlIGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkga2V5OiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB2YWx1ZTogYW55LFxuXHRcdHByaXZhdGUgbmVnYXRlZDogQ29udGV4dEtleUV4cHJlc3Npb24gfCBudWxsXG5cdCkge1xuXHR9XG5cblx0cHVibGljIGNtcChvdGhlcjogQ29udGV4dEtleUV4cHJlc3Npb24pOiBudW1iZXIge1xuXHRcdGlmIChvdGhlci50eXBlICE9PSB0aGlzLnR5cGUpIHtcblx0XHRcdHJldHVybiB0aGlzLnR5cGUgLSBvdGhlci50eXBlO1xuXHRcdH1cblx0XHRyZXR1cm4gY21wMih0aGlzLmtleSwgdGhpcy52YWx1ZSwgb3RoZXIua2V5LCBvdGhlci52YWx1ZSk7XG5cdH1cblxuXHRwdWJsaWMgZXF1YWxzKG90aGVyOiBDb250ZXh0S2V5RXhwcmVzc2lvbik6IGJvb2xlYW4ge1xuXHRcdGlmIChvdGhlci50eXBlID09PSB0aGlzLnR5cGUpIHtcblx0XHRcdHJldHVybiAodGhpcy5rZXkgPT09IG90aGVyLmtleSAmJiB0aGlzLnZhbHVlID09PSBvdGhlci52YWx1ZSk7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyBzdWJzdGl0dXRlQ29uc3RhbnRzKCk6IENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBjb25zdGFudFZhbHVlID0gQ09OU1RBTlRfVkFMVUVTLmdldCh0aGlzLmtleSk7XG5cdFx0aWYgKHR5cGVvZiBjb25zdGFudFZhbHVlID09PSAnYm9vbGVhbicpIHtcblx0XHRcdGNvbnN0IHRydWVWYWx1ZSA9IGNvbnN0YW50VmFsdWUgPyAndHJ1ZScgOiAnZmFsc2UnO1xuXHRcdFx0cmV0dXJuICh0aGlzLnZhbHVlID09PSB0cnVlVmFsdWUgPyBDb250ZXh0S2V5VHJ1ZUV4cHIuSU5TVEFOQ0UgOiBDb250ZXh0S2V5RmFsc2VFeHByLklOU1RBTkNFKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRwdWJsaWMgZXZhbHVhdGUoY29udGV4dDogSUNvbnRleHQpOiBib29sZWFuIHtcblx0XHQvLyBJbnRlbnRpb25hbCA9PVxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBlcWVxZXFcblx0XHRyZXR1cm4gKGNvbnRleHQuZ2V0VmFsdWUodGhpcy5rZXkpID09IHRoaXMudmFsdWUpO1xuXHR9XG5cblx0cHVibGljIHNlcmlhbGl6ZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgJHt0aGlzLmtleX0gPT0gJyR7dGhpcy52YWx1ZX0nYDtcblx0fVxuXG5cdHB1YmxpYyBrZXlzKCk6IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gW3RoaXMua2V5XTtcblx0fVxuXG5cdHB1YmxpYyBtYXAobWFwRm5jOiBJQ29udGV4dEtleUV4cHJNYXBwZXIpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdFx0cmV0dXJuIG1hcEZuYy5tYXBFcXVhbHModGhpcy5rZXksIHRoaXMudmFsdWUpO1xuXHR9XG5cblx0cHVibGljIG5lZ2F0ZSgpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdFx0aWYgKCF0aGlzLm5lZ2F0ZWQpIHtcblx0XHRcdHRoaXMubmVnYXRlZCA9IENvbnRleHRLZXlOb3RFcXVhbHNFeHByLmNyZWF0ZSh0aGlzLmtleSwgdGhpcy52YWx1ZSwgdGhpcyk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLm5lZ2F0ZWQ7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENvbnRleHRLZXlJbkV4cHIgaW1wbGVtZW50cyBJQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXG5cdHB1YmxpYyBzdGF0aWMgY3JlYXRlKGtleTogc3RyaW5nLCB2YWx1ZUtleTogc3RyaW5nKTogQ29udGV4dEtleUluRXhwciB7XG5cdFx0cmV0dXJuIG5ldyBDb250ZXh0S2V5SW5FeHByKGtleSwgdmFsdWVLZXkpO1xuXHR9XG5cblx0cHVibGljIHJlYWRvbmx5IHR5cGUgPSBDb250ZXh0S2V5RXhwclR5cGUuSW47XG5cdHByaXZhdGUgbmVnYXRlZDogQ29udGV4dEtleUV4cHJlc3Npb24gfCBudWxsID0gbnVsbDtcblxuXHRwcml2YXRlIGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkga2V5OiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB2YWx1ZUtleTogc3RyaW5nLFxuXHQpIHtcblx0fVxuXG5cdHB1YmxpYyBjbXAob3RoZXI6IENvbnRleHRLZXlFeHByZXNzaW9uKTogbnVtYmVyIHtcblx0XHRpZiAob3RoZXIudHlwZSAhPT0gdGhpcy50eXBlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy50eXBlIC0gb3RoZXIudHlwZTtcblx0XHR9XG5cdFx0cmV0dXJuIGNtcDIodGhpcy5rZXksIHRoaXMudmFsdWVLZXksIG90aGVyLmtleSwgb3RoZXIudmFsdWVLZXkpO1xuXHR9XG5cblx0cHVibGljIGVxdWFscyhvdGhlcjogQ29udGV4dEtleUV4cHJlc3Npb24pOiBib29sZWFuIHtcblx0XHRpZiAob3RoZXIudHlwZSA9PT0gdGhpcy50eXBlKSB7XG5cdFx0XHRyZXR1cm4gKHRoaXMua2V5ID09PSBvdGhlci5rZXkgJiYgdGhpcy52YWx1ZUtleSA9PT0gb3RoZXIudmFsdWVLZXkpO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgc3Vic3RpdHV0ZUNvbnN0YW50cygpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRwdWJsaWMgZXZhbHVhdGUoY29udGV4dDogSUNvbnRleHQpOiBib29sZWFuIHtcblx0XHRjb25zdCBzb3VyY2UgPSBjb250ZXh0LmdldFZhbHVlKHRoaXMudmFsdWVLZXkpO1xuXG5cdFx0Y29uc3QgaXRlbSA9IGNvbnRleHQuZ2V0VmFsdWUodGhpcy5rZXkpO1xuXG5cdFx0aWYgKEFycmF5LmlzQXJyYXkoc291cmNlKSkge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRpZiAoc291cmNlLmluY2x1ZGVzKGl0ZW0gYXMgYW55KSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdC8vIE9uIFdpbmRvd3MsIGZpbGUgcGF0aHMgYXJlIGNhc2UtaW5zZW5zaXRpdmUgc28gZmlsZSBVUklcblx0XHRcdC8vIGNvbXBhcmlzb25zIG11c3QgYmUgZG9uZSBpbiBhIGNhc2UtaW5zZW5zaXRpdmUgbWFubmVyLlxuXHRcdFx0aWYgKGlzV2luZG93cyAmJiB0eXBlb2YgaXRlbSA9PT0gJ3N0cmluZycgJiYgaXRlbS5zdGFydHNXaXRoKCdmaWxlOi8vLycpKSB7XG5cdFx0XHRcdGNvbnN0IGl0ZW1Mb3dlciA9IGl0ZW0udG9Mb3dlckNhc2UoKTtcblx0XHRcdFx0cmV0dXJuIHNvdXJjZS5zb21lKHMgPT4gdHlwZW9mIHMgPT09ICdzdHJpbmcnICYmIHMudG9Mb3dlckNhc2UoKSA9PT0gaXRlbUxvd2VyKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIGl0ZW0gPT09ICdzdHJpbmcnICYmIHR5cGVvZiBzb3VyY2UgPT09ICdvYmplY3QnICYmIHNvdXJjZSAhPT0gbnVsbCkge1xuXHRcdFx0aWYgKGhhc093blByb3BlcnR5LmNhbGwoc291cmNlLCBpdGVtKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdC8vIE9uIFdpbmRvd3MsIGZpbGUgcGF0aHMgYXJlIGNhc2UtaW5zZW5zaXRpdmUgc28gZmlsZSBVUklcblx0XHRcdC8vIHByb3BlcnR5IGxvb2t1cHMgbXVzdCBiZSBkb25lIGluIGEgY2FzZS1pbnNlbnNpdGl2ZSBtYW5uZXIuXG5cdFx0XHRpZiAoaXNXaW5kb3dzICYmIGl0ZW0uc3RhcnRzV2l0aCgnZmlsZTovLy8nKSkge1xuXHRcdFx0XHRjb25zdCBpdGVtTG93ZXIgPSBpdGVtLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdHJldHVybiBPYmplY3Qua2V5cyhzb3VyY2UpLnNvbWUoa2V5ID0+IGtleS50b0xvd2VyQ2FzZSgpID09PSBpdGVtTG93ZXIpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgc2VyaWFsaXplKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAke3RoaXMua2V5fSBpbiAnJHt0aGlzLnZhbHVlS2V5fSdgO1xuXHR9XG5cblx0cHVibGljIGtleXMoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiBbdGhpcy5rZXksIHRoaXMudmFsdWVLZXldO1xuXHR9XG5cblx0cHVibGljIG1hcChtYXBGbmM6IElDb250ZXh0S2V5RXhwck1hcHBlcik6IENvbnRleHRLZXlJbkV4cHIge1xuXHRcdHJldHVybiBtYXBGbmMubWFwSW4odGhpcy5rZXksIHRoaXMudmFsdWVLZXkpO1xuXHR9XG5cblx0cHVibGljIG5lZ2F0ZSgpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdFx0aWYgKCF0aGlzLm5lZ2F0ZWQpIHtcblx0XHRcdHRoaXMubmVnYXRlZCA9IENvbnRleHRLZXlOb3RJbkV4cHIuY3JlYXRlKHRoaXMua2V5LCB0aGlzLnZhbHVlS2V5KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMubmVnYXRlZDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ29udGV4dEtleU5vdEluRXhwciBpbXBsZW1lbnRzIElDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cblx0cHVibGljIHN0YXRpYyBjcmVhdGUoa2V5OiBzdHJpbmcsIHZhbHVlS2V5OiBzdHJpbmcpOiBDb250ZXh0S2V5Tm90SW5FeHByIHtcblx0XHRyZXR1cm4gbmV3IENvbnRleHRLZXlOb3RJbkV4cHIoa2V5LCB2YWx1ZUtleSk7XG5cdH1cblxuXHRwdWJsaWMgcmVhZG9ubHkgdHlwZSA9IENvbnRleHRLZXlFeHByVHlwZS5Ob3RJbjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9uZWdhdGVkOiBDb250ZXh0S2V5SW5FeHByO1xuXG5cdHByaXZhdGUgY29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBrZXk6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHZhbHVlS2V5OiBzdHJpbmcsXG5cdCkge1xuXHRcdHRoaXMuX25lZ2F0ZWQgPSBDb250ZXh0S2V5SW5FeHByLmNyZWF0ZShrZXksIHZhbHVlS2V5KTtcblx0fVxuXG5cdHB1YmxpYyBjbXAob3RoZXI6IENvbnRleHRLZXlFeHByZXNzaW9uKTogbnVtYmVyIHtcblx0XHRpZiAob3RoZXIudHlwZSAhPT0gdGhpcy50eXBlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy50eXBlIC0gb3RoZXIudHlwZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX25lZ2F0ZWQuY21wKG90aGVyLl9uZWdhdGVkKTtcblx0fVxuXG5cdHB1YmxpYyBlcXVhbHMob3RoZXI6IENvbnRleHRLZXlFeHByZXNzaW9uKTogYm9vbGVhbiB7XG5cdFx0aWYgKG90aGVyLnR5cGUgPT09IHRoaXMudHlwZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX25lZ2F0ZWQuZXF1YWxzKG90aGVyLl9uZWdhdGVkKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHVibGljIHN1YnN0aXR1dGVDb25zdGFudHMoKTogQ29udGV4dEtleUV4cHJlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0cHVibGljIGV2YWx1YXRlKGNvbnRleHQ6IElDb250ZXh0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICF0aGlzLl9uZWdhdGVkLmV2YWx1YXRlKGNvbnRleHQpO1xuXHR9XG5cblx0cHVibGljIHNlcmlhbGl6ZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgJHt0aGlzLmtleX0gbm90IGluICcke3RoaXMudmFsdWVLZXl9J2A7XG5cdH1cblxuXHRwdWJsaWMga2V5cygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX25lZ2F0ZWQua2V5cygpO1xuXHR9XG5cblx0cHVibGljIG1hcChtYXBGbmM6IElDb250ZXh0S2V5RXhwck1hcHBlcik6IENvbnRleHRLZXlFeHByZXNzaW9uIHtcblx0XHRyZXR1cm4gbWFwRm5jLm1hcE5vdEluKHRoaXMua2V5LCB0aGlzLnZhbHVlS2V5KTtcblx0fVxuXG5cdHB1YmxpYyBuZWdhdGUoKTogQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXHRcdHJldHVybiB0aGlzLl9uZWdhdGVkO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDb250ZXh0S2V5Tm90RXF1YWxzRXhwciBpbXBsZW1lbnRzIElDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cblx0cHVibGljIHN0YXRpYyBjcmVhdGUoa2V5OiBzdHJpbmcsIHZhbHVlOiBhbnksIG5lZ2F0ZWQ6IENvbnRleHRLZXlFeHByZXNzaW9uIHwgbnVsbCA9IG51bGwpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRpZiAodmFsdWUpIHtcblx0XHRcdFx0cmV0dXJuIENvbnRleHRLZXlOb3RFeHByLmNyZWF0ZShrZXksIG5lZ2F0ZWQpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIENvbnRleHRLZXlEZWZpbmVkRXhwci5jcmVhdGUoa2V5LCBuZWdhdGVkKTtcblx0XHR9XG5cdFx0Y29uc3QgY29uc3RhbnRWYWx1ZSA9IENPTlNUQU5UX1ZBTFVFUy5nZXQoa2V5KTtcblx0XHRpZiAodHlwZW9mIGNvbnN0YW50VmFsdWUgPT09ICdib29sZWFuJykge1xuXHRcdFx0Y29uc3QgZmFsc2VWYWx1ZSA9IGNvbnN0YW50VmFsdWUgPyAndHJ1ZScgOiAnZmFsc2UnO1xuXHRcdFx0cmV0dXJuICh2YWx1ZSA9PT0gZmFsc2VWYWx1ZSA/IENvbnRleHRLZXlGYWxzZUV4cHIuSU5TVEFOQ0UgOiBDb250ZXh0S2V5VHJ1ZUV4cHIuSU5TVEFOQ0UpO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IENvbnRleHRLZXlOb3RFcXVhbHNFeHByKGtleSwgdmFsdWUsIG5lZ2F0ZWQpO1xuXHR9XG5cblx0cHVibGljIHJlYWRvbmx5IHR5cGUgPSBDb250ZXh0S2V5RXhwclR5cGUuTm90RXF1YWxzO1xuXG5cdHByaXZhdGUgY29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBrZXk6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHZhbHVlOiBhbnksXG5cdFx0cHJpdmF0ZSBuZWdhdGVkOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IG51bGxcblx0KSB7XG5cdH1cblxuXHRwdWJsaWMgY21wKG90aGVyOiBDb250ZXh0S2V5RXhwcmVzc2lvbik6IG51bWJlciB7XG5cdFx0aWYgKG90aGVyLnR5cGUgIT09IHRoaXMudHlwZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMudHlwZSAtIG90aGVyLnR5cGU7XG5cdFx0fVxuXHRcdHJldHVybiBjbXAyKHRoaXMua2V5LCB0aGlzLnZhbHVlLCBvdGhlci5rZXksIG90aGVyLnZhbHVlKTtcblx0fVxuXG5cdHB1YmxpYyBlcXVhbHMob3RoZXI6IENvbnRleHRLZXlFeHByZXNzaW9uKTogYm9vbGVhbiB7XG5cdFx0aWYgKG90aGVyLnR5cGUgPT09IHRoaXMudHlwZSkge1xuXHRcdFx0cmV0dXJuICh0aGlzLmtleSA9PT0gb3RoZXIua2V5ICYmIHRoaXMudmFsdWUgPT09IG90aGVyLnZhbHVlKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHVibGljIHN1YnN0aXR1dGVDb25zdGFudHMoKTogQ29udGV4dEtleUV4cHJlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGNvbnN0YW50VmFsdWUgPSBDT05TVEFOVF9WQUxVRVMuZ2V0KHRoaXMua2V5KTtcblx0XHRpZiAodHlwZW9mIGNvbnN0YW50VmFsdWUgPT09ICdib29sZWFuJykge1xuXHRcdFx0Y29uc3QgZmFsc2VWYWx1ZSA9IGNvbnN0YW50VmFsdWUgPyAndHJ1ZScgOiAnZmFsc2UnO1xuXHRcdFx0cmV0dXJuICh0aGlzLnZhbHVlID09PSBmYWxzZVZhbHVlID8gQ29udGV4dEtleUZhbHNlRXhwci5JTlNUQU5DRSA6IENvbnRleHRLZXlUcnVlRXhwci5JTlNUQU5DRSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0cHVibGljIGV2YWx1YXRlKGNvbnRleHQ6IElDb250ZXh0KTogYm9vbGVhbiB7XG5cdFx0Ly8gSW50ZW50aW9uYWwgIT1cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgZXFlcWVxXG5cdFx0cmV0dXJuIChjb250ZXh0LmdldFZhbHVlKHRoaXMua2V5KSAhPSB0aGlzLnZhbHVlKTtcblx0fVxuXG5cdHB1YmxpYyBzZXJpYWxpemUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7dGhpcy5rZXl9ICE9ICcke3RoaXMudmFsdWV9J2A7XG5cdH1cblxuXHRwdWJsaWMga2V5cygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIFt0aGlzLmtleV07XG5cdH1cblxuXHRwdWJsaWMgbWFwKG1hcEZuYzogSUNvbnRleHRLZXlFeHByTWFwcGVyKTogQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXHRcdHJldHVybiBtYXBGbmMubWFwTm90RXF1YWxzKHRoaXMua2V5LCB0aGlzLnZhbHVlKTtcblx0fVxuXG5cdHB1YmxpYyBuZWdhdGUoKTogQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXHRcdGlmICghdGhpcy5uZWdhdGVkKSB7XG5cdFx0XHR0aGlzLm5lZ2F0ZWQgPSBDb250ZXh0S2V5RXF1YWxzRXhwci5jcmVhdGUodGhpcy5rZXksIHRoaXMudmFsdWUsIHRoaXMpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5uZWdhdGVkO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDb250ZXh0S2V5Tm90RXhwciBpbXBsZW1lbnRzIElDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cblx0cHVibGljIHN0YXRpYyBjcmVhdGUoa2V5OiBzdHJpbmcsIG5lZ2F0ZWQ6IENvbnRleHRLZXlFeHByZXNzaW9uIHwgbnVsbCA9IG51bGwpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdFx0Y29uc3QgY29uc3RhbnRWYWx1ZSA9IENPTlNUQU5UX1ZBTFVFUy5nZXQoa2V5KTtcblx0XHRpZiAodHlwZW9mIGNvbnN0YW50VmFsdWUgPT09ICdib29sZWFuJykge1xuXHRcdFx0cmV0dXJuIChjb25zdGFudFZhbHVlID8gQ29udGV4dEtleUZhbHNlRXhwci5JTlNUQU5DRSA6IENvbnRleHRLZXlUcnVlRXhwci5JTlNUQU5DRSk7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgQ29udGV4dEtleU5vdEV4cHIoa2V5LCBuZWdhdGVkKTtcblx0fVxuXG5cdHB1YmxpYyByZWFkb25seSB0eXBlID0gQ29udGV4dEtleUV4cHJUeXBlLk5vdDtcblxuXHRwcml2YXRlIGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkga2V5OiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSBuZWdhdGVkOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IG51bGxcblx0KSB7XG5cdH1cblxuXHRwdWJsaWMgY21wKG90aGVyOiBDb250ZXh0S2V5RXhwcmVzc2lvbik6IG51bWJlciB7XG5cdFx0aWYgKG90aGVyLnR5cGUgIT09IHRoaXMudHlwZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMudHlwZSAtIG90aGVyLnR5cGU7XG5cdFx0fVxuXHRcdHJldHVybiBjbXAxKHRoaXMua2V5LCBvdGhlci5rZXkpO1xuXHR9XG5cblx0cHVibGljIGVxdWFscyhvdGhlcjogQ29udGV4dEtleUV4cHJlc3Npb24pOiBib29sZWFuIHtcblx0XHRpZiAob3RoZXIudHlwZSA9PT0gdGhpcy50eXBlKSB7XG5cdFx0XHRyZXR1cm4gKHRoaXMua2V5ID09PSBvdGhlci5rZXkpO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgc3Vic3RpdHV0ZUNvbnN0YW50cygpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgY29uc3RhbnRWYWx1ZSA9IENPTlNUQU5UX1ZBTFVFUy5nZXQodGhpcy5rZXkpO1xuXHRcdGlmICh0eXBlb2YgY29uc3RhbnRWYWx1ZSA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRyZXR1cm4gKGNvbnN0YW50VmFsdWUgPyBDb250ZXh0S2V5RmFsc2VFeHByLklOU1RBTkNFIDogQ29udGV4dEtleVRydWVFeHByLklOU1RBTkNFKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRwdWJsaWMgZXZhbHVhdGUoY29udGV4dDogSUNvbnRleHQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKCFjb250ZXh0LmdldFZhbHVlKHRoaXMua2V5KSk7XG5cdH1cblxuXHRwdWJsaWMgc2VyaWFsaXplKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAhJHt0aGlzLmtleX1gO1xuXHR9XG5cblx0cHVibGljIGtleXMoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiBbdGhpcy5rZXldO1xuXHR9XG5cblx0cHVibGljIG1hcChtYXBGbmM6IElDb250ZXh0S2V5RXhwck1hcHBlcik6IENvbnRleHRLZXlFeHByZXNzaW9uIHtcblx0XHRyZXR1cm4gbWFwRm5jLm1hcE5vdCh0aGlzLmtleSk7XG5cdH1cblxuXHRwdWJsaWMgbmVnYXRlKCk6IENvbnRleHRLZXlFeHByZXNzaW9uIHtcblx0XHRpZiAoIXRoaXMubmVnYXRlZCkge1xuXHRcdFx0dGhpcy5uZWdhdGVkID0gQ29udGV4dEtleURlZmluZWRFeHByLmNyZWF0ZSh0aGlzLmtleSwgdGhpcyk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLm5lZ2F0ZWQ7XG5cdH1cbn1cblxuZnVuY3Rpb24gd2l0aEZsb2F0T3JTdHI8VCBleHRlbmRzIENvbnRleHRLZXlFeHByZXNzaW9uPih2YWx1ZTogYW55LCBjYWxsYmFjazogKHZhbHVlOiBudW1iZXIgfCBzdHJpbmcpID0+IFQpOiBUIHwgQ29udGV4dEtleUZhbHNlRXhwciB7XG5cdGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG5cdFx0Y29uc3QgbiA9IHBhcnNlRmxvYXQodmFsdWUpO1xuXHRcdGlmICghaXNOYU4obikpIHtcblx0XHRcdHZhbHVlID0gbjtcblx0XHR9XG5cdH1cblx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgfHwgdHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJykge1xuXHRcdHJldHVybiBjYWxsYmFjayh2YWx1ZSk7XG5cdH1cblx0cmV0dXJuIENvbnRleHRLZXlGYWxzZUV4cHIuSU5TVEFOQ0U7XG59XG5cbmV4cG9ydCBjbGFzcyBDb250ZXh0S2V5R3JlYXRlckV4cHIgaW1wbGVtZW50cyBJQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXG5cdHB1YmxpYyBzdGF0aWMgY3JlYXRlKGtleTogc3RyaW5nLCBfdmFsdWU6IGFueSwgbmVnYXRlZDogQ29udGV4dEtleUV4cHJlc3Npb24gfCBudWxsID0gbnVsbCk6IENvbnRleHRLZXlFeHByZXNzaW9uIHtcblx0XHRyZXR1cm4gd2l0aEZsb2F0T3JTdHIoX3ZhbHVlLCAodmFsdWUpID0+IG5ldyBDb250ZXh0S2V5R3JlYXRlckV4cHIoa2V5LCB2YWx1ZSwgbmVnYXRlZCkpO1xuXHR9XG5cblx0cHVibGljIHJlYWRvbmx5IHR5cGUgPSBDb250ZXh0S2V5RXhwclR5cGUuR3JlYXRlcjtcblxuXHRwcml2YXRlIGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkga2V5OiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB2YWx1ZTogbnVtYmVyIHwgc3RyaW5nLFxuXHRcdHByaXZhdGUgbmVnYXRlZDogQ29udGV4dEtleUV4cHJlc3Npb24gfCBudWxsXG5cdCkgeyB9XG5cblx0cHVibGljIGNtcChvdGhlcjogQ29udGV4dEtleUV4cHJlc3Npb24pOiBudW1iZXIge1xuXHRcdGlmIChvdGhlci50eXBlICE9PSB0aGlzLnR5cGUpIHtcblx0XHRcdHJldHVybiB0aGlzLnR5cGUgLSBvdGhlci50eXBlO1xuXHRcdH1cblx0XHRyZXR1cm4gY21wMih0aGlzLmtleSwgdGhpcy52YWx1ZSwgb3RoZXIua2V5LCBvdGhlci52YWx1ZSk7XG5cdH1cblxuXHRwdWJsaWMgZXF1YWxzKG90aGVyOiBDb250ZXh0S2V5RXhwcmVzc2lvbik6IGJvb2xlYW4ge1xuXHRcdGlmIChvdGhlci50eXBlID09PSB0aGlzLnR5cGUpIHtcblx0XHRcdHJldHVybiAodGhpcy5rZXkgPT09IG90aGVyLmtleSAmJiB0aGlzLnZhbHVlID09PSBvdGhlci52YWx1ZSk7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyBzdWJzdGl0dXRlQ29uc3RhbnRzKCk6IENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdHB1YmxpYyBldmFsdWF0ZShjb250ZXh0OiBJQ29udGV4dCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0eXBlb2YgdGhpcy52YWx1ZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIChwYXJzZUZsb2F0KGNvbnRleHQuZ2V0VmFsdWU8YW55Pih0aGlzLmtleSkpID4gdGhpcy52YWx1ZSk7XG5cdH1cblxuXHRwdWJsaWMgc2VyaWFsaXplKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAke3RoaXMua2V5fSA+ICR7dGhpcy52YWx1ZX1gO1xuXHR9XG5cblx0cHVibGljIGtleXMoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiBbdGhpcy5rZXldO1xuXHR9XG5cblx0cHVibGljIG1hcChtYXBGbmM6IElDb250ZXh0S2V5RXhwck1hcHBlcik6IENvbnRleHRLZXlFeHByZXNzaW9uIHtcblx0XHRyZXR1cm4gbWFwRm5jLm1hcEdyZWF0ZXIodGhpcy5rZXksIHRoaXMudmFsdWUpO1xuXHR9XG5cblx0cHVibGljIG5lZ2F0ZSgpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdFx0aWYgKCF0aGlzLm5lZ2F0ZWQpIHtcblx0XHRcdHRoaXMubmVnYXRlZCA9IENvbnRleHRLZXlTbWFsbGVyRXF1YWxzRXhwci5jcmVhdGUodGhpcy5rZXksIHRoaXMudmFsdWUsIHRoaXMpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5uZWdhdGVkO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDb250ZXh0S2V5R3JlYXRlckVxdWFsc0V4cHIgaW1wbGVtZW50cyBJQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXG5cdHB1YmxpYyBzdGF0aWMgY3JlYXRlKGtleTogc3RyaW5nLCBfdmFsdWU6IGFueSwgbmVnYXRlZDogQ29udGV4dEtleUV4cHJlc3Npb24gfCBudWxsID0gbnVsbCk6IENvbnRleHRLZXlFeHByZXNzaW9uIHtcblx0XHRyZXR1cm4gd2l0aEZsb2F0T3JTdHIoX3ZhbHVlLCAodmFsdWUpID0+IG5ldyBDb250ZXh0S2V5R3JlYXRlckVxdWFsc0V4cHIoa2V5LCB2YWx1ZSwgbmVnYXRlZCkpO1xuXHR9XG5cblx0cHVibGljIHJlYWRvbmx5IHR5cGUgPSBDb250ZXh0S2V5RXhwclR5cGUuR3JlYXRlckVxdWFscztcblxuXHRwcml2YXRlIGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkga2V5OiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB2YWx1ZTogbnVtYmVyIHwgc3RyaW5nLFxuXHRcdHByaXZhdGUgbmVnYXRlZDogQ29udGV4dEtleUV4cHJlc3Npb24gfCBudWxsXG5cdCkgeyB9XG5cblx0cHVibGljIGNtcChvdGhlcjogQ29udGV4dEtleUV4cHJlc3Npb24pOiBudW1iZXIge1xuXHRcdGlmIChvdGhlci50eXBlICE9PSB0aGlzLnR5cGUpIHtcblx0XHRcdHJldHVybiB0aGlzLnR5cGUgLSBvdGhlci50eXBlO1xuXHRcdH1cblx0XHRyZXR1cm4gY21wMih0aGlzLmtleSwgdGhpcy52YWx1ZSwgb3RoZXIua2V5LCBvdGhlci52YWx1ZSk7XG5cdH1cblxuXHRwdWJsaWMgZXF1YWxzKG90aGVyOiBDb250ZXh0S2V5RXhwcmVzc2lvbik6IGJvb2xlYW4ge1xuXHRcdGlmIChvdGhlci50eXBlID09PSB0aGlzLnR5cGUpIHtcblx0XHRcdHJldHVybiAodGhpcy5rZXkgPT09IG90aGVyLmtleSAmJiB0aGlzLnZhbHVlID09PSBvdGhlci52YWx1ZSk7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyBzdWJzdGl0dXRlQ29uc3RhbnRzKCk6IENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdHB1YmxpYyBldmFsdWF0ZShjb250ZXh0OiBJQ29udGV4dCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0eXBlb2YgdGhpcy52YWx1ZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIChwYXJzZUZsb2F0KGNvbnRleHQuZ2V0VmFsdWU8YW55Pih0aGlzLmtleSkpID49IHRoaXMudmFsdWUpO1xuXHR9XG5cblx0cHVibGljIHNlcmlhbGl6ZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgJHt0aGlzLmtleX0gPj0gJHt0aGlzLnZhbHVlfWA7XG5cdH1cblxuXHRwdWJsaWMga2V5cygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIFt0aGlzLmtleV07XG5cdH1cblxuXHRwdWJsaWMgbWFwKG1hcEZuYzogSUNvbnRleHRLZXlFeHByTWFwcGVyKTogQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXHRcdHJldHVybiBtYXBGbmMubWFwR3JlYXRlckVxdWFscyh0aGlzLmtleSwgdGhpcy52YWx1ZSk7XG5cdH1cblxuXHRwdWJsaWMgbmVnYXRlKCk6IENvbnRleHRLZXlFeHByZXNzaW9uIHtcblx0XHRpZiAoIXRoaXMubmVnYXRlZCkge1xuXHRcdFx0dGhpcy5uZWdhdGVkID0gQ29udGV4dEtleVNtYWxsZXJFeHByLmNyZWF0ZSh0aGlzLmtleSwgdGhpcy52YWx1ZSwgdGhpcyk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLm5lZ2F0ZWQ7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENvbnRleHRLZXlTbWFsbGVyRXhwciBpbXBsZW1lbnRzIElDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cblx0cHVibGljIHN0YXRpYyBjcmVhdGUoa2V5OiBzdHJpbmcsIF92YWx1ZTogYW55LCBuZWdhdGVkOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IG51bGwgPSBudWxsKTogQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXHRcdHJldHVybiB3aXRoRmxvYXRPclN0cihfdmFsdWUsICh2YWx1ZSkgPT4gbmV3IENvbnRleHRLZXlTbWFsbGVyRXhwcihrZXksIHZhbHVlLCBuZWdhdGVkKSk7XG5cdH1cblxuXHRwdWJsaWMgcmVhZG9ubHkgdHlwZSA9IENvbnRleHRLZXlFeHByVHlwZS5TbWFsbGVyO1xuXG5cdHByaXZhdGUgY29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBrZXk6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHZhbHVlOiBudW1iZXIgfCBzdHJpbmcsXG5cdFx0cHJpdmF0ZSBuZWdhdGVkOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IG51bGxcblx0KSB7XG5cdH1cblxuXHRwdWJsaWMgY21wKG90aGVyOiBDb250ZXh0S2V5RXhwcmVzc2lvbik6IG51bWJlciB7XG5cdFx0aWYgKG90aGVyLnR5cGUgIT09IHRoaXMudHlwZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMudHlwZSAtIG90aGVyLnR5cGU7XG5cdFx0fVxuXHRcdHJldHVybiBjbXAyKHRoaXMua2V5LCB0aGlzLnZhbHVlLCBvdGhlci5rZXksIG90aGVyLnZhbHVlKTtcblx0fVxuXG5cdHB1YmxpYyBlcXVhbHMob3RoZXI6IENvbnRleHRLZXlFeHByZXNzaW9uKTogYm9vbGVhbiB7XG5cdFx0aWYgKG90aGVyLnR5cGUgPT09IHRoaXMudHlwZSkge1xuXHRcdFx0cmV0dXJuICh0aGlzLmtleSA9PT0gb3RoZXIua2V5ICYmIHRoaXMudmFsdWUgPT09IG90aGVyLnZhbHVlKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHVibGljIHN1YnN0aXR1dGVDb25zdGFudHMoKTogQ29udGV4dEtleUV4cHJlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0cHVibGljIGV2YWx1YXRlKGNvbnRleHQ6IElDb250ZXh0KTogYm9vbGVhbiB7XG5cdFx0aWYgKHR5cGVvZiB0aGlzLnZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gKHBhcnNlRmxvYXQoY29udGV4dC5nZXRWYWx1ZTxhbnk+KHRoaXMua2V5KSkgPCB0aGlzLnZhbHVlKTtcblx0fVxuXG5cdHB1YmxpYyBzZXJpYWxpemUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7dGhpcy5rZXl9IDwgJHt0aGlzLnZhbHVlfWA7XG5cdH1cblxuXHRwdWJsaWMga2V5cygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIFt0aGlzLmtleV07XG5cdH1cblxuXHRwdWJsaWMgbWFwKG1hcEZuYzogSUNvbnRleHRLZXlFeHByTWFwcGVyKTogQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXHRcdHJldHVybiBtYXBGbmMubWFwU21hbGxlcih0aGlzLmtleSwgdGhpcy52YWx1ZSk7XG5cdH1cblxuXHRwdWJsaWMgbmVnYXRlKCk6IENvbnRleHRLZXlFeHByZXNzaW9uIHtcblx0XHRpZiAoIXRoaXMubmVnYXRlZCkge1xuXHRcdFx0dGhpcy5uZWdhdGVkID0gQ29udGV4dEtleUdyZWF0ZXJFcXVhbHNFeHByLmNyZWF0ZSh0aGlzLmtleSwgdGhpcy52YWx1ZSwgdGhpcyk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLm5lZ2F0ZWQ7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENvbnRleHRLZXlTbWFsbGVyRXF1YWxzRXhwciBpbXBsZW1lbnRzIElDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cblx0cHVibGljIHN0YXRpYyBjcmVhdGUoa2V5OiBzdHJpbmcsIF92YWx1ZTogYW55LCBuZWdhdGVkOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IG51bGwgPSBudWxsKTogQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXHRcdHJldHVybiB3aXRoRmxvYXRPclN0cihfdmFsdWUsICh2YWx1ZSkgPT4gbmV3IENvbnRleHRLZXlTbWFsbGVyRXF1YWxzRXhwcihrZXksIHZhbHVlLCBuZWdhdGVkKSk7XG5cdH1cblxuXHRwdWJsaWMgcmVhZG9ubHkgdHlwZSA9IENvbnRleHRLZXlFeHByVHlwZS5TbWFsbGVyRXF1YWxzO1xuXG5cdHByaXZhdGUgY29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBrZXk6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHZhbHVlOiBudW1iZXIgfCBzdHJpbmcsXG5cdFx0cHJpdmF0ZSBuZWdhdGVkOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IG51bGxcblx0KSB7XG5cdH1cblxuXHRwdWJsaWMgY21wKG90aGVyOiBDb250ZXh0S2V5RXhwcmVzc2lvbik6IG51bWJlciB7XG5cdFx0aWYgKG90aGVyLnR5cGUgIT09IHRoaXMudHlwZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMudHlwZSAtIG90aGVyLnR5cGU7XG5cdFx0fVxuXHRcdHJldHVybiBjbXAyKHRoaXMua2V5LCB0aGlzLnZhbHVlLCBvdGhlci5rZXksIG90aGVyLnZhbHVlKTtcblx0fVxuXG5cdHB1YmxpYyBlcXVhbHMob3RoZXI6IENvbnRleHRLZXlFeHByZXNzaW9uKTogYm9vbGVhbiB7XG5cdFx0aWYgKG90aGVyLnR5cGUgPT09IHRoaXMudHlwZSkge1xuXHRcdFx0cmV0dXJuICh0aGlzLmtleSA9PT0gb3RoZXIua2V5ICYmIHRoaXMudmFsdWUgPT09IG90aGVyLnZhbHVlKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHVibGljIHN1YnN0aXR1dGVDb25zdGFudHMoKTogQ29udGV4dEtleUV4cHJlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0cHVibGljIGV2YWx1YXRlKGNvbnRleHQ6IElDb250ZXh0KTogYm9vbGVhbiB7XG5cdFx0aWYgKHR5cGVvZiB0aGlzLnZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gKHBhcnNlRmxvYXQoY29udGV4dC5nZXRWYWx1ZTxhbnk+KHRoaXMua2V5KSkgPD0gdGhpcy52YWx1ZSk7XG5cdH1cblxuXHRwdWJsaWMgc2VyaWFsaXplKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAke3RoaXMua2V5fSA8PSAke3RoaXMudmFsdWV9YDtcblx0fVxuXG5cdHB1YmxpYyBrZXlzKCk6IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gW3RoaXMua2V5XTtcblx0fVxuXG5cdHB1YmxpYyBtYXAobWFwRm5jOiBJQ29udGV4dEtleUV4cHJNYXBwZXIpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdFx0cmV0dXJuIG1hcEZuYy5tYXBTbWFsbGVyRXF1YWxzKHRoaXMua2V5LCB0aGlzLnZhbHVlKTtcblx0fVxuXG5cdHB1YmxpYyBuZWdhdGUoKTogQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXHRcdGlmICghdGhpcy5uZWdhdGVkKSB7XG5cdFx0XHR0aGlzLm5lZ2F0ZWQgPSBDb250ZXh0S2V5R3JlYXRlckV4cHIuY3JlYXRlKHRoaXMua2V5LCB0aGlzLnZhbHVlLCB0aGlzKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMubmVnYXRlZDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ29udGV4dEtleVJlZ2V4RXhwciBpbXBsZW1lbnRzIElDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cblx0cHVibGljIHN0YXRpYyBjcmVhdGUoa2V5OiBzdHJpbmcsIHJlZ2V4cDogUmVnRXhwIHwgbnVsbCk6IENvbnRleHRLZXlSZWdleEV4cHIge1xuXHRcdHJldHVybiBuZXcgQ29udGV4dEtleVJlZ2V4RXhwcihrZXksIHJlZ2V4cCk7XG5cdH1cblxuXHRwdWJsaWMgcmVhZG9ubHkgdHlwZSA9IENvbnRleHRLZXlFeHByVHlwZS5SZWdleDtcblx0cHJpdmF0ZSBuZWdhdGVkOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IG51bGwgPSBudWxsO1xuXG5cdHByaXZhdGUgY29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBrZXk6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHJlZ2V4cDogUmVnRXhwIHwgbnVsbFxuXHQpIHtcblx0XHQvL1xuXHR9XG5cblx0cHVibGljIGNtcChvdGhlcjogQ29udGV4dEtleUV4cHJlc3Npb24pOiBudW1iZXIge1xuXHRcdGlmIChvdGhlci50eXBlICE9PSB0aGlzLnR5cGUpIHtcblx0XHRcdHJldHVybiB0aGlzLnR5cGUgLSBvdGhlci50eXBlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5rZXkgPCBvdGhlci5rZXkpIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cdFx0aWYgKHRoaXMua2V5ID4gb3RoZXIua2V5KSB7XG5cdFx0XHRyZXR1cm4gMTtcblx0XHR9XG5cdFx0Y29uc3QgdGhpc1NvdXJjZSA9IHRoaXMucmVnZXhwID8gdGhpcy5yZWdleHAuc291cmNlIDogJyc7XG5cdFx0Y29uc3Qgb3RoZXJTb3VyY2UgPSBvdGhlci5yZWdleHAgPyBvdGhlci5yZWdleHAuc291cmNlIDogJyc7XG5cdFx0aWYgKHRoaXNTb3VyY2UgPCBvdGhlclNvdXJjZSkge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblx0XHRpZiAodGhpc1NvdXJjZSA+IG90aGVyU291cmNlKSB7XG5cdFx0XHRyZXR1cm4gMTtcblx0XHR9XG5cdFx0cmV0dXJuIDA7XG5cdH1cblxuXHRwdWJsaWMgZXF1YWxzKG90aGVyOiBDb250ZXh0S2V5RXhwcmVzc2lvbik6IGJvb2xlYW4ge1xuXHRcdGlmIChvdGhlci50eXBlID09PSB0aGlzLnR5cGUpIHtcblx0XHRcdGNvbnN0IHRoaXNTb3VyY2UgPSB0aGlzLnJlZ2V4cCA/IHRoaXMucmVnZXhwLnNvdXJjZSA6ICcnO1xuXHRcdFx0Y29uc3Qgb3RoZXJTb3VyY2UgPSBvdGhlci5yZWdleHAgPyBvdGhlci5yZWdleHAuc291cmNlIDogJyc7XG5cdFx0XHRyZXR1cm4gKHRoaXMua2V5ID09PSBvdGhlci5rZXkgJiYgdGhpc1NvdXJjZSA9PT0gb3RoZXJTb3VyY2UpO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgc3Vic3RpdHV0ZUNvbnN0YW50cygpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRwdWJsaWMgZXZhbHVhdGUoY29udGV4dDogSUNvbnRleHQpOiBib29sZWFuIHtcblx0XHRjb25zdCB2YWx1ZSA9IGNvbnRleHQuZ2V0VmFsdWU8YW55Pih0aGlzLmtleSk7XG5cdFx0cmV0dXJuIHRoaXMucmVnZXhwID8gdGhpcy5yZWdleHAudGVzdCh2YWx1ZSkgOiBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyBzZXJpYWxpemUoKTogc3RyaW5nIHtcblx0XHRjb25zdCB2YWx1ZSA9IHRoaXMucmVnZXhwXG5cdFx0XHQ/IGAvJHt0aGlzLnJlZ2V4cC5zb3VyY2V9LyR7dGhpcy5yZWdleHAuZmxhZ3N9YFxuXHRcdFx0OiAnL2ludmFsaWQvJztcblx0XHRyZXR1cm4gYCR7dGhpcy5rZXl9ID1+ICR7dmFsdWV9YDtcblx0fVxuXG5cdHB1YmxpYyBrZXlzKCk6IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gW3RoaXMua2V5XTtcblx0fVxuXG5cdHB1YmxpYyBtYXAobWFwRm5jOiBJQ29udGV4dEtleUV4cHJNYXBwZXIpOiBDb250ZXh0S2V5UmVnZXhFeHByIHtcblx0XHRyZXR1cm4gbWFwRm5jLm1hcFJlZ2V4KHRoaXMua2V5LCB0aGlzLnJlZ2V4cCk7XG5cdH1cblxuXHRwdWJsaWMgbmVnYXRlKCk6IENvbnRleHRLZXlFeHByZXNzaW9uIHtcblx0XHRpZiAoIXRoaXMubmVnYXRlZCkge1xuXHRcdFx0dGhpcy5uZWdhdGVkID0gQ29udGV4dEtleU5vdFJlZ2V4RXhwci5jcmVhdGUodGhpcyk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLm5lZ2F0ZWQ7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENvbnRleHRLZXlOb3RSZWdleEV4cHIgaW1wbGVtZW50cyBJQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXG5cdHB1YmxpYyBzdGF0aWMgY3JlYXRlKGFjdHVhbDogQ29udGV4dEtleVJlZ2V4RXhwcik6IENvbnRleHRLZXlFeHByZXNzaW9uIHtcblx0XHRyZXR1cm4gbmV3IENvbnRleHRLZXlOb3RSZWdleEV4cHIoYWN0dWFsKTtcblx0fVxuXG5cdHB1YmxpYyByZWFkb25seSB0eXBlID0gQ29udGV4dEtleUV4cHJUeXBlLk5vdFJlZ2V4O1xuXG5cdHByaXZhdGUgY29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBfYWN0dWFsOiBDb250ZXh0S2V5UmVnZXhFeHByKSB7XG5cdFx0Ly9cblx0fVxuXG5cdHB1YmxpYyBjbXAob3RoZXI6IENvbnRleHRLZXlFeHByZXNzaW9uKTogbnVtYmVyIHtcblx0XHRpZiAob3RoZXIudHlwZSAhPT0gdGhpcy50eXBlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy50eXBlIC0gb3RoZXIudHlwZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2FjdHVhbC5jbXAob3RoZXIuX2FjdHVhbCk7XG5cdH1cblxuXHRwdWJsaWMgZXF1YWxzKG90aGVyOiBDb250ZXh0S2V5RXhwcmVzc2lvbik6IGJvb2xlYW4ge1xuXHRcdGlmIChvdGhlci50eXBlID09PSB0aGlzLnR5cGUpIHtcblx0XHRcdHJldHVybiB0aGlzLl9hY3R1YWwuZXF1YWxzKG90aGVyLl9hY3R1YWwpO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgc3Vic3RpdHV0ZUNvbnN0YW50cygpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRwdWJsaWMgZXZhbHVhdGUoY29udGV4dDogSUNvbnRleHQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gIXRoaXMuX2FjdHVhbC5ldmFsdWF0ZShjb250ZXh0KTtcblx0fVxuXG5cdHB1YmxpYyBzZXJpYWxpemUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCEoJHt0aGlzLl9hY3R1YWwuc2VyaWFsaXplKCl9KWA7XG5cdH1cblxuXHRwdWJsaWMga2V5cygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2FjdHVhbC5rZXlzKCk7XG5cdH1cblxuXHRwdWJsaWMgbWFwKG1hcEZuYzogSUNvbnRleHRLZXlFeHByTWFwcGVyKTogQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXHRcdHJldHVybiBuZXcgQ29udGV4dEtleU5vdFJlZ2V4RXhwcih0aGlzLl9hY3R1YWwubWFwKG1hcEZuYykpO1xuXHR9XG5cblx0cHVibGljIG5lZ2F0ZSgpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2FjdHVhbDtcblx0fVxufVxuXG4vKipcbiAqIEByZXR1cm5zIHRoZSBzYW1lIGluc3RhbmNlIGlmIG5vdGhpbmcgY2hhbmdlZC5cbiAqL1xuZnVuY3Rpb24gZWxpbWluYXRlQ29uc3RhbnRzSW5BcnJheShhcnI6IENvbnRleHRLZXlFeHByZXNzaW9uW10pOiAoQ29udGV4dEtleUV4cHJlc3Npb24gfCB1bmRlZmluZWQpW10ge1xuXHQvLyBBbGxvY2F0ZSBhcnJheSBvbmx5IGlmIHRoZXJlIGlzIGEgZGlmZmVyZW5jZVxuXHRsZXQgbmV3QXJyOiAoQ29udGV4dEtleUV4cHJlc3Npb24gfCB1bmRlZmluZWQpW10gfCBudWxsID0gbnVsbDtcblx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGFyci5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdGNvbnN0IG5ld0V4cHIgPSBhcnJbaV0uc3Vic3RpdHV0ZUNvbnN0YW50cygpO1xuXG5cdFx0aWYgKGFycltpXSAhPT0gbmV3RXhwcikge1xuXHRcdFx0Ly8gc29tZXRoaW5nIGhhcyBjaGFuZ2VkIVxuXG5cdFx0XHQvLyBhbGxvY2F0ZSBhcnJheSBvbiBmaXJzdCBkaWZmZXJlbmNlXG5cdFx0XHRpZiAobmV3QXJyID09PSBudWxsKSB7XG5cdFx0XHRcdG5ld0FyciA9IFtdO1xuXHRcdFx0XHRmb3IgKGxldCBqID0gMDsgaiA8IGk7IGorKykge1xuXHRcdFx0XHRcdG5ld0FycltqXSA9IGFycltqXTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChuZXdBcnIgIT09IG51bGwpIHtcblx0XHRcdG5ld0FycltpXSA9IG5ld0V4cHI7XG5cdFx0fVxuXHR9XG5cblx0aWYgKG5ld0FyciA9PT0gbnVsbCkge1xuXHRcdHJldHVybiBhcnI7XG5cdH1cblx0cmV0dXJuIG5ld0Fycjtcbn1cblxuZXhwb3J0IGNsYXNzIENvbnRleHRLZXlBbmRFeHByIGltcGxlbWVudHMgSUNvbnRleHRLZXlFeHByZXNzaW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIGNyZWF0ZShfZXhwcjogUmVhZG9ubHlBcnJheTxDb250ZXh0S2V5RXhwcmVzc2lvbiB8IG51bGwgfCB1bmRlZmluZWQ+LCBuZWdhdGVkOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IG51bGwsIGV4dHJhUmVkdW5kYW50Q2hlY2s6IGJvb2xlYW4pOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIENvbnRleHRLZXlBbmRFeHByLl9ub3JtYWxpemVBcnIoX2V4cHIsIG5lZ2F0ZWQsIGV4dHJhUmVkdW5kYW50Q2hlY2spO1xuXHR9XG5cblx0cHVibGljIHJlYWRvbmx5IHR5cGUgPSBDb250ZXh0S2V5RXhwclR5cGUuQW5kO1xuXG5cdHByaXZhdGUgY29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGV4cHI6IENvbnRleHRLZXlFeHByZXNzaW9uW10sXG5cdFx0cHJpdmF0ZSBuZWdhdGVkOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IG51bGxcblx0KSB7XG5cdH1cblxuXHRwdWJsaWMgY21wKG90aGVyOiBDb250ZXh0S2V5RXhwcmVzc2lvbik6IG51bWJlciB7XG5cdFx0aWYgKG90aGVyLnR5cGUgIT09IHRoaXMudHlwZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMudHlwZSAtIG90aGVyLnR5cGU7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmV4cHIubGVuZ3RoIDwgb3RoZXIuZXhwci5sZW5ndGgpIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuZXhwci5sZW5ndGggPiBvdGhlci5leHByLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIDE7XG5cdFx0fVxuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSB0aGlzLmV4cHIubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IHIgPSBjbXAodGhpcy5leHByW2ldLCBvdGhlci5leHByW2ldKTtcblx0XHRcdGlmIChyICE9PSAwKSB7XG5cdFx0XHRcdHJldHVybiByO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gMDtcblx0fVxuXG5cdHB1YmxpYyBlcXVhbHMob3RoZXI6IENvbnRleHRLZXlFeHByZXNzaW9uKTogYm9vbGVhbiB7XG5cdFx0aWYgKG90aGVyLnR5cGUgPT09IHRoaXMudHlwZSkge1xuXHRcdFx0aWYgKHRoaXMuZXhwci5sZW5ndGggIT09IG90aGVyLmV4cHIubGVuZ3RoKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSB0aGlzLmV4cHIubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0aWYgKCF0aGlzLmV4cHJbaV0uZXF1YWxzKG90aGVyLmV4cHJbaV0pKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHVibGljIHN1YnN0aXR1dGVDb25zdGFudHMoKTogQ29udGV4dEtleUV4cHJlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGV4cHJBcnIgPSBlbGltaW5hdGVDb25zdGFudHNJbkFycmF5KHRoaXMuZXhwcik7XG5cdFx0aWYgKGV4cHJBcnIgPT09IHRoaXMuZXhwcikge1xuXHRcdFx0Ly8gbm8gY2hhbmdlXG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9XG5cdFx0cmV0dXJuIENvbnRleHRLZXlBbmRFeHByLmNyZWF0ZShleHByQXJyLCB0aGlzLm5lZ2F0ZWQsIGZhbHNlKTtcblx0fVxuXG5cdHB1YmxpYyBldmFsdWF0ZShjb250ZXh0OiBJQ29udGV4dCk6IGJvb2xlYW4ge1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSB0aGlzLmV4cHIubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGlmICghdGhpcy5leHByW2ldLmV2YWx1YXRlKGNvbnRleHQpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfbm9ybWFsaXplQXJyKGFycjogUmVhZG9ubHlBcnJheTxDb250ZXh0S2V5RXhwcmVzc2lvbiB8IG51bGwgfCB1bmRlZmluZWQ+LCBuZWdhdGVkOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IG51bGwsIGV4dHJhUmVkdW5kYW50Q2hlY2s6IGJvb2xlYW4pOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZXhwcjogQ29udGV4dEtleUV4cHJlc3Npb25bXSA9IFtdO1xuXHRcdGxldCBoYXNUcnVlID0gZmFsc2U7XG5cblx0XHRmb3IgKGNvbnN0IGUgb2YgYXJyKSB7XG5cdFx0XHRpZiAoIWUpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlLnR5cGUgPT09IENvbnRleHRLZXlFeHByVHlwZS5UcnVlKSB7XG5cdFx0XHRcdC8vIGFueXRoaW5nICYmIHRydWUgPT0+IGFueXRoaW5nXG5cdFx0XHRcdGhhc1RydWUgPSB0cnVlO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGUudHlwZSA9PT0gQ29udGV4dEtleUV4cHJUeXBlLkZhbHNlKSB7XG5cdFx0XHRcdC8vIGFueXRoaW5nICYmIGZhbHNlID09PiBmYWxzZVxuXHRcdFx0XHRyZXR1cm4gQ29udGV4dEtleUZhbHNlRXhwci5JTlNUQU5DRTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGUudHlwZSA9PT0gQ29udGV4dEtleUV4cHJUeXBlLkFuZCkge1xuXHRcdFx0XHRleHByLnB1c2goLi4uZS5leHByKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGV4cHIucHVzaChlKTtcblx0XHR9XG5cblx0XHRpZiAoZXhwci5sZW5ndGggPT09IDAgJiYgaGFzVHJ1ZSkge1xuXHRcdFx0cmV0dXJuIENvbnRleHRLZXlUcnVlRXhwci5JTlNUQU5DRTtcblx0XHR9XG5cblx0XHRpZiAoZXhwci5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKGV4cHIubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRyZXR1cm4gZXhwclswXTtcblx0XHR9XG5cblx0XHRleHByLnNvcnQoY21wKTtcblxuXHRcdC8vIGVsaW1pbmF0ZSBkdXBsaWNhdGUgdGVybXNcblx0XHRmb3IgKGxldCBpID0gMTsgaSA8IGV4cHIubGVuZ3RoOyBpKyspIHtcblx0XHRcdGlmIChleHByW2kgLSAxXS5lcXVhbHMoZXhwcltpXSkpIHtcblx0XHRcdFx0ZXhwci5zcGxpY2UoaSwgMSk7XG5cdFx0XHRcdGktLTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZXhwci5sZW5ndGggPT09IDEpIHtcblx0XHRcdHJldHVybiBleHByWzBdO1xuXHRcdH1cblxuXHRcdC8vIFdlIG11c3QgZGlzdHJpYnV0ZSBhbnkgT1IgZXhwcmVzc2lvbiBiZWNhdXNlIHdlIGRvbid0IHN1cHBvcnQgcGFyZW5zXG5cdFx0Ly8gT1IgZXh0ZW5zaW9ucyB3aWxsIGJlIGF0IHRoZSBlbmQgKGR1ZSB0byBzb3J0aW5nIHJ1bGVzKVxuXHRcdHdoaWxlIChleHByLmxlbmd0aCA+IDEpIHtcblx0XHRcdGNvbnN0IGxhc3RFbGVtZW50ID0gZXhwcltleHByLmxlbmd0aCAtIDFdO1xuXHRcdFx0aWYgKGxhc3RFbGVtZW50LnR5cGUgIT09IENvbnRleHRLZXlFeHByVHlwZS5Pcikge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdC8vIHBvcCB0aGUgbGFzdCBlbGVtZW50XG5cdFx0XHRleHByLnBvcCgpO1xuXG5cdFx0XHQvLyBwb3AgdGhlIHNlY29uZCB0byBsYXN0IGVsZW1lbnRcblx0XHRcdGNvbnN0IHNlY29uZFRvTGFzdEVsZW1lbnQgPSBleHByLnBvcCgpITtcblxuXHRcdFx0Y29uc3QgaXNGaW5pc2hlZCA9IChleHByLmxlbmd0aCA9PT0gMCk7XG5cblx0XHRcdC8vIGRpc3RyaWJ1dGUgYGxhc3RFbGVtZW50YCBvdmVyIGBzZWNvbmRUb0xhc3RFbGVtZW50YFxuXHRcdFx0Y29uc3QgcmVzdWx0RWxlbWVudCA9IENvbnRleHRLZXlPckV4cHIuY3JlYXRlKFxuXHRcdFx0XHRsYXN0RWxlbWVudC5leHByLm1hcChlbCA9PiBDb250ZXh0S2V5QW5kRXhwci5jcmVhdGUoW2VsLCBzZWNvbmRUb0xhc3RFbGVtZW50XSwgbnVsbCwgZXh0cmFSZWR1bmRhbnRDaGVjaykpLFxuXHRcdFx0XHRudWxsLFxuXHRcdFx0XHRpc0ZpbmlzaGVkXG5cdFx0XHQpO1xuXG5cdFx0XHRpZiAocmVzdWx0RWxlbWVudCkge1xuXHRcdFx0XHRleHByLnB1c2gocmVzdWx0RWxlbWVudCk7XG5cdFx0XHRcdGV4cHIuc29ydChjbXApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChleHByLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0cmV0dXJuIGV4cHJbMF07XG5cdFx0fVxuXG5cdFx0Ly8gcmVzb2x2ZSBmYWxzZSBBTkQgZXhwcmVzc2lvbnNcblx0XHRpZiAoZXh0cmFSZWR1bmRhbnRDaGVjaykge1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBleHByLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGZvciAobGV0IGogPSBpICsgMTsgaiA8IGV4cHIubGVuZ3RoOyBqKyspIHtcblx0XHRcdFx0XHRpZiAoZXhwcltpXS5uZWdhdGUoKS5lcXVhbHMoZXhwcltqXSkpIHtcblx0XHRcdFx0XHRcdC8vIEEgJiYgIUEgY2FzZVxuXHRcdFx0XHRcdFx0cmV0dXJuIENvbnRleHRLZXlGYWxzZUV4cHIuSU5TVEFOQ0U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChleHByLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRyZXR1cm4gZXhwclswXTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IENvbnRleHRLZXlBbmRFeHByKGV4cHIsIG5lZ2F0ZWQpO1xuXHR9XG5cblx0cHVibGljIHNlcmlhbGl6ZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmV4cHIubWFwKGUgPT4gZS5zZXJpYWxpemUoKSkuam9pbignICYmICcpO1xuXHR9XG5cblx0cHVibGljIGtleXMoKTogc3RyaW5nW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGV4cHIgb2YgdGhpcy5leHByKSB7XG5cdFx0XHRyZXN1bHQucHVzaCguLi5leHByLmtleXMoKSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgbWFwKG1hcEZuYzogSUNvbnRleHRLZXlFeHByTWFwcGVyKTogQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXHRcdHJldHVybiBuZXcgQ29udGV4dEtleUFuZEV4cHIodGhpcy5leHByLm1hcChleHByID0+IGV4cHIubWFwKG1hcEZuYykpLCBudWxsKTtcblx0fVxuXG5cdHB1YmxpYyBuZWdhdGUoKTogQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXHRcdGlmICghdGhpcy5uZWdhdGVkKSB7XG5cdFx0XHRjb25zdCByZXN1bHQ6IENvbnRleHRLZXlFeHByZXNzaW9uW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgZXhwciBvZiB0aGlzLmV4cHIpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goZXhwci5uZWdhdGUoKSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLm5lZ2F0ZWQgPSBDb250ZXh0S2V5T3JFeHByLmNyZWF0ZShyZXN1bHQsIHRoaXMsIHRydWUpITtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMubmVnYXRlZDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ29udGV4dEtleU9yRXhwciBpbXBsZW1lbnRzIElDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cblx0cHVibGljIHN0YXRpYyBjcmVhdGUoX2V4cHI6IFJlYWRvbmx5QXJyYXk8Q29udGV4dEtleUV4cHJlc3Npb24gfCBudWxsIHwgdW5kZWZpbmVkPiwgbmVnYXRlZDogQ29udGV4dEtleUV4cHJlc3Npb24gfCBudWxsLCBleHRyYVJlZHVuZGFudENoZWNrOiBib29sZWFuKTogQ29udGV4dEtleUV4cHJlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBDb250ZXh0S2V5T3JFeHByLl9ub3JtYWxpemVBcnIoX2V4cHIsIG5lZ2F0ZWQsIGV4dHJhUmVkdW5kYW50Q2hlY2spO1xuXHR9XG5cblx0cHVibGljIHJlYWRvbmx5IHR5cGUgPSBDb250ZXh0S2V5RXhwclR5cGUuT3I7XG5cblx0cHJpdmF0ZSBjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgZXhwcjogQ29udGV4dEtleUV4cHJlc3Npb25bXSxcblx0XHRwcml2YXRlIG5lZ2F0ZWQ6IENvbnRleHRLZXlFeHByZXNzaW9uIHwgbnVsbFxuXHQpIHtcblx0fVxuXG5cdHB1YmxpYyBjbXAob3RoZXI6IENvbnRleHRLZXlFeHByZXNzaW9uKTogbnVtYmVyIHtcblx0XHRpZiAob3RoZXIudHlwZSAhPT0gdGhpcy50eXBlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy50eXBlIC0gb3RoZXIudHlwZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuZXhwci5sZW5ndGggPCBvdGhlci5leHByLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblx0XHRpZiAodGhpcy5leHByLmxlbmd0aCA+IG90aGVyLmV4cHIubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gMTtcblx0XHR9XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHRoaXMuZXhwci5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgciA9IGNtcCh0aGlzLmV4cHJbaV0sIG90aGVyLmV4cHJbaV0pO1xuXHRcdFx0aWYgKHIgIT09IDApIHtcblx0XHRcdFx0cmV0dXJuIHI7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiAwO1xuXHR9XG5cblx0cHVibGljIGVxdWFscyhvdGhlcjogQ29udGV4dEtleUV4cHJlc3Npb24pOiBib29sZWFuIHtcblx0XHRpZiAob3RoZXIudHlwZSA9PT0gdGhpcy50eXBlKSB7XG5cdFx0XHRpZiAodGhpcy5leHByLmxlbmd0aCAhPT0gb3RoZXIuZXhwci5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHRoaXMuZXhwci5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRpZiAoIXRoaXMuZXhwcltpXS5lcXVhbHMob3RoZXIuZXhwcltpXSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgc3Vic3RpdHV0ZUNvbnN0YW50cygpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZXhwckFyciA9IGVsaW1pbmF0ZUNvbnN0YW50c0luQXJyYXkodGhpcy5leHByKTtcblx0XHRpZiAoZXhwckFyciA9PT0gdGhpcy5leHByKSB7XG5cdFx0XHQvLyBubyBjaGFuZ2Vcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH1cblx0XHRyZXR1cm4gQ29udGV4dEtleU9yRXhwci5jcmVhdGUoZXhwckFyciwgdGhpcy5uZWdhdGVkLCBmYWxzZSk7XG5cdH1cblxuXHRwdWJsaWMgZXZhbHVhdGUoY29udGV4dDogSUNvbnRleHQpOiBib29sZWFuIHtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gdGhpcy5leHByLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRpZiAodGhpcy5leHByW2ldLmV2YWx1YXRlKGNvbnRleHQpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfbm9ybWFsaXplQXJyKGFycjogUmVhZG9ubHlBcnJheTxDb250ZXh0S2V5RXhwcmVzc2lvbiB8IG51bGwgfCB1bmRlZmluZWQ+LCBuZWdhdGVkOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IG51bGwsIGV4dHJhUmVkdW5kYW50Q2hlY2s6IGJvb2xlYW4pOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0bGV0IGV4cHI6IENvbnRleHRLZXlFeHByZXNzaW9uW10gPSBbXTtcblx0XHRsZXQgaGFzRmFsc2UgPSBmYWxzZTtcblxuXHRcdGlmIChhcnIpIHtcblx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBhcnIubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgZSA9IGFycltpXTtcblx0XHRcdFx0aWYgKCFlKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoZS50eXBlID09PSBDb250ZXh0S2V5RXhwclR5cGUuRmFsc2UpIHtcblx0XHRcdFx0XHQvLyBhbnl0aGluZyB8fCBmYWxzZSA9PT4gYW55dGhpbmdcblx0XHRcdFx0XHRoYXNGYWxzZSA9IHRydWU7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoZS50eXBlID09PSBDb250ZXh0S2V5RXhwclR5cGUuVHJ1ZSkge1xuXHRcdFx0XHRcdC8vIGFueXRoaW5nIHx8IHRydWUgPT0+IHRydWVcblx0XHRcdFx0XHRyZXR1cm4gQ29udGV4dEtleVRydWVFeHByLklOU1RBTkNFO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGUudHlwZSA9PT0gQ29udGV4dEtleUV4cHJUeXBlLk9yKSB7XG5cdFx0XHRcdFx0ZXhwciA9IGV4cHIuY29uY2F0KGUuZXhwcik7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRleHByLnB1c2goZSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChleHByLmxlbmd0aCA9PT0gMCAmJiBoYXNGYWxzZSkge1xuXHRcdFx0XHRyZXR1cm4gQ29udGV4dEtleUZhbHNlRXhwci5JTlNUQU5DRTtcblx0XHRcdH1cblxuXHRcdFx0ZXhwci5zb3J0KGNtcCk7XG5cdFx0fVxuXG5cdFx0aWYgKGV4cHIubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmIChleHByLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0cmV0dXJuIGV4cHJbMF07XG5cdFx0fVxuXG5cdFx0Ly8gZWxpbWluYXRlIGR1cGxpY2F0ZSB0ZXJtc1xuXHRcdGZvciAobGV0IGkgPSAxOyBpIDwgZXhwci5sZW5ndGg7IGkrKykge1xuXHRcdFx0aWYgKGV4cHJbaSAtIDFdLmVxdWFscyhleHByW2ldKSkge1xuXHRcdFx0XHRleHByLnNwbGljZShpLCAxKTtcblx0XHRcdFx0aS0tO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChleHByLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0cmV0dXJuIGV4cHJbMF07XG5cdFx0fVxuXG5cdFx0Ly8gcmVzb2x2ZSB0cnVlIE9SIGV4cHJlc3Npb25zXG5cdFx0aWYgKGV4dHJhUmVkdW5kYW50Q2hlY2spIHtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZXhwci5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRmb3IgKGxldCBqID0gaSArIDE7IGogPCBleHByLmxlbmd0aDsgaisrKSB7XG5cdFx0XHRcdFx0aWYgKGV4cHJbaV0ubmVnYXRlKCkuZXF1YWxzKGV4cHJbal0pKSB7XG5cdFx0XHRcdFx0XHQvLyBBIHx8ICFBIGNhc2Vcblx0XHRcdFx0XHRcdHJldHVybiBDb250ZXh0S2V5VHJ1ZUV4cHIuSU5TVEFOQ0U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChleHByLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRyZXR1cm4gZXhwclswXTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IENvbnRleHRLZXlPckV4cHIoZXhwciwgbmVnYXRlZCk7XG5cdH1cblxuXHRwdWJsaWMgc2VyaWFsaXplKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuZXhwci5tYXAoZSA9PiBlLnNlcmlhbGl6ZSgpKS5qb2luKCcgfHwgJyk7XG5cdH1cblxuXHRwdWJsaWMga2V5cygpOiBzdHJpbmdbXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZXhwciBvZiB0aGlzLmV4cHIpIHtcblx0XHRcdHJlc3VsdC5wdXNoKC4uLmV4cHIua2V5cygpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBtYXAobWFwRm5jOiBJQ29udGV4dEtleUV4cHJNYXBwZXIpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdFx0cmV0dXJuIG5ldyBDb250ZXh0S2V5T3JFeHByKHRoaXMuZXhwci5tYXAoZXhwciA9PiBleHByLm1hcChtYXBGbmMpKSwgbnVsbCk7XG5cdH1cblxuXHRwdWJsaWMgbmVnYXRlKCk6IENvbnRleHRLZXlFeHByZXNzaW9uIHtcblx0XHRpZiAoIXRoaXMubmVnYXRlZCkge1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBDb250ZXh0S2V5RXhwcmVzc2lvbltdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGV4cHIgb2YgdGhpcy5leHByKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKGV4cHIubmVnYXRlKCkpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBXZSBkb24ndCBzdXBwb3J0IHBhcmVucywgc28gaGVyZSB3ZSBkaXN0cmlidXRlIHRoZSBBTkQgb3ZlciB0aGUgT1IgdGVybWluYWxzXG5cdFx0XHQvLyBXZSBhbHdheXMgdGFrZSB0aGUgZmlyc3QgMiBBTkQgcGFpcnMgYW5kIGRpc3RyaWJ1dGUgdGhlbVxuXHRcdFx0d2hpbGUgKHJlc3VsdC5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdGNvbnN0IExFRlQgPSByZXN1bHQuc2hpZnQoKSE7XG5cdFx0XHRcdGNvbnN0IFJJR0hUID0gcmVzdWx0LnNoaWZ0KCkhO1xuXG5cdFx0XHRcdGNvbnN0IGFsbDogQ29udGV4dEtleUV4cHJlc3Npb25bXSA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGxlZnQgb2YgZ2V0VGVybWluYWxzKExFRlQpKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCByaWdodCBvZiBnZXRUZXJtaW5hbHMoUklHSFQpKSB7XG5cdFx0XHRcdFx0XHRhbGwucHVzaChDb250ZXh0S2V5QW5kRXhwci5jcmVhdGUoW2xlZnQsIHJpZ2h0XSwgbnVsbCwgZmFsc2UpISk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmVzdWx0LnVuc2hpZnQoQ29udGV4dEtleU9yRXhwci5jcmVhdGUoYWxsLCBudWxsLCBmYWxzZSkhKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5uZWdhdGVkID0gQ29udGV4dEtleU9yRXhwci5jcmVhdGUocmVzdWx0LCB0aGlzLCB0cnVlKSE7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLm5lZ2F0ZWQ7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBDb250ZXh0S2V5SW5mbyB7XG5cdHJlYWRvbmx5IGtleTogc3RyaW5nO1xuXHRyZWFkb25seSB0eXBlPzogc3RyaW5nO1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbj86IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIFJhd0NvbnRleHRLZXk8VCBleHRlbmRzIENvbnRleHRLZXlWYWx1ZT4gZXh0ZW5kcyBDb250ZXh0S2V5RGVmaW5lZEV4cHIge1xuXG5cdHByaXZhdGUgc3RhdGljIF9pbmZvOiBDb250ZXh0S2V5SW5mb1tdID0gW107XG5cblx0c3RhdGljIGFsbCgpOiBJdGVyYWJsZUl0ZXJhdG9yPENvbnRleHRLZXlJbmZvPiB7XG5cdFx0cmV0dXJuIFJhd0NvbnRleHRLZXkuX2luZm8udmFsdWVzKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWZhdWx0VmFsdWU6IFQgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3Ioa2V5OiBzdHJpbmcsIGRlZmF1bHRWYWx1ZTogVCB8IHVuZGVmaW5lZCwgbWV0YU9ySGlkZT86IHN0cmluZyB8IHRydWUgfCB7IHR5cGU6IHN0cmluZzsgZGVzY3JpcHRpb246IHN0cmluZyB9KSB7XG5cdFx0c3VwZXIoa2V5LCBudWxsKTtcblx0XHR0aGlzLl9kZWZhdWx0VmFsdWUgPSBkZWZhdWx0VmFsdWU7XG5cblx0XHQvLyBjb2xsZWN0IGFsbCBjb250ZXh0IGtleXMgaW50byBhIGNlbnRyYWwgcGxhY2Vcblx0XHRpZiAodHlwZW9mIG1ldGFPckhpZGUgPT09ICdvYmplY3QnKSB7XG5cdFx0XHRSYXdDb250ZXh0S2V5Ll9pbmZvLnB1c2goeyAuLi5tZXRhT3JIaWRlLCBrZXkgfSk7XG5cdFx0fSBlbHNlIGlmIChtZXRhT3JIaWRlICE9PSB0cnVlKSB7XG5cdFx0XHRSYXdDb250ZXh0S2V5Ll9pbmZvLnB1c2goeyBrZXksIGRlc2NyaXB0aW9uOiBtZXRhT3JIaWRlLCB0eXBlOiBkZWZhdWx0VmFsdWUgIT09IG51bGwgJiYgZGVmYXVsdFZhbHVlICE9PSB1bmRlZmluZWQgPyB0eXBlb2YgZGVmYXVsdFZhbHVlIDogdW5kZWZpbmVkIH0pO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBiaW5kVG8odGFyZ2V0OiBJQ29udGV4dEtleVNlcnZpY2UpOiBJQ29udGV4dEtleTxUPiB7XG5cdFx0cmV0dXJuIHRhcmdldC5jcmVhdGVLZXkodGhpcy5rZXksIHRoaXMuX2RlZmF1bHRWYWx1ZSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0VmFsdWUodGFyZ2V0OiBJQ29udGV4dEtleVNlcnZpY2UpOiBUIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGFyZ2V0LmdldENvbnRleHRLZXlWYWx1ZTxUPih0aGlzLmtleSk7XG5cdH1cblxuXHRwdWJsaWMgdG9OZWdhdGVkKCk6IENvbnRleHRLZXlFeHByZXNzaW9uIHtcblx0XHRyZXR1cm4gdGhpcy5uZWdhdGUoKTtcblx0fVxuXG5cdHB1YmxpYyBpc0VxdWFsVG8odmFsdWU6IGFueSk6IENvbnRleHRLZXlFeHByZXNzaW9uIHtcblx0XHRyZXR1cm4gQ29udGV4dEtleUVxdWFsc0V4cHIuY3JlYXRlKHRoaXMua2V5LCB2YWx1ZSk7XG5cdH1cblxuXHRwdWJsaWMgbm90RXF1YWxzVG8odmFsdWU6IGFueSk6IENvbnRleHRLZXlFeHByZXNzaW9uIHtcblx0XHRyZXR1cm4gQ29udGV4dEtleU5vdEVxdWFsc0V4cHIuY3JlYXRlKHRoaXMua2V5LCB2YWx1ZSk7XG5cdH1cblxuXHRwdWJsaWMgZ3JlYXRlcih2YWx1ZTogYW55KTogQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXHRcdHJldHVybiBDb250ZXh0S2V5R3JlYXRlckV4cHIuY3JlYXRlKHRoaXMua2V5LCB2YWx1ZSk7XG5cdH1cbn1cblxuZXhwb3J0IHR5cGUgQ29udGV4dEtleVZhbHVlID0gbnVsbCB8IHVuZGVmaW5lZCB8IGJvb2xlYW4gfCBudW1iZXIgfCBzdHJpbmdcblx0fCBBcnJheTxudWxsIHwgdW5kZWZpbmVkIHwgYm9vbGVhbiB8IG51bWJlciB8IHN0cmluZz5cblx0fCBSZWNvcmQ8c3RyaW5nLCBudWxsIHwgdW5kZWZpbmVkIHwgYm9vbGVhbiB8IG51bWJlciB8IHN0cmluZz47XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbnRleHQge1xuXHRnZXRWYWx1ZTxUIGV4dGVuZHMgQ29udGV4dEtleVZhbHVlID0gQ29udGV4dEtleVZhbHVlPihrZXk6IHN0cmluZyk6IFQgfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbnRleHRLZXk8VCBleHRlbmRzIENvbnRleHRLZXlWYWx1ZSA9IENvbnRleHRLZXlWYWx1ZT4ge1xuXHRzZXQodmFsdWU6IFQpOiB2b2lkO1xuXHRyZXNldCgpOiB2b2lkO1xuXHRnZXQoKTogVCB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ29udGV4dEtleVNlcnZpY2VUYXJnZXQge1xuXHRwYXJlbnRFbGVtZW50OiBJQ29udGV4dEtleVNlcnZpY2VUYXJnZXQgfCBudWxsO1xuXHRzZXRBdHRyaWJ1dGUoYXR0cjogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKTogdm9pZDtcblx0cmVtb3ZlQXR0cmlidXRlKGF0dHI6IHN0cmluZyk6IHZvaWQ7XG5cdGhhc0F0dHJpYnV0ZShhdHRyOiBzdHJpbmcpOiBib29sZWFuO1xuXHRnZXRBdHRyaWJ1dGUoYXR0cjogc3RyaW5nKTogc3RyaW5nIHwgbnVsbDtcbn1cblxuZXhwb3J0IGNvbnN0IElDb250ZXh0S2V5U2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJQ29udGV4dEtleVNlcnZpY2U+KCdjb250ZXh0S2V5U2VydmljZScpO1xuXG5leHBvcnQgaW50ZXJmYWNlIElSZWFkYWJsZVNldDxUPiB7XG5cdGhhcyh2YWx1ZTogVCk6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbnRleHRLZXlDaGFuZ2VFdmVudCB7XG5cdGFmZmVjdHNTb21lKGtleXM6IElSZWFkYWJsZVNldDxzdHJpbmc+KTogYm9vbGVhbjtcblx0YWxsS2V5c0NvbnRhaW5lZEluKGtleXM6IElSZWFkYWJsZVNldDxzdHJpbmc+KTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IHR5cGUgSVNjb3BlZENvbnRleHRLZXlTZXJ2aWNlID0gSUNvbnRleHRLZXlTZXJ2aWNlICYgSURpc3Bvc2FibGU7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbnRleHRLZXlTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29udGV4dDogRXZlbnQ8SUNvbnRleHRLZXlDaGFuZ2VFdmVudD47XG5cdGJ1ZmZlckNoYW5nZUV2ZW50cyhjYWxsYmFjazogRnVuY3Rpb24pOiB2b2lkO1xuXG5cdGNyZWF0ZUtleTxUIGV4dGVuZHMgQ29udGV4dEtleVZhbHVlPihrZXk6IHN0cmluZywgZGVmYXVsdFZhbHVlOiBUIHwgdW5kZWZpbmVkKTogSUNvbnRleHRLZXk8VD47XG5cdGNvbnRleHRNYXRjaGVzUnVsZXMocnVsZXM6IENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkKTogYm9vbGVhbjtcblx0Z2V0Q29udGV4dEtleVZhbHVlPFQ+KGtleTogc3RyaW5nKTogVCB8IHVuZGVmaW5lZDtcblxuXHRjcmVhdGVTY29wZWQodGFyZ2V0OiBJQ29udGV4dEtleVNlcnZpY2VUYXJnZXQpOiBJU2NvcGVkQ29udGV4dEtleVNlcnZpY2U7XG5cdGNyZWF0ZU92ZXJsYXkob3ZlcmxheTogSXRlcmFibGU8W3N0cmluZywgYW55XT4pOiBJQ29udGV4dEtleVNlcnZpY2U7XG5cdGdldENvbnRleHQodGFyZ2V0OiBJQ29udGV4dEtleVNlcnZpY2VUYXJnZXQgfCBudWxsKTogSUNvbnRleHQ7XG5cblx0dXBkYXRlUGFyZW50KHBhcmVudENvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UpOiB2b2lkO1xufVxuXG5mdW5jdGlvbiBjbXAxKGtleTE6IHN0cmluZywga2V5Mjogc3RyaW5nKTogbnVtYmVyIHtcblx0aWYgKGtleTEgPCBrZXkyKSB7XG5cdFx0cmV0dXJuIC0xO1xuXHR9XG5cdGlmIChrZXkxID4ga2V5Mikge1xuXHRcdHJldHVybiAxO1xuXHR9XG5cdHJldHVybiAwO1xufVxuXG5mdW5jdGlvbiBjbXAyKGtleTE6IHN0cmluZywgdmFsdWUxOiBhbnksIGtleTI6IHN0cmluZywgdmFsdWUyOiBhbnkpOiBudW1iZXIge1xuXHRpZiAoa2V5MSA8IGtleTIpIHtcblx0XHRyZXR1cm4gLTE7XG5cdH1cblx0aWYgKGtleTEgPiBrZXkyKSB7XG5cdFx0cmV0dXJuIDE7XG5cdH1cblx0aWYgKHZhbHVlMSA8IHZhbHVlMikge1xuXHRcdHJldHVybiAtMTtcblx0fVxuXHRpZiAodmFsdWUxID4gdmFsdWUyKSB7XG5cdFx0cmV0dXJuIDE7XG5cdH1cblx0cmV0dXJuIDA7XG59XG5cbi8qKlxuICogUmV0dXJucyB0cnVlIGlmIGl0IGlzIHByb3ZhYmxlIGBwYCBpbXBsaWVzIGBxYC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGltcGxpZXMocDogQ29udGV4dEtleUV4cHJlc3Npb24sIHE6IENvbnRleHRLZXlFeHByZXNzaW9uKTogYm9vbGVhbiB7XG5cblx0aWYgKHAudHlwZSA9PT0gQ29udGV4dEtleUV4cHJUeXBlLkZhbHNlIHx8IHEudHlwZSA9PT0gQ29udGV4dEtleUV4cHJUeXBlLlRydWUpIHtcblx0XHQvLyBmYWxzZSBpbXBsaWVzIGFueXRoaW5nXG5cdFx0Ly8gYW55dGhpbmcgaW1wbGllcyB0cnVlXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRpZiAocC50eXBlID09PSBDb250ZXh0S2V5RXhwclR5cGUuT3IpIHtcblx0XHRpZiAocS50eXBlID09PSBDb250ZXh0S2V5RXhwclR5cGUuT3IpIHtcblx0XHRcdC8vIGBhIHx8IGIgfHwgY2AgY2FuIG9ubHkgaW1wbHkgc29tZXRoaW5nIGxpa2UgYGEgfHwgYiB8fCBjIHx8IGRgXG5cdFx0XHRyZXR1cm4gYWxsRWxlbWVudHNJbmNsdWRlZChwLmV4cHIsIHEuZXhwcik7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGlmIChxLnR5cGUgPT09IENvbnRleHRLZXlFeHByVHlwZS5Pcikge1xuXHRcdGZvciAoY29uc3QgZWxlbWVudCBvZiBxLmV4cHIpIHtcblx0XHRcdGlmIChpbXBsaWVzKHAsIGVsZW1lbnQpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRpZiAocC50eXBlID09PSBDb250ZXh0S2V5RXhwclR5cGUuQW5kKSB7XG5cdFx0aWYgKHEudHlwZSA9PT0gQ29udGV4dEtleUV4cHJUeXBlLkFuZCkge1xuXHRcdFx0Ly8gYGEgJiYgYiAmJiBjYCBpbXBsaWVzIGBhICYmIGNgXG5cdFx0XHRyZXR1cm4gYWxsRWxlbWVudHNJbmNsdWRlZChxLmV4cHIsIHAuZXhwcik7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgZWxlbWVudCBvZiBwLmV4cHIpIHtcblx0XHRcdGlmIChpbXBsaWVzKGVsZW1lbnQsIHEpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRyZXR1cm4gcC5lcXVhbHMocSk7XG59XG5cbi8qKlxuICogUmV0dXJucyB0cnVlIGlmIGFsbCBlbGVtZW50cyBpbiBgcGAgYXJlIGFsc28gcHJlc2VudCBpbiBgcWAuXG4gKiBUaGUgdHdvIGFycmF5cyBhcmUgYXNzdW1lZCB0byBiZSBzb3J0ZWRcbiAqL1xuZnVuY3Rpb24gYWxsRWxlbWVudHNJbmNsdWRlZChwOiBDb250ZXh0S2V5RXhwcmVzc2lvbltdLCBxOiBDb250ZXh0S2V5RXhwcmVzc2lvbltdKTogYm9vbGVhbiB7XG5cdGxldCBwSW5kZXggPSAwO1xuXHRsZXQgcUluZGV4ID0gMDtcblx0d2hpbGUgKHBJbmRleCA8IHAubGVuZ3RoICYmIHFJbmRleCA8IHEubGVuZ3RoKSB7XG5cdFx0Y29uc3QgY21wID0gcFtwSW5kZXhdLmNtcChxW3FJbmRleF0pO1xuXG5cdFx0aWYgKGNtcCA8IDApIHtcblx0XHRcdC8vIGFuIGVsZW1lbnQgZnJvbSBgcGAgaXMgbWlzc2luZyBmcm9tIGBxYFxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH0gZWxzZSBpZiAoY21wID09PSAwKSB7XG5cdFx0XHRwSW5kZXgrKztcblx0XHRcdHFJbmRleCsrO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRxSW5kZXgrKztcblx0XHR9XG5cdH1cblx0cmV0dXJuIChwSW5kZXggPT09IHAubGVuZ3RoKTtcbn1cblxuZnVuY3Rpb24gZ2V0VGVybWluYWxzKG5vZGU6IENvbnRleHRLZXlFeHByZXNzaW9uKSB7XG5cdGlmIChub2RlLnR5cGUgPT09IENvbnRleHRLZXlFeHByVHlwZS5Pcikge1xuXHRcdHJldHVybiBub2RlLmV4cHI7XG5cdH1cblx0cmV0dXJuIFtub2RlXTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsVUFBVSxRQUFRLFdBQVcsU0FBUyxhQUFhLFVBQVUsT0FBTyxpQkFBaUI7QUFDOUYsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxTQUE2QixpQkFBaUI7QUFDdkQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyx1QkFBdUI7QUFFaEMsTUFBTSxrQkFBa0Isb0JBQUksSUFBcUI7QUFDakQsZ0JBQWdCLElBQUksU0FBUyxLQUFLO0FBQ2xDLGdCQUFnQixJQUFJLFFBQVEsSUFBSTtBQUNoQyxnQkFBZ0IsSUFBSSxTQUFTLFdBQVc7QUFDeEMsZ0JBQWdCLElBQUksV0FBVyxPQUFPO0FBQ3RDLGdCQUFnQixJQUFJLGFBQWEsU0FBUztBQUMxQyxnQkFBZ0IsSUFBSSxTQUFTLEtBQUs7QUFDbEMsZ0JBQWdCLElBQUksZUFBZSxlQUFlLENBQUMsS0FBSztBQUN4RCxnQkFBZ0IsSUFBSSxVQUFVLE1BQU07QUFDcEMsZ0JBQWdCLElBQUksYUFBYSxTQUFTO0FBQzFDLGdCQUFnQixJQUFJLFlBQVksUUFBUTtBQUN4QyxnQkFBZ0IsSUFBSSxZQUFZLFFBQVE7QUFHakMsU0FBUyxZQUFZLEtBQWEsT0FBZ0I7QUFDeEQsTUFBSSxnQkFBZ0IsSUFBSSxHQUFHLE1BQU0sUUFBVztBQUFFLFVBQU0sZ0JBQWdCLG9FQUFv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Q1I7QUFDQSxNQUFJLE9BQU8sTUFBTTtBQUNoQixXQUFPO0FBQUEsRUFDUjtBQUNBLE1BQUksU0FBUyxRQUFRO0FBQ3BCLFdBQU87QUFBQSxFQUNSO0FBQ0EsTUFBSSxTQUFTLFFBQVE7QUFDcEIsV0FBTztBQUFBLEVBQ1I7QUFDQSxTQUFPO0FBQ1I7QUFLTyxTQUFTLFFBQVEsR0FBeUIsR0FBa0M7QUFFbEYsTUFBSSxFQUFFLFNBQVMsaUJBQTRCLEVBQUUsU0FBUyxjQUF5QjtBQUc5RSxXQUFPO0FBQUEsRUFDUjtBQUVBLE1BQUksRUFBRSxTQUFTLFlBQXVCO0FBQ3JDLFFBQUksRUFBRSxTQUFTLFlBQXVCO0FBRXJDLGFBQU8sb0JBQW9CLEVBQUUsTUFBTSxFQUFFLElBQUk7QUFBQSxJQUMxQztBQUNBLFdBQU87QUFBQSxFQUNSO0FBRUEsTUFBSSxFQUFFLFNBQVMsWUFBdUI7QUFDckMsZUFBVyxXQUFXLEVBQUUsTUFBTTtBQUM3QixVQUFJLFFBQVEsR0FBRyxPQUFPLEdBQUc7QUFDeEIsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFFQSxNQUFJLEVBQUUsU0FBUyxhQUF3QjtBQUN0QyxRQUFJLEVBQUUsU0FBUyxhQUF3QjtBQUV0QyxhQUFPLG9CQUFvQixFQUFFLE1BQU0sRUFBRSxJQUFJO0FBQUEsSUFDMUM7QUFDQSxlQUFXLFdBQVcsRUFBRSxNQUFNO0FBQzdCLFVBQUksUUFBUSxTQUFTLENBQUMsR0FBRztBQUN4QixlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUVBLFNBQU8sRUFBRSxPQUFPLENBQUM7QUFDbEI7QUFNQSxTQUFTLG9CQUFvQixHQUEyQixHQUFvQztBQUMzRixNQUFJLFNBQVM7QUFDYixNQUFJLFNBQVM7QUFDYixTQUFPLFNBQVMsRUFBRSxVQUFVLFNBQVMsRUFBRSxRQUFRO0FBQzlDLFVBQU1DLE9BQU0sRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLE1BQU0sQ0FBQztBQUVuQyxRQUFJQSxPQUFNLEdBQUc7QUFFWixhQUFPO0FBQUEsSUFDUixXQUFXQSxTQUFRLEdBQUc7QUFDckI7QUFDQTtBQUFBLElBQ0QsT0FBTztBQUNOO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDQSxTQUFRLFdBQVcsRUFBRTtBQUN0QjtBQUVBLFNBQVMsYUFBYSxNQUE0QjtBQUNqRCxNQUFJLEtBQUssU0FBUyxZQUF1QjtBQUN4QyxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQ0EsU0FBTyxDQUFDLElBQUk7QUFDYjsiLAogICJuYW1lcyI6IFsiQ29udGV4dEtleUV4cHJUeXBlIiwgImNtcCJdCn0K
