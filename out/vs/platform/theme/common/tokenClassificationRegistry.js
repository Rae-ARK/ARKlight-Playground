import { RunOnceScheduler } from "../../../base/common/async.js";
import { Color } from "../../../base/common/color.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import * as nls from "../../../nls.js";
import { Extensions as JSONExtensions } from "../../jsonschemas/common/jsonContributionRegistry.js";
import * as platform from "../../registry/common/platform.js";
const TOKEN_TYPE_WILDCARD = "*";
const TOKEN_CLASSIFIER_LANGUAGE_SEPARATOR = ":";
const CLASSIFIER_MODIFIER_SEPARATOR = ".";
const idPattern = "\\w+[-_\\w+]*";
const typeAndModifierIdPattern = `^${idPattern}$`;
const selectorPattern = `^(${idPattern}|\\*)(\\${CLASSIFIER_MODIFIER_SEPARATOR}${idPattern})*(${TOKEN_CLASSIFIER_LANGUAGE_SEPARATOR}${idPattern})?$`;
const fontStylePattern = "^(\\s*(italic|bold|underline|strikethrough))*\\s*$";
class TokenStyle {
  constructor(foreground, bold, underline, strikethrough, italic) {
    this.foreground = foreground;
    this.bold = bold;
    this.underline = underline;
    this.strikethrough = strikethrough;
    this.italic = italic;
  }
}
((TokenStyle2) => {
  function toJSONObject(style) {
    return {
      _foreground: style.foreground === void 0 ? null : Color.Format.CSS.formatHexA(style.foreground, true),
      _bold: style.bold === void 0 ? null : style.bold,
      _underline: style.underline === void 0 ? null : style.underline,
      _italic: style.italic === void 0 ? null : style.italic,
      _strikethrough: style.strikethrough === void 0 ? null : style.strikethrough
    };
  }
  TokenStyle2.toJSONObject = toJSONObject;
  function fromJSONObject(obj) {
    if (obj) {
      const boolOrUndef = (b) => typeof b === "boolean" ? b : void 0;
      const colorOrUndef = (s) => typeof s === "string" ? Color.fromHex(s) : void 0;
      return new TokenStyle2(
        colorOrUndef(obj._foreground),
        boolOrUndef(obj._bold),
        boolOrUndef(obj._underline),
        boolOrUndef(obj._strikethrough),
        boolOrUndef(obj._italic)
      );
    }
    return void 0;
  }
  TokenStyle2.fromJSONObject = fromJSONObject;
  function equals(s1, s2) {
    if (s1 === s2) {
      return true;
    }
    return s1 !== void 0 && s2 !== void 0 && (s1.foreground instanceof Color ? s1.foreground.equals(s2.foreground) : s2.foreground === void 0) && s1.bold === s2.bold && s1.underline === s2.underline && s1.strikethrough === s2.strikethrough && s1.italic === s2.italic;
  }
  TokenStyle2.equals = equals;
  function is(s) {
    return s instanceof TokenStyle2;
  }
  TokenStyle2.is = is;
  function fromData(data) {
    return new TokenStyle2(data.foreground, data.bold, data.underline, data.strikethrough, data.italic);
  }
  TokenStyle2.fromData = fromData;
  function fromSettings(foreground, fontStyle, bold, underline, strikethrough, italic) {
    let foregroundColor = void 0;
    if (foreground !== void 0) {
      foregroundColor = Color.fromHex(foreground);
    }
    if (fontStyle !== void 0) {
      bold = italic = underline = strikethrough = false;
      const expression = /italic|bold|underline|strikethrough/g;
      let match;
      while (match = expression.exec(fontStyle)) {
        switch (match[0]) {
          case "bold":
            bold = true;
            break;
          case "italic":
            italic = true;
            break;
          case "underline":
            underline = true;
            break;
          case "strikethrough":
            strikethrough = true;
            break;
        }
      }
    }
    return new TokenStyle2(foregroundColor, bold, underline, strikethrough, italic);
  }
  TokenStyle2.fromSettings = fromSettings;
})(TokenStyle || (TokenStyle = {}));
var SemanticTokenRule;
((SemanticTokenRule2) => {
  function fromJSONObject(registry, o) {
    if (o && typeof o._selector === "string" && o._style) {
      const style = TokenStyle.fromJSONObject(o._style);
      if (style) {
        try {
          return { selector: registry.parseTokenSelector(o._selector), style };
        } catch (_ignore) {
        }
      }
    }
    return void 0;
  }
  SemanticTokenRule2.fromJSONObject = fromJSONObject;
  function toJSONObject(rule) {
    return {
      _selector: rule.selector.id,
      _style: TokenStyle.toJSONObject(rule.style)
    };
  }
  SemanticTokenRule2.toJSONObject = toJSONObject;
  function equals(r1, r2) {
    if (r1 === r2) {
      return true;
    }
    return r1 !== void 0 && r2 !== void 0 && r1.selector && r2.selector && r1.selector.id === r2.selector.id && TokenStyle.equals(r1.style, r2.style);
  }
  SemanticTokenRule2.equals = equals;
  function is(r) {
    return r && r.selector && typeof r.selector.id === "string" && TokenStyle.is(r.style);
  }
  SemanticTokenRule2.is = is;
})(SemanticTokenRule || (SemanticTokenRule = {}));
const Extensions = {
  TokenClassificationContribution: "base.contributions.tokenClassification"
};
class TokenClassificationRegistry extends Disposable {
  constructor() {
    super();
    this._onDidChangeSchema = this._register(new Emitter());
    this.onDidChangeSchema = this._onDidChangeSchema.event;
    this.currentTypeNumber = 0;
    this.currentModifierBit = 1;
    this.tokenStylingDefaultRules = [];
    this.tokenStylingSchema = {
      type: "object",
      properties: {},
      patternProperties: {
        [selectorPattern]: getStylingSchemeEntry()
      },
      //errorMessage: nls.localize('schema.token.errors', 'Valid token selectors have the form (*|tokenType)(.tokenModifier)*(:tokenLanguage)?.'),
      additionalProperties: false,
      definitions: {
        style: {
          type: "object",
          description: nls.localize("schema.token.settings", "Colors and styles for the token."),
          properties: {
            foreground: {
              type: "string",
              description: nls.localize("schema.token.foreground", "Foreground color for the token."),
              format: "color-hex",
              default: "#ff0000"
            },
            background: {
              type: "string",
              deprecationMessage: nls.localize("schema.token.background.warning", "Token background colors are currently not supported.")
            },
            fontStyle: {
              type: "string",
              description: nls.localize("schema.token.fontStyle", "Sets the all font styles of the rule: 'italic', 'bold', 'underline' or 'strikethrough' or a combination. All styles that are not listed are unset. The empty string unsets all styles."),
              pattern: fontStylePattern,
              patternErrorMessage: nls.localize("schema.fontStyle.error", "Font style must be 'italic', 'bold', 'underline' or 'strikethrough' or a combination. The empty string unsets all styles."),
              defaultSnippets: [
                { label: nls.localize("schema.token.fontStyle.none", "None (clear inherited style)"), bodyText: '""' },
                { body: "italic" },
                { body: "bold" },
                { body: "underline" },
                { body: "strikethrough" },
                { body: "italic bold" },
                { body: "italic underline" },
                { body: "italic strikethrough" },
                { body: "bold underline" },
                { body: "bold strikethrough" },
                { body: "underline strikethrough" },
                { body: "italic bold underline" },
                { body: "italic bold strikethrough" },
                { body: "italic underline strikethrough" },
                { body: "bold underline strikethrough" },
                { body: "italic bold underline strikethrough" }
              ]
            },
            bold: {
              type: "boolean",
              description: nls.localize("schema.token.bold", "Sets or unsets the font style to bold. Note, the presence of 'fontStyle' overrides this setting.")
            },
            italic: {
              type: "boolean",
              description: nls.localize("schema.token.italic", "Sets or unsets the font style to italic. Note, the presence of 'fontStyle' overrides this setting.")
            },
            underline: {
              type: "boolean",
              description: nls.localize("schema.token.underline", "Sets or unsets the font style to underline. Note, the presence of 'fontStyle' overrides this setting.")
            },
            strikethrough: {
              type: "boolean",
              description: nls.localize("schema.token.strikethrough", "Sets or unsets the font style to strikethrough. Note, the presence of 'fontStyle' overrides this setting.")
            }
          },
          defaultSnippets: [{ body: { foreground: "${1:#FF0000}", fontStyle: "${2:bold}" } }]
        }
      }
    };
    this.tokenTypeById = /* @__PURE__ */ Object.create(null);
    this.tokenModifierById = /* @__PURE__ */ Object.create(null);
    this.typeHierarchy = /* @__PURE__ */ Object.create(null);
  }
  registerTokenType(id, description, superType, deprecationMessage) {
    if (!id.match(typeAndModifierIdPattern)) {
      throw new Error("Invalid token type id.");
    }
    if (superType && !superType.match(typeAndModifierIdPattern)) {
      throw new Error("Invalid token super type id.");
    }
    const num = this.currentTypeNumber++;
    const tokenStyleContribution = { num, id, superType, description, deprecationMessage };
    this.tokenTypeById[id] = tokenStyleContribution;
    const stylingSchemeEntry = getStylingSchemeEntry(description, deprecationMessage);
    this.tokenStylingSchema.properties[id] = stylingSchemeEntry;
    this.typeHierarchy = /* @__PURE__ */ Object.create(null);
  }
  registerTokenModifier(id, description, deprecationMessage) {
    if (!id.match(typeAndModifierIdPattern)) {
      throw new Error("Invalid token modifier id.");
    }
    const num = this.currentModifierBit;
    this.currentModifierBit = this.currentModifierBit * 2;
    const tokenStyleContribution = { num, id, description, deprecationMessage };
    this.tokenModifierById[id] = tokenStyleContribution;
    this.tokenStylingSchema.properties[`*.${id}`] = getStylingSchemeEntry(description, deprecationMessage);
  }
  parseTokenSelector(selectorString, language) {
    const selector = parseClassifierString(selectorString, language);
    if (!selector.type) {
      return {
        match: () => -1,
        id: "$invalid"
      };
    }
    return {
      match: (type, modifiers, language2) => {
        let score = 0;
        if (selector.language !== void 0) {
          if (selector.language !== language2) {
            return -1;
          }
          score += 10;
        }
        if (selector.type !== TOKEN_TYPE_WILDCARD) {
          const hierarchy = this.getTypeHierarchy(type);
          const level = hierarchy.indexOf(selector.type);
          if (level === -1) {
            return -1;
          }
          score += 100 - level;
        }
        for (const selectorModifier of selector.modifiers) {
          if (modifiers.indexOf(selectorModifier) === -1) {
            return -1;
          }
        }
        return score + selector.modifiers.length * 100;
      },
      id: `${[selector.type, ...selector.modifiers.sort()].join(".")}${selector.language !== void 0 ? ":" + selector.language : ""}`
    };
  }
  registerTokenStyleDefault(selector, defaults) {
    this.tokenStylingDefaultRules.push({ selector, defaults });
  }
  deregisterTokenStyleDefault(selector) {
    const selectorString = selector.id;
    this.tokenStylingDefaultRules = this.tokenStylingDefaultRules.filter((r) => r.selector.id !== selectorString);
  }
  deregisterTokenType(id) {
    delete this.tokenTypeById[id];
    delete this.tokenStylingSchema.properties[id];
    this.typeHierarchy = /* @__PURE__ */ Object.create(null);
  }
  deregisterTokenModifier(id) {
    delete this.tokenModifierById[id];
    delete this.tokenStylingSchema.properties[`*.${id}`];
  }
  getTokenTypes() {
    return Object.keys(this.tokenTypeById).map((id) => this.tokenTypeById[id]);
  }
  getTokenModifiers() {
    return Object.keys(this.tokenModifierById).map((id) => this.tokenModifierById[id]);
  }
  getTokenStylingSchema() {
    return this.tokenStylingSchema;
  }
  getTokenStylingDefaultRules() {
    return this.tokenStylingDefaultRules;
  }
  getTypeHierarchy(typeId) {
    let hierarchy = this.typeHierarchy[typeId];
    if (!hierarchy) {
      this.typeHierarchy[typeId] = hierarchy = [typeId];
      let type = this.tokenTypeById[typeId];
      while (type && type.superType) {
        hierarchy.push(type.superType);
        type = this.tokenTypeById[type.superType];
      }
    }
    return hierarchy;
  }
  toString() {
    const sorter = (a, b) => {
      const cat1 = a.indexOf(".") === -1 ? 0 : 1;
      const cat2 = b.indexOf(".") === -1 ? 0 : 1;
      if (cat1 !== cat2) {
        return cat1 - cat2;
      }
      return a.localeCompare(b);
    };
    return Object.keys(this.tokenTypeById).sort(sorter).map((k) => `- \`${k}\`: ${this.tokenTypeById[k].description}`).join("\n");
  }
}
const CHAR_LANGUAGE = TOKEN_CLASSIFIER_LANGUAGE_SEPARATOR.charCodeAt(0);
const CHAR_MODIFIER = CLASSIFIER_MODIFIER_SEPARATOR.charCodeAt(0);
function parseClassifierString(s, defaultLanguage) {
  let k = s.length;
  let language = defaultLanguage;
  const modifiers = [];
  for (let i = k - 1; i >= 0; i--) {
    const ch = s.charCodeAt(i);
    if (ch === CHAR_LANGUAGE || ch === CHAR_MODIFIER) {
      const segment = s.substring(i + 1, k);
      k = i;
      if (ch === CHAR_LANGUAGE) {
        language = segment;
      } else {
        modifiers.push(segment);
      }
    }
  }
  const type = s.substring(0, k);
  return { type, modifiers, language };
}
const tokenClassificationRegistry = createDefaultTokenClassificationRegistry();
platform.Registry.add(Extensions.TokenClassificationContribution, tokenClassificationRegistry);
function createDefaultTokenClassificationRegistry() {
  const registry = new TokenClassificationRegistry();
  function registerTokenType(id, description, scopesToProbe = [], superType, deprecationMessage) {
    registry.registerTokenType(id, description, superType, deprecationMessage);
    if (scopesToProbe) {
      registerTokenStyleDefault(id, scopesToProbe);
    }
    return id;
  }
  function registerTokenStyleDefault(selectorString, scopesToProbe) {
    try {
      const selector = registry.parseTokenSelector(selectorString);
      registry.registerTokenStyleDefault(selector, { scopesToProbe });
    } catch (e) {
      console.log(e);
    }
  }
  registerTokenType("comment", nls.localize("comment", "Style for comments."), [["comment"]]);
  registerTokenType("string", nls.localize("string", "Style for strings."), [["string"]]);
  registerTokenType("keyword", nls.localize("keyword", "Style for keywords."), [["keyword.control"]]);
  registerTokenType("number", nls.localize("number", "Style for numbers."), [["constant.numeric"]]);
  registerTokenType("regexp", nls.localize("regexp", "Style for expressions."), [["constant.regexp"]]);
  registerTokenType("operator", nls.localize("operator", "Style for operators."), [["keyword.operator"]]);
  registerTokenType("namespace", nls.localize("namespace", "Style for namespaces."), [["entity.name.namespace"]]);
  registerTokenType("type", nls.localize("type", "Style for types."), [["entity.name.type"], ["support.type"]]);
  registerTokenType("struct", nls.localize("struct", "Style for structs."), [["entity.name.type.struct"]]);
  registerTokenType("class", nls.localize("class", "Style for classes."), [["entity.name.type.class"], ["support.class"]]);
  registerTokenType("interface", nls.localize("interface", "Style for interfaces."), [["entity.name.type.interface"]]);
  registerTokenType("enum", nls.localize("enum", "Style for enums."), [["entity.name.type.enum"]]);
  registerTokenType("typeParameter", nls.localize("typeParameter", "Style for type parameters."), [["entity.name.type.parameter"]]);
  registerTokenType("function", nls.localize("function", "Style for functions"), [["entity.name.function"], ["support.function"]]);
  registerTokenType("member", nls.localize("member", "Style for member functions"), [], "method", "Deprecated use `method` instead");
  registerTokenType("method", nls.localize("method", "Style for method (member functions)"), [["entity.name.function.member"], ["support.function"]]);
  registerTokenType("macro", nls.localize("macro", "Style for macros."), [["entity.name.function.preprocessor"]]);
  registerTokenType("variable", nls.localize("variable", "Style for variables."), [["variable.other.readwrite"], ["entity.name.variable"]]);
  registerTokenType("parameter", nls.localize("parameter", "Style for parameters."), [["variable.parameter"]]);
  registerTokenType("property", nls.localize("property", "Style for properties."), [["variable.other.property"]]);
  registerTokenType("enumMember", nls.localize("enumMember", "Style for enum members."), [["variable.other.enummember"]]);
  registerTokenType("event", nls.localize("event", "Style for events."), [["variable.other.event"]]);
  registerTokenType("decorator", nls.localize("decorator", "Style for decorators & annotations."), [["entity.name.decorator"], ["entity.name.function"]]);
  registerTokenType("label", nls.localize("labels", "Style for labels. "), void 0);
  registry.registerTokenModifier("declaration", nls.localize("declaration", "Style for all symbol declarations."), void 0);
  registry.registerTokenModifier("documentation", nls.localize("documentation", "Style to use for references in documentation."), void 0);
  registry.registerTokenModifier("static", nls.localize("static", "Style to use for symbols that are static."), void 0);
  registry.registerTokenModifier("abstract", nls.localize("abstract", "Style to use for symbols that are abstract."), void 0);
  registry.registerTokenModifier("deprecated", nls.localize("deprecated", "Style to use for symbols that are deprecated."), void 0);
  registry.registerTokenModifier("modification", nls.localize("modification", "Style to use for write accesses."), void 0);
  registry.registerTokenModifier("async", nls.localize("async", "Style to use for symbols that are async."), void 0);
  registry.registerTokenModifier("readonly", nls.localize("readonly", "Style to use for symbols that are read-only."), void 0);
  registerTokenStyleDefault("variable.readonly", [["variable.other.constant"]]);
  registerTokenStyleDefault("property.readonly", [["variable.other.constant.property"]]);
  registerTokenStyleDefault("type.defaultLibrary", [["support.type"]]);
  registerTokenStyleDefault("class.defaultLibrary", [["support.class"]]);
  registerTokenStyleDefault("interface.defaultLibrary", [["support.class"]]);
  registerTokenStyleDefault("variable.defaultLibrary", [["support.variable"], ["support.other.variable"]]);
  registerTokenStyleDefault("variable.defaultLibrary.readonly", [["support.constant"]]);
  registerTokenStyleDefault("property.defaultLibrary", [["support.variable.property"]]);
  registerTokenStyleDefault("property.defaultLibrary.readonly", [["support.constant.property"]]);
  registerTokenStyleDefault("function.defaultLibrary", [["support.function"]]);
  registerTokenStyleDefault("member.defaultLibrary", [["support.function"]]);
  return registry;
}
function getTokenClassificationRegistry() {
  return tokenClassificationRegistry;
}
function getStylingSchemeEntry(description, deprecationMessage) {
  return {
    description,
    deprecationMessage,
    defaultSnippets: [{ body: "${1:#ff0000}" }],
    anyOf: [
      {
        type: "string",
        format: "color-hex"
      },
      {
        $ref: "#/definitions/style"
      }
    ]
  };
}
const tokenStylingSchemaId = "vscode://schemas/token-styling";
const schemaRegistry = platform.Registry.as(JSONExtensions.JSONContribution);
schemaRegistry.registerSchema(tokenStylingSchemaId, tokenClassificationRegistry.getTokenStylingSchema());
const delayer = new RunOnceScheduler(() => schemaRegistry.notifySchemaChanged(tokenStylingSchemaId), 200);
tokenClassificationRegistry.onDidChangeSchema(() => {
  if (!delayer.isScheduled()) {
    delayer.schedule();
  }
});
export {
  SemanticTokenRule,
  TokenStyle,
  getTokenClassificationRegistry,
  parseClassifierString,
  tokenStylingSchemaId,
  typeAndModifierIdPattern
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90b2tlbkNsYXNzaWZpY2F0aW9uUmVnaXN0cnkudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ29sb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xvci5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElKU09OU2NoZW1hLCBJSlNPTlNjaGVtYU1hcCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25TY2hlbWEuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMgYXMgSlNPTkV4dGVuc2lvbnMsIElKU09OQ29udHJpYnV0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi9qc29uc2NoZW1hcy9jb21tb24vanNvbkNvbnRyaWJ1dGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCAqIGFzIHBsYXRmb3JtIGZyb20gJy4uLy4uL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJQ29sb3JUaGVtZSB9IGZyb20gJy4vdGhlbWVTZXJ2aWNlLmpzJztcblxuY29uc3QgVE9LRU5fVFlQRV9XSUxEQ0FSRCA9ICcqJztcbmNvbnN0IFRPS0VOX0NMQVNTSUZJRVJfTEFOR1VBR0VfU0VQQVJBVE9SID0gJzonO1xuY29uc3QgQ0xBU1NJRklFUl9NT0RJRklFUl9TRVBBUkFUT1IgPSAnLic7XG5cbi8vIHF1YWxpZmllZCBzdHJpbmcgW3R5cGV8Kl0oLm1vZGlmaWVyKSooL2xhbmd1YWdlKSFcbnR5cGUgVG9rZW5DbGFzc2lmaWNhdGlvblN0cmluZyA9IHN0cmluZztcblxuY29uc3QgaWRQYXR0ZXJuID0gJ1xcXFx3K1stX1xcXFx3K10qJztcbmV4cG9ydCBjb25zdCB0eXBlQW5kTW9kaWZpZXJJZFBhdHRlcm4gPSBgXiR7aWRQYXR0ZXJufSRgO1xuXG5jb25zdCBzZWxlY3RvclBhdHRlcm4gPSBgXigke2lkUGF0dGVybn18XFxcXCopKFxcXFwke0NMQVNTSUZJRVJfTU9ESUZJRVJfU0VQQVJBVE9SfSR7aWRQYXR0ZXJufSkqKCR7VE9LRU5fQ0xBU1NJRklFUl9MQU5HVUFHRV9TRVBBUkFUT1J9JHtpZFBhdHRlcm59KT8kYDtcblxuY29uc3QgZm9udFN0eWxlUGF0dGVybiA9ICdeKFxcXFxzKihpdGFsaWN8Ym9sZHx1bmRlcmxpbmV8c3RyaWtldGhyb3VnaCkpKlxcXFxzKiQnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFRva2VuU2VsZWN0b3Ige1xuXHRtYXRjaCh0eXBlOiBzdHJpbmcsIG1vZGlmaWVyczogc3RyaW5nW10sIGxhbmd1YWdlOiBzdHJpbmcpOiBudW1iZXI7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVG9rZW5UeXBlT3JNb2RpZmllckNvbnRyaWJ1dGlvbiB7XG5cdHJlYWRvbmx5IG51bTogbnVtYmVyO1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSBzdXBlclR5cGU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRlc2NyaXB0aW9uOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRlcHJlY2F0aW9uTWVzc2FnZT86IHN0cmluZztcbn1cblxuXG5leHBvcnQgaW50ZXJmYWNlIFRva2VuU3R5bGVEYXRhIHtcblx0Zm9yZWdyb3VuZDogQ29sb3IgfCB1bmRlZmluZWQ7XG5cdGJvbGQ6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdHVuZGVybGluZTogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0c3RyaWtldGhyb3VnaDogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0aXRhbGljOiBib29sZWFuIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgY2xhc3MgVG9rZW5TdHlsZSBpbXBsZW1lbnRzIFJlYWRvbmx5PFRva2VuU3R5bGVEYXRhPiB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBmb3JlZ3JvdW5kOiBDb2xvciB8IHVuZGVmaW5lZCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgYm9sZDogYm9vbGVhbiB8IHVuZGVmaW5lZCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgdW5kZXJsaW5lOiBib29sZWFuIHwgdW5kZWZpbmVkLFxuXHRcdHB1YmxpYyByZWFkb25seSBzdHJpa2V0aHJvdWdoOiBib29sZWFuIHwgdW5kZWZpbmVkLFxuXHRcdHB1YmxpYyByZWFkb25seSBpdGFsaWM6IGJvb2xlYW4gfCB1bmRlZmluZWQsXG5cdCkge1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgVG9rZW5TdHlsZSB7XG5cdGV4cG9ydCBmdW5jdGlvbiB0b0pTT05PYmplY3Qoc3R5bGU6IFRva2VuU3R5bGUpOiBhbnkge1xuXHRcdHJldHVybiB7XG5cdFx0XHRfZm9yZWdyb3VuZDogc3R5bGUuZm9yZWdyb3VuZCA9PT0gdW5kZWZpbmVkID8gbnVsbCA6IENvbG9yLkZvcm1hdC5DU1MuZm9ybWF0SGV4QShzdHlsZS5mb3JlZ3JvdW5kLCB0cnVlKSxcblx0XHRcdF9ib2xkOiBzdHlsZS5ib2xkID09PSB1bmRlZmluZWQgPyBudWxsIDogc3R5bGUuYm9sZCxcblx0XHRcdF91bmRlcmxpbmU6IHN0eWxlLnVuZGVybGluZSA9PT0gdW5kZWZpbmVkID8gbnVsbCA6IHN0eWxlLnVuZGVybGluZSxcblx0XHRcdF9pdGFsaWM6IHN0eWxlLml0YWxpYyA9PT0gdW5kZWZpbmVkID8gbnVsbCA6IHN0eWxlLml0YWxpYyxcblx0XHRcdF9zdHJpa2V0aHJvdWdoOiBzdHlsZS5zdHJpa2V0aHJvdWdoID09PSB1bmRlZmluZWQgPyBudWxsIDogc3R5bGUuc3RyaWtldGhyb3VnaCxcblx0XHR9O1xuXHR9XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tSlNPTk9iamVjdChvYmo6IGFueSk6IFRva2VuU3R5bGUgfCB1bmRlZmluZWQge1xuXHRcdGlmIChvYmopIHtcblx0XHRcdGNvbnN0IGJvb2xPclVuZGVmID0gKGI6IGFueSkgPT4gKHR5cGVvZiBiID09PSAnYm9vbGVhbicpID8gYiA6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IGNvbG9yT3JVbmRlZiA9IChzOiBhbnkpID0+ICh0eXBlb2YgcyA9PT0gJ3N0cmluZycpID8gQ29sb3IuZnJvbUhleChzKSA6IHVuZGVmaW5lZDtcblx0XHRcdHJldHVybiBuZXcgVG9rZW5TdHlsZShcblx0XHRcdFx0Y29sb3JPclVuZGVmKG9iai5fZm9yZWdyb3VuZCksXG5cdFx0XHRcdGJvb2xPclVuZGVmKG9iai5fYm9sZCksXG5cdFx0XHRcdGJvb2xPclVuZGVmKG9iai5fdW5kZXJsaW5lKSxcblx0XHRcdFx0Ym9vbE9yVW5kZWYob2JqLl9zdHJpa2V0aHJvdWdoKSxcblx0XHRcdFx0Ym9vbE9yVW5kZWYob2JqLl9pdGFsaWMpXG5cdFx0XHQpO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGV4cG9ydCBmdW5jdGlvbiBlcXVhbHMoczE6IGFueSwgczI6IGFueSk6IGJvb2xlYW4ge1xuXHRcdGlmIChzMSA9PT0gczIpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gczEgIT09IHVuZGVmaW5lZCAmJiBzMiAhPT0gdW5kZWZpbmVkXG5cdFx0XHQmJiAoczEuZm9yZWdyb3VuZCBpbnN0YW5jZW9mIENvbG9yID8gczEuZm9yZWdyb3VuZC5lcXVhbHMoczIuZm9yZWdyb3VuZCkgOiBzMi5mb3JlZ3JvdW5kID09PSB1bmRlZmluZWQpXG5cdFx0XHQmJiBzMS5ib2xkID09PSBzMi5ib2xkXG5cdFx0XHQmJiBzMS51bmRlcmxpbmUgPT09IHMyLnVuZGVybGluZVxuXHRcdFx0JiYgczEuc3RyaWtldGhyb3VnaCA9PT0gczIuc3RyaWtldGhyb3VnaFxuXHRcdFx0JiYgczEuaXRhbGljID09PSBzMi5pdGFsaWM7XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIGlzKHM6IGFueSk6IHMgaXMgVG9rZW5TdHlsZSB7XG5cdFx0cmV0dXJuIHMgaW5zdGFuY2VvZiBUb2tlblN0eWxlO1xuXHR9XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tRGF0YShkYXRhOiB7IGZvcmVncm91bmQ6IENvbG9yIHwgdW5kZWZpbmVkOyBib2xkOiBib29sZWFuIHwgdW5kZWZpbmVkOyB1bmRlcmxpbmU6IGJvb2xlYW4gfCB1bmRlZmluZWQ7IHN0cmlrZXRocm91Z2g6IGJvb2xlYW4gfCB1bmRlZmluZWQ7IGl0YWxpYzogYm9vbGVhbiB8IHVuZGVmaW5lZCB9KTogVG9rZW5TdHlsZSB7XG5cdFx0cmV0dXJuIG5ldyBUb2tlblN0eWxlKGRhdGEuZm9yZWdyb3VuZCwgZGF0YS5ib2xkLCBkYXRhLnVuZGVybGluZSwgZGF0YS5zdHJpa2V0aHJvdWdoLCBkYXRhLml0YWxpYyk7XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb21TZXR0aW5ncyhmb3JlZ3JvdW5kOiBzdHJpbmcgfCB1bmRlZmluZWQsIGZvbnRTdHlsZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogVG9rZW5TdHlsZTtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb21TZXR0aW5ncyhmb3JlZ3JvdW5kOiBzdHJpbmcgfCB1bmRlZmluZWQsIGZvbnRTdHlsZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBib2xkOiBib29sZWFuIHwgdW5kZWZpbmVkLCB1bmRlcmxpbmU6IGJvb2xlYW4gfCB1bmRlZmluZWQsIHN0cmlrZXRocm91Z2g6IGJvb2xlYW4gfCB1bmRlZmluZWQsIGl0YWxpYzogYm9vbGVhbiB8IHVuZGVmaW5lZCk6IFRva2VuU3R5bGU7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tU2V0dGluZ3MoZm9yZWdyb3VuZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBmb250U3R5bGU6IHN0cmluZyB8IHVuZGVmaW5lZCwgYm9sZD86IGJvb2xlYW4sIHVuZGVybGluZT86IGJvb2xlYW4sIHN0cmlrZXRocm91Z2g/OiBib29sZWFuLCBpdGFsaWM/OiBib29sZWFuKTogVG9rZW5TdHlsZSB7XG5cdFx0bGV0IGZvcmVncm91bmRDb2xvciA9IHVuZGVmaW5lZDtcblx0XHRpZiAoZm9yZWdyb3VuZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRmb3JlZ3JvdW5kQ29sb3IgPSBDb2xvci5mcm9tSGV4KGZvcmVncm91bmQpO1xuXHRcdH1cblx0XHRpZiAoZm9udFN0eWxlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGJvbGQgPSBpdGFsaWMgPSB1bmRlcmxpbmUgPSBzdHJpa2V0aHJvdWdoID0gZmFsc2U7XG5cdFx0XHRjb25zdCBleHByZXNzaW9uID0gL2l0YWxpY3xib2xkfHVuZGVybGluZXxzdHJpa2V0aHJvdWdoL2c7XG5cdFx0XHRsZXQgbWF0Y2g7XG5cdFx0XHR3aGlsZSAoKG1hdGNoID0gZXhwcmVzc2lvbi5leGVjKGZvbnRTdHlsZSkpKSB7XG5cdFx0XHRcdHN3aXRjaCAobWF0Y2hbMF0pIHtcblx0XHRcdFx0XHRjYXNlICdib2xkJzogYm9sZCA9IHRydWU7IGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ2l0YWxpYyc6IGl0YWxpYyA9IHRydWU7IGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ3VuZGVybGluZSc6IHVuZGVybGluZSA9IHRydWU7IGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ3N0cmlrZXRocm91Z2gnOiBzdHJpa2V0aHJvdWdoID0gdHJ1ZTsgYnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBUb2tlblN0eWxlKGZvcmVncm91bmRDb2xvciwgYm9sZCwgdW5kZXJsaW5lLCBzdHJpa2V0aHJvdWdoLCBpdGFsaWMpO1xuXHR9XG59XG5cbmV4cG9ydCB0eXBlIFByb2JlU2NvcGUgPSBzdHJpbmdbXTtcblxuZXhwb3J0IGludGVyZmFjZSBUb2tlblN0eWxlRnVuY3Rpb24ge1xuXHQodGhlbWU6IElDb2xvclRoZW1lKTogVG9rZW5TdHlsZSB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBUb2tlblN0eWxlRGVmYXVsdHMge1xuXHRzY29wZXNUb1Byb2JlPzogUHJvYmVTY29wZVtdO1xuXHRsaWdodD86IFRva2VuU3R5bGVWYWx1ZTtcblx0ZGFyaz86IFRva2VuU3R5bGVWYWx1ZTtcblx0aGNEYXJrPzogVG9rZW5TdHlsZVZhbHVlO1xuXHRoY0xpZ2h0PzogVG9rZW5TdHlsZVZhbHVlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNlbWFudGljVG9rZW5EZWZhdWx0UnVsZSB7XG5cdHNlbGVjdG9yOiBUb2tlblNlbGVjdG9yO1xuXHRkZWZhdWx0czogVG9rZW5TdHlsZURlZmF1bHRzO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNlbWFudGljVG9rZW5SdWxlIHtcblx0c3R5bGU6IFRva2VuU3R5bGU7XG5cdHNlbGVjdG9yOiBUb2tlblNlbGVjdG9yO1xufVxuXG5leHBvcnQgbmFtZXNwYWNlIFNlbWFudGljVG9rZW5SdWxlIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb21KU09OT2JqZWN0KHJlZ2lzdHJ5OiBJVG9rZW5DbGFzc2lmaWNhdGlvblJlZ2lzdHJ5LCBvOiBhbnkpOiBTZW1hbnRpY1Rva2VuUnVsZSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKG8gJiYgdHlwZW9mIG8uX3NlbGVjdG9yID09PSAnc3RyaW5nJyAmJiBvLl9zdHlsZSkge1xuXHRcdFx0Y29uc3Qgc3R5bGUgPSBUb2tlblN0eWxlLmZyb21KU09OT2JqZWN0KG8uX3N0eWxlKTtcblx0XHRcdGlmIChzdHlsZSkge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHJldHVybiB7IHNlbGVjdG9yOiByZWdpc3RyeS5wYXJzZVRva2VuU2VsZWN0b3Ioby5fc2VsZWN0b3IpLCBzdHlsZSB9O1xuXHRcdFx0XHR9IGNhdGNoIChfaWdub3JlKSB7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRleHBvcnQgZnVuY3Rpb24gdG9KU09OT2JqZWN0KHJ1bGU6IFNlbWFudGljVG9rZW5SdWxlKTogYW55IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0X3NlbGVjdG9yOiBydWxlLnNlbGVjdG9yLmlkLFxuXHRcdFx0X3N0eWxlOiBUb2tlblN0eWxlLnRvSlNPTk9iamVjdChydWxlLnN0eWxlKVxuXHRcdH07XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIGVxdWFscyhyMTogU2VtYW50aWNUb2tlblJ1bGUgfCB1bmRlZmluZWQsIHIyOiBTZW1hbnRpY1Rva2VuUnVsZSB8IHVuZGVmaW5lZCkge1xuXHRcdGlmIChyMSA9PT0gcjIpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gcjEgIT09IHVuZGVmaW5lZCAmJiByMiAhPT0gdW5kZWZpbmVkXG5cdFx0XHQmJiByMS5zZWxlY3RvciAmJiByMi5zZWxlY3RvciAmJiByMS5zZWxlY3Rvci5pZCA9PT0gcjIuc2VsZWN0b3IuaWRcblx0XHRcdCYmIFRva2VuU3R5bGUuZXF1YWxzKHIxLnN0eWxlLCByMi5zdHlsZSk7XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIGlzKHI6IGFueSk6IHIgaXMgU2VtYW50aWNUb2tlblJ1bGUge1xuXHRcdHJldHVybiByICYmIHIuc2VsZWN0b3IgJiYgdHlwZW9mIHIuc2VsZWN0b3IuaWQgPT09ICdzdHJpbmcnICYmIFRva2VuU3R5bGUuaXMoci5zdHlsZSk7XG5cdH1cbn1cblxuLyoqXG4gKiBBIFRva2VuU3R5bGUgVmFsdWUgaXMgZWl0aGVyIGEgdG9rZW4gc3R5bGUgbGl0ZXJhbCwgb3IgYSBUb2tlbkNsYXNzaWZpY2F0aW9uU3RyaW5nXG4gKi9cbmV4cG9ydCB0eXBlIFRva2VuU3R5bGVWYWx1ZSA9IFRva2VuU3R5bGUgfCBUb2tlbkNsYXNzaWZpY2F0aW9uU3RyaW5nO1xuXG4vLyBUb2tlblN0eWxlIHJlZ2lzdHJ5XG5jb25zdCBFeHRlbnNpb25zID0ge1xuXHRUb2tlbkNsYXNzaWZpY2F0aW9uQ29udHJpYnV0aW9uOiAnYmFzZS5jb250cmlidXRpb25zLnRva2VuQ2xhc3NpZmljYXRpb24nXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIElUb2tlbkNsYXNzaWZpY2F0aW9uUmVnaXN0cnkge1xuXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2NoZW1hOiBFdmVudDx2b2lkPjtcblxuXHQvKipcblx0ICogUmVnaXN0ZXIgYSB0b2tlbiB0eXBlIHRvIHRoZSByZWdpc3RyeS5cblx0ICogQHBhcmFtIGlkIFRoZSBUb2tlblR5cGUgaWQgYXMgdXNlZCBpbiB0aGVtZSBkZXNjcmlwdGlvbiBmaWxlc1xuXHQgKiBAcGFyYW0gZGVzY3JpcHRpb24gdGhlIGRlc2NyaXB0aW9uXG5cdCAqL1xuXHRyZWdpc3RlclRva2VuVHlwZShpZDogc3RyaW5nLCBkZXNjcmlwdGlvbjogc3RyaW5nLCBzdXBlclR5cGU/OiBzdHJpbmcsIGRlcHJlY2F0aW9uTWVzc2FnZT86IHN0cmluZyk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIFJlZ2lzdGVyIGEgdG9rZW4gbW9kaWZpZXIgdG8gdGhlIHJlZ2lzdHJ5LlxuXHQgKiBAcGFyYW0gaWQgVGhlIFRva2VuTW9kaWZpZXIgaWQgYXMgdXNlZCBpbiB0aGVtZSBkZXNjcmlwdGlvbiBmaWxlc1xuXHQgKiBAcGFyYW0gZGVzY3JpcHRpb24gdGhlIGRlc2NyaXB0aW9uXG5cdCAqL1xuXHRyZWdpc3RlclRva2VuTW9kaWZpZXIoaWQ6IHN0cmluZywgZGVzY3JpcHRpb246IHN0cmluZyk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIFBhcnNlcyBhIHRva2VuIHNlbGVjdG9yIGZyb20gYSBzZWxlY3RvciBzdHJpbmcuXG5cdCAqIEBwYXJhbSBzZWxlY3RvclN0cmluZyBzZWxlY3RvciBzdHJpbmcgaW4gdGhlIGZvcm0gKCp8dHlwZSkoLm1vZGlmaWVyKSpcblx0ICogQHBhcmFtIGxhbmd1YWdlIGxhbmd1YWdlIHRvIHdoaWNoIHRoZSBzZWxlY3RvciBhcHBsaWVzIG9yIHVuZGVmaW5lZCBpZiB0aGUgc2VsZWN0b3IgaXMgZm9yIGFsbCBsYW5ndWFmZVxuXHQgKiBAcmV0dXJucyB0aGUgcGFyc2VzZCBzZWxlY3RvclxuXHQgKiBAdGhyb3dzIGFuIGVycm9yIGlmIHRoZSBzdHJpbmcgaXMgbm90IGEgdmFsaWQgc2VsZWN0b3Jcblx0ICovXG5cdHBhcnNlVG9rZW5TZWxlY3RvcihzZWxlY3RvclN0cmluZzogc3RyaW5nLCBsYW5ndWFnZT86IHN0cmluZyk6IFRva2VuU2VsZWN0b3I7XG5cblx0LyoqXG5cdCAqIFJlZ2lzdGVyIGEgVG9rZW5TdHlsZSBkZWZhdWx0IHRvIHRoZSByZWdpc3RyeS5cblx0ICogQHBhcmFtIHNlbGVjdG9yIFRoZSBydWxlIHNlbGVjdG9yXG5cdCAqIEBwYXJhbSBkZWZhdWx0cyBUaGUgZGVmYXVsdCB2YWx1ZXNcblx0ICovXG5cdHJlZ2lzdGVyVG9rZW5TdHlsZURlZmF1bHQoc2VsZWN0b3I6IFRva2VuU2VsZWN0b3IsIGRlZmF1bHRzOiBUb2tlblN0eWxlRGVmYXVsdHMpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBEZXJlZ2lzdGVyIGEgVG9rZW5TdHlsZSBkZWZhdWx0IHRvIHRoZSByZWdpc3RyeS5cblx0ICogQHBhcmFtIHNlbGVjdG9yIFRoZSBydWxlIHNlbGVjdG9yXG5cdCAqL1xuXHRkZXJlZ2lzdGVyVG9rZW5TdHlsZURlZmF1bHQoc2VsZWN0b3I6IFRva2VuU2VsZWN0b3IpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBEZXJlZ2lzdGVyIGEgVG9rZW5UeXBlIGZyb20gdGhlIHJlZ2lzdHJ5LlxuXHQgKi9cblx0ZGVyZWdpc3RlclRva2VuVHlwZShpZDogc3RyaW5nKTogdm9pZDtcblxuXHQvKipcblx0ICogRGVyZWdpc3RlciBhIFRva2VuTW9kaWZpZXIgZnJvbSB0aGUgcmVnaXN0cnkuXG5cdCAqL1xuXHRkZXJlZ2lzdGVyVG9rZW5Nb2RpZmllcihpZDogc3RyaW5nKTogdm9pZDtcblxuXHQvKipcblx0ICogR2V0IGFsbCBUb2tlblR5cGUgY29udHJpYnV0aW9uc1xuXHQgKi9cblx0Z2V0VG9rZW5UeXBlcygpOiBUb2tlblR5cGVPck1vZGlmaWVyQ29udHJpYnV0aW9uW107XG5cblx0LyoqXG5cdCAqIEdldCBhbGwgVG9rZW5Nb2RpZmllciBjb250cmlidXRpb25zXG5cdCAqL1xuXHRnZXRUb2tlbk1vZGlmaWVycygpOiBUb2tlblR5cGVPck1vZGlmaWVyQ29udHJpYnV0aW9uW107XG5cblx0LyoqXG5cdCAqIFRoZSBzdHlsaW5nIHJ1bGVzIHRvIHVzZWQgd2hlbiBhIHNjaGVtYSBkb2VzIG5vdCBkZWZpbmUgYW55IHN0eWxpbmcgcnVsZXMuXG5cdCAqL1xuXHRnZXRUb2tlblN0eWxpbmdEZWZhdWx0UnVsZXMoKTogU2VtYW50aWNUb2tlbkRlZmF1bHRSdWxlW107XG5cblx0LyoqXG5cdCAqIEpTT04gc2NoZW1hIGZvciBhbiBvYmplY3QgdG8gYXNzaWduIHN0eWxpbmcgdG8gdG9rZW4gY2xhc3NpZmljYXRpb25zXG5cdCAqL1xuXHRnZXRUb2tlblN0eWxpbmdTY2hlbWEoKTogSUpTT05TY2hlbWE7XG59XG5cbmNsYXNzIFRva2VuQ2xhc3NpZmljYXRpb25SZWdpc3RyeSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVG9rZW5DbGFzc2lmaWNhdGlvblJlZ2lzdHJ5IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVNjaGVtYSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNjaGVtYTogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZVNjaGVtYS5ldmVudDtcblxuXHRwcml2YXRlIGN1cnJlbnRUeXBlTnVtYmVyID0gMDtcblx0cHJpdmF0ZSBjdXJyZW50TW9kaWZpZXJCaXQgPSAxO1xuXG5cdHByaXZhdGUgdG9rZW5UeXBlQnlJZDogeyBba2V5OiBzdHJpbmddOiBUb2tlblR5cGVPck1vZGlmaWVyQ29udHJpYnV0aW9uIH07XG5cdHByaXZhdGUgdG9rZW5Nb2RpZmllckJ5SWQ6IHsgW2tleTogc3RyaW5nXTogVG9rZW5UeXBlT3JNb2RpZmllckNvbnRyaWJ1dGlvbiB9O1xuXG5cdHByaXZhdGUgdG9rZW5TdHlsaW5nRGVmYXVsdFJ1bGVzOiBTZW1hbnRpY1Rva2VuRGVmYXVsdFJ1bGVbXSA9IFtdO1xuXG5cdHByaXZhdGUgdHlwZUhpZXJhcmNoeTogeyBbaWQ6IHN0cmluZ106IHN0cmluZ1tdIH07XG5cblx0cHJpdmF0ZSB0b2tlblN0eWxpbmdTY2hlbWE6IElKU09OU2NoZW1hICYgeyBwcm9wZXJ0aWVzOiBJSlNPTlNjaGVtYU1hcDsgcGF0dGVyblByb3BlcnRpZXM6IElKU09OU2NoZW1hTWFwIH0gPSB7XG5cdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0cHJvcGVydGllczoge30sXG5cdFx0cGF0dGVyblByb3BlcnRpZXM6IHtcblx0XHRcdFtzZWxlY3RvclBhdHRlcm5dOiBnZXRTdHlsaW5nU2NoZW1lRW50cnkoKVxuXHRcdH0sXG5cdFx0Ly9lcnJvck1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnc2NoZW1hLnRva2VuLmVycm9ycycsICdWYWxpZCB0b2tlbiBzZWxlY3RvcnMgaGF2ZSB0aGUgZm9ybSAoKnx0b2tlblR5cGUpKC50b2tlbk1vZGlmaWVyKSooOnRva2VuTGFuZ3VhZ2UpPy4nKSxcblx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdFx0ZGVmaW5pdGlvbnM6IHtcblx0XHRcdHN0eWxlOiB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEudG9rZW4uc2V0dGluZ3MnLCAnQ29sb3JzIGFuZCBzdHlsZXMgZm9yIHRoZSB0b2tlbi4nKSxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdGZvcmVncm91bmQ6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLnRva2VuLmZvcmVncm91bmQnLCAnRm9yZWdyb3VuZCBjb2xvciBmb3IgdGhlIHRva2VuLicpLFxuXHRcdFx0XHRcdFx0Zm9ybWF0OiAnY29sb3ItaGV4Jyxcblx0XHRcdFx0XHRcdGRlZmF1bHQ6ICcjZmYwMDAwJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0YmFja2dyb3VuZDoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRkZXByZWNhdGlvbk1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnc2NoZW1hLnRva2VuLmJhY2tncm91bmQud2FybmluZycsICdUb2tlbiBiYWNrZ3JvdW5kIGNvbG9ycyBhcmUgY3VycmVudGx5IG5vdCBzdXBwb3J0ZWQuJylcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGZvbnRTdHlsZToge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEudG9rZW4uZm9udFN0eWxlJywgJ1NldHMgdGhlIGFsbCBmb250IHN0eWxlcyBvZiB0aGUgcnVsZTogXFwnaXRhbGljXFwnLCBcXCdib2xkXFwnLCBcXCd1bmRlcmxpbmVcXCcgb3IgXFwnc3RyaWtldGhyb3VnaFxcJyBvciBhIGNvbWJpbmF0aW9uLiBBbGwgc3R5bGVzIHRoYXQgYXJlIG5vdCBsaXN0ZWQgYXJlIHVuc2V0LiBUaGUgZW1wdHkgc3RyaW5nIHVuc2V0cyBhbGwgc3R5bGVzLicpLFxuXHRcdFx0XHRcdFx0cGF0dGVybjogZm9udFN0eWxlUGF0dGVybixcblx0XHRcdFx0XHRcdHBhdHRlcm5FcnJvck1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmZvbnRTdHlsZS5lcnJvcicsICdGb250IHN0eWxlIG11c3QgYmUgXFwnaXRhbGljXFwnLCBcXCdib2xkXFwnLCBcXCd1bmRlcmxpbmVcXCcgb3IgXFwnc3RyaWtldGhyb3VnaFxcJyBvciBhIGNvbWJpbmF0aW9uLiBUaGUgZW1wdHkgc3RyaW5nIHVuc2V0cyBhbGwgc3R5bGVzLicpLFxuXHRcdFx0XHRcdFx0ZGVmYXVsdFNuaXBwZXRzOiBbXG5cdFx0XHRcdFx0XHRcdHsgbGFiZWw6IG5scy5sb2NhbGl6ZSgnc2NoZW1hLnRva2VuLmZvbnRTdHlsZS5ub25lJywgJ05vbmUgKGNsZWFyIGluaGVyaXRlZCBzdHlsZSknKSwgYm9keVRleHQ6ICdcIlwiJyB9LFxuXHRcdFx0XHRcdFx0XHR7IGJvZHk6ICdpdGFsaWMnIH0sXG5cdFx0XHRcdFx0XHRcdHsgYm9keTogJ2JvbGQnIH0sXG5cdFx0XHRcdFx0XHRcdHsgYm9keTogJ3VuZGVybGluZScgfSxcblx0XHRcdFx0XHRcdFx0eyBib2R5OiAnc3RyaWtldGhyb3VnaCcgfSxcblx0XHRcdFx0XHRcdFx0eyBib2R5OiAnaXRhbGljIGJvbGQnIH0sXG5cdFx0XHRcdFx0XHRcdHsgYm9keTogJ2l0YWxpYyB1bmRlcmxpbmUnIH0sXG5cdFx0XHRcdFx0XHRcdHsgYm9keTogJ2l0YWxpYyBzdHJpa2V0aHJvdWdoJyB9LFxuXHRcdFx0XHRcdFx0XHR7IGJvZHk6ICdib2xkIHVuZGVybGluZScgfSxcblx0XHRcdFx0XHRcdFx0eyBib2R5OiAnYm9sZCBzdHJpa2V0aHJvdWdoJyB9LFxuXHRcdFx0XHRcdFx0XHR7IGJvZHk6ICd1bmRlcmxpbmUgc3RyaWtldGhyb3VnaCcgfSxcblx0XHRcdFx0XHRcdFx0eyBib2R5OiAnaXRhbGljIGJvbGQgdW5kZXJsaW5lJyB9LFxuXHRcdFx0XHRcdFx0XHR7IGJvZHk6ICdpdGFsaWMgYm9sZCBzdHJpa2V0aHJvdWdoJyB9LFxuXHRcdFx0XHRcdFx0XHR7IGJvZHk6ICdpdGFsaWMgdW5kZXJsaW5lIHN0cmlrZXRocm91Z2gnIH0sXG5cdFx0XHRcdFx0XHRcdHsgYm9keTogJ2JvbGQgdW5kZXJsaW5lIHN0cmlrZXRocm91Z2gnIH0sXG5cdFx0XHRcdFx0XHRcdHsgYm9keTogJ2l0YWxpYyBib2xkIHVuZGVybGluZSBzdHJpa2V0aHJvdWdoJyB9XG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRib2xkOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEudG9rZW4uYm9sZCcsICdTZXRzIG9yIHVuc2V0cyB0aGUgZm9udCBzdHlsZSB0byBib2xkLiBOb3RlLCB0aGUgcHJlc2VuY2Ugb2YgXFwnZm9udFN0eWxlXFwnIG92ZXJyaWRlcyB0aGlzIHNldHRpbmcuJyksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRpdGFsaWM6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS50b2tlbi5pdGFsaWMnLCAnU2V0cyBvciB1bnNldHMgdGhlIGZvbnQgc3R5bGUgdG8gaXRhbGljLiBOb3RlLCB0aGUgcHJlc2VuY2Ugb2YgXFwnZm9udFN0eWxlXFwnIG92ZXJyaWRlcyB0aGlzIHNldHRpbmcuJyksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR1bmRlcmxpbmU6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS50b2tlbi51bmRlcmxpbmUnLCAnU2V0cyBvciB1bnNldHMgdGhlIGZvbnQgc3R5bGUgdG8gdW5kZXJsaW5lLiBOb3RlLCB0aGUgcHJlc2VuY2Ugb2YgXFwnZm9udFN0eWxlXFwnIG92ZXJyaWRlcyB0aGlzIHNldHRpbmcuJyksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRzdHJpa2V0aHJvdWdoOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEudG9rZW4uc3RyaWtldGhyb3VnaCcsICdTZXRzIG9yIHVuc2V0cyB0aGUgZm9udCBzdHlsZSB0byBzdHJpa2V0aHJvdWdoLiBOb3RlLCB0aGUgcHJlc2VuY2Ugb2YgXFwnZm9udFN0eWxlXFwnIG92ZXJyaWRlcyB0aGlzIHNldHRpbmcuJyksXG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGRlZmF1bHRTbmlwcGV0czogW3sgYm9keTogeyBmb3JlZ3JvdW5kOiAnJHsxOiNGRjAwMDB9JywgZm9udFN0eWxlOiAnJHsyOmJvbGR9JyB9IH1dXG5cdFx0XHR9XG5cdFx0fVxuXHR9O1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy50b2tlblR5cGVCeUlkID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHR0aGlzLnRva2VuTW9kaWZpZXJCeUlkID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHR0aGlzLnR5cGVIaWVyYXJjaHkgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHR9XG5cblx0cHVibGljIHJlZ2lzdGVyVG9rZW5UeXBlKGlkOiBzdHJpbmcsIGRlc2NyaXB0aW9uOiBzdHJpbmcsIHN1cGVyVHlwZT86IHN0cmluZywgZGVwcmVjYXRpb25NZXNzYWdlPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKCFpZC5tYXRjaCh0eXBlQW5kTW9kaWZpZXJJZFBhdHRlcm4pKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgdG9rZW4gdHlwZSBpZC4nKTtcblx0XHR9XG5cdFx0aWYgKHN1cGVyVHlwZSAmJiAhc3VwZXJUeXBlLm1hdGNoKHR5cGVBbmRNb2RpZmllcklkUGF0dGVybikpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCB0b2tlbiBzdXBlciB0eXBlIGlkLicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG51bSA9IHRoaXMuY3VycmVudFR5cGVOdW1iZXIrKztcblx0XHRjb25zdCB0b2tlblN0eWxlQ29udHJpYnV0aW9uOiBUb2tlblR5cGVPck1vZGlmaWVyQ29udHJpYnV0aW9uID0geyBudW0sIGlkLCBzdXBlclR5cGUsIGRlc2NyaXB0aW9uLCBkZXByZWNhdGlvbk1lc3NhZ2UgfTtcblx0XHR0aGlzLnRva2VuVHlwZUJ5SWRbaWRdID0gdG9rZW5TdHlsZUNvbnRyaWJ1dGlvbjtcblxuXHRcdGNvbnN0IHN0eWxpbmdTY2hlbWVFbnRyeSA9IGdldFN0eWxpbmdTY2hlbWVFbnRyeShkZXNjcmlwdGlvbiwgZGVwcmVjYXRpb25NZXNzYWdlKTtcblx0XHR0aGlzLnRva2VuU3R5bGluZ1NjaGVtYS5wcm9wZXJ0aWVzW2lkXSA9IHN0eWxpbmdTY2hlbWVFbnRyeTtcblx0XHR0aGlzLnR5cGVIaWVyYXJjaHkgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHR9XG5cblx0cHVibGljIHJlZ2lzdGVyVG9rZW5Nb2RpZmllcihpZDogc3RyaW5nLCBkZXNjcmlwdGlvbjogc3RyaW5nLCBkZXByZWNhdGlvbk1lc3NhZ2U/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAoIWlkLm1hdGNoKHR5cGVBbmRNb2RpZmllcklkUGF0dGVybikpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCB0b2tlbiBtb2RpZmllciBpZC4nKTtcblx0XHR9XG5cblx0XHRjb25zdCBudW0gPSB0aGlzLmN1cnJlbnRNb2RpZmllckJpdDtcblx0XHR0aGlzLmN1cnJlbnRNb2RpZmllckJpdCA9IHRoaXMuY3VycmVudE1vZGlmaWVyQml0ICogMjtcblx0XHRjb25zdCB0b2tlblN0eWxlQ29udHJpYnV0aW9uOiBUb2tlblR5cGVPck1vZGlmaWVyQ29udHJpYnV0aW9uID0geyBudW0sIGlkLCBkZXNjcmlwdGlvbiwgZGVwcmVjYXRpb25NZXNzYWdlIH07XG5cdFx0dGhpcy50b2tlbk1vZGlmaWVyQnlJZFtpZF0gPSB0b2tlblN0eWxlQ29udHJpYnV0aW9uO1xuXG5cdFx0dGhpcy50b2tlblN0eWxpbmdTY2hlbWEucHJvcGVydGllc1tgKi4ke2lkfWBdID0gZ2V0U3R5bGluZ1NjaGVtZUVudHJ5KGRlc2NyaXB0aW9uLCBkZXByZWNhdGlvbk1lc3NhZ2UpO1xuXHR9XG5cblx0cHVibGljIHBhcnNlVG9rZW5TZWxlY3RvcihzZWxlY3RvclN0cmluZzogc3RyaW5nLCBsYW5ndWFnZT86IHN0cmluZyk6IFRva2VuU2VsZWN0b3Ige1xuXHRcdGNvbnN0IHNlbGVjdG9yID0gcGFyc2VDbGFzc2lmaWVyU3RyaW5nKHNlbGVjdG9yU3RyaW5nLCBsYW5ndWFnZSk7XG5cblx0XHRpZiAoIXNlbGVjdG9yLnR5cGUpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdG1hdGNoOiAoKSA9PiAtMSxcblx0XHRcdFx0aWQ6ICckaW52YWxpZCdcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdG1hdGNoOiAodHlwZTogc3RyaW5nLCBtb2RpZmllcnM6IHN0cmluZ1tdLCBsYW5ndWFnZTogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGxldCBzY29yZSA9IDA7XG5cdFx0XHRcdGlmIChzZWxlY3Rvci5sYW5ndWFnZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0aWYgKHNlbGVjdG9yLmxhbmd1YWdlICE9PSBsYW5ndWFnZSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIC0xO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRzY29yZSArPSAxMDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoc2VsZWN0b3IudHlwZSAhPT0gVE9LRU5fVFlQRV9XSUxEQ0FSRCkge1xuXHRcdFx0XHRcdGNvbnN0IGhpZXJhcmNoeSA9IHRoaXMuZ2V0VHlwZUhpZXJhcmNoeSh0eXBlKTtcblx0XHRcdFx0XHRjb25zdCBsZXZlbCA9IGhpZXJhcmNoeS5pbmRleE9mKHNlbGVjdG9yLnR5cGUpO1xuXHRcdFx0XHRcdGlmIChsZXZlbCA9PT0gLTEpIHtcblx0XHRcdFx0XHRcdHJldHVybiAtMTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0c2NvcmUgKz0gKDEwMCAtIGxldmVsKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBhbGwgc2VsZWN0b3IgbW9kaWZpZXJzIG11c3QgYmUgcHJlc2VudFxuXHRcdFx0XHRmb3IgKGNvbnN0IHNlbGVjdG9yTW9kaWZpZXIgb2Ygc2VsZWN0b3IubW9kaWZpZXJzKSB7XG5cdFx0XHRcdFx0aWYgKG1vZGlmaWVycy5pbmRleE9mKHNlbGVjdG9yTW9kaWZpZXIpID09PSAtMSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIC0xO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gc2NvcmUgKyBzZWxlY3Rvci5tb2RpZmllcnMubGVuZ3RoICogMTAwO1xuXHRcdFx0fSxcblx0XHRcdGlkOiBgJHtbc2VsZWN0b3IudHlwZSwgLi4uc2VsZWN0b3IubW9kaWZpZXJzLnNvcnQoKV0uam9pbignLicpfSR7c2VsZWN0b3IubGFuZ3VhZ2UgIT09IHVuZGVmaW5lZCA/ICc6JyArIHNlbGVjdG9yLmxhbmd1YWdlIDogJyd9YFxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgcmVnaXN0ZXJUb2tlblN0eWxlRGVmYXVsdChzZWxlY3RvcjogVG9rZW5TZWxlY3RvciwgZGVmYXVsdHM6IFRva2VuU3R5bGVEZWZhdWx0cyk6IHZvaWQge1xuXHRcdHRoaXMudG9rZW5TdHlsaW5nRGVmYXVsdFJ1bGVzLnB1c2goeyBzZWxlY3RvciwgZGVmYXVsdHMgfSk7XG5cdH1cblxuXHRwdWJsaWMgZGVyZWdpc3RlclRva2VuU3R5bGVEZWZhdWx0KHNlbGVjdG9yOiBUb2tlblNlbGVjdG9yKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2VsZWN0b3JTdHJpbmcgPSBzZWxlY3Rvci5pZDtcblx0XHR0aGlzLnRva2VuU3R5bGluZ0RlZmF1bHRSdWxlcyA9IHRoaXMudG9rZW5TdHlsaW5nRGVmYXVsdFJ1bGVzLmZpbHRlcihyID0+IHIuc2VsZWN0b3IuaWQgIT09IHNlbGVjdG9yU3RyaW5nKTtcblx0fVxuXG5cdHB1YmxpYyBkZXJlZ2lzdGVyVG9rZW5UeXBlKGlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRkZWxldGUgdGhpcy50b2tlblR5cGVCeUlkW2lkXTtcblx0XHRkZWxldGUgdGhpcy50b2tlblN0eWxpbmdTY2hlbWEucHJvcGVydGllc1tpZF07XG5cdFx0dGhpcy50eXBlSGllcmFyY2h5ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0fVxuXG5cdHB1YmxpYyBkZXJlZ2lzdGVyVG9rZW5Nb2RpZmllcihpZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0ZGVsZXRlIHRoaXMudG9rZW5Nb2RpZmllckJ5SWRbaWRdO1xuXHRcdGRlbGV0ZSB0aGlzLnRva2VuU3R5bGluZ1NjaGVtYS5wcm9wZXJ0aWVzW2AqLiR7aWR9YF07XG5cdH1cblxuXHRwdWJsaWMgZ2V0VG9rZW5UeXBlcygpOiBUb2tlblR5cGVPck1vZGlmaWVyQ29udHJpYnV0aW9uW10ge1xuXHRcdHJldHVybiBPYmplY3Qua2V5cyh0aGlzLnRva2VuVHlwZUJ5SWQpLm1hcChpZCA9PiB0aGlzLnRva2VuVHlwZUJ5SWRbaWRdKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRUb2tlbk1vZGlmaWVycygpOiBUb2tlblR5cGVPck1vZGlmaWVyQ29udHJpYnV0aW9uW10ge1xuXHRcdHJldHVybiBPYmplY3Qua2V5cyh0aGlzLnRva2VuTW9kaWZpZXJCeUlkKS5tYXAoaWQgPT4gdGhpcy50b2tlbk1vZGlmaWVyQnlJZFtpZF0pO1xuXHR9XG5cblx0cHVibGljIGdldFRva2VuU3R5bGluZ1NjaGVtYSgpOiBJSlNPTlNjaGVtYSB7XG5cdFx0cmV0dXJuIHRoaXMudG9rZW5TdHlsaW5nU2NoZW1hO1xuXHR9XG5cblx0cHVibGljIGdldFRva2VuU3R5bGluZ0RlZmF1bHRSdWxlcygpOiBTZW1hbnRpY1Rva2VuRGVmYXVsdFJ1bGVbXSB7XG5cdFx0cmV0dXJuIHRoaXMudG9rZW5TdHlsaW5nRGVmYXVsdFJ1bGVzO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRUeXBlSGllcmFyY2h5KHR5cGVJZDogc3RyaW5nKTogc3RyaW5nW10ge1xuXHRcdGxldCBoaWVyYXJjaHkgPSB0aGlzLnR5cGVIaWVyYXJjaHlbdHlwZUlkXTtcblx0XHRpZiAoIWhpZXJhcmNoeSkge1xuXHRcdFx0dGhpcy50eXBlSGllcmFyY2h5W3R5cGVJZF0gPSBoaWVyYXJjaHkgPSBbdHlwZUlkXTtcblx0XHRcdGxldCB0eXBlID0gdGhpcy50b2tlblR5cGVCeUlkW3R5cGVJZF07XG5cdFx0XHR3aGlsZSAodHlwZSAmJiB0eXBlLnN1cGVyVHlwZSkge1xuXHRcdFx0XHRoaWVyYXJjaHkucHVzaCh0eXBlLnN1cGVyVHlwZSk7XG5cdFx0XHRcdHR5cGUgPSB0aGlzLnRva2VuVHlwZUJ5SWRbdHlwZS5zdXBlclR5cGVdO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gaGllcmFyY2h5O1xuXHR9XG5cblxuXHRwdWJsaWMgb3ZlcnJpZGUgdG9TdHJpbmcoKSB7XG5cdFx0Y29uc3Qgc29ydGVyID0gKGE6IHN0cmluZywgYjogc3RyaW5nKSA9PiB7XG5cdFx0XHRjb25zdCBjYXQxID0gYS5pbmRleE9mKCcuJykgPT09IC0xID8gMCA6IDE7XG5cdFx0XHRjb25zdCBjYXQyID0gYi5pbmRleE9mKCcuJykgPT09IC0xID8gMCA6IDE7XG5cdFx0XHRpZiAoY2F0MSAhPT0gY2F0Mikge1xuXHRcdFx0XHRyZXR1cm4gY2F0MSAtIGNhdDI7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gYS5sb2NhbGVDb21wYXJlKGIpO1xuXHRcdH07XG5cblx0XHRyZXR1cm4gT2JqZWN0LmtleXModGhpcy50b2tlblR5cGVCeUlkKS5zb3J0KHNvcnRlcikubWFwKGsgPT4gYC0gXFxgJHtrfVxcYDogJHt0aGlzLnRva2VuVHlwZUJ5SWRba10uZGVzY3JpcHRpb259YCkuam9pbignXFxuJyk7XG5cdH1cblxufVxuXG5jb25zdCBDSEFSX0xBTkdVQUdFID0gVE9LRU5fQ0xBU1NJRklFUl9MQU5HVUFHRV9TRVBBUkFUT1IuY2hhckNvZGVBdCgwKTtcbmNvbnN0IENIQVJfTU9ESUZJRVIgPSBDTEFTU0lGSUVSX01PRElGSUVSX1NFUEFSQVRPUi5jaGFyQ29kZUF0KDApO1xuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VDbGFzc2lmaWVyU3RyaW5nKHM6IHN0cmluZywgZGVmYXVsdExhbmd1YWdlOiBzdHJpbmcpOiB7IHR5cGU6IHN0cmluZzsgbW9kaWZpZXJzOiBzdHJpbmdbXTsgbGFuZ3VhZ2U6IHN0cmluZyB9O1xuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlQ2xhc3NpZmllclN0cmluZyhzOiBzdHJpbmcsIGRlZmF1bHRMYW5ndWFnZT86IHN0cmluZyk6IHsgdHlwZTogc3RyaW5nOyBtb2RpZmllcnM6IHN0cmluZ1tdOyBsYW5ndWFnZTogc3RyaW5nIHwgdW5kZWZpbmVkIH07XG5leHBvcnQgZnVuY3Rpb24gcGFyc2VDbGFzc2lmaWVyU3RyaW5nKHM6IHN0cmluZywgZGVmYXVsdExhbmd1YWdlOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB7IHR5cGU6IHN0cmluZzsgbW9kaWZpZXJzOiBzdHJpbmdbXTsgbGFuZ3VhZ2U6IHN0cmluZyB8IHVuZGVmaW5lZCB9IHtcblx0bGV0IGsgPSBzLmxlbmd0aDtcblx0bGV0IGxhbmd1YWdlOiBzdHJpbmcgfCB1bmRlZmluZWQgPSBkZWZhdWx0TGFuZ3VhZ2U7XG5cdGNvbnN0IG1vZGlmaWVycyA9IFtdO1xuXG5cdGZvciAobGV0IGkgPSBrIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRjb25zdCBjaCA9IHMuY2hhckNvZGVBdChpKTtcblx0XHRpZiAoY2ggPT09IENIQVJfTEFOR1VBR0UgfHwgY2ggPT09IENIQVJfTU9ESUZJRVIpIHtcblx0XHRcdGNvbnN0IHNlZ21lbnQgPSBzLnN1YnN0cmluZyhpICsgMSwgayk7XG5cdFx0XHRrID0gaTtcblx0XHRcdGlmIChjaCA9PT0gQ0hBUl9MQU5HVUFHRSkge1xuXHRcdFx0XHRsYW5ndWFnZSA9IHNlZ21lbnQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRtb2RpZmllcnMucHVzaChzZWdtZW50KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0Y29uc3QgdHlwZSA9IHMuc3Vic3RyaW5nKDAsIGspO1xuXHRyZXR1cm4geyB0eXBlLCBtb2RpZmllcnMsIGxhbmd1YWdlIH07XG59XG5cblxuY29uc3QgdG9rZW5DbGFzc2lmaWNhdGlvblJlZ2lzdHJ5ID0gY3JlYXRlRGVmYXVsdFRva2VuQ2xhc3NpZmljYXRpb25SZWdpc3RyeSgpO1xucGxhdGZvcm0uUmVnaXN0cnkuYWRkKEV4dGVuc2lvbnMuVG9rZW5DbGFzc2lmaWNhdGlvbkNvbnRyaWJ1dGlvbiwgdG9rZW5DbGFzc2lmaWNhdGlvblJlZ2lzdHJ5KTtcblxuXG5mdW5jdGlvbiBjcmVhdGVEZWZhdWx0VG9rZW5DbGFzc2lmaWNhdGlvblJlZ2lzdHJ5KCk6IFRva2VuQ2xhc3NpZmljYXRpb25SZWdpc3RyeSB7XG5cblx0Y29uc3QgcmVnaXN0cnkgPSBuZXcgVG9rZW5DbGFzc2lmaWNhdGlvblJlZ2lzdHJ5KCk7XG5cblx0ZnVuY3Rpb24gcmVnaXN0ZXJUb2tlblR5cGUoaWQ6IHN0cmluZywgZGVzY3JpcHRpb246IHN0cmluZywgc2NvcGVzVG9Qcm9iZTogUHJvYmVTY29wZVtdID0gW10sIHN1cGVyVHlwZT86IHN0cmluZywgZGVwcmVjYXRpb25NZXNzYWdlPzogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZWdpc3RyeS5yZWdpc3RlclRva2VuVHlwZShpZCwgZGVzY3JpcHRpb24sIHN1cGVyVHlwZSwgZGVwcmVjYXRpb25NZXNzYWdlKTtcblx0XHRpZiAoc2NvcGVzVG9Qcm9iZSkge1xuXHRcdFx0cmVnaXN0ZXJUb2tlblN0eWxlRGVmYXVsdChpZCwgc2NvcGVzVG9Qcm9iZSk7XG5cdFx0fVxuXHRcdHJldHVybiBpZDtcblx0fVxuXG5cdGZ1bmN0aW9uIHJlZ2lzdGVyVG9rZW5TdHlsZURlZmF1bHQoc2VsZWN0b3JTdHJpbmc6IHN0cmluZywgc2NvcGVzVG9Qcm9iZTogUHJvYmVTY29wZVtdKSB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHNlbGVjdG9yID0gcmVnaXN0cnkucGFyc2VUb2tlblNlbGVjdG9yKHNlbGVjdG9yU3RyaW5nKTtcblx0XHRcdHJlZ2lzdHJ5LnJlZ2lzdGVyVG9rZW5TdHlsZURlZmF1bHQoc2VsZWN0b3IsIHsgc2NvcGVzVG9Qcm9iZSB9KTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRjb25zb2xlLmxvZyhlKTtcblx0XHR9XG5cdH1cblxuXHQvLyBkZWZhdWx0IHRva2VuIHR5cGVzXG5cblx0cmVnaXN0ZXJUb2tlblR5cGUoJ2NvbW1lbnQnLCBubHMubG9jYWxpemUoJ2NvbW1lbnQnLCBcIlN0eWxlIGZvciBjb21tZW50cy5cIiksIFtbJ2NvbW1lbnQnXV0pO1xuXHRyZWdpc3RlclRva2VuVHlwZSgnc3RyaW5nJywgbmxzLmxvY2FsaXplKCdzdHJpbmcnLCBcIlN0eWxlIGZvciBzdHJpbmdzLlwiKSwgW1snc3RyaW5nJ11dKTtcblx0cmVnaXN0ZXJUb2tlblR5cGUoJ2tleXdvcmQnLCBubHMubG9jYWxpemUoJ2tleXdvcmQnLCBcIlN0eWxlIGZvciBrZXl3b3Jkcy5cIiksIFtbJ2tleXdvcmQuY29udHJvbCddXSk7XG5cdHJlZ2lzdGVyVG9rZW5UeXBlKCdudW1iZXInLCBubHMubG9jYWxpemUoJ251bWJlcicsIFwiU3R5bGUgZm9yIG51bWJlcnMuXCIpLCBbWydjb25zdGFudC5udW1lcmljJ11dKTtcblx0cmVnaXN0ZXJUb2tlblR5cGUoJ3JlZ2V4cCcsIG5scy5sb2NhbGl6ZSgncmVnZXhwJywgXCJTdHlsZSBmb3IgZXhwcmVzc2lvbnMuXCIpLCBbWydjb25zdGFudC5yZWdleHAnXV0pO1xuXHRyZWdpc3RlclRva2VuVHlwZSgnb3BlcmF0b3InLCBubHMubG9jYWxpemUoJ29wZXJhdG9yJywgXCJTdHlsZSBmb3Igb3BlcmF0b3JzLlwiKSwgW1sna2V5d29yZC5vcGVyYXRvciddXSk7XG5cblx0cmVnaXN0ZXJUb2tlblR5cGUoJ25hbWVzcGFjZScsIG5scy5sb2NhbGl6ZSgnbmFtZXNwYWNlJywgXCJTdHlsZSBmb3IgbmFtZXNwYWNlcy5cIiksIFtbJ2VudGl0eS5uYW1lLm5hbWVzcGFjZSddXSk7XG5cblx0cmVnaXN0ZXJUb2tlblR5cGUoJ3R5cGUnLCBubHMubG9jYWxpemUoJ3R5cGUnLCBcIlN0eWxlIGZvciB0eXBlcy5cIiksIFtbJ2VudGl0eS5uYW1lLnR5cGUnXSwgWydzdXBwb3J0LnR5cGUnXV0pO1xuXHRyZWdpc3RlclRva2VuVHlwZSgnc3RydWN0JywgbmxzLmxvY2FsaXplKCdzdHJ1Y3QnLCBcIlN0eWxlIGZvciBzdHJ1Y3RzLlwiKSwgW1snZW50aXR5Lm5hbWUudHlwZS5zdHJ1Y3QnXV0pO1xuXHRyZWdpc3RlclRva2VuVHlwZSgnY2xhc3MnLCBubHMubG9jYWxpemUoJ2NsYXNzJywgXCJTdHlsZSBmb3IgY2xhc3Nlcy5cIiksIFtbJ2VudGl0eS5uYW1lLnR5cGUuY2xhc3MnXSwgWydzdXBwb3J0LmNsYXNzJ11dKTtcblx0cmVnaXN0ZXJUb2tlblR5cGUoJ2ludGVyZmFjZScsIG5scy5sb2NhbGl6ZSgnaW50ZXJmYWNlJywgXCJTdHlsZSBmb3IgaW50ZXJmYWNlcy5cIiksIFtbJ2VudGl0eS5uYW1lLnR5cGUuaW50ZXJmYWNlJ11dKTtcblx0cmVnaXN0ZXJUb2tlblR5cGUoJ2VudW0nLCBubHMubG9jYWxpemUoJ2VudW0nLCBcIlN0eWxlIGZvciBlbnVtcy5cIiksIFtbJ2VudGl0eS5uYW1lLnR5cGUuZW51bSddXSk7XG5cdHJlZ2lzdGVyVG9rZW5UeXBlKCd0eXBlUGFyYW1ldGVyJywgbmxzLmxvY2FsaXplKCd0eXBlUGFyYW1ldGVyJywgXCJTdHlsZSBmb3IgdHlwZSBwYXJhbWV0ZXJzLlwiKSwgW1snZW50aXR5Lm5hbWUudHlwZS5wYXJhbWV0ZXInXV0pO1xuXG5cdHJlZ2lzdGVyVG9rZW5UeXBlKCdmdW5jdGlvbicsIG5scy5sb2NhbGl6ZSgnZnVuY3Rpb24nLCBcIlN0eWxlIGZvciBmdW5jdGlvbnNcIiksIFtbJ2VudGl0eS5uYW1lLmZ1bmN0aW9uJ10sIFsnc3VwcG9ydC5mdW5jdGlvbiddXSk7XG5cdHJlZ2lzdGVyVG9rZW5UeXBlKCdtZW1iZXInLCBubHMubG9jYWxpemUoJ21lbWJlcicsIFwiU3R5bGUgZm9yIG1lbWJlciBmdW5jdGlvbnNcIiksIFtdLCAnbWV0aG9kJywgJ0RlcHJlY2F0ZWQgdXNlIGBtZXRob2RgIGluc3RlYWQnKTtcblx0cmVnaXN0ZXJUb2tlblR5cGUoJ21ldGhvZCcsIG5scy5sb2NhbGl6ZSgnbWV0aG9kJywgXCJTdHlsZSBmb3IgbWV0aG9kIChtZW1iZXIgZnVuY3Rpb25zKVwiKSwgW1snZW50aXR5Lm5hbWUuZnVuY3Rpb24ubWVtYmVyJ10sIFsnc3VwcG9ydC5mdW5jdGlvbiddXSk7XG5cdHJlZ2lzdGVyVG9rZW5UeXBlKCdtYWNybycsIG5scy5sb2NhbGl6ZSgnbWFjcm8nLCBcIlN0eWxlIGZvciBtYWNyb3MuXCIpLCBbWydlbnRpdHkubmFtZS5mdW5jdGlvbi5wcmVwcm9jZXNzb3InXV0pO1xuXG5cdHJlZ2lzdGVyVG9rZW5UeXBlKCd2YXJpYWJsZScsIG5scy5sb2NhbGl6ZSgndmFyaWFibGUnLCBcIlN0eWxlIGZvciB2YXJpYWJsZXMuXCIpLCBbWyd2YXJpYWJsZS5vdGhlci5yZWFkd3JpdGUnXSwgWydlbnRpdHkubmFtZS52YXJpYWJsZSddXSk7XG5cdHJlZ2lzdGVyVG9rZW5UeXBlKCdwYXJhbWV0ZXInLCBubHMubG9jYWxpemUoJ3BhcmFtZXRlcicsIFwiU3R5bGUgZm9yIHBhcmFtZXRlcnMuXCIpLCBbWyd2YXJpYWJsZS5wYXJhbWV0ZXInXV0pO1xuXHRyZWdpc3RlclRva2VuVHlwZSgncHJvcGVydHknLCBubHMubG9jYWxpemUoJ3Byb3BlcnR5JywgXCJTdHlsZSBmb3IgcHJvcGVydGllcy5cIiksIFtbJ3ZhcmlhYmxlLm90aGVyLnByb3BlcnR5J11dKTtcblx0cmVnaXN0ZXJUb2tlblR5cGUoJ2VudW1NZW1iZXInLCBubHMubG9jYWxpemUoJ2VudW1NZW1iZXInLCBcIlN0eWxlIGZvciBlbnVtIG1lbWJlcnMuXCIpLCBbWyd2YXJpYWJsZS5vdGhlci5lbnVtbWVtYmVyJ11dKTtcblx0cmVnaXN0ZXJUb2tlblR5cGUoJ2V2ZW50JywgbmxzLmxvY2FsaXplKCdldmVudCcsIFwiU3R5bGUgZm9yIGV2ZW50cy5cIiksIFtbJ3ZhcmlhYmxlLm90aGVyLmV2ZW50J11dKTtcblx0cmVnaXN0ZXJUb2tlblR5cGUoJ2RlY29yYXRvcicsIG5scy5sb2NhbGl6ZSgnZGVjb3JhdG9yJywgXCJTdHlsZSBmb3IgZGVjb3JhdG9ycyAmIGFubm90YXRpb25zLlwiKSwgW1snZW50aXR5Lm5hbWUuZGVjb3JhdG9yJ10sIFsnZW50aXR5Lm5hbWUuZnVuY3Rpb24nXV0pO1xuXG5cdHJlZ2lzdGVyVG9rZW5UeXBlKCdsYWJlbCcsIG5scy5sb2NhbGl6ZSgnbGFiZWxzJywgXCJTdHlsZSBmb3IgbGFiZWxzLiBcIiksIHVuZGVmaW5lZCk7XG5cblx0Ly8gZGVmYXVsdCB0b2tlbiBtb2RpZmllcnNcblxuXHRyZWdpc3RyeS5yZWdpc3RlclRva2VuTW9kaWZpZXIoJ2RlY2xhcmF0aW9uJywgbmxzLmxvY2FsaXplKCdkZWNsYXJhdGlvbicsIFwiU3R5bGUgZm9yIGFsbCBzeW1ib2wgZGVjbGFyYXRpb25zLlwiKSwgdW5kZWZpbmVkKTtcblx0cmVnaXN0cnkucmVnaXN0ZXJUb2tlbk1vZGlmaWVyKCdkb2N1bWVudGF0aW9uJywgbmxzLmxvY2FsaXplKCdkb2N1bWVudGF0aW9uJywgXCJTdHlsZSB0byB1c2UgZm9yIHJlZmVyZW5jZXMgaW4gZG9jdW1lbnRhdGlvbi5cIiksIHVuZGVmaW5lZCk7XG5cdHJlZ2lzdHJ5LnJlZ2lzdGVyVG9rZW5Nb2RpZmllcignc3RhdGljJywgbmxzLmxvY2FsaXplKCdzdGF0aWMnLCBcIlN0eWxlIHRvIHVzZSBmb3Igc3ltYm9scyB0aGF0IGFyZSBzdGF0aWMuXCIpLCB1bmRlZmluZWQpO1xuXHRyZWdpc3RyeS5yZWdpc3RlclRva2VuTW9kaWZpZXIoJ2Fic3RyYWN0JywgbmxzLmxvY2FsaXplKCdhYnN0cmFjdCcsIFwiU3R5bGUgdG8gdXNlIGZvciBzeW1ib2xzIHRoYXQgYXJlIGFic3RyYWN0LlwiKSwgdW5kZWZpbmVkKTtcblx0cmVnaXN0cnkucmVnaXN0ZXJUb2tlbk1vZGlmaWVyKCdkZXByZWNhdGVkJywgbmxzLmxvY2FsaXplKCdkZXByZWNhdGVkJywgXCJTdHlsZSB0byB1c2UgZm9yIHN5bWJvbHMgdGhhdCBhcmUgZGVwcmVjYXRlZC5cIiksIHVuZGVmaW5lZCk7XG5cdHJlZ2lzdHJ5LnJlZ2lzdGVyVG9rZW5Nb2RpZmllcignbW9kaWZpY2F0aW9uJywgbmxzLmxvY2FsaXplKCdtb2RpZmljYXRpb24nLCBcIlN0eWxlIHRvIHVzZSBmb3Igd3JpdGUgYWNjZXNzZXMuXCIpLCB1bmRlZmluZWQpO1xuXHRyZWdpc3RyeS5yZWdpc3RlclRva2VuTW9kaWZpZXIoJ2FzeW5jJywgbmxzLmxvY2FsaXplKCdhc3luYycsIFwiU3R5bGUgdG8gdXNlIGZvciBzeW1ib2xzIHRoYXQgYXJlIGFzeW5jLlwiKSwgdW5kZWZpbmVkKTtcblx0cmVnaXN0cnkucmVnaXN0ZXJUb2tlbk1vZGlmaWVyKCdyZWFkb25seScsIG5scy5sb2NhbGl6ZSgncmVhZG9ubHknLCBcIlN0eWxlIHRvIHVzZSBmb3Igc3ltYm9scyB0aGF0IGFyZSByZWFkLW9ubHkuXCIpLCB1bmRlZmluZWQpO1xuXG5cblx0cmVnaXN0ZXJUb2tlblN0eWxlRGVmYXVsdCgndmFyaWFibGUucmVhZG9ubHknLCBbWyd2YXJpYWJsZS5vdGhlci5jb25zdGFudCddXSk7XG5cdHJlZ2lzdGVyVG9rZW5TdHlsZURlZmF1bHQoJ3Byb3BlcnR5LnJlYWRvbmx5JywgW1sndmFyaWFibGUub3RoZXIuY29uc3RhbnQucHJvcGVydHknXV0pO1xuXHRyZWdpc3RlclRva2VuU3R5bGVEZWZhdWx0KCd0eXBlLmRlZmF1bHRMaWJyYXJ5JywgW1snc3VwcG9ydC50eXBlJ11dKTtcblx0cmVnaXN0ZXJUb2tlblN0eWxlRGVmYXVsdCgnY2xhc3MuZGVmYXVsdExpYnJhcnknLCBbWydzdXBwb3J0LmNsYXNzJ11dKTtcblx0cmVnaXN0ZXJUb2tlblN0eWxlRGVmYXVsdCgnaW50ZXJmYWNlLmRlZmF1bHRMaWJyYXJ5JywgW1snc3VwcG9ydC5jbGFzcyddXSk7XG5cdHJlZ2lzdGVyVG9rZW5TdHlsZURlZmF1bHQoJ3ZhcmlhYmxlLmRlZmF1bHRMaWJyYXJ5JywgW1snc3VwcG9ydC52YXJpYWJsZSddLCBbJ3N1cHBvcnQub3RoZXIudmFyaWFibGUnXV0pO1xuXHRyZWdpc3RlclRva2VuU3R5bGVEZWZhdWx0KCd2YXJpYWJsZS5kZWZhdWx0TGlicmFyeS5yZWFkb25seScsIFtbJ3N1cHBvcnQuY29uc3RhbnQnXV0pO1xuXHRyZWdpc3RlclRva2VuU3R5bGVEZWZhdWx0KCdwcm9wZXJ0eS5kZWZhdWx0TGlicmFyeScsIFtbJ3N1cHBvcnQudmFyaWFibGUucHJvcGVydHknXV0pO1xuXHRyZWdpc3RlclRva2VuU3R5bGVEZWZhdWx0KCdwcm9wZXJ0eS5kZWZhdWx0TGlicmFyeS5yZWFkb25seScsIFtbJ3N1cHBvcnQuY29uc3RhbnQucHJvcGVydHknXV0pO1xuXHRyZWdpc3RlclRva2VuU3R5bGVEZWZhdWx0KCdmdW5jdGlvbi5kZWZhdWx0TGlicmFyeScsIFtbJ3N1cHBvcnQuZnVuY3Rpb24nXV0pO1xuXHRyZWdpc3RlclRva2VuU3R5bGVEZWZhdWx0KCdtZW1iZXIuZGVmYXVsdExpYnJhcnknLCBbWydzdXBwb3J0LmZ1bmN0aW9uJ11dKTtcblx0cmV0dXJuIHJlZ2lzdHJ5O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0VG9rZW5DbGFzc2lmaWNhdGlvblJlZ2lzdHJ5KCk6IElUb2tlbkNsYXNzaWZpY2F0aW9uUmVnaXN0cnkge1xuXHRyZXR1cm4gdG9rZW5DbGFzc2lmaWNhdGlvblJlZ2lzdHJ5O1xufVxuXG5mdW5jdGlvbiBnZXRTdHlsaW5nU2NoZW1lRW50cnkoZGVzY3JpcHRpb24/OiBzdHJpbmcsIGRlcHJlY2F0aW9uTWVzc2FnZT86IHN0cmluZyk6IElKU09OU2NoZW1hIHtcblx0cmV0dXJuIHtcblx0XHRkZXNjcmlwdGlvbixcblx0XHRkZXByZWNhdGlvbk1lc3NhZ2UsXG5cdFx0ZGVmYXVsdFNuaXBwZXRzOiBbeyBib2R5OiAnJHsxOiNmZjAwMDB9JyB9XSxcblx0XHRhbnlPZjogW1xuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0Zm9ybWF0OiAnY29sb3ItaGV4J1xuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvc3R5bGUnXG5cdFx0XHR9XG5cdFx0XVxuXHR9O1xufVxuXG5leHBvcnQgY29uc3QgdG9rZW5TdHlsaW5nU2NoZW1hSWQgPSAndnNjb2RlOi8vc2NoZW1hcy90b2tlbi1zdHlsaW5nJztcblxuY29uc3Qgc2NoZW1hUmVnaXN0cnkgPSBwbGF0Zm9ybS5SZWdpc3RyeS5hczxJSlNPTkNvbnRyaWJ1dGlvblJlZ2lzdHJ5PihKU09ORXh0ZW5zaW9ucy5KU09OQ29udHJpYnV0aW9uKTtcbnNjaGVtYVJlZ2lzdHJ5LnJlZ2lzdGVyU2NoZW1hKHRva2VuU3R5bGluZ1NjaGVtYUlkLCB0b2tlbkNsYXNzaWZpY2F0aW9uUmVnaXN0cnkuZ2V0VG9rZW5TdHlsaW5nU2NoZW1hKCkpO1xuXG5jb25zdCBkZWxheWVyID0gbmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gc2NoZW1hUmVnaXN0cnkubm90aWZ5U2NoZW1hQ2hhbmdlZCh0b2tlblN0eWxpbmdTY2hlbWFJZCksIDIwMCk7XG50b2tlbkNsYXNzaWZpY2F0aW9uUmVnaXN0cnkub25EaWRDaGFuZ2VTY2hlbWEoKCkgPT4ge1xuXHRpZiAoIWRlbGF5ZXIuaXNTY2hlZHVsZWQoKSkge1xuXHRcdGRlbGF5ZXIuc2NoZWR1bGUoKTtcblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxlQUFzQjtBQUUvQixTQUFTLGtCQUFrQjtBQUMzQixZQUFZLFNBQVM7QUFDckIsU0FBUyxjQUFjLHNCQUFpRDtBQUN4RSxZQUFZLGNBQWM7QUFHMUIsTUFBTSxzQkFBc0I7QUFDNUIsTUFBTSxzQ0FBc0M7QUFDNUMsTUFBTSxnQ0FBZ0M7QUFLdEMsTUFBTSxZQUFZO0FBQ1gsTUFBTSwyQkFBMkIsSUFBSSxTQUFTO0FBRXJELE1BQU0sa0JBQWtCLEtBQUssU0FBUyxXQUFXLDZCQUE2QixHQUFHLFNBQVMsTUFBTSxtQ0FBbUMsR0FBRyxTQUFTO0FBRS9JLE1BQU0sbUJBQW1CO0FBd0JsQixNQUFNLFdBQStDO0FBQUEsRUFDM0QsWUFDaUIsWUFDQSxNQUNBLFdBQ0EsZUFDQSxRQUNmO0FBTGU7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBLEVBRWpCO0FBQ0Q7QUFBQSxDQUVPLENBQVVBLGdCQUFWO0FBQ0MsV0FBUyxhQUFhLE9BQXdCO0FBQ3BELFdBQU87QUFBQSxNQUNOLGFBQWEsTUFBTSxlQUFlLFNBQVksT0FBTyxNQUFNLE9BQU8sSUFBSSxXQUFXLE1BQU0sWUFBWSxJQUFJO0FBQUEsTUFDdkcsT0FBTyxNQUFNLFNBQVMsU0FBWSxPQUFPLE1BQU07QUFBQSxNQUMvQyxZQUFZLE1BQU0sY0FBYyxTQUFZLE9BQU8sTUFBTTtBQUFBLE1BQ3pELFNBQVMsTUFBTSxXQUFXLFNBQVksT0FBTyxNQUFNO0FBQUEsTUFDbkQsZ0JBQWdCLE1BQU0sa0JB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UyxzQkFBc0IsU0FBUyxJQUFJLFNBQVMsU0FBUywwQ0FBMEMsR0FBRyxNQUFTO0FBQ3BILFdBQVMsc0JBQXNCLFlBQVksSUFBSSxTQUFTLFlBQVksOENBQThDLEdBQUcsTUFBUztBQUc5SCw0QkFBMEIscUJBQXFCLENBQUMsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO0FBQzVFLDRCQUEwQixxQkFBcUIsQ0FBQyxDQUFDLGtDQUFrQyxDQUFDLENBQUM7QUFDckYsNEJBQTBCLHVCQUF1QixDQUFDLENBQUMsY0FBYyxDQUFDLENBQUM7QUFDbkUsNEJBQTBCLHdCQUF3QixDQUFDLENBQUMsZUFBZSxDQUFDLENBQUM7QUFDckUsNEJBQTBCLDRCQUE0QixDQUFDLENBQUMsZUFBZSxDQUFDLENBQUM7QUFDekUsNEJBQTBCLDJCQUEyQixDQUFDLENBQUMsa0JBQWtCLEdBQUcsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO0FBQ3ZHLDRCQUEwQixvQ0FBb0MsQ0FBQyxDQUFDLGtCQUFrQixDQUFDLENBQUM7QUFDcEYsNEJBQTBCLDJCQUEyQixDQUFDLENBQUMsMkJBQTJCLENBQUMsQ0FBQztBQUNwRiw0QkFBMEIsb0NBQW9DLENBQUMsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO0FBQzdGLDRCQUEwQiwyQkFBMkIsQ0FBQyxDQUFDLGtCQUFrQixDQUFDLENBQUM7QUFDM0UsNEJBQTBCLHlCQUF5QixDQUFDLENBQUMsa0JBQWtCLENBQUMsQ0FBQztBQUN6RSxTQUFPO0FBQ1I7QUFFTyxTQUFTLGlDQUErRDtBQUM5RSxTQUFPO0FBQ1I7QUFFQSxTQUFTLHNCQUFzQixhQUFzQixvQkFBMEM7QUFDOUYsU0FBTztBQUFBLElBQ047QUFBQSxJQUNBO0FBQUEsSUFDQSxpQkFBaUIsQ0FBQyxFQUFFLE1BQU0sZUFBZSxDQUFDO0FBQUEsSUFDMUMsT0FBTztBQUFBLE1BQ047QUFBQSxRQUNDLE1BQU07QUFBQSxRQUNOLFFBQVE7QUFBQSxNQUNUO0FBQUEsTUFDQTtBQUFBLFFBQ0MsTUFBTTtBQUFBLE1BQ1A7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNEO0FBRU8sTUFBTSx1QkFBdUI7QUFFcEMsTUFBTSxpQkFBaUIsU0FBUyxTQUFTLEdBQThCLGVBQWUsZ0JBQWdCO0FBQ3RHLGVBQWUsZUFBZSxzQkFBc0IsNEJBQTRCLHNCQUFzQixDQUFDO0FBRXZHLE1BQU0sVUFBVSxJQUFJLGlCQUFpQixNQUFNLGVBQWUsb0JBQW9CLG9CQUFvQixHQUFHLEdBQUc7QUFDeEcsNEJBQTRCLGtCQUFrQixNQUFNO0FBQ25ELE1BQUksQ0FBQyxRQUFRLFlBQVksR0FBRztBQUMzQixZQUFRLFNBQVM7QUFBQSxFQUNsQjtBQUNELENBQUM7IiwKICAibmFtZXMiOiBbIlRva2VuU3R5bGUiLCAiU2VtYW50aWNUb2tlblJ1bGUiLCAibGFuZ3VhZ2UiXQp9Cg==
