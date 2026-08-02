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
import "./inspectTokens.css";
import { $, append, reset } from "../../../../base/browser/dom.js";
import { CharCode } from "../../../../base/common/charCode.js";
import { Color } from "../../../../base/common/color.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { ContentWidgetPositionPreference } from "../../../browser/editorBrowser.js";
import { EditorAction, registerEditorAction, registerEditorContribution, EditorContributionInstantiation } from "../../../browser/editorExtensions.js";
import { TokenizationRegistry } from "../../../common/languages.js";
import { FontStyle, StandardTokenType, TokenMetadata } from "../../../common/encodedTokenAttributes.js";
import { NullState, nullTokenize, nullTokenizeEncoded } from "../../../common/languages/nullTokenize.js";
import { ILanguageService } from "../../../common/languages/language.js";
import { IStandaloneThemeService } from "../../common/standaloneTheme.js";
import { InspectTokensNLS } from "../../../common/standaloneStrings.js";
let InspectTokensController = class extends Disposable {
  static get(editor) {
    return editor.getContribution(InspectTokensController.ID);
  }
  constructor(editor, standaloneColorService, languageService) {
    super();
    this._editor = editor;
    this._languageService = languageService;
    this._widget = null;
    this._register(this._editor.onDidChangeModel((e) => this.stop()));
    this._register(this._editor.onDidChangeModelLanguage((e) => this.stop()));
    this._register(TokenizationRegistry.onDidChange((e) => this.stop()));
    this._register(this._editor.onKeyUp((e) => e.keyCode === KeyCode.Escape && this.stop()));
  }
  dispose() {
    this.stop();
    super.dispose();
  }
  launch() {
    if (this._widget) {
      return;
    }
    if (!this._editor.hasModel()) {
      return;
    }
    this._widget = new InspectTokensWidget(this._editor, this._languageService);
  }
  stop() {
    if (this._widget) {
      this._widget.dispose();
      this._widget = null;
    }
  }
};
InspectTokensController.ID = "editor.contrib.inspectTokens";
InspectTokensController = __decorateClass([
  __decorateParam(1, IStandaloneThemeService),
  __decorateParam(2, ILanguageService)
], InspectTokensController);
class InspectTokens extends EditorAction {
  constructor() {
    super({
      id: "editor.action.inspectTokens",
      label: InspectTokensNLS.inspectTokensAction,
      alias: "Developer: Inspect Tokens",
      precondition: void 0
    });
  }
  run(accessor, editor) {
    const controller = InspectTokensController.get(editor);
    controller?.launch();
  }
}
function renderTokenText(tokenText) {
  let result = "";
  for (let charIndex = 0, len = tokenText.length; charIndex < len; charIndex++) {
    const charCode = tokenText.charCodeAt(charIndex);
    switch (charCode) {
      case CharCode.Tab:
        result += "\u2192";
        break;
      case CharCode.Space:
        result += "\xB7";
        break;
      default:
        result += String.fromCharCode(charCode);
    }
  }
  return result;
}
function getSafeTokenizationSupport(languageIdCodec, languageId) {
  const tokenizationSupport = TokenizationRegistry.get(languageId);
  if (tokenizationSupport) {
    return tokenizationSupport;
  }
  const encodedLanguageId = languageIdCodec.encodeLanguageId(languageId);
  return {
    getInitialState: () => NullState,
    tokenize: (line, hasEOL, state) => nullTokenize(languageId, state),
    tokenizeEncoded: (line, hasEOL, state) => nullTokenizeEncoded(encodedLanguageId, state)
  };
}
const _InspectTokensWidget = class _InspectTokensWidget extends Disposable {
  constructor(editor, languageService) {
    super();
    // Editor.IContentWidget.allowEditorOverflow
    this.allowEditorOverflow = true;
    this._editor = editor;
    this._languageService = languageService;
    this._model = this._editor.getModel();
    this._domNode = document.createElement("div");
    this._domNode.className = "tokens-inspect-widget";
    this._tokenizationSupport = getSafeTokenizationSupport(this._languageService.languageIdCodec, this._model.getLanguageId());
    this._compute(this._editor.getPosition());
    this._register(this._editor.onDidChangeCursorPosition((e) => this._compute(this._editor.getPosition())));
    this._editor.addContentWidget(this);
  }
  dispose() {
    this._editor.removeContentWidget(this);
    super.dispose();
  }
  getId() {
    return _InspectTokensWidget._ID;
  }
  _compute(position) {
    const data = this._getTokensAtLine(position.lineNumber);
    let token1Index = 0;
    for (let i = data.tokens1.length - 1; i >= 0; i--) {
      const t = data.tokens1[i];
      if (position.column - 1 >= t.offset) {
        token1Index = i;
        break;
      }
    }
    let token2Index = 0;
    for (let i = data.tokens2.length >>> 1; i >= 0; i--) {
      if (position.column - 1 >= data.tokens2[i << 1]) {
        token2Index = i;
        break;
      }
    }
    const lineContent = this._model.getLineContent(position.lineNumber);
    let tokenText = "";
    if (token1Index < data.tokens1.length) {
      const tokenStartIndex = data.tokens1[token1Index].offset;
      const tokenEndIndex = token1Index + 1 < data.tokens1.length ? data.tokens1[token1Index + 1].offset : lineContent.length;
      tokenText = lineContent.substring(tokenStartIndex, tokenEndIndex);
    }
    reset(
      this._domNode,
      $(
        "h2.tm-token",
        void 0,
        renderTokenText(tokenText),
        $("span.tm-token-length", void 0, `${tokenText.length} ${tokenText.length === 1 ? "char" : "chars"}`)
      )
    );
    append(this._domNode, $("hr.tokens-inspect-separator", { "style": "clear:both" }));
    const metadata = (token2Index << 1) + 1 < data.tokens2.length ? this._decodeMetadata(data.tokens2[(token2Index << 1) + 1]) : null;
    append(this._domNode, $(
      "table.tm-metadata-table",
      void 0,
      $(
        "tbody",
        void 0,
        $(
          "tr",
          void 0,
          $("td.tm-metadata-key", void 0, "language"),
          $("td.tm-metadata-value", void 0, `${metadata ? metadata.languageId : "-?-"}`)
        ),
        $(
          "tr",
          void 0,
          $("td.tm-metadata-key", void 0, "token type"),
          $("td.tm-metadata-value", void 0, `${metadata ? this._tokenTypeToString(metadata.tokenType) : "-?-"}`)
        ),
        $(
          "tr",
          void 0,
          $("td.tm-metadata-key", void 0, "font style"),
          $("td.tm-metadata-value", void 0, `${metadata ? this._fontStyleToString(metadata.fontStyle) : "-?-"}`)
        ),
        $(
          "tr",
          void 0,
          $("td.tm-metadata-key", void 0, "foreground"),
          $("td.tm-metadata-value", void 0, `${metadata ? Color.Format.CSS.formatHex(metadata.foreground) : "-?-"}`)
        ),
        $(
          "tr",
          void 0,
          $("td.tm-metadata-key", void 0, "background"),
          $("td.tm-metadata-value", void 0, `${metadata ? Color.Format.CSS.formatHex(metadata.background) : "-?-"}`)
        )
      )
    ));
    append(this._domNode, $("hr.tokens-inspect-separator"));
    if (token1Index < data.tokens1.length) {
      append(this._domNode, $("span.tm-token-type", void 0, data.tokens1[token1Index].type));
    }
    this._editor.layoutContentWidget(this);
  }
  _decodeMetadata(metadata) {
    const colorMap = TokenizationRegistry.getColorMap();
    const languageId = TokenMetadata.getLanguageId(metadata);
    const tokenType = TokenMetadata.getTokenType(metadata);
    const fontStyle = TokenMetadata.getFontStyle(metadata);
    const foreground = TokenMetadata.getForeground(metadata);
    const background = TokenMetadata.getBackground(metadata);
    return {
      languageId: this._languageService.languageIdCodec.decodeLanguageId(languageId),
      tokenType,
      fontStyle,
      foreground: colorMap[foreground],
      background: colorMap[background]
    };
  }
  _tokenTypeToString(tokenType) {
    switch (tokenType) {
      case StandardTokenType.Other:
        return "Other";
      case StandardTokenType.Comment:
        return "Comment";
      case StandardTokenType.String:
        return "String";
      case StandardTokenType.RegEx:
        return "RegEx";
      default:
        return "??";
    }
  }
  _fontStyleToString(fontStyle) {
    let r = "";
    if (fontStyle & FontStyle.Italic) {
      r += "italic ";
    }
    if (fontStyle & FontStyle.Bold) {
      r += "bold ";
    }
    if (fontStyle & FontStyle.Underline) {
      r += "underline ";
    }
    if (fontStyle & FontStyle.Strikethrough) {
      r += "strikethrough ";
    }
    if (r.length === 0) {
      r = "---";
    }
    return r;
  }
  _getTokensAtLine(lineNumber) {
    const stateBeforeLine = this._getStateBeforeLine(lineNumber);
    const tokenizationResult1 = this._tokenizationSupport.tokenize(this._model.getLineContent(lineNumber), true, stateBeforeLine);
    const tokenizationResult2 = this._tokenizationSupport.tokenizeEncoded(this._model.getLineContent(lineNumber), true, stateBeforeLine);
    return {
      startState: stateBeforeLine,
      tokens1: tokenizationResult1.tokens,
      tokens2: tokenizationResult2.tokens,
      endState: tokenizationResult1.endState
    };
  }
  _getStateBeforeLine(lineNumber) {
    let state = this._tokenizationSupport.getInitialState();
    for (let i = 1; i < lineNumber; i++) {
      const tokenizationResult = this._tokenizationSupport.tokenize(this._model.getLineContent(i), true, state);
      state = tokenizationResult.endState;
    }
    return state;
  }
  getDomNode() {
    return this._domNode;
  }
  getPosition() {
    return {
      position: this._editor.getPosition(),
      preference: [ContentWidgetPositionPreference.BELOW, ContentWidgetPositionPreference.ABOVE]
    };
  }
};
_InspectTokensWidget._ID = "editor.contrib.inspectTokensWidget";
let InspectTokensWidget = _InspectTokensWidget;
registerEditorContribution(InspectTokensController.ID, InspectTokensController, EditorContributionInstantiation.Lazy);
registerEditorAction(InspectTokens);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9zdGFuZGFsb25lL2Jyb3dzZXIvaW5zcGVjdFRva2Vucy9pbnNwZWN0VG9rZW5zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL2luc3BlY3RUb2tlbnMuY3NzJztcbmltcG9ydCB7ICQsIGFwcGVuZCwgcmVzZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IENoYXJDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2hhckNvZGUuanMnO1xuaW1wb3J0IHsgQ29sb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xvci5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLCBJQWN0aXZlQ29kZUVkaXRvciwgSUNvZGVFZGl0b3IsIElDb250ZW50V2lkZ2V0LCBJQ29udGVudFdpZGdldFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IEVkaXRvckFjdGlvbiwgU2VydmljZXNBY2Nlc3NvciwgcmVnaXN0ZXJFZGl0b3JBY3Rpb24sIHJlZ2lzdGVyRWRpdG9yQ29udHJpYnV0aW9uLCBFZGl0b3JDb250cmlidXRpb25JbnN0YW50aWF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgSUVkaXRvckNvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJU3RhdGUsIElUb2tlbml6YXRpb25TdXBwb3J0LCBUb2tlbml6YXRpb25SZWdpc3RyeSwgSUxhbmd1YWdlSWRDb2RlYywgVG9rZW4gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IEZvbnRTdHlsZSwgU3RhbmRhcmRUb2tlblR5cGUsIFRva2VuTWV0YWRhdGEgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZW5jb2RlZFRva2VuQXR0cmlidXRlcy5qcyc7XG5pbXBvcnQgeyBOdWxsU3RhdGUsIG51bGxUb2tlbml6ZSwgbnVsbFRva2VuaXplRW5jb2RlZCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbnVsbFRva2VuaXplLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IElTdGFuZGFsb25lVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YW5kYWxvbmVUaGVtZS5qcyc7XG5pbXBvcnQgeyBJbnNwZWN0VG9rZW5zTkxTIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3N0YW5kYWxvbmVTdHJpbmdzLmpzJztcblxuXG5jbGFzcyBJbnNwZWN0VG9rZW5zQ29udHJvbGxlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRWRpdG9yQ29udHJpYnV0aW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ2VkaXRvci5jb250cmliLmluc3BlY3RUb2tlbnMnO1xuXG5cdHB1YmxpYyBzdGF0aWMgZ2V0KGVkaXRvcjogSUNvZGVFZGl0b3IpOiBJbnNwZWN0VG9rZW5zQ29udHJvbGxlciB8IG51bGwge1xuXHRcdHJldHVybiBlZGl0b3IuZ2V0Q29udHJpYnV0aW9uPEluc3BlY3RUb2tlbnNDb250cm9sbGVyPihJbnNwZWN0VG9rZW5zQ29udHJvbGxlci5JRCk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IElDb2RlRWRpdG9yO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2U7XG5cdHByaXZhdGUgX3dpZGdldDogSW5zcGVjdFRva2Vuc1dpZGdldCB8IG51bGw7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRASVN0YW5kYWxvbmVUaGVtZVNlcnZpY2Ugc3RhbmRhbG9uZUNvbG9yU2VydmljZTogSVN0YW5kYWxvbmVUaGVtZVNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fZWRpdG9yID0gZWRpdG9yO1xuXHRcdHRoaXMuX2xhbmd1YWdlU2VydmljZSA9IGxhbmd1YWdlU2VydmljZTtcblx0XHR0aGlzLl93aWRnZXQgPSBudWxsO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWwoKGUpID0+IHRoaXMuc3RvcCgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxMYW5ndWFnZSgoZSkgPT4gdGhpcy5zdG9wKCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihUb2tlbml6YXRpb25SZWdpc3RyeS5vbkRpZENoYW5nZSgoZSkgPT4gdGhpcy5zdG9wKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3Iub25LZXlVcCgoZSkgPT4gZS5rZXlDb2RlID09PSBLZXlDb2RlLkVzY2FwZSAmJiB0aGlzLnN0b3AoKSkpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5zdG9wKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHVibGljIGxhdW5jaCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fd2lkZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fd2lkZ2V0ID0gbmV3IEluc3BlY3RUb2tlbnNXaWRnZXQodGhpcy5fZWRpdG9yLCB0aGlzLl9sYW5ndWFnZVNlcnZpY2UpO1xuXHR9XG5cblx0cHVibGljIHN0b3AoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3dpZGdldCkge1xuXHRcdFx0dGhpcy5fd2lkZ2V0LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX3dpZGdldCA9IG51bGw7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIEluc3BlY3RUb2tlbnMgZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLmFjdGlvbi5pbnNwZWN0VG9rZW5zJyxcblx0XHRcdGxhYmVsOiBJbnNwZWN0VG9rZW5zTkxTLmluc3BlY3RUb2tlbnNBY3Rpb24sXG5cdFx0XHRhbGlhczogJ0RldmVsb3BlcjogSW5zcGVjdCBUb2tlbnMnLFxuXHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWRcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gSW5zcGVjdFRva2Vuc0NvbnRyb2xsZXIuZ2V0KGVkaXRvcik7XG5cdFx0Y29udHJvbGxlcj8ubGF1bmNoKCk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElDb21wbGV0ZUxpbmVUb2tlbml6YXRpb24ge1xuXHRzdGFydFN0YXRlOiBJU3RhdGU7XG5cdHRva2VuczE6IFRva2VuW107XG5cdHRva2VuczI6IFVpbnQzMkFycmF5O1xuXHRlbmRTdGF0ZTogSVN0YXRlO1xufVxuXG5pbnRlcmZhY2UgSURlY29kZWRNZXRhZGF0YSB7XG5cdGxhbmd1YWdlSWQ6IHN0cmluZztcblx0dG9rZW5UeXBlOiBTdGFuZGFyZFRva2VuVHlwZTtcblx0Zm9udFN0eWxlOiBGb250U3R5bGU7XG5cdGZvcmVncm91bmQ6IENvbG9yO1xuXHRiYWNrZ3JvdW5kOiBDb2xvcjtcbn1cblxuZnVuY3Rpb24gcmVuZGVyVG9rZW5UZXh0KHRva2VuVGV4dDogc3RyaW5nKTogc3RyaW5nIHtcblx0bGV0IHJlc3VsdDogc3RyaW5nID0gJyc7XG5cdGZvciAobGV0IGNoYXJJbmRleCA9IDAsIGxlbiA9IHRva2VuVGV4dC5sZW5ndGg7IGNoYXJJbmRleCA8IGxlbjsgY2hhckluZGV4KyspIHtcblx0XHRjb25zdCBjaGFyQ29kZSA9IHRva2VuVGV4dC5jaGFyQ29kZUF0KGNoYXJJbmRleCk7XG5cdFx0c3dpdGNoIChjaGFyQ29kZSkge1xuXHRcdFx0Y2FzZSBDaGFyQ29kZS5UYWI6XG5cdFx0XHRcdHJlc3VsdCArPSAnXFx1MjE5Mic7IC8vICZyYXJyO1xuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0Y2FzZSBDaGFyQ29kZS5TcGFjZTpcblx0XHRcdFx0cmVzdWx0ICs9ICdcXHUwMEI3JzsgLy8gJm1pZGRvdDtcblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJlc3VsdCArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGNoYXJDb2RlKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gZ2V0U2FmZVRva2VuaXphdGlvblN1cHBvcnQobGFuZ3VhZ2VJZENvZGVjOiBJTGFuZ3VhZ2VJZENvZGVjLCBsYW5ndWFnZUlkOiBzdHJpbmcpOiBJVG9rZW5pemF0aW9uU3VwcG9ydCB7XG5cdGNvbnN0IHRva2VuaXphdGlvblN1cHBvcnQgPSBUb2tlbml6YXRpb25SZWdpc3RyeS5nZXQobGFuZ3VhZ2VJZCk7XG5cdGlmICh0b2tlbml6YXRpb25TdXBwb3J0KSB7XG5cdFx0cmV0dXJuIHRva2VuaXphdGlvblN1cHBvcnQ7XG5cdH1cblx0Y29uc3QgZW5jb2RlZExhbmd1YWdlSWQgPSBsYW5ndWFnZUlkQ29kZWMuZW5jb2RlTGFuZ3VhZ2VJZChsYW5ndWFnZUlkKTtcblx0cmV0dXJuIHtcblx0XHRnZXRJbml0aWFsU3RhdGU6ICgpID0+IE51bGxTdGF0ZSxcblx0XHR0b2tlbml6ZTogKGxpbmU6IHN0cmluZywgaGFzRU9MOiBib29sZWFuLCBzdGF0ZTogSVN0YXRlKSA9PiBudWxsVG9rZW5pemUobGFuZ3VhZ2VJZCwgc3RhdGUpLFxuXHRcdHRva2VuaXplRW5jb2RlZDogKGxpbmU6IHN0cmluZywgaGFzRU9MOiBib29sZWFuLCBzdGF0ZTogSVN0YXRlKSA9PiBudWxsVG9rZW5pemVFbmNvZGVkKGVuY29kZWRMYW5ndWFnZUlkLCBzdGF0ZSlcblx0fTtcbn1cblxuY2xhc3MgSW5zcGVjdFRva2Vuc1dpZGdldCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ29udGVudFdpZGdldCB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX0lEID0gJ2VkaXRvci5jb250cmliLmluc3BlY3RUb2tlbnNXaWRnZXQnO1xuXG5cdC8vIEVkaXRvci5JQ29udGVudFdpZGdldC5hbGxvd0VkaXRvck92ZXJmbG93XG5cdHB1YmxpYyBhbGxvd0VkaXRvck92ZXJmbG93ID0gdHJ1ZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IElBY3RpdmVDb2RlRWRpdG9yO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rva2VuaXphdGlvblN1cHBvcnQ6IElUb2tlbml6YXRpb25TdXBwb3J0O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbDogSVRleHRNb2RlbDtcblx0cHJpdmF0ZSByZWFkb25seSBfZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZWRpdG9yOiBJQWN0aXZlQ29kZUVkaXRvcixcblx0XHRsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9lZGl0b3IgPSBlZGl0b3I7XG5cdFx0dGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlID0gbGFuZ3VhZ2VTZXJ2aWNlO1xuXHRcdHRoaXMuX21vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0dGhpcy5fZG9tTm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuX2RvbU5vZGUuY2xhc3NOYW1lID0gJ3Rva2Vucy1pbnNwZWN0LXdpZGdldCc7XG5cdFx0dGhpcy5fdG9rZW5pemF0aW9uU3VwcG9ydCA9IGdldFNhZmVUb2tlbml6YXRpb25TdXBwb3J0KHRoaXMuX2xhbmd1YWdlU2VydmljZS5sYW5ndWFnZUlkQ29kZWMsIHRoaXMuX21vZGVsLmdldExhbmd1YWdlSWQoKSk7XG5cdFx0dGhpcy5fY29tcHV0ZSh0aGlzLl9lZGl0b3IuZ2V0UG9zaXRpb24oKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlQ3Vyc29yUG9zaXRpb24oKGUpID0+IHRoaXMuX2NvbXB1dGUodGhpcy5fZWRpdG9yLmdldFBvc2l0aW9uKCkpKSk7XG5cdFx0dGhpcy5fZWRpdG9yLmFkZENvbnRlbnRXaWRnZXQodGhpcyk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9lZGl0b3IucmVtb3ZlQ29udGVudFdpZGdldCh0aGlzKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0SWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gSW5zcGVjdFRva2Vuc1dpZGdldC5fSUQ7XG5cdH1cblxuXHRwcml2YXRlIF9jb21wdXRlKHBvc2l0aW9uOiBQb3NpdGlvbik6IHZvaWQge1xuXHRcdGNvbnN0IGRhdGEgPSB0aGlzLl9nZXRUb2tlbnNBdExpbmUocG9zaXRpb24ubGluZU51bWJlcik7XG5cblx0XHRsZXQgdG9rZW4xSW5kZXggPSAwO1xuXHRcdGZvciAobGV0IGkgPSBkYXRhLnRva2VuczEubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGNvbnN0IHQgPSBkYXRhLnRva2VuczFbaV07XG5cdFx0XHRpZiAocG9zaXRpb24uY29sdW1uIC0gMSA+PSB0Lm9mZnNldCkge1xuXHRcdFx0XHR0b2tlbjFJbmRleCA9IGk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCB0b2tlbjJJbmRleCA9IDA7XG5cdFx0Zm9yIChsZXQgaSA9IChkYXRhLnRva2VuczIubGVuZ3RoID4+PiAxKTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGlmIChwb3NpdGlvbi5jb2x1bW4gLSAxID49IGRhdGEudG9rZW5zMlsoaSA8PCAxKV0pIHtcblx0XHRcdFx0dG9rZW4ySW5kZXggPSBpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBsaW5lQ29udGVudCA9IHRoaXMuX21vZGVsLmdldExpbmVDb250ZW50KHBvc2l0aW9uLmxpbmVOdW1iZXIpO1xuXHRcdGxldCB0b2tlblRleHQgPSAnJztcblx0XHRpZiAodG9rZW4xSW5kZXggPCBkYXRhLnRva2VuczEubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCB0b2tlblN0YXJ0SW5kZXggPSBkYXRhLnRva2VuczFbdG9rZW4xSW5kZXhdLm9mZnNldDtcblx0XHRcdGNvbnN0IHRva2VuRW5kSW5kZXggPSB0b2tlbjFJbmRleCArIDEgPCBkYXRhLnRva2VuczEubGVuZ3RoID8gZGF0YS50b2tlbnMxW3Rva2VuMUluZGV4ICsgMV0ub2Zmc2V0IDogbGluZUNvbnRlbnQubGVuZ3RoO1xuXHRcdFx0dG9rZW5UZXh0ID0gbGluZUNvbnRlbnQuc3Vic3RyaW5nKHRva2VuU3RhcnRJbmRleCwgdG9rZW5FbmRJbmRleCk7XG5cdFx0fVxuXHRcdHJlc2V0KHRoaXMuX2RvbU5vZGUsXG5cdFx0XHQkKCdoMi50bS10b2tlbicsIHVuZGVmaW5lZCwgcmVuZGVyVG9rZW5UZXh0KHRva2VuVGV4dCksXG5cdFx0XHRcdCQoJ3NwYW4udG0tdG9rZW4tbGVuZ3RoJywgdW5kZWZpbmVkLCBgJHt0b2tlblRleHQubGVuZ3RofSAke3Rva2VuVGV4dC5sZW5ndGggPT09IDEgPyAnY2hhcicgOiAnY2hhcnMnfWApKSk7XG5cblx0XHRhcHBlbmQodGhpcy5fZG9tTm9kZSwgJCgnaHIudG9rZW5zLWluc3BlY3Qtc2VwYXJhdG9yJywgeyAnc3R5bGUnOiAnY2xlYXI6Ym90aCcgfSkpO1xuXG5cdFx0Y29uc3QgbWV0YWRhdGEgPSAodG9rZW4ySW5kZXggPDwgMSkgKyAxIDwgZGF0YS50b2tlbnMyLmxlbmd0aCA/IHRoaXMuX2RlY29kZU1ldGFkYXRhKGRhdGEudG9rZW5zMlsodG9rZW4ySW5kZXggPDwgMSkgKyAxXSkgOiBudWxsO1xuXHRcdGFwcGVuZCh0aGlzLl9kb21Ob2RlLCAkKCd0YWJsZS50bS1tZXRhZGF0YS10YWJsZScsIHVuZGVmaW5lZCxcblx0XHRcdCQoJ3Rib2R5JywgdW5kZWZpbmVkLFxuXHRcdFx0XHQkKCd0cicsIHVuZGVmaW5lZCxcblx0XHRcdFx0XHQkKCd0ZC50bS1tZXRhZGF0YS1rZXknLCB1bmRlZmluZWQsICdsYW5ndWFnZScpLFxuXHRcdFx0XHRcdCQoJ3RkLnRtLW1ldGFkYXRhLXZhbHVlJywgdW5kZWZpbmVkLCBgJHttZXRhZGF0YSA/IG1ldGFkYXRhLmxhbmd1YWdlSWQgOiAnLT8tJ31gKVxuXHRcdFx0XHQpLFxuXHRcdFx0XHQkKCd0cicsIHVuZGVmaW5lZCxcblx0XHRcdFx0XHQkKCd0ZC50bS1tZXRhZGF0YS1rZXknLCB1bmRlZmluZWQsICd0b2tlbiB0eXBlJyBhcyBzdHJpbmcpLFxuXHRcdFx0XHRcdCQoJ3RkLnRtLW1ldGFkYXRhLXZhbHVlJywgdW5kZWZpbmVkLCBgJHttZXRhZGF0YSA/IHRoaXMuX3Rva2VuVHlwZVRvU3RyaW5nKG1ldGFkYXRhLnRva2VuVHlwZSkgOiAnLT8tJ31gKVxuXHRcdFx0XHQpLFxuXHRcdFx0XHQkKCd0cicsIHVuZGVmaW5lZCxcblx0XHRcdFx0XHQkKCd0ZC50bS1tZXRhZGF0YS1rZXknLCB1bmRlZmluZWQsICdmb250IHN0eWxlJyBhcyBzdHJpbmcpLFxuXHRcdFx0XHRcdCQoJ3RkLnRtLW1ldGFkYXRhLXZhbHVlJywgdW5kZWZpbmVkLCBgJHttZXRhZGF0YSA/IHRoaXMuX2ZvbnRTdHlsZVRvU3RyaW5nKG1ldGFkYXRhLmZvbnRTdHlsZSkgOiAnLT8tJ31gKVxuXHRcdFx0XHQpLFxuXHRcdFx0XHQkKCd0cicsIHVuZGVmaW5lZCxcblx0XHRcdFx0XHQkKCd0ZC50bS1tZXRhZGF0YS1rZXknLCB1bmRlZmluZWQsICdmb3JlZ3JvdW5kJyksXG5cdFx0XHRcdFx0JCgndGQudG0tbWV0YWRhdGEtdmFsdWUnLCB1bmRlZmluZWQsIGAke21ldGFkYXRhID8gQ29sb3IuRm9ybWF0LkNTUy5mb3JtYXRIZXgobWV0YWRhdGEuZm9yZWdyb3VuZCkgOiAnLT8tJ31gKVxuXHRcdFx0XHQpLFxuXHRcdFx0XHQkKCd0cicsIHVuZGVmaW5lZCxcblx0XHRcdFx0XHQkKCd0ZC50bS1tZXRhZGF0YS1rZXknLCB1bmRlZmluZWQsICdiYWNrZ3JvdW5kJyksXG5cdFx0XHRcdFx0JCgndGQudG0tbWV0YWRhdGEtdmFsdWUnLCB1bmRlZmluZWQsIGAke21ldGFkYXRhID8gQ29sb3IuRm9ybWF0LkNTUy5mb3JtYXRIZXgobWV0YWRhdGEuYmFja2dyb3VuZCkgOiAnLT8tJ31gKVxuXHRcdFx0XHQpXG5cdFx0XHQpXG5cdFx0KSk7XG5cdFx0YXBwZW5kKHRoaXMuX2RvbU5vZGUsICQoJ2hyLnRva2Vucy1pbnNwZWN0LXNlcGFyYXRvcicpKTtcblxuXHRcdGlmICh0b2tlbjFJbmRleCA8IGRhdGEudG9rZW5zMS5sZW5ndGgpIHtcblx0XHRcdGFwcGVuZCh0aGlzLl9kb21Ob2RlLCAkKCdzcGFuLnRtLXRva2VuLXR5cGUnLCB1bmRlZmluZWQsIGRhdGEudG9rZW5zMVt0b2tlbjFJbmRleF0udHlwZSkpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2VkaXRvci5sYXlvdXRDb250ZW50V2lkZ2V0KHRoaXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGVjb2RlTWV0YWRhdGEobWV0YWRhdGE6IG51bWJlcik6IElEZWNvZGVkTWV0YWRhdGEge1xuXHRcdGNvbnN0IGNvbG9yTWFwID0gVG9rZW5pemF0aW9uUmVnaXN0cnkuZ2V0Q29sb3JNYXAoKSE7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IFRva2VuTWV0YWRhdGEuZ2V0TGFuZ3VhZ2VJZChtZXRhZGF0YSk7XG5cdFx0Y29uc3QgdG9rZW5UeXBlID0gVG9rZW5NZXRhZGF0YS5nZXRUb2tlblR5cGUobWV0YWRhdGEpO1xuXHRcdGNvbnN0IGZvbnRTdHlsZSA9IFRva2VuTWV0YWRhdGEuZ2V0Rm9udFN0eWxlKG1ldGFkYXRhKTtcblx0XHRjb25zdCBmb3JlZ3JvdW5kID0gVG9rZW5NZXRhZGF0YS5nZXRGb3JlZ3JvdW5kKG1ldGFkYXRhKTtcblx0XHRjb25zdCBiYWNrZ3JvdW5kID0gVG9rZW5NZXRhZGF0YS5nZXRCYWNrZ3JvdW5kKG1ldGFkYXRhKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bGFuZ3VhZ2VJZDogdGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLmxhbmd1YWdlSWRDb2RlYy5kZWNvZGVMYW5ndWFnZUlkKGxhbmd1YWdlSWQpLFxuXHRcdFx0dG9rZW5UeXBlOiB0b2tlblR5cGUsXG5cdFx0XHRmb250U3R5bGU6IGZvbnRTdHlsZSxcblx0XHRcdGZvcmVncm91bmQ6IGNvbG9yTWFwW2ZvcmVncm91bmRdLFxuXHRcdFx0YmFja2dyb3VuZDogY29sb3JNYXBbYmFja2dyb3VuZF1cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9rZW5UeXBlVG9TdHJpbmcodG9rZW5UeXBlOiBTdGFuZGFyZFRva2VuVHlwZSk6IHN0cmluZyB7XG5cdFx0c3dpdGNoICh0b2tlblR5cGUpIHtcblx0XHRcdGNhc2UgU3RhbmRhcmRUb2tlblR5cGUuT3RoZXI6IHJldHVybiAnT3RoZXInO1xuXHRcdFx0Y2FzZSBTdGFuZGFyZFRva2VuVHlwZS5Db21tZW50OiByZXR1cm4gJ0NvbW1lbnQnO1xuXHRcdFx0Y2FzZSBTdGFuZGFyZFRva2VuVHlwZS5TdHJpbmc6IHJldHVybiAnU3RyaW5nJztcblx0XHRcdGNhc2UgU3RhbmRhcmRUb2tlblR5cGUuUmVnRXg6IHJldHVybiAnUmVnRXgnO1xuXHRcdFx0ZGVmYXVsdDogcmV0dXJuICc/Pyc7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZm9udFN0eWxlVG9TdHJpbmcoZm9udFN0eWxlOiBGb250U3R5bGUpOiBzdHJpbmcge1xuXHRcdGxldCByID0gJyc7XG5cdFx0aWYgKGZvbnRTdHlsZSAmIEZvbnRTdHlsZS5JdGFsaWMpIHtcblx0XHRcdHIgKz0gJ2l0YWxpYyAnO1xuXHRcdH1cblx0XHRpZiAoZm9udFN0eWxlICYgRm9udFN0eWxlLkJvbGQpIHtcblx0XHRcdHIgKz0gJ2JvbGQgJztcblx0XHR9XG5cdFx0aWYgKGZvbnRTdHlsZSAmIEZvbnRTdHlsZS5VbmRlcmxpbmUpIHtcblx0XHRcdHIgKz0gJ3VuZGVybGluZSAnO1xuXHRcdH1cblx0XHRpZiAoZm9udFN0eWxlICYgRm9udFN0eWxlLlN0cmlrZXRocm91Z2gpIHtcblx0XHRcdHIgKz0gJ3N0cmlrZXRocm91Z2ggJztcblx0XHR9XG5cdFx0aWYgKHIubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyID0gJy0tLSc7XG5cdFx0fVxuXHRcdHJldHVybiByO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0VG9rZW5zQXRMaW5lKGxpbmVOdW1iZXI6IG51bWJlcik6IElDb21wbGV0ZUxpbmVUb2tlbml6YXRpb24ge1xuXHRcdGNvbnN0IHN0YXRlQmVmb3JlTGluZSA9IHRoaXMuX2dldFN0YXRlQmVmb3JlTGluZShsaW5lTnVtYmVyKTtcblxuXHRcdGNvbnN0IHRva2VuaXphdGlvblJlc3VsdDEgPSB0aGlzLl90b2tlbml6YXRpb25TdXBwb3J0LnRva2VuaXplKHRoaXMuX21vZGVsLmdldExpbmVDb250ZW50KGxpbmVOdW1iZXIpLCB0cnVlLCBzdGF0ZUJlZm9yZUxpbmUpO1xuXHRcdGNvbnN0IHRva2VuaXphdGlvblJlc3VsdDIgPSB0aGlzLl90b2tlbml6YXRpb25TdXBwb3J0LnRva2VuaXplRW5jb2RlZCh0aGlzLl9tb2RlbC5nZXRMaW5lQ29udGVudChsaW5lTnVtYmVyKSwgdHJ1ZSwgc3RhdGVCZWZvcmVMaW5lKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRzdGFydFN0YXRlOiBzdGF0ZUJlZm9yZUxpbmUsXG5cdFx0XHR0b2tlbnMxOiB0b2tlbml6YXRpb25SZXN1bHQxLnRva2Vucyxcblx0XHRcdHRva2VuczI6IHRva2VuaXphdGlvblJlc3VsdDIudG9rZW5zLFxuXHRcdFx0ZW5kU3RhdGU6IHRva2VuaXphdGlvblJlc3VsdDEuZW5kU3RhdGVcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0U3RhdGVCZWZvcmVMaW5lKGxpbmVOdW1iZXI6IG51bWJlcik6IElTdGF0ZSB7XG5cdFx0bGV0IHN0YXRlOiBJU3RhdGUgPSB0aGlzLl90b2tlbml6YXRpb25TdXBwb3J0LmdldEluaXRpYWxTdGF0ZSgpO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDE7IGkgPCBsaW5lTnVtYmVyOyBpKyspIHtcblx0XHRcdGNvbnN0IHRva2VuaXphdGlvblJlc3VsdCA9IHRoaXMuX3Rva2VuaXphdGlvblN1cHBvcnQudG9rZW5pemUodGhpcy5fbW9kZWwuZ2V0TGluZUNvbnRlbnQoaSksIHRydWUsIHN0YXRlKTtcblx0XHRcdHN0YXRlID0gdG9rZW5pemF0aW9uUmVzdWx0LmVuZFN0YXRlO1xuXHRcdH1cblxuXHRcdHJldHVybiBzdGF0ZTtcblx0fVxuXG5cdHB1YmxpYyBnZXREb21Ob2RlKCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5fZG9tTm9kZTtcblx0fVxuXG5cdHB1YmxpYyBnZXRQb3NpdGlvbigpOiBJQ29udGVudFdpZGdldFBvc2l0aW9uIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cG9zaXRpb246IHRoaXMuX2VkaXRvci5nZXRQb3NpdGlvbigpLFxuXHRcdFx0cHJlZmVyZW5jZTogW0NvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UuQkVMT1csIENvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UuQUJPVkVdXG5cdFx0fTtcblx0fVxufVxuXG5yZWdpc3RlckVkaXRvckNvbnRyaWJ1dGlvbihJbnNwZWN0VG9rZW5zQ29udHJvbGxlci5JRCwgSW5zcGVjdFRva2Vuc0NvbnRyb2xsZXIsIEVkaXRvckNvbnRyaWJ1dGlvbkluc3RhbnRpYXRpb24uTGF6eSk7XG5yZWdpc3RlckVkaXRvckFjdGlvbihJbnNwZWN0VG9rZW5zKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQVMsR0FB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
