import { CharCode } from "../../../../base/common/charCode.js";
var TokenType = /* @__PURE__ */ ((TokenType2) => {
  TokenType2[TokenType2["Dollar"] = 0] = "Dollar";
  TokenType2[TokenType2["Colon"] = 1] = "Colon";
  TokenType2[TokenType2["Comma"] = 2] = "Comma";
  TokenType2[TokenType2["CurlyOpen"] = 3] = "CurlyOpen";
  TokenType2[TokenType2["CurlyClose"] = 4] = "CurlyClose";
  TokenType2[TokenType2["Backslash"] = 5] = "Backslash";
  TokenType2[TokenType2["Forwardslash"] = 6] = "Forwardslash";
  TokenType2[TokenType2["Pipe"] = 7] = "Pipe";
  TokenType2[TokenType2["Int"] = 8] = "Int";
  TokenType2[TokenType2["VariableName"] = 9] = "VariableName";
  TokenType2[TokenType2["Format"] = 10] = "Format";
  TokenType2[TokenType2["Plus"] = 11] = "Plus";
  TokenType2[TokenType2["Dash"] = 12] = "Dash";
  TokenType2[TokenType2["QuestionMark"] = 13] = "QuestionMark";
  TokenType2[TokenType2["EOF"] = 14] = "EOF";
  return TokenType2;
})(TokenType || {});
const _Scanner = class _Scanner {
  constructor() {
    this.value = "";
    this.pos = 0;
  }
  static isDigitCharacter(ch) {
    return ch >= CharCode.Digit0 && ch <= CharCode.Digit9;
  }
  static isVariableCharacter(ch) {
    return ch === CharCode.Underline || ch >= CharCode.a && ch <= CharCode.z || ch >= CharCode.A && ch <= CharCode.Z;
  }
  text(value) {
    this.value = value;
    this.pos = 0;
  }
  tokenText(token) {
    return this.value.substr(token.pos, token.len);
  }
  next() {
    if (this.pos >= this.value.length) {
      return { type: 14 /* EOF */, pos: this.pos, len: 0 };
    }
    const pos = this.pos;
    let len = 0;
    let ch = this.value.charCodeAt(pos);
    let type;
    type = _Scanner._table[ch];
    if (typeof type === "number") {
      this.pos += 1;
      return { type, pos, len: 1 };
    }
    if (_Scanner.isDigitCharacter(ch)) {
      type = 8 /* Int */;
      do {
        len += 1;
        ch = this.value.charCodeAt(pos + len);
      } while (_Scanner.isDigitCharacter(ch));
      this.pos += len;
      return { type, pos, len };
    }
    if (_Scanner.isVariableCharacter(ch)) {
      type = 9 /* VariableName */;
      do {
        ch = this.value.charCodeAt(pos + ++len);
      } while (_Scanner.isVariableCharacter(ch) || _Scanner.isDigitCharacter(ch));
      this.pos += len;
      return { type, pos, len };
    }
    type = 10 /* Format */;
    do {
      len += 1;
      ch = this.value.charCodeAt(pos + len);
    } while (!isNaN(ch) && typeof _Scanner._table[ch] === "undefined" && !_Scanner.isDigitCharacter(ch) && !_Scanner.isVariableCharacter(ch));
    this.pos += len;
    return { type, pos, len };
  }
};
_Scanner._table = {
  [CharCode.DollarSign]: 0 /* Dollar */,
  [CharCode.Colon]: 1 /* Colon */,
  [CharCode.Comma]: 2 /* Comma */,
  [CharCode.OpenCurlyBrace]: 3 /* CurlyOpen */,
  [CharCode.CloseCurlyBrace]: 4 /* CurlyClose */,
  [CharCode.Backslash]: 5 /* Backslash */,
  [CharCode.Slash]: 6 /* Forwardslash */,
  [CharCode.Pipe]: 7 /* Pipe */,
  [CharCode.Plus]: 11 /* Plus */,
  [CharCode.Dash]: 12 /* Dash */,
  [CharCode.QuestionMark]: 13 /* QuestionMark */
};
let Scanner = _Scanner;
class Marker {
  constructor() {
    this._children = [];
  }
  appendChild(child) {
    if (child instanceof Text && this._children[this._children.length - 1] instanceof Text) {
      this._children[this._children.length - 1].value += child.value;
    } else {
      child.parent = this;
      this._children.push(child);
    }
    return this;
  }
  replace(child, others) {
    const { parent } = child;
    const idx = parent.children.indexOf(child);
    const newChildren = parent.children.slice(0);
    newChildren.splice(idx, 1, ...others);
    parent._children = newChildren;
    (function _fixParent(children, parent2) {
      for (const child2 of children) {
        child2.parent = parent2;
        _fixParent(child2.children, child2);
      }
    })(others, parent);
  }
  get children() {
    return this._children;
  }
  get rightMostDescendant() {
    if (this._children.length > 0) {
      return this._children[this._children.length - 1].rightMostDescendant;
    }
    return this;
  }
  get snippet() {
    let candidate = this;
    while (true) {
      if (!candidate) {
        return void 0;
      }
      if (candidate instanceof TextmateSnippet) {
        return candidate;
      }
      candidate = candidate.parent;
    }
  }
  toString() {
    return this.children.reduce((prev, cur) => prev + cur.toString(), "");
  }
  len() {
    return 0;
  }
}
class Text extends Marker {
  constructor(value) {
    super();
    this.value = value;
  }
  static escape(value) {
    return value.replace(/\$|}|\\/g, "\\$&");
  }
  toString() {
    return this.value;
  }
  toTextmateString() {
    return Text.escape(this.value);
  }
  len() {
    return this.value.length;
  }
  clone() {
    return new Text(this.value);
  }
}
class TransformableMarker extends Marker {
}
class Placeholder extends TransformableMarker {
  constructor(index) {
    super();
    this.index = index;
  }
  static compareByIndex(a, b) {
    if (a.index === b.index) {
      return 0;
    } else if (a.isFinalTabstop) {
      return 1;
    } else if (b.isFinalTabstop) {
      return -1;
    } else if (a.index < b.index) {
      return -1;
    } else if (a.index > b.index) {
      return 1;
    } else {
      return 0;
    }
  }
  get isFinalTabstop() {
    return this.index === 0;
  }
  get choice() {
    return this._children.length === 1 && this._children[0] instanceof Choice ? this._children[0] : void 0;
  }
  toTextmateString() {
    let transformString = "";
    if (this.transform) {
      transformString = this.transform.toTextmateString();
    }
    if (this.children.length === 0 && !this.transform) {
      return `$${this.index}`;
    } else if (this.children.length === 0) {
      return `\${${this.index}${transformString}}`;
    } else if (this.choice) {
      return `\${${this.index}|${this.choice.toTextmateString()}|${transformString}}`;
    } else {
      return `\${${this.index}:${this.children.map((child) => child.toTextmateString()).join("")}${transformString}}`;
    }
  }
  clone() {
    const ret = new Placeholder(this.index);
    if (this.transform) {
      ret.transform = this.transform.clone();
    }
    ret._children = this.children.map((child) => child.clone());
    return ret;
  }
}
class Choice extends Marker {
  constructor() {
    super(...arguments);
    this.options = [];
  }
  appendChild(marker) {
    if (marker instanceof Text) {
      marker.parent = this;
      this.options.push(marker);
    }
    return this;
  }
  toString() {
    return this.options[0].value;
  }
  toTextmateString() {
    return this.options.map((option) => option.value.replace(/\||,|\\/g, "\\$&")).join(",");
  }
  len() {
    return this.options[0].len();
  }
  clone() {
    const ret = new Choice();
    this.options.forEach(ret.appendChild, ret);
    return ret;
  }
}
class Transform extends Marker {
  constructor() {
    super(...arguments);
    this.regexp = new RegExp("");
  }
  resolve(value) {
    const _this = this;
    let didMatch = false;
    let ret = value.replace(this.regexp, function() {
      didMatch = true;
      return _this._replace(Array.prototype.slice.call(arguments, 0, -2));
    });
    if (!didMatch && this._children.some((child) => child instanceof FormatString && Boolean(child.elseValue))) {
      ret = this._replace([]);
    }
    return ret;
  }
  _replace(groups) {
    let ret = "";
    for (const marker of this._children) {
      if (marker instanceof FormatString) {
        let value = groups[marker.index] || "";
        value = marker.resolve(value);
        ret += value;
      } else {
        ret += marker.toString();
      }
    }
    return ret;
  }
  toString() {
    return "";
  }
  toTextmateString() {
    return `/${this.regexp.source}/${this.children.map((c) => c.toTextmateString()).join("")}/${(this.regexp.ignoreCase ? "i" : "") + (this.regexp.global ? "g" : "")}`;
  }
  clone() {
    const ret = new Transform();
    ret.regexp = new RegExp(this.regexp.source, (this.regexp.ignoreCase ? "i" : "") + (this.regexp.global ? "g" : ""));
    ret._children = this.children.map((child) => child.clone());
    return ret;
  }
}
class FormatString extends Marker {
  constructor(index, shorthandName, ifValue, elseValue) {
    super();
    this.index = index;
    this.shorthandName = shorthandName;
    this.ifValue = ifValue;
    this.elseValue = elseValue;
  }
  resolve(value) {
    if (this.shorthandName === "upcase") {
      return !value ? "" : value.toLocaleUpperCase();
    } else if (this.shorthandName === "downcase") {
      return !value ? "" : value.toLocaleLowerCase();
    } else if (this.shorthandName === "capitalize") {
      return !value ? "" : value[0].toLocaleUpperCase() + value.substr(1);
    } else if (this.shorthandName === "pascalcase") {
      return !value ? "" : this._toPascalCase(value);
    } else if (this.shorthandName === "camelcase") {
      return !value ? "" : this._toCamelCase(value);
    } else if (this.shorthandName === "kebabcase") {
      return !value ? "" : this._toKebabCase(value);
    } else if (this.shorthandName === "snakecase") {
      return !value ? "" : this._toSnakeCase(value);
    } else if (Boolean(value) && typeof this.ifValue === "string") {
      return this.ifValue;
    } else if (!Boolean(value) && typeof this.elseValue === "string") {
      return this.elseValue;
    } else {
      return value || "";
    }
  }
  // Note: word-based case transforms rely on uppercase/lowercase distinctions.
  // For scripts without case, transforms are effectively no-ops.
  _toKebabCase(value) {
    const match = value.match(/[\p{L}0-9]+/gu);
    if (!match) {
      return value;
    }
    if (!value.match(/[\p{L}0-9]/u)) {
      return value.trim().toLowerCase().replace(/^_+|_+$/g, "").replace(/[\s_]+/g, "-");
    }
    const cleaned = value.trim().replace(/^_+|_+$/g, "");
    const match2 = cleaned.match(/\p{Lu}{2,}(?=\p{Lu}\p{Ll}+[0-9]*|[\s_-]|$)|\p{Lu}?\p{Ll}+[0-9]*|\p{Lu}(?=\p{Lu}\p{Ll})|\p{Lu}(?=[\s_-]|$)|[0-9]+/gu);
    if (!match2) {
      return cleaned.split(/[\s_-]+/).filter((word) => word.length > 0).map((word) => word.toLowerCase()).join("-");
    }
    return match2.map((x) => x.toLowerCase()).join("-");
  }
  _toPascalCase(value) {
    const match = value.match(/[\p{L}0-9]+/gu);
    if (!match) {
      return value;
    }
    return match.map((word) => {
      return word.charAt(0).toUpperCase() + word.substr(1);
    }).join("");
  }
  _toCamelCase(value) {
    const match = value.match(/[\p{L}0-9]+/gu);
    if (!match) {
      return value;
    }
    return match.map((word, index) => {
      if (index === 0) {
        return word.charAt(0).toLowerCase() + word.substr(1);
      }
      return word.charAt(0).toUpperCase() + word.substr(1);
    }).join("");
  }
  _toSnakeCase(value) {
    return value.replace(/(\p{Ll})(\p{Lu})/gu, "$1_$2").replace(/[\s\-]+/g, "_").toLowerCase();
  }
  toTextmateString() {
    let value = "${";
    value += this.index;
    if (this.shorthandName) {
      value += `:/${this.shorthandName}`;
    } else if (this.ifValue && this.elseValue) {
      value += `:?${this.ifValue}:${this.elseValue}`;
    } else if (this.ifValue) {
      value += `:+${this.ifValue}`;
    } else if (this.elseValue) {
      value += `:-${this.elseValue}`;
    }
    value += "}";
    return value;
  }
  clone() {
    const ret = new FormatString(this.index, this.shorthandName, this.ifValue, this.elseValue);
    return ret;
  }
}
class Variable extends TransformableMarker {
  constructor(name) {
    super();
    this.name = name;
  }
  resolve(resolver) {
    let value = resolver.resolve(this);
    if (this.transform) {
      value = this.transform.resolve(value || "");
    }
    if (value !== void 0) {
      this._children = [new Text(value)];
      return true;
    }
    return false;
  }
  toTextmateString() {
    let transformString = "";
    if (this.transform) {
      transformString = this.transform.toTextmateString();
    }
    if (this.children.length === 0) {
      return `\${${this.name}${transformString}}`;
    } else {
      return `\${${this.name}:${this.children.map((child) => child.toTextmateString()).join("")}${transformString}}`;
    }
  }
  clone() {
    const ret = new Variable(this.name);
    if (this.transform) {
      ret.transform = this.transform.clone();
    }
    ret._children = this.children.map((child) => child.clone());
    return ret;
  }
}
function walk(marker, visitor) {
  const stack = [...marker];
  while (stack.length > 0) {
    const marker2 = stack.shift();
    const recurse = visitor(marker2);
    if (!recurse) {
      break;
    }
    stack.unshift(...marker2.children);
  }
}
class TextmateSnippet extends Marker {
  get placeholderInfo() {
    if (!this._placeholders) {
      const all = [];
      let last;
      this.walk(function(candidate) {
        if (candidate instanceof Placeholder) {
          all.push(candidate);
          last = !last || last.index < candidate.index ? candidate : last;
        }
        return true;
      });
      this._placeholders = { all, last };
    }
    return this._placeholders;
  }
  get placeholders() {
    const { all } = this.placeholderInfo;
    return all;
  }
  offset(marker) {
    let pos = 0;
    let found = false;
    this.walk((candidate) => {
      if (candidate === marker) {
        found = true;
        return false;
      }
      pos += candidate.len();
      return true;
    });
    if (!found) {
      return -1;
    }
    return pos;
  }
  fullLen(marker) {
    let ret = 0;
    walk([marker], (marker2) => {
      ret += marker2.len();
      return true;
    });
    return ret;
  }
  enclosingPlaceholders(placeholder) {
    const ret = [];
    let { parent } = placeholder;
    while (parent) {
      if (parent instanceof Placeholder) {
        ret.push(parent);
      }
      parent = parent.parent;
    }
    return ret;
  }
  resolveVariables(resolver) {
    this.walk((candidate) => {
      if (candidate instanceof Variable) {
        if (candidate.resolve(resolver)) {
          this._placeholders = void 0;
        }
      }
      return true;
    });
    return this;
  }
  appendChild(child) {
    this._placeholders = void 0;
    return super.appendChild(child);
  }
  replace(child, others) {
    this._placeholders = void 0;
    return super.replace(child, others);
  }
  toTextmateString() {
    return this.children.reduce((prev, cur) => prev + cur.toTextmateString(), "");
  }
  clone() {
    const ret = new TextmateSnippet();
    ret._children = this.children.map((child) => child.clone());
    return ret;
  }
  walk(visitor) {
    walk(this.children, visitor);
  }
}
class SnippetParser {
  constructor() {
    this._scanner = new Scanner();
    this._token = { type: 14 /* EOF */, pos: 0, len: 0 };
  }
  static escape(value) {
    return value.replace(/\$|}|\\/g, "\\$&");
  }
  /**
   * Takes a snippet and returns the insertable string, e.g return the snippet-string
   * without any placeholder, tabstop, variables etc...
   */
  static asInsertText(value) {
    return new SnippetParser().parse(value).toString();
  }
  static guessNeedsClipboard(template) {
    return /\${?CLIPBOARD/.test(template);
  }
  parse(value, insertFinalTabstop, enforceFinalTabstop) {
    const snippet = new TextmateSnippet();
    this.parseFragment(value, snippet);
    this.ensureFinalTabstop(snippet, enforceFinalTabstop ?? false, insertFinalTabstop ?? false);
    return snippet;
  }
  parseFragment(value, snippet) {
    const offset = snippet.children.length;
    this._scanner.text(value);
    this._token = this._scanner.next();
    while (this._parse(snippet)) {
    }
    const placeholderDefaultValues = /* @__PURE__ */ new Map();
    const incompletePlaceholders = [];
    snippet.walk((marker) => {
      if (marker instanceof Placeholder) {
        if (marker.isFinalTabstop) {
          placeholderDefaultValues.set(0, void 0);
        } else if (!placeholderDefaultValues.has(marker.index) && marker.children.length > 0) {
          placeholderDefaultValues.set(marker.index, marker.children);
        } else {
          incompletePlaceholders.push(marker);
        }
      }
      return true;
    });
    const fillInIncompletePlaceholder = (placeholder, stack2) => {
      const defaultValues = placeholderDefaultValues.get(placeholder.index);
      if (!defaultValues) {
        return;
      }
      const clone = new Placeholder(placeholder.index);
      clone.transform = placeholder.transform;
      for (const child of defaultValues) {
        const newChild = child.clone();
        clone.appendChild(newChild);
        if (newChild instanceof Placeholder && placeholderDefaultValues.has(newChild.index) && !stack2.has(newChild.index)) {
          stack2.add(newChild.index);
          fillInIncompletePlaceholder(newChild, stack2);
          stack2.delete(newChild.index);
        }
      }
      snippet.replace(placeholder, [clone]);
    };
    const stack = /* @__PURE__ */ new Set();
    for (const placeholder of incompletePlaceholders) {
      fillInIncompletePlaceholder(placeholder, stack);
    }
    return snippet.children.slice(offset);
  }
  ensureFinalTabstop(snippet, enforceFinalTabstop, insertFinalTabstop) {
    if (enforceFinalTabstop || insertFinalTabstop && snippet.placeholders.length > 0) {
      const finalTabstop = snippet.placeholders.find((p) => p.index === 0);
      if (!finalTabstop) {
        snippet.appendChild(new Placeholder(0));
      }
    }
  }
  _accept(type, value) {
    if (type === void 0 || this._token.type === type) {
      const ret = !value ? true : this._scanner.tokenText(this._token);
      this._token = this._scanner.next();
      return ret;
    }
    return false;
  }
  _backTo(token) {
    this._scanner.pos = token.pos + token.len;
    this._token = token;
    return false;
  }
  _until(type) {
    const start = this._token;
    while (this._token.type !== type) {
      if (this._token.type === 14 /* EOF */) {
        return false;
      } else if (this._token.type === 5 /* Backslash */) {
        const nextToken = this._scanner.next();
        if (nextToken.type !== 0 /* Dollar */ && nextToken.type !== 4 /* CurlyClose */ && nextToken.type !== 5 /* Backslash */) {
          return false;
        }
      }
      this._token = this._scanner.next();
    }
    const value = this._scanner.value.substring(start.pos, this._token.pos).replace(/\\(\$|}|\\)/g, "$1");
    this._token = this._scanner.next();
    return value;
  }
  _parse(marker) {
    return this._parseEscaped(marker) || this._parseTabstopOrVariableName(marker) || this._parseComplexPlaceholder(marker) || this._parseComplexVariable(marker) || this._parseAnything(marker);
  }
  // \$, \\, \} -> just text
  _parseEscaped(marker) {
    let value;
    if (value = this._accept(5 /* Backslash */, true)) {
      value = this._accept(0 /* Dollar */, true) || this._accept(4 /* CurlyClose */, true) || this._accept(5 /* Backslash */, true) || value;
      marker.appendChild(new Text(value));
      return true;
    }
    return false;
  }
  // $foo -> variable, $1 -> tabstop
  _parseTabstopOrVariableName(parent) {
    let value;
    const token = this._token;
    const match = this._accept(0 /* Dollar */) && (value = this._accept(9 /* VariableName */, true) || this._accept(8 /* Int */, true));
    if (!match) {
      return this._backTo(token);
    }
    parent.appendChild(
      /^\d+$/.test(value) ? new Placeholder(Number(value)) : new Variable(value)
    );
    return true;
  }
  // ${1:<children>}, ${1} -> placeholder
  _parseComplexPlaceholder(parent) {
    let index;
    const token = this._token;
    const match = this._accept(0 /* Dollar */) && this._accept(3 /* CurlyOpen */) && (index = this._accept(8 /* Int */, true));
    if (!match) {
      return this._backTo(token);
    }
    const placeholder = new Placeholder(Number(index));
    if (this._accept(1 /* Colon */)) {
      while (true) {
        if (this._accept(4 /* CurlyClose */)) {
          parent.appendChild(placeholder);
          return true;
        }
        if (this._parse(placeholder)) {
          continue;
        }
        parent.appendChild(new Text("${" + index + ":"));
        placeholder.children.forEach(parent.appendChild, parent);
        return true;
      }
    } else if (placeholder.index > 0 && this._accept(7 /* Pipe */)) {
      const choice = new Choice();
      while (true) {
        if (this._parseChoiceElement(choice)) {
          if (this._accept(2 /* Comma */)) {
            continue;
          }
          if (this._accept(7 /* Pipe */)) {
            placeholder.appendChild(choice);
            if (this._accept(4 /* CurlyClose */)) {
              parent.appendChild(placeholder);
              return true;
            }
          }
        }
        this._backTo(token);
        return false;
      }
    } else if (this._accept(6 /* Forwardslash */)) {
      if (this._parseTransform(placeholder)) {
        parent.appendChild(placeholder);
        return true;
      }
      this._backTo(token);
      return false;
    } else if (this._accept(4 /* CurlyClose */)) {
      parent.appendChild(placeholder);
      return true;
    } else {
      return this._backTo(token);
    }
  }
  _parseChoiceElement(parent) {
    const token = this._token;
    const values = [];
    while (true) {
      if (this._token.type === 2 /* Comma */ || this._token.type === 7 /* Pipe */) {
        break;
      }
      let value;
      if (value = this._accept(5 /* Backslash */, true)) {
        value = this._accept(2 /* Comma */, true) || this._accept(7 /* Pipe */, true) || this._accept(5 /* Backslash */, true) || value;
      } else {
        value = this._accept(void 0, true);
      }
      if (!value) {
        this._backTo(token);
        return false;
      }
      values.push(value);
    }
    if (values.length === 0) {
      this._backTo(token);
      return false;
    }
    parent.appendChild(new Text(values.join("")));
    return true;
  }
  // ${foo:<children>}, ${foo} -> variable
  _parseComplexVariable(parent) {
    let name;
    const token = this._token;
    const match = this._accept(0 /* Dollar */) && this._accept(3 /* CurlyOpen */) && (name = this._accept(9 /* VariableName */, true));
    if (!match) {
      return this._backTo(token);
    }
    const variable = new Variable(name);
    if (this._accept(1 /* Colon */)) {
      while (true) {
        if (this._accept(4 /* CurlyClose */)) {
          parent.appendChild(variable);
          return true;
        }
        if (this._parse(variable)) {
          continue;
        }
        parent.appendChild(new Text("${" + name + ":"));
        variable.children.forEach(parent.appendChild, parent);
        return true;
      }
    } else if (this._accept(6 /* Forwardslash */)) {
      if (this._parseTransform(variable)) {
        parent.appendChild(variable);
        return true;
      }
      this._backTo(token);
      return false;
    } else if (this._accept(4 /* CurlyClose */)) {
      parent.appendChild(variable);
      return true;
    } else {
      return this._backTo(token);
    }
  }
  _parseTransform(parent) {
    const transform = new Transform();
    let regexValue = "";
    let regexOptions = "";
    while (true) {
      if (this._accept(6 /* Forwardslash */)) {
        break;
      }
      let escaped;
      if (escaped = this._accept(5 /* Backslash */, true)) {
        escaped = this._accept(6 /* Forwardslash */, true) || escaped;
        regexValue += escaped;
        continue;
      }
      if (this._token.type !== 14 /* EOF */) {
        regexValue += this._accept(void 0, true);
        continue;
      }
      return false;
    }
    while (true) {
      if (this._accept(6 /* Forwardslash */)) {
        break;
      }
      let escaped;
      if (escaped = this._accept(5 /* Backslash */, true)) {
        escaped = this._accept(5 /* Backslash */, true) || this._accept(6 /* Forwardslash */, true) || escaped;
        transform.appendChild(new Text(escaped));
        continue;
      }
      if (this._parseFormatString(transform) || this._parseAnything(transform)) {
        continue;
      }
      return false;
    }
    while (true) {
      if (this._accept(4 /* CurlyClose */)) {
        break;
      }
      if (this._token.type !== 14 /* EOF */) {
        regexOptions += this._accept(void 0, true);
        continue;
      }
      return false;
    }
    try {
      transform.regexp = new RegExp(regexValue, regexOptions);
    } catch (e) {
      return false;
    }
    parent.transform = transform;
    return true;
  }
  _parseFormatString(parent) {
    const token = this._token;
    if (!this._accept(0 /* Dollar */)) {
      return false;
    }
    let complex = false;
    if (this._accept(3 /* CurlyOpen */)) {
      complex = true;
    }
    const index = this._accept(8 /* Int */, true);
    if (!index) {
      this._backTo(token);
      return false;
    } else if (!complex) {
      parent.appendChild(new FormatString(Number(index)));
      return true;
    } else if (this._accept(4 /* CurlyClose */)) {
      parent.appendChild(new FormatString(Number(index)));
      return true;
    } else if (!this._accept(1 /* Colon */)) {
      this._backTo(token);
      return false;
    }
    if (this._accept(6 /* Forwardslash */)) {
      const shorthand = this._accept(9 /* VariableName */, true);
      if (!shorthand || !this._accept(4 /* CurlyClose */)) {
        this._backTo(token);
        return false;
      } else {
        parent.appendChild(new FormatString(Number(index), shorthand));
        return true;
      }
    } else if (this._accept(11 /* Plus */)) {
      const ifValue = this._until(4 /* CurlyClose */);
      if (ifValue) {
        parent.appendChild(new FormatString(Number(index), void 0, ifValue, void 0));
        return true;
      }
    } else if (this._accept(12 /* Dash */)) {
      const elseValue = this._until(4 /* CurlyClose */);
      if (elseValue) {
        parent.appendChild(new FormatString(Number(index), void 0, void 0, elseValue));
        return true;
      }
    } else if (this._accept(13 /* QuestionMark */)) {
      const ifValue = this._until(1 /* Colon */);
      if (ifValue) {
        const elseValue = this._until(4 /* CurlyClose */);
        if (elseValue) {
          parent.appendChild(new FormatString(Number(index), void 0, ifValue, elseValue));
          return true;
        }
      }
    } else {
      const elseValue = this._until(4 /* CurlyClose */);
      if (elseValue) {
        parent.appendChild(new FormatString(Number(index), void 0, void 0, elseValue));
        return true;
      }
    }
    this._backTo(token);
    return false;
  }
  _parseAnything(marker) {
    if (this._token.type !== 14 /* EOF */) {
      marker.appendChild(new Text(this._scanner.tokenText(this._token)));
      this._accept(void 0);
      return true;
    }
    return false;
  }
}
export {
  Choice,
  FormatString,
  Marker,
  Placeholder,
  Scanner,
  SnippetParser,
  Text,
  TextmateSnippet,
  TokenType,
  Transform,
  TransformableMarker,
  Variable
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL3NuaXBwZXQvYnJvd3Nlci9zbmlwcGV0UGFyc2VyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2hhckNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jaGFyQ29kZS5qcyc7XG5cbmV4cG9ydCBjb25zdCBlbnVtIFRva2VuVHlwZSB7XG5cdERvbGxhcixcblx0Q29sb24sXG5cdENvbW1hLFxuXHRDdXJseU9wZW4sXG5cdEN1cmx5Q2xvc2UsXG5cdEJhY2tzbGFzaCxcblx0Rm9yd2FyZHNsYXNoLFxuXHRQaXBlLFxuXHRJbnQsXG5cdFZhcmlhYmxlTmFtZSxcblx0Rm9ybWF0LFxuXHRQbHVzLFxuXHREYXNoLFxuXHRRdWVzdGlvbk1hcmssXG5cdEVPRlxufVxuXG5leHBvcnQgaW50ZXJmYWNlIFRva2VuIHtcblx0dHlwZTogVG9rZW5UeXBlO1xuXHRwb3M6IG51bWJlcjtcblx0bGVuOiBudW1iZXI7XG59XG5cblxuZXhwb3J0IGNsYXNzIFNjYW5uZXIge1xuXG5cdHByaXZhdGUgc3RhdGljIF90YWJsZTogeyBbY2g6IG51bWJlcl06IFRva2VuVHlwZSB9ID0ge1xuXHRcdFtDaGFyQ29kZS5Eb2xsYXJTaWduXTogVG9rZW5UeXBlLkRvbGxhcixcblx0XHRbQ2hhckNvZGUuQ29sb25dOiBUb2tlblR5cGUuQ29sb24sXG5cdFx0W0NoYXJDb2RlLkNvbW1hXTogVG9rZW5UeXBlLkNvbW1hLFxuXHRcdFtDaGFyQ29kZS5PcGVuQ3VybHlCcmFjZV06IFRva2VuVHlwZS5DdXJseU9wZW4sXG5cdFx0W0NoYXJDb2RlLkNsb3NlQ3VybHlCcmFjZV06IFRva2VuVHlwZS5DdXJseUNsb3NlLFxuXHRcdFtDaGFyQ29kZS5CYWNrc2xhc2hdOiBUb2tlblR5cGUuQmFja3NsYXNoLFxuXHRcdFtDaGFyQ29kZS5TbGFzaF06IFRva2VuVHlwZS5Gb3J3YXJkc2xhc2gsXG5cdFx0W0NoYXJDb2RlLlBpcGVdOiBUb2tlblR5cGUuUGlwZSxcblx0XHRbQ2hhckNvZGUuUGx1c106IFRva2VuVHlwZS5QbHVzLFxuXHRcdFtDaGFyQ29kZS5EYXNoXTogVG9rZW5UeXBlLkRhc2gsXG5cdFx0W0NoYXJDb2RlLlF1ZXN0aW9uTWFya106IFRva2VuVHlwZS5RdWVzdGlvbk1hcmssXG5cdH07XG5cblx0c3RhdGljIGlzRGlnaXRDaGFyYWN0ZXIoY2g6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBjaCA+PSBDaGFyQ29kZS5EaWdpdDAgJiYgY2ggPD0gQ2hhckNvZGUuRGlnaXQ5O1xuXHR9XG5cblx0c3RhdGljIGlzVmFyaWFibGVDaGFyYWN0ZXIoY2g6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBjaCA9PT0gQ2hhckNvZGUuVW5kZXJsaW5lXG5cdFx0XHR8fCAoY2ggPj0gQ2hhckNvZGUuYSAmJiBjaCA8PSBDaGFyQ29kZS56KVxuXHRcdFx0fHwgKGNoID49IENoYXJDb2RlLkEgJiYgY2ggPD0gQ2hhckNvZGUuWik7XG5cdH1cblxuXHR2YWx1ZTogc3RyaW5nID0gJyc7XG5cdHBvczogbnVtYmVyID0gMDtcblxuXHR0ZXh0KHZhbHVlOiBzdHJpbmcpIHtcblx0XHR0aGlzLnZhbHVlID0gdmFsdWU7XG5cdFx0dGhpcy5wb3MgPSAwO1xuXHR9XG5cblx0dG9rZW5UZXh0KHRva2VuOiBUb2tlbik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMudmFsdWUuc3Vic3RyKHRva2VuLnBvcywgdG9rZW4ubGVuKTtcblx0fVxuXG5cdG5leHQoKTogVG9rZW4ge1xuXG5cdFx0aWYgKHRoaXMucG9zID49IHRoaXMudmFsdWUubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4geyB0eXBlOiBUb2tlblR5cGUuRU9GLCBwb3M6IHRoaXMucG9zLCBsZW46IDAgfTtcblx0XHR9XG5cblx0XHRjb25zdCBwb3MgPSB0aGlzLnBvcztcblx0XHRsZXQgbGVuID0gMDtcblx0XHRsZXQgY2ggPSB0aGlzLnZhbHVlLmNoYXJDb2RlQXQocG9zKTtcblx0XHRsZXQgdHlwZTogVG9rZW5UeXBlO1xuXG5cdFx0Ly8gc3RhdGljIHR5cGVzXG5cdFx0dHlwZSA9IFNjYW5uZXIuX3RhYmxlW2NoXTtcblx0XHRpZiAodHlwZW9mIHR5cGUgPT09ICdudW1iZXInKSB7XG5cdFx0XHR0aGlzLnBvcyArPSAxO1xuXHRcdFx0cmV0dXJuIHsgdHlwZSwgcG9zLCBsZW46IDEgfTtcblx0XHR9XG5cblx0XHQvLyBudW1iZXJcblx0XHRpZiAoU2Nhbm5lci5pc0RpZ2l0Q2hhcmFjdGVyKGNoKSkge1xuXHRcdFx0dHlwZSA9IFRva2VuVHlwZS5JbnQ7XG5cdFx0XHRkbyB7XG5cdFx0XHRcdGxlbiArPSAxO1xuXHRcdFx0XHRjaCA9IHRoaXMudmFsdWUuY2hhckNvZGVBdChwb3MgKyBsZW4pO1xuXHRcdFx0fSB3aGlsZSAoU2Nhbm5lci5pc0RpZ2l0Q2hhcmFjdGVyKGNoKSk7XG5cblx0XHRcdHRoaXMucG9zICs9IGxlbjtcblx0XHRcdHJldHVybiB7IHR5cGUsIHBvcywgbGVuIH07XG5cdFx0fVxuXG5cdFx0Ly8gdmFyaWFibGUgbmFtZVxuXHRcdGlmIChTY2FubmVyLmlzVmFyaWFibGVDaGFyYWN0ZXIoY2gpKSB7XG5cdFx0XHR0eXBlID0gVG9rZW5UeXBlLlZhcmlhYmxlTmFtZTtcblx0XHRcdGRvIHtcblx0XHRcdFx0Y2ggPSB0aGlzLnZhbHVlLmNoYXJDb2RlQXQocG9zICsgKCsrbGVuKSk7XG5cdFx0XHR9IHdoaWxlIChTY2FubmVyLmlzVmFyaWFibGVDaGFyYWN0ZXIoY2gpIHx8IFNjYW5uZXIuaXNEaWdpdENoYXJhY3RlcihjaCkpO1xuXG5cdFx0XHR0aGlzLnBvcyArPSBsZW47XG5cdFx0XHRyZXR1cm4geyB0eXBlLCBwb3MsIGxlbiB9O1xuXHRcdH1cblxuXG5cdFx0Ly8gZm9ybWF0XG5cdFx0dHlwZSA9IFRva2VuVHlwZS5Gb3JtYXQ7XG5cdFx0ZG8ge1xuXHRcdFx0bGVuICs9IDE7XG5cdFx0XHRjaCA9IHRoaXMudmFsdWUuY2hhckNvZGVBdChwb3MgKyBsZW4pO1xuXHRcdH0gd2hpbGUgKFxuXHRcdFx0IWlzTmFOKGNoKVxuXHRcdFx0JiYgdHlwZW9mIFNjYW5uZXIuX3RhYmxlW2NoXSA9PT0gJ3VuZGVmaW5lZCcgLy8gbm90IHN0YXRpYyB0b2tlblxuXHRcdFx0JiYgIVNjYW5uZXIuaXNEaWdpdENoYXJhY3RlcihjaCkgLy8gbm90IG51bWJlclxuXHRcdFx0JiYgIVNjYW5uZXIuaXNWYXJpYWJsZUNoYXJhY3RlcihjaCkgLy8gbm90IHZhcmlhYmxlXG5cdFx0KTtcblxuXHRcdHRoaXMucG9zICs9IGxlbjtcblx0XHRyZXR1cm4geyB0eXBlLCBwb3MsIGxlbiB9O1xuXHR9XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBNYXJrZXIge1xuXG5cdHJlYWRvbmx5IF9tYXJrZXJCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHB1YmxpYyBwYXJlbnQhOiBNYXJrZXI7XG5cdHByb3RlY3RlZCBfY2hpbGRyZW46IE1hcmtlcltdID0gW107XG5cblx0YXBwZW5kQ2hpbGQoY2hpbGQ6IE1hcmtlcik6IHRoaXMge1xuXHRcdGlmIChjaGlsZCBpbnN0YW5jZW9mIFRleHQgJiYgdGhpcy5fY2hpbGRyZW5bdGhpcy5fY2hpbGRyZW4ubGVuZ3RoIC0gMV0gaW5zdGFuY2VvZiBUZXh0KSB7XG5cdFx0XHQvLyB0aGlzIGFuZCBwcmV2aW91cyBjaGlsZCBhcmUgdGV4dCAtPiBtZXJnZSB0aGVtXG5cdFx0XHQoPFRleHQ+dGhpcy5fY2hpbGRyZW5bdGhpcy5fY2hpbGRyZW4ubGVuZ3RoIC0gMV0pLnZhbHVlICs9IGNoaWxkLnZhbHVlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBub3JtYWwgYWRvcHRpb24gb2YgY2hpbGRcblx0XHRcdGNoaWxkLnBhcmVudCA9IHRoaXM7XG5cdFx0XHR0aGlzLl9jaGlsZHJlbi5wdXNoKGNoaWxkKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRyZXBsYWNlKGNoaWxkOiBNYXJrZXIsIG90aGVyczogTWFya2VyW10pOiB2b2lkIHtcblx0XHRjb25zdCB7IHBhcmVudCB9ID0gY2hpbGQ7XG5cdFx0Y29uc3QgaWR4ID0gcGFyZW50LmNoaWxkcmVuLmluZGV4T2YoY2hpbGQpO1xuXHRcdGNvbnN0IG5ld0NoaWxkcmVuID0gcGFyZW50LmNoaWxkcmVuLnNsaWNlKDApO1xuXHRcdG5ld0NoaWxkcmVuLnNwbGljZShpZHgsIDEsIC4uLm90aGVycyk7XG5cdFx0cGFyZW50Ll9jaGlsZHJlbiA9IG5ld0NoaWxkcmVuO1xuXG5cdFx0KGZ1bmN0aW9uIF9maXhQYXJlbnQoY2hpbGRyZW46IE1hcmtlcltdLCBwYXJlbnQ6IE1hcmtlcikge1xuXHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBjaGlsZHJlbikge1xuXHRcdFx0XHRjaGlsZC5wYXJlbnQgPSBwYXJlbnQ7XG5cdFx0XHRcdF9maXhQYXJlbnQoY2hpbGQuY2hpbGRyZW4sIGNoaWxkKTtcblx0XHRcdH1cblx0XHR9KShvdGhlcnMsIHBhcmVudCk7XG5cdH1cblxuXHRnZXQgY2hpbGRyZW4oKTogTWFya2VyW10ge1xuXHRcdHJldHVybiB0aGlzLl9jaGlsZHJlbjtcblx0fVxuXG5cdGdldCByaWdodE1vc3REZXNjZW5kYW50KCk6IE1hcmtlciB7XG5cdFx0aWYgKHRoaXMuX2NoaWxkcmVuLmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybiB0aGlzLl9jaGlsZHJlblt0aGlzLl9jaGlsZHJlbi5sZW5ndGggLSAxXS5yaWdodE1vc3REZXNjZW5kYW50O1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdGdldCBzbmlwcGV0KCk6IFRleHRtYXRlU25pcHBldCB8IHVuZGVmaW5lZCB7XG5cdFx0bGV0IGNhbmRpZGF0ZTogTWFya2VyID0gdGhpcztcblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0aWYgKCFjYW5kaWRhdGUpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGlmIChjYW5kaWRhdGUgaW5zdGFuY2VvZiBUZXh0bWF0ZVNuaXBwZXQpIHtcblx0XHRcdFx0cmV0dXJuIGNhbmRpZGF0ZTtcblx0XHRcdH1cblx0XHRcdGNhbmRpZGF0ZSA9IGNhbmRpZGF0ZS5wYXJlbnQ7XG5cdFx0fVxuXHR9XG5cblx0dG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5jaGlsZHJlbi5yZWR1Y2UoKHByZXYsIGN1cikgPT4gcHJldiArIGN1ci50b1N0cmluZygpLCAnJyk7XG5cdH1cblxuXHRhYnN0cmFjdCB0b1RleHRtYXRlU3RyaW5nKCk6IHN0cmluZztcblxuXHRsZW4oKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gMDtcblx0fVxuXG5cdGFic3RyYWN0IGNsb25lKCk6IE1hcmtlcjtcbn1cblxuZXhwb3J0IGNsYXNzIFRleHQgZXh0ZW5kcyBNYXJrZXIge1xuXG5cdHN0YXRpYyBlc2NhcGUodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHZhbHVlLnJlcGxhY2UoL1xcJHx9fFxcXFwvZywgJ1xcXFwkJicpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IocHVibGljIHZhbHVlOiBzdHJpbmcpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cdG92ZXJyaWRlIHRvU3RyaW5nKCkge1xuXHRcdHJldHVybiB0aGlzLnZhbHVlO1xuXHR9XG5cdHRvVGV4dG1hdGVTdHJpbmcoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gVGV4dC5lc2NhcGUodGhpcy52YWx1ZSk7XG5cdH1cblx0b3ZlcnJpZGUgbGVuKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMudmFsdWUubGVuZ3RoO1xuXHR9XG5cdGNsb25lKCk6IFRleHQge1xuXHRcdHJldHVybiBuZXcgVGV4dCh0aGlzLnZhbHVlKTtcblx0fVxufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgVHJhbnNmb3JtYWJsZU1hcmtlciBleHRlbmRzIE1hcmtlciB7XG5cdHB1YmxpYyB0cmFuc2Zvcm0/OiBUcmFuc2Zvcm07XG59XG5cbmV4cG9ydCBjbGFzcyBQbGFjZWhvbGRlciBleHRlbmRzIFRyYW5zZm9ybWFibGVNYXJrZXIge1xuXHRzdGF0aWMgY29tcGFyZUJ5SW5kZXgoYTogUGxhY2Vob2xkZXIsIGI6IFBsYWNlaG9sZGVyKTogbnVtYmVyIHtcblx0XHRpZiAoYS5pbmRleCA9PT0gYi5pbmRleCkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fSBlbHNlIGlmIChhLmlzRmluYWxUYWJzdG9wKSB7XG5cdFx0XHRyZXR1cm4gMTtcblx0XHR9IGVsc2UgaWYgKGIuaXNGaW5hbFRhYnN0b3ApIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9IGVsc2UgaWYgKGEuaW5kZXggPCBiLmluZGV4KSB7XG5cdFx0XHRyZXR1cm4gLTE7XG5cdFx0fSBlbHNlIGlmIChhLmluZGV4ID4gYi5pbmRleCkge1xuXHRcdFx0cmV0dXJuIDE7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0cnVjdG9yKHB1YmxpYyBpbmRleDogbnVtYmVyKSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdGdldCBpc0ZpbmFsVGFic3RvcCgpIHtcblx0XHRyZXR1cm4gdGhpcy5pbmRleCA9PT0gMDtcblx0fVxuXG5cdGdldCBjaG9pY2UoKTogQ2hvaWNlIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fY2hpbGRyZW4ubGVuZ3RoID09PSAxICYmIHRoaXMuX2NoaWxkcmVuWzBdIGluc3RhbmNlb2YgQ2hvaWNlXG5cdFx0XHQ/IHRoaXMuX2NoaWxkcmVuWzBdXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHRvVGV4dG1hdGVTdHJpbmcoKTogc3RyaW5nIHtcblx0XHRsZXQgdHJhbnNmb3JtU3RyaW5nID0gJyc7XG5cdFx0aWYgKHRoaXMudHJhbnNmb3JtKSB7XG5cdFx0XHR0cmFuc2Zvcm1TdHJpbmcgPSB0aGlzLnRyYW5zZm9ybS50b1RleHRtYXRlU3RyaW5nKCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmNoaWxkcmVuLmxlbmd0aCA9PT0gMCAmJiAhdGhpcy50cmFuc2Zvcm0pIHtcblx0XHRcdHJldHVybiBgXFwkJHt0aGlzLmluZGV4fWA7XG5cdFx0fSBlbHNlIGlmICh0aGlzLmNoaWxkcmVuLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGBcXCR7JHt0aGlzLmluZGV4fSR7dHJhbnNmb3JtU3RyaW5nfX1gO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5jaG9pY2UpIHtcblx0XHRcdHJldHVybiBgXFwkeyR7dGhpcy5pbmRleH18JHt0aGlzLmNob2ljZS50b1RleHRtYXRlU3RyaW5nKCl9fCR7dHJhbnNmb3JtU3RyaW5nfX1gO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gYFxcJHske3RoaXMuaW5kZXh9OiR7dGhpcy5jaGlsZHJlbi5tYXAoY2hpbGQgPT4gY2hpbGQudG9UZXh0bWF0ZVN0cmluZygpKS5qb2luKCcnKX0ke3RyYW5zZm9ybVN0cmluZ319YDtcblx0XHR9XG5cdH1cblxuXHRjbG9uZSgpOiBQbGFjZWhvbGRlciB7XG5cdFx0Y29uc3QgcmV0ID0gbmV3IFBsYWNlaG9sZGVyKHRoaXMuaW5kZXgpO1xuXHRcdGlmICh0aGlzLnRyYW5zZm9ybSkge1xuXHRcdFx0cmV0LnRyYW5zZm9ybSA9IHRoaXMudHJhbnNmb3JtLmNsb25lKCk7XG5cdFx0fVxuXHRcdHJldC5fY2hpbGRyZW4gPSB0aGlzLmNoaWxkcmVuLm1hcChjaGlsZCA9PiBjaGlsZC5jbG9uZSgpKTtcblx0XHRyZXR1cm4gcmV0O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaG9pY2UgZXh0ZW5kcyBNYXJrZXIge1xuXG5cdHJlYWRvbmx5IG9wdGlvbnM6IFRleHRbXSA9IFtdO1xuXG5cdG92ZXJyaWRlIGFwcGVuZENoaWxkKG1hcmtlcjogTWFya2VyKTogdGhpcyB7XG5cdFx0aWYgKG1hcmtlciBpbnN0YW5jZW9mIFRleHQpIHtcblx0XHRcdG1hcmtlci5wYXJlbnQgPSB0aGlzO1xuXHRcdFx0dGhpcy5vcHRpb25zLnB1c2gobWFya2VyKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRvdmVycmlkZSB0b1N0cmluZygpIHtcblx0XHRyZXR1cm4gdGhpcy5vcHRpb25zWzBdLnZhbHVlO1xuXHR9XG5cblx0dG9UZXh0bWF0ZVN0cmluZygpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLm9wdGlvbnNcblx0XHRcdC5tYXAob3B0aW9uID0+IG9wdGlvbi52YWx1ZS5yZXBsYWNlKC9cXHx8LHxcXFxcL2csICdcXFxcJCYnKSlcblx0XHRcdC5qb2luKCcsJyk7XG5cdH1cblxuXHRvdmVycmlkZSBsZW4oKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5vcHRpb25zWzBdLmxlbigpO1xuXHR9XG5cblx0Y2xvbmUoKTogQ2hvaWNlIHtcblx0XHRjb25zdCByZXQgPSBuZXcgQ2hvaWNlKCk7XG5cdFx0dGhpcy5vcHRpb25zLmZvckVhY2gocmV0LmFwcGVuZENoaWxkLCByZXQpO1xuXHRcdHJldHVybiByZXQ7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRyYW5zZm9ybSBleHRlbmRzIE1hcmtlciB7XG5cblx0cmVnZXhwOiBSZWdFeHAgPSBuZXcgUmVnRXhwKCcnKTtcblxuXHRyZXNvbHZlKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGNvbnN0IF90aGlzID0gdGhpcztcblx0XHRsZXQgZGlkTWF0Y2ggPSBmYWxzZTtcblx0XHRsZXQgcmV0ID0gdmFsdWUucmVwbGFjZSh0aGlzLnJlZ2V4cCwgZnVuY3Rpb24gKCkge1xuXHRcdFx0ZGlkTWF0Y2ggPSB0cnVlO1xuXHRcdFx0cmV0dXJuIF90aGlzLl9yZXBsYWNlKEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMCwgLTIpKTtcblx0XHR9KTtcblx0XHQvLyB3aGVuIHRoZSByZWdleCBkaWRuJ3QgbWF0Y2ggYW5kIHdoZW4gdGhlIHRyYW5zZm9ybSBoYXNcblx0XHQvLyBlbHNlIGJyYW5jaGVzLCB0aGVuIHJ1biB0aG9zZVxuXHRcdGlmICghZGlkTWF0Y2ggJiYgdGhpcy5fY2hpbGRyZW4uc29tZShjaGlsZCA9PiBjaGlsZCBpbnN0YW5jZW9mIEZvcm1hdFN0cmluZyAmJiBCb29sZWFuKGNoaWxkLmVsc2VWYWx1ZSkpKSB7XG5cdFx0XHRyZXQgPSB0aGlzLl9yZXBsYWNlKFtdKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJldDtcblx0fVxuXG5cdHByaXZhdGUgX3JlcGxhY2UoZ3JvdXBzOiBzdHJpbmdbXSk6IHN0cmluZyB7XG5cdFx0bGV0IHJldCA9ICcnO1xuXHRcdGZvciAoY29uc3QgbWFya2VyIG9mIHRoaXMuX2NoaWxkcmVuKSB7XG5cdFx0XHRpZiAobWFya2VyIGluc3RhbmNlb2YgRm9ybWF0U3RyaW5nKSB7XG5cdFx0XHRcdGxldCB2YWx1ZSA9IGdyb3Vwc1ttYXJrZXIuaW5kZXhdIHx8ICcnO1xuXHRcdFx0XHR2YWx1ZSA9IG1hcmtlci5yZXNvbHZlKHZhbHVlKTtcblx0XHRcdFx0cmV0ICs9IHZhbHVlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0ICs9IG1hcmtlci50b1N0cmluZygpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmV0O1xuXHR9XG5cblx0b3ZlcnJpZGUgdG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gJyc7XG5cdH1cblxuXHR0b1RleHRtYXRlU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAvJHt0aGlzLnJlZ2V4cC5zb3VyY2V9LyR7dGhpcy5jaGlsZHJlbi5tYXAoYyA9PiBjLnRvVGV4dG1hdGVTdHJpbmcoKSkuam9pbignJyl9LyR7KHRoaXMucmVnZXhwLmlnbm9yZUNhc2UgPyAnaScgOiAnJykgKyAodGhpcy5yZWdleHAuZ2xvYmFsID8gJ2cnIDogJycpfWA7XG5cdH1cblxuXHRjbG9uZSgpOiBUcmFuc2Zvcm0ge1xuXHRcdGNvbnN0IHJldCA9IG5ldyBUcmFuc2Zvcm0oKTtcblx0XHRyZXQucmVnZXhwID0gbmV3IFJlZ0V4cCh0aGlzLnJlZ2V4cC5zb3VyY2UsICcnICsgKHRoaXMucmVnZXhwLmlnbm9yZUNhc2UgPyAnaScgOiAnJykgKyAodGhpcy5yZWdleHAuZ2xvYmFsID8gJ2cnIDogJycpKTtcblx0XHRyZXQuX2NoaWxkcmVuID0gdGhpcy5jaGlsZHJlbi5tYXAoY2hpbGQgPT4gY2hpbGQuY2xvbmUoKSk7XG5cdFx0cmV0dXJuIHJldDtcblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBGb3JtYXRTdHJpbmcgZXh0ZW5kcyBNYXJrZXIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGluZGV4OiBudW1iZXIsXG5cdFx0cmVhZG9ubHkgc2hvcnRoYW5kTmFtZT86IHN0cmluZyxcblx0XHRyZWFkb25seSBpZlZhbHVlPzogc3RyaW5nLFxuXHRcdHJlYWRvbmx5IGVsc2VWYWx1ZT86IHN0cmluZyxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHJlc29sdmUodmFsdWU/OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGlmICh0aGlzLnNob3J0aGFuZE5hbWUgPT09ICd1cGNhc2UnKSB7XG5cdFx0XHRyZXR1cm4gIXZhbHVlID8gJycgOiB2YWx1ZS50b0xvY2FsZVVwcGVyQ2FzZSgpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5zaG9ydGhhbmROYW1lID09PSAnZG93bmNhc2UnKSB7XG5cdFx0XHRyZXR1cm4gIXZhbHVlID8gJycgOiB2YWx1ZS50b0xvY2FsZUxvd2VyQ2FzZSgpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5zaG9ydGhhbmROYW1lID09PSAnY2FwaXRhbGl6ZScpIHtcblx0XHRcdHJldHVybiAhdmFsdWUgPyAnJyA6ICh2YWx1ZVswXS50b0xvY2FsZVVwcGVyQ2FzZSgpICsgdmFsdWUuc3Vic3RyKDEpKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuc2hvcnRoYW5kTmFtZSA9PT0gJ3Bhc2NhbGNhc2UnKSB7XG5cdFx0XHRyZXR1cm4gIXZhbHVlID8gJycgOiB0aGlzLl90b1Bhc2NhbENhc2UodmFsdWUpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5zaG9ydGhhbmROYW1lID09PSAnY2FtZWxjYXNlJykge1xuXHRcdFx0cmV0dXJuICF2YWx1ZSA/ICcnIDogdGhpcy5fdG9DYW1lbENhc2UodmFsdWUpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5zaG9ydGhhbmROYW1lID09PSAna2ViYWJjYXNlJykge1xuXHRcdFx0cmV0dXJuICF2YWx1ZSA/ICcnIDogdGhpcy5fdG9LZWJhYkNhc2UodmFsdWUpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5zaG9ydGhhbmROYW1lID09PSAnc25ha2VjYXNlJykge1xuXHRcdFx0cmV0dXJuICF2YWx1ZSA/ICcnIDogdGhpcy5fdG9TbmFrZUNhc2UodmFsdWUpO1xuXHRcdH0gZWxzZSBpZiAoQm9vbGVhbih2YWx1ZSkgJiYgdHlwZW9mIHRoaXMuaWZWYWx1ZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiB0aGlzLmlmVmFsdWU7XG5cdFx0fSBlbHNlIGlmICghQm9vbGVhbih2YWx1ZSkgJiYgdHlwZW9mIHRoaXMuZWxzZVZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuZWxzZVZhbHVlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdmFsdWUgfHwgJyc7XG5cdFx0fVxuXHR9XG5cblx0Ly8gTm90ZTogd29yZC1iYXNlZCBjYXNlIHRyYW5zZm9ybXMgcmVseSBvbiB1cHBlcmNhc2UvbG93ZXJjYXNlIGRpc3RpbmN0aW9ucy5cblx0Ly8gRm9yIHNjcmlwdHMgd2l0aG91dCBjYXNlLCB0cmFuc2Zvcm1zIGFyZSBlZmZlY3RpdmVseSBuby1vcHMuXG5cdHByaXZhdGUgX3RvS2ViYWJDYXNlKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGNvbnN0IG1hdGNoID0gdmFsdWUubWF0Y2goL1tcXHB7TH0wLTldKy9ndSk7XG5cdFx0aWYgKCFtYXRjaCkge1xuXHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdH1cblxuXHRcdGlmICghdmFsdWUubWF0Y2goL1tcXHB7TH0wLTldL3UpKSB7XG5cdFx0XHRyZXR1cm4gdmFsdWVcblx0XHRcdFx0LnRyaW0oKVxuXHRcdFx0XHQudG9Mb3dlckNhc2UoKVxuXHRcdFx0XHQucmVwbGFjZSgvXl8rfF8rJC9nLCAnJylcblx0XHRcdFx0LnJlcGxhY2UoL1tcXHNfXSsvZywgJy0nKTtcblx0XHR9XG5cblx0XHRjb25zdCBjbGVhbmVkID0gdmFsdWUudHJpbSgpLnJlcGxhY2UoL15fK3xfKyQvZywgJycpO1xuXG5cdFx0Y29uc3QgbWF0Y2gyID0gY2xlYW5lZC5tYXRjaCgvXFxwe0x1fXsyLH0oPz1cXHB7THV9XFxwe0xsfStbMC05XSp8W1xcc18tXXwkKXxcXHB7THV9P1xccHtMbH0rWzAtOV0qfFxccHtMdX0oPz1cXHB7THV9XFxwe0xsfSl8XFxwe0x1fSg/PVtcXHNfLV18JCl8WzAtOV0rL2d1KTtcblxuXHRcdGlmICghbWF0Y2gyKSB7XG5cdFx0XHRyZXR1cm4gY2xlYW5lZFxuXHRcdFx0XHQuc3BsaXQoL1tcXHNfLV0rLylcblx0XHRcdFx0LmZpbHRlcih3b3JkID0+IHdvcmQubGVuZ3RoID4gMClcblx0XHRcdFx0Lm1hcCh3b3JkID0+IHdvcmQudG9Mb3dlckNhc2UoKSlcblx0XHRcdFx0LmpvaW4oJy0nKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbWF0Y2gyXG5cdFx0XHQubWFwKHggPT4geC50b0xvd2VyQ2FzZSgpKVxuXHRcdFx0LmpvaW4oJy0nKTtcblx0fVxuXG5cdHByaXZhdGUgX3RvUGFzY2FsQ2FzZSh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRjb25zdCBtYXRjaCA9IHZhbHVlLm1hdGNoKC9bXFxwe0x9MC05XSsvZ3UpO1xuXHRcdGlmICghbWF0Y2gpIHtcblx0XHRcdHJldHVybiB2YWx1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIG1hdGNoLm1hcCh3b3JkID0+IHtcblx0XHRcdHJldHVybiB3b3JkLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgd29yZC5zdWJzdHIoMSk7XG5cdFx0fSlcblx0XHRcdC5qb2luKCcnKTtcblx0fVxuXG5cdHByaXZhdGUgX3RvQ2FtZWxDYXNlKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGNvbnN0IG1hdGNoID0gdmFsdWUubWF0Y2goL1tcXHB7TH0wLTldKy9ndSk7XG5cdFx0aWYgKCFtYXRjaCkge1xuXHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdH1cblx0XHRyZXR1cm4gbWF0Y2gubWFwKCh3b3JkLCBpbmRleCkgPT4ge1xuXHRcdFx0aWYgKGluZGV4ID09PSAwKSB7XG5cdFx0XHRcdHJldHVybiB3b3JkLmNoYXJBdCgwKS50b0xvd2VyQ2FzZSgpICsgd29yZC5zdWJzdHIoMSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gd29yZC5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIHdvcmQuc3Vic3RyKDEpO1xuXHRcdH0pXG5cdFx0XHQuam9pbignJyk7XG5cdH1cblxuXHRwcml2YXRlIF90b1NuYWtlQ2FzZSh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdmFsdWUucmVwbGFjZSgvKFxccHtMbH0pKFxccHtMdX0pL2d1LCAnJDFfJDInKVxuXHRcdFx0LnJlcGxhY2UoL1tcXHNcXC1dKy9nLCAnXycpXG5cdFx0XHQudG9Mb3dlckNhc2UoKTtcblx0fVxuXG5cdHRvVGV4dG1hdGVTdHJpbmcoKTogc3RyaW5nIHtcblx0XHRsZXQgdmFsdWUgPSAnJHsnO1xuXHRcdHZhbHVlICs9IHRoaXMuaW5kZXg7XG5cdFx0aWYgKHRoaXMuc2hvcnRoYW5kTmFtZSkge1xuXHRcdFx0dmFsdWUgKz0gYDovJHt0aGlzLnNob3J0aGFuZE5hbWV9YDtcblxuXHRcdH0gZWxzZSBpZiAodGhpcy5pZlZhbHVlICYmIHRoaXMuZWxzZVZhbHVlKSB7XG5cdFx0XHR2YWx1ZSArPSBgOj8ke3RoaXMuaWZWYWx1ZX06JHt0aGlzLmVsc2VWYWx1ZX1gO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5pZlZhbHVlKSB7XG5cdFx0XHR2YWx1ZSArPSBgOiske3RoaXMuaWZWYWx1ZX1gO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5lbHNlVmFsdWUpIHtcblx0XHRcdHZhbHVlICs9IGA6LSR7dGhpcy5lbHNlVmFsdWV9YDtcblx0XHR9XG5cdFx0dmFsdWUgKz0gJ30nO1xuXHRcdHJldHVybiB2YWx1ZTtcblx0fVxuXG5cdGNsb25lKCk6IEZvcm1hdFN0cmluZyB7XG5cdFx0Y29uc3QgcmV0ID0gbmV3IEZvcm1hdFN0cmluZyh0aGlzLmluZGV4LCB0aGlzLnNob3J0aGFuZE5hbWUsIHRoaXMuaWZWYWx1ZSwgdGhpcy5lbHNlVmFsdWUpO1xuXHRcdHJldHVybiByZXQ7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFZhcmlhYmxlIGV4dGVuZHMgVHJhbnNmb3JtYWJsZU1hcmtlciB7XG5cblx0Y29uc3RydWN0b3IocHVibGljIG5hbWU6IHN0cmluZykge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRyZXNvbHZlKHJlc29sdmVyOiBWYXJpYWJsZVJlc29sdmVyKTogYm9vbGVhbiB7XG5cdFx0bGV0IHZhbHVlID0gcmVzb2x2ZXIucmVzb2x2ZSh0aGlzKTtcblx0XHRpZiAodGhpcy50cmFuc2Zvcm0pIHtcblx0XHRcdHZhbHVlID0gdGhpcy50cmFuc2Zvcm0ucmVzb2x2ZSh2YWx1ZSB8fCAnJyk7XG5cdFx0fVxuXHRcdGlmICh2YWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9jaGlsZHJlbiA9IFtuZXcgVGV4dCh2YWx1ZSldO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHRvVGV4dG1hdGVTdHJpbmcoKTogc3RyaW5nIHtcblx0XHRsZXQgdHJhbnNmb3JtU3RyaW5nID0gJyc7XG5cdFx0aWYgKHRoaXMudHJhbnNmb3JtKSB7XG5cdFx0XHR0cmFuc2Zvcm1TdHJpbmcgPSB0aGlzLnRyYW5zZm9ybS50b1RleHRtYXRlU3RyaW5nKCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmNoaWxkcmVuLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGBcXCR7JHt0aGlzLm5hbWV9JHt0cmFuc2Zvcm1TdHJpbmd9fWA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBgXFwkeyR7dGhpcy5uYW1lfToke3RoaXMuY2hpbGRyZW4ubWFwKGNoaWxkID0+IGNoaWxkLnRvVGV4dG1hdGVTdHJpbmcoKSkuam9pbignJyl9JHt0cmFuc2Zvcm1TdHJpbmd9fWA7XG5cdFx0fVxuXHR9XG5cblx0Y2xvbmUoKTogVmFyaWFibGUge1xuXHRcdGNvbnN0IHJldCA9IG5ldyBWYXJpYWJsZSh0aGlzLm5hbWUpO1xuXHRcdGlmICh0aGlzLnRyYW5zZm9ybSkge1xuXHRcdFx0cmV0LnRyYW5zZm9ybSA9IHRoaXMudHJhbnNmb3JtLmNsb25lKCk7XG5cdFx0fVxuXHRcdHJldC5fY2hpbGRyZW4gPSB0aGlzLmNoaWxkcmVuLm1hcChjaGlsZCA9PiBjaGlsZC5jbG9uZSgpKTtcblx0XHRyZXR1cm4gcmV0O1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVmFyaWFibGVSZXNvbHZlciB7XG5cdHJlc29sdmUodmFyaWFibGU6IFZhcmlhYmxlKTogc3RyaW5nIHwgdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiB3YWxrKG1hcmtlcjogTWFya2VyW10sIHZpc2l0b3I6IChtYXJrZXI6IE1hcmtlcikgPT4gYm9vbGVhbik6IHZvaWQge1xuXHRjb25zdCBzdGFjayA9IFsuLi5tYXJrZXJdO1xuXHR3aGlsZSAoc3RhY2subGVuZ3RoID4gMCkge1xuXHRcdGNvbnN0IG1hcmtlciA9IHN0YWNrLnNoaWZ0KCkhO1xuXHRcdGNvbnN0IHJlY3Vyc2UgPSB2aXNpdG9yKG1hcmtlcik7XG5cdFx0aWYgKCFyZWN1cnNlKSB7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdFx0c3RhY2sudW5zaGlmdCguLi5tYXJrZXIuY2hpbGRyZW4pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXh0bWF0ZVNuaXBwZXQgZXh0ZW5kcyBNYXJrZXIge1xuXG5cdHByaXZhdGUgX3BsYWNlaG9sZGVycz86IHsgYWxsOiBQbGFjZWhvbGRlcltdOyBsYXN0PzogUGxhY2Vob2xkZXIgfTtcblxuXHRnZXQgcGxhY2Vob2xkZXJJbmZvKCkge1xuXHRcdGlmICghdGhpcy5fcGxhY2Vob2xkZXJzKSB7XG5cdFx0XHQvLyBmaWxsIGluIHBsYWNlaG9sZGVyc1xuXHRcdFx0Y29uc3QgYWxsOiBQbGFjZWhvbGRlcltdID0gW107XG5cdFx0XHRsZXQgbGFzdDogUGxhY2Vob2xkZXIgfCB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLndhbGsoZnVuY3Rpb24gKGNhbmRpZGF0ZSkge1xuXHRcdFx0XHRpZiAoY2FuZGlkYXRlIGluc3RhbmNlb2YgUGxhY2Vob2xkZXIpIHtcblx0XHRcdFx0XHRhbGwucHVzaChjYW5kaWRhdGUpO1xuXHRcdFx0XHRcdGxhc3QgPSAhbGFzdCB8fCBsYXN0LmluZGV4IDwgY2FuZGlkYXRlLmluZGV4ID8gY2FuZGlkYXRlIDogbGFzdDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fcGxhY2Vob2xkZXJzID0geyBhbGwsIGxhc3QgfTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3BsYWNlaG9sZGVycztcblx0fVxuXG5cdGdldCBwbGFjZWhvbGRlcnMoKTogUGxhY2Vob2xkZXJbXSB7XG5cdFx0Y29uc3QgeyBhbGwgfSA9IHRoaXMucGxhY2Vob2xkZXJJbmZvO1xuXHRcdHJldHVybiBhbGw7XG5cdH1cblxuXHRvZmZzZXQobWFya2VyOiBNYXJrZXIpOiBudW1iZXIge1xuXHRcdGxldCBwb3MgPSAwO1xuXHRcdGxldCBmb3VuZCA9IGZhbHNlO1xuXHRcdHRoaXMud2FsayhjYW5kaWRhdGUgPT4ge1xuXHRcdFx0aWYgKGNhbmRpZGF0ZSA9PT0gbWFya2VyKSB7XG5cdFx0XHRcdGZvdW5kID0gdHJ1ZTtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0cG9zICs9IGNhbmRpZGF0ZS5sZW4oKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0pO1xuXG5cdFx0aWYgKCFmb3VuZCkge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblx0XHRyZXR1cm4gcG9zO1xuXHR9XG5cblx0ZnVsbExlbihtYXJrZXI6IE1hcmtlcik6IG51bWJlciB7XG5cdFx0bGV0IHJldCA9IDA7XG5cdFx0d2FsayhbbWFya2VyXSwgbWFya2VyID0+IHtcblx0XHRcdHJldCArPSBtYXJrZXIubGVuKCk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9KTtcblx0XHRyZXR1cm4gcmV0O1xuXHR9XG5cblx0ZW5jbG9zaW5nUGxhY2Vob2xkZXJzKHBsYWNlaG9sZGVyOiBQbGFjZWhvbGRlcik6IFBsYWNlaG9sZGVyW10ge1xuXHRcdGNvbnN0IHJldDogUGxhY2Vob2xkZXJbXSA9IFtdO1xuXHRcdGxldCB7IHBhcmVudCB9ID0gcGxhY2Vob2xkZXI7XG5cdFx0d2hpbGUgKHBhcmVudCkge1xuXHRcdFx0aWYgKHBhcmVudCBpbnN0YW5jZW9mIFBsYWNlaG9sZGVyKSB7XG5cdFx0XHRcdHJldC5wdXNoKHBhcmVudCk7XG5cdFx0XHR9XG5cdFx0XHRwYXJlbnQgPSBwYXJlbnQucGFyZW50O1xuXHRcdH1cblx0XHRyZXR1cm4gcmV0O1xuXHR9XG5cblx0cmVzb2x2ZVZhcmlhYmxlcyhyZXNvbHZlcjogVmFyaWFibGVSZXNvbHZlcik6IHRoaXMge1xuXHRcdHRoaXMud2FsayhjYW5kaWRhdGUgPT4ge1xuXHRcdFx0aWYgKGNhbmRpZGF0ZSBpbnN0YW5jZW9mIFZhcmlhYmxlKSB7XG5cdFx0XHRcdGlmIChjYW5kaWRhdGUucmVzb2x2ZShyZXNvbHZlcikpIHtcblx0XHRcdFx0XHR0aGlzLl9wbGFjZWhvbGRlcnMgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0pO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXBwZW5kQ2hpbGQoY2hpbGQ6IE1hcmtlcikge1xuXHRcdHRoaXMuX3BsYWNlaG9sZGVycyA9IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4gc3VwZXIuYXBwZW5kQ2hpbGQoY2hpbGQpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVwbGFjZShjaGlsZDogTWFya2VyLCBvdGhlcnM6IE1hcmtlcltdKTogdm9pZCB7XG5cdFx0dGhpcy5fcGxhY2Vob2xkZXJzID0gdW5kZWZpbmVkO1xuXHRcdHJldHVybiBzdXBlci5yZXBsYWNlKGNoaWxkLCBvdGhlcnMpO1xuXHR9XG5cblx0dG9UZXh0bWF0ZVN0cmluZygpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmNoaWxkcmVuLnJlZHVjZSgocHJldiwgY3VyKSA9PiBwcmV2ICsgY3VyLnRvVGV4dG1hdGVTdHJpbmcoKSwgJycpO1xuXHR9XG5cblx0Y2xvbmUoKTogVGV4dG1hdGVTbmlwcGV0IHtcblx0XHRjb25zdCByZXQgPSBuZXcgVGV4dG1hdGVTbmlwcGV0KCk7XG5cdFx0cmV0Ll9jaGlsZHJlbiA9IHRoaXMuY2hpbGRyZW4ubWFwKGNoaWxkID0+IGNoaWxkLmNsb25lKCkpO1xuXHRcdHJldHVybiByZXQ7XG5cdH1cblxuXHR3YWxrKHZpc2l0b3I6IChtYXJrZXI6IE1hcmtlcikgPT4gYm9vbGVhbik6IHZvaWQge1xuXHRcdHdhbGsodGhpcy5jaGlsZHJlbiwgdmlzaXRvcik7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNuaXBwZXRQYXJzZXIge1xuXG5cdHN0YXRpYyBlc2NhcGUodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHZhbHVlLnJlcGxhY2UoL1xcJHx9fFxcXFwvZywgJ1xcXFwkJicpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRha2VzIGEgc25pcHBldCBhbmQgcmV0dXJucyB0aGUgaW5zZXJ0YWJsZSBzdHJpbmcsIGUuZyByZXR1cm4gdGhlIHNuaXBwZXQtc3RyaW5nXG5cdCAqIHdpdGhvdXQgYW55IHBsYWNlaG9sZGVyLCB0YWJzdG9wLCB2YXJpYWJsZXMgZXRjLi4uXG5cdCAqL1xuXHRzdGF0aWMgYXNJbnNlcnRUZXh0KHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiBuZXcgU25pcHBldFBhcnNlcigpLnBhcnNlKHZhbHVlKS50b1N0cmluZygpO1xuXHR9XG5cblx0c3RhdGljIGd1ZXNzTmVlZHNDbGlwYm9hcmQodGVtcGxhdGU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAvXFwkez9DTElQQk9BUkQvLnRlc3QodGVtcGxhdGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2Nhbm5lcjogU2Nhbm5lciA9IG5ldyBTY2FubmVyKCk7XG5cdHByaXZhdGUgX3Rva2VuOiBUb2tlbiA9IHsgdHlwZTogVG9rZW5UeXBlLkVPRiwgcG9zOiAwLCBsZW46IDAgfTtcblxuXHRwYXJzZSh2YWx1ZTogc3RyaW5nLCBpbnNlcnRGaW5hbFRhYnN0b3A/OiBib29sZWFuLCBlbmZvcmNlRmluYWxUYWJzdG9wPzogYm9vbGVhbik6IFRleHRtYXRlU25pcHBldCB7XG5cdFx0Y29uc3Qgc25pcHBldCA9IG5ldyBUZXh0bWF0ZVNuaXBwZXQoKTtcblx0XHR0aGlzLnBhcnNlRnJhZ21lbnQodmFsdWUsIHNuaXBwZXQpO1xuXHRcdHRoaXMuZW5zdXJlRmluYWxUYWJzdG9wKHNuaXBwZXQsIGVuZm9yY2VGaW5hbFRhYnN0b3AgPz8gZmFsc2UsIGluc2VydEZpbmFsVGFic3RvcCA/PyBmYWxzZSk7XG5cdFx0cmV0dXJuIHNuaXBwZXQ7XG5cdH1cblxuXHRwYXJzZUZyYWdtZW50KHZhbHVlOiBzdHJpbmcsIHNuaXBwZXQ6IFRleHRtYXRlU25pcHBldCk6IHJlYWRvbmx5IE1hcmtlcltdIHtcblxuXHRcdGNvbnN0IG9mZnNldCA9IHNuaXBwZXQuY2hpbGRyZW4ubGVuZ3RoO1xuXHRcdHRoaXMuX3NjYW5uZXIudGV4dCh2YWx1ZSk7XG5cdFx0dGhpcy5fdG9rZW4gPSB0aGlzLl9zY2FubmVyLm5leHQoKTtcblx0XHR3aGlsZSAodGhpcy5fcGFyc2Uoc25pcHBldCkpIHtcblx0XHRcdC8vIG5vdGhpbmdcblx0XHR9XG5cblx0XHQvLyBmaWxsIGluIHZhbHVlcyBmb3IgcGxhY2Vob2xkZXJzLiB0aGUgZmlyc3QgcGxhY2Vob2xkZXIgb2YgYW4gaW5kZXhcblx0XHQvLyB0aGF0IGhhcyBhIHZhbHVlIGRlZmluZXMgdGhlIHZhbHVlIGZvciBhbGwgcGxhY2Vob2xkZXJzIHdpdGggdGhhdCBpbmRleFxuXHRcdGNvbnN0IHBsYWNlaG9sZGVyRGVmYXVsdFZhbHVlcyA9IG5ldyBNYXA8bnVtYmVyLCBNYXJrZXJbXSB8IHVuZGVmaW5lZD4oKTtcblx0XHRjb25zdCBpbmNvbXBsZXRlUGxhY2Vob2xkZXJzOiBQbGFjZWhvbGRlcltdID0gW107XG5cdFx0c25pcHBldC53YWxrKG1hcmtlciA9PiB7XG5cdFx0XHRpZiAobWFya2VyIGluc3RhbmNlb2YgUGxhY2Vob2xkZXIpIHtcblx0XHRcdFx0aWYgKG1hcmtlci5pc0ZpbmFsVGFic3RvcCkge1xuXHRcdFx0XHRcdHBsYWNlaG9sZGVyRGVmYXVsdFZhbHVlcy5zZXQoMCwgdW5kZWZpbmVkKTtcblx0XHRcdFx0fSBlbHNlIGlmICghcGxhY2Vob2xkZXJEZWZhdWx0VmFsdWVzLmhhcyhtYXJrZXIuaW5kZXgpICYmIG1hcmtlci5jaGlsZHJlbi5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0cGxhY2Vob2xkZXJEZWZhdWx0VmFsdWVzLnNldChtYXJrZXIuaW5kZXgsIG1hcmtlci5jaGlsZHJlbik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aW5jb21wbGV0ZVBsYWNlaG9sZGVycy5wdXNoKG1hcmtlcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZmlsbEluSW5jb21wbGV0ZVBsYWNlaG9sZGVyID0gKHBsYWNlaG9sZGVyOiBQbGFjZWhvbGRlciwgc3RhY2s6IFNldDxudW1iZXI+KSA9PiB7XG5cdFx0XHRjb25zdCBkZWZhdWx0VmFsdWVzID0gcGxhY2Vob2xkZXJEZWZhdWx0VmFsdWVzLmdldChwbGFjZWhvbGRlci5pbmRleCk7XG5cdFx0XHRpZiAoIWRlZmF1bHRWYWx1ZXMpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY2xvbmUgPSBuZXcgUGxhY2Vob2xkZXIocGxhY2Vob2xkZXIuaW5kZXgpO1xuXHRcdFx0Y2xvbmUudHJhbnNmb3JtID0gcGxhY2Vob2xkZXIudHJhbnNmb3JtO1xuXHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBkZWZhdWx0VmFsdWVzKSB7XG5cdFx0XHRcdGNvbnN0IG5ld0NoaWxkID0gY2hpbGQuY2xvbmUoKTtcblx0XHRcdFx0Y2xvbmUuYXBwZW5kQ2hpbGQobmV3Q2hpbGQpO1xuXG5cdFx0XHRcdC8vIFwicmVjdXJzZVwiIG9uIGNoaWxkcmVuIHRoYXQgYXJlIGFnYWluIHBsYWNlaG9sZGVyc1xuXHRcdFx0XHRpZiAobmV3Q2hpbGQgaW5zdGFuY2VvZiBQbGFjZWhvbGRlciAmJiBwbGFjZWhvbGRlckRlZmF1bHRWYWx1ZXMuaGFzKG5ld0NoaWxkLmluZGV4KSAmJiAhc3RhY2suaGFzKG5ld0NoaWxkLmluZGV4KSkge1xuXHRcdFx0XHRcdHN0YWNrLmFkZChuZXdDaGlsZC5pbmRleCk7XG5cdFx0XHRcdFx0ZmlsbEluSW5jb21wbGV0ZVBsYWNlaG9sZGVyKG5ld0NoaWxkLCBzdGFjayk7XG5cdFx0XHRcdFx0c3RhY2suZGVsZXRlKG5ld0NoaWxkLmluZGV4KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0c25pcHBldC5yZXBsYWNlKHBsYWNlaG9sZGVyLCBbY2xvbmVdKTtcblx0XHR9O1xuXG5cdFx0Y29uc3Qgc3RhY2sgPSBuZXcgU2V0PG51bWJlcj4oKTtcblx0XHRmb3IgKGNvbnN0IHBsYWNlaG9sZGVyIG9mIGluY29tcGxldGVQbGFjZWhvbGRlcnMpIHtcblx0XHRcdGZpbGxJbkluY29tcGxldGVQbGFjZWhvbGRlcihwbGFjZWhvbGRlciwgc3RhY2spO1xuXHRcdH1cblxuXHRcdHJldHVybiBzbmlwcGV0LmNoaWxkcmVuLnNsaWNlKG9mZnNldCk7XG5cdH1cblxuXHRlbnN1cmVGaW5hbFRhYnN0b3Aoc25pcHBldDogVGV4dG1hdGVTbmlwcGV0LCBlbmZvcmNlRmluYWxUYWJzdG9wOiBib29sZWFuLCBpbnNlcnRGaW5hbFRhYnN0b3A6IGJvb2xlYW4pIHtcblxuXHRcdGlmIChlbmZvcmNlRmluYWxUYWJzdG9wIHx8IGluc2VydEZpbmFsVGFic3RvcCAmJiBzbmlwcGV0LnBsYWNlaG9sZGVycy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBmaW5hbFRhYnN0b3AgPSBzbmlwcGV0LnBsYWNlaG9sZGVycy5maW5kKHAgPT4gcC5pbmRleCA9PT0gMCk7XG5cdFx0XHRpZiAoIWZpbmFsVGFic3RvcCkge1xuXHRcdFx0XHQvLyB0aGUgc25pcHBldCB1c2VzIHBsYWNlaG9sZGVycyBidXQgaGFzIG5vXG5cdFx0XHRcdC8vIGZpbmFsIHRhYnN0b3AgZGVmaW5lZCAtPiBpbnNlcnQgYXQgdGhlIGVuZFxuXHRcdFx0XHRzbmlwcGV0LmFwcGVuZENoaWxkKG5ldyBQbGFjZWhvbGRlcigwKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdH1cblxuXHRwcml2YXRlIF9hY2NlcHQodHlwZT86IFRva2VuVHlwZSk6IGJvb2xlYW47XG5cdHByaXZhdGUgX2FjY2VwdCh0eXBlOiBUb2tlblR5cGUgfCB1bmRlZmluZWQsIHZhbHVlOiB0cnVlKTogc3RyaW5nO1xuXHRwcml2YXRlIF9hY2NlcHQodHlwZTogVG9rZW5UeXBlLCB2YWx1ZT86IGJvb2xlYW4pOiBib29sZWFuIHwgc3RyaW5nIHtcblx0XHRpZiAodHlwZSA9PT0gdW5kZWZpbmVkIHx8IHRoaXMuX3Rva2VuLnR5cGUgPT09IHR5cGUpIHtcblx0XHRcdGNvbnN0IHJldCA9ICF2YWx1ZSA/IHRydWUgOiB0aGlzLl9zY2FubmVyLnRva2VuVGV4dCh0aGlzLl90b2tlbik7XG5cdFx0XHR0aGlzLl90b2tlbiA9IHRoaXMuX3NjYW5uZXIubmV4dCgpO1xuXHRcdFx0cmV0dXJuIHJldDtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfYmFja1RvKHRva2VuOiBUb2tlbik6IGZhbHNlIHtcblx0XHR0aGlzLl9zY2FubmVyLnBvcyA9IHRva2VuLnBvcyArIHRva2VuLmxlbjtcblx0XHR0aGlzLl90b2tlbiA9IHRva2VuO1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgX3VudGlsKHR5cGU6IFRva2VuVHlwZSk6IGZhbHNlIHwgc3RyaW5nIHtcblx0XHRjb25zdCBzdGFydCA9IHRoaXMuX3Rva2VuO1xuXHRcdHdoaWxlICh0aGlzLl90b2tlbi50eXBlICE9PSB0eXBlKSB7XG5cdFx0XHRpZiAodGhpcy5fdG9rZW4udHlwZSA9PT0gVG9rZW5UeXBlLkVPRikge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMuX3Rva2VuLnR5cGUgPT09IFRva2VuVHlwZS5CYWNrc2xhc2gpIHtcblx0XHRcdFx0Y29uc3QgbmV4dFRva2VuID0gdGhpcy5fc2Nhbm5lci5uZXh0KCk7XG5cdFx0XHRcdGlmIChuZXh0VG9rZW4udHlwZSAhPT0gVG9rZW5UeXBlLkRvbGxhclxuXHRcdFx0XHRcdCYmIG5leHRUb2tlbi50eXBlICE9PSBUb2tlblR5cGUuQ3VybHlDbG9zZVxuXHRcdFx0XHRcdCYmIG5leHRUb2tlbi50eXBlICE9PSBUb2tlblR5cGUuQmFja3NsYXNoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl90b2tlbiA9IHRoaXMuX3NjYW5uZXIubmV4dCgpO1xuXHRcdH1cblx0XHRjb25zdCB2YWx1ZSA9IHRoaXMuX3NjYW5uZXIudmFsdWUuc3Vic3RyaW5nKHN0YXJ0LnBvcywgdGhpcy5fdG9rZW4ucG9zKS5yZXBsYWNlKC9cXFxcKFxcJHx9fFxcXFwpL2csICckMScpO1xuXHRcdHRoaXMuX3Rva2VuID0gdGhpcy5fc2Nhbm5lci5uZXh0KCk7XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfcGFyc2UobWFya2VyOiBNYXJrZXIpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fcGFyc2VFc2NhcGVkKG1hcmtlcilcblx0XHRcdHx8IHRoaXMuX3BhcnNlVGFic3RvcE9yVmFyaWFibGVOYW1lKG1hcmtlcilcblx0XHRcdHx8IHRoaXMuX3BhcnNlQ29tcGxleFBsYWNlaG9sZGVyKG1hcmtlcilcblx0XHRcdHx8IHRoaXMuX3BhcnNlQ29tcGxleFZhcmlhYmxlKG1hcmtlcilcblx0XHRcdHx8IHRoaXMuX3BhcnNlQW55dGhpbmcobWFya2VyKTtcblx0fVxuXG5cdC8vIFxcJCwgXFxcXCwgXFx9IC0+IGp1c3QgdGV4dFxuXHRwcml2YXRlIF9wYXJzZUVzY2FwZWQobWFya2VyOiBNYXJrZXIpOiBib29sZWFuIHtcblx0XHRsZXQgdmFsdWU6IHN0cmluZztcblx0XHRpZiAodmFsdWUgPSB0aGlzLl9hY2NlcHQoVG9rZW5UeXBlLkJhY2tzbGFzaCwgdHJ1ZSkpIHtcblx0XHRcdC8vIHNhdyBhIGJhY2tzbGFzaCwgYXBwZW5kIGVzY2FwZWQgdG9rZW4gb3IgdGhhdCBiYWNrc2xhc2hcblx0XHRcdHZhbHVlID0gdGhpcy5fYWNjZXB0KFRva2VuVHlwZS5Eb2xsYXIsIHRydWUpXG5cdFx0XHRcdHx8IHRoaXMuX2FjY2VwdChUb2tlblR5cGUuQ3VybHlDbG9zZSwgdHJ1ZSlcblx0XHRcdFx0fHwgdGhpcy5fYWNjZXB0KFRva2VuVHlwZS5CYWNrc2xhc2gsIHRydWUpXG5cdFx0XHRcdHx8IHZhbHVlO1xuXG5cdFx0XHRtYXJrZXIuYXBwZW5kQ2hpbGQobmV3IFRleHQodmFsdWUpKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHQvLyAkZm9vIC0+IHZhcmlhYmxlLCAkMSAtPiB0YWJzdG9wXG5cdHByaXZhdGUgX3BhcnNlVGFic3RvcE9yVmFyaWFibGVOYW1lKHBhcmVudDogTWFya2VyKTogYm9vbGVhbiB7XG5cdFx0bGV0IHZhbHVlOiBzdHJpbmc7XG5cdFx0Y29uc3QgdG9rZW4gPSB0aGlzLl90b2tlbjtcblx0XHRjb25zdCBtYXRjaCA9IHRoaXMuX2FjY2VwdChUb2tlblR5cGUuRG9sbGFyKVxuXHRcdFx0JiYgKHZhbHVlID0gdGhpcy5fYWNjZXB0KFRva2VuVHlwZS5WYXJpYWJsZU5hbWUsIHRydWUpIHx8IHRoaXMuX2FjY2VwdChUb2tlblR5cGUuSW50LCB0cnVlKSk7XG5cblx0XHRpZiAoIW1hdGNoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYmFja1RvKHRva2VuKTtcblx0XHR9XG5cblx0XHRwYXJlbnQuYXBwZW5kQ2hpbGQoL15cXGQrJC8udGVzdCh2YWx1ZSEpXG5cdFx0XHQ/IG5ldyBQbGFjZWhvbGRlcihOdW1iZXIodmFsdWUhKSlcblx0XHRcdDogbmV3IFZhcmlhYmxlKHZhbHVlISlcblx0XHQpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Ly8gJHsxOjxjaGlsZHJlbj59LCAkezF9IC0+IHBsYWNlaG9sZGVyXG5cdHByaXZhdGUgX3BhcnNlQ29tcGxleFBsYWNlaG9sZGVyKHBhcmVudDogTWFya2VyKTogYm9vbGVhbiB7XG5cdFx0bGV0IGluZGV4OiBzdHJpbmc7XG5cdFx0Y29uc3QgdG9rZW4gPSB0aGlzLl90b2tlbjtcblx0XHRjb25zdCBtYXRjaCA9IHRoaXMuX2FjY2VwdChUb2tlblR5cGUuRG9sbGFyKVxuXHRcdFx0JiYgdGhpcy5fYWNjZXB0KFRva2VuVHlwZS5DdXJseU9wZW4pXG5cdFx0XHQmJiAoaW5kZXggPSB0aGlzLl9hY2NlcHQoVG9rZW5UeXBlLkludCwgdHJ1ZSkpO1xuXG5cdFx0aWYgKCFtYXRjaCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2JhY2tUbyh0b2tlbik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGxhY2Vob2xkZXIgPSBuZXcgUGxhY2Vob2xkZXIoTnVtYmVyKGluZGV4ISkpO1xuXG5cdFx0aWYgKHRoaXMuX2FjY2VwdChUb2tlblR5cGUuQ29sb24pKSB7XG5cdFx0XHQvLyAkezE6PGNoaWxkcmVuPn1cblx0XHRcdHdoaWxlICh0cnVlKSB7XG5cblx0XHRcdFx0Ly8gLi4ufSAtPiBkb25lXG5cdFx0XHRcdGlmICh0aGlzLl9hY2NlcHQoVG9rZW5UeXBlLkN1cmx5Q2xvc2UpKSB7XG5cdFx0XHRcdFx0cGFyZW50LmFwcGVuZENoaWxkKHBsYWNlaG9sZGVyKTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh0aGlzLl9wYXJzZShwbGFjZWhvbGRlcikpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIGZhbGxiYWNrXG5cdFx0XHRcdHBhcmVudC5hcHBlbmRDaGlsZChuZXcgVGV4dCgnJHsnICsgaW5kZXghICsgJzonKSk7XG5cdFx0XHRcdHBsYWNlaG9sZGVyLmNoaWxkcmVuLmZvckVhY2gocGFyZW50LmFwcGVuZENoaWxkLCBwYXJlbnQpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKHBsYWNlaG9sZGVyLmluZGV4ID4gMCAmJiB0aGlzLl9hY2NlcHQoVG9rZW5UeXBlLlBpcGUpKSB7XG5cdFx0XHQvLyAkezF8b25lLHR3byx0aHJlZXx9XG5cdFx0XHRjb25zdCBjaG9pY2UgPSBuZXcgQ2hvaWNlKCk7XG5cblx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9wYXJzZUNob2ljZUVsZW1lbnQoY2hvaWNlKSkge1xuXG5cdFx0XHRcdFx0aWYgKHRoaXMuX2FjY2VwdChUb2tlblR5cGUuQ29tbWEpKSB7XG5cdFx0XHRcdFx0XHQvLyBvcHQsIC0+IG1vcmVcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmICh0aGlzLl9hY2NlcHQoVG9rZW5UeXBlLlBpcGUpKSB7XG5cdFx0XHRcdFx0XHRwbGFjZWhvbGRlci5hcHBlbmRDaGlsZChjaG9pY2UpO1xuXHRcdFx0XHRcdFx0aWYgKHRoaXMuX2FjY2VwdChUb2tlblR5cGUuQ3VybHlDbG9zZSkpIHtcblx0XHRcdFx0XHRcdFx0Ly8gLi58fSAtPiBkb25lXG5cdFx0XHRcdFx0XHRcdHBhcmVudC5hcHBlbmRDaGlsZChwbGFjZWhvbGRlcik7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuX2JhY2tUbyh0b2tlbik7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdH0gZWxzZSBpZiAodGhpcy5fYWNjZXB0KFRva2VuVHlwZS5Gb3J3YXJkc2xhc2gpKSB7XG5cdFx0XHQvLyAkezEvPHJlZ2V4Pi88Zm9ybWF0Pi88b3B0aW9ucz59XG5cdFx0XHRpZiAodGhpcy5fcGFyc2VUcmFuc2Zvcm0ocGxhY2Vob2xkZXIpKSB7XG5cdFx0XHRcdHBhcmVudC5hcHBlbmRDaGlsZChwbGFjZWhvbGRlcik7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9iYWNrVG8odG9rZW4pO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXG5cdFx0fSBlbHNlIGlmICh0aGlzLl9hY2NlcHQoVG9rZW5UeXBlLkN1cmx5Q2xvc2UpKSB7XG5cdFx0XHQvLyAkezF9XG5cdFx0XHRwYXJlbnQuYXBwZW5kQ2hpbGQocGxhY2Vob2xkZXIpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gJHsxIDwtIG1pc3NpbmcgY3VybHkgb3IgY29sb25cblx0XHRcdHJldHVybiB0aGlzLl9iYWNrVG8odG9rZW4pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3BhcnNlQ2hvaWNlRWxlbWVudChwYXJlbnQ6IENob2ljZSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHRva2VuID0gdGhpcy5fdG9rZW47XG5cdFx0Y29uc3QgdmFsdWVzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGlmICh0aGlzLl90b2tlbi50eXBlID09PSBUb2tlblR5cGUuQ29tbWEgfHwgdGhpcy5fdG9rZW4udHlwZSA9PT0gVG9rZW5UeXBlLlBpcGUpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRsZXQgdmFsdWU6IHN0cmluZztcblx0XHRcdGlmICh2YWx1ZSA9IHRoaXMuX2FjY2VwdChUb2tlblR5cGUuQmFja3NsYXNoLCB0cnVlKSkge1xuXHRcdFx0XHQvLyBcXCwgXFx8LCBvciBcXFxcXG5cdFx0XHRcdHZhbHVlID0gdGhpcy5fYWNjZXB0KFRva2VuVHlwZS5Db21tYSwgdHJ1ZSlcblx0XHRcdFx0XHR8fCB0aGlzLl9hY2NlcHQoVG9rZW5UeXBlLlBpcGUsIHRydWUpXG5cdFx0XHRcdFx0fHwgdGhpcy5fYWNjZXB0KFRva2VuVHlwZS5CYWNrc2xhc2gsIHRydWUpXG5cdFx0XHRcdFx0fHwgdmFsdWU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR2YWx1ZSA9IHRoaXMuX2FjY2VwdCh1bmRlZmluZWQsIHRydWUpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCF2YWx1ZSkge1xuXHRcdFx0XHQvLyBFT0Zcblx0XHRcdFx0dGhpcy5fYmFja1RvKHRva2VuKTtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0dmFsdWVzLnB1c2godmFsdWUpO1xuXHRcdH1cblxuXHRcdGlmICh2YWx1ZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLl9iYWNrVG8odG9rZW4pO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHBhcmVudC5hcHBlbmRDaGlsZChuZXcgVGV4dCh2YWx1ZXMuam9pbignJykpKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8vICR7Zm9vOjxjaGlsZHJlbj59LCAke2Zvb30gLT4gdmFyaWFibGVcblx0cHJpdmF0ZSBfcGFyc2VDb21wbGV4VmFyaWFibGUocGFyZW50OiBNYXJrZXIpOiBib29sZWFuIHtcblx0XHRsZXQgbmFtZTogc3RyaW5nO1xuXHRcdGNvbnN0IHRva2VuID0gdGhpcy5fdG9rZW47XG5cdFx0Y29uc3QgbWF0Y2ggPSB0aGlzLl9hY2NlcHQoVG9rZW5UeXBlLkRvbGxhcilcblx0XHRcdCYmIHRoaXMuX2FjY2VwdChUb2tlblR5cGUuQ3VybHlPcGVuKVxuXHRcdFx0JiYgKG5hbWUgPSB0aGlzLl9hY2NlcHQoVG9rZW5UeXBlLlZhcmlhYmxlTmFtZSwgdHJ1ZSkpO1xuXG5cdFx0aWYgKCFtYXRjaCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2JhY2tUbyh0b2tlbik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdmFyaWFibGUgPSBuZXcgVmFyaWFibGUobmFtZSEpO1xuXG5cdFx0aWYgKHRoaXMuX2FjY2VwdChUb2tlblR5cGUuQ29sb24pKSB7XG5cdFx0XHQvLyAke2Zvbzo8Y2hpbGRyZW4+fVxuXHRcdFx0d2hpbGUgKHRydWUpIHtcblxuXHRcdFx0XHQvLyAuLi59IC0+IGRvbmVcblx0XHRcdFx0aWYgKHRoaXMuX2FjY2VwdChUb2tlblR5cGUuQ3VybHlDbG9zZSkpIHtcblx0XHRcdFx0XHRwYXJlbnQuYXBwZW5kQ2hpbGQodmFyaWFibGUpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHRoaXMuX3BhcnNlKHZhcmlhYmxlKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gZmFsbGJhY2tcblx0XHRcdFx0cGFyZW50LmFwcGVuZENoaWxkKG5ldyBUZXh0KCckeycgKyBuYW1lISArICc6JykpO1xuXHRcdFx0XHR2YXJpYWJsZS5jaGlsZHJlbi5mb3JFYWNoKHBhcmVudC5hcHBlbmRDaGlsZCwgcGFyZW50KTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHR9IGVsc2UgaWYgKHRoaXMuX2FjY2VwdChUb2tlblR5cGUuRm9yd2FyZHNsYXNoKSkge1xuXHRcdFx0Ly8gJHtmb28vPHJlZ2V4Pi88Zm9ybWF0Pi88b3B0aW9ucz59XG5cdFx0XHRpZiAodGhpcy5fcGFyc2VUcmFuc2Zvcm0odmFyaWFibGUpKSB7XG5cdFx0XHRcdHBhcmVudC5hcHBlbmRDaGlsZCh2YXJpYWJsZSk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9iYWNrVG8odG9rZW4pO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXG5cdFx0fSBlbHNlIGlmICh0aGlzLl9hY2NlcHQoVG9rZW5UeXBlLkN1cmx5Q2xvc2UpKSB7XG5cdFx0XHQvLyAke2Zvb31cblx0XHRcdHBhcmVudC5hcHBlbmRDaGlsZCh2YXJpYWJsZSk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyAke2ZvbyA8LSBtaXNzaW5nIGN1cmx5IG9yIGNvbG9uXG5cdFx0XHRyZXR1cm4gdGhpcy5fYmFja1RvKHRva2VuKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9wYXJzZVRyYW5zZm9ybShwYXJlbnQ6IFRyYW5zZm9ybWFibGVNYXJrZXIpOiBib29sZWFuIHtcblx0XHQvLyAuLi48cmVnZXg+Lzxmb3JtYXQ+LzxvcHRpb25zPn1cblxuXHRcdGNvbnN0IHRyYW5zZm9ybSA9IG5ldyBUcmFuc2Zvcm0oKTtcblx0XHRsZXQgcmVnZXhWYWx1ZSA9ICcnO1xuXHRcdGxldCByZWdleE9wdGlvbnMgPSAnJztcblxuXHRcdC8vICgxKSAvcmVnZXhcblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0aWYgKHRoaXMuX2FjY2VwdChUb2tlblR5cGUuRm9yd2FyZHNsYXNoKSkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0bGV0IGVzY2FwZWQ6IHN0cmluZztcblx0XHRcdGlmIChlc2NhcGVkID0gdGhpcy5fYWNjZXB0KFRva2VuVHlwZS5CYWNrc2xhc2gsIHRydWUpKSB7XG5cdFx0XHRcdGVzY2FwZWQgPSB0aGlzLl9hY2NlcHQoVG9rZW5UeXBlLkZvcndhcmRzbGFzaCwgdHJ1ZSkgfHwgZXNjYXBlZDtcblx0XHRcdFx0cmVnZXhWYWx1ZSArPSBlc2NhcGVkO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuX3Rva2VuLnR5cGUgIT09IFRva2VuVHlwZS5FT0YpIHtcblx0XHRcdFx0cmVnZXhWYWx1ZSArPSB0aGlzLl9hY2NlcHQodW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gKDIpIC9mb3JtYXRcblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0aWYgKHRoaXMuX2FjY2VwdChUb2tlblR5cGUuRm9yd2FyZHNsYXNoKSkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0bGV0IGVzY2FwZWQ6IHN0cmluZztcblx0XHRcdGlmIChlc2NhcGVkID0gdGhpcy5fYWNjZXB0KFRva2VuVHlwZS5CYWNrc2xhc2gsIHRydWUpKSB7XG5cdFx0XHRcdGVzY2FwZWQgPSB0aGlzLl9hY2NlcHQoVG9rZW5UeXBlLkJhY2tzbGFzaCwgdHJ1ZSkgfHwgdGhpcy5fYWNjZXB0KFRva2VuVHlwZS5Gb3J3YXJkc2xhc2gsIHRydWUpIHx8IGVzY2FwZWQ7XG5cdFx0XHRcdHRyYW5zZm9ybS5hcHBlbmRDaGlsZChuZXcgVGV4dChlc2NhcGVkKSk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5fcGFyc2VGb3JtYXRTdHJpbmcodHJhbnNmb3JtKSB8fCB0aGlzLl9wYXJzZUFueXRoaW5nKHRyYW5zZm9ybSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gKDMpIC9vcHRpb25cblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0aWYgKHRoaXMuX2FjY2VwdChUb2tlblR5cGUuQ3VybHlDbG9zZSkpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fdG9rZW4udHlwZSAhPT0gVG9rZW5UeXBlLkVPRikge1xuXHRcdFx0XHRyZWdleE9wdGlvbnMgKz0gdGhpcy5fYWNjZXB0KHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHR0cmFuc2Zvcm0ucmVnZXhwID0gbmV3IFJlZ0V4cChyZWdleFZhbHVlLCByZWdleE9wdGlvbnMpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdC8vIGludmFsaWQgcmVnZXhwXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cGFyZW50LnRyYW5zZm9ybSA9IHRyYW5zZm9ybTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgX3BhcnNlRm9ybWF0U3RyaW5nKHBhcmVudDogVHJhbnNmb3JtKTogYm9vbGVhbiB7XG5cblx0XHRjb25zdCB0b2tlbiA9IHRoaXMuX3Rva2VuO1xuXHRcdGlmICghdGhpcy5fYWNjZXB0KFRva2VuVHlwZS5Eb2xsYXIpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0bGV0IGNvbXBsZXggPSBmYWxzZTtcblx0XHRpZiAodGhpcy5fYWNjZXB0KFRva2VuVHlwZS5DdXJseU9wZW4pKSB7XG5cdFx0XHRjb21wbGV4ID0gdHJ1ZTtcblx0XHR9XG5cblx0XHRjb25zdCBpbmRleCA9IHRoaXMuX2FjY2VwdChUb2tlblR5cGUuSW50LCB0cnVlKTtcblxuXHRcdGlmICghaW5kZXgpIHtcblx0XHRcdHRoaXMuX2JhY2tUbyh0b2tlbik7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cblx0XHR9IGVsc2UgaWYgKCFjb21wbGV4KSB7XG5cdFx0XHQvLyAkMVxuXHRcdFx0cGFyZW50LmFwcGVuZENoaWxkKG5ldyBGb3JtYXRTdHJpbmcoTnVtYmVyKGluZGV4KSkpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cblx0XHR9IGVsc2UgaWYgKHRoaXMuX2FjY2VwdChUb2tlblR5cGUuQ3VybHlDbG9zZSkpIHtcblx0XHRcdC8vICR7MX1cblx0XHRcdHBhcmVudC5hcHBlbmRDaGlsZChuZXcgRm9ybWF0U3RyaW5nKE51bWJlcihpbmRleCkpKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXG5cdFx0fSBlbHNlIGlmICghdGhpcy5fYWNjZXB0KFRva2VuVHlwZS5Db2xvbikpIHtcblx0XHRcdHRoaXMuX2JhY2tUbyh0b2tlbik7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2FjY2VwdChUb2tlblR5cGUuRm9yd2FyZHNsYXNoKSkge1xuXHRcdFx0Ly8gJHsxOi91cGNhc2V9XG5cdFx0XHRjb25zdCBzaG9ydGhhbmQgPSB0aGlzLl9hY2NlcHQoVG9rZW5UeXBlLlZhcmlhYmxlTmFtZSwgdHJ1ZSk7XG5cdFx0XHRpZiAoIXNob3J0aGFuZCB8fCAhdGhpcy5fYWNjZXB0KFRva2VuVHlwZS5DdXJseUNsb3NlKSkge1xuXHRcdFx0XHR0aGlzLl9iYWNrVG8odG9rZW4pO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRwYXJlbnQuYXBwZW5kQ2hpbGQobmV3IEZvcm1hdFN0cmluZyhOdW1iZXIoaW5kZXgpLCBzaG9ydGhhbmQpKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHR9IGVsc2UgaWYgKHRoaXMuX2FjY2VwdChUb2tlblR5cGUuUGx1cykpIHtcblx0XHRcdC8vICR7MTorPGlmPn1cblx0XHRcdGNvbnN0IGlmVmFsdWUgPSB0aGlzLl91bnRpbChUb2tlblR5cGUuQ3VybHlDbG9zZSk7XG5cdFx0XHRpZiAoaWZWYWx1ZSkge1xuXHRcdFx0XHRwYXJlbnQuYXBwZW5kQ2hpbGQobmV3IEZvcm1hdFN0cmluZyhOdW1iZXIoaW5kZXgpLCB1bmRlZmluZWQsIGlmVmFsdWUsIHVuZGVmaW5lZCkpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdH0gZWxzZSBpZiAodGhpcy5fYWNjZXB0KFRva2VuVHlwZS5EYXNoKSkge1xuXHRcdFx0Ly8gJHsyOi08ZWxzZT59XG5cdFx0XHRjb25zdCBlbHNlVmFsdWUgPSB0aGlzLl91bnRpbChUb2tlblR5cGUuQ3VybHlDbG9zZSk7XG5cdFx0XHRpZiAoZWxzZVZhbHVlKSB7XG5cdFx0XHRcdHBhcmVudC5hcHBlbmRDaGlsZChuZXcgRm9ybWF0U3RyaW5nKE51bWJlcihpbmRleCksIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBlbHNlVmFsdWUpKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHR9IGVsc2UgaWYgKHRoaXMuX2FjY2VwdChUb2tlblR5cGUuUXVlc3Rpb25NYXJrKSkge1xuXHRcdFx0Ly8gJHsyOj88aWY+OjxlbHNlPn1cblx0XHRcdGNvbnN0IGlmVmFsdWUgPSB0aGlzLl91bnRpbChUb2tlblR5cGUuQ29sb24pO1xuXHRcdFx0aWYgKGlmVmFsdWUpIHtcblx0XHRcdFx0Y29uc3QgZWxzZVZhbHVlID0gdGhpcy5fdW50aWwoVG9rZW5UeXBlLkN1cmx5Q2xvc2UpO1xuXHRcdFx0XHRpZiAoZWxzZVZhbHVlKSB7XG5cdFx0XHRcdFx0cGFyZW50LmFwcGVuZENoaWxkKG5ldyBGb3JtYXRTdHJpbmcoTnVtYmVyKGluZGV4KSwgdW5kZWZpbmVkLCBpZlZhbHVlLCBlbHNlVmFsdWUpKTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vICR7MTo8ZWxzZT59XG5cdFx0XHRjb25zdCBlbHNlVmFsdWUgPSB0aGlzLl91bnRpbChUb2tlblR5cGUuQ3VybHlDbG9zZSk7XG5cdFx0XHRpZiAoZWxzZVZhbHVlKSB7XG5cdFx0XHRcdHBhcmVudC5hcHBlbmRDaGlsZChuZXcgRm9ybWF0U3RyaW5nKE51bWJlcihpbmRleCksIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBlbHNlVmFsdWUpKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fYmFja1RvKHRva2VuKTtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIF9wYXJzZUFueXRoaW5nKG1hcmtlcjogTWFya2VyKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX3Rva2VuLnR5cGUgIT09IFRva2VuVHlwZS5FT0YpIHtcblx0XHRcdG1hcmtlci5hcHBlbmRDaGlsZChuZXcgVGV4dCh0aGlzLl9zY2FubmVyLnRva2VuVGV4dCh0aGlzLl90b2tlbikpKTtcblx0XHRcdHRoaXMuX2FjY2VwdCh1bmRlZmluZWQpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxnQkFBZ0I7QUFFbEIsSUFBVyxZQUFYLGtCQUFXQSxlQUFYO0FBQ04sRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBQ0Es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QUNSO0FBQUEsSUFFRCxXQUFXLEtBQUssUUFBUSxxQkFBc0IsR0FBRztBQUVoRCxZQUFNLFVBQVUsS0FBSyxPQUFPLGFBQWU7QUFDM0MsVUFBSSxTQUFTO0FBQ1osY0FBTSxZQUFZLEtBQUssT0FBTyxrQkFBb0I7QUFDbEQsWUFBSSxXQUFXO0FBQ2QsaUJBQU8sWUFBWSxJQUFJLGFBQWEsT0FBTyxLQUFLLEdBQUcsUUFBVyxTQUFTLFNBQVMsQ0FBQztBQUNqRixpQkFBTztBQUFBLFFBQ1I7QUFBQSxNQUNEO0FBQUEsSUFFRCxPQUFPO0FBRU4sWUFBTSxZQUFZLEtBQUssT0FBTyxrQkFBb0I7QUFDbEQsVUFBSSxXQUFXO0FBQ2QsZUFBTyxZQUFZLElBQUksYUFBYSxPQUFPLEtBQUssR0FBRyxRQUFXLFFBQVcsU0FBUyxDQUFDO0FBQ25GLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUVBLFNBQUssUUFBUSxLQUFLO0FBQ2xCLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxlQUFlLFFBQXlCO0FBQy9DLFFBQUksS0FBSyxPQUFPLFNBQVMsY0FBZTtBQUN2QyxhQUFPLFlBQVksSUFBSSxLQUFLLEtBQUssU0FBUyxVQUFVLEtBQUssTUFBTSxDQUFDLENBQUM7QUFDakUsV0FBSyxRQUFRLE1BQVM7QUFDdEIsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUNEOyIsCiAgIm5hbWVzIjogWyJUb2tlblR5cGUiLCAicGFyZW50IiwgImNoaWxkIiwgIm1hcmtlciIsICJzdGFjayJdCn0K
