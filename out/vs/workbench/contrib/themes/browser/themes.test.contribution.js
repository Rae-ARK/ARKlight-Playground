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
import { URI } from "../../../../base/common/uri.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IWorkbenchThemeService } from "../../../services/themes/common/workbenchThemeService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { EditorResourceAccessor } from "../../../common/editor.js";
import { ITextMateTokenizationService } from "../../../services/textMate/browser/textMateTokenizationFeature.js";
import { TokenizationRegistry } from "../../../../editor/common/languages.js";
import { TokenMetadata } from "../../../../editor/common/encodedTokenAttributes.js";
import { findMatchingThemeRule } from "../../../services/textMate/common/TMHelper.js";
import { Color } from "../../../../base/common/color.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { basename } from "../../../../base/common/resources.js";
import { Schemas } from "../../../../base/common/network.js";
import { splitLines } from "../../../../base/common/strings.js";
import { findMetadata } from "../../../services/themes/common/colorThemeData.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { Event } from "../../../../base/common/event.js";
import { Range } from "../../../../editor/common/core/range.js";
import { TreeSitterSyntaxTokenBackend } from "../../../../editor/common/model/tokens/treeSitter/treeSitterSyntaxTokenBackend.js";
import { waitForState } from "../../../../base/common/observable.js";
class ThemeDocument {
  constructor(theme) {
    this._theme = theme;
    this._cache = /* @__PURE__ */ Object.create(null);
    this._defaultColor = "#000000";
    for (let i = 0, len = this._theme.tokenColors.length; i < len; i++) {
      const rule = this._theme.tokenColors[i];
      if (!rule.scope) {
        this._defaultColor = rule.settings.foreground;
      }
    }
  }
  _generateExplanation(selector, color) {
    return `${selector}: ${Color.Format.CSS.formatHexA(color, true).toUpperCase()}`;
  }
  explainTokenColor(scopes, color) {
    const matchingRule = this._findMatchingThemeRule(scopes);
    if (!matchingRule) {
      const expected2 = Color.fromHex(this._defaultColor);
      if (!color.equals(expected2)) {
        throw new Error(`[${this._theme.label}]: Unexpected color ${Color.Format.CSS.formatHexA(color)} for ${scopes}. Expected default ${Color.Format.CSS.formatHexA(expected2)}`);
      }
      return this._generateExplanation("default", color);
    }
    const expected = Color.fromHex(matchingRule.settings.foreground);
    if (!color.equals(expected)) {
      throw new Error(`[${this._theme.label}]: Unexpected color ${Color.Format.CSS.formatHexA(color)} for ${scopes}. Expected ${Color.Format.CSS.formatHexA(expected)} coming in from ${matchingRule.rawSelector}`);
    }
    return this._generateExplanation(matchingRule.rawSelector, color);
  }
  _findMatchingThemeRule(scopes) {
    if (!this._cache[scopes]) {
      this._cache[scopes] = findMatchingThemeRule(this._theme, scopes.split(" "));
    }
    return this._cache[scopes];
  }
}
let Snapper = class {
  constructor(languageService, themeService, textMateService, modelService) {
    this.languageService = languageService;
    this.themeService = themeService;
    this.textMateService = textMateService;
    this.modelService = modelService;
  }
  _themedTokenize(grammar, lines) {
    const colorMap = TokenizationRegistry.getColorMap();
    let state = null;
    const result = [];
    let resultLen = 0;
    for (let i = 0, len = lines.length; i < len; i++) {
      const line = lines[i];
      const tokenizationResult = grammar.tokenizeLine2(line, state);
      for (let j = 0, lenJ = tokenizationResult.tokens.length >>> 1; j < lenJ; j++) {
        const startOffset = tokenizationResult.tokens[j << 1];
        const metadata = tokenizationResult.tokens[(j << 1) + 1];
        const endOffset = j + 1 < lenJ ? tokenizationResult.tokens[j + 1 << 1] : line.length;
        const tokenText = line.substring(startOffset, endOffset);
        const color = TokenMetadata.getForeground(metadata);
        result[resultLen++] = {
          text: tokenText,
          color: colorMap[color]
        };
      }
      state = tokenizationResult.ruleStack;
    }
    return result;
  }
  _themedTokenizeTreeSitter(tokens, languageId) {
    const colorMap = TokenizationRegistry.getColorMap();
    const result = Array(tokens.length);
    const colorThemeData = this.themeService.getColorTheme();
    for (let i = 0, len = tokens.length; i < len; i++) {
      const token = tokens[i];
      const scopes = token.t.split(" ");
      const metadata = findMetadata(colorThemeData, scopes, this.languageService.languageIdCodec.encodeLanguageId(languageId), false);
      const color = TokenMetadata.getForeground(metadata);
      result[i] = {
        text: token.c,
        color: colorMap[color]
      };
    }
    return result;
  }
  _tokenize(grammar, lines) {
    let state = null;
    const result = [];
    let resultLen = 0;
    for (let i = 0, len = lines.length; i < len; i++) {
      const line = lines[i];
      const tokenizationResult = grammar.tokenizeLine(line, state);
      let lastScopes = null;
      for (let j = 0, lenJ = tokenizationResult.tokens.length; j < lenJ; j++) {
        const token = tokenizationResult.tokens[j];
        const tokenText = line.substring(token.startIndex, token.endIndex);
        const tokenScopes = token.scopes.join(" ");
        if (lastScopes === tokenScopes) {
          result[resultLen - 1].c += tokenText;
        } else {
          lastScopes = tokenScopes;
          result[resultLen++] = {
            c: tokenText,
            t: tokenScopes,
            r: {
              dark_plus: void 0,
              light_plus: void 0,
              dark_vs: void 0,
              light_vs: void 0,
              hc_black: void 0
            }
          };
        }
      }
      state = tokenizationResult.ruleStack;
    }
    return result;
  }
  async _getThemesResult(grammar, lines) {
    const currentTheme = this.themeService.getColorTheme();
    const getThemeName = (id) => {
      const part = "vscode-theme-defaults-themes-";
      const startIdx = id.indexOf(part);
      if (startIdx !== -1) {
        return id.substring(startIdx + part.length, id.length - 5);
      }
      return void 0;
    };
    const result = {};
    const themeDatas = await this.themeService.getColorThemes();
    const defaultThemes = themeDatas.filter((themeData) => !!getThemeName(themeData.id));
    for (const defaultTheme of defaultThemes) {
      const themeId = defaultTheme.id;
      const success = await this.themeService.setColorTheme(themeId, void 0);
      if (success) {
        const themeName = getThemeName(themeId);
        result[themeName] = {
          document: new ThemeDocument(this.themeService.getColorTheme()),
          tokens: this._themedTokenize(grammar, lines)
        };
      }
    }
    await this.themeService.setColorTheme(currentTheme.id, void 0);
    return result;
  }
  async _getTreeSitterThemesResult(tokens, languageId) {
    const currentTheme = this.themeService.getColorTheme();
    const getThemeName = (id) => {
      const part = "vscode-theme-defaults-themes-";
      const startIdx = id.indexOf(part);
      if (startIdx !== -1) {
        return id.substring(startIdx + part.length, id.length - 5);
      }
      return void 0;
    };
    const result = {};
    const themeDatas = await this.themeService.getColorThemes();
    const defaultThemes = themeDatas.filter((themeData) => !!getThemeName(themeData.id));
    for (const defaultTheme of defaultThemes) {
      const themeId = defaultTheme.id;
      const success = await this.themeService.setColorTheme(themeId, void 0);
      if (success) {
        const themeName = getThemeName(themeId);
        result[themeName] = {
          document: new ThemeDocument(this.themeService.getColorTheme()),
          tokens: this._themedTokenizeTreeSitter(tokens, languageId)
        };
      }
    }
    await this.themeService.setColorTheme(currentTheme.id, void 0);
    return result;
  }
  _enrichResult(result, themesResult) {
    const index = {};
    const themeNames = Object.keys(themesResult);
    for (const themeName of themeNames) {
      index[themeName] = 0;
    }
    for (let i = 0, len = result.length; i < len; i++) {
      const token = result[i];
      for (const themeName of themeNames) {
        const themedToken = themesResult[themeName].tokens[index[themeName]];
        themedToken.text = themedToken.text.substr(token.c.length);
        if (themedToken.color) {
          token.r[themeName] = themesResult[themeName].document.explainTokenColor(token.t, themedToken.color);
        }
        if (themedToken.text.length === 0) {
          index[themeName]++;
        }
      }
    }
  }
  _moveInjectionCursorToRange(cursor, injectionRange) {
    let continueCursor = cursor.gotoFirstChild();
    while ((cursor.startIndex < injectionRange.startIndex || cursor.endIndex > injectionRange.endIndex) && continueCursor) {
      if (cursor.endIndex < injectionRange.startIndex) {
        continueCursor = cursor.gotoNextSibling();
      } else {
        continueCursor = cursor.gotoFirstChild();
      }
    }
  }
  async _treeSitterTokenize(treeSitterTree, tokenizationModel, languageId) {
    const tree = await waitForState(treeSitterTree.tree);
    if (!tree) {
      return [];
    }
    const cursor = tree.walk();
    cursor.gotoFirstChild();
    let cursorResult = true;
    const tokens = [];
    const cursors = [{ cursor, languageId, startOffset: 0, endOffset: treeSitterTree.textModel.getValueLength() }];
    do {
      const current = cursors[cursors.length - 1];
      const currentCursor = current.cursor;
      const currentLanguageId = current.languageId;
      const isOutsideRange = currentCursor.currentNode.endIndex > current.endOffset;
      if (!isOutsideRange && currentCursor.currentNode.childCount === 0) {
        const range = new Range(currentCursor.currentNode.startPosition.row + 1, currentCursor.currentNode.startPosition.column + 1, currentCursor.currentNode.endPosition.row + 1, currentCursor.currentNode.endPosition.column + 1);
        const injection = treeSitterTree.getInjectionTrees(currentCursor.currentNode.startIndex, currentLanguageId);
        const treeSitterRange = injection?.ranges.find((r) => r.startIndex <= currentCursor.currentNode.startIndex && r.endIndex >= currentCursor.currentNode.endIndex);
        const injectionTree = injection?.tree.get();
        const injectionLanguageId = injection?.languageId;
        if (injectionTree && injectionLanguageId && treeSitterRange && treeSitterRange.startIndex === currentCursor.currentNode.startIndex) {
          const injectionCursor = injectionTree.walk();
          this._moveInjectionCursorToRange(injectionCursor, treeSitterRange);
          cursors.push({ cursor: injectionCursor, languageId: injectionLanguageId, startOffset: treeSitterRange.startIndex, endOffset: treeSitterRange.endIndex });
          while (currentCursor.endIndex <= treeSitterRange.endIndex && (currentCursor.gotoNextSibling() || currentCursor.gotoParent())) {
          }
        } else {
          const capture = tokenizationModel.captureAtRangeTree(range);
          tokens.push({
            c: currentCursor.currentNode.text.replace(/\r/g, ""),
            t: capture?.map((cap) => cap.name).join(" ") ?? "",
            r: {
              dark_plus: void 0,
              light_plus: void 0,
              dark_vs: void 0,
              light_vs: void 0,
              hc_black: void 0
            }
          });
          while (!(cursorResult = currentCursor.gotoNextSibling())) {
            if (!(cursorResult = currentCursor.gotoParent())) {
              break;
            }
          }
        }
      } else {
        cursorResult = currentCursor.gotoFirstChild();
      }
      if (cursors.length > 1 && (!cursorResult && currentCursor === cursors[cursors.length - 1].cursor || isOutsideRange)) {
        current.cursor.delete();
        cursors.pop();
        cursorResult = true;
      }
    } while (cursorResult);
    cursor.delete();
    return tokens;
  }
  captureSyntaxTokens(fileName, content) {
    const languageId = this.languageService.guessLanguageIdByFilepathOrFirstLine(URI.file(fileName));
    return this.textMateService.createTokenizer(languageId).then((grammar) => {
      if (!grammar) {
        return [];
      }
      const lines = splitLines(content);
      const result = this._tokenize(grammar, lines);
      return this._getThemesResult(grammar, lines).then((themesResult) => {
        this._enrichResult(result, themesResult);
        return result.filter((t) => t.c.length > 0);
      });
    });
  }
  async captureTreeSitterSyntaxTokens(resource, content) {
    const languageId = this.languageService.guessLanguageIdByFilepathOrFirstLine(resource);
    if (!languageId) {
      return [];
    }
    const model = this.modelService.getModel(resource) ?? this.modelService.createModel(content, { languageId, onDidChange: Event.None }, resource);
    const tokenizationPart = model.tokenization.tokens.get();
    if (!(tokenizationPart instanceof TreeSitterSyntaxTokenBackend)) {
      return [];
    }
    const treeObs = tokenizationPart.tree;
    const tokenizationImplObs = tokenizationPart.tokenizationImpl;
    const treeSitterTree = treeObs.get() ?? await waitForState(treeObs);
    const tokenizationImpl = tokenizationImplObs.get() ?? await waitForState(tokenizationImplObs);
    if (!treeSitterTree) {
      return [];
    }
    const result = (await this._treeSitterTokenize(treeSitterTree, tokenizationImpl, languageId)).filter((t) => t.c.length > 0);
    const themeTokens = await this._getTreeSitterThemesResult(result, languageId);
    this._enrichResult(result, themeTokens);
    return result;
  }
};
Snapper = __decorateClass([
  __decorateParam(0, ILanguageService),
  __decorateParam(1, IWorkbenchThemeService),
  __decorateParam(2, ITextMateTokenizationService),
  __decorateParam(3, IModelService)
], Snapper);
async function captureTokens(accessor, resource, treeSitter = false) {
  const process = (resource2) => {
    const fileService = accessor.get(IFileService);
    const fileName = basename(resource2);
    const snapper = accessor.get(IInstantiationService).createInstance(Snapper);
    return fileService.readFile(resource2).then((content) => {
      if (treeSitter) {
        return snapper.captureTreeSitterSyntaxTokens(resource2, content.value.toString());
      } else {
        return snapper.captureSyntaxTokens(fileName, content.value.toString());
      }
    });
  };
  if (!resource) {
    const editorService = accessor.get(IEditorService);
    const file = editorService.activeEditor ? EditorResourceAccessor.getCanonicalUri(editorService.activeEditor, { filterByScheme: Schemas.file }) : null;
    if (file) {
      process(file).then((result) => {
        console.log(result);
      });
    } else {
      console.log("No file editor active");
    }
  } else {
    const processResult = await process(resource);
    return processResult;
  }
  return void 0;
}
CommandsRegistry.registerCommand("_workbench.captureSyntaxTokens", function(accessor, resource) {
  return captureTokens(accessor, resource);
});
CommandsRegistry.registerCommand("_workbench.captureTreeSitterSyntaxTokens", function(accessor, resource) {
  if (!resource) {
    const editorService = accessor.get(IEditorService);
    resource = editorService.activeEditor?.resource;
  }
  return captureTokens(accessor, resource, true);
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3RoZW1lcy9icm93c2VyL3RoZW1lcy50ZXN0LmNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgdHlwZSAqIGFzIFBhcnNlciBmcm9tICdAdnNjb2RlL3RyZWUtc2l0dGVyLXdhc20nO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoVGhlbWVTZXJ2aWNlLCBJV29ya2JlbmNoQ29sb3JUaGVtZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3RoZW1lcy9jb21tb24vd29ya2JlbmNoVGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVkaXRvclJlc291cmNlQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElUZXh0TWF0ZVRva2VuaXphdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy90ZXh0TWF0ZS9icm93c2VyL3RleHRNYXRlVG9rZW5pemF0aW9uRmVhdHVyZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElHcmFtbWFyLCBTdGF0ZVN0YWNrIH0gZnJvbSAndnNjb2RlLXRleHRtYXRlJztcbmltcG9ydCB7IFRva2VuaXphdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgVG9rZW5NZXRhZGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZW5jb2RlZFRva2VuQXR0cmlidXRlcy5qcyc7XG5pbXBvcnQgeyBUaGVtZVJ1bGUsIGZpbmRNYXRjaGluZ1RoZW1lUnVsZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3RleHRNYXRlL2NvbW1vbi9UTUhlbHBlci5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBzcGxpdExpbmVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBDb2xvclRoZW1lRGF0YSwgZmluZE1ldGFkYXRhIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdGhlbWVzL2NvbW1vbi9jb2xvclRoZW1lRGF0YS5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFRyZWVTaXR0ZXJUcmVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC90b2tlbnMvdHJlZVNpdHRlci90cmVlU2l0dGVyVHJlZS5qcyc7XG5pbXBvcnQgeyBUb2tlbml6YXRpb25UZXh0TW9kZWxQYXJ0IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC90b2tlbnMvdG9rZW5pemF0aW9uVGV4dE1vZGVsUGFydC5qcyc7XG5pbXBvcnQgeyBUcmVlU2l0dGVyU3ludGF4VG9rZW5CYWNrZW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC90b2tlbnMvdHJlZVNpdHRlci90cmVlU2l0dGVyU3ludGF4VG9rZW5CYWNrZW5kLmpzJztcbmltcG9ydCB7IFRyZWVTaXR0ZXJUb2tlbml6YXRpb25JbXBsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC90b2tlbnMvdHJlZVNpdHRlci90cmVlU2l0dGVyVG9rZW5pemF0aW9uSW1wbC5qcyc7XG5pbXBvcnQgeyB3YWl0Rm9yU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcblxuaW50ZXJmYWNlIElUb2tlbiB7XG5cdGM6IHN0cmluZzsgLy8gdG9rZW5cblx0dDogc3RyaW5nOyAvLyBzcGFjZSBzZXBhcmF0ZWQgc2NvcGVzLCBtb3N0IGdlbmVyYWwgdG8gbW9zdCBzcGVjaWZpY1xuXHRyOiB7IFt0aGVtZU5hbWU6IHN0cmluZ106IHN0cmluZyB8IHVuZGVmaW5lZCB9OyAvLyB0b2tlbiB0eXBlOiBjb2xvclxufVxuXG5pbnRlcmZhY2UgSVRoZW1lZFRva2VuIHtcblx0dGV4dDogc3RyaW5nO1xuXHRjb2xvcjogQ29sb3IgfCBudWxsO1xufVxuXG5pbnRlcmZhY2UgSVRoZW1lc1Jlc3VsdCB7XG5cdFt0aGVtZU5hbWU6IHN0cmluZ106IHtcblx0XHRkb2N1bWVudDogVGhlbWVEb2N1bWVudDtcblx0XHR0b2tlbnM6IElUaGVtZWRUb2tlbltdO1xuXHR9O1xufVxuXG5jbGFzcyBUaGVtZURvY3VtZW50IHtcblx0cHJpdmF0ZSByZWFkb25seSBfdGhlbWU6IElXb3JrYmVuY2hDb2xvclRoZW1lO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jYWNoZTogeyBbc2NvcGVzOiBzdHJpbmddOiBUaGVtZVJ1bGUgfTtcblx0cHJpdmF0ZSByZWFkb25seSBfZGVmYXVsdENvbG9yOiBzdHJpbmc7XG5cblx0Y29uc3RydWN0b3IodGhlbWU6IElXb3JrYmVuY2hDb2xvclRoZW1lKSB7XG5cdFx0dGhpcy5fdGhlbWUgPSB0aGVtZTtcblx0XHR0aGlzLl9jYWNoZSA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0dGhpcy5fZGVmYXVsdENvbG9yID0gJyMwMDAwMDAnO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSB0aGlzLl90aGVtZS50b2tlbkNvbG9ycy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgcnVsZSA9IHRoaXMuX3RoZW1lLnRva2VuQ29sb3JzW2ldO1xuXHRcdFx0aWYgKCFydWxlLnNjb3BlKSB7XG5cdFx0XHRcdHRoaXMuX2RlZmF1bHRDb2xvciA9IHJ1bGUuc2V0dGluZ3MuZm9yZWdyb3VuZCE7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2VuZXJhdGVFeHBsYW5hdGlvbihzZWxlY3Rvcjogc3RyaW5nLCBjb2xvcjogQ29sb3IpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgJHtzZWxlY3Rvcn06ICR7Q29sb3IuRm9ybWF0LkNTUy5mb3JtYXRIZXhBKGNvbG9yLCB0cnVlKS50b1VwcGVyQ2FzZSgpfWA7XG5cdH1cblxuXHRwdWJsaWMgZXhwbGFpblRva2VuQ29sb3Ioc2NvcGVzOiBzdHJpbmcsIGNvbG9yOiBDb2xvcik6IHN0cmluZyB7XG5cblx0XHRjb25zdCBtYXRjaGluZ1J1bGUgPSB0aGlzLl9maW5kTWF0Y2hpbmdUaGVtZVJ1bGUoc2NvcGVzKTtcblx0XHRpZiAoIW1hdGNoaW5nUnVsZSkge1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWQgPSBDb2xvci5mcm9tSGV4KHRoaXMuX2RlZmF1bHRDb2xvcik7XG5cdFx0XHQvLyBObyBtYXRjaGluZyBydWxlXG5cdFx0XHRpZiAoIWNvbG9yLmVxdWFscyhleHBlY3RlZCkpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBbJHt0aGlzLl90aGVtZS5sYWJlbH1dOiBVbmV4cGVjdGVkIGNvbG9yICR7Q29sb3IuRm9ybWF0LkNTUy5mb3JtYXRIZXhBKGNvbG9yKX0gZm9yICR7c2NvcGVzfS4gRXhwZWN0ZWQgZGVmYXVsdCAke0NvbG9yLkZvcm1hdC5DU1MuZm9ybWF0SGV4QShleHBlY3RlZCl9YCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5fZ2VuZXJhdGVFeHBsYW5hdGlvbignZGVmYXVsdCcsIGNvbG9yKTtcblx0XHR9XG5cblx0XHRjb25zdCBleHBlY3RlZCA9IENvbG9yLmZyb21IZXgobWF0Y2hpbmdSdWxlLnNldHRpbmdzLmZvcmVncm91bmQhKTtcblx0XHRpZiAoIWNvbG9yLmVxdWFscyhleHBlY3RlZCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgWyR7dGhpcy5fdGhlbWUubGFiZWx9XTogVW5leHBlY3RlZCBjb2xvciAke0NvbG9yLkZvcm1hdC5DU1MuZm9ybWF0SGV4QShjb2xvcil9IGZvciAke3Njb3Blc30uIEV4cGVjdGVkICR7Q29sb3IuRm9ybWF0LkNTUy5mb3JtYXRIZXhBKGV4cGVjdGVkKX0gY29taW5nIGluIGZyb20gJHttYXRjaGluZ1J1bGUucmF3U2VsZWN0b3J9YCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9nZW5lcmF0ZUV4cGxhbmF0aW9uKG1hdGNoaW5nUnVsZS5yYXdTZWxlY3RvciwgY29sb3IpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZmluZE1hdGNoaW5nVGhlbWVSdWxlKHNjb3Blczogc3RyaW5nKTogVGhlbWVSdWxlIHtcblx0XHRpZiAoIXRoaXMuX2NhY2hlW3Njb3Blc10pIHtcblx0XHRcdHRoaXMuX2NhY2hlW3Njb3Blc10gPSBmaW5kTWF0Y2hpbmdUaGVtZVJ1bGUodGhpcy5fdGhlbWUsIHNjb3Blcy5zcGxpdCgnICcpKSE7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9jYWNoZVtzY29wZXNdO1xuXHR9XG59XG5cbmNsYXNzIFNuYXBwZXIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGhlbWVTZXJ2aWNlOiBJV29ya2JlbmNoVGhlbWVTZXJ2aWNlLFxuXHRcdEBJVGV4dE1hdGVUb2tlbml6YXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGV4dE1hdGVTZXJ2aWNlOiBJVGV4dE1hdGVUb2tlbml6YXRpb25TZXJ2aWNlLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHQpIHtcblx0fVxuXG5cdHByaXZhdGUgX3RoZW1lZFRva2VuaXplKGdyYW1tYXI6IElHcmFtbWFyLCBsaW5lczogc3RyaW5nW10pOiBJVGhlbWVkVG9rZW5bXSB7XG5cdFx0Y29uc3QgY29sb3JNYXAgPSBUb2tlbml6YXRpb25SZWdpc3RyeS5nZXRDb2xvck1hcCgpO1xuXHRcdGxldCBzdGF0ZTogU3RhdGVTdGFjayB8IG51bGwgPSBudWxsO1xuXHRcdGNvbnN0IHJlc3VsdDogSVRoZW1lZFRva2VuW10gPSBbXTtcblx0XHRsZXQgcmVzdWx0TGVuID0gMDtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gbGluZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IGxpbmUgPSBsaW5lc1tpXTtcblxuXHRcdFx0Y29uc3QgdG9rZW5pemF0aW9uUmVzdWx0ID0gZ3JhbW1hci50b2tlbml6ZUxpbmUyKGxpbmUsIHN0YXRlKTtcblxuXHRcdFx0Zm9yIChsZXQgaiA9IDAsIGxlbkogPSB0b2tlbml6YXRpb25SZXN1bHQudG9rZW5zLmxlbmd0aCA+Pj4gMTsgaiA8IGxlbko7IGorKykge1xuXHRcdFx0XHRjb25zdCBzdGFydE9mZnNldCA9IHRva2VuaXphdGlvblJlc3VsdC50b2tlbnNbKGogPDwgMSldO1xuXHRcdFx0XHRjb25zdCBtZXRhZGF0YSA9IHRva2VuaXphdGlvblJlc3VsdC50b2tlbnNbKGogPDwgMSkgKyAxXTtcblx0XHRcdFx0Y29uc3QgZW5kT2Zmc2V0ID0gaiArIDEgPCBsZW5KID8gdG9rZW5pemF0aW9uUmVzdWx0LnRva2Vuc1soKGogKyAxKSA8PCAxKV0gOiBsaW5lLmxlbmd0aDtcblx0XHRcdFx0Y29uc3QgdG9rZW5UZXh0ID0gbGluZS5zdWJzdHJpbmcoc3RhcnRPZmZzZXQsIGVuZE9mZnNldCk7XG5cblx0XHRcdFx0Y29uc3QgY29sb3IgPSBUb2tlbk1ldGFkYXRhLmdldEZvcmVncm91bmQobWV0YWRhdGEpO1xuXG5cdFx0XHRcdHJlc3VsdFtyZXN1bHRMZW4rK10gPSB7XG5cdFx0XHRcdFx0dGV4dDogdG9rZW5UZXh0LFxuXHRcdFx0XHRcdGNvbG9yOiBjb2xvck1hcCFbY29sb3JdXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHRcdHN0YXRlID0gdG9rZW5pemF0aW9uUmVzdWx0LnJ1bGVTdGFjaztcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBfdGhlbWVkVG9rZW5pemVUcmVlU2l0dGVyKHRva2VuczogSVRva2VuW10sIGxhbmd1YWdlSWQ6IHN0cmluZyk6IElUaGVtZWRUb2tlbltdIHtcblx0XHRjb25zdCBjb2xvck1hcCA9IFRva2VuaXphdGlvblJlZ2lzdHJ5LmdldENvbG9yTWFwKCk7XG5cdFx0Y29uc3QgcmVzdWx0OiBJVGhlbWVkVG9rZW5bXSA9IEFycmF5KHRva2Vucy5sZW5ndGgpO1xuXHRcdGNvbnN0IGNvbG9yVGhlbWVEYXRhID0gdGhpcy50aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpIGFzIENvbG9yVGhlbWVEYXRhO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSB0b2tlbnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IHRva2VuID0gdG9rZW5zW2ldO1xuXHRcdFx0Y29uc3Qgc2NvcGVzID0gdG9rZW4udC5zcGxpdCgnICcpO1xuXHRcdFx0Y29uc3QgbWV0YWRhdGEgPSBmaW5kTWV0YWRhdGEoY29sb3JUaGVtZURhdGEsIHNjb3BlcywgdGhpcy5sYW5ndWFnZVNlcnZpY2UubGFuZ3VhZ2VJZENvZGVjLmVuY29kZUxhbmd1YWdlSWQobGFuZ3VhZ2VJZCksIGZhbHNlKTtcblx0XHRcdGNvbnN0IGNvbG9yID0gVG9rZW5NZXRhZGF0YS5nZXRGb3JlZ3JvdW5kKG1ldGFkYXRhKTtcblxuXHRcdFx0cmVzdWx0W2ldID0ge1xuXHRcdFx0XHR0ZXh0OiB0b2tlbi5jLFxuXHRcdFx0XHRjb2xvcjogY29sb3JNYXAhW2NvbG9yXVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9rZW5pemUoZ3JhbW1hcjogSUdyYW1tYXIsIGxpbmVzOiBzdHJpbmdbXSk6IElUb2tlbltdIHtcblx0XHRsZXQgc3RhdGU6IFN0YXRlU3RhY2sgfCBudWxsID0gbnVsbDtcblx0XHRjb25zdCByZXN1bHQ6IElUb2tlbltdID0gW107XG5cdFx0bGV0IHJlc3VsdExlbiA9IDA7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGxpbmVzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBsaW5lID0gbGluZXNbaV07XG5cblx0XHRcdGNvbnN0IHRva2VuaXphdGlvblJlc3VsdCA9IGdyYW1tYXIudG9rZW5pemVMaW5lKGxpbmUsIHN0YXRlKTtcblx0XHRcdGxldCBsYXN0U2NvcGVzOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblxuXHRcdFx0Zm9yIChsZXQgaiA9IDAsIGxlbkogPSB0b2tlbml6YXRpb25SZXN1bHQudG9rZW5zLmxlbmd0aDsgaiA8IGxlbko7IGorKykge1xuXHRcdFx0XHRjb25zdCB0b2tlbiA9IHRva2VuaXphdGlvblJlc3VsdC50b2tlbnNbal07XG5cdFx0XHRcdGNvbnN0IHRva2VuVGV4dCA9IGxpbmUuc3Vic3RyaW5nKHRva2VuLnN0YXJ0SW5kZXgsIHRva2VuLmVuZEluZGV4KTtcblx0XHRcdFx0Y29uc3QgdG9rZW5TY29wZXMgPSB0b2tlbi5zY29wZXMuam9pbignICcpO1xuXG5cdFx0XHRcdGlmIChsYXN0U2NvcGVzID09PSB0b2tlblNjb3Blcykge1xuXHRcdFx0XHRcdHJlc3VsdFtyZXN1bHRMZW4gLSAxXS5jICs9IHRva2VuVGV4dDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRsYXN0U2NvcGVzID0gdG9rZW5TY29wZXM7XG5cdFx0XHRcdFx0cmVzdWx0W3Jlc3VsdExlbisrXSA9IHtcblx0XHRcdFx0XHRcdGM6IHRva2VuVGV4dCxcblx0XHRcdFx0XHRcdHQ6IHRva2VuU2NvcGVzLFxuXHRcdFx0XHRcdFx0cjoge1xuXHRcdFx0XHRcdFx0XHRkYXJrX3BsdXM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0bGlnaHRfcGx1czogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRkYXJrX3ZzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdGxpZ2h0X3ZzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdGhjX2JsYWNrOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRzdGF0ZSA9IHRva2VuaXphdGlvblJlc3VsdC5ydWxlU3RhY2s7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRUaGVtZXNSZXN1bHQoZ3JhbW1hcjogSUdyYW1tYXIsIGxpbmVzOiBzdHJpbmdbXSk6IFByb21pc2U8SVRoZW1lc1Jlc3VsdD4ge1xuXHRcdGNvbnN0IGN1cnJlbnRUaGVtZSA9IHRoaXMudGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKTtcblxuXHRcdGNvbnN0IGdldFRoZW1lTmFtZSA9IChpZDogc3RyaW5nKSA9PiB7XG5cdFx0XHRjb25zdCBwYXJ0ID0gJ3ZzY29kZS10aGVtZS1kZWZhdWx0cy10aGVtZXMtJztcblx0XHRcdGNvbnN0IHN0YXJ0SWR4ID0gaWQuaW5kZXhPZihwYXJ0KTtcblx0XHRcdGlmIChzdGFydElkeCAhPT0gLTEpIHtcblx0XHRcdFx0cmV0dXJuIGlkLnN1YnN0cmluZyhzdGFydElkeCArIHBhcnQubGVuZ3RoLCBpZC5sZW5ndGggLSA1KTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlc3VsdDogSVRoZW1lc1Jlc3VsdCA9IHt9O1xuXG5cdFx0Y29uc3QgdGhlbWVEYXRhcyA9IGF3YWl0IHRoaXMudGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWVzKCk7XG5cdFx0Y29uc3QgZGVmYXVsdFRoZW1lcyA9IHRoZW1lRGF0YXMuZmlsdGVyKHRoZW1lRGF0YSA9PiAhIWdldFRoZW1lTmFtZSh0aGVtZURhdGEuaWQpKTtcblx0XHRmb3IgKGNvbnN0IGRlZmF1bHRUaGVtZSBvZiBkZWZhdWx0VGhlbWVzKSB7XG5cdFx0XHRjb25zdCB0aGVtZUlkID0gZGVmYXVsdFRoZW1lLmlkO1xuXHRcdFx0Y29uc3Qgc3VjY2VzcyA9IGF3YWl0IHRoaXMudGhlbWVTZXJ2aWNlLnNldENvbG9yVGhlbWUodGhlbWVJZCwgdW5kZWZpbmVkKTtcblx0XHRcdGlmIChzdWNjZXNzKSB7XG5cdFx0XHRcdGNvbnN0IHRoZW1lTmFtZSA9IGdldFRoZW1lTmFtZSh0aGVtZUlkKTtcblx0XHRcdFx0cmVzdWx0W3RoZW1lTmFtZSFdID0ge1xuXHRcdFx0XHRcdGRvY3VtZW50OiBuZXcgVGhlbWVEb2N1bWVudCh0aGlzLnRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkpLFxuXHRcdFx0XHRcdHRva2VuczogdGhpcy5fdGhlbWVkVG9rZW5pemUoZ3JhbW1hciwgbGluZXMpXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMudGhlbWVTZXJ2aWNlLnNldENvbG9yVGhlbWUoY3VycmVudFRoZW1lLmlkLCB1bmRlZmluZWQpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRUcmVlU2l0dGVyVGhlbWVzUmVzdWx0KHRva2VuczogSVRva2VuW10sIGxhbmd1YWdlSWQ6IHN0cmluZyk6IFByb21pc2U8SVRoZW1lc1Jlc3VsdD4ge1xuXHRcdGNvbnN0IGN1cnJlbnRUaGVtZSA9IHRoaXMudGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKTtcblxuXHRcdGNvbnN0IGdldFRoZW1lTmFtZSA9IChpZDogc3RyaW5nKSA9PiB7XG5cdFx0XHRjb25zdCBwYXJ0ID0gJ3ZzY29kZS10aGVtZS1kZWZhdWx0cy10aGVtZXMtJztcblx0XHRcdGNvbnN0IHN0YXJ0SWR4ID0gaWQuaW5kZXhPZihwYXJ0KTtcblx0XHRcdGlmIChzdGFydElkeCAhPT0gLTEpIHtcblx0XHRcdFx0cmV0dXJuIGlkLnN1YnN0cmluZyhzdGFydElkeCArIHBhcnQubGVuZ3RoLCBpZC5sZW5ndGggLSA1KTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlc3VsdDogSVRoZW1lc1Jlc3VsdCA9IHt9O1xuXG5cdFx0Y29uc3QgdGhlbWVEYXRhcyA9IGF3YWl0IHRoaXMudGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWVzKCk7XG5cdFx0Y29uc3QgZGVmYXVsdFRoZW1lcyA9IHRoZW1lRGF0YXMuZmlsdGVyKHRoZW1lRGF0YSA9PiAhIWdldFRoZW1lTmFtZSh0aGVtZURhdGEuaWQpKTtcblx0XHRmb3IgKGNvbnN0IGRlZmF1bHRUaGVtZSBvZiBkZWZhdWx0VGhlbWVzKSB7XG5cdFx0XHRjb25zdCB0aGVtZUlkID0gZGVmYXVsdFRoZW1lLmlkO1xuXHRcdFx0Y29uc3Qgc3VjY2VzcyA9IGF3YWl0IHRoaXMudGhlbWVTZXJ2aWNlLnNldENvbG9yVGhlbWUodGhlbWVJZCwgdW5kZWZpbmVkKTtcblx0XHRcdGlmIChzdWNjZXNzKSB7XG5cdFx0XHRcdGNvbnN0IHRoZW1lTmFtZSA9IGdldFRoZW1lTmFtZSh0aGVtZUlkKTtcblx0XHRcdFx0cmVzdWx0W3RoZW1lTmFtZSFdID0ge1xuXHRcdFx0XHRcdGRvY3VtZW50OiBuZXcgVGhlbWVEb2N1bWVudCh0aGlzLnRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkpLFxuXHRcdFx0XHRcdHRva2VuczogdGhpcy5fdGhlbWVkVG9rZW5pemVUcmVlU2l0dGVyKHRva2VucywgbGFuZ3VhZ2VJZClcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cdFx0YXdhaXQgdGhpcy50aGVtZVNlcnZpY2Uuc2V0Q29sb3JUaGVtZShjdXJyZW50VGhlbWUuaWQsIHVuZGVmaW5lZCk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cblx0cHJpdmF0ZSBfZW5yaWNoUmVzdWx0KHJlc3VsdDogSVRva2VuW10sIHRoZW1lc1Jlc3VsdDogSVRoZW1lc1Jlc3VsdCk6IHZvaWQge1xuXHRcdGNvbnN0IGluZGV4OiB7IFt0aGVtZU5hbWU6IHN0cmluZ106IG51bWJlciB9ID0ge307XG5cdFx0Y29uc3QgdGhlbWVOYW1lcyA9IE9iamVjdC5rZXlzKHRoZW1lc1Jlc3VsdCk7XG5cdFx0Zm9yIChjb25zdCB0aGVtZU5hbWUgb2YgdGhlbWVOYW1lcykge1xuXHRcdFx0aW5kZXhbdGhlbWVOYW1lXSA9IDA7XG5cdFx0fVxuXG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHJlc3VsdC5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgdG9rZW4gPSByZXN1bHRbaV07XG5cblx0XHRcdGZvciAoY29uc3QgdGhlbWVOYW1lIG9mIHRoZW1lTmFtZXMpIHtcblx0XHRcdFx0Y29uc3QgdGhlbWVkVG9rZW4gPSB0aGVtZXNSZXN1bHRbdGhlbWVOYW1lXS50b2tlbnNbaW5kZXhbdGhlbWVOYW1lXV07XG5cblx0XHRcdFx0dGhlbWVkVG9rZW4udGV4dCA9IHRoZW1lZFRva2VuLnRleHQuc3Vic3RyKHRva2VuLmMubGVuZ3RoKTtcblx0XHRcdFx0aWYgKHRoZW1lZFRva2VuLmNvbG9yKSB7XG5cdFx0XHRcdFx0dG9rZW4uclt0aGVtZU5hbWVdID0gdGhlbWVzUmVzdWx0W3RoZW1lTmFtZV0uZG9jdW1lbnQuZXhwbGFpblRva2VuQ29sb3IodG9rZW4udCwgdGhlbWVkVG9rZW4uY29sb3IpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0aGVtZWRUb2tlbi50ZXh0Lmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdGluZGV4W3RoZW1lTmFtZV0rKztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX21vdmVJbmplY3Rpb25DdXJzb3JUb1JhbmdlKGN1cnNvcjogUGFyc2VyLlRyZWVDdXJzb3IsIGluamVjdGlvblJhbmdlOiB7IHN0YXJ0SW5kZXg6IG51bWJlcjsgZW5kSW5kZXg6IG51bWJlciB9KTogdm9pZCB7XG5cdFx0bGV0IGNvbnRpbnVlQ3Vyc29yID0gY3Vyc29yLmdvdG9GaXJzdENoaWxkKCk7XG5cdFx0Ly8gR2V0IGludG8gdGhlIGZpcnN0IFwicmVhbFwiIGNoaWxkIG5vZGUsIGFzIHRoZSByb290IG5vZGVzIGNhbiBleHRlbmQgb3V0c2lkZSB0aGUgcmFuZ2UuXG5cdFx0d2hpbGUgKCgoY3Vyc29yLnN0YXJ0SW5kZXggPCBpbmplY3Rpb25SYW5nZS5zdGFydEluZGV4KSB8fCAoY3Vyc29yLmVuZEluZGV4ID4gaW5qZWN0aW9uUmFuZ2UuZW5kSW5kZXgpKSAmJiBjb250aW51ZUN1cnNvcikge1xuXHRcdFx0aWYgKGN1cnNvci5lbmRJbmRleCA8IGluamVjdGlvblJhbmdlLnN0YXJ0SW5kZXgpIHtcblx0XHRcdFx0Y29udGludWVDdXJzb3IgPSBjdXJzb3IuZ290b05leHRTaWJsaW5nKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb250aW51ZUN1cnNvciA9IGN1cnNvci5nb3RvRmlyc3RDaGlsZCgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3RyZWVTaXR0ZXJUb2tlbml6ZSh0cmVlU2l0dGVyVHJlZTogVHJlZVNpdHRlclRyZWUsIHRva2VuaXphdGlvbk1vZGVsOiBUcmVlU2l0dGVyVG9rZW5pemF0aW9uSW1wbCwgbGFuZ3VhZ2VJZDogc3RyaW5nKTogUHJvbWlzZTxJVG9rZW5bXT4ge1xuXHRcdGNvbnN0IHRyZWUgPSBhd2FpdCB3YWl0Rm9yU3RhdGUodHJlZVNpdHRlclRyZWUudHJlZSk7XG5cdFx0aWYgKCF0cmVlKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IGN1cnNvciA9IHRyZWUud2FsaygpO1xuXHRcdGN1cnNvci5nb3RvRmlyc3RDaGlsZCgpO1xuXHRcdGxldCBjdXJzb3JSZXN1bHQ6IGJvb2xlYW4gPSB0cnVlO1xuXHRcdGNvbnN0IHRva2VuczogSVRva2VuW10gPSBbXTtcblxuXHRcdGNvbnN0IGN1cnNvcnM6IHsgY3Vyc29yOiBQYXJzZXIuVHJlZUN1cnNvcjsgbGFuZ3VhZ2VJZDogc3RyaW5nOyBzdGFydE9mZnNldDogbnVtYmVyOyBlbmRPZmZzZXQ6IG51bWJlciB9W10gPSBbeyBjdXJzb3IsIGxhbmd1YWdlSWQsIHN0YXJ0T2Zmc2V0OiAwLCBlbmRPZmZzZXQ6IHRyZWVTaXR0ZXJUcmVlLnRleHRNb2RlbC5nZXRWYWx1ZUxlbmd0aCgpIH1dO1xuXHRcdGRvIHtcblx0XHRcdGNvbnN0IGN1cnJlbnQgPSBjdXJzb3JzW2N1cnNvcnMubGVuZ3RoIC0gMV07XG5cdFx0XHRjb25zdCBjdXJyZW50Q3Vyc29yID0gY3VycmVudC5jdXJzb3I7XG5cdFx0XHRjb25zdCBjdXJyZW50TGFuZ3VhZ2VJZCA9IGN1cnJlbnQubGFuZ3VhZ2VJZDtcblx0XHRcdGNvbnN0IGlzT3V0c2lkZVJhbmdlOiBib29sZWFuID0gKGN1cnJlbnRDdXJzb3IuY3VycmVudE5vZGUuZW5kSW5kZXggPiBjdXJyZW50LmVuZE9mZnNldCk7XG5cblx0XHRcdGlmICghaXNPdXRzaWRlUmFuZ2UgJiYgKGN1cnJlbnRDdXJzb3IuY3VycmVudE5vZGUuY2hpbGRDb3VudCA9PT0gMCkpIHtcblx0XHRcdFx0Y29uc3QgcmFuZ2UgPSBuZXcgUmFuZ2UoY3VycmVudEN1cnNvci5jdXJyZW50Tm9kZS5zdGFydFBvc2l0aW9uLnJvdyArIDEsIGN1cnJlbnRDdXJzb3IuY3VycmVudE5vZGUuc3RhcnRQb3NpdGlvbi5jb2x1bW4gKyAxLCBjdXJyZW50Q3Vyc29yLmN1cnJlbnROb2RlLmVuZFBvc2l0aW9uLnJvdyArIDEsIGN1cnJlbnRDdXJzb3IuY3VycmVudE5vZGUuZW5kUG9zaXRpb24uY29sdW1uICsgMSk7XG5cdFx0XHRcdGNvbnN0IGluamVjdGlvbiA9IHRyZWVTaXR0ZXJUcmVlLmdldEluamVjdGlvblRyZWVzKGN1cnJlbnRDdXJzb3IuY3VycmVudE5vZGUuc3RhcnRJbmRleCwgY3VycmVudExhbmd1YWdlSWQpO1xuXHRcdFx0XHRjb25zdCB0cmVlU2l0dGVyUmFuZ2UgPSBpbmplY3Rpb24/LnJhbmdlcyEuZmluZChyID0+IHIuc3RhcnRJbmRleCA8PSBjdXJyZW50Q3Vyc29yLmN1cnJlbnROb2RlLnN0YXJ0SW5kZXggJiYgci5lbmRJbmRleCA+PSBjdXJyZW50Q3Vyc29yLmN1cnJlbnROb2RlLmVuZEluZGV4KTtcblxuXHRcdFx0XHRjb25zdCBpbmplY3Rpb25UcmVlID0gaW5qZWN0aW9uPy50cmVlLmdldCgpO1xuXHRcdFx0XHRjb25zdCBpbmplY3Rpb25MYW5ndWFnZUlkID0gaW5qZWN0aW9uPy5sYW5ndWFnZUlkO1xuXHRcdFx0XHRpZiAoaW5qZWN0aW9uVHJlZSAmJiBpbmplY3Rpb25MYW5ndWFnZUlkICYmIHRyZWVTaXR0ZXJSYW5nZSAmJiAodHJlZVNpdHRlclJhbmdlLnN0YXJ0SW5kZXggPT09IGN1cnJlbnRDdXJzb3IuY3VycmVudE5vZGUuc3RhcnRJbmRleCkpIHtcblx0XHRcdFx0XHRjb25zdCBpbmplY3Rpb25DdXJzb3IgPSBpbmplY3Rpb25UcmVlLndhbGsoKTtcblx0XHRcdFx0XHR0aGlzLl9tb3ZlSW5qZWN0aW9uQ3Vyc29yVG9SYW5nZShpbmplY3Rpb25DdXJzb3IsIHRyZWVTaXR0ZXJSYW5nZSk7XG5cdFx0XHRcdFx0Y3Vyc29ycy5wdXNoKHsgY3Vyc29yOiBpbmplY3Rpb25DdXJzb3IsIGxhbmd1YWdlSWQ6IGluamVjdGlvbkxhbmd1YWdlSWQsIHN0YXJ0T2Zmc2V0OiB0cmVlU2l0dGVyUmFuZ2Uuc3RhcnRJbmRleCwgZW5kT2Zmc2V0OiB0cmVlU2l0dGVyUmFuZ2UuZW5kSW5kZXggfSk7XG5cdFx0XHRcdFx0d2hpbGUgKChjdXJyZW50Q3Vyc29yLmVuZEluZGV4IDw9IHRyZWVTaXR0ZXJSYW5nZS5lbmRJbmRleCkgJiYgKGN1cnJlbnRDdXJzb3IuZ290b05leHRTaWJsaW5nKCkgfHwgY3VycmVudEN1cnNvci5nb3RvUGFyZW50KCkpKSB7IH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBjYXB0dXJlID0gdG9rZW5pemF0aW9uTW9kZWwuY2FwdHVyZUF0UmFuZ2VUcmVlKHJhbmdlKTtcblx0XHRcdFx0XHR0b2tlbnMucHVzaCh7XG5cdFx0XHRcdFx0XHRjOiBjdXJyZW50Q3Vyc29yLmN1cnJlbnROb2RlLnRleHQucmVwbGFjZSgvXFxyL2csICcnKSxcblx0XHRcdFx0XHRcdHQ6IGNhcHR1cmU/Lm1hcChjYXAgPT4gY2FwLm5hbWUpLmpvaW4oJyAnKSA/PyAnJyxcblx0XHRcdFx0XHRcdHI6IHtcblx0XHRcdFx0XHRcdFx0ZGFya19wbHVzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdGxpZ2h0X3BsdXM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0ZGFya192czogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRsaWdodF92czogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRoY19ibGFjazogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHdoaWxlICghKGN1cnNvclJlc3VsdCA9IGN1cnJlbnRDdXJzb3IuZ290b05leHRTaWJsaW5nKCkpKSB7XG5cdFx0XHRcdFx0XHRpZiAoIShjdXJzb3JSZXN1bHQgPSBjdXJyZW50Q3Vyc29yLmdvdG9QYXJlbnQoKSkpIHtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGN1cnNvclJlc3VsdCA9IGN1cnJlbnRDdXJzb3IuZ290b0ZpcnN0Q2hpbGQoKTtcblx0XHRcdH1cblx0XHRcdGlmIChjdXJzb3JzLmxlbmd0aCA+IDEgJiYgKCghY3Vyc29yUmVzdWx0ICYmIGN1cnJlbnRDdXJzb3IgPT09IGN1cnNvcnNbY3Vyc29ycy5sZW5ndGggLSAxXS5jdXJzb3IpIHx8IGlzT3V0c2lkZVJhbmdlKSkge1xuXHRcdFx0XHRjdXJyZW50LmN1cnNvci5kZWxldGUoKTtcblx0XHRcdFx0Y3Vyc29ycy5wb3AoKTtcblx0XHRcdFx0Y3Vyc29yUmVzdWx0ID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9IHdoaWxlIChjdXJzb3JSZXN1bHQpO1xuXHRcdGN1cnNvci5kZWxldGUoKTtcblx0XHRyZXR1cm4gdG9rZW5zO1xuXHR9XG5cblx0cHVibGljIGNhcHR1cmVTeW50YXhUb2tlbnMoZmlsZU5hbWU6IHN0cmluZywgY29udGVudDogc3RyaW5nKTogUHJvbWlzZTxJVG9rZW5bXT4ge1xuXHRcdGNvbnN0IGxhbmd1YWdlSWQgPSB0aGlzLmxhbmd1YWdlU2VydmljZS5ndWVzc0xhbmd1YWdlSWRCeUZpbGVwYXRoT3JGaXJzdExpbmUoVVJJLmZpbGUoZmlsZU5hbWUpKTtcblx0XHRyZXR1cm4gdGhpcy50ZXh0TWF0ZVNlcnZpY2UuY3JlYXRlVG9rZW5pemVyKGxhbmd1YWdlSWQhKS50aGVuKChncmFtbWFyKSA9PiB7XG5cdFx0XHRpZiAoIWdyYW1tYXIpIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbGluZXMgPSBzcGxpdExpbmVzKGNvbnRlbnQpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSB0aGlzLl90b2tlbml6ZShncmFtbWFyLCBsaW5lcyk7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZ2V0VGhlbWVzUmVzdWx0KGdyYW1tYXIsIGxpbmVzKS50aGVuKCh0aGVtZXNSZXN1bHQpID0+IHtcblx0XHRcdFx0dGhpcy5fZW5yaWNoUmVzdWx0KHJlc3VsdCwgdGhlbWVzUmVzdWx0KTtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdC5maWx0ZXIodCA9PiB0LmMubGVuZ3RoID4gMCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBjYXB0dXJlVHJlZVNpdHRlclN5bnRheFRva2VucyhyZXNvdXJjZTogVVJJLCBjb250ZW50OiBzdHJpbmcpOiBQcm9taXNlPElUb2tlbltdPiB7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLmd1ZXNzTGFuZ3VhZ2VJZEJ5RmlsZXBhdGhPckZpcnN0TGluZShyZXNvdXJjZSk7XG5cdFx0aWYgKCFsYW5ndWFnZUlkKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLm1vZGVsU2VydmljZS5nZXRNb2RlbChyZXNvdXJjZSkgPz8gdGhpcy5tb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWwoY29udGVudCwgeyBsYW5ndWFnZUlkLCBvbkRpZENoYW5nZTogRXZlbnQuTm9uZSB9LCByZXNvdXJjZSk7XG5cdFx0Y29uc3QgdG9rZW5pemF0aW9uUGFydCA9IChtb2RlbC50b2tlbml6YXRpb24gYXMgVG9rZW5pemF0aW9uVGV4dE1vZGVsUGFydCkudG9rZW5zLmdldCgpO1xuXHRcdGlmICghKHRva2VuaXphdGlvblBhcnQgaW5zdGFuY2VvZiBUcmVlU2l0dGVyU3ludGF4VG9rZW5CYWNrZW5kKSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRyZWVPYnMgPSB0b2tlbml6YXRpb25QYXJ0LnRyZWU7XG5cdFx0Y29uc3QgdG9rZW5pemF0aW9uSW1wbE9icyA9IHRva2VuaXphdGlvblBhcnQudG9rZW5pemF0aW9uSW1wbDtcblx0XHRjb25zdCB0cmVlU2l0dGVyVHJlZSA9IHRyZWVPYnMuZ2V0KCkgPz8gYXdhaXQgd2FpdEZvclN0YXRlKHRyZWVPYnMpO1xuXHRcdGNvbnN0IHRva2VuaXphdGlvbkltcGwgPSB0b2tlbml6YXRpb25JbXBsT2JzLmdldCgpID8/IGF3YWl0IHdhaXRGb3JTdGF0ZSh0b2tlbml6YXRpb25JbXBsT2JzKTtcblx0XHQvLyBUT0RPOiBpbmplY3Rpb25zXG5cdFx0aWYgKCF0cmVlU2l0dGVyVHJlZSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQgPSAoYXdhaXQgdGhpcy5fdHJlZVNpdHRlclRva2VuaXplKHRyZWVTaXR0ZXJUcmVlLCB0b2tlbml6YXRpb25JbXBsLCBsYW5ndWFnZUlkKSkuZmlsdGVyKHQgPT4gdC5jLmxlbmd0aCA+IDApO1xuXHRcdGNvbnN0IHRoZW1lVG9rZW5zID0gYXdhaXQgdGhpcy5fZ2V0VHJlZVNpdHRlclRoZW1lc1Jlc3VsdChyZXN1bHQsIGxhbmd1YWdlSWQpO1xuXHRcdHRoaXMuX2VucmljaFJlc3VsdChyZXN1bHQsIHRoZW1lVG9rZW5zKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXG5cdH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gY2FwdHVyZVRva2VucyhhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgcmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCwgdHJlZVNpdHRlcjogYm9vbGVhbiA9IGZhbHNlKSB7XG5cdGNvbnN0IHByb2Nlc3MgPSAocmVzb3VyY2U6IFVSSSkgPT4ge1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0Y29uc3QgZmlsZU5hbWUgPSBiYXNlbmFtZShyZXNvdXJjZSk7XG5cdFx0Y29uc3Qgc25hcHBlciA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpLmNyZWF0ZUluc3RhbmNlKFNuYXBwZXIpO1xuXG5cdFx0cmV0dXJuIGZpbGVTZXJ2aWNlLnJlYWRGaWxlKHJlc291cmNlKS50aGVuKGNvbnRlbnQgPT4ge1xuXHRcdFx0aWYgKHRyZWVTaXR0ZXIpIHtcblx0XHRcdFx0cmV0dXJuIHNuYXBwZXIuY2FwdHVyZVRyZWVTaXR0ZXJTeW50YXhUb2tlbnMocmVzb3VyY2UsIGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gc25hcHBlci5jYXB0dXJlU3ludGF4VG9rZW5zKGZpbGVOYW1lLCBjb250ZW50LnZhbHVlLnRvU3RyaW5nKCkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9O1xuXG5cdGlmICghcmVzb3VyY2UpIHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBmaWxlID0gZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3IgPyBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLmdldENhbm9uaWNhbFVyaShlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvciwgeyBmaWx0ZXJCeVNjaGVtZTogU2NoZW1hcy5maWxlIH0pIDogbnVsbDtcblx0XHRpZiAoZmlsZSkge1xuXHRcdFx0cHJvY2VzcyhmaWxlKS50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHRcdGNvbnNvbGUubG9nKHJlc3VsdCk7XG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc29sZS5sb2coJ05vIGZpbGUgZWRpdG9yIGFjdGl2ZScpO1xuXHRcdH1cblx0fSBlbHNlIHtcblx0XHRjb25zdCBwcm9jZXNzUmVzdWx0ID0gYXdhaXQgcHJvY2VzcyhyZXNvdXJjZSk7XG5cdFx0cmV0dXJuIHByb2Nlc3NSZXN1bHQ7XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcblxufVxuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCgnX3dvcmtiZW5jaC5jYXB0dXJlU3ludGF4VG9rZW5zJywgZnVuY3Rpb24gKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCByZXNvdXJjZTogVVJJKSB7XG5cdHJldHVybiBjYXB0dXJlVG9rZW5zKGFjY2Vzc29yLCByZXNvdXJjZSk7XG59KTtcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoJ193b3JrYmVuY2guY2FwdHVyZVRyZWVTaXR0ZXJTeW50YXhUb2tlbnMnLCBmdW5jdGlvbiAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHJlc291cmNlPzogVVJJKSB7XG5cdC8vIElmIG5vIHJlc291cmNlIGlzIHByb3ZpZGVkLCB1c2UgdGhlIGFjdGl2ZSBlZGl0b3IncyByZXNvdXJjZVxuXHQvLyBUaGlzIGlzIHVzZWZ1bCBmb3IgdGVzdGluZyB0aGUgY29tbWFuZFxuXHRpZiAoIXJlc291cmNlKSB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0cmVzb3VyY2UgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvcj8ucmVzb3VyY2U7XG5cdH1cblx0cmV0dXJuIGNhcHR1cmVUb2tlbnMoYWNjZXNzb3IsIHJlc291cmNlLCB0cnVlKTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFdBQVc7QUFFcEIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyw2QkFBK0M7QUFDeEQsU0FBUyw4QkFBb0Q7QUFDN0QsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxvQ0FBb0M7QUFFN0MsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBb0IsNkJBQTZCO0FBQ2pELFNBQVMsYUFBYTtBQUN0QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBeUIsb0JBQW9CO0FBQzdDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsYUFBYTtBQUN0QixTQUFTLGFBQWE7QUFHdEIsU0FBUyxvQ0FBb0M7QUFFN0MsU0FBUyxvQkFBb0I7QUFvQjdCLE1BQU0sY0FBYztBQUFBLEVBS25CLFlBQVksT0FBNkI7QUFDeEMsU0FBSyxTQUFTO0FBQ2QsU0FBSyxTQUFTLHVCQUFPLE9BQU8sSUFBSTtBQUNoQyxTQUFLLGdCQUFnQjtBQUNyQixhQUFTLElBQUksR0FBRyxNQUFNLEtBQUssT0FBTyxZQUFZLFFBQVEsSUFBSSxLQUFLLEtBQUs7QUFDbkUsWUFBTSxPQUFP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
