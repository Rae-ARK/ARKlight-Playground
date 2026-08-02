var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import * as nls from "../../../../nls.js";
import { parse, getNodeType } from "../../../../base/common/json.js";
import * as types from "../../../../base/common/types.js";
import { IndentAction } from "../../../../editor/common/languages/languageConfiguration.js";
import { ILanguageConfigurationService } from "../../../../editor/common/languages/languageConfigurationRegistry.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { Extensions } from "../../../../platform/jsonschemas/common/jsonContributionRegistry.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { getParseErrorMessage } from "../../../../base/common/jsonErrorMessages.js";
import { IExtensionResourceLoaderService } from "../../../../platform/extensionResourceLoader/common/extensionResourceLoader.js";
import { hash } from "../../../../base/common/hash.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
function isStringArr(something) {
  if (!Array.isArray(something)) {
    return false;
  }
  for (let i = 0, len = something.length; i < len; i++) {
    if (typeof something[i] !== "string") {
      return false;
    }
  }
  return true;
}
function isCharacterPair(something) {
  return isStringArr(something) && something.length === 2;
}
let LanguageConfigurationFileHandler = class extends Disposable {
  constructor(_languageService, _extensionResourceLoaderService, _extensionService, _languageConfigurationService) {
    super();
    this._languageService = _languageService;
    this._extensionResourceLoaderService = _extensionResourceLoaderService;
    this._extensionService = _extensionService;
    this._languageConfigurationService = _languageConfigurationService;
    /**
     * A map from language id to a hash computed from the config files locations.
     */
    this._done = /* @__PURE__ */ new Map();
    this._register(this._languageService.onDidRequestBasicLanguageFeatures(async (languageIdentifier) => {
      this._extensionService.whenInstalledExtensionsRegistered().then(() => {
        this._loadConfigurationsForMode(languageIdentifier);
      });
    }));
    this._register(this._languageService.onDidChange(() => {
      for (const [languageId] of this._done) {
        this._loadConfigurationsForMode(languageId);
      }
    }));
  }
  async _loadConfigurationsForMode(languageId) {
    const configurationFiles = this._languageService.getConfigurationFiles(languageId);
    const configurationHash = hash(configurationFiles.map((uri) => uri.toString()));
    if (this._done.get(languageId) === configurationHash) {
      return;
    }
    this._done.set(languageId, configurationHash);
    const configs = await Promise.all(configurationFiles.map((configFile) => this._readConfigFile(configFile)));
    for (const config of configs) {
      this._handleConfig(languageId, config);
    }
  }
  async _readConfigFile(configFileLocation) {
    try {
      const contents = await this._extensionResourceLoaderService.readExtensionResource(configFileLocation);
      const errors = [];
      let configuration = parse(contents, errors);
      if (errors.length) {
        console.error(nls.localize("parseErrors", "Errors parsing {0}: {1}", configFileLocation.toString(), errors.map((e) => `[${e.offset}, ${e.length}] ${getParseErrorMessage(e.error)}`).join("\n")));
      }
      if (getNodeType(configuration) !== "object") {
        console.error(nls.localize("formatError", "{0}: Invalid format, JSON object expected.", configFileLocation.toString()));
        configuration = {};
      }
      return configuration;
    } catch (err) {
      console.error(err);
      return {};
    }
  }
  static _extractValidCommentRule(languageId, configuration) {
    const source = configuration.comments;
    if (typeof source === "undefined") {
      return void 0;
    }
    if (!types.isObject(source)) {
      console.warn(`[${languageId}]: language configuration: expected \`comments\` to be an object.`);
      return void 0;
    }
    let result = void 0;
    if (typeof source.lineComment !== "undefined") {
      if (typeof source.lineComment === "string") {
        result = result || {};
        result.lineComment = source.lineComment;
      } else if (types.isObject(source.lineComment)) {
        const lineCommentObj = source.lineComment;
        if (typeof lineCommentObj.comment === "string") {
          result = result || {};
          result.lineComment = {
            comment: lineCommentObj.comment,
            noIndent: lineCommentObj.noIndent
          };
        } else {
          console.warn(`[${languageId}]: language configuration: expected \`comments.lineComment.comment\` to be a string.`);
        }
      } else {
        console.warn(`[${languageId}]: language configuration: expected \`comments.lineComment\` to be a string or an object with comment property.`);
      }
    }
    if (typeof source.blockComment !== "undefined") {
      if (!isCharacterPair(source.blockComment)) {
        console.warn(`[${languageId}]: language configuration: expected \`comments.blockComment\` to be an array of two strings.`);
      } else {
        result = result || {};
        result.blockComment = source.blockComment;
      }
    }
    return result;
  }
  static _extractValidBrackets(languageId, configuration) {
    const source = configuration.brackets;
    if (typeof source === "undefined") {
      return void 0;
    }
    if (!Array.isArray(source)) {
      console.warn(`[${languageId}]: language configuration: expected \`brackets\` to be an array.`);
      return void 0;
    }
    let result = void 0;
    for (let i = 0, len = source.length; i < len; i++) {
      const pair = source[i];
      if (!isCharacterPair(pair)) {
        console.warn(`[${languageId}]: language configuration: expected \`brackets[${i}]\` to be an array of two strings.`);
        continue;
      }
      result = result || [];
      result.push(pair);
    }
    return result;
  }
  static _extractValidAutoClosingPairs(languageId, configuration) {
    const source = configuration.autoClosingPairs;
    if (typeof source === "undefined") {
      return void 0;
    }
    if (!Array.isArray(source)) {
      console.warn(`[${languageId}]: language configuration: expected \`autoClosingPairs\` to be an array.`);
      return void 0;
    }
    let result = void 0;
    for (let i = 0, len = source.length; i < len; i++) {
      const pair = source[i];
      if (Array.isArray(pair)) {
        if (!isCharacterPair(pair)) {
          console.warn(`[${languageId}]: language configuration: expected \`autoClosingPairs[${i}]\` to be an array of two strings or an object.`);
          continue;
        }
        result = result || [];
        result.push({ open: pair[0], close: pair[1] });
      } else {
        if (!types.isObject(pair)) {
          console.warn(`[${languageId}]: language configuration: expected \`autoClosingPairs[${i}]\` to be an array of two strings or an object.`);
          continue;
        }
        if (typeof pair.open !== "string") {
          console.warn(`[${languageId}]: language configuration: expected \`autoClosingPairs[${i}].open\` to be a string.`);
          continue;
        }
        if (typeof pair.close !== "string") {
          console.warn(`[${languageId}]: language configuration: expected \`autoClosingPairs[${i}].close\` to be a string.`);
          continue;
        }
        if (typeof pair.notIn !== "undefined") {
          if (!isStringArr(pair.notIn)) {
            console.warn(`[${languageId}]: language configuration: expected \`autoClosingPairs[${i}].notIn\` to be a string array.`);
            continue;
          }
        }
        result = result || [];
        result.push({ open: pair.open, close: pair.close, notIn: pair.notIn });
      }
    }
    return result;
  }
  static _extractValidSurroundingPairs(languageId, configuration) {
    const source = configuration.surroundingPairs;
    if (typeof source === "undefined") {
      return void 0;
    }
    if (!Array.isArray(source)) {
      console.warn(`[${languageId}]: language configuration: expected \`surroundingPairs\` to be an array.`);
      return void 0;
    }
    let result = void 0;
    for (let i = 0, len = source.length; i < len; i++) {
      const pair = source[i];
      if (Array.isArray(pair)) {
        if (!isCharacterPair(pair)) {
          console.warn(`[${languageId}]: language configuration: expected \`surroundingPairs[${i}]\` to be an array of two strings or an object.`);
          continue;
        }
        result = result || [];
        result.push({ open: pair[0], close: pair[1] });
      } else {
        if (!types.isObject(pair)) {
          console.warn(`[${languageId}]: language configuration: expected \`surroundingPairs[${i}]\` to be an array of two strings or an object.`);
          continue;
        }
        if (typeof pair.open !== "string") {
          console.warn(`[${languageId}]: language configuration: expected \`surroundingPairs[${i}].open\` to be a string.`);
          continue;
        }
        if (typeof pair.close !== "string") {
          console.warn(`[${languageId}]: language configuration: expected \`surroundingPairs[${i}].close\` to be a string.`);
          continue;
        }
        result = result || [];
        result.push({ open: pair.open, close: pair.close });
      }
    }
    return result;
  }
  static _extractValidColorizedBracketPairs(languageId, configuration) {
    const source = configuration.colorizedBracketPairs;
    if (typeof source === "undefined") {
      return void 0;
    }
    if (!Array.isArray(source)) {
      console.warn(`[${languageId}]: language configuration: expected \`colorizedBracketPairs\` to be an array.`);
      return void 0;
    }
    const result = [];
    for (let i = 0, len = source.length; i < len; i++) {
      const pair = source[i];
      if (!isCharacterPair(pair)) {
        console.warn(`[${languageId}]: language configuration: expected \`colorizedBracketPairs[${i}]\` to be an array of two strings.`);
        continue;
      }
      result.push([pair[0], pair[1]]);
    }
    return result;
  }
  static _extractValidOnEnterRules(languageId, configuration) {
    const source = configuration.onEnterRules;
    if (typeof source === "undefined") {
      return void 0;
    }
    if (!Array.isArray(source)) {
      console.warn(`[${languageId}]: language configuration: expected \`onEnterRules\` to be an array.`);
      return void 0;
    }
    let result = void 0;
    for (let i = 0, len = source.length; i < len; i++) {
      const onEnterRule = source[i];
      if (!types.isObject(onEnterRule)) {
        console.warn(`[${languageId}]: language configuration: expected \`onEnterRules[${i}]\` to be an object.`);
        continue;
      }
      if (!types.isObject(onEnterRule.action)) {
        console.warn(`[${languageId}]: language configuration: expected \`onEnterRules[${i}].action\` to be an object.`);
        continue;
      }
      let indentAction;
      if (onEnterRule.action.indent === "none") {
        indentAction = IndentAction.None;
      } else if (onEnterRule.action.indent === "indent") {
        indentAction = IndentAction.Indent;
      } else if (onEnterRule.action.indent === "indentOutdent") {
        indentAction = IndentAction.IndentOutdent;
      } else if (onEnterRule.action.indent === "outdent") {
        indentAction = IndentAction.Outdent;
      } else {
        console.warn(`[${languageId}]: language configuration: expected \`onEnterRules[${i}].action.indent\` to be 'none', 'indent', 'indentOutdent' or 'outdent'.`);
        continue;
      }
      const action = { indentAction };
      if (onEnterRule.action.appendText) {
        if (typeof onEnterRule.action.appendText === "string") {
          action.appendText = onEnterRule.action.appendText;
        } else {
          console.warn(`[${languageId}]: language configuration: expected \`onEnterRules[${i}].action.appendText\` to be undefined or a string.`);
        }
      }
      if (onEnterRule.action.removeText) {
        if (typeof onEnterRule.action.removeText === "number") {
          action.removeText = onEnterRule.action.removeText;
        } else {
          console.warn(`[${languageId}]: language configuration: expected \`onEnterRules[${i}].action.removeText\` to be undefined or a number.`);
        }
      }
      const beforeText = this._parseRegex(languageId, `onEnterRules[${i}].beforeText`, onEnterRule.beforeText);
      if (!beforeText) {
        continue;
      }
      const resultingOnEnterRule = { beforeText, action };
      if (onEnterRule.afterText) {
        const afterText = this._parseRegex(languageId, `onEnterRules[${i}].afterText`, onEnterRule.afterText);
        if (afterText) {
          resultingOnEnterRule.afterText = afterText;
        }
      }
      if (onEnterRule.previousLineText) {
        const previousLineText = this._parseRegex(languageId, `onEnterRules[${i}].previousLineText`, onEnterRule.previousLineText);
        if (previousLineText) {
          resultingOnEnterRule.previousLineText = previousLineText;
        }
      }
      result = result || [];
      result.push(resultingOnEnterRule);
    }
    return result;
  }
  static extractValidConfig(languageId, configuration) {
    const comments = this._extractValidCommentRule(languageId, configuration);
    const brackets = this._extractValidBrackets(languageId, configuration);
    const autoClosingPairs = this._extractValidAutoClosingPairs(languageId, configuration);
    const surroundingPairs = this._extractValidSurroundingPairs(languageId, configuration);
    const colorizedBracketPairs = this._extractValidColorizedBracketPairs(languageId, configuration);
    const autoCloseBefore = typeof configuration.autoCloseBefore === "string" ? configuration.autoCloseBefore : void 0;
    const wordPattern = configuration.wordPattern ? this._parseRegex(languageId, `wordPattern`, configuration.wordPattern) : void 0;
    const indentationRules = configuration.indentationRules ? this._mapIndentationRules(languageId, configuration.indentationRules) : void 0;
    let folding = void 0;
    if (configuration.folding) {
      const rawMarkers = configuration.folding.markers;
      const startMarker = rawMarkers && rawMarkers.start ? this._parseRegex(languageId, `folding.markers.start`, rawMarkers.start) : void 0;
      const endMarker = rawMarkers && rawMarkers.end ? this._parseRegex(languageId, `folding.markers.end`, rawMarkers.end) : void 0;
      const markers = startMarker && endMarker ? { start: startMarker, end: endMarker } : void 0;
      folding = {
        offSide: configuration.folding.offSide,
        markers
      };
    }
    const onEnterRules = this._extractValidOnEnterRules(languageId, configuration);
    const richEditConfig = {
      comments,
      brackets,
      wordPattern,
      indentationRules,
      onEnterRules,
      autoClosingPairs,
      surroundingPairs,
      colorizedBracketPairs,
      autoCloseBefore,
      folding,
      __electricCharacterSupport: void 0
    };
    return richEditConfig;
  }
  _handleConfig(languageId, configuration) {
    const richEditConfig = LanguageConfigurationFileHandler.extractValidConfig(languageId, configuration);
    this._languageConfigurationService.register(languageId, richEditConfig, 50);
  }
  static _parseRegex(languageId, confPath, value) {
    if (typeof value === "string") {
      try {
        return new RegExp(value, "");
      } catch (err) {
        console.warn(`[${languageId}]: Invalid regular expression in \`${confPath}\`: `, err);
        return void 0;
      }
    }
    if (types.isObject(value)) {
      if (typeof value.pattern !== "string") {
        console.warn(`[${languageId}]: language configuration: expected \`${confPath}.pattern\` to be a string.`);
        return void 0;
      }
      if (typeof value.flags !== "undefined" && typeof value.flags !== "string") {
        console.warn(`[${languageId}]: language configuration: expected \`${confPath}.flags\` to be a string.`);
        return void 0;
      }
      try {
        return new RegExp(value.pattern, value.flags);
      } catch (err) {
        console.warn(`[${languageId}]: Invalid regular expression in \`${confPath}\`: `, err);
        return void 0;
      }
    }
    console.warn(`[${languageId}]: language configuration: expected \`${confPath}\` to be a string or an object.`);
    return void 0;
  }
  static _mapIndentationRules(languageId, indentationRules) {
    const increaseIndentPattern = this._parseRegex(languageId, `indentationRules.increaseIndentPattern`, indentationRules.increaseIndentPattern);
    if (!increaseIndentPattern) {
      return void 0;
    }
    const decreaseIndentPattern = this._parseRegex(languageId, `indentationRules.decreaseIndentPattern`, indentationRules.decreaseIndentPattern);
    if (!decreaseIndentPattern) {
      return void 0;
    }
    const result = {
      increaseIndentPattern,
      decreaseIndentPattern
    };
    if (indentationRules.indentNextLinePattern) {
      result.indentNextLinePattern = this._parseRegex(languageId, `indentationRules.indentNextLinePattern`, indentationRules.indentNextLinePattern);
    }
    if (indentationRules.unIndentedLinePattern) {
      result.unIndentedLinePattern = this._parseRegex(languageId, `indentationRules.unIndentedLinePattern`, indentationRules.unIndentedLinePattern);
    }
    return result;
  }
};
LanguageConfigurationFileHandler = __decorateClass([
  __decorateParam(0, ILanguageService),
  __decorateParam(1, IExtensionResourceLoaderService),
  __decorateParam(2, IExtensionService),
  __decorateParam(3, ILanguageConfigurationService)
], LanguageConfigurationFileHandler);
const schemaId = "vscode://schemas/language-configuration";
const schema = {
  allowComments: true,
  allowTrailingCommas: true,
  default: {
    comments: {
      blockComment: ["/*", "*/"],
      lineComment: "//"
    },
    brackets: [["(", ")"], ["[", "]"], ["{", "}"]],
    autoClosingPairs: [["(", ")"], ["[", "]"], ["{", "}"]],
    surroundingPairs: [["(", ")"], ["[", "]"], ["{", "}"]]
  },
  definitions: {
    openBracket: {
      type: "string",
      description: nls.localize("schema.openBracket", "The opening bracket character or string sequence.")
    },
    closeBracket: {
      type: "string",
      description: nls.localize("schema.closeBracket", "The closing bracket character or string sequence.")
    },
    bracketPair: {
      type: "array",
      items: [{
        $ref: "#/definitions/openBracket"
      }, {
        $ref: "#/definitions/closeBracket"
      }]
    }
  },
  properties: {
    comments: {
      default: {
        blockComment: ["/*", "*/"],
        lineComment: { comment: "//", noIndent: false }
      },
      description: nls.localize("schema.comments", "Defines the comment symbols"),
      type: "object",
      properties: {
        blockComment: {
          type: "array",
          description: nls.localize("schema.blockComments", "Defines how block comments are marked."),
          items: [{
            type: "string",
            description: nls.localize("schema.blockComment.begin", "The character sequence that starts a block comment.")
          }, {
            type: "string",
            description: nls.localize("schema.blockComment.end", "The character sequence that ends a block comment.")
          }]
        },
        lineComment: {
          type: "object",
          description: nls.localize("schema.lineComment.object", "Configuration for line comments."),
          properties: {
            comment: {
              type: "string",
              description: nls.localize("schema.lineComment.comment", "The character sequence that starts a line comment.")
            },
            noIndent: {
              type: "boolean",
              description: nls.localize("schema.lineComment.noIndent", "Whether the comment token should not be indented and placed at the first column. Defaults to false."),
              default: false
            }
          },
          required: ["comment"],
          additionalProperties: false
        }
      }
    },
    brackets: {
      default: [["(", ")"], ["[", "]"], ["{", "}"]],
      markdownDescription: nls.localize("schema.brackets", "Defines the bracket symbols that increase or decrease the indentation. When bracket pair colorization is enabled and {0} is not defined, this also defines the bracket pairs that are colorized by their nesting level.", "`colorizedBracketPairs`"),
      type: "array",
      items: {
        $ref: "#/definitions/bracketPair"
      }
    },
    colorizedBracketPairs: {
      default: [["(", ")"], ["[", "]"], ["{", "}"]],
      markdownDescription: nls.localize("schema.colorizedBracketPairs", "Defines the bracket pairs that are colorized by their nesting level if bracket pair colorization is enabled. Any brackets included here that are not included in {0} will be automatically included in {0}.", "`brackets`"),
      type: "array",
      items: {
        $ref: "#/definitions/bracketPair"
      }
    },
    autoClosingPairs: {
      default: [["(", ")"], ["[", "]"], ["{", "}"]],
      description: nls.localize("schema.autoClosingPairs", "Defines the bracket pairs. When a opening bracket is entered, the closing bracket is inserted automatically."),
      type: "array",
      items: {
        oneOf: [{
          $ref: "#/definitions/bracketPair"
        }, {
          type: "object",
          properties: {
            open: {
              $ref: "#/definitions/openBracket"
            },
            close: {
              $ref: "#/definitions/closeBracket"
            },
            notIn: {
              type: "array",
              description: nls.localize("schema.autoClosingPairs.notIn", "Defines a list of scopes where the auto pairs are disabled."),
              items: {
                enum: ["string", "comment"]
              }
            }
          }
        }]
      }
    },
    autoCloseBefore: {
      default: ";:.,=}])> \n	",
      description: nls.localize("schema.autoCloseBefore", "Defines what characters must be after the cursor in order for bracket or quote autoclosing to occur when using the 'languageDefined' autoclosing setting. This is typically the set of characters which can not start an expression."),
      type: "string"
    },
    surroundingPairs: {
      default: [["(", ")"], ["[", "]"], ["{", "}"]],
      description: nls.localize("schema.surroundingPairs", "Defines the bracket pairs that can be used to surround a selected string."),
      type: "array",
      items: {
        oneOf: [{
          $ref: "#/definitions/bracketPair"
        }, {
          type: "object",
          properties: {
            open: {
              $ref: "#/definitions/openBracket"
            },
            close: {
              $ref: "#/definitions/closeBracket"
            }
          }
        }]
      }
    },
    wordPattern: {
      default: "",
      description: nls.localize("schema.wordPattern", "Defines what is considered to be a word in the programming language."),
      type: ["string", "object"],
      properties: {
        pattern: {
          type: "string",
          description: nls.localize("schema.wordPattern.pattern", "The RegExp pattern used to match words."),
          default: ""
        },
        flags: {
          type: "string",
          description: nls.localize("schema.wordPattern.flags", "The RegExp flags used to match words."),
          default: "g",
          pattern: "^([gimuy]+)$",
          patternErrorMessage: nls.localize("schema.wordPattern.flags.errorMessage", "Must match the pattern `/^([gimuy]+)$/`.")
        }
      }
    },
    indentationRules: {
      default: {
        increaseIndentPattern: "",
        decreaseIndentPattern: ""
      },
      description: nls.localize("schema.indentationRules", "The language's indentation settings."),
      type: "object",
      properties: {
        increaseIndentPattern: {
          type: ["string", "object"],
          description: nls.localize("schema.indentationRules.increaseIndentPattern", "If a line matches this pattern, then all the lines after it should be indented once (until another rule matches)."),
          properties: {
            pattern: {
              type: "string",
              description: nls.localize("schema.indentationRules.increaseIndentPattern.pattern", "The RegExp pattern for increaseIndentPattern."),
              default: ""
            },
            flags: {
              type: "string",
              description: nls.localize("schema.indentationRules.increaseIndentPattern.flags", "The RegExp flags for increaseIndentPattern."),
              default: "",
              pattern: "^([gimuy]+)$",
              patternErrorMessage: nls.localize("schema.indentationRules.increaseIndentPattern.errorMessage", "Must match the pattern `/^([gimuy]+)$/`.")
            }
          }
        },
        decreaseIndentPattern: {
          type: ["string", "object"],
          description: nls.localize("schema.indentationRules.decreaseIndentPattern", "If a line matches this pattern, then all the lines after it should be unindented once (until another rule matches)."),
          properties: {
            pattern: {
              type: "string",
              description: nls.localize("schema.indentationRules.decreaseIndentPattern.pattern", "The RegExp pattern for decreaseIndentPattern."),
              default: ""
            },
            flags: {
              type: "string",
              description: nls.localize("schema.indentationRules.decreaseIndentPattern.flags", "The RegExp flags for decreaseIndentPattern."),
              default: "",
              pattern: "^([gimuy]+)$",
              patternErrorMessage: nls.localize("schema.indentationRules.decreaseIndentPattern.errorMessage", "Must match the pattern `/^([gimuy]+)$/`.")
            }
          }
        },
        indentNextLinePattern: {
          type: ["string", "object"],
          description: nls.localize("schema.indentationRules.indentNextLinePattern", "If a line matches this pattern, then **only the next line** after it should be indented once."),
          properties: {
            pattern: {
              type: "string",
              description: nls.localize("schema.indentationRules.indentNextLinePattern.pattern", "The RegExp pattern for indentNextLinePattern."),
              default: ""
            },
            flags: {
              type: "string",
              description: nls.localize("schema.indentationRules.indentNextLinePattern.flags", "The RegExp flags for indentNextLinePattern."),
              default: "",
              pattern: "^([gimuy]+)$",
              patternErrorMessage: nls.localize("schema.indentationRules.indentNextLinePattern.errorMessage", "Must match the pattern `/^([gimuy]+)$/`.")
            }
          }
        },
        unIndentedLinePattern: {
          type: ["string", "object"],
          description: nls.localize("schema.indentationRules.unIndentedLinePattern", "If a line matches this pattern, then its indentation should not be changed and it should not be evaluated against the other rules."),
          properties: {
            pattern: {
              type: "string",
              description: nls.localize("schema.indentationRules.unIndentedLinePattern.pattern", "The RegExp pattern for unIndentedLinePattern."),
              default: ""
            },
            flags: {
              type: "string",
              description: nls.localize("schema.indentationRules.unIndentedLinePattern.flags", "The RegExp flags for unIndentedLinePattern."),
              default: "",
              pattern: "^([gimuy]+)$",
              patternErrorMessage: nls.localize("schema.indentationRules.unIndentedLinePattern.errorMessage", "Must match the pattern `/^([gimuy]+)$/`.")
            }
          }
        }
      }
    },
    folding: {
      type: "object",
      description: nls.localize("schema.folding", "The language's folding settings."),
      properties: {
        offSide: {
          type: "boolean",
          description: nls.localize("schema.folding.offSide", "A language adheres to the off-side rule if blocks in that language are expressed by their indentation. If set, empty lines belong to the subsequent block.")
        },
        markers: {
          type: "object",
          description: nls.localize("schema.folding.markers", "Language specific folding markers such as '#region' and '#endregion'. The start and end regexes will be tested against the contents of all lines and must be designed efficiently"),
          properties: {
            start: {
              type: ["string", "object"],
              description: nls.localize("schema.folding.markers.start", "The RegExp pattern for the start marker. The regexp must start with '^'."),
              properties: {
                pattern: {
                  type: "string",
                  description: nls.localize("schema.folding.markers.start.pattern", "The RegExp pattern for the start marker."),
                  default: ""
                },
                flags: {
                  type: "string",
                  description: nls.localize("schema.folding.markers.start.flags", "The RegExp flags for the start marker."),
                  default: "",
                  pattern: "^([gimuy]+)$",
                  patternErrorMessage: nls.localize("schema.folding.markers.start.errorMessage", "Must match the pattern `/^([gimuy]+)$/`.")
                }
              }
            },
            end: {
              type: ["string", "object"],
              description: nls.localize("schema.folding.markers.end", "The RegExp pattern for the end marker. The regexp must start with '^'."),
              properties: {
                pattern: {
                  type: "string",
                  description: nls.localize("schema.folding.markers.end.pattern", "The RegExp pattern for the end marker."),
                  default: ""
                },
                flags: {
                  type: "string",
                  description: nls.localize("schema.folding.markers.end.flags", "The RegExp flags for the end marker."),
                  default: "",
                  pattern: "^([gimuy]+)$",
                  patternErrorMessage: nls.localize("schema.folding.markers.end.errorMessage", "Must match the pattern `/^([gimuy]+)$/`.")
                }
              }
            }
          }
        }
      }
    },
    onEnterRules: {
      type: "array",
      description: nls.localize("schema.onEnterRules", "The language's rules to be evaluated when pressing Enter."),
      items: {
        type: "object",
        description: nls.localize("schema.onEnterRules", "The language's rules to be evaluated when pressing Enter."),
        required: ["beforeText", "action"],
        properties: {
          beforeText: {
            type: ["string", "object"],
            description: nls.localize("schema.onEnterRules.beforeText", "This rule will only execute if the text before the cursor matches this regular expression."),
            properties: {
              pattern: {
                type: "string",
                description: nls.localize("schema.onEnterRules.beforeText.pattern", "The RegExp pattern for beforeText."),
                default: ""
              },
              flags: {
                type: "string",
                description: nls.localize("schema.onEnterRules.beforeText.flags", "The RegExp flags for beforeText."),
                default: "",
                pattern: "^([gimuy]+)$",
                patternErrorMessage: nls.localize("schema.onEnterRules.beforeText.errorMessage", "Must match the pattern `/^([gimuy]+)$/`.")
              }
            }
          },
          afterText: {
            type: ["string", "object"],
            description: nls.localize("schema.onEnterRules.afterText", "This rule will only execute if the text after the cursor matches this regular expression."),
            properties: {
              pattern: {
                type: "string",
                description: nls.localize("schema.onEnterRules.afterText.pattern", "The RegExp pattern for afterText."),
                default: ""
              },
              flags: {
                type: "string",
                description: nls.localize("schema.onEnterRules.afterText.flags", "The RegExp flags for afterText."),
                default: "",
                pattern: "^([gimuy]+)$",
                patternErrorMessage: nls.localize("schema.onEnterRules.afterText.errorMessage", "Must match the pattern `/^([gimuy]+)$/`.")
              }
            }
          },
          previousLineText: {
            type: ["string", "object"],
            description: nls.localize("schema.onEnterRules.previousLineText", "This rule will only execute if the text above the line matches this regular expression."),
            properties: {
              pattern: {
                type: "string",
                description: nls.localize("schema.onEnterRules.previousLineText.pattern", "The RegExp pattern for previousLineText."),
                default: ""
              },
              flags: {
                type: "string",
                description: nls.localize("schema.onEnterRules.previousLineText.flags", "The RegExp flags for previousLineText."),
                default: "",
                pattern: "^([gimuy]+)$",
                patternErrorMessage: nls.localize("schema.onEnterRules.previousLineText.errorMessage", "Must match the pattern `/^([gimuy]+)$/`.")
              }
            }
          },
          action: {
            type: ["string", "object"],
            description: nls.localize("schema.onEnterRules.action", "The action to execute."),
            required: ["indent"],
            default: { "indent": "indent" },
            properties: {
              indent: {
                type: "string",
                description: nls.localize("schema.onEnterRules.action.indent", "Describe what to do with the indentation"),
                default: "indent",
                enum: ["none", "indent", "indentOutdent", "outdent"],
                markdownEnumDescriptions: [
                  nls.localize("schema.onEnterRules.action.indent.none", "Insert new line and copy the previous line's indentation."),
                  nls.localize("schema.onEnterRules.action.indent.indent", "Insert new line and indent once (relative to the previous line's indentation)."),
                  nls.localize("schema.onEnterRules.action.indent.indentOutdent", "Insert two new lines:\n - the first one indented which will hold the cursor\n - the second one at the same indentation level"),
                  nls.localize("schema.onEnterRules.action.indent.outdent", "Insert new line and outdent once (relative to the previous line's indentation).")
                ]
              },
              appendText: {
                type: "string",
                description: nls.localize("schema.onEnterRules.action.appendText", "Describes text to be appended after the new line and after the indentation."),
                default: ""
              },
              removeText: {
                type: "number",
                description: nls.localize("schema.onEnterRules.action.removeText", "Describes the number of characters to remove from the new line's indentation."),
                default: 0
              }
            }
          }
        }
      }
    }
  }
};
const schemaRegistry = Registry.as(Extensions.JSONContribution);
schemaRegistry.registerSchema(schemaId, schema);
export {
  LanguageConfigurationFileHandler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NvZGVFZGl0b3IvY29tbW9uL2xhbmd1YWdlQ29uZmlndXJhdGlvbkV4dGVuc2lvblBvaW50LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBQYXJzZUVycm9yLCBwYXJzZSwgZ2V0Tm9kZVR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uLmpzJztcbmltcG9ydCB7IElKU09OU2NoZW1hIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblNjaGVtYS5qcyc7XG5pbXBvcnQgKiBhcyB0eXBlcyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgQ2hhcmFjdGVyUGFpciwgQ29tbWVudFJ1bGUsIEVudGVyQWN0aW9uLCBFeHBsaWNpdExhbmd1YWdlQ29uZmlndXJhdGlvbiwgRm9sZGluZ01hcmtlcnMsIEZvbGRpbmdSdWxlcywgSUF1dG9DbG9zaW5nUGFpciwgSUF1dG9DbG9zaW5nUGFpckNvbmRpdGlvbmFsLCBJbmRlbnRBY3Rpb24sIEluZGVudGF0aW9uUnVsZSwgT25FbnRlclJ1bGUgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucywgSUpTT05Db250cmlidXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2pzb25zY2hlbWFzL2NvbW1vbi9qc29uQ29udHJpYnV0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGdldFBhcnNlRXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbkVycm9yTWVzc2FnZXMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvblJlc291cmNlTG9hZGVyL2NvbW1vbi9leHRlbnNpb25SZXNvdXJjZUxvYWRlci5qcyc7XG5pbXBvcnQgeyBoYXNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaGFzaC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcblxuaW50ZXJmYWNlIElSZWdFeHAge1xuXHRwYXR0ZXJuOiBzdHJpbmc7XG5cdGZsYWdzPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSUluZGVudGF0aW9uUnVsZXMge1xuXHRkZWNyZWFzZUluZGVudFBhdHRlcm46IHN0cmluZyB8IElSZWdFeHA7XG5cdGluY3JlYXNlSW5kZW50UGF0dGVybjogc3RyaW5nIHwgSVJlZ0V4cDtcblx0aW5kZW50TmV4dExpbmVQYXR0ZXJuPzogc3RyaW5nIHwgSVJlZ0V4cDtcblx0dW5JbmRlbnRlZExpbmVQYXR0ZXJuPzogc3RyaW5nIHwgSVJlZ0V4cDtcbn1cblxuaW50ZXJmYWNlIElFbnRlckFjdGlvbiB7XG5cdGluZGVudDogJ25vbmUnIHwgJ2luZGVudCcgfCAnaW5kZW50T3V0ZGVudCcgfCAnb3V0ZGVudCc7XG5cdGFwcGVuZFRleHQ/OiBzdHJpbmc7XG5cdHJlbW92ZVRleHQ/OiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBJT25FbnRlclJ1bGUge1xuXHRiZWZvcmVUZXh0OiBzdHJpbmcgfCBJUmVnRXhwO1xuXHRhZnRlclRleHQ/OiBzdHJpbmcgfCBJUmVnRXhwO1xuXHRwcmV2aW91c0xpbmVUZXh0Pzogc3RyaW5nIHwgSVJlZ0V4cDtcblx0YWN0aW9uOiBJRW50ZXJBY3Rpb247XG59XG5cbi8qKlxuICogU2VyaWFsaXplZCBmb3JtIG9mIGEgbGFuZ3VhZ2UgY29uZmlndXJhdGlvblxuICovXG5leHBvcnQgaW50ZXJmYWNlIElMYW5ndWFnZUNvbmZpZ3VyYXRpb24ge1xuXHRjb21tZW50cz86IENvbW1lbnRSdWxlO1xuXHRicmFja2V0cz86IENoYXJhY3RlclBhaXJbXTtcblx0YXV0b0Nsb3NpbmdQYWlycz86IEFycmF5PENoYXJhY3RlclBhaXIgfCBJQXV0b0Nsb3NpbmdQYWlyQ29uZGl0aW9uYWw+O1xuXHRzdXJyb3VuZGluZ1BhaXJzPzogQXJyYXk8Q2hhcmFjdGVyUGFpciB8IElBdXRvQ2xvc2luZ1BhaXI+O1xuXHRjb2xvcml6ZWRCcmFja2V0UGFpcnM/OiBBcnJheTxDaGFyYWN0ZXJQYWlyPjtcblx0d29yZFBhdHRlcm4/OiBzdHJpbmcgfCBJUmVnRXhwO1xuXHRpbmRlbnRhdGlvblJ1bGVzPzogSUluZGVudGF0aW9uUnVsZXM7XG5cdGZvbGRpbmc/OiB7XG5cdFx0b2ZmU2lkZT86IGJvb2xlYW47XG5cdFx0bWFya2Vycz86IHtcblx0XHRcdHN0YXJ0Pzogc3RyaW5nIHwgSVJlZ0V4cDtcblx0XHRcdGVuZD86IHN0cmluZyB8IElSZWdFeHA7XG5cdFx0fTtcblx0fTtcblx0YXV0b0Nsb3NlQmVmb3JlPzogc3RyaW5nO1xuXHRvbkVudGVyUnVsZXM/OiBJT25FbnRlclJ1bGVbXTtcbn1cblxuZnVuY3Rpb24gaXNTdHJpbmdBcnIoc29tZXRoaW5nOiBzdHJpbmdbXSB8IG51bGwpOiBzb21ldGhpbmcgaXMgc3RyaW5nW10ge1xuXHRpZiAoIUFycmF5LmlzQXJyYXkoc29tZXRoaW5nKSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRmb3IgKGxldCBpID0gMCwgbGVuID0gc29tZXRoaW5nLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0aWYgKHR5cGVvZiBzb21ldGhpbmdbaV0gIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB0cnVlO1xuXG59XG5cbmZ1bmN0aW9uIGlzQ2hhcmFjdGVyUGFpcihzb21ldGhpbmc6IENoYXJhY3RlclBhaXIgfCBudWxsKTogYm9vbGVhbiB7XG5cdHJldHVybiAoXG5cdFx0aXNTdHJpbmdBcnIoc29tZXRoaW5nKVxuXHRcdCYmIHNvbWV0aGluZy5sZW5ndGggPT09IDJcblx0KTtcbn1cblxuZXhwb3J0IGNsYXNzIExhbmd1YWdlQ29uZmlndXJhdGlvbkZpbGVIYW5kbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0LyoqXG5cdCAqIEEgbWFwIGZyb20gbGFuZ3VhZ2UgaWQgdG8gYSBoYXNoIGNvbXB1dGVkIGZyb20gdGhlIGNvbmZpZyBmaWxlcyBsb2NhdGlvbnMuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kb25lID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlOiBJRXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZTogSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9sYW5ndWFnZVNlcnZpY2Uub25EaWRSZXF1ZXN0QmFzaWNMYW5ndWFnZUZlYXR1cmVzKGFzeW5jIChsYW5ndWFnZUlkZW50aWZpZXIpID0+IHtcblx0XHRcdC8vIE1vZGVzIGNhbiBiZSBpbnN0YW50aWF0ZWQgYmVmb3JlIHRoZSBleHRlbnNpb24gcG9pbnRzIGhhdmUgZmluaXNoZWQgcmVnaXN0ZXJpbmdcblx0XHRcdHRoaXMuX2V4dGVuc2lvblNlcnZpY2Uud2hlbkluc3RhbGxlZEV4dGVuc2lvbnNSZWdpc3RlcmVkKCkudGhlbigoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2xvYWRDb25maWd1cmF0aW9uc0Zvck1vZGUobGFuZ3VhZ2VJZGVudGlmaWVyKTtcblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9sYW5ndWFnZVNlcnZpY2Uub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0Ly8gcmVsb2FkIGxhbmd1YWdlIGNvbmZpZ3VyYXRpb25zIGFzIG5lY2Vzc2FyeVxuXHRcdFx0Zm9yIChjb25zdCBbbGFuZ3VhZ2VJZF0gb2YgdGhpcy5fZG9uZSkge1xuXHRcdFx0XHR0aGlzLl9sb2FkQ29uZmlndXJhdGlvbnNGb3JNb2RlKGxhbmd1YWdlSWQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2xvYWRDb25maWd1cmF0aW9uc0Zvck1vZGUobGFuZ3VhZ2VJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvbkZpbGVzID0gdGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLmdldENvbmZpZ3VyYXRpb25GaWxlcyhsYW5ndWFnZUlkKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uSGFzaCA9IGhhc2goY29uZmlndXJhdGlvbkZpbGVzLm1hcCh1cmkgPT4gdXJpLnRvU3RyaW5nKCkpKTtcblxuXHRcdGlmICh0aGlzLl9kb25lLmdldChsYW5ndWFnZUlkKSA9PT0gY29uZmlndXJhdGlvbkhhc2gpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZG9uZS5zZXQobGFuZ3VhZ2VJZCwgY29uZmlndXJhdGlvbkhhc2gpO1xuXG5cdFx0Y29uc3QgY29uZmlncyA9IGF3YWl0IFByb21pc2UuYWxsKGNvbmZpZ3VyYXRpb25GaWxlcy5tYXAoY29uZmlnRmlsZSA9PiB0aGlzLl9yZWFkQ29uZmlnRmlsZShjb25maWdGaWxlKSkpO1xuXHRcdGZvciAoY29uc3QgY29uZmlnIG9mIGNvbmZpZ3MpIHtcblx0XHRcdHRoaXMuX2hhbmRsZUNvbmZpZyhsYW5ndWFnZUlkLCBjb25maWcpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlYWRDb25maWdGaWxlKGNvbmZpZ0ZpbGVMb2NhdGlvbjogVVJJKTogUHJvbWlzZTxJTGFuZ3VhZ2VDb25maWd1cmF0aW9uPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNvbnRlbnRzID0gYXdhaXQgdGhpcy5fZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlLnJlYWRFeHRlbnNpb25SZXNvdXJjZShjb25maWdGaWxlTG9jYXRpb24pO1xuXHRcdFx0Y29uc3QgZXJyb3JzOiBQYXJzZUVycm9yW10gPSBbXTtcblx0XHRcdGxldCBjb25maWd1cmF0aW9uID0gPElMYW5ndWFnZUNvbmZpZ3VyYXRpb24+cGFyc2UoY29udGVudHMsIGVycm9ycyk7XG5cdFx0XHRpZiAoZXJyb3JzLmxlbmd0aCkge1xuXHRcdFx0XHRjb25zb2xlLmVycm9yKG5scy5sb2NhbGl6ZSgncGFyc2VFcnJvcnMnLCBcIkVycm9ycyBwYXJzaW5nIHswfTogezF9XCIsIGNvbmZpZ0ZpbGVMb2NhdGlvbi50b1N0cmluZygpLCBlcnJvcnMubWFwKGUgPT4gKGBbJHtlLm9mZnNldH0sICR7ZS5sZW5ndGh9XSAke2dldFBhcnNlRXJyb3JNZXNzYWdlKGUuZXJyb3IpfWApKS5qb2luKCdcXG4nKSkpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGdldE5vZGVUeXBlKGNvbmZpZ3VyYXRpb24pICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0XHRjb25zb2xlLmVycm9yKG5scy5sb2NhbGl6ZSgnZm9ybWF0RXJyb3InLCBcInswfTogSW52YWxpZCBmb3JtYXQsIEpTT04gb2JqZWN0IGV4cGVjdGVkLlwiLCBjb25maWdGaWxlTG9jYXRpb24udG9TdHJpbmcoKSkpO1xuXHRcdFx0XHRjb25maWd1cmF0aW9uID0ge307XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gY29uZmlndXJhdGlvbjtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoZXJyKTtcblx0XHRcdHJldHVybiB7fTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfZXh0cmFjdFZhbGlkQ29tbWVudFJ1bGUobGFuZ3VhZ2VJZDogc3RyaW5nLCBjb25maWd1cmF0aW9uOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uKTogQ29tbWVudFJ1bGUgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHNvdXJjZSA9IGNvbmZpZ3VyYXRpb24uY29tbWVudHM7XG5cdFx0aWYgKHR5cGVvZiBzb3VyY2UgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAoIXR5cGVzLmlzT2JqZWN0KHNvdXJjZSkpIHtcblx0XHRcdGNvbnNvbGUud2FybihgWyR7bGFuZ3VhZ2VJZH1dOiBsYW5ndWFnZSBjb25maWd1cmF0aW9uOiBleHBlY3RlZCBcXGBjb21tZW50c1xcYCB0byBiZSBhbiBvYmplY3QuYCk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGxldCByZXN1bHQ6IENvbW1lbnRSdWxlIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGlmICh0eXBlb2Ygc291cmNlLmxpbmVDb21tZW50ICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0aWYgKHR5cGVvZiBzb3VyY2UubGluZUNvbW1lbnQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdHJlc3VsdCA9IHJlc3VsdCB8fCB7fTtcblx0XHRcdFx0cmVzdWx0LmxpbmVDb21tZW50ID0gc291cmNlLmxpbmVDb21tZW50O1xuXHRcdFx0fSBlbHNlIGlmICh0eXBlcy5pc09iamVjdChzb3VyY2UubGluZUNvbW1lbnQpKSB7XG5cdFx0XHRcdGNvbnN0IGxpbmVDb21tZW50T2JqID0gc291cmNlLmxpbmVDb21tZW50O1xuXHRcdFx0XHRpZiAodHlwZW9mIGxpbmVDb21tZW50T2JqLmNvbW1lbnQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0cmVzdWx0ID0gcmVzdWx0IHx8IHt9O1xuXHRcdFx0XHRcdHJlc3VsdC5saW5lQ29tbWVudCA9IHtcblx0XHRcdFx0XHRcdGNvbW1lbnQ6IGxpbmVDb21tZW50T2JqLmNvbW1lbnQsXG5cdFx0XHRcdFx0XHRub0luZGVudDogbGluZUNvbW1lbnRPYmoubm9JbmRlbnRcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnNvbGUud2FybihgWyR7bGFuZ3VhZ2VJZH1dOiBsYW5ndWFnZSBjb25maWd1cmF0aW9uOiBleHBlY3RlZCBcXGBjb21tZW50cy5saW5lQ29tbWVudC5jb21tZW50XFxgIHRvIGJlIGEgc3RyaW5nLmApO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zb2xlLndhcm4oYFske2xhbmd1YWdlSWR9XTogbGFuZ3VhZ2UgY29uZmlndXJhdGlvbjogZXhwZWN0ZWQgXFxgY29tbWVudHMubGluZUNvbW1lbnRcXGAgdG8gYmUgYSBzdHJpbmcgb3IgYW4gb2JqZWN0IHdpdGggY29tbWVudCBwcm9wZXJ0eS5gKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBzb3VyY2UuYmxvY2tDb21tZW50ICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0aWYgKCFpc0NoYXJhY3RlclBhaXIoc291cmNlLmJsb2NrQ29tbWVudCkpIHtcblx0XHRcdFx0Y29uc29sZS53YXJuKGBbJHtsYW5ndWFnZUlkfV06IGxhbmd1YWdlIGNvbmZpZ3VyYXRpb246IGV4cGVjdGVkIFxcYGNvbW1lbnRzLmJsb2NrQ29tbWVudFxcYCB0byBiZSBhbiBhcnJheSBvZiB0d28gc3RyaW5ncy5gKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlc3VsdCA9IHJlc3VsdCB8fCB7fTtcblx0XHRcdFx0cmVzdWx0LmJsb2NrQ29tbWVudCA9IHNvdXJjZS5ibG9ja0NvbW1lbnQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfZXh0cmFjdFZhbGlkQnJhY2tldHMobGFuZ3VhZ2VJZDogc3RyaW5nLCBjb25maWd1cmF0aW9uOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uKTogQ2hhcmFjdGVyUGFpcltdIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzb3VyY2UgPSBjb25maWd1cmF0aW9uLmJyYWNrZXRzO1xuXHRcdGlmICh0eXBlb2Ygc291cmNlID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKCFBcnJheS5pc0FycmF5KHNvdXJjZSkpIHtcblx0XHRcdGNvbnNvbGUud2FybihgWyR7bGFuZ3VhZ2VJZH1dOiBsYW5ndWFnZSBjb25maWd1cmF0aW9uOiBleHBlY3RlZCBcXGBicmFja2V0c1xcYCB0byBiZSBhbiBhcnJheS5gKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0bGV0IHJlc3VsdDogQ2hhcmFjdGVyUGFpcltdIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBzb3VyY2UubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IHBhaXIgPSBzb3VyY2VbaV07XG5cdFx0XHRpZiAoIWlzQ2hhcmFjdGVyUGFpcihwYWlyKSkge1xuXHRcdFx0XHRjb25zb2xlLndhcm4oYFske2xhbmd1YWdlSWR9XTogbGFuZ3VhZ2UgY29uZmlndXJhdGlvbjogZXhwZWN0ZWQgXFxgYnJhY2tldHNbJHtpfV1cXGAgdG8gYmUgYW4gYXJyYXkgb2YgdHdvIHN0cmluZ3MuYCk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXN1bHQgPSByZXN1bHQgfHwgW107XG5cdFx0XHRyZXN1bHQucHVzaChwYWlyKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9leHRyYWN0VmFsaWRBdXRvQ2xvc2luZ1BhaXJzKGxhbmd1YWdlSWQ6IHN0cmluZywgY29uZmlndXJhdGlvbjogSUxhbmd1YWdlQ29uZmlndXJhdGlvbik6IElBdXRvQ2xvc2luZ1BhaXJDb25kaXRpb25hbFtdIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzb3VyY2UgPSBjb25maWd1cmF0aW9uLmF1dG9DbG9zaW5nUGFpcnM7XG5cdFx0aWYgKHR5cGVvZiBzb3VyY2UgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAoIUFycmF5LmlzQXJyYXkoc291cmNlKSkge1xuXHRcdFx0Y29uc29sZS53YXJuKGBbJHtsYW5ndWFnZUlkfV06IGxhbmd1YWdlIGNvbmZpZ3VyYXRpb246IGV4cGVjdGVkIFxcYGF1dG9DbG9zaW5nUGFpcnNcXGAgdG8gYmUgYW4gYXJyYXkuYCk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGxldCByZXN1bHQ6IElBdXRvQ2xvc2luZ1BhaXJDb25kaXRpb25hbFtdIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBzb3VyY2UubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IHBhaXIgPSBzb3VyY2VbaV07XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheShwYWlyKSkge1xuXHRcdFx0XHRpZiAoIWlzQ2hhcmFjdGVyUGFpcihwYWlyKSkge1xuXHRcdFx0XHRcdGNvbnNvbGUud2FybihgWyR7bGFuZ3VhZ2VJZH1dOiBsYW5ndWFnZSBjb25maWd1cmF0aW9uOiBleHBlY3RlZCBcXGBhdXRvQ2xvc2luZ1BhaXJzWyR7aX1dXFxgIHRvIGJlIGFuIGFycmF5IG9mIHR3byBzdHJpbmdzIG9yIGFuIG9iamVjdC5gKTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXN1bHQgPSByZXN1bHQgfHwgW107XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHsgb3BlbjogcGFpclswXSwgY2xvc2U6IHBhaXJbMV0gfSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoIXR5cGVzLmlzT2JqZWN0KHBhaXIpKSB7XG5cdFx0XHRcdFx0Y29uc29sZS53YXJuKGBbJHtsYW5ndWFnZUlkfV06IGxhbmd1YWdlIGNvbmZpZ3VyYXRpb246IGV4cGVjdGVkIFxcYGF1dG9DbG9zaW5nUGFpcnNbJHtpfV1cXGAgdG8gYmUgYW4gYXJyYXkgb2YgdHdvIHN0cmluZ3Mgb3IgYW4gb2JqZWN0LmApO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0eXBlb2YgcGFpci5vcGVuICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdGNvbnNvbGUud2FybihgWyR7bGFuZ3VhZ2VJZH1dOiBsYW5ndWFnZSBjb25maWd1cmF0aW9uOiBleHBlY3RlZCBcXGBhdXRvQ2xvc2luZ1BhaXJzWyR7aX1dLm9wZW5cXGAgdG8gYmUgYSBzdHJpbmcuYCk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHR5cGVvZiBwYWlyLmNsb3NlICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdGNvbnNvbGUud2FybihgWyR7bGFuZ3VhZ2VJZH1dOiBsYW5ndWFnZSBjb25maWd1cmF0aW9uOiBleHBlY3RlZCBcXGBhdXRvQ2xvc2luZ1BhaXJzWyR7aX1dLmNsb3NlXFxgIHRvIGJlIGEgc3RyaW5nLmApO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0eXBlb2YgcGFpci5ub3RJbiAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdFx0XHRpZiAoIWlzU3RyaW5nQXJyKHBhaXIubm90SW4pKSB7XG5cdFx0XHRcdFx0XHRjb25zb2xlLndhcm4oYFske2xhbmd1YWdlSWR9XTogbGFuZ3VhZ2UgY29uZmlndXJhdGlvbjogZXhwZWN0ZWQgXFxgYXV0b0Nsb3NpbmdQYWlyc1ske2l9XS5ub3RJblxcYCB0byBiZSBhIHN0cmluZyBhcnJheS5gKTtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXN1bHQgPSByZXN1bHQgfHwgW107XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHsgb3BlbjogcGFpci5vcGVuLCBjbG9zZTogcGFpci5jbG9zZSwgbm90SW46IHBhaXIubm90SW4gfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfZXh0cmFjdFZhbGlkU3Vycm91bmRpbmdQYWlycyhsYW5ndWFnZUlkOiBzdHJpbmcsIGNvbmZpZ3VyYXRpb246IElMYW5ndWFnZUNvbmZpZ3VyYXRpb24pOiBJQXV0b0Nsb3NpbmdQYWlyW10gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHNvdXJjZSA9IGNvbmZpZ3VyYXRpb24uc3Vycm91bmRpbmdQYWlycztcblx0XHRpZiAodHlwZW9mIHNvdXJjZSA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICghQXJyYXkuaXNBcnJheShzb3VyY2UpKSB7XG5cdFx0XHRjb25zb2xlLndhcm4oYFske2xhbmd1YWdlSWR9XTogbGFuZ3VhZ2UgY29uZmlndXJhdGlvbjogZXhwZWN0ZWQgXFxgc3Vycm91bmRpbmdQYWlyc1xcYCB0byBiZSBhbiBhcnJheS5gKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0bGV0IHJlc3VsdDogSUF1dG9DbG9zaW5nUGFpcltdIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBzb3VyY2UubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IHBhaXIgPSBzb3VyY2VbaV07XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheShwYWlyKSkge1xuXHRcdFx0XHRpZiAoIWlzQ2hhcmFjdGVyUGFpcihwYWlyKSkge1xuXHRcdFx0XHRcdGNvbnNvbGUud2FybihgWyR7bGFuZ3VhZ2VJZH1dOiBsYW5ndWFnZSBjb25maWd1cmF0aW9uOiBleHBlY3RlZCBcXGBzdXJyb3VuZGluZ1BhaXJzWyR7aX1dXFxgIHRvIGJlIGFuIGFycmF5IG9mIHR3byBzdHJpbmdzIG9yIGFuIG9iamVjdC5gKTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXN1bHQgPSByZXN1bHQgfHwgW107XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHsgb3BlbjogcGFpclswXSwgY2xvc2U6IHBhaXJbMV0gfSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoIXR5cGVzLmlzT2JqZWN0KHBhaXIpKSB7XG5cdFx0XHRcdFx0Y29uc29sZS53YXJuKGBbJHtsYW5ndWFnZUlkfV06IGxhbmd1YWdlIGNvbmZpZ3VyYXRpb246IGV4cGVjdGVkIFxcYHN1cnJvdW5kaW5nUGFpcnNbJHtpfV1cXGAgdG8gYmUgYW4gYXJyYXkgb2YgdHdvIHN0cmluZ3Mgb3IgYW4gb2JqZWN0LmApO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0eXBlb2YgcGFpci5vcGVuICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdGNvbnNvbGUud2FybihgWyR7bGFuZ3VhZ2VJZH1dOiBsYW5ndWFnZSBjb25maWd1cmF0aW9uOiBleHBlY3RlZCBcXGBzdXJyb3VuZGluZ1BhaXJzWyR7aX1dLm9wZW5cXGAgdG8gYmUgYSBzdHJpbmcuYCk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHR5cGVvZiBwYWlyLmNsb3NlICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdGNvbnNvbGUud2FybihgWyR7bGFuZ3VhZ2VJZH1dOiBsYW5ndWFnZSBjb25maWd1cmF0aW9uOiBleHBlY3RlZCBcXGBzdXJyb3VuZGluZ1BhaXJzWyR7aX1dLmNsb3NlXFxgIHRvIGJlIGEgc3RyaW5nLmApO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJlc3VsdCA9IHJlc3VsdCB8fCBbXTtcblx0XHRcdFx0cmVzdWx0LnB1c2goeyBvcGVuOiBwYWlyLm9wZW4sIGNsb3NlOiBwYWlyLmNsb3NlIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2V4dHJhY3RWYWxpZENvbG9yaXplZEJyYWNrZXRQYWlycyhsYW5ndWFnZUlkOiBzdHJpbmcsIGNvbmZpZ3VyYXRpb246IElMYW5ndWFnZUNvbmZpZ3VyYXRpb24pOiBDaGFyYWN0ZXJQYWlyW10gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHNvdXJjZSA9IGNvbmZpZ3VyYXRpb24uY29sb3JpemVkQnJhY2tldFBhaXJzO1xuXHRcdGlmICh0eXBlb2Ygc291cmNlID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKCFBcnJheS5pc0FycmF5KHNvdXJjZSkpIHtcblx0XHRcdGNvbnNvbGUud2FybihgWyR7bGFuZ3VhZ2VJZH1dOiBsYW5ndWFnZSBjb25maWd1cmF0aW9uOiBleHBlY3RlZCBcXGBjb2xvcml6ZWRCcmFja2V0UGFpcnNcXGAgdG8gYmUgYW4gYXJyYXkuYCk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdDogQ2hhcmFjdGVyUGFpcltdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHNvdXJjZS5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgcGFpciA9IHNvdXJjZVtpXTtcblx0XHRcdGlmICghaXNDaGFyYWN0ZXJQYWlyKHBhaXIpKSB7XG5cdFx0XHRcdGNvbnNvbGUud2FybihgWyR7bGFuZ3VhZ2VJZH1dOiBsYW5ndWFnZSBjb25maWd1cmF0aW9uOiBleHBlY3RlZCBcXGBjb2xvcml6ZWRCcmFja2V0UGFpcnNbJHtpfV1cXGAgdG8gYmUgYW4gYXJyYXkgb2YgdHdvIHN0cmluZ3MuYCk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0cmVzdWx0LnB1c2goW3BhaXJbMF0sIHBhaXJbMV1dKTtcblxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2V4dHJhY3RWYWxpZE9uRW50ZXJSdWxlcyhsYW5ndWFnZUlkOiBzdHJpbmcsIGNvbmZpZ3VyYXRpb246IElMYW5ndWFnZUNvbmZpZ3VyYXRpb24pOiBPbkVudGVyUnVsZVtdIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzb3VyY2UgPSBjb25maWd1cmF0aW9uLm9uRW50ZXJSdWxlcztcblx0XHRpZiAodHlwZW9mIHNvdXJjZSA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICghQXJyYXkuaXNBcnJheShzb3VyY2UpKSB7XG5cdFx0XHRjb25zb2xlLndhcm4oYFske2xhbmd1YWdlSWR9XTogbGFuZ3VhZ2UgY29uZmlndXJhdGlvbjogZXhwZWN0ZWQgXFxgb25FbnRlclJ1bGVzXFxgIHRvIGJlIGFuIGFycmF5LmApO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRsZXQgcmVzdWx0OiBPbkVudGVyUnVsZVtdIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBzb3VyY2UubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IG9uRW50ZXJSdWxlID0gc291cmNlW2ldO1xuXHRcdFx0aWYgKCF0eXBlcy5pc09iamVjdChvbkVudGVyUnVsZSkpIHtcblx0XHRcdFx0Y29uc29sZS53YXJuKGBbJHtsYW5ndWFnZUlkfV06IGxhbmd1YWdlIGNvbmZpZ3VyYXRpb246IGV4cGVjdGVkIFxcYG9uRW50ZXJSdWxlc1ske2l9XVxcYCB0byBiZSBhbiBvYmplY3QuYCk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCF0eXBlcy5pc09iamVjdChvbkVudGVyUnVsZS5hY3Rpb24pKSB7XG5cdFx0XHRcdGNvbnNvbGUud2FybihgWyR7bGFuZ3VhZ2VJZH1dOiBsYW5ndWFnZSBjb25maWd1cmF0aW9uOiBleHBlY3RlZCBcXGBvbkVudGVyUnVsZXNbJHtpfV0uYWN0aW9uXFxgIHRvIGJlIGFuIG9iamVjdC5gKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRsZXQgaW5kZW50QWN0aW9uOiBJbmRlbnRBY3Rpb247XG5cdFx0XHRpZiAob25FbnRlclJ1bGUuYWN0aW9uLmluZGVudCA9PT0gJ25vbmUnKSB7XG5cdFx0XHRcdGluZGVudEFjdGlvbiA9IEluZGVudEFjdGlvbi5Ob25lO1xuXHRcdFx0fSBlbHNlIGlmIChvbkVudGVyUnVsZS5hY3Rpb24uaW5kZW50ID09PSAnaW5kZW50Jykge1xuXHRcdFx0XHRpbmRlbnRBY3Rpb24gPSBJbmRlbnRBY3Rpb24uSW5kZW50O1xuXHRcdFx0fSBlbHNlIGlmIChvbkVudGVyUnVsZS5hY3Rpb24uaW5kZW50ID09PSAnaW5kZW50T3V0ZGVudCcpIHtcblx0XHRcdFx0aW5kZW50QWN0aW9uID0gSW5kZW50QWN0aW9uLkluZGVudE91dGRlbnQ7XG5cdFx0XHR9IGVsc2UgaWYgKG9uRW50ZXJSdWxlLmFjdGlvbi5pbmRlbnQgPT09ICdvdXRkZW50Jykge1xuXHRcdFx0XHRpbmRlbnRBY3Rpb24gPSBJbmRlbnRBY3Rpb24uT3V0ZGVudDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnNvbGUud2FybihgWyR7bGFuZ3VhZ2VJZH1dOiBsYW5ndWFnZSBjb25maWd1cmF0aW9uOiBleHBlY3RlZCBcXGBvbkVudGVyUnVsZXNbJHtpfV0uYWN0aW9uLmluZGVudFxcYCB0byBiZSAnbm9uZScsICdpbmRlbnQnLCAnaW5kZW50T3V0ZGVudCcgb3IgJ291dGRlbnQnLmApO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGFjdGlvbjogRW50ZXJBY3Rpb24gPSB7IGluZGVudEFjdGlvbiB9O1xuXHRcdFx0aWYgKG9uRW50ZXJSdWxlLmFjdGlvbi5hcHBlbmRUZXh0KSB7XG5cdFx0XHRcdGlmICh0eXBlb2Ygb25FbnRlclJ1bGUuYWN0aW9uLmFwcGVuZFRleHQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0YWN0aW9uLmFwcGVuZFRleHQgPSBvbkVudGVyUnVsZS5hY3Rpb24uYXBwZW5kVGV4dDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zb2xlLndhcm4oYFske2xhbmd1YWdlSWR9XTogbGFuZ3VhZ2UgY29uZmlndXJhdGlvbjogZXhwZWN0ZWQgXFxgb25FbnRlclJ1bGVzWyR7aX1dLmFjdGlvbi5hcHBlbmRUZXh0XFxgIHRvIGJlIHVuZGVmaW5lZCBvciBhIHN0cmluZy5gKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKG9uRW50ZXJSdWxlLmFjdGlvbi5yZW1vdmVUZXh0KSB7XG5cdFx0XHRcdGlmICh0eXBlb2Ygb25FbnRlclJ1bGUuYWN0aW9uLnJlbW92ZVRleHQgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0YWN0aW9uLnJlbW92ZVRleHQgPSBvbkVudGVyUnVsZS5hY3Rpb24ucmVtb3ZlVGV4dDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zb2xlLndhcm4oYFske2xhbmd1YWdlSWR9XTogbGFuZ3VhZ2UgY29uZmlndXJhdGlvbjogZXhwZWN0ZWQgXFxgb25FbnRlclJ1bGVzWyR7aX1dLmFjdGlvbi5yZW1vdmVUZXh0XFxgIHRvIGJlIHVuZGVmaW5lZCBvciBhIG51bWJlci5gKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYmVmb3JlVGV4dCA9IHRoaXMuX3BhcnNlUmVnZXgobGFuZ3VhZ2VJZCwgYG9uRW50ZXJSdWxlc1ske2l9XS5iZWZvcmVUZXh0YCwgb25FbnRlclJ1bGUuYmVmb3JlVGV4dCk7XG5cdFx0XHRpZiAoIWJlZm9yZVRleHQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXN1bHRpbmdPbkVudGVyUnVsZTogT25FbnRlclJ1bGUgPSB7IGJlZm9yZVRleHQsIGFjdGlvbiB9O1xuXHRcdFx0aWYgKG9uRW50ZXJSdWxlLmFmdGVyVGV4dCkge1xuXHRcdFx0XHRjb25zdCBhZnRlclRleHQgPSB0aGlzLl9wYXJzZVJlZ2V4KGxhbmd1YWdlSWQsIGBvbkVudGVyUnVsZXNbJHtpfV0uYWZ0ZXJUZXh0YCwgb25FbnRlclJ1bGUuYWZ0ZXJUZXh0KTtcblx0XHRcdFx0aWYgKGFmdGVyVGV4dCkge1xuXHRcdFx0XHRcdHJlc3VsdGluZ09uRW50ZXJSdWxlLmFmdGVyVGV4dCA9IGFmdGVyVGV4dDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKG9uRW50ZXJSdWxlLnByZXZpb3VzTGluZVRleHQpIHtcblx0XHRcdFx0Y29uc3QgcHJldmlvdXNMaW5lVGV4dCA9IHRoaXMuX3BhcnNlUmVnZXgobGFuZ3VhZ2VJZCwgYG9uRW50ZXJSdWxlc1ske2l9XS5wcmV2aW91c0xpbmVUZXh0YCwgb25FbnRlclJ1bGUucHJldmlvdXNMaW5lVGV4dCk7XG5cdFx0XHRcdGlmIChwcmV2aW91c0xpbmVUZXh0KSB7XG5cdFx0XHRcdFx0cmVzdWx0aW5nT25FbnRlclJ1bGUucHJldmlvdXNMaW5lVGV4dCA9IHByZXZpb3VzTGluZVRleHQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJlc3VsdCA9IHJlc3VsdCB8fCBbXTtcblx0XHRcdHJlc3VsdC5wdXNoKHJlc3VsdGluZ09uRW50ZXJSdWxlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBleHRyYWN0VmFsaWRDb25maWcobGFuZ3VhZ2VJZDogc3RyaW5nLCBjb25maWd1cmF0aW9uOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uKTogRXhwbGljaXRMYW5ndWFnZUNvbmZpZ3VyYXRpb24ge1xuXG5cdFx0Y29uc3QgY29tbWVudHMgPSB0aGlzLl9leHRyYWN0VmFsaWRDb21tZW50UnVsZShsYW5ndWFnZUlkLCBjb25maWd1cmF0aW9uKTtcblx0XHRjb25zdCBicmFja2V0cyA9IHRoaXMuX2V4dHJhY3RWYWxpZEJyYWNrZXRzKGxhbmd1YWdlSWQsIGNvbmZpZ3VyYXRpb24pO1xuXHRcdGNvbnN0IGF1dG9DbG9zaW5nUGFpcnMgPSB0aGlzLl9leHRyYWN0VmFsaWRBdXRvQ2xvc2luZ1BhaXJzKGxhbmd1YWdlSWQsIGNvbmZpZ3VyYXRpb24pO1xuXHRcdGNvbnN0IHN1cnJvdW5kaW5nUGFpcnMgPSB0aGlzLl9leHRyYWN0VmFsaWRTdXJyb3VuZGluZ1BhaXJzKGxhbmd1YWdlSWQsIGNvbmZpZ3VyYXRpb24pO1xuXHRcdGNvbnN0IGNvbG9yaXplZEJyYWNrZXRQYWlycyA9IHRoaXMuX2V4dHJhY3RWYWxpZENvbG9yaXplZEJyYWNrZXRQYWlycyhsYW5ndWFnZUlkLCBjb25maWd1cmF0aW9uKTtcblx0XHRjb25zdCBhdXRvQ2xvc2VCZWZvcmUgPSAodHlwZW9mIGNvbmZpZ3VyYXRpb24uYXV0b0Nsb3NlQmVmb3JlID09PSAnc3RyaW5nJyA/IGNvbmZpZ3VyYXRpb24uYXV0b0Nsb3NlQmVmb3JlIDogdW5kZWZpbmVkKTtcblx0XHRjb25zdCB3b3JkUGF0dGVybiA9IChjb25maWd1cmF0aW9uLndvcmRQYXR0ZXJuID8gdGhpcy5fcGFyc2VSZWdleChsYW5ndWFnZUlkLCBgd29yZFBhdHRlcm5gLCBjb25maWd1cmF0aW9uLndvcmRQYXR0ZXJuKSA6IHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgaW5kZW50YXRpb25SdWxlcyA9IChjb25maWd1cmF0aW9uLmluZGVudGF0aW9uUnVsZXMgPyB0aGlzLl9tYXBJbmRlbnRhdGlvblJ1bGVzKGxhbmd1YWdlSWQsIGNvbmZpZ3VyYXRpb24uaW5kZW50YXRpb25SdWxlcykgOiB1bmRlZmluZWQpO1xuXHRcdGxldCBmb2xkaW5nOiBGb2xkaW5nUnVsZXMgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKGNvbmZpZ3VyYXRpb24uZm9sZGluZykge1xuXHRcdFx0Y29uc3QgcmF3TWFya2VycyA9IGNvbmZpZ3VyYXRpb24uZm9sZGluZy5tYXJrZXJzO1xuXHRcdFx0Y29uc3Qgc3RhcnRNYXJrZXIgPSAocmF3TWFya2VycyAmJiByYXdNYXJrZXJzLnN0YXJ0ID8gdGhpcy5fcGFyc2VSZWdleChsYW5ndWFnZUlkLCBgZm9sZGluZy5tYXJrZXJzLnN0YXJ0YCwgcmF3TWFya2Vycy5zdGFydCkgOiB1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3QgZW5kTWFya2VyID0gKHJhd01hcmtlcnMgJiYgcmF3TWFya2Vycy5lbmQgPyB0aGlzLl9wYXJzZVJlZ2V4KGxhbmd1YWdlSWQsIGBmb2xkaW5nLm1hcmtlcnMuZW5kYCwgcmF3TWFya2Vycy5lbmQpIDogdW5kZWZpbmVkKTtcblx0XHRcdGNvbnN0IG1hcmtlcnM6IEZvbGRpbmdNYXJrZXJzIHwgdW5kZWZpbmVkID0gKHN0YXJ0TWFya2VyICYmIGVuZE1hcmtlciA/IHsgc3RhcnQ6IHN0YXJ0TWFya2VyLCBlbmQ6IGVuZE1hcmtlciB9IDogdW5kZWZpbmVkKTtcblx0XHRcdGZvbGRpbmcgPSB7XG5cdFx0XHRcdG9mZlNpZGU6IGNvbmZpZ3VyYXRpb24uZm9sZGluZy5vZmZTaWRlLFxuXHRcdFx0XHRtYXJrZXJzXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRjb25zdCBvbkVudGVyUnVsZXMgPSB0aGlzLl9leHRyYWN0VmFsaWRPbkVudGVyUnVsZXMobGFuZ3VhZ2VJZCwgY29uZmlndXJhdGlvbik7XG5cblx0XHRjb25zdCByaWNoRWRpdENvbmZpZzogRXhwbGljaXRMYW5ndWFnZUNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHRjb21tZW50cyxcblx0XHRcdGJyYWNrZXRzLFxuXHRcdFx0d29yZFBhdHRlcm4sXG5cdFx0XHRpbmRlbnRhdGlvblJ1bGVzLFxuXHRcdFx0b25FbnRlclJ1bGVzLFxuXHRcdFx0YXV0b0Nsb3NpbmdQYWlycyxcblx0XHRcdHN1cnJvdW5kaW5nUGFpcnMsXG5cdFx0XHRjb2xvcml6ZWRCcmFja2V0UGFpcnMsXG5cdFx0XHRhdXRvQ2xvc2VCZWZvcmUsXG5cdFx0XHRmb2xkaW5nLFxuXHRcdFx0X19lbGVjdHJpY0NoYXJhY3RlclN1cHBvcnQ6IHVuZGVmaW5lZCxcblx0XHR9O1xuXHRcdHJldHVybiByaWNoRWRpdENvbmZpZztcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZUNvbmZpZyhsYW5ndWFnZUlkOiBzdHJpbmcsIGNvbmZpZ3VyYXRpb246IElMYW5ndWFnZUNvbmZpZ3VyYXRpb24pOiB2b2lkIHtcblx0XHRjb25zdCByaWNoRWRpdENvbmZpZyA9IExhbmd1YWdlQ29uZmlndXJhdGlvbkZpbGVIYW5kbGVyLmV4dHJhY3RWYWxpZENvbmZpZyhsYW5ndWFnZUlkLCBjb25maWd1cmF0aW9uKTtcblx0XHR0aGlzLl9sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLnJlZ2lzdGVyKGxhbmd1YWdlSWQsIHJpY2hFZGl0Q29uZmlnLCA1MCk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfcGFyc2VSZWdleChsYW5ndWFnZUlkOiBzdHJpbmcsIGNvbmZQYXRoOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcgfCBJUmVnRXhwKTogUmVnRXhwIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmV0dXJuIG5ldyBSZWdFeHAodmFsdWUsICcnKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRjb25zb2xlLndhcm4oYFske2xhbmd1YWdlSWR9XTogSW52YWxpZCByZWd1bGFyIGV4cHJlc3Npb24gaW4gXFxgJHtjb25mUGF0aH1cXGA6IGAsIGVycik7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICh0eXBlcy5pc09iamVjdCh2YWx1ZSkpIHtcblx0XHRcdGlmICh0eXBlb2YgdmFsdWUucGF0dGVybiAhPT0gJ3N0cmluZycpIHtcblx0XHRcdFx0Y29uc29sZS53YXJuKGBbJHtsYW5ndWFnZUlkfV06IGxhbmd1YWdlIGNvbmZpZ3VyYXRpb246IGV4cGVjdGVkIFxcYCR7Y29uZlBhdGh9LnBhdHRlcm5cXGAgdG8gYmUgYSBzdHJpbmcuYCk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAodHlwZW9mIHZhbHVlLmZsYWdzICE9PSAndW5kZWZpbmVkJyAmJiB0eXBlb2YgdmFsdWUuZmxhZ3MgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGNvbnNvbGUud2FybihgWyR7bGFuZ3VhZ2VJZH1dOiBsYW5ndWFnZSBjb25maWd1cmF0aW9uOiBleHBlY3RlZCBcXGAke2NvbmZQYXRofS5mbGFnc1xcYCB0byBiZSBhIHN0cmluZy5gKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJldHVybiBuZXcgUmVnRXhwKHZhbHVlLnBhdHRlcm4sIHZhbHVlLmZsYWdzKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRjb25zb2xlLndhcm4oYFske2xhbmd1YWdlSWR9XTogSW52YWxpZCByZWd1bGFyIGV4cHJlc3Npb24gaW4gXFxgJHtjb25mUGF0aH1cXGA6IGAsIGVycik7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnNvbGUud2FybihgWyR7bGFuZ3VhZ2VJZH1dOiBsYW5ndWFnZSBjb25maWd1cmF0aW9uOiBleHBlY3RlZCBcXGAke2NvbmZQYXRofVxcYCB0byBiZSBhIHN0cmluZyBvciBhbiBvYmplY3QuYCk7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9tYXBJbmRlbnRhdGlvblJ1bGVzKGxhbmd1YWdlSWQ6IHN0cmluZywgaW5kZW50YXRpb25SdWxlczogSUluZGVudGF0aW9uUnVsZXMpOiBJbmRlbnRhdGlvblJ1bGUgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGluY3JlYXNlSW5kZW50UGF0dGVybiA9IHRoaXMuX3BhcnNlUmVnZXgobGFuZ3VhZ2VJZCwgYGluZGVudGF0aW9uUnVsZXMuaW5jcmVhc2VJbmRlbnRQYXR0ZXJuYCwgaW5kZW50YXRpb25SdWxlcy5pbmNyZWFzZUluZGVudFBhdHRlcm4pO1xuXHRcdGlmICghaW5jcmVhc2VJbmRlbnRQYXR0ZXJuKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBkZWNyZWFzZUluZGVudFBhdHRlcm4gPSB0aGlzLl9wYXJzZVJlZ2V4KGxhbmd1YWdlSWQsIGBpbmRlbnRhdGlvblJ1bGVzLmRlY3JlYXNlSW5kZW50UGF0dGVybmAsIGluZGVudGF0aW9uUnVsZXMuZGVjcmVhc2VJbmRlbnRQYXR0ZXJuKTtcblx0XHRpZiAoIWRlY3JlYXNlSW5kZW50UGF0dGVybikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQ6IEluZGVudGF0aW9uUnVsZSA9IHtcblx0XHRcdGluY3JlYXNlSW5kZW50UGF0dGVybjogaW5jcmVhc2VJbmRlbnRQYXR0ZXJuLFxuXHRcdFx0ZGVjcmVhc2VJbmRlbnRQYXR0ZXJuOiBkZWNyZWFzZUluZGVudFBhdHRlcm5cblx0XHR9O1xuXG5cdFx0aWYgKGluZGVudGF0aW9uUnVsZXMuaW5kZW50TmV4dExpbmVQYXR0ZXJuKSB7XG5cdFx0XHRyZXN1bHQuaW5kZW50TmV4dExpbmVQYXR0ZXJuID0gdGhpcy5fcGFyc2VSZWdleChsYW5ndWFnZUlkLCBgaW5kZW50YXRpb25SdWxlcy5pbmRlbnROZXh0TGluZVBhdHRlcm5gLCBpbmRlbnRhdGlvblJ1bGVzLmluZGVudE5leHRMaW5lUGF0dGVybik7XG5cdFx0fVxuXHRcdGlmIChpbmRlbnRhdGlvblJ1bGVzLnVuSW5kZW50ZWRMaW5lUGF0dGVybikge1xuXHRcdFx0cmVzdWx0LnVuSW5kZW50ZWRMaW5lUGF0dGVybiA9IHRoaXMuX3BhcnNlUmVnZXgobGFuZ3VhZ2VJZCwgYGluZGVudGF0aW9uUnVsZXMudW5JbmRlbnRlZExpbmVQYXR0ZXJuYCwgaW5kZW50YXRpb25SdWxlcy51bkluZGVudGVkTGluZVBhdHRlcm4pO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cblxuY29uc3Qgc2NoZW1hSWQgPSAndnNjb2RlOi8vc2NoZW1hcy9sYW5ndWFnZS1jb25maWd1cmF0aW9uJztcbmNvbnN0IHNjaGVtYTogSUpTT05TY2hlbWEgPSB7XG5cdGFsbG93Q29tbWVudHM6IHRydWUsXG5cdGFsbG93VHJhaWxpbmdDb21tYXM6IHRydWUsXG5cdGRlZmF1bHQ6IHtcblx0XHRjb21tZW50czoge1xuXHRcdFx0YmxvY2tDb21tZW50OiBbJy8qJywgJyovJ10sXG5cdFx0XHRsaW5lQ29tbWVudDogJy8vJ1xuXHRcdH0sXG5cdFx0YnJhY2tldHM6IFtbJygnLCAnKSddLCBbJ1snLCAnXSddLCBbJ3snLCAnfSddXSxcblx0XHRhdXRvQ2xvc2luZ1BhaXJzOiBbWycoJywgJyknXSwgWydbJywgJ10nXSwgWyd7JywgJ30nXV0sXG5cdFx0c3Vycm91bmRpbmdQYWlyczogW1snKCcsICcpJ10sIFsnWycsICddJ10sIFsneycsICd9J11dXG5cdH0sXG5cdGRlZmluaXRpb25zOiB7XG5cdFx0b3BlbkJyYWNrZXQ6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLm9wZW5CcmFja2V0JywgJ1RoZSBvcGVuaW5nIGJyYWNrZXQgY2hhcmFjdGVyIG9yIHN0cmluZyBzZXF1ZW5jZS4nKVxuXHRcdH0sXG5cdFx0Y2xvc2VCcmFja2V0OiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5jbG9zZUJyYWNrZXQnLCAnVGhlIGNsb3NpbmcgYnJhY2tldCBjaGFyYWN0ZXIgb3Igc3RyaW5nIHNlcXVlbmNlLicpXG5cdFx0fSxcblx0XHRicmFja2V0UGFpcjoge1xuXHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdGl0ZW1zOiBbe1xuXHRcdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy9vcGVuQnJhY2tldCdcblx0XHRcdH0sIHtcblx0XHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvY2xvc2VCcmFja2V0J1xuXHRcdFx0fV1cblx0XHR9XG5cdH0sXG5cdHByb3BlcnRpZXM6IHtcblx0XHRjb21tZW50czoge1xuXHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHRibG9ja0NvbW1lbnQ6IFsnLyonLCAnKi8nXSxcblx0XHRcdFx0bGluZUNvbW1lbnQ6IHsgY29tbWVudDogJy8vJywgbm9JbmRlbnQ6IGZhbHNlIH1cblx0XHRcdH0sXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuY29tbWVudHMnLCAnRGVmaW5lcyB0aGUgY29tbWVudCBzeW1ib2xzJyksXG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0YmxvY2tDb21tZW50OiB7XG5cdFx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuYmxvY2tDb21tZW50cycsICdEZWZpbmVzIGhvdyBibG9jayBjb21tZW50cyBhcmUgbWFya2VkLicpLFxuXHRcdFx0XHRcdGl0ZW1zOiBbe1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuYmxvY2tDb21tZW50LmJlZ2luJywgJ1RoZSBjaGFyYWN0ZXIgc2VxdWVuY2UgdGhhdCBzdGFydHMgYSBibG9jayBjb21tZW50LicpXG5cdFx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuYmxvY2tDb21tZW50LmVuZCcsICdUaGUgY2hhcmFjdGVyIHNlcXVlbmNlIHRoYXQgZW5kcyBhIGJsb2NrIGNvbW1lbnQuJylcblx0XHRcdFx0XHR9XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRsaW5lQ29tbWVudDoge1xuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5saW5lQ29tbWVudC5vYmplY3QnLCAnQ29uZmlndXJhdGlvbiBmb3IgbGluZSBjb21tZW50cy4nKSxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRjb21tZW50OiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEubGluZUNvbW1lbnQuY29tbWVudCcsICdUaGUgY2hhcmFjdGVyIHNlcXVlbmNlIHRoYXQgc3RhcnRzIGEgbGluZSBjb21tZW50LicpXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0bm9JbmRlbnQ6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEubGluZUNvbW1lbnQubm9JbmRlbnQnLCAnV2hldGhlciB0aGUgY29tbWVudCB0b2tlbiBzaG91bGQgbm90IGJlIGluZGVudGVkIGFuZCBwbGFjZWQgYXQgdGhlIGZpcnN0IGNvbHVtbi4gRGVmYXVsdHMgdG8gZmFsc2UuJyksXG5cdFx0XHRcdFx0XHRcdGRlZmF1bHQ6IGZhbHNlXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRyZXF1aXJlZDogWydjb21tZW50J10sXG5cdFx0XHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LFxuXHRcdGJyYWNrZXRzOiB7XG5cdFx0XHRkZWZhdWx0OiBbWycoJywgJyknXSwgWydbJywgJ10nXSwgWyd7JywgJ30nXV0sXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5icmFja2V0cycsICdEZWZpbmVzIHRoZSBicmFja2V0IHN5bWJvbHMgdGhhdCBpbmNyZWFzZSBvciBkZWNyZWFzZSB0aGUgaW5kZW50YXRpb24uIFdoZW4gYnJhY2tldCBwYWlyIGNvbG9yaXphdGlvbiBpcyBlbmFibGVkIGFuZCB7MH0gaXMgbm90IGRlZmluZWQsIHRoaXMgYWxzbyBkZWZpbmVzIHRoZSBicmFja2V0IHBhaXJzIHRoYXQgYXJlIGNvbG9yaXplZCBieSB0aGVpciBuZXN0aW5nIGxldmVsLicsICdcXGBjb2xvcml6ZWRCcmFja2V0UGFpcnNcXGAnKSxcblx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRpdGVtczoge1xuXHRcdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy9icmFja2V0UGFpcidcblx0XHRcdH1cblx0XHR9LFxuXHRcdGNvbG9yaXplZEJyYWNrZXRQYWlyczoge1xuXHRcdFx0ZGVmYXVsdDogW1snKCcsICcpJ10sIFsnWycsICddJ10sIFsneycsICd9J11dLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuY29sb3JpemVkQnJhY2tldFBhaXJzJywgJ0RlZmluZXMgdGhlIGJyYWNrZXQgcGFpcnMgdGhhdCBhcmUgY29sb3JpemVkIGJ5IHRoZWlyIG5lc3RpbmcgbGV2ZWwgaWYgYnJhY2tldCBwYWlyIGNvbG9yaXphdGlvbiBpcyBlbmFibGVkLiBBbnkgYnJhY2tldHMgaW5jbHVkZWQgaGVyZSB0aGF0IGFyZSBub3QgaW5jbHVkZWQgaW4gezB9IHdpbGwgYmUgYXV0b21hdGljYWxseSBpbmNsdWRlZCBpbiB7MH0uJywgJ1xcYGJyYWNrZXRzXFxgJyksXG5cdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvYnJhY2tldFBhaXInXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRhdXRvQ2xvc2luZ1BhaXJzOiB7XG5cdFx0XHRkZWZhdWx0OiBbWycoJywgJyknXSwgWydbJywgJ10nXSwgWyd7JywgJ30nXV0sXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuYXV0b0Nsb3NpbmdQYWlycycsICdEZWZpbmVzIHRoZSBicmFja2V0IHBhaXJzLiBXaGVuIGEgb3BlbmluZyBicmFja2V0IGlzIGVudGVyZWQsIHRoZSBjbG9zaW5nIGJyYWNrZXQgaXMgaW5zZXJ0ZWQgYXV0b21hdGljYWxseS4nKSxcblx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRpdGVtczoge1xuXHRcdFx0XHRvbmVPZjogW3tcblx0XHRcdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy9icmFja2V0UGFpcidcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdG9wZW46IHtcblx0XHRcdFx0XHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvb3BlbkJyYWNrZXQnXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0Y2xvc2U6IHtcblx0XHRcdFx0XHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvY2xvc2VCcmFja2V0J1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdG5vdEluOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5hdXRvQ2xvc2luZ1BhaXJzLm5vdEluJywgJ0RlZmluZXMgYSBsaXN0IG9mIHNjb3BlcyB3aGVyZSB0aGUgYXV0byBwYWlycyBhcmUgZGlzYWJsZWQuJyksXG5cdFx0XHRcdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0XHRcdFx0ZW51bTogWydzdHJpbmcnLCAnY29tbWVudCddXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1dXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRhdXRvQ2xvc2VCZWZvcmU6IHtcblx0XHRcdGRlZmF1bHQ6ICc7Oi4sPX1dKT4gXFxuXFx0Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5hdXRvQ2xvc2VCZWZvcmUnLCAnRGVmaW5lcyB3aGF0IGNoYXJhY3RlcnMgbXVzdCBiZSBhZnRlciB0aGUgY3Vyc29yIGluIG9yZGVyIGZvciBicmFja2V0IG9yIHF1b3RlIGF1dG9jbG9zaW5nIHRvIG9jY3VyIHdoZW4gdXNpbmcgdGhlIFxcJ2xhbmd1YWdlRGVmaW5lZFxcJyBhdXRvY2xvc2luZyBzZXR0aW5nLiBUaGlzIGlzIHR5cGljYWxseSB0aGUgc2V0IG9mIGNoYXJhY3RlcnMgd2hpY2ggY2FuIG5vdCBzdGFydCBhbiBleHByZXNzaW9uLicpLFxuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0fSxcblx0XHRzdXJyb3VuZGluZ1BhaXJzOiB7XG5cdFx0XHRkZWZhdWx0OiBbWycoJywgJyknXSwgWydbJywgJ10nXSwgWyd7JywgJ30nXV0sXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuc3Vycm91bmRpbmdQYWlycycsICdEZWZpbmVzIHRoZSBicmFja2V0IHBhaXJzIHRoYXQgY2FuIGJlIHVzZWQgdG8gc3Vycm91bmQgYSBzZWxlY3RlZCBzdHJpbmcuJyksXG5cdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0b25lT2Y6IFt7XG5cdFx0XHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvYnJhY2tldFBhaXInXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRvcGVuOiB7XG5cdFx0XHRcdFx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL29wZW5CcmFja2V0J1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGNsb3NlOiB7XG5cdFx0XHRcdFx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL2Nsb3NlQnJhY2tldCdcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1dXG5cdFx0XHR9XG5cdFx0fSxcblx0XHR3b3JkUGF0dGVybjoge1xuXHRcdFx0ZGVmYXVsdDogJycsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEud29yZFBhdHRlcm4nLCAnRGVmaW5lcyB3aGF0IGlzIGNvbnNpZGVyZWQgdG8gYmUgYSB3b3JkIGluIHRoZSBwcm9ncmFtbWluZyBsYW5ndWFnZS4nKSxcblx0XHRcdHR5cGU6IFsnc3RyaW5nJywgJ29iamVjdCddLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRwYXR0ZXJuOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLndvcmRQYXR0ZXJuLnBhdHRlcm4nLCAnVGhlIFJlZ0V4cCBwYXR0ZXJuIHVzZWQgdG8gbWF0Y2ggd29yZHMuJyksXG5cdFx0XHRcdFx0ZGVmYXVsdDogJycsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGZsYWdzOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLndvcmRQYXR0ZXJuLmZsYWdzJywgJ1RoZSBSZWdFeHAgZmxhZ3MgdXNlZCB0byBtYXRjaCB3b3Jkcy4nKSxcblx0XHRcdFx0XHRkZWZhdWx0OiAnZycsXG5cdFx0XHRcdFx0cGF0dGVybjogJ14oW2dpbXV5XSspJCcsXG5cdFx0XHRcdFx0cGF0dGVybkVycm9yTWVzc2FnZTogbmxzLmxvY2FsaXplKCdzY2hlbWEud29yZFBhdHRlcm4uZmxhZ3MuZXJyb3JNZXNzYWdlJywgJ011c3QgbWF0Y2ggdGhlIHBhdHRlcm4gYC9eKFtnaW11eV0rKSQvYC4nKVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSxcblx0XHRpbmRlbnRhdGlvblJ1bGVzOiB7XG5cdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdGluY3JlYXNlSW5kZW50UGF0dGVybjogJycsXG5cdFx0XHRcdGRlY3JlYXNlSW5kZW50UGF0dGVybjogJydcblx0XHRcdH0sXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuaW5kZW50YXRpb25SdWxlcycsICdUaGUgbGFuZ3VhZ2VcXCdzIGluZGVudGF0aW9uIHNldHRpbmdzLicpLFxuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdGluY3JlYXNlSW5kZW50UGF0dGVybjoge1xuXHRcdFx0XHRcdHR5cGU6IFsnc3RyaW5nJywgJ29iamVjdCddLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5pbmRlbnRhdGlvblJ1bGVzLmluY3JlYXNlSW5kZW50UGF0dGVybicsICdJZiBhIGxpbmUgbWF0Y2hlcyB0aGlzIHBhdHRlcm4sIHRoZW4gYWxsIHRoZSBsaW5lcyBhZnRlciBpdCBzaG91bGQgYmUgaW5kZW50ZWQgb25jZSAodW50aWwgYW5vdGhlciBydWxlIG1hdGNoZXMpLicpLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdHBhdHRlcm46IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5pbmRlbnRhdGlvblJ1bGVzLmluY3JlYXNlSW5kZW50UGF0dGVybi5wYXR0ZXJuJywgJ1RoZSBSZWdFeHAgcGF0dGVybiBmb3IgaW5jcmVhc2VJbmRlbnRQYXR0ZXJuLicpLFxuXHRcdFx0XHRcdFx0XHRkZWZhdWx0OiAnJyxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRmbGFnczoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmluZGVudGF0aW9uUnVsZXMuaW5jcmVhc2VJbmRlbnRQYXR0ZXJuLmZsYWdzJywgJ1RoZSBSZWdFeHAgZmxhZ3MgZm9yIGluY3JlYXNlSW5kZW50UGF0dGVybi4nKSxcblx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogJycsXG5cdFx0XHRcdFx0XHRcdHBhdHRlcm46ICdeKFtnaW11eV0rKSQnLFxuXHRcdFx0XHRcdFx0XHRwYXR0ZXJuRXJyb3JNZXNzYWdlOiBubHMubG9jYWxpemUoJ3NjaGVtYS5pbmRlbnRhdGlvblJ1bGVzLmluY3JlYXNlSW5kZW50UGF0dGVybi5lcnJvck1lc3NhZ2UnLCAnTXVzdCBtYXRjaCB0aGUgcGF0dGVybiBgL14oW2dpbXV5XSspJC9gLicpXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRkZWNyZWFzZUluZGVudFBhdHRlcm46IHtcblx0XHRcdFx0XHR0eXBlOiBbJ3N0cmluZycsICdvYmplY3QnXSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuaW5kZW50YXRpb25SdWxlcy5kZWNyZWFzZUluZGVudFBhdHRlcm4nLCAnSWYgYSBsaW5lIG1hdGNoZXMgdGhpcyBwYXR0ZXJuLCB0aGVuIGFsbCB0aGUgbGluZXMgYWZ0ZXIgaXQgc2hvdWxkIGJlIHVuaW5kZW50ZWQgb25jZSAodW50aWwgYW5vdGhlciBydWxlIG1hdGNoZXMpLicpLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdHBhdHRlcm46IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5pbmRlbnRhdGlvblJ1bGVzLmRlY3JlYXNlSW5kZW50UGF0dGVybi5wYXR0ZXJuJywgJ1RoZSBSZWdFeHAgcGF0dGVybiBmb3IgZGVjcmVhc2VJbmRlbnRQYXR0ZXJuLicpLFxuXHRcdFx0XHRcdFx0XHRkZWZhdWx0OiAnJyxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRmbGFnczoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmluZGVudGF0aW9uUnVsZXMuZGVjcmVhc2VJbmRlbnRQYXR0ZXJuLmZsYWdzJywgJ1RoZSBSZWdFeHAgZmxhZ3MgZm9yIGRlY3JlYXNlSW5kZW50UGF0dGVybi4nKSxcblx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogJycsXG5cdFx0XHRcdFx0XHRcdHBhdHRlcm46ICdeKFtnaW11eV0rKSQnLFxuXHRcdFx0XHRcdFx0XHRwYXR0ZXJuRXJyb3JNZXNzYWdlOiBubHMubG9jYWxpemUoJ3NjaGVtYS5pbmRlbnRhdGlvblJ1bGVzLmRlY3JlYXNlSW5kZW50UGF0dGVybi5lcnJvck1lc3NhZ2UnLCAnTXVzdCBtYXRjaCB0aGUgcGF0dGVybiBgL14oW2dpbXV5XSspJC9gLicpXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRpbmRlbnROZXh0TGluZVBhdHRlcm46IHtcblx0XHRcdFx0XHR0eXBlOiBbJ3N0cmluZycsICdvYmplY3QnXSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuaW5kZW50YXRpb25SdWxlcy5pbmRlbnROZXh0TGluZVBhdHRlcm4nLCAnSWYgYSBsaW5lIG1hdGNoZXMgdGhpcyBwYXR0ZXJuLCB0aGVuICoqb25seSB0aGUgbmV4dCBsaW5lKiogYWZ0ZXIgaXQgc2hvdWxkIGJlIGluZGVudGVkIG9uY2UuJyksXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0cGF0dGVybjoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmluZGVudGF0aW9uUnVsZXMuaW5kZW50TmV4dExpbmVQYXR0ZXJuLnBhdHRlcm4nLCAnVGhlIFJlZ0V4cCBwYXR0ZXJuIGZvciBpbmRlbnROZXh0TGluZVBhdHRlcm4uJyksXG5cdFx0XHRcdFx0XHRcdGRlZmF1bHQ6ICcnLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGZsYWdzOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuaW5kZW50YXRpb25SdWxlcy5pbmRlbnROZXh0TGluZVBhdHRlcm4uZmxhZ3MnLCAnVGhlIFJlZ0V4cCBmbGFncyBmb3IgaW5kZW50TmV4dExpbmVQYXR0ZXJuLicpLFxuXHRcdFx0XHRcdFx0XHRkZWZhdWx0OiAnJyxcblx0XHRcdFx0XHRcdFx0cGF0dGVybjogJ14oW2dpbXV5XSspJCcsXG5cdFx0XHRcdFx0XHRcdHBhdHRlcm5FcnJvck1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmluZGVudGF0aW9uUnVsZXMuaW5kZW50TmV4dExpbmVQYXR0ZXJuLmVycm9yTWVzc2FnZScsICdNdXN0IG1hdGNoIHRoZSBwYXR0ZXJuIGAvXihbZ2ltdXldKykkL2AuJylcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHVuSW5kZW50ZWRMaW5lUGF0dGVybjoge1xuXHRcdFx0XHRcdHR5cGU6IFsnc3RyaW5nJywgJ29iamVjdCddLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5pbmRlbnRhdGlvblJ1bGVzLnVuSW5kZW50ZWRMaW5lUGF0dGVybicsICdJZiBhIGxpbmUgbWF0Y2hlcyB0aGlzIHBhdHRlcm4sIHRoZW4gaXRzIGluZGVudGF0aW9uIHNob3VsZCBub3QgYmUgY2hhbmdlZCBhbmQgaXQgc2hvdWxkIG5vdCBiZSBldmFsdWF0ZWQgYWdhaW5zdCB0aGUgb3RoZXIgcnVsZXMuJyksXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0cGF0dGVybjoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmluZGVudGF0aW9uUnVsZXMudW5JbmRlbnRlZExpbmVQYXR0ZXJuLnBhdHRlcm4nLCAnVGhlIFJlZ0V4cCBwYXR0ZXJuIGZvciB1bkluZGVudGVkTGluZVBhdHRlcm4uJyksXG5cdFx0XHRcdFx0XHRcdGRlZmF1bHQ6ICcnLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGZsYWdzOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuaW5kZW50YXRpb25SdWxlcy51bkluZGVudGVkTGluZVBhdHRlcm4uZmxhZ3MnLCAnVGhlIFJlZ0V4cCBmbGFncyBmb3IgdW5JbmRlbnRlZExpbmVQYXR0ZXJuLicpLFxuXHRcdFx0XHRcdFx0XHRkZWZhdWx0OiAnJyxcblx0XHRcdFx0XHRcdFx0cGF0dGVybjogJ14oW2dpbXV5XSspJCcsXG5cdFx0XHRcdFx0XHRcdHBhdHRlcm5FcnJvck1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmluZGVudGF0aW9uUnVsZXMudW5JbmRlbnRlZExpbmVQYXR0ZXJuLmVycm9yTWVzc2FnZScsICdNdXN0IG1hdGNoIHRoZSBwYXR0ZXJuIGAvXihbZ2ltdXldKykkL2AuJylcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LFxuXHRcdGZvbGRpbmc6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmZvbGRpbmcnLCAnVGhlIGxhbmd1YWdlXFwncyBmb2xkaW5nIHNldHRpbmdzLicpLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRvZmZTaWRlOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5mb2xkaW5nLm9mZlNpZGUnLCAnQSBsYW5ndWFnZSBhZGhlcmVzIHRvIHRoZSBvZmYtc2lkZSBydWxlIGlmIGJsb2NrcyBpbiB0aGF0IGxhbmd1YWdlIGFyZSBleHByZXNzZWQgYnkgdGhlaXIgaW5kZW50YXRpb24uIElmIHNldCwgZW1wdHkgbGluZXMgYmVsb25nIHRvIHRoZSBzdWJzZXF1ZW50IGJsb2NrLicpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRtYXJrZXJzOiB7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmZvbGRpbmcubWFya2VycycsICdMYW5ndWFnZSBzcGVjaWZpYyBmb2xkaW5nIG1hcmtlcnMgc3VjaCBhcyBcXCcjcmVnaW9uXFwnIGFuZCBcXCcjZW5kcmVnaW9uXFwnLiBUaGUgc3RhcnQgYW5kIGVuZCByZWdleGVzIHdpbGwgYmUgdGVzdGVkIGFnYWluc3QgdGhlIGNvbnRlbnRzIG9mIGFsbCBsaW5lcyBhbmQgbXVzdCBiZSBkZXNpZ25lZCBlZmZpY2llbnRseScpLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdHN0YXJ0OiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6IFsnc3RyaW5nJywgJ29iamVjdCddLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuZm9sZGluZy5tYXJrZXJzLnN0YXJ0JywgJ1RoZSBSZWdFeHAgcGF0dGVybiBmb3IgdGhlIHN0YXJ0IG1hcmtlci4gVGhlIHJlZ2V4cCBtdXN0IHN0YXJ0IHdpdGggXFwnXlxcJy4nKSxcblx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdHBhdHRlcm46IHtcblx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmZvbGRpbmcubWFya2Vycy5zdGFydC5wYXR0ZXJuJywgJ1RoZSBSZWdFeHAgcGF0dGVybiBmb3IgdGhlIHN0YXJ0IG1hcmtlci4nKSxcblx0XHRcdFx0XHRcdFx0XHRcdGRlZmF1bHQ6ICcnLFxuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0ZmxhZ3M6IHtcblx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmZvbGRpbmcubWFya2Vycy5zdGFydC5mbGFncycsICdUaGUgUmVnRXhwIGZsYWdzIGZvciB0aGUgc3RhcnQgbWFya2VyLicpLFxuXHRcdFx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogJycsXG5cdFx0XHRcdFx0XHRcdFx0XHRwYXR0ZXJuOiAnXihbZ2ltdXldKykkJyxcblx0XHRcdFx0XHRcdFx0XHRcdHBhdHRlcm5FcnJvck1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmZvbGRpbmcubWFya2Vycy5zdGFydC5lcnJvck1lc3NhZ2UnLCAnTXVzdCBtYXRjaCB0aGUgcGF0dGVybiBgL14oW2dpbXV5XSspJC9gLicpXG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0ZW5kOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6IFsnc3RyaW5nJywgJ29iamVjdCddLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuZm9sZGluZy5tYXJrZXJzLmVuZCcsICdUaGUgUmVnRXhwIHBhdHRlcm4gZm9yIHRoZSBlbmQgbWFya2VyLiBUaGUgcmVnZXhwIG11c3Qgc3RhcnQgd2l0aCBcXCdeXFwnLicpLFxuXHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0cGF0dGVybjoge1xuXHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuZm9sZGluZy5tYXJrZXJzLmVuZC5wYXR0ZXJuJywgJ1RoZSBSZWdFeHAgcGF0dGVybiBmb3IgdGhlIGVuZCBtYXJrZXIuJyksXG5cdFx0XHRcdFx0XHRcdFx0XHRkZWZhdWx0OiAnJyxcblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdGZsYWdzOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5mb2xkaW5nLm1hcmtlcnMuZW5kLmZsYWdzJywgJ1RoZSBSZWdFeHAgZmxhZ3MgZm9yIHRoZSBlbmQgbWFya2VyLicpLFxuXHRcdFx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogJycsXG5cdFx0XHRcdFx0XHRcdFx0XHRwYXR0ZXJuOiAnXihbZ2ltdXldKykkJyxcblx0XHRcdFx0XHRcdFx0XHRcdHBhdHRlcm5FcnJvck1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmZvbGRpbmcubWFya2Vycy5lbmQuZXJyb3JNZXNzYWdlJywgJ011c3QgbWF0Y2ggdGhlIHBhdHRlcm4gYC9eKFtnaW11eV0rKSQvYC4nKVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LFxuXHRcdG9uRW50ZXJSdWxlczoge1xuXHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5vbkVudGVyUnVsZXMnLCAnVGhlIGxhbmd1YWdlXFwncyBydWxlcyB0byBiZSBldmFsdWF0ZWQgd2hlbiBwcmVzc2luZyBFbnRlci4nKSxcblx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEub25FbnRlclJ1bGVzJywgJ1RoZSBsYW5ndWFnZVxcJ3MgcnVsZXMgdG8gYmUgZXZhbHVhdGVkIHdoZW4gcHJlc3NpbmcgRW50ZXIuJyksXG5cdFx0XHRcdHJlcXVpcmVkOiBbJ2JlZm9yZVRleHQnLCAnYWN0aW9uJ10sXG5cdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRiZWZvcmVUZXh0OiB7XG5cdFx0XHRcdFx0XHR0eXBlOiBbJ3N0cmluZycsICdvYmplY3QnXSxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5vbkVudGVyUnVsZXMuYmVmb3JlVGV4dCcsICdUaGlzIHJ1bGUgd2lsbCBvbmx5IGV4ZWN1dGUgaWYgdGhlIHRleHQgYmVmb3JlIHRoZSBjdXJzb3IgbWF0Y2hlcyB0aGlzIHJlZ3VsYXIgZXhwcmVzc2lvbi4nKSxcblx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0cGF0dGVybjoge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5vbkVudGVyUnVsZXMuYmVmb3JlVGV4dC5wYXR0ZXJuJywgJ1RoZSBSZWdFeHAgcGF0dGVybiBmb3IgYmVmb3JlVGV4dC4nKSxcblx0XHRcdFx0XHRcdFx0XHRkZWZhdWx0OiAnJyxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0ZmxhZ3M6IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEub25FbnRlclJ1bGVzLmJlZm9yZVRleHQuZmxhZ3MnLCAnVGhlIFJlZ0V4cCBmbGFncyBmb3IgYmVmb3JlVGV4dC4nKSxcblx0XHRcdFx0XHRcdFx0XHRkZWZhdWx0OiAnJyxcblx0XHRcdFx0XHRcdFx0XHRwYXR0ZXJuOiAnXihbZ2ltdXldKykkJyxcblx0XHRcdFx0XHRcdFx0XHRwYXR0ZXJuRXJyb3JNZXNzYWdlOiBubHMubG9jYWxpemUoJ3NjaGVtYS5vbkVudGVyUnVsZXMuYmVmb3JlVGV4dC5lcnJvck1lc3NhZ2UnLCAnTXVzdCBtYXRjaCB0aGUgcGF0dGVybiBgL14oW2dpbXV5XSspJC9gLicpXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGFmdGVyVGV4dDoge1xuXHRcdFx0XHRcdFx0dHlwZTogWydzdHJpbmcnLCAnb2JqZWN0J10sXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEub25FbnRlclJ1bGVzLmFmdGVyVGV4dCcsICdUaGlzIHJ1bGUgd2lsbCBvbmx5IGV4ZWN1dGUgaWYgdGhlIHRleHQgYWZ0ZXIgdGhlIGN1cnNvciBtYXRjaGVzIHRoaXMgcmVndWxhciBleHByZXNzaW9uLicpLFxuXHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRwYXR0ZXJuOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLm9uRW50ZXJSdWxlcy5hZnRlclRleHQucGF0dGVybicsICdUaGUgUmVnRXhwIHBhdHRlcm4gZm9yIGFmdGVyVGV4dC4nKSxcblx0XHRcdFx0XHRcdFx0XHRkZWZhdWx0OiAnJyxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0ZmxhZ3M6IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEub25FbnRlclJ1bGVzLmFmdGVyVGV4dC5mbGFncycsICdUaGUgUmVnRXhwIGZsYWdzIGZvciBhZnRlclRleHQuJyksXG5cdFx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogJycsXG5cdFx0XHRcdFx0XHRcdFx0cGF0dGVybjogJ14oW2dpbXV5XSspJCcsXG5cdFx0XHRcdFx0XHRcdFx0cGF0dGVybkVycm9yTWVzc2FnZTogbmxzLmxvY2FsaXplKCdzY2hlbWEub25FbnRlclJ1bGVzLmFmdGVyVGV4dC5lcnJvck1lc3NhZ2UnLCAnTXVzdCBtYXRjaCB0aGUgcGF0dGVybiBgL14oW2dpbXV5XSspJC9gLicpXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHByZXZpb3VzTGluZVRleHQ6IHtcblx0XHRcdFx0XHRcdHR5cGU6IFsnc3RyaW5nJywgJ29iamVjdCddLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLm9uRW50ZXJSdWxlcy5wcmV2aW91c0xpbmVUZXh0JywgJ1RoaXMgcnVsZSB3aWxsIG9ubHkgZXhlY3V0ZSBpZiB0aGUgdGV4dCBhYm92ZSB0aGUgbGluZSBtYXRjaGVzIHRoaXMgcmVndWxhciBleHByZXNzaW9uLicpLFxuXHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRwYXR0ZXJuOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLm9uRW50ZXJSdWxlcy5wcmV2aW91c0xpbmVUZXh0LnBhdHRlcm4nLCAnVGhlIFJlZ0V4cCBwYXR0ZXJuIGZvciBwcmV2aW91c0xpbmVUZXh0LicpLFxuXHRcdFx0XHRcdFx0XHRcdGRlZmF1bHQ6ICcnLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRmbGFnczoge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5vbkVudGVyUnVsZXMucHJldmlvdXNMaW5lVGV4dC5mbGFncycsICdUaGUgUmVnRXhwIGZsYWdzIGZvciBwcmV2aW91c0xpbmVUZXh0LicpLFxuXHRcdFx0XHRcdFx0XHRcdGRlZmF1bHQ6ICcnLFxuXHRcdFx0XHRcdFx0XHRcdHBhdHRlcm46ICdeKFtnaW11eV0rKSQnLFxuXHRcdFx0XHRcdFx0XHRcdHBhdHRlcm5FcnJvck1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnc2NoZW1hLm9uRW50ZXJSdWxlcy5wcmV2aW91c0xpbmVUZXh0LmVycm9yTWVzc2FnZScsICdNdXN0IG1hdGNoIHRoZSBwYXR0ZXJuIGAvXihbZ2ltdXldKykkL2AuJylcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiBbJ3N0cmluZycsICdvYmplY3QnXSxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5vbkVudGVyUnVsZXMuYWN0aW9uJywgJ1RoZSBhY3Rpb24gdG8gZXhlY3V0ZS4nKSxcblx0XHRcdFx0XHRcdHJlcXVpcmVkOiBbJ2luZGVudCddLFxuXHRcdFx0XHRcdFx0ZGVmYXVsdDogeyAnaW5kZW50JzogJ2luZGVudCcgfSxcblx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0aW5kZW50OiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLm9uRW50ZXJSdWxlcy5hY3Rpb24uaW5kZW50JywgXCJEZXNjcmliZSB3aGF0IHRvIGRvIHdpdGggdGhlIGluZGVudGF0aW9uXCIpLFxuXHRcdFx0XHRcdFx0XHRcdGRlZmF1bHQ6ICdpbmRlbnQnLFxuXHRcdFx0XHRcdFx0XHRcdGVudW06IFsnbm9uZScsICdpbmRlbnQnLCAnaW5kZW50T3V0ZGVudCcsICdvdXRkZW50J10sXG5cdFx0XHRcdFx0XHRcdFx0bWFya2Rvd25FbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ3NjaGVtYS5vbkVudGVyUnVsZXMuYWN0aW9uLmluZGVudC5ub25lJywgXCJJbnNlcnQgbmV3IGxpbmUgYW5kIGNvcHkgdGhlIHByZXZpb3VzIGxpbmUncyBpbmRlbnRhdGlvbi5cIiksXG5cdFx0XHRcdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ3NjaGVtYS5vbkVudGVyUnVsZXMuYWN0aW9uLmluZGVudC5pbmRlbnQnLCBcIkluc2VydCBuZXcgbGluZSBhbmQgaW5kZW50IG9uY2UgKHJlbGF0aXZlIHRvIHRoZSBwcmV2aW91cyBsaW5lJ3MgaW5kZW50YXRpb24pLlwiKSxcblx0XHRcdFx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnc2NoZW1hLm9uRW50ZXJSdWxlcy5hY3Rpb24uaW5kZW50LmluZGVudE91dGRlbnQnLCBcIkluc2VydCB0d28gbmV3IGxpbmVzOlxcbiAtIHRoZSBmaXJzdCBvbmUgaW5kZW50ZWQgd2hpY2ggd2lsbCBob2xkIHRoZSBjdXJzb3JcXG4gLSB0aGUgc2Vjb25kIG9uZSBhdCB0aGUgc2FtZSBpbmRlbnRhdGlvbiBsZXZlbFwiKSxcblx0XHRcdFx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnc2NoZW1hLm9uRW50ZXJSdWxlcy5hY3Rpb24uaW5kZW50Lm91dGRlbnQnLCBcIkluc2VydCBuZXcgbGluZSBhbmQgb3V0ZGVudCBvbmNlIChyZWxhdGl2ZSB0byB0aGUgcHJldmlvdXMgbGluZSdzIGluZGVudGF0aW9uKS5cIilcblx0XHRcdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdGFwcGVuZFRleHQ6IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEub25FbnRlclJ1bGVzLmFjdGlvbi5hcHBlbmRUZXh0JywgJ0Rlc2NyaWJlcyB0ZXh0IHRvIGJlIGFwcGVuZGVkIGFmdGVyIHRoZSBuZXcgbGluZSBhbmQgYWZ0ZXIgdGhlIGluZGVudGF0aW9uLicpLFxuXHRcdFx0XHRcdFx0XHRcdGRlZmF1bHQ6ICcnLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRyZW1vdmVUZXh0OiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLm9uRW50ZXJSdWxlcy5hY3Rpb24ucmVtb3ZlVGV4dCcsICdEZXNjcmliZXMgdGhlIG51bWJlciBvZiBjaGFyYWN0ZXJzIHRvIHJlbW92ZSBmcm9tIHRoZSBuZXcgbGluZVxcJ3MgaW5kZW50YXRpb24uJyksXG5cdFx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogMCxcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHR9XG59O1xuY29uc3Qgc2NoZW1hUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJSlNPTkNvbnRyaWJ1dGlvblJlZ2lzdHJ5PihFeHRlbnNpb25zLkpTT05Db250cmlidXRpb24pO1xuc2NoZW1hUmVnaXN0cnkucmVnaXN0ZXJTY2hlbWEoc2NoZW1hSWQsIHNjaGVtYSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFxQixPQUFPLG1CQUFtQjtBQUUvQyxZQUFZLFdBQVc7QUFFdkIsU0FBOEosb0JBQWtEO0FBQ2hOLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsa0JBQTZDO0FBQ3RELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMsWUFBWTtBQUNyQixTQUFT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
