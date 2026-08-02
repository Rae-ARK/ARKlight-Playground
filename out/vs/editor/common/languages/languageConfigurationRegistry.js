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
import { Emitter } from "../../../base/common/event.js";
import { Disposable, markAsSingleton, toDisposable } from "../../../base/common/lifecycle.js";
import * as strings from "../../../base/common/strings.js";
import { DEFAULT_WORD_REGEXP, ensureValidWordDefinition } from "../core/wordHelper.js";
import { AutoClosingPairs } from "./languageConfiguration.js";
import { CharacterPairSupport } from "./supports/characterPair.js";
import { BracketElectricCharacterSupport } from "./supports/electricCharacter.js";
import { IndentRulesSupport } from "./supports/indentRules.js";
import { OnEnterSupport } from "./supports/onEnter.js";
import { RichEditBrackets } from "./supports/richEditBrackets.js";
import { createDecorator } from "../../../platform/instantiation/common/instantiation.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { ILanguageService } from "./language.js";
import { InstantiationType, registerSingleton } from "../../../platform/instantiation/common/extensions.js";
import { PLAINTEXT_LANGUAGE_ID } from "./modesRegistry.js";
import { LanguageBracketsConfiguration } from "./supports/languageBracketsConfiguration.js";
class LanguageConfigurationServiceChangeEvent {
  constructor(languageId) {
    this.languageId = languageId;
  }
  affects(languageId) {
    return !this.languageId ? true : this.languageId === languageId;
  }
}
const ILanguageConfigurationService = createDecorator("languageConfigurationService");
let LanguageConfigurationService = class extends Disposable {
  constructor(configurationService, languageService) {
    super();
    this.configurationService = configurationService;
    this.languageService = languageService;
    this._registry = this._register(new LanguageConfigurationRegistry());
    this.onDidChangeEmitter = this._register(new Emitter());
    this.onDidChange = this.onDidChangeEmitter.event;
    this.configurations = /* @__PURE__ */ new Map();
    const languageConfigKeys = new Set(Object.values(customizedLanguageConfigKeys));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      const globalConfigChanged = e.change.keys.some(
        (k) => languageConfigKeys.has(k)
      );
      const localConfigChanged = e.change.overrides.filter(
        ([overrideLangName, keys]) => keys.some((k) => languageConfigKeys.has(k))
      ).map(([overrideLangName]) => overrideLangName);
      if (globalConfigChanged) {
        this.configurations.clear();
        this.onDidChangeEmitter.fire(new LanguageConfigurationServiceChangeEvent(void 0));
      } else {
        for (const languageId of localConfigChanged) {
          if (this.languageService.isRegisteredLanguageId(languageId)) {
            this.configurations.delete(languageId);
            this.onDidChangeEmitter.fire(new LanguageConfigurationServiceChangeEvent(languageId));
          }
        }
      }
    }));
    this._register(this._registry.onDidChange((e) => {
      this.configurations.delete(e.languageId);
      this.onDidChangeEmitter.fire(new LanguageConfigurationServiceChangeEvent(e.languageId));
    }));
  }
  register(languageId, configuration, priority) {
    return this._registry.register(languageId, configuration, priority);
  }
  getLanguageConfiguration(languageId) {
    let result = this.configurations.get(languageId);
    if (!result) {
      result = computeConfig(languageId, this._registry, this.configurationService, this.languageService);
      this.configurations.set(languageId, result);
    }
    return result;
  }
};
LanguageConfigurationService = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, ILanguageService)
], LanguageConfigurationService);
function computeConfig(languageId, registry, configurationService, languageService) {
  let languageConfig = registry.getLanguageConfiguration(languageId);
  if (!languageConfig) {
    if (!languageService.isRegisteredLanguageId(languageId)) {
      return new ResolvedLanguageConfiguration(languageId, {});
    }
    languageConfig = new ResolvedLanguageConfiguration(languageId, {});
  }
  const customizedConfig = getCustomizedLanguageConfig(languageConfig.languageId, configurationService);
  const data = combineLanguageConfigurations([languageConfig.underlyingConfig, customizedConfig]);
  const config = new ResolvedLanguageConfiguration(languageConfig.languageId, data);
  return config;
}
const customizedLanguageConfigKeys = {
  brackets: "editor.language.brackets",
  colorizedBracketPairs: "editor.language.colorizedBracketPairs"
};
function getCustomizedLanguageConfig(languageId, configurationService) {
  const brackets = configurationService.getValue(customizedLanguageConfigKeys.brackets, {
    overrideIdentifier: languageId
  });
  const colorizedBracketPairs = configurationService.getValue(customizedLanguageConfigKeys.colorizedBracketPairs, {
    overrideIdentifier: languageId
  });
  return {
    brackets: validateBracketPairs(brackets),
    colorizedBracketPairs: validateBracketPairs(colorizedBracketPairs)
  };
}
function validateBracketPairs(data) {
  if (!Array.isArray(data)) {
    return void 0;
  }
  return data.map((pair) => {
    if (!Array.isArray(pair) || pair.length !== 2) {
      return void 0;
    }
    return [pair[0], pair[1]];
  }).filter((p) => !!p);
}
function getIndentationAtPosition(model, lineNumber, column) {
  const lineText = model.getLineContent(lineNumber);
  let indentation = strings.getLeadingWhitespace(lineText);
  if (indentation.length > column - 1) {
    indentation = indentation.substring(0, column - 1);
  }
  return indentation;
}
class ComposedLanguageConfiguration {
  constructor(languageId) {
    this.languageId = languageId;
    this._resolved = null;
    this._entries = [];
    this._order = 0;
    this._resolved = null;
  }
  register(configuration, priority) {
    const entry = new LanguageConfigurationContribution(
      configuration,
      priority,
      ++this._order
    );
    this._entries.push(entry);
    this._resolved = null;
    return markAsSingleton(toDisposable(() => {
      for (let i = 0; i < this._entries.length; i++) {
        if (this._entries[i] === entry) {
          this._entries.splice(i, 1);
          this._resolved = null;
          break;
        }
      }
    }));
  }
  getResolvedConfiguration() {
    if (!this._resolved) {
      const config = this._resolve();
      if (config) {
        this._resolved = new ResolvedLanguageConfiguration(
          this.languageId,
          config
        );
      }
    }
    return this._resolved;
  }
  _resolve() {
    if (this._entries.length === 0) {
      return null;
    }
    this._entries.sort(LanguageConfigurationContribution.cmp);
    return combineLanguageConfigurations(this._entries.map((e) => e.configuration));
  }
}
function combineLanguageConfigurations(configs) {
  let result = {
    comments: void 0,
    brackets: void 0,
    wordPattern: void 0,
    indentationRules: void 0,
    onEnterRules: void 0,
    autoClosingPairs: void 0,
    surroundingPairs: void 0,
    autoCloseBefore: void 0,
    folding: void 0,
    colorizedBracketPairs: void 0,
    __electricCharacterSupport: void 0
  };
  for (const entry of configs) {
    result = {
      comments: entry.comments || result.comments,
      brackets: entry.brackets || result.brackets,
      wordPattern: entry.wordPattern || result.wordPattern,
      indentationRules: entry.indentationRules || result.indentationRules,
      onEnterRules: entry.onEnterRules || result.onEnterRules,
      autoClosingPairs: entry.autoClosingPairs || result.autoClosingPairs,
      surroundingPairs: entry.surroundingPairs || result.surroundingPairs,
      autoCloseBefore: entry.autoCloseBefore || result.autoCloseBefore,
      folding: entry.folding || result.folding,
      colorizedBracketPairs: entry.colorizedBracketPairs || result.colorizedBracketPairs,
      __electricCharacterSupport: entry.__electricCharacterSupport || result.__electricCharacterSupport
    };
  }
  return result;
}
class LanguageConfigurationContribution {
  constructor(configuration, priority, order) {
    this.configuration = configuration;
    this.priority = priority;
    this.order = order;
  }
  static cmp(a, b) {
    if (a.priority === b.priority) {
      return a.order - b.order;
    }
    return a.priority - b.priority;
  }
}
class LanguageConfigurationChangeEvent {
  constructor(languageId) {
    this.languageId = languageId;
  }
}
class LanguageConfigurationRegistry extends Disposable {
  constructor() {
    super();
    this._entries = /* @__PURE__ */ new Map();
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._register(this.register(PLAINTEXT_LANGUAGE_ID, {
      brackets: [
        ["(", ")"],
        ["[", "]"],
        ["{", "}"]
      ],
      surroundingPairs: [
        { open: "{", close: "}" },
        { open: "[", close: "]" },
        { open: "(", close: ")" },
        { open: "<", close: ">" },
        { open: '"', close: '"' },
        { open: "'", close: "'" },
        { open: "`", close: "`" }
      ],
      colorizedBracketPairs: [],
      folding: {
        offSide: true
      }
    }, 0));
  }
  /**
   * @param priority Use a higher number for higher priority
   */
  register(languageId, configuration, priority = 0) {
    let entries = this._entries.get(languageId);
    if (!entries) {
      entries = new ComposedLanguageConfiguration(languageId);
      this._entries.set(languageId, entries);
    }
    const disposable = entries.register(configuration, priority);
    this._onDidChange.fire(new LanguageConfigurationChangeEvent(languageId));
    return markAsSingleton(toDisposable(() => {
      disposable.dispose();
      this._onDidChange.fire(new LanguageConfigurationChangeEvent(languageId));
    }));
  }
  getLanguageConfiguration(languageId) {
    const entries = this._entries.get(languageId);
    return entries?.getResolvedConfiguration() || null;
  }
}
class ResolvedLanguageConfiguration {
  constructor(languageId, underlyingConfig) {
    this.languageId = languageId;
    this.underlyingConfig = underlyingConfig;
    this._brackets = null;
    this._electricCharacter = null;
    this._onEnterSupport = this.underlyingConfig.brackets || this.underlyingConfig.indentationRules || this.underlyingConfig.onEnterRules ? new OnEnterSupport(this.underlyingConfig) : null;
    this.comments = ResolvedLanguageConfiguration._handleComments(this.underlyingConfig);
    this.characterPair = new CharacterPairSupport(this.underlyingConfig);
    this.wordDefinition = this.underlyingConfig.wordPattern || DEFAULT_WORD_REGEXP;
    this.indentationRules = this.underlyingConfig.indentationRules;
    if (this.underlyingConfig.indentationRules) {
      this.indentRulesSupport = new IndentRulesSupport(
        this.underlyingConfig.indentationRules
      );
    } else {
      this.indentRulesSupport = null;
    }
    this.foldingRules = this.underlyingConfig.folding || {};
    this.bracketsNew = new LanguageBracketsConfiguration(
      languageId,
      this.underlyingConfig
    );
  }
  getWordDefinition() {
    return ensureValidWordDefinition(this.wordDefinition);
  }
  get brackets() {
    if (!this._brackets && this.underlyingConfig.brackets) {
      this._brackets = new RichEditBrackets(
        this.languageId,
        this.underlyingConfig.brackets
      );
    }
    return this._brackets;
  }
  get electricCharacter() {
    if (!this._electricCharacter) {
      this._electricCharacter = new BracketElectricCharacterSupport(
        this.brackets
      );
    }
    return this._electricCharacter;
  }
  onEnter(autoIndent, previousLineText, beforeEnterText, afterEnterText) {
    if (!this._onEnterSupport) {
      return null;
    }
    return this._onEnterSupport.onEnter(
      autoIndent,
      previousLineText,
      beforeEnterText,
      afterEnterText
    );
  }
  getAutoClosingPairs() {
    return new AutoClosingPairs(this.characterPair.getAutoClosingPairs());
  }
  getAutoCloseBeforeSet(forQuotes) {
    return this.characterPair.getAutoCloseBeforeSet(forQuotes);
  }
  getSurroundingPairs() {
    return this.characterPair.getSurroundingPairs();
  }
  static _handleComments(conf) {
    const commentRule = conf.comments;
    if (!commentRule) {
      return null;
    }
    const comments = {};
    if (commentRule.lineComment) {
      if (typeof commentRule.lineComment === "string") {
        comments.lineCommentToken = commentRule.lineComment;
      } else {
        comments.lineCommentToken = commentRule.lineComment.comment;
        comments.lineCommentNoIndent = commentRule.lineComment.noIndent;
      }
    }
    if (commentRule.blockComment) {
      const [blockStart, blockEnd] = commentRule.blockComment;
      comments.blockCommentStartToken = blockStart;
      comments.blockCommentEndToken = blockEnd;
    }
    return comments;
  }
}
registerSingleton(ILanguageConfigurationService, LanguageConfigurationService, InstantiationType.Delayed);
export {
  ILanguageConfigurationService,
  LanguageConfigurationChangeEvent,
  LanguageConfigurationRegistry,
  LanguageConfigurationService,
  LanguageConfigurationServiceChangeEvent,
  ResolvedLanguageConfiguration,
  getIndentationAtPosition
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlQ29uZmlndXJhdGlvblJlZ2lzdHJ5LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSwgbWFya0FzU2luZ2xldG9uLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0ICogYXMgc3RyaW5ncyBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX1dPUkRfUkVHRVhQLCBlbnN1cmVWYWxpZFdvcmREZWZpbml0aW9uIH0gZnJvbSAnLi4vY29yZS93b3JkSGVscGVyLmpzJztcbmltcG9ydCB7IEVudGVyQWN0aW9uLCBGb2xkaW5nUnVsZXMsIElBdXRvQ2xvc2luZ1BhaXIsIEluZGVudGF0aW9uUnVsZSwgTGFuZ3VhZ2VDb25maWd1cmF0aW9uLCBBdXRvQ2xvc2luZ1BhaXJzLCBDaGFyYWN0ZXJQYWlyLCBFeHBsaWNpdExhbmd1YWdlQ29uZmlndXJhdGlvbiB9IGZyb20gJy4vbGFuZ3VhZ2VDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENoYXJhY3RlclBhaXJTdXBwb3J0IH0gZnJvbSAnLi9zdXBwb3J0cy9jaGFyYWN0ZXJQYWlyLmpzJztcbmltcG9ydCB7IEJyYWNrZXRFbGVjdHJpY0NoYXJhY3RlclN1cHBvcnQgfSBmcm9tICcuL3N1cHBvcnRzL2VsZWN0cmljQ2hhcmFjdGVyLmpzJztcbmltcG9ydCB7IEluZGVudFJ1bGVzU3VwcG9ydCB9IGZyb20gJy4vc3VwcG9ydHMvaW5kZW50UnVsZXMuanMnO1xuaW1wb3J0IHsgT25FbnRlclN1cHBvcnQgfSBmcm9tICcuL3N1cHBvcnRzL29uRW50ZXIuanMnO1xuaW1wb3J0IHsgUmljaEVkaXRCcmFja2V0cyB9IGZyb20gJy4vc3VwcG9ydHMvcmljaEVkaXRCcmFja2V0cy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JBdXRvSW5kZW50U3RyYXRlZ3kgfSBmcm9tICcuLi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4vbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBQTEFJTlRFWFRfTEFOR1VBR0VfSUQgfSBmcm9tICcuL21vZGVzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VCcmFja2V0c0NvbmZpZ3VyYXRpb24gfSBmcm9tICcuL3N1cHBvcnRzL2xhbmd1YWdlQnJhY2tldHNDb25maWd1cmF0aW9uLmpzJztcblxuLyoqXG4gKiBJbnRlcmZhY2UgdXNlZCB0byBzdXBwb3J0IGluc2VydGlvbiBvZiBtb2RlIHNwZWNpZmljIGNvbW1lbnRzLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElDb21tZW50c0NvbmZpZ3VyYXRpb24ge1xuXHRsaW5lQ29tbWVudFRva2VuPzogc3RyaW5nO1xuXHRsaW5lQ29tbWVudE5vSW5kZW50PzogYm9vbGVhbjtcblx0YmxvY2tDb21tZW50U3RhcnRUb2tlbj86IHN0cmluZztcblx0YmxvY2tDb21tZW50RW5kVG9rZW4/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2VDaGFuZ2VFdmVudD47XG5cblx0LyoqXG5cdCAqIEBwYXJhbSBwcmlvcml0eSBVc2UgYSBoaWdoZXIgbnVtYmVyIGZvciBoaWdoZXIgcHJpb3JpdHlcblx0ICovXG5cdHJlZ2lzdGVyKGxhbmd1YWdlSWQ6IHN0cmluZywgY29uZmlndXJhdGlvbjogTGFuZ3VhZ2VDb25maWd1cmF0aW9uLCBwcmlvcml0eT86IG51bWJlcik6IElEaXNwb3NhYmxlO1xuXG5cdGdldExhbmd1YWdlQ29uZmlndXJhdGlvbihsYW5ndWFnZUlkOiBzdHJpbmcpOiBSZXNvbHZlZExhbmd1YWdlQ29uZmlndXJhdGlvbjtcblxufVxuXG5leHBvcnQgY2xhc3MgTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZUNoYW5nZUV2ZW50IHtcblx0Y29uc3RydWN0b3IocHVibGljIHJlYWRvbmx5IGxhbmd1YWdlSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCkgeyB9XG5cblx0cHVibGljIGFmZmVjdHMobGFuZ3VhZ2VJZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICF0aGlzLmxhbmd1YWdlSWQgPyB0cnVlIDogdGhpcy5sYW5ndWFnZUlkID09PSBsYW5ndWFnZUlkO1xuXHR9XG59XG5cbmV4cG9ydCBjb25zdCBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZT4oJ2xhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UnKTtcblxuZXhwb3J0IGNsYXNzIExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2Uge1xuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcmVnaXN0cnkgPSB0aGlzLl9yZWdpc3RlcihuZXcgTGFuZ3VhZ2VDb25maWd1cmF0aW9uUmVnaXN0cnkoKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBvbkRpZENoYW5nZUVtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlQ2hhbmdlRXZlbnQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2UgPSB0aGlzLm9uRGlkQ2hhbmdlRW1pdHRlci5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25zID0gbmV3IE1hcDxzdHJpbmcsIFJlc29sdmVkTGFuZ3VhZ2VDb25maWd1cmF0aW9uPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCBsYW5ndWFnZUNvbmZpZ0tleXMgPSBuZXcgU2V0KE9iamVjdC52YWx1ZXMoY3VzdG9taXplZExhbmd1YWdlQ29uZmlnS2V5cykpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oKGUpID0+IHtcblx0XHRcdGNvbnN0IGdsb2JhbENvbmZpZ0NoYW5nZWQgPSBlLmNoYW5nZS5rZXlzLnNvbWUoKGspID0+XG5cdFx0XHRcdGxhbmd1YWdlQ29uZmlnS2V5cy5oYXMoaylcblx0XHRcdCk7XG5cdFx0XHRjb25zdCBsb2NhbENvbmZpZ0NoYW5nZWQgPSBlLmNoYW5nZS5vdmVycmlkZXNcblx0XHRcdFx0LmZpbHRlcigoW292ZXJyaWRlTGFuZ05hbWUsIGtleXNdKSA9PlxuXHRcdFx0XHRcdGtleXMuc29tZSgoaykgPT4gbGFuZ3VhZ2VDb25maWdLZXlzLmhhcyhrKSlcblx0XHRcdFx0KVxuXHRcdFx0XHQubWFwKChbb3ZlcnJpZGVMYW5nTmFtZV0pID0+IG92ZXJyaWRlTGFuZ05hbWUpO1xuXG5cdFx0XHRpZiAoZ2xvYmFsQ29uZmlnQ2hhbmdlZCkge1xuXHRcdFx0XHR0aGlzLmNvbmZpZ3VyYXRpb25zLmNsZWFyKCk7XG5cdFx0XHRcdHRoaXMub25EaWRDaGFuZ2VFbWl0dGVyLmZpcmUobmV3IExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2VDaGFuZ2VFdmVudCh1bmRlZmluZWQpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGZvciAoY29uc3QgbGFuZ3VhZ2VJZCBvZiBsb2NhbENvbmZpZ0NoYW5nZWQpIHtcblx0XHRcdFx0XHRpZiAodGhpcy5sYW5ndWFnZVNlcnZpY2UuaXNSZWdpc3RlcmVkTGFuZ3VhZ2VJZChsYW5ndWFnZUlkKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5jb25maWd1cmF0aW9ucy5kZWxldGUobGFuZ3VhZ2VJZCk7XG5cdFx0XHRcdFx0XHR0aGlzLm9uRGlkQ2hhbmdlRW1pdHRlci5maXJlKG5ldyBMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlQ2hhbmdlRXZlbnQobGFuZ3VhZ2VJZCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3JlZ2lzdHJ5Lm9uRGlkQ2hhbmdlKChlKSA9PiB7XG5cdFx0XHR0aGlzLmNvbmZpZ3VyYXRpb25zLmRlbGV0ZShlLmxhbmd1YWdlSWQpO1xuXHRcdFx0dGhpcy5vbkRpZENoYW5nZUVtaXR0ZXIuZmlyZShuZXcgTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZUNoYW5nZUV2ZW50KGUubGFuZ3VhZ2VJZCkpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHB1YmxpYyByZWdpc3RlcihsYW5ndWFnZUlkOiBzdHJpbmcsIGNvbmZpZ3VyYXRpb246IExhbmd1YWdlQ29uZmlndXJhdGlvbiwgcHJpb3JpdHk/OiBudW1iZXIpOiBJRGlzcG9zYWJsZSB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlZ2lzdHJ5LnJlZ2lzdGVyKGxhbmd1YWdlSWQsIGNvbmZpZ3VyYXRpb24sIHByaW9yaXR5KTtcblx0fVxuXG5cdHB1YmxpYyBnZXRMYW5ndWFnZUNvbmZpZ3VyYXRpb24obGFuZ3VhZ2VJZDogc3RyaW5nKTogUmVzb2x2ZWRMYW5ndWFnZUNvbmZpZ3VyYXRpb24ge1xuXHRcdGxldCByZXN1bHQgPSB0aGlzLmNvbmZpZ3VyYXRpb25zLmdldChsYW5ndWFnZUlkKTtcblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0cmVzdWx0ID0gY29tcHV0ZUNvbmZpZyhsYW5ndWFnZUlkLCB0aGlzLl9yZWdpc3RyeSwgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5sYW5ndWFnZVNlcnZpY2UpO1xuXHRcdFx0dGhpcy5jb25maWd1cmF0aW9ucy5zZXQobGFuZ3VhZ2VJZCwgcmVzdWx0KTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuXG5mdW5jdGlvbiBjb21wdXRlQ29uZmlnKFxuXHRsYW5ndWFnZUlkOiBzdHJpbmcsXG5cdHJlZ2lzdHJ5OiBMYW5ndWFnZUNvbmZpZ3VyYXRpb25SZWdpc3RyeSxcblx0Y29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0bGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuKTogUmVzb2x2ZWRMYW5ndWFnZUNvbmZpZ3VyYXRpb24ge1xuXHRsZXQgbGFuZ3VhZ2VDb25maWcgPSByZWdpc3RyeS5nZXRMYW5ndWFnZUNvbmZpZ3VyYXRpb24obGFuZ3VhZ2VJZCk7XG5cblx0aWYgKCFsYW5ndWFnZUNvbmZpZykge1xuXHRcdGlmICghbGFuZ3VhZ2VTZXJ2aWNlLmlzUmVnaXN0ZXJlZExhbmd1YWdlSWQobGFuZ3VhZ2VJZCkpIHtcblx0XHRcdC8vIHRoaXMgaGFwcGVucyBmb3IgdGhlIG51bGwgbGFuZ3VhZ2UsIHdoaWNoIGNhbiBiZSByZXR1cm5lZCBieSBtb25hcmNoLlxuXHRcdFx0Ly8gSW5zdGVhZCBvZiB0aHJvd2luZyBhbiBlcnJvciwgd2UganVzdCByZXR1cm4gYSBkZWZhdWx0IGNvbmZpZy5cblx0XHRcdHJldHVybiBuZXcgUmVzb2x2ZWRMYW5ndWFnZUNvbmZpZ3VyYXRpb24obGFuZ3VhZ2VJZCwge30pO1xuXHRcdH1cblx0XHRsYW5ndWFnZUNvbmZpZyA9IG5ldyBSZXNvbHZlZExhbmd1YWdlQ29uZmlndXJhdGlvbihsYW5ndWFnZUlkLCB7fSk7XG5cdH1cblxuXHRjb25zdCBjdXN0b21pemVkQ29uZmlnID0gZ2V0Q3VzdG9taXplZExhbmd1YWdlQ29uZmlnKGxhbmd1YWdlQ29uZmlnLmxhbmd1YWdlSWQsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0Y29uc3QgZGF0YSA9IGNvbWJpbmVMYW5ndWFnZUNvbmZpZ3VyYXRpb25zKFtsYW5ndWFnZUNvbmZpZy51bmRlcmx5aW5nQ29uZmlnLCBjdXN0b21pemVkQ29uZmlnXSk7XG5cdGNvbnN0IGNvbmZpZyA9IG5ldyBSZXNvbHZlZExhbmd1YWdlQ29uZmlndXJhdGlvbihsYW5ndWFnZUNvbmZpZy5sYW5ndWFnZUlkLCBkYXRhKTtcblx0cmV0dXJuIGNvbmZpZztcbn1cblxuY29uc3QgY3VzdG9taXplZExhbmd1YWdlQ29uZmlnS2V5cyA9IHtcblx0YnJhY2tldHM6ICdlZGl0b3IubGFuZ3VhZ2UuYnJhY2tldHMnLFxuXHRjb2xvcml6ZWRCcmFja2V0UGFpcnM6ICdlZGl0b3IubGFuZ3VhZ2UuY29sb3JpemVkQnJhY2tldFBhaXJzJ1xufTtcblxuZnVuY3Rpb24gZ2V0Q3VzdG9taXplZExhbmd1YWdlQ29uZmlnKGxhbmd1YWdlSWQ6IHN0cmluZywgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSk6IExhbmd1YWdlQ29uZmlndXJhdGlvbiB7XG5cdGNvbnN0IGJyYWNrZXRzID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoY3VzdG9taXplZExhbmd1YWdlQ29uZmlnS2V5cy5icmFja2V0cywge1xuXHRcdG92ZXJyaWRlSWRlbnRpZmllcjogbGFuZ3VhZ2VJZCxcblx0fSk7XG5cblx0Y29uc3QgY29sb3JpemVkQnJhY2tldFBhaXJzID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoY3VzdG9taXplZExhbmd1YWdlQ29uZmlnS2V5cy5jb2xvcml6ZWRCcmFja2V0UGFpcnMsIHtcblx0XHRvdmVycmlkZUlkZW50aWZpZXI6IGxhbmd1YWdlSWQsXG5cdH0pO1xuXG5cdHJldHVybiB7XG5cdFx0YnJhY2tldHM6IHZhbGlkYXRlQnJhY2tldFBhaXJzKGJyYWNrZXRzKSxcblx0XHRjb2xvcml6ZWRCcmFja2V0UGFpcnM6IHZhbGlkYXRlQnJhY2tldFBhaXJzKGNvbG9yaXplZEJyYWNrZXRQYWlycyksXG5cdH07XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlQnJhY2tldFBhaXJzKGRhdGE6IHVua25vd24pOiBDaGFyYWN0ZXJQYWlyW10gfCB1bmRlZmluZWQge1xuXHRpZiAoIUFycmF5LmlzQXJyYXkoZGF0YSkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiBkYXRhLm1hcChwYWlyID0+IHtcblx0XHRpZiAoIUFycmF5LmlzQXJyYXkocGFpcikgfHwgcGFpci5sZW5ndGggIT09IDIpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBbcGFpclswXSwgcGFpclsxXV0gYXMgQ2hhcmFjdGVyUGFpcjtcblx0fSkuZmlsdGVyKChwKTogcCBpcyBDaGFyYWN0ZXJQYWlyID0+ICEhcCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRJbmRlbnRhdGlvbkF0UG9zaXRpb24obW9kZWw6IElUZXh0TW9kZWwsIGxpbmVOdW1iZXI6IG51bWJlciwgY29sdW1uOiBudW1iZXIpOiBzdHJpbmcge1xuXHRjb25zdCBsaW5lVGV4dCA9IG1vZGVsLmdldExpbmVDb250ZW50KGxpbmVOdW1iZXIpO1xuXHRsZXQgaW5kZW50YXRpb24gPSBzdHJpbmdzLmdldExlYWRpbmdXaGl0ZXNwYWNlKGxpbmVUZXh0KTtcblx0aWYgKGluZGVudGF0aW9uLmxlbmd0aCA+IGNvbHVtbiAtIDEpIHtcblx0XHRpbmRlbnRhdGlvbiA9IGluZGVudGF0aW9uLnN1YnN0cmluZygwLCBjb2x1bW4gLSAxKTtcblx0fVxuXHRyZXR1cm4gaW5kZW50YXRpb247XG59XG5cbmNsYXNzIENvbXBvc2VkTGFuZ3VhZ2VDb25maWd1cmF0aW9uIHtcblx0cHJpdmF0ZSByZWFkb25seSBfZW50cmllczogTGFuZ3VhZ2VDb25maWd1cmF0aW9uQ29udHJpYnV0aW9uW107XG5cdHByaXZhdGUgX29yZGVyOiBudW1iZXI7XG5cdHByaXZhdGUgX3Jlc29sdmVkOiBSZXNvbHZlZExhbmd1YWdlQ29uZmlndXJhdGlvbiB8IG51bGwgPSBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKHB1YmxpYyByZWFkb25seSBsYW5ndWFnZUlkOiBzdHJpbmcpIHtcblx0XHR0aGlzLl9lbnRyaWVzID0gW107XG5cdFx0dGhpcy5fb3JkZXIgPSAwO1xuXHRcdHRoaXMuX3Jlc29sdmVkID0gbnVsbDtcblx0fVxuXG5cdHB1YmxpYyByZWdpc3Rlcihcblx0XHRjb25maWd1cmF0aW9uOiBMYW5ndWFnZUNvbmZpZ3VyYXRpb24sXG5cdFx0cHJpb3JpdHk6IG51bWJlclxuXHQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgZW50cnkgPSBuZXcgTGFuZ3VhZ2VDb25maWd1cmF0aW9uQ29udHJpYnV0aW9uKFxuXHRcdFx0Y29uZmlndXJhdGlvbixcblx0XHRcdHByaW9yaXR5LFxuXHRcdFx0Kyt0aGlzLl9vcmRlclxuXHRcdCk7XG5cdFx0dGhpcy5fZW50cmllcy5wdXNoKGVudHJ5KTtcblx0XHR0aGlzLl9yZXNvbHZlZCA9IG51bGw7XG5cdFx0cmV0dXJuIG1hcmtBc1NpbmdsZXRvbih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9lbnRyaWVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9lbnRyaWVzW2ldID09PSBlbnRyeSkge1xuXHRcdFx0XHRcdHRoaXMuX2VudHJpZXMuc3BsaWNlKGksIDEpO1xuXHRcdFx0XHRcdHRoaXMuX3Jlc29sdmVkID0gbnVsbDtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRSZXNvbHZlZENvbmZpZ3VyYXRpb24oKTogUmVzb2x2ZWRMYW5ndWFnZUNvbmZpZ3VyYXRpb24gfCBudWxsIHtcblx0XHRpZiAoIXRoaXMuX3Jlc29sdmVkKSB7XG5cdFx0XHRjb25zdCBjb25maWcgPSB0aGlzLl9yZXNvbHZlKCk7XG5cdFx0XHRpZiAoY29uZmlnKSB7XG5cdFx0XHRcdHRoaXMuX3Jlc29sdmVkID0gbmV3IFJlc29sdmVkTGFuZ3VhZ2VDb25maWd1cmF0aW9uKFxuXHRcdFx0XHRcdHRoaXMubGFuZ3VhZ2VJZCxcblx0XHRcdFx0XHRjb25maWdcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3Jlc29sdmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb2x2ZSgpOiBMYW5ndWFnZUNvbmZpZ3VyYXRpb24gfCBudWxsIHtcblx0XHRpZiAodGhpcy5fZW50cmllcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHR0aGlzLl9lbnRyaWVzLnNvcnQoTGFuZ3VhZ2VDb25maWd1cmF0aW9uQ29udHJpYnV0aW9uLmNtcCk7XG5cdFx0cmV0dXJuIGNvbWJpbmVMYW5ndWFnZUNvbmZpZ3VyYXRpb25zKHRoaXMuX2VudHJpZXMubWFwKGUgPT4gZS5jb25maWd1cmF0aW9uKSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gY29tYmluZUxhbmd1YWdlQ29uZmlndXJhdGlvbnMoY29uZmlnczogTGFuZ3VhZ2VDb25maWd1cmF0aW9uW10pOiBMYW5ndWFnZUNvbmZpZ3VyYXRpb24ge1xuXHRsZXQgcmVzdWx0OiBFeHBsaWNpdExhbmd1YWdlQ29uZmlndXJhdGlvbiA9IHtcblx0XHRjb21tZW50czogdW5kZWZpbmVkLFxuXHRcdGJyYWNrZXRzOiB1bmRlZmluZWQsXG5cdFx0d29yZFBhdHRlcm46IHVuZGVmaW5lZCxcblx0XHRpbmRlbnRhdGlvblJ1bGVzOiB1bmRlZmluZWQsXG5cdFx0b25FbnRlclJ1bGVzOiB1bmRlZmluZWQsXG5cdFx0YXV0b0Nsb3NpbmdQYWlyczogdW5kZWZpbmVkLFxuXHRcdHN1cnJvdW5kaW5nUGFpcnM6IHVuZGVmaW5lZCxcblx0XHRhdXRvQ2xvc2VCZWZvcmU6IHVuZGVmaW5lZCxcblx0XHRmb2xkaW5nOiB1bmRlZmluZWQsXG5cdFx0Y29sb3JpemVkQnJhY2tldFBhaXJzOiB1bmRlZmluZWQsXG5cdFx0X19lbGVjdHJpY0NoYXJhY3RlclN1cHBvcnQ6IHVuZGVmaW5lZCxcblx0fTtcblx0Zm9yIChjb25zdCBlbnRyeSBvZiBjb25maWdzKSB7XG5cdFx0cmVzdWx0ID0ge1xuXHRcdFx0Y29tbWVudHM6IGVudHJ5LmNvbW1lbnRzIHx8IHJlc3VsdC5jb21tZW50cyxcblx0XHRcdGJyYWNrZXRzOiBlbnRyeS5icmFja2V0cyB8fCByZXN1bHQuYnJhY2tldHMsXG5cdFx0XHR3b3JkUGF0dGVybjogZW50cnkud29yZFBhdHRlcm4gfHwgcmVzdWx0LndvcmRQYXR0ZXJuLFxuXHRcdFx0aW5kZW50YXRpb25SdWxlczogZW50cnkuaW5kZW50YXRpb25SdWxlcyB8fCByZXN1bHQuaW5kZW50YXRpb25SdWxlcyxcblx0XHRcdG9uRW50ZXJSdWxlczogZW50cnkub25FbnRlclJ1bGVzIHx8IHJlc3VsdC5vbkVudGVyUnVsZXMsXG5cdFx0XHRhdXRvQ2xvc2luZ1BhaXJzOiBlbnRyeS5hdXRvQ2xvc2luZ1BhaXJzIHx8IHJlc3VsdC5hdXRvQ2xvc2luZ1BhaXJzLFxuXHRcdFx0c3Vycm91bmRpbmdQYWlyczogZW50cnkuc3Vycm91bmRpbmdQYWlycyB8fCByZXN1bHQuc3Vycm91bmRpbmdQYWlycyxcblx0XHRcdGF1dG9DbG9zZUJlZm9yZTogZW50cnkuYXV0b0Nsb3NlQmVmb3JlIHx8IHJlc3VsdC5hdXRvQ2xvc2VCZWZvcmUsXG5cdFx0XHRmb2xkaW5nOiBlbnRyeS5mb2xkaW5nIHx8IHJlc3VsdC5mb2xkaW5nLFxuXHRcdFx0Y29sb3JpemVkQnJhY2tldFBhaXJzOiBlbnRyeS5jb2xvcml6ZWRCcmFja2V0UGFpcnMgfHwgcmVzdWx0LmNvbG9yaXplZEJyYWNrZXRQYWlycyxcblx0XHRcdF9fZWxlY3RyaWNDaGFyYWN0ZXJTdXBwb3J0OiBlbnRyeS5fX2VsZWN0cmljQ2hhcmFjdGVyU3VwcG9ydCB8fCByZXN1bHQuX19lbGVjdHJpY0NoYXJhY3RlclN1cHBvcnQsXG5cdFx0fTtcblx0fVxuXG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmNsYXNzIExhbmd1YWdlQ29uZmlndXJhdGlvbkNvbnRyaWJ1dGlvbiB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBjb25maWd1cmF0aW9uOiBMYW5ndWFnZUNvbmZpZ3VyYXRpb24sXG5cdFx0cHVibGljIHJlYWRvbmx5IHByaW9yaXR5OiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IG9yZGVyOiBudW1iZXJcblx0KSB7IH1cblxuXHRwdWJsaWMgc3RhdGljIGNtcChhOiBMYW5ndWFnZUNvbmZpZ3VyYXRpb25Db250cmlidXRpb24sIGI6IExhbmd1YWdlQ29uZmlndXJhdGlvbkNvbnRyaWJ1dGlvbikge1xuXHRcdGlmIChhLnByaW9yaXR5ID09PSBiLnByaW9yaXR5KSB7XG5cdFx0XHQvLyBoaWdoZXIgb3JkZXIgbGFzdFxuXHRcdFx0cmV0dXJuIGEub3JkZXIgLSBiLm9yZGVyO1xuXHRcdH1cblx0XHQvLyBoaWdoZXIgcHJpb3JpdHkgbGFzdFxuXHRcdHJldHVybiBhLnByaW9yaXR5IC0gYi5wcmlvcml0eTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTGFuZ3VhZ2VDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQge1xuXHRjb25zdHJ1Y3RvcihwdWJsaWMgcmVhZG9ubHkgbGFuZ3VhZ2VJZDogc3RyaW5nKSB7IH1cbn1cblxuZXhwb3J0IGNsYXNzIExhbmd1YWdlQ29uZmlndXJhdGlvblJlZ2lzdHJ5IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VudHJpZXMgPSBuZXcgTWFwPHN0cmluZywgQ29tcG9zZWRMYW5ndWFnZUNvbmZpZ3VyYXRpb24+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxMYW5ndWFnZUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8TGFuZ3VhZ2VDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQ+ID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnJlZ2lzdGVyKFBMQUlOVEVYVF9MQU5HVUFHRV9JRCwge1xuXHRcdFx0YnJhY2tldHM6IFtcblx0XHRcdFx0WycoJywgJyknXSxcblx0XHRcdFx0WydbJywgJ10nXSxcblx0XHRcdFx0Wyd7JywgJ30nXSxcblx0XHRcdF0sXG5cdFx0XHRzdXJyb3VuZGluZ1BhaXJzOiBbXG5cdFx0XHRcdHsgb3BlbjogJ3snLCBjbG9zZTogJ30nIH0sXG5cdFx0XHRcdHsgb3BlbjogJ1snLCBjbG9zZTogJ10nIH0sXG5cdFx0XHRcdHsgb3BlbjogJygnLCBjbG9zZTogJyknIH0sXG5cdFx0XHRcdHsgb3BlbjogJzwnLCBjbG9zZTogJz4nIH0sXG5cdFx0XHRcdHsgb3BlbjogJ1xcXCInLCBjbG9zZTogJ1xcXCInIH0sXG5cdFx0XHRcdHsgb3BlbjogJ1xcJycsIGNsb3NlOiAnXFwnJyB9LFxuXHRcdFx0XHR7IG9wZW46ICdgJywgY2xvc2U6ICdgJyB9LFxuXHRcdFx0XSxcblx0XHRcdGNvbG9yaXplZEJyYWNrZXRQYWlyczogW10sXG5cdFx0XHRmb2xkaW5nOiB7XG5cdFx0XHRcdG9mZlNpZGU6IHRydWVcblx0XHRcdH1cblx0XHR9LCAwKSk7XG5cdH1cblxuXHQvKipcblx0ICogQHBhcmFtIHByaW9yaXR5IFVzZSBhIGhpZ2hlciBudW1iZXIgZm9yIGhpZ2hlciBwcmlvcml0eVxuXHQgKi9cblx0cHVibGljIHJlZ2lzdGVyKGxhbmd1YWdlSWQ6IHN0cmluZywgY29uZmlndXJhdGlvbjogTGFuZ3VhZ2VDb25maWd1cmF0aW9uLCBwcmlvcml0eTogbnVtYmVyID0gMCk6IElEaXNwb3NhYmxlIHtcblx0XHRsZXQgZW50cmllcyA9IHRoaXMuX2VudHJpZXMuZ2V0KGxhbmd1YWdlSWQpO1xuXHRcdGlmICghZW50cmllcykge1xuXHRcdFx0ZW50cmllcyA9IG5ldyBDb21wb3NlZExhbmd1YWdlQ29uZmlndXJhdGlvbihsYW5ndWFnZUlkKTtcblx0XHRcdHRoaXMuX2VudHJpZXMuc2V0KGxhbmd1YWdlSWQsIGVudHJpZXMpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBlbnRyaWVzLnJlZ2lzdGVyKGNvbmZpZ3VyYXRpb24sIHByaW9yaXR5KTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKG5ldyBMYW5ndWFnZUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudChsYW5ndWFnZUlkKSk7XG5cblx0XHRyZXR1cm4gbWFya0FzU2luZ2xldG9uKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUobmV3IExhbmd1YWdlQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50KGxhbmd1YWdlSWQpKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGFuZ3VhZ2VDb25maWd1cmF0aW9uKGxhbmd1YWdlSWQ6IHN0cmluZyk6IFJlc29sdmVkTGFuZ3VhZ2VDb25maWd1cmF0aW9uIHwgbnVsbCB7XG5cdFx0Y29uc3QgZW50cmllcyA9IHRoaXMuX2VudHJpZXMuZ2V0KGxhbmd1YWdlSWQpO1xuXHRcdHJldHVybiBlbnRyaWVzPy5nZXRSZXNvbHZlZENvbmZpZ3VyYXRpb24oKSB8fCBudWxsO1xuXHR9XG59XG5cbi8qKlxuICogSW1tdXRhYmxlLlxuKi9cbmV4cG9ydCBjbGFzcyBSZXNvbHZlZExhbmd1YWdlQ29uZmlndXJhdGlvbiB7XG5cdHByaXZhdGUgX2JyYWNrZXRzOiBSaWNoRWRpdEJyYWNrZXRzIHwgbnVsbDtcblx0cHJpdmF0ZSBfZWxlY3RyaWNDaGFyYWN0ZXI6IEJyYWNrZXRFbGVjdHJpY0NoYXJhY3RlclN1cHBvcnQgfCBudWxsO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkVudGVyU3VwcG9ydDogT25FbnRlclN1cHBvcnQgfCBudWxsO1xuXG5cdHB1YmxpYyByZWFkb25seSBjb21tZW50czogSUNvbW1lbnRzQ29uZmlndXJhdGlvbiB8IG51bGw7XG5cdHB1YmxpYyByZWFkb25seSBjaGFyYWN0ZXJQYWlyOiBDaGFyYWN0ZXJQYWlyU3VwcG9ydDtcblx0cHVibGljIHJlYWRvbmx5IHdvcmREZWZpbml0aW9uOiBSZWdFeHA7XG5cdHB1YmxpYyByZWFkb25seSBpbmRlbnRSdWxlc1N1cHBvcnQ6IEluZGVudFJ1bGVzU3VwcG9ydCB8IG51bGw7XG5cdHB1YmxpYyByZWFkb25seSBpbmRlbnRhdGlvblJ1bGVzOiBJbmRlbnRhdGlvblJ1bGUgfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyByZWFkb25seSBmb2xkaW5nUnVsZXM6IEZvbGRpbmdSdWxlcztcblx0cHVibGljIHJlYWRvbmx5IGJyYWNrZXRzTmV3OiBMYW5ndWFnZUJyYWNrZXRzQ29uZmlndXJhdGlvbjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgbGFuZ3VhZ2VJZDogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSB1bmRlcmx5aW5nQ29uZmlnOiBMYW5ndWFnZUNvbmZpZ3VyYXRpb25cblx0KSB7XG5cdFx0dGhpcy5fYnJhY2tldHMgPSBudWxsO1xuXHRcdHRoaXMuX2VsZWN0cmljQ2hhcmFjdGVyID0gbnVsbDtcblx0XHR0aGlzLl9vbkVudGVyU3VwcG9ydCA9XG5cdFx0XHR0aGlzLnVuZGVybHlpbmdDb25maWcuYnJhY2tldHMgfHxcblx0XHRcdFx0dGhpcy51bmRlcmx5aW5nQ29uZmlnLmluZGVudGF0aW9uUnVsZXMgfHxcblx0XHRcdFx0dGhpcy51bmRlcmx5aW5nQ29uZmlnLm9uRW50ZXJSdWxlc1xuXHRcdFx0XHQ/IG5ldyBPbkVudGVyU3VwcG9ydCh0aGlzLnVuZGVybHlpbmdDb25maWcpXG5cdFx0XHRcdDogbnVsbDtcblx0XHR0aGlzLmNvbW1lbnRzID0gUmVzb2x2ZWRMYW5ndWFnZUNvbmZpZ3VyYXRpb24uX2hhbmRsZUNvbW1lbnRzKHRoaXMudW5kZXJseWluZ0NvbmZpZyk7XG5cdFx0dGhpcy5jaGFyYWN0ZXJQYWlyID0gbmV3IENoYXJhY3RlclBhaXJTdXBwb3J0KHRoaXMudW5kZXJseWluZ0NvbmZpZyk7XG5cblx0XHR0aGlzLndvcmREZWZpbml0aW9uID0gdGhpcy51bmRlcmx5aW5nQ29uZmlnLndvcmRQYXR0ZXJuIHx8IERFRkFVTFRfV09SRF9SRUdFWFA7XG5cdFx0dGhpcy5pbmRlbnRhdGlvblJ1bGVzID0gdGhpcy51bmRlcmx5aW5nQ29uZmlnLmluZGVudGF0aW9uUnVsZXM7XG5cdFx0aWYgKHRoaXMudW5kZXJseWluZ0NvbmZpZy5pbmRlbnRhdGlvblJ1bGVzKSB7XG5cdFx0XHR0aGlzLmluZGVudFJ1bGVzU3VwcG9ydCA9IG5ldyBJbmRlbnRSdWxlc1N1cHBvcnQoXG5cdFx0XHRcdHRoaXMudW5kZXJseWluZ0NvbmZpZy5pbmRlbnRhdGlvblJ1bGVzXG5cdFx0XHQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmluZGVudFJ1bGVzU3VwcG9ydCA9IG51bGw7XG5cdFx0fVxuXHRcdHRoaXMuZm9sZGluZ1J1bGVzID0gdGhpcy51bmRlcmx5aW5nQ29uZmlnLmZvbGRpbmcgfHwge307XG5cblx0XHR0aGlzLmJyYWNrZXRzTmV3ID0gbmV3IExhbmd1YWdlQnJhY2tldHNDb25maWd1cmF0aW9uKFxuXHRcdFx0bGFuZ3VhZ2VJZCxcblx0XHRcdHRoaXMudW5kZXJseWluZ0NvbmZpZ1xuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0V29yZERlZmluaXRpb24oKTogUmVnRXhwIHtcblx0XHRyZXR1cm4gZW5zdXJlVmFsaWRXb3JkRGVmaW5pdGlvbih0aGlzLndvcmREZWZpbml0aW9uKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgYnJhY2tldHMoKTogUmljaEVkaXRCcmFja2V0cyB8IG51bGwge1xuXHRcdGlmICghdGhpcy5fYnJhY2tldHMgJiYgdGhpcy51bmRlcmx5aW5nQ29uZmlnLmJyYWNrZXRzKSB7XG5cdFx0XHR0aGlzLl9icmFja2V0cyA9IG5ldyBSaWNoRWRpdEJyYWNrZXRzKFxuXHRcdFx0XHR0aGlzLmxhbmd1YWdlSWQsXG5cdFx0XHRcdHRoaXMudW5kZXJseWluZ0NvbmZpZy5icmFja2V0c1xuXHRcdFx0KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2JyYWNrZXRzO1xuXHR9XG5cblx0cHVibGljIGdldCBlbGVjdHJpY0NoYXJhY3RlcigpOiBCcmFja2V0RWxlY3RyaWNDaGFyYWN0ZXJTdXBwb3J0IHwgbnVsbCB7XG5cdFx0aWYgKCF0aGlzLl9lbGVjdHJpY0NoYXJhY3Rlcikge1xuXHRcdFx0dGhpcy5fZWxlY3RyaWNDaGFyYWN0ZXIgPSBuZXcgQnJhY2tldEVsZWN0cmljQ2hhcmFjdGVyU3VwcG9ydChcblx0XHRcdFx0dGhpcy5icmFja2V0c1xuXHRcdFx0KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2VsZWN0cmljQ2hhcmFjdGVyO1xuXHR9XG5cblx0cHVibGljIG9uRW50ZXIoXG5cdFx0YXV0b0luZGVudDogRWRpdG9yQXV0b0luZGVudFN0cmF0ZWd5LFxuXHRcdHByZXZpb3VzTGluZVRleHQ6IHN0cmluZyxcblx0XHRiZWZvcmVFbnRlclRleHQ6IHN0cmluZyxcblx0XHRhZnRlckVudGVyVGV4dDogc3RyaW5nXG5cdCk6IEVudGVyQWN0aW9uIHwgbnVsbCB7XG5cdFx0aWYgKCF0aGlzLl9vbkVudGVyU3VwcG9ydCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9vbkVudGVyU3VwcG9ydC5vbkVudGVyKFxuXHRcdFx0YXV0b0luZGVudCxcblx0XHRcdHByZXZpb3VzTGluZVRleHQsXG5cdFx0XHRiZWZvcmVFbnRlclRleHQsXG5cdFx0XHRhZnRlckVudGVyVGV4dFxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0QXV0b0Nsb3NpbmdQYWlycygpOiBBdXRvQ2xvc2luZ1BhaXJzIHtcblx0XHRyZXR1cm4gbmV3IEF1dG9DbG9zaW5nUGFpcnModGhpcy5jaGFyYWN0ZXJQYWlyLmdldEF1dG9DbG9zaW5nUGFpcnMoKSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0QXV0b0Nsb3NlQmVmb3JlU2V0KGZvclF1b3RlczogYm9vbGVhbik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuY2hhcmFjdGVyUGFpci5nZXRBdXRvQ2xvc2VCZWZvcmVTZXQoZm9yUXVvdGVzKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRTdXJyb3VuZGluZ1BhaXJzKCk6IElBdXRvQ2xvc2luZ1BhaXJbXSB7XG5cdFx0cmV0dXJuIHRoaXMuY2hhcmFjdGVyUGFpci5nZXRTdXJyb3VuZGluZ1BhaXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfaGFuZGxlQ29tbWVudHMoXG5cdFx0Y29uZjogTGFuZ3VhZ2VDb25maWd1cmF0aW9uXG5cdCk6IElDb21tZW50c0NvbmZpZ3VyYXRpb24gfCBudWxsIHtcblx0XHRjb25zdCBjb21tZW50UnVsZSA9IGNvbmYuY29tbWVudHM7XG5cdFx0aWYgKCFjb21tZW50UnVsZSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Ly8gY29tbWVudCBjb25maWd1cmF0aW9uXG5cdFx0Y29uc3QgY29tbWVudHM6IElDb21tZW50c0NvbmZpZ3VyYXRpb24gPSB7fTtcblxuXHRcdGlmIChjb21tZW50UnVsZS5saW5lQ29tbWVudCkge1xuXHRcdFx0aWYgKHR5cGVvZiBjb21tZW50UnVsZS5saW5lQ29tbWVudCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0Y29tbWVudHMubGluZUNvbW1lbnRUb2tlbiA9IGNvbW1lbnRSdWxlLmxpbmVDb21tZW50O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29tbWVudHMubGluZUNvbW1lbnRUb2tlbiA9IGNvbW1lbnRSdWxlLmxpbmVDb21tZW50LmNvbW1lbnQ7XG5cdFx0XHRcdGNvbW1lbnRzLmxpbmVDb21tZW50Tm9JbmRlbnQgPSBjb21tZW50UnVsZS5saW5lQ29tbWVudC5ub0luZGVudDtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGNvbW1lbnRSdWxlLmJsb2NrQ29tbWVudCkge1xuXHRcdFx0Y29uc3QgW2Jsb2NrU3RhcnQsIGJsb2NrRW5kXSA9IGNvbW1lbnRSdWxlLmJsb2NrQ29tbWVudDtcblx0XHRcdGNvbW1lbnRzLmJsb2NrQ29tbWVudFN0YXJ0VG9rZW4gPSBibG9ja1N0YXJ0O1xuXHRcdFx0Y29tbWVudHMuYmxvY2tDb21tZW50RW5kVG9rZW4gPSBibG9ja0VuZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gY29tbWVudHM7XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UsIExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsWUFBeUIsaUJBQWlCLG9CQUFvQjtBQUN2RSxZQUFZLGFBQWE7QUFFekIsU0FBUyxxQkFBcUIsaUNBQWlDO0FBQy9ELFNBQThGLHdCQUFzRTtBQUNwSyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHVDQUF1QztBQUNoRCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHdCQUF3QjtBQUVqQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxxQ0FBcUM7QUEwQnZDLE1BQU0sd0NBQXdDO0FBQUEsRUFDcEQsWUFBNEIsWUFBZ0M7QUFBaEM7QUFBQSxFQUFrQztBQUFBLEVBRXZELFFBQVEsWUFBNkI7QUFDM0MsV0FBTyxDQUFDLEtB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
